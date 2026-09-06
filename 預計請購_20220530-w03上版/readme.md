# 修改紀錄：Log 系統重構與路徑統一

> 日期：2026/08/02
> 範圍：Log 集中化設定、分層日期輪轉、郵件內容記錄、app.py 路徑常數統一

---

## 一、異動檔案總覽

| 檔案 | 狀態 | 放置位置 |
|---|---|---|
| `config.ini` | 🆕 新增 | 與 app.py 同層級 |
| `log_config.py` | 🆕 新增 | 與 app.py 同層級 |
| `app.py` | ✏️ 修改 | 原位置覆蓋 |
| `parse.py` | ✏️ 修改 | `acceptanceWeb/parse.py` 覆蓋 |
| `acceptanceMail.py` | ✏️ 修改 | `MailFunction/acceptanceMail.py` 覆蓋 |
| `normail.py` | ✏️ 修改 | `MailFunction/normail.py` 覆蓋 |
| `urgent.py` | ✏️ 修改 | `MailFunction/urgent.py` 覆蓋 |

### 前端檔案（HTML / JS）異動狀況

本次修改**皆為後端內部調整**，未變更任何 API 的路由名稱、HTTP 方法、參數或回傳格式，
因此**所有 HTML 與 JS 檔案均無更動、不需重新部署**。已逐項確認無影響的前端檔案如下：

| 前端檔案 | 對應後端修改 | 狀態 |
|---|---|---|
| `eRT_page.html` / `eRT.js` | upload_buyer_detail（物料收貨 xlsx 上傳）內部 log 與路徑常數調整 | ✅ 無更動 |
| `eHubUploadFile.html` / `eHub.js`、`batch_adjustment.js`、`mergeConfirmation.js` | eHub 比對/分批/合併的 log 分流與 UPLOAD_DIR 統一 | ✅ 無更動 |
| `MaterialReceivingNoteUpload.html` | MHTML 上傳區段移除重複 logging 設定 | ✅ 無更動 |
| `accCheck.html` / `accCheck.js`、`sendAccMail.html` / `accMail.js` | 驗收信系統 log 分流至 acc_mail | ✅ 無更動 |
| `Mail.html` / `mail.js` | 寄信系統 log 分流至 mail_send + 郵件內容記錄 | ✅ 無更動 |
| `Supervisor_review.html` / `supervisor_review.js` | 長官審核 log 沿用 app logger | ✅ 無更動 |
| `Procurement_Dynamic_360_Dashboard.html` / `Planned_Purchase_Request_List.js` | 路徑常數統一（CSV_FILE 等） | ✅ 無更動 |
| `Member_manager.html` / `Member_manager.js` | 成員管理區段 CONFIG_FILE / PHONE_FILE 常數移至檔案開頭 | ✅ 無更動 |
| `Message_Board.html` / `Message_Board.js` | 留言板 mb_logger 維持原樣、未納入新架構 | ✅ 無更動 |
| `Monthly_expense_analysis.html` / `month_expensive_analysis.js`、`Can.html` / `can.js`、`index.html` / `login.js`、`merge_confirmation.html`、`batch_adjustment.html` | 未涉及 | ✅ 無更動 |

> ⚠️ 唯一的前端**建議修改**（本次未套用，見第六章）：`eRT.js` 的 `autoUpload()`（約 line 5886）
> 錯誤處理可帶出後端 `message` 訊息，屬體驗優化、非必要，不改也能正常運作。

---

## 二、新的 Log 架構

### 目錄結構

```
Log/
├── app/app_2026_08_02.log             ← app.py 主體（eRT / eHub / 長官審核 / 物料收貨單 等）
├── acc_mail/acc_mail_2026_08_02.log   ← 驗收信系統（parse.py + acceptanceMail.py）
├── mail_send/mail_send_2026_08_02.log ← 寄信系統（normail.py + urgent.py）
└── access/access_2026_08_02.log       ← werkzeug HTTP 請求記錄（與業務 log 分開）
```

- 檔名格式：`{功能}_yyyy_mm_dd.log`，日期為該檔「起始日」
- 留言板（message_board）**維持原本獨立設定**，不納入此架構

### 輪轉規則（由 config.ini 控制）

| 項目 | 設定值 | 說明 |
|---|---|---|
| `rotate_days` | 7 | 每滿 7 天自動換一個以當天日期命名的新檔 |
| `backup_count` | 52 | 保留 52 份（約 1 年），超過自動刪除最舊的 |
| `level` | INFO | 記錄層級 |
| `log_dir` | Log | 根資料夾 |

- 服務**重啟時沿用** 7 天內的最新日期檔續寫，不會每次重啟都開新檔
- 清理舊檔時只認自己前綴的 `.log`，不會誤刪其他檔案
- 子資料夾由程式自動建立，不需手動建

### 分層命名規則

`config.ini [LOG_FILES]` 的每個 key 是一個「頂層 logger」；子模組使用 `父名稱.子名稱` 命名，
log 自動寫入父層檔案，每行帶 `[來源名稱]` 標記：

| Logger 名稱 | 來源檔案 | 寫入位置 |
|---|---|---|
| `app` | app.py 主體（既有 385 個呼叫沿用） | Log/app/ |
| `acc_mail.parse` | acceptanceWeb/parse.py | Log/acc_mail/ |
| `acc_mail.send` | MailFunction/acceptanceMail.py | Log/acc_mail/ |
| `mail_send.normal` | MailFunction/normail.py | Log/mail_send/ |
| `mail_send.urgent` | MailFunction/urgent.py | Log/mail_send/ |
| `werkzeug` | Flask HTTP access log | Log/access/ |

未來擴充：config.ini 加一行（如 `ehub = ehub`），程式用 `get_logger('ehub')` 即完成分流，log_config.py 不用改。

---

## 三、各檔案修改明細

### 1. `config.ini`（新增）

- `[LOG]`：log 根資料夾、輪轉天數、保留份數、記錄層級
- `[LOG_FILES]`：logger 名稱 → 功能資料夾對照（app / acc_mail / mail_send / werkzeug）

### 2. `log_config.py`（新增）

- `setup_logging()`：讀取 config.ini，為每個頂層 logger 建立獨立的輪轉 handler；重複呼叫不會重複掛載（防 Flask reloader 造成 log 重複）
- `get_logger(name)`：統一取 logger 的入口
- `DatedPeriodFileHandler`：自訂輪轉 handler
  - 檔名 `{功能}_yyyy_mm_dd.log`（Python 內建 TimedRotatingFileHandler 無法讓寫入中的檔案以日期命名，故自訂）
  - 滿週期自動換檔、重啟沿用未滿週期的檔、自動清理超量舊檔
- 各頂層 logger `propagate = False`，彼此完全隔離、不混入 root

### 3. `app.py`（3 處 Log 修改 + 路徑統一）

#### Log 相關（3 處）

| 位置 | 修改內容 |
|---|---|
| Line 18–21（開頭 import 區） | 加入 `from log_config import setup_logging, get_logger`、`setup_logging()`、`logger = get_logger('app')` |
| 原 eRT 區段（約 line 3073） | 移除整段舊的 TimedRotatingFileHandler 設定（含被註解的 basicConfig），換為一行說明註解 |
| 原物料收貨單區段（約 line 3473） | 移除重複的 `logging.basicConfig(level=DEBUG)` + `getLogger(__name__)`，換為一行說明註解 |

- 既有 385 個 `logger.*` 呼叫**全部沿用不改**，統一流向 `Log/app/`
- 留言板 `mb_logger` 區塊**原樣未動**
- 附帶解決：werkzeug HTTP access log 不再混入業務 log（分流至 Log/access/）

#### 路徑統一（共約 40 處）

檔案開頭常數區新增 4 個常數，並將全檔相同路徑的重複定義/硬編碼統一：

```python
CONFIG_FILE = "config.cfg"
PHONE_FILE = "static/data/phone.json"
DELIVERY_RECEIPT_FILE = "static/data/delivery_receipt.csv"
UPLOAD_DIR = "uploads"
```

| 相同路徑 | 統一前 | 統一後 |
|---|---|---|
| Buyer_detail.csv | 4 個名字並存：`BUYER_FILE`、`BUYER_CSV_PATH`（16 處）、`DETAIL_CSV_FILE`（3 處）、`detail_file` 硬編碼（3 處） | 全部 → `BUYER_FILE` |
| Backend_data.json | `BACKEND_DATA` + 9 處硬編碼字串（含 `get_notes_email` 預設參數） | 全部 → `BACKEND_DATA` |
| config.cfg | 常數定義在檔案尾端 + line 652 硬編碼 | 定義移至開頭 → `CONFIG_FILE` |
| phone.json | 常數定義在檔案尾端 + line 1374 硬編碼 | 定義移至開頭 → `PHONE_FILE` |
| delivery_receipt.csv | 3 處硬編碼 | 全部 → `DELIVERY_RECEIPT_FILE` |
| uploads 資料夾 | `uploads_dir` 硬編碼、2 處 f-string、`app.config['UPLOAD_FOLDER']` | 全部 → `UPLOAD_DIR` |

- 成員管理區段原本的 `CONFIG_FILE` / `PHONE_FILE` 重複定義已移除，換成指引註解
- 附帶修正：原 line 445 在 `BUYER_CSV_PATH` 定義之前就使用它的順序隱患，統一後消失
- 之後要搬移任何檔案位置，只需改開頭常數區一行，全站生效

### 4. `parse.py`（1 處）

```python
# 原本
import logging
logger = logging.getLogger(__name__)

# 改為
from log_config import get_logger
logger = get_logger('acc_mail.parse')
```

- 既有 11 個 `logger.*` 呼叫不變，自動改寫入 `Log/acc_mail/`

### 5. `acceptanceMail.py`（3 處）

- import 區加入 `from log_config import get_logger` + `logger = get_logger('acc_mail.send')`
- 主旨設定後新增**郵件內容記錄段**：收件人(To)、副本(CC)、主旨（含自動判斷的驗收/領料類型）、料件總筆數與 PO 清單，並**逐筆列出每個料件**（PO、Item、品項、數量、RT No.、需求者、ePR No.、領料人、備註）
- 寄信成功/失敗的 `print` 改為 `logger.info` / `logger.error`，訊息帶上 PO No.、料件筆數、收件者人數

### 6. `normail.py`（3 處）

- import 區加入 `logger = get_logger('mail_send.normal')`
- 主旨設定後新增**郵件內容記錄段**：收件人、副本、主旨、請購內容一行（ePR No.、需求者、請購項目、需求原因、總金額、需求日、ePR 狀態、簽核中關卡、備註）
- 成功/失敗訊息升級：帶上 ePR No. 與收件者人數

### 7. `urgent.py`（3 處）

- 與 normail.py 相同改法，logger 名稱為 `mail_send.urgent`

> 郵件內容記錄段插在主旨設定之後、組 HTML 之前——就算後續寄信失敗，log 也已留有「當時要寄什麼、寄給誰」的完整記錄。取值全部使用 `.get()`，缺欄位不會導致寄信中斷。

---

## 四、Log 輸出範例

```
2026-08-02 12:23:22 INFO [mail_send.urgent]: 📧 準備發送【超急件】請購通知郵件
2026-08-02 12:23:22 INFO [mail_send.urgent]:    收件人(To): a@aseglobal.com,b@aseglobal.com
2026-08-02 12:23:22 INFO [mail_send.urgent]:    副本(CC): c@aseglobal.com
2026-08-02 12:23:22 INFO [mail_send.urgent]:    主旨: << ePR單 - 2607010123 >> 等級：超急件 延長線需求請購申請 ...
2026-08-02 12:23:22 INFO [mail_send.urgent]:    內容: ePR No.=2607010123, 需求者=..., 請購項目=..., 總金額=15000, ...
2026-08-02 12:23:22 INFO [mail_send.urgent]: ✅ 郵件發送成功 (ePR No.=2607010123, 共 3 位收件者)
```

---

## 五、部署與驗證

1. 依「異動檔案總覽」放置 7 個檔案
2. 重啟 Flask
3. 確認 `Log/app/app_YYYY_MM_DD.log` 第一行出現：
   `🔄 Log 系統已啟動（設定檔：...，輪轉週期：7 天，保留 52 份）`
4. 舊的 `Log/buyer_detail_update.log` 不會再被寫入，確認新系統正常後可自行封存或刪除

---

## 六、本次順帶處理的其他問題

### xlrd 版本錯誤（eRT 物料收貨 xlsx 上傳）

- 錯誤：`Pandas requires version '2.0.1' or newer of 'xlrd' (version '1.2.0' currently installed)`
- 原因：`pip install xlrd` 看到已裝 1.2.0 即視為滿足，不會升級
- 解法：`pip install --upgrade xlrd`
- 可安全升級：xlrd 2.x 只讀 .xls；程式邏輯本來就是 `.xlsx` 走 openpyxl、`.xls` 走 xlrd，正好配合分工，不需改程式碼

### eRT 物料收貨上傳（/api/update_delivery_receipt → upload_buyer_detail）欄位對照

- Excel 必要 5 欄（表頭需完全一致）：`PONO`、`品名`、`驗收數量`、`拒收數量`、`收料日期`
- 比對鍵：`PONO` ↔ `PO No.` ＋ `品名` ↔ `品項`（雙鍵完全匹配）
- 實際更新 Buyer_detail.csv 的 3 欄：`驗收數量`、`拒收數量`、`發票月份`（收料日期原樣照抄）
- 新值非空且與舊值不同才寫入；最終以 28 欄白名單重組存檔（手動加的額外欄位會被移除）

### 前端 autoUpload() 建議（尚未套用）

- 後端失敗回傳欄位是 `message`（成功才是 `msg`），且 500 時前端只 alert 籠統的「上傳失敗」
- 建議改為解析 response JSON 後把 `result.message || result.msg` 帶進錯誤 alert，使用者可直接看到後端錯誤原因

---

## 七、後續建議（尚未執行）

- app.py 模組化拆分時，可為各模組（eHub / eRT / supervisor 等）建立獨立 logger，只需在 config.ini 加一行即可分流
- `sendmail` 路由本身的 15 個 `print()`、`compare_with_buyer_csv` 的 33 個 `print()` 等仍只輸出 console，可逐步升級為 logger
- 各 API `except` 區塊的 `traceback.print_exc()` 可改為 `logger.error(traceback.format_exc())`，讓錯誤堆疊留存於 log 檔