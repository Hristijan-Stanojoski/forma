// Progress: weigh ins, body measurements, adaptive calorie guidance and the weight/calorie charts.

// Average of weigh ins in a `days` long window ending `offset` days ago (needs 3+ weigh ins).
function weightAverage(days, offset = 0) {
  const end = addDays(today(), -offset), start = addDays(end, -(days - 1));
  const values = state.weights.filter((x) => x.date >= start && x.date <= end).map((x) => x.value);
  return values.length >= 3 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function guidance() {
  const current = weightAverage(7), previous = weightAverage(7, 7);
  const maintenance = Math.round(maintenanceFor(currentWeight()) / 10) * 10;
  let status = 'Collect data';
  let explain = `Log at least three weigh ins in each of two weeks in a row. Your ${state.calorieTarget.toLocaleString()} kcal target stays the same until there is a meaningful trend.`;
  if (current !== null && previous !== null) {
    const change = current - previous;
    if (change > 0.2) { status = 'Review trend'; explain = 'Your weekly average went up. Check logging accuracy, sodium, creatine, activity and consistency before changing calories.'; }
    else if (change < -1) { status = 'Check recovery'; explain = 'Your weekly average dropped fast. Check energy, recovery and food intake rather than cutting calories.'; }
    else if (change > -0.2) { status = 'Review in 2 to 3 weeks'; explain = 'Your weight trend is fairly flat. If it stays that way for 2 to 3 weeks with consistent tracking, consider a small change (100 to 150 kcal) or more activity.'; }
    else { status = 'Stay consistent'; explain = 'Your weekly average is moving down. Keep the current calorie target unless recovery or hunger becomes an issue.'; }
  }
  return { current, previous, maintenance, status, explain };
}

function renderProgress() {
  const w = currentWeight(), { startWeight: start, goalWeight: goal } = PROFILE;
  setText('progressWeight', w.toFixed(1) + ' kg');
  setText('lostWeight', Math.max(0, start - w).toFixed(1) + ' kg');
  setText('progressRemaining', Math.max(0, w - goal).toFixed(1) + ' kg');

  const g = guidance();
  setText('adaptiveTarget', state.calorieTarget.toLocaleString() + ' kcal');
  setText('maintenanceEstimate', g.maintenance.toLocaleString() + ' kcal');
  setText('adjustmentStatus', g.status);
  setText('adaptiveExplanation', g.explain + ' Estimated maintenance is a sedentary baseline; training and walking may raise it.');
  const box = document.getElementById('weeklyWeightInsight');
  const hasTrend = g.current !== null && g.previous !== null;
  box.className = 'insight ' + (hasTrend && g.current > g.previous + .2 ? '' : 'good');
  box.innerHTML = hasTrend
    ? `<strong>7 day average: ${g.current.toFixed(1)} kg (${g.current - g.previous >= 0 ? '+' : ''}${(g.current - g.previous).toFixed(1)} kg vs previous week)</strong><small>Daily spikes are not automatically fat gain.</small>`
    : '<strong>Weekly trend: not enough weigh ins yet</strong><small>Log your weight regularly to compare two 7 day averages.</small>';
}

function saveWeight() {
  const n = Number(document.getElementById('weightInput').value);
  if (!n || n < 30 || n > 300) { alert('Enter a valid weight in kg.'); return; }
  state.weights = state.weights.filter((x) => x.date !== today());
  state.weights.push({ date: today(), value: n });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  persist();
  document.getElementById('weightInput').value = '';
  render();
}

// ---------- body measurements ----------
const MEASURE_FIELDS = [['belly', 'bellyInput', 'measureBelly', 'Belly', '#e6a04d'], ['left', 'leftArmInput', 'measureLeft', 'Left biceps', '#477fce'], ['right', 'rightArmInput', 'measureRight', 'Right biceps', '#a16cbb']];

function saveMeasurements() {
  const date = document.getElementById('measurementDate').value || today();
  if (date > today()) { alert('Choose today or an earlier date.'); return; }
  const values = {};
  for (const [field, inputId, , label] of MEASURE_FIELDS) {
    const input = document.getElementById(inputId);
    if (input.value.trim() === '') continue;
    const n = Number(input.value);
    if (!Number.isFinite(n) || n < 15 || n > 250) { alert('Check the value for ' + label.toLowerCase() + '.'); return; }
    values[field] = n;
  }
  if (!Object.keys(values).length) { alert('Enter at least one measurement.'); return; }
  const old = state.measurements.find((m) => m.date === date) || { date };
  state.measurements = state.measurements.filter((m) => m.date !== date);
  state.measurements.push({ ...old, ...values });
  state.measurements.sort((a, b) => a.date.localeCompare(b.date));
  persist();
  for (const [, inputId] of MEASURE_FIELDS) document.getElementById(inputId).value = '';
  render();
}

function renderMeasurements() {
  const m = state.measurements;
  setText('measureWeight', currentWeight().toFixed(1) + ' kg');
  for (const [field, , statId] of MEASURE_FIELDS) {
    const rows = m.filter((x) => Number.isFinite(x[field]));
    const last = rows[rows.length - 1], first = rows[0];
    const diff = last && rows.length > 1 ? last[field] - first[field] : null;
    setText(statId, last ? last[field].toFixed(1) + ' cm' + (diff !== null ? ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})` : '') : '— cm');
  }
  setText('measurementStatus', m.length
    ? `Last measurement: ${m[m.length - 1].date} · ${m.length} weekly record(s)`
    : 'No measurements recorded yet. Your first entry sets the baseline.');
  const dateInput = document.getElementById('measurementDate');
  if (!dateInput.value) dateInput.value = today();
  dateInput.max = today();

  // Every line is % change from its own first value so kg and cm compare fairly.
  const dates = [...new Set([DIET_START, ...state.weights.map((x) => x.date), ...m.map((x) => x.date)])].sort();
  const series = [
    { name: 'Weight', color: '#21855c', rows: [{ date: DIET_START, value: PROFILE.startWeight }, ...state.weights.map((x) => ({ date: x.date, value: x.value }))] },
    ...MEASURE_FIELDS.map(([field, , , label, color]) => ({ name: label, color, rows: m.filter((x) => Number.isFinite(x[field])).map((x) => ({ date: x.date, value: x[field] })) })),
  ];
  chart('bodyChart', 'line', dates, series.map((s) => {
    const first = s.rows[0], lookup = new Map(s.rows.map((x) => [x.date, x.value]));
    return {
      label: s.name, borderColor: s.color,
      data: dates.map((d) => (first && d >= first.date && lookup.has(d) ? Number(((lookup.get(d) - first.value) / first.value * 100).toFixed(2)) : null)),
    };
  }));
}

function drawWeightCharts() {
  const data = [{ date: 'Start', value: PROFILE.startWeight }, ...state.weights];
  const labels = data.map((x) => x.date), values = data.map((x) => x.value);
  for (const id of ['weightChart', 'progressChart']) {
    chart(id, 'line', labels, [
      { label: 'Weight (kg)', data: values, borderColor: '#21855c' },
      { label: 'Goal', data: values.map(() => PROFILE.goalWeight), borderColor: '#b6c9bd', borderDash: [5, 5], pointRadius: 0 },
    ]);
  }
  const days = Object.entries(state.foods).filter(([, list]) => list.length).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  chart('calorieChart', 'bar', days.length ? days.map(([d]) => d.slice(5)) : ['Today'], [
    { label: 'Calories', data: days.length ? days.map(([, list]) => Math.round(sumFoods(list).cal)) : [0], backgroundColor: '#57b48a' },
  ]);
}
