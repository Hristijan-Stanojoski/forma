// Static content: pages, goal, diet rotation, meal ideas, quick foods and the training plan.

const PROFILE = { startWeight: 100, goalWeight: 80, heightCm: 180, age: 28 };
const DIET_START = '2026-11-01';
const TIMEZONE = 'Europe/Skopje';
const DEFAULT_API = 'https://forma-api.hristijanstanojoski.workers.dev'; // prefilled when connecting a device

// [id, icon, nav label, page title, page subtitle]
const PAGES = [
  ['dashboard', '▦', 'Dashboard', 'Overview Dashboard', 'Small actions. Big changes. Every day.'],
  ['nutrition', '🥗', 'Nutrition', 'Nutrition Tracker', 'Every bite counts, without the guesswork.'],
  ['training', '🏋️', 'Training', 'Training Plan', 'Build strength, one session at a time.'],
  ['progress', '📈', 'Progress', 'Your Progress', 'Track trends, not just individual days.'],
  ['schedule', '🗓️', 'Schedule', 'Your Schedule', 'A plan you can actually follow.'],
  ['chores', '🧹', 'Home Tasks', 'Home & Chores', 'Keep your home running smoothly.'],
  ['work', '💼', 'Work', 'Work Tracker', 'Organize your jobs and track your hours.'],
  ['finance', '💳', 'Finances', 'Finance Tracker', 'Plan your budget and groceries.'],
  ['settings', '⚙️', 'Settings', 'Settings', 'Your goals and preferences.'],
];

const DIET = ['Protein day', 'Starch day', 'Carbohydrate day', 'Fruit & vegetable day'];
const DIET_ICONS = ['🥩', '🥔', '🍝', '🥦'];
const DIET_NOTES = [
  'Meat or fish, generous fresh salads, protein focused meals.',
  'Rice, potatoes or legumes, generous salads, adequate protein.',
  'Pasta or grains, fresh vegetables, adequate protein.',
  'Fruit and vegetables, with adequate protein and healthy fats.',
];

const DIET_TIPS = [
  { good: 'Chicken, turkey, lean beef, fish, eggs, Greek yogurt, cottage cheese, big salads and green vegetables.', easy: 'Bread, pasta, rice, potatoes, sweets and sugary drinks.' },
  { good: 'Potatoes, rice, beans, lentils, chickpeas, plenty of vegetables, plus a lean protein portion.', easy: 'Fried sides, creamy sauces, sweets and extra oil.' },
  { good: 'Pasta, wholegrain bread, oats, bulgur, tomato based sauces, vegetables and a lean protein portion.', easy: 'Cream sauces, pastries and large second helpings.' },
  { good: 'Fresh fruit, vegetables, salads, soups, plus some yogurt, eggs or fish to keep protein up.', easy: 'Dried fruit, juices, nuts in large amounts and heavy dressings.' },
];

const MEAL_LABELS = {
  'Mediterranean Pan-Fried Salmon Bowl': '🐟 Mediterranean salmon bowl',
  Fruit: '🍌 Fruit', Drinks: '☕ Coffee & drinks', Breakfast: '🍳 Breakfast',
  Lunch: '🍽️ Lunch', Dinner: '🌙 Dinner', Snacks: '🍎 Snacks',
};

const MEAL_IDEAS = [
  { name: 'Chicken & garden salad', desc: 'Protein day • lunch inspiration', cal: 460, img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&auto=format&fit=crop&q=80' },
  { name: 'Rice & vegetables', desc: 'Starch day • lunch inspiration', cal: 510, img: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=700&auto=format&fit=crop&q=80' },
  { name: 'Pasta with tomato', desc: 'Carbohydrate day • inspiration', cal: 530, img: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=700&auto=format&fit=crop&q=80' },
];

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drinks'];

// Starting favorites. Fixed ids so two devices seeding them do not duplicate on sync.
const DEFAULT_FAVORITES = [
  { id: 'fav-banana', name: 'Banana (medium)', cal: 105, p: 1.3, c: 27, fat: .4, meal: 'Snacks' },
  { id: 'fav-apple', name: 'Apple (medium)', cal: 95, p: .5, c: 25, fat: .3, meal: 'Snacks' },
  { id: 'fav-nescafe', name: 'Nescafé + 100 ml milk', cal: 52, p: 3.4, c: 5.2, fat: 2.5, meal: 'Drinks' },
  { id: 'fav-lemon', name: 'Lemon + 1 tsp honey', cal: 28, p: .2, c: 7.5, fat: 0, meal: 'Drinks' },
  { id: 'fav-whey', name: 'Whey (30 g)', cal: 120, p: 24, c: 3, fat: 1.5, meal: 'Snacks' },
  { id: 'fav-chicken', name: 'Chicken breast (250g raw)', qty: '250 g raw', cal: 300, p: 56, c: 0, fat: 6.5, meal: 'Lunch' },
];

// [day, title, [[exercise, sets, rest], ...]]
const WORKOUTS = [
  ['Monday', 'Upper body A', [['Machine chest press', '3 × 10–12', '90 s'], ['Lat pulldown', '3 × 10–12', '90 s'], ['Seated cable row', '3 × 10–12', '90 s'], ['Dumbbell lateral raise', '2 × 12–15', '60 s'], ['Triceps rope pushdown', '2 × 12–15', '60 s']]],
  ['Tuesday', 'Lower body A', [['Goblet squat', '3 × 8–10', '2 min'], ['Leg press', '3 × 10–12', '90 s'], ['Lying hamstring curl', '3 × 10–12', '90 s'], ['Standing calf raise', '3 × 12–15', '60 s'], ['Plank', '3 × 30 s', '45 s']]],
  ['Thursday', 'Upper body B', [['Incline dumbbell press', '3 × 8–10', '90 s'], ['Chest supported row', '3 × 10–12', '90 s'], ['Face pull', '2 × 12–15', '60 s'], ['Dumbbell biceps curl', '2 × 10–12', '60 s'], ['Overhead triceps extension', '2 × 10–12', '60 s']]],
  ['Friday', 'Lower body B', [['Leg press', '3 × 10–12', '90 s'], ['Romanian deadlift (light)', '3 × 8–10', '2 min'], ['Leg extension', '2 × 12–15', '60 s'], ['Seated hamstring curl', '2 × 12–15', '60 s'], ['Dead bug', '3 × 10 per side', '45 s']]],
];
const GYM_WEEKDAYS = [0, 1, 3, 4]; // Mon, Tue, Thu, Fri

// Main job: start between earliestStart and latestStart, standard day hoursPerDay long.
// Must match WORK_DEFAULTS in worker/src/diary.js. Editable in Settings (state.workSettings).
const WORK_DEFAULTS = { job: 'Main job', hoursPerDay: 8, earliestStart: '07:00', latestStart: '09:00', weeklyTarget: 40 };
// Money accounts: [key, name, currency, icon, how often it gets updated, starting balance on DIET_START]
const ACCOUNTS = [
  ['upwork', 'Upwork', 'USD', '💼', 'Update weekly', 1466.02],
  ['bank', 'Bank account', 'EUR', '🏦', 'Updates when you withdraw from Upwork', 1182.73],
];
const UPWORK_UPDATE_DAYS = 7;

const WORK_WEEKDAYS = [0, 1, 2, 3, 4]; // Mon to Fri

// November 1 verified user provided intake. The salmon bowl is stored ingredient by ingredient.
const NOV1_DATE = '2026-11-01';
const NOV1_ITEMS = [
  { name: 'Salmon (raw)', qty: '200 g', cal: 416, p: 40, c: 0, fat: 26, meal: 'Mediterranean Pan-Fried Salmon Bowl' },
  { name: 'Rucola', qty: '85 g', cal: 21, p: 2.2, c: 3.1, fat: .6, meal: 'Mediterranean Pan-Fried Salmon Bowl' },
  { name: 'Greek cheese (feta-style)', qty: '30 g', cal: 80, p: 4.3, c: 1.2, fat: 6.5, meal: 'Mediterranean Pan-Fried Salmon Bowl' },
  { name: 'Hummus', qty: '35 g', cal: 83, p: 2.8, c: 5, fat: 5.8, meal: 'Mediterranean Pan-Fried Salmon Bowl' },
  { name: 'Greek yoghurt', qty: '50 g', cal: 40, p: 4, c: 2, fat: 1.8, meal: 'Mediterranean Pan-Fried Salmon Bowl' },
  { name: 'Olive oil', qty: '5 g', cal: 45, p: 0, c: 0, fat: 5, meal: 'Mediterranean Pan-Fried Salmon Bowl' },
  { name: 'Banana', qty: '1 medium (~120 g)', cal: 105, p: 1.3, c: 27, fat: .4, meal: 'Fruit' },
  { name: 'Orange', qty: '1 medium (~130 g)', cal: 62, p: 1.2, c: 15.4, fat: .2, meal: 'Fruit' },
  { name: 'Nescafé with 150 ml milk', qty: '1 tsp Nescafé (~2 g) + 150 ml milk (2.5%)', cal: 80, p: 5.1, c: 7.9, fat: 3.8, meal: 'Drinks' },
  { name: 'Espresso (no sugar)', qty: '1 shot', cal: 2, p: 0, c: .4, fat: 0, meal: 'Drinks' },
];
