// Service worker: makes Forma installable and usable offline.
// Network first (revalidated, so a new deploy shows up on the next load), cached copy when offline.
// Only same origin GETs are handled; API calls to the Worker always go straight to the network.

const CACHE = 'forma-shell-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'css/base.css', 'css/nav.css', 'css/dashboard.css', 'css/pages.css',
  'js/data.js', 'js/state.js', 'js/sync.js', 'js/chart.js', 'js/dashboard.js', 'js/nutrition.js',
  'js/progress.js', 'js/schedule.js', 'js/modules.js', 'js/work.js', 'js/settings.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
