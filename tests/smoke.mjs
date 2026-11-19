/* Bicycle Tracker BD \u2014 headless-Chrome smoke test (raw CDP, no deps).
 * Run: node tests/smoke.mjs  (from the bicycle-tracker-bd folder)
 * Loads index.html over file:// with ?asof=2026-11-19, drives the real UI,
 * collects console/page errors, asserts visible state at 1440px and 390px.
 * All source in this file is ASCII; Bengali is detected by Unicode
 * code-point range (U+0980-U+09FF), never by literal characters. */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const SHELL = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
const BASE = 'file:///home/hatch/workspace/muse-project-factory/builds/bicycle-tracker-bd/index.html';
const PORT = 9233;

let pass = 0, fail = 0;
const errors = [];
const netReqs = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' \u2014 ' + extra : '')); }
}

const chrome = spawn(SHELL, ['--headless', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('headless_shell did not start');
}

let msgId = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
async function nav(url) {
  await send('Page.navigate', { url });
  await sleep(1200);
}
async function clickTab(name) {
  await evalJs(`document.querySelector('#tab${name}Btn').click()`);
  await sleep(300);
}
const HAS_BN = `(s) => [...String(s)].some((c) => { const n = c.codePointAt(0); return n >= 0x0980 && n <= 0x09FF; })`;
async function importJson(jsonText) {
  await evalJs(`(() => {
    const dt = new DataTransfer();
    const file = new File([\`${jsonText.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`], 'backup.json', { type: 'application/json' });
    dt.items.add(file);
    const input = document.querySelector('#importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true; })()`);
  await sleep(500);
}

try {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE.ERROR: ' + JSON.stringify(m.params.args).slice(0, 300));
    if (m.method === 'Network.requestWillBeSent') netReqs.push(m.params.request.url);
  };
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ---- Pass 1: fresh load, empty state ---- */
  await nav(BASE + '?asof=2026-11-19');
  check('title renders', (await evalJs(`document.title`)).includes('Bicycle Tracker BD'));
  check('h1 renders', (await evalJs(`document.querySelector('h1').textContent`)).includes('Bicycle Tracker BD'));
  check('stat rides = 0', await evalJs(`document.querySelector('#statRides').textContent`) === '0');
  check('stat km = 0', await evalJs(`document.querySelector('#statKm').textContent`) === '0');
  check('stat bikes = 0', await evalJs(`document.querySelector('#statBikes').textContent`) === '0');
  check('per-bike empty message', await evalJs(`!document.querySelector('#perBikeEmpty').hidden`));
  check('due empty message', await evalJs(`!document.querySelector('#dueEmpty').hidden`));
  check('recent empty message', await evalJs(`!document.querySelector('#recentEmpty').hidden`));

  /* ---- Pass 2: ride form blocked with no bikes ---- */
  await clickTab('Rides');
  check('rides empty message', await evalJs(`!document.querySelector('#rideEmpty').hidden`));
  check('no-bike warning shown', await evalJs(`!document.querySelector('#rideNoBike').hidden`));
  check('ride save disabled with no bikes', await evalJs(`document.querySelector('#rideSaveBtn').disabled`));

  /* ---- Pass 3: add a bike ---- */
  await clickTab('Bikes');
  await evalJs(`(() => {
    document.querySelector('#bikeNameInput').value = 'My Phoenix';
    document.querySelector('#bikeTypeSelect').value = 'hybrid';
    document.querySelector('#bikeBrandInput').value = 'Phoenix';
    document.querySelector('#bikeBoughtInput').value = '2026-01-05';
    document.querySelector('#bikeStartKmInput').value = '100';
    return true; })()`);
  await evalJs(`document.querySelector('#bikeSaveBtn').click()`);
  await sleep(300);
  check('bike added message', await evalJs(`document.querySelector('#msg').textContent.includes('added')`));
  check('bike list shows Phoenix', await evalJs(`document.querySelector('#bikeList').textContent.includes('My Phoenix')`));
  check('bike list shows Hybrid', await evalJs(`document.querySelector('#bikeList').textContent.includes('Hybrid')`));
  check('bike list shows odometer 100', await evalJs(`document.querySelector('#bikeList').textContent.includes('100 km')`));
  await clickTab('Dashboard');
  check('stat bikes = 1', await evalJs(`document.querySelector('#statBikes').textContent`) === '1');
  check('per-bike row shows Phoenix', await evalJs(`document.querySelector('#perBikeList').textContent.includes('My Phoenix')`));

  /* ---- Pass 4: add a ride (12.5 km / 45 min) ---- */
  await clickTab('Rides');
  check('ride save enabled after bike', await evalJs(`!document.querySelector('#rideSaveBtn').disabled`));
  await evalJs(`(() => {
    document.querySelector('#rideDateInput').value = '2026-11-10';
    document.querySelector('#rideDistInput').value = '12.5';
    document.querySelector('#rideMinInput').value = '45';
    document.querySelector('#rideRouteInput').value = 'Dhanmondi Lake loop';
    return true; })()`);
  await evalJs(`document.querySelector('#rideSaveBtn').click()`);
  await sleep(300);
  check('ride added message', await evalJs(`document.querySelector('#msg').textContent.includes('added')`));
  check('ride list shows 12.5 km', await evalJs(`document.querySelector('#rideList').textContent.includes('12.5 km')`));
  check('ride list shows avg 16.7 km/h', await evalJs(`document.querySelector('#rideList').textContent.includes('16.7 km/h')`));
  check('ride list shows route', await evalJs(`document.querySelector('#rideList').textContent.includes('Dhanmondi Lake loop')`));
  await clickTab('Dashboard');
  check('stat rides = 1', await evalJs(`document.querySelector('#statRides').textContent`) === '1');
  check('stat km = 12.5', await evalJs(`document.querySelector('#statKm').textContent`) === '12.5');
  check('stat time = 45m', await evalJs(`document.querySelector('#statTime').textContent`) === '45m');
  check('stat avg speed = 16.7 km/h', await evalJs(`document.querySelector('#statAvgSpeed').textContent`) === '16.7 km/h');
  check('stat month km = 12.5', await evalJs(`document.querySelector('#statMonthKm').textContent`) === '12.5');
  check('stat longest = 12.5 km', await evalJs(`document.querySelector('#statLongest').textContent`) === '12.5 km');
  check('per-bike odometer now 112.5', await evalJs(`document.querySelector('#perBikeList').textContent.includes('112.5 km')`));
  check('recent shows ride', await evalJs(`document.querySelector('#recentList').textContent.includes('12.5 km')`));

  /* ---- Pass 5: ride validation \u2014 0 km rejected ---- */
  await clickTab('Rides');
  await evalJs(`(() => {
    document.querySelector('#rideDateInput').value = '2026-11-11';
    document.querySelector('#rideDistInput').value = '0';
    document.querySelector('#rideMinInput').value = '30';
    document.querySelector('#rideRouteInput').value = '';
    return true; })()`);
  await evalJs(`document.querySelector('#rideSaveBtn').click()`);
  await sleep(300);
  check('0 km rejected, error shown', await evalJs(`!document.querySelector('#rideErr').hidden`));
  check('distance field marked invalid', await evalJs(`document.querySelector('#rideDistInput').classList.contains('invalid')`));
  await clickTab('Dashboard');
  check('stat rides still 1', await evalJs(`document.querySelector('#statRides').textContent`) === '1');

  /* ---- Pass 6: add service with next-due 150 km (odo 112.5 \u2192 due in 37.5) ---- */
  await clickTab('Maintenance');
  await evalJs(`(() => {
    document.querySelector('#maintTypeSelect').value = 'chain-lube';
    document.querySelector('#maintDateInput').value = '2026-11-02';
    document.querySelector('#maintCostInput').value = '350';
    document.querySelector('#maintOdoInput').value = '120';
    document.querySelector('#maintNextDueInput').value = '150';
    return true; })()`);
  await evalJs(`document.querySelector('#maintSaveBtn').click()`);
  await sleep(300);
  check('service added message', await evalJs(`document.querySelector('#msg').textContent.includes('added')`));
  check('service list shows Chain lube', await evalJs(`document.querySelector('#maintList').textContent.includes('Chain lube')`));
  check('service list shows cost', await evalJs(`document.querySelector('#maintList').textContent.includes('350.00')`));
  await clickTab('Dashboard');
  check('stat spend = 350.00', await evalJs(`document.querySelector('#statSpend').textContent`) === '\u09f3350.00');
  check('due list shows chain lube', await evalJs(`document.querySelector('#dueList').textContent.includes('Chain lube')`));
  check('due list shows due in 37.5 km', await evalJs(`document.querySelector('#dueList').textContent.includes('due in 37.5 km')`));

  /* ---- Pass 7: search + bike filter ---- */
  await clickTab('Rides');
  await evalJs(`(() => { const i = document.querySelector('#rideSearchInput'); i.value = 'dhanmondi'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(300);
  check('search dhanmondi shows ride', await evalJs(`document.querySelector('#rideList').textContent.includes('12.5 km')`));
  await evalJs(`(() => { const i = document.querySelector('#rideSearchInput'); i.value = 'hatirjheel'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(300);
  check('search hatirjheel hides ride', await evalJs(`!document.querySelector('#rideList').textContent.includes('12.5 km')`));
  await evalJs(`(() => { const i = document.querySelector('#rideSearchInput'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  /* ---- Pass 8: quick-pick fills route ---- */
  await evalJs(`document.querySelector('#quickPick button[data-route="Hatirjheel loop"]').click()`);
  await sleep(200);
  check('quick-pick fills Hatirjheel loop', await evalJs(`document.querySelector('#rideRouteInput').value`) === 'Hatirjheel loop');

  /* ---- Pass 9: BN toggle + persistence ---- */
  await evalJs(`document.querySelector('#langBtn').click()`);
  await sleep(300);
  check('BN: h1 has Bengali', await evalJs(`(${HAS_BN})(document.querySelector('h1').textContent)`));
  check('BN: stat rides Bengali 1', await evalJs(`document.querySelector('#statRides').textContent`) === '\u09e7');
  check('BN: stat km Bengali 12.5', await evalJs(`document.querySelector('#statKm').textContent`) === '\u09e7\u09e8.\u09eb');
  await nav(BASE + '?asof=2026-11-19');
  check('BN persists across reload', await evalJs(`(${HAS_BN})(document.querySelector('h1').textContent)`));
  check('rides persist (total 1)', await evalJs(`document.querySelector('#statRides').textContent`) === '\u09e7');
  await evalJs(`document.querySelector('#langBtn').click()`);
  await sleep(300);

  /* ---- Pass 10: data tab \u2014 bad import, good import, erase ---- */
  await clickTab('Data');
  await importJson('{"v":9}');
  check('bad import rejected', await evalJs(`document.querySelector('#msg').textContent.includes('not a valid')`));
  check('data intact after bad import', await evalJs(`JSON.parse(localStorage.getItem('bicycle-tracker-bd-v1')).rides.length === 1`));
  await evalJs(`document.querySelector('#exportBtn').click()`);
  await sleep(300);
  check('export shows backup', await evalJs(`!document.querySelector('#exportOut').hidden && document.querySelector('#exportOut').value.includes('My Phoenix')`));
  await importJson(JSON.stringify({ v: 1, app: 'bicycle-tracker-bd', lang: 'en', bikes: [{ id: 'x1', name: 'Imported Bike', type: 'city', brand: '', boughtDate: '', startKm: 0 }], rides: [{ id: 'y1', bikeId: 'x1', date: '2026-11-01', distanceKm: 8, minutes: 30, route: '', note: '' }], services: [] }));
  check('good import accepted', await evalJs(`document.querySelector('#msg').textContent.includes('imported')`));
  check('imported ride counted', await evalJs(`document.querySelector('#statRides').textContent`) === '1');
  await clickTab('Rides');
  check('imported list shows 8 km', await evalJs(`document.querySelector('#rideList').textContent.includes('8 km')`));
  await clickTab('Data');
  await evalJs(`window.prompt = () => 'DELETE'`);
  await evalJs(`document.querySelector('#eraseBtn').click()`);
  await sleep(400);
  check('erase message shown', await evalJs(`document.querySelector('#msg').textContent.includes('erased')`));
  check('erase restores 0 rides', await evalJs(`document.querySelector('#statRides').textContent`) === '0');

  /* ---- Pass 11: 390px mobile, no horizontal overflow ---- */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  await clickTab('Dashboard');
  check('390px dashboard no overflow', await evalJs(`document.documentElement.scrollWidth <= 390`));
  await clickTab('Rides');
  check('390px rides no overflow', await evalJs(`document.documentElement.scrollWidth <= 390`));
  await clickTab('Bikes');
  check('390px bikes no overflow', await evalJs(`document.documentElement.scrollWidth <= 390`));
  await clickTab('Maintenance');
  check('390px maintenance no overflow', await evalJs(`document.documentElement.scrollWidth <= 390`));
  await clickTab('Data');
  check('390px data no overflow', await evalJs(`document.documentElement.scrollWidth <= 390`));

  /* ---- Pass 12: errors + network ---- */
  check('0 console/page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  const badNet = netReqs.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && u !== 'about:blank');
  check('0 non-file network requests', badNet.length === 0, badNet.join(', ').slice(0, 200));
} catch (e) {
  console.log('SMOKE ERROR: ' + (e && e.message ? e.message : e));
  fail++;
} finally {
  try { await send('Page.close'); } catch { /* already closed */ }
  chrome.kill();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail || errors.length ? 1 : 0);
