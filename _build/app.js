/* vehicles-vs-you : UI wiring. ES5 ONLY. */
(function () {
  'use strict';

  var D = null;   /* filled by RideFitData.load() in start(); the app never reads raw records */
  var FLAT = [];
  var state = {
    a: null, b: null,
    person: 70, metric: false,
    lift: 0, tireMode: 'stock', tireCustom: 35,
    /* view: 'profile' (exterior) | 'cutaway' (peek inside, measured) | 'overhead' (seats).
       Alone: pane A shows profile or cutaway, pane B always the overhead view.
       Comparing: one control flips BOTH panes — profile = A and B side by side at one scale in a
       single pane; cutaway / overhead = A in pane A, B in pane B, drawn at a shared scale. */
    view: 'profile',
    fold: true,    /* the seats fold under the profile pane (alone only) — open on load */
    pickTarget: 'A',
    tab: 'vehicle',
    rankSort: 'height', rankDir: -1, rankFilter: '', rankClass: '',
    /* default crew: you 5'10" (US adult median), an adult 5'5", a kid 4'2" (typical at 8) and a
       kid 3'7" (typical at 5), one dog — the same party the static first paint is built with */
    party: { adults: 0, kids: 0, dogs: 1, cats: 0, people: [{ kind: 'adult', h: 65 }, { kind: 'kid', h: 50 }, { kind: 'kid', h: 43 }] }, fitOnly: false, shortlist: []
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
  /* breadcrumb: the last user action, appended to any window.onerror report so a sanitised
     "Script error." on file:// still says what was being done; RideFitCrumbAt lets the reporter say
     how long AFTER our handler finished the error arrived */
  function crumb(s) { try { window.RideFitCrumb = s; window.RideFitCrumbAt = new Date().getTime(); } catch (e0) {} }
  /* reveal(): every path that shows a previously hidden panel (the fold, a sheet segment, a compare
     view) runs through here: the panel name goes in the breadcrumb, the work runs inside its own
     try/catch and reports with the REAL message, and a marker is set while our code is running so the
     global handler can tell "thrown inside the app" from "thrown by something else afterwards" */
  function reveal(name, fn) {
    crumb('reveal: ' + name);
    try { window.RideFitInReveal = name; } catch (e0) {}
    try { fn(); }
    catch (err) { try { window.RideFitReport(err, 'reveal ' + name); } catch (e2) {} }
    finally { try { window.RideFitInReveal = ''; window.RideFitRevealDone = new Date().getTime(); } catch (e3) {} }
  }
  function setBodyFlag(flag, on) {
    var b = document.body, re = new RegExp('(^|\\s)' + flag + '(\\s|$)', 'g');
    var cls = b.className.replace(re, ' ').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
    b.className = on ? cls + ' ' + flag : cls;
  }
  /* timers run outside every handler's try/catch: route them through the same reporter */
  function safeTimer(fn, ms) { return setTimeout(function () { try { fn(); } catch (err) { try { window.RideFitReport(err, 'timer'); } catch (e2) {} } }, ms); }
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
      o.push(prowHtml(i, p.kind === 'kid' ? 'Kid ' + (kidIndex(i)) : 'Adult ' + (adultIndex(i)), p.kind === 'kid' ? 'child · 3\'7" is typical at 5, 4\'2" at 8' : 'adult', p.h, false));
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

    var scene = byId('scene'), paneA = byId('paneA'), paneB = byId('paneB');
    var sopts = { animate: changed && !reduceMotion, party: state.party, interactive: true, wag: !reduceMotion };
    var htmlA, htmlB = '';
    if (!eB) {
      htmlA = state.view === 'cutaway' ? VVY.renderInterior(eA, state.person, state.metric, { party: state.party, interactive: true, idPrefix: 'pa' })
                                      : VVY.renderScene([eA], state.person, state.metric, sopts);
      htmlB = VVY.renderInside(eA, state.person, state.metric, { party: state.party, role: 'A', idPrefix: 'pb' });
    } else if (state.view === 'profile') {
      htmlA = VVY.renderScene([eA, eB], state.person, state.metric, sopts);
    } else {
      var ref = { L: Math.max(eA.length, eB.length), W: Math.max(eA.width || 76, eB.width || 76), H: Math.max(eA.height, eB.height) };
      if (state.view === 'cutaway') {
        htmlA = VVY.renderInterior(eA, state.person, state.metric, { party: state.party, interactive: true, idPrefix: 'pa', ref: ref });
        htmlB = VVY.renderInterior(eB, state.person, state.metric, { party: state.party, interactive: true, idPrefix: 'pb', role: 'B', ref: ref });
      } else {
        htmlA = VVY.renderInside(eA, state.person, state.metric, { party: state.party, role: 'A', idPrefix: 'pa', ref: ref });
        htmlB = VVY.renderInside(eB, state.person, state.metric, { party: state.party, role: 'B', idPrefix: 'pb', ref: ref });
      }
    }
    /* alone: primary profile pane + collapsible seats fold; comparing in an inside view: A | B split */
    var split = !!(eB && state.view !== 'profile');
    scene.className = 'scene' + (split ? ' two' : (state.fold ? ' open' : ''));
    setBodyFlag('foldopen', !split && state.fold);
    paneA.innerHTML = htmlA;
    paneB.innerHTML = htmlB;
    paneB.style.display = (split || !eB) ? '' : 'none';
    byId('foldBtn').style.display = (split || eB) ? 'none' : '';
    byId('foldBtn').setAttribute('aria-expanded', state.fold ? 'true' : 'false');
    if (changed && !reduceMotion) {
      paneA.className = 'pane a'; void paneA.offsetWidth; paneA.className = 'pane a vvy-anim';
      paneB.className = 'pane b'; void paneB.offsetWidth; paneB.className = 'pane b vvy-anim';
    }
    /* comparison view control: only meaningful with a B */
    var vcs = [byId('viewCtl'), byId('viewCtl2')], vi, vb;
    byId('viewCtl').style.display = eB ? '' : 'none';
    for (vi = 0; vi < vcs.length; vi++) {
      vb = vcs[vi].querySelectorAll('button');
      for (i = 0; i < vb.length; i++) { vb[i].className = (vb[i].getAttribute('data-view') === state.view) ? vb[i].className.replace(/\s*on/g, '') + ' on' : vb[i].className.replace(/\s*on/g, ''); }
    }

    byId('fitLine').innerHTML = VVY.fitHtml(A, state.party);
    byId('fitBox').innerHTML = VVY.fitHtml(A, state.party);
    byId('room').innerHTML = VVY.roomHtml(A, state.party, state.metric);
    byId('roomBox').innerHTML = VVY.roomHtml(A, state.party, state.metric);
    byId('people').innerHTML = peopleHtml();
    byId('dogsVal').innerHTML = state.party.dogs;
    byId('catsVal').innerHTML = state.party.cats;
    Cats.start(paneA);
    state.fitOnly = !!Filters.state.must.fitsCrew;
    byId('fitOnly').checked = state.fitOnly;
    byId('fitOnlyRank').checked = state.fitOnly;
    state.party.person = state.person;
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
    if (B) { byId('clearB').onclick = safe(clearB); byId('swapAB').onclick = safe(swapAB); }

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
  function setView(v) {
    state.view = (v === 'cutaway' || v === 'overhead') ? v : 'profile';
    if (!state.b && state.view === 'overhead') { state.view = 'profile'; }   /* alone, the overhead pane is always there */
    reveal('view ' + state.view, function () {
      render();
      if (!reduceMotion) { var pa = byId('paneA'); pa.className = 'pane a'; void pa.offsetWidth; pa.className = 'pane a vvy-anim'; }
    });
  }
  window.RideFitView = { set: function (v) { setView(v); }, get: function () { return state.view; } };
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
    byId(ids[0]).onchange = safe(function () { var v = byId(ids[0]).value; setter(v === '' ? null : v + '|0|0'); });
    byId(ids[1]).onchange = safe(function () { setter(byId(ids[0]).value + '|' + byId(ids[1]).value + '|0'); });
    byId(ids[2]).onchange = safe(function () { setter(byId(ids[0]).value + '|' + byId(ids[1]).value + '|' + byId(ids[2]).value); });
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
    input.onkeyup = safe(run);
    input.onchange = safe(run);
    box.onclick = safe(function (e) {
      var t = e.target || e.srcElement;
      while (t && t !== document.body) {
        if (t.getAttribute && t.getAttribute('data-key')) {
          onPick(t.getAttribute('data-key'));
          box.innerHTML = ''; box.className = 'vvy-results'; input.value = '';
          return;
        }
        t = t.parentNode;
      }
    });
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
    function open(name, p) { reveal('sheet ' + name, function () { setSeg(name); setPos(p || (name === 'rank' ? 'full' : 'half')); }); }
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
          hs[i].addEventListener('touchstart', safe(onStart), false);
          hs[i].addEventListener('touchmove', safe(onMove), false);
          hs[i].addEventListener('touchend', safe(onEnd), false);
        }
      }
      bar.onclick = safe(function (e) {
        var t = e.target || e.srcElement;
        if (t && t.getAttribute && t.getAttribute('data-seg')) {
          var n = t.getAttribute('data-seg');
          crumb('segment: ' + n);
          if (n === seg && pos !== 'peek') { setPos('peek'); } else { open(n, pos === 'peek' ? 'half' : pos); }
        }
      });
      byId('statebar').onclick = safe(function (e) {
        var t = e.target || e.srcElement;
        while (t && t !== document.body) {
          if (t.getAttribute && t.getAttribute('data-seg')) {
            crumb('chip: ' + t.getAttribute('data-seg'));
            open(t.getAttribute('data-seg'));
            if (t.getAttribute('data-open') === 'mods') { try { byId('modsExp').open = true; } catch (e1) {} }
            return;
          }
          t = t.parentNode;
        }
      });
      document.onkeydown = safe(function (e) { e = e || window.event; if (e.keyCode === 27) { setPos('peek'); } });
      setSeg('vehicle'); setPos('peek');
    }
    return { init: init, open: open, setSeg: setSeg, setPos: setPos };
  })();
  function setTab(name) { Sheet.setSeg(name); }

  /* ---------- rankings card ---------- */

  var COLS = [
    { k: 'fit1', l: 'Front fit', fit: 1 },
    { k: 'fit2', l: '2nd-row fit', fit: 2 },
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
    /* per-row fit of the party (tallest rider assigned to each row): margins in inches */
    var pr = {}, pctx = { person: state.person, people: state.party.people };
    function rowsOf(c) { if (!pr[c.key]) { pr[c.key] = VVY.partyRows(c, pctx); } return pr[c.key]; }
    function fitVal(c, n) { var f = rowsOf(c)[n]; if (!f || f.band === 'unknown') { return null; } var w = f.hs === null ? f.ls : (f.ls === null ? f.hs : Math.min(f.hs, f.ls)); return w; }
    function fitCell(c, n) {
      var f = rowsOf(c)[n];
      if (!f) { return '<td class="fitc none"><i>' + (n === 2 && (!VVY.has(c.rows) || c.rows < 2) ? 'no row' : 'empty') + '</i></td>'; }
      if (f.band === 'unknown') { return '<td class="fitc none"><i>—</i></td>'; }
      function m(v) { if (v === null) { return '<i>—</i>'; } var x = state.metric ? v * 2.54 : v; return '<b>' + (x >= 0 ? '+' : '&#8722;') + (Math.round(Math.abs(x) * 10) / 10) + '</b>'; }
      return '<td class="fitc ' + f.band + '" title="tallest rider ' + VVY.personLabel(rowsOf(c).tall[n], state.metric) + ': headroom / legroom margin">' + m(f.hs) + '<small>h</small> ' + m(f.ls) + '<small>l</small></td>';
    }
    rows.sort(function (x, y) {
      var ns = Filters.niceScore(y) - Filters.niceScore(x);
      if (ns !== 0) { return ns; }
      var a = (k === 'fit1' || k === 'fit2') ? fitVal(x, k === 'fit1' ? 1 : 2) : x[k], b = (k === 'fit1' || k === 'fit2') ? fitVal(y, k === 'fit1' ? 1 : 2) : y[k];
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
        if (COLS[j].fit) { h.push(fitCell(c, COLS[j].fit)); continue; }
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
     Reads data-spots + data-geo from the rendered <g class="vvy-cats">. Cats LOCOMOTE: they walk
     horizontally along the ground or a vehicle surface (hood, roof, bed rail) and climb or drop
     VERTICALLY at the vehicle's faces (front, rear, cab back) to change level — never a diagonal
     free flight. The one exception is the windshield spot, which keeps the original eased hop
     (the user likes it). setTimeout + rAF only; never runs under reduced motion (static placement)
     and never in static mode. Cats are not clickable; the bubble stays anchored to the mouth. */
  var Cats = (function () {
    var timers = [], raf = null, cats = [], spots = [], geo = {}, running = false;
    var WALK = 22, CLIMB = 11, DROP = 26;   /* scene units per second */
    function stop() {
      var i; for (i = 0; i < timers.length; i++) { clearTimeout(timers[i]); }
      timers = []; cats = []; running = false;
      if (raf && window.cancelAnimationFrame) { window.cancelAnimationFrame(raf); }
      raf = null;
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
    function place(c, x, y, flip) {
      c.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' + (flip ? ' scale(-1 1)' : ''));
      /* mirror the bubble about the mouth x so the tail tip stays on the mouth when the cat faces
         left; the group's own scale(-1 1) then flips it back, leaving "meow" readable */
      try { c.meow.setAttribute('transform', flip ? 'translate(' + (2 * VVY.CAT_MOUTH_X).toFixed(1) + ' 0) scale(-1 1)' : ''); } catch (e3) {}
    }
    function pickSpot(c) {
      var idx = Math.floor(Math.random() * spots.length);
      if (spots.length > 1 && idx === c.spot) { idx = (idx + 1) % spots.length; }
      return idx;
    }
    /* which surface a point sits on, by its y */
    function levelOf(y) {
      if (Math.abs(y - geo.groundY) < 1.5) { return 'ground'; }
      if (geo.roofY !== null && Math.abs(y - geo.roofY) < 1.5) { return 'roof'; }
      if (geo.hoodY !== null && Math.abs(y - geo.hoodY) < 1.5) { return 'hood'; }
      if (geo.railY !== null && Math.abs(y - geo.railY) < 1.5) { return 'rail'; }
      return 'other';
    }
    /* legs: [{x, y, kind:'walk'|'climb'|'drop'|'fly'}] from (fx,fy) to (tx,ty) */
    function route(fx, fy, tx, ty, fromName, toName) {
      var legs = [], x = fx, y = fy;
      function walk(nx) { if (Math.abs(nx - x) > 0.5) { legs.push({ x: nx, y: y, kind: 'walk' }); x = nx; } }
      function vert(ny) { if (Math.abs(ny - y) > 0.5) { legs.push({ x: x, y: ny, kind: ny < y ? 'climb' : 'drop' }); y = ny; } }
      if (fromName === 'windshield' || toName === 'windshield') { return [{ x: tx, y: ty, kind: 'fly' }]; }
      var a = levelOf(fy), b = levelOf(ty);
      if (a === 'other' || b === 'other') { return [{ x: tx, y: ty, kind: 'fly' }]; }
      /* bring the cat down to the ground first unless it can stay on its level or step straight across */
      if (a === b) { walk(tx); vert(ty); return legs; }
      if (a === 'hood') { walk(Math.min(geo.front, x)); vert(geo.groundY); a = 'ground'; }
      if (a === 'roof') {
        if (geo.cabRearX !== null && geo.railY !== null) { walk(geo.cabRearX); vert(geo.railY); a = 'rail'; }
        else { walk(geo.rear); vert(geo.groundY); a = 'ground'; }
      }
      if (a === 'rail' && b !== 'roof') { walk(geo.rear); vert(geo.groundY); a = 'ground'; }
      /* now climb to the target level */
      if (b === 'ground') { walk(tx); vert(ty); return legs; }
      if (b === 'hood') { walk(Math.min(geo.front, tx)); vert(ty); walk(tx); return legs; }
      if (b === 'rail') { walk(geo.rear); vert(ty); walk(tx); return legs; }
      if (b === 'roof') {
        if (geo.cabRearX !== null && geo.railY !== null) {
          if (a === 'ground') { walk(geo.rear); vert(geo.railY); }
          walk(geo.cabRearX); vert(ty); walk(tx);
        } else { walk(geo.rear); vert(ty); walk(tx); }
        return legs;
      }
      return [{ x: tx, y: ty, kind: 'fly' }];
    }
    function legDur(c, leg) {
      var dxl = Math.abs(leg.x - c.x), dyl = Math.abs(leg.y - c.y);
      if (leg.kind === 'fly') { return 2500 + Math.random() * 2500; }
      if (leg.kind === 'walk') { return Math.max(500, dxl / WALK * 1000); }
      if (leg.kind === 'climb') { return Math.max(500, dyl / CLIMB * 1000); }
      return Math.max(350, dyl / DROP * 1000);
    }
    function startLeg(c) {
      var leg = c.legs[c.leg];
      c.from = { x: c.x, y: c.y }; c.to = { x: leg.x, y: leg.y }; c.kind = leg.kind;
      c.t0 = now(); c.dur = legDur(c, leg); c.moving = true;
      if (Math.abs(leg.x - c.x) > 0.5) { c.flip = leg.x < c.x; }
    }
    function schedule(c) {
      var wait = 4000 + Math.random() * 6000;
      timers.push(safeTimer(function () {
        if (!running) { return; }
        var fromName = spots[c.spot] ? spots[c.spot][2] : '';
        c.spot = pickSpot(c);
        var tx = spots[c.spot][0] + (Math.random() * 10 - 5), ty = spots[c.spot][1];
        c.legs = route(c.x, c.y, tx, ty, fromName, spots[c.spot][2]); c.leg = 0;
        if (!c.legs.length) { schedule(c); return; }
        startLeg(c);
        tick();
      }, wait));
      var mw = 6000 + Math.random() * 9000;
      timers.push(safeTimer(function () {
        if (!running) { return; }
        try { c.meow.setAttribute('opacity', '1'); } catch (e1) {}
        timers.push(safeTimer(function () { try { c.meow.setAttribute('opacity', '0'); } catch (e2) {} }, 1800));
        if (running) { scheduleMeow(c); }
      }, mw));
    }
    function scheduleMeow(c) {
      timers.push(safeTimer(function () {
        if (!running) { return; }
        try { c.meow.setAttribute('opacity', '1'); } catch (e1) {}
        timers.push(safeTimer(function () { try { c.meow.setAttribute('opacity', '0'); } catch (e2) {} }, 1800));
        scheduleMeow(c);
      }, 9000 + Math.random() * 12000));
    }
    function now() { return new Date().getTime(); }
    function tick() {
      if (!running) { return; }
      try { tickBody(); } catch (err) { running = false; try { window.RideFitReport(err, 'cats'); } catch (e9) {} }
    }
    function tickBody() {
      var any = false, i, c, p, e, bob, x, y;
      for (i = 0; i < cats.length; i++) {
        c = cats[i];
        if (!c.moving) { continue; }
        p = (now() - c.t0) / c.dur; if (p >= 1) { p = 1; }
        if (c.kind === 'fly') {
          /* the original windshield hop, unchanged */
          e = ease(p); bob = Math.sin(p * Math.PI * 6) * 1.2 * (1 - Math.abs(2 * p - 1));
          x = c.from.x + (c.to.x - c.from.x) * e; y = c.from.y + (c.to.y - c.from.y) * e - Math.abs(bob);
        } else if (c.kind === 'walk') {
          /* steady trot with a little bounce, feet on the surface */
          x = c.from.x + (c.to.x - c.from.x) * p; bob = Math.abs(Math.sin(p * c.dur / 140)) * 0.7;
          y = c.from.y - bob;
        } else if (c.kind === 'climb') {
          /* scramble up: linear with paw-over-paw jitter, hugging the face */
          y = c.from.y + (c.to.y - c.from.y) * p; x = c.from.x + Math.sin(p * c.dur / 90) * 0.6;
        } else {
          /* drop: accelerate down, land */
          e = p * p; y = c.from.y + (c.to.y - c.from.y) * e; x = c.from.x;
        }
        c.x = x; c.y = y;
        place(c, x, y, c.flip);
        if (p >= 1) {
          c.x = c.to.x; c.y = c.to.y; place(c, c.x, c.y, c.flip);
          c.leg++;
          if (c.leg < c.legs.length) { startLeg(c); any = true; }
          else { c.moving = false; schedule(c); }
        } else { any = true; }
      }
      if (any) { raf = (window.requestAnimationFrame ? window.requestAnimationFrame(tick) : setTimeout(tick, 33)); }
    }
    function start(scene) {
      stop();
      var g = scene.querySelector ? scene.querySelector('.vvy-cats') : null;
      if (!g) { return; }
      try { spots = JSON.parse(g.getAttribute('data-spots')); } catch (e0) { return; }
      try { geo = JSON.parse(g.getAttribute('data-geo') || '{}'); } catch (e5) { geo = {}; }
      geo.groundY = spots[0] ? spots[0][1] : 0;
      var i, gk, need = ['front', 'rear', 'hoodY', 'roofY', 'railY', 'cabRearX'];
      for (i = 0; i < need.length; i++) { gk = need[i]; if (geo[gk] === undefined) { geo[gk] = null; } }
      var els = g.querySelectorAll('.vvy-cat');
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
        var c = { el: els[i], meow: els[i].querySelector('.vvy-meow'), x: tr ? parseFloat(tr[1]) : 0, y: tr ? parseFloat(tr[2]) : 0, spot: 0, moving: false, legs: [], leg: 0, flip: false };
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
    byId('addAdult').onclick = safe(function () { if (state.party.people.length < 23) { state.party.people.push({ kind: 'adult', h: 66 }); render(); } });
    byId('addKid').onclick = safe(function () { if (state.party.people.length < 23) { state.party.people.push({ kind: 'kid', h: 50 }); render(); } });
    byId('unitBtn').onclick = safe(function () { state.metric = !state.metric; render(); });

    byId('lift').oninput = safe(onLift); byId('lift').onchange = safe(onLift);
    byId('tireChips').onclick = safe(function (e) {
      var t = e.target || e.srcElement;
      if (t && t.getAttribute && t.getAttribute('data-tire')) { state.tireMode = t.getAttribute('data-tire'); render(); }
    });
    byId('tireCustom').oninput = safe(onTireCustom); byId('tireCustom').onchange = safe(onTireCustom);
    byId('resetMods').onclick = safe(function () { state.lift = 0; state.tireMode = 'stock'; byId('lift').value = 0; render(); });

    byId('foldBtn').onclick = safe(function () {
      state.fold = !state.fold;
      reveal('seats fold ' + (state.fold ? 'open' : 'closed'), function () {
        byId('scene').className = 'scene' + (state.fold ? ' open' : '');
        setBodyFlag('foldopen', state.fold);
        byId('foldBtn').setAttribute('aria-expanded', state.fold ? 'true' : 'false');
      });
    });
    byId('viewCtl').onclick = safe(onViewCtl);
    byId('viewCtl2').onclick = safe(onViewCtl);
    byId('clearBtn').onclick = safe(clearB);
    byId('swapBtn').onclick = safe(swapAB);

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
        crumb('scene tap: ' + kind);
        setCls(h, 'vvy-hit pressed');
        safeTimer(unpress, 220);
        if (kind === 'crew') { Sheet.open('crew'); }
        else if (kind === 'vehicle') { Sheet.open('vehicle'); }
        else if (kind === 'view') { setView(state.view === 'cutaway' ? 'profile' : 'cutaway'); }
        else if (kind === 'compare') {
          Sheet.open('compare');
          /* focus the search box only after the segment is visible and layout has flushed —
             never in the same tick as the reveal (WebKit/Gecko can throw on hidden nodes) */
          var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
          raf(function () { raf(function () {
            try { var sb = byId('searchB'); if (sb && sb.focus && sb.offsetParent !== null) { sb.focus(); } } catch (e1) { try { window.RideFitReport(e1, 'focus'); } catch (e2) {} }
          }); });
        }
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
      steps[i].onclick = (function (k, dlt) { return safe(function () {
        var v = state.party[k] + dlt; if (v < 0) { v = 0; } if (v > 12) { v = 12; }
        state.party[k] = v; render();
      }); })(steps[i].getAttribute('data-step'), parseInt(steps[i].getAttribute('data-d'), 10));
    }
    byId('fitOnly').onchange = safe(function () { Filters.setMust('fitsCrew', !!byId('fitOnly').checked); render(); });
    byId('fitOnlyRank').onchange = safe(function () { Filters.setMust('fitsCrew', !!byId('fitOnlyRank').checked); render(); });
    byId('findBody').onclick = safe(onFindClick);
    byId('fpresets').onclick = safe(onFindClick);
    byId('ftokens').onclick = safe(onFindClick);
    byId('fpanel').onclick = safe(onFindClick);
    /* typeahead: focus or typing opens the browsable panel; Browse opens it WITHOUT focusing the
       input, so on a phone the keyboard stays down and the list is thumb-browsable */
    byId('ftype').onfocus = safe(function () { panelOpen = true; renderPanel(); });
    byId('ftype').onkeyup = safe(function (e) { e = e || window.event; if (e.keyCode === 27) { panelOpen = false; byId('ftype').blur(); } else { panelOpen = true; } renderPanel(); });
    byId('ftype').oninput = safe(function () { panelOpen = true; renderPanel(); });
    byId('fbrowse').onclick = safe(function () { panelOpen = !panelOpen; renderPanel(); });
    document.addEventListener('click', safe(function (e) {
      var t = e.target || e.srcElement, inside = false;
      while (t && t !== document.body) { if (t.id === 'fpanel' || t.id === 'ftype' || t.id === 'fbrowse') { inside = true; break; } t = t.parentNode; }
      if (!inside && panelOpen) { panelOpen = false; renderPanel(); }
    }), true);
    byId('findBody').oninput = safe(onFindInput); byId('findBody').onchange = safe(onFindInput);
    byId('fclear').onclick = safe(function () { Filters.clear(); render(); });
    byId('fshow').onclick = safe(function () { Sheet.open('rank', 'full'); renderRank(); });
    byId('shortlist').onclick = safe(function (e) {
      var t = e.target || e.srcElement; if (!t || !t.getAttribute) { return; }
      if (t.getAttribute('data-sla')) { setA(t.getAttribute('data-sla')); return; }
      if (t.getAttribute('data-slb')) { setB(t.getAttribute('data-slb')); return; }
      if (t.getAttribute('data-slx')) { toggleShort(t.getAttribute('data-slx')); return; }
    });
    Filters.setVehicles(FLAT);

    byId('rankBtn2').onclick = safe(openRank);
    byId('rankTable').onclick = safe(onRankClick);
    byId('rankFilter').onkeyup = safe(function () { state.rankFilter = byId('rankFilter').value; renderRank(); });
    byId('rankClass').onchange = safe(function () { state.rankClass = byId('rankClass').value; renderRank(); });
    byId('pickBtns').onclick = safe(function (e) {
      var t = e.target || e.srcElement;
      if (t && t.getAttribute && t.getAttribute('data-pick')) { state.pickTarget = t.getAttribute('data-pick'); renderRank(); }
    });

    fillClassFilter();
    byId('lift').value = 0;
    fillSelects();
    render();

    document.body.className = document.body.className.replace(/\bstatic\b/g, '') + ' live';
  }

  function onViewCtl(e) {
    var t = e.target || e.srcElement;
    if (t && t.getAttribute && t.getAttribute('data-view')) { setView(t.getAttribute('data-view')); }
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
