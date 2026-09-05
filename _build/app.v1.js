/* vehicles-vs-you : UI wiring. ES5 ONLY. */
(function () {
  'use strict';

  var D = VVY_DATA;
  var FLAT = [];
  var state = { key: null, person: 75, metric: false };

  function byId(id) { return document.getElementById(id); }

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
          c.search = (b.name + ' ' + m.name + ' ' + c.name).toLowerCase();
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
    return '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' +
      String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</option>';
  }

  function fillSelects() {
    var cur = find(state.key);
    var p = cur.key.split('|');
    var bi = parseInt(p[0], 10), mi = parseInt(p[1], 10), ci = parseInt(p[2], 10);
    var i, s;

    s = [];
    for (i = 0; i < D.brands.length; i++) { s.push(opt(i, D.brands[i].name, i === bi)); }
    byId('brandSel').innerHTML = s.join('');

    s = [];
    var models = D.brands[bi].models;
    for (i = 0; i < models.length; i++) { s.push(opt(i, models[i].name, i === mi)); }
    byId('modelSel').innerHTML = s.join('');

    s = [];
    var confs = models[mi].configs;
    for (i = 0; i < confs.length; i++) { s.push(opt(i, confs[i].name, i === ci)); }
    byId('configSel').innerHTML = s.join('');
  }

  function render() {
    var cfg = find(state.key);
    var out = VVY.renderAll(cfg, state.person, state.metric);
    byId('scene').innerHTML = out.svg;
    byId('specs').innerHTML = out.specs;
    byId('comps').innerHTML = out.comps;
    byId('srcNote').innerHTML = out.src;
    byId('vehTitle').innerHTML = String(cfg.year ? cfg.year + ' ' : '') + cfg.brand + ' ' + cfg.model;
    byId('vehSub').innerHTML = cfg.name;
    byId('heightOut').innerHTML = VVY.personLabel(state.person, state.metric);
    byId('unitBtn').innerHTML = state.metric ? 'Metric (cm / kg)' : 'Imperial (ft-in / lb)';
  }

  function setKey(k) { state.key = k; fillSelects(); render(); }

  function onSel() {
    var bi = byId('brandSel').value;
    var mi = byId('modelSel').value;
    var ci = byId('configSel').value;
    setKey(bi + '|' + mi + '|' + ci);
  }

  function onBrand() {
    setKey(byId('brandSel').value + '|0|0');
  }
  function onModel() {
    setKey(byId('brandSel').value + '|' + byId('modelSel').value + '|0');
  }

  function doSearch() {
    var q = byId('search').value.toLowerCase().replace(/^\s+|\s+$/g, '');
    var box = byId('results');
    if (q.length < 2) { box.innerHTML = ''; box.className = 'vvy-results'; return; }
    var hits = [], i;
    for (i = 0; i < FLAT.length && hits.length < 40; i++) {
      if (FLAT[i].search.indexOf(q) >= 0) { hits.push(FLAT[i]); }
    }
    if (!hits.length) { box.innerHTML = '<p class="vvy-nores">No match.</p>'; box.className = 'vvy-results open'; return; }
    var s = [];
    for (i = 0; i < hits.length; i++) {
      s.push('<button type="button" class="vvy-hit" data-key="' + hits[i].key + '">' +
        hits[i].brand + ' ' + hits[i].model + ' <span>' + hits[i].name + '</span></button>');
    }
    box.innerHTML = s.join('');
    box.className = 'vvy-results open';
  }

  function onResultClick(e) {
    var t = e.target;
    while (t && t !== document.body) {
      if (t.getAttribute && t.getAttribute('data-key')) {
        setKey(t.getAttribute('data-key'));
        byId('results').innerHTML = '';
        byId('results').className = 'vvy-results';
        byId('search').value = '';
        return;
      }
      t = t.parentNode;
    }
  }

  function onSlider() {
    state.person = parseInt(byId('hslider').value, 10);
    render();
  }

  function onUnit() {
    state.metric = !state.metric;
    render();
  }

  function boot() {
    flatten();
    state.key = FLAT[0].key;
    var i;
    for (i = 0; i < FLAT.length; i++) {
      if (FLAT[i].brand === 'Ram' && FLAT[i].model === '1500' && FLAT[i].name.indexOf('Crew Cab') === 0) {
        state.key = FLAT[i].key; break;
      }
    }
    var ctrls = document.querySelectorAll('[data-live]');
    for (i = 0; i < ctrls.length; i++) { ctrls[i].removeAttribute('disabled'); }

    byId('brandSel').onchange = onBrand;
    byId('modelSel').onchange = onModel;
    byId('configSel').onchange = onSel;
    byId('search').onkeyup = doSearch;
    byId('search').onchange = doSearch;
    byId('results').onclick = onResultClick;
    byId('hslider').oninput = onSlider;
    byId('hslider').onchange = onSlider;
    byId('unitBtn').onclick = onUnit;

    byId('hslider').value = 75;
    fillSelects();
    render();

    var lv = byId('liveness');
    lv.innerHTML = 'Interactive';
    lv.className = 'vvy-live on';
    document.body.className = document.body.className.replace(/\bstatic\b/g, '') + ' live';
    byId('count').innerHTML = FLAT.length;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})();
