/* Full verification of ../vehicles-vs-you.html under jsdom: boot, 295-config sweep, crew, find,
   rankings, compare, cats, scene hits, interior view, error bar. Run: node verify.js (needs jsdom on
   NODE_PATH, e.g. NODE_PATH=/tmp/jt/node_modules). */
var fs = require('fs'); var path = require('path');
var jd = require('jsdom'); var JSDOM = jd.JSDOM, VirtualConsole = jd.VirtualConsole;
var file = path.join(__dirname, '..', 'vehicles-vs-you.html');
var html = fs.readFileSync(file, 'utf8');
var errors = []; var vc = new VirtualConsole();
vc.on('jsdomError', function (e) { errors.push(e.message); }); vc.on('error', function (m) { errors.push(m); }); vc.on('warn', function (m) { errors.push('warn:' + m); });
var dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
var w = dom.window, d = w.document;
function $(id) { return d.getElementById(id); }
function ev(el, type) { var e = d.createEvent('HTMLEvents'); e.initEvent(type, true, true); el.dispatchEvent(e); }
function click(el) { if (!el) { throw new Error('click on null'); } var e = d.createEvent('MouseEvents'); e.initEvent('click', true, true); el.dispatchEvent(e); }
var fails = 0; function check(ok, msg) { if (!ok) { fails++; } console.log((ok ? 'PASS ' : 'FAIL ') + msg); }
setTimeout(function () {
  check(/\blive\b/.test(d.body.className) && d.querySelectorAll('[data-live][disabled]').length === 0, 'boot: live, controls enabled, ' + w.RIDEFIT_VEHICLES.count + ' records');
  check($('errbar').style.display !== 'block', 'error bar hidden: ' + $('errbar').textContent);
  /* static first paint */
  var st = /<div class="pane" id="paneA">(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html), st2 = /<div class="pane" id="paneB">(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html);
  check(!!st && st[1].indexOf('vvy-veh-A') > 0 && html.indexOf('Ram 1500') > 0 && !!st2 && st2[1].indexOf('vvy-inside') > 0, 'static first paint: profile + overhead panes prerendered');
  var fam = st ? (st[1].match(/class="vvy-fam/g) || []).length : 0, dogs = st ? (st[1].match(/class="vvy-dog"/g) || []).length : 0;
  check(fam === 3 && dogs === 1 && st[1].indexOf("You &#183; 5' 10&quot;") > 0 && st[1].indexOf('animateTransform') < 0, 'static first paint crew: you 5\'10" + 3 riders + 1 dog, no animation (' + fam + ' riders, ' + dogs + ' dogs)');
  check(st2 && (st2[1].match(/vvy-seated-top/g) || []).length === 4, 'static overhead shows 4 seated riders');
  check(/\.scene \{[^}]*height: 44vh[^}]*contain: strict/.test(html), 'scene box has a reserved fixed height (contain: strict)');
  check(html.indexOf('data-layout=') < 0 && html.indexOf('overlay') < 0, 'no overlay mode left in the markup/scripts');
  check((html.match(/Vadim Yerokhin/g) || []).length === 1, 'attribution exactly once');
  /* sweep every config through the selectors, exterior + interior */
  /* jsdom re-parses ~700 KB of markup per render, so the DOM sweep samples every STEP-th config
     (STEP=1 for the full sweep); the pure-geometry sweep below covers all configs in both views. */
  var STEP = parseInt(process.env.STEP || '5', 10), seen = 0;
  var n = 0, bad = [], bs = $('brandSel'), bi, mi, ci, ms, cs, s;
  for (bi = 0; bi < bs.options.length; bi++) {
    bs.value = bi; ev(bs, 'change'); ms = $('modelSel');
    for (mi = 0; mi < ms.options.length; mi++) {
      ms.value = mi; ev(ms, 'change'); cs = $('configSel');
      for (ci = 0; ci < cs.options.length; ci++) {
        if ((seen++) % STEP !== 0) { continue; }
        cs.value = ci; ev(cs, 'change'); n++;
        s = $('scene').innerHTML;
        if (!/<svg/.test(s) || /NaN|undefined/.test(s) || /NaN|undefined/.test($('specs').textContent) || /NaN|undefined/.test($('room').textContent)) { bad.push($('vehTitle').textContent); }
        if (!/vvy-inside/.test(s)) { bad.push('no overhead pane ' + $('vehTitle').textContent); }
        if (w.RideFitView) { w.RideFitView.set('cutaway'); s = $('scene').innerHTML; if (!/vvy-interior/.test(s) || /NaN|undefined/.test(s)) { bad.push('cutaway ' + $('vehTitle').textContent); } w.RideFitView.set('profile'); }
      }
    }
  }
  check(bad.length === 0, 'DOM sweep: ' + n + ' of ' + w.RIDEFIT_VEHICLES.count + ' configs rendered in both views' + (bad.length ? ' problems: ' + bad.slice(0, 5).join('; ') : ''));
  /* geometry sweep: every config, exterior (with crew, interactive) and interior, straight from VVY */
  var V = w.VVY, gbad = 0, gi, rec, cfgs = [], gparty = { people: [{ kind: 'adult', h: 72 }, { kind: 'kid', h: 45 }, { kind: 'adult', h: 66 }], dogs: 1, cats: 2 };
  for (gi = 0; gi < w.RIDEFIT_VEHICLES.vehicles.length; gi++) { rec = w.RideFitData.toFlat(w.RIDEFIT_VEHICLES.vehicles[gi]); cfgs.push(rec); }
  for (gi = 0; gi < cfgs.length; gi++) {
    var e1 = V.effective(cfgs[gi], null), s1 = V.renderScene([e1], 75, false, { party: gparty, interactive: true, wag: true }), s2 = V.renderInterior(e1, 75, false, { party: gparty }), s3 = V.renderInside(e1, 75, false, { party: gparty });
    if (!/<svg/.test(s1) || /NaN|undefined/.test(s1) || !/<svg/.test(s2) || /NaN|undefined/.test(s2) || !/<svg/.test(s3) || /NaN|undefined/.test(s3) || /<filter/.test(s1 + s2 + s3)) { gbad++; if (gbad < 3) { console.log('   bad: ' + cfgs[gi].brand + ' ' + cfgs[gi].model); } }
  }
  check(gbad === 0 && cfgs.length === w.RIDEFIT_VEHICLES.count, 'geometry sweep: ' + cfgs.length + ' configs x (profile + cutaway + overhead), no NaN/undefined/filters, ' + gbad + ' bad');
  /* crew */
  click($('addAdult')); click($('addKid')); click(d.querySelector('[data-step="dogs"][data-d="1"]')); click(d.querySelector('[data-step="cats"][data-d="1"]'));
  check(d.querySelectorAll('#paneA .vvy-fam').length === 5 && d.querySelectorAll('#paneA .vvy-dog').length === 2 && d.querySelectorAll('#paneA .vvy-cat').length === 1 && d.querySelectorAll('#paneA .vvy-tail animateTransform').length === 2, 'crew drawn: default 3 + 2 riders, 2 dogs (tails wagging), 1 cat');
  check($('room').textContent.indexOf('Your') >= 0, 'room guidance mentions riders');
  /* find */
  click($('statebar').querySelector('[data-seg="find"]'));
  click(d.querySelector('[data-add="preset:family5"]')); var f1 = parseInt($('fnum').textContent, 10);
  click($('fbrowse')); var sug = d.querySelector('[data-add="need:rows3"]'); if (sug) { click(sug); } var f2 = parseInt($('fnum').textContent, 10);
  check(f1 > 0 && f2 <= f1, 'find: family5=' + f1 + ' +3rd row=' + f2 + ' | chip: ' + $('statebar').querySelector('[data-seg="find"]').textContent);
  click($('fshow'));
  var rows = $('rankTable').querySelectorAll('tbody tr').length;
  check(rows === f2 && $('sheet').getAttribute('data-pos') === 'full', 'rankings: ' + rows + ' rows (filtered), sheet full');
  click($('fclear'));
  var all = $('rankTable').querySelectorAll('tbody tr').length;
  check(all === w.RIDEFIT_VEHICLES.count, 'rankings unfiltered: ' + all);
  /* rankings columns: row fit */
  var th = $('rankTable').querySelectorAll('thead th'); var hdr = []; for (var i = 0; i < th.length; i++) { hdr.push(th[i].textContent.replace(/\s+/g, ' ').trim()); }
  console.log('     columns: ' + hdr.join(' | '));
  var fitCol = d.querySelector('[data-sort="fit1"]'); if (fitCol) { click(fitCol); check($('rankTable').querySelectorAll('tbody tr').length === all, 'sort by row-1 fit keeps ' + all + ' rows'); }
  /* compare via shortlist */
  click($('rankTable').querySelector('[data-heart]')); click($('shortlist').querySelector('[data-slb]'));
  check($('legend').querySelector('.pillB') !== null && $('cmpBody').querySelectorAll('tbody tr').length > 5, 'compare: ' + $('legend').textContent.replace(/\s+/g, ' ').slice(0, 70) + ' | ' + $('cmpBody').querySelectorAll('tbody tr').length + ' rows');
  check($('scene').className.indexOf('one') >= 0 && d.querySelectorAll('#paneA .vvy-veh-B').length === 1 && $('viewCtl').style.display !== 'none', 'compare profile: A and B in one pane, view control shown');
  click($('viewCtl').querySelector('[data-view="overhead"]'));
  check(d.querySelectorAll('#paneA .vvy-inside').length === 1 && d.querySelectorAll('#paneB .vvy-inside').length === 1 && $('scene').className.indexOf('two') >= 0, 'compare seats: overhead A | overhead B');
  click($('viewCtl2').querySelector('[data-view="cutaway"]'));
  check(d.querySelectorAll('#paneA .vvy-interior').length === 1 && d.querySelectorAll('#paneB .vvy-interior.vvy-role-B').length === 1, 'compare peek inside: cutaway A | cutaway B, one control');
  click($('viewCtl').querySelector('[data-view="profile"]'));
  /* scene hits */
  var hitC = d.querySelector('#scene [data-hit="crew"]'); click(hitC);
  check($('sheet').getAttribute('data-pos') !== 'peek' && d.querySelector('.segbtn.on').getAttribute('data-seg') === 'crew', 'tap people -> Crew');
  click($('clearBtn')); var q = d.querySelector('#scene [data-hit="compare"]'); click(q);
  check(d.querySelector('.segbtn.on').getAttribute('data-seg') === 'compare', 'tap ? -> Compare');
  /* interior toggle */
  var tog = d.querySelector('#scene [data-hit="view"]');
  check(!!tog, 'interior toggle present in scene');
  if (tog) { click(tog); check(d.querySelector('#paneA .vvy-interior') !== null && d.querySelector('#paneB .vvy-inside') !== null, 'peek inside: cutaway in pane A, overhead stays in pane B'); var cal = d.querySelectorAll('#paneA .vvy-interior text').length; console.log('     ' + ($('paneA').querySelector('svg').getAttribute('aria-label') || '').slice(0, 90) + ' | text nodes ' + cal); check(/head/.test($('paneA').textContent) && /knee|leg/.test($('paneA').textContent), 'cutaway callouts mention head + knee'); click(d.querySelector('#scene [data-hit="view"]')); check(d.querySelector('#paneA .vvy-veh-A') !== null && d.querySelector('#paneA .vvy-interior') === null, 'back to profile'); }
  /* stable box: the scene element keeps the same class/height contract across states */
  var scBox = $('scene'); check(scBox.className.indexOf('scene') === 0 && scBox.querySelectorAll('.pane').length === 2, 'scene keeps its two reserved panes');
  /* ES5: no arrow/let/const/template literals in inline scripts */
  var scripts = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  var es6 = 0; for (i = 0; i < scripts.length; i++) { if (/=>|\blet\b |\bconst\b |`/.test(scripts[i].replace(/RIDEFIT_VEHICLES=[\s\S]*$/, ''))) { es6++; } }
  check(es6 === 0, 'ES5: no ES6 syntax in ' + scripts.length + ' script blocks');
  setTimeout(function () {
    check(errors.length === 0, 'console clean: ' + errors.length + (errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''));
    check($('errbar').style.display !== 'block', 'error bar still hidden after 7s: ' + $('errbar').textContent.slice(0, 200));
    console.log(fails ? 'FAILURES: ' + fails : 'ALL PASS');
    process.exit(fails ? 1 : 0);
  }, 7000);
}, 600);
