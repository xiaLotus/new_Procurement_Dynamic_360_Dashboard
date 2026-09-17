import pandas as pd
import os

# 定義輸入和輸出的檔案名稱
input_file = "KL_(Security C).xlsx"
output_file = "KL_(Security C).csv"

# 檢查輸入檔案是否存在
if not os.path.exists(input_file):
    print(f"錯誤：找不到檔案 '{input_file}'，請確認檔案名稱和路徑是否正確。")
else:
    try:
        # 讀取 Excel 檔案
        print(f"正在讀取 {input_file} ...")
        df = pd.read_excel(input_file)
        
        # 轉換並儲存為 CSV 檔案
        # index=False: 不包含資料框的索引列
        # encoding='utf-8-sig': 確保 Excel 開啟時中文不會亂碼
        # mode='w': 寫入模式，會直接覆蓋（移除）舊的同名 CSV 檔案
        df.to_csv(output_file, index=False, encoding='utf-8-sig')
        
        print(f"轉換成功！已儲存為: {output_file}")
        
    except Exception as e:
        print(f"轉換過程中發生錯誤: {e}")