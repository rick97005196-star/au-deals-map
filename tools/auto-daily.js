// 每日固定步驟（不需要 Claude）：下架過期 → 熱門上限 → 格式檢查 → 保護機制。零相依，Node 18 以上。
// 用法：node tools/auto-daily.js <網站資料夾> [--today YYYY-MM-DD] [--base <上次上線的 items.json>]
// 結束代碼：0 可以上線（changed=true/false 印在最後一行）、1 格式錯誤、2 保護機制擋下。
// 這支程式不碰 git、不連網；commit／push 由 .github/workflows/daily-tidy.yml 依結束代碼決定。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOT_MAX = 20;
const MIN_ITEMS = 30;
const MAX_DROP = 0.4;
const bne = () => new Date(Date.now() + 10 * 3600e3).toISOString().slice(0, 10);

// 和 tools/daily.js prune 相同規則：end 早於今天（布里斯本）就移除
function prune(items, today) {
  const keep = [], gone = [];
  for (const it of items) (it.end && it.end < today ? gone : keep).push(it);
  return { keep, gone };
}

// DAILY.md 規則：熱門超過 20 筆時，從今天新增的項目拿掉熱門標記；仍超過就只警告，交給下次 Claude 判斷
function capHot(items, today) {
  const removed = [];
  const count = () => items.filter((i) => i.hot).length;
  for (const it of [...items].reverse()) {
    if (count() <= HOT_MAX) break;
    if (it.hot && it.added === today) { delete it.hot; removed.push(it.id); }
  }
  return { removed, over: Math.max(0, count() - HOT_MAX) };
}

// DAILY.md 保護機制：比上次少超過 40%，或少於 30 筆，就不上線
function guard(before, after) {
  if (after < MIN_ITEMS) return `只剩 ${after} 筆（少於 ${MIN_ITEMS}）`;
  if (before > 0 && (before - after) / before > MAX_DROP) return `從 ${before} 筆掉到 ${after} 筆（少超過 ${MAX_DROP * 100}%）`;
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  if (!dir) { console.error('要給網站資料夾'); process.exit(1); }
  const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
  const today = opt('--today') || bne();
  const file = path.join(dir, 'data', 'items.json');
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'; // 保留原本的換行格式
  const d = JSON.parse(raw);
  const base = opt('--base') ? JSON.parse(fs.readFileSync(opt('--base'), 'utf8')).items.length : d.items.length;

  const { keep, gone } = prune(d.items, today);
  d.items = keep;
  const hot = capHot(d.items, today);
  console.log(`今天 ${today}：下架 ${gone.length} 筆，剩 ${keep.length} 筆`);
  gone.forEach((it) => console.log(`  - ${it.id}（${it.end} 結束）`));
  if (hot.removed.length) console.log(`熱門超過 ${HOT_MAX}，拿掉今天新增的：${hot.removed.join('、')}`);
  if (hot.over) console.log(`熱門仍多 ${hot.over} 筆，留給下次 Claude 判斷`);

  const why = guard(base, d.items.length);
  if (why) { console.error(`保護機制：${why}，不上線`); process.exit(2); }

  const changed = gone.length > 0 || hot.removed.length > 0;
  if (changed) fs.writeFileSync(file, JSON.stringify(d, null, 1).replace(/\n/g, eol) + eol);
  try { execFileSync(process.execPath, ['build.js'], { cwd: dir, stdio: 'inherit' }); }
  catch { console.error('build.js 格式檢查沒過，不上線'); process.exit(1); }
  // 不改 updated：updated 代表「Claude 查證的日期」，程式只整理、沒有查證
  console.log(`changed=${changed}`);
}

module.exports = { prune, capHot, guard };
if (require.main === module) main();
