// 讀 tools/feeds.json 的 RSS（OzBargain、Reddit、Google 新聞），整理成研究員用的線索（零相依，Node 18 以上）。
// 用法：node tools/feeds.js [輸出檔，預設 /tmp/leads-rss.json] [天數，預設 3]
//
// 線索只是線索：每一筆仍要照 tools/VERIFY.md 到官方頁面確認，RSS 的網址不能當官方來源。
// 讀不到的來源（被擋、逾時）會列在最後，不會讓整個流程停下來。
const fs = require('fs');
const path = require('path');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8'));
const ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'items.json'), 'utf8')).items;
const OUT = process.argv[2] || '/tmp/leads-rss.json';
const DAYS = Number(process.argv[3]) || 3;
const SINCE = Date.now() - DAYS * 86400e3;
const UA = 'Mozilla/5.0 (compatible; au-deals-map feed reader; +https://au-deals-map.pages.dev)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 線索裡出現就跳過（網站不收的內容）
const SKIP = /\b(alcohol|beer|wine|whisky|vodka|gin|bet|betting|casino|pokies|sportsbet|ladbrokes|tab\.com|onlyfans|giveaway|competition|win a)\b|\[expired\]|\bexpired\b/i;

// Reddit 和新聞的內容很雜，只留看起來跟活動或優惠有關的
const RELEVANT = /\b(free|freebies?|festival|fest|events?|markets?|fair|expo|concert|gig|exhibition|parade|fireworks|deals?|sale|discount|cheap|bargain|half[- ]price|specials?|promo|offers?|voucher|coupon|fares?|tickets?|weekend|things to do|what'?s on|pop[- ]?up)\b|\d+\s?% off|\$\d/i;
const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const strip = (s) => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const norm = (s) => String(s || '').toLowerCase().replace(/20\d\d/g, '').replace(/[^a-z0-9]+/g, '');
const known = ITEMS.map((i) => norm(i.title)).filter((t) => t.length >= 8);

function parse(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const b = m[0];
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link'));
    if (!link) { const h = b.match(/<link\b[^>]*href="([^"]+)"/i); link = h ? decode(h[1]) : ''; }
    const date = Date.parse(strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    const snippet = strip(tag(b, 'description') || tag(b, 'content') || tag(b, 'summary')).slice(0, 220);
    if (title && link) out.push({ title, link, date: isNaN(date) ? null : date, snippet });
  }
  return out;
}

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

(async () => {
  const sources = [
    ...CFG.feeds.map((f) => ({ ...f, kind: f.url.includes('reddit.com') ? 'reddit' : 'rss' })),
    ...CFG.news.map((n, i) => ({ id: 'news-' + (i + 1), kind: 'news', topic: '新聞：' + n.q, region: n.region, for: n.for,
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent(n.q + ' when:7d') + '&hl=en-AU&gl=AU&ceid=AU:en' })),
  ];
  const leads = [], failed = [], seen = new Set();
  for (const s of sources) {
    try {
      let xml;
      try { xml = await get(s.url); }
      catch (e) { if (s.kind !== 'reddit' || !/429/.test(e.message)) throw e; await sleep(30000); xml = await get(s.url); } // Reddit 限速：等一下再試一次
      let n = 0;
      for (const it of parse(xml)) {
        if (it.date && it.date < SINCE) continue;
        if (SKIP.test(it.title)) continue;
        if (s.kind !== 'rss' && !RELEVANT.test(it.title + ' ' + (s.kind === 'reddit' ? '' : it.snippet))) continue;
        const k = norm(it.title);
        if (seen.has(k)) continue;
        if (known.some((t) => k.includes(t) || t.includes(k))) continue; // 網站上已經有
        seen.add(k); n++;
        leads.push({ for: s.for, feed: s.id, region: s.region, topic: s.topic, title: it.title, url: it.link,
          date: it.date ? new Date(it.date + 10 * 3600e3).toISOString().slice(0, 10) : null, snippet: it.snippet });
      }
      console.log(`  ${s.id.padEnd(14)} ${String(n).padStart(3)} 筆`);
    } catch (e) {
      failed.push(`${s.id}（${e.name === 'AbortError' ? '逾時' : e.message}）`);
      console.log(`  ${s.id.padEnd(14)} 讀不到：${e.message}`);
    }
    await sleep(s.kind === 'reddit' ? 12000 : 1200); // 放慢速度，避免被限速
  }
  fs.writeFileSync(OUT, JSON.stringify(leads, null, 1));
  const by = leads.reduce((m, l) => ((m[l.for] = (m[l.for] || 0) + 1), m), {});
  console.log(`\n最近 ${DAYS} 天共 ${leads.length} 條線索 → ${OUT}`);
  console.log('依研究員：' + Object.entries(by).map(([k, v]) => `${k} ${v}`).join('、'));
  if (failed.length) console.log('讀不到：' + failed.join('、'));
})();
