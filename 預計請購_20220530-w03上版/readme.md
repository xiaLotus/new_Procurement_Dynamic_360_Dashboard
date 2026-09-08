# 採購管理平台（Procurement Management Platform）

廠務／採購團隊內部使用的請購與驗收管理系統。涵蓋請購單建立與追蹤、長官審核、預算管控、驗收發信、物料收貨單（MHTML）解析與 RT 金額更新、eHub 上傳、月度花費分析、成員管理與留言版。

- **後端**：Python Flask（單一 `app.py`，模組化整理中）
- **前端**：Vue 3（global build）+ Tailwind CSS + Chart.js + SweetAlert2 + Lucide Icons + Axios
- **儲存**：CSV / JSON 檔案（無資料庫），所有寫入皆以 `FileLock` 保護
- **部署原則**：離線可用，所有靜態資源放在本機 `static/`，不依賴 CDN

---

## 目錄結構

```
.
├── app.py                          # Flask 主程式（路由 / API）
├── Backend_data.json               # 使用者、權限、部門、Notes ID
├── config.cfg                      # 管理者 / 特定人員名單（每行一個姓名）
├── log_config.py                   # 統一 logger（DatedPeriodFileHandler）
├── mhtml_parser.py                 # MHTMLParser：解析收貨單 GridView
├── parse.py                        # MHTML / HTML 解析輔助
├── MailFunction/
│   ├── normail.py                  # 一般件／急件 ePR 簽核通知信
│   ├── urgent.py                   # 超急件 ePR 簽核通知信
│   └── acceptanceMail.py           # 領料驗收通知信
├── index.html                      # 登入頁
├── page/                           # 各功能頁面（引用 ../static/...）
│   ├── Procurement_Dynamic_360_Dashboard.html
│   ├── Supervisor_review.html
│   ├── accCheck.html / sendAccMail.html
│   ├── MaterialReceivingNoteUpload.html
│   ├── eRT_page.html
│   ├── eHubUploadFile.html / batch_adjustment.html / merge_confirmation.html
│   ├── Monthly_expense_analysis.html
│   ├── Mail.html / Can.html
│   ├── Member_manager.html / Message_Board.html
│   └── Mail_recipient_manager.html
├── static/
│   ├── js/func/                    # 各頁對應的 Vue 程式
│   ├── js/, css/                   # Vue、Axios、Chart.js、Tailwind、SweetAlert2、Lucide（本機副本）
│   └── data/                       # 資料檔（見下表）
├── user_filters/                   # 各使用者的 360 看板篩選狀態 {username}_filters.json
├── message_board_data/             # 留言版資料
├── uploads/ · processed/           # MHTML 上傳與已處理檔
└── Log/{功能}/{功能}_yyyy_mm_dd.log  # 每日分檔、保留 7 天
```

---

## 頁面與程式對應

| 頁面 | JS | 功能 |
|---|---|---|
| `index.html` | `login.js` | 登入（LDAP / 本機名單） |
| `Procurement_Dynamic_360_Dashboard.html` | `Planned_Purchase_Request_List.js` | 請購動態 360 看板：請購單 CRUD、狀態上傳、篩選儲存、統計卡、未下單數 |
| `Supervisor_review.html` | `supervisor_review.js` | 長官審核：待審 / 核准 / 退回 / 重送 |
| `accCheck.html` | `accCheck.js` | 驗收發信管理：挑選待驗收項目 |
| `sendAccMail.html` | `accMail.js` | 驗收信寄送：備註選項由 `accMailData.json` 動態管理 |
| `MaterialReceivingNoteUpload.html` | （頁內 script） | 上傳 MHTML 收貨單、解析 GridView、比對 `Buyer_detail.csv` 更新 RT 金額 |
| `eRT_page.html` | `eRT.js` | eRT 驗收總表、入帳彙總、月度實際入帳 |
| `eHubUploadFile.html` | `eHub.js` | eHub 自動貼上／上傳，含一般件、分批件、合併件 |
| `batch_adjustment.html` | `batch_adjustment.js` | 分批交貨數量調整 |
| `merge_confirmation.html` | `mergeConfirmation.js` | 分批合併回單筆確認 |
| `Monthly_expense_analysis.html` | `month_expensive_analysis.js` | 每月花費分析、預算餘額 |
| `Mail.html` | `mail.js` | 開立 ePR 後發送簽核通知信 |
| `Can.html` | `can.js` | 請購單範本複製工具 |
| `Member_manager.html` | `Member_manager.js` | 成員 / 需求者 / 管理者維護 |
| `Message_Board.html` | `Message_Board.js` | 留言版：頻道、已讀、釘選、表情、收回 |
| `Mail_recipient_manager.html` | `mailRecipient.js` | 簽核信／驗收信固定收件人與副本維護（空白自動轉底線） |

---

## 資料檔

| 檔案 | 用途 |
|---|---|
| `static/data/Planned_Purchase_Request_List.csv` | 主請購清單（360 看板主資料） |
| `static/data/Buyer_detail.csv` | 驗收 / 收貨明細（`BUYER_FILE`） |
| `static/data/delivery_receipt.csv` | 交貨收據紀錄 |
| `static/data/money.json` | 各年月請購預算與追加預算（登入時自動補當月預設 25,000,000） |
| `static/data/vender.ini` | 廠商清單 |
| `static/data/phone.json` | 人員電話 |
| `static/data/accMailData.json` | 驗收信備註選項 |
| `Backend_data.json` | 人員基本資料、權限、Notes ID |
| `config.cfg` | 特定人員名單 |

---

## 主要 API（`app.py`）

**登入 / 使用者**
`POST /api/login`、`POST /api/getAllLoginer`、`POST /api/get-username-info`、`POST /api/getUsername`、`GET /api/requesters`、`GET /api/admins`、`POST /api/requesters/add|remove`

**請購單（360 看板）**
`GET /data`、`POST /api/add`、`POST /update`、`POST /delete`、`GET /api/get_detail/<id>`、`POST /api/Status-upload`、`POST /api/checkeEPRno`、`POST /api/check-edit-permission`、`GET /api/unordered-count`、`POST /upload_report`、`POST /upload_acceptancereport`
篩選狀態：`POST /api/save-filters-json`、`GET /api/get-filters-json/<username>`、`DELETE /api/clear-filters-json/<username>`

**長官審核**
`POST /api/add-item-with-notification`、`GET /api/get-pending-approval-items`、`POST /api/approve-items`、`POST /api/reject-items`、`POST /api/resubmit-items`、`GET /api/get-all-items-with-approval`、`POST /api/clear-remark-and-approve`、`POST /api/reject-approved-to-pending`

**預算 / 分析**
`GET /api/getrestofmoney`、`GET /api/budget_months`、`POST /api/uploadMoney`、`POST /api/monthly_expense_analysis`、`GET /api/get_unaccounted_amount`、`GET /api/accounting_summary`、`GET /api/monthly_actual_accounting`、`GET /api/next_month_amount`

**驗收 / 收貨明細**
`GET /api/buyer_detail`、`POST /api/save_csv`、`POST /api/update-buyer-items`、`POST /api/delete-buyer-item-exact`、`POST /api/update-buyer-csv`、`POST /api/update_delivery_receipt`、`POST /api/confirm_quantity_update`、`POST /api/confirm_merge`、`POST /api/save_override_all`

**MHTML 收貨單**
`POST /api/upload-mhtml`、`POST /api/parse-mhtml`、`POST /api/cleanup-processed`

**郵件**
`POST /api/sendmail`（ePR 簽核通知，依請購順序分流 `urgent` / `normail`）、`POST /update_for_mail`、`POST /api/save-mail`（驗收信）、`POST /api/get-user-epr-data`
備註選項：`GET / POST / DELETE /api/acc-mail-remarks`

**廠商 / 其他**
`GET|POST /api/venders`、`POST /api/get_phone`、`POST /getItemName`

**留言版**（`/api/message-board/...`）
`messages/<channel>`、`latest-timestamps`、`last-read/<username>`、`mark-read`、`unread/<username>`、`send`、`pin`、`reaction`、`recall`

---

## 安裝與啟動

```bash
pip install flask flask-cors pandas numpy filelock ldap3 openpyxl beautifulsoup4 werkzeug
pip install --upgrade xlrd          # 舊版 xls 支援；注意需用 --upgrade 才會更新既有版本
# Windows 寄信相關另需：pip install pywin32
python app.py                       # 預設 debug 模式，http://127.0.0.1:5000
```

- 郵件經內部 SMTP（`10.12.10.31`）寄送，測試環境的收件人在 `MailFunction/*.py` 的 `read_configuration()` 中設定。
- 首次啟動會自動建立 `uploads/`、`processed/`、`Log/` 等目錄。

---

## 開發慣例

- **檔案路徑**：集中定義於 `app.py` 開頭常數（`CSV_FILE`、`BUYER_FILE`、`JSON_FILE`、`BACKEND_DATA`、`VENDER_FILE_PATH`…），不要再寫死字串。
- **寫檔**：CSV / JSON 寫入一律 `with FileLock(path + ".lock"):`。
- **CSV 讀取**：`pd.read_csv(..., dtype=str).fillna('')`，避免 NaN 與型別問題。
- **PO 號碼比對**：CSV 內常以浮點存放（`6100813277.0`），比對前先去掉 `.0` 再轉字串。
- **Logging**：一律 `from log_config import get_logger`，不要直接 `logging.getLogger()` 或 `print()`。
- **Vue**：`const app = Vue.createApp({...}); app.mount('#app')`；使用 `Vue.nextTick`（不解構）。Chart.js 實例存成非響應式屬性（如 `this._chart`），避免被 Vue 3 Proxy 包裝。
- **通知**：統一使用 SweetAlert2（alert + toast），頁面需先載入 `Swal`。
- **UX**：簡單操作不加確認對話框；篩選臨時狀態用 `isTempFilterActive` 隔離，不覆蓋已儲存的篩選。
- **導頁資料完整性**：跨頁（如罐頭訊息頁）回到 360 看板前，必須重新載入並完整回存 detail 資料，避免清空 `editTableRows`。
- **交付**：改動前後以 `node --check` / `python -m py_compile` 驗證語法；重大重構附 Markdown 變更紀錄。

---

## 近期變更

- **Mail_recipient_manager**：新增簽核信／驗收信收件人管理頁（`Mail_recipient_manager.html` + `mailRecipient.js`），輸入時自動去除 `@aseglobal.com` 並將空白轉底線。
- **驗收信備註**：備註選項從 HTML 寫死改為 `static/data/accMailData.json`，新增 `GET/POST/DELETE /api/acc-mail-remarks`，前端提供管理 modal 與快速新增按鈕。
- **Logging 統一**：`log_config.py` + `DatedPeriodFileHandler`，`parse.py`、`acceptanceMail.py`、`normail.py`、`urgent.py` 全部改用 `get_logger()`。
- **路徑統一**：約 40 處硬編碼路徑收斂為常數，`Buyer_detail.csv` 別名統一為 `BUYER_FILE`。
- **MHTMLParser** 抽出至 `mhtml_parser.py`，支援 UTF-8 / Big5 / GBK。

## 待辦

- 持續將 `app.py` 依前端 JS 的功能切分為模組（Blueprint）。
- 將 `app.py` 內殘留的 `print()` 與舊版路徑常數（`DETAIL_CSV_FILE`、`BUYER_CSV_PATH`）清理完畢。
- 部分頁面（`MaterialReceivingNoteUpload.html`、`accCheck.html`、`batch_adjustment.html`、`sendAccMail.html`）仍引用 unpkg / jsdelivr 的 Vue / Axios，需改為本機 `static/js/`。
- eHub 分批／合併流程與 localStorage 狀態持久化的持續調整。