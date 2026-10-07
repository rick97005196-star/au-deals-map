# 澳洲活動優惠地圖

澳洲各州正在進行的活動與特價，用一張互動地圖整理。每一筆都附官方來源，並經過獨立查證（核對 2026 年的日期、價格、地點）。

- 網站：https://au-deals-map.pages.dev
- 統計頁：https://au-deals-map.pages.dev/stats/ （需要密碼，密碼不放在這個倉庫裡）
- 主機：Cloudflare Pages 專案 `au-deals-map`，連動 GitHub 倉庫 `rick97005196-star/au-deals-map` 的 `main` 分支
- 風格：白色主題、簡潔有質感、用詞正式；地圖用 Leaflet（cdnjs），放大後疊 OpenStreetMap 底圖（灰階處理）

## 常用指令

```bash
node build.js        # 檢查資料 → 產生 public/（上線用）和 artifact/（Claude 預覽用）
```

Windows 可以直接雙擊 `建置網站.bat`；建置完雙擊 `public/index.html` 就能在瀏覽器預覽。

## 更新資料的流程

1. 改 `data/items.json`（欄位見下面）
2. `node build.js`，有錯會列出哪一筆哪個欄位
3. 推送到 GitHub 的 `main`，Cloudflare 會自動重新建置上線（約 1 分鐘）

`data/items.json` 的 `updated` 要改成這次核對資料的日期，網站右上角會顯示。

## 每日自動更新

每天早上布里斯本時間約 4:50，雲端排程任務會照 `tools/DAILY.md` 跑一次（電腦關機也會照常跑），完成後推播結果到手機：

1. 下架已結束的項目（`node tools/daily.js prune`）
2. 重新查證快開始、部分查證、太久沒查的項目
3. 3 位研究員從社群找線索（一定包含 **Threads**，另外有 Instagram、Facebook、TikTok、Reddit、OzBargain、X 和各地官方 what's on 頁面），再到官方頁面確認
4. 另一位沒參與蒐集的查證員逐筆重新查證，只有通過的才上架（網站會標「新上架」3 天）
5. 檢查格式、保護機制（筆數暴跌就不上線）後推送到 GitHub，Cloudflare 自動上線

只在雲端更新，桌面資料夾不會自動變；要讓資料夾變成最新版，跟 Claude 說「同步」。

相關檔案：`tools/DAILY.md`（流程）、`tools/SCHEMA.md`（格式與收錄規則）、`tools/VERIFY.md`（查證規則）、`tools/daily.js`（小工具）。

## 資料欄位（data/items.json）

| 欄位 | 說明 |
|---|---|
| `id` | 小寫英文、數字、`-`，不能重複；也是分享連結的 `#` 後面那段 |
| `type` | `event`（活動）或 `deal`（特價） |
| `category` | `festival` 節慶、`music` 音樂、`food` 美食、`market` 市集、`arts` 藝文、`sport` 運動、`outdoors` 戶外、`family` 親子、`shopping` 購物、`grocery` 超市、`dining` 餐飲、`tickets` 票券交通 |
| `region` | `QLD` `NSW` `VIC` `SA` `WA` `TAS` `ACT` `NT`，全澳都適用填 `AU` |
| `title` / `title_zh` | 官方英文名稱／中文短標題 |
| `city` `venue` `lat` `lng` | 地點與座標（全澳或全州適用的可以是 null） |
| `area_zh` | 全州或全市適用的優惠（例如大眾運輸），填了就不在地圖上放點，改列在州的資訊卡 |
| `start` / `end` | `YYYY-MM-DD`；沒有結束日填 `null`，過了 `end` 會自動從網站消失 |
| `schedule_zh` | 固定時段，例如「每週六 8:30–15:00」 |
| `price_zh` `free` `highlight` | 價格文字、是否免費、短標籤 |
| `summary_zh` `tip_zh` | 介紹與小提醒（只寫官方頁面看得到的內容） |
| `sources` | 來源清單，`kind` 是 `official`／`social`／`community`／`news`，至少要一個 `official` |
| `added` | 每日任務新增的日期，網站顯示「新上架」3 天 |
| `verified` | `status`：`verified`（日期、價格、地點都在官方頁面確認）或 `partial`（要寫 `unconfirmed_zh` 說明哪裡還沒確認）；`checked` 是核對日期 |

## 收錄與查證規則

- 只收 2026 年確定會舉辦、現在進行中或近期開始的活動／優惠。
- 先從社群（Instagram、Facebook、TikTok、Reddit、OzBargain）找線索，再打開官方頁面確認。
- 由另一位沒參與蒐集的查證員重新打開官方頁面，逐筆核對日期、價格、地點，刪掉誇大或查不到的描述。
- 官方沒公布的資訊（例如票價）標成「部分查證」，並寫清楚哪一項未確認。

## 數據統計

- 前端會送匿名事件到 `/api/track`：瀏覽、點開項目、點來源連結、選地區、搜尋關鍵字、到社群搜尋。
- 存在 Cloudflare D1 資料庫 `au-deals-map-stats`（綁定名稱 `DB`，設定在 `wrangler.toml`），表格見 `schema.sql`。
- 不記錄姓名、帳號或 IP；訪客是瀏覽器隨機產生的匿名編號，只用來算每天不重複人數，120 天後清除。
- 首頁會用近 7 天最多人點開的項目標示「熱門」（`/api/popular`）。
- 改統計頁密碼：Cloudflare 控制台 → Storage & Databases → D1 → `au-deals-map-stats` → Console，執行
  `UPDATE settings SET v = '新密碼' WHERE k = 'stats_key';`

## 資料夾

| 路徑 | 內容 |
|---|---|
| `data/items.json` | 所有活動與特價 |
| `data/au-states.geojson` | 澳洲各州邊界（Natural Earth，公有領域，已簡化） |
| `src/index.html` | 首頁版型（`build.js` 會把資料塞進去） |
| `src/stats.html` | 統計頁 |
| `functions/api/` | Cloudflare Pages Functions：`track`、`stats`、`popular` |
| `build.js` | 檢查資料並產生 `public/`、`artifact/` |
| `wrangler.toml` | Cloudflare Pages 與 D1 綁定設定 |
| `schema.sql` | D1 資料表 |

## 注意

- 活動和優惠可能臨時異動，網站頁尾已註明以官方公告為準。
- 社群平台（Facebook、Instagram、TikTok）擋自動讀取，所以社群連結是從搜尋結果取得；正式查證一律以官方頁面為準。
