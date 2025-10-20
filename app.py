
import sys
# 更換
package_path = r".\python-3.10.1-embed-amd64\Lib\site-packages"
if package_path not in sys.path:
    sys.path.append(package_path)
from datetime import datetime
import glob
import json
import os
import re
import uuid
from filelock import FileLock
from selenium import webdriver
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
import time
import requests
from loguru import logger
import pandas as pd
from datetime import datetime
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import configparser
import shutil
from datetime import datetime

logger.add(
    "logs/ePR.log", 
    format="{time:YYYY-MM-DD HH:mm:ss} - {level} - {message}", 
    encoding="utf-8-sig", 
    rotation="100 MB"
)

current_dir = os.path.abspath(os.path.dirname(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

download_path = os.path.join(os.getcwd(), "downloads")
os.makedirs(download_path, exist_ok=True)

def backup_files():
    """在執行前分別備份 CSV 到對應的 backup 子資料夾"""
    base_backup_dir = "backup"
    os.makedirs(base_backup_dir, exist_ok=True)

    files_to_backup = {
        "Planned_Purchase_Request_List.csv": "Planned_Purchase_Request_List",
        "Buyer_detail.csv": "Buyer_detail"
    }

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for file_name, subfolder in files_to_backup.items():
        if os.path.exists(file_name):
            # 建立子資料夾
            folder_path = os.path.join(base_backup_dir, subfolder)
            os.makedirs(folder_path, exist_ok=True)

            # 加上時間戳記
            backup_name = f"{os.path.splitext(file_name)[0]}_{timestamp}.csv"
            backup_path = os.path.join(folder_path, backup_name)

            try:
                shutil.copy2(file_name, backup_path)
                logger.info(f"✅ 已備份 {file_name} → {backup_path}")
            except Exception as e:
                logger.error(f"❌ 備份 {file_name} 失敗: {e}")
        else:
            logger.warning(f"⚠️ 找不到檔案 {file_name}，略過備份")

def read_user_config(file_path="user.ini"):
    """使用 RawConfigParser 避免 % 符號問題"""
    try:
        config = configparser.RawConfigParser() 
        config.read(file_path, encoding='utf-8-sig')
        
        account = config.get('DEFAULT', 'account')
        password = config.get('DEFAULT', 'password')
        
        return account, password
        
    except Exception as e:
        logger.error(f"讀取設定檔失敗：{e}")
        return None, None
    

def open_driver(account, password):
    service = Service("msedgedriver.exe")
    options = webdriver.EdgeOptions()
    edge_options = Options()
    edge_options.add_experimental_option("prefs", {
        "download.default_directory": download_path,
        "download.prompt_for_download": False,
    })
    driver = webdriver.Edge(service=service, options=edge_options)
    # edge跳轉進入
    driver.get(f'https://{account}:{password}%@myasex.kh.asegroup.com')
   # 最大化視窗
    driver.maximize_window()
    # 等待 5 秒
    time.sleep(5)
    # 找到按鈕的ID
    check_enter = driver.find_element(By.ID, 'cboxClose')
    # 點開按鈕
    check_enter.click()
    return driver


def enter_ePR(driver, today):
    driver.get("https://khwfap.kh.asegroup.com/ePR/zh-TW/PRQuery/QueryPR")
    try:
        FT01_input = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "txtDEPTID"))
        )
        FT01_input.clear()
        FT01_input.send_keys("FT01")

        txt_from = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "txtFrom"))
        )
        txt_from.clear()
        txt_from.send_keys("2024-01-01")

        txt_to = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "txtTo"))
        )
        txt_to.clear()
        txt_to.send_keys(today)

        submit_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.NAME, "SubmitRequestMainBtn"))
        )
        
        driver.execute_script("arguments[0].scrollIntoView();", submit_btn)
        time.sleep(1)

        submit_btn.click()

        logger.info("等待載入遮罩消失...")
        WebDriverWait(driver, 30).until(
            EC.invisibility_of_element_located((By.CSS_SELECTOR, "div.load"))
        )
        logger.info("載入遮罩已消失")
        
        # 然後找到下載按鈕並點擊
        download_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "Download"))
        )
        
        # 滾動到按鈕位置
        driver.execute_script("arguments[0].scrollIntoView();", download_btn)
        time.sleep(1)
        
        # 點擊下載按鈕
        download_btn.click()
        logger.info("下載按鈕點擊成功！")

        time.sleep(10)  # 根據檔案大小調整等待時間
        
        logger.info(f"檔案已下載到：{download_path}")
        return driver
    except Exception as e:
        logger.error(e)

def clean_nan_value(val):
    """清理 nan 值，轉換為空字串"""
    if pd.isna(val) or str(val).strip().lower() in ['nan', 'none']:
        return ""
    return str(val).strip()


def api_status_upload():
    CSV_FILE = "Planned_Purchase_Request_List.csv"
    DETAIL_CSV_FILE = "Buyer_detail.csv"
    DOWNLOAD_FILE = "downloads/download.csv"

    # 強制將 crdownload 檔案改名
    try:
        import os
        os.rename("downloads/download.csv.crdownload", DOWNLOAD_FILE)
    except Exception as e:
        logger.warning(f"無法重新命名下載檔案: {e}")

    lock = FileLock(f"{CSV_FILE}.lock")

    def clean_nan_value(val):
        if pd.isna(val) or str(val).strip().lower() in ['nan', 'none']:
            return ""
        return str(val).strip()

    
    with lock:
        try:
            df = pd.read_csv(DOWNLOAD_FILE, dtype=str)
            df.columns = [col.strip() for col in df.columns]

            updates = []
            for _, row in df.iterrows():
                epr_no = clean_nan_value(row.get('E-PR號碼', ''))
                status = clean_nan_value(row.get('狀態', ''))
                stage = clean_nan_value(row.get('簽核中關卡', ''))
                sap_po = clean_nan_value(row.get('SAP PO', ''))
                if epr_no:
                    updates.append({
                        'epr_no': epr_no,
                        '狀態': status,
                        '簽核中關卡': stage,
                        'SAP PO': sap_po
                    })

            main_df = pd.read_csv(CSV_FILE, dtype=str)
            main_df.columns = [col.strip() for col in main_df.columns]

            updated_count = 0
            no_change_count = 0

            for upd in updates:
                epr = upd['epr_no']
                match = main_df['ePR No.'].astype(str).str.strip() == epr
                if match.any():
                    idx = main_df[match].index[0]
                    old_id = clean_nan_value(main_df.at[idx, 'Id'])
                    old_status = clean_nan_value(main_df.at[idx, 'Status'])
                    old_stage = clean_nan_value(main_df.at[idx, '簽核中關卡'])
                    new_status = upd['狀態']
                    new_stage = upd['簽核中關卡']
                    main_df.at[idx, '開單狀態'] = 'V'

                    if old_status != new_status or old_stage != new_stage:
                        logger.info(f"[預計請購表單更新] {old_id} [更新] ePR No.={epr}")
                        logger.info(f"[預計請購表單更新] Status: {old_status} → {new_status}")
                        logger.info(f"[預計請購表單更新] 簽核中關卡: {old_stage} → {new_stage}")
                        main_df.at[idx, 'Status'] = new_status
                        main_df.at[idx, '簽核中關卡'] = new_stage
                        main_df.at[idx, '開單狀態'] = 'V'
                        updated_count += 1
                    else:
                        no_change_count += 1

            main_df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig')
            logger.info(f"[預計請購表單更新]  實際更新共: {updated_count} 筆")
            logger.info(f"[預計請購表單更新]  無需更新共: {no_change_count} 筆")
            logger.info(f"[預計請購表單更新]  總計處理共: {updated_count + no_change_count} 筆")


            df_detail = pd.read_csv(DETAIL_CSV_FILE, dtype=str)
            df_detail.columns = [col.strip() for col in df_detail.columns]




            detail_updated_count = 0
            detail_unupdated_count = 0

            for upd in updates:
                epr = upd['epr_no']
                sap_po = upd['SAP PO']

                match_main = main_df['ePR No.'].astype(str).str.strip() == epr
                
                if not match_main.any():
                    continue

                main_id = main_df.loc[match_main, 'Id'].values[0]  # type: ignore

                match_detail = df_detail['Id'].astype(str).str.strip() == main_id
                for idx in df_detail[match_detail].index:
                    has_changed = False
                    id_str = main_id
                    change_logs = []

                    # 檢查 PO No.
                    old_po = df_detail.at[idx, 'PO No.']
                    if (pd.isna(old_po) or str(old_po).strip().lower() in ['none', 'nan']) and sap_po:
                        change_logs.append(f"PO No.: {old_po} → {sap_po}")
                        df_detail.at[idx, 'PO No.'] = sap_po
                        has_changed = True

                    # 檢查 ePR No.
                    old_epr = df_detail.at[idx, 'ePR No.']
                    if old_epr != epr:
                        change_logs.append(f"ePR No.: {old_epr} → {epr}")
                        df_detail.at[idx, 'ePR No.'] = epr
                        has_changed = True

                    # 開單狀態
                    old_open = df_detail.at[idx, '開單狀態']
                    if old_open != 'V':
                        change_logs.append(f"開單狀態: {old_open} → V")
                        df_detail.at[idx, '開單狀態'] = 'V'
                        has_changed = True

                    if has_changed:
                        logger.info(f"[Detail更新] Id={id_str}, 變更欄位: {' | '.join(change_logs)}")
                        detail_updated_count += 1
                    else:
                        detail_unupdated_count += 1

            # 儲存結果
            df_detail.to_csv(DETAIL_CSV_FILE, index=False, encoding='utf-8-sig')
            logger.info(f"[Detail更新]  實際更新共: {detail_updated_count} 筆")
            logger.info(f"[Detail更新]  無須更新共: {detail_unupdated_count} 筆")
            logger.info(f"[Detail更新]  總計處理共: {detail_updated_count + detail_unupdated_count} 筆")


        except Exception as e:
            logger.error(f"Exception: {e}")



def del_download_file(download_folder="downloads"):
    files = glob.glob(os.path.join(download_folder, "*"))
    try:
        if not os.path.exists(download_folder):
            logger.info(f"資料夾 {download_folder} 不存在")
            return False
        
        deleted_count = 0
        for file_path in files:
            if os.path.isfile(file_path): 
                try:
                    os.remove(file_path)
                    logger.info(f"已刪除：{file_path}")
                    deleted_count += 1
                except Exception as e:
                    logger.info(f"刪除失敗 {file_path}：{e}")
        logger.info(f"總共刪除了 {deleted_count} 個檔案")
        return True
    
    except Exception as e:
        logger.error(f"刪除檔案時發生錯誤：{e}")
        return False

def format_duration(seconds):
    """格式化執行時間"""
    if seconds < 60:
        return f"{seconds:.2f} 秒"
    elif seconds < 3600:
        minutes, secs = divmod(seconds, 60)
        return f"{int(minutes)} 分 {secs:.1f} 秒"
    else:
        hours, remainder = divmod(seconds, 3600)
        minutes, secs = divmod(remainder, 60)
        return f"{int(hours)} 小時 {int(minutes)} 分 {secs:.1f} 秒"

if __name__ == "__main__":
    logger.info("======================================================")
    start_time = time.time()
    backup_files()
    file_path = r"D:\Data\ePR_data\user.ini"
    account, password = read_user_config(file_path)
    driver = open_driver(account, password)
    today = datetime.now().strftime("%Y-%m-%d")
    # 跳轉 ePR
    driver = enter_ePR(driver, today)
    time.sleep(3)
    driver.quit()
    api_status_upload()
    del_download_file()
    time.sleep(1)
    end_time = time.time()
    logger.info(f"總運行時間: {format_duration(end_time - start_time)}")
    logger.info("======================================================")