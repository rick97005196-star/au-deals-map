# 獨立查證規則（查證員用）

你是獨立查證員，項目是別人蒐集的。不要相信他們寫的內容，每一筆都自己重新查。今天日期以布里斯本時間（UTC+10）為準。

每一筆：
1. 用 WebFetch 打開每個 `kind: official` 的來源（打不開可以改開同一個主辦單位／品牌的其他官方頁面），確認：
   a. 活動或優惠真的存在，而且是 2026 年的（只看到 2025 或更早的資料就不算）
   b. start／end 日期正確（固定時段的也要對，例如「每週六」）
   c. price_zh、highlight 的價格或優惠內容正確
   d. city／venue 正確；lat／lng 在場地 2 公里內（明顯錯就修正）
   e. summary_zh、tip_zh、highlight 的每一句都有根據；沒根據、誇大、數字錯的要改掉或刪掉
2. 打開 social／community／news 來源，記錄能不能打開、內容是不是這一筆。Threads、Facebook、Instagram、TikTok 常常擋自動讀取，記成 blocked 即可，不是刪除的理由；但完全無關或明顯錯的連結要從 sources 拿掉。
3. 判定：
   - `ok`：全部正確
   - `fix`：項目是真的、現在有效，但某些欄位要修正 → 把修正後的值放在 `fixes`（欄位名稱和 SCHEMA.md 一樣，中文用正式書面語、台灣用語，遵守 SCHEMA.md 的用詞規則）
   - `drop`：官方頁面確認不了 2026 年資訊、已經結束、取消、整個售完，或關鍵事實錯了又無法修正
   另外給 `status`：`verified`（日期、價格、地點都在官方頁面確認）或 `partial`（有一項確認不了，必須寫 `unconfirmed_zh` 說明）。

輸出 JSON 陣列，每筆一個物件：
```json
{ "id": "...", "verdict": "ok|fix|drop", "status": "verified|partial", "fixes": {}, "unconfirmed_zh": "partial 才填",
  "evidence": "英文一句：在哪個官方網址確認了什麼", "note": "英文一句：改了什麼、哪裡確認不了" }
```
寫完用 `python3 -c "import json;json.load(open('檔名'))"` 確認是有效 JSON。
