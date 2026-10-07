// 澳洲好康地圖：把 data/ 的資料塞進 src/ 的版型，產生可上線的 public/ 和 Claude 預覽用的 artifact/
// 用法：node build.js   （零相依，Node 18 以上）
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

/* ---------- 讀資料並檢查 ---------- */
const data = JSON.parse(read('data/items.json'));
const geo = JSON.parse(read('data/au-states.geojson'));
const REGIONS = ['AU', 'QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const CATS = ['festival', 'music', 'food', 'market', 'arts', 'sport', 'outdoors', 'family', 'shopping', 'grocery', 'dining', 'tickets'];
const KINDS = ['official', 'social', 'community', 'news'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const errors = [];
const ids = new Set();
for (const it of data.items) {
  const e = (m) => errors.push(`${it.id || '(沒有 id)'}：${m}`);
  if (!it.id || ids.has(it.id)) e('id 重複或空白');
  ids.add(it.id);
  if (!/^[a-z0-9-]+$/.test(it.id)) e('id 只能用小寫英文、數字、-');
  if (!['event', 'deal'].includes(it.type)) e('type 要是 event 或 deal');
  if (!REGIONS.includes(it.region)) e('region 不對');
  if (!CATS.includes(it.category)) e('category 不對');
  for (const f of ['title', 'title_zh', 'price_zh', 'summary_zh']) if (!it[f]) e(`缺少 ${f}`);
  if (!isDate(it.start)) e('start 日期格式要是 YYYY-MM-DD');
  if (it.end !== null && !isDate(it.end)) e('end 日期格式要是 YYYY-MM-DD 或 null');
  if (it.end && it.end < it.start) e('end 早於 start');
  if (it.added !== undefined && !isDate(it.added)) e('added 日期格式要是 YYYY-MM-DD');
  if (/今天|明天|本週|下週|剩\s*\d|倒數/.test(it.highlight || '')) e('highlight 不能寫會過期的字（今天、本週、剩 N 天…）');
  if (it.region !== 'AU' && !it.area_zh && (typeof it.lat !== 'number' || typeof it.lng !== 'number')) e('缺少座標 lat/lng');
  if (typeof it.lat === 'number' && (it.lat > -9 || it.lat < -44 || it.lng < 112 || it.lng > 155)) e('座標不在澳洲');
  if (!Array.isArray(it.sources) || !it.sources.some((s) => s.kind === 'official')) e('至少要有一個 official 來源');
  for (const s of it.sources || []) {
    if (!KINDS.includes(s.kind)) e(`來源種類不對：${s.kind}`);
    if (!/^https:\/\//.test(s.url)) e(`來源網址要是 https：${s.url}`);
  }
  if (!it.verified || !['verified', 'partial'].includes(it.verified.status)) e('verified.status 要是 verified 或 partial');
  if (it.verified && it.verified.status === 'partial' && !it.verified.unconfirmed_zh) e('部分查證要寫 unconfirmed_zh');
}
if (!isDate(data.updated)) errors.push('updated 日期格式不對');
if (errors.length) { console.error('資料有問題，先修正再建置：\n- ' + errors.join('\n- ')); process.exit(1); }

/* ---------- 組版 ---------- */
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const leafletCss = read('src/vendor/leaflet.css')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/[^{}]*\{[^{}]*url\(images\/[^)]*\)[^{}]*\}/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function fill(tpl, cfg) {
  return tpl
    .replace('/*__LEAFLET_CSS__*/', () => leafletCss)
    .replace('/*__DATA__*/', () => json(data))
    .replace('/*__GEO__*/', () => json(geo))
    .replace('/*__CONFIG__*/{api:false,tiles:false}', () => JSON.stringify(cfg));
}

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><rect width="34" height="34" rx="9" fill="#13201C"/><g fill="#F4F6F2"><circle cx="17" cy="27" r="2.3"/><circle cx="17.5" cy="7" r="1.9"/><circle cx="9" cy="15" r="1.9"/><circle cx="24.5" cy="13.5" r="1.6"/><circle cx="21.5" cy="20" r="1.1"/></g></svg>');

// 把「只有內容」的版型包成完整網頁：<title>/<meta>/<link>/<style> 放進 head，其餘放進 body
function wrap(content, extraHead = '') {
  const cut = content.search(/<(div|main|section|header)\b/);
  const head = content.slice(0, cut);
  const body = content.slice(cut);
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#13201C">
<link rel="icon" href="${FAVICON}">
${extraHead}${head}</head>
<body>
${body}</body>
</html>
`;
}

const site = read('site.json') ? JSON.parse(read('site.json')) : {};
const og = `<meta property="og:title" content="澳洲好康地圖">
<meta property="og:description" content="澳洲各州正在進行的活動與特價，一張地圖看完。每一筆都附官方來源並逐筆查證。">
<meta property="og:type" content="website">
${site.url ? `<meta property="og:url" content="${site.url}">\n` : ''}`;

const indexTpl = read('src/index.html');
const statsTpl = read('src/stats.html');

write('public/index.html', wrap(fill(indexTpl, { api: true, tiles: true }), og));
write('public/stats/index.html', wrap(statsTpl, '<meta name="robots" content="noindex">\n'));
write('public/items.json', JSON.stringify({ updated: data.updated, items: data.items.map((i) => ({ id: i.id, title_zh: i.title_zh, region: i.region, type: i.type })) }));
write('public/_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()

/
  Cache-Control: public, max-age=0, must-revalidate

/stats/*
  X-Robots-Tag: noindex
  Cache-Control: no-store
`);
write('artifact/index.html', fill(indexTpl, { api: false, tiles: false }));

const v = data.items.filter((i) => i.verified.status === 'verified').length;
console.log(`完成：${data.items.length} 筆（${v} 筆完整查證、${data.items.length - v} 筆部分查證）→ public/ 與 artifact/`);
