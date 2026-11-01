# Forma — project guide for Claude Code

Personal fitness, nutrition, home, work and finance dashboard for Hristijan.
Goal: 100 kg → 80 kg on a Modified UN diet (4 day rotation starting 2026-11-01: Protein, Starch, Carbohydrate, Fruit & vegetable).

## Architecture
- Dashboard: vanilla HTML/CSS/JS, no build step, hosted on GitHub Pages from the repo root.
  - `index.html` is markup only. `css/` holds base, nav, dashboard and page styles.
  - `js/` are classic scripts (not ES modules) sharing globals, loaded in order: data, state, sync, chart, dashboard, nutrition, progress, schedule, modules, settings, app. Inline `onclick` handlers rely on functions being global.
  - Constants (start/goal weight, height, age, diet start, timezone) live in `PROFILE`, `DIET_START`, `TIMEZONE` in `js/data.js`.
  - All state lives in one object `state` (`js/state.js`, see `applyDefaults`), saved to localStorage key `forma-v01`.
  - `persist()` saves locally and schedules a cloud sync. Always call it after changing `state`, then `render()`.
  - Cloud sync (`js/sync.js`, `syncNow`): pulls `/api/state`, three way merges changed keys (`merge3`) against the last synced snapshot (`forma-sync-base`), PUTs only changed keys. Polls every 20 s, on tab focus, and flushes pending changes when the tab is hidden. `connectWith(url, key)` links a device (adopts the cloud copy unless the browser has its own data, then asks; a merge uses a blank default state as base). A device link `#link=<key>[&api=<url>]` (Settings) connects a browser on open; `DEFAULT_API` in `js/data.js` prefills the Worker URL. A connected device with no snapshot re-adopts the cloud copy. The header `#syncChip` and `#syncBanner` show sync state on every page. The Nov 1 sample foods use their `seedId` as id so devices never duplicate them.
  - Food entries are addressed by `id`, never by array index (a sync can reorder lists).
  - Schedule page (`js/schedule.js`): day/week/month views built from `dayInfo(date)`, which gathers diet day, workout, home tasks (by `due`, or `doneAt` when ticked), `state.events` (plans), `state.workoutsDone`, work, money, food and weigh ins. Any new per day data should be added to `dayInfo` so it shows up there.
  - Nutrition page works on any past day: `nutritionDate` (UI only, not saved) selects the day; add, edit, delete, water and "complete" all apply to it. `state.favorites` (synced) holds quick add foods; default ones have fixed ids (`fav-*`) so devices do not duplicate them.
  - Charts are a tiny built in canvas renderer (`js/chart.js`), no external libraries. Keep it dependency free.
  - Pages: dashboard, nutrition, training, progress, schedule, chores, work, finance, settings (`PAGES` array + `go(page)` in `js/app.js`).
  - `sw.js` (network first, offline fallback) + `manifest.webmanifest` + `icons/` make it installable. When adding a CSS/JS file, add it to `SHELL` in `sw.js` and bump `CACHE`.
- `worker/` — Cloudflare Worker `forma-api` with D1 database `forma` (table `kv`).
  - `src/index.js` router, `http.js` CORS/auth, `storage.js` D1 access (`getKeys` batches reads), `diary.js` dates and day summaries, `tools.js` food/weight/work MCP tools, `life.js` MCP tools for everything else (measurements, checklist, workouts, targets, home tasks, events, side job hours, transactions, balances, groceries, favorites, overview), `mcp.js` JSON-RPC.
  - Live at https://forma-api.hristijanstanojoski.workers.dev
  - `GET/PUT /api/state` (Bearer `FORMA_KEY`) for the dashboard.
  - `POST /mcp/<FORMA_KEY>` — stateless MCP server (JSON-RPC, JSON responses) used by Claude and ChatGPT connectors. Tools: log_food, get_day, update_food, delete_food, log_water, log_weight, log_steps, complete_day, get_progress, log_workday, get_work_week, log_measurements, delete_measurements, check_habit, mark_workout_done, set_targets, add/update/delete/list_home_task(s), add/update/delete/list_event(s), log_work, delete_work, add/delete/list_transaction(s), update_balance, withdraw_upwork, delete_balance_entry, get_balances, add/update/delete/list_grocery/groceries, add_favorite, remove_favorite, get_overview.
  - Rule: anything the dashboard can record should also have an MCP tool in `worker/src/life.js` that writes the exact same record shape (numeric `Date.now()` style ids where the dashboard uses them in inline handlers). When you add a dashboard feature that stores data, add its tool too. `ACCOUNTS` starting balances are duplicated in `life.js`; keep them in sync with `js/data.js`.
  - Money: `financeEntries` are EUR. MKD is converted with the `MKD_PER_EUR` var in `wrangler.toml` (61.5) and the original amount is kept in the note. Transactions never change `balances`.
  - Work: `workEntries` items are `{id, job, date, hours, description?}`; main job workdays add `start`, `end` (HH:MM) and `kind: 'workday'` (one per date and job, logging again replaces it). `workSettings` (job, hoursPerDay, earliestStart, latestStart, weeklyTarget) defaults live in both `js/data.js` and `worker/src/diary.js`; keep them in sync.
  - Finances: `state.balances` maps each account in `ACCOUNTS` (`js/data.js`: upwork USD, bank EUR, with starting balances) to `[{id, date, balance, kind: 'start'|'update'|'withdrawal', amount?, fromUsd?}]`; the latest entry is the current balance. A withdrawal adds one entry to each account with the same id (deleting one deletes both).
  - Storage keys: one row per top level state field, plus `foods:YYYY-MM-DD` per day. Server keys must match `^[A-Za-z]+(:\d{4}-\d{2}-\d{2})?$`.
  - Food entry shape: `{id, name, qty, meal, cal, p, c, fat, estimated?, source?}`.
  - Dates use Europe/Skopje local time.

## Rules
- Never commit `FORMA_KEY`, `.dev.vars`, `node_modules` or `.wrangler`.
- Keep the state shape backward compatible: new fields get defaults in `applyDefaults`, old browser data must keep working.
- If you add a new top level state key, it syncs automatically (name must be letters only).
- If you change MCP tool schemas, keep the dashboard field names (`cal`, `p`, `c`, `fat`, `qty`, `meal`) unchanged.
- Test UI changes at desktop width and at 390 px phone width.
- Copy tone: friendly, conversational. Avoid dashes in UI sentences.

## Commands
```bash
# Worker (from worker/)
npm install
npx wrangler dev                 # local API on :8787 (needs .dev.vars with FORMA_KEY=testkey,
                                 # or pass --var FORMA_KEY:testkey)
npx wrangler d1 execute forma --local --file=schema.sql
npx wrangler deploy              # deploy to Cloudflare

# Dashboard: open index.html, or serve the repo root
python -m http.server 8000
```
Deploying the dashboard = commit and push to `main` on the GitHub repo (Pages serves main / root; `.nojekyll` skips Jekyll).
