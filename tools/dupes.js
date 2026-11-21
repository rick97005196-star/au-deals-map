// 找出重複的項目（零相依）。tools/daily.js 的 add 和 dupes 指令、tools/auto-daily.js 都用這支。
//
// 兩筆算「重複」要同時符合：
//   1. 同一州（或都是全澳）、日期有重疊
//   2. 地點相近：都有座標時距離 3 公里內；都沒有座標也算（全澳或全州的優惠）
//   3. 官方來源的網域相同（同一個品牌或主辦單位）；標題和價格裡的金額、折扣沒有互相矛盾（A$9 和 A$10 是不同方案）
//   4. 相似度 ≥ SCORE：中英文標題的平均相似度，官方網址相同、金額與折扣完全相同再加分
// 用現有資料調過門檻：抓得到 Telstra、Muffin Break、昆州火車、ACMI、Starbucks 的重複，
// 不會把同網域的不同活動（Fed Square 各種聖誕活動、Williams 兩種折扣）當成重複。
// 研究員常常把同一個優惠用不同 id、不同標題再找一次，只比對完全相同的標題擋不住。

const SCORE = 0.7; // 標題平均相似度，加上官方網址相同 +0.15、金額完全相同 +0.2；只有一邊有金額 -0.1
const STOP = /20\d\d|\b(?:australia|australian|au|the|and|for|with|of|in|at|sale|deal|offer)\b|優惠|活動|澳洲|全澳/g;

function grams(s) {
  s = String(s || '').toLowerCase().replace(STOP, '').replace(/[\s\p{P}\p{S}]/gu, '');
  const g = new Set();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}
// 官方網址：去掉 http(s)、www、query、#、結尾的 /；只有網域（首頁）的不拿來比對，太多優惠共用首頁
function officialUrls(it) {
  const out = new Set();
  for (const s of it.sources || []) {
    if (s.kind !== 'official' || !s.url) continue;
    const u = s.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (u.includes('/')) out.add(u);
  }
  return out;
}
function km(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const hasPt = (it) => typeof it.lat === 'number' && typeof it.lng === 'number';
const overlap = (a, b) => (a.start || '0') <= (b.end || '9') && (b.start || '0') <= (a.end || '9');

// 官方來源的網域（去掉 www.），同一個品牌／主辦單位通常是同一個網域
const domains = (it) => new Set((it.sources || []).filter((s) => s.kind === 'official' && s.url).map((s) => s.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0]));
// 標題與價格裡的金額與折扣（$9、A$10、30%、7 折），用來分辨同品牌的不同方案
const nums = (it) => new Set([...`${it.title} ${it.title_zh} ${it.price_zh}`.matchAll(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(%|折)/g)].map((m) => m[1] || m[2] + m[3]));
function prep(it) {
  return { it, zh: grams(it.title_zh), en: grams(it.title), urls: officialUrls(it), doms: domains(it), nums: nums(it) };
}
// 回傳相似原因（字串），不像就回傳 null
// 查證過確定是不同活動、名稱卻很像的組合（例：Sea Acres 早上的文化導覽和下午的海岸導覽）
const NOT_DUPES = new Set([
  'npws-sea-acres-aboriginal-culture-tour-2026-11|nsw-sea-acres-aboriginal-coastal-tour-2026',
  'martin-place-christmas-markets-2026|sydney-martin-place-christmas-tree-2026',
]);
const pairKey = (a, b) => [a, b].sort().join('|');
function compare(A, B) {
  const a = A.it, b = B.it;
  if (NOT_DUPES.has(pairKey(a.id, b.id))) return null;
  if (a.id === b.id || a.region !== b.region || !overlap(a, b)) return null;
  if (hasPt(a) !== hasPt(b)) return null;
  if (hasPt(a) && km(a, b) > 3) return null;
  if (![...A.doms].some((x) => B.doms.has(x))) return null;
  if (A.nums.size && B.nums.size && ![...A.nums].some((n) => B.nums.has(n))) return null;
  const sim = (dice(A.zh, B.zh) + dice(A.en, B.en)) / 2;
  const sameUrl = [...A.urls].some((u) => B.urls.has(u));
  const sameNums = A.nums.size > 0 && A.nums.size === B.nums.size && [...A.nums].every((n) => B.nums.has(n));
  const oneSided = (A.nums.size > 0) !== (B.nums.size > 0);
  const score = sim + (sameUrl ? 0.15 : 0) + (sameNums ? 0.2 : 0) - (oneSided ? 0.1 : 0);
  if (score >= SCORE) return `相似度 ${score.toFixed(2)}（標題 ${sim.toFixed(2)}${sameUrl ? '、官方網址相同' : ''}${sameNums ? '、金額相同' : ''}）`;
  return null;
}

// 現有資料裡的重複組：[{ a, b, why }]
function findDupes(items) {
  const P = items.map(prep), out = [];
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++) {
      const why = compare(P[i], P[j]);
      if (why) out.push({ a: P[i].it, b: P[j].it, why });
    }
  return out;
}
// 新項目 cand 和現有 items 裡哪一筆重複，沒有就回傳 null
function dupeOf(cand, items) {
  const C = prep(cand);
  for (const it of items) {
    const why = compare(C, prep(it));
    if (why) return { it, why };
  }
  return null;
}

module.exports = { findDupes, dupeOf, compare, prep };

// 依 data/aliases.json（舊 id → 保留的 id）合併重複項目：舊的那筆刪掉，它的來源併到保留的那筆。
// build.js 每次建置都套用（只在記憶體，網站立刻不重複）；tools/auto-daily.js 每天套用並寫回 data/items.json。
// 保留的那筆已經下架時，舊的那筆照樣留著（不會因為合併而少掉還在進行的項目）。
function applyAliases(items, aliases) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const merged = [];
  const keep = items.filter((it) => {
    const to = aliases[it.id];
    const target = to && to !== it.id && byId.get(to);
    if (!target) return true;
    const urls = new Set((target.sources || []).map((s) => s.url.replace(/\/+$/, '')));
    for (const s of it.sources || []) if (!urls.has(s.url.replace(/\/+$/, ''))) { target.sources.push(s); urls.add(s.url.replace(/\/+$/, '')); }
    if (it.hot) target.hot = true;
    merged.push(`${it.id} → ${to}`);
    return false;
  });
  return { items: keep, merged };
}
module.exports.applyAliases = applyAliases;
