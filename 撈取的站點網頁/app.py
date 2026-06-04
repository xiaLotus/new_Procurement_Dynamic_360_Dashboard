from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json
import os
import threading
from loguru import logger
import requests
import sys
import json
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text


app = Flask(__name__)
CORS(app)
# 設定靜態檔案目錄為「當前檔案所在資料夾」
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ALL_JSON_PATH = rf"\\KHA3CIMSEN1\Data\所以要抓的INOUT站點\All_Step.json"
# TZ_JSON_PATH  = rf"\\KHA3CIMSEN1\Data\所以要抓的INOUT站點\tz_step.json"

ALL_JSON_PATH = rf"All_Step.json"
TZ_JSON_PATH  = rf"tz_step.json"

lock = threading.Lock()  # 防止同時寫檔


# ---------- 共用工具 ----------
def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ================= ALL STEP =================
@app.route("/api/all_step", methods=["GET", "POST"])
def all_step():
    if request.method == "GET":
        return jsonify(load_json(ALL_JSON_PATH))

    data = request.json
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data format"}), 400

    with lock:
        save_json(ALL_JSON_PATH, data)

    return jsonify({"status": "ok"})


# ================= TZ STEP =================
@app.route("/api/tz_step", methods=["GET", "POST"])
def tz_step():
    if request.method == "GET":
        return jsonify(load_json(TZ_JSON_PATH))

    data = request.json
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data format"}), 400

    with lock:
        save_json(TZ_JSON_PATH, data)

    return jsonify({"status": "ok"})




db_config = {
    "host": "10.11.104.247",
    "port": 3306,
    "user": "A3CIM",
    "password": "A3CIM",
    "database": "a3cim_department",
    "charset": "utf8mb4"
}

engine = create_engine(
    f"mysql+pymysql://{db_config['user']}:{db_config['password']}@"
    f"{db_config['host']}:{db_config['port']}/{db_config['database']}?"
    f"charset={db_config['charset']}",
    pool_pre_ping=True
)



def load_data_from_csv():
    """
    從 timeout_status.csv 讀取資料，並轉換為 list of dict
    如果檔案不存在，回傳空列表
    """
    csv_path = os.path.join(BASE_DIR, 'timeout_status.csv')
    
    if not os.path.exists(csv_path):
        print(f"⚠️ 警告：找不到 {csv_path}，使用空資料")
        return []
    
    try:
        # 讀取 CSV，自動處理 utf-8-sig 編碼（避免 BOM 問題）
        df = pd.read_csv(csv_path, encoding='utf-8-sig')
        
        # 轉換為 list of dict，並處理 NaN 值
        data = df.where(pd.notna(df), None).to_dict(orient='records')
        
        print(f"✅ 成功載入 {len(data)} 筆資料 from timeout_status.csv")
        return data
        
    except Exception as e:
        print(f"❌ 讀取 CSV 失敗: {e}")
        return []


def load_data_from_db():
    try:
        df = pd.read_sql(
            "SELECT * FROM error_rate_db.timeout_status",
            engine
        )

        # 移除：搬運輸出內文 = N/A 且 烘烤超時內文 有值
        df = df[~(
            (df["搬運輸出內文"].fillna("N/A") == "N/A") &
            (df["烘烤超時內文"].notna()) &
            (df["烘烤超時內文"].astype(str).str.strip() != "")
        )]

        data = df.where(pd.notna(df), None).to_dict(orient="records")

        print(f"✅ 成功從 DB 載入 {len(data)} 筆資料")
        return data

    except Exception as e:
        print(f"❌ DB 讀取失敗: {e}")
        return []


def format_created_at(time_val):
    if isinstance(time_val, str):
        dt = datetime.strptime(time_val, "%Y-%m-%d %H:%M:%S")
    else:
        dt = pd.to_datetime(time_val)

    dt = dt + timedelta(hours=1)
    dt = dt.replace(minute=0, second=0)
    return dt.strftime("%Y-%m-%d %H:%M:%S")

@app.route('/api/alerts')
def get_alerts():
    # 🔥 1. 從 CSV 讀取原始資料
    # raw_data = load_data_from_db()
    raw_data = load_data_from_csv()
    
    if not raw_data:
        return jsonify([])
    
    # 🔥 2. 轉換 created_at 格式
    processed_data = []
    for item in raw_data:
        item_copy = {**item}
        if 'created_at' in item_copy:
            item_copy['created_at'] = format_created_at(item_copy['created_at'])
        processed_data.append(item_copy)
    
    # 🔥 3. 計算近 7 天日期範圍（含今天）
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    date_range = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    
    # 🔥 4. 統計每日上拋次數（每筆 = 1 次），無資料補 0
    daily_counts = {date: 0 for date in date_range}
    for item in processed_data:
        if item.get('created_at'):
            date = str(item['created_at']).split(" ")[0]
            if date in daily_counts:
                daily_counts[date] += 1
    
    # 🔥 5. 將統計結果附加到每筆資料
    result = []
    for item in processed_data:
        item_copy = {**item}
        item_copy["daily_stats"] = {
            "labels": date_range,
            "data": [daily_counts[d] for d in date_range]
        }
        result.append(item_copy)
    
    return jsonify(result)



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
