// App shell: navigation, the main render pass and startup. Loaded last.

let workMenuOpen = false; // sidebar Work dropdown

function buildNav() {
  const button = ([id, icon, label]) => `<button data-page="${id}" onclick="go('${id}')"><span>${icon}</span>${label}</button>`;
  const sub = (p) => `<button data-project="${p.key}" onclick="go('work/${p.key}')">${p.icon} ${escapeHTML(p.name)}</button>`;
  document.getElementById('nav').innerHTML = PAGES.map((p) => p[0] !== 'work' ? button(p)
    : `<button data-page="work" class="has-sub" onclick="toggleWorkMenu()" aria-expanded="false"><span>${p[1]}</span>${p[2]}<i class="caret">▾</i></button>
       <div class="subnav" id="workSubnav">${PROJECTS.map(sub).join('')}</div>`).join('');
  document.getElementById('mobileNav').innerHTML = PAGES.map(button).join('');
  document.getElementById('mobileMenuPanel').innerHTML = PAGES.map(([id, icon, label]) => id !== 'work'
    ? `<a href="#${id}" data-page="${id}">${icon} ${label}</a>`
    : `<div class="menu-group">${icon} ${label}</div>${PROJECTS.map((p) => `<a href="#work/${p.key}" data-page="work/${p.key}" data-project="${p.key}">${p.icon} ${escapeHTML(p.name)}</a>`).join('')}`).join('');
  document.getElementById('mobileMenuPanel').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-page]');
    if (!link) return;
    e.preventDefault();
    go(link.dataset.page);
  });
}

function toggleWorkMenu(open = !workMenuOpen) {
  workMenuOpen = open;
  document.getElementById('workSubnav').classList.toggle('open', open);
  document.querySelector('.nav .has-sub').setAttribute('aria-expanded', open);
}

function closeMobileMenu() {
  const el = document.getElementById('mobileMenuCheck');
  if (el) el.checked = false;
}

// go('nutrition'), or go('work/feedora') for a work project.
function go(target) {
  closeMobileMenu();
  const [page, project] = String(target).split('/');
  const p = PAGES.find((x) => x[0] === page);
  if (!p) return;
  if (page === 'work' && PROJECTS.some((x) => x.key === project)) workProject = project;
  const hash = page === 'work' ? 'work/' + workProject : page;
  if (location.hash !== '#' + hash) history.replaceState(null, '', '#' + hash);
  for (const [id] of PAGES) document.getElementById(id).classList.toggle('active', id === page);
  document.querySelectorAll('[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page.split('/')[0] === page && (!el.dataset.project || el.dataset.project === workProject)));
  document.querySelectorAll('.subnav [data-project]').forEach((el) => el.classList.toggle('active', page === 'work' && el.dataset.project === workProject));
  if (page === 'work') toggleWorkMenu(true);
  const proj = page === 'work' ? projectInfo(workProject) : null;
  setText('pageTitle', proj ? proj.name : p[3]);
  setText('pageSub', proj ? (proj.key === 'confect' ? 'Your job: workdays, tasks and weekly hours.' : 'Personal project: tasks, progress and hours.') : p[4]);
  document.title = (page === 'dashboard' ? 'Forma' : (proj ? proj.name : p[2]) + ' · Forma');
  window.scrollTo(0, 0);
  render();
}
const validRoute = (hash) => PAGES.some((p) => p[0] === hash.split('/')[0]);

function render() {
  renderDashboard();
  renderNutrition();
  renderProgress();
  renderModules();
  renderWork();
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
if (!cloud() && !(state.foods[NOV1_DATE] || []).length) importNov1();

// A "#link=<key>" device link connects this browser (it reads the hash before go() replaces it);
// otherwise sync if it is already connected.
connectFromLink().then((linked) => { if (!linked && cloud()) syncNow(); });
const initial = location.hash.slice(1);
go(validRoute(initial) ? initial : 'dashboard');
renderSyncStatus();

window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#link=')) { connectFromLink(); return; }
  const page = location.hash.slice(1);
  if (validRoute(page)) go(page);
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
