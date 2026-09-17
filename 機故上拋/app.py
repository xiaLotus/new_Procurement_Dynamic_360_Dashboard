from datetime import datetime
import glob                 # 修正：原本 from glob import glob 但下方用 glob.glob() 會 AttributeError
import os
import re               # 用於正則表達式提取代號
import requests         # 保留：若日後要 POST 到其他外部系統仍可使用
import uuid             # 用於生成唯一的警報 ID
import threading        # 用於多執行緒安全的記憶體操作

from loguru import logger
import pymysql
from sqlalchemy import create_engine, text
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from waitress import serve

# =====================================================
# 1. Log 與 Flask 基礎設定 (保留您原本的設定)
# =====================================================
log_folder = rf"機固上拋\Logs"
os.makedirs(log_folder, exist_ok=True)
log_file_path = os.path.join(log_folder, "api_{time:YYYY-MM-DD}.log")

logger.add(
    log_file_path, rotation="1 day", retention="30 days", encoding="utf-8",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {message}", enqueue=True
)
logger.info("🚀 AlarmCode and AlarmMessage 伺服器啟動中...")

app = Flask(__name__)
CORS(app)

db_config = {
    'host': '10.11.104.247', 'port': 3306, 'user': 'A3CIM', 'password': 'A3CIM',
    'database': 'error_rate_db', 'charset': 'utf8mb4'
}

engine = create_engine(
    f"mysql+pymysql://{db_config['user']}:{db_config['password']}@"
    f"{db_config['host']}:{db_config['port']}/{db_config['database']}?charset={db_config['charset']}",
    pool_recycle=1800, pool_pre_ping=True, pool_timeout=30, pool_size=100, max_overflow=200,
)

# =====================================================
# 【Web 儀表板】全域記憶體儲存與執行緒鎖
# =====================================================
active_alerts = {}
alerts_lock = threading.Lock()

# 已確認 (CHECK) 的紀錄之後改由 DB 讀取，目前不在記憶體暫存
CHECKED_MAX = 500

# =====================================================
# 2. 全域比對字典 (啟動時載入)
# =====================================================
DICT_BY_CODE = {}
DICT_BY_EXTRACTED = {}

# 括號代號提取：支援 ()、（）、[] 三種括號
PAREN_PATTERN = r'[（(\[]([^)）\]]+)[)）\]]'

def load_query_data_to_memory():
    """啟動時將 20 萬筆 query_result.csv 載入記憶體，避免每次請求都讀取檔案"""
    global DICT_BY_CODE, DICT_BY_EXTRACTED
    csv_path = "query_result.csv" # 請確認檔案路徑正確

    try:
        if os.path.exists(csv_path):
            logger.info("⏳ 正在載入 query_result.csv 到記憶體...")
            df_query = pd.read_csv(csv_path)

            # 修正：CSV 的 message 前後多包了一層雙引號 ("01096 ...")，這裡去掉
            df_query['message'] = df_query['message'].astype(str).str.strip().str.strip('"')

            # 2.1 建立 AlarmCode 字典
            df_query['alarmcode_clean'] = df_query['alarmcode'].astype(str).str.strip()
            DICT_BY_CODE = dict(zip(df_query['alarmcode_clean'], zip(df_query['alarmcode'], df_query['message'])))

            # 2.2 建立 Extracted_Code 字典 (向量化提取，速度極快)
            raw_ext = df_query['message'].str.extract(PAREN_PATTERN)[0]
            code_ext = raw_ext.str.extract(r'([A-Za-z0-9\.]+)')[0]
            final_ext = code_ext.fillna(raw_ext).str.upper()
            df_query['Extracted_Code'] = final_ext

            df_valid = df_query[df_query['Extracted_Code'].notna()]
            DICT_BY_EXTRACTED = dict(zip(df_valid['Extracted_Code'], zip(df_valid['alarmcode'], df_valid['message'])))

            logger.success(f"✅ 比對字典載入完成！(AlarmCode: {len(DICT_BY_CODE)} 筆, 括號代號: {len(DICT_BY_EXTRACTED)} 筆)")
        else:
            logger.warning(f"⚠️ 找不到 {csv_path}，將跳過預載入比對字典。")
    except Exception as e:
        logger.error(f"❌ 載入比對字典失敗: {e}")

# 伺服器啟動前執行載入
load_query_data_to_memory()


# =====================================================
# 3. 【核心獨立 Function】單獨處理比對邏輯
# =====================================================
def match_alarm_record(data: dict, dict_by_code: dict, dict_by_extracted: dict) -> dict:
    """
    單獨的比對函數，接收單筆資料與比對字典，回傳完整的比對結果。
    絕對不遺漏任何欄位，完美對應您提供的 CSV 範例結構。
    """
    match_result = {
        "Match_Method": "Not Found",
        "Matched_Query_AlarmCode": None,
        "Matched_Query_Message": None,
        "Extracted_Code_Used": None
    }

    alarm_code = str(data.get("AlarmCode", "")).strip()

    combined_msg = " ".join([
        str(data.get("AlarmMessage_1", "")),
        str(data.get("AlarmMessage_2", "")),
        str(data.get("AlarmMessage_3", "")),
        str(data.get("AlarmMessage_4", ""))
    ])

    # --- 第一階段：使用 AlarmCode 進行匹配 ---
    if alarm_code in dict_by_code:
        match_result["Match_Method"] = "AlarmCode"
        match_result["Matched_Query_AlarmCode"], match_result["Matched_Query_Message"] = dict_by_code[alarm_code]

    # --- 第二階段：針對沒匹配到的，使用 Extracted_Code 進行匹配 ---
    else:
        match = re.search(PAREN_PATTERN, combined_msg)
        if match:
            content = match.group(1).strip()
            code_match = re.search(r'[A-Za-z0-9\.]+', content)
            ext_code = code_match.group(0).upper() if code_match else content.upper()

            if ext_code in dict_by_extracted:
                match_result["Match_Method"] = "Extracted_Code"
                match_result["Matched_Query_AlarmCode"], match_result["Matched_Query_Message"] = dict_by_extracted[ext_code]
                match_result["Extracted_Code_Used"] = ext_code

    return match_result


# =====================================================
# 4. 監控 API (保留您原本的設定)
# =====================================================
@app.route("/")
def home():
    return "AlarmCode API Running", 200

@app.route("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "running", "db": "connected", "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}, 200
    except Exception as e:
        return {"status": "running", "db": "error", "error": str(e)}, 500

def get_latest_log():
    log_files = glob.glob(os.path.join(log_folder, "api_*.log"))
    if not log_files: return None
    return max(log_files, key=os.path.getctime)

@app.route("/logs")
def view_logs():
    latest_log = get_latest_log()
    if not latest_log: return "No log file found", 404
    try:
        with open(latest_log, "r", encoding="utf-8") as f:
            lines = f.readlines()[-100:]
        return "<br>".join(lines), 200
    except Exception as e:
        return f"Error reading log: {e}", 500


# =====================================================
# 【Web 儀表板】登入 API (新增)
# =====================================================
@app.route('/api/login', methods=['POST'])
def api_login():
    """接收前端送來的 username 與 password，無條件通過，不做任何驗證"""
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    logger.info(f"🔑 [Web UI] 登入：{username}")
    return jsonify({"status": "success", "user": username}), 200


# =====================================================
# 【Web 儀表板】後端 API 路由
# =====================================================
def store_alert(data: dict) -> str:
    """把警報放進記憶體，回傳 alert_id (upload_message 與 webhook_receive 共用)"""
    alert_id = str(uuid.uuid4())
    data['alert_id'] = alert_id
    data['received_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")   # 新增：接收時間
    with alerts_lock:
        active_alerts[alert_id] = data
    logger.info(f"📥 [Web UI] 接收到新警報: {alert_id}, Level: {data.get('Level')}, Code: {data.get('AlarmCode')}")
    return alert_id

@app.route('/api/webhook_receive', methods=['POST'])
def webhook_receive():
    """保留給外部系統直接 POST 用；upload_message 已改為直接寫入記憶體，不再繞這裡"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400
    store_alert(data)
    return jsonify({"status": "received"}), 200

@app.route('/get_alerts')
def get_alerts():
    """提供給前端網頁撈取目前所有未確認的警報"""
    with alerts_lock:
        return jsonify(list(active_alerts.values())), 200

@app.route('/remove_alert/<alert_id>', methods=['POST'])
def remove_alert(alert_id):
    """
    前端在 CHECK 視窗選完選項 / 輸入文字後呼叫。
    body: { "username": "...", "action": "已處理", "note": "自由文字" }
    會把該筆警報從 active_alerts 移除，並記 log；之後在此寫入 DB。
    """
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip() or "unknown"
    action = str(body.get("action", "")).strip()
    note = str(body.get("note", "")).strip()

    with alerts_lock:
        alert = active_alerts.pop(alert_id, None)

    if alert is None:
        return jsonify({"status": "not_found", "message": "該警報已不存在"}), 404

    record = {
        **alert,
        "checked_by": username,
        "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "check_action": action,
        "check_note": note,
    }

    logger.info(f"🗑️ [Web UI] {username} 確認警報 {alert_id} | Code={alert.get('AlarmCode')} "
                f"Place={alert.get('Place')} | 選項={action} | 備註={note}")

    # # 日後要落 DB 的話在這裡寫入 (目前停用)
    # with engine.begin() as conn:
    #     conn.execute(text("""
    #         INSERT INTO alarm_checked (alert_id, checked_by, checked_at, check_action, check_note,
    #                                    `System`, `Place`, `AlarmCode`, `Level`, `AlarmMessage_1`)
    #         VALUES (:alert_id, :checked_by, :checked_at, :check_action, :check_note,
    #                 :System, :Place, :AlarmCode, :Level, :AlarmMessage_1)
    #     """), record)

    return jsonify({"status": "removed", "record": record}), 200

@app.route('/clear_alerts', methods=['POST'])
def clear_alerts():
    """一鍵清空目前所有未確認警報 (上線前測試用)，不寫入任何紀錄"""
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip() or request.headers.get("X-Dashboard-User", "") or "unknown"
    with alerts_lock:
        count = len(active_alerts)
        active_alerts.clear()
    logger.warning(f"🧹 [Web UI] {username} 清空全部未確認警報，共 {count} 筆")
    return jsonify({"status": "cleared", "count": count}), 200

@app.route('/get_checked_alerts')
def get_checked_alerts():
    """
    提供歷史紀錄頁顯示 (最新在前)。
    之後改從 DB 讀取；目前先回傳空清單。
    """
    limit = max(1, min(request.args.get("limit", 50, type=int), CHECKED_MAX))
    records = []

    # # 之後從 DB 讀取 (目前停用)
    # try:
    #     with engine.connect() as conn:
    #         rows = conn.execute(text("""
    #             SELECT alert_id, checked_by, checked_at, check_action, check_note,
    #                    `System`, `Plant`, `Place`, `AlarmCode`, `Level`,
    #                    `AlarmMessage_1`, `Match_Method`, `Matched_Query_Message`, received_at
    #             FROM alarm_checked
    #             ORDER BY checked_at DESC
    #             LIMIT :limit
    #         """), {"limit": limit}).mappings().all()
    #     records = [dict(r) for r in rows]
    #     for r in records:
    #         for k in ("checked_at", "received_at"):
    #             if r.get(k) is not None and not isinstance(r[k], str):
    #                 r[k] = r[k].strftime("%Y-%m-%d %H:%M:%S")
    # except Exception as e:
    #     logger.error(f"❌ 讀取 alarm_checked 失敗: {e}")

    return jsonify(records), 200


# =====================================================
# 5. 核心業務 API (寫入 DB + 呼叫獨立比對 Function + 推送前端)
# =====================================================
@app.route('/upload_message', methods=['POST'])
def upload_message():
    data = request.get_json(silent=True)
    required_fields = ["System", "Mechanism", "ClassName", "Plant", "Site", "Place", "AlarmCode", "AlarmMessage", "Flag"]

    if not data or not all(field in data for field in required_fields):
        logger.warning("⚠️ 缺少必要欄位")
        return jsonify({'status': 'error', 'message': 'Missing one or more required fields'}), 400

    # 切割 AlarmMessage 成最多 4 段
    def split_message(msg, chunk_size=255, max_chunks=4):
        msg = str(msg)
        chunks = [msg[i:i+chunk_size] for i in range(0, len(msg), chunk_size)]
        while len(chunks) < max_chunks:
            chunks.append("")
        return chunks[:max_chunks]

    try:
        msg_chunks = split_message(data["AlarmMessage"])

        # 修正：把切割後的片段放回 data，比對與前端才拿得到 AlarmMessage_1~4
        data["AlarmMessage_1"], data["AlarmMessage_2"], data["AlarmMessage_3"], data["AlarmMessage_4"] = msg_chunks

        # (保留您原本的 DataFrame 建立邏輯，維持原程式碼結構)
        df = pd.DataFrame([{
            "System": data["System"], "Mechanism": data["Mechanism"], "ClassName": data["ClassName"],
            "Plant": data["Plant"], "Site": data["Site"], "Place": data["Place"], "AlarmCode": data["AlarmCode"],
            "AlarmMessage_1": msg_chunks[0], "AlarmMessage_2": msg_chunks[1],
            "AlarmMessage_3": msg_chunks[2], "AlarmMessage_4": msg_chunks[3], "Flag": data["Flag"]
        }])

        # # 【步驟 A】先寫入資料庫 (目前停用，要寫入 DB 時再打開)
        # with engine.begin() as conn:
        #     conn.execute(
        #         text("""
        #         INSERT INTO alarmcode_alarmmessage
        #         (`System`, `Mechanism`, `ClassName`, `Plant`, `Site`, `Place`, `AlarmCode`,
        #         `AlarmMessage_1`, `AlarmMessage_2`, `AlarmMessage_3`, `AlarmMessage_4`, `Flag`)
        #         VALUES (:System, :Mechanism, :ClassName, :Plant, :Site, :Place, :AlarmCode,
        #                 :AlarmMessage_1, :AlarmMessage_2, :AlarmMessage_3, :AlarmMessage_4, :Flag)
        #         """),
        #         {
        #             "System": data["System"], "Mechanism": data["Mechanism"], "ClassName": data["ClassName"],
        #             "Plant": data["Plant"], "Site": data["Site"], "Place": data["Place"], "AlarmCode": data["AlarmCode"],
        #             "AlarmMessage_1": msg_chunks[0], "AlarmMessage_2": msg_chunks[1],
        #             "AlarmMessage_3": msg_chunks[2], "AlarmMessage_4": msg_chunks[3], "Flag": data["Flag"]
        #         }
        #     )
        logger.info(f"ℹ️ [步驟 A] 收到資料：AlarmCode={data.get('AlarmCode')} (DB 寫入目前停用)")

        # 【步驟 B】呼叫「獨立比對 Function」進行比對
        match_result = match_alarm_record(data, DICT_BY_CODE, DICT_BY_EXTRACTED)
        logger.info(f"🔍 [步驟 B] 比對結果: Method={match_result['Match_Method']}, Code={data.get('AlarmCode')}")

        # 【步驟 C】確認資料是 ABC 等級才推送到前端顯示
        level = str(data.get("Level", "Unknown")).strip().upper() # 請確認實際 JSON 中的等級欄位名稱
        data["Level"] = level

        if level in ['A', 'B', 'C']:
            # 修正：原本用 requests.post 打自己的 /api/webhook_receive，
            # 同一個 process 繞一圈網路沒必要，改為直接寫入記憶體
            payload = {**data, **match_result}
            alert_id = store_alert(payload)
            logger.success(f"✅ [步驟 C] 等級 {level} 符合顯示條件，已推送前端 (alert_id={alert_id})")

            return jsonify({
                'status': 'success',
                'message': '資料已處理，符合等級條件，並已推送前端顯示',
                'alert_id': alert_id,
                'match_result': match_result
            }), 200
        else:
            logger.info(f"ℹ️ [步驟 C] 等級為 '{level}'，不符合顯示條件，跳過推送。")
            return jsonify({
                'status': 'success_stored_only',
                'message': f'資料已處理，但等級 ({level}) 不符合顯示條件，未推送前端',
                'match_result': match_result
            }), 200

    except Exception as e:
        logger.error(f"❌ 處理流程失敗：{e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    logger.info("🚀 Waitress 伺服器啟動於 Port 8900...")
    serve(app, host='0.0.0.0', port=8900, threads=200)