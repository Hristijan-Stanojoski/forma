// Work: one page per project (Confect, Feedora, travelhub.mk) with tasks, hours and history.
// Confect is the employer: its hours come from workdays (start and finish times, weekly target).
// The personal projects log plain hours, optionally linked to a task.

let workProject = PROJECTS[0].key; // project shown on the Work page (UI only, not saved)

const fmtHours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`; };
const projectInfo = (key) => PROJECTS.find((p) => p.key === key) || PROJECTS[0];
const sumHours = (list) => list.reduce((a, w) => a + Number(w.hours || 0), 0);
const plainName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Which project a work entry belongs to: its own `project`, else the job name (null for other jobs).
function projectOf(entry) {
  if (PROJECTS.some((p) => p.key === entry.project)) return entry.project;
  if (entry.job === state.workSettings.job) return 'confect';
  const name = plainName(entry.job);
  const match = PROJECTS.find((p) => plainName(p.name) === name || p.key === name);
  return match ? match.key : null;
}
const projectEntries = (key) => state.workEntries.filter((w) => projectOf(w) === key);
const projectTasks = (key) => state.workTasks.filter((t) => t.project === key);

// ---------- Confect workdays ----------
const workdayOn = (date) => state.workEntries.find((w) => w.kind === 'workday' && w.date === date && projectOf(w) === 'confect');
function workWeekTotals(weekStart, project = 'confect') {
  const end = addDays(weekStart, 6);
  const entries = state.workEntries.filter((w) => w.date >= weekStart && w.date <= end);
  return {
    main: sumHours(entries.filter((w) => projectOf(w) === project)),
    all: sumHours(entries),
    days: new Set(entries.filter((w) => w.kind === 'workday').map((w) => w.date)).size,
  };
}

// Save (or replace) the Confect workday for a date. Returns an error message or null.
function saveWorkday(date, startText, endText, note) {
  const start = parseTime(startText), end = parseTime(endText);
  if (!date || !Number.isFinite(start) || !Number.isFinite(end)) return 'Enter a start and finish time.';
  if (end <= start) return 'The finish time must be after the start time.';
  const entry = { id: Date.now(), job: state.workSettings.job, project: 'confect', date, start: fmtTime(start), end: fmtTime(end), hours: Math.round((end - start) / 60 * 100) / 100, kind: 'workday' };
  if (note) entry.description = note;
  state.workEntries = state.workEntries.filter((w) => !(w.kind === 'workday' && w.date === date && projectOf(w) === 'confect'));
  state.workEntries.push(entry);
  persist();
  render();
  return null;
}

// Standard finish for a start time ("07:30" -> "15:30"), or '' if the start is not a time.
function standardEnd(startText) {
  const start = parseTime(startText);
  return Number.isFinite(start) ? fmtTime(Math.min(start + state.workSettings.hoursPerDay * 60, 23 * 60 + 59)) : '';
}
let wdEndAuto = true; // finish time still follows the start time (user has not typed one)
function suggestWorkdayEnd() {
  if (wdEndAuto) document.getElementById('wdEnd').value = standardEnd(val('wdStart'));
  renderWorkdayHint();
}
function renderWorkdayHint() {
  const s = state.workSettings, start = parseTime(val('wdStart')), end = parseTime(val('wdEnd'));
  if (document.activeElement && document.activeElement.id === 'wdEnd') wdEndAuto = false;
  const parts = [];
  if (Number.isFinite(start)) {
    parts.push(`Standard finish ${fmtTime(start + s.hoursPerDay * 60)}`);
    if (start < parseTime(s.earliestStart) || start > parseTime(s.latestStart)) parts.push(`⚠ outside your usual ${s.earliestStart} to ${s.latestStart} start`);
    if (Number.isFinite(end) && end > start) {
      const h = (end - start) / 60, diff = h - s.hoursPerDay;
      parts.push(`${fmtHours(h)} worked${Math.abs(diff) >= 1 / 60 ? ` (${diff > 0 ? '+' : '−'}${fmtHours(Math.abs(diff))} vs ${s.hoursPerDay}h)` : ''}`);
    }
  }
  if (workdayOn(val('wdDate'))) parts.push('replaces the workday already saved for this date');
  setText('workdayHint', parts.join(' · '));
}
function submitWorkday(e) {
  e.preventDefault();
  const err = saveWorkday(val('wdDate'), val('wdStart'), val('wdEnd'), val('wdNote').trim());
  if (err) { alert(err); return; }
  ['wdStart', 'wdEnd', 'wdNote'].forEach((id) => (document.getElementById(id).value = ''));
  wdEndAuto = true;
  renderWorkdayHint();
}

// ---------- personal project hours ----------
function addProjectHours(e) {
  e.preventDefault();
  const hours = Number(val('phHours')), date = val('phDate') || today();
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) { alert('Enter the hours you worked (up to 24).'); return; }
  const p = projectInfo(workProject);
  const entry = { id: Date.now(), job: p.name, project: p.key, date, hours };
  if (val('phTask')) entry.taskId = Number(val('phTask'));
  if (val('phNote').trim()) entry.description = val('phNote').trim();
  state.workEntries.push(entry);
  persist();
  ['phHours', 'phNote'].forEach((id) => (document.getElementById(id).value = ''));
  render();
}
function deleteWork(id) {
  if (!confirm('Delete this work entry?')) return;
  state.workEntries = state.workEntries.filter((x) => x.id !== id);
  persist();
  render();
}

// ---------- tasks ----------
const TASK_STATUS = { todo: ['○', 'To do'], doing: ['◐', 'In progress'], done: ['●', 'Done'] };
const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' };

function addWorkTask(e) {
  e.preventDefault();
  const title = val('wtTitle').trim();
  if (!title) return;
  state.workTasks.push({ id: Date.now(), project: workProject, title, status: 'todo', due: val('wtDue'), createdAt: today() });
  persist();
  e.target.reset();
  render();
}
// Click the status circle: To do → In progress → Done → To do.
function cycleWorkTask(id) {
  const t = state.workTasks.find((x) => x.id === id);
  if (!t) return;
  t.status = NEXT_STATUS[t.status] || 'todo';
  if (t.status === 'done') t.doneAt = today(); else delete t.doneAt;
  persist();
  render();
}
function deleteWorkTask(id) {
  const t = state.workTasks.find((x) => x.id === id);
  if (!t || !confirm(`Delete the task "${t.title}"?`)) return;
  state.workTasks = state.workTasks.filter((x) => x.id !== id);
  persist();
  render();
}

// ---------- rendering ----------
function taskHTML(t, hours) {
  const [icon, label] = TASK_STATUS[t.status] || TASK_STATUS.todo;
  const overdue = t.status !== 'done' && t.due && t.due < today();
  const meta = [label, t.due ? `${overdue ? '⚠ ' : ''}Due ${formatDate(t.due, { month: 'short', day: 'numeric' })}` : '', hours ? fmtHours(hours) + ' logged' : '',
    t.doneAt ? 'Done ' + formatDate(t.doneAt, { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ');
  return `<div class="module-item task ${t.status}${overdue ? ' overdue' : ''}">
      <button class="task-status" onclick="cycleWorkTask(${Number(t.id)})" title="Change status" aria-label="Change status, now ${label}">${icon}</button>
      <div class="module-copy"><b>${escapeHTML(t.title)}</b><small>${meta}</small></div>
      <button onclick="deleteWorkTask(${Number(t.id)})" aria-label="Delete task">✕</button></div>`;
}

function renderWork() {
  const p = projectInfo(workProject), isMain = p.key === 'confect', ws = state.workSettings;
  const entries = projectEntries(p.key), tasks = projectTasks(p.key);
  const now = today(), weekStart = weekStartOf(now), month = now.slice(0, 7);

  document.getElementById('projectTabs').innerHTML = PROJECTS.map((x) =>
    `<button class="${x.key === p.key ? 'active' : ''}" onclick="go('work/${x.key}')">${x.icon} ${escapeHTML(x.name)}</button>`).join('');
  setText('workEyebrow', isMain ? 'WORK · EMPLOYER' : 'WORK · PERSONAL PROJECT');
  setText('workTitle', `${p.name} ${p.icon}`);
  setText('workIntro', p.intro);
  document.getElementById('workdaySection').style.display = isMain ? '' : 'none';
  document.getElementById('projectHoursSection').style.display = isMain ? 'none' : '';

  const week = sumHours(entries.filter((w) => w.date >= weekStart && w.date <= addDays(weekStart, 6)));
  const monthHours = sumHours(entries.filter((w) => w.date.startsWith(month)));
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  document.getElementById('workStats').innerHTML =
    moduleStat('This week', isMain ? `${fmtHours(week)} <small class="muted" style="font-size:13px">/ ${ws.weeklyTarget}h</small>` : fmtHours(week))
    + moduleStat('This month', fmtHours(monthHours))
    + moduleStat('All time', fmtHours(sumHours(entries)))
    + moduleStat('Tasks done', tasks.length ? `${done}<small class="muted" style="font-size:13px"> / ${tasks.length} · ${pct}%</small>` : '<small class="muted" style="font-size:14px">No tasks yet</small>');

  if (isMain) {
    setText('workdayRule', `Start ${ws.earliestStart} to ${ws.latestStart} · ${ws.hoursPerDay}h days`);
    const wdDate = document.getElementById('wdDate');
    if (!wdDate.value) wdDate.value = now;
    wdDate.max = now;
  } else {
    setText('projectHoursTitle', `Log hours on ${p.name}`);
    const phDate = document.getElementById('phDate');
    if (!phDate.value) phDate.value = now;
    phDate.max = now;
    const select = document.getElementById('phTask'), keep = select.value;
    select.innerHTML = '<option value="">No specific task</option>' + tasks.filter((t) => t.status !== 'done')
      .map((t) => `<option value="${Number(t.id)}">${escapeHTML(t.title)}</option>`).join('');
    select.value = [...select.options].some((o) => o.value === keep) ? keep : '';
  }
  setText('workWeekPill', isMain ? `This week ${fmtHours(week)} of ${ws.weeklyTarget}h` : `This week ${fmtHours(week)}`);

  // Tasks: in progress first, then to do (by due date), finished ones folded away
  setText('taskProgressPill', tasks.length ? `${done} of ${tasks.length} done` : 'No tasks yet');
  document.getElementById('taskProgress').innerHTML = tasks.length
    ? `<div class="task-progress"><i style="width:${pct}%"></i></div><small class="muted">${pct}% complete · ${tasks.filter((t) => t.status === 'doing').length} in progress · ${tasks.filter((t) => t.status === 'todo').length} to do</small>` : '';
  const hoursByTask = {};
  for (const w of entries) if (w.taskId) hoursByTask[w.taskId] = (hoursByTask[w.taskId] || 0) + Number(w.hours || 0);
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.id - b.id;
  const open = [...tasks.filter((t) => t.status === 'doing').sort(byDue), ...tasks.filter((t) => t.status === 'todo').sort(byDue)];
  const finished = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  document.getElementById('workTaskList').innerHTML = (open.length
    ? open.map((t) => taskHTML(t, hoursByTask[t.id])).join('')
    : `<p class="muted">${tasks.length ? 'Everything is done. Nice work!' : `No tasks for ${escapeHTML(p.name)} yet. Add the first one above.`}</p>`)
    + (finished.length ? `<details class="mini"><summary>${finished.length} done</summary><div class="module-list" style="margin-top:8px">${finished.map((t) => taskHTML(t, hoursByTask[t.id])).join('')}</div></details>` : '');

  // History for this project, plus work that is not in any project (e.g. a client logged through Claude)
  const taskName = (id) => (state.workTasks.find((t) => t.id === id) || {}).title;
  const row = (w) => `<div class="module-item">
      <div class="module-copy"><b>${fmtHours(Number(w.hours || 0))}${w.start ? ` <span class="muted" style="font-weight:600">${escapeHTML(w.start)} to ${escapeHTML(w.end)}</span>` : ''}${projectOf(w) ? '' : ' · ' + escapeHTML(w.job)}${w.source === 'ai' ? ' <span class="pill">AI</span>' : ''}</b>
        <small>${formatDate(w.date, { weekday: 'short', month: 'short', day: 'numeric' })}${w.taskId && taskName(w.taskId) ? ' · ' + escapeHTML(taskName(w.taskId)) : ''}${w.description ? ' · ' + escapeHTML(w.description) : ''}</small></div>
      <button onclick="deleteWork(${Number(w.id)})" aria-label="Delete work entry">✕</button></div>`;
  const newestFirst = (a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || '') || b.id - a.id;
  const other = state.workEntries.filter((w) => !projectOf(w));
  document.getElementById('workList').innerHTML = (entries.length
    ? entries.slice().sort(newestFirst).slice(0, 40).map(row).join('')
    : `<p class="muted">No hours logged on ${escapeHTML(p.name)} yet.</p>`)
    + (other.length ? `<details class="mini" style="margin-top:6px"><summary>Other work, not in a project (${other.length})</summary><div class="module-list" style="margin-top:8px">${other.slice().sort(newestFirst).map(row).join('')}</div></details>` : '');
}

function drawWorkChart() {
  const p = projectInfo(workProject), isMain = p.key === 'confect';
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStartOf(today()), -7 * (7 - i)));
  const totals = weeks.map((w) => workWeekTotals(w, p.key)), r1 = (x) => Math.round(x * 10) / 10;
  const datasets = [{ label: p.name + ' (h)', data: totals.map((t) => r1(t.main)), borderColor: '#21855c' }];
  if (isMain) datasets.push({ label: 'Target', data: weeks.map(() => state.workSettings.weeklyTarget), borderColor: '#b6c9bd', borderDash: [5, 5], pointRadius: 0 });
  chart('workWeeksChart', 'line', weeks.map((w) => formatDate(w, { month: 'short', day: 'numeric' })), datasets);
}
