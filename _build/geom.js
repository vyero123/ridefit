/* vehicles-vs-you : geometry + HTML/SVG builders.  ES5 ONLY. */
var VVY = (function () {
  'use strict';

  var LANDMARKS = [
    { f: 1.000, n: 'the top of your head' },
    { f: 0.955, n: 'the top of your forehead' },
    { f: 0.930, n: 'your eye level' },
    { f: 0.870, n: 'your chin' },
    { f: 0.820, n: 'your shoulders' },
    { f: 0.755, n: 'your armpits' },
    { f: 0.715, n: 'the middle of your chest' },
    { f: 0.650, n: 'the bottom of your ribs' },
    { f: 0.605, n: 'your navel' },
    { f: 0.560, n: 'your belt line' },
    { f: 0.515, n: 'your hips' },
    { f: 0.480, n: 'your wrists' },
    { f: 0.395, n: 'your fingertips' },
    { f: 0.340, n: 'mid-thigh' },
    { f: 0.285, n: 'your kneecaps' },
    { f: 0.200, n: 'mid-shin' },
    { f: 0.060, n: 'your ankles' }
  ];

  var PAL = {
    A: { body: '#3f6285', stroke: '#24405c', glass: '#a9c0d3', wheel: '#20272e', hub: '#98a3ae', guide: '#1f4e79', op: 1 },
    B: { body: '#f1b93f', stroke: '#9a6a12', glass: '#f8e6b8', wheel: '#5c4a1e', hub: '#e9d7a8', guide: '#b7791f', op: 0.55 }
  };

  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r0(n) { return Math.round(n); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function comma(n) {
    var s = String(Math.round(n)), o = '', c = 0, i;
    for (i = s.length - 1; i >= 0; i--) { o = s.charAt(i) + o; c++; if (c % 3 === 0 && i > 0) { o = ',' + o; } }
    return o;
  }
  function ftin(inches) {
    var t = Math.round(inches), f = Math.floor(t / 12), i = t - f * 12;
    return f + "'" + i + '"';
  }
  function has(v) { return v !== null && v !== undefined && !isNaN(v); }
  function dim(inches, metric) {
    if (!has(inches)) { return null; }
    if (metric) { return r1(inches * 2.54) + ' cm'; }
    return r1(inches) + ' in (' + ftin(inches) + ')';
  }
  function shortDim(inches, metric) {
    if (metric) { return r1(inches * 2.54) + ' cm'; }
    return r1(inches) + ' in';
  }
  function mass(lb, metric) {
    if (!has(lb)) { return null; }
    if (metric) { return comma(lb * 0.45359237) + ' kg'; }
    return comma(lb) + ' lb';
  }
  function personLabel(inches, metric) {
    if (metric) { return r0(inches * 2.54) + ' cm'; }
    var t = Math.round(inches);
    return Math.floor(t / 12) + "' " + (t % 12) + '"';
  }
  function indexOf(arr, v) {
    var i; for (i = 0; i < arr.length; i++) { if (arr[i] === v) { return i; } } return -1;
  }

  /* ---------------- depth: colour helpers + per-scene <defs> collector ----------------
     Flat-illustration depth: one light from the upper-left, soft gradients, ambient occlusion where
     forms meet, contact shadows on the ground. Gradients and clipPaths only — no filters, so a phone
     never stalls. Geometry is never touched: shading is layered on top of (or clipped to) the exact
     same outlines. */
  function hexRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgbHex(c) {
    var i, s = '#', v;
    for (i = 0; i < 3; i++) { v = Math.max(0, Math.min(255, Math.round(c[i]))); s += (v < 16 ? '0' : '') + v.toString(16); }
    return s;
  }
  /* shade(hex, k): k>0 mixes towards white, k<0 towards black (0..1) */
  function shade(hex, k) {
    var c = hexRgb(hex), t = k > 0 ? 255 : 0, a = Math.abs(k), i;
    for (i = 0; i < 3; i++) { c[i] = c[i] + (t - c[i]) * a; }
    return rgbHex(c);
  }
  /* Defs collector: gradients/clips are emitted once per <svg>; ids are prefixed so two scenes can
     coexist in one document. */
  function Defs(prefix) {
    this.p = prefix || 'vvy';
    this.out = [];
    this.n = 0;
    this.seen = {};
  }
  Defs.prototype.id = function (k) { return this.p + '-' + k; };
  Defs.prototype.add = function (key, markup) {
    if (!this.seen[key]) { this.seen[key] = true; this.out.push(markup); }
    return this.id(key);
  };
  /* vertical body gradient (top lit, bottom in shade) */
  Defs.prototype.vgrad = function (key, hex, top, bot, mid) {
    var id = this.id(key);
    return this.add(key, '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + shade(hex, top) + '"/>' +
      '<stop offset="0.45" stop-color="' + shade(hex, mid || 0) + '"/>' +
      '<stop offset="1" stop-color="' + shade(hex, bot) + '"/></linearGradient>');
  };
  /* horizontal figure gradient in user space (lit from the left) */
  Defs.prototype.hgrad = function (key, hex, x1, x2) {
    var id = this.id(key);
    return this.add(key, '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + r1(x1) + '" y1="0" x2="' + r1(x2) + '" y2="0">' +
      '<stop offset="0" stop-color="' + shade(hex, 0.22) + '"/>' +
      '<stop offset="0.55" stop-color="' + hex + '"/>' +
      '<stop offset="1" stop-color="' + shade(hex, -0.28) + '"/></linearGradient>');
  };
  /* radial gradient for tires / rims (light spot up-left gives the dish its curvature) */
  Defs.prototype.rgrad = function (key, stops, fx, fy) {
    var id = this.id(key), s = [], i;
    for (i = 0; i < stops.length; i++) { s.push('<stop offset="' + stops[i][0] + '" stop-color="' + stops[i][1] + '"' + (stops[i][2] !== undefined ? ' stop-opacity="' + stops[i][2] + '"' : '') + '/>'); }
    return this.add(key, '<radialGradient id="' + id + '" cx="0.5" cy="0.5" r="0.5" fx="' + (fx === undefined ? 0.36 : fx) + '" fy="' + (fy === undefined ? 0.34 : fy) + '">' + s.join('') + '</radialGradient>');
  };
  Defs.prototype.clip = function (key, markup) {
    var id = this.id(key);
    return this.add(key, '<clipPath id="' + id + '">' + markup + '</clipPath>');
  };
  Defs.prototype.html = function () { return this.out.length ? '<defs>' + this.out.join('') + '</defs>' : ''; };
  /* contact shadow: two stacked ellipses fake a soft penumbra without a filter */
  function groundShadow(cx, cy, rx, ry, op) {
    op = op || 0.16;
    return '<g class="vvy-shadow"><ellipse cx="' + r1(cx) + '" cy="' + r1(cy) + '" rx="' + r1(rx * 1.12) + '" ry="' + r1(ry * 1.5) + '" fill="#1f2933" opacity="' + r2(op * 0.35) + '"/>' +
      '<ellipse cx="' + r1(cx) + '" cy="' + r1(cy) + '" rx="' + r1(rx) + '" ry="' + r1(ry) + '" fill="#1f2933" opacity="' + r2(op) + '"/></g>';
  }
  function isApprox(cfg, field) {
    return !!(cfg.approx && cfg.approx.length && indexOf(cfg.approx, field) >= 0);
  }

  /* ---------------- tires ---------------- */

  function parseTire(s) {
    if (!s) { return null; }
    var str = String(s), m;
    m = /(\d{3})\/(\d{2,3})\s*[A-Z]*R(\d{2}(?:\.\d)?)/.exec(str);
    if (m) {
      var w = parseFloat(m[1]), a = parseFloat(m[2]), r = parseFloat(m[3]);
      return { dia: r + 2 * (w * a / 100) / 25.4, label: m[0] };
    }
    m = /(\d{2}(?:\.\d)?)[xX](\d{1,2}(?:\.\d+)?)\s*[A-Z]*R?(\d{2})/.exec(str);
    if (m) { return { dia: parseFloat(m[1]), label: m[0] }; }
    return null;
  }

  function stockWheelDia(cfg) {
    var t = parseTire(cfg.tire);
    if (t) { return { dia: t.dia, approx: false, label: t.label }; }
    var b = buildBody(cfg);
    return { dia: b.wheelR * 2 * cfg.height, approx: true, label: null };
  }

  /* effective(cfg, mods) -> copy of cfg with lift / tire changes applied.
     mods = { lift: inches, tireDia: inches or null } */
  function effective(cfg, mods) {
    var e = {}, k;
    for (k in cfg) { if (cfg.hasOwnProperty(k)) { e[k] = cfg[k]; } }
    var stock = stockWheelDia(cfg);
    var lift = (mods && mods.lift) ? mods.lift : 0;
    var newDia = (mods && mods.tireDia) ? mods.tireDia : stock.dia;
    var rise = lift + (newDia - stock.dia) / 2;
    e.stock = cfg;
    e.wheelDia = newDia;
    e.stockDia = stock.dia;
    e.stockDiaApprox = stock.approx;
    e.stockTireLabel = stock.label;
    e.lift = lift;
    e.tireDelta = newDia - stock.dia;
    e.rise = rise;
    e.modified = Math.abs(rise) > 0.01;
    if (e.modified) {
      e.height = cfg.height + rise;
      if (has(cfg.clearance)) { e.clearance = cfg.clearance + rise; }
      if (has(cfg.bedHeight)) { e.bedHeight = cfg.bedHeight + rise; }
      if (has(cfg.hoodHeight)) { e.hoodHeight = cfg.hoodHeight + rise; }
      e.approx = (cfg.approx || []).concat(['height', 'clearance', 'bedHeight', 'hoodHeight']);
    }
    return e;
  }

  /* ---------------- body templates ---------------- */

  function P(x, y) { return [x, y]; }

  function buildBody(cfg) {
    var H = cfg.height, L = cfg.length;
    var clr = has(cfg.clearance) ? cfg.clearance : H * 0.115;
    var gc = clr / H;
    if (gc > 0.30) { gc = 0.30; }
    if (gc < 0.03) { gc = 0.03; }
    var bb = gc + 0.055;
    if (bb > 0.36) { bb = 0.36; }
    var t = cfg.template || 'sedan';
    var pts = null, glass = null, wheelR = 0.20, foSplit = 0.44;

    if (t === 'pickup_full' || t === 'pickup_hd' || t === 'pickup_mid' || t === 'pickup_compact') {
      var hd = (t === 'pickup_hd');
      var comp = (t === 'pickup_compact');
      var rail = hd ? 0.635 : (comp ? 0.605 : 0.615);
      var hood = hd ? 0.615 : (comp ? 0.545 : 0.575);
      var bedFrac = (cfg.bedLen ? (cfg.bedLen / L) : 0.295) + 0.022;
      var cabLen = cfg.cab === 'reg' ? 0.235 : (cfg.cab === 'ext' ? 0.300 : 0.340);
      var bedFront = 1 - bedFrac;
      var cabFront = bedFront - cabLen;
      if (cabFront < 0.16) { cabFront = 0.16; }
      var roofF = cabFront + 0.078;
      var roofR = bedFront - 0.022;
      if (roofR < roofF + 0.05) { roofR = roofF + 0.05; }
      pts = [
        P(0.000, bb), P(0.000, hood - 0.085), P(0.030, hood - 0.030),
        P(cabFront * 0.55, hood - 0.014), P(cabFront, hood),
        P(roofF, 1.000), P(roofR, 1.000),
        P(bedFront - 0.010, rail + 0.022), P(bedFront, rail),
        P(0.994, rail), P(1.000, rail - 0.045),
        P(1.000, bb + 0.055), P(0.986, bb + 0.018), P(0.944, bb)
      ];
      glass = [
        P(cabFront + 0.014, hood + 0.012), P(roofF + 0.012, 0.972),
        P(roofR - 0.012, 0.972), P(roofR - 0.012, hood + 0.012)
      ];
      wheelR = hd ? 0.230 : (comp ? 0.205 : 0.218);
      foSplit = 0.44;
    } else if (t === 'wedge') {
      pts = [
        P(0.000, bb), P(0.000, 0.300), P(0.020, 0.345),
        P(0.435, 1.000), P(0.640, 0.855), P(0.988, 0.605),
        P(1.000, 0.560), P(1.000, bb + 0.050), P(0.960, bb)
      ];
      glass = [P(0.245, 0.590), P(0.430, 0.960), P(0.610, 0.845), P(0.612, 0.600)];
      wheelR = 0.230; foSplit = 0.46;
    } else if (t === 'suv') {
      pts = [
        P(0.000, bb), P(0.000, 0.400), P(0.040, 0.500), P(0.180, 0.545),
        P(0.300, 0.575), P(0.410, 0.955), P(0.452, 1.000),
        P(0.845, 1.000), P(0.905, 0.960), P(0.962, 0.735),
        P(0.988, 0.520), P(1.000, 0.440), P(1.000, bb + 0.050), P(0.958, bb)
      ];
      glass = [P(0.318, 0.600), P(0.436, 0.955), P(0.885, 0.955), P(0.900, 0.600)];
      wheelR = 0.205; foSplit = 0.45;
    } else if (t === 'wagon') {
      pts = [
        P(0.000, bb), P(0.000, 0.370), P(0.045, 0.470), P(0.190, 0.520),
        P(0.320, 0.560), P(0.440, 0.950), P(0.485, 1.000),
        P(0.870, 1.000), P(0.930, 0.950), P(0.975, 0.700),
        P(1.000, 0.470), P(1.000, bb + 0.050), P(0.958, bb)
      ];
      glass = [P(0.340, 0.585), P(0.468, 0.952), P(0.905, 0.952), P(0.920, 0.585)];
      wheelR = 0.195; foSplit = 0.45;
    } else if (t === 'sedan') {
      pts = [
        P(0.000, bb), P(0.010, 0.375), P(0.090, 0.490), P(0.270, 0.540),
        P(0.415, 0.910), P(0.505, 1.000), P(0.690, 1.000),
        P(0.830, 0.885), P(0.965, 0.600), P(1.000, 0.500),
        P(1.000, bb + 0.055), P(0.955, bb)
      ];
      glass = [P(0.295, 0.570), P(0.430, 0.955), P(0.700, 0.955), P(0.830, 0.570)];
      wheelR = 0.235; foSplit = 0.46;
    } else if (t === 'coupe') {
      pts = [
        P(0.000, bb), P(0.008, 0.360), P(0.080, 0.470), P(0.250, 0.510),
        P(0.400, 0.900), P(0.500, 1.000), P(0.640, 1.000),
        P(0.880, 0.760), P(0.985, 0.585), P(1.000, 0.505),
        P(1.000, bb + 0.050), P(0.955, bb)
      ];
      glass = [P(0.278, 0.545), P(0.420, 0.950), P(0.650, 0.950), P(0.845, 0.640)];
      wheelR = 0.250; foSplit = 0.46;
    } else if (t === 'hatchback') {
      pts = [
        P(0.000, bb), P(0.010, 0.380), P(0.085, 0.490), P(0.265, 0.540),
        P(0.415, 0.915), P(0.500, 1.000), P(0.760, 1.000),
        P(0.905, 0.940), P(0.978, 0.640), P(1.000, 0.520),
        P(1.000, bb + 0.055), P(0.955, bb)
      ];
      glass = [P(0.292, 0.572), P(0.428, 0.955), P(0.775, 0.955), P(0.900, 0.645)];
      wheelR = 0.225; foSplit = 0.46;
    } else if (t === 'minivan') {
      pts = [
        P(0.000, bb), P(0.000, 0.400), P(0.045, 0.500), P(0.165, 0.545),
        P(0.290, 0.940), P(0.350, 1.000), P(0.855, 1.000),
        P(0.935, 0.930), P(0.985, 0.640), P(1.000, 0.520),
        P(1.000, bb + 0.050), P(0.958, bb)
      ];
      glass = [P(0.192, 0.575), P(0.318, 0.955), P(0.885, 0.955), P(0.930, 0.640)];
      wheelR = 0.200; foSplit = 0.44;
    } else if (t === 'van') {
      pts = [
        P(0.000, bb), P(0.000, 0.420), P(0.030, 0.560), P(0.115, 0.930),
        P(0.160, 1.000), P(0.985, 1.000), P(1.000, 0.960),
        P(1.000, bb + 0.045), P(0.965, bb)
      ];
      glass = [P(0.052, 0.600), P(0.132, 0.950), P(0.300, 0.950), P(0.300, 0.600)];
      wheelR = 0.180; foSplit = 0.40;
    } else {
      pts = [
        P(0.000, bb), P(0.010, 0.380), P(0.090, 0.490), P(0.270, 0.540),
        P(0.415, 0.910), P(0.505, 1.000), P(0.690, 1.000),
        P(0.830, 0.885), P(0.965, 0.600), P(1.000, 0.500),
        P(1.000, bb + 0.055), P(0.955, bb)
      ];
      wheelR = 0.230; foSplit = 0.46;
    }
    if (cfg.wheelR) { wheelR = cfg.wheelR; }
    return { pts: pts, glass: glass, wheelR: wheelR, foSplit: foSplit, gc: gc };
  }

  /* ---------------- person ---------------- */

  var TORSO = [
    [-0.030, 0.878], [0.030, 0.878], [0.055, 0.845], [0.112, 0.820],
    [0.106, 0.760], [0.082, 0.640], [0.076, 0.600], [0.098, 0.530],
    [0.100, 0.470], [0.014, 0.455], [-0.014, 0.455], [-0.100, 0.470],
    [-0.098, 0.530], [-0.076, 0.600], [-0.082, 0.640], [-0.106, 0.760],
    [-0.112, 0.820], [-0.055, 0.845]
  ];
  var ARM = [
    [0.112, 0.818], [0.150, 0.788], [0.148, 0.620], [0.140, 0.478],
    [0.108, 0.476], [0.098, 0.620], [0.096, 0.778]
  ];
  var LEG = [
    [0.012, 0.460], [0.102, 0.468], [0.098, 0.330], [0.080, 0.140],
    [0.076, 0.000], [0.026, 0.000], [0.024, 0.140], [0.008, 0.300]
  ];

  function polyPts(arr, h, cx, Y, mirror) {
    var s = [], i, x;
    for (i = 0; i < arr.length; i++) {
      x = mirror ? -arr[i][0] : arr[i][0];
      s.push(r1(cx + x * h) + ',' + r1(Y(arr[i][1] * h)));
    }
    return s.join(' ');
  }

  /* dx = Defs collector (optional: without it the figure is flat, as in the old static output) */
  function personSvg(h, cx, Y, fill, cls, dx) {
    var o = [], col = fill || '#1f2933', paint = col;
    if (dx) {
      paint = 'url(#' + dx.hgrad('p' + (dx.n++), col, cx - 0.15 * h, cx + 0.15 * h) + ')';
      o.push(groundShadow(cx, Y(0) + 0.6, 0.16 * h, 1.4, 0.18));
    }
    o.push('<g class="' + (cls || 'vvy-person') + '" fill="' + paint + '">');
    /* far arm + far leg sit slightly darker (ambient occlusion behind the torso) */
    if (dx) {
      o.push('<polygon points="' + polyPts(ARM, h, cx, Y, true) + '" fill="' + shade(col, -0.3) + '"/>');
      o.push('<polygon points="' + polyPts(LEG, h, cx, Y, true) + '" fill="' + shade(col, -0.22) + '"/>');
    } else {
      o.push('<polygon points="' + polyPts(ARM, h, cx, Y, true) + '"/>');
      o.push('<polygon points="' + polyPts(LEG, h, cx, Y, true) + '"/>');
    }
    o.push('<polygon points="' + polyPts(LEG, h, cx, Y, false) + '"/>');
    o.push('<polygon points="' + polyPts(TORSO, h, cx, Y, false) + '"/>');
    o.push('<polygon points="' + polyPts(ARM, h, cx, Y, false) + '"/>');
    o.push('<ellipse cx="' + r1(cx) + '" cy="' + r1(Y(0.9345 * h)) + '" rx="' + r1(0.0435 * h) + '" ry="' + r1(0.0655 * h) + '"/>');
    if (dx) {
      /* rim light on the head and shoulder, neck shadow under the chin */
      o.push('<ellipse cx="' + r1(cx - 0.014 * h) + '" cy="' + r1(Y(0.955 * h)) + '" rx="' + r1(0.016 * h) + '" ry="' + r1(0.026 * h) + '" fill="#fff" opacity="0.22"/>');
      o.push('<ellipse cx="' + r1(cx) + '" cy="' + r1(Y(0.872 * h)) + '" rx="' + r1(0.03 * h) + '" ry="' + r1(0.012 * h) + '" fill="#000" opacity="0.18"/>');
    }
    o.push('</g>');
    return o.join('');
  }

  /* ---------------- pets ----------------
     dogSvg: side-view dog, h = shoulder height in inches, standing at ground x = cx.
     catSvg: side-view cat sprite centred on (0,0) at ground level, ~10 in tall; placed via transform. */
  function dogSvg(h, cx, Y, fill, dx) {
    var u = h / 22;  /* 22 in shoulder height reference */
    function X(x) { return r1(cx + x * u); }
    function YY(y) { return r1(Y(y * u)); }
    var col = fill || '#6b4f3a', paint = col, far = col;
    var o = [];
    if (dx) {
      paint = 'url(#' + dx.vgrad('dog', col, 0.22, -0.3) + ')';
      far = shade(col, -0.28);
      o.push(groundShadow(cx - 2 * u, Y(0) + 0.6, 16 * u, 1.3, 0.18));
    }
    o.push('<g class="vvy-dog" fill="' + paint + '">');
    /* far legs first, darker */
    o.push('<rect x="' + X(-12) + '" y="' + YY(12) + '" width="' + r1(3 * u) + '" height="' + r1(12 * u) + '" fill="' + far + '"/>');
    o.push('<rect x="' + X(1) + '" y="' + YY(12) + '" width="' + r1(3 * u) + '" height="' + r1(12 * u) + '" fill="' + far + '"/>');
    o.push('<path d="M' + X(-14) + ' ' + YY(19) + ' L' + X(6) + ' ' + YY(21) + ' L' + X(8) + ' ' + YY(14) + ' L' + X(-12) + ' ' + YY(12) + ' Z"/>');
    o.push('<path d="M' + X(6) + ' ' + YY(21) + ' L' + X(9) + ' ' + YY(27) + ' L' + X(16) + ' ' + YY(25) + ' L' + X(15) + ' ' + YY(20) + ' L' + X(10) + ' ' + YY(18) + ' Z"/>');
    o.push('<path d="M' + X(9) + ' ' + YY(27) + ' L' + X(7) + ' ' + YY(31) + ' L' + X(11) + ' ' + YY(28) + ' Z"/>');
    o.push('<path d="M' + X(-14) + ' ' + YY(19) + ' L' + X(-19) + ' ' + YY(26) + ' L' + X(-17) + ' ' + YY(27) + ' L' + X(-12) + ' ' + YY(20) + ' Z"/>');
    o.push('<rect x="' + X(-6) + '" y="' + YY(12) + '" width="' + r1(3 * u) + '" height="' + r1(12 * u) + '"/>');
    o.push('<rect x="' + X(5) + '" y="' + YY(12) + '" width="' + r1(3 * u) + '" height="' + r1(12 * u) + '"/>');
    if (dx) {
      /* back highlight + eye */
      o.push('<path d="M' + X(-12) + ' ' + YY(18.4) + ' L' + X(5) + ' ' + YY(20.3) + '" stroke="#fff" stroke-width="' + r1(0.9 * u) + '" stroke-linecap="round" opacity="0.18" fill="none"/>');
      o.push('<circle cx="' + X(12.5) + '" cy="' + YY(24) + '" r="' + r1(0.7 * u) + '" fill="#1f2933"/>');
    }
    o.push('</g>');
    return o.join('');
  }

  /* Speech bubble in the cat's local frame (origin at the feet, +x = facing direction, y up is
     negative). MOUTH = (8.9, -6.3): the front-bottom of the head circle (cx 6.6, cy -7.4, r 2.9).
     The tail tip sits exactly on the mouth; the body floats above the head. When the cat faces
     left the animator mirrors this group about x = MOUTH_X, so the tip stays on the mouth and the
     text is un-mirrored by the group's own flip. */
  var CAT_MOUTH_X = 8.9, CAT_MOUTH_Y = -6.3;
  function meowSvg() {
    var tipX = CAT_MOUTH_X, tipY = CAT_MOUTH_Y;
    /* body: soft organic blob (ellipse-ish with gentle bumps), centre ~ (9.5, -19) */
    var body = 'M0.8 -18.6 C0.6 -21.8 3.4 -24.2 7.2 -24.4 C10.4 -25.4 14.6 -24.6 16.8 -22.2 C19.2 -20.2 18.8 -16.4 16.2 -14.8 C14 -13.2 10.4 -13 7.6 -13.6 C4.2 -13.2 1 -15.4 0.8 -18.6 Z';
    /* tail: curved comic tail from the underside of the body down to the mouth */
    var tail = 'M5.4 -14.2 C6.6 -11.6 7.8 -9 ' + tipX + ' ' + tipY + ' C9.6 -9.4 10.2 -11.8 10.6 -14.3 Z';
    return '<g class="vvy-meow" opacity="0">' +
      '<path d="' + tail + '" fill="#fff" stroke="#9aa5b1" stroke-width="0.45" stroke-linejoin="round"/>' +
      '<path d="' + body + '" fill="#fff" stroke="#9aa5b1" stroke-width="0.45" stroke-linejoin="round"/>' +
      '<path d="M5.6 -14.2 C6.7 -12.1 7.7 -10 ' + tipX + ' ' + (tipY - 0.6) + ' C9.4 -10.2 10 -12.3 10.4 -14.2" fill="#fff" stroke="none"/>' +
      '<text x="9.2" y="-17.4" text-anchor="middle" font-size="4.3" font-style="italic" fill="#3e4c59" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">meow</text>' +
      '</g>';
  }

  function catSprite(fill, dx, idx) {
    /* drawn in a local frame: origin at the cat's feet, y up is negative (SVG) */
    var c = fill || '#4a4a52', paint = c, pre = '';
    if (dx) {
      paint = 'url(#' + dx.vgrad('cat' + (idx || 0), c, 0.24, -0.3) + ')';
      pre = groundShadow(0.5, 0.5, 8, 1.0, 0.2);
    }
    return pre + '<g class="vvy-catbody" fill="' + paint + '">' +
      '<path d="M-6 -4 Q-11 -3 -10.5 -9.5" fill="none" stroke="' + shade(c, -0.15) + '" stroke-width="1.5" stroke-linecap="round"/>' +
      '<rect x="-4.6" y="-1.6" width="1.6" height="1.8" fill="' + shade(c, -0.25) + '"/><rect x="2.4" y="-1.6" width="1.6" height="1.8" fill="' + shade(c, -0.25) + '"/>' +
      '<ellipse cx="0" cy="-4.2" rx="6.2" ry="3.4"/>' +
      '<circle cx="6.6" cy="-7.4" r="2.9"/>' +
      '<path d="M4.6 -9.4 L4.2 -12.6 L6.6 -10.2 Z"/><path d="M8.4 -9.6 L9.4 -12.6 L7.0 -10.2 Z"/>' +
      (dx ? '<ellipse cx="-1.6" cy="-6.2" rx="3.2" ry="1.1" fill="#fff" opacity="0.16"/><circle cx="5.7" cy="-8.4" r="0.9" fill="#fff" opacity="0.18"/>' : '') +
      '<circle cx="7.6" cy="-7.8" r="0.5" fill="#d8f0a0"/>' +
      '</g>';
  }

  /* ---------------- vehicle drawing ---------------- */

  function wheelSvg(cx, cy, r, pal, animate, dx, role) {
    var o = [], tire = pal.wheel, hub = pal.hub, dish = null;
    if (dx) {
      tire = 'url(#' + dx.rgrad('tire' + role, [[0, shade(pal.wheel, 0.05)], [0.62, pal.wheel], [0.86, shade(pal.wheel, 0.18)], [1, shade(pal.wheel, -0.35)]], 0.5, 0.5) + ')';
      hub = 'url(#' + dx.rgrad('rim' + role, [[0, shade(pal.hub, -0.22)], [0.55, pal.hub], [1, shade(pal.hub, 0.35)]], 0.42, 0.4) + ')';
      dish = 'url(#' + dx.rgrad('dish' + role, [[0, '#000', 0.28], [0.7, '#000', 0.05], [1, '#000', 0]], 0.5, 0.5) + ')';
    }
    o.push('<g transform="translate(' + r1(cx) + ' ' + r1(cy) + ')">');
    o.push('<circle r="' + r1(r) + '" fill="' + tire + '"/>');
    if (dx) {
      /* sidewall rim light (upper-left) */
      o.push('<circle r="' + r1(r * 0.93) + '" fill="none" stroke="#fff" stroke-width="' + r2(r * 0.05) + '" opacity="0.14" stroke-dasharray="' + r1(r * 1.6) + ' ' + r1(r * 6) + '" transform="rotate(-150)"/>');
    }
    o.push('<g>');
    if (animate) {
      o.push('<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.7s" repeatCount="1" fill="freeze"/>');
    }
    o.push('<circle r="' + r1(r * 0.52) + '" fill="' + hub + '"/>');
    var k, a, sx, sy;
    for (k = 0; k < 5; k++) {
      a = k * Math.PI * 2 / 5;
      sx = Math.cos(a) * r * 0.46; sy = Math.sin(a) * r * 0.46;
      o.push('<line x1="0" y1="0" x2="' + r2(sx) + '" y2="' + r2(sy) + '" stroke="' + pal.wheel + '" stroke-width="' + r2(r * 0.14) + '" stroke-linecap="round"/>');
    }
    if (dish) { o.push('<circle r="' + r1(r * 0.52) + '" fill="' + dish + '"/>'); }   /* concave dish */
    o.push('<circle r="' + r1(r * 0.13) + '" fill="' + pal.wheel + '"/>');
    if (dx) { o.push('<circle cx="' + r2(-r * 0.03) + '" cy="' + r2(-r * 0.03) + '" r="' + r1(r * 0.06) + '" fill="#fff" opacity="0.35"/>'); }
    o.push('</g></g>');
    return o.join('');
  }

  /* e = effective cfg; vx = x of front bumper (inches); Y = y mapper; dx = Defs collector (optional) */
  function vehicleSvg(e, vx, Y, role, animate, solid, spots, dx) {
    var pal = PAL[role] || PAL.A;
    var cfg = e.stock || e;
    var body = buildBody(cfg);
    var L = cfg.length, H0 = cfg.height;
    var rise = e.rise || 0;
    function X(xf) { return r1(vx + xf * L); }
    function YY(yf) { return Y(yf * H0 + rise); }
    if (spots && role === 'A') {
      /* roof: midpoint of the flat top; hood: first point after the front that sits below 0.7 H */
      var top = [], hd = null, q;
      for (q = 0; q < body.pts.length; q++) {
        if (body.pts[q][1] >= 0.995) { top.push(body.pts[q]); }
        if (!hd && q > 1 && body.pts[q][1] > 0.4 && body.pts[q][1] < 0.7 && body.pts[q][0] > 0.02 && body.pts[q][0] < 0.5) { hd = body.pts[q]; }
      }
      if (top.length) { spots.push({ x: X((top[0][0] + top[top.length - 1][0]) / 2), y: YY(1.0), name: 'roof' }); }
      if (body.glass && body.glass.length >= 2) {
        spots.push({ x: X((body.glass[0][0] + body.glass[1][0]) / 2), y: YY((body.glass[0][1] + body.glass[1][1]) / 2), name: 'windshield' });
      }
      if (hd) { spots.push({ x: X(hd[0] * 0.75), y: YY(hd[1] - 0.005), name: 'hood' }); }
      if (has(cfg.bedLen)) { spots.push({ x: X(0.82), y: YY(body.pts[9] ? body.pts[9][1] : 0.6), name: 'bed rail' }); }
      /* surfaces the cat animator routes along: levels (y) and the vertical faces (x) that join them */
      var pk = /^pickup/.test(cfg.template || '');
      spots.geo = {
        front: parseFloat(X(0.03)), rear: parseFloat(X(0.985)),
        hoodY: hd ? YY(hd[1] - 0.005) : null,
        roofY: YY(1.0), roofX0: top.length ? parseFloat(X(top[0][0])) : parseFloat(X(0.45)), roofX1: top.length ? parseFloat(X(top[top.length - 1][0])) : parseFloat(X(0.75)),
        railY: (pk && has(cfg.bedLen) && body.pts[9]) ? YY(body.pts[9][1]) : null,
        cabRearX: (pk && body.pts[6]) ? parseFloat(X(body.pts[6][0])) : null,
        hoodX1: body.glass ? parseFloat(X(body.glass[0][0])) : parseFloat(X(0.3))
      };
    }
    var o = [], i;
    var d = [];
    for (i = 0; i < body.pts.length; i++) {
      d.push((i === 0 ? 'M' : 'L') + X(body.pts[i][0]) + ' ' + YY(body.pts[i][1]));
    }
    d.push('L' + X(0.93) + ' ' + YY(body.gc));
    d.push('L' + X(0.07) + ' ' + YY(body.gc));
    d.push('Z');
    var path = d.join(' ');
    var gp = [];
    if (body.glass) { for (i = 0; i < body.glass.length; i++) { gp.push(X(body.glass[i][0]) + ',' + YY(body.glass[i][1])); } }
    var wr = (e.wheelDia ? e.wheelDia : body.wheelR * 2 * H0) / 2;
    var WB = cfg.wheelbase, fx, rx;
    if (has(cfg.frontOverhang) && WB) {
      fx = vx + cfg.frontOverhang; rx = fx + WB;
    } else if (WB) {
      var oh = L - WB; if (oh < 0) { oh = L * 0.34; }
      fx = vx + oh * body.foSplit; rx = fx + WB;
    } else {
      fx = vx + L * 0.175; rx = vx + L * 0.805;
    }
    var wy = Y(wr);
    var bodyFill = pal.body, glassFill = pal.glass, clipB = null, clipG = null;
    if (dx) {
      bodyFill = 'url(#' + dx.vgrad('body' + role, pal.body, 0.30, -0.26, 0.02) + ')';
      glassFill = 'url(#' + dx.vgrad('glass' + role, pal.glass, 0.34, -0.10, 0.06) + ')';
      clipB = dx.clip('cb' + role + (dx.n++), '<path d="' + path + '"/>');
      if (gp.length) { clipG = dx.clip('cg' + role + (dx.n++), '<polygon points="' + gp.join(' ') + '"/>'); }
      /* contact shadow on the ground, before anything else */
      o.push(groundShadow(vx + L / 2, Y(0) + 0.8, L * 0.47, 2.0, solid || role === 'A' ? 0.2 : 0.1));
    }
    o.push('<g class="vvy-veh vvy-veh-' + role + '" opacity="' + (solid ? 0.92 : pal.op) + '">');
    o.push('<path d="' + path + '" fill="' + bodyFill + '" stroke="' + pal.stroke + '" stroke-width="0.45" stroke-linejoin="round"' +
      (role === 'B' ? ' stroke-dasharray="2.2 1.4"' : '') + '/>');
    if (dx) {
      var topY = YY(1.0), botY = YY(body.gc), bodyH = botY - topY;
      o.push('<g clip-path="url(#' + clipB + ')">');
      /* rocker / underbody in shade */
      o.push('<rect x="' + X(-0.01) + '" y="' + r1(botY - bodyH * 0.16) + '" width="' + r1(L * 1.02) + '" height="' + r1(bodyH * 0.2) + '" fill="#000" opacity="0.16"/>');
      /* wheel-arch ambient occlusion */
      o.push('<ellipse cx="' + r1(fx) + '" cy="' + r1(wy) + '" rx="' + r1(wr * 1.22) + '" ry="' + r1(wr * 1.18) + '" fill="#000" opacity="0.22"/>');
      o.push('<ellipse cx="' + r1(rx) + '" cy="' + r1(wy) + '" rx="' + r1(wr * 1.22) + '" ry="' + r1(wr * 1.18) + '" fill="#000" opacity="0.22"/>');
      /* rim light along the roof / hood edge: the same outline stroked in white, kept to the top third */
      o.push('<g clip-path="url(#' + dx.clip('ct' + role + (dx.n++), '<rect x="' + X(-0.02) + '" y="' + r1(topY - 2) + '" width="' + r1(L * 1.04) + '" height="' + r1(bodyH * 0.42) + '"/>') + ')">');
      o.push('<path d="' + path + '" fill="none" stroke="#fff" stroke-width="1.6" opacity="0.28" stroke-linejoin="round"/>');
      o.push('</g>');
      /* soft belt-line sheen */
      o.push('<rect x="' + X(-0.01) + '" y="' + r1(topY + bodyH * 0.46) + '" width="' + r1(L * 1.02) + '" height="' + r1(bodyH * 0.05) + '" fill="#fff" opacity="0.07"/>');
      o.push('</g>');
    }
    if (gp.length) {
      o.push('<polygon points="' + gp.join(' ') + '" fill="' + glassFill + '" opacity="0.85"/>');
      if (dx && clipG) {
        /* glass: diagonal reflection streak + darker lower edge (dashboard shadow) */
        var gx0 = X(body.glass[0][0]), gx1 = X(body.glass[body.glass.length - 1][0]), gy0 = YY(body.glass[1][1]), gy1 = YY(body.glass[0][1]);
        var gw = gx1 - gx0, gh = gy1 - gy0;
        o.push('<g clip-path="url(#' + clipG + ')">');
        o.push('<polygon points="' + r1(gx0 + gw * 0.12) + ',' + r1(gy0 - 1) + ' ' + r1(gx0 + gw * 0.30) + ',' + r1(gy0 - 1) + ' ' + r1(gx0 + gw * 0.16) + ',' + r1(gy1 + 1) + ' ' + r1(gx0 + gw * 0.02) + ',' + r1(gy1 + 1) + '" fill="#fff" opacity="0.28"/>');
        o.push('<polygon points="' + r1(gx0 + gw * 0.36) + ',' + r1(gy0 - 1) + ' ' + r1(gx0 + gw * 0.41) + ',' + r1(gy0 - 1) + ' ' + r1(gx0 + gw * 0.27) + ',' + r1(gy1 + 1) + ' ' + r1(gx0 + gw * 0.23) + ',' + r1(gy1 + 1) + '" fill="#fff" opacity="0.16"/>');
        o.push('<rect x="' + r1(gx0 - 2) + '" y="' + r1(gy1 - gh * 0.22) + '" width="' + r1(gw + 4) + '" height="' + r1(gh * 0.3) + '" fill="#000" opacity="0.14"/>');
        o.push('</g>');
      }
    }
    o.push(wheelSvg(fx, wy, wr, pal, animate, dx, role));
    o.push(wheelSvg(rx, wy, wr, pal, animate, dx, role));
    o.push('</g>');
    return o.join('');
  }

  /* interactive hit wrapper: padded transparent rect + focusable group (only when the app is live) */
  function hitOpen(kind, label, x, y, w, h) {
    return '<g class="vvy-hit" data-hit="' + kind + '" tabindex="0" role="button" aria-label="' + esc(label) + '">' +
      '<rect class="vvy-hitbox" x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '" rx="3" fill="#fff" fill-opacity="0.001" stroke="none"/>';
  }
  function qmarkSvg(x, yGround, H, Y) {
    /* ghost placeholder in the B language: translucent amber, dashed outline, big "?" */
    var w = Math.max(28, H * 0.42), h = H * 0.78, pal = PAL.B;
    var o = [];
    o.push(hitOpen('compare', 'Add a vehicle to compare', x - 4, Y(h) - 6, w + 8, h + 12));
    o.push('<g class="vvy-qmark" opacity="' + pal.op + '">');
    o.push('<rect x="' + r1(x) + '" y="' + r1(Y(h)) + '" width="' + r1(w) + '" height="' + r1(h) + '" rx="' + r1(w * 0.18) + '" fill="' + pal.body + '" fill-opacity="0.35" stroke="' + pal.stroke + '" stroke-width="0.5" stroke-dasharray="2.2 1.4"/>');
    o.push('<text x="' + r1(x + w / 2) + '" y="' + r1(Y(h * 0.30)) + '" text-anchor="middle" font-size="' + r1(h * 0.58) + '" font-weight="700" fill="' + pal.stroke + '" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">?</text>');
    o.push('<text x="' + r1(x + w / 2) + '" y="' + r1(Y(-6.5)) + '" text-anchor="middle" font-size="3.8" fill="' + pal.guide + '" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">compare</text>');
    o.push('</g></g>');
    return o.join('');
  }

  /* ---------------- scene ----------------
     vehicles: [effA, effB?]   opts: { layout:'overlay'|'side', animate:bool } */
  function renderScene(vehicles, personIn, metric, opts) {
    opts = opts || {};
    var A = vehicles[0], B = vehicles.length > 1 ? vehicles[1] : null;
    var side = B && opts.layout === 'side';
    var pw = personIn * 0.31;
    var gap = 16;
    var mL = 30, mR = 42, mT = 14 + ((opts.party && opts.party.cats) ? 14 : 0), mB = 16;   /* extra headroom for a cat's speech bubble on the roof */
    /* family: adults and kids drawn between the reference person and the vehicle.
       Adults 66 in (US average adult), kids 45 in; the reference person stays the tallest anchor. */
    var party = opts.party || {}, fam = [], i;
    /* party.people = [{kind:'adult'|'kid', h: inches}, ...] excluding the reference person.
       Legacy counts (party.adults / party.kids) are honoured when people[] is absent. */
    var nD = Math.min(party.dogs || 0, 12), nC = Math.min(party.cats || 0, 12);
    var nA = 0, nK = 0;
    if (party.people) {
      for (i = 0; i < party.people.length && i < 24; i++) {
        fam.push({ h: party.people[i].h, kind: party.people[i].kind });
        if (party.people[i].kind === 'kid') { nK++; } else { nA++; }
      }
    } else {
      nA = Math.min(party.adults || 0, 12); nK = Math.min(party.kids || 0, 12);
      for (i = 0; i < nA; i++) { fam.push({ h: 66, kind: 'adult' }); }
      for (i = 0; i < nK; i++) { fam.push({ h: 45, kind: 'kid' }); }
    }
    for (i = 0; i < nD; i++) { fam.push({ h: 22, kind: 'dog' }); }
    var famW = 0;
    for (i = 0; i < fam.length; i++) { fam[i].w = fam[i].kind === 'dog' ? fam[i].h * 1.6 : fam[i].h * 0.31; famW += fam[i].w + 4; }
    var LA = A.length, LB = B ? B.length : 0;
    var vehSpan = side ? (LA + gap + LB) : Math.max(LA, LB);
    var topH = Math.max(A.height, B ? B.height : 0, personIn);
    var inter = !!opts.interactive;
    var qW = (inter && !B) ? Math.max(28, A.height * 0.42) + gap : 0;   /* ghost "?" placeholder for the comparison vehicle */
    var W = mL + pw + famW + gap + vehSpan + qW + mR;
    var SH = mT + topH + mB;
    function Y(y) { return r1(SH - mB - y); }
    var px = mL + pw / 2;
    var vxA = mL + pw + famW + gap;
    var vxB = side ? (vxA + LA + gap) : vxA;

    var o = [], dx = new Defs(opts.idPrefix || 'vvy');
    o.push('<svg class="vvy-svg" viewBox="0 0 ' + r1(W) + ' ' + r1(SH) + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scaled comparison of a person against ' + esc(A.fullName || 'a vehicle') + (B ? ' and ' + esc(B.fullName || 'a second vehicle') : '') + '">');
    var defsAt = o.length;   /* <defs> is spliced in here once everything has registered its gradients */

    o.push('<rect x="0" y="' + Y(0) + '" width="' + r1(W) + '" height="' + r1(mB) + '" fill="url(#' + dx.vgrad('ground', '#e4e7eb', -0.06, 0.35) + ')" opacity="0.7"/>');
    o.push('<line x1="0" y1="' + Y(0) + '" x2="' + r1(W) + '" y2="' + Y(0) + '" stroke="#9aa5b1" stroke-width="0.6"/>');

    var g, gy;
    for (g = 12; g <= topH; g += 12) {
      gy = Y(g);
      o.push('<line x1="0" y1="' + gy + '" x2="' + r1(W) + '" y2="' + gy + '" stroke="#cbd2d9" stroke-width="0.22" stroke-dasharray="1.6 2.4"/>');
    }

    var spots = [];
    if (inter) { o.push(hitOpen('vehicle', 'Change the vehicle', vxA - 4, Y(A.height) - 5, LA + 8, A.height + 8)); }
    o.push(vehicleSvg(A, vxA, Y, 'A', !!opts.animate, false, spots, dx));
    if (inter) { o.push('</g>'); }
    if (inter && !B) { o.push(qmarkSvg(vxA + LA + gap, 0, A.height, Y)); }
    if (B) { o.push(vehicleSvg(B, vxB, Y, 'B', !!opts.animate, side, null, dx)); }

    function guide(yIn, label, color, below) {
      var ty = below ? (Y(yIn) + 4.6) : (Y(yIn) - 1.2);
      o.push('<line x1="' + r1(mL * 0.35) + '" y1="' + Y(yIn) + '" x2="' + r1(W - mR * 0.55) + '" y2="' + Y(yIn) + '" stroke="' + color + '" stroke-width="0.45" stroke-dasharray="3 2"/>');
      o.push('<text x="' + r1(W - 1.5) + '" y="' + r1(ty) + '" text-anchor="end" font-size="3.9" fill="' + color + '" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">' + esc(label) + '</text>');
    }
    guide(A.height, shortDim(A.height, metric) + ' roof' + (B ? ' A' : ''), PAL.A.guide, false);
    if (has(A.hoodHeight)) { guide(A.hoodHeight, shortDim(A.hoodHeight, metric) + ' hood' + (B ? ' A' : ''), '#7b5ea7', false); }
    if (has(A.bedHeight)) { guide(A.bedHeight, shortDim(A.bedHeight, metric) + ' bed' + (B ? ' A' : ''), '#0b7285', false); }
    if (B) {
      guide(B.height, shortDim(B.height, metric) + ' roof B', PAL.B.guide, true);
      if (has(B.bedHeight)) { guide(B.bedHeight, shortDim(B.bedHeight, metric) + ' bed B', PAL.B.guide, true); }
    }

    if (inter) { o.push(hitOpen('crew', 'Your height and crew', px - Math.max(pw / 2, 9) - 3, Y(personIn) - 4, Math.max(pw, 18) + 6, personIn + 6)); }
    o.push(personSvg(personIn, px, Y, null, null, dx));
    if (inter) { o.push('</g>'); }
    /* family members */
    var fx0 = mL + pw + 4, fc;
    for (i = 0; i < fam.length; i++) {
      fc = fx0 + fam[i].w / 2;
      if (fam[i].kind === 'dog') { o.push('<g pointer-events="none">' + dogSvg(fam[i].h, fc, Y, '#6b4f3a', dx) + '</g>'); }
      else {
        if (inter) { o.push(hitOpen('crew', 'Edit this rider', fc - Math.max(fam[i].w / 2, 9) - 3, Y(fam[i].h) - 4, Math.max(fam[i].w, 18) + 6, fam[i].h + 6)); }
        o.push(personSvg(fam[i].h, fc, Y, fam[i].kind === 'kid' ? '#5f7d95' : '#3d4f60', 'vvy-fam vvy-' + fam[i].kind, dx));
        if (inter) { o.push('</g>'); }
      }
      fx0 += fam[i].w + 4;
    }
    /* cats: easter egg. Spots the animator may move them between; initial spot is beside the person. */
    if (nC > 0) {
      spots.unshift({ x: r1(mL + pw + 2), y: Y(0), name: 'person' });
      spots.push({ x: r1(mL + pw + famW / 2 + gap * 0.5), y: Y(0), name: 'ground' });
      spots.push({ x: r1(vxA + LA * 0.5), y: Y(0), name: 'under' });
      var spotJson = [], k;
      for (k = 0; k < spots.length; k++) { spotJson.push('[' + spots[k].x + ',' + spots[k].y + ',&quot;' + spots[k].name + '&quot;]'); }
      var geo = spots.geo || {}, geoJson = [], gk;
      for (gk in geo) { if (geo.hasOwnProperty(gk)) { geoJson.push('&quot;' + gk + '&quot;:' + (geo[gk] === null ? 'null' : geo[gk])); } }
      o.push('<g class="vvy-cats" pointer-events="none" data-spots="[' + spotJson.join(',') + ']" data-geo="{' + geoJson.join(',') + '}">');
      for (i = 0; i < nC; i++) {
        var cx0 = r1(mL + pw + 2 + i * 13), cy0 = Y(0);
        o.push('<g class="vvy-cat" transform="translate(' + cx0 + ' ' + cy0 + ')" data-i="' + i + '">' + catSprite(i % 3 === 0 ? '#4a4a52' : (i % 3 === 1 ? '#8a6d4b' : '#b8b2a7'), dx, i % 3) +
          meowSvg() + '</g>');
      }
      o.push('</g>');
    }
    if (fam.length) {
      var parts = [];
      if (nA) { parts.push(nA + ' more adult' + (nA === 1 ? '' : 's')); }
      if (nK) { parts.push(nK + ' kid' + (nK === 1 ? '' : 's')); }
      if (nD) { parts.push(nD + ' dog' + (nD === 1 ? '' : 's') + ' (22 in at the shoulder)'); }
      o.push('<text x="' + r1(mL + pw + 4 + famW / 2) + '" y="' + r1(Y(0) + 6.2) + '" text-anchor="middle" font-size="3.6" fill="#52606d" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">' + esc(parts.join(' \u00b7 ')) + '</text>');
    }

    var bx = r1(mL * 0.30);
    o.push('<line x1="' + bx + '" y1="' + Y(0) + '" x2="' + bx + '" y2="' + Y(personIn) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<line x1="' + r1(mL * 0.30 - 2) + '" y1="' + Y(personIn) + '" x2="' + r1(mL * 0.30 + 2) + '" y2="' + Y(personIn) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<line x1="' + r1(mL * 0.30 - 2) + '" y1="' + Y(0) + '" x2="' + r1(mL * 0.30 + 2) + '" y2="' + Y(0) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<text x="' + r1(px) + '" y="' + r1(Y(0) + 6.2) + '" text-anchor="middle" font-size="4.4" font-weight="600" fill="#1f2933" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">You &#183; ' + esc(personLabel(personIn, metric)) + '</text>');

    if (inter) { var bf = Math.max(1, Math.min(1.8, W / 380)); o.push(viewBadge(vxA + LA - 24 * bf, Y(0) + 9, false, bf)); }
    o.push('</svg>');
    o.splice(defsAt, 0, dx.html());
    return o.join('');
  }

  /* ---------------- specs + comparisons ---------------- */

  function row(label, value, note) {
    if (value === null || value === undefined) { return ''; }
    return '<div class="vvy-spec"><dt>' + esc(label) + '</dt><dd>' + esc(value) +
      (note ? ' <span class="vvy-note">' + esc(note) + '</span>' : '') + '</dd></div>';
  }

  function specsHtml(cfg, metric) {
    var a = '≈';
    var o = ['<dl class="vvy-specs">'];
    o.push(row('Overall height', dim(cfg.height, metric), isApprox(cfg, 'height') ? a : ''));
    o.push(row('Length', dim(cfg.length, metric), isApprox(cfg, 'length') ? a : ''));
    if (cfg.width) { o.push(row('Width (excl. mirrors)', dim(cfg.width, metric), isApprox(cfg, 'width') ? a : '')); }
    o.push(row('Wheelbase', dim(cfg.wheelbase, metric), isApprox(cfg, 'wheelbase') ? a : ''));
    o.push(row('Ground clearance', dim(cfg.clearance, metric), isApprox(cfg, 'clearance') ? a : ''));
    o.push(row('Curb weight', mass(cfg.weight, metric), isApprox(cfg, 'weight') ? a : ''));
    if (has(cfg.bedHeight)) { o.push(row('Bed floor height', dim(cfg.bedHeight, metric), isApprox(cfg, 'bedHeight') ? a : '')); }
    if (has(cfg.hoodHeight)) { o.push(row('Hood height', dim(cfg.hoodHeight, metric), isApprox(cfg, 'hoodHeight') ? a : '')); }
    if (cfg.bedLen) { o.push(row('Bed length', dim(cfg.bedLen, metric), isApprox(cfg, 'bedLen') ? a : '')); }
    if (has(cfg.headroom2)) { o.push(row('2nd-row headroom', dim(cfg.headroom2, metric), isApprox(cfg, 'headroom2') ? a : '')); }
    if (has(cfg.legroom2)) { o.push(row('2nd-row legroom', dim(cfg.legroom2, metric), isApprox(cfg, 'legroom2') ? a : '')); }
    if (has(cfg.headroom3)) { o.push(row('3rd-row headroom', dim(cfg.headroom3, metric), isApprox(cfg, 'headroom3') ? a : '')); }
    if (has(cfg.legroom3)) { o.push(row('3rd-row legroom', dim(cfg.legroom3, metric), isApprox(cfg, 'legroom3') ? a : '')); }
    if (has(cfg.cargo1)) { o.push(row('Cargo, seats folded', r1(cfg.cargo1) + ' cu ft', '')); }
    if (has(cfg.cargo2) && !has(cfg.cargo3)) { o.push(row('Cargo behind 2nd row', r1(cfg.cargo2) + ' cu ft', '')); }
    if (has(cfg.cargo3)) { o.push(row('Cargo behind 3rd row', r1(cfg.cargo3) + ' cu ft', '')); }
    if (has(cfg.towing)) { o.push(row('Max towing', mass(cfg.towing, metric), '')); }
    if (has(cfg.payload)) { o.push(row('Max payload', mass(cfg.payload, metric), '')); }
    if (has(cfg.seats)) { o.push(row('Seating', cfg.seats + ' seats, ' + cfg.rows + (cfg.rows === 1 ? ' row' : ' rows'), a)); }
    if (cfg.tire) { o.push(row('Tire size', cfg.tire + (cfg.stockDia && !cfg.stockDiaApprox ? ' (' + r1(cfg.stockDia) + ' in dia)' : ''), '')); }
    if (cfg.modified) {
      o.push(row('Modified', (cfg.lift ? '+' + shortDim(cfg.lift, metric) + ' lift' : '') +
        (cfg.lift && cfg.tireDelta ? ', ' : '') +
        (cfg.tireDelta ? r1(cfg.wheelDia) + ' in tires (' + (cfg.tireDelta > 0 ? '+' : '') + r1(cfg.tireDelta) + ' in)' : ''),
        a + ' raises the body ' + shortDim(cfg.rise, metric)));
    }
    o.push('</dl>');
    return o.join('');
  }

  function nearest(yIn, h) {
    var best = null, bd = 1e9, i, d;
    for (i = 0; i < LANDMARKS.length; i++) {
      d = Math.abs(LANDMARKS[i].f * h - yIn);
      if (d < bd) { bd = d; best = LANDMARKS[i]; }
    }
    return { lm: best, d: yIn - best.f * h };
  }

  function phrase(what, yIn, h, metric) {
    var tol = Math.max(1.2, h * 0.013);
    if (yIn > h + tol) {
      return what + ' clears the top of your head by ' + shortDim(yIn - h, metric) + '.';
    }
    var n = nearest(yIn, h);
    if (Math.abs(n.d) <= tol) {
      return what + ' is level with ' + n.lm.n + '.';
    }
    return what + ' sits ' + shortDim(Math.abs(n.d), metric) + (n.d > 0 ? ' above ' : ' below ') + n.lm.n + '.';
  }

  function compsHtml(cfg, h, metric) {
    var o = ['<ul class="vvy-comps">'];
    var tag = cfg.modified ? ' (as modified)' : '';
    o.push('<li>' + esc(phrase('The roof' + tag, cfg.height, h, metric)) + '</li>');
    if (has(cfg.hoodHeight)) { o.push('<li>' + esc(phrase('The top of the hood' + tag, cfg.hoodHeight, h, metric)) + '</li>'); }
    if (has(cfg.bedHeight)) { o.push('<li>' + esc(phrase('The bed floor' + tag, cfg.bedHeight, h, metric)) + '</li>'); }
    if (has(cfg.clearance)) {
      o.push('<li>' + esc('The lowest point of the body is ' + shortDim(cfg.clearance, metric) + ' off the ground — ' + nearest(cfg.clearance, h).lm.n + ' on you.') + '</li>');
    }
    if (cfg.wheelDia) {
      o.push('<li>' + esc('Each tire stands ' + shortDim(cfg.wheelDia, metric) + ' tall — ' + nearest(cfg.wheelDia, h).lm.n + ' on you' + (cfg.stockDiaApprox ? ' (≈ stock tire size not on file)' : '') + '.') + '</li>');
    }
    if (cfg.length) {
      o.push('<li>' + esc('Stood on its nose it would be ' + r1(cfg.length / h) + '× your height.') + '</li>');
    }
    if (!has(cfg.hoodHeight)) {
      o.push('<li class="vvy-missing">No published hood height for this configuration — omitted rather than estimated.</li>');
    }
    o.push('</ul>');
    return o.join('');
  }

  /* comparison table: one row per spec, B measured against A */
  var VS_ROWS = [
    { k: 'height',    l: 'Overall height',   more: 'Taller',  less: 'Shorter',  kind: 'dim' },
    { k: 'length',    l: 'Length',           more: 'Longer',  less: 'Shorter',  kind: 'dim' },
    { k: 'width',     l: 'Width',            more: 'Wider',   less: 'Narrower', kind: 'dim' },
    { k: 'wheelbase', l: 'Wheelbase',        more: 'Longer',  less: 'Shorter',  kind: 'dim' },
    { k: 'clearance', l: 'Ground clearance', more: 'Higher',  less: 'Lower',    kind: 'dim' },
    { k: 'bedHeight', l: 'Bed floor height', more: 'Higher',  less: 'Lower',    kind: 'dim' },
    { k: 'hoodHeight',l: 'Hood height',      more: 'Higher',  less: 'Lower',    kind: 'dim' },
    { k: 'weight',    l: 'Curb weight',      more: 'Heavier', less: 'Lighter',  kind: 'mass' },
    { k: 'seats',     l: 'Seats',            more: 'More',    less: 'Fewer',    kind: 'count', unit: 'seat' },
    { k: 'headroom2', l: '2nd-row headroom', more: 'Roomier', less: 'Tighter',  kind: 'dim' },
    { k: 'legroom2',  l: '2nd-row legroom',  more: 'Roomier', less: 'Tighter',  kind: 'dim' },
    { k: 'legroom3',  l: '3rd-row legroom',  more: 'Roomier', less: 'Tighter',  kind: 'dim' },
    { k: 'wheelDia',  l: 'Tire diameter',    more: 'Bigger',  less: 'Smaller',  kind: 'dim' }
  ];

  function fmtVal(v, kind, metric, unit) {
    if (!has(v)) { return null; }
    if (kind === 'mass') { return mass(v, metric); }
    if (kind === 'count') { return String(v); }
    return shortDim(v, metric);
  }

  function vsHtml(A, B, metric) {
    var nA = A.model || 'A', nB = B.model || 'B';
    var o = ['<table class="vvy-vstab"><thead><tr><th>Spec</th><th class="colA">' + esc(nA) + '</th><th class="colB">' + esc(nB) + '</th><th>The ' + esc(nB) + ' <b>IS:</b></th></tr></thead><tbody>'];
    var i, r, a, b, d, cmp, cls, mag, any = false;
    for (i = 0; i < VS_ROWS.length; i++) {
      r = VS_ROWS[i]; a = A[r.k]; b = B[r.k];
      if (!has(a) && !has(b)) { continue; }
      any = true;
      if (!has(a) || !has(b)) { cmp = 'not on file for the ' + (has(a) ? nB : nA); cls = 'na'; }
      else {
        d = b - a;
        if (Math.abs(d) < (r.kind === 'count' ? 0.5 : 0.05)) { cmp = 'Same'; cls = 'same'; }
        else {
          if (r.kind === 'count') { mag = Math.abs(d) + ' ' + r.unit + (Math.abs(d) === 1 ? '' : 's'); }
          else if (r.kind === 'mass') { mag = mass(Math.abs(d), metric); }
          else { mag = shortDim(Math.abs(d), metric); }
          cmp = (d > 0 ? r.more : r.less) + ' by ' + mag;
          cls = d > 0 ? 'more' : 'less';
        }
      }
      o.push('<tr><th scope="row">' + esc(r.l) + (r.k === 'wheelDia' && (A.stockDiaApprox || B.stockDiaApprox) ? ' <span class="vvy-note">&#8776;</span>' : '') + '</th>' +
        '<td class="colA">' + esc(fmtVal(a, r.kind, metric) || '—') + '</td>' +
        '<td class="colB">' + esc(fmtVal(b, r.kind, metric) || '—') + '</td>' +
        '<td class="cmp ' + cls + '">' + esc(cmp) + '</td></tr>');
    }
    o.push('</tbody></table>');
    if (!any) { return '<p class="vvy-note">Nothing to compare.</p>'; }
    return o.join('');
  }

  /* ---------------- occupancy ----------------
     party = { adults, kids, pets } -> { fits, people, seats, spare, petNote, text, cls } */
  function fit(cfg, party) {
    var people = (party.adults || 0) + (party.kids || 0);
    var pets = (party.dogs !== undefined ? party.dogs : party.pets) || 0;
    var seats = has(cfg.seats) ? cfg.seats : null;
    var rows = has(cfg.rows) ? cfg.rows : null;
    if (seats === null) { return { fits: null, people: people, seats: null, spare: null, text: 'Seat count not on file.', cls: 'unknown' }; }
    var spare = seats - people;
    var r = { fits: spare >= 0, people: people, seats: seats, spare: spare, pets: pets, cls: spare >= 0 ? 'ok' : 'no' };
    var t;
    if (people === 0 && pets === 0) { t = seats + ' seats in ' + rows + (rows === 1 ? ' row' : ' rows') + '. Add your party to check the fit.'; r.cls = 'idle'; }
    else if (spare < 0) { t = 'Does not fit: ' + people + ' people need ' + people + ' seats and this ' + ((cfg.brand ? cfg.brand + ' ' : '') + (cfg.model || 'vehicle')) + ' has ' + seats + '. ' + (-spare) + ' ' + (spare === -1 ? 'person' : 'people') + ' would be left behind.'; }
    else { t = 'Fits: ' + people + ' of ' + seats + ' seats used' + (spare > 0 ? ', ' + spare + ' spare' : ', every seat taken') + '.'; }
    if (pets > 0) {
      if (rows === 1) { t += ' Dogs: a single-row vehicle has no rear seats to fold — ' + pets + (pets === 1 ? ' dog would ride ' : ' dogs would ride ') + 'on the floor or a passenger seat' + (cfg.bedLen ? ', or in the bed' : '') + '.'; }
      else if (rows === 3) { t += ' Dogs: ' + pets + (pets === 1 ? ' dog' : ' dogs') + ' will most likely need the third row folded for cargo space' + (spare >= 0 && spare < 2 && people > 0 ? ' — and with ' + spare + ' spare seat' + (spare === 1 ? '' : 's') + ' that squeezes the people' : '') + '.'; }
      else { t += ' Dogs: ' + pets + (pets === 1 ? ' dog' : ' dogs') + ' will most likely need the rear seats folded' + (cfg.bedLen ? ' or the bed used' : '') + (spare >= 0 && spare < 2 && people > 0 ? ' — with ' + spare + ' spare seat' + (spare === 1 ? '' : 's') + ' that squeezes the people' : '') + '.'; }
      r.petNote = true;
    }
    r.text = t;
    return r;
  }

  /* ---------------- backseat room guidance ----------------
     Seated anthropometrics (approximate ratios of standing height, used only to translate a
     passenger's height into what headroom/legroom figures mean): sitting height ~0.52 H (crown
     above the seat cushion, less cushion give), comfortable legroom ~0.52 H. Manufacturer headroom is
     measured from the seat cushion and legroom from the H-point, so these are indicative bands,
     not verdicts. */
  function roomBand(h, head, leg) {
    var needHead = h * 0.50 + 0.5;   /* erect sitting height is ~0.51-0.52 H; seats compress and people settle */
    var needLeg = h * 0.52;          /* ~36 in for a 5'10" adult, the usual "comfortable" threshold */
    var hs = has(head) ? head - needHead : null;
    var ls = has(leg) ? leg - needLeg : null;
    var worst = null;
    if (hs !== null) { worst = hs; }
    if (ls !== null) { worst = worst === null ? ls : Math.min(worst, ls); }
    if (worst === null) { return { band: 'unknown', hs: hs, ls: ls }; }
    var band = worst >= 2.5 ? 'roomy' : (worst >= 0 ? 'ok' : (worst >= -2.5 ? 'tight' : 'cramped'));
    return { band: band, hs: hs, ls: ls };
  }

  function rowLabel(n) { return n === 2 ? 'second row' : 'third row'; }

  /* Assign riders to rows: the reference person drives; the others fill row 2, then row 3, then
     the spare front seat, tallest first, so the guidance is about the seats people would actually use. */
  function assignRows(cfg, people) {
    var rows = has(cfg.rows) ? cfg.rows : 2;
    var seats = has(cfg.seats) ? cfg.seats : 5;
    var frontSeats = (seats >= 6 && rows <= 2 && cfg.bedLen) ? 3 : 2;
    if (rows < 2) { frontSeats = seats; }
    var cap2 = rows < 2 ? 0 : (rows >= 3 ? Math.min(3, seats - frontSeats - 2) : seats - frontSeats);
    if (cap2 < 0) { cap2 = 0; }
    var cap3 = rows >= 3 ? seats - frontSeats - cap2 : 0;
    var out = [], i, front = frontSeats - 1, r2 = cap2, r3 = cap3;
    var sorted = people.slice().sort(function (a, b) { return b.h - a.h; });
    for (i = 0; i < sorted.length; i++) {
      if (r2 > 0) { out.push({ p: sorted[i], row: 2 }); r2--; }
      else if (r3 > 0) { out.push({ p: sorted[i], row: 3 }); r3--; }
      else if (front > 0) { out.push({ p: sorted[i], row: 1 }); front--; }
      else { out.push({ p: sorted[i], row: 0 }); }
    }
    return out;
  }

  function roomHtml(cfg, party, metric) {
    var people = party.people || [];
    var o = [], i, a, r, b, who, txt, cls;
    var rows = has(cfg.rows) ? cfg.rows : 2;
    var name = cfg.model ? 'The ' + cfg.model : 'This vehicle';
    if (rows < 2) {
      return '<p class="vvy-room note">' + esc(name + ' has a single row of seats, so there is no back seat to judge.') + '</p>';
    }
    if (!has(cfg.headroom2) && !has(cfg.legroom2)) {
      return '<p class="vvy-room note">Rear-seat headroom and legroom are not on file for this configuration, so no back-seat guidance is given rather than guessing.</p>';
    }
    var gen = roomBand(70, cfg.headroom2, cfg.legroom2);
    var genTxt;
    if (gen.band === 'roomy') { genTxt = 'Second row: roomy enough for adults on a long drive'; }
    else if (gen.band === 'ok') { genTxt = 'Second row: works for average-height adults, with little to spare'; }
    else if (gen.band === 'tight') { genTxt = 'Second row: tight for adults — fine for shorter trips or kids'; }
    else { genTxt = 'Second row: really a kids-and-short-hops space'; }
    genTxt += ' (' + (has(cfg.headroom2) ? shortDim(cfg.headroom2, metric) + ' headroom' : '') + (has(cfg.headroom2) && has(cfg.legroom2) ? ', ' : '') + (has(cfg.legroom2) ? shortDim(cfg.legroom2, metric) + ' legroom' : '') + ').';
    if (rows >= 3 && has(cfg.legroom3)) {
      var g3 = roomBand(70, cfg.headroom3, cfg.legroom3);
      genTxt += ' Third row (' + (has(cfg.headroom3) ? shortDim(cfg.headroom3, metric) + ' headroom, ' : '') + shortDim(cfg.legroom3, metric) + ' legroom): ' + (g3.band === 'roomy' || g3.band === 'ok' ? 'genuinely usable by adults' : (g3.band === 'tight' ? 'kids first, adults for short hops' : 'best left to kids')) + '.';
    }
    o.push('<p class="vvy-room gen">' + esc(genTxt) + '</p>');

    if (people.length) {
      a = assignRows(cfg, people);
      o.push('<ul class="vvy-room list">');
      for (i = 0; i < a.length; i++) {
        r = a[i]; who = 'Your ' + esc(personLabel(r.p.h, metric)) + (r.p.kind === 'kid' ? ' kid' : ' adult');
        if (r.row === 0) { o.push('<li class="no">' + who + ' has no seat in this vehicle.</li>'); continue; }
        if (r.row === 1) { o.push('<li class="ok">' + who + ' rides up front' + (has(cfg.legroom1) ? ' (' + esc(shortDim(cfg.legroom1, metric)) + ' legroom)' : '') + '.</li>'); continue; }
        var head = r.row === 2 ? cfg.headroom2 : cfg.headroom3, leg = r.row === 2 ? cfg.legroom2 : cfg.legroom3;
        b = roomBand(r.p.h, head, leg);
        if (b.band === 'unknown') { o.push('<li class="note">' + who + ': ' + rowLabel(r.row) + ' room is not on file.</li>'); continue; }
        var why = [];
        if (b.hs !== null && b.hs < 0) { why.push('about ' + shortDim(-b.hs, metric) + ' short on headroom'); }
        if (b.ls !== null && b.ls < 0) { why.push('about ' + shortDim(-b.ls, metric) + ' short on legroom'); }
        if (b.band === 'roomy') { txt = who + ' should be comfortable in the ' + rowLabel(r.row) + ', even on a long drive.'; cls = 'ok'; }
        else if (b.band === 'ok') { txt = who + ' fits the ' + rowLabel(r.row) + ' with a little to spare' + (b.ls !== null && b.ls < 2 ? ' — knees may brush the seat ahead if it is slid back' : '') + '.'; cls = 'ok'; }
        else if (b.band === 'tight') { txt = who + ' will be tight in the ' + rowLabel(r.row) + ' of this one' + (why.length ? ' (' + why.join(', ') + ')' : '') + ' — fine for short trips.'; cls = 'warn'; }
        else { txt = who + ' will be cramped in the ' + rowLabel(r.row) + (why.length ? ' (' + why.join(', ') + ')' : '') + '.'; cls = 'no'; }
        o.push('<li class="' + cls + '">' + txt + '</li>');
      }
      o.push('</ul>');
    }
    var fl = [];
    if (cfg.approx && (indexOf(cfg.approx, 'headroom2') >= 0 || indexOf(cfg.approx, 'headroom3') >= 0)) { fl.push('headroom figures here are with the standard moonroof'); }
    if (cfg.approx && indexOf(cfg.approx, 'legroom3') >= 0) { fl.push('third-row legroom is the maximum of a sliding range'); }
    o.push('<p class="vvy-room caveat">Guidance, not a verdict: seat height, cushion angle and how far the front seats are set change real-world room by inches' + (fl.length ? '; ' + fl.join('; ') : '') + '.</p>');
    return o.join('');
  }

  function fitHtml(cfg, party) {
    var f = fit(cfg, party);
    return '<div class="vvy-fit ' + f.cls + '">' + esc(f.text) + '</div>';
  }

  /* ---------------- seated anthropometrics + per-row fit ----------------
     Ratios of standing height H (Drillis & Contini 1966 segment proportions, as tabulated in
     Tilley/Dreyfuss "The Measure of Man and Woman"):
       sitting height (cushion to crown, erect)  0.52 H  -> drawn/judged at 0.50 H + 0.5 in (seats
                                                            compress, people settle)
       shoulder height, seated                    0.37 H
       buttock-to-knee (hip to front of kneecap)  0.265 H  (0.245 thigh + kneecap)
       knee height, seated (floor to top of knee) 0.285 H
       foot length                                0.152 H
     Rear legroom need 0.52 H matches roomBand(); front legroom (heel point to H-point, seat slid
     for the driver) needs ~0.53 H — 37 in for a 5'10" driver, 40 in for 6'3"; published front
     legroom is a seat-fully-back maximum, so this is deliberately lenient. */
  var SEAT = { crown: 0.50, crownPad: 0.5, shoulder: 0.37, thigh: 0.265, knee: 0.285, foot: 0.152, legFront: 0.53 };
  function rowFit(cfg, row, h) {
    var head = row === 1 ? cfg.headroom1 : (row === 2 ? cfg.headroom2 : cfg.headroom3);
    var leg = row === 1 ? cfg.legroom1 : (row === 2 ? cfg.legroom2 : cfg.legroom3);
    if (row === 1) {
      var hs = has(head) ? head - (h * SEAT.crown + SEAT.crownPad) : null;
      var ls = has(leg) ? leg - h * SEAT.legFront : null;
      var worst = hs === null ? ls : (ls === null ? hs : Math.min(hs, ls));
      if (worst === null) { return { band: 'unknown', hs: hs, ls: ls }; }
      return { band: worst >= 2.5 ? 'roomy' : (worst >= 0 ? 'ok' : (worst >= -2.5 ? 'tight' : 'cramped')), hs: hs, ls: ls };
    }
    return roomBand(h, head, leg);
  }
  /* party fit per row for the rankings: tallest rider assigned to each row, or null when nobody sits there */
  function partyRows(cfg, party) {
    var people = [{ h: party.person || 70, kind: 'adult', you: true }].concat(party.people || []);
    var a = assignRows(cfg, people.slice(1)), i, tall = { 1: people[0].h, 2: null, 3: null };
    for (i = 0; i < a.length; i++) {
      if (a[i].row >= 1 && (tall[a[i].row] === null || a[i].p.h > tall[a[i].row])) { tall[a[i].row] = a[i].p.h; }
    }
    return { 1: tall[1] === null ? null : rowFit(cfg, 1, tall[1]), 2: tall[2] === null ? null : rowFit(cfg, 2, tall[2]), 3: tall[3] === null ? null : rowFit(cfg, 3, tall[3]), tall: tall };
  }

  function sourceHtml(cfg) {
    if (!cfg.src) { return ''; }
    return '<p class="vvy-src">Dimensions: ' + esc(cfg.src) + '</p>';
  }

  /* ---------------- interior cutaway ----------------
     Side section of vehicle A with the crew in their assigned seats. The silhouette is the exact
     exterior outline (ghosted); inside it, floor, seats, headliner and legroom are laid out from the
     published figures, and each rider is drawn at seated size from their standing height (SEAT
     ratios). Head through the headliner / knees into the seat ahead are drawn as they would be. */
  var FONT = 'system-ui,Segoe UI,Helvetica,Arial,sans-serif';
  function roofAt(body, xf) {
    /* highest outline y at x-fraction xf (outline is a closed polyline) */
    var pts = body.pts, i, a, b, best = null, t, y;
    for (i = 0; i < pts.length; i++) {
      a = pts[i]; b = pts[(i + 1) % pts.length];
      if ((a[0] <= xf && xf <= b[0]) || (b[0] <= xf && xf <= a[0])) {
        if (Math.abs(b[0] - a[0]) < 1e-6) { y = Math.max(a[1], b[1]); }
        else { t = (xf - a[0]) / (b[0] - a[0]); y = a[1] + (b[1] - a[1]) * t; }
        if (best === null || y > best) { best = y; }
      }
    }
    return best === null ? 1 : best;
  }
  function viewBadge(cx, cy, interior, f) {
    /* the in-drawing toggle: a pill under the vehicle that reads like a door handle / tab.
       f scales it with the scene width so it stays thumb-sized on a phone. */
    f = f || 1;
    var w = 40 * f, h = 8 * f, label = interior ? '◂ outside' : 'peek inside ▸';
    var o = [];
    o.push(hitOpen('view', interior ? 'Show the outside of the vehicle' : 'Look inside the vehicle', cx - w / 2 - 4, cy - h / 2 - 3, w + 8, h + 6));
    o.push('<g class="vvy-viewbadge"><rect x="' + r1(cx - w / 2) + '" y="' + r1(cy - h / 2) + '" width="' + r1(w) + '" height="' + r1(h) + '" rx="' + r1(h / 2) + '" fill="#fff" stroke="#3f6285" stroke-width="' + r1(0.5 * f) + '"/>');
    o.push('<text x="' + r1(cx) + '" y="' + r1(cy + 1.5 * f) + '" text-anchor="middle" font-size="' + r1(4 * f) + '" font-weight="700" fill="#1f4e79" font-family="' + FONT + '">' + label + '</text></g></g>');
    return o.join('');
  }
  function seatedSvg(h, hx, cushY, kneeX, floorY, Y, fill, cls, dx, face, faint) {
    /* rider facing the front (-x). hx = H-point x (in), cushY = cushion height (in above ground).
       kneeX = x of the front of the knee (in). Everything else from SEAT ratios. */
    var col = fill, paint = col, o = [];
    if (dx) { paint = 'url(#' + dx.hgrad('s' + (dx.n++), col, hx - 0.25 * h, hx + 0.12 * h) + ')'; }
    var lw = r1(Math.max(1.2, h * 0.055));
    var kneeY = cushY + h * 0.04, ankleX = kneeX - 2.5, footX = ankleX - h * SEAT.foot * 0.75;
    var shX = hx + 1.5, shY = cushY + h * SEAT.shoulder;
    var crown = cushY + h * SEAT.crown + SEAT.crownPad, headR = 0.0655 * h, headCy = crown - headR;
    var headCx = hx - 0.01 * h;
    o.push('<g class="' + (cls || 'vvy-seated') + '" opacity="' + (faint ? 0.55 : 1) + '">');
    /* far leg + far arm first, darker */
    var far = dx ? shade(col, -0.28) : col;
    o.push('<polyline points="' + r1(hx + 1) + ',' + Y(cushY + 1) + ' ' + r1(kneeX + 1.5) + ',' + Y(kneeY) + ' ' + r1(ankleX + 1.5) + ',' + Y(floorY + 1) + ' ' + r1(footX + 1.5) + ',' + Y(floorY + 0.4) + '" fill="none" stroke="' + far + '" stroke-width="' + lw + '" stroke-linejoin="round" stroke-linecap="round"/>');
    /* torso: hip to shoulder, slightly reclined */
    o.push('<polygon points="' + r1(hx - 0.05 * h) + ',' + Y(cushY + 0.5) + ' ' + r1(hx + 0.06 * h) + ',' + Y(cushY + 0.5) + ' ' + r1(shX + 0.045 * h) + ',' + Y(shY) + ' ' + r1(shX - 0.06 * h) + ',' + Y(shY) + '" fill="' + paint + '"/>');
    /* near leg: hip -> knee -> ankle -> toe */
    o.push('<polyline points="' + r1(hx) + ',' + Y(cushY + 1) + ' ' + r1(kneeX) + ',' + Y(kneeY) + ' ' + r1(ankleX) + ',' + Y(floorY + 1) + ' ' + r1(footX) + ',' + Y(floorY + 0.4) + '" fill="none" stroke="' + paint + '" stroke-width="' + lw + '" stroke-linejoin="round" stroke-linecap="round"/>');
    /* near arm: shoulder -> elbow -> hand on lap / wheel */
    o.push('<polyline points="' + r1(shX - 0.02 * h) + ',' + Y(shY - 0.02 * h) + ' ' + r1(hx + 0.02 * h) + ',' + Y(cushY + 0.17 * h) + ' ' + r1(hx - 0.16 * h) + ',' + Y(cushY + 0.19 * h) + '" fill="none" stroke="' + paint + '" stroke-width="' + r1(lw * 0.8) + '" stroke-linejoin="round" stroke-linecap="round"/>');
    /* neck + head */
    o.push('<rect x="' + r1(headCx - 0.02 * h) + '" y="' + Y(headCy) + '" width="' + r1(0.04 * h) + '" height="' + r1(shY < headCy ? headCy - shY + 1 : 1) + '" fill="' + paint + '"/>');
    o.push('<ellipse cx="' + r1(headCx) + '" cy="' + Y(headCy) + '" rx="' + r1(0.0435 * h) + '" ry="' + r1(headR) + '" fill="' + paint + '"/>');
    if (dx) { o.push('<ellipse cx="' + r1(headCx - 0.014 * h) + '" cy="' + Y(headCy + 0.02 * h) + '" rx="' + r1(0.014 * h) + '" ry="' + r1(0.024 * h) + '" fill="#fff" opacity="0.22"/>'); }
    if (face) { o.push(face(headCx, headCy, crown, kneeX, kneeY)); }
    o.push('</g>');
    return o.join('');
  }
  function sittingDogSvg(cx, floorY, Y, h, dx) {
    /* dog sitting, facing front (-x); h = shoulder height reference (22 in standing -> ~ 26 in tall seated) */
    var u = (h || 22) / 22, col = '#6b4f3a', paint = col;
    if (dx) { paint = 'url(#' + dx.vgrad('dogsit', col, 0.22, -0.3) + ')'; }
    function X(x) { return r1(cx + x * u); }
    function YY(y) { return Y(floorY + y * u); }
    var o = ['<g class="vvy-dog vvy-dog-sit" fill="' + paint + '">'];
    o.push('<path d="M' + X(-8) + ' ' + YY(0) + ' L' + X(6) + ' ' + YY(0) + ' L' + X(5) + ' ' + YY(14) + ' L' + X(-2) + ' ' + YY(20) + ' L' + X(-9) + ' ' + YY(10) + ' Z"/>');
    o.push('<path d="M' + X(-2) + ' ' + YY(20) + ' L' + X(-8) + ' ' + YY(26) + ' L' + X(-3) + ' ' + YY(28) + ' L' + X(3) + ' ' + YY(25) + ' L' + X(4) + ' ' + YY(19) + ' Z"/>');
    o.push('<path d="M' + X(-4) + ' ' + YY(27) + ' L' + X(-2) + ' ' + YY(32) + ' L' + X(2) + ' ' + YY(27) + ' Z"/>');
    o.push('<path d="M' + X(6) + ' ' + YY(1) + ' Q' + X(13) + ' ' + YY(2) + ' ' + X(12) + ' ' + YY(9) + '" fill="none" stroke="' + col + '" stroke-width="' + r1(2 * u) + '" stroke-linecap="round"/>');
    o.push('<rect x="' + X(-9) + '" y="' + YY(9) + '" width="' + r1(3 * u) + '" height="' + r1(9 * u) + '"/>');
    o.push('<circle cx="' + X(-6) + '" cy="' + YY(25) + '" r="' + r1(0.7 * u) + '" fill="#1f2933"/>');
    o.push('</g>');
    return o.join('');
  }
  function renderInterior(e, personIn, metric, opts) {
    opts = opts || {};
    var cfg = e.stock || e;
    var body = buildBody(cfg);
    var L = cfg.length, H0 = cfg.height, rise = e.rise || 0, H = e.height;
    var party = opts.party || {}, people = party.people || [];
    var pal = PAL.A;
    var rowsN = has(cfg.rows) ? cfg.rows : 2;
    var mL = 18, mR = 18, mT = 10 + 5 * Math.max(1, Math.min(3, rowsN)), mB = 18;
    var W = mL + L + mR, SH = mT + H + mB;
    function Y(y) { return r1(SH - mB - y); }
    var vx = mL;
    function X(xf) { return r1(vx + xf * L); }
    function YY(yf) { return Y(yf * H0 + rise); }
    var o = [], dx = new Defs((opts.idPrefix || 'vvy') + 'i'), i;
    var nm = (cfg.brand ? cfg.brand + ' ' : '') + (cfg.model || 'vehicle');
    o.push('<svg class="vvy-svg vvy-interior" viewBox="0 0 ' + r1(W) + ' ' + r1(SH) + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Inside the ' + esc(nm) + ': the crew seated to scale against the published headroom and legroom">');
    var defsAt = o.length;
    o.push('<rect x="0" y="' + Y(0) + '" width="' + r1(W) + '" height="' + r1(mB) + '" fill="url(#' + dx.vgrad('ground', '#e4e7eb', -0.06, 0.35) + ')" opacity="0.7"/>');
    o.push('<line x1="0" y1="' + Y(0) + '" x2="' + r1(W) + '" y2="' + Y(0) + '" stroke="#9aa5b1" stroke-width="0.6"/>');
    var g, gy;
    for (g = 12; g <= H; g += 12) { gy = Y(g); o.push('<line x1="0" y1="' + gy + '" x2="' + r1(W) + '" y2="' + gy + '" stroke="#cbd2d9" stroke-width="0.22" stroke-dasharray="1.6 2.4"/>'); }

    /* ---- cabin layout (inches) ---- */
    var t = cfg.template || 'sedan', pickup = /^pickup/.test(t), trunk = (t === 'sedan' || t === 'coupe'), wedge = (t === 'wedge');
    var gl = body.glass || [[0.3, 0.57], [0.43, 0.95], [0.7, 0.95], [0.83, 0.57]];
    var cabinF = vx + L * (gl[0][0] + 0.006);                            /* windshield base / dash */
    var cabinR = pickup ? vx + L * (body.pts[7][0]) : (trunk ? vx + L * (gl[3][0] + 0.05) : vx + L * 0.965);
    if (wedge) { cabinR = vx + L * 0.64; }
    var rows = has(cfg.rows) ? cfg.rows : 2, seats = has(cfg.seats) ? cfg.seats : 5;
    var clr = has(cfg.clearance) ? cfg.clearance : H0 * 0.115;
    var floor = clr + rise + 2.5;
    var roofSkin = 1.5;
    var footF = cabinF - 12;                                             /* toe-board tucks under the dash */
    var h1x = vx + L * gl[1][0] + 12;
    if (h1x < cabinF + 22) { h1x = cabinF + 22; }
    var roof1 = roofAt(body, (h1x - vx) / L) * H0 + rise;
    var cush1 = has(cfg.headroom1) ? roof1 - roofSkin - cfg.headroom1 : floor + 12;
    var cushH = cush1 - floor;
    if (cushH < 7) { floor = cush1 - 7; } else if (cushH > 18) { floor = cush1 - 18; }
    if (floor < rise + 1) { floor = rise + 1; cush1 = Math.max(cush1, floor + 7); }
    var R = [{ n: 1, hx: h1x, cush: cush1, head: cfg.headroom1, leg: cfg.legroom1, roof: roof1 }];
    var prev = R[0], k, hx, cush, roofy, legN, headN;
    for (k = 2; k <= rows; k++) {
      legN = k === 2 ? cfg.legroom2 : cfg.legroom3; headN = k === 2 ? cfg.headroom2 : cfg.headroom3;
      hx = prev.hx + (has(legN) ? legN : (k === 2 ? 37 : 32)) - 10.9;
      if (hx > cabinR - 6) { hx = cabinR - 6; }
      roofy = roofAt(body, (hx - vx) / L) * H0 + rise;
      cush = has(headN) ? roofy - roofSkin - headN : prev.cush - 0.5;
      if (cush < floor + 6) { cush = floor + 6; }
      if (cush > roofy - 20) { cush = roofy - 20; }
      R.push({ n: k, hx: hx, cush: cush, head: headN, leg: legN, roof: roofy, legKnown: has(legN) });
      prev = R[R.length - 1];
    }
    var lastR = R[R.length - 1];
    var cargoF = lastR.hx + 12, cargoR = cabinR - 2;

    /* ---- silhouette, ghosted, then the cabin ---- */
    var d = [];
    for (i = 0; i < body.pts.length; i++) { d.push((i === 0 ? 'M' : 'L') + X(body.pts[i][0]) + ' ' + YY(body.pts[i][1])); }
    d.push('L' + X(0.93) + ' ' + YY(body.gc) + ' L' + X(0.07) + ' ' + YY(body.gc) + ' Z');
    var path = d.join(' ');
    var clipB = dx.clip('cbi' + (dx.n++), '<path d="' + path + '"/>');
    o.push(groundShadow(vx + L / 2, Y(0) + 0.8, L * 0.47, 2.0, 0.18));
    /* wheels sit behind the cut shell */
    var wr = (e.wheelDia ? e.wheelDia : body.wheelR * 2 * H0) / 2, WB = cfg.wheelbase, fxw, rxw;
    if (has(cfg.frontOverhang) && WB) { fxw = vx + cfg.frontOverhang; rxw = fxw + WB; }
    else if (WB) { var ohw = L - WB; if (ohw < 0) { ohw = L * 0.34; } fxw = vx + ohw * body.foSplit; rxw = fxw + WB; }
    else { fxw = vx + L * 0.175; rxw = vx + L * 0.805; }
    o.push('<g opacity="0.55">' + wheelSvg(fxw, Y(wr), wr, pal, false, dx, 'A') + wheelSvg(rxw, Y(wr), wr, pal, false, dx, 'A') + '</g>');
    o.push('<g class="vvy-veh vvy-veh-A vvy-cut">');
    o.push('<path d="' + path + '" fill="url(#' + dx.vgrad('shell', pal.body, 0.55, 0.25, 0.42) + ')" opacity="0.55" stroke="' + pal.stroke + '" stroke-width="0.6" stroke-linejoin="round"/>');
    o.push('<g clip-path="url(#' + clipB + ')">');
    /* cabin void: lighter interior colour between firewall and cabin rear, above the floor */
    o.push('<rect x="' + r1(cabinF) + '" y="' + Y(H) + '" width="' + r1(cabinR - cabinF) + '" height="' + r1(H - floor) + '" fill="#f6f2ea"/>');
    o.push('<rect x="' + r1(footF) + '" y="' + Y(floor + Math.max(10, (cush1 - floor) + 6)) + '" width="' + r1(cabinF - footF + 1) + '" height="' + r1(Math.max(10, (cush1 - floor) + 6)) + '" fill="#e9e3d8"/>');
    /* headliner shading strip under the roof + floor */
    o.push('<rect x="' + r1(cabinF) + '" y="' + Y(H) + '" width="' + r1(cabinR - cabinF) + '" height="' + r1(roofSkin) + '" fill="' + pal.stroke + '" opacity="0.6"/>');
    o.push('<rect x="' + r1(footF) + '" y="' + Y(floor) + '" width="' + r1(cabinR - footF + 2) + '" height="' + r1(Math.max(1.5, floor - rise - 2)) + '" fill="' + shade(pal.body, -0.45) + '"/>');
    /* dash */
    var dashTop = floor + Math.max(cush1 - floor + 10, 20);
    o.push('<path d="M' + r1(cabinF) + ' ' + Y(floor) + ' L' + r1(cabinF) + ' ' + Y(dashTop) + ' Q' + r1(cabinF + 12) + ' ' + Y(dashTop + 1) + ' ' + r1(cabinF + 16) + ' ' + Y(dashTop - 3) + ' L' + r1(cabinF + 14) + ' ' + Y(dashTop - 9) + ' L' + r1(cabinF + 6) + ' ' + Y(floor + 6) + ' L' + r1(cabinF + 8) + ' ' + Y(floor) + ' Z" fill="' + shade(pal.body, -0.55) + '"/>');
    /* steering wheel */
    o.push('<ellipse cx="' + r1(h1x - 15) + '" cy="' + Y(cush1 + 10) + '" rx="1.6" ry="6.5" fill="none" stroke="' + shade(pal.body, -0.6) + '" stroke-width="1.6" transform="rotate(-18 ' + r1(h1x - 15) + ' ' + Y(cush1 + 10) + ')"/>');
    /* seats */
    var seatCol = '#8b7e72', seatPaint = 'url(#' + dx.vgrad('seat', seatCol, 0.25, -0.3) + ')';
    for (k = 0; k < R.length; k++) {
      var r = R[k], sb = r.hx + 3, top = r.cush + 22;
      if (top > r.roof - roofSkin - 2) { top = r.roof - roofSkin - 2; }
      /* backrest (reclined) + cushion + headrest */
      o.push('<path d="M' + r1(sb) + ' ' + Y(r.cush - 1) + ' L' + r1(sb + 7) + ' ' + Y(r.cush - 1) + ' L' + r1(sb + 11) + ' ' + Y(top) + ' L' + r1(sb + 5) + ' ' + Y(top) + ' Z" fill="' + seatPaint + '"/>');
      o.push('<rect x="' + r1(r.hx - 15) + '" y="' + Y(r.cush + 0.5) + '" width="' + r1(22) + '" height="4" rx="1.5" fill="' + seatPaint + '"/>');
      o.push('<rect x="' + r1(sb + 5.5) + '" y="' + Y(top + 6) + '" width="5" height="6" rx="1.5" fill="' + seatPaint + '"/>');
      o.push('<rect x="' + r1(r.hx - 15) + '" y="' + Y(floor + 5) + '" width="14" height="' + r1(floor + 5 - floor) + '" fill="' + shade(seatCol, -0.4) + '" opacity="0.5"/>');
      /* headliner line for the row + label */
      if (has(r.head)) {
        var hl = r.cush + r.head;
        o.push('<line x1="' + r1(r.hx - 14) + '" y1="' + Y(hl) + '" x2="' + r1(r.hx + 10) + '" y2="' + Y(hl) + '" stroke="#7b5ea7" stroke-width="0.5" stroke-dasharray="2 1.4"/>');
      }
    }
    o.push('</g>');   /* end clip */

    /* ---- riders ---- */
    var you = { h: personIn, kind: 'adult', you: true };
    var assigned = assignRows(cfg, people), rider = [], byRow = { 1: [you], 2: [], 3: [], 0: [] }, j;
    for (i = 0; i < assigned.length; i++) { byRow[assigned[i].row].push(assigned[i].p); }
    var bands = {};
    function faceFor(fitr, rowObj, isFront) {
      return function (hcx, hcy, crown, kneeX, kneeY) {
        var s = [];
        if (fitr.hs !== null && fitr.hs < 0 && has(rowObj.head)) {
          /* head into the headliner: red crush mark */
          s.push('<path d="M' + r1(hcx - 4) + ' ' + Y(rowObj.cush + rowObj.head) + ' l2 -1.6 l2 1.6 l2 -1.6 l2 1.6" fill="none" stroke="#b3261e" stroke-width="0.7"/>');
        }
        if (fitr.ls !== null && fitr.ls < 0 && !isFront) {
          s.push('<path d="M' + r1(kneeX - 2.5) + ' ' + Y(kneeY + 3) + ' l1.5 -1.6 l1.5 1.6 l1.5 -1.6" fill="none" stroke="#b3261e" stroke-width="0.7"/>');
        }
        return s.join('');
      };
    }
    for (k = 0; k < R.length; k++) {
      var rr = R[k], list = byRow[rr.n];
      for (j = 0; j < list.length; j++) {
        var p = list[j], hh = p.h, fr = rowFit(cfg, rr.n, hh);
        var col = p.you ? '#1f2933' : (p.kind === 'kid' ? '#5f7d95' : '#3d4f60');
        if (fr.band === 'tight') { col = '#b7791f'; } else if (fr.band === 'cramped') { col = '#b3261e'; }
        bands[rr.n] = bands[rr.n] || fr.band;
        /* knee: anatomical, or pushed forward to the seat ahead + margin when that is tighter */
        var kneeAnat = rr.hx - hh * SEAT.thigh, kneeX = kneeAnat;
        if (rr.n > 1 && fr.ls !== null) { var face = R[k - 1].hx + 7, kls = face + fr.ls; if (kls < kneeAnat) { kneeX = kls; } }
        if (rr.n === 1 && fr.ls !== null && fr.ls < 0) { kneeX = kneeAnat - fr.ls * 0.3; }
        o.push(seatedSvg(hh, rr.hx + j * 3.5, rr.cush, kneeX + j * 3.5, floor, Y, col, 'vvy-seated' + (p.you ? ' vvy-you' : ''), dx, faceFor(fr, rr, rr.n === 1), j > 0));
      }
    }
    /* riders with no seat: standing outside behind the vehicle */
    var nx = vx + L + 4;
    for (j = 0; j < byRow[0].length; j++) {
      var q = byRow[0][j];
      o.push(personSvg(q.h, nx + q.h * 0.16, Y, q.kind === 'kid' ? '#9aa5b1' : '#7b8794', 'vvy-fam vvy-noseat', dx));
      o.push('<text x="' + r1(nx + q.h * 0.16) + '" y="' + r1(Y(0) + 6) + '" text-anchor="middle" font-size="3.4" fill="#8a1c14" font-family="' + FONT + '">no seat</text>');
      nx += q.h * 0.31 + 4;
    }

    /* ---- pets ---- */
    var nD = Math.min(party.dogs || 0, 12), nC = Math.min(party.cats || 0, 12);
    var cargoOK = !trunk && !pickup && !wedge && (cargoR - cargoF) > 16 && rows >= 2;
    for (i = 0; i < nD; i++) {
      if (pickup) {
        /* in the bed: bed floor = published bedHeight or rail - 20 */
        var bedY = has(e.bedHeight) ? e.bedHeight : (body.pts[9][1] * H0 + rise - 20);
        o.push(sittingDogSvg(vx + L * 0.86 - i * 14, bedY, Y, 22, dx));
      } else if (cargoOK) {
        o.push(sittingDogSvg(Math.min(cargoR - 10, cargoF + 8 + i * 12), floor, Y, 22, dx));
      } else {
        /* footwell of the last row (or front passenger footwell when single-row) */
        var fw = lastR.n === 1 ? lastR.hx - 20 : lastR.hx - 14 - i * 6;
        o.push(sittingDogSvg(fw, floor, Y, 17, dx));
      }
    }
    var catSpots = [];
    /* lap of the first rear rider, dashboard, parcel shelf / rear seat top, cargo floor */
    if (byRow[2].length) { catSpots.push({ x: R[1].hx - 9, y: R[1].cush + 4.5, flip: false }); }
    catSpots.push({ x: cabinF + 9, y: dashTop - 0.5, flip: true });
    if (trunk) { catSpots.push({ x: cabinR - 6, y: roofAt(body, (cabinR - vx) / L) * H0 + rise - roofSkin - 11, flip: false }); }
    else if (R.length > 1) { catSpots.push({ x: lastR.hx + 8, y: Math.min(lastR.cush + 22, lastR.roof - roofSkin - 2) + 5.5, flip: false }); }
    if (cargoOK) { catSpots.push({ x: cargoR - 8, y: floor, flip: true }); }
    catSpots.push({ x: R[0].hx - 9, y: R[0].cush + 4.5, flip: false });
    for (i = 0; i < nC; i++) {
      var cs = catSpots[i % catSpots.length];
      o.push('<g class="vvy-cat vvy-cat-in" pointer-events="none" transform="translate(' + r1(cs.x) + ' ' + Y(cs.y) + ')' + (cs.flip ? ' scale(-1 1)' : '') + '">' + catSprite(i % 3 === 0 ? '#4a4a52' : (i % 3 === 1 ? '#8a6d4b' : '#b8b2a7'), dx, i % 3) + '</g>');
    }

    /* ---- labels: per-row figures in the top margin, verdict colours ---- */
    var lab = [];
    for (k = 0; k < R.length; k++) {
      var rl = R[k], lk = R.length - 1 - k, txt = (rl.n === 1 ? 'Front' : (rl.n === 2 ? '2nd row' : '3rd row')) + ': ' +
        (has(rl.head) ? shortDim(rl.head, metric) + ' head' : 'head n/a') + ' · ' + (has(rl.leg) ? shortDim(rl.leg, metric) + ' leg' : 'leg n/a');
      var bc = bands[rl.n] === 'cramped' ? '#8a1c14' : (bands[rl.n] === 'tight' ? '#7a5410' : '#52606d');
      lab.push('<text x="' + r1(rl.hx - 4) + '" y="' + r1(Y(H) - 3.5 - lk * 5) + '" text-anchor="middle" font-size="3.6" fill="' + bc + '" font-family="' + FONT + '">' + esc(txt) + '</text>');
      lab.push('<line x1="' + r1(rl.hx - 4) + '" y1="' + r1(Y(H) - 2.2 - lk * 5) + '" x2="' + r1(rl.hx - 4) + '" y2="' + r1(Y(H) + 0.5) + '" stroke="' + bc + '" stroke-width="0.35"/>');
    }
    o.push(lab.join(''));
    o.push('<text x="2" y="' + r1(Y(0) + 6) + '" font-size="3.3" fill="#7b8794" font-family="' + FONT + '">seated ≈ 0.52 × standing height · published room is indicative; seat position varies</text>');
    o.push('</g>');
    var bf2 = Math.max(1, Math.min(1.8, W / 380)); o.push(viewBadge(vx + L - 24 * bf2, Y(0) + 11, true, bf2));
    o.push('</svg>');
    o.splice(defsAt, 0, dx.html());
    return o.join('');
  }

  /* single-vehicle entry point used by the static prerender */
  function renderAll(cfg, personIn, metric) {
    var e = effective(cfg, null);
    return {
      svg: renderScene([e], personIn, metric, {}),
      specs: specsHtml(e, metric),
      comps: compsHtml(e, personIn, metric),
      src: sourceHtml(cfg)
    };
  }

  return {
    renderScene: renderScene,
    renderInterior: renderInterior,
    rowFit: rowFit,
    partyRows: partyRows,
    SEAT: SEAT,
    specsHtml: specsHtml,
    compsHtml: compsHtml,
    vsHtml: vsHtml,
    sourceHtml: sourceHtml,
    renderAll: renderAll,
    fit: fit,
    fitHtml: fitHtml,
    roomHtml: roomHtml,
    roomBand: roomBand,
    effective: effective,
    parseTire: parseTire,
    stockWheelDia: stockWheelDia,
    personLabel: personLabel,
    CAT_MOUTH_X: CAT_MOUTH_X,
    Defs: Defs,
    shade: shade,
    groundShadow: groundShadow,
    personSvg: personSvg,
    dogSvg: dogSvg,
    catSprite: catSprite,
    buildBody: buildBody,
    shortDim: shortDim,
    dim: dim,
    mass: mass,
    esc: esc,
    has: has,
    PAL: PAL,
    LANDMARKS: LANDMARKS
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = VVY; }
