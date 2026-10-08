# 每日自動更新流程

給排程任務用。每天早上（布里斯本時間約 4:50）跑一次，目標是讓網站在大家起床時就是最新、正確的資料。

**流程以本檔為準。** 排程任務的提示若寫「3 位研究員」，那是舊版本；研究員人數與分工一律照下面第 3 步（5 位），網站分類照 tools/SCHEMA.md。

**最重要的原則：寧缺勿濫。** 社群貼文只是線索，每一筆都要在官方頁面確認 2026 年的日期、價格、地點，再由另一位沒參與蒐集的查證員重新確認，才能上架。

## 0. 準備
- 用 add_repo（access: push）加入 `rick97005196-star/au-deals-map`，clone 下來。完整讀 `README.md`、`tools/SCHEMA.md`、`tools/VERIFY.md`、`tools/SOURCES.md`。
- 今天日期和星期用布里斯本時間（UTC+10，沒有夏令時間）。
- 記下目前筆數：`node tools/daily.js count`。

## 1. 下架已結束的項目
`node tools/daily.js prune`

## 2. 重新查證現有項目
`node tools/daily.js due /tmp/due.json` 會列出：4 天內開始的（每天確認沒取消）、部分查證滿 3 天的（看官方是否已公布票價）、其他滿 7 天沒查的。
交給一位查證員子代理，依 `tools/VERIFY.md` 查證，結果寫到 `/tmp/due-verdicts.json`，再執行
`node tools/daily.js verdicts /tmp/due-verdicts.json`。
筆數很多時（超過 25 筆）分成兩位查證員同時做。

## 3. 找新的活動與特價
先執行 `node tools/daily.js gaps`，看哪些大分類、哪些州「偏少」，把結果一起交給研究員，請他們**優先補偏少的部分**。再用 `node tools/daily.js list` 取得現有清單，交給研究員避免重複。

每天同時派 5 位研究員子代理，每位都要讀 `tools/SOURCES.md` 自己負責的段落：

| 研究員 | 範圍 | SOURCES.md 段落 |
|---|---|---|
| A（每天） | 全澳洲（region `AU`）購物、電信、訂閱、電影院與博物館優惠 | 2 |
| D（每天） | 全澳洲吃喝：超市型錄（星期三一定要整理 Woolworths、ALDI、IGA 新一週型錄重點）、速食與咖啡 App 優惠、外送平台、便利商店 | 1 |
| E（每天） | 交通、機票與旅遊行程：航空特價、大眾運輸優惠、長途交通、國家公園、觀光局優惠、一日遊 | 3 |
| B（每天） | 昆士蘭（QLD）活動：布里斯本、黃金海岸、陽光海岸、圖文巴、凱恩斯、湯斯維爾等 | 4 |
| C（輪替） | 星期一、四：NSW＋ACT／星期二、五：VIC＋TAS／星期三、六：WA＋SA＋NT／星期日：所有州「下一個週末」的活動 | 4 |

每位研究員的任務：
1. **先從社群找線索**，一定要包含 Threads（關鍵字見 SOURCES.md 第 5 段），另外搜尋 Instagram、Facebook、TikTok、Reddit、OzBargain、X、小紅書。
2. **再到官方頁面確認**：用 WebFetch 打開主辦單位／品牌／政府的官方頁面，看到 2026 年日期、價格、地點才收。每位研究員每天至少實際打開 SOURCES.md 裡 8 個官方來源，不能只靠搜尋結果。Threads 或其他社群的連結只有在搜尋結果或打開的頁面裡實際看到、內容就是這一筆時，才可以放進 sources（kind 填 `social`，platform 填 `Threads` 等），絕對不要自己拼湊網址。
3. 目標每位 4–10 筆，優先補 gaps 標「偏少」的分類與州，以及免費或打工度假族會想去的；查不到官方證據就不要交。
4. 依 `tools/SCHEMA.md` 的格式（category 照「分類」表），把新項目寫成 JSON 陣列到 `/tmp/new-<代號>.json`，用 python3 json.load 檢查。
5. 找到新的可靠官方來源（清單裡沒有的），把它寫在 `/tmp/sources-<代號>.txt`，一行一個，格式照 SOURCES.md 最下面「新增來源」。

WebSearch 次數用完時，改用 WebFetch 直接打開 SOURCES.md 裡的官方頁面繼續找，不要停在半路。

研究員都完成後，把所有 `/tmp/sources-*.txt` 裡不重複的網站加到 `tools/SOURCES.md` 的「新增來源」（已經在清單上的網域不要再加），跟資料一起 commit。

## 4. 獨立查證新項目
把所有 `/tmp/new-*.json` 合併成 `/tmp/new.json`。另外派一位（多於 20 筆就兩位、多於 40 筆就三位）**沒參與蒐集**的查證員子代理，依 `tools/VERIFY.md` 逐筆查證，結果寫到 `/tmp/new-verdicts.json`。然後：
`node tools/daily.js add /tmp/new.json /tmp/new-verdicts.json`
只有 ok／fix 的會加進去，重複的自動跳過。

## 5. 檢查、上線
1. `node tools/daily.js stamp`，再 `node build.js`（會檢查每一筆的格式，有錯就修到沒錯）。
2. 保護機制：今天結束時的筆數比第 0 步少超過 40%，或少於 30 筆，就**不要上線**，回報原因。
3. 用繁體中文 commit（包含 data/items.json 和 tools/SOURCES.md）（例如「每日更新 10/9：新增 6、下架 3、修正 4」），推送到 `main`。Cloudflare Pages 會自動建置，約 1–2 分鐘。
4. 等 2 分鐘後用 WebFetch 打開 https://au-deals-map.pages.dev ，確認頁面原始碼裡的 `"updated":"今天日期"` 已經出現。
5. 推送被擋時不要用其他方法繞過：推到 `daily-<日期>` 分支並開 Pull Request 到 main，在回報裡附上連結請 Rick 合併。

## 6. 回報（推播到 Rick 手機，繁體中文、台灣用語、簡短）
- 今天：新增幾筆（列出標題＋州）、下架幾筆、修正幾筆、目前共幾筆
- 內容充實度：`node tools/daily.js gaps` 還偏少的分類與州；今天新增了幾個資訊來源
- 有 Threads 線索並查證通過的項目，標明「來自 Threads」
- 被擋的來源、查不到或要人工確認的地方

## 不要做的事
- 不要動 Rick 電腦上的桌面資料夾（只在雲端更新；他說「同步」時才更新資料夾）。
- 不要改網站設計、統計資料庫（D1）或統計密碼。
- 不要登入任何網站、不要送出表單、不要繞過 robots.txt、驗證碼或付費牆；被擋就換別的公開來源。
- 不要收線上限定的超市優惠、抽獎、成人或賭博相關內容。
