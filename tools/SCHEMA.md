# 項目格式（data/items.json 的 items 陣列，研究員交出的新項目也用這個格式）

```json
{
  "id": "kebab-case-unique-slug（小寫英文、數字、-；建議含年份，例如 brisbane-diwali-2026）",
  "type": "event | deal",
  "title": "主辦單位或品牌寫的官方英文名稱",
  "title_zh": "繁體中文短標題（台灣用語），品牌與專有名詞保留英文，盡量 18 字內",
  "category": "festival | music | food | market | arts | sport | outdoors | family | shopping | grocery | dining | tickets",
  "region": "QLD | NSW | VIC | WA | SA | TAS | ACT | NT | AU（AU＝全澳洲或全國線上都適用）",
  "city": "Brisbane（AU 填 null）",
  "venue": "場地名稱（AU 或線上填 null）",
  "lat": -27.4698, "lng": 153.0251,
  "area_zh": "只有全州／全市適用的優惠（例如大眾運輸）才填，例如「昆州全境」；填了就不在地圖放點",
  "start": "2026-10-08",
  "end": "2026-10-18（單日活動和 start 一樣；沒有結束日的優惠填 null）",
  "schedule_zh": "固定時段才填，例如「每週六 8:30–15:00」；沒有就省略",
  "price_zh": "免費入場 / A$25 起 / 全館 8 折（官方沒寫就「請見官網」）",
  "free": true,
  "highlight": "很短的標籤，例如「半價」「免費・3 天」。不要寫會過期的字（今天、本週、剩 N 天、倒數）",
  "summary_zh": "1–2 句繁體中文：是什麼、為什麼值得去或買。只寫官方頁面看得到的事實，不誇大",
  "tip_zh": "一句實用提醒（怎麼拿到優惠、要不要預約、怎麼去），沒有就 null",
  "sources": [
    { "kind": "official | social | community | news",
      "platform": "官方網站 | Threads | Instagram | Facebook | TikTok | X | Reddit | OzBargain | YouTube | 新聞 | …",
      "label": "頁面的簡短說明，例如「Brisbane Festival – program」或「@brisbanefestival on Threads」",
      "url": "https://…（實際打開過或在搜尋結果看到的網址，絕對不要自己拼湊）" }
  ],
  "verified": {
    "status": "verified | partial",
    "checked": "2026-10-08",
    "unconfirmed_zh": "partial 才填：哪一項官方還沒公布，例如「官網還沒公布票價。」"
  },
  "added": "2026-10-09（每日任務新增時由 tools/daily.js 自動填上，網站會顯示「新上架」3 天）"
}
```

## 收錄規則
- 只收 2026 年確定會舉辦、現在進行中或 60 天內開始的活動／優惠。
- 每一筆至少要有一個 `official` 來源，而且要用 WebFetch 實際打開，看到 2026 年的日期、價格、地點。打不開或只看到去年資料的，不收。
- 社群貼文（Threads、Instagram、Facebook、TikTok、X、Reddit、OzBargain）只當「線索」：可以列在 sources 給使用者參考，但不能當作唯一證據。
- 線上限定的超市優惠不收；超市只收門市可買的特價。
- 不收：需要付費才能參加的抽獎、詐騙或來路不明的「免費」活動、成人內容、賭博優惠碼、酒類大量折扣的宣傳。
- 文字用台灣日常用語、正式有質感，不要用「省爆」「撿便宜」之類的字眼。
