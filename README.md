# Forma

Personal fitness, nutrition, home, work and finance dashboard.
The site runs on **GitHub Pages**, data lives in a **Cloudflare Worker + D1** database,
and Claude or ChatGPT can log meals through the built in **MCP connector**.

```
index.html             dashboard markup (GitHub Pages serves the repo root, no build step)
css/                   base, nav, dashboard and page styles
js/                    plain scripts, loaded in order by index.html
  data.js              static content: pages, goal, diet cycle, workouts, quick foods
  state.js             state object, localStorage, persist(), shared helpers
  sync.js              cloud sync with the Worker (three way merge)
  chart.js             tiny canvas chart renderer
  dashboard.js, nutrition.js, progress.js, schedule.js, modules.js, settings.js
  app.js               navigation, render(), startup (loaded last)
sw.js                  service worker: offline support and home screen install
manifest.webmanifest   app name, colours and icons (icons/)
worker/                Cloudflare Worker: /api/state for the dashboard, /mcp/<key> for AI
  src/index.js         router;  http.js, storage.js, diary.js, tools.js, mcp.js
  schema.sql           database table
```

On your phone, open the site and use **Add to Home Screen** to get Forma as an app.
It keeps working offline and syncs when you are back online.

## Deploy the Worker (once)

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create forma          # copy the database_id into wrangler.toml
npx wrangler d1 execute forma --remote --file=schema.sql
npx wrangler secret put FORMA_KEY     # paste a long random key, e.g. from: openssl rand -hex 24
npx wrangler deploy                   # prints https://forma-api.<you>.workers.dev
```

## Publish the dashboard

Push this repo to GitHub, then Settings → Pages → Deploy from branch → `main` / root.
Every push to `main` redeploys in about a minute. The service worker always checks the
network first, so a normal reload picks up the new version.

## Connect

1. Open the dashboard → **Settings → Cloud sync & AI logging**, enter the Worker URL and your key.
   The first device uploads its existing browser data. Other devices choose "use cloud data".
2. Copy the **AI connector URL** shown there (`https://…workers.dev/mcp/<key>`).
3. Claude: Settings → Connectors → Add custom connector → paste the URL.
   ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode → Create → paste the URL (no authentication).
4. Say something like *"I had 3 scrambled eggs with a slice of toast for breakfast"*.
   The AI estimates calories and macros and logs them; the dashboard updates within 20 seconds.

## AI tools

| Tool | What it does |
| --- | --- |
| `log_food` | Log foods/drinks with calories, protein, carbs, fat (AI estimates them) |
| `get_day` | Entries, totals, remaining calories, water, steps for a day |
| `update_food` / `delete_food` | Fix or remove an entry |
| `log_water`, `log_weight`, `log_steps` | Daily tracking |
| `complete_day` | Mark a day fully logged (counts toward the deficit chart) |
| `get_progress` | Weight history and the last 7 days of calories |

The connector URL contains your key, so treat it like a password. To rotate it,
run `npx wrangler secret put FORMA_KEY` again and reconnect each device and AI app.

## Local development

```bash
cd worker && echo "FORMA_KEY=testkey" > .dev.vars
npx wrangler d1 execute forma --local --file=schema.sql
npx wrangler dev                       # API on http://localhost:8787
python3 -m http.server 8000            # from the repo root, then open localhost:8000
```
