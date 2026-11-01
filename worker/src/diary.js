// Diary helpers shared by the MCP tools: dates, validation, targets and day summaries.
import { getKey, getKeys, putKey } from './storage.js';

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drinks'];
export const DIET = ['Protein day', 'Starch day', 'Carbohydrate day', 'Fruit & vegetable day'];
export const DIET_START = '2026-11-01';
export const START_KG = 100;
export const GOAL_KG = 80;

const r1 = (x) => Math.round(x * 10) / 10;

export function todayIn(env) {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.TIMEZONE || 'Europe/Skopje' });
}
export function addDays(date, n) {
  const t = new Date(date + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function resolveDate(env, d) {
  if (d === undefined || d === null || d === '' || d === 'today') return todayIn(env);
  if (d === 'yesterday') return addDays(todayIn(env), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d + 'T12:00:00Z'))) throw new Error('date must be YYYY-MM-DD, "today" or "yesterday"');
  return d;
}
export function dietDay(date) {
  const n = Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(DIET_START + 'T12:00:00Z')) / 86400000);
  return DIET[((n % 4) + 4) % 4];
}

export const num = (v, name, { min = 0, max = 100000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number between ${min} and ${max}`);
  return r1(n);
};
export const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function targetsFrom(rows) {
  const t = rows.targets || {};
  return { calories: rows.calorieTarget ?? 1900, protein: t.protein ?? 140, water: t.water ?? 2.5, steps: t.steps ?? 4000 };
}
export async function targets(env) {
  return targetsFrom(await getKeys(env, ['targets', 'calorieTarget']));
}

export async function daySummary(env, date) {
  const rows = await getKeys(env, ['foods:' + date, 'water', 'steps', 'completedDays', 'targets', 'calorieTarget']);
  const foods = rows['foods:' + date] || [];
  const t = targetsFrom(rows);
  const sum = foods.reduce((a, f) => ({
    calories: a.calories + Number(f.cal || 0), protein: a.protein + Number(f.p || 0),
    carbs: a.carbs + Number(f.c || 0), fat: a.fat + Number(f.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    date, diet_day: dietDay(date), day_marked_complete: !!(rows.completedDays || {})[date],
    totals: { calories: Math.round(sum.calories), protein_g: r1(sum.protein), carbs_g: r1(sum.carbs), fat_g: r1(sum.fat) },
    targets: t,
    remaining: { calories: Math.round(t.calories - sum.calories), protein_g: r1(t.protein - sum.protein) },
    water_l: (rows.water || {})[date] || 0,
    steps: (rows.steps || {})[date] || 0,
    entries: foods.map((f) => ({
      id: f.id || null, name: f.name, portion: f.qty || null, meal: f.meal || null,
      calories: f.cal, protein_g: f.p ?? 0, carbs_g: f.c ?? 0, fat_g: f.fat ?? 0,
    })),
  };
}

// ---------- work ----------
export const WORK_DEFAULTS = { job: 'Main job', hoursPerDay: 8, earliestStart: '07:00', latestStart: '09:00', weeklyTarget: 40 };
export async function workSettings(env) {
  return { ...WORK_DEFAULTS, ...(await getKey(env, 'workSettings', {})) };
}

// Accepts "07:30", "7:30", "7", "7:30am", "3:30 pm". Returns minutes after midnight.
export function parseTime(v, name) {
  const m = /^(\d{1,2})(?::|\.|h)?(\d{2})?\s*(am|pm)?$/i.exec(String(v ?? '').trim());
  let h = m ? Number(m[1]) : NaN;
  const min = m && m[2] ? Number(m[2]) : 0;
  if (m && m[3]) { const pm = m[3].toLowerCase() === 'pm'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (!m || h > 23 || min > 59) throw new Error(`${name} must be a time like "07:30" (24 hour)`);
  return h * 60 + min;
}
export const fmtTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export function weekStart(date) {
  const day = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
  return addDays(date, -day);
}

// Hours for the Monday to Sunday week containing `date`.
export async function workWeek(env, date) {
  const settings = await workSettings(env);
  const start = weekStart(date), end = addDays(start, 6);
  const entries = (await getKey(env, 'workEntries', [])).filter((w) => w.date >= start && w.date <= end);
  const main = entries.filter((w) => w.job === settings.job).reduce((a, w) => a + Number(w.hours || 0), 0);
  const total = entries.reduce((a, w) => a + Number(w.hours || 0), 0);
  return {
    week: `${start} to ${end}`, main_job: settings.job,
    main_job_hours: r2(main), target_hours: settings.weeklyTarget, remaining_hours: r2(Math.max(0, settings.weeklyTarget - main)),
    overtime_hours: r2(Math.max(0, main - settings.weeklyTarget)), all_jobs_hours: r2(total),
    days: entries.sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({ id: w.id, date: w.date, job: w.job, start: w.start || null, end: w.end || null, hours: w.hours, note: w.description || null })),
  };
}
const r2 = (x) => Math.round(x * 100) / 100;

// Older entries (created in the browser) may have no id; give them one so the AI can edit them.
export async function loadFoods(env, date) {
  const foods = await getKey(env, 'foods:' + date, []);
  let changed = false;
  for (const f of foods) if (!f.id) { f.id = newId(); changed = true; }
  if (changed) await putKey(env, 'foods:' + date, foods);
  return foods;
}
