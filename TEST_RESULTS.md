# Bicycle Tracker BD — Test Results

Run: 2026-11-19 ~17:20 Asia/Dhaka, from the project folder.

## Unit tests — 71/71 pass

```
node tests/test.js
71 passed, 0 failed.
```

Coverage: option lists (4 bike types, 6 service types, 5 common routes); i18n key parity between EN and BN; date parsing (rejects 2026-02-30, accepts leap day 2028-02-29); money/distance/duration formatting in EN and BN digits; avg speed (12.5 km / 45 min = 16.7 km/h; 0 min = null); odometer (start 100 km + rides 12.5 + 7.5 = 120 km); per-bike km; bike/ride/service validation (empty name, bad type, future date, 0 km, 501 km, 0 min, 1441 min, fractional minutes, NaN, negative cost/next-due); stats (3 rides: 37.5 km, 135 min, 32.5 km this month, longest 20 km, spend 500, avg 16.7 km/h; empty state avg null); maintenance due (100 km away not listed, 30 km due soon, 0 km overdue, no next-due not listed, 200 km away not listed); import validation (good, wrong version, wrong app, bad ride, null, empty state).

## Smoke tests — 62/62 pass

```
node tests/smoke.mjs
62 passed, 0 failed.
```

Headless Chromium (raw CDP), file:// with `?asof=2026-11-19`, at 1440px and 390px. Verified by driving the real UI: empty state; ride form blocked with no bikes (save disabled, warning shown); add bike (Phoenix, hybrid, odometer 100 km); add ride 12.5 km / 45 min (avg 16.7 km/h shown; stats: 1 ride, 12.5 km, 45m, 16.7 km/h, 12.5 km this month, longest 12.5 km; odometer 112.5 km); 0 km ride rejected with error + invalid field, count stays 1; add chain-lube service (350, next due 150 km → "due in 37.5 km" on dashboard, spend 350.00); search (dhanmondi shows, hatirjheel hides); quick-pick fills "Hatirjheel loop"; BN toggle (Bengali h1, ১ stat, ১২.৫ km) persists across reload with data intact; bad import rejected with data intact; export shows backup; good import accepted; typed-DELETE erase restores 0 rides; 390px no horizontal overflow on all 5 tabs; 0 console/page errors; 0 non-file network requests.

## Repairs during testing

1. Smoke: 0 km ride was silently swallowed — native HTML5 `min` validation blocked submit before the app's own validation ran. Fixed by adding `novalidate` to all three forms so app validation is the single source of truth. Re-ran: 62/62.
2. Sed mangled two `&mdash;` placeholder lines in index.html during the ASCII sweep; fixed by hand and re-verified (unit + smoke re-run green, zero raw non-ASCII in all sources).

## Source hygiene

All sources pure ASCII: Bengali lives only as `\uXXXX` escapes in `js/*.js` (via `tools/escape_ascii.py`); verified with `grep -rP '[^\x00-\x7F]'` over `*.js`, `*.mjs`, `*.html`, `*.css` — no matches.
