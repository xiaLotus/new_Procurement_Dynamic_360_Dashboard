from datetime import datetime
import glob                 # 修正：原本 from glob import glob 但下方用 glob.glob() 會 AttributeError
import json                 # 新增：DB 寫入失敗時把 CHECK 紀錄備份成 JSONL
import os
import re               # 用於正則表達式提取代號
import time             # 新增：熱重載背景執行緒用
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
# 啟動時確認 alarm_checked 表存在 (已存在就什麼都不做)
#   alarmcode_alarmmessage : 全部上拋的原始警報 (既有的表，寫入目前停用)
#   alarm_checked          : 按過 CHECK 的紀錄，歷史紀錄頁讀這張
# =====================================================
def ensure_tables():
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS alarm_checked (
                    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    alert_id              CHAR(36)     NOT NULL,
                    checked_by            VARCHAR(64)  NOT NULL,
                    checked_at            DATETIME     NOT NULL,
                    check_action          VARCHAR(32)  NOT NULL DEFAULT '',
                    check_note            VARCHAR(500) NOT NULL DEFAULT '',
                    `System`              VARCHAR(100) NOT NULL DEFAULT '',
                    `Plant`               VARCHAR(50)  NOT NULL DEFAULT '',
                    `Place`               VARCHAR(50)  NOT NULL DEFAULT '',
                    `AlarmCode`           VARCHAR(100) NOT NULL DEFAULT '',
                    `Level`               VARCHAR(16)  NOT NULL DEFAULT '',
                    `AlarmMessage_1`      VARCHAR(255) NOT NULL DEFAULT '',
                    `Match_Method`        VARCHAR(32)  NOT NULL DEFAULT '',
                    `Matched_Query_Message` VARCHAR(500) NOT NULL DEFAULT '',
                    received_at           DATETIME     NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_alert_id (alert_id),
                    KEY idx_checked_at (checked_at),
                    KEY idx_place (`Place`),
                    KEY idx_alarmcode (`AlarmCode`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """))
        logger.success("✅ alarm_checked 表已就緒")
        return True
    except Exception as e:
        logger.error(f"❌ 建立 alarm_checked 失敗 (不影響警報接收，但 CHECK 紀錄無法寫入 DB): {e}")
        return False

ensure_tables()

# DB 寫入失敗時的備份檔：一行一筆 JSON，DB 恢復後可據此補寫
CHECKED_FAILED_FILE = os.path.join(log_folder, "checked_failed.jsonl")


def save_checked_record(record: dict) -> bool:
    """把一筆 CHECK 紀錄寫入 alarm_checked；失敗就備份到 checked_failed.jsonl，回傳是否寫入 DB 成功"""
    params = {
        "alert_id": str(record.get("alert_id") or ""),
        "checked_by": str(record.get("checked_by") or "unknown")[:64],
        "checked_at": record.get("checked_at"),
        "check_action": str(record.get("check_action") or "")[:32],
        "check_note": str(record.get("check_note") or "")[:500],
        "System": str(record.get("System") or "")[:100],
        "Plant": str(record.get("Plant") or "")[:50],
        "Place": str(record.get("Place") or "")[:50],
        "AlarmCode": str(record.get("AlarmCode") or "")[:100],
        "Level": str(record.get("Level") or "")[:16],
        "AlarmMessage_1": str(record.get("AlarmMessage_1") or "")[:255],
        "Match_Method": str(record.get("Match_Method") or "")[:32],
        "Matched_Query_Message": str(record.get("Matched_Query_Message") or "")[:500],
        "received_at": record.get("received_at") or None,
    }
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO alarm_checked
                    (alert_id, checked_by, checked_at, check_action, check_note,
                     `System`, `Plant`, `Place`, `AlarmCode`, `Level`, `AlarmMessage_1`,
                     `Match_Method`, `Matched_Query_Message`, received_at)
                VALUES
                    (:alert_id, :checked_by, :checked_at, :check_action, :check_note,
                     :System, :Plant, :Place, :AlarmCode, :Level, :AlarmMessage_1,
                     :Match_Method, :Matched_Query_Message, :received_at)
            """), params)
        return True
    except Exception as e:
        logger.error(f"❌ 寫入 alarm_checked 失敗，已備份到 {CHECKED_FAILED_FILE}: {e}")
        try:
            with open(CHECKED_FAILED_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(params, ensure_ascii=False, default=str) + "\n")
        except Exception as e2:
            logger.error(f"❌ 備份 CHECK 紀錄也失敗: {e2} | {params}")
        return False


# =====================================================
# 【Web 儀表板】全域記憶體儲存與執行緒鎖
# =====================================================
active_alerts = {}
alerts_lock = threading.Lock()

# 已確認 (CHECK) 的紀錄寫入 / 讀取 DB 的 alarm_checked 表；這是歷史頁一次最多讀取的筆數
CHECKED_MAX = 500

# =====================================================
# 2. 全域比對字典 (啟動時載入 + 每日更新後自動熱重載)
# =====================================================
QUERY_CSV = "query_result.csv"      # 固定檔名；每日更新直接覆蓋這個檔即可
RELOAD_CHECK_SEC = 300              # 每 5 分鐘檢查一次檔案修改時間
MIN_ROWS_RATIO = 0.8                # 新檔列數低於舊檔 80% 視為異常，保留舊字典
QUERY_SETTLE_SEC = 10               # 檔案最後修改未滿 10 秒 = 可能還在寫入，等下一輪再讀
DISPLAY_LEVELS = ['A', 'B', 'C']    # 會推送到前端的等級

# 四本字典放在同一個 dict，重載時「整包換掉」，進行中的請求不會讀到半新半舊
#   sys_code : (SYSTEM, alarmcode)  -> (alarmcode, message, lv)     ← 唯一鍵，最準
#   sys_ext  : (SYSTEM, 括號代號)    -> (alarmcode, message, lv)
#   code     : alarmcode            -> [(alarmcode, message, lv, 正規化訊息), ...]  ← 跨設備後備
#   ext      : 括號代號              -> [(alarmcode, message, lv, 正規化訊息), ...]  ← 跨設備後備
# 跨設備後備 (code / ext) 同一個代號在不同設備意義可能完全不同 (例如 AlarmCode "1")，
# 所以必須「訊息內容也相符」才採用，避免借到別台設備的等級造成誤報。
QUERY_DICTS = {"sys_code": {}, "code": {}, "sys_ext": {}, "ext": {}}

_query_mtime = 0        # 目前字典對應的檔案 mtime
_query_rows = 0         # 目前字典對應的列數
_query_loaded_at = ""   # 最後成功載入時間
_query_bad_mtime = 0    # 已判定為異常的檔案 mtime (避免每 5 分鐘重複報錯)
_reload_lock = threading.Lock()

# 括號代號提取：支援 ()、（）、[] 三種括號
PAREN_PATTERN = r'[（(\[]([^)）\]]+)[)）\]]'

# 同一個 key 有多筆時，保留等級最嚴重的那筆 (A 最優先)，寧可多報不可漏報
_LV_RANK = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}


def _norm_msg(s):
    """訊息正規化：去掉空白、標點、底線，轉大寫，只留文字與數字，用來比較兩段訊息是否相同"""
    return re.sub(r'[\W_]+', '', str(s)).upper()


def _msg_similar(a: str, b: str) -> bool:
    """兩段『已正規化』訊息是否相符：完全相同，或較短者 (至少 6 字) 被較長者包含"""
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 6 and short in long_


def _norm_lv(v):
    """LV_A / Lv_A / lv_a → 'A'；不是 LV_x 格式回傳 None"""
    m = re.match(r'^LV_([A-Z])$', str(v).strip().upper())
    return m.group(1) if m else None


def load_query_data_to_memory(force: bool = False) -> bool:
    """
    載入 query_result.csv 到記憶體。
    - 檔案 mtime 沒變就直接略過 (force=True 例外)
    - 讀檔失敗 / 列數暴跌：保留舊字典，不影響線上比對
    回傳 True 表示這次有成功換上新字典。
    """
    global QUERY_DICTS, _query_mtime, _query_rows, _query_loaded_at, _query_bad_mtime

    with _reload_lock:
        try:
            if not os.path.exists(QUERY_CSV):
                logger.warning(f"⚠️ 找不到 {QUERY_CSV}，沿用目前字典。")
                return False

            mtime = os.path.getmtime(QUERY_CSV)
            if not force and mtime in (_query_mtime, _query_bad_mtime):
                return False

            if not force and time.time() - mtime < QUERY_SETTLE_SEC:
                logger.info(f"⏸️ {QUERY_CSV} 剛被修改 (可能還在寫入)，下一輪再載入")
                return False

            logger.info(f"⏳ 正在載入 {QUERY_CSV} 到記憶體...")
            df = pd.read_csv(QUERY_CSV, dtype=str, encoding="utf-8-sig").fillna("")

            missing = {"system", "alarmcode", "LV", "message"} - set(df.columns)
            if missing:
                _query_bad_mtime = mtime
                logger.error(f"❌ {QUERY_CSV} 缺少欄位 {missing}，保留舊字典")
                return False

            if len(df) < _query_rows * MIN_ROWS_RATIO:
                _query_bad_mtime = mtime
                logger.error(f"❌ {QUERY_CSV} 列數異常 ({len(df)} < 舊 {_query_rows} 的 {MIN_ROWS_RATIO:.0%})，保留舊字典")
                return False

            # ---- 清理 ----
            # message 前後可能多包一層雙引號 (舊格式有、新格式沒有，兩種都相容)
            df['message'] = df['message'].str.strip().str.strip('"').str.strip()
            df['alarmcode'] = df['alarmcode'].str.strip()
            df['sys'] = df['system'].str.strip().str.upper()
            df['lv'] = df['LV'].map(_norm_lv)

            # 欄位錯位的列 (LV 欄不是 LV_x、message 欄才是 LV_x)：等級從 message 救回來
            shifted = df['lv'].isna() & df['message'].map(_norm_lv).notna()
            if shifted.any():
                df.loc[shifted, 'lv'] = df.loc[shifted, 'message'].map(_norm_lv)
                df.loc[shifted, 'message'] = ""
                logger.warning(f"⚠️ {QUERY_CSV} 有 {int(shifted.sum())} 列欄位錯位，已從 message 欄救回等級")

            # 括號代號 (向量化提取)
            raw_ext = df['message'].str.extract(PAREN_PATTERN)[0]
            code_ext = raw_ext.str.extract(r'([A-Za-z0-9\.]+)')[0]
            df['ext'] = code_ext.fillna(raw_ext).str.upper()

            # 排序：嚴重度低的在前、高的在後 → dict 後蓋前，重複 key 會留下最嚴重的
            # 結果與 CSV 列順序無關，每天更新後比對結果才穩定
            df['_rank'] = df['lv'].map(_LV_RANK).fillna(9)
            df = df.sort_values('_rank', ascending=False, kind="stable")

            df = df[df['alarmcode'] != ""]          # 沒有 alarmcode 的列無法當 key，略過
            df['nmsg'] = df['message'].map(_norm_msg)

            val = list(zip(df['alarmcode'], df['message'], df['lv']))
            df_ext = df[df['ext'].notna()]
            val_ext = list(zip(df_ext['alarmcode'], df_ext['message'], df_ext['lv']))

            # 跨設備後備：同代號的所有候選都留著 (嚴重度低 → 高)，比對時再用訊息挑
            by_code, by_ext = {}, {}
            for code, v, nm in zip(df['alarmcode'], val, df['nmsg']):
                if nm:
                    by_code.setdefault(code, []).append(v + (nm,))
            for ext, v, nm in zip(df_ext['ext'], val_ext, df_ext['nmsg']):
                if nm:
                    by_ext.setdefault(ext, []).append(v + (nm,))

            new_dicts = {
                "sys_code": dict(zip(zip(df['sys'], df['alarmcode']), val)),
                "sys_ext":  dict(zip(zip(df_ext['sys'], df_ext['ext']), val_ext)),
                "code":     by_code,
                "ext":      by_ext,
            }

            old_rows = _query_rows
            QUERY_DICTS = new_dicts          # 一次換掉參考 (atomic)
            _query_mtime, _query_rows = mtime, len(df)
            _query_loaded_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            logger.success(
                f"✅ 比對字典載入完成！列數 {old_rows} → {len(df)} "
                f"(system+code: {len(new_dicts['sys_code'])}, system+括號: {len(new_dicts['sys_ext'])}, "
                f"跨設備 code: {len(new_dicts['code'])}, 跨設備括號: {len(new_dicts['ext'])})"
            )
            return True

        except Exception as e:
            # 常見原因：更新程式還在寫檔。mtime 沒記錄，下一輪會自動重試
            logger.error(f"❌ 載入比對字典失敗，沿用舊字典: {e}")
            return False


def _reload_loop():
    while True:
        time.sleep(RELOAD_CHECK_SEC)
        load_query_data_to_memory()


# 伺服器啟動前執行載入，之後由背景執行緒定時檢查檔案是否更新
load_query_data_to_memory(force=True)     # 啟動時一律載入 (不受「剛修改」等待限制)
threading.Thread(target=_reload_loop, daemon=True, name="query-reloader").start()


# =====================================================
# 3. 【核心獨立 Function】單獨處理比對邏輯
# =====================================================
def match_alarm_record(data: dict, dicts: dict) -> dict:
    """
    單獨的比對函數，接收單筆資料與比對字典 (QUERY_DICTS)，回傳完整的比對結果。
    比對順序 (越前面越準)：
      1. System + AlarmCode                      (同設備，直接採用)
      2. AlarmCode      + 訊息內容相符            (跨設備後備)
      3. System + 括號代號                        (同設備，直接採用)
      4. 括號代號        + 訊息內容相符            (跨設備後備)
    AlarmCode 為空白時不做 1、2。
    """
    match_result = {
        "Match_Method": "Not Found",
        "Matched_Query_AlarmCode": None,
        "Matched_Query_Message": None,
        "Matched_Query_LV": None,
        "Extracted_Code_Used": None
    }

    def fill(method, hit, ext_code=None):
        match_result["Match_Method"] = method
        match_result["Matched_Query_AlarmCode"], match_result["Matched_Query_Message"], match_result["Matched_Query_LV"] = hit
        match_result["Extracted_Code_Used"] = ext_code
        return match_result

    def pick(candidates, alarm_nmsg):
        """跨設備候選中挑『訊息相符』且最嚴重的一筆 (清單已依嚴重度低→高排序，所以倒著找)"""
        for c in reversed(candidates or []):
            if _msg_similar(alarm_nmsg, c[3]):
                return c[:3]
        return None

    system = str(data.get("System", "")).strip().upper()
    alarm_code = str(data.get("AlarmCode", "")).strip()

    # 訊息是每 255 字切開的，要直接接回去 (不能加空白)
    combined_msg = "".join(str(data.get(f"AlarmMessage_{i}", "") or "") for i in range(1, 5))
    alarm_nmsg = _norm_msg(combined_msg)

    # --- 第一階段：使用 AlarmCode 進行匹配 ---
    if alarm_code:
        hit = dicts["sys_code"].get((system, alarm_code))
        if hit:
            return fill("System+AlarmCode", hit)

        hit = pick(dicts["code"].get(alarm_code), alarm_nmsg)
        if hit:
            return fill("AlarmCode", hit)

    # --- 第二階段：針對沒匹配到的，使用括號代號進行匹配 ---
    match = re.search(PAREN_PATTERN, combined_msg)
    if match:
        content = match.group(1).strip()
        code_match = re.search(r'[A-Za-z0-9\.]+', content)
        ext_code = code_match.group(0).upper() if code_match else content.upper()

        hit = dicts["sys_ext"].get((system, ext_code))
        if hit:
            return fill("System+Extracted_Code", hit, ext_code)

        hit = pick(dicts["ext"].get(ext_code), alarm_nmsg)
        if hit:
            return fill("Extracted_Code", hit, ext_code)

    return match_result


# =====================================================
# 4. 監控 API (保留您原本的設定)
# =====================================================
@app.route("/")
def home():
    return "AlarmCode API Running", 200

def query_dict_status():
    return {
        "file": QUERY_CSV,
        "rows": _query_rows,
        "loaded_at": _query_loaded_at,
        "file_mtime": datetime.fromtimestamp(_query_mtime).strftime("%Y-%m-%d %H:%M:%S") if _query_mtime else None,
    }

@app.route("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "running", "db": "connected", "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "query_dict": query_dict_status()}, 200
    except Exception as e:
        return {"status": "running", "db": "error", "error": str(e), "query_dict": query_dict_status()}, 500

@app.route("/reload_query", methods=["GET", "POST"])
def reload_query():
    """手動立即重載 query_result.csv (不想等 5 分鐘時用)"""
    ok = load_query_data_to_memory(force=True)
    return jsonify({"status": "reloaded" if ok else "kept_old", "query_dict": query_dict_status()}), 200

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
    會把該筆警報從 active_alerts 移除、記 log，並寫入 DB 的 alarm_checked 表。
    DB 寫入失敗不影響 CHECK (畫面照樣移除)，紀錄會備份到 checked_failed.jsonl。
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

    db_saved = save_checked_record(record)

    return jsonify({"status": "removed", "db_saved": db_saved, "record": record}), 200

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
    提供歷史紀錄頁顯示 (最新在前)，從 DB 的 alarm_checked 表讀取。
    """
    limit = max(1, min(request.args.get("limit", 50, type=int), CHECKED_MAX))

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT alert_id, checked_by, checked_at, check_action, check_note,
                       `System`, `Plant`, `Place`, `AlarmCode`, `Level`,
                       `AlarmMessage_1`, `Match_Method`, `Matched_Query_Message`, received_at
                FROM alarm_checked
                ORDER BY checked_at DESC, id DESC
                LIMIT :limit
            """), {"limit": limit}).mappings().all()
        records = [dict(r) for r in rows]
        for r in records:
            for k in ("checked_at", "received_at"):
                if r.get(k) is not None and not isinstance(r[k], str):
                    r[k] = r[k].strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        # 回 500 讓歷史頁保留上一次的內容，而不是誤顯示「尚無紀錄」
        logger.error(f"❌ 讀取 alarm_checked 失敗: {e}")
        return jsonify({"status": "error", "message": "讀取歷史紀錄失敗"}), 500

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
        # 先取一次 QUERY_DICTS 參考，就算此時剛好熱重載，這筆請求也會用同一版字典比完
        match_result = match_alarm_record(data, QUERY_DICTS)
        logger.info(f"🔍 [步驟 B] 比對結果: Method={match_result['Match_Method']}, "
                    f"LV={match_result['Matched_Query_LV']}, Code={data.get('AlarmCode')}")

        # 【步驟 C】決定等級：以 query_result.csv 比對到的 LV 為主；
        #           比對不到才用 JSON 自帶的 Level (真實資料沒有此欄位，test.py 才有)
        payload_level = str(data.get("Level", "") or "").strip().upper()
        level = match_result["Matched_Query_LV"] or payload_level or "UNKNOWN"
        data["Level"] = level
        data["Level_Source"] = "query_result" if match_result["Matched_Query_LV"] else ("payload" if payload_level else "none")

        if level in DISPLAY_LEVELS:
            # 修正：原本用 requests.post 打自己的 /api/webhook_receive，
            # 同一個 process 繞一圈網路沒必要，改為直接寫入記憶體
            payload = {**data, **match_result}
            alert_id = store_alert(payload)
            logger.success(f"✅ [步驟 C] 等級 {level} 符合顯示條件，已推送前端 (alert_id={alert_id})")

            return jsonify({
                'status': 'success',
                'message': '資料已處理，符合等級條件，並已推送前端顯示',
                'alert_id': alert_id,
                'level': level,
                'match_result': match_result
            }), 200
        else:
            logger.info(f"ℹ️ [步驟 C] 等級為 '{level}'，不符合顯示條件，跳過推送。")
            return jsonify({
                'status': 'success_stored_only',
                'message': f'資料已處理，但等級 ({level}) 不符合顯示條件，未推送前端',
                'level': level,
                'match_result': match_result
            }), 200

    except Exception as e:
        logger.error(f"❌ 處理流程失敗：{e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    logger.info("🚀 Waitress 伺服器啟動於 Port 8900...")
    serve(app, host='0.0.0.0', port=8900, threads=200)