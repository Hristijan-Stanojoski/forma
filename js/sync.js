// Cloud sync with the Forma Worker.
// syncNow pulls /api/state, three way merges each changed key against the last synced
// snapshot (BASE_KEY), PUTs only the keys that changed, then adopts the merged result.

const CLOUD_KEY = 'forma-cloud', BASE_KEY = 'forma-sync-base';
const SYNC_INTERVAL = 20000;

function cloud() {
  try { const c = JSON.parse(localStorage.getItem(CLOUD_KEY)); return c && c.url && c.key ? c : null; } catch (e) { return null; }
}
let syncBase;
try { syncBase = JSON.parse(localStorage.getItem(BASE_KEY)) || null; } catch (e) { syncBase = null; }
let syncTimer = null, syncing = false, syncAgain = false, lastSyncAt = null, syncError = null;

// Server rows: one per top level key, plus foods:YYYY-MM-DD per day. Values are JSON strings.
function flattenState(st) {
  const out = {};
  for (const [k, v] of Object.entries(st)) {
    if (v === undefined) continue;
    if (k === 'foods') { for (const [d, arr] of Object.entries(v || {})) out['foods:' + d] = JSON.stringify(arr); }
    else out[k] = JSON.stringify(v);
  }
  return out;
}
function unflattenState(flat) {
  const st = { foods: {} };
  for (const [k, v] of Object.entries(flat)) {
    const val = JSON.parse(v);
    if (k.startsWith('foods:')) st.foods[k.slice(6)] = val; else st[k] = val;
  }
  return st;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function identity(x) {
  return x && typeof x === 'object' ? (x.id ?? x.date ?? JSON.stringify(x)) : JSON.stringify(x);
}

// Three way merge: keep the other side's changes, apply ours on top.
function merge3(base, mine, theirs) {
  if (theirs === undefined) return mine;
  if (mine === undefined) return undefined;
  if (same(base, theirs)) return mine;
  if (same(base, mine)) return theirs;
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const b = new Map((Array.isArray(base) ? base : []).map((x) => [identity(x), x]));
    const m = new Map(mine.map((x) => [identity(x), x]));
    const out = [], seen = new Set();
    for (const x of theirs) {
      const id = identity(x); seen.add(id);
      if (b.has(id) && !m.has(id)) continue; // we deleted it
      out.push(m.has(id) && !same(m.get(id), b.get(id)) ? m.get(id) : x);
    }
    for (const x of mine) { const id = identity(x); if (!seen.has(id) && !b.has(id)) out.push(x); }
    if (out.length && out.every((x) => x && typeof x.date === 'string' && !x.id)) out.sort((p, q) => p.date.localeCompare(q.date));
    return out;
  }
  if (mine && theirs && typeof mine === 'object' && typeof theirs === 'object' && !Array.isArray(mine) && !Array.isArray(theirs)) {
    const b = base && typeof base === 'object' ? base : {}, out = { ...theirs };
    for (const k of new Set([...Object.keys(mine), ...Object.keys(b)])) {
      const r = merge3(b[k], mine[k], theirs[k]);
      if (r === undefined) delete out[k]; else out[k] = r;
    }
    return out;
  }
  return mine;
}

async function api(method, body) {
  const c = cloud();
  const res = await fetch(c.url.replace(/\/+$/, '') + '/api/state', {
    method,
    headers: { Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('Wrong secret key');
  if (!res.ok) throw new Error('Server error ' + res.status);
  return res.json();
}

function scheduleSync(delay = 500) {
  if (!cloud()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

async function syncNow() {
  if (!cloud() || !syncBase) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  clearTimeout(syncTimer);
  try {
    const remote = flattenState((await api('GET')).state);
    const local = flattenState(state);
    const patch = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(syncBase)])) {
      if (local[k] === syncBase[k]) continue;
      const parse = (v) => (v === undefined ? undefined : JSON.parse(v));
      const merged = merge3(parse(syncBase[k]), parse(local[k]), parse(remote[k]));
      patch[k] = merged === undefined ? null : merged;
    }
    if (Object.keys(patch).length) await api('PUT', patch);
    const next = { ...remote };
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete next[k]; else next[k] = JSON.stringify(v); }
    syncBase = next;
    localStorage.setItem(BASE_KEY, JSON.stringify(syncBase));
    const fresh = applyDefaults(unflattenState(next));
    const changed = !same(fresh, state);
    state = fresh;
    saveLocal();
    lastSyncAt = new Date();
    syncError = null;
    if (changed && typeof render === 'function') render();
  } catch (e) {
    syncError = e.message || 'Offline';
  } finally {
    syncing = false;
    renderSyncStatus();
    if (syncAgain) { syncAgain = false; scheduleSync(50); }
  }
}

function renderSyncStatus() {
  const c = cloud();
  const badge = document.getElementById('syncBadge'), pill = document.getElementById('syncPill'), st = document.getElementById('syncStatus');
  if (!badge) return;
  const time = lastSyncAt ? lastSyncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const text = !c ? 'Saved on this device' : syncError ? '⚠ ' + syncError + ' · saved on this device' : lastSyncAt ? '☁ Synced ' + time : '☁ Connecting…';
  badge.textContent = text;
  if (pill) pill.textContent = !c ? 'Not connected' : syncError ? 'Offline' : 'Connected';
  if (st) st.textContent = c ? text + (syncError ? '. Changes will sync when the connection is back.' : '') : 'Your data stays in this browser until you connect.';
  const box = document.getElementById('cloudConnected');
  if (box) {
    box.style.display = c ? 'block' : 'none';
    if (c) document.getElementById('mcpUrl').value = c.url.replace(/\/+$/, '') + '/mcp/' + c.key;
  }
  const form = document.getElementById('cloudForm');
  if (form) form.style.display = c ? 'none' : 'flex';
}

async function connectCloud(e) {
  e.preventDefault();
  const url = document.getElementById('cloudUrl').value.trim().replace(/\/+$/, '');
  const k = document.getElementById('cloudKey').value.trim();
  if (!/^https?:\/\//.test(url)) { alert('The API URL should start with https://'); return; }
  localStorage.setItem(CLOUD_KEY, JSON.stringify({ url, key: k }));
  try {
    const remote = flattenState((await api('GET')).state);
    syncBase = {};
    if (Object.keys(remote).length && confirm('Your cloud already has data.\n\nOK: use the cloud data on this device (recommended for a second device).\nCancel: merge this browser\'s data into the cloud.')) {
      syncBase = remote;
      state = applyDefaults(unflattenState(remote));
      saveLocal();
    }
    localStorage.setItem(BASE_KEY, JSON.stringify(syncBase));
    document.getElementById('cloudKey').value = '';
    await syncNow();
    render();
  } catch (err) {
    localStorage.removeItem(CLOUD_KEY);
    alert('Could not connect: ' + err.message);
  }
  renderSyncStatus();
}

function disconnectCloud() {
  if (!confirm('Stop syncing on this device? Your data stays here and in the cloud.')) return;
  localStorage.removeItem(CLOUD_KEY);
  localStorage.removeItem(BASE_KEY);
  syncBase = null; syncError = null; lastSyncAt = null;
  renderSyncStatus();
}

function copyMcp() {
  const el = document.getElementById('mcpUrl');
  el.select();
  (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject())
    .then(() => setText('syncStatus', 'Connector URL copied ✓'))
    .catch(() => document.execCommand('copy'));
}

setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, SYNC_INTERVAL);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
window.addEventListener('online', () => syncNow());
