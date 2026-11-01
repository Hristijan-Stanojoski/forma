// App shell: navigation, the main render pass and startup. Loaded last.

function buildNav() {
  const button = ([id, icon, label]) => `<button data-page="${id}" onclick="go('${id}')"><span>${icon}</span>${label}</button>`;
  document.getElementById('nav').innerHTML = PAGES.map(button).join('');
  document.getElementById('mobileNav').innerHTML = PAGES.map(button).join('');
  document.getElementById('mobileMenuPanel').innerHTML = PAGES.map(([id, icon, label]) => `<a href="#${id}" data-page="${id}">${icon} ${label}</a>`).join('');
  document.getElementById('mobileMenuPanel').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-page]');
    if (!link) return;
    e.preventDefault();
    go(link.dataset.page);
  });
}

function closeMobileMenu() {
  const el = document.getElementById('mobileMenuCheck');
  if (el) el.checked = false;
}

function go(page) {
  closeMobileMenu();
  const p = PAGES.find((x) => x[0] === page);
  if (!p) return;
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  for (const [id] of PAGES) document.getElementById(id).classList.toggle('active', id === page);
  document.querySelectorAll('[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
  setText('pageTitle', p[3]);
  setText('pageSub', p[4]);
  document.title = (page === 'dashboard' ? 'Forma' : p[2] + ' · Forma');
  window.scrollTo(0, 0);
  render();
}

function render() {
  renderDashboard();
  renderNutrition();
  renderProgress();
  renderModules();
  renderSchedule();
  fillTargets();
  fillWorkSettings();
  drawCharts();
}

// Charts size themselves to their container, so redraw on resize and page change.
function drawCharts() {
  renderMeasurements();
  renderDeficit();
  drawWeightCharts();
  drawWorkChart();
}

// ---------- startup ----------
buildNav();
renderMealIdeas();
renderTraining();
document.getElementById('workDate').value = today();
if (!cloud() && !(state.foods[NOV1_DATE] || []).length) importNov1();

// A "#link=<key>" device link connects this browser (it reads the hash before go() replaces it);
// otherwise sync if it is already connected.
connectFromLink().then((linked) => { if (!linked && cloud()) syncNow(); });
const initial = location.hash.slice(1);
go(PAGES.some((p) => p[0] === initial) ? initial : 'dashboard');
renderSyncStatus();

window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#link=')) { connectFromLink(); return; }
  const page = location.hash.slice(1);
  if (PAGES.some((p) => p[0] === page)) go(page);
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawCharts, 150); });

// Re-render when the date rolls over at midnight (Europe/Skopje) while the tab stays open.
let renderedDay = today();
setInterval(() => {
  if (today() === renderedDay) return;
  if (nutritionDate === renderedDay) nutritionDate = today(); // keep following "today"
  if (scheduleDate === renderedDay) scheduleDate = today();
  renderedDay = today();
  render();
}, 60000);

// Offline support and "Add to Home Screen" (served over https or localhost only).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
