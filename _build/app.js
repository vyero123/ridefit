/* vehicles-vs-you : UI wiring. ES5 ONLY. */
(function () {
  'use strict';

  var D = null;   /* filled by RideFitData.load() in start(); the app never reads raw records */
  var FLAT = [];
  var state = {
    a: null, b: null,
    person: 75, metric: false,
    lift: 0, tireMode: 'stock', tireCustom: 35,
    layout: 'overlay',
    pickTarget: 'A',
    tab: 'vehicle',
    rankSort: 'height', rankDir: -1, rankFilter: '', rankClass: '',
    party: { adults: 0, kids: 0, dogs: 0, cats: 0, people: [] }, fitOnly: false, shortlist: []
  };
  var reduceMotion = false;
  try {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e0) { reduceMotion = false; }

  function byId(id) { return document.getElementById(id); }
  /* Wrap every event handler so one bad tap reports through window.onerror instead of killing the
     handler chain. Reports each distinct message once. */
  var reported = {};
  function safe(fn) {
    return function (e) {
      try { return fn.call(this, e); }
      catch (err) {
        var msg = (err && err.message) ? err.message : String(err);
        if (!reported[msg]) { reported[msg] = true; try { window.RideFitReport(err, 'handler'); } catch (e2) {} }
        return undefined;
      }
    };
  }
  var supportsPassive = false;
  try { window.addEventListener('x', null, Object.defineProperty({}, 'passive', { get: function () { supportsPassive = true; return true; } })); } catch (e1) { supportsPassive = false; }
  function listen(el, type, fn) { if (el.addEventListener) { el.addEventListener(type, safe(fn), supportsPassive ? { passive: true } : false); } }
  function esc(s) { return VVY.esc(s); }

  function flatten() {
    var bi, mi, ci, b, m, c;
    for (bi = 0; bi < D.brands.length; bi++) {
      b = D.brands[bi];
      for (mi = 0; mi < b.models.length; mi++) {
        m = b.models[mi];
        for (ci = 0; ci < m.configs.length; ci++) {
          c = m.configs[ci];
          c.brand = b.name;
          c.model = m.name;
          c.fullName = b.name + ' ' + m.name + ' — ' + c.name;
          c.key = bi + '|' + mi + '|' + ci;
          c.search = (b.name + ' ' + m.name + ' ' + c.name + ' ' + (c.bodyClass || '')).toLowerCase();
          FLAT.push(c);
        }
      }
    }
  }

  function find(key) {
    var i; for (i = 0; i < FLAT.length; i++) { if (FLAT[i].key === key) { return FLAT[i]; } }
    return FLAT[0];
  }

  function opt(v, t, sel) {
    return '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>';
  }

  /* ---------- selectors ---------- */

  function fillTriple(key, ids, allowNone) {
    var i, s;
    if (!key) {
      byId(ids[0]).innerHTML = '<option value="" selected>— none —</option>' + (function () {
        var t = []; for (i = 0; i < D.brands.length; i++) { t.push(opt(i, D.brands[i].name, false)); } return t.join('');
      })();
      byId(ids[1]).innerHTML = '';
      byId(ids[2]).innerHTML = '';
      return;
    }
    var p = key.split('|');
    var bi = parseInt(p[0], 10), mi = parseInt(p[1], 10), ci = parseInt(p[2], 10);
    s = [];
    if (allowNone) { s.push('<option value="">— none —</option>'); }
    for (i = 0; i < D.brands.length; i++) { s.push(opt(i, D.brands[i].name, i === bi)); }
    byId(ids[0]).innerHTML = s.join('');
    s = [];
    var models = D.brands[bi].models;
    for (i = 0; i < models.length; i++) { s.push(opt(i, models[i].name, i === mi)); }
    byId(ids[1]).innerHTML = s.join('');
    s = [];
    var confs = models[mi].configs;
    for (i = 0; i < confs.length; i++) { s.push(opt(i, confs[i].name, i === ci)); }
    byId(ids[2]).innerHTML = s.join('');
  }

  function fillSelects() {
    fillTriple(state.a, ['brandSel', 'modelSel', 'configSel'], false);
    fillTriple(state.a, ['brandSelA2', 'modelSelA2', 'configSelA2'], false);
    fillTriple(state.b, ['brandSelB', 'modelSelB', 'configSelB'], true);
  }

  /* ---------- mods ---------- */

  function currentMods() {
    var tireDia = null;
    if (state.tireMode === 'custom') { tireDia = parseFloat(state.tireCustom); if (isNaN(tireDia) || tireDia < 15 || tireDia > 60) { tireDia = null; } }
    else if (state.tireMode !== 'stock') { tireDia = parseFloat(state.tireMode); }
    return { lift: state.lift, tireDia: tireDia };
  }

  function label(c) { return c.brand + ' ' + c.model; }
  /* people[] holds every rider except the reference person (you). Counts are derived from it so
     the fit logic keeps working: adults = 1 (you) + extra adults, kids = kids. */
  function syncCounts() {
    var i, ad = 1, kd = 0;
    for (i = 0; i < state.party.people.length; i++) { if (state.party.people[i].kind === 'kid') { kd++; } else { ad++; } }
    state.party.adults = ad; state.party.kids = kd;
  }
  function partyActive() { return true; }
  function fmtH(inches) { return VVY.personLabel(inches, state.metric); }
  function peopleHtml() {
    var o = [], i, p;
    o.push(prowHtml('you', 'You', 'reference figure · adult', state.person, true));
    for (i = 0; i < state.party.people.length; i++) {
      p = state.party.people[i];
      o.push(prowHtml(i, p.kind === 'kid' ? 'Kid ' + (kidIndex(i)) : 'Adult ' + (adultIndex(i)), p.kind === 'kid' ? 'default 3\'9" (about age 6)' : 'default 5\'6" (typical adult)', p.h, false));
    }
    return o.join('');
  }
  function adultIndex(i) { var n = 1, k; for (k = 0; k <= i; k++) { if (state.party.people[k].kind !== 'kid') { n++; } } return n; }
  function kidIndex(i) { var n = 0, k; for (k = 0; k <= i; k++) { if (state.party.people[k].kind === 'kid') { n++; } } return n; }
  function prowHtml(id, who, sub, h, isYou) {
    return '<div class="prow' + (isYou ? ' you' : '') + '" data-pid="' + id + '">' +
      '<div class="who">' + esc(who) + '<small>' + esc(sub) + '</small></div>' +
      '<div class="hctl">' +
      '<button type="button" class="hbtn" data-hd="-1" title="1 inch shorter">&#8722;</button>' +
      '<button type="button" class="hval" data-toggle="1" title="Tap for a slider">' + esc(fmtH(h)) + '</button>' +
      '<button type="button" class="hbtn" data-hd="1" title="1 inch taller">+</button>' +
      (isYou ? '<button type="button" class="rm" disabled title="You are the reference figure and can\'t be removed">&#215;</button>' : '<button type="button" class="rm" data-rm="1" title="Remove">&#215;</button>') +
      '</div>' +
      '<input type="range" class="hrange" min="' + (isYou ? 48 : 30) + '" max="84" step="1" value="' + Math.round(h) + '" aria-label="Height">' +
      '</div>';
  }
  function personAt(pid) { return pid === 'you' ? null : state.party.people[parseInt(pid, 10)]; }
  function getH(pid) { var p = personAt(pid); return p ? p.h : state.person; }
  function setH(pid, v) {
    var p = personAt(pid); var lo = p ? 30 : 48;
    if (v < lo) { v = lo; } if (v > 84) { v = 84; }
    if (p) { p.h = v; } else { state.person = v; }
  }
  function onPeopleClick(e) {
    var t = e.target || e.srcElement, row = t;
    while (row && row !== document.body && !(row.getAttribute && row.getAttribute('data-pid') !== null && row.getAttribute('data-pid') !== undefined && row.className && row.className.indexOf('prow') >= 0)) { row = row.parentNode; }
    if (!row || row === document.body) { return; }
    var pid = row.getAttribute('data-pid');
    if (t.getAttribute('data-hd')) { setH(pid, getH(pid) + parseInt(t.getAttribute('data-hd'), 10)); render(); return; }
    if (t.getAttribute('data-rm')) { state.party.people.splice(parseInt(pid, 10), 1); render(); return; }
    if (t.getAttribute('data-toggle')) {
      var open = row.className.indexOf('open') >= 0;
      var rows = document.querySelectorAll('#people .prow'), i;
      for (i = 0; i < rows.length; i++) { rows[i].className = rows[i].className.replace(/\s*open/g, ''); }
      if (!open) { row.className += ' open'; try { row.querySelector('.hrange').focus(); } catch (e0) {} }
    }
  }
  function onPeopleInput(e) {
    var t = e.target || e.srcElement;
    if (!t || t.className !== 'hrange') { return; }
    var row = t.parentNode, pid = row.getAttribute('data-pid');
    setH(pid, parseInt(t.value, 10));
    var open = row.className.indexOf('open') >= 0;
    render();
    if (open) { var nr = document.querySelector('#people .prow[data-pid="' + pid + '"]'); if (nr) { nr.className += ' open'; } }
  }
  function fitsParty(c) { var f = VVY.fit(c, state.party); return f.fits !== false; }
  /* THE shared predicate: every list in the app goes through this */
  function passes(c) { return Filters.matches(c); }
  function inShort(k) { var i; for (i = 0; i < state.shortlist.length; i++) { if (state.shortlist[i] === k) { return true; } } return false; }
  function toggleShort(k) {
    var i; for (i = 0; i < state.shortlist.length; i++) { if (state.shortlist[i] === k) { state.shortlist.splice(i, 1); render(); return; } }
    if (state.shortlist.length < 8) { state.shortlist.push(k); }
    render();
  }
  function heartBtn(c) { return '<button type="button" class="heart' + (inShort(c.key) ? ' on' : '') + '" data-heart="' + c.key + '" title="Shortlist">&#9829;</button>'; }
  function fitBadge(c) {
    if (!partyActive()) { return ''; }
    var f = VVY.fit(c, state.party);
    return '<span class="fitbadge ' + (f.fits ? 'ok' : 'no') + '">' + (f.fits ? 'fits' : 'no fit') + '</span>';
  }

  /* ---------- render ---------- */

  var lastKeyA = null, lastKeyB = null;

  function render() {
    syncCounts();
    var A = find(state.a);
    var eA = VVY.effective(A, currentMods());
    var B = state.b ? find(state.b) : null;
    var eB = B ? VVY.effective(B, null) : null;
    var changed = (state.a !== lastKeyA) || (state.b !== lastKeyB);
    lastKeyA = state.a; lastKeyB = state.b;

    var vehicles = [eA]; if (eB) { vehicles.push(eB); }
    var scene = byId('scene');
    scene.innerHTML = VVY.renderScene(vehicles, state.person, state.metric, { layout: state.layout, animate: changed && !reduceMotion, party: state.party, interactive: true });
    if (changed && !reduceMotion) {
      scene.className = scene.className.replace(/\s*vvy-anim/g, '');
      void scene.offsetWidth;
      scene.className += ' vvy-anim';
    }

    byId('fitLine').innerHTML = VVY.fitHtml(A, state.party);
    byId('fitBox').innerHTML = VVY.fitHtml(A, state.party);
    byId('room').innerHTML = VVY.roomHtml(A, state.party, state.metric);
    byId('roomBox').innerHTML = VVY.roomHtml(A, state.party, state.metric);
    byId('people').innerHTML = peopleHtml();
    byId('dogsVal').innerHTML = state.party.dogs;
    byId('catsVal').innerHTML = state.party.cats;
    Cats.start(scene);
    state.fitOnly = !!Filters.state.must.fitsCrew;
    byId('fitOnly').checked = state.fitOnly;
    byId('fitOnlyRank').checked = state.fitOnly;
    Filters.setContext({ party: state.party });
    renderFind();
    renderShortlist(A, B);
    byId('specs').innerHTML = VVY.specsHtml(eA, state.metric);
    byId('comps').innerHTML = VVY.compsHtml(eA, state.person, state.metric);
    byId('srcNote').innerHTML = VVY.sourceHtml(A);
    byId('vehTitle').innerHTML = '<span class="' + (B ? 'nameA' : '') + '">' + esc(String(A.year ? A.year + ' ' : '') + label(A)) + '</span>' + (eA.modified ? ' <span class="vvy-modbadge">modified &#8776;</span>' : '');
    byId('vehSub').innerHTML = esc(A.name);
    byId('heightOut').innerHTML = VVY.personLabel(state.person, state.metric);
    byId('unitBtn').innerHTML = state.metric ? 'Metric (cm / kg)' : 'Imperial (ft-in / lb)';

    /* compare block */
    var cmpWrap = byId('cmpWrap');
    if (eB) {
      cmpWrap.style.display = '';
      byId('cmpTitle').innerHTML = '<span class="namepill pillA"><span class="chip chipA">A</span> ' + esc(label(A)) + '</span> <span class="vs">vs</span> <span class="namepill pillB"><span class="chip chipB">B</span> ' + esc(label(B)) + '</span>';
      byId('cmpBody').innerHTML = VVY.vsHtml(eA, eB, state.metric) +
        '<h3 class="sub"><span class="namepill pillB"><span class="chip chipB">B</span> ' + esc(label(B)) + '</span> <span class="vvy-note">' + esc(B.name) + '</span></h3>' +
        VVY.specsHtml(eB, state.metric) + VVY.compsHtml(eB, state.person, state.metric) + VVY.sourceHtml(B);
    } else {
      cmpWrap.style.display = 'none';
    }

    /* legend chips above the scene */
    var lg = [];
    lg.push('<span class="namepill pillA"><span class="chip chipA">A</span> ' + esc(label(A)) + ' <span class="sub">' + esc(A.name) + '</span></span>');
    if (B) {
      lg.push('<span class="namepill pillB"><span class="chip chipB">B</span> ' + esc(label(B)) + ' <span class="sub">' + esc(B.name) + '</span></span> <button type="button" class="xbtn" id="clearB" title="Remove comparison">&#215;</button> <button type="button" class="xbtn" id="swapAB" title="Swap A and B">&#8646;</button>');
    }
    byId('legend').innerHTML = lg.join('<span class="sep"></span>');
    if (B) { byId('clearB').onclick = clearB; byId('swapAB').onclick = swapAB; }

    /* state chip bar: summary + navigation */
    var crewN = state.party.adults + state.party.kids, petsN = state.party.dogs + state.party.cats;
    var crewTxt = crewN + (crewN === 1 ? ' rider' : ' riders') + (petsN ? ' + ' + petsN + (petsN === 1 ? ' pet' : ' pets') : '');
    var fitC = VVY.fit(A, state.party);
    var sb = [];
    sb.push('<button type="button" class="stchip on" data-seg="vehicle">' + esc(label(A) + ' · ' + A.name) + '</button>');
    sb.push('<button type="button" class="stchip" data-seg="crew">You ' + esc(VVY.personLabel(state.person, state.metric)) + '</button>');
    sb.push('<button type="button" class="stchip' + (fitC ? (fitC.fits ? ' ok' : ' no') : '') + '" data-seg="crew">' + esc(crewTxt) + (fitC ? (fitC.fits ? ' · fits' : ' · no fit') : '') + '</button>');
    sb.push('<button type="button" class="stchip' + (eA.modified ? ' mod' : '') + '" data-seg="vehicle" data-open="mods">' + (eA.modified ? esc((state.lift ? '+' + VVY.shortDim(state.lift, state.metric) + ' lift' : '') + (state.lift && eA.tireDelta ? ', ' : '') + (eA.tireDelta ? Math.round(eA.wheelDia) + '" tires' : '')) : 'Stock') + '</button>');
    sb.push('<button type="button" class="stchip' + (B ? ' chipB' : '') + '" data-seg="compare">' + (B ? 'vs ' + esc(B.model) : '+ compare') + '</button>');
    var fc = Filters.count();
    sb.push('<button type="button" class="stchip' + (Filters.isActive() ? ' on' : '') + '" data-seg="find">' + (Filters.isActive() ? 'Find · ' + fc + ' match' : 'Find') + '</button>');
    sb.push('<button type="button" class="stchip" data-seg="rank">Rankings</button>');
    byId('statebar').innerHTML = sb.join('');
    byId('modsSummary').innerHTML = eA.modified ? esc('+' + VVY.shortDim(eA.rise, state.metric) + ' rise') : 'stock';

    /* customize readouts */
    byId('liftOut').innerHTML = VVY.shortDim(state.lift, state.metric);
    var tireInfo;
    if (eA.stockDiaApprox) {
      tireInfo = 'Stock tire size is not on file for this configuration — stock diameter &#8776; ' + Math.round(eA.stockDia * 10) / 10 + ' in is taken from the body template.';
    } else {
      tireInfo = 'Stock: ' + esc(eA.stockTireLabel) + ' = ' + Math.round(eA.stockDia * 10) / 10 + ' in rolling diameter.';
    }
    if (eA.modified) {
      tireInfo += ' <b>Effective rise ' + VVY.shortDim(eA.rise, state.metric) + '</b> (lift ' + VVY.shortDim(eA.lift, state.metric) + ' + half the tire-diameter change ' + VVY.shortDim(eA.tireDelta / 2, state.metric) + ').';
    }
    byId('tireInfo').innerHTML = tireInfo;
    var chips = document.querySelectorAll('#tireChips button'), i;
    for (i = 0; i < chips.length; i++) {
      chips[i].className = (chips[i].getAttribute('data-tire') === state.tireMode) ? 'chipbtn on' : 'chipbtn';
    }
    byId('tireCustomWrap').style.display = state.tireMode === 'custom' ? '' : 'none';

    /* compare tab readouts */
    byId('cmpSel').innerHTML = B ? '' : '(none selected)';
    var lay = document.querySelectorAll('#layoutBtns button');
    for (i = 0; i < lay.length; i++) {
      lay[i].className = (lay[i].getAttribute('data-layout') === state.layout) ? 'chipbtn on' : 'chipbtn';
    }

    renderRank();
  }

  var panelOpen = false;
  function renderPanel() {
    if (!panelOpen) { byId('fpanel').style.display = 'none'; byId('fbrowse').setAttribute('aria-expanded', 'false'); return; }
    byId('fpanel').innerHTML = Filters.panelHtml(byId('ftype').value);
    byId('fpanel').style.display = '';
    byId('fbrowse').setAttribute('aria-expanded', 'true');
  }
  function renderFind() {
    byId('fpresets').innerHTML = Filters.presetsHtml();
    byId('ftokens').innerHTML = Filters.tokensHtml();
    byId('findBody').innerHTML = Filters.html();
    renderPanel();
    var n = Filters.count();
    byId('fnum').innerHTML = n;
    byId('fof').innerHTML = 'of ' + FLAT.length;
    byId('fshow').innerHTML = 'Show ' + n;
  }
  function renderShortlist(A, B) {
    var o = [], i, c;
    if (!state.shortlist.length) { byId('shortlist').innerHTML = '<span class="empty">Shortlist vehicles with &#9829; in Rankings; they land here for A / B.</span>'; return; }
    for (i = 0; i < state.shortlist.length; i++) {
      c = find(state.shortlist[i]);
      o.push('<span class="sl">' + esc(c.brand + ' ' + c.model) + ' <button type="button" data-sla="' + c.key + '">A</button><button type="button" data-slb="' + c.key + '">B</button><button type="button" data-slx="' + c.key + '" title="Remove">&#215;</button></span>');
    }
    byId('shortlist').innerHTML = o.join('');
  }
  function onFindClick(e) {
    var t = e.target || e.srcElement;
    while (t && t !== document.body) {
      if (t.getAttribute) {
        if (t.getAttribute('data-add')) { Filters.add(t.getAttribute('data-add')); byId('ftype').value = ''; render(); return; }
        if (t.getAttribute('data-remove')) { Filters.remove(t.getAttribute('data-remove')); render(); return; }
        if (t.getAttribute('data-toggle')) { Filters.toggleNeed(t.getAttribute('data-toggle').split(':')[1]); render(); return; }
        if (t.getAttribute('data-group')) { Filters.toggleGroup(t.getAttribute('data-group')); renderFind(); return; }
      }
      t = t.parentNode;
    }
  }
  function onFindInput(e) {
    var t = e.target || e.srcElement, d = t;
    if (!t || !t.className || (t.className !== 'rlo' && t.className !== 'rhi')) { return; }
    while (d && !(d.getAttribute && d.getAttribute('data-dial'))) { d = d.parentNode; }
    if (!d) { return; }
    var k = d.getAttribute('data-dial');
    var lo = parseFloat(d.querySelector('.rlo').value), hi = parseFloat(d.querySelector('.rhi').value);
    if (lo > hi) { if (t.className === 'rlo') { hi = lo; } else { lo = hi; } }
    Filters.setRange(k, lo, hi);
    /* re-render only this dial's readout + histogram to keep the thumb under the finger */
    var fresh = document.createElement('div'); fresh.innerHTML = Filters.dialHtml(Filters.dialByKey(k));
    d.querySelector('.lab').innerHTML = fresh.querySelector('.lab').innerHTML;
    d.querySelector('.hist').innerHTML = fresh.querySelector('.hist').innerHTML;
    var n = Filters.count(); byId('fnum').innerHTML = n; byId('fshow').innerHTML = 'Show ' + n;
    var sb = byId('statebar').querySelector('[data-seg="find"]'); if (sb) { sb.innerHTML = 'Find · ' + n + ' match'; sb.className = 'stchip on'; }
    renderRank();
  }
  function setA(k) { state.a = k; fillSelects(); render(); }
  function setB(k) { state.b = (k === state.a) ? null : k; fillSelects(); render(); }
  function clearB() { state.b = null; fillSelects(); render(); }
  function swapAB() {
    if (!state.b) { return; }
    var t = state.a; state.a = state.b; state.b = t;
    fillSelects(); render();
  }

  /* ---------- selector handlers ---------- */

  function bindTriple(ids, setter) {
    byId(ids[0]).onchange = function () { var v = byId(ids[0]).value; setter(v === '' ? null : v + '|0|0'); };
    byId(ids[1]).onchange = function () { setter(byId(ids[0]).value + '|' + byId(ids[1]).value + '|0'); };
    byId(ids[2]).onchange = function () { setter(byId(ids[0]).value + '|' + byId(ids[1]).value + '|' + byId(ids[2]).value); };
  }

  /* ---------- search (reusable) ---------- */

  function bindSearch(inputId, resultsId, onPick) {
    var input = byId(inputId), box = byId(resultsId);
    function run() {
      var q = input.value.toLowerCase().replace(/^\s+|\s+$/g, '');
      if (q.length < 2) { box.innerHTML = ''; box.className = 'vvy-results'; return; }
      var hits = [], i, words = q.split(/\s+/), ok, w;
      for (i = 0; i < FLAT.length && hits.length < 40; i++) {
        ok = true;
        for (w = 0; w < words.length; w++) { if (FLAT[i].search.indexOf(words[w]) < 0) { ok = false; break; } }
        if (ok && !passes(FLAT[i])) { ok = false; }
        if (ok) { hits.push(FLAT[i]); }
      }
      if (!hits.length) { box.innerHTML = '<p class="vvy-nores">No match.</p>'; box.className = 'vvy-results open'; return; }
      var s = [];
      for (i = 0; i < hits.length; i++) {
        s.push('<button type="button" class="vvy-hit" data-key="' + hits[i].key + '">' +
          esc(hits[i].brand + ' ' + hits[i].model) + fitBadge(hits[i]) + ' <span>' + esc(hits[i].name) + '</span></button>');
      }
      box.innerHTML = s.join('');
      box.className = 'vvy-results open';
    }
    input.onkeyup = run;
    input.onchange = run;
    box.onclick = function (e) {
      var t = e.target || e.srcElement;
      while (t && t !== document.body) {
        if (t.getAttribute && t.getAttribute('data-key')) {
          onPick(t.getAttribute('data-key'));
          box.innerHTML = ''; box.className = 'vvy-results'; input.value = '';
          return;
        }
        t = t.parentNode;
      }
    };
  }

  /* ---------- sheet: one layer, four cards ----------
     positions: peek (segment bar only) | half | full. On desktop CSS ignores data-pos. */
  var Sheet = (function () {
    var el, body, pos = 'peek', seg = 'vehicle';
    var POS = ['peek', 'half', 'full'];
    function setPos(p) { pos = p; el.setAttribute('data-pos', p); }
    function setSeg(name) {
      seg = name; state.tab = name;
      var btns = document.querySelectorAll('[data-seg]'), panes = document.querySelectorAll('[data-pane]'), i;
      for (i = 0; i < btns.length; i++) {
        if (btns[i].className.indexOf('segbtn') >= 0) { btns[i].className = btns[i].getAttribute('data-seg') === name ? 'segbtn on' : 'segbtn'; }
      }
      for (i = 0; i < panes.length; i++) { panes[i].style.display = panes[i].getAttribute('data-pane') === name ? '' : 'none'; }
      try { body.scrollTop = 0; } catch (e0) {}
    }
    function open(name, p) { setSeg(name); setPos(p || (name === 'rank' ? 'full' : 'half')); }
    function toggle() { setPos(pos === 'peek' ? 'half' : (pos === 'half' ? 'full' : 'peek')); }
    /* touch drag on the grab handle / segment bar */
    var startY = 0, startT = 0, dragging = false, vh = 0;
    function offsetFor(p) { vh = window.innerHeight || 700; var H = vh * 0.88; return p === 'full' ? 0 : (p === 'half' ? H - vh * 0.52 : H - 100); }
    function onStart(e) {
      var t = e.touches ? e.touches[0] : e; startY = t.clientY; startT = offsetFor(pos); dragging = true;
      el.className += ' dragging';
    }
    function onMove(e) {
      if (!dragging) { return; }
      var t = e.touches ? e.touches[0] : e; var dy = t.clientY - startY; var y = startT + dy; if (y < 0) { y = 0; }
      el.style.transform = 'translateY(' + y + 'px)';
      if (e.preventDefault) { e.preventDefault(); }
    }
    function onEnd(e) {
      if (!dragging) { return; }
      dragging = false; el.className = el.className.replace(/\s*dragging/g, ''); el.style.transform = '';
      var t = (e.changedTouches && e.changedTouches[0]) || e; var y = startT + (t.clientY - startY);
      var best = 'peek', bd = 1e9, i, d;
      for (i = 0; i < POS.length; i++) { d = Math.abs(offsetFor(POS[i]) - y); if (d < bd) { bd = d; best = POS[i]; } }
      setPos(best);
    }
    function init() {
      el = byId('sheet'); body = byId('sheetbody');
      var grab = byId('grab'), bar = byId('seg');
      grab.onclick = toggle;
      var i, hs = [grab, bar];
      for (i = 0; i < hs.length; i++) {
        if (hs[i].addEventListener) {
          hs[i].addEventListener('touchstart', onStart, false);
          hs[i].addEventListener('touchmove', onMove, false);
          hs[i].addEventListener('touchend', onEnd, false);
        }
      }
      bar.onclick = function (e) {
        var t = e.target || e.srcElement;
        if (t && t.getAttribute && t.getAttribute('data-seg')) {
          var n = t.getAttribute('data-seg');
          if (n === seg && pos !== 'peek') { setPos('peek'); } else { open(n, pos === 'peek' ? 'half' : pos); }
        }
      };
      byId('statebar').onclick = function (e) {
        var t = e.target || e.srcElement;
        while (t && t !== document.body) {
          if (t.getAttribute && t.getAttribute('data-seg')) {
            open(t.getAttribute('data-seg'));
            if (t.getAttribute('data-open') === 'mods') { try { byId('modsExp').open = true; } catch (e1) {} }
            return;
          }
          t = t.parentNode;
        }
      };
      document.onkeydown = function (e) { e = e || window.event; if (e.keyCode === 27) { setPos('peek'); } };
      setSeg('vehicle'); setPos('peek');
    }
    return { init: init, open: open, setSeg: setSeg, setPos: setPos };
  })();
  function setTab(name) { Sheet.setSeg(name); }

  /* ---------- rankings card ---------- */

  var COLS = [
    { k: 'height', l: 'Height' },
    { k: 'length', l: 'Length' },
    { k: 'clearance', l: 'Clearance' },
    { k: 'bedHeight', l: 'Bed floor' },
    { k: 'weight', l: 'Weight', mass: true },
    { k: 'seats', l: 'Seats', plain: true }
  ];

  function openRank() { Sheet.open('rank', 'full'); renderRank(); }

  function renderRank() {
    var q = state.rankFilter.toLowerCase().replace(/^\s+|\s+$/g, '');
    var rows = [], i, c, ok, words = q ? q.split(/\s+/) : [], w;
    for (i = 0; i < FLAT.length; i++) {
      c = FLAT[i];
      if (state.rankClass && c.bodyClass !== state.rankClass) { continue; }
      ok = true;
      for (w = 0; w < words.length; w++) { if (c.search.indexOf(words[w]) < 0) { ok = false; break; } }
      if (!ok) { continue; }
      if (!passes(c)) { continue; }
      rows.push(c);
    }
    var k = state.rankSort, dir = state.rankDir;
    rows.sort(function (x, y) {
      var ns = Filters.niceScore(y) - Filters.niceScore(x);
      if (ns !== 0) { return ns; }
      var a = x[k], b = y[k];
      var ha = VVY.has(a), hb = VVY.has(b);
      if (!ha && !hb) { return 0; }
      if (!ha) { return 1; }
      if (!hb) { return -1; }
      return (a - b) * dir;
    });
    var h = [];
    h.push('<table class="rank"><thead><tr><th class="name">Vehicle</th>');
    for (i = 0; i < COLS.length; i++) {
      h.push('<th><button type="button" data-sort="' + COLS[i].k + '" class="' + (k === COLS[i].k ? 'on' : '') + '">' + COLS[i].l + (k === COLS[i].k ? (dir < 0 ? ' &#9660;' : ' &#9650;') : '') + '</button></th>');
    }
    h.push('</tr></thead><tbody>');
    var badge, cls;
    for (i = 0; i < rows.length; i++) {
      c = rows[i];
      badge = c.key === state.a ? '<span class="chip chipA">A</span>' : (c.key === state.b ? '<span class="chip chipB">B</span>' : '');
      cls = c.key === state.a ? 'isA' : (c.key === state.b ? 'isB' : '');
      h.push('<tr class="' + cls + '" data-key="' + c.key + '"><td class="name">' + (badge ? '<span class="namepill ' + (cls === 'isA' ? 'pillA' : 'pillB') + '">' + badge + esc(c.brand + ' ' + c.model) + '</span>' : esc(c.brand + ' ' + c.model)) + fitBadge(c) + heartBtn(c) + '<span>' + esc(c.name) + '</span></td>');
      var j, v;
      for (j = 0; j < COLS.length; j++) {
        v = c[COLS[j].k];
        h.push('<td>' + (VVY.has(v) ? (COLS[j].plain ? String(v) : (COLS[j].mass ? VVY.mass(v, state.metric) : VVY.shortDim(v, state.metric))) : '<i>—</i>') + '</td>');
      }
      h.push('</tr>');
    }
    h.push('</tbody></table>');
    byId('rankTable').innerHTML = h.join('');
    byId('rankCount').innerHTML = rows.length + ' of ' + FLAT.length + (Filters.isActive() ? ' (filtered)' : '');
    var pt = document.querySelectorAll('#pickBtns button');
    for (i = 0; i < pt.length; i++) { pt[i].className = pt[i].getAttribute('data-pick') === state.pickTarget ? 'chipbtn on' : 'chipbtn'; }
  }

  function onRankClick(e) {
    var t = e.target || e.srcElement;
    while (t && t !== document.body) {
      if (t.getAttribute && t.getAttribute('data-sort')) {
        var s = t.getAttribute('data-sort');
        if (state.rankSort === s) { state.rankDir = -state.rankDir; } else { state.rankSort = s; state.rankDir = -1; }
        renderRank(); return;
      }
      if (t.getAttribute && t.getAttribute('data-heart')) { toggleShort(t.getAttribute('data-heart')); return; }
      if (t.getAttribute && t.getAttribute('data-key')) {
        var key = t.getAttribute('data-key');
        if (state.pickTarget === 'A') {
          state.a = key; if (state.b === key) { state.b = null; }
          fillSelects(); state.pickTarget = 'B';
        } else {
          state.b = (key === state.a) ? null : key; state.pickTarget = 'A';
        }
        render(); return;
      }
      t = t.parentNode;
    }
  }

  function fillClassFilter() {
    var seen = {}, list = [], i, bc;
    for (i = 0; i < FLAT.length; i++) {
      bc = FLAT[i].bodyClass || '';
      if (bc && !seen[bc]) { seen[bc] = true; list.push(bc); }
    }
    list.sort();
    var s = ['<option value="">All body classes</option>'];
    for (i = 0; i < list.length; i++) { s.push(opt(list[i], list[i].replace(/-/g, ' '), false)); }
    byId('rankClass').innerHTML = s.join('');
  }

  /* ---------- cats: easter egg animator ----------
     Reads data-spots from the rendered <g class="vvy-cats">, then eases each cat between spots on its
     own slow timer and occasionally shows the "meow" bubble. Uses setTimeout + rAF only; never runs
     when reduced motion is requested (cats are placed statically instead) and never in static mode. */
  var Cats = (function () {
    var timers = [], raf = null, cats = [], spots = [], running = false;
    function stop() {
      var i; for (i = 0; i < timers.length; i++) { clearTimeout(timers[i]); }
      timers = []; cats = []; running = false;
      if (raf && window.cancelAnimationFrame) { window.cancelAnimationFrame(raf); }
      raf = null;
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
    function place(c, x, y, flip) {
      c.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' + (flip ? ' scale(-1 1)' : ''));
      /* the bubble is drawn from x=6 to x=25 in the cat's frame; mirroring it about x=15.5 keeps it
         beside the head while undoing the parent flip so "meow" reads left-to-right */
      /* mirror the bubble about the mouth x so the tail tip stays on the mouth when the cat faces
         left; the group's own scale(-1 1) then flips it back, leaving "meow" readable */
      try { c.meow.setAttribute('transform', flip ? 'translate(' + (2 * VVY.CAT_MOUTH_X).toFixed(1) + ' 0) scale(-1 1)' : ''); } catch (e3) {}
    }
    function pickSpot(c) {
      var idx = Math.floor(Math.random() * spots.length);
      if (spots.length > 1 && idx === c.spot) { idx = (idx + 1) % spots.length; }
      return idx;
    }
    function schedule(c) {
      var wait = 4000 + Math.random() * 6000;
      timers.push(setTimeout(function () {
        if (!running) { return; }
        c.from = { x: c.x, y: c.y }; c.spot = pickSpot(c); c.to = { x: spots[c.spot][0] + (Math.random() * 10 - 5), y: spots[c.spot][1] };
        c.t0 = now(); c.dur = 2500 + Math.random() * 2500; c.moving = true; c.flip = c.to.x < c.from.x;
        tick();
      }, wait));
      var mw = 6000 + Math.random() * 9000;
      timers.push(setTimeout(function () {
        if (!running) { return; }
        try { c.meow.setAttribute('opacity', '1'); } catch (e1) {}
        timers.push(setTimeout(function () { try { c.meow.setAttribute('opacity', '0'); } catch (e2) {} }, 1800));
        if (running) { scheduleMeow(c); }
      }, mw));
    }
    function scheduleMeow(c) {
      timers.push(setTimeout(function () {
        if (!running) { return; }
        try { c.meow.setAttribute('opacity', '1'); } catch (e1) {}
        timers.push(setTimeout(function () { try { c.meow.setAttribute('opacity', '0'); } catch (e2) {} }, 1800));
        scheduleMeow(c);
      }, 9000 + Math.random() * 12000));
    }
    function now() { return new Date().getTime(); }
    function tick() {
      if (!running) { return; }
      var any = false, i, c, p;
      for (i = 0; i < cats.length; i++) {
        c = cats[i];
        if (!c.moving) { continue; }
        p = (now() - c.t0) / c.dur; if (p >= 1) { p = 1; c.moving = false; }
        var e = ease(p), hop = Math.sin(p * Math.PI * 6) * 1.2 * (1 - Math.abs(2 * p - 1));
        c.x = c.from.x + (c.to.x - c.from.x) * e; c.y = c.from.y + (c.to.y - c.from.y) * e - Math.abs(hop);
        place(c, c.x, c.y, c.flip);
        if (!c.moving) { c.y = c.to.y; place(c, c.x, c.y, c.flip); schedule(c); } else { any = true; }
      }
      if (any) { raf = (window.requestAnimationFrame ? window.requestAnimationFrame(tick) : setTimeout(tick, 33)); }
    }
    function start(scene) {
      stop();
      var g = scene.querySelector ? scene.querySelector('.vvy-cats') : null;
      if (!g) { return; }
      try { spots = JSON.parse(g.getAttribute('data-spots')); } catch (e0) { return; }
      var els = g.querySelectorAll('.vvy-cat'), i;
      if (reduceMotion) {
        /* static placement: spread the cats over the spots, no timers */
        for (i = 0; i < els.length; i++) {
          var sp = spots[(i + 1) % spots.length];
          els[i].setAttribute('transform', 'translate(' + sp[0] + ' ' + sp[1] + ')');
        }
        return;
      }
      running = true;
      for (i = 0; i < els.length; i++) {
        var tr = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(els[i].getAttribute('transform') || '');
        var c = { el: els[i], meow: els[i].querySelector('.vvy-meow'), x: tr ? parseFloat(tr[1]) : 0, y: tr ? parseFloat(tr[2]) : 0, spot: 0, moving: false };
        cats.push(c);
        schedule(c);
      }
    }
    return { start: start, stop: stop };
  })();

  /* ---------- boot ---------- */

  function boot() {
    flatten();
    state.a = FLAT[0].key;
    var i;
    for (i = 0; i < FLAT.length; i++) {
      if (FLAT[i].brand === 'Ram' && FLAT[i].model === '1500' && FLAT[i].name.indexOf('Crew Cab') === 0) { state.a = FLAT[i].key; break; }
    }
    var ctrls = document.querySelectorAll('[data-live]');
    for (i = 0; i < ctrls.length; i++) { ctrls[i].removeAttribute('disabled'); }

    bindTriple(['brandSel', 'modelSel', 'configSel'], setA);
    bindTriple(['brandSelA2', 'modelSelA2', 'configSelA2'], setA);
    bindTriple(['brandSelB', 'modelSelB', 'configSelB'], function (k) { if (k === null) { clearB(); } else { setB(k); } });
    bindSearch('search', 'results', setA);
    bindSearch('searchA2', 'resultsA2', setA);
    bindSearch('searchB', 'resultsB', setB);

    byId('people').onclick = safe(onPeopleClick);
    byId('people').oninput = safe(onPeopleInput); byId('people').onchange = safe(onPeopleInput);
    byId('addAdult').onclick = function () { if (state.party.people.length < 23) { state.party.people.push({ kind: 'adult', h: 66 }); render(); } };
    byId('addKid').onclick = function () { if (state.party.people.length < 23) { state.party.people.push({ kind: 'kid', h: 45 }); render(); } };
    byId('unitBtn').onclick = function () { state.metric = !state.metric; render(); };

    byId('lift').oninput = safe(onLift); byId('lift').onchange = safe(onLift);
    byId('tireChips').onclick = function (e) {
      var t = e.target || e.srcElement;
      if (t && t.getAttribute && t.getAttribute('data-tire')) { state.tireMode = t.getAttribute('data-tire'); render(); }
    };
    byId('tireCustom').oninput = safe(onTireCustom); byId('tireCustom').onchange = safe(onTireCustom);
    byId('resetMods').onclick = function () { state.lift = 0; state.tireMode = 'stock'; byId('lift').value = 0; render(); };

    byId('layoutBtns').onclick = function (e) {
      var t = e.target || e.srcElement;
      if (t && t.getAttribute && t.getAttribute('data-layout')) { state.layout = t.getAttribute('data-layout'); render(); }
    };
    byId('clearBtn').onclick = clearB;
    byId('swapBtn').onclick = swapAB;

    Sheet.init();
    /* direct manipulation on the drawing: people -> Crew, vehicle -> Vehicle, ghost "?" -> Compare.
       WebKit/SVG rules: attributes only (getAttribute/setAttribute, never classList/dataset/tabIndex
       properties), manual parentNode walk (no closest/matches), never .focus() an SVG node. */
    (function () {
      var scene = byId('scene');
      function attr(el, n) { try { return (el && el.getAttribute) ? el.getAttribute(n) : null; } catch (e0) { return null; } }
      function hitOf(t) {
        var guard = 0;
        while (t && t !== scene && guard++ < 40) { if (attr(t, 'data-hit')) { return t; } t = t.parentNode; }
        return null;
      }
      function setCls(el, v) { try { el.setAttribute('class', v); } catch (e0) {} }
      function unpress() { var hs = scene.querySelectorAll ? scene.querySelectorAll('.vvy-hit') : [], i; for (i = 0; i < hs.length; i++) { setCls(hs[i], 'vvy-hit'); } }
      function fire(h) {
        var kind = attr(h, 'data-hit');
        setCls(h, 'vvy-hit pressed');
        setTimeout(unpress, 220);
        if (kind === 'crew') { Sheet.open('crew'); }
        else if (kind === 'vehicle') { Sheet.open('vehicle'); }
        else if (kind === 'compare') { Sheet.open('compare'); try { var sb = byId('searchB'); if (sb && sb.focus) { sb.focus(); } } catch (e1) {} }
      }
      scene.onclick = safe(function (e) { e = e || window.event; var h = hitOf(e.target || e.srcElement); if (h) { fire(h); } });
      scene.onkeydown = safe(function (e) {
        e = e || window.event; var h = hitOf(e.target || e.srcElement);
        if (h && (e.keyCode === 13 || e.keyCode === 32)) { if (e.preventDefault) { e.preventDefault(); } fire(h); }
      });
      listen(scene, 'touchstart', function (e) { var h = hitOf(e.target || e.srcElement); if (h) { setCls(h, 'vvy-hit pressed'); } });
      listen(scene, 'touchend', function () { unpress(); });
      listen(scene, 'touchcancel', function () { unpress(); });
    })();

    var steps = document.querySelectorAll('[data-step]');
    for (i = 0; i < steps.length; i++) {
      steps[i].onclick = (function (k, dlt) { return function () {
        var v = state.party[k] + dlt; if (v < 0) { v = 0; } if (v > 12) { v = 12; }
        state.party[k] = v; render();
      }; })(steps[i].getAttribute('data-step'), parseInt(steps[i].getAttribute('data-d'), 10));
    }
    byId('fitOnly').onchange = function () { Filters.setMust('fitsCrew', !!byId('fitOnly').checked); render(); };
    byId('fitOnlyRank').onchange = function () { Filters.setMust('fitsCrew', !!byId('fitOnlyRank').checked); render(); };
    byId('findBody').onclick = safe(onFindClick);
    byId('fpresets').onclick = safe(onFindClick);
    byId('ftokens').onclick = safe(onFindClick);
    byId('fpanel').onclick = safe(onFindClick);
    /* typeahead: focus or typing opens the browsable panel; Browse opens it WITHOUT focusing the
       input, so on a phone the keyboard stays down and the list is thumb-browsable */
    byId('ftype').onfocus = function () { panelOpen = true; renderPanel(); };
    byId('ftype').onkeyup = function (e) { e = e || window.event; if (e.keyCode === 27) { panelOpen = false; byId('ftype').blur(); } else { panelOpen = true; } renderPanel(); };
    byId('ftype').oninput = function () { panelOpen = true; renderPanel(); };
    byId('fbrowse').onclick = function () { panelOpen = !panelOpen; renderPanel(); };
    document.addEventListener('click', safe(function (e) {
      var t = e.target || e.srcElement, inside = false;
      while (t && t !== document.body) { if (t.id === 'fpanel' || t.id === 'ftype' || t.id === 'fbrowse') { inside = true; break; } t = t.parentNode; }
      if (!inside && panelOpen) { panelOpen = false; renderPanel(); }
    }), true);
    byId('findBody').oninput = safe(onFindInput); byId('findBody').onchange = safe(onFindInput);
    byId('fclear').onclick = function () { Filters.clear(); render(); };
    byId('fshow').onclick = function () { Sheet.open('rank', 'full'); renderRank(); };
    byId('shortlist').onclick = function (e) {
      var t = e.target || e.srcElement; if (!t || !t.getAttribute) { return; }
      if (t.getAttribute('data-sla')) { setA(t.getAttribute('data-sla')); return; }
      if (t.getAttribute('data-slb')) { setB(t.getAttribute('data-slb')); return; }
      if (t.getAttribute('data-slx')) { toggleShort(t.getAttribute('data-slx')); return; }
    };
    Filters.setVehicles(FLAT);

    byId('rankBtn2').onclick = openRank;
    byId('rankTable').onclick = safe(onRankClick);
    byId('rankFilter').onkeyup = function () { state.rankFilter = byId('rankFilter').value; renderRank(); };
    byId('rankClass').onchange = function () { state.rankClass = byId('rankClass').value; renderRank(); };
    byId('pickBtns').onclick = function (e) {
      var t = e.target || e.srcElement;
      if (t && t.getAttribute && t.getAttribute('data-pick')) { state.pickTarget = t.getAttribute('data-pick'); renderRank(); }
    };

    fillClassFilter();
    byId('lift').value = 0;
    fillSelects();
    render();

    document.body.className = document.body.className.replace(/\bstatic\b/g, '') + ' live';
  }

  function onSlider() { state.person = parseInt(byId('hslider').value, 10); render(); }
  function onLift() { state.lift = parseFloat(byId('lift').value) || 0; render(); }
  function onTireCustom() { state.tireCustom = byId('tireCustom').value; if (state.tireMode === 'custom') { render(); } }

  /* ---------- start: fetch the data through the seam, then boot ---------- */
  function start() {
    try {
      RideFitData.load(function (err, tree) {
        if (err || !tree) {
          try { window.RideFitReport(new Error('vehicle data unavailable: ' + err), 'boot'); } catch (e0) {}
          return;   /* static first paint stays on screen, controls stay disabled */
        }
        D = tree;
        try { boot(); } catch (e1) { try { window.RideFitReport(e1, 'boot'); } catch (e2) {} }
      });
    } catch (e3) { try { window.RideFitReport(e3, 'boot'); } catch (e4) {} }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, false);
  } else {
    start();
  }
})();
