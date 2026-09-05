/* Ride Fit — Find: ONE filter state shared by search, the fit checkbox, Rankings and Compare.
   ES5 ONLY. Depends on VVY (fit/roomBand/has). app.js wires the DOM.

   Split by DATA TYPE, not by widget fashion:
   - BINARY / CATEGORICAL attributes -> tri-state need pills (must / nice / don't care).
     Pills populate THEMSELVES from vehicles.json: fixed derivations of existing fields (rows,
     bodyClass, cab, bed...) plus every equipment item observed under record.equipment. A pill is
     shown only when enough vehicles carry data for it (COVERAGE_MIN); partial coverage is labelled.
   - NUMERIC attributes -> range dials with a live histogram of the fleet.
   Both live on the one Find surface. Presets and the shortlist sit on top of the same state. */
var Filters = (function () {
  'use strict';

  var COVERAGE_MIN = 0.20;   /* pill hidden below this share of the fleet with data */
  var COVERAGE_FULL = 0.90;  /* below this the pill says "N of M have data" */
  var MAX_EQUIP = 30;        /* most common equipment items become pills, the rest wait for data */

  /* ---- fixed boolean derivations (value: true/false, or undefined when the field is absent) ---- */
  var BOOL_FIXED = [
    { k: 'fitsCrew', l: 'Fits my crew', g: 'Crew', d: function (c, ctx) { var f = VVY.fit(c, ctx.party); return f.fits === null ? undefined : f.fits; } },
    { k: 'tallBack', l: 'Back seat fits my tallest rider', g: 'Crew', d: function (c, ctx) {
        var ppl = ctx.party.people || [], i, h = 0;
        for (i = 0; i < ppl.length; i++) { if (ppl[i].h > h) { h = ppl[i].h; } }
        if (!h) { return undefined; }
        if (!VVY.has(c.legroom2) || !VVY.has(c.headroom2)) { return undefined; }
        var b = VVY.roomBand(h, c.headroom2, c.legroom2); return b.band === 'roomy' || b.band === 'ok'; } },
    { k: 'rows3', l: '3rd row', g: 'Layout', d: function (c) { return VVY.has(c.rows) ? c.rows >= 3 : undefined; } },
    { k: 'bed', l: 'Pickup bed', g: 'Layout', d: function (c) { return c.bodyClass ? /pickup/.test(c.bodyClass) : undefined; } },
    { k: 'crew', l: 'Crew cab', g: 'Layout', d: function (c) { return c.cab ? c.cab === 'crew' : undefined; } },
    { k: 'liftgate', l: 'Hatch / liftgate', g: 'Layout', d: function (c) { return c.bodyClass ? /crossover|suv|minivan|wagon|hatchback|liftback|cargo-van/.test(c.bodyClass) : undefined; } },
    { k: 'twoDoor', l: 'Two-seater', g: 'Layout', d: function (c) { return VVY.has(c.seats) ? c.seats <= 2 : undefined; } }
  ];
  var BODY = [
    { k: 'crossover', l: 'Crossover', m: /^crossover$/ },
    { k: 'bof', l: 'Body-on-frame SUV', m: /^body-on-frame-suv$/ },
    { k: 'minivan', l: 'Minivan', m: /^minivan$/ },
    { k: 'pickup', l: 'Pickup', m: /pickup/ },
    { k: 'sedan', l: 'Sedan', m: /^sedan$/ },
    { k: 'hatch', l: 'Hatch / liftback', m: /^(hatchback|liftback)$/ },
    { k: 'coupe', l: 'Coupe / roadster', m: /^(coupe|roadster)$/ },
    { k: 'van', l: 'Cargo van', m: /^cargo-van$/ }
  ];

  /* ---- numeric attributes -> dials ---- */
  var DIALS = [
    { k: 'seats', l: 'Seats', g: 'Capacity', u: '' },
    { k: 'legroom2', l: '2nd-row legroom', g: 'Room', u: 'in' },
    { k: 'headroom2', l: '2nd-row headroom', g: 'Room', u: 'in' },
    { k: 'legroom3', l: '3rd-row legroom', g: 'Room', u: 'in' },
    { k: 'legroom1', l: 'Front legroom', g: 'Room', u: 'in' },
    { k: 'headroom1', l: 'Front headroom', g: 'Room', u: 'in' },
    { k: 'shoulder1', l: 'Front shoulder room', g: 'Room', u: 'in' },
    { k: 'length', l: 'Overall length', g: 'Size', u: 'in' },
    { k: 'width', l: 'Width', g: 'Size', u: 'in' },
    { k: 'height', l: 'Height', g: 'Size', u: 'in' },
    { k: 'wheelbase', l: 'Wheelbase', g: 'Size', u: 'in' },
    { k: 'clearance', l: 'Ground clearance', g: 'Capability', u: 'in' },
    { k: 'weight', l: 'Curb weight', g: 'Capability', u: 'lb' },
    { k: 'towing', l: 'Max towing', g: 'Capability', u: 'lb' },
    { k: 'payload', l: 'Max payload', g: 'Capability', u: 'lb' },
    { k: 'cargo1', l: 'Cargo, seats folded', g: 'Capacity', u: 'cu ft' },
    { k: 'cargo2', l: 'Cargo behind 2nd row', g: 'Capacity', u: 'cu ft' },
    { k: 'bedLen', l: 'Bed length', g: 'Capability', u: 'in' }
  ];
  var DIAL_GROUPS = ['Capacity', 'Room', 'Size', 'Capability'];

  var PRESETS = [
    { k: 'family5', l: 'Family of five', must: ['fitsCrew'], nice: ['rows3', 'liftgate'], ranges: { seats: [5, null] } },
    { k: 'tall', l: 'Tall driver', must: [], nice: ['tallBack'], ranges: { legroom1: [42, null], headroom1: [39.5, null] } },
    { k: 'dog', l: 'Dog owner', must: ['liftgate'], nice: [], ranges: { clearance: [7, null] } },
    { k: 'tow', l: 'Tow a boat', must: [], nice: ['rows3'], ranges: { towing: [5000, null] } },
    { k: 'city', l: 'City parking', must: [], nice: ['liftgate'], ranges: { length: [null, 190], height: [null, 70] } },
    { k: 'trail', l: 'Trail / snow', must: [], nice: ['bed'], ranges: { clearance: [8, null] } }
  ];

  var state = { must: {}, nice: {}, body: {}, brands: {}, ranges: {}, preset: null, openGroups: { Capacity: true, Room: true } };
  var ctx = { party: { people: [] } };
  var ALL = [];
  var stats = {};        /* dial histograms */
  var BOOLS = [];        /* the live pill list: fixed derivations + auto equipment, with coverage */
  var equipCoverage = 0;

  function setContext(c) { ctx = c; }

  function equipHas(c, item) {
    if (!c.equipment || !c.equipment.trims) { return undefined; }
    var t, tr, i;
    for (t in c.equipment.trims) {
      if (!c.equipment.trims.hasOwnProperty(t)) { continue; }
      tr = c.equipment.trims[t];
      for (i = 0; i < (tr.standard || []).length; i++) { if (tr.standard[i] === item) { return true; } }
    }
    return false;   /* has equipment data, item not standard on the observed trim */
  }

  function setVehicles(list) {
    ALL = list;
    var i, j, k, d, vals, b, lo, hi, n, bins;
    /* dials */
    for (i = 0; i < DIALS.length; i++) {
      d = DIALS[i]; k = d.k; vals = [];
      for (j = 0; j < ALL.length; j++) { if (VVY.has(ALL[j][k])) { vals.push(ALL[j][k]); } }
      vals.sort(function (a, b2) { return a - b2; });
      if (vals.length < 3) { stats[k] = null; continue; }
      lo = vals[0]; hi = vals[vals.length - 1]; n = 12; bins = [];
      for (b = 0; b < n; b++) { bins.push(0); }
      for (j = 0; j < vals.length; j++) { b = hi === lo ? 0 : Math.min(n - 1, Math.floor((vals[j] - lo) / (hi - lo) * n)); bins[b]++; }
      stats[k] = { lo: lo, hi: hi, bins: bins, n: vals.length, max: Math.max.apply(null, bins) };
    }
    /* pills: fixed derivations */
    BOOLS = [];
    for (i = 0; i < BOOL_FIXED.length; i++) { BOOLS.push({ k: BOOL_FIXED[i].k, l: BOOL_FIXED[i].l, g: BOOL_FIXED[i].g, d: BOOL_FIXED[i].d, auto: false }); }
    /* pills: auto-discovered equipment items */
    var counts = {}, withEquip = 0, item, t, tr;
    for (j = 0; j < ALL.length; j++) {
      if (!ALL[j].equipment || !ALL[j].equipment.trims) { continue; }
      withEquip++;
      for (t in ALL[j].equipment.trims) {
        if (!ALL[j].equipment.trims.hasOwnProperty(t)) { continue; }
        tr = ALL[j].equipment.trims[t];
        for (i = 0; i < (tr.standard || []).length; i++) { item = tr.standard[i]; counts[item] = (counts[item] || 0) + 1; }
      }
    }
    equipCoverage = withEquip;
    var items = [];
    for (item in counts) { if (counts.hasOwnProperty(item)) { items.push({ item: item, n: counts[item] }); } }
    items.sort(function (a, b2) { return b2.n - a.n; });
    for (i = 0; i < items.length && i < MAX_EQUIP; i++) {
      BOOLS.push({ k: 'eq:' + items[i].item, l: items[i].item, g: 'Equipment', auto: true,
        d: (function (it) { return function (c) { return equipHas(c, it); }; })(items[i].item) });
    }
    /* coverage per pill (how many vehicles have a defined value) */
    for (i = 0; i < BOOLS.length; i++) {
      n = 0;
      for (j = 0; j < ALL.length; j++) { if (BOOLS[i].d(ALL[j], ctx) !== undefined) { n++; } }
      BOOLS[i].coverage = n;
    }
    buildCatalog();
  }

  function boolByKey(k) { var i; for (i = 0; i < BOOLS.length; i++) { if (BOOLS[i].k === k) { return BOOLS[i]; } } return null; }
  function visible(b) { return b.coverage >= ALL.length * COVERAGE_MIN || (b.g === 'Crew'); }

  function bodyMatches(c) {
    var any = false, i;
    for (i = 0; i < BODY.length; i++) { if (state.body[BODY[i].k]) { any = true; if (BODY[i].m.test(c.bodyClass || '')) { return true; } } }
    return !any;
  }

  /* THE predicate */
  function brandMatches(c) {
    var any = false, k;
    for (k in state.brands) { if (state.brands[k]) { any = true; if (c.brand === k) { return true; } } }
    return !any;
  }
  function matches(c) {
    var k, b, v;
    if (!bodyMatches(c)) { return false; }
    if (!brandMatches(c)) { return false; }
    for (k in state.must) {
      if (!state.must[k]) { continue; }
      b = boolByKey(k); if (!b) { continue; }
      v = b.d(c, ctx);
      if (v !== true) { return false; }   /* unknown counts as not matching a MUST; the pill label says how many have data */
    }
    for (k in state.ranges) {
      if (!state.ranges[k]) { continue; }
      if (!VVY.has(c[k])) { return false; }
      if (c[k] < state.ranges[k][0] || c[k] > state.ranges[k][1]) { return false; }
    }
    return true;
  }
  function niceScore(c) { var k, b, s = 0; for (k in state.nice) { if (state.nice[k]) { b = boolByKey(k); if (b && b.d(c, ctx) === true) { s++; } } } return s; }
  function isActive() {
    var k; for (k in state.must) { if (state.must[k]) { return true; } }
    for (k in state.nice) { if (state.nice[k]) { return true; } }
    for (k in state.body) { if (state.body[k]) { return true; } }
    for (k in state.brands) { if (state.brands[k]) { return true; } }
    for (k in state.ranges) { if (state.ranges[k]) { return true; } }
    return false;
  }
  function count() { var i, n = 0; for (i = 0; i < ALL.length; i++) { if (matches(ALL[i])) { n++; } } return n; }

  function cycleNeed(k) {
    if (state.must[k]) { delete state.must[k]; state.nice[k] = true; }
    else if (state.nice[k]) { delete state.nice[k]; }
    else { state.must[k] = true; }
    state.preset = null;
  }
  function setMust(k, on) { if (on) { state.must[k] = true; delete state.nice[k]; } else { delete state.must[k]; } state.preset = null; }
  function toggleBody(k) { if (state.body[k]) { delete state.body[k]; } else { state.body[k] = true; } state.preset = null; }
  function setRange(k, lo, hi) {
    var s = stats[k]; if (!s) { return; }
    if (lo <= s.lo && hi >= s.hi) { delete state.ranges[k]; } else { state.ranges[k] = [lo, hi]; }
    state.preset = null;
  }
  function clear() { state.must = {}; state.nice = {}; state.body = {}; state.brands = {}; state.ranges = {}; state.preset = null; }
  function toggleBrand(k) { if (state.brands[k]) { delete state.brands[k]; } else { state.brands[k] = true; } state.preset = null; }
  function applyPreset(k) {
    var i, p = null, r, s;
    for (i = 0; i < PRESETS.length; i++) { if (PRESETS[i].k === k) { p = PRESETS[i]; } }
    if (!p) { return; }
    if (state.preset === k) { clear(); return; }
    clear(); state.preset = k;
    for (i = 0; i < p.must.length; i++) { state.must[p.must[i]] = true; }
    for (i = 0; i < p.nice.length; i++) { state.nice[p.nice[i]] = true; }
    for (r in p.ranges) {
      if (!p.ranges.hasOwnProperty(r) || !stats[r]) { continue; }
      s = stats[r];
      state.ranges[r] = [p.ranges[r][0] === null ? s.lo : p.ranges[r][0], p.ranges[r][1] === null ? s.hi : p.ranges[r][1]];
      state.openGroups[dialGroup(r)] = true;
    }
  }
  function dialGroup(k) { var i; for (i = 0; i < DIALS.length; i++) { if (DIALS[i].k === k) { return DIALS[i].g; } } return null; }

  /* ---------- rendering ---------- */
  var esc = function (s) { return VVY.esc(s); };
  function fmtV(k, v) { if (k === 'seats') { return String(Math.round(v)); } if (k === 'weight' || k === 'towing' || k === 'payload') { return VVY.mass(v, false); } if (k === 'cargo1' || k === 'cargo2') { return (Math.round(v * 10) / 10) + ' cu ft'; } return VVY.shortDim(v, false); }

  /* ---------- typeahead catalog: every filterable thing as a suggestion ---------- */
  var NAMED = [   /* named numeric conditions -> ranges (they also show on the dials) */
    { k: 'seats5', l: 'Seats 5 or more', f: 'seats', lo: 5, hi: null, syn: 'family five people kids' },
    { k: 'seats7', l: 'Seats 7 or more', f: 'seats', lo: 7, hi: null, syn: 'family big seven eight' },
    { k: 'leg3adult', l: 'Adult-usable 3rd row (33 in+ legroom)', f: 'legroom3', lo: 33, hi: null, syn: 'third row rear adults' },
    { k: 'leg2tall', l: 'Tall adult in back (40 in+ 2nd-row legroom)', f: 'legroom2', lo: 40, hi: null, syn: 'tall teenager rear legroom back seat' },
    { k: 'frontRoomy', l: 'Roomy driver seat (42 in+ front legroom)', f: 'legroom1', lo: 42, hi: null, syn: 'tall driver' },
    { k: 'clear8', l: 'Ground clearance 8 in or more', f: 'clearance', lo: 8, hi: null, syn: 'off-road snow trail lifted' },
    { k: 'short190', l: 'Under 190 in long', f: 'length', lo: null, hi: 190, syn: 'small compact city parking short' },
    { k: 'low70', l: 'Under 70 in tall (garage-friendly)', f: 'height', lo: null, hi: 70, syn: 'garage low parking' },
    { k: 'light4500', l: 'Under 4,500 lb', f: 'weight', lo: null, hi: 4500, syn: 'light efficient' },
    { k: 'tow5k', l: 'Tows 5,000 lb or more', f: 'towing', lo: 5000, hi: null, syn: 'boat trailer camper towing' },
    { k: 'cargo30', l: 'Cargo behind rear seats 30 cu ft+', f: 'cargo2', lo: 30, hi: null, syn: 'dog stroller luggage trunk space' }
  ];
  var SYN = { fitsCrew: 'crew everyone fit seats', tallBack: 'tall rear back seat rider', rows3: 'third row seven three-row', bed: 'truck pickup bed haul', crew: 'crew cab pickup four-door', liftgate: 'hatch liftgate dog cargo tailgate', twoDoor: 'roadster sports two-seater' };

  var CATALOG = [];
  function buildCatalog() {
    CATALOG = [];
    var i, j, seen = {};
    for (i = 0; i < BOOLS.length; i++) {
      if (!visible(BOOLS[i])) { continue; }
      CATALOG.push({ t: 'need', k: BOOLS[i].k, l: BOOLS[i].l, g: BOOLS[i].g === 'Equipment' ? 'Equipment' : 'Needs', syn: (SYN[BOOLS[i].k] || '') + ' ' + BOOLS[i].g, cov: BOOLS[i].coverage });
    }
    for (i = 0; i < NAMED.length; i++) { if (stats[NAMED[i].f]) { CATALOG.push({ t: 'named', k: NAMED[i].k, l: NAMED[i].l, g: 'Numbers', syn: NAMED[i].syn + ' ' + NAMED[i].f }); } }
    for (i = 0; i < BODY.length; i++) { CATALOG.push({ t: 'body', k: BODY[i].k, l: BODY[i].l, g: 'Body type', syn: 'body type ' + BODY[i].m.source.replace(/[^a-z ]/g, ' ') }); }
    for (j = 0; j < ALL.length; j++) { if (!seen[ALL[j].brand]) { seen[ALL[j].brand] = true; CATALOG.push({ t: 'brand', k: ALL[j].brand, l: ALL[j].brand, g: 'Brand', syn: 'brand make ' + ALL[j].brand }); } }
    for (i = 0; i < PRESETS.length; i++) { CATALOG.push({ t: 'preset', k: PRESETS[i].k, l: PRESETS[i].l, g: 'Start from', syn: 'preset bundle' }); }
  }
  var POPULAR = ['need:fitsCrew', 'need:rows3', 'named:seats5', 'named:leg2tall', 'need:liftgate', 'named:clear8', 'named:short190', 'named:tow5k', 'need:bed', 'body:crossover'];

  function isOn(e) {
    if (e.t === 'need') { return !!(state.must[e.k] || state.nice[e.k]); }
    if (e.t === 'body') { return !!state.body[e.k]; }
    if (e.t === 'brand') { return !!state.brands[e.k]; }
    if (e.t === 'preset') { return state.preset === e.k; }
    if (e.t === 'named') { var n = namedByKey(e.k), r = state.ranges[n.f], s2 = stats[n.f]; if (!r || !s2) { return false; } return (n.lo === null || r[0] >= n.lo) && (n.hi === null || r[1] <= n.hi); }
    return false;
  }
  function namedByKey(k) { var i; for (i = 0; i < NAMED.length; i++) { if (NAMED[i].k === k) { return NAMED[i]; } } return null; }

  /* suggestions: empty query -> browsable (popular first, then every group); typed -> substring over label+synonyms */
  function suggest(q) {
    q = (q || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var out = [], i, e, words = q ? q.split(/\s+/) : [], w, ok, hay;
    if (!q) {
      var pop = [];
      for (i = 0; i < POPULAR.length; i++) { e = catByRef(POPULAR[i]); if (e && !isOn(e)) { pop.push(e); } }
      return { popular: pop, groups: groupAll(null) };
    }
    for (i = 0; i < CATALOG.length; i++) {
      e = CATALOG[i]; hay = (e.l + ' ' + e.syn + ' ' + e.g).toLowerCase(); ok = true;
      for (w = 0; w < words.length; w++) { if (hay.indexOf(words[w]) < 0) { ok = false; break; } }
      if (ok) { out.push(e); }
    }
    return { popular: [], groups: groupAll(out) };
  }
  function catByRef(ref) { var i, p = ref.split(':'); for (i = 0; i < CATALOG.length; i++) { if (CATALOG[i].t === p[0] && CATALOG[i].k === p[1]) { return CATALOG[i]; } } return null; }
  function groupAll(list) {
    var src = list || CATALOG, order = ['Start from', 'Needs', 'Numbers', 'Body type', 'Brand', 'Equipment'], g, i, out = [], items;
    for (g = 0; g < order.length; g++) {
      items = [];
      for (i = 0; i < src.length; i++) { if (src[i].g === order[g]) { items.push(src[i]); } }
      if (items.length) { out.push({ g: order[g], items: items }); }
    }
    return out;
  }

  function add(ref) {
    var e = catByRef(ref); if (!e) { return; }
    if (e.t === 'need') { if (!state.must[e.k] && !state.nice[e.k]) { state.must[e.k] = true; state.preset = null; } }
    else if (e.t === 'body') { state.body[e.k] = true; state.preset = null; }
    else if (e.t === 'brand') { state.brands[e.k] = true; state.preset = null; }
    else if (e.t === 'preset') { applyPreset(e.k); }
    else if (e.t === 'named') { var n = namedByKey(e.k), s2 = stats[n.f]; if (s2) { var cur = state.ranges[n.f] || [s2.lo, s2.hi]; setRange(n.f, n.lo === null ? cur[0] : Math.max(cur[0], n.lo), n.hi === null ? cur[1] : Math.min(cur[1], n.hi)); state.openGroups[dialGroup(n.f)] = true; } }
  }
  function remove(ref) {
    var p = ref.split(':'), t = p[0], k = p[1];
    if (t === 'need') { delete state.must[k]; delete state.nice[k]; }
    else if (t === 'body') { delete state.body[k]; }
    else if (t === 'brand') { delete state.brands[k]; }
    else if (t === 'range') { delete state.ranges[k]; }
    else if (t === 'preset') { clear(); }
    state.preset = t === 'preset' ? null : state.preset;
  }

  /* active filters as compact tokens; need tokens toggle must <-> nice on tap */
  function tokensHtml() {
    var o = [], k, b, d, r, i;
    if (state.preset) { for (i = 0; i < PRESETS.length; i++) { if (PRESETS[i].k === state.preset) { o.push(tok('preset:' + state.preset, PRESETS[i].l, 'preset', false)); } } }
    for (k in state.must) { if (state.must[k]) { b = boolByKey(k); if (b) { o.push(tok('need:' + k, b.l, 'must', true)); } } }
    for (k in state.nice) { if (state.nice[k]) { b = boolByKey(k); if (b) { o.push(tok('need:' + k, b.l, 'nice', true)); } } }
    for (k in state.body) { if (state.body[k]) { for (i = 0; i < BODY.length; i++) { if (BODY[i].k === k) { o.push(tok('body:' + k, BODY[i].l, 'body', false)); } } } }
    for (k in state.brands) { if (state.brands[k]) { o.push(tok('brand:' + k, k, 'brand', false)); } }
    for (k in state.ranges) {
      if (!state.ranges[k]) { continue; }
      d = dialByKey(k); r = state.ranges[k]; var s2 = stats[k];
      var lbl = (d ? d.l : k) + ' ' + (s2 && r[0] > s2.lo && r[1] < s2.hi ? fmtV(k, r[0]) + '–' + fmtV(k, r[1]) : (s2 && r[0] > s2.lo ? fmtV(k, r[0]) + '+' : '≤ ' + fmtV(k, r[1])));
      o.push(tok('range:' + k, lbl, 'range', false));
    }
    if (!o.length) { return '<span class="ftok-empty">No filters yet — tap Browse or type a need.</span>'; }
    return o.join('');
  }
  function tok(ref, label, cls, toggle) {
    return '<span class="ftok ' + cls + '" data-ref="' + esc(ref) + '">' + (toggle ? '<button type="button" class="ftog" data-toggle="' + esc(ref) + '" title="must / nice to have">' + (cls === 'must' ? 'must' : 'nice') + '</button>' : '') + '<span class="fl">' + esc(label) + '</span><button type="button" class="fx" data-remove="' + esc(ref) + '" title="Remove">&#215;</button></span>';
  }
  function toggleNeed(k) { if (state.must[k]) { delete state.must[k]; state.nice[k] = true; } else if (state.nice[k]) { delete state.nice[k]; state.must[k] = true; } }

  function panelHtml(q) {
    var s2 = suggest(q), o = [], i, g, e, items, shown = 0;
    if (s2.popular.length) {
      o.push('<div class="fsug-g"><h5>Popular</h5>');
      for (i = 0; i < s2.popular.length; i++) { o.push(sugBtn(s2.popular[i])); }
      o.push('</div>');
    }
    for (g = 0; g < s2.groups.length; g++) {
      items = s2.groups[g].items;
      o.push('<div class="fsug-g"><h5>' + esc(s2.groups[g].g) + '</h5>');
      for (i = 0; i < items.length; i++) { o.push(sugBtn(items[i])); shown++; }
      o.push('</div>');
    }
    if (!shown && !s2.popular.length) { o.push('<p class="hint">Nothing matches "' + esc(q) + '". Try "third row", "tall", "tow", "crew cab", a brand or a body type.</p>'); }
    o.push('<p class="hint fsug-note">Equipment (sunroof, heated seats…) shows up here automatically once enough vehicles carry that data — ' + equipCoverage + ' of ' + ALL.length + ' do today.</p>');
    return o.join('');
  }
  function sugBtn(e) {
    var cov = (e.t === 'need' && e.cov < ALL.length * COVERAGE_FULL && e.g !== 'Crew') ? ' <small>' + e.cov + ' of ' + ALL.length + ' have data</small>' : '';
    return '<button type="button" class="fsug' + (isOn(e) ? ' on' : '') + '" data-add="' + esc(e.t + ':' + e.k) + '">' + esc(e.l) + cov + '</button>';
  }

  function presetsHtml() {
    var o = ['<div class="fpresets">'], i;
    for (i = 0; i < PRESETS.length; i++) { o.push('<button type="button" class="fpre' + (state.preset === PRESETS[i].k ? ' on' : '') + '" data-add="preset:' + PRESETS[i].k + '">' + esc(PRESETS[i].l) + '</button>'); }
    o.push('</div>');
    return o.join('');
  }

  function dialHtml(d) {
    var s = stats[d.k]; if (!s) { return ''; }
    var r = state.ranges[d.k] || [s.lo, s.hi], i, h, on, o = [];
    var step = d.k === 'seats' ? 1 : (d.k === 'weight' || d.k === 'towing' || d.k === 'payload' ? 50 : 0.5);
    o.push('<div class="dial" data-dial="' + d.k + '"><div class="lab"><b>' + esc(d.l) + '</b><span>' + esc(fmtV(d.k, r[0]) + ' – ' + fmtV(d.k, r[1])) + (state.ranges[d.k] ? '' : ' (any)') + '</span></div><div class="hist">');
    for (i = 0; i < s.bins.length; i++) {
      var bLo = s.lo + (s.hi - s.lo) * i / s.bins.length, bHi = s.lo + (s.hi - s.lo) * (i + 1) / s.bins.length;
      on = bHi >= r[0] && bLo <= r[1];
      h = s.max ? Math.max(6, Math.round(s.bins[i] / s.max * 100)) : 6;
      o.push('<i class="' + (on ? 'on' : '') + '" style="height:' + h + '%"></i>');
    }
    o.push('</div><div class="dual"><input type="range" class="rlo" min="' + s.lo + '" max="' + s.hi + '" step="' + step + '" value="' + r[0] + '" aria-label="' + esc(d.l) + ' minimum"><input type="range" class="rhi" min="' + s.lo + '" max="' + s.hi + '" step="' + step + '" value="' + r[1] + '" aria-label="' + esc(d.l) + ' maximum"></div>');
    o.push('<div class="lab small"><span>' + esc(fmtV(d.k, s.lo)) + '</span><span>' + (s.n < ALL.length * COVERAGE_FULL ? s.n + ' of ' + ALL.length + ' have data' : s.n + ' vehicles') + '</span><span>' + esc(fmtV(d.k, s.hi)) + '</span></div></div>');
    return o.join('');
  }

  function dialsHtml() {
    var o = [], g, j, active, anyDial;
    o.push('<h4>Dial it in <span class="vvy-note">numbers &middot; drag the ends, bars show where vehicles cluster</span></h4>');
    for (g = 0; g < DIAL_GROUPS.length; g++) {
      active = 0; anyDial = false;
      for (j = 0; j < DIALS.length; j++) { if (DIALS[j].g === DIAL_GROUPS[g] && stats[DIALS[j].k]) { anyDial = true; if (state.ranges[DIALS[j].k]) { active++; } } }
      if (!anyDial) { continue; }
      o.push('<div class="dgroup' + (state.openGroups[DIAL_GROUPS[g]] ? ' open' : '') + '"><button type="button" class="dhead" data-group="' + DIAL_GROUPS[g] + '">' + DIAL_GROUPS[g] + (active ? ' <b>' + active + ' set</b>' : '') + '<span class="caret">&#9662;</span></button>');
      if (state.openGroups[DIAL_GROUPS[g]]) {
        o.push('<div class="dials">');
        for (j = 0; j < DIALS.length; j++) { if (DIALS[j].g === DIAL_GROUPS[g] && stats[DIALS[j].k]) { o.push(dialHtml(DIALS[j])); } }
        o.push('</div>');
      }
      o.push('</div>');
    }
    return o.join('');
  }

  function html() { return dialsHtml(); }   /* dials only; typeahead + tokens are rendered by app.js into their own containers */
  function toggleGroup(g) { state.openGroups[g] = !state.openGroups[g]; }
  function dialByKey(k) { var i; for (i = 0; i < DIALS.length; i++) { if (DIALS[i].k === k) { return DIALS[i]; } } return null; }

  return {
    state: state, BODY: BODY, DIALS: DIALS, PRESETS: PRESETS,
    setContext: setContext, setVehicles: setVehicles, bools: function () { return BOOLS; },
    matches: matches, niceScore: niceScore, isActive: isActive, count: count,
    cycleNeed: cycleNeed, setMust: setMust, toggleBody: toggleBody, toggleBrand: toggleBrand, setRange: setRange, applyPreset: applyPreset, clear: clear,
    html: html, dialHtml: dialHtml, dialByKey: dialByKey, toggleGroup: toggleGroup,
    buildCatalog: buildCatalog, suggest: suggest, add: add, remove: remove, toggleNeed: toggleNeed,
    tokensHtml: tokensHtml, panelHtml: panelHtml, presetsHtml: presetsHtml
  };
})();
