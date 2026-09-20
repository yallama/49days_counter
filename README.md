# 七七共修計數（LINE LIFF + Google Apps Script）

家人在 LINE 裡打開，記錄每次誦念的經咒／佛號遍數，看自己與全家的累計。

```
LINE App ──開啟──▶ LIFF 前端（web/，靜態網站：GitHub Pages / Netlify）
                     │  POST JSON + LIFF access token
                     ▼
               Google Apps Script 網頁應用程式（gas/）
                     │  向 LINE 驗證 token → 取得可信任的 userId
                     ▼
               Google 試算表（Records / Members 工作表 = 資料庫）
```

| 資料夾 | 內容 |
|---|---|
| `web/` | 前端。`index.html`（UI 與確認版原型相同）、`config.js`（部署設定）、`mock.js`（預覽模式假資料） |
| `gas/` | 後端。`Code.gs` 入口、`Auth.gs` LINE 驗證、`Store.gs` 試算表存取、`Config.gs` 設定 |
| `prototype/` | 已確認的 UI 原型（僅供對照，不部署） |

> 為什麼前端不直接放在 Apps Script？Apps Script 的網頁會被包在 googleusercontent.com 的 iframe 裡，`liff.init` 在這種環境不穩定，因此前端放在靜態主機，Apps Script 只當 API。

---

## 部署步驟（約 30 分鐘）

### 1. 建立試算表與後端（Google Apps Script）

1. 新增一個 Google 試算表，例如「七七共修紀錄」。
2. 選單 **擴充功能 → Apps Script**。
3. 左側 **專案設定（齒輪）** → 勾選「在編輯器中顯示 appsscript.json 資訊清單檔案」。
4. 回到編輯器，建立四個檔案並貼上內容：`Code.gs`、`Config.gs`、`Auth.gs`、`Store.gs`，並用 `gas/appsscript.json` 取代 `appsscript.json`。（預設的 `程式碼.gs` 刪掉或改名成 `Code.gs`。）
5. 上方函式選單選 `setup` → **執行**，依提示授權。試算表會多出 `Records`、`Members` 兩個工作表。
6. 先記下，等第 2 步拿到 Channel ID 再回來填：**專案設定 → 指令碼屬性 → `LINE_CHANNEL_ID`**。
7. **部署 → 新增部署作業** → 類型「網頁應用程式」
   - 執行身分：**我**
   - 誰可以存取：**所有人**
   - 部署後複製網址（結尾是 `/exec`），這是 `API_URL`。

> 想用 clasp 也可以：在 `gas/` 裡 `clasp create --type sheets` 或 `clasp clone <scriptId>` 後 `clasp push`。

### 2. 建立 LINE Login channel 與 LIFF

1. 到 [LINE Developers Console](https://developers.line.biz/console/) → 建立（或選擇）Provider → **Create a new channel → LINE Login**。
   - App types 勾選 **Web app**。
2. **Basic settings** 頁的 **Channel ID** → 填回 Apps Script 指令碼屬性 `LINE_CHANNEL_ID`。
3. **LIFF** 分頁 → **Add**：
   - Size：**Full**
   - Endpoint URL：第 3 步的前端網址（例如 `https://<帳號>.github.io/<repo>/`），可先填暫時網址，之後再改
   - Scopes：勾選 **profile**
   - Bot link feature：Off
   - 建立後得到 **LIFF ID**（形如 `2001234567-AbCdEfGh`）。
4. ⚠️ **把 channel 狀態從 Developing 改成 Published**（channel 頁面上方）。Developing 狀態只有 channel 管理者能登入，家人會打不開。

### 3. 部署前端

1. 編輯 `web/config.js`，填入 `LIFF_ID` 與 `API_URL`。
2. 擇一發佈 `web/` 資料夾：
   - **GitHub Pages**（推薦）：推到 GitHub 的 `main` 分支，repo **Settings → Pages → Source 選 GitHub Actions**。`.github/workflows/pages.yml` 會自動發佈 `web/`。
   - **Netlify Drop**：把 `web/` 資料夾拖到 <https://app.netlify.com/drop>。
3. 把最終網址填回 LIFF 的 Endpoint URL（必須完全一致，含結尾 `/`）。

### 4. 分享給家人

把 `https://liff.line.me/<LIFF_ID>` 貼到家族 LINE 群組，建議再設為記事本／公告。家人點開就會自動以 LINE 身分登入。

---

## 驗收清單

- [ ] 瀏覽器打開 `API_URL`（GET）會看到 `{"ok":true,...}`
- [ ] 從 LINE 打開 LIFF 網址，顯示「第 N / 49 天」與累計
- [ ] 記錄一筆 → 試算表 `Records` 多一列，`Members` 出現自己
- [ ] 按「撤銷剛剛紀錄」→ 該列 `status` 變成 `undone`，累計回復
- [ ] 第二位家人記錄後，另一人切回畫面（或重開）可看到家族累計增加
- [ ] 在 LINE 以外的瀏覽器打開，會先導向 LINE 登入

## 本機預覽（不需 LINE）

```bash
cd web && python3 -m http.server 8000
# 開 http://localhost:8000/?mock （config.js 的 LIFF_ID 為空時自動是預覽模式）
```

預覽模式使用 `mock.js` 的假資料（固定為第 2 天晚上），不會連到後端。

---

## 設定（Apps Script → 專案設定 → 指令碼屬性）

| 屬性 | 必填 | 說明 |
|---|---|---|
| `LINE_CHANNEL_ID` | ✅ | LINE Login channel 的 Channel ID |
| `SPREADSHEET_ID` | | 執行 `setup()` 會自動填入 |
| `PERIOD_START` | | 共修起始，預設 `2026-09-18T04:44:00+08:00` |
| `PERIOD_DAYS` | | 預設 `49` |
| `PERIOD_TITLE` | | 預設「家族四十九日共修」 |
| `ALLOWED_USER_IDS` | | 只允許這些 LINE userId 使用（逗號分隔）。留空 = 拿到連結的人都能用。家人登入過後可在 `Members` 工作表複製 userId |

指令碼屬性修改後立即生效，不需重新部署。

## 更新程式碼

- **後端**：改完 `.gs` 後，**部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署**。這樣網址不變；若用「新增部署作業」會產生新網址，前端要跟著改。
- **前端**：推到 `main`（GitHub Pages）或重新拖曳上傳（Netlify）。LINE 內建瀏覽器可能快取舊版，關掉 LIFF 視窗重開即可。

## 規則與資料說明

- **時間以伺服器為準**，一律以台北時間計算「第幾天」；共修開始前、第 49 天 23:59:59 之後不能新增。
- **遍數上限**：經咒 1–9,999，佛號 1–100,000。
- **撤銷**：只能撤銷自己的紀錄，且在 15 分鐘內。撤銷不刪資料，只把 `status` 設為 `undone`。
- **防重複**：網路不穩重送時，前端沿用同一個 `clientId`，後端不會重複記錄。
- **隱私**：前端只拿得到自己的明細與全家「各項目合計」，不會傳出其他家人的個人資料。
- **身分**：後端每次都向 LINE 驗證 access token（結果快取 10 分鐘），不信任前端傳來的 userId。
- **更正錯誤紀錄**：管理者可直接在 `Records` 把該列 `status` 改為 `undone`（勿刪列）。

## 容量與限制（MVP）

- 每次請求會讀取整張 `Records`。一個家族 49 天、數千筆資料內反應都在 1–2 秒。若超過約 2 萬筆，再考慮加上快取或彙總表。
- Apps Script 免費帳號配額（UrlFetch 每天 2 萬次、同時執行 30 個）對一個家族綽綽有餘。
- 項目清單同時寫在 `web/index.html` 與 `gas/Config.gs`，修改時兩邊要一致。
