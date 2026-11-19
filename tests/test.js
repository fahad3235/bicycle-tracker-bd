/* Bicycle Tracker BD \u2014 node unit tests. Run: node tests/test.js */
'use strict';
const L = require('../js/logic.js');
const DATA = require('../js/data.js');
const I18N = require('../js/i18n.js');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' \u2014 ' + extra : '')); }
}
function eq(name, a, b) { check(name, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

const ASOF = '2026-11-19';
function goodBike(over) {
  return Object.assign({
    id: 'b1', name: 'My Phoenix', type: 'hybrid', brand: 'Phoenix',
    boughtDate: '2026-01-05', startKm: 0,
  }, over || {});
}
function goodRide(over) {
  return Object.assign({
    id: 'r1', bikeId: 'b1', date: '2026-11-10', distanceKm: 12.5,
    minutes: 45, route: 'Dhanmondi Lake loop', note: '',
  }, over || {});
}
function goodService(over) {
  return Object.assign({
    id: 's1', bikeId: 'b1', type: 'chain-lube', date: '2026-11-02',
    cost: 350, odometerKm: 120, nextDueKm: 500, note: '',
  }, over || {});
}
const BIKES = [goodBike()];

/* ---- option lists ---- */
eq('4 bike types', DATA.BIKE_TYPES.length, 4);
eq('6 service types', DATA.SERVICE_TYPES.length, 6);
eq('5 common routes', DATA.COMMON_ROUTES.length, 5);
check('routes include Hatirjheel', DATA.COMMON_ROUTES.includes('Hatirjheel loop'));

/* ---- i18n keys complete ---- */
const enKeys = Object.keys(I18N.I18N.en).sort();
const bnKeys = Object.keys(I18N.I18N.bn).sort();
eq('i18n key counts match', enKeys.length, bnKeys.length);
check('i18n keys identical', JSON.stringify(enKeys) === JSON.stringify(bnKeys));
check('BN title has Bengali', [...I18N.I18N.bn.appTitle].some((c) => c.codePointAt(0) >= 0x0980 && c.codePointAt(0) <= 0x09FF));

/* ---- dates ---- */
check('parse rejects 2026-02-30', L.parseISODate('2026-02-30') === null);
check('parse rejects garbage', L.parseISODate('tomorrow') === null);
check('parse accepts leap day', L.parseISODate('2028-02-29') !== null);
eq('daysBetween 6', L.daysBetween('2026-11-19', '2026-11-25'), 6);
eq('addDays month rollover', L.addDays('2026-11-25', 14), '2026-12-09');
check('isFuture true', L.isFuture('2026-11-20', ASOF));
check('isFuture false same day', !L.isFuture('2026-11-19', ASOF));
eq('monthKey', L.monthKey('2026-11-10'), '2026-11');

/* ---- formatting ---- */
eq('fmtMoney en', L.fmtMoney(1200, 'en'), '1,200.00');
eq('fmtMoney bn', L.fmtMoney(1200, 'bn'), '\u09e7,\u09e8\u09e6\u09e6.\u09e6\u09e6');
eq('fmtKm en', L.fmtKm(12.5, 'en'), '12.5');
eq('fmtKm bn', L.fmtKm(12.5, 'bn'), '\u09e7\u09e8.\u09eb');
eq('fmtDuration 45m', L.fmtDuration(45, 'en'), '45m');
eq('fmtDuration 90m', L.fmtDuration(90, 'en'), '1h 30m');
eq('fmtDuration bn', L.fmtDuration(90, 'bn'), '\u09e7h \u09e9\u09e6m');
eq('fmtNum bn', L.fmtNum(1234, 'bn'), '\u09e7,\u09e8\u09e9\u09ea');

/* ---- speed & odometer ---- */
eq('avgSpeed 12.5km/45min', L.avgSpeedKmh(12.5, 45), 16.7);
eq('avgSpeed 20km/60min', L.avgSpeedKmh(20, 60), 20);
eq('avgSpeed 0 min = null', L.avgSpeedKmh(10, 0), null);
eq('odometer start+rides', L.bikeOdometer(goodBike({ startKm: 100 }), [goodRide(), goodRide({ id: 'r2', distanceKm: 7.5 })]), 120);
eq('perBikeKm', JSON.stringify(L.perBikeKm(BIKES, [goodRide(), goodRide({ id: 'r2', distanceKm: 7.5 })])), JSON.stringify({ b1: 20 }));

/* ---- bike validation ---- */
eq('good bike valid', L.validateBike(goodBike(), ASOF).length, 0);
check('bike empty name', L.validateBike(goodBike({ name: '  ' }), ASOF).includes('name'));
check('bike bad type', L.validateBike(goodBike({ type: 'electric' }), ASOF).includes('type'));
check('bike future bought', L.validateBike(goodBike({ boughtDate: '2026-11-20' }), ASOF).includes('boughtDateFuture'));
check('bike bad bought date', L.validateBike(goodBike({ boughtDate: '2026-02-30' }), ASOF).includes('boughtDate'));
check('bike negative startKm', L.validateBike(goodBike({ startKm: -1 }), ASOF).includes('startKm'));
check('bike empty boughtDate ok', L.validateBike(goodBike({ boughtDate: '' }), ASOF).length === 0);

/* ---- ride validation ---- */
eq('good ride valid', L.validateRide(goodRide(), BIKES, ASOF).length, 0);
check('ride unknown bike', L.validateRide(goodRide({ bikeId: 'nope' }), BIKES, ASOF).includes('bikeId'));
check('ride future date', L.validateRide(goodRide({ date: '2026-11-20' }), BIKES, ASOF).includes('dateFuture'));
check('ride zero distance', L.validateRide(goodRide({ distanceKm: 0 }), BIKES, ASOF).includes('distanceKm'));
check('ride 501 km', L.validateRide(goodRide({ distanceKm: 501 }), BIKES, ASOF).includes('distanceKm'));
check('ride 0 minutes', L.validateRide(goodRide({ minutes: 0 }), BIKES, ASOF).includes('minutes'));
check('ride 1441 minutes', L.validateRide(goodRide({ minutes: 1441 }), BIKES, ASOF).includes('minutes'));
check('ride fractional minutes', L.validateRide(goodRide({ minutes: 45.5 }), BIKES, ASOF).includes('minutes'));
check('ride NaN distance', L.validateRide(goodRide({ distanceKm: NaN }), BIKES, ASOF).includes('distanceKm'));

/* ---- service validation ---- */
eq('good service valid', L.validateService(goodService(), BIKES, ASOF).length, 0);
check('service bad type', L.validateService(goodService({ type: 'paint' }), BIKES, ASOF).includes('type'));
check('service negative cost', L.validateService(goodService({ cost: -5 }), BIKES, ASOF).includes('cost'));
check('service future date', L.validateService(goodService({ date: '2026-12-01' }), BIKES, ASOF).includes('dateFuture'));
check('service null nextDueKm ok', L.validateService(goodService({ nextDueKm: null }), BIKES, ASOF).length === 0);
check('service negative nextDueKm', L.validateService(goodService({ nextDueKm: -10 }), BIKES, ASOF).includes('nextDueKm'));

/* ---- stats ---- */
const rides2 = [goodRide(), goodRide({ id: 'r2', date: '2026-11-18', distanceKm: 20, minutes: 60 }), goodRide({ id: 'r3', date: '2026-10-05', distanceKm: 5, minutes: 30 })];
const svcs1 = [goodService(), goodService({ id: 's2', cost: 150, type: 'brake-pads' })];
const st = L.computeStats(BIKES, rides2, svcs1, ASOF);
eq('stats totalRides', st.totalRides, 3);
eq('stats totalKm', st.totalKm, 37.5);
eq('stats totalMinutes', st.totalMinutes, 135);
eq('stats monthKm (Nov only)', st.monthKm, 32.5);
eq('stats longest distance', st.longest.distanceKm, 20);
eq('stats totalSpend', st.totalSpend, 500);
eq('stats avgSpeed', st.avgSpeed, 16.7);
const stEmpty = L.computeStats([], [], [], ASOF);
eq('stats empty rides', stEmpty.totalRides, 0);
eq('stats empty avgSpeed null', stEmpty.avgSpeed, null);

/* ---- maintenance due ---- */
const bike100 = goodBike({ startKm: 100 });
const ridesForOdo = [goodRide({ distanceKm: 300 })]; /* odo = 400 */
const due1 = L.dueServices([bike100], ridesForOdo, [goodService({ nextDueKm: 500 })]);
eq('100km away not listed', due1.length, 0);
const due2 = L.dueServices([bike100], ridesForOdo, [goodService({ nextDueKm: 430 })]);
eq('due soon at 30km', due2.length, 1);
eq('due soon state', due2[0].state, 'soon');
const due3 = L.dueServices([bike100], ridesForOdo, [goodService({ nextDueKm: 400 })]);
eq('overdue at 0km', due3[0].state, 'overdue');
const due4 = L.dueServices([bike100], ridesForOdo, [goodService({ nextDueKm: null })]);
eq('no nextDueKm not listed', due4.length, 0);
const due5 = L.dueServices([bike100], ridesForOdo, [goodService({ nextDueKm: 600 })]);
eq('200km away not listed', due5.length, 0);

/* ---- import validation ---- */
function goodImport(over) {
  return Object.assign({ v: 1, app: 'bicycle-tracker-bd', lang: 'en', bikes: [goodBike()], rides: [goodRide()], services: [goodService()] }, over || {});
}
check('good import valid', L.validateImport(goodImport()));
check('import wrong version', !L.validateImport(goodImport({ v: 2 })));
check('import wrong app', !L.validateImport(goodImport({ app: 'lab-test-bd' })));
check('import bad ride', !L.validateImport(goodImport({ rides: [goodRide({ distanceKm: 999 })] })));
check('import null', !L.validateImport(null));
check('import empty state valid', L.validateImport({ v: 1, app: 'bicycle-tracker-bd', lang: 'bn', bikes: [], rides: [], services: [] }));

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
