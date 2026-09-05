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
    B: { body: '#f1b93f', stroke: '#9a6a12', glass: '#f8e6b8', wheel: '#5c4a1e', hub: '#e9d7a8', guide: '#b7791f', op: 1 }
  };

  var FONT = 'system-ui,Segoe UI,Helvetica,Arial,sans-serif';
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
  /* haloed label: a white-stroked copy under the filled text, so it reads over any artwork
     (drawn twice rather than relying on paint-order, which some renderers ignore) */
  function haloText(attrs, content, w) {
    var under = attrs.replace(/ fill="[^"]*"/, '');
    return '<text' + under + ' fill="#fff" stroke="#fff" stroke-width="' + (w || 1.5) + '" stroke-linejoin="round" stroke-opacity="0.9">' + content + '</text>' +
      '<text' + attrs + '>' + content + '</text>';
  }
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
  /* arms hang a little away from the body (relaxed, cheerful stance) — this widens the figure but
     touches no vertical proportion, so nothing that is measured changes */
  var ARM = [
    [0.112, 0.818], [0.152, 0.788], [0.166, 0.620], [0.178, 0.478],
    [0.146, 0.476], [0.118, 0.620], [0.096, 0.778]
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
      /* rim light on the head, neck shadow under the chin */
      o.push('<ellipse cx="' + r1(cx - 0.018 * h) + '" cy="' + r1(Y(0.965 * h)) + '" rx="' + r1(0.014 * h) + '" ry="' + r1(0.02 * h) + '" fill="#fff" opacity="0.2"/>');
      o.push('<ellipse cx="' + r1(cx) + '" cy="' + r1(Y(0.872 * h)) + '" rx="' + r1(0.03 * h) + '" ry="' + r1(0.012 * h) + '" fill="#000" opacity="0.18"/>');
    }
    o.push(faceSvg(cx, Y, 0.9345 * h, h, 1));
    o.push('</g>');
    return o.join('');
  }
  /* cheerful face on a silhouette head: two eyes and a smile, in light paint. (cx, yc) = head
     centre (yc in inches above ground), h = the figure's height, k = size factor */
  function faceSvg(cx, Y, yc, h, k) {
    k = k || 1;
    var ex = 0.015 * h * k, ey = yc + 0.012 * h * k, er = Math.max(0.35, 0.0055 * h * k);
    var sy = yc - 0.012 * h * k, sw = 0.02 * h * k;
    return '<g class="vvy-face" fill="#fff" opacity="0.9">' +
      '<circle cx="' + r1(cx - ex) + '" cy="' + r1(Y(ey)) + '" r="' + r1(er) + '"/><circle cx="' + r1(cx + ex) + '" cy="' + r1(Y(ey)) + '" r="' + r1(er) + '"/>' +
      '<path d="M' + r1(cx - sw) + ' ' + r1(Y(sy)) + ' Q' + r1(cx) + ' ' + r1(Y(sy - 0.018 * h * k)) + ' ' + r1(cx + sw) + ' ' + r1(Y(sy)) + '" fill="none" stroke="#fff" stroke-width="' + r1(Math.max(0.4, 0.006 * h * k)) + '" stroke-linecap="round"/></g>';
  }

  /* ---------------- pets ----------------
     dogSvg: side-view dog, h = shoulder height in inches, standing at ground x = cx.
     catSvg: side-view cat sprite centred on (0,0) at ground level, ~10 in tall; placed via transform. */
  /* wag: true -> the tail eases side to side (SMIL, slow, smooth); omitted in static / reduced motion */
  function dogSvg(h, cx, Y, fill, dx, wag) {
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
    o.push('<g class="vvy-tail"><path d="M' + X(-14) + ' ' + YY(19) + ' L' + X(-19) + ' ' + YY(26) + ' L' + X(-17) + ' ' + YY(27) + ' L' + X(-12) + ' ' + YY(20) + ' Z"/>' +
      (wag ? '<animateTransform attributeName="transform" type="rotate" values="-14 ' + X(-13) + ' ' + YY(19.5) + ';12 ' + X(-13) + ' ' + YY(19.5) + ';-14 ' + X(-13) + ' ' + YY(19.5) + '" dur="2.8s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite"/>' : '') + '</g>');
    o.push('<rect x="' + X(-6) + '" y="' + YY(12) + '" width="' + r1(3 * u) + '" height="' + r1(12 * u) + '"/>');
    o.push('<rect x="' + X(5) + '" y="' + YY(12) + '" width="' + r1(3 * u) + '" height="' + r1(12 * u) + '"/>');
    if (dx) {
      /* back highlight + eye */
      o.push('<path d="M' + X(-12) + ' ' + YY(18.4) + ' L' + X(5) + ' ' + YY(20.3) + '" stroke="#fff" stroke-width="' + r1(0.9 * u) + '" stroke-linecap="round" opacity="0.18" fill="none"/>');
      o.push('<circle cx="' + X(12.5) + '" cy="' + YY(24) + '" r="' + r1(0.7 * u) + '" fill="#1f2933"/>');
    }
    /* happy: smile along the muzzle + a tongue */
    o.push('<path d="M' + X(11.5) + ' ' + YY(21.2) + ' Q' + X(13.8) + ' ' + YY(19.6) + ' ' + X(15.6) + ' ' + YY(21) + '" fill="none" stroke="#fff" stroke-width="' + r1(0.55 * u) + '" stroke-linecap="round" opacity="0.85"/>');
    o.push('<ellipse cx="' + X(14) + '" cy="' + YY(19.6) + '" rx="' + r1(0.9 * u) + '" ry="' + r1(1.3 * u) + '" fill="#e8848f"/>');
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
  function vehicleSvg(e, vx, Y, role, animate, spots, dx) {
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
      o.push(groundShadow(vx + L / 2, Y(0) + 0.8, L * 0.47, 2.0, 0.2));
    }
    o.push('<g class="vvy-veh vvy-veh-' + role + '">');
    o.push('<path d="' + path + '" fill="' + bodyFill + '" stroke="' + pal.stroke + '" stroke-width="0.45" stroke-linejoin="round"/>');
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

  /* ---------------- profile scene ----------------
     vehicles: [effA] or [effA, effB] (B drawn beside A at the same scale — the only comparison mode)
     opts: { animate, party, interactive, idPrefix } */
  function renderScene(vehicles, personIn, metric, opts) {
    opts = opts || {};
    var A = vehicles[0], B = vehicles.length > 1 ? vehicles[1] : null;
    var side = !!B;
    var pw = personIn * 0.31;
    var gap = 16;
    /* minimum buffers: labels are drawn INLINE over the artwork (haloed), not in reserved margins */
    var mL = 9, mR = 4, mT = 9 + ((opts.party && opts.party.cats) ? 12 : 0), mB = 13;   /* mT: roof label / a cat's speech bubble */
    /* label size scales with the scene width so it lands at ~9-10 px on a 375 px phone */
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
    var GF = r1(Math.max(5.2, Math.min(8, W / 48)));   /* guide/label font in scene units */
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
    o.push(vehicleSvg(A, vxA, Y, 'A', !!opts.animate, spots, dx));
    if (inter) { o.push('</g>'); }
    if (inter && !B) { o.push(qmarkSvg(vxA + LA + gap, 0, A.height, Y)); }
    if (B) { o.push(vehicleSvg(B, vxB, Y, 'B', !!opts.animate, null, dx)); }

    /* dimension lines run edge to edge; the label sits on the line at the right edge, haloed so it
       reads over the body, the ghost "?" or the sky alike; alternating above/below avoids stacking */
    var gx1 = r1(W - 2);
    function guide(yIn, label, color, below) {
      var ty = below ? (Y(yIn) + 4.4) : (Y(yIn) - 1.1);
      o.push('<line x1="2" y1="' + Y(yIn) + '" x2="' + gx1 + '" y2="' + Y(yIn) + '" stroke="' + color + '" stroke-width="0.45" stroke-dasharray="3 2" opacity="0.85"/>');
      o.push(haloText(' x="' + gx1 + '" y="' + r1(ty) + '" text-anchor="end" font-size="' + GF + '" font-weight="700" fill="' + color + '" font-family="' + FONT + '"', esc(label), 1.6));
    }
    guide(A.height, shortDim(A.height, metric) + ' roof' + (B ? ' A' : ''), PAL.A.guide, false);
    /* hood / bed labels go below their lines so they never sit on the roof label when heights are close */
    if (has(A.hoodHeight)) { guide(A.hoodHeight, shortDim(A.hoodHeight, metric) + ' hood' + (B ? ' A' : ''), '#7b5ea7', Math.abs(A.height - A.hoodHeight) < 7); }
    if (has(A.bedHeight)) { guide(A.bedHeight, shortDim(A.bedHeight, metric) + ' bed' + (B ? ' A' : ''), '#0b7285', has(A.hoodHeight) && Math.abs(A.hoodHeight - A.bedHeight) < 7 ? false : true); }
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
      if (fam[i].kind === 'dog') { o.push('<g pointer-events="none">' + dogSvg(fam[i].h, fc, Y, '#6b4f3a', dx, !!opts.wag) + '</g>'); }
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
      /* second line under the ground so it never collides with the "You" label */
      o.push(haloText(' x="' + r1(mL + pw + 4 + famW / 2) + '" y="' + r1(Y(0) + 11) + '" text-anchor="middle" font-size="' + r1(GF * 0.8) + '" fill="#52606d" font-family="' + FONT + '"', esc(parts.join(' \u00b7 ')), 1.2));
    }

    /* height ruler hugs the reference figure */
    var bx = 3;
    o.push('<line x1="' + bx + '" y1="' + Y(0) + '" x2="' + bx + '" y2="' + Y(personIn) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<line x1="1" y1="' + Y(personIn) + '" x2="5" y2="' + Y(personIn) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<line x1="1" y1="' + Y(0) + '" x2="5" y2="' + Y(0) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push(haloText(' x="' + r1(Math.max(px, 16)) + '" y="' + r1(Y(0) + 5.8) + '" text-anchor="middle" font-size="' + GF + '" font-weight="700" fill="#1f2933" font-family="' + FONT + '"', 'You &#183; ' + esc(personLabel(personIn, metric)), 1.6));

    if (inter) { var bf = Math.max(1, Math.min(1.8, W / 380)); o.push(viewBadge(vxA + LA - 24 * bf, Y(0) + 6.5, false, bf)); }
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

  /* ---------------- seating: ONE model used everywhere ----------------
     seatEveryone(cfg, party) places every rider AND every dog:
       1. driver's seat      — the reference person (you)
       2. front passenger    — the second adult (first adult in the party)
       3. everyone else      — rear rows, row 2 then row 3, in the order given
       4. front bench middle — filled LAST of all, and preferentially by a dog
     Dogs take a seat like a passenger. When seats run out a dog goes in the cargo bay (hatch /
     crossover / SUV / minivan / wagon / van with a published cargo figure of CARGO_PER_DOG cu ft per
     dog behind the last row) or the bed of a pickup. A sedan/coupe trunk is not a place for a dog.
     Cats take nothing and go where they please.
     Seat index within a row: 0 = driver side, 1 = far side, 2 = middle (drawn on the right in the
     overhead view, which looks at a left-hand-drive car from the hood). */
  var CARGO_PER_DOG = 12;
  function seatLayout(cfg) {
    var rows = has(cfg.rows) ? Math.max(1, Math.min(3, cfg.rows)) : 2, seats = has(cfg.seats) ? cfg.seats : 5;
    var front = (seats >= 6 && rows <= 2 && cfg.bedLen) ? 3 : 2;
    if (rows < 2) { front = Math.min(3, seats); }
    var r2 = rows < 2 ? 0 : (rows >= 3 ? Math.min(3, seats - front - 2) : seats - front);
    if (r2 < 0) { r2 = 0; }
    var r3 = rows >= 3 ? Math.max(0, seats - front - r2) : 0;
    var out = [{ n: 1, seats: front, bench: front === 3 }];
    if (rows >= 2) { out.push({ n: 2, seats: r2, bench: r2 >= 3 }); }
    if (rows >= 3) { out.push({ n: 3, seats: Math.min(3, r3), bench: r3 >= 2 }); }
    return out;
  }
  function dogSpace(cfg) {
    var t = cfg.template || 'sedan';
    if (/^pickup/.test(t) || has(cfg.bedLen)) { return { kind: 'bed', dogs: 99 }; }
    if (t === 'sedan' || t === 'coupe' || t === 'wedge') { return { kind: 'none', dogs: 0 }; }
    var c = has(cfg.cargo3) ? cfg.cargo3 : (has(cfg.cargo2) ? cfg.cargo2 : null);
    if (c === null) { return { kind: 'unknown', dogs: 0 }; }
    return { kind: 'cargo', dogs: Math.floor(c / CARGO_PER_DOG), cuft: c };
  }
  function seatEveryone(cfg, party) {
    party = party || {};
    var you = { h: has(party.person) ? party.person : 70, kind: 'adult', you: true };
    var people = party.people || [], nDogs = Math.min(party.dogs || 0, 12);
    var lay = seatLayout(cfg), rowsN = has(cfg.rows) ? cfg.rows : null, seatsN = has(cfg.seats) ? cfg.seats : null;
    var occ = {}, i, k, r;   /* occ[row] = [ {p|dog} per seat index ] */
    for (k = 0; k < lay.length; k++) { occ[lay[k].n] = []; for (i = 0; i < lay[k].seats; i++) { occ[lay[k].n].push(null); } }
    var placed = [], unseated = [];
    function put(p, row, seat) { occ[row][seat] = p; placed.push({ p: p, row: row, seat: seat }); }
    /* 1. driver */
    if (occ[1] && occ[1].length) { put(you, 1, 0); } else { unseated.push(you); }
    /* 2. front passenger = the first other adult */
    var rest = people.slice(), ai = -1;
    for (i = 0; i < rest.length; i++) { if (rest[i].kind !== 'kid') { ai = i; break; } }
    if (ai >= 0 && occ[1] && occ[1].length > 1) { put(rest[ai], 1, 1); rest.splice(ai, 1); }
    /* 3. rear rows in the order given: window seats first, middle last */
    var order = [];
    for (k = 0; k < lay.length; k++) { if (lay[k].n > 1) { var n = lay[k].seats; if (n >= 1) { order.push([lay[k].n, 0]); } if (n >= 2) { order.push([lay[k].n, 1]); } if (n >= 3) { order.push([lay[k].n, 2]); } } }
    /* then the front passenger seat if still free; the front bench middle is kept for last */
    if (occ[1] && occ[1].length > 1 && !occ[1][1]) { order.push([1, 1]); }
    var oi = 0;
    while (rest.length && oi < order.length) { put(rest.shift(), order[oi][0], order[oi][1]); oi++; }
    /* 4. dogs take the remaining seats (rear first, front passenger, bench middle last of all) */
    var dogsOut = [], free = [];
    for (k = lay.length - 1; k >= 0; k--) { for (i = 0; i < occ[lay[k].n].length; i++) { if (!occ[lay[k].n][i] && !(lay[k].n === 1 && i === 2)) { free.push([lay[k].n, i]); } } }
    free.sort(function (x, y) { return (x[0] === 1 ? 1 : 0) - (y[0] === 1 ? 1 : 0) || x[0] - y[0] || x[1] - y[1]; });
    if (occ[1] && occ[1].length > 2 && !occ[1][2]) { free.push([1, 2]); }
    var space = dogSpace(cfg), spaceLeft = space.dogs;
    for (i = 0; i < nDogs; i++) {
      var dog = { kind: 'dog', h: 22, i: i };
      if (free.length) { var f = free.shift(); put(dog, f[0], f[1]); dogsOut.push({ dog: dog, place: 'seat', row: f[0], seat: f[1] }); }
      else if (spaceLeft > 0) { spaceLeft--; dogsOut.push({ dog: dog, place: space.kind }); }
      else { dogsOut.push({ dog: dog, place: 'none' }); }
    }
    /* leftover people: the front bench middle is the very last seat to fill — and if a dog holds a
       proper seat while a person needs one, the dog moves to the middle and the person takes its seat */
    while (rest.length) {
      var mid = (occ[1] && occ[1].length > 2 && !occ[1][2]);
      if (!mid) { unseated.push(rest.shift()); continue; }
      var swapped = false;
      for (i = 0; i < dogsOut.length && !swapped; i++) {
        var dO = dogsOut[i];
        if (dO.place === 'seat' && !(dO.row === 1 && dO.seat === 2)) {
          var pp = rest.shift();
          occ[dO.row][dO.seat] = pp; placed.push({ p: pp, row: dO.row, seat: dO.seat });
          for (k = 0; k < placed.length; k++) { if (placed[k].p === dO.dog) { placed[k].row = 1; placed[k].seat = 2; } }
          occ[1][2] = dO.dog; dO.row = 1; dO.seat = 2; swapped = true;
        }
      }
      if (!swapped) { put(rest.shift(), 1, 2); }
    }
    /* people before dogs: if anyone is still standing while a dog holds a seat, the dog gives it up
       and goes to the cargo bay / bed (or has nowhere to ride) */
    for (i = dogsOut.length - 1; i >= 0 && unseated.length; i--) {
      var dE = dogsOut[i];
      if (dE.place !== 'seat') { continue; }
      var who = unseated.shift();
      occ[dE.row][dE.seat] = who; placed.push({ p: who, row: dE.row, seat: dE.seat });
      for (k = placed.length - 1; k >= 0; k--) { if (placed[k].p === dE.dog) { placed.splice(k, 1); } }
      if (spaceLeft > 0) { spaceLeft--; dE.place = space.kind; } else { dE.place = 'none'; }
      delete dE.row; delete dE.seat;
    }
    return { layout: lay, occ: occ, placed: placed, unseated: unseated, dogs: dogsOut, space: space, rows: rowsN, seats: seatsN, you: you };
  }
  /* row -> riders (people only, in seat order) for the drawing code */
  function ridersByRow(sea) {
    var out = { 1: [], 2: [], 3: [], 0: sea.unseated.slice() }, i, r, s, o;
    for (r = 1; r <= 3; r++) { o = sea.occ[r]; if (!o) { continue; } for (s = 0; s < o.length; s++) { if (o[s] && o[s].kind !== 'dog') { out[r].push(o[s]); } } }
    return out;
  }

  /* ---------------- occupancy verdict ----------------
     party = { person, people, dogs, cats } -> { fits, people, seats, spare, text, cls } */
  function fit(cfg, party) {
    party = party || {};
    var people = 1 + (party.people || []).length, dogs = party.dogs || 0;
    if (party.people === undefined) { people = (party.adults || 0) + (party.kids || 0); }
    var seats = has(cfg.seats) ? cfg.seats : null;
    var rows = has(cfg.rows) ? cfg.rows : null;
    if (seats === null) { return { fits: null, people: people, seats: null, spare: null, text: 'Seat count not on file.', cls: 'unknown' }; }
    var sea = seatEveryone(cfg, party), i, seatedDogs = 0, cargoDogs = 0, bedDogs = 0, lostDogs = 0;
    for (i = 0; i < sea.dogs.length; i++) { if (sea.dogs[i].place === 'seat') { seatedDogs++; } else if (sea.dogs[i].place === 'cargo') { cargoDogs++; } else if (sea.dogs[i].place === 'bed') { bedDogs++; } else { lostDogs++; } }
    var used = (people - sea.unseated.length) + seatedDogs, spare = seats - used;
    var fits = sea.unseated.length === 0 && lostDogs === 0;
    var r = { fits: fits, people: people, seats: seats, spare: spare, pets: dogs, cls: fits ? 'ok' : 'no', seated: sea };
    var name = (cfg.brand ? cfg.brand + ' ' : '') + (cfg.model || 'vehicle'), t;
    if (people === 0 && dogs === 0) { t = seats + ' seats in ' + rows + (rows === 1 ? ' row' : ' rows') + '. Add your party to check the fit.'; r.cls = 'idle'; }
    else if (!fits) {
      t = 'Does not fit: ' + people + (people === 1 ? ' person' : ' people') + (dogs ? ' and ' + dogs + (dogs === 1 ? ' dog' : ' dogs') : '') + ' need ' + (people + dogs) + ' seats and this ' + name + ' has ' + seats + '.';
      if (sea.unseated.length) { t += ' ' + sea.unseated.length + (sea.unseated.length === 1 ? ' person' : ' people') + ' would be left behind.'; }
      if (lostDogs) {
        t += ' ' + lostDogs + (lostDogs === 1 ? ' dog has' : ' dogs have') + ' no seat and ' + (sea.space.kind === 'none' ? 'a ' + (cfg.template === 'wedge' ? 'closed bed' : 'trunk') + ' is no place for a dog' : (sea.space.kind === 'unknown' ? 'the cargo space is not on file' : 'the cargo bay (' + sea.space.cuft + ' cu ft) is only big enough for ' + sea.space.dogs + (sea.space.dogs === 1 ? ' dog' : ' dogs'))) + '.';
      }
    } else {
      t = 'Fits: ' + used + ' of ' + seats + ' seats used' + (seatedDogs ? ' (' + seatedDogs + ' by ' + (seatedDogs === 1 ? 'a dog' : 'dogs') + ')' : '') + (spare > 0 ? ', ' + spare + ' spare' : ', every seat taken') + '.';
      if (cargoDogs) { t += ' ' + cargoDogs + (cargoDogs === 1 ? ' dog rides' : ' dogs ride') + ' in the cargo bay (' + sea.space.cuft + ' cu ft behind the last row).'; }
      if (bedDogs) { t += ' ' + bedDogs + (bedDogs === 1 ? ' dog rides' : ' dogs ride') + ' in the bed.'; }
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

  /* people (excluding you) -> [{p,row}] in the shared seating order; row 0 = no seat */
  function assignRows(cfg, people, person) {
    var sea = seatEveryone(cfg, { person: person, people: people, dogs: 0 }), out = [], i;
    for (i = 0; i < sea.placed.length; i++) { if (!sea.placed[i].p.you && sea.placed[i].p.kind !== 'dog') { out.push({ p: sea.placed[i].p, row: sea.placed[i].row }); } }
    for (i = 0; i < sea.unseated.length; i++) { if (!sea.unseated[i].you) { out.push({ p: sea.unseated[i], row: 0 }); } }
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

    if (people.length || party.dogs) {
      /* dogs take seats too, so seat them first: the guidance is about the seats people actually get */
      var seaAll = seatEveryone(cfg, party); a = [];
      for (i = 0; i < seaAll.placed.length; i++) { if (!seaAll.placed[i].p.you && seaAll.placed[i].p.kind !== 'dog') { a.push({ p: seaAll.placed[i].p, row: seaAll.placed[i].row }); } }
      for (i = 0; i < seaAll.unseated.length; i++) { if (!seaAll.unseated[i].you) { a.push({ p: seaAll.unseated[i], row: 0 }); } }
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
      for (i = 0; i < seaAll.dogs.length; i++) {
        var dg = seaAll.dogs[i], dwho = 'Your dog' + (seaAll.dogs.length > 1 ? ' ' + (i + 1) : '');
        if (dg.place === 'seat') { o.push('<li class="ok">' + dwho + ' takes a seat' + (dg.row === 1 ? (dg.seat === 2 ? ' — the front bench middle' : ' up front') : ' in the ' + rowLabel(dg.row)) + '.</li>'); }
        else if (dg.place === 'cargo') { o.push('<li class="ok">' + dwho + ' rides in the cargo bay behind the last row (' + seaAll.space.cuft + ' cu ft).</li>'); }
        else if (dg.place === 'bed') { o.push('<li class="ok">' + dwho + ' rides in the bed — no seat left inside.</li>'); }
        else { o.push('<li class="no">' + dwho + ' has nowhere to ride: no seat left and ' + (seaAll.space.kind === 'none' ? 'a trunk is no place for a dog' : (seaAll.space.kind === 'unknown' ? 'the cargo space is not on file' : 'the cargo bay only takes ' + seaAll.space.dogs)) + '.</li>'); }
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
    var sea = seatEveryone(cfg, party), i, tall = { 1: null, 2: null, 3: null }, pl;
    for (i = 0; i < sea.placed.length; i++) {
      pl = sea.placed[i]; if (pl.p.kind === 'dog') { continue; }
      if (tall[pl.row] === null || pl.p.h > tall[pl.row]) { tall[pl.row] = pl.p.h; }
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
    /* cheerful profile: eye + smile on the front of the head (rider faces -x) */
    o.push('<g fill="#fff" opacity="0.9"><circle cx="' + r1(headCx - 0.022 * h) + '" cy="' + Y(headCy + 0.012 * h) + '" r="' + r1(Math.max(0.35, 0.006 * h)) + '"/>' +
      '<path d="M' + r1(headCx - 0.036 * h) + ' ' + Y(headCy - 0.018 * h) + ' Q' + r1(headCx - 0.02 * h) + ' ' + Y(headCy - 0.036 * h) + ' ' + r1(headCx + 0.002 * h) + ' ' + Y(headCy - 0.028 * h) + '" fill="none" stroke="#fff" stroke-width="' + r1(Math.max(0.4, 0.006 * h)) + '" stroke-linecap="round"/></g>');
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
    o.push('<path d="M' + X(-8) + ' ' + YY(22.6) + ' Q' + X(-6.5) + ' ' + YY(21.4) + ' ' + X(-4.6) + ' ' + YY(22.4) + '" fill="none" stroke="#fff" stroke-width="' + r1(0.5 * u) + '" stroke-linecap="round" opacity="0.85"/>');
    o.push('<ellipse cx="' + X(-6.4) + '" cy="' + YY(21.4) + '" rx="' + r1(0.8 * u) + '" ry="' + r1(1.1 * u) + '" fill="#e8848f"/>');
    o.push('</g>');
    return o.join('');
  }
  function renderInterior(e, personIn, metric, opts) {
    opts = opts || {};
    var cfg = e.stock || e;
    var body = buildBody(cfg);
    var L = cfg.length, H0 = cfg.height, rise = e.rise || 0, H = e.height;
    var party = opts.party || {}, people = party.people || [];
    var pal = PAL[opts.role || 'A'] || PAL.A;
    var refL = opts.ref ? Math.max(opts.ref.L, L) : L, refH = opts.ref ? Math.max(opts.ref.H || H, H) : H;   /* shared scale for A/B */
    var rowsN = has(cfg.rows) ? cfg.rows : 2;
    var CAL = 7.5;   /* callout font size: the numbers are the point of this view, so they are big */
    var nSeated = 1 + Math.min((party.people || []).length, has(cfg.seats) ? cfg.seats - 1 : 4);
    var mL = 18, mR = 18, mT = 8 + nSeated * (CAL + 1.2), mB = 18;
    var W = mL + refL + mR, SH = mT + refH + mB;
    function Y(y) { return r1(SH - mB - y); }
    var vx = mL;
    function X(xf) { return r1(vx + xf * L); }
    function YY(yf) { return Y(yf * H0 + rise); }
    function P2(x, yIn) { return [r1(x), Y(yIn)]; }
    var o = [], dx = new Defs((opts.idPrefix || 'vvy') + 'i'), i;
    var nm = (cfg.brand ? cfg.brand + ' ' : '') + (cfg.model || 'vehicle');
    o.push('<svg class="vvy-svg vvy-interior vvy-role-' + (opts.role || 'A') + '" viewBox="0 0 ' + r1(W) + ' ' + r1(SH) + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Inside the ' + esc(nm) + ': the crew seated to scale against the published headroom and legroom">');
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
    var callouts = [];
    var you = { h: personIn, kind: 'adult', you: true };
    var sea = seatEveryone(cfg, { person: personIn, people: people, dogs: party.dogs || 0 }), j;
    var byRow = ridersByRow(sea);
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
        callouts.push({ row: rr, j: j, p: p, fr: fr, hx: rr.hx + j * 3.5, kneeX: kneeX + j * 3.5, crown: rr.cush + hh * SEAT.crown + SEAT.crownPad, kneeY: rr.cush + hh * 0.04, faceX: k > 0 ? R[k - 1].hx + 7 : null });
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

    /* ---- dogs: where the shared seating model put them ---- */
    var nC = Math.min(party.cats || 0, 12), nBed = 0, nCargo = 0, nNone = 0, dg, rowOf;
    var cargoOK = !trunk && !pickup && !wedge && (cargoR - cargoF) > 16 && rows >= 2;
    for (i = 0; i < sea.dogs.length; i++) {
      dg = sea.dogs[i];
      if (dg.place === 'seat') {
        rowOf = null; for (k = 0; k < R.length; k++) { if (R[k].n === dg.row) { rowOf = R[k]; } }
        if (rowOf) { o.push(groundShadow(rowOf.hx - 4, Y(rowOf.cush + 0.5) + 0.4, 9, 0.9, 0.2) + sittingDogSvg(rowOf.hx - 4 + dg.seat * 2, rowOf.cush + 0.5, Y, 20, dx)); }
      } else if (dg.place === 'bed') {
        /* rear of the bed, clearly behind the cab; the near bed wall is drawn over its lower body below */
        var bedY = has(e.bedHeight) ? e.bedHeight : (body.pts[9][1] * H0 + rise - 20);
        var bx = vx + L * 0.955 - 9 - nBed * 15; nBed++;
        o.push(groundShadow(bx - 1, Y(bedY) + 0.6, 12, 1.1, 0.22) + sittingDogSvg(bx, bedY, Y, 22, dx));
      } else if (dg.place === 'cargo' && cargoOK) {
        o.push(groundShadow(Math.min(cargoR - 10, cargoF + 8 + nCargo * 12) - 1, Y(floor) + 0.6, 12, 1.1, 0.2) + sittingDogSvg(Math.min(cargoR - 10, cargoF + 8 + nCargo * 12), floor, Y, 22, dx)); nCargo++;
      } else if (dg.place === 'cargo') {
        o.push(sittingDogSvg(lastR.hx + 14 + nCargo * 10, floor, Y, 20, dx)); nCargo++;
      } else {
        /* nowhere to ride: beside the vehicle, labelled */
        var nxd = vx + L + 8 + nNone * 26; nNone++;
        o.push(groundShadow(nxd - 2, Y(0) + 0.6, 14, 1.2, 0.18) + sittingDogSvg(nxd, 0, Y, 22, dx));
        o.push('<text x="' + r1(nxd) + '" y="' + r1(Y(0) + 6) + '" text-anchor="middle" font-size="3.4" fill="#8a1c14" font-family="' + FONT + '">no room</text>');
      }
    }
    if (nBed) {
      /* near bed side wall in front of the dog: from the bed floor up to the rail, bed front to tailgate */
      var railY = body.pts[9][1] * H0 + rise, bedFloorY = has(e.bedHeight) ? e.bedHeight : railY - 20;
      o.push('<rect x="' + r1(vx + L * body.pts[8][0]) + '" y="' + Y(railY) + '" width="' + r1(L * (0.995 - body.pts[8][0])) + '" height="' + r1(Y(bedFloorY) - Y(railY)) + '" fill="' + pal.body + '" opacity="0.55"/>');
      o.push('<line x1="' + r1(vx + L * body.pts[8][0]) + '" y1="' + Y(railY) + '" x2="' + r1(vx + L * 0.995) + '" y2="' + Y(railY) + '" stroke="' + pal.stroke + '" stroke-width="0.5"/>');
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

    /* ---- measured callouts: THE point of this view. One per seated rider: inches above the head
       to the headliner and inches of knee clearance to the seat ahead (front row: legroom margin),
       colour-coded fine / tight / cramped; "not on file" when the row has no published figure. ---- */
    var lab = [], ci, co, colr, headTxt, kneeTxt, ty, tx;
    function bandColor(bnd) { return bnd === 'cramped' ? '#b3261e' : (bnd === 'tight' ? '#9a6a12' : (bnd === 'unknown' ? '#7b8794' : '#0b5b32')); }
    function sgn(v) { var x = metric ? v * 2.54 : v; return (x >= 0 ? '+' : '\u2212') + (Math.round(Math.abs(x) * 10) / 10); }
    for (ci = 0; ci < callouts.length; ci++) {
      co = callouts[ci]; colr = bandColor(co.fr.band);
      var hlY = has(co.row.head) ? co.row.cush + co.row.head : null;
      /* dimension line: crown -> headliner (or the overshoot when the head is through it) */
      if (hlY !== null) {
        var dxl = co.hx + 0.075 * co.p.h;
        o.push('<line x1="' + r1(dxl) + '" y1="' + Y(co.crown) + '" x2="' + r1(dxl) + '" y2="' + Y(hlY) + '" stroke="' + colr + '" stroke-width="0.6"/>');
        o.push('<line x1="' + r1(dxl - 1.5) + '" y1="' + Y(co.crown) + '" x2="' + r1(dxl + 1.5) + '" y2="' + Y(co.crown) + '" stroke="' + colr + '" stroke-width="0.6"/>');
        o.push('<line x1="' + r1(dxl - 1.5) + '" y1="' + Y(hlY) + '" x2="' + r1(dxl + 1.5) + '" y2="' + Y(hlY) + '" stroke="' + colr + '" stroke-width="0.6"/>');
        headTxt = sgn(co.fr.hs) + ' head';
      } else { headTxt = 'headroom not on file'; }
      /* knee clearance: knee front -> seatback ahead (rows 2/3); front row: legroom margin */
      if (co.fr.ls !== null && co.faceX !== null) {
        o.push('<line x1="' + r1(co.kneeX) + '" y1="' + Y(co.kneeY) + '" x2="' + r1(co.faceX) + '" y2="' + Y(co.kneeY) + '" stroke="' + colr + '" stroke-width="0.6"/>');
        o.push('<line x1="' + r1(co.faceX) + '" y1="' + Y(co.kneeY - 1.5) + '" x2="' + r1(co.faceX) + '" y2="' + Y(co.kneeY + 1.5) + '" stroke="' + colr + '" stroke-width="0.6"/>');
        kneeTxt = sgn(co.fr.ls) + ' knee';
      } else if (co.fr.ls !== null) { kneeTxt = sgn(co.fr.ls) + ' leg'; }
      else { kneeTxt = 'legroom not on file'; }
      /* numbered marker on the rider's head; the numbers are listed in the top margin */
      var mk = P2(co.hx - 0.01 * co.p.h, co.crown + 3.2);
      o.push('<circle cx="' + mk[0] + '" cy="' + mk[1] + '" r="3.2" fill="' + colr + '" stroke="#fff" stroke-width="0.6"/><text x="' + mk[0] + '" y="' + r1(mk[1] + 1.6) + '" text-anchor="middle" font-size="4.4" font-weight="700" fill="#fff" font-family="' + FONT + '">' + (ci + 1) + '</text>');
      var who = co.p.you ? 'You' : (co.p.kind === 'kid' ? 'Kid' : 'Adult'), rowName = co.row.n === 1 ? 'front' : (co.row.n === 2 ? '2nd row' : '3rd row');
      ty = 6 + ci * (CAL + 1.2);
      lab.push('<circle cx="' + r1(mL - 7) + '" cy="' + r1(ty - 2.6) + '" r="3.4" fill="' + colr + '"/><text x="' + r1(mL - 7) + '" y="' + r1(ty - 1) + '" text-anchor="middle" font-size="4.6" font-weight="700" fill="#fff" font-family="' + FONT + '">' + (ci + 1) + '</text>');
      lab.push(haloText(' x="' + r1(mL) + '" y="' + r1(ty) + '" font-size="' + CAL + '" font-weight="700" fill="' + colr + '" font-family="' + FONT + '"', esc(who + ' ' + personLabel(co.p.h, metric) + ', ' + rowName + ': ') + esc(headTxt) + ' \u00b7 ' + esc(kneeTxt), 1.6));
    }
    o.push(lab.join(''));
    o.push('<text x="2" y="' + r1(Y(0) + 6) + '" font-size="3.3" fill="#7b8794" font-family="' + FONT + '">' + (metric ? 'cm' : 'inches') + ' of room above the head and in front of the knee · guidance, not a verdict: seated ≈ 0.52 × standing; published figures are indicative — seat position varies</text>');
    o.push('</g>');
    var bf2 = Math.max(1, Math.min(1.8, W / 380)); o.push(viewBadge(vx + L - 24 * bf2, Y(0) + 11, true, bf2));
    o.push('</svg>');
    o.splice(defsAt, 0, dx.html());
    return o.join('');
  }

  /* ---------------- 45° overhead cabin view ----------------
     Looking down into the cabin from above the hood at roughly 45°: every seat is individually
     visible in its true plan position (rows, seats across), riders sit in their assigned seats.
     HONEST LIMIT: this angle shows SEATING and OCCUPANCY clearly, but vertical headroom cannot be
     read from it — fit is only signalled through the colour states (fine / tight / cramped) and the
     row chips; the numbers live in the profile "peek inside" cutaway.
     opts: { party, ref:{L,W} (shared scale for A/B), role:'A'|'B', idPrefix } */
  var OV = { KY: 0.47, KZ: 0.8, PERSP: 0.28 };
  function seatPlan(cfg) {
    /* seats per row and whether each row is a bench or individual chairs, from seats/rows/cab */
    var rows = has(cfg.rows) ? Math.max(1, Math.min(3, cfg.rows)) : 2, seats = has(cfg.seats) ? cfg.seats : 5;
    var front = (seats >= 6 && rows <= 2 && cfg.bedLen) ? 3 : 2;
    if (rows < 2) { front = Math.min(3, seats); }
    var r2 = rows < 2 ? 0 : (rows >= 3 ? Math.min(3, seats - front - 2) : seats - front);
    if (r2 < 0) { r2 = 0; }
    var r3 = rows >= 3 ? Math.max(0, seats - front - r2) : 0;
    var out = [{ n: 1, seats: front, bench: front === 3 }];
    if (rows >= 2) { out.push({ n: 2, seats: r2, bench: r2 >= 3 }); }
    if (rows >= 3) { out.push({ n: 3, seats: Math.min(3, r3), bench: r3 >= 2 }); }
    return out;
  }
  function renderInside(e, personIn, metric, opts) {
    opts = opts || {};
    var cfg = e.stock || e, role = opts.role || 'A', pal = PAL[role] || PAL.A;
    var body = buildBody(cfg);
    var L = cfg.length, Wd = has(cfg.width) ? cfg.width : Math.max(66, Math.min(84, L * 0.42));
    var ref = opts.ref || { L: L, W: Wd };
    var party = opts.party || {}, people = party.people || [];
    var KY = OV.KY, KZ = OV.KZ;
    var m = 6, mT = 20, mB = 6, mLab = 26;   /* mLab: left column for row labels */
    /* the hood faces the viewer almost square-on, so it is foreshortened harder than the cabin */
    var body0 = body, glz = body0.glass || [[0.3, 0.57], [0.43, 0.95], [0.7, 0.95], [0.83, 0.57]];
    var hoodU = glz[0][0] * L, KYH = 0.26;
    function uy(u) { return u <= hoodU ? u * KYH : hoodU * KYH + (u - hoodU) * KY; }
    var refHood = (opts.ref && opts.ref.hood !== undefined) ? opts.ref.hood : hoodU;
    var W = mLab + ref.W * 1.12 + 2 * m + 22, SH = mT + (refHood * KYH + (ref.L - refHood) * KY) + mB;
    var cx = mLab + m + ref.W * 0.58, y0 = SH - mB;
    var dx = new Defs((opts.idPrefix || 'vvy') + 'o' + role), o = [], i, k, j;
    function sc(u) { return 1 - OV.PERSP * (u / ref.L); }
    /* seen from the hood end of a left-hand-drive car the driver's side is on the RIGHT: v grows leftward */
    function P(u, v, z) { var s = sc(u); return [r1(cx - (v - Wd / 2) * s), r1(y0 - uy(u) - (z || 0) * KZ * s)]; }
    function pts(list) { var a = [], q; for (q = 0; q < list.length; q++) { var p = P(list[q][0], list[q][1], list[q][2]); a.push(p[0] + ',' + p[1]); } return a.join(' '); }
    var nm = (cfg.brand ? cfg.brand + ' ' : '') + (cfg.model || 'vehicle');
    o.push('<svg class="vvy-svg vvy-inside" viewBox="0 0 ' + r1(W) + ' ' + r1(SH) + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Looking down into the ' + esc(nm) + ': who sits where. Headroom is judged in the profile view.">');
    var defsAt = o.length;
    /* ---- layout in inches ---- */
    var t = cfg.template || 'sedan', pickup = /^pickup/.test(t), trunk = (t === 'sedan' || t === 'coupe'), wedge = (t === 'wedge');
    var gl = body.glass || [[0.3, 0.57], [0.43, 0.95], [0.7, 0.95], [0.83, 0.57]];
    var uH = gl[0][0] * L, uW = gl[1][0] * L;
    var uR = pickup ? body.pts[7][0] * L : (trunk ? (gl[3][0] + 0.05) * L : 0.955 * L);
    if (wedge) { uR = 0.64 * L; }
    var plan = seatPlan(cfg), R = [], u1 = uW + 12, prev;
    if (u1 < uH + 22) { u1 = uH + 22; }
    for (k = 0; k < plan.length; k++) {
      var legN = plan[k].n === 1 ? cfg.legroom1 : (plan[k].n === 2 ? cfg.legroom2 : cfg.legroom3);
      var u = k === 0 ? u1 : prev.u + (has(legN) ? legN : (plan[k].n === 2 ? 37 : 32)) - 10.9;
      if (u > uR - 6) { u = uR - 6; }
      /* seat centres across the cabin */
      var vs = [], n = plan[k].seats, inner = Wd - 10, v0 = 5;
      if (n >= 3) { vs = [v0 + inner * 0.18, v0 + inner * 0.82, v0 + inner * 0.5]; }
      else if (n === 2) { vs = [v0 + inner * 0.26, v0 + inner * 0.74]; }
      else if (n === 1) { vs = [v0 + inner * 0.26]; }
      R.push({ n: plan[k].n, u: u, seats: n, bench: plan[k].bench, vs: vs, sw: n >= 3 ? inner / 3 - 1 : 21, riders: [] });
      prev = R[R.length - 1];
    }
    /* ---- assign riders to seats (same row assignment as everywhere else; seat order: driver,
            far side, middle) ---- */
    var you = { h: personIn, kind: 'adult', you: true };
    var sea = seatEveryone(cfg, { person: personIn, people: people, dogs: party.dogs || 0 });
    for (k = 0; k < R.length; k++) { R[k].occ = sea.occ[R[k].n] || []; }
    var noSeat = sea.unseated;
    /* ---- body plan ---- */
    var shadowP = P(L / 2, Wd / 2, 0);
    o.push('<ellipse cx="' + shadowP[0] + '" cy="' + r1(y0 - uy(L) * 0.5 + 4) + '" rx="' + r1(Wd * 0.56) + '" ry="' + r1(uy(L) * 0.52) + '" fill="#1f2933" opacity="0.08"/>');
    /* wheels peeking out at the corners */
    var WB = cfg.wheelbase, fxw, rxw;
    if (has(cfg.frontOverhang) && WB) { fxw = cfg.frontOverhang; rxw = fxw + WB; }
    else if (WB) { var ohw = L - WB; if (ohw < 0) { ohw = L * 0.34; } fxw = ohw * body.foSplit; rxw = fxw + WB; }
    else { fxw = L * 0.175; rxw = L * 0.805; }
    var wl = 26, ww = 9;
    var corners = [[fxw, -3], [fxw, Wd - 6], [rxw, -3], [rxw, Wd - 6]];
    for (i = 0; i < corners.length; i++) {
      o.push('<polygon points="' + pts([[corners[i][0] - wl / 2, corners[i][1]], [corners[i][0] - wl / 2, corners[i][1] + ww], [corners[i][0] + wl / 2, corners[i][1] + ww], [corners[i][0] + wl / 2, corners[i][1]]]) + '" fill="' + pal.wheel + '" rx="2"/>');
    }
    var bodyPts = [[0, 0.12 * Wd], [0, 0.88 * Wd], [0.05 * L, Wd], [0.94 * L, Wd], [L, 0.9 * Wd], [L, 0.1 * Wd], [0.94 * L, 0], [0.05 * L, 0]];
    var bodyFill = 'url(#' + dx.hgrad('bodyo', pal.body, cx - Wd * 0.55, cx + Wd * 0.55) + ')';
    o.push('<g class="vvy-veh vvy-veh-' + role + '">');
    o.push('<polygon points="' + pts(bodyPts) + '" fill="' + bodyFill + '" stroke="' + pal.stroke + '" stroke-width="0.5" stroke-linejoin="round"/>');
    /* rear: trunk deck (sedan/coupe) or pickup bed */
    if (pickup) {
      var bedF = uR + 2;
      o.push('<polygon points="' + pts([[bedF, 4], [bedF, Wd - 4], [L - 3, Wd - 4], [L - 3, 4]]) + '" fill="' + shade(pal.body, -0.5) + '"/>');
      for (i = 1; i < 6; i++) { var bu = bedF + (L - 3 - bedF) * i / 6; o.push('<polyline points="' + pts([[bu, 4], [bu, Wd - 4]]) + '" fill="none" stroke="' + shade(pal.body, -0.62) + '" stroke-width="0.5"/>'); }
    } else if (trunk) {
      o.push('<polygon points="' + pts([[uR, 3], [uR, Wd - 3], [L - 2, Wd - 6], [L - 2, 6]]) + '" fill="' + shade(pal.body, -0.12) + '" opacity="0.8"/>');
      /* rear glass */
      o.push('<polygon points="' + pts([[uR - 8, 8], [uR - 8, Wd - 8], [uR + 4, Wd - 5], [uR + 4, 5]]) + '" fill="' + pal.glass + '" opacity="0.6"/>');
    }
    /* cabin tub: void + side walls */
    var cabF = uH, cabR = uR;
    o.push('<polygon points="' + pts([[cabF, 4], [cabF, Wd - 4], [cabR, Wd - 4], [cabR, 4]]) + '" fill="#f3eee4"/>');
    o.push('<polygon points="' + pts([[cabF, 0], [cabF, 5], [cabR, 5], [cabR, 0]]) + '" fill="' + shade(pal.body, -0.35) + '"/>');
    o.push('<polygon points="' + pts([[cabF, Wd - 5], [cabF, Wd], [cabR, Wd], [cabR, Wd - 5]]) + '" fill="' + shade(pal.body, -0.2) + '"/>');
    if (!pickup && !trunk) { /* cargo floor behind the last row */
      var lastU = R[R.length - 1].u + 10;
      if (cabR - lastU > 8) { o.push('<polygon points="' + pts([[lastU, 5], [lastU, Wd - 5], [cabR, Wd - 5], [cabR, 5]]) + '" fill="#d9d2c6"/>'); }
    }
    /* ---- rows, rear to front ---- */
    var seatCol = '#8b7e72', seatFill = 'url(#' + dx.vgrad('seato', seatCol, 0.22, -0.28) + ')', backFill = 'url(#' + dx.vgrad('backo', seatCol, 0.32, -0.12) + ')';
    var chips = [];
    function riderSvg(p, u, v, fr) {
      var h = p.h, col = p.you ? '#1f2933' : (p.kind === 'kid' ? '#5f7d95' : '#3d4f60');
      if (fr.band === 'tight') { col = '#b7791f'; } else if (fr.band === 'cramped') { col = '#b3261e'; }
      var paint = 'url(#' + dx.hgrad('r' + (dx.n++), col, cx + (v - Wd / 2) * sc(u) - 0.14 * h, cx + (v - Wd / 2) * sc(u) + 0.14 * h) + ')';
      var s = [], sh = 0.37 * h, hw = 0.062 * h * sc(u);
      /* thighs forward from the cushion */
      s.push('<polygon points="' + pts([[u, v - 0.09 * h, 2], [u, v + 0.09 * h, 2], [u - 0.245 * h, v + 0.08 * h, 4], [u - 0.245 * h, v - 0.08 * h, 4]]) + '" fill="' + shade(col, -0.15) + '"/>');
      /* torso */
      s.push('<polygon points="' + pts([[u, v - 0.10 * h, 1], [u, v + 0.10 * h, 1], [u, v + 0.125 * h, sh], [u, v - 0.125 * h, sh]]) + '" fill="' + paint + '"/>');
      /* arms */
      s.push('<polygon points="' + pts([[u, v - 0.125 * h, sh - 0.02 * h], [u, v - 0.16 * h, sh - 0.05 * h], [u - 0.1 * h, v - 0.14 * h, 0.12 * h], [u - 0.1 * h, v - 0.11 * h, 0.12 * h]]) + '" fill="' + shade(col, -0.2) + '"/>');
      s.push('<polygon points="' + pts([[u, v + 0.125 * h, sh - 0.02 * h], [u, v + 0.16 * h, sh - 0.05 * h], [u - 0.1 * h, v + 0.14 * h, 0.12 * h], [u - 0.1 * h, v + 0.11 * h, 0.12 * h]]) + '" fill="' + shade(col, -0.2) + '"/>');
      /* head + face (front-facing, so the smile shows) */
      var hp = P(u, v, 0.45 * h);
      s.push('<circle cx="' + hp[0] + '" cy="' + hp[1] + '" r="' + r1(hw) + '" fill="' + paint + '"/>');
      s.push('<circle cx="' + r1(hp[0] - hw * 0.3) + '" cy="' + r1(hp[1] - hw * 0.35) + '" r="' + r1(hw * 0.28) + '" fill="#fff" opacity="0.2"/>');
      s.push('<g fill="#fff" opacity="0.92"><circle cx="' + r1(hp[0] - hw * 0.32) + '" cy="' + r1(hp[1] - hw * 0.05) + '" r="' + r1(Math.max(0.35, hw * 0.11)) + '"/><circle cx="' + r1(hp[0] + hw * 0.32) + '" cy="' + r1(hp[1] - hw * 0.05) + '" r="' + r1(Math.max(0.35, hw * 0.11)) + '"/>' +
        '<path d="M' + r1(hp[0] - hw * 0.4) + ' ' + r1(hp[1] + hw * 0.3) + ' Q' + hp[0] + ' ' + r1(hp[1] + hw * 0.75) + ' ' + r1(hp[0] + hw * 0.4) + ' ' + r1(hp[1] + hw * 0.3) + '" fill="none" stroke="#fff" stroke-width="' + r1(Math.max(0.4, hw * 0.12)) + '" stroke-linecap="round"/></g>');
      return '<g class="vvy-seated-top' + (p.you ? ' vvy-you' : '') + '">' + s.join('') + '</g>';
    }
    function dogTop(u, v, h) {
      /* sitting dog facing the viewer: body, head with ears, happy face */
      var s = [], b = P(u, v, 0), hp = P(u, v, 0.9 * h), w = 0.55 * h * sc(u), hr = 0.3 * h * sc(u);
      s.push('<ellipse cx="' + b[0] + '" cy="' + r1(b[1] - 0.25 * h * KZ) + '" rx="' + r1(w * 0.6) + '" ry="' + r1(0.45 * h * KZ) + '" fill="url(#' + dx.vgrad('dogo', '#6b4f3a', 0.22, -0.3) + ')"/>');
      s.push('<circle cx="' + hp[0] + '" cy="' + hp[1] + '" r="' + r1(hr) + '" fill="#6b4f3a"/>');
      s.push('<ellipse cx="' + r1(hp[0] - hr * 0.95) + '" cy="' + r1(hp[1] - hr * 0.2) + '" rx="' + r1(hr * 0.32) + '" ry="' + r1(hr * 0.6) + '" fill="#4e3727"/><ellipse cx="' + r1(hp[0] + hr * 0.95) + '" cy="' + r1(hp[1] - hr * 0.2) + '" rx="' + r1(hr * 0.32) + '" ry="' + r1(hr * 0.6) + '" fill="#4e3727"/>');
      s.push('<g fill="#fff" opacity="0.92"><circle cx="' + r1(hp[0] - hr * 0.35) + '" cy="' + r1(hp[1] - hr * 0.15) + '" r="' + r1(Math.max(0.35, hr * 0.12)) + '"/><circle cx="' + r1(hp[0] + hr * 0.35) + '" cy="' + r1(hp[1] - hr * 0.15) + '" r="' + r1(Math.max(0.35, hr * 0.12)) + '"/><circle cx="' + hp[0] + '" cy="' + r1(hp[1] + hr * 0.25) + '" r="' + r1(Math.max(0.4, hr * 0.16)) + '" fill="#1f2933"/>' +
        '<path d="M' + r1(hp[0] - hr * 0.4) + ' ' + r1(hp[1] + hr * 0.45) + ' Q' + hp[0] + ' ' + r1(hp[1] + hr * 0.85) + ' ' + r1(hp[0] + hr * 0.4) + ' ' + r1(hp[1] + hr * 0.45) + '" fill="none" stroke="#fff" stroke-width="' + r1(Math.max(0.4, hr * 0.13)) + '" stroke-linecap="round"/></g>');
      s.push('<ellipse cx="' + hp[0] + '" cy="' + r1(hp[1] + hr * 0.78) + '" rx="' + r1(hr * 0.2) + '" ry="' + r1(hr * 0.3) + '" fill="#e8848f"/>');
      return '<g class="vvy-dog vvy-dog-top">' + s.join('') + '</g>';
    }
    for (k = R.length - 1; k >= 0; k--) {
      var rr = R[k], sw = rr.sw, worst = null;
      /* cushions */
      if (rr.bench) {
        o.push('<polygon points="' + pts([[rr.u - 17, 5], [rr.u - 17, Wd - 5], [rr.u + 3, Wd - 5], [rr.u + 3, 5]]) + '" fill="' + seatFill + '" stroke="' + shade(seatCol, -0.3) + '" stroke-width="0.35"/>');
        for (j = 1; j < rr.seats; j++) { var sv = 5 + (Wd - 10) * j / rr.seats; o.push('<polyline points="' + pts([[rr.u - 17, sv], [rr.u + 3, sv]]) + '" fill="none" stroke="' + shade(seatCol, -0.3) + '" stroke-width="0.35"/>'); }
      } else {
        for (j = 0; j < rr.vs.length; j++) { o.push('<polygon points="' + pts([[rr.u - 17, rr.vs[j] - sw / 2], [rr.u - 17, rr.vs[j] + sw / 2], [rr.u + 3, rr.vs[j] + sw / 2], [rr.u + 3, rr.vs[j] - sw / 2]]) + '" fill="' + seatFill + '" stroke="' + shade(seatCol, -0.3) + '" stroke-width="0.35"/>'); }
      }
      /* backrests (vertical faces) + headrests */
      var segs = rr.bench ? [[5, Wd - 5]] : [], q;
      if (!rr.bench) { for (j = 0; j < rr.vs.length; j++) { segs.push([rr.vs[j] - sw / 2, rr.vs[j] + sw / 2]); } }
      for (q = 0; q < segs.length; q++) {
        o.push('<polygon points="' + pts([[rr.u + 3, segs[q][0], 0], [rr.u + 3, segs[q][1], 0], [rr.u + 6, segs[q][1], 24], [rr.u + 6, segs[q][0], 24]]) + '" fill="' + backFill + '" stroke="' + shade(seatCol, -0.3) + '" stroke-width="0.35"/>');
      }
      for (j = 0; j < rr.vs.length; j++) { o.push('<polygon points="' + pts([[rr.u + 5, rr.vs[j] - 5, 25], [rr.u + 5, rr.vs[j] + 5, 25], [rr.u + 6, rr.vs[j] + 5, 31], [rr.u + 6, rr.vs[j] - 5, 31]]) + '" fill="' + shade(seatCol, -0.1) + '" rx="1"/>'); }
      /* occupants in their seats (seat index = position across the row); dogs on seats too */
      var nRiders = 0;
      for (j = 0; j < rr.occ.length && j < rr.vs.length; j++) {
        var oc = rr.occ[j]; if (!oc) { continue; }
        if (oc.kind === 'dog') { o.push(dogTop(rr.u - 4, rr.vs[j], 20)); continue; }
        nRiders++;
        var fr = rowFit(cfg, rr.n, oc.h);
        var wv = fr.band === 'unknown' ? null : (fr.hs === null ? fr.ls : (fr.ls === null ? fr.hs : Math.min(fr.hs, fr.ls)));
        if (wv !== null && (worst === null || wv < worst)) { worst = wv; }
        o.push(riderSvg(oc, rr.u, rr.vs[j], fr));
      }
      var bandR = worst === null ? (nRiders ? 'unknown' : 'empty') : (worst >= 2.5 ? 'roomy' : (worst >= 0 ? 'ok' : (worst >= -2.5 ? 'tight' : 'cramped')));
      chips.push({ row: rr, band: bandR });
    }
    /* ---- pets ---- */
    var nC = Math.min(party.cats || 0, 12), last = R[R.length - 1], nb = 0, nc2 = 0, nn = 0;
    var cargoOK = !trunk && !wedge && !pickup && (cabR - (last.u + 10)) > 14;
    for (i = 0; i < sea.dogs.length; i++) {
      var dgo = sea.dogs[i];
      if (dgo.place === 'seat') { continue; }   /* drawn with its row above */
      if (dgo.place === 'bed') { o.push(dogTop(L - 24 - nb * 13, Wd * (nb % 2 ? 0.68 : 0.36), 22)); nb++; }
      else if (dgo.place === 'cargo') { o.push(dogTop(Math.min(cabR - 8, last.u + 14 + nc2 * 6), Wd * (nc2 % 2 ? 0.68 : 0.36), 22)); nc2++; }
      else { o.push(dogTop(L * 0.3 + nn * 14, -12, 20)); var nl = P(L * 0.3 + nn * 14, -12, 0); o.push('<text x="' + nl[0] + '" y="' + r1(nl[1] + 5) + '" text-anchor="middle" font-size="4" fill="#8a1c14" font-family="' + FONT + '">no room</text>'); nn++; }
    }
    var emptySeats = [];
    for (k = 0; k < R.length; k++) { for (j = 0; j < R[k].vs.length; j++) { if (!R[k].occ[j]) { emptySeats.push([R[k].u - 6, R[k].vs[j]]); } } }
    for (i = 0; i < nC; i++) {
      var cp = emptySeats.length ? emptySeats[i % emptySeats.length] : [uH + 6, Wd * 0.5];
      var cpp = P(cp[0], cp[1], 2);
      o.push('<g class="vvy-cat vvy-cat-top" pointer-events="none" transform="translate(' + cpp[0] + ' ' + cpp[1] + ') scale(' + r2(0.9 * sc(cp[0])) + ')">' + catSprite(i % 3 === 0 ? '#4a4a52' : (i % 3 === 1 ? '#8a6d4b' : '#b8b2a7'), dx, i % 3) + '</g>');
    }
    /* ---- dash, windshield, hood: nearest, drawn last ---- */
    o.push('<polygon points="' + pts([[cabF, 4, 0], [cabF, Wd - 4, 0], [cabF + 8, Wd - 4, 13], [cabF + 8, 4, 13]]) + '" fill="' + shade(pal.body, -0.55) + '"/>');
    /* steering wheel on the driver side */
    var swp = P(u1 - 12, R[0].vs[0], 16);
    o.push('<ellipse cx="' + swp[0] + '" cy="' + swp[1] + '" rx="' + r1(7.5 * sc(u1)) + '" ry="' + r1(4 * sc(u1)) + '" fill="none" stroke="' + shade(pal.body, -0.65) + '" stroke-width="1.4"/>');
    /* windshield: cut away like the roof, left as a faint pane so the front row stays readable */
    o.push('<polygon points="' + pts([[uH, 3, 0], [uH, Wd - 3, 0], [uW, Wd - 6, 26], [uW, 6, 26]]) + '" fill="url(#' + dx.vgrad('glasso', pal.glass, 0.35, -0.05, 0.1) + ')" opacity="0.18" stroke="' + pal.stroke + '" stroke-width="0.4" stroke-opacity="0.5"/>');
    o.push('<polygon points="' + pts([[0, 0.12 * Wd], [0, 0.88 * Wd], [0.05 * L, Wd], [uH, Wd], [uH, 0], [0.05 * L, 0]]) + '" fill="' + bodyFill + '" stroke="' + pal.stroke + '" stroke-width="0.45" stroke-linejoin="round"/>');
    o.push('<polyline points="' + pts([[uH * 0.35, 0.16 * Wd], [uH * 0.35, 0.84 * Wd]]) + '" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.22"/>');
    o.push('</g>');
    /* riders without a seat: beside the vehicle */
    for (i = 0; i < noSeat.length; i++) {
      var ns = P(L * 0.5 + i * 12, Wd + 14, 0);
      o.push('<g transform="translate(' + ns[0] + ' ' + ns[1] + ')">' + personSvg(noSeat[i].h * 0.35, 0, function (yy) { return r1(-yy); }, '#9aa5b1', 'vvy-fam vvy-noseat', dx) + '</g>');
      o.push('<text x="' + ns[0] + '" y="' + r1(ns[1] + 6) + '" text-anchor="middle" font-size="4" fill="#8a1c14" font-family="' + FONT + '">no seat</text>');
    }
    /* ---- row labels (left) + fit chips (right) ---- */
    for (k = 0; k < chips.length; k++) {
      var ch = chips[k], rl = ch.row, lp = P(rl.u - 6, Wd, 0), rp = P(rl.u - 6, 0, 0);
      var name = rl.n === 1 ? 'Front' : (rl.n === 2 ? '2nd row' : '3rd row');
      var kind = rl.seats === 0 ? 'no seats' : (rl.bench ? 'bench · ' + rl.seats : (rl.seats === 1 ? '1 seat' : (rl.n === 1 ? '2 buckets' : (rl.seats === 2 ? "2 captain's chairs" : rl.seats + ' seats'))));
      o.push(haloText(' x="' + r1(lp[0] - 3) + '" y="' + r1(lp[1]) + '" text-anchor="end" font-size="5" font-weight="700" fill="#1f2933" font-family="' + FONT + '"', esc(name), 1.4));
      o.push(haloText(' x="' + r1(lp[0] - 3) + '" y="' + r1(lp[1] + 5.5) + '" text-anchor="end" font-size="4" fill="#52606d" font-family="' + FONT + '"', esc(kind), 1.2));
      var ctext = ch.band === 'empty' ? 'empty' : (ch.band === 'unknown' ? 'room n/a' : (ch.band === 'cramped' ? 'cramped' : (ch.band === 'tight' ? 'tight' : 'fine')));
      var ccol = ch.band === 'cramped' ? '#b3261e' : (ch.band === 'tight' ? '#9a6a12' : (ch.band === 'empty' || ch.band === 'unknown' ? '#7b8794' : '#0b5b32'));
      o.push(haloText(' x="' + r1(rp[0] + 3) + '" y="' + r1(rp[1] + 1) + '" font-size="5" font-weight="700" fill="' + ccol + '" font-family="' + FONT + '"', esc(ctext), 1.4));
    }
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
    renderInside: renderInside,
    rowFit: rowFit,
    partyRows: partyRows,
    seatEveryone: seatEveryone,
    seatLayout: seatLayout,
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
