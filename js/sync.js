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

async function api(method, body, c = cloud()) {
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

// True when this browser holds data you entered (not just defaults or the Nov 1 sample day).
function hasLocalData(st) {
  const realFood = Object.values(st.foods).some((list) => list.some((f) => !f.seedId));
  return realFood || ['weights', 'measurements', 'workEntries', 'financeEntries', 'homeTasks', 'events', 'groceryItems'].some((k) => (st[k] || []).length);
}

// Link this browser to the cloud. With local data you choose: merge it in, or replace it with the cloud copy.
async function connectWith(url, key) {
  const c = { url: url.replace(/\/+$/, ''), key };
  const remote = flattenState((await api('GET', null, c)).state);
  localStorage.setItem(CLOUD_KEY, JSON.stringify(c));
  const useCloud = Object.keys(remote).length && (!hasLocalData(state) || confirm(
    'Your cloud already has data.\n\nOK: show the cloud data on this device (recommended).\nCancel: merge what is saved in this browser into the cloud.'));
  if (useCloud) {
    syncBase = remote;
    state = applyDefaults(unflattenState(remote));
    saveLocal();
  } else {
    // Merging against a blank state means untouched defaults here never overwrite real values in the cloud.
    syncBase = flattenState(applyDefaults({}));
  }
  localStorage.setItem(BASE_KEY, JSON.stringify(syncBase));
  await syncNow();
  render();
}

async function syncNow() {
  if (!cloud()) return;
  if (!syncBase) { // connected but the last sync snapshot is gone: take the cloud copy and carry on
    try { await connectWith(cloud().url, cloud().key); } catch (e) { syncError = e.message || 'Offline'; renderSyncStatus(); }
    return;
  }
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
  const time = lastSyncAt ? lastSyncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const text = !c ? 'Saved on this device only' : syncError ? '⚠ ' + syncError + ' · saved on this device' : lastSyncAt ? '☁ Synced ' + time : '☁ Connecting…';
  setText('syncBadge', text);
  const chip = document.getElementById('syncChip');
  if (chip) {
    chip.className = 'sync-chip ' + (!c || syncError ? 'warn' : lastSyncAt ? 'ok' : '');
    chip.textContent = !c ? '⚠ Not synced' : syncError ? '⚠ Offline' : lastSyncAt ? '☁ ' + time : '☁ …';
    chip.title = text;
  }
  // Banner on every page while this device is not synced, so a phone never silently shows only its own data.
  const banner = document.getElementById('syncBanner');
  if (banner) {
    const problem = !c ? 'This device is not synced, so you only see what was saved in this browser.'
      : syncError === 'Wrong secret key' ? 'Sync stopped because the secret key is wrong. Reconnect this device in Settings.' : '';
    banner.style.display = problem ? 'flex' : 'none';
    if (problem) setText('syncBannerText', problem);
  }
  setText('syncPill', !c ? 'Not connected' : syncError ? 'Offline' : 'Connected');
  setText('syncStatus', c ? text + (syncError ? '. Changes will sync when the connection is back.' : '') : 'Your data stays in this browser until you connect.');
  const box = document.getElementById('cloudConnected');
  if (box) {
    box.style.display = c ? 'block' : 'none';
    if (c) {
      document.getElementById('mcpUrl').value = c.url + '/mcp/' + c.key;
      document.getElementById('deviceLink').value = deviceLink(c);
    }
  }
  const form = document.getElementById('cloudForm');
  if (form) {
    form.style.display = c ? 'none' : 'flex';
    const urlInput = document.getElementById('cloudUrl');
    if (!urlInput.value) urlInput.value = DEFAULT_API;
  }
}

// Opening this link on another device connects it straight away (the key sits in the #hash, which browsers never send to a server).
function deviceLink(c) {
  const base = location.origin + location.pathname;
  return base + '#link=' + encodeURIComponent(c.key) + (c.url === DEFAULT_API ? '' : '&api=' + encodeURIComponent(c.url));
}

async function connectFromLink() {
  const m = location.hash.match(/^#link=([^&]+)(?:&api=(.+))?$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + '#dashboard'); // keep the key out of the address bar
  try {
    await connectWith(m[2] ? decodeURIComponent(m[2]) : DEFAULT_API, decodeURIComponent(m[1]));
    setText('syncStatus', 'This device is now connected ✓');
  } catch (err) {
    localStorage.removeItem(CLOUD_KEY);
    alert('Could not connect this device: ' + err.message);
  }
  renderSyncStatus();
  return true;
}

async function connectCloud(e) {
  e.preventDefault();
  const url = document.getElementById('cloudUrl').value.trim().replace(/\/+$/, '');
  const k = document.getElementById('cloudKey').value.trim();
  if (!/^https?:\/\//.test(url)) { alert('The API URL should start with https://'); return; }
  try {
    await connectWith(url, k);
    document.getElementById('cloudKey').value = '';
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

function copyField(id, message) {
  const el = document.getElementById(id);
  el.select();
  (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject())
    .then(() => setText('syncStatus', message))
    .catch(() => document.execCommand('copy'));
}
const copyMcp = () => copyField('mcpUrl', 'Connector URL copied ✓');
const copyDeviceLink = () => copyField('deviceLink', 'Device link copied ✓ Open it on your phone or your other computer.');

setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, SYNC_INTERVAL);
// Sync when the page comes back, and push pending changes right away when you switch apps or tabs.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' || syncTimer) syncNow(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) syncNow(); });
window.addEventListener('online', () => syncNow());
