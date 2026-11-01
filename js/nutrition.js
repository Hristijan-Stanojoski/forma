// Nutrition: today's food log, quick add favorites, day completion and the Nov 1 import.

function renderNutrition() {
  const t = totals();
  setText('dietName', DIET[cycle()]);
  setText('remainingCal', Math.round(state.calorieTarget - t.cal).toLocaleString() + ' kcal remaining');
  setText('nutritionTotal', `${Math.round(t.cal)} kcal · ${t.p.toFixed(1)}g protein · ${t.c.toFixed(1)}g carbs · ${t.fat.toFixed(1)}g fat`);
  document.getElementById('dayComplete').checked = !!state.completedDays[today()];

  const nov1 = sumFoods(state.foods[NOV1_DATE]);
  setText('nov1Summary', `Nov 1: ${Math.round(nov1.cal)} kcal · ${nov1.p.toFixed(1)}g protein · ${nov1.c.toFixed(1)}g carbs · ${nov1.fat.toFixed(1)}g fat · ${Math.round((state.water[NOV1_DATE] || 0) * 1000)} ml plain water · ${Math.max(0, Math.round(state.calorieTarget - nov1.cal))} kcal remaining (target ${state.calorieTarget}).${state.completedDays[NOV1_DATE] ? '' : ' Not marked complete.'}`);

  const list = foodToday();
  document.getElementById('foodList').innerHTML = list.length
    ? list.map((f) => `<div class="fooditem">
        <div><b>${escapeHTML(f.name)}</b>${f.source === 'ai' ? ' <span class="pill">AI</span>' : ''}<br>
          <small>${f.qty ? escapeHTML(f.qty) + ' · ' : ''}${Number(f.p || 0).toFixed(1)}g protein · ${Number(f.c || 0).toFixed(1)}g carbs · ${Number(f.fat || 0).toFixed(1)}g fat${f.meal ? ' · ' + escapeHTML(f.meal) : ''}</small></div>
        <div><b>${Math.round(Number(f.cal || 0))} kcal</b> <button data-id="${escapeHTML(f.id)}" onclick="removeFood(this.dataset.id)" aria-label="Remove ${escapeHTML(f.name)}">✕</button></div>
      </div>`).join('')
    : '<p class="muted">No food logged today. Start with a quick favorite below.</p>';
}

function renderQuickFoods() {
  document.getElementById('quickFoods').innerHTML = QUICK_FOODS.map((f, i) => `<div class="card meal">
      <img src="${f.img}" alt="${escapeHTML(f.name)}" loading="lazy">
      <div class="content"><strong>${escapeHTML(f.name)}</strong><p>${f.cal} kcal · ${f.p}g protein · ${f.c}g carbs · ${f.fat}g fat</p>
        <button class="btn secondary" onclick="addFood(QUICK_FOODS[${i}])">+ Log this</button></div>
    </div>`).join('');
}

function completeDay(value) {
  state.completedDays[today()] = value;
  persist();
  render();
}

const FOOD_FIELDS = ['foodName', 'foodQty', 'foodCal', 'foodProtein', 'foodCarbs', 'foodFat'];
function addFood(preset) {
  const v = (id) => document.getElementById(id).value;
  let f;
  if (preset) {
    const { img, ...rest } = preset;
    f = rest;
  } else {
    if (!v('foodName').trim() || v('foodCal') === '') { alert('Enter a food name and calories (protein, carbs and fat are optional).'); return; }
    f = {
      name: v('foodName').trim(), qty: v('foodQty').trim(), meal: v('foodMeal'),
      cal: Number(v('foodCal')), p: Number(v('foodProtein') || 0), c: Number(v('foodCarbs') || 0), fat: Number(v('foodFat') || 0),
    };
  }
  if (![f.cal, f.p, f.c || 0, f.fat || 0].every((n) => Number.isFinite(n) && n >= 0)) { alert('Calories and macros must be zero or more.'); return; }
  if (!f.qty) delete f.qty;
  f.id = newFoodId();
  (state.foods[today()] ??= []).push(f);
  persist();
  if (!preset) FOOD_FIELDS.forEach((id) => (document.getElementById(id).value = ''));
  render();
}

// By id, not index, so a sync landing between render and click cannot remove the wrong entry.
function removeFood(id) {
  const list = state.foods[today()] || [];
  state.foods[today()] = list.filter((f) => f.id !== id);
  persist();
  render();
}

const normalizedFoodName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function importNov1(silent = false) {
  const list = (state.foods[NOV1_DATE] ??= []);
  let added = 0;
  for (const item of NOV1_ITEMS) {
    const seedId = 'nov1-' + normalizedFoodName(item.name);
    const exists = list.some((f) => f.seedId === seedId || normalizedFoodName(f.name) === normalizedFoodName(item.name));
    if (!exists) { list.push({ ...item, id: newFoodId(), seedId, estimated: true }); added++; }
  }
  // Water is cumulative and stored in litres. Never lower an existing value.
  state.water[NOV1_DATE] = Math.max(Number(state.water[NOV1_DATE] || 0), .8);
  state.completedDays[NOV1_DATE] ??= false;
  persist();
  if (!silent) alert(added ? `Imported ${added} entries for November 1. Check any entries you already had so meals are not logged twice.` : 'All November 1 items are already there. No duplicates added.');
  render();
}
