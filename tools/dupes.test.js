// dupes.js 的自我檢查：node tools/dupes.test.js（每日自動整理也會跑）
const assert = require('assert');
const { findDupes, dupeOf } = require('./dupes.js');

const base = { region: 'AU', start: '2026-11-01', end: '2026-11-30', lat: null, lng: null };
const src = (url) => [{ kind: 'official', url }];
const telstraA = { ...base, id: 'a', title: 'Telstra Pre-Paid Black Friday Sale – $44 28-Day Plan now $13', title_zh: 'Telstra 預付卡黑五 28 天方案 A$13', price_zh: '原價 A$44，首期 A$13', sources: src('https://www.telstra.com.au/deals/black-friday') };
const telstraB = { ...base, id: 'b', title: 'Telstra Pre-Paid Black Friday – $44 Pre-Paid Mobile for $13', title_zh: 'Telstra 預付卡黑五 28 天方案 A$13', price_zh: 'A$13（原價 A$44）', sources: src('https://www.telstra.com.au/deals/black-friday/') };
// 同品牌、同網址，但金額不同 → 不同方案
const lebaraA = { ...base, id: 'c', title: 'Lebara 25GB SIM $9 first 28 days', title_zh: 'Lebara 預付卡 25GB 首期 A$9', price_zh: 'A$9', sources: src('https://www.lebara.com.au/mobile-plan/small-sim') };
const lebaraB = { ...base, id: 'd', title: 'Lebara 110GB plan $10 first 28 days', title_zh: 'Lebara 預付卡 110GB 首期 A$10', price_zh: 'A$10', sources: src('https://www.lebara.com.au/mobile-plan/small-sim') };
// 名稱很像，但在不同城市（距離超過 3 公里）
const carolsA = { ...base, id: 'e', region: 'QLD', lat: -27.47, lng: 153.02, title: "Lord Mayor's Christmas Carols", title_zh: '布里斯本市長聖誕頌歌', price_zh: '免費', sources: src('https://www.brisbane.qld.gov.au/carols') };
const carolsB = { ...carolsA, id: 'f', lat: -28.0, lng: 153.43, title_zh: '黃金海岸市長聖誕頌歌' };
// 日期沒有重疊
const later = { ...telstraB, id: 'g', start: '2026-12-05', end: '2026-12-20' };

const found = findDupes([telstraA, telstraB, lebaraA, lebaraB, carolsA, carolsB, later]);
assert.deepStrictEqual(found.map((x) => x.a.id + x.b.id), ['ab']);
assert.strictEqual(dupeOf(telstraB, [lebaraA, telstraA]).it.id, 'a');
assert.strictEqual(dupeOf(lebaraB, [lebaraA, telstraA]), null);
console.log('dupes 自我檢查全部通過');
