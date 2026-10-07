// POST /api/track — 記錄匿名的瀏覽與點擊次數（D1 綁定名稱：DB）
const KINDS = new Set(['view', 'open', 'src', 'social', 'region', 'search', 'cat']);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|quora link/i;
const bneDay = (ms = Date.now()) => new Date(ms + 10 * 3600e3).toISOString().slice(0, 10); // 布里斯本 UTC+10，沒有夏令時間
const empty = (status = 204) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return empty();
  if (BOT.test(request.headers.get('user-agent') || '')) return empty();
  let b;
  try {
    const txt = await request.text();
    if (txt.length > 2000) return empty(413);
    b = JSON.parse(txt);
  } catch {
    return empty(400);
  }
  const t = String(b.t || '');
  if (!KINDS.has(t)) return empty(400);
  const k = String(b.k || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, t === 'search' ? 40 : 90);
  if (t !== 'view' && !k) return empty();

  const day = bneDay();
  const stmts = [];
  const inc = (kind, key) =>
    stmts.push(env.DB.prepare('INSERT INTO counts (day, kind, key, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (day, kind, key) DO UPDATE SET n = n + 1').bind(day, kind, key));

  if (t === 'view') {
    inc('view', 'all');
    const cf = request.cf || {};
    inc('geo', cf.country === 'AU' && cf.regionCode ? 'AU-' + cf.regionCode : cf.country || '??');
    const w = Number(b.w) || 0;
    inc('device', w && w < 768 ? 'mobile' : w && w < 1024 ? 'tablet' : 'desktop');
    try {
      const ref = new URL(String(b.r || ''));
      if (ref.hostname && ref.hostname !== new URL(request.url).hostname) inc('ref', ref.hostname.replace(/^www\./, '').slice(0, 60));
    } catch {}
    const vid = String(b.v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    if (vid) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO visitors (day, vid) VALUES (?1, ?2)').bind(day, vid));
  } else {
    inc(t, k);
  }
  // 偶爾清掉 120 天前的匿名訪客編號（每日人數已經算進統計，不需要留編號）
  if (Math.random() < 0.01) stmts.push(env.DB.prepare('DELETE FROM visitors WHERE day < ?1').bind(bneDay(Date.now() - 120 * 86400e3)));

  waitUntil(env.DB.batch(stmts).catch((e) => console.log('track failed', e.message)));
  return empty();
}

export const onRequest = () => empty(405);
