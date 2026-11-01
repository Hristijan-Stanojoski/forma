// D1 storage: table kv(key, value, updated_at).
// One row per top level state field, plus "foods:YYYY-MM-DD" per day of food.

export const KEY_PATTERN = /^[A-Za-z]+(:\d{4}-\d{2}-\d{2})?$/;

const UPSERT = 'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at';

export async function getKey(env, key, fallback) {
  const row = await env.DB.prepare('SELECT value FROM kv WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : fallback;
}

// Read several keys in one query. Returns { key: value } for the keys that exist.
export async function getKeys(env, keys) {
  if (!keys.length) return {};
  const { results } = await env.DB.prepare(`SELECT key, value FROM kv WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
  return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
}

export async function putKey(env, key, value) {
  await env.DB.prepare(UPSERT).bind(key, JSON.stringify(value), Date.now()).run();
}

// Whole state document for the dashboard.
export async function getState(env) {
  const { results } = await env.DB.prepare('SELECT key, value, updated_at FROM kv').all();
  const state = { foods: {} };
  let updated = 0;
  for (const r of results) {
    updated = Math.max(updated, r.updated_at);
    const v = JSON.parse(r.value);
    if (r.key.startsWith('foods:')) state.foods[r.key.slice(6)] = v;
    else state[r.key] = v;
  }
  return { state, updated };
}

// Upsert changed keys from the dashboard; a null value deletes the row.
export async function putState(env, patch) {
  const now = Date.now();
  const stmts = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid key: ' + key);
    stmts.push(value === null
      ? env.DB.prepare('DELETE FROM kv WHERE key = ?').bind(key)
      : env.DB.prepare(UPSERT).bind(key, JSON.stringify(value), now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return now;
}
