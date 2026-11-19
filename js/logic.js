/* Bicycle Tracker BD \u2014 pure logic (no DOM). Node-testable.
 * All date math is UTC calendar math on YYYY-MM-DD strings so results
 * do not depend on the viewer's timezone. Money is taka, up to 2 decimals.
 * Distances are kilometres; speed is km/h. The app stores the user's own
 * ride and service records only; it never estimates calories or fitness. */
'use strict';

const MAX_NAME_LEN = 80;
const MAX_BRAND_LEN = 60;
const MAX_ROUTE_LEN = 80;
const MAX_NOTE_LEN = 200;
const MAX_ITEMS = 500;
const MAX_COST = 1000000;       /* single service, taka */
const MAX_DISTANCE_KM = 500;    /* single ride */
const MIN_DISTANCE_KM = 0.1;
const MAX_MINUTES = 1440;       /* 24 h, single ride */
const MIN_MINUTES = 1;
const MAX_ODOMETER_KM = 1000000;
const DUE_SOON_KM = 50;         /* service due within this many km */
const BIKE_TYPE_VALUES = ['road', 'mtb', 'hybrid', 'city'];
const SERVICE_TYPE_VALUES = ['chain-lube', 'brake-pads', 'tyre-tube', 'gear-tune', 'full-service', 'other'];
const BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isNonEmptyStr(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}
function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/* ---------- dates ---------- */
function parseISODate(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}
function isValidDateStr(s) { return parseISODate(s) !== null; }
function todayISO(asof) {
  if (asof && isValidDateStr(asof)) return asof;
  const n = new Date();
  return n.getUTCFullYear() + '-' + String(n.getUTCMonth() + 1).padStart(2, '0') + '-' + String(n.getUTCDate()).padStart(2, '0');
}
function toISODate(dt) {
  return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
}
function daysBetween(a, b) {
  const da = parseISODate(a), db = parseISODate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}
function addDays(dateStr, n) {
  const d = parseISODate(dateStr);
  if (!d) return null;
  return toISODate(new Date(d.getTime() + n * 86400000));
}
function isFuture(dateStr, asof) {
  const db = daysBetween(todayISO(asof), dateStr);
  return db !== null && db > 0;
}
function monthKey(dateStr) {
  return typeof dateStr === 'string' ? dateStr.slice(0, 7) : null;
}

/* ---------- formatting ---------- */
function toBnDigits(s) {
  return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);
}
function fmtNum(n, lang) {
  const s = Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return lang === 'bn' ? toBnDigits(s) : s;
}
function fmtMoney(n, lang) {
  const s = Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (lang === 'bn' ? toBnDigits(s) : s);
}
function fmtKm(n, lang) {
  const s = Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return lang === 'bn' ? toBnDigits(s) : s;
}
function fmtDuration(minutes, lang) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60), mm = m % 60;
  const s = h > 0 ? h + 'h ' + String(mm).padStart(2, '0') + 'm' : m + 'm';
  return lang === 'bn' ? toBnDigits(s) : s;
}

/* ---------- derived ride math ---------- */
function avgSpeedKmh(distanceKm, minutes) {
  if (!isFiniteNum(distanceKm) || !isFiniteNum(minutes) || minutes <= 0) return null;
  const v = distanceKm / (minutes / 60);
  return Math.round(v * 10) / 10;
}
function bikeOdometer(bike, rides) {
  const base = isFiniteNum(bike.startKm) ? bike.startKm : 0;
  let sum = 0;
  for (const r of rides) if (r.bikeId === bike.id) sum += r.distanceKm;
  return Math.round((base + sum) * 10) / 10;
}
function perBikeKm(bikes, rides) {
  const out = {};
  for (const b of bikes) out[b.id] = 0;
  for (const r of rides) {
    if (out[r.bikeId] === undefined) out[r.bikeId] = 0;
    out[r.bikeId] = Math.round((out[r.bikeId] + r.distanceKm) * 10) / 10;
  }
  return out;
}

/* ---------- validation ---------- */
function validateBike(b, asof) {
  const errs = [];
  if (!isNonEmptyStr(b.name, MAX_NAME_LEN)) errs.push('name');
  if (BIKE_TYPE_VALUES.indexOf(b.type) === -1) errs.push('type');
  if (b.brand !== undefined && b.brand !== null && b.brand !== '' && !isNonEmptyStr(b.brand, MAX_BRAND_LEN)) errs.push('brand');
  if (b.boughtDate !== undefined && b.boughtDate !== null && b.boughtDate !== '') {
    if (!isValidDateStr(b.boughtDate)) errs.push('boughtDate');
    else if (isFuture(b.boughtDate, asof)) errs.push('boughtDateFuture');
  }
  if (!isFiniteNum(b.startKm) || b.startKm < 0 || b.startKm > MAX_ODOMETER_KM) errs.push('startKm');
  return errs;
}
function validateRide(r, bikes, asof) {
  const errs = [];
  if (!bikes.some((b) => b.id === r.bikeId)) errs.push('bikeId');
  if (!isValidDateStr(r.date)) errs.push('date');
  else if (isFuture(r.date, asof)) errs.push('dateFuture');
  if (!isFiniteNum(r.distanceKm) || r.distanceKm < MIN_DISTANCE_KM || r.distanceKm > MAX_DISTANCE_KM) errs.push('distanceKm');
  if (!isFiniteNum(r.minutes) || !Number.isInteger(r.minutes) || r.minutes < MIN_MINUTES || r.minutes > MAX_MINUTES) errs.push('minutes');
  if (r.route !== undefined && r.route !== null && r.route !== '' && !isNonEmptyStr(r.route, MAX_ROUTE_LEN)) errs.push('route');
  if (r.note !== undefined && r.note !== null && r.note !== '' && !isNonEmptyStr(r.note, MAX_NOTE_LEN)) errs.push('note');
  return errs;
}
function validateService(s, bikes, asof) {
  const errs = [];
  if (!bikes.some((b) => b.id === s.bikeId)) errs.push('bikeId');
  if (SERVICE_TYPE_VALUES.indexOf(s.type) === -1) errs.push('type');
  if (!isValidDateStr(s.date)) errs.push('date');
  else if (isFuture(s.date, asof)) errs.push('dateFuture');
  if (!isFiniteNum(s.cost) || s.cost < 0 || s.cost > MAX_COST) errs.push('cost');
  if (!isFiniteNum(s.odometerKm) || s.odometerKm < 0 || s.odometerKm > MAX_ODOMETER_KM) errs.push('odometerKm');
  if (s.nextDueKm !== undefined && s.nextDueKm !== null && s.nextDueKm !== '') {
    if (!isFiniteNum(s.nextDueKm) || s.nextDueKm < 0 || s.nextDueKm > MAX_ODOMETER_KM) errs.push('nextDueKm');
  }
  if (s.note !== undefined && s.note !== null && s.note !== '' && !isNonEmptyStr(s.note, MAX_NOTE_LEN)) errs.push('note');
  return errs;
}

/* ---------- stats ---------- */
function computeStats(bikes, rides, services, asof) {
  const today = todayISO(asof);
  const mk = monthKey(today);
  let totalKm = 0, totalMinutes = 0, monthKm = 0, longest = null;
  for (const r of rides) {
    totalKm += r.distanceKm;
    totalMinutes += r.minutes;
    if (monthKey(r.date) === mk) monthKm += r.distanceKm;
    if (!longest || r.distanceKm > longest.distanceKm) longest = r;
  }
  totalKm = Math.round(totalKm * 10) / 10;
  monthKm = Math.round(monthKm * 10) / 10;
  let totalSpend = 0;
  for (const s of services) totalSpend += s.cost;
  totalSpend = Math.round(totalSpend * 100) / 100;
  const avgSpeed = totalMinutes > 0 ? avgSpeedKmh(totalKm, totalMinutes) : null;
  return {
    totalRides: rides.length,
    totalKm,
    totalMinutes,
    monthKm,
    longest,
    totalSpend,
    totalBikes: bikes.length,
    totalServices: services.length,
    avgSpeed,
    perBike: perBikeKm(bikes, rides),
  };
}

/* ---------- maintenance due ---------- */
/* A service with nextDueKm is due when the bike's odometer reaches it,
 * and "due soon" when within DUE_SOON_KM. Returns entries sorted by
 * km remaining (most overdue first). */
function dueServices(bikes, rides, services) {
  const out = [];
  for (const s of services) {
    if (s.nextDueKm === undefined || s.nextDueKm === null || s.nextDueKm === '') continue;
    const bike = bikes.find((b) => b.id === s.bikeId);
    if (!bike) continue;
    const odo = bikeOdometer(bike, rides);
    const remaining = Math.round((s.nextDueKm - odo) * 10) / 10;
    if (remaining <= DUE_SOON_KM) {
      out.push({ service: s, bike, odometerKm: odo, remainingKm: remaining,
        state: remaining <= 0 ? 'overdue' : 'soon' });
    }
  }
  out.sort((a, b) => a.remainingKm - b.remainingKm);
  return out;
}

/* ---------- import validation ---------- */
function validateImport(obj) {
  if (!isPlainObject(obj)) return false;
  if (obj.v !== 1 || obj.app !== 'bicycle-tracker-bd') return false;
  if (!Array.isArray(obj.bikes) || !Array.isArray(obj.rides) || !Array.isArray(obj.services)) return false;
  if (obj.bikes.length > MAX_ITEMS || obj.rides.length > MAX_ITEMS || obj.services.length > MAX_ITEMS) return false;
  const asof = '2099-12-31'; /* import must not reject past dates; future check uses far-future asof */
  for (const b of obj.bikes) {
    if (!isPlainObject(b) || typeof b.id !== 'string' || validateBike(b, asof).length) return false;
  }
  for (const r of obj.rides) {
    if (!isPlainObject(r) || typeof r.id !== 'string' || validateRide(r, obj.bikes, asof).length) return false;
  }
  for (const s of obj.services) {
    if (!isPlainObject(s) || typeof s.id !== 'string' || validateService(s, obj.bikes, asof).length) return false;
  }
  if (obj.lang !== undefined && obj.lang !== 'en' && obj.lang !== 'bn') return false;
  return true;
}

function uid() {
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

if (typeof module !== 'undefined') {
  module.exports = {
    MAX_NAME_LEN, MAX_BRAND_LEN, MAX_ROUTE_LEN, MAX_NOTE_LEN, MAX_ITEMS,
    MAX_COST, MAX_DISTANCE_KM, MIN_DISTANCE_KM, MAX_MINUTES, MIN_MINUTES,
    MAX_ODOMETER_KM, DUE_SOON_KM, BIKE_TYPE_VALUES, SERVICE_TYPE_VALUES,
    parseISODate, isValidDateStr, todayISO, toISODate, daysBetween, addDays,
    isFuture, monthKey, toBnDigits, fmtNum, fmtMoney, fmtKm, fmtDuration,
    avgSpeedKmh, bikeOdometer, perBikeKm, validateBike, validateRide,
    validateService, computeStats, dueServices, validateImport, uid,
  };
}
