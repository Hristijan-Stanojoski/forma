// Dashboard: goal hero, today's diary, metrics, checklist and the cumulative deficit model.

function renderDashboard() {
  const w = currentWeight(), t = totals(), T = state.targets, day = today();
  const { startWeight: start, goalWeight: goal } = PROFILE;
  const lost = start - w, span = start - goal;

  setText('currentWeight', w.toFixed(1) + ' kg');
  setText('remaining', Math.max(0, w - goal).toFixed(1) + ' kg');
  setText('goalpercent', Math.round(Math.max(0, Math.min(100, lost / span * 100))) + '% complete');
  setBar('goalbar', lost / span * 100);

  const insight = document.getElementById('weightInsight');
  insight.className = 'insight ' + (w > start ? '' : 'good');
  insight.innerHTML = w > start
    ? `<strong>⚠ Above starting weight: +${(w - start).toFixed(1)} kg</strong><small>This may reflect water, sodium, creatine or other fluctuations. Check the 7 day trend before reacting.</small>`
    : `<strong>${w === start ? `Starting baseline: ${start.toFixed(1)} kg` : `Change from baseline: ${(w - start).toFixed(1)} kg`}</strong><small>Progress uses your real weight, including increases above ${start} kg.</small>`;

  const water = state.water[day] || 0, steps = state.steps[day] || 0;
  setText('calorieMetric', Math.round(t.cal).toLocaleString());
  setText('calorieLimitLabel', ' / ' + state.calorieTarget.toLocaleString());
  setText('proteinMetric', Math.round(t.p) + 'g');
  setText('proteinTargetLabel', ' / ' + T.protein + 'g');
  setText('waterMetric', water.toFixed(2).replace(/0$/, '') + 'L');
  setText('waterTargetLabel', ' / ' + T.water + 'L');
  setText('stepsMetric', steps.toLocaleString());
  setText('stepsTargetLabel', ' / ' + T.steps.toLocaleString());
  setBar('calbar', t.cal / state.calorieTarget * 100);
  setBar('probar', t.p / T.protein * 100);
  setBar('waterbar', water / T.water * 100);
  setBar('stepsbar', steps / T.steps * 100);
  setText('dietPill', DIET_ICONS[cycle()] + ' ' + DIET[cycle()]);

  renderDashboardDiary();
  renderTasks();
}

function renderDashboardDiary() {
  const date = today(), entries = state.foods[date] || [], sum = sumFoods(entries), done = !!state.completedDays[date];
  setText('diaryDate', formatDate(date).toUpperCase());
  setText('diaryCalories', Math.round(sum.cal).toLocaleString());
  setText('diaryRemaining', Math.round(state.calorieTarget - sum.cal).toLocaleString());
  setText('diaryProtein', sum.p.toFixed(1) + 'g');
  setText('diaryCarbs', sum.c.toFixed(1) + 'g');
  setText('diaryFat', sum.fat.toFixed(1) + 'g');
  setText('diaryWater', Math.round((state.water[date] || 0) * 1000) + 'ml');
  setBar('diaryBar', sum.cal / state.calorieTarget * 100);
  setText('diarySub', 'Actual logged meals and drinks · Day ' + (cycle() + 1) + ', ' + DIET[cycle()].replace(' day', ''));
  setText('diaryStatus', done ? 'Day completed' : 'Logging in progress');
  setText('diaryNote', done ? 'Day marked complete · Nutrition values are estimates.' : 'Nutrition values are estimates · Your day is still open for more food and drinks.');

  const groups = new Map();
  for (const f of entries) {
    const group = f.meal || 'Other food';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(f);
  }
  document.getElementById('dashboardMeals').innerHTML = entries.length
    ? [...groups].map(([group, items]) => `<div class="diary-group">
        <div class="diary-group-head"><b>${escapeHTML(MEAL_LABELS[group] || group)}</b><strong>${Math.round(sumFoods(items).cal)} kcal</strong></div>
        ${items.map((f) => `<div class="diary-entry"><span>${escapeHTML(f.name)} <small>· ${escapeHTML(f.qty || 'portion not specified')}</small></span><strong>${Math.round(Number(f.cal || 0))} kcal</strong></div>`).join('')}
      </div>`).join('')
    : '<div class="diary-empty">No meals logged for this date yet. Open Nutrition to add your first entry, or just tell your AI assistant what you ate.</div>';
}

// ---------- checklist ----------
function renderTasks() {
  const day = today();
  const tasks = [
    ['water', 'Drink ' + state.targets.water + 'L water', 'Stay hydrated'],
    ['creatine', 'Take creatine', '3 to 5 g daily'],
    ['walk', 'Reach step goal', state.targets.steps.toLocaleString() + ' steps'],
    ['log', 'Log all food & drinks', 'Include coffee, milk and oil'],
  ];
  const done = state.habits[day] || {};
  document.getElementById('tasks').innerHTML = tasks.map(([id, label, desc]) =>
    `<label class="task"><input type="checkbox" ${done[id] ? 'checked' : ''} onchange="toggleHabit('${id}',this.checked)"><div><b>${label}</b><small>${desc}</small></div></label>`
  ).join('') + `<div class="formrow"><button class="btn secondary" onclick="addWater()">+ 250 ml water</button><button class="btn outline" onclick="setSteps()">Update steps</button></div>`;
}
function toggleHabit(id, val) {
  (state.habits[today()] ??= {})[id] = val;
  persist();
}
function addWater() {
  state.water[today()] = Math.round(((state.water[today()] || 0) + .25) * 100) / 100;
  persist();
  render();
}
function setSteps() {
  const n = prompt('How many steps today?', state.steps[today()] || 0);
  if (n !== null && n.trim() !== '' && Number.isFinite(Number(n)) && Number(n) >= 0) {
    state.steps[today()] = Math.round(Number(n));
    persist();
    render();
  }
}

// ---------- cumulative deficit ----------
// Only days marked complete count; each day's maintenance uses the latest weigh in on or before it.
function deficitModel() {
  const dates = Object.keys(state.completedDays).filter((d) => state.completedDays[d] && d >= DIET_START && d <= today()).sort();
  const weights = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  const points = [];
  for (const date of dates) {
    const before = weights.filter((x) => x.date <= date);
    const weight = before.length ? before[before.length - 1].value : PROFILE.startWeight;
    const daily = maintenanceFor(weight) - sumFoods(state.foods[date]).cal;
    total += daily;
    points.push({ date, daily, total, predicted: PROFILE.startWeight - total / 7700 });
  }
  return { points, total, predicted: PROFILE.startWeight - total / 7700 };
}

function renderDeficit() {
  const m = deficitModel(), n = m.points.length, fmt = (v) => Math.round(v).toLocaleString('en-US');
  setText('deficitTotal', n ? (m.total >= 0 ? '+' : '') + fmt(m.total) + ' kcal' : '0 kcal');
  setText('deficitCoverage', n + ' completed day' + (n === 1 ? '' : 's'));
  setText('fatEquivalent', n ? (m.total >= 0 ? '−' : '+') + Math.abs(m.total / 7700).toFixed(2) + ' kg' : '0.00 kg');
  setText('predictedWeight', (n ? m.predicted : PROFILE.startWeight).toFixed(2) + ' kg');
  setText('deficitActualWeight', currentWeight().toFixed(1) + ' kg');

  let missing = 0;
  if (n) for (let d = DIET_START; d <= today(); d = addDays(d, 1)) if (!state.completedDays[d]) missing++;
  setText('deficitWarning', n
    ? (missing ? `⚠ ${missing} day(s) not marked complete since Nov 1. The cumulative deficit leaves those days out, so the predicted weight is incomplete.` : 'All days marked complete since Nov 1. These are still estimates, not measured fat loss.')
    : 'Mark a day as fully logged in Nutrition to begin your deficit chart. Partial days are left out so weight loss is not overstated.');

  const labels = ['Nov 1', ...m.points.map((p) => p.date.slice(5))];
  chart('deficitChart', 'line', labels, [
    { label: 'Cumulative deficit (kcal)', data: [0, ...m.points.map((p) => Math.round(p.total))], borderColor: '#21855c' },
  ]);
  const actualByDate = new Map(state.weights.map((w) => [w.date, w.value]));
  chart('predictedChart', 'line', labels, [
    { label: 'Predicted (kg)', data: [PROFILE.startWeight, ...m.points.map((p) => Number(p.predicted.toFixed(2)))], borderColor: '#21855c' },
    { label: 'Actual (kg)', data: [PROFILE.startWeight, ...m.points.map((p) => actualByDate.get(p.date) ?? null)], borderColor: '#e6a04d' },
  ]);
}

function renderMealIdeas() {
  document.getElementById('mealCards').innerHTML = MEAL_IDEAS.map((m) => `<div class="card meal">
      <img src="${m.img}" alt="${escapeHTML(m.name)}" loading="lazy">
      <div class="content"><strong>${escapeHTML(m.name)}</strong><p>${escapeHTML(m.desc)}</p>
        <div class="bottom"><span class="muted">Meal idea</span><b>~${m.cal} kcal*</b></div></div>
    </div>`).join('');
}
