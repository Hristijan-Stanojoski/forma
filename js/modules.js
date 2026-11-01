// Home tasks, work hours and finances (transactions + grocery list).

const moduleStat = (label, value) => `<div class="module-stat"><small>${label}</small><strong>${value}</strong></div>`;
const money = (n) => '€' + n.toFixed(2);
const val = (id) => document.getElementById(id).value;

// ---------- home tasks ----------
function addChore(e) {
  e.preventDefault();
  const title = val('choreTitle').trim();
  if (!title) return;
  state.homeTasks.push({ id: Date.now(), title, category: val('choreCategory'), due: val('choreDue'), done: false });
  persist();
  e.target.reset();
  render();
}
function toggleChore(id, done) {
  const t = state.homeTasks.find((x) => x.id === id);
  if (t) {
    t.done = done;
    if (done) t.doneAt = today(); else delete t.doneAt; // lets the schedule show what was done on which day
  }
  persist();
  render();
}
function deleteChore(id) {
  state.homeTasks = state.homeTasks.filter((x) => x.id !== id);
  persist();
  render();
}

// ---------- work ----------
function addWork(e) {
  e.preventDefault();
  const job = val('workJob').trim(), hours = Number(val('workHours'));
  if (!job || !Number.isFinite(hours) || hours <= 0 || hours > 24) return;
  state.workEntries.push({ id: Date.now(), job, date: val('workDate'), hours, description: val('workDescription').trim() });
  persist();
  e.target.reset();
  document.getElementById('workDate').value = today();
  render();
}
function deleteWork(id) {
  state.workEntries = state.workEntries.filter((x) => x.id !== id);
  persist();
  render();
}

// ---------- main job workdays ----------
const fmtHours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`; };
const workdayOn = (date) => state.workEntries.find((w) => w.kind === 'workday' && w.date === date && w.job === state.workSettings.job);
function workWeekTotals(weekStart) {
  const end = addDays(weekStart, 6), job = state.workSettings.job;
  const entries = state.workEntries.filter((w) => w.date >= weekStart && w.date <= end);
  return {
    main: entries.filter((w) => w.job === job).reduce((a, w) => a + Number(w.hours || 0), 0),
    all: entries.reduce((a, w) => a + Number(w.hours || 0), 0),
    days: new Set(entries.filter((w) => w.kind === 'workday').map((w) => w.date)).size,
  };
}

// Save (or replace) the main job workday for a date. Returns an error message or null.
function saveWorkday(date, startText, endText, note) {
  const start = parseTime(startText), end = parseTime(endText);
  if (!date || !Number.isFinite(start) || !Number.isFinite(end)) return 'Enter a start and finish time.';
  if (end <= start) return 'The finish time must be after the start time.';
  const job = state.workSettings.job;
  const entry = { id: Date.now(), job, date, start: fmtTime(start), end: fmtTime(end), hours: Math.round((end - start) / 60 * 100) / 100, kind: 'workday' };
  if (note) entry.description = note;
  state.workEntries = state.workEntries.filter((w) => !(w.kind === 'workday' && w.date === date && w.job === job));
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

function drawWorkChart() {
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStartOf(today()), -7 * (7 - i)));
  const totals = weeks.map(workWeekTotals), r1 = (x) => Math.round(x * 10) / 10;
  const datasets = [{ label: state.workSettings.job + ' (h)', data: totals.map((t) => r1(t.main)), borderColor: '#21855c' }];
  // Only show "all jobs" when other work exists, otherwise it just hides the main line
  if (totals.some((t) => t.all > t.main)) datasets.push({ label: 'All jobs (h)', data: totals.map((t) => r1(t.all)), borderColor: '#e6a04d' });
  datasets.push({ label: 'Target', data: weeks.map(() => state.workSettings.weeklyTarget), borderColor: '#b6c9bd', borderDash: [5, 5], pointRadius: 0 });
  chart('workWeeksChart', 'line', weeks.map((w) => formatDate(w, { month: 'short', day: 'numeric' })), datasets);
}

// ---------- finance ----------
function addTransaction(e) {
  e.preventDefault();
  const amount = Number(val('transactionAmount'));
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.financeEntries.push({ id: Date.now(), date: today(), type: val('transactionType'), amount, category: val('transactionCategory'), note: val('transactionNote').trim() });
  persist();
  e.target.reset();
  render();
}
function deleteTransaction(id) {
  state.financeEntries = state.financeEntries.filter((x) => x.id !== id);
  persist();
  render();
}
// ---------- balances (Upwork in USD, bank in EUR) ----------
const accountInfo = (key) => ACCOUNTS.find((a) => a[0] === key);
const fmtMoney = (n, currency) => n.toLocaleString('en-US', { style: 'currency', currency });
// Oldest first; on the same day the starting balance comes before later updates.
const balanceOrder = (a, b) => a.date.localeCompare(b.date) || (b.kind === 'start') - (a.kind === 'start') || String(a.id).localeCompare(String(b.id));
const sortedBalances = (key) => state.balances[key].slice().sort(balanceOrder);
const latestBalance = (key) => sortedBalances(key).slice(-1)[0];
const balanceId = () => 'b' + Date.now().toString(36);

function balanceLabel(b) {
  const [, name, currency] = accountInfo(b.account);
  if (b.kind === 'withdrawal') {
    return b.account === 'upwork'
      ? `Withdrew ${fmtMoney(b.amount, currency)} from ${name}, now <b>${fmtMoney(b.balance, currency)}</b>`
      : `Received ${fmtMoney(b.amount, currency)} in your ${name.toLowerCase()}, now <b>${fmtMoney(b.balance, currency)}</b>`;
  }
  return `${name} ${b.kind === 'start' ? 'starting balance' : 'updated to'} <b>${fmtMoney(b.balance, currency)}</b>`;
}

function updateBalance(e, key) {
  e.preventDefault();
  const input = e.target.querySelector('input'), n = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(n) || n < 0) { alert('Enter the balance as a number.'); return; }
  state.balances[key].push({ id: balanceId(), date: today(), balance: Math.round(n * 100) / 100, kind: 'update' });
  persist();
  render();
}

// Moving money: the USD leaves Upwork and whatever actually arrived (after fees and the rate) lands in the bank.
function withdrawUpwork(e) {
  e.preventDefault();
  const usd = Number(val('withdrawUsd')), eur = Number(val('withdrawEur'));
  if (!(usd > 0) || !(eur > 0)) { alert('Enter both the USD you withdrew and the EUR that arrived.'); return; }
  const up = latestBalance('upwork').balance, bank = latestBalance('bank').balance;
  if (usd > up + 0.005 && !confirm(`That is more than your Upwork balance of ${fmtMoney(up, 'USD')}. Save it anyway?`)) return;
  const id = balanceId(), date = today(), r2 = (n) => Math.round(n * 100) / 100;
  state.balances.upwork.push({ id, date, balance: r2(Math.max(0, up - usd)), kind: 'withdrawal', amount: usd });
  state.balances.bank.push({ id, date, balance: r2(bank + eur), kind: 'withdrawal', amount: eur, fromUsd: usd });
  persist();
  e.target.reset();
  render();
}

// Deleting one half of a withdrawal removes both halves (they share an id).
function deleteBalance(key, id) {
  const entry = state.balances[key].find((b) => b.id === id);
  if (!entry || !confirm(entry.kind === 'withdrawal' ? 'Delete this withdrawal from both Upwork and your bank account?' : 'Delete this balance update?')) return;
  for (const k of entry.kind === 'withdrawal' ? ['upwork', 'bank'] : [key]) state.balances[k] = state.balances[k].filter((b) => b.id !== id);
  persist();
  render();
}

function renderBalances() {
  document.getElementById('balanceCards').innerHTML = ACCOUNTS.map(([key, name, currency, icon, cadence]) => {
    const rows = sortedBalances(key), last = rows[rows.length - 1], prev = rows[rows.length - 2];
    const age = Math.round((new Date(today()) - new Date(last.date)) / 864e5);
    const diff = prev ? last.balance - prev.balance : null;
    const due = key === 'upwork' && age >= UPWORK_UPDATE_DAYS;
    const status = due ? `<span class="pill warn">Weekly update due</span>` : `<span class="pill">${cadence}</span>`;
    return `<div class="card balance-card">
      <div class="balance-top"><span class="balance-name">${icon} ${name} <small>${currency}</small></span>${status}</div>
      <strong class="balance-amount">${fmtMoney(last.balance, currency)}</strong>
      <small class="muted">Updated ${age === 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago'} (${formatDate(last.date, { month: 'short', day: 'numeric' })})${diff !== null && Math.abs(diff) >= 0.005 ? ` · <span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(diff), currency)}</span>` : ''}</small>
      <form class="balance-form" onsubmit="updateBalance(event,'${key}')">
        <input class="field" type="number" min="0" step="0.01" inputmode="decimal" placeholder="New balance (${currency})" aria-label="New ${name} balance">
        <button class="btn secondary" type="submit">Update</button>
      </form>
    </div>`;
  }).join('');

  const history = ACCOUNTS.flatMap(([key]) => state.balances[key].map((b) => ({ ...b, account: key })))
    .filter((b) => !(b.kind === 'withdrawal' && b.account === 'upwork')) // a withdrawal shows once, from the bank side
    .sort((a, b) => balanceOrder(b, a));
  document.getElementById('balanceHistory').innerHTML = history.slice(0, 12).map((b) => `<div class="module-item">
      <div class="module-copy">${b.kind === 'withdrawal'
        ? `<b>⇄ Upwork to bank</b><small>${fmtMoney(b.fromUsd, 'USD')} out, ${fmtMoney(b.amount, 'EUR')} in (${(b.amount / b.fromUsd).toFixed(4)} EUR per USD) · ${formatDate(b.date)}</small>`
        : `<b>${balanceLabel(b)}</b><small>${formatDate(b.date)}</small>`}</div>
      ${b.kind === 'start' ? '' : `<button onclick="deleteBalance('${b.account}','${escapeHTML(String(b.id))}')" aria-label="Delete">✕</button>`}</div>`).join('');
}

function addGrocery(e) {
  e.preventDefault();
  const name = val('groceryName').trim(), price = Number(val('groceryPrice') || 0);
  if (!name || !Number.isFinite(price) || price < 0) return;
  state.groceryItems.push({ id: Date.now(), name, qty: val('groceryQty').trim(), price, done: false });
  persist();
  e.target.reset();
  render();
}
function toggleGrocery(id, done) {
  const t = state.groceryItems.find((x) => x.id === id);
  if (t) t.done = done;
  persist();
  render();
}
function deleteGrocery(id) {
  state.groceryItems = state.groceryItems.filter((x) => x.id !== id);
  persist();
  render();
}

function renderModules() {
  const esc = escapeHTML;

  const pending = state.homeTasks.filter((t) => !t.done).length;
  document.getElementById('choreStats').innerHTML = moduleStat('To do', pending) + moduleStat('Completed', state.homeTasks.length - pending) + moduleStat('Total tasks', state.homeTasks.length);
  setText('choreCount', pending + ' pending');
  document.getElementById('choreList').innerHTML = state.homeTasks.length
    ? state.homeTasks.slice().sort((a, b) => Number(a.done) - Number(b.done)).map((t) => `<div class="module-item ${t.done ? 'done' : ''}">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleChore(${Number(t.id)},this.checked)" aria-label="Complete task">
        <div class="module-copy"><b>${esc(t.title)}</b><small>${esc(t.category)}${t.due ? ' · Due ' + esc(t.due) : ''}</small></div>
        <button onclick="deleteChore(${Number(t.id)})" aria-label="Delete task">✕</button></div>`).join('')
    : '<p class="muted">No home tasks yet. Add cleaning, laundry or shopping above.</p>';

  const ws = state.workSettings, week = workWeekTotals(weekStartOf(today()));
  const left = ws.weeklyTarget - week.main;
  document.getElementById('workStats').innerHTML =
    moduleStat(esc(ws.job) + ' this week', `${fmtHours(week.main)} <small class="muted" style="font-size:13px">/ ${ws.weeklyTarget}h</small>`)
    + moduleStat(left >= 0 ? 'Left to reach ' + ws.weeklyTarget + 'h' : 'Overtime this week', fmtHours(Math.abs(left)))
    + moduleStat('All jobs this week', fmtHours(week.all));
  setText('workdayRule', `Start ${ws.earliestStart} to ${ws.latestStart} · ${ws.hoursPerDay}h days`);
  setText('workWeekPill', `This week ${fmtHours(week.main)} of ${ws.weeklyTarget}h`);
  const wdDate = document.getElementById('wdDate');
  if (!wdDate.value) wdDate.value = today();
  wdDate.max = today();
  document.getElementById('workList').innerHTML = state.workEntries.length
    ? state.workEntries.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || '')).map((t) => `<div class="module-item">
        <div class="module-copy"><b>${esc(t.job)} · ${fmtHours(Number(t.hours || 0))}${t.start ? ` <span class="muted" style="font-weight:600">${esc(t.start)} to ${esc(t.end)}</span>` : ''}${t.source === 'ai' ? ' <span class="pill">AI</span>' : ''}</b>
          <small>${formatDate(t.date, { weekday: 'short', month: 'short', day: 'numeric' })}${t.description ? ' · ' + esc(t.description) : ''}</small></div>
        <button onclick="deleteWork(${Number(t.id)})" aria-label="Delete work entry">✕</button></div>`).join('')
    : '<p class="muted">No work logged yet.</p>';

  renderBalances();
  const month = today().slice(0, 7), monthEntries = state.financeEntries.filter((x) => x.date.startsWith(month));
  const income = monthEntries.filter((x) => x.type === 'income').reduce((a, x) => a + x.amount, 0);
  const expenses = monthEntries.filter((x) => x.type === 'expense').reduce((a, x) => a + x.amount, 0);
  document.getElementById('financeStats').innerHTML = moduleStat('Income this month', money(income)) + moduleStat('Spent this month', money(expenses)) + moduleStat('Net cash flow', money(income - expenses));
  const byCat = {};
  monthEntries.filter((x) => x.type === 'expense').forEach((x) => (byCat[x.category] = (byCat[x.category] || 0) + x.amount));
  document.getElementById('expenseBreakdown').innerHTML = Object.keys(byCat).length
    ? Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, n]) => `<div class="expense-row">
        <div class="expense-meta"><b>${esc(cat)}</b><span>${money(n)}</span></div>
        <div class="expense-track"><i style="width:${expenses ? n / expenses * 100 : 0}%"></i></div></div>`).join('')
    : '<p class="muted">No expenses logged this month.</p>';
  document.getElementById('transactionList').innerHTML = state.financeEntries.length
    ? state.financeEntries.slice().reverse().map((t) => `<div class="module-item">
        <div class="module-copy"><b>${esc(t.note)}</b><small>${esc(t.date)} · ${esc(t.category)}</small></div>
        <b style="color:${t.type === 'income' ? '#22875f' : '#a45b4a'}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</b>
        <button onclick="deleteTransaction(${Number(t.id)})" aria-label="Delete transaction">✕</button></div>`).join('')
    : '<p class="muted">No transactions logged yet.</p>';

  document.getElementById('groceryList').innerHTML = state.groceryItems.length
    ? state.groceryItems.map((t) => `<div class="module-item ${t.done ? 'done' : ''}">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleGrocery(${Number(t.id)},this.checked)" aria-label="Purchased">
        <div class="module-copy"><b>${esc(t.name)}</b><small>${esc(t.qty || 'Quantity not set')} · ${money(t.price)} estimated</small></div>
        <button onclick="deleteGrocery(${Number(t.id)})" aria-label="Remove grocery">✕</button></div>`).join('')
    : '<p class="muted">Your grocery list is empty. Add foods for your next meal prep.</p>';
  setText('groceryTotal', 'Estimated grocery list total: ' + money(state.groceryItems.reduce((a, x) => a + x.price, 0)));
}
