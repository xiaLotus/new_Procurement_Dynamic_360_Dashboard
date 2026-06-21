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
---

# 3000 AMHS 訓練系統 — 測試報告（第二版）

**日期：** 2026-06-21  
**版本：** app.py + app.js（day-num 架構，修正日期輸入導致欄位遺失 Bug）  
**測試環境：** Flask dev server（mock AD 驗證）、Python 3.12、本機 localhost:15982  
**測試結果：** ✅ 24 PASS / ❌ 0 FAIL

---

## 一、測試項目總覽

| # | 分類 | 測試名稱 | 結果 | 細節 |
|---|------|----------|------|------|
| T01 | 認證 | K11001 登入成功 | ✅ PASS | status=200 |
| T02 | 認證 | K11002 登入成功 | ✅ PASS | status=200 |
| T03 | 認證 | K11003 登入成功 | ✅ PASS | status=200 |
| T04 | 認證 | F99001 Leader 登入成功 | ✅ PASS | status=200 |
| T05 | 基本寫入 | K11001 day1 learningItems 寫入 | ✅ PASS | HTTP 200 |
| T06 | 基本寫入 | K11001 day1 practiceItems 寫入 | ✅ PASS | HTTP 200 |
| T07 | 基本寫入 | K11001 day1 notes 寫入 | ✅ PASS | HTTP 200 |
| T08 | 基本寫入 | K11001 day1 date 寫入 | ✅ PASS | HTTP 200 |
| T09 | 核心 Bug 修復 | K11002 day1 先填 learningItems | ✅ PASS | HTTP 200 |
| T10 | 核心 Bug 修復 | K11002 day1 再填 notes | ✅ PASS | HTTP 200 |
| T11 | 核心 Bug 修復 | K11002 day1 最後填 date | ✅ PASS | HTTP 200 |
| T11a | 核心 Bug 修復 | learningItems 填完後仍存在 | ✅ PASS | 期望=實際=`機台巡檢流程` |
| T11b | 核心 Bug 修復 | notes 填完後仍存在 | ✅ PASS | 期望=實際=`收穫良多` |
| T11c | 核心 Bug 修復 | date 正確儲存 | ✅ PASS | 期望=實際=`2026-06-19` |
| T12 | 多人並發 | 三人同時 PATCH 無錯誤（Barrier） | ✅ PASS | 0 errors |
| T13 | 多人並發 | K11001 day2 資料正確 | ✅ PASS | `K11001-Day2學習` |
| T14 | 多人並發 | K11002 day2 資料正確 | ✅ PASS | `K11002-Day2學習` |
| T15 | 多人並發 | K11003 day1 資料正確 | ✅ PASS | `K11003-Day1學習` |
| T16 | 檔案隔離 | K11003 day2 notes 寫入 | ✅ PASS | HTTP 200 |
| T17 | 檔案隔離 | PATCH K11003 未觸動 K11001.json（mtime 未變） | ✅ PASS | mtime 未變 |
| T18 | 權限 | K11001 嘗試 PATCH K11002 → 403 | ✅ PASS | status=403 |
| T19 | Leader | F99001 修改 K11001 leaderComment | ✅ PASS | HTTP 200 |
| T19b | Leader | K11001 leaderComment 確認儲存正確 | ✅ PASS | `Leader評語` |
| T20 | 高並發壓力 | 6 thread 並發（3 員工 × 2 天）無錯誤 | ✅ PASS | 0 errors |
| T20a | 高並發壓力 | K11001 day1 notes 並發後正確 | ✅ PASS | `並發測試-K11001-D1` |
| T20b | 高並發壓力 | K11002 day2 notes 並發後正確 | ✅ PASS | `並發測試-K11002-D2` |
| T20c | 高並發壓力 | K11003 day1 notes 並發後正確 | ✅ PASS | `並發測試-K11003-D1` |
| T21 | 錯誤處理 | PATCH day_num=99（不存在）→ 404 | ✅ PASS | status=404 |

---

## 二、本次修正內容與驗證對應

### 1. 根本原因（K26647 回報，2026-06-18 / 06-19）

原系統以 `date` 作為每日紀錄的定位 key：

```
使用者先填 learningItems / practiceItems / notes
  → rec.date 為空 → 前端走 this.save()（全員存檔，有防抖延遲，不保證即時）
使用者最後填 date
  → 前端只 PATCH {date: '2026-06-18'}
  → 後端用新日期找記錄，其他欄位未送出
  → learningItems / practiceItems / notes 全部遺失
```

**解決方案：** 改用 `day`（序號 1、2、3…）作為穩定定位 key，`date` 降為普通欄位。

### 2. 架構變更

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| 後端路由 | `PATCH /api/employee/<emp_id>/day/<date>` | `PATCH /api/employee/<emp_id>/day-num/<int:day_num>` |
| 後端定位邏輯 | `r.get('date') == date` | `r.get('day') == day_num` |
| 前端 updateDay | `if(rec.date)` 分支判斷 | 無條件直接 PATCH |
| 前端 updateDayScore | `if(r.date)` 分支判斷 | 無條件直接 PATCH |
| API 路徑組成 | `/day/` + `rec.date` | `/day-num/` + `rec.day` |

- **驗證：** T09～T11c — 先填欄位再填日期，三欄位全部保留 ✅

### 3. 多人同時寫入（不同工號）

- `threading.Barrier` 確保多 thread 同時出發，模擬真實並發場景
- per-employee 檔案隔離架構（每人一個 JSON）確保各寫各的，無交叉覆蓋
- **驗證：** T12～T15（3 人並發）、T20～T20c（6 thread 壓力測試）✅

### 4. 檔案隔離驗證

- PATCH 單一員工後，以 `mtime` 確認其他員工 JSON 檔案未被觸動
- **驗證：** T17 ✅

---

## 三、已知限制與建議（累計）

| 項目 | 說明 |
|------|------|
| `this` 修正為靜態審查 | `save().then` 與 `importData` 的 arrow function 修正無法透過 HTTP 測試驗證，以程式碼審查確認 |
| `_snap_` 快照初始化 | 前端行為，無法透過後端 API 測試，需實際瀏覽器操作驗證 |
| tokens.json 無過期機制 | token 不會自動失效，建議後續加入有效期（如 8 小時）|
| 同一員工同時並發 | 不同 client 同時修改同一員工同一天 → last-write-wins，為已知接受限制 |
| 舊路由相容性 | `day/<date>` 路由已移除，若有舊快取或書籤仍使用舊 URL 需清除 |

---

*測試執行時間：2026-06-21 | 測試工具：Python requests + threading.Barrier | 全自動化執行*