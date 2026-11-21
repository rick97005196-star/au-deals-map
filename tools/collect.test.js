// collect.js 的自我檢查（不連網）：node tools/collect.test.js
const assert = require('assert');
const { mergeLeads, classify, updateLink, pageLines, diffPage } = require('./collect.js');

// 線索：同一個網址只留一筆、保留第一次看到的日期；太舊的、網站已經有的丟掉
const old = [
  { url: 'https://a', title: 'Free Ice Cream Day Brisbane', first_seen: '2026-11-20' },
  { url: 'https://old', title: 'Something Old Here', first_seen: '2026-11-01' },
];
const fresh = [
  { url: 'https://a', title: 'Free Ice Cream Day Brisbane' },
  { url: 'https://b', title: 'Night Noodle Markets Sydney' },
  { url: 'https://c', title: 'Already On The Site Festival' },
];
const m = mergeLeads(old, fresh, ['alreadyonthesitefestival'], '2026-11-21');
assert.deepStrictEqual(m.map((l) => l.url).sort(), ['https://a', 'https://b']);
assert.strictEqual(m.find((l) => l.url === 'https://a').first_seen, '2026-11-20');
assert.strictEqual(m.find((l) => l.url === 'https://b').first_seen, '2026-11-21');

// 網址狀態：只有 404／410 算不見；被擋不算
assert.strictEqual(classify({ status: 200 }), 'ok');
assert.strictEqual(classify({ status: 404 }), 'gone');
assert.strictEqual(classify({ status: 403 }), 'blocked');
assert.strictEqual(classify({ status: 0 }), 'blocked');
const g1 = updateLink(undefined, { status: 404 }, '2026-11-20');
const g2 = updateLink(g1, { status: 410 }, '2026-11-21');
assert.deepStrictEqual([g1.fails, g2.fails, g2.since], [1, 2, '2026-11-20']);
assert.strictEqual(updateLink(g2, { status: 200 }, '2026-11-22').fails, 0);   // 恢復就歸零
assert.strictEqual(updateLink(g2, { status: 403 }, '2026-11-22').fails, 0);   // 被擋不算連續

// 官方頁面比對：第一次只記錄；之後列出新出現的行；整頁換掉不算
const page = (rows) => '<html><script>var x=1</script><body>' + rows.map((r) => `<p>${r}</p>`).join('') + '</body></html>';
const base = ['Twilight Markets every Friday night', 'Free outdoor cinema in the park', 'Lunar New Year festival returns', 'Christmas lights trail opens soon'];
const L1 = pageLines(page(base));
assert.ok(!L1.some((l) => l.includes('var x')));
const d1 = diffPage(undefined, L1);
assert.strictEqual(d1.added.length, 0);
const d2 = diffPage(d1.keys, pageLines(page([...base, 'New Year Eve fireworks free event 2026'])));
assert.deepStrictEqual(d2.added, ['New Year Eve fireworks free event 2026']);
const d3 = diffPage(d1.keys, pageLines(page(['Access denied please verify you are human', 'Cloudflare Ray ID blocked request here', 'Enable cookies to continue browsing'])));
assert.ok(d3.redesigned && d3.added.length === 0);

console.log('collect 自我檢查全部通過');
