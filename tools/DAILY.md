# 每日自動更新流程

給排程任務用。每天早上（布里斯本時間約 4:50）跑一次，目標是讓網站在大家起床時就是最新、正確的資料。

**最重要的原則：寧缺勿濫。** 社群貼文只是線索，每一筆都要在官方頁面確認 2026 年的日期、價格、地點，再由另一位沒參與蒐集的查證員重新確認，才能上架。

## 0. 準備
- 用 add_repo（access: push）加入 `rick97005196-star/au-deals-map`，clone 下來。完整讀 `README.md`、`tools/SCHEMA.md`、`tools/VERIFY.md`。
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
用 `node tools/daily.js list` 取得現有清單，交給研究員避免重複。每天同時派 3 位研究員子代理：

| 研究員 | 範圍 |
|---|---|
| A（每天） | 全澳洲（region `AU`）：大型零售特賣、航空公司特價、電信方案、外送與速食 App 優惠、電影院優惠。星期三另外整理 Woolworths、ALDI（Coles 官網擋自動讀取，只有能在官方頁面確認時才收）新一週目錄的門市特價重點 |
| B（每天） | 昆士蘭（QLD）：布里斯本、黃金海岸、陽光海岸、圖文巴、凱恩斯、湯斯維爾等 |
| C（輪替） | 星期一、四：NSW＋ACT／星期二、五：VIC＋TAS／星期三、六：WA＋SA＋NT／星期日：所有州「下一個週末」的活動 |

每位研究員的任務：
1. **先從社群找線索**，一定要包含 Threads：WebSearch 用 `site:threads.com` 和 `site:threads.net` 加上關鍵字（例如城市名＋free event／festival／market／deal／sale／discount／this weekend／October 2026，也可以用中文關鍵字「布里斯本 活動」「雪梨 特價」）。另外搜尋 Instagram、Facebook 活動、TikTok、Reddit（各城市版、r/AussieFrugal）、OzBargain、X，以及各地官方 what's on 頁面（visitbrisbane.com.au、whatson.cityofsydney.nsw.gov.au、whatson.melbourne.vic.gov.au、visitperth.com、southaustralia.com、discovertasmania.com.au、visitcanberra.com.au、northernterritory.com 等）。
2. **再到官方頁面確認**：用 WebFetch 打開主辦單位／品牌／政府的官方頁面，看到 2026 年日期、價格、地點才收。Threads 或其他社群的連結只有在搜尋結果或打開的頁面裡實際看到、內容就是這一筆時，才可以放進 sources（kind 填 `social`，platform 填 `Threads` 等），絕對不要自己拼湊網址。
3. 目標每位 3–8 筆、優先收免費或划算、打工度假族會想去的；查不到官方證據就不要交。
4. 依 `tools/SCHEMA.md` 的格式，把新項目寫成 JSON 陣列到 `/tmp/new-<代號>.json`，用 python3 json.load 檢查。

WebSearch 次數用完時，改用 WebFetch 直接打開上面那些官方 what's on 頁面繼續找，不要停在半路。

## 4. 獨立查證新項目
把所有 `/tmp/new-*.json` 合併成 `/tmp/new.json`。另外派一位（多於 20 筆就兩位）**沒參與蒐集**的查證員子代理，依 `tools/VERIFY.md` 逐筆查證，結果寫到 `/tmp/new-verdicts.json`。然後：
`node tools/daily.js add /tmp/new.json /tmp/new-verdicts.json`
只有 ok／fix 的會加進去，重複的自動跳過。

## 5. 檢查、上線
1. `node tools/daily.js stamp`，再 `node build.js`（會檢查每一筆的格式，有錯就修到沒錯）。
2. 保護機制：今天結束時的筆數比第 0 步少超過 40%，或少於 30 筆，就**不要上線**，回報原因。
3. 用繁體中文 commit（例如「每日更新 10/9：新增 6、下架 3、修正 4」），推送到 `main`。Cloudflare Pages 會自動建置，約 1–2 分鐘。
4. 等 2 分鐘後用 WebFetch 打開 https://au-deals-map.pages.dev ，確認頁面原始碼裡的 `"updated":"今天日期"` 已經出現。
5. 推送被擋時不要用其他方法繞過：推到 `daily-<日期>` 分支並開 Pull Request 到 main，在回報裡附上連結請 Rick 合併。

## 6. 回報（推播到 Rick 手機，繁體中文、台灣用語、簡短）
- 今天：新增幾筆（列出標題＋州）、下架幾筆、修正幾筆、目前共幾筆
- 有 Threads 線索並查證通過的項目，標明「來自 Threads」
- 被擋的來源、查不到或要人工確認的地方

## 不要做的事
- 不要動 Rick 電腦上的桌面資料夾（只在雲端更新；他說「同步」時才更新資料夾）。
- 不要改網站設計、統計資料庫（D1）或統計密碼。
- 不要登入任何網站、不要送出表單、不要繞過 robots.txt、驗證碼或付費牆；被擋就換別的公開來源。
- 不要收線上限定的超市優惠、抽獎、成人或賭博相關內容。
