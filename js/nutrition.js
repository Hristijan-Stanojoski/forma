// Nutrition: any day's food log (date switcher), inline editing, meal groups, favorites,
// recent foods, water, day completion and diet day tips.

let nutritionDate = today();   // day shown on the Nutrition page
let editingFoodId = null;      // entry currently open for inline editing
let recentFoods = [];          // last rendered "Recent" list, so chips can refer to it by index
const openMealGroups = new Set(); // meal groups expanded in the entries list (collapsed by default)

const dayFoods = () => state.foods[nutritionDate] || [];
const isViewingToday = () => nutritionDate === today();
const normalizedFoodName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function dayLabel(date) {
  if (date === today()) return 'Today';
  if (date === addDays(today(), -1)) return 'Yesterday';
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
}
// The fields that make up a loggable food (no id, source or seed info).
function foodTemplate(f) {
  const t = { name: f.name, meal: f.meal || 'Snacks', cal: Number(f.cal || 0), p: Number(f.p || 0), c: Number(f.c || 0), fat: Number(f.fat || 0) };
  if (f.qty) t.qty = f.qty;
  return t;
}
const findFavorite = (name) => state.favorites.find((x) => normalizedFoodName(x.name) === normalizedFoodName(name));

// ---------- day switcher ----------
function setNutritionDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
  nutritionDate = date > today() ? today() : date;
  editingFoodId = null;
  renderNutrition();
}
const shiftNutritionDate = (n) => setNutritionDate(addDays(nutritionDate, n));

// ---------- render ----------
function renderNutrition() {
  const date = nutritionDate, label = dayLabel(date), viewingToday = isViewingToday();
  const dateInput = document.getElementById('nutritionDate');
  dateInput.value = date;
  dateInput.max = today();
  document.getElementById('nextDayBtn').disabled = viewingToday;
  document.getElementById('todayBtn').style.visibility = viewingToday ? 'hidden' : 'visible';

  const d = cycle(date);
  setText('dietDayLabel', `MODIFIED UN DIET · DAY ${d + 1} OF 4${viewingToday ? '' : ' · ' + label.toUpperCase()}`);
  setText('dietName', DIET_ICONS[d] + ' ' + DIET[d]);
  setText('dietNote', DIET_NOTES[d]);
  setText('dietGood', DIET_TIPS[d].good);
  setText('dietEasy', DIET_TIPS[d].easy);

  const t = sumFoods(dayFoods()), T = state.targets, water = state.water[date] || 0;
  const remaining = state.calorieTarget - t.cal;
  setText('nutriCal', Math.round(t.cal).toLocaleString());
  setText('nutriCalTarget', '/ ' + state.calorieTarget.toLocaleString() + ' kcal');
  setText('remainingCal', Math.round(remaining).toLocaleString());
  document.getElementById('remainingCal').classList.toggle('over', remaining < 0);
  setText('nutriProtein', t.p.toFixed(1) + 'g');
  setText('nutriProteinTarget', '/ ' + T.protein + 'g');
  setText('nutriCarbs', t.c.toFixed(1) + 'g');
  setText('nutriFat', t.fat.toFixed(1) + 'g');
  setText('nutriWater', Math.round(water * 1000).toLocaleString() + ' ml');
  setText('nutriWaterTarget', 'of ' + T.water + ' L');
  document.getElementById('dayComplete').checked = !!state.completedDays[date];
  setText('dayCompleteLabel', `All food and drinks logged for ${viewingToday ? 'today' : label}`);

  setText('addFoodTitle', viewingToday ? 'Log food & drinks' : `Log food & drinks for ${label}`);
  setText('quickAddTarget', 'Adds to ' + (viewingToday || label === 'Yesterday' ? label.toLowerCase() : label));
  setText('entriesTitle', viewingToday ? "Today's entries" : label === 'Yesterday' ? "Yesterday's entries" : 'Entries for ' + label);
  setText('nutritionTotal', `${Math.round(t.cal)} kcal · ${t.p.toFixed(1)}g P · ${t.c.toFixed(1)}g C · ${t.fat.toFixed(1)}g F`);

  renderQuickAdd();
  renderFoodList();
}

function renderQuickAdd() {
  const chip = (onclick, f, extra = '') => `<div class="chip">
      <button type="button" class="chip-main" onclick="${onclick}"><span>${escapeHTML(f.name)}</span><small>${Math.round(Number(f.cal || 0))} kcal</small></button>${extra}
    </div>`;
  document.getElementById('favoriteChips').innerHTML = state.favorites.length
    ? state.favorites.map((f) => chip(`logFavorite('${escapeHTML(f.id)}')`, f,
        `<button type="button" class="chip-x" data-id="${escapeHTML(f.id)}" onclick="removeFavorite(this.dataset.id)" aria-label="Remove ${escapeHTML(f.name)} from favorites">✕</button>`)).join('')
    : '<p class="muted">No favorites yet. Use ☆ on any entry to add one.</p>';

  // Recent: distinct foods from the last 14 days, newest first, skipping favorites
  const seen = new Set(state.favorites.map((f) => normalizedFoodName(f.name)));
  recentFoods = [];
  for (let i = 0; i < 14 && recentFoods.length < 10; i++) {
    const list = (state.foods[addDays(today(), -i)] || []).slice().reverse();
    for (const f of list) {
      const key = normalizedFoodName(f.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      recentFoods.push(foodTemplate(f));
      if (recentFoods.length >= 10) break;
    }
  }
  document.getElementById('recentChips').innerHTML = recentFoods.length
    ? recentFoods.map((f, i) => chip(`addFood(recentFoods[${i}])`, f)).join('')
    : '<p class="muted">Foods you log show up here so you can log them again with one tap.</p>';
}

function renderFoodList() {
  const box = document.getElementById('foodList');
  // Keep an open edit form's typed values (and focus) if a sync re-renders mid edit
  const draft = editingFoodId ? readEditForm() : null;
  const focusedId = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id : null;

  const list = dayFoods();
  if (editingFoodId && !list.some((f) => f.id === editingFoodId)) editingFoodId = null;
  const groups = groupByMeal(list);
  const editingGroup = groups.find(([, items]) => items.some((f) => f.id === editingFoodId));
  if (editingGroup) openMealGroups.add(editingGroup[0]);
  box.innerHTML = groups.length
    ? groups.map(([group, items]) => mealGroupHTML(group, items, openMealGroups, 'openMealGroups',
        items.map((f) => (f.id === editingFoodId ? editFormHTML(f) : entryHTML(f))).join(''))).join('')
    : `<div class="diary-empty">Nothing logged for ${isViewingToday() ? 'today' : dayLabel(nutritionDate)} yet. Use the form or a quick add above.</div>`;

  if (draft) fillEditForm(draft);
  if (focusedId && document.getElementById(focusedId)) document.getElementById(focusedId).focus();
}

function entryHTML(f) {
  const id = escapeHTML(f.id), fav = !!findFavorite(f.name);
  return `<div class="food-entry" data-id="${id}" onclick="startEditFood(this.dataset.id)" title="Tap to edit">
      <div class="food-entry-text">
        <span>${escapeHTML(f.name)}${f.source === 'ai' ? ' <span class="pill">AI</span>' : ''}</span>
        <small>${f.qty ? escapeHTML(f.qty) + ' · ' : ''}${Number(f.p || 0).toFixed(1)}g protein · ${Number(f.c || 0).toFixed(1)}g carbs · ${Number(f.fat || 0).toFixed(1)}g fat</small>
      </div>
      <strong>${Math.round(Number(f.cal || 0))} kcal</strong>
      <span class="food-actions">
        <button type="button" data-id="${id}" onclick="event.stopPropagation();toggleFavorite(this.dataset.id)" aria-label="${fav ? 'Remove from' : 'Save to'} favorites" title="${fav ? 'Remove from' : 'Save to'} favorites" class="${fav ? 'on' : ''}">${fav ? '★' : '☆'}</button>
        <button type="button" data-id="${id}" onclick="event.stopPropagation();removeFood(this.dataset.id)" aria-label="Delete ${escapeHTML(f.name)}" title="Delete">✕</button>
      </span>
    </div>`;
}

function editFormHTML(f) {
  const meals = MEALS.includes(f.meal) || !f.meal ? MEALS : [...MEALS, f.meal];
  const v = (x) => escapeHTML(x ?? '');
  return `<form class="food-edit" onsubmit="event.preventDefault();saveFoodEdit()">
      <div class="formrow">
        <input class="field" id="editName" value="${v(f.name)}" placeholder="Food or drink" aria-label="Name" required>
        <input class="field" id="editQty" value="${v(f.qty)}" placeholder="Portion" aria-label="Portion">
        <select class="field" id="editMeal" aria-label="Meal">${meals.map((m) => `<option ${m === (f.meal || 'Snacks') ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('')}</select>
      </div>
      <div class="formrow">
        <label>Calories<input class="field" id="editCal" type="number" min="0" inputmode="decimal" value="${v(f.cal)}" required></label>
        <label>Protein (g)<input class="field" id="editP" type="number" min="0" step="0.1" inputmode="decimal" value="${v(f.p)}"></label>
        <label>Carbs (g)<input class="field" id="editC" type="number" min="0" step="0.1" inputmode="decimal" value="${v(f.c)}"></label>
        <label>Fat (g)<input class="field" id="editFat" type="number" min="0" step="0.1" inputmode="decimal" value="${v(f.fat)}"></label>
      </div>
      <div class="food-edit-actions">
        <button class="btn" type="submit">Save</button>
        <button class="btn outline" type="button" onclick="cancelEditFood()">Cancel</button>
        <button class="btn danger" type="button" data-id="${escapeHTML(f.id)}" onclick="removeFood(this.dataset.id)">Delete</button>
      </div>
    </form>`;
}

const EDIT_FIELDS = ['editName', 'editQty', 'editMeal', 'editCal', 'editP', 'editC', 'editFat'];
function readEditForm() {
  if (!document.getElementById('editName')) return null;
  return Object.fromEntries(EDIT_FIELDS.map((id) => [id, document.getElementById(id).value]));
}
function fillEditForm(draft) {
  for (const [id, value] of Object.entries(draft)) { const el = document.getElementById(id); if (el) el.value = value; }
}

// ---------- editing ----------
function startEditFood(id) {
  editingFoodId = id;
  renderFoodList();
  const el = document.getElementById('editCal');
  if (el) el.focus();
}
function cancelEditFood() {
  editingFoodId = null;
  renderFoodList();
}
function saveFoodEdit() {
  const f = dayFoods().find((x) => x.id === editingFoodId);
  const d = readEditForm();
  if (!f || !d) return cancelEditFood();
  const nums = [d.editCal, d.editP || 0, d.editC || 0, d.editFat || 0].map(Number);
  if (!d.editName.trim() || d.editCal === '' || !nums.every((n) => Number.isFinite(n) && n >= 0)) { alert('Enter a name and calories. Numbers must be zero or more.'); return; }
  f.name = d.editName.trim();
  if (d.editQty.trim()) f.qty = d.editQty.trim(); else delete f.qty;
  f.meal = d.editMeal;
  openMealGroups.add(f.meal);
  [f.cal, f.p, f.c, f.fat] = nums;
  editingFoodId = null;
  persist();
  render();
}

// ---------- logging ----------
const FOOD_FIELDS = ['foodName', 'foodQty', 'foodCal', 'foodProtein', 'foodCarbs', 'foodFat'];
function addFood(preset) {
  const v = (id) => document.getElementById(id).value;
  let f;
  if (preset) f = foodTemplate(preset);
  else {
    if (!v('foodName').trim() || v('foodCal') === '') { alert('Enter a food name and calories (protein, carbs and fat are optional).'); return; }
    f = {
      name: v('foodName').trim(), qty: v('foodQty').trim(), meal: v('foodMeal'),
      cal: Number(v('foodCal')), p: Number(v('foodProtein') || 0), c: Number(v('foodCarbs') || 0), fat: Number(v('foodFat') || 0),
    };
  }
  if (![f.cal, f.p, f.c, f.fat].every((n) => Number.isFinite(n) && n >= 0)) { alert('Calories and macros must be zero or more.'); return; }
  if (!f.qty) delete f.qty;
  f.id = newFoodId();
  (state.foods[nutritionDate] ??= []).push(f);
  openMealGroups.add(f.meal); // show where it landed
  persist();
  if (!preset) FOOD_FIELDS.forEach((id) => (document.getElementById(id).value = ''));
  render();
}
function logFavorite(id) {
  const f = state.favorites.find((x) => x.id === id);
  if (f) addFood(f);
}

// By id, not index, so a sync landing between render and click cannot remove the wrong entry.
function removeFood(id) {
  if (editingFoodId === id) editingFoodId = null;
  state.foods[nutritionDate] = dayFoods().filter((f) => f.id !== id);
  persist();
  render();
}

// ---------- favorites ----------
function toggleFavorite(foodId) {
  const f = dayFoods().find((x) => x.id === foodId);
  if (!f) return;
  const existing = findFavorite(f.name);
  if (existing) state.favorites = state.favorites.filter((x) => x !== existing);
  else state.favorites.push({ id: 'fav-' + newFoodId(), ...foodTemplate(f) });
  persist();
  renderNutrition();
}
function removeFavorite(id) {
  state.favorites = state.favorites.filter((x) => x.id !== id);
  persist();
  renderNutrition();
}

// ---------- water and completion ----------
function changeWater(ml) {
  state.water[nutritionDate] = Math.max(0, Math.round(((state.water[nutritionDate] || 0) + ml / 1000) * 100) / 100);
  persist();
  render();
}
function completeDay(value) {
  state.completedDays[nutritionDate] = value;
  persist();
  render();
}

// ---------- first run ----------
// A brand new browser (not yet connected to the cloud) gets the verified Nov 1 log.
function importNov1() {
  const list = (state.foods[NOV1_DATE] ??= []);
  for (const item of NOV1_ITEMS) {
    const seedId = 'nov1-' + normalizedFoodName(item.name);
    if (!list.some((f) => f.seedId === seedId || normalizedFoodName(f.name) === normalizedFoodName(item.name))) {
      list.push({ ...item, id: newFoodId(), seedId, estimated: true });
    }
  }
  state.water[NOV1_DATE] = Math.max(Number(state.water[NOV1_DATE] || 0), .8);
  state.completedDays[NOV1_DATE] ??= false;
  persist();
}
