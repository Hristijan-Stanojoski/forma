// MCP tools for everything outside the food diary: body measurements, checklist, targets, workouts,
// home tasks, schedule plans, extra work sessions, transactions, account balances and groceries.
// Every record uses the exact shape the dashboard creates (see js/*.js), so both sides edit the same data.
import { getKey, getKeys, putKey } from './storage.js';
import { DIET_START, addDays, resolveDate, todayIn, weekStart } from './diary.js';

const HABITS = ['water', 'creatine', 'walk', 'log'];
const CHORE_CATS = ['Cleaning', 'Laundry', 'Shopping', 'Maintenance', 'Other'];
const FIN_CATS = ['Groceries', 'Dining', 'Housing', 'Transport', 'Utilities', 'Health & Fitness', 'Salary', 'Other'];
const MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drinks'];
// Must match ACCOUNTS in js/data.js: [key, name, currency, starting balance on DIET_START]
const ACCOUNTS = [['upwork', 'Upwork', 'USD', 1466.02], ['bank', 'Bank account', 'EUR', 1182.73]];
// Must match PROJECTS in js/data.js: [key, name]. Confect is the employer (workdays via log_workday).
const PROJECTS = [['confect', 'Confect'], ['feedora', 'Feedora'], ['travelhub', 'travelhub.mk']];
const TASK_STATUSES = ['todo', 'doing', 'done'];
const plainName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Accepts a key or a name ("travelhub", "TravelHub.mk", "Feedora"); null when it is not a project.
function projectKey(v) {
  const n = plainName(v);
  const p = PROJECTS.find(([key, name]) => key === n || plainName(name) === n);
  return p ? p[0] : null;
}
function requireProject(v) {
  const key = projectKey(v);
  if (!key) throw new Error('project must be one of: ' + PROJECTS.map(([, n]) => n).join(', '));
  return key;
}
const projectName = (key) => (PROJECTS.find(([k]) => k === key) || [key, key])[1];
function entryProject(w, mainJob) {
  if (w.project) return w.project;
  return w.job === mainJob ? 'confect' : projectKey(w.job);
}

const r2 = (x) => Math.round(x * 100) / 100;
function amount(v, name, { min = 0, max = 10000000 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number between ${min} and ${max}`);
  return r2(n);
}
const text = (v, max) => String(v).trim().slice(0, max);
// Numeric ids like the dashboard's Date.now() (its inline handlers expect numbers), unique within this instance.
let lastId = 0;
const numId = () => (lastId = Math.max(Date.now(), lastId + 1));
const strId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const mkdRate = (env) => Number(env.MKD_PER_EUR) || 61.5;
function toEur(env, value, currency) {
  const n = amount(value, 'amount');
  return currency === 'MKD' ? { eur: r2(n / mkdRate(env)), original: `${n.toLocaleString('en-US')} MKD` } : { eur: n, original: null };
}
function findById(list, id, what, lister) {
  const item = list.find((x) => String(x.id) === String(id));
  if (!item) throw new Error(`No ${what} with id ${id}. Call ${lister} to see ids.`);
  return item;
}

async function balances(env) {
  const stored = (await getKey(env, 'balances', null)) || {};
  for (const [key, , , start] of ACCOUNTS) stored[key] ??= [{ id: 'start-' + key, date: DIET_START, balance: start, kind: 'start' }];
  return stored;
}
const balanceOrder = (a, b) => a.date.localeCompare(b.date) || (b.kind === 'start') - (a.kind === 'start') || String(a.id).localeCompare(String(b.id));
const latest = (rows) => rows.slice().sort(balanceOrder).slice(-1)[0];
function balanceSummary(all) {
  return Object.fromEntries(ACCOUNTS.map(([key, name, currency]) => {
    const last = latest(all[key]);
    return [key, { name, currency, balance: last.balance, updated: last.date }];
  }));
}
function financeSummary(list, month) {
  const rows = list.filter((x) => x.date.startsWith(month));
  const sum = (type) => r2(rows.filter((x) => x.type === type).reduce((s, x) => s + Number(x.amount || 0), 0));
  const perCat = {};
  for (const x of rows.filter((x) => x.type === 'expense')) perCat[x.category] = r2((perCat[x.category] || 0) + x.amount);
  return { month, currency: 'EUR', income: sum('income'), spent: sum('expense'), net_cash_flow: r2(sum('income') - sum('expense')), spent_per_category: perCat, transactions: rows.slice().reverse() };
}
function grocerySummary(list) {
  return { items: list, to_buy: list.filter((x) => !x.done).length, estimated_total_eur: r2(list.reduce((s, x) => s + Number(x.price || 0), 0)) };
}

const dateProp = { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday". Defaults to today (Europe/Skopje).' };
const idProp = { type: ['number', 'string'] };
const currencyProp = { type: 'string', enum: ['EUR', 'MKD'], default: 'EUR', description: 'MKD (denars) is converted to EUR at the vendor rate' };
const destructive = { destructiveHint: true };
const readOnly = { readOnlyHint: true };
const obj = (properties, required) => (required ? { type: 'object', properties, required } : { type: 'object', properties });

export const LIFE_TOOLS = [
  // ----- body, checklist, targets, training -----
  { name: 'log_measurements', title: 'Log body measurements',
    description: 'Save belly circumference and/or biceps in cm for a date (merges with that day\'s record). Arms are measured one at a time: a typical biceps is 30 to 45 cm, so if a number looks like both arms added together, ask before logging.',
    inputSchema: obj({ date: dateProp, belly_cm: { type: 'number' }, left_biceps_cm: { type: 'number' }, right_biceps_cm: { type: 'number' } }) },
  { name: 'delete_measurements', title: 'Delete a measurement record', description: 'Remove all measurements saved for a date. Confirm first.',
    inputSchema: obj({ date: dateProp }, ['date']), annotations: destructive },
  { name: 'check_habit', title: 'Tick the daily checklist',
    description: 'Tick or untick the dashboard checklist: water (hit the water target), creatine (took creatine), walk (hit the step goal), log (logged all food).',
    inputSchema: obj({ date: dateProp, habit: { type: 'string', enum: HABITS }, done: { type: 'boolean', default: true } }, ['habit']) },
  { name: 'mark_workout_done', title: 'Mark a gym session done', description: 'Mark (or unmark) that day\'s gym workout as done on the schedule.',
    inputSchema: obj({ date: dateProp, done: { type: 'boolean', default: true } }) },
  { name: 'set_targets', title: 'Change daily targets', description: 'Change daily targets. Only send what changes, and only when the user asks.',
    inputSchema: obj({ calories: { type: 'number' }, protein_g: { type: 'number' }, water_l: { type: 'number' }, steps: { type: 'number' } }) },

  // ----- home tasks -----
  { name: 'add_home_task', title: 'Add home tasks', description: 'Add chores to the Home Tasks list (they also show on the schedule on their due date).',
    inputSchema: obj({ tasks: { type: 'array', minItems: 1, items: obj({ title: { type: 'string' }, category: { type: 'string', enum: CHORE_CATS }, due: { type: 'string', description: 'Optional YYYY-MM-DD' } }, ['title']) } }, ['tasks']) },
  { name: 'update_home_task', title: 'Complete or edit a home task', description: 'Tick a home task done (or undo) or edit it. Ids come from list_home_tasks.',
    inputSchema: obj({ id: idProp, done: { type: 'boolean' }, title: { type: 'string' }, category: { type: 'string', enum: CHORE_CATS }, due: { type: 'string' } }, ['id']) },
  { name: 'delete_home_task', title: 'Delete a home task', description: 'Remove a home task. Confirm first.', inputSchema: obj({ id: idProp }, ['id']), annotations: destructive },
  { name: 'list_home_tasks', title: 'List home tasks', description: 'Home tasks with ids, pending first.',
    inputSchema: obj({ include_done: { type: 'boolean', default: false } }), annotations: readOnly },

  // ----- schedule plans -----
  { name: 'add_event', title: 'Add a plan to the schedule', description: 'Add an appointment or plan (not a chore) to the schedule on a date, with an optional time.',
    inputSchema: obj({ date: dateProp, title: { type: 'string' }, time: { type: 'string', description: 'Optional HH:MM' } }, ['title']) },
  { name: 'update_event', title: 'Complete or edit a plan', description: 'Tick a schedule plan done or change it. Ids come from list_events.',
    inputSchema: obj({ id: idProp, done: { type: 'boolean' }, title: { type: 'string' }, date: dateProp, time: { type: 'string' } }, ['id']) },
  { name: 'delete_event', title: 'Delete a plan', description: 'Remove a schedule plan. Confirm first.', inputSchema: obj({ id: idProp }, ['id']), annotations: destructive },
  { name: 'list_events', title: 'List schedule plans', description: 'Plans between two dates (default: today plus the next 7 days).',
    inputSchema: obj({ from: dateProp, to: dateProp }), annotations: readOnly },

  // ----- work projects and extra work -----
  { name: 'log_work', title: 'Log hours on a project or other job',
    description: 'Log hours worked on a personal project (project: feedora or travelhub, optionally task_id from list_work_tasks) or for another job or client (job). Not for Confect workdays: use log_workday for those. Example: 2 hours on Feedora.',
    inputSchema: obj({ date: dateProp, project: { type: 'string', enum: ['feedora', 'travelhub', 'confect'] }, job: { type: 'string', description: 'Only for work outside the projects' },
      hours: { type: 'number' }, task_id: idProp, description: { type: 'string' } }, ['hours']) },
  { name: 'add_work_task', title: 'Add work tasks',
    description: 'Add one or more tasks to a work project: confect (his job), feedora or travelhub (travelhub.mk). Optional due date and status (todo, doing, done).',
    inputSchema: obj({ project: { type: 'string', enum: ['confect', 'feedora', 'travelhub'] },
      tasks: { type: 'array', items: obj({ title: { type: 'string' }, due: dateProp, status: { type: 'string', enum: TASK_STATUSES } }, ['title']) } }, ['project', 'tasks']) },
  { name: 'update_work_task', title: 'Update a work task',
    description: 'Change a work task: status (todo, doing = in progress, done), title, due date or project. Ids come from list_work_tasks.',
    inputSchema: obj({ id: idProp, status: { type: 'string', enum: TASK_STATUSES }, title: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD, or empty to clear' },
      project: { type: 'string', enum: ['confect', 'feedora', 'travelhub'] } }, ['id']) },
  { name: 'delete_work_task', title: 'Delete a work task', description: 'Remove a work task. Confirm first.', inputSchema: obj({ id: idProp }, ['id']), annotations: destructive },
  { name: 'list_work_tasks', title: 'List work tasks',
    description: 'Tasks for one project (or all), open ones first, with hours logged per task and progress.',
    inputSchema: obj({ project: { type: 'string', enum: ['confect', 'feedora', 'travelhub'] }, include_done: { type: 'boolean' } }), annotations: readOnly },
  { name: 'get_project', title: 'Project overview',
    description: 'Hours this week, this month and all time, task progress and recent entries for a work project.',
    inputSchema: obj({ project: { type: 'string', enum: ['confect', 'feedora', 'travelhub'] } }, ['project']), annotations: readOnly },
  { name: 'delete_work', title: 'Delete a work entry', description: 'Remove a work entry (workday or other job) by id. Ids come from get_work_week. Confirm first.',
    inputSchema: obj({ id: idProp }, ['id']), annotations: destructive },

  // ----- money -----
  { name: 'add_transaction', title: 'Log spending or income',
    description: 'Log money spent or received in the monthly spending tracker. Stored in EUR; for denars pass currency MKD and it is converted at the vendor rate (about 61.5 MKD per EUR) with the original amount kept in the note. This does NOT change the Upwork or bank balances.',
    inputSchema: obj({ date: dateProp, type: { type: 'string', enum: ['expense', 'income'] }, amount: { type: 'number' }, currency: currencyProp,
      category: { type: 'string', enum: FIN_CATS }, note: { type: 'string', description: 'What it was, e.g. "Supermarket"' } }, ['type', 'amount', 'category']) },
  { name: 'delete_transaction', title: 'Delete a transaction', description: 'Remove a transaction by id (from list_transactions). Confirm first.',
    inputSchema: obj({ id: idProp }, ['id']), annotations: destructive },
  { name: 'list_transactions', title: 'Spending summary', description: 'A month\'s transactions with ids, income, spending, net cash flow and spending per category, plus current account balances.',
    inputSchema: obj({ month: { type: 'string', description: 'YYYY-MM, default this month' } }), annotations: readOnly },
  { name: 'update_balance', title: 'Update an account balance', description: 'Record the current balance of the Upwork account (USD) or the bank account (EUR), e.g. the weekly Upwork check.',
    inputSchema: obj({ account: { type: 'string', enum: ACCOUNTS.map((x) => x[0]) }, balance: { type: 'number' }, date: dateProp }, ['account', 'balance']) },
  { name: 'withdraw_upwork', title: 'Upwork to bank withdrawal',
    description: 'Record moving money from Upwork to the bank: usd is what left Upwork, eur is what actually arrived in the bank after fees and the exchange rate. Updates both balances.',
    inputSchema: obj({ usd: { type: 'number' }, eur: { type: 'number' }, date: dateProp }, ['usd', 'eur']) },
  { name: 'delete_balance_entry', title: 'Undo a balance update or withdrawal', description: 'Remove a balance update or withdrawal by id (from get_balances). A withdrawal is removed from both accounts. Confirm first.',
    inputSchema: obj({ id: idProp }, ['id']), annotations: destructive },
  { name: 'get_balances', title: 'Account balances', description: 'Current Upwork (USD) and bank (EUR) balances with recent history and ids.',
    inputSchema: obj({}), annotations: readOnly },

  // ----- groceries -----
  { name: 'add_grocery', title: 'Add to the grocery list', description: 'Add items to the grocery list with optional quantity and estimated price.',
    inputSchema: obj({ items: { type: 'array', minItems: 1, items: obj({ name: { type: 'string' }, qty: { type: 'string' }, price: { type: 'number' }, currency: currencyProp }, ['name']) } }, ['items']) },
  { name: 'update_grocery', title: 'Tick or edit a grocery item', description: 'Mark a grocery item bought (or not) or change it. Ids come from list_groceries.',
    inputSchema: obj({ id: idProp, done: { type: 'boolean' }, name: { type: 'string' }, qty: { type: 'string' }, price: { type: 'number' }, currency: currencyProp }, ['id']) },
  { name: 'delete_grocery', title: 'Remove grocery items', description: 'Remove one item by id, or pass clear_bought: true to clear everything already bought.',
    inputSchema: obj({ id: idProp, clear_bought: { type: 'boolean' } }), annotations: destructive },
  { name: 'list_groceries', title: 'Show the grocery list', description: 'Grocery list with ids, bought status and estimated total.',
    inputSchema: obj({}), annotations: readOnly },

  // ----- nutrition favorites -----
  { name: 'add_favorite', title: 'Save a food as a favorite', description: 'Save a food to the Nutrition quick add favorites (with its usual portion and macros).',
    inputSchema: obj({ name: { type: 'string' }, portion: { type: 'string' }, meal: { type: 'string', enum: MEAL_NAMES },
      calories: { type: 'number' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' } }, ['name', 'calories']) },
  { name: 'remove_favorite', title: 'Remove a favorite', description: 'Remove a quick add favorite by id or name.',
    inputSchema: obj({ id: { type: 'string' }, name: { type: 'string' } }), annotations: destructive },

  // ----- overview -----
  { name: 'get_overview', title: 'Everything at a glance',
    description: 'Today\'s checklist, workout, plans, pending and overdue home tasks, grocery list, this month\'s spending, account balances and latest measurements. Use for "what\'s left today" or "give me an overview".',
    inputSchema: obj({}), annotations: readOnly },
];
export const LIFE_TOOL_NAMES = new Set(LIFE_TOOLS.map((t) => t.name));

// Replace one item (matched by id) or remove it, then save the list.
async function saveList(env, key, list) { await putKey(env, key, list); return list; }
const without = (list, id) => list.filter((x) => String(x.id) !== String(id));

export async function callLifeTool(env, name, a) {
  switch (name) {
    case 'log_measurements': {
      const date = resolveDate(env, a.date);
      const values = {};
      for (const [arg, field] of [['belly_cm', 'belly'], ['left_biceps_cm', 'left'], ['right_biceps_cm', 'right']]) {
        if (a[arg] !== undefined && a[arg] !== null) values[field] = amount(a[arg], arg, { min: 15, max: 250 });
      }
      if (!Object.keys(values).length) throw new Error('Send at least one of belly_cm, left_biceps_cm, right_biceps_cm');
      const list = await getKey(env, 'measurements', []);
      const saved = { ...(list.find((m) => m.date === date) || { date }), ...values };
      const next = [...list.filter((m) => m.date !== date), saved].sort((x, y) => x.date.localeCompare(y.date));
      await saveList(env, 'measurements', next);
      return { saved, baseline: next[0], records: next.length };
    }
    case 'delete_measurements': {
      const date = resolveDate(env, a.date);
      const list = await getKey(env, 'measurements', []);
      const next = list.filter((m) => m.date !== date);
      if (next.length === list.length) throw new Error('No measurements saved for ' + date);
      await saveList(env, 'measurements', next);
      return { deleted: date };
    }
    case 'check_habit': {
      const date = resolveDate(env, a.date);
      if (!HABITS.includes(a.habit)) throw new Error('habit must be one of ' + HABITS.join(', '));
      const habits = await getKey(env, 'habits', {});
      habits[date] = { ...(habits[date] || {}), [a.habit]: a.done !== false };
      await putKey(env, 'habits', habits);
      return { date, checklist: habits[date] };
    }
    case 'mark_workout_done': {
      const date = resolveDate(env, a.date);
      const done = await getKey(env, 'workoutsDone', {});
      if (a.done === false) delete done[date]; else done[date] = true;
      await putKey(env, 'workoutsDone', done);
      return { date, workout_done: !!done[date] };
    }
    case 'set_targets': {
      const rows = await getKeys(env, ['targets', 'calorieTarget']);
      const t = rows.targets || {};
      let calories = rows.calorieTarget ?? 1900;
      if (a.calories !== undefined) { calories = Math.round(amount(a.calories, 'calories', { min: 1200, max: 4000 })); await putKey(env, 'calorieTarget', calories); }
      if (a.protein_g !== undefined) t.protein = Math.round(amount(a.protein_g, 'protein_g', { min: 40, max: 300 }));
      if (a.water_l !== undefined) t.water = amount(a.water_l, 'water_l', { min: 1, max: 6 });
      if (a.steps !== undefined) t.steps = Math.round(amount(a.steps, 'steps', { min: 1000, max: 30000 }));
      await putKey(env, 'targets', t);
      return { calories, protein_g: t.protein ?? 140, water_l: t.water ?? 2.5, steps: t.steps ?? 4000 };
    }

    case 'add_home_task': {
      if (!Array.isArray(a.tasks) || !a.tasks.length) throw new Error('tasks is required');
      const list = await getKey(env, 'homeTasks', []);
      const added = a.tasks.map((t) => {
        if (!t.title) throw new Error('each task needs a title');
        return { id: numId(), title: text(t.title, 120), category: CHORE_CATS.includes(t.category) ? t.category : 'Other', due: t.due ? resolveDate(env, t.due) : '', done: false };
      });
      const next = await saveList(env, 'homeTasks', [...list, ...added]);
      return { added, pending: next.filter((t) => !t.done).length };
    }
    case 'update_home_task': {
      const list = await getKey(env, 'homeTasks', []);
      const t = findById(list, a.id, 'home task', 'list_home_tasks');
      if (a.done !== undefined) { t.done = !!a.done; if (t.done) t.doneAt = todayIn(env); else delete t.doneAt; }
      if (a.title) t.title = text(a.title, 120);
      if (CHORE_CATS.includes(a.category)) t.category = a.category;
      if (a.due !== undefined) t.due = a.due ? resolveDate(env, a.due) : '';
      await saveList(env, 'homeTasks', list);
      return { task: t, pending: list.filter((x) => !x.done).length };
    }
    case 'delete_home_task': {
      const list = await getKey(env, 'homeTasks', []);
      const t = findById(list, a.id, 'home task', 'list_home_tasks');
      await saveList(env, 'homeTasks', without(list, a.id));
      return { deleted: t };
    }
    case 'list_home_tasks': {
      const list = await getKey(env, 'homeTasks', []);
      const tasks = list.filter((t) => a.include_done || !t.done).sort((x, y) => Number(x.done) - Number(y.done) || (x.due || '9').localeCompare(y.due || '9'));
      return { pending: list.filter((t) => !t.done).length, done: list.filter((t) => t.done).length, tasks };
    }

    case 'add_event': {
      if (!a.title) throw new Error('title is required');
      const ev = { id: strId('e'), date: resolveDate(env, a.date), title: text(a.title, 120), done: false };
      if (a.time) ev.time = text(a.time, 5);
      await saveList(env, 'events', [...(await getKey(env, 'events', [])), ev]);
      return { added: ev };
    }
    case 'update_event': {
      const list = await getKey(env, 'events', []);
      const ev = findById(list, a.id, 'plan', 'list_events');
      if (a.done !== undefined) ev.done = !!a.done;
      if (a.title) ev.title = text(a.title, 120);
      if (a.date) ev.date = resolveDate(env, a.date);
      if (a.time !== undefined) { if (a.time) ev.time = text(a.time, 5); else delete ev.time; }
      await saveList(env, 'events', list);
      return { event: ev };
    }
    case 'delete_event': {
      const list = await getKey(env, 'events', []);
      const ev = findById(list, a.id, 'plan', 'list_events');
      await saveList(env, 'events', without(list, a.id));
      return { deleted: ev };
    }
    case 'list_events': {
      const from = a.from ? resolveDate(env, a.from) : todayIn(env);
      const to = a.to ? resolveDate(env, a.to) : addDays(from, 7);
      const events = (await getKey(env, 'events', [])).filter((e) => e.date >= from && e.date <= to)
        .sort((x, y) => x.date.localeCompare(y.date) || (x.time || '99').localeCompare(y.time || '99'));
      return { from, to, events };
    }

    case 'log_work': {
      const project = a.project ? requireProject(a.project) : projectKey(a.job);
      if (!project && !a.job) throw new Error('Send project (feedora or travelhub) or job');
      const entry = { id: numId(), job: project ? projectName(project) : text(a.job, 80), date: resolveDate(env, a.date), hours: amount(a.hours, 'hours', { min: 0.1, max: 24 }), source: 'ai' };
      if (project) entry.project = project;
      if (a.task_id !== undefined && a.task_id !== null && a.task_id !== '') {
        const task = findById(await getKey(env, 'workTasks', []), a.task_id, 'work task', 'list_work_tasks');
        entry.taskId = task.id;
      }
      if (a.description) entry.description = text(a.description, 200);
      await saveList(env, 'workEntries', [...(await getKey(env, 'workEntries', [])), entry]);
      return { logged: entry, note: project === 'confect' ? 'For Confect workdays with start and finish times, log_workday is usually better.' : undefined };
    }

    case 'add_work_task': {
      const project = requireProject(a.project);
      if (!Array.isArray(a.tasks) || !a.tasks.length) throw new Error('tasks is required');
      const today = todayIn(env);
      const added = a.tasks.map((t) => {
        if (!t.title) throw new Error('each task needs a title');
        const status = TASK_STATUSES.includes(t.status) ? t.status : 'todo';
        const task = { id: numId(), project, title: text(t.title, 140), status, due: t.due ? resolveDate(env, t.due) : '', createdAt: today };
        if (status === 'done') task.doneAt = today;
        return task;
      });
      const list = await saveList(env, 'workTasks', [...(await getKey(env, 'workTasks', [])), ...added]);
      const mine = list.filter((t) => t.project === project);
      return { added, project: projectName(project), open: mine.filter((t) => t.status !== 'done').length, done: mine.filter((t) => t.status === 'done').length };
    }
    case 'update_work_task': {
      const list = await getKey(env, 'workTasks', []);
      const t = findById(list, a.id, 'work task', 'list_work_tasks');
      if (a.status !== undefined) {
        if (!TASK_STATUSES.includes(a.status)) throw new Error('status must be todo, doing or done');
        t.status = a.status;
        if (t.status === 'done') t.doneAt = todayIn(env); else delete t.doneAt;
      }
      if (a.title) t.title = text(a.title, 140);
      if (a.due !== undefined) t.due = a.due ? resolveDate(env, a.due) : '';
      if (a.project) t.project = requireProject(a.project);
      await saveList(env, 'workTasks', list);
      return { task: t };
    }
    case 'delete_work_task': {
      const list = await getKey(env, 'workTasks', []);
      const t = findById(list, a.id, 'work task', 'list_work_tasks');
      await saveList(env, 'workTasks', without(list, a.id));
      return { deleted: t };
    }
    case 'list_work_tasks':
    case 'get_project': {
      const rows = await getKeys(env, ['workTasks', 'workEntries', 'workSettings']);
      const mainJob = (rows.workSettings || {}).job || 'Confect';
      const project = a.project ? requireProject(a.project) : null;
      const tasks = (rows.workTasks || []).filter((t) => !project || t.project === project);
      const entries = (rows.workEntries || []).filter((w) => project ? entryProject(w, mainJob) === project : !!entryProject(w, mainJob));
      const hoursByTask = {};
      for (const w of entries) if (w.taskId) hoursByTask[w.taskId] = r2((hoursByTask[w.taskId] || 0) + Number(w.hours || 0));
      const order = { doing: 0, todo: 1, done: 2 };
      const shown = tasks.filter((t) => a.include_done || name === 'get_project' || t.status !== 'done')
        .sort((x, y) => order[x.status] - order[y.status] || (x.due || '9').localeCompare(y.due || '9'))
        .map((t) => ({ ...t, project_name: projectName(t.project), hours_logged: hoursByTask[t.id] || 0 }));
      const done = tasks.filter((t) => t.status === 'done').length;
      const progress = { total: tasks.length, done, in_progress: tasks.filter((t) => t.status === 'doing').length, todo: tasks.filter((t) => t.status === 'todo').length,
        percent_done: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
      if (name === 'list_work_tasks') return { project: project ? projectName(project) : 'all projects', progress, tasks: shown };
      const today = todayIn(env), ws = weekStart(today), month = today.slice(0, 7);
      const sum = (list) => r2(list.reduce((s, w) => s + Number(w.hours || 0), 0));
      return {
        project: projectName(project), kind: project === 'confect' ? 'employer' : 'personal project',
        hours: { this_week: sum(entries.filter((w) => w.date >= ws && w.date <= addDays(ws, 6))), this_month: sum(entries.filter((w) => w.date.startsWith(month))), all_time: sum(entries) },
        progress, tasks: shown,
        recent_entries: entries.slice().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 10),
      };
    }
    case 'delete_work': {
      const list = await getKey(env, 'workEntries', []);
      const entry = findById(list, a.id, 'work entry', 'get_work_week');
      await saveList(env, 'workEntries', without(list, a.id));
      return { deleted: entry };
    }

    case 'add_transaction': {
      if (!['expense', 'income'].includes(a.type)) throw new Error('type must be expense or income');
      const { eur, original } = toEur(env, a.amount, a.currency);
      if (eur <= 0) throw new Error('amount must be more than 0');
      const category = FIN_CATS.includes(a.category) ? a.category : 'Other';
      const note = (a.note ? text(a.note, 100) : category) + (original ? ` (${original})` : '');
      const entry = { id: numId(), date: resolveDate(env, a.date), type: a.type, amount: eur, category, note, source: 'ai' };
      const next = await saveList(env, 'financeEntries', [...(await getKey(env, 'financeEntries', [])), entry]);
      const { income, spent, net_cash_flow } = financeSummary(next, entry.date.slice(0, 7));
      return { logged: entry, mkd_per_eur: mkdRate(env), balances_changed: false, this_month: { income, spent, net_cash_flow } };
    }
    case 'delete_transaction': {
      const list = await getKey(env, 'financeEntries', []);
      const entry = findById(list, a.id, 'transaction', 'list_transactions');
      await saveList(env, 'financeEntries', without(list, a.id));
      return { deleted: entry };
    }
    case 'list_transactions': {
      const month = /^\d{4}-\d{2}$/.test(a.month || '') ? a.month : todayIn(env).slice(0, 7);
      return { ...financeSummary(await getKey(env, 'financeEntries', []), month), mkd_per_eur: mkdRate(env), balances: balanceSummary(await balances(env)) };
    }
    case 'update_balance': {
      const account = ACCOUNTS.find((x) => x[0] === a.account);
      if (!account) throw new Error('account must be upwork or bank');
      const all = await balances(env);
      const previous = latest(all[a.account]).balance;
      all[a.account].push({ id: strId('b'), date: resolveDate(env, a.date), balance: amount(a.balance, 'balance'), kind: 'update' });
      await putKey(env, 'balances', all);
      const now = latest(all[a.account]).balance;
      return { account: account[1], currency: account[2], previous, balance: now, change: r2(now - previous) };
    }
    case 'withdraw_upwork': {
      const usd = amount(a.usd, 'usd', { min: 0.01 }), eur = amount(a.eur, 'eur', { min: 0.01 });
      const all = await balances(env), date = resolveDate(env, a.date), id = strId('b');
      const up = latest(all.upwork).balance, bank = latest(all.bank).balance;
      all.upwork.push({ id, date, balance: r2(Math.max(0, up - usd)), kind: 'withdrawal', amount: usd });
      all.bank.push({ id, date, balance: r2(bank + eur), kind: 'withdrawal', amount: eur, fromUsd: usd });
      await putKey(env, 'balances', all);
      return { id, withdrawn_usd: usd, received_eur: eur, rate_eur_per_usd: Math.round(eur / usd * 10000) / 10000,
        warning: usd > up + 0.005 ? 'More than the Upwork balance on record' : null, balances: balanceSummary(all) };
    }
    case 'delete_balance_entry': {
      const all = await balances(env);
      const entry = Object.values(all).flat().find((b) => String(b.id) === String(a.id));
      if (!entry) throw new Error(`No balance entry with id ${a.id}. Call get_balances.`);
      if (entry.kind === 'start') throw new Error('The starting balance cannot be deleted.');
      for (const key of Object.keys(all)) all[key] = without(all[key], a.id);
      await putKey(env, 'balances', all);
      return { deleted: a.id, balances: balanceSummary(all) };
    }
    case 'get_balances': {
      const all = await balances(env);
      return { balances: balanceSummary(all), history: Object.fromEntries(ACCOUNTS.map(([key]) => [key, all[key].slice().sort(balanceOrder).slice(-10).reverse()])) };
    }

    case 'add_grocery': {
      if (!Array.isArray(a.items) || !a.items.length) throw new Error('items is required');
      const added = a.items.map((it) => {
        if (!it.name) throw new Error('each item needs a name');
        return { id: numId(), name: text(it.name, 80), qty: it.qty ? text(it.qty, 40) : '', price: it.price === undefined || it.price === null ? 0 : toEur(env, it.price, it.currency).eur, done: false };
      });
      const next = await saveList(env, 'groceryItems', [...(await getKey(env, 'groceryItems', [])), ...added]);
      return { added, ...grocerySummary(next) };
    }
    case 'update_grocery': {
      const list = await getKey(env, 'groceryItems', []);
      const g = findById(list, a.id, 'grocery item', 'list_groceries');
      if (a.done !== undefined) g.done = !!a.done;
      if (a.name) g.name = text(a.name, 80);
      if (a.qty !== undefined) g.qty = text(a.qty, 40);
      if (a.price !== undefined) g.price = toEur(env, a.price, a.currency).eur;
      await saveList(env, 'groceryItems', list);
      return { item: g, ...grocerySummary(list) };
    }
    case 'delete_grocery': {
      const list = await getKey(env, 'groceryItems', []);
      if (!a.clear_bought) findById(list, a.id, 'grocery item', 'list_groceries');
      const next = await saveList(env, 'groceryItems', a.clear_bought ? list.filter((x) => !x.done) : without(list, a.id));
      return { removed: list.length - next.length, ...grocerySummary(next) };
    }
    case 'list_groceries':
      return grocerySummary(await getKey(env, 'groceryItems', []));

    case 'add_favorite': {
      const favorites = await getKey(env, 'favorites', null);
      if (!favorites) throw new Error('Open the dashboard once so your favorites are synced, then try again.');
      const fav = { id: strId('fav-'), name: text(a.name, 120), meal: MEAL_NAMES.includes(a.meal) ? a.meal : 'Snacks',
        cal: amount(a.calories, 'calories', { max: 5000 }), p: amount(a.protein_g ?? 0, 'protein_g'), c: amount(a.carbs_g ?? 0, 'carbs_g'), fat: amount(a.fat_g ?? 0, 'fat_g') };
      if (a.portion) fav.qty = text(a.portion, 120);
      await saveList(env, 'favorites', [...favorites.filter((f) => f.name.toLowerCase() !== fav.name.toLowerCase()), fav]);
      return { saved: fav };
    }
    case 'remove_favorite': {
      const favorites = await getKey(env, 'favorites', []);
      const next = favorites.filter((f) => !(a.id && f.id === a.id) && !(a.name && f.name.toLowerCase() === String(a.name).toLowerCase()));
      if (next.length === favorites.length) throw new Error('No favorite matches that id or name.');
      await saveList(env, 'favorites', next);
      return { removed: favorites.length - next.length, favorites: next.map((f) => f.name) };
    }

    case 'get_overview': {
      const today = todayIn(env);
      const rows = await getKeys(env, ['habits', 'workoutsDone', 'events', 'homeTasks', 'groceryItems', 'financeEntries', 'measurements']);
      const tasks = (rows.homeTasks || []).filter((t) => !t.done);
      const { income, spent, net_cash_flow, spent_per_category } = financeSummary(rows.financeEntries || [], today.slice(0, 7));
      return {
        date: today, week_of: weekStart(today),
        checklist: (rows.habits || {})[today] || {}, workout_done_today: !!(rows.workoutsDone || {})[today],
        plans_today: (rows.events || []).filter((e) => e.date === today),
        home_tasks_pending: tasks.length, due_today: tasks.filter((t) => t.due === today), overdue: tasks.filter((t) => t.due && t.due < today),
        groceries: grocerySummary(rows.groceryItems || []),
        spending_this_month: { income, spent, net_cash_flow, spent_per_category },
        balances: balanceSummary(await balances(env)),
        latest_measurements: (rows.measurements || []).slice(-1)[0] || null,
      };
    }
    default:
      throw new Error('Unknown tool: ' + name);
  }
}
