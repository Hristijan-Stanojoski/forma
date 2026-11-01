// Training plan, plus the Schedule page: day, week and month views that bring together the
// diet day, training, home tasks, your own plans, work hours, food and other logs for each day.

let scheduleView = 'week';   // 'day' | 'week' | 'month'
let scheduleDate = today();  // selected day

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayIndex = (date) => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
const weekStartOf = (date) => addDays(date, -weekdayIndex(date));
const shortDate = (date) => formatDate(date, { month: 'short', day: 'numeric' });
function workoutFor(date) {
  const i = GYM_WEEKDAYS.indexOf(weekdayIndex(date));
  return i < 0 ? null : WORKOUTS[i];
}

// Everything that belongs to one day.
function dayInfo(date) {
  const now = today();
  const tasks = state.homeTasks.filter((t) => t.due === date || (!t.due && t.doneAt === date)
    || (date === now && t.due && t.due < now && !t.done)); // overdue tasks show up today
  const work = state.workEntries.filter((w) => w.date === date);
  const foods = state.foods[date] || [];
  return {
    date, when: date < now ? 'past' : date === now ? 'today' : 'future',
    diet: cycle(date), workout: workoutFor(date), workoutDone: !!state.workoutsDone[date],
    tasks, events: state.events.filter((e) => e.date === date).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')),
    work, workHours: work.reduce((a, w) => a + Number(w.hours || 0), 0),
    money: state.financeEntries.filter((x) => x.date === date),
    foods, food: sumFoods(foods), complete: !!state.completedDays[date],
    water: state.water[date] || 0, steps: state.steps[date] || 0,
    weight: state.weights.find((w) => w.date === date),
  };
}

// ---------- navigation ----------
function setScheduleView(view) {
  scheduleView = view;
  renderSchedule();
}
function selectScheduleDay(date) {
  scheduleDate = date;
  renderSchedule();
  if (scheduleView !== 'day') document.getElementById('scheduleDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function shiftSchedule(dir) {
  if (scheduleView === 'day') scheduleDate = addDays(scheduleDate, dir);
  else if (scheduleView === 'week') scheduleDate = addDays(scheduleDate, 7 * dir);
  else {
    const [y, m, d] = scheduleDate.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + dir, 1));
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, days));
    scheduleDate = first.toISOString().slice(0, 10);
  }
  renderSchedule();
}

// ---------- render ----------
function renderSchedule() {
  document.querySelectorAll('.view-switch button').forEach((b) => b.classList.toggle('active', b.dataset.view === scheduleView));
  const grid = document.getElementById('scheduleGrid');
  let period;
  if (scheduleView === 'day') {
    period = formatDate(scheduleDate, { weekday: 'long', month: 'long', day: 'numeric' });
    grid.className = '';
    grid.innerHTML = '';
  } else if (scheduleView === 'week') {
    const start = weekStartOf(scheduleDate);
    period = `${shortDate(start)} to ${shortDate(addDays(start, 6))}`;
    grid.className = 'week-grid';
    grid.innerHTML = Array.from({ length: 7 }, (_, i) => weekCardHTML(dayInfo(addDays(start, i)))).join('');
  } else {
    period = formatDate(scheduleDate, { month: 'long', year: 'numeric' });
    grid.className = 'month-grid';
    grid.innerHTML = monthHTML();
  }
  setText('schedulePeriod', period);
  document.getElementById('scheduleTodayBtn').style.visibility = scheduleDate === today() ? 'hidden' : 'visible';

  // Keep a half typed entry (and focus) if a sync re-renders the detail
  const ids = ['schedTitle', 'schedTime', 'schedType'];
  const draft = document.getElementById('schedTitle') ? ids.map((id) => document.getElementById(id).value) : null;
  const focused = document.activeElement && ids.includes(document.activeElement.id) ? document.activeElement.id : null;
  document.getElementById('scheduleDetail').innerHTML = dayDetailHTML(dayInfo(scheduleDate));
  if (draft && draft[0]) ids.forEach((id, i) => (document.getElementById(id).value = draft[i]));
  if (focused) document.getElementById(focused).focus();

  document.getElementById('dietCycle').innerHTML = DIET.map((name, i) => `<div class="card">
      <span class="pill">Day ${i + 1}</span><h3>${DIET_ICONS[i]} ${name}</h3><p class="muted">${DIET_NOTES[i]}</p>
    </div>`).join('');
}

function dayClasses(info) {
  return [info.when, info.date === scheduleDate ? 'selected' : ''].join(' ');
}

function weekCardHTML(info) {
  const [, m, d] = info.date.split('-').map(Number);
  const tasksDone = info.tasks.filter((t) => t.done).length, eventsDone = info.events.filter((e) => e.done).length;
  const badges = [
    info.tasks.length ? `<span>🧹 ${tasksDone}/${info.tasks.length}</span>` : '',
    info.events.length ? `<span>📌 ${eventsDone}/${info.events.length}</span>` : '',
    info.workHours ? `<span>💼 ${+info.workHours.toFixed(1)}h</span>` : '',
  ].join('');
  const food = info.when === 'future' ? '' : info.foods.length
    ? `<small class="sd-food ${info.complete ? 'ok' : ''}">${info.complete ? '✓ ' : ''}${Math.round(info.food.cal).toLocaleString()} kcal</small>`
    : '<small class="sd-food muted">No food logged</small>';
  return `<button type="button" class="sched-day ${dayClasses(info)}" onclick="selectScheduleDay('${info.date}')">
      <strong>${WEEKDAY_SHORT[weekdayIndex(info.date)]}</strong><small>${d}/${m}</small>
      <span class="sd-icons"><span title="${DIET[info.diet]}">${DIET_ICONS[info.diet]}</span><span title="${info.workout ? info.workout[1] : 'Walk day'}">${info.workout ? '🏋️' : '👟'}${info.workoutDone ? '<i class="tick">✓</i>' : ''}</span></span>
      <small class="sd-label">${info.workout ? escapeHTML(info.workout[1]) : 'Walk'}</small>
      <span class="sd-badges">${badges}</span>
      ${food}
    </button>`;
}

function monthHTML() {
  const [y, m] = scheduleDate.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const start = weekStartOf(first);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((weekdayIndex(first) + daysInMonth) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const info = dayInfo(addDays(start, i));
    const inMonth = info.date.slice(0, 7) === first.slice(0, 7);
    const icons = [
      info.workout ? (info.workoutDone ? '<b class="tick">🏋️</b>' : '🏋️') : '',
      info.tasks.length ? '🧹' : '', info.events.length ? '📌' : '', info.workHours ? '💼' : '',
    ].join('');
    const done = info.when !== 'future' && info.complete;
    return `<button type="button" class="month-day ${dayClasses(info)} ${inMonth ? '' : 'other-month'}" onclick="selectScheduleDay('${info.date}')" aria-label="${formatDate(info.date, { weekday: 'long', month: 'long', day: 'numeric' })}">
        <span class="md-num">${Number(info.date.slice(8))}${done ? '<i class="tick">✓</i>' : ''}</span>
        <span class="md-diet">${DIET_ICONS[info.diet]}</span>
        <span class="md-icons">${icons}</span>
      </button>`;
  }).join('');
  return WEEKDAY_SHORT.map((d) => `<div class="month-head">${d}</div>`).join('') + cells;
}

// ---------- day detail ----------
function dayDetailHTML(info) {
  const when = info.when === 'today' ? 'TODAY' : info.when === 'past' ? 'PAST DAY' : 'UPCOMING';
  const sections = [];

  // Training
  const canTick = info.when !== 'future';
  const tick = canTick ? `<label class="check-line"><input type="checkbox" ${info.workoutDone ? 'checked' : ''} onchange="toggleWorkoutDone('${info.date}',this.checked)"> ${info.workout ? 'Workout' : 'Walk'} done</label>` : '';
  sections.push(info.workout
    ? `<div class="detail-block"><h4>🏋️ Gym · ${escapeHTML(info.workout[1])}</h4>
        <details class="mini"><summary>${info.workout[2].length} exercises</summary>
          <ul>${info.workout[2].map(([ex, sets]) => `<li>${escapeHTML(ex)} <small>${sets}</small></li>`).join('')}</ul></details>${tick}</div>`
    : `<div class="detail-block"><h4>👟 Walk day</h4><p class="muted">Goal ${state.targets.steps.toLocaleString()} steps${canTick ? ` · logged ${info.steps.toLocaleString()}` : ''}</p>${tick}</div>`);

  // Food
  sections.push(info.when === 'future'
    ? `<div class="detail-block"><h4>${DIET_ICONS[info.diet]} ${DIET[info.diet]}</h4><p class="muted"><b>Good choices:</b> ${DIET_TIPS[info.diet].good}</p></div>`
    : `<div class="detail-block"><h4>${DIET_ICONS[info.diet]} Food · ${DIET[info.diet]}</h4>
        <p>${Math.round(info.food.cal).toLocaleString()} / ${state.calorieTarget.toLocaleString()} kcal · ${Math.round(info.food.p)}g protein · ${Math.round(info.water * 1000)} ml water</p>
        <p class="muted">${info.foods.length} item${info.foods.length === 1 ? '' : 's'} logged · ${info.complete ? '✓ Day complete' : 'Not marked complete'}</p>
        <a class="link" onclick="setNutritionDate('${info.date}');go('nutrition')">Open in Nutrition →</a></div>`);

  // Home tasks
  sections.push(`<div class="detail-block"><h4>🧹 Home tasks</h4>${info.tasks.length
    ? `<div class="check-list">${info.tasks.map((t) => `<label class="check-line ${t.done ? 'done' : ''}">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleChore(${Number(t.id)},this.checked)">
        <span>${escapeHTML(t.title)} <small>${escapeHTML(t.category)}${t.due && t.due < info.date && !t.done ? ' · overdue since ' + shortDate(t.due) : ''}</small></span></label>`).join('')}</div>`
    : '<p class="muted">Nothing due.</p>'}</div>`);

  // Plans
  sections.push(`<div class="detail-block"><h4>📌 Plans</h4>${info.events.length
    ? `<div class="check-list">${info.events.map((e) => `<div class="check-line ${e.done ? 'done' : ''}">
        <input type="checkbox" ${e.done ? 'checked' : ''} data-id="${escapeHTML(e.id)}" onchange="toggleEvent(this.dataset.id,this.checked)" aria-label="Done">
        <span>${e.time ? `<b>${escapeHTML(e.time)}</b> ` : ''}${escapeHTML(e.title)}</span>
        <button type="button" class="x" data-id="${escapeHTML(e.id)}" onclick="deleteEvent(this.dataset.id)" aria-label="Delete plan">✕</button></div>`).join('')}</div>`
    : '<p class="muted">Nothing planned.</p>'}</div>`);

  // Work, money, body (only when there is something)
  if (info.work.length) sections.push(`<div class="detail-block"><h4>💼 Work · ${+info.workHours.toFixed(2)}h</h4>
      <ul class="plain">${info.work.map((w) => `<li><b>${escapeHTML(w.job)}</b> ${w.hours}h${w.description ? ' · ' + escapeHTML(w.description) : ''}</li>`).join('')}</ul></div>`);
  if (info.money.length) sections.push(`<div class="detail-block"><h4>💳 Money</h4>
      <ul class="plain">${info.money.map((x) => `<li>${escapeHTML(x.note)} <b style="color:${x.type === 'income' ? '#22875f' : '#a45b4a'}">${x.type === 'income' ? '+' : '−'}${money(x.amount)}</b></li>`).join('')}</ul></div>`);
  if (info.weight) sections.push(`<div class="detail-block"><h4>⚖️ Weigh in</h4><p>${info.weight.value.toFixed(1)} kg</p></div>`);

  return `<div class="card day-detail">
      <div class="day-detail-head">
        <div><div class="eyebrow">${when}</div><h2>${formatDate(info.date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2></div>
        <span class="pill">${DIET_ICONS[info.diet]} ${DIET[info.diet]}</span>
      </div>
      <div class="detail-grid">${sections.join('')}</div>
      <form class="module-form detail-add" onsubmit="addScheduleItem(event)">
        <input class="field" id="schedTitle" placeholder="Add something to this day, e.g. Dentist, call mom" required autocomplete="off">
        <input class="field" id="schedTime" type="time" aria-label="Time (optional)">
        <select class="field" id="schedType" aria-label="Type"><option value="event">📌 Plan</option><option value="task">🧹 Home task</option></select>
        <button class="btn" type="submit">+ Add</button>
      </form>
    </div>`;
}

// ---------- actions ----------
function addScheduleItem(e) {
  e.preventDefault();
  const title = val('schedTitle').trim();
  if (!title) return;
  if (val('schedType') === 'task') {
    state.homeTasks.push({ id: Date.now(), title, category: 'Other', due: scheduleDate, done: false });
  } else {
    const ev = { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: scheduleDate, title, done: false };
    if (val('schedTime')) ev.time = val('schedTime');
    state.events.push(ev);
  }
  document.getElementById('schedTitle').value = '';
  persist();
  render();
  document.getElementById('schedTitle').focus();
}
function toggleEvent(id, done) {
  const ev = state.events.find((x) => x.id === id);
  if (ev) ev.done = done;
  persist();
  render();
}
function deleteEvent(id) {
  state.events = state.events.filter((x) => x.id !== id);
  persist();
  render();
}
function toggleWorkoutDone(date, done) {
  if (done) state.workoutsDone[date] = true; else delete state.workoutsDone[date];
  persist();
  render();
}

// ---------- training page ----------
function renderTraining() {
  document.getElementById('workoutCards').innerHTML = WORKOUTS.map(([day, title, exercises]) => `<div class="card">
      <span class="pill">${day}</span><h3>${title}</h3>
      <div class="foodlist">${exercises.map(([ex, sets, rest]) => `<div class="fooditem"><div><b>${ex}</b><br><small>Rest ${rest}</small></div><b>${sets}</b></div>`).join('')}</div>
      <p class="note">Warm up 5 to 10 minutes. Leave 2 to 3 reps in reserve on every set.</p>
    </div>`).join('');
}
