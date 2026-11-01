// Forma API + MCP server (Cloudflare Worker + D1)
//
//   GET  /api/state            -> whole state document (Authorization: Bearer FORMA_KEY)
//   PUT  /api/state            -> { key: value, ... } upsert changed keys; value null deletes
//   POST /mcp/<FORMA_KEY>      -> MCP (Streamable HTTP, JSON responses) for Claude / ChatGPT
//
// Modules: http.js (CORS, auth), storage.js (D1), diary.js (dates, summaries), tools.js (MCP tools), mcp.js (JSON-RPC).
import { cors, json, safeEqual } from './http.js';
import { getState, putState } from './storage.js';
import { handleMcp } from './mcp.js';

async function handleState(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!safeEqual(auth.replace(/^Bearer\s+/i, ''), env.FORMA_KEY)) return json({ error: 'Unauthorized' }, 401);
  if (request.method === 'GET') return json(await getState(env));
  if (request.method === 'PUT') {
    let patch;
    try { patch = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json({ error: 'Expected an object' }, 400);
    try { return json({ ok: true, updated: await putState(env, patch) }); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  return json({ error: 'Method not allowed' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.FORMA_KEY) return json({ error: 'FORMA_KEY secret is not set' }, 500);

    if (url.pathname.startsWith('/mcp')) {
      const key = url.pathname.split('/')[2] || '';
      if (!safeEqual(key, env.FORMA_KEY)) return json({ error: 'Not found' }, 404);
      return handleMcp(request, env);
    }
    if (url.pathname === '/api/state') return handleState(request, env);
    if (url.pathname === '/') return json({ name: 'Forma API', ok: true });
    return json({ error: 'Not found' }, 404);
  },
};
