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
  renderMeasurementTable();
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

// Weight on a date: that day's weigh in, else the latest one before it, else the start weight.
function weightOn(date) {
  let value = PROFILE.startWeight;
  for (const x of state.weights) if (x.date <= date) value = x.value;
  return value;
}

function renderMeasurementTable() {
  const box = document.getElementById('measurementTable');
  const rows = state.measurements.map((m) => ({ ...m, weight: weightOn(m.date) }));
  if (!rows.length) { box.innerHTML = ''; return; }
  const cols = [['weight', 'Weight', 'kg'], ...MEASURE_FIELDS.map(([field, , , label]) => [field, label, 'cm'])];
  // Weight and belly should go down, arms should grow; colour each change by that.
  const growthIsGood = new Set(['left', 'right']);
  const change = (d, field, unit) => {
    if (d === null || Math.abs(d) < 0.05) return d === null ? '' : '<small>no change</small>';
    const good = growthIsGood.has(field) ? d > 0 : d < 0;
    return `<small class="${good ? 'good' : 'bad'}">${d < 0 ? '▼' : '▲'} ${Math.abs(d).toFixed(1)} ${unit}</small>`;
  };
  // Change is measured against the previous check in that has the same field.
  const prev = {};
  const body = rows.map((r) => {
    const cells = cols.map(([field, , unit]) => {
      if (!Number.isFinite(r[field])) return '<td>—</td>';
      const d = prev[field] !== undefined ? r[field] - prev[field] : null;
      prev[field] = r[field];
      return `<td><b>${r[field].toFixed(1)}</b> ${unit}${change(d, field, unit)}</td>`;
    });
    return `<tr><td>${formatDate(r.date, r.date.slice(0, 4) === today().slice(0, 4) ? { month: 'short', day: 'numeric' } : undefined)}</td>${cells.join('')}<td><button class="del" title="Delete this check in" onclick="deleteMeasurement('${r.date}')">×</button></td></tr>`;
  }).reverse().join('');
  const total = cols.map(([field, , unit]) => {
    const vals = rows.filter((r) => Number.isFinite(r[field]));
    if (vals.length < 2) return '<td>—</td>';
    const d = vals[vals.length - 1][field] - vals[0][field];
    return `<td>${d > 0 ? '+' : ''}${d.toFixed(1)} ${unit}</td>`;
  }).join('');
  box.innerHTML = `<table class="measure-table">
    <thead><tr><th>Date</th>${cols.map(([, label]) => `<th>${label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${body}</tbody>
    ${rows.length > 1 ? `<tfoot><tr><td>Total change</td>${total}<td></td></tr></tfoot>` : ''}
  </table>`;
}

function deleteMeasurement(date) {
  if (!confirm(`Delete the measurements from ${formatDate(date)}?`)) return;
  state.measurements = state.measurements.filter((m) => m.date !== date);
  persist();
  render();
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
