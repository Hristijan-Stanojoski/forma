// MCP tool definitions and their implementations.
// Tool arguments use AI friendly names (calories, protein_g, portion); storage keeps the
// dashboard field names (cal, p, c, fat, qty, meal).
import { getKey, getKeys, putKey } from './storage.js';
import { MEALS, START_KG, GOAL_KG, addDays, daySummary, loadFoods, newId, num, resolveDate, targets, todayIn } from './diary.js';

const dateProp = { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday". Defaults to today (Europe/Skopje).' };
const nutrientProps = {
  name: { type: 'string', description: 'Food or drink, e.g. "Scrambled eggs"' },
  portion: { type: 'string', description: 'Amount eaten, e.g. "3 eggs (150 g)" or "250 ml"' },
  meal: { type: 'string', enum: MEALS },
  calories: { type: 'number', description: 'kcal for this portion' },
  protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' },
};

export const TOOLS = [
  {
    name: 'log_food',
    title: 'Log food or drinks',
    description:
      'Log one or more foods or drinks to the Forma diary. YOU estimate calories and macros from the user\'s description using standard nutrition data (USDA style values, raw vs cooked weights, cooking oil, milk in coffee etc.). ' +
      'Split mixed meals into separate ingredients when practical. If a portion is truly ambiguous, make a sensible assumption and state it in the portion text. After logging, tell the user what you logged and their remaining calories.',
    inputSchema: {
      type: 'object',
      properties: {
        date: dateProp,
        items: { type: 'array', minItems: 1, items: { type: 'object', properties: nutrientProps, required: ['name', 'meal', 'calories', 'protein_g', 'carbs_g', 'fat_g'] } },
      },
      required: ['items'],
    },
  },
  {
    name: 'get_day',
    title: 'Get a day summary',
    description: 'Food entries (with ids), totals, targets, remaining calories, water and steps for a day. Use before editing or deleting entries.',
    inputSchema: { type: 'object', properties: { date: dateProp } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_food',
    title: 'Correct a food entry',
    description: 'Change fields of an existing food entry. Get the id from get_day first. Only send the fields that change.',
    inputSchema: { type: 'object', properties: { date: dateProp, id: { type: 'string' }, ...nutrientProps }, required: ['id'] },
  },
  {
    name: 'delete_food',
    title: 'Delete a food entry',
    description: 'Remove a food entry by id (get the id from get_day). Confirm with the user before deleting.',
    inputSchema: { type: 'object', properties: { date: dateProp, id: { type: 'string' } }, required: ['id'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'log_water',
    title: 'Log water',
    description: 'Add plain water drunk, in millilitres (adds to the day total). Use a negative number to correct a mistake.',
    inputSchema: { type: 'object', properties: { date: dateProp, ml: { type: 'number' } }, required: ['ml'] },
  },
  {
    name: 'log_weight',
    title: 'Log weight',
    description: 'Save a weigh in in kg (replaces any weigh in for that date).',
    inputSchema: { type: 'object', properties: { date: dateProp, kg: { type: 'number' } }, required: ['kg'] },
  },
  {
    name: 'log_steps',
    title: 'Log steps',
    description: 'Set the step count for a day (replaces the previous value).',
    inputSchema: { type: 'object', properties: { date: dateProp, steps: { type: 'number' } }, required: ['steps'] },
  },
  {
    name: 'complete_day',
    title: 'Mark day complete',
    description: 'Mark that ALL food and drinks for a day are logged (only complete days count toward the calorie deficit). Only call when the user says they are done for the day.',
    inputSchema: { type: 'object', properties: { date: dateProp, complete: { type: 'boolean', default: true } } },
  },
  {
    name: 'get_progress',
    title: 'Get progress overview',
    description: 'Weight history, latest weight, goal, targets and the last 7 days of calories. Use for questions like "how am I doing this week".',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
];

function foodFields(it, f) {
  if (it.name !== undefined) f.name = String(it.name).slice(0, 120);
  if (it.portion !== undefined) f.qty = String(it.portion).slice(0, 120);
  if (it.meal && MEALS.includes(it.meal)) f.meal = it.meal;
  if (it.calories !== undefined) f.cal = num(it.calories, 'calories', { max: 5000 });
  if (it.protein_g !== undefined) f.p = num(it.protein_g, 'protein_g', { max: 500 });
  if (it.carbs_g !== undefined) f.c = num(it.carbs_g, 'carbs_g', { max: 800 });
  if (it.fat_g !== undefined) f.fat = num(it.fat_g, 'fat_g', { max: 500 });
  return f;
}

export async function callTool(env, name, a = {}) {
  switch (name) {
    case 'log_food': {
      const date = resolveDate(env, a.date);
      if (!Array.isArray(a.items) || !a.items.length) throw new Error('items is required');
      const foods = await loadFoods(env, date);
      for (const it of a.items) {
        if (!it.name || typeof it.name !== 'string') throw new Error('each item needs a name');
        if (it.calories === undefined) throw new Error(`calories is required for ${it.name}`);
        foods.push(foodFields({ protein_g: 0, carbs_g: 0, fat_g: 0, ...it }, { id: newId(), meal: 'Snacks', estimated: true, source: 'ai' }));
      }
      await putKey(env, 'foods:' + date, foods);
      return { logged: a.items.length, ...(await daySummary(env, date)) };
    }
    case 'get_day': {
      const date = resolveDate(env, a.date);
      await loadFoods(env, date);
      return daySummary(env, date);
    }
    case 'update_food': {
      const date = resolveDate(env, a.date);
      const foods = await loadFoods(env, date);
      const f = foods.find((x) => x.id === a.id);
      if (!f) throw new Error(`No entry with id ${a.id} on ${date}. Call get_day to see ids.`);
      foodFields({ ...a, name: a.name || undefined }, f);
      await putKey(env, 'foods:' + date, foods);
      return { updated: a.id, ...(await daySummary(env, date)) };
    }
    case 'delete_food': {
      const date = resolveDate(env, a.date);
      const foods = await loadFoods(env, date);
      const next = foods.filter((x) => x.id !== a.id);
      if (next.length === foods.length) throw new Error(`No entry with id ${a.id} on ${date}.`);
      await putKey(env, 'foods:' + date, next);
      return { deleted: a.id, ...(await daySummary(env, date)) };
    }
    case 'log_water': {
      const date = resolveDate(env, a.date);
      const ml = num(a.ml, 'ml', { min: -5000, max: 5000 });
      const water = await getKey(env, 'water', {});
      water[date] = Math.max(0, Math.round(((water[date] || 0) + ml / 1000) * 100) / 100);
      await putKey(env, 'water', water);
      return { date, water_l: water[date], target_l: (await targets(env)).water };
    }
    case 'log_weight': {
      const date = resolveDate(env, a.date);
      const kg = num(a.kg, 'kg', { min: 30, max: 300 });
      const weights = (await getKey(env, 'weights', [])).filter((w) => w.date !== date);
      weights.push({ date, value: kg });
      weights.sort((x, y) => x.date.localeCompare(y.date));
      await putKey(env, 'weights', weights);
      return { date, kg, change_from_start_kg: Math.round((kg - START_KG) * 10) / 10, remaining_to_goal_kg: Math.round((kg - GOAL_KG) * 10) / 10 };
    }
    case 'log_steps': {
      const date = resolveDate(env, a.date);
      const steps = await getKey(env, 'steps', {});
      steps[date] = Math.round(num(a.steps, 'steps', { max: 100000 }));
      await putKey(env, 'steps', steps);
      return { date, steps: steps[date], target: (await targets(env)).steps };
    }
    case 'complete_day': {
      const date = resolveDate(env, a.date);
      const days = await getKey(env, 'completedDays', {});
      days[date] = a.complete !== false;
      await putKey(env, 'completedDays', days);
      return { date, day_marked_complete: days[date] };
    }
    case 'get_progress': {
      const today = todayIn(env);
      const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
      const rows = await getKeys(env, ['weights', ...dates.map((d) => 'foods:' + d)]);
      const weights = rows.weights || [];
      const last7 = dates.map((date) => {
        const foods = rows['foods:' + date] || [];
        return { date, calories: Math.round(foods.reduce((s, f) => s + Number(f.cal || 0), 0)), entries: foods.length };
      });
      const latest = weights.length ? weights[weights.length - 1].value : START_KG;
      return { start_kg: START_KG, goal_kg: GOAL_KG, latest_kg: latest, weights: weights.slice(-30), targets: await targets(env), last_7_days: last7 };
    }
    default:
      throw new Error('Unknown tool: ' + name);
  }
}
