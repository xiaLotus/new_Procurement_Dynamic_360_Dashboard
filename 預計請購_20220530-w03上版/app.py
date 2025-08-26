import datetime
import json
import os
import re
from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
from ldap3 import Server, Connection, ALL, NTLM # type: ignore
from ldap3.core.exceptions import LDAPException, LDAPBindError # type: ignore
import uuid
from filelock import FileLock
from werkzeug.utils import secure_filename
import logging
import shutil
import numpy as np
import traceback

BACKEND_DATA = r"D:\Data\Backend_Access_Management\Backend_data.json"
VENDER_FILE_PATH = f'static/data/vender.ini'

app = Flask(__name__)
CORS(app)
CSV_FILE = "static/data/Planned_Purchase_Request_List.csv"
JSON_FILE = f"static/data/money.json"
BUYER_FILE = f"static/data/Buyer_detail_updated.csv"

# 備份
def backup_files():
    """備份主要 CSV 檔案"""
    try:
        backup_dir = "static/backup"
        os.makedirs(backup_dir, exist_ok=True)

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S") # type: ignore

        files_to_backup = {
            "Planned_Purchase_Request_List": CSV_FILE,
            "Buyer_detail_updated": BUYER_FILE
        }

        backed_up = []
        for name, path in files_to_backup.items():
            if os.path.exists(path):
                filename = f"{name}_backup_{timestamp}.csv"
                dest_path = os.path.join(backup_dir, filename)
                shutil.copyfile(path, dest_path)
                backed_up.append(dest_path)

        return {"status": "success", "files": backed_up}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    

def read_json_file():
    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}  # 如果文件不存在，返回空字典


def clean_value(val):
    try:
        if isinstance(val, str) and val.endswith(".0"):
            return str(int(float(val)))
        return str(val) if val is not None else ""
    except Exception:
        return str(val)


def authenticate_user(username, password):
    try:
        # server = Server('ldap://KHADDC02.kh.asegroup.com', get_info = ALL)
        # 使用 NTLM
        user = f'kh\\{username}'
        password = f'{password}'

        # print("帳號: ", username, " 密碼: ", password)
        # 建立連接
        # conn = Connection(server, user = user, password = password, authentication = NTLM)

        # 嘗試綁定
        # if conn.bind():
            # app.logger.info(f"User {username} login successful.")
        return True
        # else:
        #     # app.logger.warning(f"Login failed for user {username}: {conn.last_error}")
        #     return False
    except Exception as e:
        # app.logger.error(f"Error during authentication for user {username}: {e}")
        return False


@app.route("/api/getAllLoginer", methods=["POST"])
def getAllLoginer():
    try:
        data = request.get_json()
        user_id = data.get("username")
        print(user_id)

        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            items = json.load(f)

        for item in items:
            if str(item.get("工號", "")).strip() == user_id:
                return jsonify({"name": "Username Find"})
            
        return jsonify({"error": "Item not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    if not data:
        return jsonify({'message': '未提供登入資訊'}), 400
    
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if authenticate_user(username, password):
        return jsonify({'message': '登入成功'})
    return jsonify({'message': '帳號或密碼錯誤'}), 401


# 設定儲存篩選狀態的資料夾
FILTERS_DIR = 'user_filters'
if not os.path.exists(FILTERS_DIR):
    os.makedirs(FILTERS_DIR)

@app.route('/api/save-filters-json', methods=['POST'])
def save_filters_json():
    try:
        data = request.json
        username = data.get('username') # type: ignore
        
        if not username:
            return jsonify({'status': 'error', 'message': '缺少使用者名稱'}), 400
        
        # 儲存到 JSON 檔案
        filename = os.path.join(FILTERS_DIR, f'{username}_filters.json')
        
        # 確保目錄存在
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        
        # 寫入檔案
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return jsonify({'status': 'success', 'message': '篩選狀態已儲存'})
        
    except Exception as e:
        print(f"儲存篩選狀態錯誤: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/get-filters-json/<username>', methods=['GET'])
def get_filters_json(username):
    try:
        filename = os.path.join(FILTERS_DIR, f'{username}_filters.json')
        
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                filters = json.load(f)
            return jsonify(filters)
        else:
            return jsonify({'message': '找不到篩選設定'}), 404
            
    except Exception as e:
        print(f"載入篩選狀態錯誤: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/clear-filters-json/<username>', methods=['DELETE'])
def clear_filters_json(username):
    try:
        filename = os.path.join(FILTERS_DIR, f'{username}_filters.json')
        
        if os.path.exists(filename):
            os.remove(filename)
            return jsonify({'status': 'success', 'message': '篩選狀態已清除'})
        else:
            return jsonify({'status': 'success', 'message': '沒有需要清除的篩選狀態'})
            
    except Exception as e:
        print(f"清除篩選狀態錯誤: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_verification_status_and_po_numbers():
    """
    更新驗收狀態和PO No.欄位
    1. 根據Buyer_detail.csv中同ID的驗收狀態來更新Planned_Purchase_Request_List.csv的驗收狀態
    2. 將同ID下的PO No.組合成字串
    3. 檢查Buyer_detail.csv中的ePR No.，如果有值則設開單狀態為'V'
    """
    backup_files()
    try:
        # 讀取兩個CSV檔案
        main_df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)  # Planned_Purchase_Request_List.csv
        detail_df = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str)  # Buyer_detail.csv
        
        # 確保必要欄位存在
        if '驗收狀態' not in main_df.columns:
            main_df['驗收狀態'] = 'X'
        if 'PO No.' not in main_df.columns:
            main_df['PO No.'] = ''
        if '開單狀態' not in detail_df.columns:
            detail_df['開單狀態'] = 'X'
        
        # ===== 步驟1：更新 BUYER_FILE 中的開單狀態 =====
        for idx, detail_row in detail_df.iterrows():
            epr_no = str(detail_row.get('ePR No.', '')).strip()
            if epr_no and epr_no.isdigit() and len(epr_no) == 10:
                detail_df.at[idx, '開單狀態'] = 'V'
            else:
                detail_df.at[idx, '開單狀態'] = 'X'
        
        detail_df.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")
        
        # ===== 步驟2：更新主表 驗收狀態 和 PO No. =====
        for idx, main_row in main_df.iterrows():
            main_id = str(main_row.get('Id', '')).strip()
            if not main_id:
                continue
                
            detail_records = detail_df[detail_df['Id'].astype(str).str.strip() == main_id]
            
            if detail_records.empty:
                main_df.at[idx, '驗收狀態'] = 'X'
                main_df.at[idx, 'PO No.'] = ''
                continue
            
            # 驗收狀態：只有當所有都是 V 才設 V
            statuses = detail_records['驗收狀態'].fillna('X').astype(str).str.strip()
            main_df.at[idx, '驗收狀態'] = 'V' if all(s == 'V' for s in statuses if s) else 'X'
            
            # PO No. 組合
            po_numbers = detail_records['PO No.'].fillna('').astype(str).str.strip()
            unique_po_numbers = []
            for po in po_numbers:
                if po and po not in unique_po_numbers:
                    unique_po_numbers.append(po)
            main_df.at[idx, 'PO No.'] = '<br />'.join(unique_po_numbers) if unique_po_numbers else ''
        
        main_df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")
        return True
    
    except Exception as e:
        print(f"❌ 更新驗收狀態和PO No.時發生錯誤: {str(e)}")
        import traceback; traceback.print_exc()
        return False


# ===============================
@app.route("/data")
def get_data():
    update_verification_status_and_po_numbers()
    df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)

    expected_columns = [
        "Id", "開單狀態", "WBS", "請購順序", "需求者", "請購項目", "需求原因",
        "總金額", "需求日", "已開單日期", "ePR No.", "進度追蹤超連結", "備註",
        "Status", "簽核中關卡", "報告路徑", "驗收路徑", "合作類別", "合作廠商", 
        "前購單單號", "驗收狀態", "PO No."
    ]
    for col in expected_columns:
        if col not in df.columns:
            df[col] = ""

    if "Id" not in df.columns:
        df.insert(0, "Id", [str(uuid.uuid4()) for _ in range(len(df))])
        df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")
    else:
        df["Id"] = df["Id"].fillna("").astype(str).str.strip()
        missing_ids = df["Id"] == ""
        df.loc[missing_ids, "Id"] = [str(uuid.uuid4()) for _ in range(missing_ids.sum())]
        if missing_ids.any():
            df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")

    df["ePR No."] = df["ePR No."].apply(lambda x: "" if pd.isna(x) or x == 0 else str(int(float(x))))
    df["總金額"] = pd.to_numeric(df["總金額"], errors="coerce").fillna(0)
    df["總金額"] = df["總金額"].apply(lambda x: "" if x == 0 else int(x))

    numeric_columns = ["請購順序", "需求日", "已開單日期", "前購單單號", "驗收狀態"]
    for col in numeric_columns:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: "" if pd.isna(x) or x == 0 else str(int(float(x)))
                if str(x).replace('.','').isdigit() else str(x)
            )
    
    df = df.fillna("")
    return jsonify(df.to_dict(orient="records"))


@app.route('/api/unordered-count')
def get_unordered_count():
    
    if not os.path.exists(CSV_FILE) or os.path.getsize(CSV_FILE) == 0:
        return jsonify({
            "count_X": 0,
            "count_V": 0,
            "monthly_expenses": {}
        })

    try:
        df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)
        df = df.fillna("")

        count_X = df[df["開單狀態"] != "V"].shape[0]
        count_V = df[df["開單狀態"] == "V"].shape[0]

        df_unordered = df[df["開單狀態"] != "V"].copy()

        # ✅ 加這一行，過濾掉非法的需求日
        df_unordered["需求日"] = df_unordered["需求日"].astype(str).str.replace("/", "", regex=False)
        df_unordered = df_unordered[df_unordered["需求日"].str.match(r'^\d{8}$')].copy()

        df_unordered["總金額"] = pd.to_numeric(df_unordered["總金額"], errors="coerce").fillna(0)
        df_unordered["需求日"] = df_unordered["需求日"].astype(str)
        df_unordered["月份"] = df_unordered["需求日"].str.slice(0, 6)

        monthly_sums = df_unordered.groupby("月份")["總金額"].sum().sort_index()
        monthly_expenses = {month: int(round(amount, 2)) for month, amount in monthly_sums.items()}

        print(monthly_expenses)

        return jsonify({
            "count_X": count_X,
            "count_V": count_V,
            "monthly_expenses": monthly_expenses
        })

    except Exception as e:
        traceback.print_exc()  
        return jsonify({
            "count_X": 0,
            "count_V": 0,
            "monthly_expenses": {},
            "error": str(e)
        }), 500


@app.route('/api/getrestofmoney', methods = ['GET'])
def getrestofmoney():
    import datetime, re, math

    budget = read_json_file()
    current_date = datetime.datetime.now()
    current_year = str(current_date.year)
    month_no_pad = str(current_date.month)       # '8'
    month_pad = str(current_date.month).zfill(2) # '08'
    yyyymm = current_year + month_pad

    # 嘗試兩種 key
    data = budget.get("預算", {}).get(current_year, {}).get(month_no_pad, {})
    if not data:
        data = budget.get("預算", {}).get(current_year, {}).get(month_pad, {})

    current_budget = float(data.get('當月請購預算', 0))
    additional_budget = float(data.get('當月追加預算', 0))

    try:
        df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)
    except:
        df = pd.DataFrame()

    total_money = 0.0
    if not df.empty:
        for _, row in df.iterrows():
            status = str(row.get('開單狀態', '')).strip()
            raw_date = str(row.get('已開單日期', '')).strip()
            cleaned_date = ''.join([c for c in raw_date if c.isdigit()])[:8]
            wbs = str(row.get('WBS', '')).strip()

            raw_amount = str(row.get('總金額', '')).replace(',', '').strip()
            try:
                amount = float(raw_amount) if raw_amount and raw_amount.lower() != 'nan' else 0.0
            except:
                amount = 0.0
            if math.isnan(amount):
                amount = 0.0

            monthKey = cleaned_date[:6]
            matchMonth = len(cleaned_date) == 8 and monthKey == yyyymm

            if status == 'V' and matchMonth and not re.match(r'^\d{2}FT0A\d{4}$', wbs):
                total_money += amount
                # print(f"[DEBUG] 加總 -> 狀態={status}, 日期={cleaned_date}, 月份={monthKey}, 金額={amount}, WBS={wbs}")

    rest_money = (current_budget + additional_budget) - total_money
    # print(f"[DEBUG] 當月預算={current_budget}, 追加={additional_budget}, 已開單={total_money}, 剩餘={rest_money}")
    return jsonify({
        '當月請購預算': int(current_budget),
        '當月追加預算': int(additional_budget),
        '已開單總額': int(total_money),
        '剩餘金額': int(rest_money)
    })




@app.route('/api/budget_months', methods=['GET'])
def get_budget_months():
    """
    獲取所有可用的預算月份選項和對應的預算金額
    """
    try:
        budget = read_json_file()
        # print(f"📊 讀取預算資料: {budget}")
        
        budget_list = []
        
        # 從預算資料中提取所有年份和月份，並計算預算
        budget_data = budget.get("預算", {})
        
        for year in budget_data.keys():
            year_data = budget_data[year]
            for month in year_data.keys():
                # 格式化為 YYYYMM 格式
                month_padded = str(month).zfill(2)
                year_month = f"{year}{month_padded}"
                
                # 獲取該月份的預算資料
                month_budget_data = year_data[month]
                current_budget = month_budget_data.get('當月請購預算', 0)
                additional_budget = month_budget_data.get('當月追加預算', 0)
                total_budget = current_budget + additional_budget
                
                # 建立月份和預算的對應資料
                budget_info = {
                    'month': year_month,
                    'money': total_budget,
                    '當月請購預算': current_budget,
                    '當月追加預算': additional_budget
                }
                
                budget_list.append(budget_info)
                # print(f"💰 {year_month}: 請購={current_budget:,}, 追加={additional_budget:,}, 總計={total_budget:,}")
        
        # 按月份排序，最新的在前
        budget_list.sort(key=lambda x: x['month'], reverse=True)
        
        # print(f"📅 完整預算清單: {budget_list}")
        
        return jsonify({
            'success': True,
            'budget_list': budget_list,
            'count': len(budget_list)
        })
        
    except Exception as e:
        print(f"❌ 獲取預算月份錯誤: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    

@app.route('/api/uploadMoney', methods=['POST'])
def uploadMoney():
    try:
        data = request.get_json()
        year = data.get('currentYear')
        month = data.get('currentMonth')
        current_budget = data.get('currentBudget')
        additional_budget = data.get('additionalBudget')

        budget_data = read_json_file()  # 讀原始 JSON 資料
        print("budget_data: ", budget_data)

        # 檢查年度
        if "預算" not in budget_data:
            budget_data["預算"] = {}

        if str(year) not in budget_data["預算"]:
            budget_data["預算"][str(year)] = {}

        # 更新該月份資料
        budget_data["預算"][str(year)][str(month)] = {
            "當月請購預算": current_budget,
            "當月追加預算": additional_budget
        }

        # ✅ 正確寫入更新後的資料
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(budget_data, f, ensure_ascii=False, indent=4)

        return jsonify({'message': '資料提交成功'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/requesters', methods=['GET'])
def get_requesters():
    try:
        with open("config.cfg", "r", encoding="utf-8-sig") as f:
            lines = f.readlines()
            names = [line.strip() for line in lines if line.strip()]  
            # print("requesters: ", names)
            return jsonify(names)
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/api/admins', methods=['GET'])
def get_admins():
    try:
        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            seen = set()
            names = []
            for entry in data:
                if entry["請購網頁後台"] == 'O':
                    name = entry["工號"]
                    if name not in seen:
                        seen.add(name)
                        names.append(name)
            # print("admins: ", names)
            return jsonify(names)
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/api/add", methods = ['POST'])
def add_new_item():
    try:
        # 備份
        backup_files()
        data = request.get_json()
        main_data = {k: v for k, v in data.items() if k != 'tableRows'}
        table_rows = data.get('tableRows', [])

        print("主資料：", main_data)
        
        if not data:
            return jsonify({'status': 'error', 'message': '無效的 JSON 請求'}), 400

        df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)

        # 確保所有欄位一致
        # new_row = {col: data.get(col, "") for col in df.columns}

        new_row = {col: clean_value(main_data.get(col, "")) for col in df.columns}

        if isinstance(new_row["需求日"], str) and "/" in new_row["需求日"]:
            new_row['需求日'] = new_row["需求日"].replace("/", "")

        if isinstance(new_row["已開單日期"], str) and "/" in new_row["已開單日期"]:
            new_row['已開單日期'] = new_row["已開單日期"].replace("/", "")

        def safe_float_to_int64(value):
            try:
                return str(int(float(value)))
            except (ValueError, TypeError, OverflowError):
                return ""

        # ✨ 要轉換的欄位（避免 int32 溢位）
        numeric_fields = ["請購順序", "總金額", "需求日", "已開單日期", "ePR No."]
        for field in numeric_fields:
            if field in new_row:
                new_row[field] = safe_float_to_int64(new_row[field])

        new_row["Id"] = str(uuid.uuid4())  # 自動產生唯一 ID

        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        print(new_row)
        # 儲存回 CSV
        df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")

        # 寫入另一張表
        print("表格列：", table_rows)
        DETAIL_CSV_FILE = "static/data/Buyer_detail_updated.csv"  # 建議存另一份 CSV 檔

        detail_columns = [
            "Id", "開單狀態", "交貨驗證", "User", "ePR No.", "PO No.",
            "Item", "品項", "規格", "數量", "總數", "單價", "總價", "備註", "字數",
            "isEditing", "backup", "_alertedItemLimit", "Delivery Date 廠商承諾交期",
            "SOD Qty 廠商承諾數量", "驗收數量", "拒收數量", "發票月份", "WBS", "需求日", "RT金額", "RT總金額","驗收狀態"
        ]

        # 處理後的資料列（每筆 row 補上主資料 ID，欄位順序統一）
        cleaned_rows = []
        for row in table_rows:
            cleaned_row = {"Id": new_row["Id"]}  # 主表 Id
            for col in detail_columns[1:-2]:  # 不含 isEditing, backup，這兩個手動補
                cleaned_row[col] = row.get(col, "")
            cleaned_row["isEditing"] = "False"
            cleaned_row["backup"] = "{}"
            cleaned_rows.append(cleaned_row)
            
        # 如果檔案已存在就 append，否則建立新檔
        if os.path.exists(DETAIL_CSV_FILE):
            df_detail = pd.read_csv(DETAIL_CSV_FILE, encoding="utf-8-sig", dtype=str)
            df_detail = pd.concat([df_detail, pd.DataFrame(cleaned_rows)], ignore_index=True)
        else:
            df_detail = pd.DataFrame(cleaned_rows, columns=detail_columns)

        # 寫入 CSV
        df_detail.to_csv(DETAIL_CSV_FILE, index=False, columns=detail_columns, encoding="utf-8-sig")

        return jsonify({'status': 'success', 'message': '資料新增成功'}), 200

    except Exception as e:
        print("新增錯誤：", e)
        return jsonify({'status': 'error', 'message': str(e)}), 500
    



@app.route('/update', methods=['POST'])
def update_data():
    # 備份
    backup_files()
    new_data = request.json
    if not isinstance(new_data, dict):
        return jsonify({"message": "請求內容不是有效的 JSON"}), 400
    print(new_data)
    main_data = {k: v for k, v in new_data.items() if k != "tableRows"} # type: ignore
    detail_data = new_data.get("tableRows", []) # type: ignore
    
    if main_data is None:
        return jsonify({"message": "請求內容不是有效的 JSON"}), 400
    
    target_id = str(main_data.get("Id", "")).strip()
    if not target_id:
        return jsonify({"message": "缺少 Id"}), 400
    
    try:
        df = pd.read_csv(CSV_FILE, dtype=str)
        df.fillna("", inplace=True)

        # 找到對應列
        df["Id"] = df["Id"].astype(str).str.strip()
        match_idx = df.index[df["Id"] == target_id].tolist()
        if not match_idx:
            return jsonify({"message": "找不到對應資料"}), 404
        idx = match_idx[0]

        # 處理日期欄位格式
        if isinstance(new_data.get("需求日"), str):
            main_data["需求日"] = main_data["需求日"].replace("/", "")
        if isinstance(new_data.get("已開單日期"), str):
            main_data["已開單日期"] = main_data["已開單日期"].replace("/", "")

        # 更新欄位
        for col in df.columns:
            df.at[idx, col] = str(main_data.get(col, ""))

            # 清洗資料（包含去除 .0 與斜線）
        for col in df.columns:
            val = main_data.get(col, "")
            val = clean_value(val)
            if col in ["需求日", "已開單日期"] and isinstance(val, str):
                val = val.replace("/", "")
            df.at[idx, col] = val

        # 若 ePR No. 存在 → 補連結欄位
        if main_data.get('ePR No.'):
            df.at[idx, "進度追蹤超連結"] = f"https://khwfap.kh.asegroup.com/ePR/PRQuery/QueryPR?id={main_data['ePR No.']}"


        df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")
       
    
        detail_file = "static/data/Buyer_detail_updated.csv"
        if os.path.exists(detail_file):
            df_detail = pd.read_csv(detail_file, encoding="utf-8-sig", dtype=str)
            df_detail = df_detail[df_detail["Id"] != target_id]
        else:
            df_detail = pd.DataFrame()

        # 加入新的細項資料
        if detail_data:
            new_rows = pd.DataFrame(detail_data)
            new_rows["Id"] = target_id  # 加入對應主表 Id
            df_detail = pd.concat([df_detail, new_rows], ignore_index=True)

        # 儲存
        df_detail.to_csv(detail_file, index=False, encoding="utf-8-sig")
        
        return jsonify({"message": "更新成功"}), 200

    except Exception as e:
        print("錯誤：", e)
        return jsonify({"message": "資料更新失敗"}), 500



@app.route('/api/get-username-info', methods=['POST'])
def get_username_info():
    try:
        data = request.get_json()
        emp_id = data.get("emp_id", "").strip()  # 工號

        if not emp_id:
            return jsonify({"error": "缺少工號"}), 400

        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            users = json.load(f)

        for entry in users:
            if entry.get("工號", "").strip() == emp_id:
                return jsonify({
                    "name": entry.get("姓名", "").strip(),
                    "班別": entry.get("班別", "").strip()
                })

        return jsonify({"error": "查無此工號"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    
@app.route('/api/checkeEPRno', methods=['POST'])
def check_epr_no():
    try:
        epr_no = request.get_json()
        if not isinstance(epr_no, str):
            return jsonify({'error': 'Invalid ePR No. format'}), 400

        df = pd.read_csv(CSV_FILE, dtype=str)  # 讀取所有欄位為字串避免轉型問題
        exists = epr_no in df['ePR No.'].dropna().tolist()

        return jsonify({'exists': exists})
    except Exception as e:
        print(f"❌ 錯誤: {e}")
        return jsonify({'error': '檢查失敗'}), 500


@app.route('/api/check-edit-permission', methods=['POST'])
def check_edit_permission():
    try:
        data = request.get_json()
        current_user = data.get("currentUser", "").strip()
        target_id = data.get("id", "").strip()

        if not current_user or not target_id:
            return jsonify({"allowed": False, "error": "缺少必要參數"}), 400
        
        # 讀取 admin 工號列表
        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            backend_data = json.load(f)
            admin_ids = [
                entry.get("工號", "").strip()
                for entry in backend_data
                if entry.get("請購網頁後台") == "O"
            ]

        is_admin = current_user in admin_ids

        # 查詢該 ID 對應的需求者
        df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)
        df.fillna("", inplace=True)
        df["Id"] = df["Id"].astype(str).str.strip()

        matched_row = df[df["Id"] == target_id]
        if matched_row.empty:
            return jsonify({"allowed": False, "error": "找不到對應資料"}), 404

        row = matched_row.iloc[0]
        requester = row.get("需求者", "").strip()

        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            backend_data = json.load(f)
        
        requester_id = ""
        for entry in backend_data:
            if entry.get("姓名", "").strip() == requester:
                requester_id = entry.get("工號", "").strip()
                break

        print(f"使用者: {current_user}, 工號: {requester_id}, 是否為 admin: ", is_admin)

        if requester_id == current_user:
            return jsonify({"allowed": True})

        return jsonify({"allowed": is_admin})

    except Exception as e:
        print("權限檢查失敗：", e)
        return jsonify({"allowed": False, "error": str(e)}), 500




@app.route("/api/get_detail/<id>", methods=["GET"])
def get_detail_by_id(id):
    try:
        detail_file = "static/data/Buyer_detail_updated.csv"
        if not os.path.exists(detail_file):
            return jsonify([])  # 沒有資料回傳空陣列

        df = pd.read_csv(detail_file, encoding="utf-8-sig", dtype=str)
        df.fillna("", inplace=True)

        # 篩選出指定 Id 的細項資料
        detail_rows = df[df["Id"] == id].to_dict(orient="records")
        return jsonify(detail_rows)
    
    except Exception as e:
        print("讀取細項資料錯誤：", e)
        return jsonify({"error": str(e)}), 500



@app.route("/getItemName", methods=["POST"])
def get_item_name():
    try:
        data = request.get_json()
        user_id = data.get("username")
        user_name = data.get("NeedPerson")
        print(user_id, user_name)

        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            items = json.load(f)

        for item in items:
            if str(item.get("工號", "")).strip() == user_id:
                return jsonify({"name": item.get("姓名", "")})
            
        return jsonify({"error": "Item not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/delete', methods=['POST'])
def delete_entry():
    # 備份
    backup_files()
    data = request.json
    if data is None:
        return jsonify({"message": "請求內容不是有效的 JSON"}), 400
    
    target_id = str(data.get("Id", "")).strip()
    if not target_id:
        return jsonify({"status": "error", "message": "缺少 Id 欄位"}), 400

    df = pd.read_csv(CSV_FILE, encoding="utf-8-sig", dtype=str)
    # 取消 eprno的欄位

    new_df = df[df['Id'] != target_id]

    if len(new_df) == len(df):
        return jsonify({"status": "error", "message": "找不到符合條件的資料"})

    new_df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")

    detail_file = "static/data/Buyer_detail_updated.csv" 
    if os.path.exists(detail_file):
        df_detail = pd.read_csv(detail_file, encoding="utf-8-sig", dtype=str)
        df_detail = df_detail[df_detail["Id"] != target_id]
        df_detail.to_csv(detail_file, index=False, encoding="utf-8-sig")

    return jsonify({"status": "success", "message": "已成功刪除"})

# 預計請購 更新目前狀態
@app.route("/api/Status-upload", methods=["POST"])
def upload():
    # 備份
    backup_files()
    if 'file' not in request.files:
        return jsonify({'status': 'fail', 'msg': 'No file uploaded'}), 400

    file = request.files['file']
    filename = file.filename
    if filename != "download.csv":
        return jsonify({'status': 'Fail', 'filename': filename}), 400
    filename = f"status_{uuid.uuid4().hex}.csv"
    filepath = os.path.join('uploads', str(filename))
    file.save(filepath)

    lock = FileLock(f"{CSV_FILE}.lock")

    def clean_nan_value(val):
        if pd.isna(val) or str(val).strip().lower() in ['nan', 'none']:
            return ""
        return str(val).strip()
    
    with lock:
        try:

            df = pd.read_csv(filepath)
            updates = []
            for _, row in df.iterrows():
                epr_no = str(row.get('E-PR號碼           ', '')).strip()
                status = clean_nan_value(row.get('狀態', ''))
                stage = clean_nan_value(row.get('簽核中關卡', ''))

                if epr_no and epr_no != 'nan':
                    updates.append({
                        'epr_no': epr_no,
                        '狀態': status,
                        '簽核中關卡': stage
                    })
                    
            Planned_Purchase_Request_List_df = pd.read_csv(CSV_FILE)
            updated_count = 0
            no_change_count = 0

            # non_null_count = Planned_Purchase_Request_List_df['ePR No.'].notna().sum()


            for update in updates:
                epr = update['epr_no']
                new_status = update['狀態']
                new_stage = update['簽核中關卡']
            
                match = Planned_Purchase_Request_List_df['ePR No.'] == int(epr)
                if match.any():
                    idx = Planned_Purchase_Request_List_df[match].index[0]
                    
                    # 取得目前值
                    old_status = clean_nan_value(Planned_Purchase_Request_List_df.at[idx, 'Status'])
                    old_stage = clean_nan_value(Planned_Purchase_Request_List_df.at[idx, '簽核中關卡'])
                    
                    # 只有在真的有變更時才更新
                    if old_status != new_status or old_stage != new_stage:
                        Planned_Purchase_Request_List_df.at[idx, 'Status'] = new_status
                        Planned_Purchase_Request_List_df.at[idx, '簽核中關卡'] = new_stage
                        updated_count += 1
                    else:
                        no_change_count += 1

                    
            def safe_float_to_int64(val):
                try:
                    if pd.isna(val):
                        return ""
                    return str(int(float(val)))
                except:
                    return str(val).strip()
                
            numeric_fields = ["請購順序", "總金額", "需求日", "已開單日期", "ePR No."]
            for field in numeric_fields:
                if field in Planned_Purchase_Request_List_df.columns:
                    Planned_Purchase_Request_List_df[field] = Planned_Purchase_Request_List_df[field].apply(safe_float_to_int64)

            # 清理所有欄位
            for col in Planned_Purchase_Request_List_df.columns:
                Planned_Purchase_Request_List_df[col] = Planned_Purchase_Request_List_df[col].apply(clean_nan_value)

            Planned_Purchase_Request_List_df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig', na_rep="")
        except Exception as e:
            print("Exception: ", e)


    with lock:
        try:
            df_update = pd.read_csv(filepath, dtype=str)

            # 提取更新資料
            po_updates = []
            for _, row in df_update.iterrows():
                epr_no = str(row.get('E-PR號碼           ', '')).strip()
                sap_po  = str(row.get('SAP PO', '')).strip() 
                if epr_no and sap_po:
                    po_updates.append({
                        'epr_no': epr_no,
                        'po_no': sap_po
                    })
            df_detail = pd.read_csv(BUYER_FILE, dtype=str)

            if "PO No." not in df_detail.columns:
                df_detail["PO No."] = ""


            updated = 0
            nochange = 0

            for upd in po_updates:
                epr = upd['epr_no']
                new_po = upd['po_no']

                # ePR No. 轉成 int → str 避免格式不同
                try:
                    epr_str = str(int(float(epr)))
                except:
                    epr_str = str(epr).strip()

                match_idx = df_detail.index[df_detail['ePR No.'] == epr_str].tolist()

                if match_idx:
                    for idx in match_idx:
                        old_po = str(df_detail.at[idx, 'PO No.']).strip()

                        if old_po != new_po:
                            df_detail.at[idx, 'PO No.'] = new_po
                            updated += 1
                        else:
                            nochange += 1

            # 寫回 Buyer_detail.csv
            df_detail.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")
            return jsonify({'status': 'success', 'updated_count': updated_count})

        except Exception as e:
            return jsonify({'status': 'Fail', 'reason': e})




# 路徑(報告路徑)
@app.route('/upload_report', methods=['POST'])
def upload_report():
    file = request.files.get('file')
    folder = request.form.get('folder')
    username = request.form.get('work_username')

    if not file:
        return jsonify(success=False, message='無檔案')
    if not folder:
        return jsonify(success=False, message='資料夾名稱為空')
    if not username:
        return jsonify(success=False, message='缺少 username')

    filename = file.filename or ''
    if filename == '':
        return jsonify(success=False, message='檔案名稱為空')

    try:
        save_path = os.path.join(
            r'\\cim300\FT01_CIM\FT01_4000\11.RR班人員-ePR請購管理',
            username,
            folder
        )
        os.makedirs(save_path, exist_ok=True)
        file.save(os.path.join(save_path, filename))
        return jsonify(success=True, message='已上傳')
    except Exception as e:
        print('❌ 儲存錯誤：', e)
        return jsonify(success=False, message=str(e))



# 路徑(報告路徑)
@app.route('/upload_acceptancereport', methods=['POST'])
def upload_acceptancereport():
    file = request.files.get('file')
    folder = request.form.get('folder')
    username = request.form.get('work_username')

    if not file:
        return jsonify(success=False, message='無檔案')
    if not folder:
        return jsonify(success=False, message='資料夾名稱為空')
    if not username:
        return jsonify(success=False, message='缺少 username')

    filename = file.filename or ''
    if filename == '':
        return jsonify(success=False, message='檔案名稱為空')

    try:
        save_path = os.path.join(
            r'\\cim300\FT01_CIM\FT01_4000\11.RR班人員-ePR請購管理',
            username,
            r"=已結單=",
            folder
        )
        os.makedirs(save_path, exist_ok=True)
        file.save(os.path.join(save_path, filename))
        return jsonify(success=True, message='已上傳')
    except Exception as e:
        print('❌ 儲存錯誤：', e)
        return jsonify(success=False, message=str(e))

# 取得英文名字
@app.route('/api/getUsername', methods=['POST'])
def get_username():
    try:
        data = request.get_json()
        username = data.get("username")
        print("收到需求者名字：", username)


        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            backend_data = json.load(f)

        matched = next((entry for entry in backend_data if entry["姓名"] == username), None)
        
        if matched and "Notes_ID" in matched:
            try:
                name = matched["Notes_ID"].split("_")[0]
            except:
                name = matched["Notes_ID"].split("@")[0]

            return jsonify({"name": name})
        else:
            return jsonify({"name": "查無使用者"}), 404
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sendmail', methods=['POST']) 
def sendmail():
    try:
        data = request.get_json()
        with open("Backend_data.json", "r", encoding="utf-8-sig") as f:
            backend_data = json.load(f)

        mail_data = data.get("data", {})
        recipient_clean = mail_data.get("需求者", "").strip()  
        mail_name = ''
        matched = next(
            (entry for entry in backend_data if entry.get("姓名", "").strip() == recipient_clean),
            None
        )

        if matched and "Notes_ID" in matched:
            mail_name = matched["Notes_ID"]

        raw_cc = data.get("cc", "")  

        cc_names = [name.strip() for name in raw_cc.split(",") if name.strip()]

        cc_list = [name.replace(" ", "_") + "@aseglobal.com" for name in cc_names]

        cc_string = ",".join(cc_list)

        if data["data"]["請購順序"] == "1":
            print("正在導入超急件模組...")
            from MailFunction.urgent import send_mail
            print("開始執行超急件郵件發送...")
            try:
                print(data["data"], '\n', data["recipient"], '\n', mail_name, '\n', cc_string)
                send_mail(data["data"], data["recipient"], mail_name, cc_string)
                print("超急件郵件發送完成")
            except Exception as urgent_error:
                print(f"❌ 超急件郵件發送錯誤: {str(urgent_error)}")
              
                print("完整錯誤追蹤:")
                traceback.print_exc()
                raise urgent_error
        else:
            print("正在導入一般郵件模組...")
            from MailFunction.normail import send_mail
            print("開始執行一般郵件發送...")
            try:
                print(data["data"], '\n', data["recipient"], '\n', mail_name, '\n', cc_string)
                send_mail(data["data"], data["recipient"], mail_name, cc_string)
                print("一般郵件發送完成")
            except Exception as normal_error:
                print(f"❌ 一般郵件發送錯誤: {str(normal_error)}")
        
                print("完整錯誤追蹤:")
                traceback.print_exc()
                raise normal_error

        print("準備返回成功響應")
        return jsonify({"success": True, "message": "郵件發送成功"}), 200
        
    except Exception as e:
        print(f"❌ 主函數錯誤: {str(e)}")

        print("完整錯誤追蹤:")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    
@app.route('/update_for_mail', methods=['POST'])
def update_for_mail():
    # 備份
    backup_files()
    new_data = request.json
    print("收到的資料:", new_data)
    
    if new_data is None:
        return jsonify({"message": "沒有收到資料"}), 400
    
    try:
        df = pd.read_csv(CSV_FILE, dtype=str)
        df.fillna("", inplace=True)

        # 找到對應列
        df["Id"] = df["Id"].astype(str).str.strip()
        target_id = str(new_data['Id']).strip()
        
        print(f"尋找 Id: {target_id}")
        
        # 找到符合條件的列
        mask = df["Id"] == target_id
        
        if not mask.any():
            print(f"找不到 Id 為 {target_id} 的資料")
            return jsonify({"message": "找不到對應的資料"}), 404
        
        print(f"找到對應資料，開始更新...")
        
        # 更新資料
        for key, value in new_data.items():
            if key in df.columns:
                df.loc[mask, key] = str(value) if value is not None else ""
                print(f"更新 {key}: {value}")
        
        # 儲存到 CSV
        df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")
        print("資料已儲存")
        
        return jsonify({"message": "更新成功"}), 200

    except Exception as e:
        print("錯誤：", e)
        
        traceback.print_exc()
        return jsonify({"message": "資料更新失敗"}), 500


# 罐頭訊息   - 。(前購單：，詳如附件)需求工程師：(CT4:)，合作開發：
@app.route('/api/get_phone', methods=['POST'])
def get_phone():
    data = request.get_json()
    name = data.get("name", "")
    with open('static/data/phone.json', 'r', encoding='utf-8-sig') as f:
        phone_data = json.load(f)

    phone_number = phone_data.get(name, "未知")

    return jsonify({"phone": phone_number})


# 廠商
@app.route('/api/venders', methods=['GET'])
def get_venders():
    """讀取 vender.ini 並返回供應商列表"""
    try:
        if os.path.exists(VENDER_FILE_PATH):
            with open(VENDER_FILE_PATH, 'r', encoding='utf-8') as f:
                venders = [line.strip() for line in f.readlines() if line.strip()]
            return jsonify(venders)
        else:
            return jsonify([])
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/venders', methods=['POST'])
def add_vender():
    """新增供應商到 vender.ini"""
    try:
        data = request.get_json()
        new_vender = data.get('vender', '').strip()

        if not new_vender:
            return jsonify({'error': '供應商名稱不能是空的'}), 400

        # 讀取現有清單，避免重複
        existing = []
        if os.path.exists(VENDER_FILE_PATH):
            with open(VENDER_FILE_PATH, 'r', encoding='utf-8') as f:
                existing = [line.strip() for line in f.readlines() if line.strip()]

        if new_vender in existing:
            return jsonify({'message': '供應商已存在'}), 200

        # 追加寫入
        with open(VENDER_FILE_PATH, 'a', encoding='utf-8') as f:
            f.write(new_vender + '\n')

        return jsonify({'message': '新增成功', 'vender': new_vender}), 201

    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500


# eHub 處理
@app.route("/api/save_csv", methods=["POST", "OPTIONS"])
def save_csv():
    # 備份
    backup_files()
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    content = data.get("content", "")

    from io import StringIO
    df_all = pd.read_csv(StringIO(content), dtype=str).fillna("")

    # 先處理 Item → 一律補成4位數
    if "PO Item 採購單項次" in df_all.columns:
        df_all["PO Item 採購單項次"] = (
            df_all["PO Item 採購單項次"]
            .str.strip()
            .apply(lambda x: str(int(float(x))) if x.replace('.', '', 1).isdigit() else x)
            .apply(lambda x: x.zfill(4) if x.isdigit() else x)
        )

    # 確認有必要欄位
    if "PO NO 採購單號碼" not in df_all.columns:
        return jsonify({"status": "error", "msg": "❌ 缺少 PO NO 採購單號碼 欄位！"}), 400

    # 抓出所有不同的 PO NO
    unique_po_nos = df_all["PO NO 採購單號碼"].dropna().unique()

    # ✅ 第一步：分群儲存 uploads/{po_no}.csv
    saved_files = []
    for po_no in unique_po_nos:
        po_no_clean = str(po_no).strip()
        group_df = df_all[df_all["PO NO 採購單號碼"] == po_no_clean]

        upload_path = f"uploads/{po_no_clean}.csv"
        group_df.to_csv(upload_path, index=False, encoding="utf-8-sig")

        saved_files.append({
            "po_no": po_no_clean,
            "rows": len(group_df),
            "file": upload_path
        })
        print(f"✅ 已儲存 {upload_path} ({len(group_df)} 筆資料)")

    # ✅ 第二步：載入 Buyer_detail.csv (比對用)
    df_buyer = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str, on_bad_lines="skip").fillna("")
    df_buyer["PO No."] = df_buyer["PO No."].str.strip()
    df_buyer["Item"] = (
        df_buyer["Item"]
        .str.replace(r"\.0$", "", regex=True)
        .str.strip()
        .apply(lambda x: x.zfill(4) if x.isdigit() else x)
    )

    def clean_name(x: str) -> str:
        return str(x).replace("\n", "").replace("\r", "").replace("<br>", "").strip()

    df_buyer["品項_clean"] = df_buyer["品項"].apply(clean_name)
    buyer_id_lookup = {
        (row["PO No."], row["Item"]): row.get("Id", "")
        for _, row in df_buyer.iterrows()
    }
    # ✅ 最後要回傳的結果，依照 po_no 分組
    all_group_results = []

    # ✅ 第三步：逐一打開 uploads/{po_no}.csv 去比對
    for file_info in saved_files:
        po_no = file_info["po_no"]
        csv_path = file_info["file"]

        # 打開剛剛儲存的這個 po_no CSV
        df_po = pd.read_csv(csv_path, encoding="utf-8-sig", dtype=str).fillna("")
        df_po["PO Item 採購單項次"] = df_po["PO Item 採購單項次"].str.zfill(4)

        # 這個 po_no 相關的 Buyer_detail 資料
        buyer_related = df_buyer[df_buyer["PO No."].str.contains(po_no, regex=False, na=False)].copy()

        matched_list = []
        conflict_list = []

        # 逐筆比對
        for _, row in df_po.iterrows():
            item = row["PO Item 採購單項次"]
            desc = clean_name(row.get("Description 品名", ""))
            delivery = row["Delivery Date 廠商承諾交期"]
            qty = row["SOD Qty 廠商承諾數量"]

            # 先用品項比對
            same_name_match = buyer_related[buyer_related["品項_clean"] == desc]

            if not same_name_match.empty:
                buyer_row = same_name_match.iloc[0]
                # ✅ 品項相同 → 檢查 Item 是否一致
                buyer_item = same_name_match.iloc[0]["Item"]
                buyer_desc = clean_name(same_name_match.iloc[0]["品項"])
                buyer_id = buyer_row.get("Id", "")

                # 更新交期 & 數量
                df_buyer.loc[same_name_match.index, "Delivery Date 廠商承諾交期"] = delivery
                df_buyer.loc[same_name_match.index, "SOD Qty 廠商承諾數量"] = qty

                if buyer_item == item:
                    buyer_id = buyer_id_lookup.get((po_no, buyer_item), "")
                    # ✅ 品項 & Item 都一致
                    matched_list.append({
                        "id": buyer_id,
                        "po_no": po_no,
                        "item": item,
                        "buyer_description": buyer_desc,
                        "po_description": desc or buyer_desc,
                        "delivery_date": delivery,
                        "sod_qty": qty,
                        "status": "✅ 相同",
                        "diff_type": "none"
                    })
                else:
                    # ⚠️ 品項相同，但 Item 不同
                    buyer_id = buyer_id_lookup.get((po_no, buyer_item), "")
                    conflict_list.append({
                        "id": '',
                        "po_no": po_no,
                        "item": item,
                        "buyer_description": buyer_desc,
                        "po_description": desc or buyer_desc,
                        "old_item": buyer_item,
                        "delivery_date": delivery,
                        "sod_qty": qty,
                        "status": f"⚠️ Item 不相同 (舊 {buyer_item} → 新 {item})",
                        "diff_type": "item"
                    })

            else:
                # 改用 Item 比對
                buyer_match_by_item = buyer_related[buyer_related["Item"] == item]

                if not buyer_match_by_item.empty:
                    # ✅ Item 相同但品項不同 → 品名不相同
                    buyer_desc = clean_name(buyer_match_by_item.iloc[0]["品項"])
                    df_buyer.loc[buyer_match_by_item.index, "Delivery Date 廠商承諾交期"] = delivery
                    df_buyer.loc[buyer_match_by_item.index, "SOD Qty 廠商承諾數量"] = qty
                    buyer_id = buyer_id_lookup.get((po_no, item), "")
                    conflict_list.append({
                        "id": buyer_id,
                        "po_no": po_no,
                        "item": item,
                        "buyer_description": buyer_desc,
                        "po_description": desc,
                        "delivery_date": delivery,
                        "sod_qty": qty,
                        "status": "⚠️ 品名不相同",
                        "diff_type": "desc"
                    })
                else:
                    # ❌ 完全沒找到
                    buyer_id = ''
                    conflict_list.append({
                        "id": buyer_id,
                        "po_no": po_no,
                        "item": item,
                        "buyer_description": None,
                        "po_description": desc,
                        "delivery_date": delivery,
                        "sod_qty": qty,
                        "status": "⚠️ Buyer_detail 沒有這筆資料",
                        "diff_type": "missing"
                    })

        # 把這個 po_no 的結果存進總結果
        all_group_results.append({
            "po_no": po_no,
            "matched": matched_list,
            "conflict": conflict_list
        })
    print(all_group_results)
    # ✅ 最後一次性回傳，前端可以依照 po_no 分組顯示
    return jsonify({
        "status": "ok",
        "groups": all_group_results,
        "saved_files": saved_files
    })


from difflib import SequenceMatcher

def is_po_in_record(row_po_str, target_po):
    """檢查 PO 是否在記錄中（支援 <br /> 分隔的多個 PO）"""
    po_list = re.split(r"<br\s*/?>", str(row_po_str))
    po_list = [po.strip() for po in po_list if po.strip()]
    return target_po.strip() in po_list

def fuzzy_in(text, keyword):
    """模糊比對關鍵字是否在文字中"""
    return keyword.strip() in str(text).strip()

@app.route("/api/save_override_all", methods=["POST"])
def save_override_all():
    """
    Version 31 - 品名優先比對邏輯
    改進：優先以品名相似度為主要比對依據，Item 作為次要參考
    優先順序：同 PO 內的品名高度相似 > Item 相同 > 品名中度相似 > 新增
    """
    # 備份
    backup_files()
    data = request.get_json()
    rows = data.get("rows", [])
    confirm_override = data.get("confirm_override", False)  # 是否已確認覆蓋

    if not rows:
        return jsonify({"status": "error", "msg": "❌ 沒有收到任何資料"}), 400

    def clean_text(x):
        """清理文字：移除換行和空白"""
        return str(x).replace("\n", "").replace("\r", "").strip()
    
    def calculate_similarity(text1, text2):
        """計算兩個字串的相似度 (0-100)"""
        text1_clean = clean_text(text1).lower()
        text2_clean = clean_text(text2).lower()
        return SequenceMatcher(None, text1_clean, text2_clean).ratio() * 100
    
    # 處理 pandas int64 轉換問題
    def convert_to_json_serializable(obj):
        """將 pandas 的特殊類型轉換為可序列化的類型"""
        if isinstance(obj, dict):
            return {k: convert_to_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_to_json_serializable(item) for item in obj]
        elif hasattr(obj, 'item'):  # numpy/pandas 數值類型
            return obj.item()
        elif pd.isna(obj):  # NaN 值
            return None
        else:
            return obj

    # 讀取並處理資料
    df_buyer = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str, on_bad_lines="skip").fillna("")
    df_buyer["PO No."] = df_buyer["PO No."].str.strip()
    df_buyer["Item"] = (
        df_buyer["Item"]
        .str.replace(r"\.0$", "", regex=True)
        .str.strip()
        .apply(lambda x: x.zfill(4) if x.isdigit() else x)
    )
    
    # 🔴 重要：建立一個只包含狀態為 V 的資料索引
    df_active = df_buyer[df_buyer["開單狀態"] == "V"].copy()
    print(f"總資料筆數: {len(df_buyer)}, 有效資料(狀態=V): {len(df_active)}")

    updated_count = 0
    inserted_count = 0
    failed = []
    need_confirm_items = []  # 需要確認的項目
    matching_output = []  # 比對結果輸出

    new_item = ''
    epr_no = 0
    po_no_new = ''
    
    # 輸出開始訊息
    print("\n" + "="*80)
    print("開始處理資料比對 (Version 31 - 品名優先)")
    print("="*80)

    for row_num, row in enumerate(rows, 1):
        id_ = row.get("id", "").strip()
        po_no_new = row.get("po_no", "").strip()
        item_new = row.get("item", "").strip()
        
        # 確保 item 格式一致（4位數）
        if item_new.isdigit():
            item_new = item_new.zfill(4)
            
        new_delivery = row.get("delivery_date", "").strip()
        new_qty = row.get("sod_qty", "").strip()
        new_desc = row.get("po_description", "").strip()
        new_desc_clean = clean_text(new_desc)

        target_idx = None
        match_reason = ""
        
        # 輸出當前處理項目
        print(f"\n[第 {row_num} 筆]")
        print(f"  新資料 => PO: {po_no_new}, Item: {item_new}")
        print(f"  品名: {new_desc[:50]}{'...' if len(new_desc) > 50 else ''}")
        
        # 🔍 Version 31 核心改變：先找品名相似度，再考慮 Item
        # 步驟1：先在同 PO 內找資料（只找狀態為 V 的）
        po_group = df_active[df_active["PO No."].apply(lambda x: is_po_in_record(x, po_no_new))]
        
        if not po_group.empty:
            print(f"     在 PO {po_no_new} 找到 {len(po_group)} 筆資料")
            
            # 🔥 Version 31：計算所有項目的品名相似度
            similarity_scores = []
            for idx, row_data in po_group.iterrows():
                existing_desc = row_data["品項"]
                existing_item = row_data["Item"]
                similarity = calculate_similarity(new_desc, existing_desc)
                similarity_scores.append({
                    'index': idx,
                    'item': existing_item,
                    'desc': existing_desc,
                    'similarity': similarity,
                    'item_match': (existing_item == item_new),  # 記錄 Item 是否相同
                    'delivery_date': row_data.get("Delivery Date 廠商承諾交期", "")  # 加入交期資訊
                })
            
            # 🔴 Version 31 改進：處理相同 Item 的多筆資料
            # 如果有多筆完全相同的 Item，選擇交期最新的
            item_matches = [s for s in similarity_scores if s['item_match']]
            if len(item_matches) > 1:
                print(f"     發現 {len(item_matches)} 筆相同的 Item {item_new}")
                
                # 將交期轉換為可比較的格式並排序
                for match in item_matches:
                    try:
                        # 嘗試解析日期（支援 YYYY/MM/DD 格式）
                        date_str = match['delivery_date'].strip()
                        if date_str:
                            # 移除可能的時間部分，只保留日期
                            date_str = date_str.split(' ')[0]
                            # 轉換斜線為破折號以便解析
                            date_str = date_str.replace('/', '-')
                            match['parsed_date'] = date_str
                        else:
                            match['parsed_date'] = '1900-01-01'  # 空日期設為最早
                    except:
                        match['parsed_date'] = '1900-01-01'
                    
                    print(f"       - Index {match['index']}: 交期 {match['delivery_date']}")
                
                # 按日期排序，選擇最新的
                item_matches.sort(key=lambda x: x.get('parsed_date', '1900-01-01'), reverse=True)
                newest_match = item_matches[0]
                print(f"     => 選擇最新交期的資料: Index {newest_match['index']} (交期: {newest_match['delivery_date']})")
                
                # 將最新的資料移到 similarity_scores 的最前面
                similarity_scores = [s for s in similarity_scores if not s['item_match']]
                similarity_scores.insert(0, newest_match)
            else:
                # 排序：先按相似度排序，相似度相同時 Item 相同的優先
                similarity_scores.sort(key=lambda x: (x['similarity'], x['item_match']), reverse=True)
            
            # 輸出相似度排名（除錯用）
            print(f"     品名相似度排名：")
            for i, score in enumerate(similarity_scores[:3], 1):  # 顯示前3名
                item_marker = " [Item相同]" if score['item_match'] else ""
                print(f"       {i}. Item {score['item']}: {score['similarity']:.1f}%{item_marker} - {score['desc'][:30]}...")
            
            # 取得最高相似度的項目
            best_match = similarity_scores[0]
            best_similarity = best_match['similarity']
            best_idx = best_match['index']
            best_item = best_match['item']
            best_desc = best_match['desc']
            
            # 🎯 根據相似度和 Item 是否相同來決定處理方式
            if best_similarity >= 95:  # 品名幾乎完全相同
                target_idx = best_idx
                if best_item == item_new:
                    match_reason = "品名完全相同+Item相同"
                    print(f"  ✅ 品名完全相同且 Item 相同（相似度 {best_similarity:.1f}%） => 直接更新")
                else:
                    match_reason = f"品名完全相同(Item:{best_item}→{item_new})"
                    print(f"  ⚠️ 品名完全相同但 Item 不同（{best_item} → {item_new}）")
                    print(f"     品名相似度: {best_similarity:.1f}%")
                    
                    if not confirm_override:
                        print(f"     需要確認是否要更新 Item")
                        
                        need_confirm_items.append({
                            "row": row_num,
                            "po_no": po_no_new,
                            "new_item": item_new,
                            "new_desc": new_desc,
                            "old_item": best_item,
                            "old_desc": best_desc,
                            "similarity": round(best_similarity, 1),
                            "new_delivery": new_delivery,
                            "new_qty": new_qty,
                            "target_index": int(best_idx),
                            "reason": "品名相同但Item不同",
                            "action_type": "update_item_change"
                        })
                        
                        matching_output.append({
                            "row": row_num,
                            "po": po_no_new,
                            "item": f"{best_item}→{item_new}",
                            "match": match_reason,
                            "action": "待確認",
                            "note": f"品名相同但Item不同"
                        })
                        continue
                    else:
                        print(f"     => 已確認，將更新 Item")
                        
            elif best_similarity >= 80:  # 品名高度相似
                target_idx = best_idx
                if best_item == item_new:
                    match_reason = f"品名高度相似+Item相同({best_similarity:.0f}%)"
                    print(f"  ✅ 品名高度相似且 Item 相同（{best_similarity:.1f}%） => 直接更新")
                else:
                    match_reason = f"品名高度相似(Item:{best_item}→{item_new})"
                    print(f"  ⚠️ 品名高度相似但 Item 不同（{best_item} → {item_new}）")
                    print(f"     品名相似度: {best_similarity:.1f}%")
                    print(f"     原品名: {best_desc[:40]}...")
                    print(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        print(f"     需要確認是否要更新")
                        
                        need_confirm_items.append({
                            "row": row_num,
                            "po_no": po_no_new,
                            "new_item": item_new,
                            "new_desc": new_desc,
                            "old_item": best_item,
                            "old_desc": best_desc,
                            "similarity": round(best_similarity, 1),
                            "new_delivery": new_delivery,
                            "new_qty": new_qty,
                            "target_index": int(best_idx),
                            "reason": "品名高度相似但Item不同",
                            "action_type": "update_high_similarity"
                        })
                        
                        matching_output.append({
                            "row": row_num,
                            "po": po_no_new,
                            "item": f"{best_item}→{item_new}",
                            "match": match_reason,
                            "action": "待確認",
                            "note": f"品名相似{best_similarity:.0f}%"
                        })
                        continue
                    else:
                        print(f"     => 已確認，將更新")
                        
            elif best_similarity >= 60:  # 品名中度相似
                # 檢查是否有 Item 相同的項目
                item_match = next((s for s in similarity_scores if s['item_match']), None)
                
                if item_match and item_match['similarity'] >= 40:
                    # 如果有 Item 相同且相似度不是太低，優先選擇 Item 相同的
                    target_idx = item_match['index']
                    match_reason = f"Item相同+品名相似({item_match['similarity']:.0f}%)"
                    print(f"  ⚠️ 找到 Item 相同的項目，品名相似度 {item_match['similarity']:.1f}%")
                    print(f"     原品名: {item_match['desc'][:40]}...")
                    print(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        print(f"     需要確認是否要更新")
                        
                        need_confirm_items.append({
                            "row": row_num,
                            "po_no": po_no_new,
                            "new_item": item_new,
                            "new_desc": new_desc,
                            "old_item": item_new,
                            "old_desc": item_match['desc'],
                            "similarity": round(item_match['similarity'], 1),
                            "new_delivery": new_delivery,
                            "new_qty": new_qty,
                            "target_index": int(item_match['index']),
                            "reason": "Item相同但品名差異較大",
                            "action_type": "update_medium_similarity"
                        })
                        
                        matching_output.append({
                            "row": row_num,
                            "po": po_no_new,
                            "item": item_new,
                            "match": match_reason,
                            "action": "待確認",
                            "note": f"品名差異{item_match['similarity']:.0f}%"
                        })
                        continue
                    else:
                        print(f"     => 已確認，將更新")
                else:
                    # 品名中度相似，Item 不同
                    target_idx = best_idx
                    match_reason = f"品名中度相似({best_similarity:.0f}%)"
                    print(f"  ⚠️ 品名中度相似，Item 不同（{best_item} → {item_new}）")
                    print(f"     相似度: {best_similarity:.1f}%")
                    print(f"     原品名: {best_desc[:40]}...")
                    print(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        print(f"     需要確認")
                        
                        need_confirm_items.append({
                            "row": row_num,
                            "po_no": po_no_new,
                            "new_item": item_new,
                            "new_desc": new_desc,
                            "old_item": best_item,
                            "old_desc": best_desc,
                            "similarity": round(best_similarity, 1),
                            "new_delivery": new_delivery,
                            "new_qty": new_qty,
                            "target_index": int(best_idx),
                            "reason": "品名中度相似",
                            "action_type": "update_medium_similarity",
                            "warning": True
                        })
                        
                        matching_output.append({
                            "row": row_num,
                            "po": po_no_new,
                            "item": f"{best_item}→{item_new}",
                            "match": match_reason,
                            "action": "待確認",
                            "note": f"品名中度相似"
                        })
                        continue
                    else:
                        print(f"     => 已確認，將更新")
                        
            else:  # 相似度 < 60%
                # 檢查是否有 Item 完全相同的
                item_match = next((s for s in similarity_scores if s['item_match']), None)
                
                if item_match:
                    # Item 相同但品名相似度低
                    print(f"  ⚠️ 找到 Item 相同但品名差異很大（相似度 {item_match['similarity']:.1f}%）")
                    print(f"     原品名: {item_match['desc'][:40]}...")
                    print(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        print(f"     ⚠️⚠️ 品名差異很大！需要確認")
                        
                        need_confirm_items.append({
                            "row": row_num,
                            "po_no": po_no_new,
                            "new_item": item_new,
                            "new_desc": new_desc,
                            "old_item": item_new,
                            "old_desc": item_match['desc'],
                            "similarity": round(item_match['similarity'], 1),
                            "new_delivery": new_delivery,
                            "new_qty": new_qty,
                            "target_index": int(item_match['index']),
                            "reason": "Item相同但品名完全不同",
                            "action_type": "update_low_similarity",
                            "warning": True,
                            "critical": True
                        })
                        
                        matching_output.append({
                            "row": row_num,
                            "po": po_no_new,
                            "item": item_new,
                            "match": f"Item相同(相似度{item_match['similarity']:.0f}%)",
                            "action": "待確認",
                            "note": f"❌品名差異極大"
                        })
                        continue
                    else:
                        target_idx = item_match['index']
                        match_reason = f"Item相同(品名差異大)"
                        print(f"     => 已確認，將強制更新")
                else:
                    # 沒有任何匹配，建議新增
                    target_idx = None
        
        # 步驟2：如果在同 PO 內找不到匹配，詢問是否新增
        if target_idx is None and not po_group.empty:
            print(f"  ⚠️  在 PO {po_no_new} 內找不到相似的品名或相同的 Item")
            print(f"     新Item: {item_new}, 新品名: {new_desc[:40]}...")
            
            if not confirm_override:
                print(f"     需要確認是否要新增為新項目")
                
                # 列出現有的項目供參考
                existing_items = []
                for score in similarity_scores[:5]:  # 顯示前5個相似度最高的
                    existing_items.append({
                        "item": score['item'],
                        "desc": score['desc'][:50],
                        "similarity": round(score['similarity'], 1)
                    })
                
                need_confirm_items.append({
                    "row": row_num,
                    "po_no": po_no_new,
                    "new_item": item_new,
                    "new_desc": new_desc,
                    "existing_items": existing_items,
                    "new_delivery": new_delivery,
                    "new_qty": new_qty,
                    "reason": "無相似項目",
                    "action_type": "add_new"
                })
                
                matching_output.append({
                    "row": row_num,
                    "po": po_no_new,
                    "item": item_new,
                    "match": "無匹配",
                    "action": "待確認",
                    "note": "建議新增"
                })
                continue
            else:
                print(f"     => 已確認，將新增為新項目")
        
        # 步驟3：其他比對方式（ID、模糊比對等）- 只找狀態為 V 的
        if target_idx is None and id_:
            candidates = df_active[df_active["Id"] == id_].copy()
            
            if len(candidates) > 1:
                candidates["品項_clean"] = candidates["品項"].apply(clean_text)
                exact_match = candidates[candidates["品項_clean"] == new_desc_clean]
                if len(exact_match) == 1:
                    target_idx = exact_match.index[0]
                    match_reason = "ID+品項匹配"
                    print(f"  ✅ ID+品項匹配 => 更新資料 (狀態=V)")
            elif len(candidates) == 1:
                target_idx = candidates.index[0]
                match_reason = "ID匹配"
                print(f"  ✅ ID匹配 => 更新資料 (狀態=V)")

        # 步驟4：PO + 品項模糊比對 - 只找狀態為 V 的
        if target_idx is None:
            po_match = df_active[df_active["PO No."].apply(lambda x: is_po_in_record(x, po_no_new))]
            po_match = po_match[po_match["品項"].apply(lambda x: fuzzy_in(x, new_desc_clean))]

            if not po_match.empty:
                target_idx = po_match.index[0]
                match_reason = "PO+品項模糊匹配"
                print(f"  ✅ PO+品項模糊匹配 => 更新資料 (狀態=V)")

        # 📝 如果找到匹配項目，執行更新
        if target_idx is not None:
            # 記錄原始值（用於輸出）
            old_values = {
                "po": df_buyer.at[target_idx, "PO No."],
                "item": df_buyer.at[target_idx, "Item"],
                "delivery": df_buyer.at[target_idx, "Delivery Date 廠商承諾交期"],
                "qty": df_buyer.at[target_idx, "SOD Qty 廠商承諾數量"],
                "desc": df_buyer.at[target_idx, "品項"]
            }
            
            # 執行更新
            df_buyer.at[target_idx, "PO No."] = po_no_new
            df_buyer.at[target_idx, "Item"] = item_new
            df_buyer.at[target_idx, "Delivery Date 廠商承諾交期"] = new_delivery
            df_buyer.at[target_idx, "SOD Qty 廠商承諾數量"] = new_qty
            if new_desc:
                df_buyer.at[target_idx, "品項"] = new_desc
            updated_count += 1
            
            # 輸出變更詳情
            if old_values["po"] != po_no_new:
                print(f"     PO變更: {old_values['po']} → {po_no_new}")
            if old_values["item"] != item_new:
                print(f"     Item變更: {old_values['item']} → {item_new}")
            if old_values["delivery"] != new_delivery:
                print(f"     交期變更: {old_values['delivery']} → {new_delivery}")
            if old_values["qty"] != new_qty:
                print(f"     數量變更: {old_values['qty']} → {new_qty}")
            
            matching_output.append({
                "row": row_num,
                "po": po_no_new,
                "item": item_new if old_values["item"] == item_new else f"{old_values['item']}→{item_new}",
                "match": match_reason,
                "action": "已更新",
                "note": "品名已變更" if old_values["desc"] != new_desc else ""
            })
            continue

        # 🆕 如果都找不到 → 新增資料（但要檢查 PO 是否存在於狀態 V 的資料中）
        po_matches = df_active[df_active["PO No."].apply(lambda x: is_po_in_record(x, po_no_new))]
        if po_matches.empty:
            # 再檢查是否有狀態為 X 的相同 PO
            po_cancelled = df_buyer[
                (df_buyer["開單狀態"] == "X") & 
                (df_buyer["PO No."].apply(lambda x: is_po_in_record(x, po_no_new)))
            ]
            
            if not po_cancelled.empty:
                print(f"  ⚠️  找到 PO {po_no_new} 但狀態為 X（已取消），無法更新")
                failed.append({
                    "row": row_num,
                    "po_no": po_no_new,
                    "item": item_new,
                    "reason": f"PO {po_no_new} 狀態為 X（已取消）"
                })
                
                matching_output.append({
                    "row": row_num,
                    "po": po_no_new,
                    "item": item_new,
                    "match": "PO已取消",
                    "action": "失敗",
                    "note": "狀態為X"
                })
                continue
            else:
                # 🔴 Version 31：PO 完全不存在的情況
                print(f"  ❌ 360表單無此項目：PO {po_no_new}")
                
                failed.append({
                    "row": row_num,
                    "po_no": po_no_new,
                    "item": item_new,
                    "reason": "360表單無此項目"
                })
                
                matching_output.append({
                    "row": row_num,
                    "po": po_no_new,
                    "item": item_new,
                    "match": "無PO",
                    "action": "失敗",
                    "note": "360表單無此項目"
                })
                continue
        
        # 🆔 推測 Id（取首筆）
        possible_ids = po_matches["Id"].dropna().unique().tolist()
        id_ = possible_ids[0] if possible_ids else row.get("id") or row.get("Id", "")
        id_ = str(id_).strip()

        # 👤 取同組第一筆的資訊
        user = po_matches["User"].iloc[0] if not po_matches.empty else ""
        epr_no = po_matches["ePR No."].iloc[0] if not po_matches.empty else ""
        wbs_no = po_matches["WBS"].iloc[0] if not po_matches.empty else ""
        need_day_no = po_matches["需求日"].iloc[0] if not po_matches.empty else ""

        print(f"  🆕 找不到匹配項目 => 新增資料")
        print(f"     新增到 ePR No.: {epr_no}")

        # ➕ 新增新的一筆資料
        new_row = {
            "Id": id_,
            "開單狀態": "V",
            "交貨驗證": "",
            "User": user,
            "ePR No.": epr_no,
            "PO No.": po_no_new,
            "Item": item_new,
            "品項": new_desc,
            "規格": "",
            "數量": new_qty,
            "總數": new_qty,
            "單價": "",
            "總價": "",
            "備註": "",
            "字數": "",
            "isEditing": "False",
            "backup": "{}",
            "_alertedItemLimit": "",
            "Delivery Date 廠商承諾交期": new_delivery,
            "SOD Qty 廠商承諾數量": new_qty,
            "驗收數量": "",
            "拒收數量": "",
            "發票月份": "",
            "WBS": wbs_no,
            "需求日": need_day_no,
            "RT金額": '',
            "RT總金額": '',
            "驗收狀態": "X" 
        }

        # 📌 找這個 id 的最後一筆位置
        same_id_idx = df_buyer[df_buyer["Id"] == id_].index
        insert_pos = same_id_idx[-1] + 1 if len(same_id_idx) > 0 else len(df_buyer)

        # ✨ 插入到原 df_buyer 中指定位置
        df_buyer = pd.concat([
            df_buyer.iloc[:insert_pos],
            pd.DataFrame([new_row]),
            df_buyer.iloc[insert_pos:]
        ], ignore_index=True)
        
        new_item = '新增物件'
        inserted_count += 1
        
        matching_output.append({
            "row": row_num,
            "po": po_no_new,
            "item": item_new,
            "match": "無匹配",
            "action": "已新增",
            "note": f"ePR:{epr_no}"
        })

    # 輸出比對結果摘要
    print("\n" + "="*80)
    print("比對結果摘要 (Version 31 - 品名優先)")
    print("="*80)
    print(f"總處理筆數: {len(rows)}")
    print(f"更新筆數: {updated_count}")
    print(f"新增筆數: {inserted_count}")
    print(f"失敗筆數: {len(failed)}")
    print(f"待確認筆數: {len(need_confirm_items)}")
    
    # 輸出詳細比對表格
    if matching_output:
        print("\n詳細比對結果:")
        print("-"*80)
        print(f"{'筆數':<5} {'PO No.':<15} {'Item':<10} {'比對方式':<20} {'處理':<8} {'備註'}")
        print("-"*80)
        for item in matching_output:
            print(f"{item['row']:<5} {item['po']:<15} {item['item']:<10} {item['match']:<20} {item['action']:<8} {item['note']}")
    
    print("="*80 + "\n")

    # 如果有需要確認的項目，回傳給前端
    if need_confirm_items and not confirm_override:
        # 檢查是否有關鍵確認項（品名完全不同）
        critical_items = [item for item in need_confirm_items if item.get("critical", False)]
        warning_items = [item for item in need_confirm_items if item.get("warning", False)]
        
        # 根據不同的確認原因和動作類型，產生不同的訊息
        action_types = set(item.get("action_type", "") for item in need_confirm_items)
        
        if critical_items:
            msg = f"⚠️ 發現 {len(critical_items)} 個品名完全不同的項目需要特別確認"
        elif "update_low_similarity" in action_types:
            msg = f"❌ 發現 {len(need_confirm_items)} 個品名相似度極低的項目需要確認"
        elif "update_item_change" in action_types:
            msg = f"發現 {len(need_confirm_items)} 個品名相同但Item不同的項目需要確認"
        elif "add_new" in action_types:
            msg = f"發現 {len(need_confirm_items)} 個項目可能需要新增"
        else:
            msg = f"發現 {len(need_confirm_items)} 個需要確認的項目"
        
        return jsonify(convert_to_json_serializable({
            "status": "confirm_needed",
            "msg": msg,
            "items": need_confirm_items,
            "updated": updated_count,
            "inserted": inserted_count,
            "matching_output": matching_output,
            "has_critical": len(critical_items) > 0,
            "has_warning": len(warning_items) > 0
        }))

    # 儲存回檔案
    df_buyer.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")
    
    # 刪除暫存檔案
    if po_no_new:
        temp_file = f"uploads/{po_no_new}.csv"
        if os.path.exists(temp_file):
            os.remove(temp_file)
    
    # 🔴 檢查是否所有項目都失敗且原因都是「360表單無此項目」
    if failed and len(failed) == len(rows):
        all_not_found = all(f.get("reason") == "360表單無此項目" for f in failed)
        if all_not_found:
            return jsonify(convert_to_json_serializable({
                "status": "not_found",
                "msg": "❌ 360表單無此項目",
                "failed": failed,
                "matching_output": matching_output
            }))
    
    # 回傳結果
    if new_item == '新增物件':
        return jsonify(convert_to_json_serializable({
            "status": "ok",
            "msg": f"有新增的物件(item)需要維護，ePR No. 單號為 {epr_no}。更新 {updated_count} 筆，新增 {inserted_count} 筆",
            "failed": failed,
            "matching_output": matching_output
        }))
    else:
        return jsonify(convert_to_json_serializable({
            "status": "ok",
            "msg": f"✅ 更新 {updated_count} 筆，新增 {inserted_count} 筆",
            "failed": failed,
            "matching_output": matching_output
        }))
    
    

# eRT 驗收表單
# === 設定 logger ，針對 eRT 驗收表單===
log_file_path = "buyer_detail_update_log.log"
logging.basicConfig(
    filename=log_file_path,
    filemode='a',
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    encoding='utf-8'
)
logger = logging.getLogger("BuyerDetailUpdater")


@app.route("/api/update_delivery_receipt", methods=["POST"])
def upload_buyer_detail():
    # 備份
    backup_files()
    file = request.files.get('file')
    if not file or not file.filename:
        print("❌ 沒有收到檔案")
        return jsonify({"status": "fail", "message": "No file uploaded"}), 400

    filename = file.filename
    ext = os.path.splitext(filename)[-1].lower()
    print(f"📁 收到檔案：{filename}（副檔名：{ext}）")

    if ext not in ['.xlsx', '.xls']:
        return jsonify({"status": "fail", "message": "Invalid file type"}), 400

    try:
        engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
        df = pd.read_excel(file, engine=engine)  # 這行最容易報錯
        df.to_csv("static/data/delivery_receipt.csv", index=False, encoding="utf-8-sig")
        print("💾 已儲存為 static/data/delivery_receipt.csv，開始進行對 Buyer detail 該表數據更新")


        output_df = pd.read_csv("static/data/delivery_receipt.csv", encoding="utf-8-sig", dtype=str)
        buyer_df = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str)

        # === 欄位標準化 ===
        output_df.columns = output_df.columns.str.replace("\ufeff", "").str.strip()
        buyer_df.columns = buyer_df.columns.str.strip()


        # === 確認並處理必要的欄位 ===
        required_buyer_cols = ["PO No.", "品項", "驗收數量", "拒收數量", "發票月份"]
        required_output_cols = ["PONO", "品名", "驗收數量", "拒收數量", "收料日期"]

        # 檢查 buyer_df 是否有必要的欄位
        if not all(col in buyer_df.columns for col in required_buyer_cols):
            missing_cols = [col for col in required_buyer_cols if col not in buyer_df.columns]
            print(f"錯誤: {BUYER_FILE} 缺少必要的欄位: {', '.join(missing_cols)}")
            logger.error(f"{BUYER_FILE} 缺少必要的欄位: {', '.join(missing_cols)}")
            exit()

        # 檢查 output_df 是否有必要的欄位
        if not all(col in output_df.columns for col in required_output_cols):
            missing_cols = [col for col in required_output_cols if col not in output_df.columns]
            print(f"錯誤: delivery_receipt.csv 缺少必要的欄位: {', '.join(missing_cols)}")
            logger.error(f"delivery_receipt.csv 缺少必要的欄位: {', '.join(missing_cols)}")
            exit()

        # === 資料清理與預處理 ===
        # 清理 output_df 的 PONO 和 品名
        output_df["PONO_clean"] = output_df["PONO"].astype(str).str.strip().str.upper()
        output_df["品名_clean"] = output_df["品名"].astype(str).str.strip()

        # 根據你的要求，直接複製收料日期到新的發票月份欄位，不進行任何格式更改。
        output_df["發票月份_from_output"] = output_df["收料日期"].astype(str).str.strip()

        output_df.rename(columns={
            "驗收數量": "驗收數量_from_output",
            "拒收數量": "拒收數量_from_output"
        }, inplace=True)

        # 清理 buyer_df 的 PO No. 和 品項
        buyer_df["PO_clean"] = buyer_df["PO No."].astype(str).str.strip().str.upper()
        buyer_df["品項_clean"] = buyer_df["品項"].astype(str).str.strip()

        # 選擇 output_df 需要的欄位進行合併
        output_cols_to_merge = [
            "PONO_clean",
            "品名_clean",
            "驗收數量_from_output",
            "拒收數量_from_output",
            "發票月份_from_output"
        ]
        output_subset = output_df[output_cols_to_merge].copy()

        # === 合併資料 ===
        merged = pd.merge(
            buyer_df,
            output_subset,
            how='left',
            left_on=["PO_clean", "品項_clean"],
            right_on=["PONO_clean", "品名_clean"],
            suffixes=("", "_from_output")
        )

        # === 更新欄位 ===
        columns_to_update = {
            "驗收數量": "驗收數量_from_output",
            "拒收數量": "拒收數量_from_output",
            "發票月份": "發票月份_from_output"
        }

        update_count = 0
        for idx, row in merged.iterrows():
            updated = False
            log_info = {}
            
            po = row.get("PO No.", "N/A")
            item = row.get("Item", "N/A") # 使用 'Item' 欄位
            
            # 這裡確保 '品項' 欄位有值，否則以 'Item' 替代
            item_for_log = row.get("品項", "N/A")
            if item_for_log == 'N/A' or pd.isna(item_for_log):
                item_for_log = item

            for target_col, source_col in columns_to_update.items():
                new_val = row.get(source_col, "")
                old_val = row.get(target_col, "")

                if pd.isna(new_val): new_val = ""
                if pd.isna(old_val): old_val = ""

                clean_new_val = str(new_val).strip()
                clean_old_val = str(old_val).strip()

                if clean_new_val != "" and clean_new_val != clean_old_val:
                    merged.at[idx, target_col] = clean_new_val
                    updated = True
                    log_info[target_col] = {"old": old_val, "new": clean_new_val}

            if updated:
                update_count += 1
                # 使用你要求的日誌格式
                logger.info(
                    f"{{'{po}'}} 更改 -> item: {item_for_log}, "
                    f"驗收數量: {log_info.get('驗收數量', {}).get('new', row.get('驗收數量', ''))}, "
                    f"拒收數量: {log_info.get('拒收數量', {}).get('new', row.get('拒收數量', ''))}, "
                    f"發票月份: {log_info.get('發票月份', {}).get('new', row.get('發票月份', ''))}"
                )

        # === 移除中繼欄位 ===
        merged.drop(columns=[c for c in merged.columns if c.endswith("_clean") or c.endswith("_from_output")], inplace=True)

        # === 最終輸出欄位清單 ===
        final_columns = ['Id', '開單狀態', '交貨驗證', 'User', 'ePR No.', 'PO No.', 'Item', '品項', '規格', '數量', '總數', '單價', '總價', '備註', '字數', 'isEditing', 'backup', '_alertedItemLimit', 
                         'Delivery Date 廠商承諾交期', 'SOD Qty 廠商承諾數量', '驗收數量', '拒收數量', '發票月份', "WBS", "需求日", "RT金額", "RT總金額", "驗收狀態"]

        # 確保只保留需要的欄位
        final_df = merged[final_columns].copy()

        # === 儲存更新後的檔案 ===
        final_df.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")

        print(f"總共更新了 {update_count} 筆資料。")
        print(f"檔案已更新。總共更新了 {update_count} 筆資料。")
        os.remove("static/data/delivery_receipt.csv")

        return jsonify({"status": "success", "msg": f"檔案已更新。總共更新了 {update_count} 筆資料。"})
    except Exception as e:
        traceback.print_exc()  # 印出完整錯誤堆疊
        return jsonify({"status": "error", "message": str(e)}), 500
    

@app.route("/api/buyer_detail", methods=["GET"])
def get_buyer_details():
    """
    讀取 Buyer_detail.csv 檔案並以 JSON 格式回傳。
    """
    # 檢查檔案是否存在
    if not os.path.exists(BUYER_FILE):
        print(f"錯誤：找不到檔案 {BUYER_FILE}")
        return jsonify({"error": f"找不到檔案 {BUYER_FILE}"}), 500
        
    try:
        # 使用 pandas 讀取 CSV 檔案
        df = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str)
        
        # 確保欄位名稱沒有多餘的空白
        df.columns = df.columns.str.strip()

        # === 修正：將 DataFrame 中的 NaN 值替換為 None ===
        # 讀取 CSV 時 dtype=str 會將 NaN 讀成字串 'nan'。
        df = df.replace({np.nan: None, 'nan': None})
        
        # 將 DataFrame 轉換成 JSON 格式的列表
        data_json = df.to_dict('records')
        
        return jsonify(data_json)
    except Exception as e:
        print(f"處理檔案時發生錯誤: {e}")
        return jsonify({"error": f"處理檔案時發生錯誤: {e}"}), 500

# # 在 app.py 中新增以下 API 端點

# ACCOUNTING_SUMMARY_FILE = "static/data/accounting_summary.json"
# MONTHLY_ACTUAL_ACCOUNTING_FILE = "static/data/monthly_actual_accounting.json"

# @app.route('/api/accounting-summary', methods=['GET'])
# def get_accounting_summary():
#     """
#     獲取尚未入帳的月份選項和金額
#     """
#     try:
#         if os.path.exists(ACCOUNTING_SUMMARY_FILE):
#             with open(ACCOUNTING_SUMMARY_FILE, 'r', encoding='utf-8') as f:
#                 data = json.load(f)
#             return jsonify(data)
#         else:
#             return jsonify({})
#     except Exception as e:
#         print(f"❌ 讀取 accounting_summary.json 錯誤: {e}")
#         return jsonify({'error': str(e)}), 500

# @app.route('/api/monthly-actual-accounting', methods=['GET'])
# def get_monthly_actual_accounting():
#     """
#     獲取每月實際入帳金額
#     """
#     try:
#         if os.path.exists(MONTHLY_ACTUAL_ACCOUNTING_FILE):
#             with open(MONTHLY_ACTUAL_ACCOUNTING_FILE, 'r', encoding='utf-8') as f:
#                 data = json.load(f)
#             return jsonify(data)
#         else:
#             return jsonify({})
#     except Exception as e:
#         print(f"❌ 讀取 monthly_actual_accounting.json 錯誤: {e}")
#         return jsonify({'error': str(e)}), 500






# 物料收貨單
from datetime import datetime
import hashlib
from bs4 import BeautifulSoup
import email
from email import policy
from email.parser import BytesParser
import logging
# 設定日誌
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Buyer CSV 路徑設定（與 app.py 同層級）
BUYER_CSV_PATH = 'static/data/Buyer_detail_updated.csv'

# 設定
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB 檔案大小限制
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['PROCESSED_FOLDER'] = 'processed'
app.config['ALLOWED_EXTENSIONS'] = {'mhtml'}  

# 確保資料夾存在
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PROCESSED_FOLDER'], exist_ok=True)

def allowed_file(filename):
    """檢查檔案是否為允許的格式"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def generate_unique_filename(original_name, new_name):
    """生成唯一的檔名"""
    # 取得副檔名
    ext = original_name.rsplit('.', 1)[1].lower()
    
    # 如果新檔名沒有副檔名，加上原始副檔名
    if not new_name.endswith(f'.{ext}'):
        new_name = f"{new_name}.{ext}"
    
    # 生成唯一識別碼
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    unique_id = hashlib.md5(f"{new_name}{timestamp}".encode()).hexdigest()[:8]
    
    # 組合最終檔名
    name_without_ext = new_name.rsplit('.', 1)[0]
    final_name = f"{name_without_ext}_{unique_id}.{ext}"
    
    return secure_filename(final_name)

# 匯入 MHTML 解析器類別
from Mhtml_parser.mhtml_parser import MHTMLParser

@app.route('/api/upload-mhtml', methods=['POST'])
def upload_mhtml():
    """處理 MHTML 檔案上傳並自動與 Buyer CSV 比對"""
    try:
        # 檢查是否有檔案
        if 'file' not in request.files:
            logger.error("No file in request")
            return jsonify({'success': False, 'error': '沒有檔案被上傳'}), 400
        
        file = request.files['file']
        new_name = request.form.get('newName', '')
        
        # 檢查檔案是否為空
        if file.filename == '':
            logger.error("Empty filename")
            return jsonify({'success': False, 'error': '沒有選擇檔案'}), 400
        
        # 檢查檔案格式
        if not allowed_file(file.filename):
            logger.error(f"Invalid file type: {file.filename}")
            return jsonify({'success': False, 'error': '不支援的檔案格式'}), 400
        
        # 生成新的唯一檔名
        if new_name:
            filename = generate_unique_filename(file.filename, new_name)
        else:
            filename = generate_unique_filename(file.filename, file.filename)
        
        logger.info(f"Processing file: {filename}")
        
        # 儲存檔案到上傳資料夾
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(upload_path)
        
        # 移動並重新命名檔案到處理資料夾
        processed_path = os.path.join(app.config['PROCESSED_FOLDER'], filename)
        
        # 如果目標檔案已存在，先刪除
        if os.path.exists(processed_path):
            os.remove(processed_path)
        
        os.rename(upload_path, processed_path)
        
        # 解析 MHTML 檔案
        parser = MHTMLParser(processed_path)
        extracted_info = parser.parse()
        
        # 檢查是否有解析錯誤
        if 'error' in extracted_info:
            logger.error(f"Parser error: {extracted_info['error']}")
            # 即使有錯誤，還是返回部分資訊
        
        # 加入檔案資訊
        file_stats = os.stat(processed_path)
        extracted_info.update({
            'original_filename': file.filename,
            'saved_filename': filename,
            'file_size': file_stats.st_size,
            'upload_time': datetime.now().isoformat(),
            'file_path': processed_path
        })
        
        # 格式化檔案大小
        size = file_stats.st_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                extracted_info['file_size_formatted'] = f"{size:.2f} {unit}"
                break
            size /= 1024.0
        
        # 如果有 GridView 資料，另外儲存為 JSON
        if 'gridview_data' in extracted_info and extracted_info['gridview_data']:
            json_filename = filename.rsplit('.', 1)[0] + '_gridview.json'
            json_path = os.path.join(app.config['PROCESSED_FOLDER'], json_filename)
            
            try:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(extracted_info['gridview_data'], f, ensure_ascii=False, indent=2)
                
                extracted_info['gridview_json_file'] = json_filename
                logger.info(f"GridView data saved to: {json_filename}")
                
                # 自動與 Buyer_detail.csv 比對
                if os.path.exists(BUYER_CSV_PATH):
                    logger.info("開始與 Buyer_detail.csv 比對...")
                    comparison_result = compare_with_buyer_csv(extracted_info['gridview_data'])
                    extracted_info['comparison_result'] = comparison_result
                else:
                    logger.warning(f"找不到 {BUYER_CSV_PATH}")
                    extracted_info['comparison_result'] = {
                        'error': f'找不到 {BUYER_CSV_PATH} 檔案',
                        'needs_buyer_csv': True
                    }
                    
            except Exception as e:
                logger.error(f"Failed to save GridView JSON or compare: {str(e)}")
        
        return jsonify({
            'success': True,
            'message': '檔案上傳並解析成功',
            'data': extracted_info
        })
        
    except Exception as e:
        logger.error(f"上傳錯誤: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'處理檔案時發生錯誤: {str(e)}'
        }), 500

def compare_with_buyer_csv(gridview_data):
    """與 Buyer CSV 比對 PO No. 和品名"""
    try:
        # 讀取 Buyer CSV（嘗試不同編碼）
        try:
            buyer_df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8-sig')
        except:
            try:
                buyer_df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8')
            except:
                buyer_df = pd.read_csv(BUYER_CSV_PATH, encoding='big5')
        
        logger.info(f"Buyer CSV columns: {list(buyer_df.columns)}")
        logger.info(f"Buyer CSV shape: {buyer_df.shape}")
        
        # 解析 GridView 資料
        headers = gridview_data.get('headers', [])
        rows = gridview_data.get('rows', [])
        
        logger.info(f"GridView headers: {headers}")
        logger.info(f"GridView rows count: {len(rows)}")
        
        # 找出關鍵欄位的索引
        po_index = -1
        desc_index = -1
        qty_index = -1
        accept_qty_index = -1
        amount_index = -1
        
        for i, header in enumerate(headers):
            header_text = header.get('en', '').lower() or header.get('zh', '').lower() or header.get('full', '').lower()
            # PO No. 欄位（避免匹配到 Demo PO號）
            if ('po' in header_text and 'no' in header_text) or 'po號碼' in header_text:
                if 'demo' not in header_text.lower():  # 排除 Demo PO號
                    po_index = i
                    logger.info(f"Found PO index at {i}: {header}")
            elif 'description' in header_text or '品名' in header_text:
                desc_index = i
                logger.info(f"Found Description index at {i}: {header}")
            elif 'accept' in header_text and 'qty' in header_text or '驗收數量' in header_text:
                accept_qty_index = i
            elif 'qty' in header_text or '數量' in header_text or '收貨數量' in header_text:
                if accept_qty_index == -1:
                    qty_index = i
            elif 'amount' in header_text or '總金額' in header_text:
                amount_index = i
        
        # 先提取所有 PO 號碼，檢查是否有多個不同的 PO
        po_numbers = []
        for row_idx, row in enumerate(rows):
            raw_data = row.get('raw_data', [])
            
            if po_index >= 0 and po_index < len(raw_data):
                po_no = str(raw_data[po_index].get('value', '')).strip()
                logger.info(f"Row {row_idx} - Extracted PO: '{po_no}'")
                if po_no:  # 只記錄非空的 PO 號碼
                    po_numbers.append(po_no)
            else:
                logger.warning(f"Row {row_idx} - PO index {po_index} out of range")
        
        # 檢查 PO 號碼的唯一性
        unique_pos = list(set(po_numbers))
        logger.info(f"發現的唯一 PO 號碼: {unique_pos}")
        
        if len(unique_pos) > 1:
            # 有多個不同的 PO 號碼，計算每個 PO 的出現次數
            po_counts = {}
            for po in po_numbers:
                po_counts[po] = po_counts.get(po, 0) + 1
            
            # 按出現次數排序，找出最多的 PO
            sorted_pos = sorted(po_counts.items(), key=lambda x: x[1], reverse=True)
            most_common_po = sorted_pos[0][0]
            most_common_count = sorted_pos[0][1]
            
            logger.warning(f"發現多個不同的 PO 號碼: {po_counts}")
            logger.warning(f"最常出現的 PO: {most_common_po} (出現 {most_common_count} 次)")
            
            # 判斷是否應該報錯 - 如果沒有明顯的多數，就報錯
            total_count = len(po_numbers)
            majority_threshold = total_count / 2
            
            if most_common_count <= majority_threshold:
                # 沒有明顯多數，報錯
                error_msg = f"發現多個不同的 PO 號碼，無法確定正確的 PO: {dict(po_counts)}"
                logger.error(error_msg)
                return {
                    'error': error_msg,
                    'error_type': 'multiple_po_no_majority',
                    'po_counts': po_counts,
                    'items': [],
                    'summary': {}
                }
            else:
                # 有明顯多數，發出警告但繼續處理
                logger.warning(f"使用多數決 PO 號碼: {most_common_po}")
        
        # 建立比對結果
        comparison_items = []
        total_amount = 0
        
        # 列出第一筆資料的原始內容以除錯
        if len(rows) > 0:
            first_row = rows[0].get('raw_data', [])
            logger.info(f"First row raw data length: {len(first_row)}")
            for i, cell in enumerate(first_row[:10]):  # 只列前10個欄位
                logger.info(f"Cell {i}: {cell.get('value', 'NO VALUE')}")
        
        for row_idx, row in enumerate(rows):
            item = {}
            raw_data = row.get('raw_data', [])
            
            # 提取資料
            if po_index >= 0 and po_index < len(raw_data):
                item['po_no'] = str(raw_data[po_index].get('value', '')).strip()
                logger.info(f"Row {row_idx} - Extracted PO from index {po_index}: '{item['po_no']}'")
            else:
                logger.warning(f"Row {row_idx} - PO index {po_index} out of range (row has {len(raw_data)} cells)")
                
            if desc_index >= 0 and desc_index < len(raw_data):
                item['description'] = str(raw_data[desc_index].get('value', '')).strip()
                logger.info(f"Row {row_idx} - Extracted Description from index {desc_index}: '{item['description']}'")
                
            if qty_index >= 0 and qty_index < len(raw_data):
                item['qty'] = raw_data[qty_index].get('value', '')
                
            if accept_qty_index >= 0 and accept_qty_index < len(raw_data):
                item['accept_qty'] = raw_data[accept_qty_index].get('value', '')
            elif qty_index >= 0:
                item['accept_qty'] = item.get('qty', '0')
                
            if amount_index >= 0 and amount_index < len(raw_data):
                item['amount'] = raw_data[amount_index].get('value', '')
            
            # 計算 RT 金額和 RT 總金額
            try:
                amount_str = str(item.get('amount', '0'))
                amount_str = amount_str.replace(',', '').replace('$', '').replace('TWD', '').strip()
                amount_value = float(amount_str) if amount_str and amount_str != '-' else 0
                
                accept_qty_str = str(item.get('accept_qty', '0'))
                accept_qty_str = accept_qty_str.replace(',', '').strip()
                accept_qty_value = float(accept_qty_str) if accept_qty_str and accept_qty_str != '0' and accept_qty_str != '-' else 1
                
                item['rt_amount'] = amount_value / accept_qty_value if accept_qty_value > 0 else 0
                item['rt_total_amount'] = amount_value
                
                total_amount += amount_value
            except Exception as e:
                logger.error(f"計算 RT 金額錯誤: {str(e)}")
                item['rt_amount'] = 0
                item['rt_total_amount'] = 0
            
            # 在 Buyer CSV 中尋找匹配
            matched_in_buyer = False
            buyer_row_index = -1
            
            if item.get('po_no'):
                # 在 Buyer CSV 的 PO No. 欄位中尋找
                for idx, buyer_row in buyer_df.iterrows():
                    buyer_po = str(buyer_row.get('PO No.', '')).strip()
                    
                    if buyer_po == item['po_no']:
                        matched_in_buyer = True
                        buyer_row_index = idx
                        logger.info(f"✓ Matched PO {item['po_no']} at Buyer CSV row {idx}")
                        logger.debug(f"所有欄位: {buyer_row.to_dict()}")
                        # 檢查品名是否也匹配
                        col_item = next((col for col in buyer_row.index if col.strip().replace(' ', '') in ['Item']), 'Item')
                        col_desc = next((col for col in buyer_row.index if col.strip().replace(' ', '') in ['品項', '品名']), '品項')

                        buyer_item = str(buyer_row.get(col_item, '')).strip()
                        buyer_desc = str(buyer_row.get(col_desc, '')).strip()
                        
                        if item.get('description'):
                            if buyer_item != item['description'] and buyer_desc != item['description']:
                                logger.warning(f"PO matched but description different: Buyer='{buyer_item}' or '{buyer_desc}', GridView='{item['description']}'")
                        break
                
                if not matched_in_buyer:
                    logger.warning(f"✗ PO {item['po_no']} not found in Buyer CSV")
            else:
                logger.warning(f"Row {row_idx} has no PO number")
            
            item['matched_in_buyer'] = matched_in_buyer
            item['buyer_row_index'] = buyer_row_index
            comparison_items.append(item)
        
        # 統計結果
        matched_count = sum(1 for item in comparison_items if item['matched_in_buyer'])
        unmatched_count = len(comparison_items) - matched_count
        
        logger.info(f"比對結果: 總項目={len(comparison_items)}, 匹配={matched_count}, 未匹配={unmatched_count}")
        
        return {
            'items': comparison_items,
            'summary': {
                'total_items': len(comparison_items),
                'matched_count': matched_count,
                'unmatched_count': unmatched_count,
                'total_amount': total_amount,
                'buyer_csv_rows': len(buyer_df),
                'buyer_csv_columns': list(buyer_df.columns)
            }
        }
        
    except Exception as e:
        logger.error(f"比對錯誤: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            'error': str(e),
            'items': [],
            'summary': {}
        }



# 在 app.py 中新增以下路由和功能

import shutil

@app.route('/api/cleanup-processed', methods=['POST'])
def cleanup_processed():
    """清理 processed 資料夾中的所有文件"""
    try:
        processed_folder = app.config['PROCESSED_FOLDER']
        upload_folder = app.config['UPLOAD_FOLDER']
        
        total_files_removed = 0
        
        # 清理 processed 資料夾
        if os.path.exists(processed_folder):
            files_before = os.listdir(processed_folder)
            if files_before:
                for filename in files_before:
                    file_path = os.path.join(processed_folder, filename)
                    try:
                        if os.path.isfile(file_path) or os.path.islink(file_path):
                            os.unlink(file_path)
                            total_files_removed += 1
                            logger.info(f"已刪除 processed 文件: {filename}")
                        elif os.path.isdir(file_path):
                            shutil.rmtree(file_path)
                            total_files_removed += 1
                            logger.info(f"已刪除 processed 目錄: {filename}")
                    except Exception as e:
                        logger.error(f"無法刪除 processed 文件 {file_path}: {str(e)}")
        
        # 同時清理 upload 資料夾（預防措施）
        if os.path.exists(upload_folder):
            upload_files = os.listdir(upload_folder)
            if upload_files:
                for filename in upload_files:
                    file_path = os.path.join(upload_folder, filename)
                    try:
                        if os.path.isfile(file_path) or os.path.islink(file_path):
                            os.unlink(file_path)
                            total_files_removed += 1
                            logger.info(f"已刪除 upload 文件: {filename}")
                        elif os.path.isdir(file_path):
                            shutil.rmtree(file_path)
                            total_files_removed += 1
                            logger.info(f"已刪除 upload 目錄: {filename}")
                    except Exception as e:
                        logger.error(f"無法刪除 upload 文件 {file_path}: {str(e)}")
        
        # 驗證清理結果
        processed_files_after = os.listdir(processed_folder) if os.path.exists(processed_folder) else []
        upload_files_after = os.listdir(upload_folder) if os.path.exists(upload_folder) else []
        
        logger.info(f"清理完成: 刪除了 {total_files_removed} 個文件")
        
        return jsonify({
            'success': True,
            'message': f'成功清理 {total_files_removed} 個文件',
            'files_removed': total_files_removed,
            'remaining_processed_files': len(processed_files_after),
            'remaining_upload_files': len(upload_files_after)
        })
        
    except Exception as e:
        logger.error(f"清理資料夾錯誤: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'清理失敗: {str(e)}'
        }), 500

# 修改現有的 update_buyer_csv 函數，在成功更新後自動觸發清理
@app.route('/api/update-buyer-csv', methods=['POST'])
def update_buyer_csv():
    # 備份
    backup_files()
    """更新 Buyer CSV 檔案中的 RT 金額"""
    try:
        data = request.json
        items_to_update = data.get('items', []) # type: ignore
        
        if not items_to_update:
            return jsonify({'success': False, 'error': '沒有要更新的項目'}), 400
        
        logger.info(f"準備更新 {len(items_to_update)} 筆資料")
        
        # 讀取 Buyer CSV
        try:
            buyer_df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8-sig', dtype=str)
        except:
            try:
                buyer_df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8', dtype=str)
            except:
                buyer_df = pd.read_csv(BUYER_CSV_PATH, encoding='big5', dtype=str)
        
        logger.info(f"Buyer CSV 原始欄位: {list(buyer_df.columns)}")
        
        # 確保有 RT 相關欄位
        if 'RT金額' not in buyer_df.columns:
            buyer_df['RT金額'] = ''
            logger.info("新增 RT金額 欄位")
        if 'RT總金額' not in buyer_df.columns:
            buyer_df['RT總金額'] = ''
            logger.info("新增 RT總金額 欄位")
        
        updated_count = 0
        
        # 更新每個項目
        for item in items_to_update:
            logger.info(items_to_update)
            po_no = str(item.get('po_no', '')).strip()
            description = str(item.get('description', '')).strip()
            
            # 將金額轉換為整數字串（移除小數點）
            rt_amount = item.get('rt_amount', 0)
            rt_total_amount = item.get('rt_total_amount', 0)
            
            try:
                rt_amount_str = str(int(round(float(rt_amount))))
                rt_total_amount_str = str(int(round(float(rt_total_amount))))
            except:
                rt_amount_str = '0'
                rt_total_amount_str = '0'
            
            logger.info(f"嘗試更新: PO={po_no}, 品名={description}, RT金額={rt_amount_str}, RT總金額={rt_total_amount_str}")
            
            if po_no:
                mask_po = buyer_df['PO No.'].astype(str).str.strip() == po_no

                if '品項' in buyer_df.columns:
                    mask_desc = buyer_df['品項'].astype(str).str.strip() == description
                    mask_both = mask_po & mask_desc
                else:
                    mask_desc = pd.Series([False] * len(buyer_df))
                    mask_both = mask_po  # fallback

                if mask_both.sum() > 0:
                    buyer_df.loc[mask_both, 'RT金額'] = rt_amount_str
                    buyer_df.loc[mask_both, 'RT總金額'] = rt_total_amount_str
                    updated_count += mask_both.sum()
                    logger.info(f"✓ 完整匹配 PO={po_no}, 品項={description} → 成功更新")
                elif mask_po.sum() > 0:
                    buyer_df.loc[mask_po, 'RT金額'] = rt_amount_str
                    buyer_df.loc[mask_po, 'RT總金額'] = rt_total_amount_str
                    updated_count += mask_po.sum()
                    logger.warning(f"⚠️ PO={po_no} 在 Buyer CSV 中有 {mask_po.sum()} 筆，但品項不同 (GridView: {description}, Buyer: {buyer_df.loc[mask_po, '品項'].unique().tolist()})，仍強制更新 RT 金額")
                else:
                    logger.warning(f"✗ 在 Buyer CSV 中找不到 PO {po_no}")
        
        # 儲存更新後的 CSV
        if updated_count > 0:
            try:
                buyer_df.to_csv(BUYER_CSV_PATH, index=False, encoding='utf-8-sig', na_rep='')
                logger.info(f"成功儲存更新後的 Buyer CSV，共更新 {updated_count} 筆資料")
                
                # 驗證更新是否成功
                verify_df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8-sig', dtype=str)
                logger.info(f"驗證: 更新後的 CSV 有 {len(verify_df)} 筆資料")
                
                # 檢查特定 PO 的更新結果
                for item in items_to_update[:3]:
                    po_no = str(item.get('po_no', '')).strip()
                    if po_no:
                        verify_rows = verify_df[verify_df['PO No.'].astype(str).str.strip() == po_no]
                        if len(verify_rows) > 0:
                            logger.info(f"驗證 PO {po_no}：共有 {len(verify_rows)} 筆資料")
                            for idx, row in verify_rows.iterrows():
                                logger.info(f"- 品項={row.get('品項', '')}, RT金額={row.get('RT金額', '')}, RT總金額={row.get('RT總金額', '')}")
                                
                return jsonify({
                    'success': True,
                    'message': f'成功更新 {int(updated_count)} 筆資料',
                    'updated_count': int(updated_count),
                    'total_items': int(len(items_to_update)),
                    'should_cleanup': True,  # 確保添加標記告訴前端需要清理
                    'cleanup_required': True  # 額外的清理標記
                })
                
            except Exception as e:
                logger.error(f"儲存 CSV 失敗: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': f'儲存檔案失敗: {str(e)}'
                }), 500
        else:
            # 提供更詳細的錯誤資訊
            logger.warning("沒有任何資料被更新")
            
            # 統計各種情況
            empty_po_count = sum(1 for item in items_to_update if not str(item.get('po_no', '')).strip())
            valid_po_count = len(items_to_update) - empty_po_count
            
            error_details = {
                'total_items': len(items_to_update),
                'valid_po_count': valid_po_count,
                'empty_po_count': empty_po_count,
                'updated_count': 0
            }
            
            if empty_po_count > 0:
                error_message = f'共 {len(items_to_update)} 筆資料中有 {empty_po_count} 筆缺少 PO 號碼，{valid_po_count} 筆在 Buyer CSV 中找不到匹配項目'
            else:
                error_message = f'在 Buyer CSV 中找不到任何匹配的 PO 號碼 (共檢查 {len(items_to_update)} 筆)'
            
            return jsonify({
                'success': False,
                'message': error_message,
                'error': '後台查無此資料，請檢查 PO 號碼是否正確',
                'details': error_details,
                'updated_count': 0
            })
        
    except Exception as e:
        logger.error(f"更新 Buyer CSV 錯誤: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500





from flask import Flask, send_file, jsonify, Response
from io import BytesIO
import tempfile

@app.route('/api/download_buyer_detail_xlsx', methods=['GET'])
def download_buyer_detail_xlsx():
    try:
        # 方法1：直接從資料庫或 JSON 獲取資料（推薦）
        # 這樣可以避免 CSV 檔案中的格式問題
        
        # 如果你有資料庫連接，使用這個方法：
        # df = pd.read_sql("SELECT * FROM buyer_detail", connection)
        
        # 如果你想從現有的 API 端點獲取資料：
        try:
            # 從你現有的 API 端點獲取 JSON 資料
            import requests
            response = requests.get('http://127.0.0.1:5000/api/buyer_detail')
            if response.status_code == 200:
                data = response.json()
                df = pd.DataFrame(data)
            else:
                raise Exception("無法從 API 獲取資料")
        except:
            # 備用方案：讀取 CSV 檔案
            csv_file_path = './data/BUYER_DETAIL_RT_Table.csv'
            
            # 嘗試不同的編碼方式
            encodings = ['utf-8', 'big5', 'gbk', 'cp950']
            df = None
            
            for encoding in encodings:
                try:
                    df = pd.read_csv(csv_file_path, encoding=encoding)
                    print(f"成功使用 {encoding} 編碼讀取檔案")
                    break
                except UnicodeDecodeError:
                    continue
            
            if df is None:
                return jsonify({'error': '無法讀取資料檔案，編碼問題'}), 500
        
        # 定義需要的欄位（按順序）
        required_columns = [
            "交貨驗證",
            "驗收狀態", 
            "ePR No.",
            "PO No.",
            "Item",
            "品項",
            "規格",
            "數量",
            "總數",
            "單價",
            "總價",
            "RT金額",
            "RT總金額",
            "備註",
            "Delivery Date 廠商承諾交期",
            "SOD Qty 廠商承諾數量",
            "驗收數量",
            "拒收數量",
            "發票月份",
            "WBS",
            "需求日"
        ]
        
        # 只選擇需要的欄位，並按指定順序排列
        available_columns = [col for col in required_columns if col in df.columns]
        df_filtered = df[available_columns].copy()
        
        # 清理資料
        def clean_cell_value(value):
            if pd.isna(value) or value is None:
                return ''
            
            # 轉換為字符串
            str_value = str(value)
            
            # 移除 Excel 不支援的控制字符
            # Excel 不支援 ASCII 0-31 的控制字符（除了 9=tab, 10=LF, 13=CR）
            cleaned = ''.join(char for char in str_value 
                            if ord(char) >= 32 or char in ['\t', '\n', '\r'])
            
            # 替換可能造成問題的字符
            cleaned = cleaned.replace('\n', ' ').replace('\r', ' ')
            
            # 限制單元格內容長度（Excel 限制為 32,767 字符）
            if len(cleaned) > 32000:
                cleaned = cleaned[:32000] + '...'
            
            return cleaned.strip()
        
        # 應用清理函數到篩選後的資料
        for column in df_filtered.columns:
            df_filtered[column] = df_filtered[column].apply(clean_cell_value)
        
        # 使用篩選後的資料
        df = df_filtered
        
        # 創建 Excel 檔案
        excel_buffer = BytesIO()
        
        try:
            # 使用 xlsxwriter 引擎（更穩定）
            with pd.ExcelWriter(excel_buffer, engine='xlsxwriter') as writer:
                # 寫入資料
                df.to_excel(writer, sheet_name='eRT驗收明細', index=False)
                
                # 獲取工作表和工作簿物件
                workbook = writer.book
                worksheet = writer.sheets['eRT驗收明細']
                
                # 設定標題格式
                header_format = workbook.add_format({ # type: ignore
                    'bold': True,
                    'bg_color': '#D7E4BC',
                    'border': 1,
                    'align': 'center',
                    'valign': 'vcenter'
                })
                
                # 設定資料格式
                cell_format = workbook.add_format({ # type: ignore
                    'border': 1,
                    'align': 'left',
                    'valign': 'top',
                    'text_wrap': True
                })
                
                # 應用格式到標題行
                for col_num, column_name in enumerate(df.columns):
                    worksheet.write(0, col_num, column_name, header_format)
                
                # 自動調整欄位寬度
                for i, column in enumerate(df.columns):
                    max_length = max(
                        df[column].astype(str).apply(len).max(),
                        len(str(column))
                    )
                    # 設定合理的欄位寬度
                    width = min(max_length + 2, 50)
                    width = max(width, 10)
                    worksheet.set_column(i, i, width)
                
                # 凍結首行
                worksheet.freeze_panes(1, 0)
        
        except ImportError:
            # 如果沒有 xlsxwriter，回退到 openpyxl
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='eRT驗收明細', index=False)
        
        excel_buffer.seek(0)
        
        # 創建臨時檔案
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        temp_file.write(excel_buffer.getvalue())
        temp_file.close()
        
        print(f"✅ 成功創建 Excel 檔案，包含 {len(df)} 行資料，{len(df.columns)} 個欄位")
        print(f"📋 包含欄位: {', '.join(df.columns)}")
        
        # 返回檔案
        return send_file(
            temp_file.name,
            as_attachment=True,
            download_name='eRT驗收細項資料.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        print(f"❌ 下載錯誤: {str(e)}")
        return jsonify({'error': f'檔案處理失敗: {str(e)}'}), 500
    
    finally:
        # 清理臨時檔案（延遲清理）
        try:
            if 'temp_file' in locals():
                # 延遲 10 秒後清理（給下載時間）
                import threading
                def delayed_cleanup():
                    import time
                    time.sleep(10)
                    try:
                        os.unlink(temp_file.name)
                    except:
                        pass
                
                threading.Thread(target=delayed_cleanup).start()
        except:
            pass



# eRT 功能
@app.route('/api/get_unaccounted_amount', methods=['GET'])
def get_unaccounted_amount():
    """
    統計尚未入帳的金額 (以今天日期為基準)
    條件：
    1. 有承諾交期
    2. 承諾交期 <= 今天
    3. 發票月份為空
    """
    import datetime
    file_path = BUYER_CSV_PATH
    if not os.path.exists(file_path):
        return {"file": file_path, "unaccounted_amount": 0, "rows": []}

    try:
        df = pd.read_csv(file_path, encoding="utf-8-sig", dtype=str).fillna("")

        # 日期處理
        today = datetime.datetime.now().strftime("%Y%m%d")

        def clean_date(val):
            val = str(val).strip().replace("/", "").replace("-", "")
            return val if val.isdigit() and len(val) == 8 else ""

        df["交期_clean"] = df["Delivery Date 廠商承諾交期"].apply(clean_date)
        df["發票月份"] = df["發票月份"].astype(str).str.strip()

        # 過濾條件
        mask = (
            (df["交期_clean"] != "") &
            (df["交期_clean"] <= today) &
            (df["發票月份"] == "")
        )
        filtered = df[mask].copy()

        # 處理金額：優先用「總價」，若沒有就用 數量*單價
        def calc_amount(row):
            try:
                if row.get("總價") and str(row["總價"]).strip():
                    return float(str(row["總價"]).replace(",", "").strip())
                qty = float(str(row.get("數量", "0")).replace(",", "").strip() or 0)
                price = float(str(row.get("單價", "0")).replace(",", "").strip() or 0)
                return qty * price
            except:
                return 0.0

        filtered["總價"] = filtered.apply(calc_amount, axis=1)

        total_amount = round(filtered["總價"].sum(), 2)

        rows = filtered[[
            "PO No.", "Item", "品項", "Delivery Date 廠商承諾交期", 
            "SOD Qty 廠商承諾數量", "總價"
        ]].to_dict(orient="records")

        # print(f"{'PO No.':<12}{'Item':<8}{'品項':<30}{'交期':<12}{'SOD Qty':<10}{'總價':<12}")
        # # 印出每一行
        # for r in rows:
        #     print(f"{r['PO No.']:<12}{r['Item']:<8}{r['品項']:<30}{r['Delivery Date 廠商承諾交期']:<12}{r['SOD Qty 廠商承諾數量']:<10}{r['總價']:<12,.0f}")

        return jsonify({
            "file": file_path,
            "unaccounted_amount": int(total_amount),
            "rows": rows
        })

    except Exception as e:
        return {"file": file_path, "error": str(e)}
    

# 3.py
@app.route("/api/accounting_summary", methods=["GET"])
def get_accounting_summary():
    # 讀取CSV檔案
    df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8-sig', dtype='str')

    # 篩選條件：ePR No、PO No、需求日都不為空值
    filtered_df = df[
        (df['ePR No.'].notna()) & 
        (df['PO No.'].notna()) & 
        (df['需求日'].notna()) &
        (df['ePR No.'] != '') & 
        (df['PO No.'] != '') & 
        (df['需求日'] != '')
    ]

    # ==== 新增需求：入帳條件篩選 ====
    def filter_for_accounting(df, target_month, target_year=2025):
        """
        篩選未入帳資料 - 正確邏輯
        如果發票月份和承諾交期在同個月份 → 已入帳，直接忽略
        """
        # 建立目標月份的最後一天
        if target_month == 12:
            target_date_end = datetime(target_year + 1, 1, 1)
        else:
            target_date_end = datetime(target_year, target_month + 1, 1)
        
        # 複製資料避免修改原始資料
        accounting_df = df.copy()
        
        # 解析日期
        accounting_df['承諾交期_日期'] = pd.to_datetime(accounting_df['Delivery Date 廠商承諾交期'], errors='coerce', format='mixed')
        accounting_df['發票月份_日期'] = pd.to_datetime(accounting_df['發票月份'], errors='coerce', format='mixed')
        
        # 處理數字格式的需求日 (如 20250523)
        def parse_numeric_date(val):
            if pd.isna(val):
                return pd.NaT
            try:
                val_str = str(int(float(val)))
                if len(val_str) == 8:
                    year = int(val_str[:4])
                    month = int(val_str[4:6])
                    day = int(val_str[6:8])
                    return pd.Timestamp(year, month, day)
            except:
                pass
            return pd.NaT
        
        accounting_df['需求日_日期'] = accounting_df['需求日'].apply(parse_numeric_date)
        
        # 0. 時間回推邏輯：排除在目標月份或之前已開發票的資料
        # 例如：7月報表要排除發票在7月或之前的資料，保留發票在8月之後的（7月時未入帳）
        target_date_start = datetime(target_year, target_month, 1)
        if target_month == 12:
            target_date_end = datetime(target_year + 1, 1, 1)
        else:
            target_date_end = datetime(target_year, target_month + 1, 1)
        
        # 排除已入帳的資料：發票日期在目標月份或之前的
        already_paid_mask = (
            accounting_df['發票月份_日期'].notna() & 
            (accounting_df['發票月份_日期'] < target_date_end)
        )
        
        # print(f"調試 - 找到 {already_paid_mask.sum()} 筆在{target_year}年{target_month}月或之前已開發票的資料將被排除")
        
        # 排除已入帳的資料
        accounting_df = accounting_df[~already_paid_mask]
        
        # 1. EPR No. 和 PO No. 必須有值
        condition1 = (accounting_df['ePR No.'].notna()) & (accounting_df['PO No.'].notna()) & \
                    (accounting_df['ePR No.'] != '') & (accounting_df['PO No.'] != '')
        
        # 2. 扣除 WBS 欄位有值的資料（WBS 必須為空）
        condition2 = accounting_df['WBS'].isna() | (accounting_df['WBS'] == '')
        
        # 3. 承諾交期必須有值且在當月或之前
        condition3 = accounting_df['承諾交期_日期'].notna() & (accounting_df['承諾交期_日期'] < target_date_end)
        
        # 4. 需求日必須在當月之前  
        target_date_start = datetime(target_year, target_month, 1)
        condition4 = accounting_df['需求日_日期'] < target_date_start
        
        # 套用所有條件
        final_condition = condition1 & condition2 & condition3 & condition4
        result_df = accounting_df[final_condition]
        
        # 金額計算
        result_df = result_df.copy()
        result_df['總價_數值'] = pd.to_numeric(
            result_df['總價'].astype(str).str.replace(',', '').str.replace("$", ''), 
            errors='coerce'
        )
        total_amount = result_df['總價_數值'].sum()
        
        return result_df, int(total_amount) if not pd.isna(total_amount) else 0

    # 獲取資料中所有可能的年月份 (只到當前月份)
    def get_all_year_months(df):
        current_date = datetime.now()
        current_year = current_date.year
        current_month = current_date.month
        
        all_dates = []
        all_dates.extend(pd.to_datetime(df['Delivery Date 廠商承諾交期'], errors='coerce').dropna())
        all_dates.extend(pd.to_datetime(df['需求日'], errors='coerce').dropna())
        all_dates.extend(pd.to_datetime(df['發票月份'], errors='coerce').dropna())
        
        year_months = set()
        for date in all_dates:
            year, month = date.year, date.month
            if (year < current_year) or (year == current_year and month <= current_month):
                year_months.add((year, month))
        return sorted(list(year_months))

    # ==== 計算所有月份 ====
    all_year_months = get_all_year_months(filtered_df)
    json_summary = {}

    for year, month in all_year_months:
        result_df, total_amount = filter_for_accounting(df, month, year)
        year_month_key = f"{year}年{month}月"
        json_summary[year_month_key] = total_amount
    
    # ✅ 最後回傳 JSON 給前端
    return jsonify(json_summary)



# 2_4.py
@app.route("/api/monthly_actual_accounting", methods=["GET"])
def get_monthly_actual_accounting():

    # 讀取CSV檔案
    df = pd.read_csv(BUYER_CSV_PATH, encoding='utf-8-sig', dtype='str')

    # 篩選條件：ePR No、PO No、需求日都不為空值
    filtered_df = df[
        (df['ePR No.'].notna()) & 
        (df['PO No.'].notna()) & 
        (df['需求日'].notna()) &
        (df['ePR No.'] != '') & 
        (df['PO No.'] != '') & 
        (df['需求日'] != '')
    ]

    def calculate_monthly_actual_accounting(df):
        """
        計算每月實際入帳金額
        條件：
        1. ePR No. 和 PO No. 必須有值
        2. 不包含WBS (WBS必須為空)
        3. 發票月份不為空 (有發票才算入帳)
        """
        # 複製資料避免修改原始資料
        accounting_df = df.copy()
        
        # 1. EPR No. 和 PO No. 必須有值
        condition1 = (accounting_df['ePR No.'].notna()) & (accounting_df['PO No.'].notna()) & \
                    (accounting_df['ePR No.'] != '') & (accounting_df['PO No.'] != '')
        
        # 2. 不含WBS (WBS 必須為空)
        condition2 = accounting_df['WBS'].isna() | (accounting_df['WBS'] == '')
        
        # 3. 發票月份不為空 (有發票才算入帳)
        accounting_df['發票月份_日期'] = pd.to_datetime(accounting_df['發票月份'], errors='coerce', format='mixed')
        condition3 = accounting_df['發票月份_日期'].notna()
        
        # 套用所有條件
        final_condition = condition1 & condition2 & condition3
        result_df = accounting_df[final_condition]
        
        # 加入發票年月欄位
        result_df = result_df.copy()
        result_df['發票年月'] = result_df['發票月份_日期'].dt.to_period('M')
        
        # print(f"符合入帳條件的資料筆數: {len(result_df)}")
        # print(f"1. EPR No. 和 PO No. 有值: {condition1.sum()} 筆")
        # print(f"2. WBS 欄位為空: {condition2.sum()} 筆")
        # print(f"3. 發票月份不為空: {condition3.sum()} 筆")
        
        return result_df
    
    def get_monthly_summary(df_with_period):
        df = df_with_period.copy()
        df['RT總金額_數值'] = pd.to_numeric(
            df['RT總金額'].astype(str).str.replace(',', '').str.replace('$', ''), 
            errors='coerce'
        )

        monthly_summary = df.groupby('發票年月')['RT總金額_數值'].sum().reset_index()

        monthly_dict = {}
        for _, row in monthly_summary.iterrows():
            if pd.notna(row['發票年月']):
                year = row['發票年月'].year
                month = row['發票年月'].month
                key = f"{year}年{month}月"
                monthly_dict[key] = int(row['RT總金額_數值']) if not pd.isna(row['RT總金額_數值']) else 0
        return monthly_dict

    # ==== 計算 ====
    actual_accounting_df = calculate_monthly_actual_accounting(filtered_df)
    if len(actual_accounting_df) == 0:
        return jsonify({"本月": 0, "上月": 0})

    monthly_dict = get_monthly_summary(actual_accounting_df)

    # ==== 找本月與上月 ====
    now = datetime.now()
    this_key = f"{now.year}年{now.month}月"
    last_month = now.month - 1 if now.month > 1 else 12
    last_year = now.year if now.month > 1 else now.year - 1
    last_key = f"{last_year}年{last_month}月"

    this_amount = monthly_dict.get(this_key, 0)
    last_amount = monthly_dict.get(last_key, 0)

    return jsonify({
        "本月": this_amount,
        "上月": last_amount
    })




if __name__ == "__main__":
    app.run(debug=True)


    # 165