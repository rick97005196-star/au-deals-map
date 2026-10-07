-- 澳洲好康地圖 統計資料庫（Cloudflare D1：au-deals-map-stats）
CREATE TABLE IF NOT EXISTS counts (
  day  TEXT NOT NULL,              -- 布里斯本日期 YYYY-MM-DD
  kind TEXT NOT NULL,              -- view / geo / device / ref / open / src / search / region / social / cat
  key  TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);
CREATE TABLE IF NOT EXISTS visitors (
  day TEXT NOT NULL,
  vid TEXT NOT NULL,               -- 瀏覽器隨機產生的匿名編號
  PRIMARY KEY (day, vid)
);
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL                  -- stats_key = 統計頁密碼
);
