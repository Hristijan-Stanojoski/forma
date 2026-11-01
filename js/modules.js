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
  renderModules();
}
function toggleChore(id, done) {
  const t = state.homeTasks.find((x) => x.id === id);
  if (t) t.done = done;
  persist();
  renderModules();
}
function deleteChore(id) {
  state.homeTasks = state.homeTasks.filter((x) => x.id !== id);
  persist();
  renderModules();
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
  renderModules();
}
function deleteWork(id) {
  state.workEntries = state.workEntries.filter((x) => x.id !== id);
  persist();
  renderModules();
}

// ---------- finance ----------
function addTransaction(e) {
  e.preventDefault();
  const amount = Number(val('transactionAmount'));
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.financeEntries.push({ id: Date.now(), date: today(), type: val('transactionType'), amount, category: val('transactionCategory'), note: val('transactionNote').trim() });
  persist();
  e.target.reset();
  renderModules();
}
function deleteTransaction(id) {
  state.financeEntries = state.financeEntries.filter((x) => x.id !== id);
  persist();
  renderModules();
}
function addGrocery(e) {
  e.preventDefault();
  const name = val('groceryName').trim(), price = Number(val('groceryPrice') || 0);
  if (!name || !Number.isFinite(price) || price < 0) return;
  state.groceryItems.push({ id: Date.now(), name, qty: val('groceryQty').trim(), price, done: false });
  persist();
  e.target.reset();
  renderModules();
}
function toggleGrocery(id, done) {
  const t = state.groceryItems.find((x) => x.id === id);
  if (t) t.done = done;
  persist();
  renderModules();
}
function deleteGrocery(id) {
  state.groceryItems = state.groceryItems.filter((x) => x.id !== id);
  persist();
  renderModules();
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

  const weekday = (new Date(today() + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const weekStart = addDays(today(), -weekday);
  const weekly = state.workEntries.filter((x) => x.date >= weekStart), weeklyHours = weekly.reduce((a, x) => a + x.hours, 0);
  document.getElementById('workStats').innerHTML = moduleStat('Hours this week', weeklyHours.toFixed(1) + 'h') + moduleStat('Sessions this week', weekly.length) + moduleStat('Jobs tracked', new Set(state.workEntries.map((x) => x.job)).size);
  document.getElementById('workList').innerHTML = state.workEntries.length
    ? state.workEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((t) => `<div class="module-item">
        <div class="module-copy"><b>${esc(t.job)} · ${t.hours}h</b><small>${esc(t.date)}${t.description ? ' · ' + esc(t.description) : ''}</small></div>
        <button onclick="deleteWork(${Number(t.id)})" aria-label="Delete work entry">✕</button></div>`).join('')
    : '<p class="muted">No work sessions logged yet.</p>';

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
