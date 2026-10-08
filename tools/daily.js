// 每日更新用的小工具（零相依）。用法：node tools/daily.js <指令> [檔案…]
//
//   prune                      移除已經結束的項目（end 早於今天，布里斯本時間）
//   list                       列出目前所有項目，給研究員比對重複用
//   due [輸出檔]               列出今天要重新查證的現有項目（4 天內開始、部分查證滿 3 天、其他滿 7 天），可輸出成 JSON 給查證員
//   verdicts <查證結果.json>   把查證員對「現有項目」的結果套進去：drop 移除、fix 修正，更新查證狀態與日期
//   add <新項目.json> <查證結果.json>
//                              只把查證結果是 ok／fix 的新項目加進去（套用修正、補 added＝今天），重複的跳過
//   stamp                      把 updated 改成今天
//   gaps                       各分類、各州目前筆數，標出偏少的，研究員優先補這些
//   count                      印出目前項目數
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'items.json');
const load = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const save = (d) => fs.writeFileSync(FILE, JSON.stringify(d, null, 1) + '\n');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const bne = (offsetDays = 0) => new Date(Date.now() + 10 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const TODAY = bne();
const norm = (s) => String(s || '').toLowerCase().replace(/20\d\d/g, '').replace(/[^a-z0-9一-鿿]+/g, '');
const FIELDS = new Set(['type', 'title', 'title_zh', 'category', 'region', 'city', 'venue', 'lat', 'lng', 'area_zh', 'start', 'end', 'schedule_zh', 'price_zh', 'free', 'highlight', 'summary_zh', 'tip_zh', 'sources']);

function applyVerdict(item, v) {
  for (const [k, val] of Object.entries(v.fixes || {})) {
    if (FIELDS.has(k)) item[k] = val;
    else if (k !== 'id') console.warn(`  （略過不認得的欄位 ${k}）`);
  }
  const status = v.status === 'verified' ? 'verified' : 'partial';
  item.verified = { status, checked: TODAY };
  if (status === 'partial') item.verified.unconfirmed_zh = v.unconfirmed_zh || (v.fixes && v.fixes.unconfirmed_zh) || '部分資訊官方尚未公布。';
  for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
  return item;
}

const [cmd, a1, a2] = process.argv.slice(2);
const d = load();

switch (cmd) {
  case 'prune': {
    const keep = [], gone = [];
    for (const it of d.items) (it.end && it.end < TODAY ? gone : keep).push(it);
    d.items = keep;
    save(d);
    console.log(`今天 ${TODAY}：下架 ${gone.length} 筆，剩 ${keep.length} 筆`);
    gone.forEach((it) => console.log(`  - ${it.id}（${it.end} 結束）${it.title_zh}`));
    break;
  }
  case 'list': {
    for (const it of d.items) console.log(`${it.id} | ${it.region} | ${it.start}→${it.end || '…'} | ${it.title_zh} | ${it.title}`);
    console.log(`共 ${d.items.length} 筆`);
    break;
  }
  case 'due': {
    const soon = bne(4), stale = bne(-7), partialStale = bne(-3);
    const checked = (it) => it.verified.checked || '0';
    const due = d.items.filter((it) =>
      (it.start >= TODAY && it.start <= soon && checked(it) < TODAY) ||       // 4 天內開始：開始前每天確認沒取消
      (it.verified.status === 'partial' && checked(it) <= partialStale) ||    // 部分查證：每 3 天看官方是否補上資訊
      checked(it) <= stale);                                                  // 其他：每 7 天重查一次
    if (a1) fs.writeFileSync(a1, JSON.stringify(due, null, 1));
    console.log(`今天要重新查證 ${due.length} 筆${a1 ? `（已寫入 ${a1}）` : ''}`);
    due.forEach((it) => console.log(`  - ${it.id} | ${it.verified.status} | 上次 ${it.verified.checked} | ${it.start}`));
    break;
  }
  case 'verdicts': {
    if (!a1) throw new Error('要給查證結果檔');
    const vs = readJson(a1);
    const by = Object.fromEntries(d.items.map((i) => [i.id, i]));
    const dropped = [], fixed = [];
    for (const v of vs) {
      const it = by[v.id];
      if (!it) { console.warn(`  找不到 ${v.id}，略過`); continue; }
      if (v.verdict === 'drop') { dropped.push(`${it.id}（${v.note || ''}）`); delete by[v.id]; continue; }
      applyVerdict(it, v);
      if (v.verdict === 'fix') fixed.push(`${it.id}：${Object.keys(v.fixes || {}).join('、')}`);
    }
    d.items = d.items.filter((i) => by[i.id]);
    save(d);
    console.log(`查證結果：移除 ${dropped.length}、修正 ${fixed.length}、其餘維持`);
    dropped.forEach((s) => console.log('  移除 ' + s));
    fixed.forEach((s) => console.log('  修正 ' + s));
    break;
  }
  case 'add': {
    if (!a1 || !a2) throw new Error('要給新項目檔和查證結果檔');
    const cands = readJson(a1);
    const vs = Object.fromEntries(readJson(a2).map((v) => [v.id, v]));
    const ids = new Set(d.items.map((i) => i.id));
    const names = new Set(d.items.map((i) => i.region + ':' + norm(i.title)));
    const added = [], skipped = [];
    for (const c of cands) {
      const v = vs[c.id];
      if (!v) { skipped.push(`${c.id}（沒有查證結果）`); continue; }
      if (v.verdict === 'drop') { skipped.push(`${c.id}（查證不通過：${v.note || ''}）`); continue; }
      if (ids.has(c.id) || names.has(c.region + ':' + norm(c.title))) { skipped.push(`${c.id}（已經有了）`); continue; }
      if (!Array.isArray(c.sources) || !c.sources.some((s) => s.kind === 'official')) { skipped.push(`${c.id}（沒有官方來源）`); continue; }
      const it = applyVerdict({ ...c }, v);
      it.added = TODAY;
      d.items.push(it);
      ids.add(it.id); names.add(it.region + ':' + norm(it.title));
      added.push(`${it.id}｜${it.region}｜${it.title_zh}`);
    }
    save(d);
    console.log(`新增 ${added.length} 筆、跳過 ${skipped.length} 筆，目前共 ${d.items.length} 筆`);
    added.forEach((s) => console.log('  + ' + s));
    skipped.forEach((s) => console.log('  · ' + s));
    break;
  }
  case 'stamp': {
    d.updated = TODAY;
    save(d);
    console.log(`updated = ${TODAY}`);
    break;
  }
  case 'gaps': {
    // 目標：讓每個大分類、每個州都有足夠的內容（不足的標「偏少」，研究員優先補）
    const GROUPS = { 吃喝: ['grocery', 'dining', 'food'], 活動: ['festival', 'music', 'arts', 'market', 'sport', 'family', 'outdoors', 'entertainment'], 購物: ['shopping'], 行程交通: ['tickets', 'travel'] };
    const GOAL_G = { 吃喝: 25, 活動: 50, 購物: 15, 行程交通: 20 };
    const GOAL_R = { AU: 30, QLD: 20, NSW: 15, VIC: 15, SA: 8, WA: 8, TAS: 6, ACT: 5, NT: 5 };
    const live = d.items.filter((it) => !it.end || it.end >= TODAY);
    const by = (f) => live.reduce((m, it) => ((m[f(it)] = (m[f(it)] || 0) + 1), m), {});
    const cat = by((it) => it.category), reg = by((it) => it.region);
    console.log('大分類（目前／目標）');
    for (const [g, cs] of Object.entries(GROUPS)) {
      const n = cs.reduce((s, c) => s + (cat[c] || 0), 0);
      console.log(`  ${n < GOAL_G[g] ? '偏少' : '　　'} ${g} ${n}／${GOAL_G[g]}：${cs.map((c) => c + ' ' + (cat[c] || 0)).join('、')}`);
    }
    console.log('地區（目前／目標）');
    for (const [r, goal] of Object.entries(GOAL_R)) console.log(`  ${(reg[r] || 0) < goal ? '偏少' : '　　'} ${r} ${reg[r] || 0}／${goal}`);
    const soon = live.filter((it) => it.start > TODAY && it.start <= bne(14)).length;
    console.log(`未來 14 天內開始：${soon} 筆${soon < 15 ? '（偏少，多找近期活動）' : ''}`);
    break;
  }
  case 'count': {
    console.log(d.items.length);
    break;
  }
  default:
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
}
