/* Cat locomotion check: sample every cat transform over ~2 real minutes (accelerated by patching
   Date + timers) and assert that every movement step is axis-aligned (dx≈0 or dy≈0) unless the leg
   starts or ends at the windshield spot. NODE_PATH must include jsdom. */
var fs = require('fs'); var path = require('path');
var jd = require('jsdom'); var JSDOM = jd.JSDOM;
var html = fs.readFileSync(path.join(__dirname, '..', 'vehicles-vs-you.html'), 'utf8');
var dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window, d = w.document;
function ev(el, type) { var e = d.createEvent('HTMLEvents'); e.initEvent(type, true, true); el.dispatchEvent(e); }
function click(el) { var e = d.createEvent('MouseEvents'); e.initEvent('click', true, true); el.dispatchEvent(e); }
setTimeout(function () {
  /* pick the Ram (pickup: hood, roof, bed rail, cab back all present) and add 3 cats */
  var bs = d.getElementById('brandSel'); var i;
  for (i = 0; i < 3; i++) { click(d.querySelector('[data-step="cats"][data-d="1"]')); }
  var g = d.querySelector('.vvy-cats'); var spots = JSON.parse(g.getAttribute('data-spots')); var geo = JSON.parse(g.getAttribute('data-geo'));
  console.log('spots: ' + spots.map(function (s) { return s[2]; }).join(', '));
  console.log('geo: ' + JSON.stringify(geo));
  var ws = null; for (i = 0; i < spots.length; i++) { if (spots[i][2] === 'windshield') { ws = spots[i]; } }
  var els = d.querySelectorAll('.vvy-cat'), last = [], diag = 0, steps = 0, legsSeen = {};
  for (i = 0; i < els.length; i++) { last.push(null); }
  function pos(el) { var m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(el.getAttribute('transform') || ''); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; }
  var t = 0, n = 0;
  var iv = setInterval(function () {
    for (i = 0; i < els.length; i++) {
      var p = pos(els[i]); if (!p) { continue; }
      if (last[i]) {
        var dx = Math.abs(p[0] - last[i][0]), dy = Math.abs(p[1] - last[i][1]);
        if (dx > 0.05 || dy > 0.05) {
          steps++;
          /* a windshield leg is a straight line that starts or ends on the windshield spot (±5 x jitter):
             test the distance from the windshield spot to the step's line */
          var nearW = false;
          if (ws) { var vx = p[0] - last[i][0], vy = p[1] - last[i][1], L = Math.hypot(vx, vy) || 1; var dist = Math.abs((ws[0] - last[i][0]) * vy - (ws[1] - last[i][1]) * vx) / L; nearW = dist < 12; }
          /* walk legs bob up to 0.7 vertically while moving horizontally; climbs jitter 0.6 horizontally */
          if (dx > 1.0 && dy > 1.0 && !nearW) { diag++; if (diag < 6) { console.log('DIAGONAL step cat ' + i + ': ' + last[i] + ' -> ' + p); } }
          if (dx > 1.0 && dy <= 1.0) { legsSeen.walk = (legsSeen.walk || 0) + 1; }
          if (dy > 1.0 && dx <= 1.0) { legsSeen.vertical = (legsSeen.vertical || 0) + 1; }
          if (dx > 1.0 && dy > 1.0 && nearW) { legsSeen.windshieldFly = (legsSeen.windshieldFly || 0) + 1; }
        }
      }
      last[i] = p;
    }
    n++;
    if (n > 2400) {   /* 2400 * 50ms = 120 s */
      clearInterval(iv);
      console.log('steps sampled: ' + steps + ' | walk ' + (legsSeen.walk || 0) + ' | vertical ' + (legsSeen.vertical || 0) + ' | windshield fly ' + (legsSeen.windshieldFly || 0) + ' | diagonal (non-windshield): ' + diag);
      console.log(diag === 0 && steps > 50 ? 'CATS PASS' : 'CATS FAIL');
      process.exit(diag === 0 && steps > 50 ? 0 : 1);
    }
  }, 50);
}, 800);
