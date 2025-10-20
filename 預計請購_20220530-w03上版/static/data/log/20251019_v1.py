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
from filelock import FileLock, Timeout
from werkzeug.utils import secure_filename
import logging
import shutil
import numpy as np
import traceback
from loguru import logger

BACKEND_DATA = r"D:\Data\Backend_Access_Management\Backend_data.json"
VENDER_FILE_PATH = f'static/data/vender.ini'

app = Flask(__name__)
CORS(app)
CSV_FILE = "static/data/Planned_Purchase_Request_List.csv"
JSON_FILE = f"static/data/money.json"
BUYER_FILE = f"static/data/Buyer_detail.csv"
BUYER_FILE_LOCK = f"static/data/Buyer_detail.csv.lock"  # 🔒 鎖檔案路徑

from difflib import SequenceMatcher
buyer_file_lock = FileLock(BUYER_FILE_LOCK, timeout=10)

# eHub 處理

def is_po_in_record(row_po_str, target_po):
    """檢查 PO 是否在記錄中（支援 <br /> 分隔的多個 PO）"""
    po_list = re.split(r"<br\s*/?>", str(row_po_str))
    po_list = [po.strip() for po in po_list if po.strip()]
    return target_po.strip() in po_list

def fuzzy_in(text, keyword):
    """模糊比對關鍵字是否在文字中"""
    return keyword.strip() in str(text).strip()

def cleanup_temp_csv_files(po_no=None):
    """清理暫存的 CSV 檔案"""
    try:
        uploads_dir = "uploads"
        if not os.path.exists(uploads_dir):
            return
        
        if po_no:
            # 只刪除特定 PO 的檔案
            temp_file = os.path.join(uploads_dir, f"{po_no}.csv")
            if os.path.exists(temp_file):
                os.remove(temp_file)
                logger.info(f"✅ 已刪除: {temp_file}")
        else:
            # 刪除所有暫存 CSV 檔案
            for filename in os.listdir(uploads_dir):
                if filename.endswith('.csv'):
                    file_path = os.path.join(uploads_dir, filename)
                    os.remove(file_path)
                    logger.info(f"✅ 已刪除: {file_path}")
    except Exception as e:
        logger.error(f"清理暫存檔案時發生錯誤: {str(e)}")


@app.route("/api/save_csv", methods=["POST", "OPTIONS"])
def save_csv():
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
        return jsonify({"status": "error", "msg": "❌ 缺少 PO NO 採購單號碼 欄位!"}), 400

    # 抓出所有不同的 PO NO
    unique_po_nos = df_all["PO NO 採購單號碼"].dropna().unique()

    # ✅ 第一步:分群儲存 uploads/{po_no}.csv
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
        logger.info(f"✅ 已儲存 {upload_path} ({len(group_df)} 筆資料)")

    try:
        with buyer_file_lock:
            # ✅ 第二步:載入 Buyer_detail.csv (比對用)
            df_buyer = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str, on_bad_lines="skip").fillna("")
            df_buyer["PO No."] = df_buyer["PO No."].str.strip()
            df_buyer["Item"] = (
                df_buyer["Item"]
                .str.replace(r"\.0$", "", regex=True)
                .str.strip()
                .apply(lambda x: x.zfill(4) if x.isdigit() else x)
            )

            # 🔴 建立一個只包含狀態為 V 的資料索引
            df_active = df_buyer[df_buyer["開單狀態"] == "V"].copy()
            logger.info(f"總資料筆數: {len(df_buyer)}, 有效資料(狀態=V): {len(df_active)}")

    except Timeout:
        logger.error("❌ 無法取得檔案鎖,請稍後再試")
        return jsonify({"status": "error", "msg": "系統忙碌中,請稍後再試"}), 503
    except Exception as e:
        logger.error(f"❌ 讀取 Buyer_detail.csv 時發生錯誤: {str(e)}")
        return jsonify({"status": "error", "msg": f"讀取檔案失敗: {str(e)}"}), 500

    # 🆕 初始化
    all_group_results = []
    quantity_mismatch_items = []
    merged_items = []  # 🆕 記錄合併的項目
    
    # ✅✅✅ 新增：記錄哪些 PO 有問題（分批或合併）
    mismatch_po_set = set()  # 有分批問題的 PO
    merge_po_set = set()      # 有合併問題的 PO

    def clean_name(x: str) -> str:
        return str(x).replace("\n", "").replace("\r", "").replace("<br>", "").strip()

    df_buyer["品項_clean"] = df_buyer["品項"].apply(clean_name)
    buyer_id_lookup = {
        (row["PO No."], row["Item"]): row.get("Id", "")
        for _, row in df_buyer.iterrows()
    }

    # 🔴 第一輪:檢測所有 PO 是否有分批或合併問題
    logger.info("\n" + "="*80)
    logger.info("第一輪掃描：檢測分批和合併問題")
    logger.info("="*80)
    
    for file_info in saved_files:
        po_no = file_info["po_no"]
        csv_path = file_info["file"]
        
        df_po = pd.read_csv(csv_path, encoding="utf-8-sig", dtype=str).fillna("")
        df_po["PO Item 採購單項次"] = df_po["PO Item 採購單項次"].str.zfill(4)
        
        buyer_related = df_active[df_active["PO No."].str.contains(po_no, regex=False, na=False)].copy()
        
        xls_item_groups = df_po.groupby("PO Item 採購單項次")
        
        for item, xls_group in xls_item_groups:
            xls_count = len(xls_group)
            csv_items = buyer_related[buyer_related["Item"] == item]
            csv_count = len(csv_items)
            
            # ✅ 新增:如果 XLS 筆數 < CSV 筆數,代表「分批變回合併」
            if csv_count > 0 and xls_count < csv_count:
                logger.info(f"🔄 偵測到合併:PO={po_no}, Item={item}, XLS={xls_count}筆 < CSV={csv_count}筆")
                merge_po_set.add(po_no)  # ✅ 標記此 PO 有合併問題
                
                xls_rows = []
                for _, row in xls_group.iterrows():
                    xls_rows.append({
                        "description": str(row.get("Description 品名", "")),
                        "delivery": str(row.get("Delivery Date 廠商承諾交期", "")),
                        "sod_qty": str(row.get("SOD Qty 廠商承諾數量", "0"))
                    })
                
                csv_rows = []
                batch_mask = (
                    (df_buyer["PO No."].str.strip() == po_no) &
                    (df_buyer["Item"].str.strip() == item) &
                    (df_buyer["備註"].str.contains("分批", na=False)) &
                    (df_buyer["開單狀態"] == "V")
                )
                csv_items = df_buyer[batch_mask]
                
                for _, row in csv_items.iterrows():
                    csv_rows.append({
                        "id": str(row.get("Id", "")),
                        "description": str(row.get("品項", "")),
                        "delivery": str(row.get("Delivery Date 廠商承諾交期", "")),
                        "sod_qty": str(row.get("SOD Qty 廠商承諾數量", "0")),
                        "note": str(row.get("備註", ""))
                    })
                
                # 🆕 記錄需要合併的項目
                merged_items.append({
                    "po_no": po_no,
                    "item": item,
                    "xls_count": int(xls_count),
                    "csv_count": int(csv_count),
                    "xls_data": xls_rows,
                    "csv_data": csv_rows,
                    "action_type": "merge"
                })
                
                logger.info(f"   📝 已記錄需要合併的項目")

            # 🚨 筆數不符（分批）
            elif csv_count > 0 and xls_count > csv_count:
                mismatch_po_set.add(po_no)  # ✅ 標記此 PO 有分批問題
                
                try:
                    total_sod = csv_items["SOD Qty 廠商承諾數量"].astype(float).sum()
                except:
                    total_sod = 0.0
                
                xls_rows = []
                for _, row in xls_group.iterrows():
                    xls_rows.append({
                        "description": str(row.get("Description 品名", "")),
                        "delivery": str(row.get("Delivery Date 廠商承諾交期", "")),
                        "sod_qty": str(row.get("SOD Qty 廠商承諾數量", "0"))
                    })
                
                csv_rows = []
                for _, row in csv_items.iterrows():
                    csv_rows.append({
                        "id": str(row.get("Id", "")),
                        "description": str(row.get("品項", "")),
                        "delivery": str(row.get("Delivery Date 廠商承諾交期", "")),
                        "sod_qty": str(row.get("SOD Qty 廠商承諾數量", "0")),
                        "total_qty": str(row.get("總數", "0"))
                    })
                
                quantity_mismatch_items.append({
                    "po_no": po_no,
                    "item": item,
                    "xls_count": int(xls_count),
                    "csv_count": int(csv_count),
                    "total_sod": float(total_sod),
                    "xls_data": xls_rows,
                    "csv_data": csv_rows
                })
                
                logger.info(f"⚠️ 筆數不符: PO={po_no}, Item={item}, XLS={xls_count}筆, CSV={csv_count}筆")

    logger.info(f"\n📊 第一輪掃描結果:")
    logger.info(f"   分批問題 PO: {len(mismatch_po_set)} 個 - {list(mismatch_po_set)}")
    logger.info(f"   合併問題 PO: {len(merge_po_set)} 個 - {list(merge_po_set)}")
    logger.info("="*80 + "\n")

    # 🔴 第二輪:處理沒有問題的 PO (正常比對)
    logger.info("\n" + "="*80)
    logger.info("第二輪處理：正常比對（排除有問題的 PO）")
    logger.info("="*80)
    
    for file_info in saved_files:
        po_no = file_info["po_no"]
        
        # ✅✅✅ 關鍵修改：如果這個 PO 有分批或合併問題，跳過正常比對
        if po_no in mismatch_po_set:
            logger.info(f"⭕️ 跳過 PO {po_no} 的正常比對 (有分批問題)")
            continue
        
        if po_no in merge_po_set:
            logger.info(f"⭕️ 跳過 PO {po_no} 的正常比對 (有合併問題)")
            continue
        
        csv_path = file_info["file"]
        df_po = pd.read_csv(csv_path, encoding="utf-8-sig", dtype=str).fillna("")
        df_po["PO Item 採購單項次"] = df_po["PO Item 採購單項次"].str.zfill(4)

        buyer_related = df_buyer[df_buyer["PO No."].str.contains(po_no, regex=False, na=False)].copy()

        matched_list = []
        conflict_list = []

        for row_idx, row in df_po.iterrows():
            item = row["PO Item 採購單項次"]
            desc = clean_name(row.get("Description 品名", ""))
            delivery = row["Delivery Date 廠商承諾交期"]
            qty = row["SOD Qty 廠商承諾數量"]

            logger.info(f"處理 PO {po_no} 的 Item {item}")

            item_match = buyer_related[buyer_related["Item"] == item]
            
            if not item_match.empty:
                buyer_row = item_match.iloc[0]
                buyer_item = buyer_row["Item"]
                buyer_desc = clean_name(buyer_row["品項"])
                buyer_id = buyer_row.get("Id", "")

                logger.info(f"  找到 Buyer Item {buyer_item}, 品名: {buyer_desc}")

                df_buyer.loc[item_match.index, "Delivery Date 廠商承諾交期"] = delivery
                df_buyer.loc[item_match.index, "SOD Qty 廠商承諾數量"] = qty

                if buyer_desc == desc:
                    buyer_id = buyer_id_lookup.get((po_no, buyer_item), "")
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
                    logger.info(f"  ✅ 完全相同")
                else:
                    buyer_id = buyer_id_lookup.get((po_no, buyer_item), "")
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
                    logger.info(f"  ⚠️ 品名不同")
            else:
                logger.info(f"  ❌ Buyer 中找不到 Item {item}")
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

        all_group_results.append({
            "po_no": po_no,
            "matched": matched_list,
            "conflict": conflict_list
        })
        
        logger.info(f"📊 PO {po_no} 統計: 相同={len(matched_list)}, 衝突={len(conflict_list)}")

    logger.info("="*80 + "\n")

    # 🎯 根據情況返回不同的結果
    
    # ✅ 優先返回合併確認
    if merged_items:
        logger.info(f"🔄 發現 {len(merged_items)} 個項目需要合併")
        
        # 轉換資料
        merged_items_clean = []
        for item in merged_items:
            merged_items_clean.append({
                "po_no": str(item["po_no"]),
                "item": str(item["item"]),
                "xls_count": int(item["xls_count"]),
                "csv_count": int(item["csv_count"]),
                "xls_data": item["xls_data"],
                "csv_data": item["csv_data"],
                "action_type": "merge"
            })
        
        return jsonify({
            "status": "merge_confirmation_needed",
            "message": f"發現 {len(merged_items)} 個項目從分批變回單筆,需要確認",
            "merge_items": merged_items_clean,
            "total_merge_items": len(merged_items),
            "groups": all_group_results,  # ✅ 只包含沒問題的 PO
            "has_normal_items": len(all_group_results) > 0
        })
    
    # ✅ 其次返回分批調整
    if quantity_mismatch_items:
        logger.info(f"🚨 發現 {len(quantity_mismatch_items)} 個項目筆數不符")
        logger.info(f"✅ 同時處理了 {len(all_group_results)} 個正常 PO")
        
        return jsonify({
            "status": "quantity_mismatch",
            "message": f"發現 {len(quantity_mismatch_items)} 個項目的筆數不符,需要手動調整",
            "mismatches": quantity_mismatch_items,
            "total_mismatches": len(quantity_mismatch_items),
            "require_manual_adjustment": True,
            "groups": all_group_results,  # ✅ 只包含沒問題的 PO
            "has_normal_items": len(all_group_results) > 0
        })

    # 沒有分批或合併問題,正常返回
    logger.info(f"\n✅ 總共處理 {len(all_group_results)} 個 PO")
    
    return jsonify({
        "status": "ok",
        "groups": all_group_results,
        "saved_files": saved_files,
        "has_mismatch": False
    })















# 走分批
@app.route("/api/confirm_quantity_update", methods=["POST"])
def confirm_quantity_update():
    """處理筆數不符時使用者確認的更新(保留所有原始欄位)"""
    
    logger.info("=" * 80)
    logger.info("🚀 confirm_quantity_update 函數被調用")
    logger.info("=" * 80)
    
    try:
        data = request.get_json()
        logger.info(f"📥 收到的完整資料: {json.dumps(data, ensure_ascii=False, indent=2)}")
        
        po_no = data.get("po_no")
        item = data.get("item")
        new_rows = data.get("rows")
        expected_total = data.get("expected_total")
        
        logger.info(f"📦 解析後的參數:")
        logger.info(f"   PO No: {po_no}")
        logger.info(f"   Item: {item}")
        logger.info(f"   新筆數: {len(new_rows) if new_rows else 0}")
        logger.info(f"   預期總和: {expected_total}")
        
        if not po_no or not item or not new_rows:
            error_msg = f"缺少必要參數: po_no={po_no}, item={item}, new_rows={len(new_rows) if new_rows else 'None'}"
            logger.error(f"❌ {error_msg}")
            return jsonify({
                "status": "error",
                "message": error_msg
            }), 400
        
        def smart_number_format(value):
            """智能格式化數字"""
            try:
                num = float(value)
                if num.is_integer():
                    return str(int(num))
                else:
                    return str(num)
            except (ValueError, TypeError):
                return str(value)
        
        try:
            with buyer_file_lock:
                # 📊 載入 Buyer_detail.csv
                logger.info(f"📂 開始載入 {BUYER_FILE}")
                
                if not os.path.exists(BUYER_FILE):
                    logger.error(f"❌ 檔案不存在: {BUYER_FILE}")
                    return jsonify({
                        "status": "error",
                        "message": f"找不到檔案: {BUYER_FILE}"
                    }), 500
                
                df_buyer = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str).fillna("")
                logger.info(f"✅ 成功載入 Buyer_detail.csv,共 {len(df_buyer)} 筆資料")
                
                # ⚠️ 計算實際 SOD 總和
                try:
                    actual_total = sum(float(row.get("sod_qty", 0)) for row in new_rows)
                    sod_diff = actual_total - expected_total
                    
                    logger.info(f"🔢 SOD 總和計算:")
                    logger.info(f"   預期: {expected_total}")
                    logger.info(f"   實際: {actual_total}")
                    logger.info(f"   差異: {sod_diff}")
                    
                    if abs(sod_diff) > 0.01:
                        logger.warning(f"⚠️ SOD 總和不符!預期={expected_total}, 實際={actual_total}, 差異={sod_diff}")
                        logger.warning(f"   使用者選擇強制儲存,將繼續處理...")
                    else:
                        logger.info(f"✅ SOD 總和正確:{actual_total}")
                except Exception as e:
                    logger.error(f"❌ 計算 SOD 總和時發生錯誤: {str(e)}")
                    logger.error(traceback.format_exc())
                
                # 🗑️ 刪除舊的資料
                logger.info(f"🔍 開始尋找要刪除的資料 (PO={po_no}, Item={item}, 狀態=V)")
                
                old_mask = (
                    (df_buyer["PO No."].str.strip() == po_no) &
                    (df_buyer["Item"].str.strip() == item) &
                    (df_buyer["開單狀態"] == "V")
                )
                
                deleted_count = old_mask.sum()
                logger.info(f"📊 找到 {deleted_count} 筆符合條件的資料")
                
                if deleted_count == 0:
                    logger.error(f"❌ 找不到要刪除的舊資料")
                    logger.error(f"   查詢條件: PO No.={po_no}, Item={item}, 開單狀態=V")
                    
                    po_exists = df_buyer[df_buyer["PO No."].str.strip() == po_no]
                    logger.error(f"   該 PO 共有 {len(po_exists)} 筆資料")
                    
                    if len(po_exists) > 0:
                        items = po_exists["Item"].str.strip().unique()
                        logger.error(f"   該 PO 的 Items: {list(items)}")
                        statuses = po_exists["開單狀態"].unique()
                        logger.error(f"   該 PO 的狀態: {list(statuses)}")
                    else:
                        logger.error(f"   ❌ 該 PO 完全不存在於資料庫中")
                    
                    return jsonify({
                        "status": "error",
                        "message": f"找不到要刪除的舊資料 (PO {po_no} - Item {item}, 狀態=V)"
                    }), 404
                
                # 🎯 取得第一筆舊資料作為範本
                logger.info(f"📋 取得第一筆舊資料作為範本")
                first_old_row = df_buyer[old_mask].iloc[0]
                
                # 📝 記錄被刪除的資料
                deleted_data = []
                for idx, row in df_buyer[old_mask].iterrows():
                    deleted_data.append({
                        "品項": row.get("品項", ""),
                        "規格": row.get("規格", ""),
                        "單價": row.get("單價", ""),
                        "總價": row.get("總價", ""),
                        "交期": row.get("Delivery Date 廠商承諾交期", ""),
                        "SOD": row.get("SOD Qty 廠商承諾數量", "")
                    })
                
                logger.info(f"🗑️ 將刪除的資料:")
                for i, d in enumerate(deleted_data, 1):
                    logger.info(f"   第 {i} 筆: {d}")
                
                # 刪除舊資料
                logger.info(f"🗑️ 執行刪除操作...")
                df_buyer = df_buyer[~old_mask]
                logger.info(f"✅ 刪除完成,剩餘 {len(df_buyer)} 筆資料")
                
                # 💰 計算單價
                try:
                    unit_price_str = str(first_old_row.get("單價", "0")).replace(",", "").strip()
                    unit_price = float(unit_price_str) if unit_price_str else 0.0
                    logger.info(f"💰 原始單價: {unit_price}")
                except Exception as e:
                    logger.error(f"❌ 解析單價時發生錯誤: {str(e)}")
                    unit_price = 0.0
                
                # ➕ 準備新資料
                logger.info(f"➕ 開始準備新資料...")
                new_data_rows = []
                
                for idx, row_data in enumerate(new_rows):
                    logger.info(f"   處理第 {idx+1}/{len(new_rows)} 筆新資料...")
                    
                    try:
                        sod_qty = float(row_data.get("sod_qty", 0))
                    except:
                        sod_qty = 0.0
                    
                    sod_qty_formatted = smart_number_format(sod_qty)
                    total_price = unit_price * sod_qty
                    total_price_formatted = smart_number_format(total_price)
                    unit_price_formatted = smart_number_format(unit_price)
                    
                    new_row = {
                        "Id": first_old_row.get("Id", ""),
                        "開單狀態": "V",
                        "交貨驗證": first_old_row.get("交貨驗證", ""),
                        "User": first_old_row.get("User", ""),
                        "ePR No.": first_old_row.get("ePR No.", ""),
                        "PO No.": po_no,
                        "Item": item,
                        "品項": row_data.get("description", first_old_row.get("品項", "")),
                        "規格": first_old_row.get("規格", ""),
                        "數量": sod_qty_formatted,
                        "總數": sod_qty_formatted,
                        "單價": unit_price_formatted,
                        "總價": total_price_formatted,
                        "備註": f"分批{idx+1}/{len(new_rows)}" if len(new_rows) > 1 else first_old_row.get("備註", ""),
                        "字數": first_old_row.get("字數", ""),
                        "isEditing": "False",
                        "backup": "{}",
                        "_alertedItemLimit": "",
                        "Delivery Date 廠商承諾交期": row_data.get("delivery", ""),
                        "SOD Qty 廠商承諾數量": sod_qty_formatted,
                        "驗收數量": "",
                        "拒收數量": "",
                        "發票月份": "",
                        "WBS": first_old_row.get("WBS", ""),
                        "需求日": first_old_row.get("需求日", ""),
                        "RT金額": "",
                        "RT總金額": "",
                        "驗收狀態": "X"
                    }
                    new_data_rows.append(new_row)
                    logger.info(f"      品項: {new_row['品項']}, SOD: {new_row['SOD Qty 廠商承諾數量']}, 總價: {new_row['總價']}")
                
                logger.info(f"✅ 準備完成 {len(new_data_rows)} 筆新資料")
                
                # 🔴🔴🔴 直接加到最後面 🔴🔴🔴
                logger.info(f"📥 將新資料添加到最後...")
                df_buyer = pd.concat([
                    df_buyer,
                    pd.DataFrame(new_data_rows)
                ], ignore_index=True)
                logger.info(f"✅ 添加完成,現有 {len(df_buyer)} 筆資料")
                
                # 💾 儲存回檔案
                logger.info(f"💾 開始儲存到 {BUYER_FILE}...")
                df_buyer.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")
                logger.info(f"✅ 儲存完成")
        
        except Timeout:
            logger.error("❌ 無法取得檔案鎖,請稍後再試")
            return jsonify({
                "status": "error",
                "message": "系統忙碌中,請稍後再試"
            }), 503

        # 📝 準備回傳訊息
        success_msg = f"成功更新 PO {po_no} Item {item}: 刪除 {deleted_count} 筆,新增 {len(new_data_rows)} 筆 (已加到最後)"
        
        if abs(sod_diff) > 0.01:
            success_msg += f" (⚠️ SOD差異: {sod_diff:+.2f})"
        
        logger.info("=" * 80)
        logger.info(f"✅ {success_msg}")
        logger.info("=" * 80)

        # 🗑️ 刪除暫存的 CSV 檔案
        cleanup_temp_csv_files(po_no)
        
        return jsonify({
            "status": "success",
            "message": success_msg,
            "deleted_count": int(deleted_count),
            "inserted_count": len(new_data_rows),
            "sod_info": {
                "expected": float(expected_total),
                "actual": float(actual_total),
                "difference": float(sod_diff),
                "is_match": abs(sod_diff) < 0.01
            },
            "preserved_fields": {
                "unit_price": float(unit_price),
                "specification": first_old_row.get("規格", ""),
                "wbs": first_old_row.get("WBS", ""),
                "epr_no": first_old_row.get("ePR No.", "")
            }
        })
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ confirm_quantity_update 發生嚴重錯誤")
        logger.error(f"❌ 錯誤訊息: {str(e)}")
        logger.error(f"❌ 錯誤類型: {type(e).__name__}")
        logger.error("❌ 完整堆疊追蹤:")
        logger.error(traceback.format_exc())
        logger.error("=" * 80)
        
        return jsonify({
            "status": "error",
            "message": f"更新失敗: {str(e)}"
        }), 500


# 走合併
@app.route("/api/confirm_merge", methods=["POST"])
def confirm_merge():
    """處理分批變回合併的確認更新"""
    
    logger.info("=" * 80)
    logger.info("🔄 confirm_merge 函數被調用")
    logger.info("=" * 80)
    
    try:
        data = request.get_json()
        logger.info(f"📥 收到的完整資料: {json.dumps(data, ensure_ascii=False, indent=2)}")
        
        po_no = data.get("po_no")
        item = data.get("item")
        xls_data = data.get("xls_data")  # 新的 XLS 資料 (通常只有 1 筆)
        
        logger.info(f"📦 解析後的參數:")
        logger.info(f"   PO No: {po_no}")
        logger.info(f"   Item: {item}")
        logger.info(f"   新筆數: {len(xls_data) if xls_data else 0}")
        
        if not po_no or not item or not xls_data:
            error_msg = f"缺少必要參數: po_no={po_no}, item={item}, xls_data={len(xls_data) if xls_data else 'None'}"
            logger.error(f"❌ {error_msg}")
            return jsonify({
                "status": "error",
                "message": error_msg
            }), 400
        
        def smart_number_format(value):
            """智能格式化數字"""
            try:
                num = float(value)
                if num.is_integer():
                    return str(int(num))
                else:
                    return str(num)
            except (ValueError, TypeError):
                return str(value)
        
        try:
            with buyer_file_lock:
                # 📊 載入 Buyer_detail.csv
                logger.info(f"📂 開始載入 {BUYER_FILE}")
                
                if not os.path.exists(BUYER_FILE):
                    logger.error(f"❌ 檔案不存在: {BUYER_FILE}")
                    return jsonify({
                        "status": "error",
                        "message": f"找不到檔案: {BUYER_FILE}"
                    }), 500
                
                df_buyer = pd.read_csv(BUYER_FILE, encoding="utf-8-sig", dtype=str).fillna("")
                logger.info(f"✅ 成功載入 Buyer_detail.csv,共 {len(df_buyer)} 筆資料")
                
                # 🗑️ 刪除舊的分批資料
                logger.info(f"🔍 開始尋找要刪除的資料 (PO={po_no}, Item={item}, 備註包含'分批', 狀態=V)")
                
                old_mask = (
                    (df_buyer["PO No."].str.strip() == po_no) &
                    (df_buyer["Item"].str.strip() == item) &
                    (df_buyer["備註"].str.contains("分批", na=False)) &
                    (df_buyer["開單狀態"] == "V")
                )
                
                deleted_count = old_mask.sum()
                logger.info(f"📊 找到 {deleted_count} 筆符合條件的資料")
                
                if deleted_count == 0:
                    logger.error(f"❌ 找不到要刪除的舊資料")
                    return jsonify({
                        "status": "error",
                        "message": f"找不到要刪除的舊資料 (PO {po_no} - Item {item})"
                    }), 404
                
                # 🎯 取得第一筆舊資料作為範本
                logger.info(f"📋 取得第一筆舊資料作為範本")
                first_old_row = df_buyer[old_mask].iloc[0]
                
                # 📝 記錄被刪除的資料
                deleted_data = []
                for idx, row in df_buyer[old_mask].iterrows():
                    deleted_data.append({
                        "品項": row.get("品項", ""),
                        "交期": row.get("Delivery Date 廠商承諾交期", ""),
                        "SOD": row.get("SOD Qty 廠商承諾數量", ""),
                        "備註": row.get("備註", "")
                    })
                
                logger.info(f"🗑️ 將刪除的資料:")
                for i, d in enumerate(deleted_data, 1):
                    logger.info(f"   第 {i} 筆: {d}")
                
                # 刪除舊資料
                logger.info(f"🗑️ 執行刪除操作...")
                df_buyer = df_buyer[~old_mask]
                logger.info(f"✅ 刪除完成,剩餘 {len(df_buyer)} 筆資料")
                
                # 💰 計算單價
                try:
                    unit_price_str = str(first_old_row.get("單價", "0")).replace(",", "").strip()
                    unit_price = float(unit_price_str) if unit_price_str else 0.0
                    logger.info(f"💰 原始單價: {unit_price}")
                except Exception as e:
                    logger.error(f"❌ 解析單價時發生錯誤: {str(e)}")
                    unit_price = 0.0
                
                # ➕ 準備新資料 (合併後的資料)
                logger.info(f"➕ 開始準備新資料...")
                new_data_rows = []
                
                for idx, row_data in enumerate(xls_data):
                    logger.info(f"   處理第 {idx+1}/{len(xls_data)} 筆新資料...")
                    
                    try:
                        sod_qty = float(row_data.get("sod_qty", 0))
                    except:
                        sod_qty = 0.0
                    
                    sod_qty_formatted = smart_number_format(sod_qty)
                    total_price = unit_price * sod_qty
                    total_price_formatted = smart_number_format(total_price)
                    unit_price_formatted = smart_number_format(unit_price)
                    
                    # 清理備註 (移除「分批」字樣)
                    old_note = first_old_row.get("備註", "")
                    new_note = old_note.replace("分批1/2", "").replace("分批2/2", "").strip()
                    
                    new_row = {
                        "Id": first_old_row.get("Id", ""),
                        "開單狀態": "V",
                        "交貨驗證": first_old_row.get("交貨驗證", ""),
                        "User": first_old_row.get("User", ""),
                        "ePR No.": first_old_row.get("ePR No.", ""),
                        "PO No.": po_no,
                        "Item": item,
                        "品項": row_data.get("description", first_old_row.get("品項", "")),
                        "規格": first_old_row.get("規格", ""),
                        "數量": sod_qty_formatted,
                        "總數": sod_qty_formatted,
                        "單價": unit_price_formatted,
                        "總價": total_price_formatted,
                        "備註": new_note,  # 已移除「分批」字樣
                        "字數": first_old_row.get("字數", ""),
                        "isEditing": "False",
                        "backup": "{}",
                        "_alertedItemLimit": "",
                        "Delivery Date 廠商承諾交期": row_data.get("delivery", ""),
                        "SOD Qty 廠商承諾數量": sod_qty_formatted,
                        "驗收數量": "",
                        "拒收數量": "",
                        "發票月份": "",
                        "WBS": first_old_row.get("WBS", ""),
                        "需求日": first_old_row.get("需求日", ""),
                        "RT金額": "",
                        "RT總金額": "",
                        "驗收狀態": "X"
                    }
                    new_data_rows.append(new_row)
                    logger.info(f"      品項: {new_row['品項']}, SOD: {new_row['SOD Qty 廠商承諾數量']}, 總價: {new_row['總價']}")
                
                logger.info(f"✅ 準備完成 {len(new_data_rows)} 筆新資料")
                
                # 🔴🔴🔴 直接加到最後面 🔴🔴🔴
                logger.info(f"🔥 將新資料添加到最後...")
                df_buyer = pd.concat([
                    df_buyer,
                    pd.DataFrame(new_data_rows)
                ], ignore_index=True)
                logger.info(f"✅ 添加完成,現有 {len(df_buyer)} 筆資料")
                
                # 💾 儲存回檔案
                logger.info(f"💾 開始儲存到 {BUYER_FILE}...")
                df_buyer.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")
                logger.info(f"✅ 儲存完成")
        
        except Timeout:
            logger.error("❌ 無法取得檔案鎖,請稍後再試")
            return jsonify({
                "status": "error",
                "message": "系統忙碌中,請稍後再試"
            }), 503

        # 📝 準備回傳訊息
        success_msg = f"成功合併 PO {po_no} Item {item}: 刪除 {deleted_count} 筆分批資料,新增 {len(new_data_rows)} 筆合併資料"
        
        logger.info("=" * 80)
        logger.info(f"✅ {success_msg}")
        logger.info("=" * 80)

        # 🗑️ 刪除暫存的 CSV 檔案
        cleanup_temp_csv_files(po_no)
        
        return jsonify({
            "status": "success",
            "message": success_msg,
            "deleted_count": int(deleted_count),
            "inserted_count": len(new_data_rows),
            "merge_info": {
                "po_no": po_no,
                "item": item,
                "old_count": int(deleted_count),
                "new_count": len(new_data_rows)
            }
        })
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ confirm_merge 發生嚴重錯誤")
        logger.error(f"❌ 錯誤訊息: {str(e)}")
        logger.error(f"❌ 錯誤類型: {type(e).__name__}")
        logger.error("❌ 完整堆疊追蹤:")
        logger.error(traceback.format_exc())
        logger.error("=" * 80)
        
        return jsonify({
            "status": "error",
            "message": f"合併失敗: {str(e)}"
        }), 500

    
@app.route("/api/save_override_all", methods=["POST"])
def save_override_all():
    """
    Version 31 - 品名優先比對邏輯（已改進處理重複 Item）
    改進：優先以品名相似度為主要比對依據，Item 作為次要參考
    優先順序：同 PO 內的品名高度相似 > Item 相同 > 品名中度相似 > 新增
    """
    # 備份
    # backup_files()
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

    # 🔒 使用檔案鎖保護讀取操作
    try:
        with buyer_file_lock:
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
            logger.info(f"總資料筆數: {len(df_buyer)}, 有效資料(狀態=V): {len(df_active)}")

    except Timeout:
        logger.error("❌ 無法取得檔案鎖,請稍後再試")
        return jsonify({"status": "error", "msg": "系統忙碌中,請稍後再試"}), 503
    except Exception as e:
        logger.error(f"❌ 讀取 Buyer_detail.csv 時發生錯誤: {str(e)}")
        return jsonify({"status": "error", "msg": f"讀取檔案失敗: {str(e)}"}), 500


    # ✅ 🆕 **在這裡添加初始化 all_group_results**
    all_group_results = []  # 用來收集所有 PO 的比對結果

    updated_count = 0
    inserted_count = 0
    failed = []
    need_confirm_items = []  # 需要確認的項目
    auto_updated_items = []  # 🆕 自動更新的項目
    matching_output = []  # 比對結果輸出

    new_item = ''
    epr_no = 0
    po_no_new = ''
    
    # 輸出開始訊息
    logger.info("\n" + "="*80)
    logger.info("開始處理資料比對 (Version 31 - 品名優先)")
    logger.info("="*80)

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
        logger.info(f"\n[第 {row_num} 筆]")
        logger.info(f"  新資料 => PO: {po_no_new}, Item: {item_new}")
        logger.info(f"  品名: {new_desc[:50]}{'...' if len(new_desc) > 50 else ''}")
        
        # 🔍 Version 31 核心改變：先找品名相似度，再考慮 Item
        # 步驟1：先在同 PO 內找資料（只找狀態為 V 的）
        po_group = df_active[df_active["PO No."].apply(lambda x: is_po_in_record(x, po_no_new))]
        
        if not po_group.empty:
            logger.info(f"     在 PO {po_no_new} 找到 {len(po_group)} 筆資料")
            
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
            
            # 🔴🔴🔴 這裡是修改的重點 🔴🔴🔴
            # Version 31 改進：處理相同 Item 的多筆資料
            # 如果有多筆完全相同的 Item，優先考慮品名相似度，再考慮交期
            item_matches = [s for s in similarity_scores if s['item_match']]
            if len(item_matches) > 1:
                logger.info(f"     發現 {len(item_matches)} 筆相同的 Item {item_new}")
                
                # 🆕 計算每筆的品名相似度
                for match in item_matches:
                    match['name_similarity'] = calculate_similarity(new_desc, match['desc'])
                    
                    # 處理交期
                    try:
                        date_str = match['delivery_date'].strip()
                        if date_str:
                            date_str = date_str.split(' ')[0]
                            date_str = date_str.replace('/', '-')
                            match['parsed_date'] = date_str
                        else:
                            match['parsed_date'] = '1900-01-01'
                    except:
                        match['parsed_date'] = '1900-01-01'
                    
                    logger.info(f"       - Index {match['index']}: 品名相似度 {match['name_similarity']:.1f}%, 交期 {match['delivery_date']}")
                
                # 🆕 改進的選擇邏輯
                # 1. 先找品名完全相同或高度相似的（≥95%）
                exact_matches = [m for m in item_matches if m['name_similarity'] >= 95]
                
                if exact_matches:
                    # 如果有品名幾乎相同的，從中選擇交期最新的
                    exact_matches.sort(key=lambda x: x.get('parsed_date', '1900-01-01'), reverse=True)
                    newest_match = exact_matches[0]
                    logger.info(f"     => ✅ 選擇品名相同且交期最新的資料")
                    logger.info(f"        Index {newest_match['index']}")
                    logger.info(f"        品名相似度: {newest_match['name_similarity']:.1f}%")
                    logger.info(f"        交期: {newest_match['delivery_date']}")
                else:
                    # 如果沒有品名相同的，選擇品名最相似的（但要警告）
                    item_matches.sort(key=lambda x: (x['name_similarity'], x.get('parsed_date', '1900-01-01')), reverse=True)
                    newest_match = item_matches[0]
                    
                    if newest_match['name_similarity'] < 60:
                        logger.info(f"     => ⚠️⚠️ 警告：相同 Item 但品名差異很大！")
                        logger.info(f"        Index {newest_match['index']}")
                        logger.info(f"        品名相似度僅: {newest_match['name_similarity']:.1f}%")
                        logger.info(f"        原品名: {newest_match['desc'][:50]}...")
                        logger.info(f"        新品名: {new_desc[:50]}...")
                        logger.info(f"        建議手動檢查！")
                    else:
                        logger.info(f"     => ⚠️ 選擇品名最相似的資料")
                        logger.info(f"        Index {newest_match['index']}")
                        logger.info(f"        品名相似度: {newest_match['name_similarity']:.1f}%")
                
                # 將選中的資料移到 similarity_scores 的最前面
                similarity_scores = [s for s in similarity_scores if not s['item_match']]
                similarity_scores.insert(0, newest_match)
            else:
                # 排序：先按相似度排序，相似度相同時 Item 相同的優先
                similarity_scores.sort(key=lambda x: (x['similarity'], x['item_match']), reverse=True)
            # 🔴🔴🔴 修改結束 🔴🔴🔴
            
            # 輸出相似度排名（除錯用）
            logger.info(f"     品名相似度排名：")
            for i, score in enumerate(similarity_scores[:3], 1):  # 顯示前3名
                item_marker = " [Item相同]" if score['item_match'] else ""
                logger.info(f"       {i}. Item {score['item']}: {score['similarity']:.1f}%{item_marker} - {score['desc'][:30]}...")
            
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
                    logger.info(f"  ✅ 品名完全相同且 Item 相同（相似度 {best_similarity:.1f}%） => 直接更新")
                    
                    # 🆕 加入自動更新清單
                    auto_updated_items.append({
                        "row": row_num,
                        "po_no": po_no_new,
                        "new_item": item_new,
                        "old_item": best_item,
                        "new_desc": new_desc,
                        "old_desc": best_desc,
                        "similarity": round(best_similarity, 1),
                        "new_delivery": new_delivery,
                        "new_qty": new_qty,
                        "target_index": int(best_idx),
                        "reason": "品名與Item完全相同",
                        "action_type": "auto_updated"
                    })
                else:
                    match_reason = f"品名完全相同(Item:{best_item}→{item_new})"
                    logger.info(f"  ⚠️ 品名完全相同但 Item 不同（{best_item} → {item_new}）")
                    logger.info(f"     品名相似度: {best_similarity:.1f}%")
                    
                    if not confirm_override:
                        logger.info(f"     需要確認是否要更新 Item")
                        
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
                        logger.info(f"     => 已確認，將更新 Item")
                        
            elif best_similarity >= 80:  # 品名高度相似
                target_idx = best_idx
                if best_item == item_new:
                    match_reason = f"品名高度相似+Item相同({best_similarity:.0f}%)"
                    logger.info(f"  ✅ 品名高度相似且 Item 相同（{best_similarity:.1f}%） => 直接更新")
                    
                    # 🆕 加入自動更新清單
                    auto_updated_items.append({
                        "row": row_num,
                        "po_no": po_no_new,
                        "new_item": item_new,
                        "old_item": best_item,
                        "new_desc": new_desc,
                        "old_desc": best_desc,
                        "similarity": round(best_similarity, 1),
                        "new_delivery": new_delivery,
                        "new_qty": new_qty,
                        "target_index": int(best_idx),
                        "reason": f"品名高度相似({best_similarity:.0f}%)且Item相同",
                        "action_type": "auto_updated"
                    })
                else:
                    match_reason = f"品名高度相似(Item:{best_item}→{item_new})"
                    logger.info(f"  ⚠️ 品名高度相似但 Item 不同（{best_item} → {item_new}）")
                    logger.info(f"     品名相似度: {best_similarity:.1f}%")
                    logger.info(f"     原品名: {best_desc[:40]}...")
                    logger.info(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        logger.info(f"     需要確認是否要更新")
                        
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
                        logger.info(f"     => 已確認，將更新")
                        
            elif best_similarity >= 60:  # 品名中度相似
                # 檢查是否有 Item 相同的項目
                item_match = next((s for s in similarity_scores if s['item_match']), None)
                
                if item_match and item_match['similarity'] >= 40:
                    # 如果有 Item 相同且相似度不是太低，優先選擇 Item 相同的
                    target_idx = item_match['index']
                    match_reason = f"Item相同+品名相似({item_match['similarity']:.0f}%)"
                    logger.info(f"  ⚠️ 找到 Item 相同的項目，品名相似度 {item_match['similarity']:.1f}%")
                    logger.info(f"     原品名: {item_match['desc'][:40]}...")
                    logger.info(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        logger.info(f"     需要確認是否要更新")
                        
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
                        logger.info(f"     => 已確認，將更新")
                else:
                    # 品名中度相似，Item 不同
                    target_idx = best_idx
                    match_reason = f"品名中度相似({best_similarity:.0f}%)"
                    logger.info(f"  ⚠️ 品名中度相似，Item 不同（{best_item} → {item_new}）")
                    logger.info(f"     相似度: {best_similarity:.1f}%")
                    logger.info(f"     原品名: {best_desc[:40]}...")
                    logger.info(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        logger.info(f"     需要確認")
                        
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
                        logger.info(f"     => 已確認，將更新")
                        
            else:  # 相似度 < 60%
                # 檢查是否有 Item 完全相同的
                item_match = next((s for s in similarity_scores if s['item_match']), None)
                
                if item_match:
                    # Item 相同但品名相似度低
                    logger.info(f"  ⚠️ 找到 Item 相同但品名差異很大（相似度 {item_match['similarity']:.1f}%）")
                    logger.info(f"     原品名: {item_match['desc'][:40]}...")
                    logger.info(f"     新品名: {new_desc[:40]}...")
                    
                    if not confirm_override:
                        logger.info(f"     ⚠️⚠️ 品名差異很大！需要確認")
                        
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
                        logger.info(f"     => 已確認，將強制更新")
                else:
                    # 沒有任何匹配，建議新增
                    target_idx = None
        
        # 步驟2：如果在同 PO 內找不到匹配，詢問是否新增
        if target_idx is None and not po_group.empty:
            logger.info(f"  ⚠️  在 PO {po_no_new} 內找不到相似的品名或相同的 Item")
            logger.info(f"     新Item: {item_new}, 新品名: {new_desc[:40]}...")
            
            if not confirm_override:
                logger.info(f"     需要確認是否要新增為新項目")
                
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
                logger.info(f"     => 已確認，將新增為新項目")
        
        # 步驟3：其他比對方式（ID、模糊比對等）- 只找狀態為 V 的
        if target_idx is None and id_:
            candidates = df_active[df_active["Id"] == id_].copy()
            
            if len(candidates) > 1:
                candidates["品項_clean"] = candidates["品項"].apply(clean_text)
                exact_match = candidates[candidates["品項_clean"] == new_desc_clean]
                if len(exact_match) == 1:
                    target_idx = exact_match.index[0]
                    match_reason = "ID+品項匹配"
                    logger.info(f"  ✅ ID+品項匹配 => 更新資料 (狀態=V)")
            elif len(candidates) == 1:
                target_idx = candidates.index[0]
                match_reason = "ID匹配"
                logger.info(f"  ✅ ID匹配 => 更新資料 (狀態=V)")

        # 步驟4：PO + 品項模糊比對 - 只找狀態為 V 的
        if target_idx is None:
            po_match = df_active[df_active["PO No."].apply(lambda x: is_po_in_record(x, po_no_new))]
            po_match = po_match[po_match["品項"].apply(lambda x: fuzzy_in(x, new_desc_clean))]

            if not po_match.empty:
                target_idx = po_match.index[0]
                match_reason = "PO+品項模糊匹配"
                logger.info(f"  ✅ PO+品項模糊匹配 => 更新資料 (狀態=V)")

        # 🔍 如果找到匹配項目，執行更新
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
                logger.info(f"     PO變更: {old_values['po']} → {po_no_new}")
            if old_values["item"] != item_new:
                logger.info(f"     Item變更: {old_values['item']} → {item_new}")
            if old_values["delivery"] != new_delivery:
                logger.info(f"     交期變更: {old_values['delivery']} → {new_delivery}")
            if old_values["qty"] != new_qty:
                logger.info(f"     數量變更: {old_values['qty']} → {new_qty}")
            
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
                logger.info(f"  ⚠️  找到 PO {po_no_new} 但狀態為 X（已取消），無法更新")
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
                logger.info(f"  ❌ 360表單無此項目：PO {po_no_new}")
                
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
        
        # 🆓 推測 Id（取首筆）
        possible_ids = po_matches["Id"].dropna().unique().tolist()
        id_ = possible_ids[0] if possible_ids else row.get("id") or row.get("Id", "")
        id_ = str(id_).strip()

        # 👤 取同組第一筆的資訊
        user = po_matches["User"].iloc[0] if not po_matches.empty else ""
        epr_no = po_matches["ePR No."].iloc[0] if not po_matches.empty else ""
        wbs_no = po_matches["WBS"].iloc[0] if not po_matches.empty else ""
        need_day_no = po_matches["需求日"].iloc[0] if not po_matches.empty else ""

        logger.info(f"  🆕 找不到匹配項目 => 新增資料")
        logger.info(f"     新增到 ePR No.: {epr_no}")

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
    logger.info("\n" + "="*80)
    logger.info("比對結果摘要 (Version 31 - 品名優先)")
    logger.info("="*80)
    logger.info(f"總處理筆數: {len(rows)}")
    logger.info(f"更新筆數: {updated_count}")
    logger.info(f"新增筆數: {inserted_count}")
    logger.info(f"失敗筆數: {len(failed)}")
    logger.info(f"待確認筆數: {len(need_confirm_items)}")
    logger.info(f"自動更新筆數: {len(auto_updated_items)}")  # 
    
    # 輸出詳細比對表格
    if matching_output:
        logger.info("\n詳細比對結果:")
        logger.info("-"*80)
        logger.info(f"{'筆數':<5} {'PO No.':<15} {'Item':<10} {'比對方式':<20} {'處理':<8} {'備註'}")
        logger.info("-"*80)
        for item in matching_output:
            logger.info(f"{item['row']:<5} {item['po']:<15} {item['item']:<10} {item['match']:<20} {item['action']:<8} {item['note']}")
    
    logger.info("="*80 + "\n")

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
            "auto_updated": auto_updated_items,  # 🆕 新增自動更新的項目
            "updated": updated_count,
            "inserted": inserted_count,
            "matching_output": matching_output,
            "has_critical": len(critical_items) > 0,
            "has_warning": len(warning_items) > 0
        }))

    # 🔒 使用檔案鎖保護儲存操作
    try:
        with buyer_file_lock:
            # 儲存回檔案
            df_buyer.to_csv(BUYER_FILE, index=False, encoding="utf-8-sig")
    except Timeout:
        logger.error("❌ 無法取得檔案鎖進行儲存,請稍後再試")
        return jsonify({"status": "error", "msg": "系統忙碌中,無法儲存,請稍後再試"}), 503
    except Exception as e:
        logger.error(f"❌ 儲存 Buyer_detail.csv 時發生錯誤: {str(e)}")
        return jsonify({"status": "error", "msg": f"儲存檔案失敗: {str(e)}"}), 500
    
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
            "matching_output": matching_output,
            "auto_updated": auto_updated_items  # 🆕 也在成功時回傳
        }))
    else:
        return jsonify(convert_to_json_serializable({
            "status": "ok",
            "msg": f"✅ 更新 {updated_count} 筆，新增 {inserted_count} 筆",
            "failed": failed,
            "matching_output": matching_output,
            "auto_updated": auto_updated_items  # 🆕 也在成功時回傳
        }))
    



if __name__ == "__main__":
    app.run(debug=True)

