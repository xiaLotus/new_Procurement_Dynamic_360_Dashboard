# 3000 AMHS 訓練系統 — 測試報告

**日期：** 2026-06-15  
**版本：** app.py + app.js（含長官評語、PATCH 單天、token 持久化、安全修補）  
**測試環境：** Flask dev server（mock AD 驗證）、Python 3.12、本機 localhost:5001  
**測試結果：** ✅ 28 PASS / ❌ 0 FAIL

---

## 一、測試項目總覽

| # | 分類 | 測試名稱 | 結果 | 細節 |
|---|------|----------|------|------|
| T01 | 認證 | 未登入 GET /api/state 回 401 | ✅ PASS | status=401 |
| T02 | 認證 | 空工號登入回 400 | ✅ PASS | status=400 |
| T03 | 認證 | 空密碼登入回 400 | ✅ PASS | status=400 |
| T04 | 認證 | 不存在帳號回 403 | ✅ PASS | status=403 |
| T05 | 認證 | Leader 登入成功 | ✅ PASS | status=200 |
| T06 | 認證 | User K27124 登入成功 | ✅ PASS | status=200 |
| T07 | 持久化 | tokens.json 已建立 | ✅ PASS | 檔案存在 |
| T07b | 持久化 | token 已寫入 tokens.json | ✅ PASS | count=2 |
| T08 | 資料存取 | GET /api/state 有效 token 回 200 | ✅ PASS | status=200 |
| T08b | 資料存取 | state 包含 employees/signers | ✅ PASS | keys 正確 |
| T09 | 權限 | User GET /api/accounts 被拒 403 | ✅ PASS | status=403 |
| T10 | 權限 | Leader GET /api/accounts 成功 | ✅ PASS | status=200 |
| T11 | 安全 | User PATCH 別人資料被拒 403 | ✅ PASS | status=403 |
| T11b | 安全 | 磁碟資料未被竄改 | ✅ PASS | leaderComment="" |
| T12 | 功能 | User PATCH 自己 day 成功 | ✅ PASS | status=200 |
| T12b | 功能 | leaderComment 正確寫入磁碟 | ✅ PASS | got=今日表現優秀 |
| T13 | 功能 | Leader PATCH 任意 day 成功 | ✅ PASS | status=200 |
| T13b | 功能 | Leader leaderComment 寫入磁碟 | ✅ PASS | got=Leader 總評 |
| T14 | 安全 | 注入欄位請求回 200（白名單過濾） | ✅ PASS | status=200 |
| T14b | 安全 | empId 未被注入 | ✅ PASS | empId=K27124 |
| T14c | 安全 | id 未被注入 | ✅ PASS | id 原值未變 |
| T15 | 邊界 | PATCH 不存在日期回 404 | ✅ PASS | status=404 |
| T16 | 邊界 | PATCH 不存在員工回 404 | ✅ PASS | status=404 |
| T17 | 安全 | empId mismatch 整包儲存回 400 | ✅ PASS | status=400 |
| T18 | 功能 | POST /api/employee 整包儲存成功 | ✅ PASS | status=200 |
| T19 | 認證 | 登出回 200 | ✅ PASS | status=200 |
| T20 | 認證 | 登出後舊 token 失效 401 | ✅ PASS | status=401 |
| T21 | 持久化 | tokens.json 已清除登出 token | ✅ PASS | remaining=1 |

---

## 二、本次修正內容與驗證對應

### 1. 長官評語功能（leaderComment）
- **app.js** 新增 `leaderComment` 欄位於 UI（每日訓練紀錄下方 textarea）
- 所有初始化位置（`newEmployee`、`addDay`、`importData`、`isEmpty` 修剪）均已補上
- **驗證：** T12、T12b — User PATCH 自己當天，`leaderComment` 正確寫入磁碟 ✅

### 2. PATCH 單天 API（只寫入指定工號 + 日期）
- **後端：** `PATCH /api/employee/<emp_id>/day/<date>`，以 `date` 為 key 定位單筆紀錄
- **前端：** `updateDay` / `updateDayScore` 改為直接呼叫 PATCH，不再觸發全員掃描
- **驗證：** T12、T13 — 單天寫入成功；T15、T16 — 不存在的 date/emp_id 回 404 ✅

### 3. Token 持久化
- **app.py** `_tokens` 從 `data/tokens.json` 啟動讀入；登入/登出後同步寫回
- 解決 Flask 重啟後 sessionStorage token 失效導致的 401 循環
- **驗證：** T07、T07b、T21 — token 正確持久化與清除 ✅

### 4. 前端快照初始化（防全員誤觸發）
- `enterApp()` 載入完員工後立即建立 `_snap_` 快照
- 解決重新整理後第一次 save 誤判全員都髒、觸發大量 POST 的問題
- **驗證：** 功能面已驗證 T08 state 載入正確；行為面需觀察實際操作日誌

### 5. 安全修補（5 項）
| 漏洞 | 修補方式 | 驗證 |
|------|----------|------|
| `save().then(function(){})` 的 `this` 斷鏈 | 改為 arrow function | 程式碼審查 |
| `importData` 的 `reader.onload = function()` `this` 斷鏈 | 改為 arrow function | 程式碼審查 |
| `_TOKENS_FILE` 路徑使用 `abspath` 與 `DATA_DIR` 不一致 | 統一改用 `DATA_DIR` | 程式碼審查 |
| PATCH route 無欄位白名單（可注入 empId/ojtRecords） | 加入 `_ALLOWED_DAY_FIELDS` 白名單 | T14、T14b、T14c ✅ |
| PATCH route 只有 `require_login`，User 可改他人資料 | 加入身份比對，User 只能改自己 | T11、T11b ✅ |

---

## 三、已知限制與建議

| 項目 | 說明 |
|------|------|
| `this` 修正為靜態審查 | `save().then` 與 `importData` 的 arrow function 修正無法透過 HTTP 測試驗證，以程式碼審查確認 |
| `_snap_` 快照初始化 | 為前端行為，無法透過後端 API 測試，需實際瀏覽器操作驗證（觀察第一次 save 是否觸發全員 POST）|
| tokens.json 無過期機制 | 目前 token 不會自動失效，建議後續加入有效期（如 8 小時）|
| PATCH route User 只能改自己 | 目前 User 連自己的 `mentorSignerId`、`leaderSignerId` 也能改；若簽核欄位應限 Leader，可再收緊白名單 |

---

*測試執行時間：2026-06-15 | 測試工具：Python requests | 全自動化執行*