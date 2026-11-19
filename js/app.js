/* Bicycle Tracker BD \u2014 browser UI. Depends on js/logic.js (bare globals),
 * js/data.js (DATA) and js/i18n.js (I18N) loaded before this file.
 * State lives in localStorage under KEY; nothing leaves the device.
 * ?asof=YYYY-MM-DD overrides "today" (used by the smoke test). */
'use strict';

const KEY = 'bicycle-tracker-bd-v1';
const params = new URLSearchParams(location.search);
const ASOF = isValidDateStr(params.get('asof')) ? params.get('asof') : null;
const today = ASOF || todayISO();

let state = load();
let tab = 'dashboard';
let editingRideId = null;
let editingBikeId = null;
let editingServiceId = null;
let rideSearchQ = '';
let rideBikeFilter = 'all';
let maintBikeFilter = 'all';

function emptyState() {
  return { v: 1, app: 'bicycle-tracker-bd', lang: 'en', bikes: [], rides: [], services: [] };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!validateImport(parsed)) return emptyState();
    return parsed;
  } catch { return emptyState(); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function $(id) { return document.getElementById(id); }
function lang() { return state.lang; }
function txt(key) { return I18N[lang()][key]; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showMsg(text) {
  const m = $('msg');
  m.textContent = text;
  m.hidden = false;
}
function hideMsg() { $('msg').hidden = true; }
function bikeName(id) {
  const b = state.bikes.find((x) => x.id === id);
  return b ? b.name : '?';
}
function bikeTypeLabel(v) {
  return txt('type' + v.charAt(0).toUpperCase() + v.slice(1));
}
function serviceTypeLabel(v) {
  const map = { 'chain-lube': 'typeChainLube', 'brake-pads': 'typeBrakePads', 'tyre-tube': 'typeTyreTube', 'gear-tune': 'typeGearTune', 'full-service': 'typeFullService', 'other': 'typeOther' };
  return txt(map[v] || 'typeOther');
}
function fillBikeSelects() {
  const opts = state.bikes.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join('');
  $('rideBikeSelect').innerHTML = opts;
  $('maintBikeSelect').innerHTML = opts;
  const allOpt = '<option value="all">' + esc(txt('filterAllBikes')) + '</option>';
  $('rideBikeFilter').innerHTML = allOpt + opts;
  $('maintBikeFilter').innerHTML = allOpt + opts;
  if (rideBikeFilter !== 'all' && !state.bikes.some((b) => b.id === rideBikeFilter)) rideBikeFilter = 'all';
  if (maintBikeFilter !== 'all' && !state.bikes.some((b) => b.id === maintBikeFilter)) maintBikeFilter = 'all';
  $('rideBikeFilter').value = rideBikeFilter;
  $('maintBikeFilter').value = maintBikeFilter;
}
function fillTypeSelects() {
  $('bikeTypeSelect').innerHTML = BIKE_TYPE_VALUES.map((v) =>
    '<option value="' + v + '">' + esc(bikeTypeLabel(v)) + '</option>').join('');
  $('maintTypeSelect').innerHTML = SERVICE_TYPE_VALUES.map((v) =>
    '<option value="' + v + '">' + esc(serviceTypeLabel(v)) + '</option>').join('');
}

/* ---------- static text ---------- */
function renderStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = txt(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = txt(el.dataset.i18nPh); });
  $('appTitle').textContent = txt('appTitle');
  $('langBtn').textContent = txt('langBtn');
  fillBikeSelects();
  fillTypeSelects();
  $('quickPick').innerHTML = DATA.COMMON_ROUTES.map((name) =>
    '<button type="button" data-route="' + esc(name) + '">' + esc(name) + '</button>').join('');
  $('quickPick').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      $('rideRouteInput').value = b.dataset.route;
      $('rideRouteInput').classList.remove('invalid');
      $('rideRouteInput').focus();
    });
  });
  const hasBikes = state.bikes.length > 0;
  $('rideNoBike').hidden = hasBikes;
  $('maintNoBike').hidden = hasBikes;
  $('rideSaveBtn').disabled = !hasBikes;
  $('maintSaveBtn').disabled = !hasBikes;
}

/* ---------- tabs ---------- */
function setTab(name) {
  tab = name;
  for (const t of ['dashboard', 'rides', 'bikes', 'maintenance', 'data']) {
    $('sec' + t.charAt(0).toUpperCase() + t.slice(1)).hidden = t !== name;
    $('tab' + t.charAt(0).toUpperCase() + t.slice(1) + 'Btn').classList.toggle('active', t === name);
  }
  hideMsg();
  render();
}

/* ---------- dashboard ---------- */
function renderDashboard() {
  const s = computeStats(state.bikes, state.rides, state.services, today);
  $('statRides').textContent = fmtNum(s.totalRides, lang());
  $('statKm').textContent = fmtKm(s.totalKm, lang());
  $('statTime').textContent = fmtDuration(s.totalMinutes, lang());
  $('statAvgSpeed').textContent = s.avgSpeed === null ? '\u2014' : fmtNum(s.avgSpeed, lang()) + ' ' + txt('kmhUnit');
  $('statMonthKm').textContent = fmtKm(s.monthKm, lang());
  $('statSpend').textContent = '\u09f3' + fmtMoney(s.totalSpend, lang());
  $('statBikes').textContent = fmtNum(s.totalBikes, lang());
  $('statLongest').textContent = s.longest
    ? fmtKm(s.longest.distanceKm, lang()) + ' ' + txt('kmUnit')
    : '\u2014';
  $('perBikeEmpty').hidden = state.bikes.length > 0;
  $('perBikeList').innerHTML = state.bikes.map((b) => {
    const km = s.perBike[b.id] || 0;
    const odo = bikeOdometer(b, state.rides);
    return '<li><strong>' + esc(b.name) + '</strong> <span class="badge">' + esc(bikeTypeLabel(b.type)) + '</span>' +
      '<br><span class="muted">' + esc(txt('odoLabel').replace('{n}', fmtKm(odo, lang()))) +
      ' \u00b7 ' + esc(fmtKm(km, lang())) + ' ' + esc(txt('kmUnit')) + '</span></li>';
  }).join('');
  const due = dueServices(state.bikes, state.rides, state.services);
  $('dueEmpty').hidden = due.length > 0;
  $('dueList').innerHTML = due.map((d) => {
    const label = d.state === 'overdue'
      ? txt('dueOverdue').replace('{n}', fmtKm(-d.remainingKm, lang()))
      : txt('dueSoon').replace('{n}', fmtKm(d.remainingKm, lang()));
    return '<li><strong>' + esc(serviceTypeLabel(d.service.type)) + '</strong> \u2014 ' + esc(d.bike.name) +
      ' <span class="badge ' + (d.state === 'overdue' ? 'badge-overdue' : 'badge-duesoon') + '">' + esc(label) + '</span>' +
      '<br><span class="muted">' + esc(txt('dueAt').replace('{n}', fmtKm(d.service.nextDueKm, lang()))) +
      ' \u00b7 ' + esc(txt('odoNow').replace('{n}', fmtKm(d.odometerKm, lang()))) + '</span></li>';
  }).join('');
  const recent = state.rides.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $('recentEmpty').hidden = recent.length > 0;
  $('recentList').innerHTML = recent.map((r) => '<li>' + rideLine(r) + '</li>').join('');
}

function rideLine(r) {
  const sp = avgSpeedKmh(r.distanceKm, r.minutes);
  return '<strong>' + esc(fmtKm(r.distanceKm, lang())) + ' ' + esc(txt('kmUnit')) + '</strong> \u2014 ' + esc(bikeName(r.bikeId)) +
    '<br><span class="muted">' + esc(r.date) + ' \u00b7 ' + esc(fmtDuration(r.minutes, lang())) +
    (sp !== null ? ' \u00b7 ' + esc(txt('avgSpeedLabel').replace('{n}', fmtNum(sp, lang()))) : '') +
    (r.route ? ' \u00b7 ' + esc(r.route) : '') + '</span>' +
    (r.note ? '<br>' + esc(r.note) : '');
}

/* ---------- rides ---------- */
function filteredRides() {
  return state.rides.filter((r) => {
    if (rideBikeFilter !== 'all' && r.bikeId !== rideBikeFilter) return false;
    if (rideSearchQ) {
      const q = rideSearchQ.toLowerCase();
      const hay = ((r.route || '') + ' ' + (r.note || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function renderRides() {
  const list = filteredRides();
  $('rideEmpty').hidden = list.length > 0;
  $('rideList').innerHTML = list.map((r) =>
    '<li class="card"><div>' + rideLine(r) + '</div><div class="row">' +
    '<button type="button" data-edit="' + esc(r.id) + '">' + esc(txt('editBtn')) + '</button>' +
    '<button type="button" class="danger" data-del="' + esc(r.id) + '">' + esc(txt('deleteBtn')) + '</button>' +
    '</div></li>').join('');
  $('rideList').querySelectorAll('[data-edit]').forEach((b) => {
    b.addEventListener('click', () => startEditRide(b.dataset.edit));
  });
  $('rideList').querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!window.confirm(txt('deleteConfirm'))) return;
      state.rides = state.rides.filter((r) => r.id !== b.dataset.del);
      save();
      showMsg(txt('rideDeleted'));
      render();
    });
  });
}
function readRideForm() {
  const dist = parseFloat($('rideDistInput').value);
  const mins = parseInt($('rideMinInput').value, 10);
  return {
    bikeId: $('rideBikeSelect').value,
    date: $('rideDateInput').value,
    distanceKm: Number.isFinite(dist) ? dist : NaN,
    minutes: Number.isFinite(mins) ? mins : NaN,
    route: $('rideRouteInput').value.trim(),
    note: $('rideNoteInput').value.trim(),
  };
}
function markInvalid(ids) {
  for (const id of ids) $(id).classList.remove('invalid');
}
function saveRide(ev) {
  ev.preventDefault();
  const cand = readRideForm();
  const errs = validateRide(cand, state.bikes, today);
  const map = { bikeId: 'rideBikeSelect', date: 'rideDateInput', dateFuture: 'rideDateInput', distanceKm: 'rideDistInput', minutes: 'rideMinInput', route: 'rideRouteInput', note: 'rideNoteInput' };
  for (const id of Object.values(map)) $(id).classList.remove('invalid');
  if (errs.length) {
    for (const e of errs) if (map[e]) $(map[e]).classList.add('invalid');
    $('rideErr').textContent = errs.some((e) => e === 'dateFuture')
      ? txt('errFuture')
      : errs.some((e) => e === 'distanceKm' || e === 'minutes')
        ? txt('errNumber') : txt('errRequired');
    $('rideErr').hidden = false;
    return;
  }
  $('rideErr').hidden = true;
  if (editingRideId) {
    const i = state.rides.findIndex((r) => r.id === editingRideId);
    if (i >= 0) state.rides[i] = { id: editingRideId, ...cand };
    showMsg(txt('rideSaved'));
  } else {
    state.rides.push({ id: uid(), ...cand });
    showMsg(txt('rideAdded'));
  }
  save();
  resetRideForm();
  render();
}
function startEditRide(id) {
  const r = state.rides.find((x) => x.id === id);
  if (!r) return;
  editingRideId = id;
  $('rideFormTitle').textContent = txt('formRideTitleEdit');
  $('rideBikeSelect').value = r.bikeId;
  $('rideDateInput').value = r.date;
  $('rideDistInput').value = r.distanceKm;
  $('rideMinInput').value = r.minutes;
  $('rideRouteInput').value = r.route || '';
  $('rideNoteInput').value = r.note || '';
  $('rideSaveBtn').textContent = txt('saveBtn');
  $('rideCancelBtn').hidden = false;
  $('rideForm').scrollIntoView({ block: 'start' });
}
function resetRideForm() {
  editingRideId = null;
  $('rideForm').reset();
  $('rideFormTitle').textContent = txt('formRideTitle');
  $('rideSaveBtn').textContent = txt('addBtn');
  $('rideCancelBtn').hidden = true;
  $('rideErr').hidden = true;
  markInvalid(['rideBikeSelect', 'rideDateInput', 'rideDistInput', 'rideMinInput', 'rideRouteInput', 'rideNoteInput']);
}

/* ---------- bikes ---------- */
function renderBikes() {
  $('bikeEmpty').hidden = state.bikes.length > 0;
  $('bikeList').innerHTML = state.bikes.map((b) => {
    const odo = bikeOdometer(b, state.rides);
    const rc = state.rides.filter((r) => r.bikeId === b.id).length;
    const sc = state.services.filter((s) => s.bikeId === b.id).length;
    return '<li class="card"><div><strong>' + esc(b.name) + '</strong> <span class="badge">' + esc(bikeTypeLabel(b.type)) + '</span>' +
      '<br><span class="muted">' + (b.brand ? esc(b.brand) + ' \u00b7 ' : '') +
      (b.boughtDate ? esc(b.boughtDate) + ' \u00b7 ' : '') +
      esc(txt('odoLabel').replace('{n}', fmtKm(odo, lang()))) + '</span>' +
      '<br><span class="muted">' + esc(txt('ridesCount').replace('{n}', fmtNum(rc, lang()))) +
      ' \u00b7 ' + esc(txt('servicesCount').replace('{n}', fmtNum(sc, lang()))) + '</span>' +
      '</div><div class="row">' +
      '<button type="button" data-edit="' + esc(b.id) + '">' + esc(txt('editBtn')) + '</button>' +
      '<button type="button" class="danger" data-del="' + esc(b.id) + '">' + esc(txt('deleteBtn')) + '</button>' +
      '</div></li>';
  }).join('');
  $('bikeList').querySelectorAll('[data-edit]').forEach((b) => {
    b.addEventListener('click', () => startEditBike(b.dataset.edit));
  });
  $('bikeList').querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.del;
      if (state.rides.some((r) => r.bikeId === id) || state.services.some((s) => s.bikeId === id)) {
        showMsg(txt('bikeInUse'));
        return;
      }
      if (!window.confirm(txt('deleteConfirm'))) return;
      state.bikes = state.bikes.filter((x) => x.id !== id);
      save();
      showMsg(txt('bikeDeleted'));
      render();
    });
  });
}
function readBikeForm() {
  const start = parseFloat($('bikeStartKmInput').value);
  return {
    name: $('bikeNameInput').value.trim(),
    type: $('bikeTypeSelect').value,
    brand: $('bikeBrandInput').value.trim(),
    boughtDate: $('bikeBoughtInput').value,
    startKm: Number.isFinite(start) ? start : NaN,
  };
}
function saveBike(ev) {
  ev.preventDefault();
  const cand = readBikeForm();
  const errs = validateBike(cand, today);
  const map = { name: 'bikeNameInput', type: 'bikeTypeSelect', brand: 'bikeBrandInput', boughtDate: 'bikeBoughtInput', boughtDateFuture: 'bikeBoughtInput', startKm: 'bikeStartKmInput' };
  for (const id of Object.values(map)) $(id).classList.remove('invalid');
  if (errs.length) {
    for (const e of errs) if (map[e]) $(map[e]).classList.add('invalid');
    $('bikeErr').textContent = errs.some((e) => e === 'boughtDateFuture')
      ? txt('errFuture')
      : errs.some((e) => e === 'startKm') ? txt('errNumber') : txt('errRequired');
    $('bikeErr').hidden = false;
    return;
  }
  $('bikeErr').hidden = true;
  if (editingBikeId) {
    const i = state.bikes.findIndex((b) => b.id === editingBikeId);
    if (i >= 0) state.bikes[i] = { id: editingBikeId, ...cand };
    showMsg(txt('bikeSaved'));
  } else {
    state.bikes.push({ id: uid(), ...cand });
    showMsg(txt('bikeAdded'));
  }
  save();
  resetBikeForm();
  render();
}
function startEditBike(id) {
  const b = state.bikes.find((x) => x.id === id);
  if (!b) return;
  editingBikeId = id;
  $('bikeFormTitle').textContent = txt('formBikeTitleEdit');
  $('bikeNameInput').value = b.name;
  $('bikeTypeSelect').value = b.type;
  $('bikeBrandInput').value = b.brand || '';
  $('bikeBoughtInput').value = b.boughtDate || '';
  $('bikeStartKmInput').value = b.startKm;
  $('bikeSaveBtn').textContent = txt('saveBtn');
  $('bikeCancelBtn').hidden = false;
  $('bikeForm').scrollIntoView({ block: 'start' });
}
function resetBikeForm() {
  editingBikeId = null;
  $('bikeForm').reset();
  $('bikeFormTitle').textContent = txt('formBikeTitle');
  $('bikeSaveBtn').textContent = txt('addBtn');
  $('bikeCancelBtn').hidden = true;
  $('bikeErr').hidden = true;
  markInvalid(['bikeNameInput', 'bikeTypeSelect', 'bikeBrandInput', 'bikeBoughtInput', 'bikeStartKmInput']);
}

/* ---------- maintenance ---------- */
function filteredServices() {
  return state.services.filter((s) => maintBikeFilter === 'all' || s.bikeId === maintBikeFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function renderMaintenance() {
  const list = filteredServices();
  $('maintEmpty').hidden = list.length > 0;
  $('maintList').innerHTML = list.map((s) => {
    const bike = state.bikes.find((b) => b.id === s.bikeId);
    const odoNow = bike ? bikeOdometer(bike, state.rides) : null;
    let dueTxt = '';
    if (s.nextDueKm !== null && s.nextDueKm !== undefined && s.nextDueKm !== '') {
      const remaining = odoNow === null ? null : Math.round((s.nextDueKm - odoNow) * 10) / 10;
      dueTxt = '<br><span class="muted">' + esc(txt('dueAt').replace('{n}', fmtKm(s.nextDueKm, lang())));
      if (remaining !== null) {
        dueTxt += ' \u00b7 ' + esc(remaining <= 0
          ? txt('dueOverdue').replace('{n}', fmtKm(-remaining, lang()))
          : txt('dueSoon').replace('{n}', fmtKm(remaining, lang())));
      }
      dueTxt += '</span>';
    }
    return '<li class="card"><div><strong>' + esc(serviceTypeLabel(s.type)) + '</strong> \u2014 ' + esc(bikeName(s.bikeId)) +
      '<br><span class="muted">' + esc(s.date) + ' \u00b7 \u09f3' + esc(fmtMoney(s.cost, lang())) +
      ' \u00b7 ' + esc(txt('odoLabel').replace('{n}', fmtKm(s.odometerKm, lang()))) + '</span>' +
      (s.note ? '<br>' + esc(s.note) : '') + dueTxt +
      '</div><div class="row">' +
      '<button type="button" data-edit="' + esc(s.id) + '">' + esc(txt('editBtn')) + '</button>' +
      '<button type="button" class="danger" data-del="' + esc(s.id) + '">' + esc(txt('deleteBtn')) + '</button>' +
      '</div></li>';
  }).join('');
  $('maintList').querySelectorAll('[data-edit]').forEach((b) => {
    b.addEventListener('click', () => startEditService(b.dataset.edit));
  });
  $('maintList').querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!window.confirm(txt('deleteConfirm'))) return;
      state.services = state.services.filter((s) => s.id !== b.dataset.del);
      save();
      showMsg(txt('maintDeleted'));
      render();
    });
  });
}
function readServiceForm() {
  const cost = parseFloat($('maintCostInput').value);
  const odo = parseFloat($('maintOdoInput').value);
  const nextRaw = $('maintNextDueInput').value.trim();
  const next = nextRaw === '' ? null : parseFloat(nextRaw);
  return {
    bikeId: $('maintBikeSelect').value,
    type: $('maintTypeSelect').value,
    date: $('maintDateInput').value,
    cost: Number.isFinite(cost) ? cost : NaN,
    odometerKm: Number.isFinite(odo) ? odo : NaN,
    nextDueKm: next,
    note: $('maintNoteInput').value.trim(),
  };
}
function saveService(ev) {
  ev.preventDefault();
  const cand = readServiceForm();
  const errs = validateService(cand, state.bikes, today);
  const map = { bikeId: 'maintBikeSelect', type: 'maintTypeSelect', date: 'maintDateInput', dateFuture: 'maintDateInput', cost: 'maintCostInput', odometerKm: 'maintOdoInput', nextDueKm: 'maintNextDueInput', note: 'maintNoteInput' };
  for (const id of Object.values(map)) $(id).classList.remove('invalid');
  if (errs.length) {
    for (const e of errs) if (map[e]) $(map[e]).classList.add('invalid');
    $('maintErr').textContent = errs.some((e) => e === 'dateFuture')
      ? txt('errFuture')
      : errs.some((e) => e === 'cost' || e === 'odometerKm' || e === 'nextDueKm') ? txt('errNumber') : txt('errRequired');
    $('maintErr').hidden = false;
    return;
  }
  $('maintErr').hidden = true;
  if (editingServiceId) {
    const i = state.services.findIndex((s) => s.id === editingServiceId);
    if (i >= 0) state.services[i] = { id: editingServiceId, ...cand };
    showMsg(txt('maintSaved'));
  } else {
    state.services.push({ id: uid(), ...cand });
    showMsg(txt('maintAdded'));
  }
  save();
  resetServiceForm();
  render();
}
function startEditService(id) {
  const s = state.services.find((x) => x.id === id);
  if (!s) return;
  editingServiceId = id;
  $('maintFormTitle').textContent = txt('formMaintTitleEdit');
  $('maintBikeSelect').value = s.bikeId;
  $('maintTypeSelect').value = s.type;
  $('maintDateInput').value = s.date;
  $('maintCostInput').value = s.cost;
  $('maintOdoInput').value = s.odometerKm;
  $('maintNextDueInput').value = (s.nextDueKm === null || s.nextDueKm === undefined) ? '' : s.nextDueKm;
  $('maintNoteInput').value = s.note || '';
  $('maintSaveBtn').textContent = txt('saveBtn');
  $('maintCancelBtn').hidden = false;
  $('maintForm').scrollIntoView({ block: 'start' });
}
function resetServiceForm() {
  editingServiceId = null;
  $('maintForm').reset();
  $('maintFormTitle').textContent = txt('formMaintTitle');
  $('maintSaveBtn').textContent = txt('addBtn');
  $('maintCancelBtn').hidden = true;
  $('maintErr').hidden = true;
  markInvalid(['maintBikeSelect', 'maintTypeSelect', 'maintDateInput', 'maintCostInput', 'maintOdoInput', 'maintNextDueInput', 'maintNoteInput']);
}

/* ---------- render all ---------- */
function render() {
  renderStatic();
  renderDashboard();
  renderRides();
  renderBikes();
  renderMaintenance();
}

/* ---------- data tab ---------- */
function bindData() {
  $('exportBtn').addEventListener('click', () => {
    $('exportOut').value = JSON.stringify(state, null, 2);
    $('exportOut').hidden = false;
  });
  $('importFile').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try { data = JSON.parse(reader.result); } catch { data = null; }
      if (!data || !validateImport(data)) {
        showMsg(txt('importBad'));
      } else {
        const oldLang = lang();
        state = data;
        if (!state.lang) state.lang = oldLang;
        save();
        resetRideForm();
        resetBikeForm();
        resetServiceForm();
        showMsg(txt('importOk'));
        render();
      }
      ev.target.value = '';
    };
    reader.readAsText(file);
  });
  $('eraseBtn').addEventListener('click', () => {
    const answer = window.prompt(txt('eraseConfirm'));
    if (answer === null || answer.trim() !== 'DELETE') return;
    const oldLang = lang();
    state = emptyState();
    state.lang = oldLang;
    save();
    resetRideForm();
    resetBikeForm();
    resetServiceForm();
    showMsg(txt('erased'));
    render();
  });
}

/* ---------- init ---------- */
$('langBtn').addEventListener('click', () => {
  state.lang = lang() === 'en' ? 'bn' : 'en';
  save();
  render();
});
document.querySelectorAll('#tabs button').forEach((b) => {
  b.addEventListener('click', () => setTab(b.dataset.tab));
});
$('rideSearchInput').addEventListener('input', () => {
  rideSearchQ = $('rideSearchInput').value;
  renderRides();
});
$('rideBikeFilter').addEventListener('change', () => {
  rideBikeFilter = $('rideBikeFilter').value;
  renderRides();
});
$('maintBikeFilter').addEventListener('change', () => {
  maintBikeFilter = $('maintBikeFilter').value;
  renderMaintenance();
});
$('rideForm').addEventListener('submit', saveRide);
$('rideCancelBtn').addEventListener('click', resetRideForm);
$('bikeForm').addEventListener('submit', saveBike);
$('bikeCancelBtn').addEventListener('click', resetBikeForm);
$('maintForm').addEventListener('submit', saveService);
$('maintCancelBtn').addEventListener('click', resetServiceForm);
bindData();
render();
