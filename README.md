# Bicycle Tracker BD

Offline bilingual (English / বাংলা) bicycle ride & maintenance tracker for Bangladesh. Log rides, watch your kilometres add up, and get reminded when a service is due — all on your device, no account, no network.

## Problem

Cyclists in Bangladesh ride every day — to class, to work, around Dhanmondi Lake or Hatirjheel — but there is no simple offline tool in Bangla to keep a ride log and remember when the chain needs lube or the brake pads are worn. This app fills that gap: one page, your bikes, your rides, your service history.

## Features

- **Bike profiles** — name, type (Road / Mountain / Hybrid / City), brand, bought date, starting odometer.
- **Ride log** — date, distance (0.1–500 km), time, route (with 5 common-route quick picks), note. Average speed is computed from your own distance ÷ time.
- **Dashboard** — total rides, total km, total time, average speed, this month's km, longest ride, per-bike kilometres and live odometer.
- **Maintenance log** — service type (chain lube, brake pads, tyre/tube, gear tune-up, full service, other), date, cost in taka, odometer at service, optional "next due at" kilometre.
- **Due reminders** — a service is flagged "due soon" within 50 km of its next-due kilometre and "overdue" once the bike's odometer passes it. The odometer is the starting odometer plus all logged ride distances.
- **Search & filters** — search rides by route or note; filter rides and services by bike.
- **Bilingual** — full English/বাংলা toggle (persisted), Bengali digits in Bangla mode.
- **Data control** — JSON export, strict JSON import (validated, bad files rejected without touching your data), typed-DELETE erase-all.
- **Offline-first** — everything in localStorage; zero network requests.

## Stack

- Pure HTML + CSS + vanilla JavaScript (no frameworks, no build step, no dependencies).
- Node.js (tests only) and headless Chromium (smoke tests only).

## Prerequisites

- Any modern browser. Open `index.html` directly — no server needed.
- For tests: Node.js 18+.

## Install

```sh
git clone https://github.com/fahad3235/bicycle-tracker-bd.git
cd bicycle-tracker-bd
# no install step — open index.html in a browser
```

Or open the live site: https://fahad3235.github.io/bicycle-tracker-bd/

## Development

No build step. Edit `index.html`, `css/styles.css`, or `js/*.js` and reload.

Useful query parameter: `?asof=YYYY-MM-DD` overrides "today" (used by the smoke test so date checks are deterministic).

## Testing

```sh
node tests/test.js    # 71 unit tests (logic, validation, stats, import)
node tests/smoke.mjs  # 62 headless-Chrome UI tests at 1440px and 390px
```

See [TEST_RESULTS.md](TEST_RESULTS.md) for the recorded results.

## Deployment

Static site — any static host works. GitHub Pages (main branch, root) is enabled for the live demo link above.

## Limitations

- Data lives in one browser's localStorage. Clearing browser data deletes it — export a backup first.
- Average speed is distance ÷ time from your own records; the app does not estimate calories or fitness.
- Odometer and "due" reminders depend on rides being logged; unlogged rides make the odometer under-read.
- Dates use UTC calendar math, so results do not depend on the viewer's timezone.

## Status

Complete MVP. Built 2026-11-19 (MUSE Project Factory run #387). All 71 unit tests and 62 smoke tests pass; 0 console/page errors; 0 network requests.
