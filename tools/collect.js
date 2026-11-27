// 自動蒐集（不需要 Claude、零相依，Node 18 以上）：GitHub Actions「自動蒐集線索」每 3 小時跑一次。
// 用法：node tools/collect.js [rss] [links] [watch]   （不給就三件都做）
//
//   rss    讀 tools/feeds.json 的 RSS，把新線索累積到 data/auto/leads.json（保留 5 天）。
//          OzBargain 等 RSS 只顯示最近幾十筆，一天讀一次會漏掉；每 3 小時讀一次就不會漏。
//   links  打開每個項目的官方來源，連續兩次找不到頁面（404／410）就記在 data/auto/links.json，
//          tools/daily.js due 會把它排進當天的重新查證。被擋（403、驗證碼）不算壞掉。
//   watch  打開 tools/SOURCES.md「新增來源」的官方活動頁，和上次比對，把新出現的文字
//          記在 data/auto/watch.json（保留 3 天），給研究員優先看。比對用的指紋存在
//          .cache/watch-state.json（GitHub Actions 快取，不放進倉庫）。
//
// 這支程式只寫 data/auto/ 和 .cache/，不碰 data/items.json、不碰 git。
// data/auto/ 只是給每日 Claude 的線索清單，網站不會讀，也不會顯示。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readFeeds, knownTitles, norm } = require('./feeds.js');

const ROOT = path.join(__dirname, '..');
const AUTO = path.join(ROOT, 'data', 'auto');
const CACHE = path.join(ROOT, '.cache');
const UA = 'Mozilla/5.0 (compatible; au-deals-map link checker; +https://au-deals-map.pages.dev)';
const LEAD_DAYS = 5, WATCH_DAYS = 3, MAX_LEADS = 400, MAX_LINES = 12;
const now = () => new Date(Date.now() + 10 * 3600e3);
const bne = (offsetDays = 0) => new Date(now().getTime() + offsetDays * 86400e3).toISOString().slice(0, 10);
const stamp = () => now().toISOString().slice(0, 16).replace('T', ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
const writeJson = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\n'); };
const items = () => readJson(path.join(ROOT, 'data', 'items.json'), { items: [] }).items;

// ---------- rss ----------
function mergeLeads(old, fresh, known, today) {
  const cut = new Date(Date.parse(today + 'T00:00:00Z') - LEAD_DAYS * 86400e3).toISOString().slice(0, 10); // 以傳入的「今天」算，測試才不會隨日期壞掉
  const by = new Map(old.map((l) => [l.url, l]));
  for (const l of fresh) {
    const prev = by.get(l.url);
    by.set(l.url, { ...l, first_seen: prev ? prev.first_seen : today, last_seen: today });
  }
  return [...by.values()]
    .filter((l) => l.first_seen >= cut)                                            // 太舊的線索丟掉
    .filter((l) => { const k = norm(l.title); return !known.some((t) => k.includes(t) || t.includes(k)); }) // 網站已經有了
    .sort((a, b) => (b.first_seen + (b.date || '')).localeCompare(a.first_seen + (a.date || '')))
    .slice(0, MAX_LEADS);
}

async function rss() {
  const file = path.join(AUTO, 'leads.json');
  const old = readJson(file, { leads: [] }).leads;
  const known = knownTitles(items());
  const { leads, failed } = await readFeeds(2, known, () => {});
  const merged = mergeLeads(old, leads, known, bne());
  const added = merged.filter((l) => !old.some((o) => o.url === l.url)).length;
  writeJson(file, { updated: stamp(), note: '自動蒐集的線索（RSS），只是線索，每一筆都要到官方頁面查證。', failed, leads: merged });
  console.log(`rss：這次讀到 ${leads.length} 條、新增 ${added} 條，清單共 ${merged.length} 條${failed.length ? `；讀不到 ${failed.length} 個來源` : ''}`);
}

// ---------- links / watch 共用 ----------
async function fetchPage(url, wantText) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'en-AU,en;q=0.9' }, signal: ctl.signal, redirect: 'follow' });
    const text = wantText && r.ok ? (await r.text()).slice(0, 3e6) : (await r.body?.cancel?.(), '');
    return { status: r.status, final: r.url, text };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? '逾時' : String(e.cause?.code || e.message) };
  } finally { clearTimeout(t); }
}
// 404、410 才算「頁面不見了」；403、429、5xx、逾時多半是擋機器人或暫時故障
const classify = (r) => (r.status >= 200 && r.status < 400 ? 'ok' : r.status === 404 || r.status === 410 ? 'gone' : 'blocked');

async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } }));
  return out;
}
// 同一個網站一次只開一頁、間隔 1.5 秒，避免造成對方負擔
function byHost(urls) {
  const m = new Map();
  for (const u of urls) { let h; try { h = new URL(u.url).host; } catch { continue; } if (!m.has(h)) m.set(h, []); m.get(h).push(u); }
  return [...m.values()];
}

// ---------- links ----------
function updateLink(prev, res, today) {
  const state = classify(res);
  const fails = state === 'gone' ? (prev && prev.state === 'gone' ? prev.fails + 1 : 1) : 0;
  return { state, status: res.status || res.error, checked: today, fails, since: state === 'gone' ? (prev && prev.state === 'gone' ? prev.since : today) : null };
}

async function links() {
  const file = path.join(AUTO, 'links.json');
  const old = readJson(file, { links: {} }).links;
  const today = bne();
  const todo = [];
  for (const it of items()) for (const s of it.sources || []) if (s.kind === 'official' && /^https?:/.test(s.url)) todo.push({ id: it.id, url: s.url });
  const res = {};
  await pool(byHost(todo), 6, async (group) => { for (const u of group) { res[u.url] = await fetchPage(u.url, false); await sleep(1500); } });
  const out = {};
  for (const u of todo) out[u.url] = { id: u.id, ...updateLink(old[u.url], res[u.url], today) };
  const broken = Object.entries(out).filter(([, v]) => v.state === 'gone' && v.fails >= 2);
  const count = (s) => Object.values(out).filter((v) => v.state === s).length;
  writeJson(file, { updated: stamp(), note: 'state：ok 正常、gone 找不到頁面（404／410）、blocked 被擋或暫時打不開。gone 連續 2 次以上會排進重新查證。', broken: broken.map(([url, v]) => ({ id: v.id, url, since: v.since })), links: out });
  console.log(`links：檢查 ${todo.length} 個官方網址，正常 ${count('ok')}、被擋 ${count('blocked')}、找不到 ${count('gone')}（連續 2 次：${broken.length}）`);
}

// ---------- watch ----------
// 把網頁變成一行一行的文字（去掉程式碼、選單），用來比對新出現的內容
function pageLines(html) {
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const text = body.replace(/<\/?(p|div|li|h[1-6]|tr|td|th|section|article|br|a|span|time|dd|dt)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, '-').replace(/&[a-z]+;|&#\d+;/g, ' ');
  const seen = new Set(), out = [];
  for (let l of text.split('\n')) {
    l = l.replace(/\s+/g, ' ').trim();
    if (l.length < 12 || l.length > 300 || !/[a-z]{3}/i.test(l) || seen.has(l)) continue;
    seen.add(l); out.push(l);
  }
  return out;
}
const lineKey = (l) => sha(l.toLowerCase()).slice(0, 10);

function watchList() {
  const md = fs.readFileSync(path.join(__dirname, 'SOURCES.md'), 'utf8');
  const out = [], seen = new Set();
  for (const line of md.split('\n')) {
    const m = line.match(/^- (\d{4}-\d\d-\d\d)｜([^｜]*)｜([^｜]*)｜(https?:\/\/[^｜\s]+)/);
    if (m && !seen.has(m[4])) { seen.add(m[4]); out.push({ url: m[4], cat: m[2].trim(), name: m[3].trim() }); }
  }
  return out;
}

function diffPage(prevKeys, lines) {
  const keys = lines.map(lineKey);
  if (!prevKeys) return { keys, added: [] };                 // 第一次看到：只記下來，不算新內容
  const had = new Set(prevKeys);
  const added = lines.filter((l, i) => !had.has(keys[i]));
  // 整頁幾乎全換（改版、換語言、擋機器人頁）就不算新內容，免得洗版
  if (lines.length && added.length / lines.length > 0.6) return { keys, added: [], redesigned: true };
  return { keys, added };
}

async function watch() {
  const stateFile = path.join(CACHE, 'watch-state.json');
  const outFile = path.join(AUTO, 'watch.json');
  const state = readJson(stateFile, {});
  const prevOut = readJson(outFile, { changes: [] }).changes;
  const today = bne(), cut = bne(-WATCH_DAYS);
  const list = watchList();
  const changes = [], blocked = [];
  let firstSeen = 0, redesigned = 0;
  await pool(byHost(list), 6, async (group) => {
    for (const p of group) {
      const r = await fetchPage(p.url, true);
      await sleep(1500);
      if (classify(r) !== 'ok') { blocked.push(p.url); continue; }
      const lines = pageLines(r.text);
      if (lines.length < 3) { blocked.push(p.url); continue; }   // 內容是 JavaScript 載入的，讀不到
      const d = diffPage(state[p.url], lines);
      if (!state[p.url]) firstSeen++;
      if (d.redesigned) redesigned++;
      state[p.url] = d.keys.slice(0, 3000);
      if (d.added.length) changes.push({ ...p, found: today, new_lines: d.added.slice(0, MAX_LINES).map((l) => l.slice(0, 200)), more: Math.max(0, d.added.length - MAX_LINES) });
    }
  });
  writeJson(stateFile, state);
  const kept = prevOut.filter((c) => c.found >= cut && !changes.some((n) => n.url === c.url));
  const all = [...changes, ...kept].sort((a, b) => b.found.localeCompare(a.found));
  writeJson(outFile, { updated: stamp(), note: `官方活動頁最近 ${WATCH_DAYS} 天新出現的文字，只是線索，要打開網址確認。`, blocked_count: blocked.length, changes: all });
  console.log(`watch：看了 ${list.length} 個官方頁面，有新內容 ${changes.length}、第一次記錄 ${firstSeen}、改版不算 ${redesigned}、打不開或讀不到 ${blocked.length}`);
}

module.exports = { mergeLeads, classify, updateLink, pageLines, diffPage, watchList };

if (require.main === module) (async () => {
  const want = process.argv.slice(2);
  const run = (k) => !want.length || want.includes(k);
  let failed = false;
  for (const [k, fn] of [['rss', rss], ['links', links], ['watch', watch]]) {
    if (!run(k)) continue;
    try { await fn(); } catch (e) { failed = true; console.error(`${k} 失敗：${e.stack || e}`); }
  }
  process.exit(failed ? 1 : 0);
})();
