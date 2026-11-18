// 多語言小工具（零相依，Node 18 以上）。翻譯對照在 i18n/en.json、ja.json、ko.json：{ "中文原文": "譯文" }
//
//   node tools/i18n.js missing [輸出.json]   列出各語言缺的翻譯（介面文字、資料分開算）；給檔名就寫成 { "en": { "原文": "" }, … } 方便填
//   node tools/i18n.js apply <檔案.json>      把填好的翻譯併入（格式同上；空字串略過；已經有的會被換掉＝修正翻譯）
//   node tools/i18n.js auto [--max N]        用 Google 翻譯補上缺的「資料」翻譯（GitHub Actions「自動翻譯」用，需要網路，不需要密鑰）
//                                            只補缺的、不覆蓋已有的譯文；含 HTML 或 {0} 的介面文字不自動翻，留給人工
//   node tools/i18n.js prune                 刪掉現在用不到的舊翻譯（下架項目、改過的原文）
//
// 介面文字的翻譯由人工（Claude）寫好放在同一份檔案；資料（data/items.json）的翻譯由 auto 每天補上。
const fs = require('fs');
const path = require('path');
const { LANGS, HAS_CJK, loadTM, saveTM, build } = require('../build.js');

const ROOT = path.join(__dirname, '..');
const TARGETS = LANGS.filter((l) => l !== 'zh');
const GOOGLE_LANG = { en: 'en', ja: 'ja', ko: 'ko' };
const isUiOnly = (s) => /[<>]|\{\d+\}|&[a-z]+;|&#\d+;/.test(s); // 含標籤或參數：只給人工翻譯

// 這次建置會用到的原文（各語言）；資料的原文另外列出，方便分開統計
function collect() {
  const r = build({ write: false });
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
  const dataKeys = new Set();
  const add = (s) => { if (typeof s === 'string' && HAS_CJK.test(s)) dataKeys.add(s); };
  for (const it of data.items) {
    ['title_zh', 'summary_zh', 'tip_zh', 'price_zh', 'schedule_zh', 'highlight', 'area_zh', 'city', 'venue'].forEach((f) => add(it[f]));
    if (it.verified) add(it.verified.unconfirmed_zh);
    for (const s of it.sources || []) { add(s.platform); add(s.label); }
  }
  return { r, dataKeys };
}

function cmdMissing(out) {
  const { r, dataKeys } = collect();
  const dump = {};
  for (const l of TARGETS) {
    const miss = [...r[l].missing];
    const ui = miss.filter((k) => r[l].ui.has(k) || !dataKeys.has(k));
    console.log(`${l}：缺 ${miss.length} 段（介面 ${ui.length}、資料 ${miss.length - ui.length}）`);
    dump[l] = Object.fromEntries(miss.sort().map((k) => [k, '']));
    if (ui.length && ui.length <= 30) ui.forEach((k) => console.log('   介面：' + k));
  }
  if (out) { fs.writeFileSync(out, JSON.stringify(dump, null, 1) + '\n'); console.log(`已寫到 ${out}`); }
}

function cmdApply(file) {
  if (!file) { console.error('要給翻譯檔：node tools/i18n.js apply <檔案.json>'); process.exit(1); }
  const add = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const l of TARGETS) {
    if (!add[l]) continue;
    const tm = loadTM(l);
    let n = 0;
    for (const [k, v] of Object.entries(add[l])) if (typeof v === 'string' && v.trim() !== '') { tm[k] = v; n++; }
    saveTM(l, tm);
    console.log(`${l}：併入 ${n} 段`);
  }
}

function cmdPrune() {
  const { r } = collect();
  for (const l of TARGETS) {
    const tm = loadTM(l);
    const keep = r[l].used;
    let n = 0;
    for (const k of Object.keys(tm)) if (!keep.has(k)) { delete tm[k]; n++; }
    saveTM(l, tm);
    console.log(`${l}：刪掉 ${n} 段用不到的翻譯，留下 ${Object.keys(tm).length} 段`);
  }
}

/* ---------- 自動翻譯（Google 翻譯公開介面，和超市特價網站的備援翻譯相同） ---------- */
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// 澳幣金額先寫成「AUD 12.81」再送，翻好再換回「A$12.81」：Google 有時會把 A$8 換算成 ¥800、₩12,800
const AMOUNT = /A\$\s?(\d[\d,]*(?:\.\d+)?)/g;
async function google(text, tl) {
  const out = await googleRaw(text.replace(AMOUNT, 'AUD $1'), tl);
  return out.replace(/AUD\s?(\d[\d,]*(?:\.\d+)?)/g, 'A$$$1');
}
async function googleRaw(text, tl) {
  const base = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-TW&tl=' + tl + '&dt=t';
  const ua = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }; // 和超市特價網站的備援翻譯相同
  const long = encodeURIComponent(text).length > 6000;
  const res = await fetch(long ? base : base + '&q=' + encodeURIComponent(text), long
    ? { method: 'POST', headers: { ...ua, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'q=' + encodeURIComponent(text) }
    : { headers: ua });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  const j = await res.json();
  return (j[0] || []).map((seg) => seg[0] || '').join('').trim();
}
// 檢查機器翻譯：價格、百分比一定要原封不動；英文、韓文不能留中文字；日文不能和原文一模一樣
const HAN = /[㐀-鿿]/;
function verify(src, out, l) {
  if (!out) return '空白';
  if (out.length < Math.max(1, src.length * 0.15)) return '太短';
  if ((l === 'en' || l === 'ko') && HAN.test(out)) return '還有中文字';
  if (l === 'ja' && out === src && src.length > 8) return '沒有翻譯'; // 短的漢字詞日文常常一樣（季節限定）
  const nums = (s) => (s.match(/\d+(?:[.,]\d+)*/g) || []).map((x) => x.replace(/,/g, ''));
  const money = src.match(/\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%/g) || [];
  const outNums = new Set(nums(out));
  for (const m of money) if (!/^100\s?%$/.test(m)) for (const n of nums(m)) if (!outNums.has(n)) return `價格或百分比 ${m} 不見了`; // 100% 免費 → 完全無料 也算對
  if (/[<>]/.test(out) && !/[<>]/.test(src)) return '多了 < >';
  return '';
}
function tidy(out, l) {
  let t = out.replace(/\s+/g, ' ').trim();
  if (l === 'en' || l === 'ko') t = t.replace(/（/g, ' (').replace(/）/g, ') ').replace(/：/g, ': ').replace(/；/g, '; ').replace(/，/g, ', ').replace(/\s+([),.;:])/g, '$1').replace(/\(\s+/g, '(').replace(/\s{2,}/g, ' ').trim();
  return t;
}

async function cmdAuto(args) {
  const max = Number((args[args.indexOf('--max') + 1]) || 0) || Infinity;
  const { r, dataKeys } = collect();
  let failStreak = 0, total = 0, stopped = '';
  for (const l of TARGETS) {
    const tm = loadTM(l);
    const human = (k) => r[l].ui.has(k) || !dataKeys.has(k) || isUiOnly(k); // 介面文字留給人工翻譯
    const todo = [...r[l].missing].filter((k) => !human(k)).slice(0, max);
    const skipped = [...r[l].missing].filter(human);
    let done = 0, bad = 0;
    console.log(`${l}：要翻 ${todo.length} 段${skipped.length ? `（另有 ${skipped.length} 段介面文字要人工翻譯）` : ''}`);
    const queue = todo.slice();
    const one = async (text) => { // 翻一段；失敗重試，太多次連續失敗（被限速）就整個停下
      for (let tryN = 0; tryN < 4 && !stopped; tryN++) {
        try { const o = tidy(await google(text, GOOGLE_LANG[l]), l); failStreak = 0; return o; }
        catch (e) {
          failStreak++;
          if (failStreak >= 12) { stopped = `連續失敗 ${failStreak} 次（${e.message}），可能被限速`; break; }
          await sleep(e.status === 429 || e.status >= 500 ? 15000 * (tryN + 1) : 2000); // 被限速時 Google 也會回 500
        }
      }
      return '';
    };
    const worker = async () => {
      while (queue.length && !stopped) {
        const k = queue.shift();
        let out = await one(k);
        if (!out) continue;
        let why = verify(k, out, l);
        // 整段檢查沒過（例如漏掉括號裡的價格）：改成一句一句翻再接起來
        const parts = why ? k.split(/(?<=[。；！？])/).filter((x) => x.trim()) : [];
        if (parts.length > 1) {
          const outs = [];
          for (const part of parts) { const o = HAS_CJK.test(part) ? await one(part) : part; if (!o) break; outs.push(o); await sleep(120); }
          if (outs.length === parts.length) { const joined = tidy(outs.join(l === 'ja' ? '' : ' '), l); if (!verify(k, joined, l)) { out = joined; why = ''; } }
        }
        if (why) { bad++; console.log(`  ✗ ${why}：${k.slice(0, 40)} → ${out.slice(0, 60)}`); continue; }
        tm[k] = out; done++; total++;
        if (done % 100 === 0) { saveTM(l, tm); console.log(`  …${l} 已翻 ${done} 段`); }
        await sleep(120);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    saveTM(l, tm);
    console.log(`${l}：新增 ${done} 段，檢查沒過 ${bad} 段（先顯示中文，明天再試）`);
    if (stopped) break;
  }
  if (stopped) console.log(`停止：${stopped}；已翻好的先存起來，下次接著翻`);
  console.log(`本次共新增 ${total} 段翻譯`);
}

module.exports = { verify, tidy };
if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'missing') cmdMissing(args[0]);
  else if (cmd === 'apply') cmdApply(args[0]);
  else if (cmd === 'prune') cmdPrune();
  else if (cmd === 'auto') cmdAuto(args).catch((e) => { console.error(e); process.exit(1); });
  else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 9).join('\n')); process.exit(cmd ? 1 : 0); }
}
