// GET /api/stats?days=30 — 統計頁用，需要在 header 帶 x-stats-key（密碼存在 D1 的 settings 表）
const json = (d, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bneDay = (ms = Date.now()) => new Date(ms + 10 * 3600e3).toISOString().slice(0, 10);

async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: '還沒綁定 D1 資料庫（DB）' }, 500);
  const key = request.headers.get('x-stats-key') || '';
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'stats_key'").first();
  if (!row || !key || !(await same(key, row.v))) return json({ error: 'unauthorized' }, 401);

  const days = Math.min(365, Math.max(1, parseInt(new URL(request.url).searchParams.get('days'), 10) || 30));
  const today = bneDay();
  const from = bneDay(Date.now() - (days - 1) * 86400e3);
  const [views, visitors, top, distinct] = await env.DB.batch([
    env.DB.prepare("SELECT day, n FROM counts WHERE kind = 'view' AND key = 'all' AND day >= ?1").bind(from),
    env.DB.prepare('SELECT day, COUNT(*) AS n FROM visitors WHERE day >= ?1 GROUP BY day').bind(from),
    env.DB.prepare("SELECT kind, key, SUM(n) AS n FROM counts WHERE day >= ?1 AND kind IN ('open','src','geo','device','ref','search','region','social','cat') GROUP BY kind, key ORDER BY n DESC").bind(from),
    env.DB.prepare('SELECT COUNT(DISTINCT vid) AS n FROM visitors WHERE day >= ?1').bind(from),
  ]);
  const vMap = Object.fromEntries(views.results.map((r) => [r.day, r.n]));
  const uMap = Object.fromEntries(visitors.results.map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = bneDay(Date.now() - i * 86400e3);
    series.push({ day: d, views: vMap[d] || 0, visitors: uMap[d] || 0 });
  }
  const topBy = {};
  for (const r of top.results) {
    (topBy[r.kind] ||= []);
    if (topBy[r.kind].length < 12) topBy[r.kind].push({ key: r.key, n: r.n });
  }
  return json({
    from, today, days: series,
    totals: {
      views: series.reduce((s, d) => s + d.views, 0),
      visitors: distinct.results[0]?.n || 0,
      today_views: vMap[today] || 0,
      today_visitors: uMap[today] || 0,
    },
    top: topBy,
  });
}
