// 澳洲活動優惠地圖：把 data/ 的資料塞進 src/ 的版型，產生可上線的 public/ 和 Claude 預覽用的 artifact/
// 用法：node build.js   （零相依，Node 18 以上）
//
// 多語言（和集簽圖書館、澳洲超市特價同樣四種語言）：繁中在根目錄，英文 /en/、日文 /ja/、韓文 /ko/。
// 翻譯存在 i18n/<語言>.json：{ "中文原文": "譯文" }，介面文字和 data/items.json 的內容共用同一份對照。
// 缺翻譯的段落先顯示中文原文（頁面上方會提示）；推送後 GitHub Actions「自動翻譯」會補上，見 tools/i18n.js。
// 繁中頁面不經過翻譯，和加上多語言之前完全一樣。
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

/* ---------- 多語言 ---------- */
const LANGS = ['zh', 'en', 'ja', 'ko'];
const LANG_META = {
  zh: { html: 'zh-Hant-TW', og: 'zh_TW', label: '繁中', name: '繁體中文', prefix: '' },
  en: { html: 'en', og: 'en_AU', label: 'EN', name: 'English', prefix: '/en' },
  ja: { html: 'ja', og: 'ja_JP', label: '日本語', name: '日本語', prefix: '/ja' },
  ko: { html: 'ko', og: 'ko_KR', label: '한국어', name: '한국어', prefix: '/ko' },
};
const HAS_CJK = /[　-〿㐀-鿿＀-￯]/;
const tmFile = (l) => path.join(ROOT, 'i18n', `${l}.json`);
function loadTM(l) {
  let raw;
  try { raw = fs.readFileSync(tmFile(l), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  try { return JSON.parse(raw); } catch (e) { throw new Error(`i18n/${l}.json 不是正確的 JSON：${e.message}`); }
}
function saveTM(l, tm) {
  const o = {};
  for (const k of Object.keys(tm).sort()) if (typeof tm[k] === 'string' && tm[k] !== '') o[k] = tm[k];
  fs.mkdirSync(path.dirname(tmFile(l)), { recursive: true });
  fs.writeFileSync(tmFile(l), JSON.stringify(o, null, 1) + '\n');
}
// 查譯文：記下這次建置用到哪些原文（used）、哪些還沒有譯文（missing）
function makeTr(l, tm) {
  const used = new Set(), missing = new Set(), ui = new Set();
  const tr = (s) => {
    if (l === 'zh' || typeof s !== 'string' || !HAS_CJK.test(s)) return s;
    used.add(s);
    const t = tm[s];
    if (typeof t === 'string' && t !== '') return t;
    missing.add(s);
    return s;
  };
  const trUi = (s) => { if (typeof s === 'string' && HAS_CJK.test(s)) ui.add(s); return tr(s); }; // 介面文字（人工翻譯）
  return { tr, trUi, used, missing, ui };
}
// 網頁的文字節點和 aria-label／placeholder／title／alt／content 屬性換成譯文；<script>、<style>、註解保持原樣
const ATTR_RE = /(\s(?:aria-label|placeholder|title|alt|content)=)(["'])(.*?)\2/g;
function translateHtml(html, tr) {
  const re = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>|[^<]+/gi;
  let out = '';
  for (const [s] of html.matchAll(re)) {
    if (s.startsWith('<!--') || /^<(script|style)\b/i.test(s)) out += s;
    else if (s[0] === '<') out += s.replace(ATTR_RE, (all, name, q, v) => (HAS_CJK.test(v) ? name + q + tr(v) + q : all));
    else if (!HAS_CJK.test(s)) out += s;
    else { const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0]; out += lead + tr(s.trim()) + trail; }
  }
  return out;
}
// 版型 <script> 裡用到的 TR("原文")：只把這些字串的譯文放進頁面
function scriptDict(html, tr) {
  const d = {};
  for (const [, body] of html.matchAll(/<script\b(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of body.matchAll(/\bTR\("((?:[^"\\]|\\.)*)"/g)) {
      const k = JSON.parse(`"${m[1]}"`);
      const v = tr(k);
      if (v !== k) d[k] = v;
    }
  }
  return d;
}
// 每筆資料要翻譯的欄位；英文版的標題直接用官方英文名稱（title）
const ITEM_FIELDS = ['title_zh', 'summary_zh', 'tip_zh', 'price_zh', 'schedule_zh', 'highlight', 'area_zh', 'city', 'venue'];
function translateItem(it, l, tr) {
  const o = Object.assign({}, it);
  for (const f of ITEM_FIELDS) if (typeof it[f] === 'string') o[f] = f === 'title_zh' && l === 'en' && it.title ? it.title : tr(it[f]);
  if (it.verified) { o.verified = Object.assign({}, it.verified); if (it.verified.unconfirmed_zh) o.verified.unconfirmed_zh = tr(it.verified.unconfirmed_zh); }
  o.sources = (it.sources || []).map((s) => Object.assign({}, s, { platform: tr(s.platform), label: tr(s.label) }));
  if (!it.end && /每週/.test(it.schedule_zh || '')) o.wk = 1; // 行事曆「每週重複」：譯文裡沒有「每週」兩個字，先在這裡判斷
  return o;
}

/* ---------- 讀資料並檢查 ---------- */
const data = JSON.parse(read('data/items.json'));
const geo = JSON.parse(read('data/au-states.geojson'));
// 合併重複項目：data/aliases.json 是「舊 id → 保留的 id」。舊的那筆不上網站、來源併到保留的那筆（tools/dupes.js），
// 舊的分享連結（#舊id）和收藏也會指到保留的那筆；保留的那筆已下架的對照就不帶進頁面
let aliases = {};
try { aliases = JSON.parse(read('data/aliases.json')); } catch (e) { if (e.code !== 'ENOENT') throw new Error(`data/aliases.json 不是正確的 JSON：${e.message}`); }
data.items = require('./tools/dupes').applyAliases(data.items, aliases).items;
const liveIds = new Set(data.items.map((i) => i.id));
aliases = Object.fromEntries(Object.entries(aliases).filter(([a, b]) => !liveIds.has(a) && liveIds.has(b)));
const REGIONS = ['AU', 'QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const CATS = ['festival', 'music', 'food', 'market', 'arts', 'sport', 'outdoors', 'family', 'shopping', 'grocery', 'dining', 'tickets', 'entertainment', 'travel'];
const KINDS = ['official', 'social', 'community', 'news'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
function check() {
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
}

/* ---------- 組版 ---------- */
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const leafletCss = read('src/vendor/leaflet.css')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/[^{}]*\{[^{}]*url\(images\/[^)]*\)[^{}]*\}/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function fill(tpl, cfg, d, dict) {
  return tpl
    .replace('/*__LEAFLET_CSS__*/', () => leafletCss)
    .replace('/*__DATA__*/', () => json(d))
    .replace('/*__GEO__*/', () => json(geo))
    .replace('/*__I18N__*/{}', () => json(dict || {}))
    .replace('/*__CONFIG__*/{api:false,tiles:false}', () => JSON.stringify(cfg));
}

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(read('brand/logo-mark.svg').trim());
const site = JSON.parse(read('site.json'));
const SITE_URL = (site.url || '').replace(/\/+$/, '');

// 語言切換：電腦版四個按鈕並排，手機版收成下拉選單（和集簽圖書館相同做法）；rel 是這一頁在語言目錄下的路徑
const GLOBE = '<svg class="lang-globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>';
const CHEV = '<svg class="lang-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const langLinks = (l, rel, full) => LANGS.map((x) => `<a href="${LANG_META[x].prefix}/${rel}" hreflang="${LANG_META[x].html}" lang="${LANG_META[x].html}" data-lang="${x}"${x === l ? ' aria-current="true"' : ''}>${full ? LANG_META[x].name : LANG_META[x].label}</a>`).join('');
const langMenu = (l, rel, cls) => `<details class="lang-menu${cls ? ' ' + cls : ''}"><summary aria-label="Language: ${LANG_META[l].name}">${GLOBE}<span class="lang-cur">${LANG_META[l].label}</span>${CHEV}</summary><div class="lang-pop" role="navigation" aria-label="Language">${langLinks(l, rel, true)}</div></details>`;
// 頁首：電腦版並排按鈕＋平板下拉選單；首頁的手機版下拉選單放在開場區右上角（手機頁首已經沒有空間）
const langSwitch = (l, rel) => `<div class="lang-switch" role="navigation" aria-label="Language">${langLinks(l, rel, false)}</div>` + langMenu(l, rel);
// 換語言時保留網址的 #（打開中的項目、免責聲明的段落）；點外面或按 Esc 收起下拉選單（用事件委派，之後才出現的選單也適用）
const LANG_JS = `<script>
(() => {
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-lang]');
    if (a && location.hash) a.href = a.getAttribute('href').split('#')[0] + location.hash;
    document.querySelectorAll('.lang-menu[open]').forEach(m => { if (!m.contains(e.target)) m.open = false; });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.lang-menu[open]').forEach(m => { m.open = false; m.querySelector('summary').focus(); });
  });
})();
</script>`;

function headLinks(l, rel) {
  if (!SITE_URL) return '';
  const u = (x) => `${SITE_URL}${LANG_META[x].prefix}/${rel}`;
  return `<link rel="canonical" href="${u(l)}">\n`
    + LANGS.map((x) => `<link rel="alternate" hreflang="${LANG_META[x].html}" href="${u(x)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${u('zh')}">\n`;
}

// 把「只有內容」的版型包成完整網頁：<title>/<meta>/<link>/<style> 放進 head，其餘放進 body
function wrap(content, extraHead = '', l = 'zh') {
  const cut = content.search(/<(div|main|section|header)\b/);
  const head = content.slice(0, cut);
  const body = content.slice(cut);
  return `<!doctype html>
<html lang="${LANG_META[l].html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFFDF8">
<link rel="icon" href="${FAVICON}">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
${extraHead}${head}</head>
<body>
${body}</body>
</html>
`;
}

const og = (l) => `<meta property="og:title" content="澳洲活動優惠地圖">
<meta property="og:description" content="為在澳洲打工度假的人整理各州的超市特價、餐飲優惠、節慶活動與交通旅遊資訊，每筆均附官方來源並經獨立查證。">
<meta property="og:type" content="website">
<meta property="og:locale" content="${LANG_META[l].og}">
<meta property="og:image" content="https://au-working-holiday.pages.dev/images/deals.jpg">
${SITE_URL ? `<meta property="og:url" content="${SITE_URL}${LANG_META[l].prefix}/">\n` : ''}`;

const UNTRANSLATED = '本頁部分內容尚未完成翻譯，暫以繁體中文原文顯示。';
// 組出一種語言的首頁與免責聲明頁；回傳這次用到、缺少的原文
function buildLang(l, tm) {
  const { tr: trData, trUi: tr, used, missing, ui } = makeTr(l, tm);
  const pages = {};
  const finish = (html, rel, dataMissing) => {
    let out = l === 'zh' ? html : translateHtml(html, tr);
    out = out.replace('<!--LANG_MENU_HERO-->', () => langMenu(l, rel, 'lang-hero'));
    out = out.replace('<!--LANG_SWITCH-->', () => langSwitch(l, rel) + LANG_JS);
    const notice = tr(UNTRANSLATED); // 每次都查一次：翻譯完整時也要留著這段譯文（prune 不能刪）
    const note = l !== 'zh' && dataMissing ? `<div class="i18n-note" role="note"><div class="wrap">${notice}</div></div>` : '';
    return out.replace('<!--UNTRANSLATED-->', () => note);
  };
  // 首頁
  const indexTpl = read('src/index.html');
  const before = missing.size;
  const d = l === 'zh' ? Object.assign({}, data, { aliases }) : { updated: data.updated, aliases, items: data.items.map((it) => translateItem(it, l, trData)) };
  // 提示列只在缺不少翻譯時出現（剛推送的新項目、翻譯還在跑）；零星幾段自動翻譯一直沒通過檢查的不另外提示
  const dataMissing = missing.size - before > 10;
  const dict = scriptDict(indexTpl, tr);
  const cfg = { api: true, tiles: true, lang: l, prefix: LANG_META[l].prefix };
  pages.index = finish(wrap(fill(indexTpl, cfg, d, dict), og(l) + headLinks(l, ''), l), '', dataMissing);
  if (l === 'zh') pages.artifact = finish(fill(indexTpl, { api: false, tiles: false }, d, dict), '', false);
  // 免責聲明
  const disclaimerTpl = read('src/disclaimer.html');
  pages.disclaimer = finish(wrap(disclaimerTpl, headLinks(l, 'disclaimer/'), l), 'disclaimer/', false);
  return { pages, used, missing, ui };
}

/* ---------- 建置 ---------- */
// write=false：只算出各語言用到、缺少的原文（tools/i18n.js 用），不寫檔
function build({ write: doWrite = true } = {}) {
  check();
  const result = {};
  for (const l of LANGS) {
    const tm = l === 'zh' ? {} : loadTM(l);
    const r = buildLang(l, tm);
    result[l] = { used: r.used, missing: r.missing, ui: r.ui };
    if (!doWrite) continue;
    const p = LANG_META[l].prefix ? LANG_META[l].prefix.slice(1) + '/' : '';
    write(`public/${p}index.html`, r.pages.index);
    write(`public/${p}disclaimer/index.html`, r.pages.disclaimer);
    if (l === 'zh') {
      write('artifact/index.html', r.pages.artifact);
      write('artifact/disclaimer/index.html', r.pages.disclaimer);
    }
  }
  if (!doWrite) return result;

  write('public/stats/index.html', wrap(read('src/stats.html'), '<meta name="robots" content="noindex">\n'));
  write('public/items.json', JSON.stringify({ updated: data.updated, items: data.items.map((i) => ({ id: i.id, title_zh: i.title_zh, region: i.region, type: i.type })) }));
  write('public/_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=()

/
  Cache-Control: public, max-age=0, must-revalidate
${LANGS.filter((l) => l !== 'zh').map((l) => `
${LANG_META[l].prefix}/
  Cache-Control: public, max-age=0, must-revalidate
`).join('')}
/stats/*
  X-Robots-Tag: noindex
  Cache-Control: no-store
`);
  for (const f of fs.readdirSync(path.join(ROOT, 'brand')).filter((f) => f.endsWith('.svg'))) write('public/brand/' + f, read('brand/' + f));
  // PNG 圖示（分頁圖示備援、iPhone 主畫面、Android）；iPhone 預設也會找根目錄的 /apple-touch-icon.png
  for (const f of fs.readdirSync(path.join(ROOT, 'brand')).filter((f) => f.endsWith('.png'))) fs.copyFileSync(path.join(ROOT, 'brand', f), path.join(ROOT, 'public/brand', f));
  fs.copyFileSync(path.join(ROOT, 'brand/apple-touch-icon.png'), path.join(ROOT, 'public/apple-touch-icon.png'));
  write('public/site.webmanifest', JSON.stringify({
    name: '澳洲活動優惠地圖', short_name: '優惠地圖', start_url: '/', display: 'browser',
    background_color: '#FFFDF8', theme_color: '#FFFDF8',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));

  const v = data.items.filter((i) => i.verified.status === 'verified').length;
  console.log(`完成：${data.items.length} 筆（${v} 筆完整查證、${data.items.length - v} 筆部分查證）→ public/ 與 artifact/`);
  const miss = LANGS.filter((l) => l !== 'zh').map((l) => `${LANG_META[l].name} ${result[l].missing.size}`);
  console.log(`語言：繁中、English、日本語、한국어；缺翻譯的段落：${miss.join('、')}（先顯示中文，推送後 GitHub Actions「自動翻譯」會補上）`);
  return result;
}

module.exports = { LANGS, LANG_META, HAS_CJK, loadTM, saveTM, build };
if (require.main === module) build();
