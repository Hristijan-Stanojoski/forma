// App state: one object saved to localStorage under STORAGE_KEY and synced to the cloud by sync.js.
// New fields must get a default in applyDefaults so older browser data keeps working.

const STORAGE_KEY = 'forma-v01';

// Dates are YYYY-MM-DD in Europe/Skopje, the same as the Worker.
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function formatDate(date, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}

function newFoodId() {
  return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function applyDefaults(st) {
  st.foods ??= {};
  st.weights ??= [];
  st.habits ??= {};
  st.water ??= {};
  st.steps ??= {};
  st.calorieTarget ??= 1900;
  st.completedDays ??= {};
  st.measurements ??= [];
  st.homeTasks ??= [];
  st.workEntries ??= [];
  st.financeEntries ??= [];
  st.groceryItems ??= [];
  st.favorites ??= DEFAULT_FAVORITES.map((f) => ({ ...f }));
  st.targets ??= {};
  st.targets.protein ??= 140;
  st.targets.water ??= 2.5;
  st.targets.steps ??= 4000;
  for (const list of Object.values(st.foods)) if (Array.isArray(list)) for (const f of list) f.id ??= newFoodId();
  return st;
}

let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { state = {}; }
applyDefaults(state);

function saveLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
// Call after every change to state, then render().
function persist() {
  saveLocal();
  scheduleSync();
}

// ---------- shared helpers ----------
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sumFoods(list) {
  return (list || []).reduce((a, f) => ({
    cal: a.cal + Number(f.cal || 0), p: a.p + Number(f.p || 0),
    c: a.c + Number(f.c || 0), fat: a.fat + Number(f.fat || 0),
  }), { cal: 0, p: 0, c: 0, fat: 0 });
}
const foodToday = () => state.foods[today()] || [];
const totals = () => sumFoods(foodToday());
function currentWeight() {
  return state.weights.length ? state.weights[state.weights.length - 1].value : PROFILE.startWeight;
}
// Index into DIET for a YYYY-MM-DD date (day 1 = DIET_START).
function cycle(date = today()) {
  const n = Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(DIET_START + 'T12:00:00Z')) / 86400000);
  return ((n % 4) + 4) % 4;
}
// Sedentary maintenance estimate (Mifflin St Jeor × 1.2).
function maintenanceFor(weight) {
  return (10 * weight + 6.25 * PROFILE.heightCm - 5 * PROFILE.age + 5) * 1.2;
}
function setBar(id, pct) {
  document.getElementById(id).style.width = Math.min(100, Math.max(0, pct)) + '%';
}
function setText(id, value) {
  document.getElementById(id).textContent = value;
}
