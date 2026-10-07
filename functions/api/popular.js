// GET /api/popular — 近 7 天最多人點開的項目（公開，只回傳項目 id），首頁用來標示「熱門」
const bneDay = (ms = Date.now()) => new Date(ms + 10 * 3600e3).toISOString().slice(0, 10);
export async function onRequestGet({ env }) {
  let ids = [];
  if (env.DB) {
    try {
      const r = await env.DB.prepare("SELECT key, SUM(n) AS n FROM counts WHERE kind = 'open' AND day >= ?1 GROUP BY key ORDER BY n DESC LIMIT 10")
        .bind(bneDay(Date.now() - 6 * 86400e3)).all();
      ids = (r.results || []).filter((x) => x.n >= 3).map((x) => x.key);
    } catch {}
  }
  return new Response(JSON.stringify({ ids }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
