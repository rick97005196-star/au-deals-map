// auto-daily.js 的自我檢查：node tools/auto-daily.test.js
const assert = require('assert');
const { prune, capHot, guard } = require('./auto-daily.js');

const T = '2026-10-28';
const items = [
  { id: 'a', end: '2026-10-27' },       // 昨天結束 → 下架
  { id: 'b', end: '2026-10-28' },       // 今天結束 → 保留
  { id: 'c', end: null },               // 沒有結束日 → 保留
];
const p = prune(items, T);
assert.deepStrictEqual(p.gone.map((i) => i.id), ['a']);
assert.deepStrictEqual(p.keep.map((i) => i.id), ['b', 'c']);

const hot = Array.from({ length: 22 }, (_, i) => ({ id: 'h' + i, hot: true, added: i >= 19 ? T : '2026-10-01' }));
const h = capHot(hot, T);
assert.deepStrictEqual(h.removed, ['h21', 'h20']);   // 只拿掉今天新增的
assert.strictEqual(hot.filter((i) => i.hot).length, 20);
const old = Array.from({ length: 22 }, (_, i) => ({ id: 'o' + i, hot: true, added: '2026-10-01' }));
assert.strictEqual(capHot(old, T).over, 2);            // 沒有今天新增的 → 不動，只回報

assert.strictEqual(guard(186, 158), null);             // 少 15%：可以上線
assert.match(guard(186, 100), /少超過/);               // 少 46%：擋
assert.match(guard(40, 29), /少於/);                   // 少於 30：擋
console.log('自我檢查全部通過');
