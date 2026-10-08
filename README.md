# 澳洲活動優惠地圖

澳洲各州正在進行的活動與特價：超市特價、速食與外送 App、節慶市集、購物、交通與旅遊，一次整理。每一筆都附官方來源，並經過獨立查證（核對 2026 年的日期、價格、地點）。

- 網站：https://au-deals-map.pages.dev
- 統計頁：https://au-deals-map.pages.dev/stats/ （需要密碼，密碼不放在這個倉庫裡）
- 主機：Cloudflare Pages 專案 `au-deals-map`，連動 GitHub 倉庫 `rick97005196-star/au-deals-map` 的 `main` 分支
- 免責聲明：https://au-deals-map.pages.dev/disclaimer/
- 風格：白色主題、簡潔有質感、用詞正式
- 版面（由上而下）：標題與搜尋、地區 → 快速瀏覽（本週末、免費、超市特價、餐飲與外送、交通與旅遊、即將截止）→ 分類列（全部／吃喝／活動／購物／行程交通，捲動時固定在上方）→ 卡片牆（電腦 3 欄、平板 2 欄、手機 1 欄）。點卡片打開詳細資訊（電腦從右側滑出、手機從底部滑出）。畫面下方的按鈕切換「地圖」檢視（Leaflet，放大後疊灰階 OpenStreetMap 底圖）。
- Logo：`brand/`（價格標籤＋南十字星，琥珀色圓點是標籤孔）。`logo-mark.svg` 圖示、`logo.svg` 橫式、`logo-stacked.svg` 直式；網站上的圖示與分頁小圖示都從這裡來。

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
3. 5 位研究員（全澳購物、全澳吃喝、交通與旅遊、昆士蘭、輪替的州）照 `tools/SOURCES.md` 的來源清單找線索（一定包含 **Threads**，另外有 Instagram、Facebook、TikTok、Reddit、OzBargain、X、小紅書和各地官方 what's on 頁面），先補 `node tools/daily.js gaps` 標「偏少」的分類與州，再到官方頁面確認；找到的新來源會加進清單，讓來源越來越多
4. 另一位沒參與蒐集的查證員逐筆重新查證，只有通過的才上架（網站會標「新上架」3 天）
5. 檢查格式、保護機制（筆數暴跌就不上線）後推送到 GitHub，Cloudflare 自動上線

只在雲端更新，桌面資料夾不會自動變；要讓資料夾變成最新版，跟 Claude 說「同步」。

相關檔案：`tools/DAILY.md`（流程）、`tools/SOURCES.md`（資訊來源清單，會自動增加）、`tools/SCHEMA.md`（格式、分類與收錄規則）、`tools/VERIFY.md`（查證規則）、`tools/daily.js`（小工具，`gaps` 看哪些分類偏少）。

## 資料欄位（data/items.json）

| 欄位 | 說明 |
|---|---|
| `id` | 小寫英文、數字、`-`，不能重複；也是分享連結的 `#` 後面那段 |
| `type` | `event`（活動）或 `deal`（特價） |
| `category` | 吃喝：`grocery` 超市特價、`dining` 餐飲與外送、`food` 美食活動／活動：`festival` 節慶、`music` 音樂、`arts` 藝文、`market` 市集、`sport` 運動、`family` 親子、`outdoors` 戶外、`entertainment` 電影與娛樂／購物：`shopping` 購物與方案／行程交通：`tickets` 交通與機票、`travel` 旅遊行程（對照表在 `tools/SCHEMA.md`） |
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
| `src/disclaimer.html` | 免責聲明頁（修改內容時記得更新頁尾的「最後修訂日期」） |
| `brand/` | Logo（SVG） |
| `src/stats.html` | 統計頁 |
| `functions/api/` | Cloudflare Pages Functions：`track`、`stats`、`popular` |
| `build.js` | 檢查資料並產生 `public/`、`artifact/` |
| `wrangler.toml` | Cloudflare Pages 與 D1 綁定設定 |
| `schema.sql` | D1 資料表 |

## 注意

- 活動和優惠可能臨時異動，網站頁尾已註明以官方公告為準。
- 社群平台（Facebook、Instagram、TikTok）擋自動讀取，所以社群連結是從搜尋結果取得；正式查證一律以官方頁面為準。
