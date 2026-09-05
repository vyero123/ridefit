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

  function r1(n) { return Math.round(n * 10) / 10; }
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
  function dim(inches, metric) {
    if (inches === null || inches === undefined || isNaN(inches)) { return null; }
    if (metric) { return r1(inches * 2.54) + ' cm'; }
    return r1(inches) + ' in (' + ftin(inches) + ')';
  }
  function shortDim(inches, metric) {
    if (metric) { return r1(inches * 2.54) + ' cm'; }
    return r1(inches) + ' in';
  }
  function mass(lb, metric) {
    if (lb === null || lb === undefined || isNaN(lb)) { return null; }
    if (metric) { return comma(lb * 0.45359237) + ' kg'; }
    return comma(lb) + ' lb';
  }
  function personLabel(inches, metric) {
    if (metric) { return r0(inches * 2.54) + ' cm'; }
    var t = Math.round(inches);
    return Math.floor(t / 12) + "' " + (t % 12) + '"';
  }
  function isApprox(cfg, field) {
    return !!(cfg.approx && cfg.approx.length && indexOf(cfg.approx, field) >= 0);
  }
  function indexOf(arr, v) {
    var i; for (i = 0; i < arr.length; i++) { if (arr[i] === v) { return i; } } return -1;
  }

  /* ---------------- body templates ---------------- */

  function P(x, y) { return [x, y]; }

  function buildBody(cfg) {
    var H = cfg.height, L = cfg.length;
    var clr = (cfg.clearance !== null && cfg.clearance !== undefined) ? cfg.clearance : H * 0.115;
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

  function personSvg(h, cx, Y) {
    var o = [];
    o.push('<g class="vvy-person" fill="#1f2933">');
    o.push('<ellipse cx="' + r1(cx) + '" cy="' + r1(Y(0.9345 * h)) + '" rx="' + r1(0.0435 * h) + '" ry="' + r1(0.0655 * h) + '"/>');
    o.push('<polygon points="' + polyPts(TORSO, h, cx, Y, false) + '"/>');
    o.push('<polygon points="' + polyPts(ARM, h, cx, Y, false) + '"/>');
    o.push('<polygon points="' + polyPts(ARM, h, cx, Y, true) + '"/>');
    o.push('<polygon points="' + polyPts(LEG, h, cx, Y, false) + '"/>');
    o.push('<polygon points="' + polyPts(LEG, h, cx, Y, true) + '"/>');
    o.push('</g>');
    return o.join('');
  }

  /* ---------------- scene ---------------- */

  function renderScene(cfg, personIn, metric) {
    var body = buildBody(cfg);
    var L = cfg.length, H = cfg.height;
    var pw = personIn * 0.31;
    var gap = 16;
    var mL = 30, mR = 34, mT = 13, mB = 15;
    var topH = Math.max(H, personIn);
    var W = mL + pw + gap + L + mR;
    var SH = mT + topH + mB;
    function Y(y) { return r1(SH - mB - y); }
    var px = mL + pw / 2;
    var vx = mL + pw + gap;
    function X(xf) { return r1(vx + xf * L); }

    var o = [];
    o.push('<svg class="vvy-svg" viewBox="0 0 ' + r1(W) + ' ' + r1(SH) + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scaled comparison of a person against a ' + esc(cfg.fullName || 'vehicle') + '">');

    /* ground */
    o.push('<line x1="0" y1="' + Y(0) + '" x2="' + r1(W) + '" y2="' + Y(0) + '" stroke="#9aa5b1" stroke-width="0.6"/>');
    o.push('<rect x="0" y="' + Y(0) + '" width="' + r1(W) + '" height="' + r1(mB) + '" fill="#e4e7eb" opacity="0.55"/>');

    /* 12-inch reference grid */
    var g, gy;
    for (g = 12; g <= topH; g += 12) {
      gy = Y(g);
      o.push('<line x1="0" y1="' + gy + '" x2="' + r1(W) + '" y2="' + gy + '" stroke="#cbd2d9" stroke-width="0.22" stroke-dasharray="1.6 2.4"/>');
    }

    /* vehicle body */
    var d = [], i;
    for (i = 0; i < body.pts.length; i++) {
      d.push((i === 0 ? 'M' : 'L') + X(body.pts[i][0]) + ' ' + Y(body.pts[i][1] * H));
    }
    d.push('L' + X(0.93) + ' ' + Y(body.gc * H));
    d.push('L' + X(0.07) + ' ' + Y(body.gc * H));
    d.push('Z');
    o.push('<path class="vvy-body" d="' + d.join(' ') + '" fill="#4b6a88" stroke="#2c3e50" stroke-width="0.45" stroke-linejoin="round"/>');

    if (body.glass) {
      var gp = [];
      for (i = 0; i < body.glass.length; i++) {
        gp.push(X(body.glass[i][0]) + ',' + Y(body.glass[i][1] * H));
      }
      o.push('<polygon points="' + gp.join(' ') + '" fill="#9fb6c9" opacity="0.75"/>');
    }

    /* wheels */
    var wr = body.wheelR * H;
    var WB = cfg.wheelbase;
    var fx, rx;
    if (WB) {
      var oh = L - WB;
      if (oh < 0) { oh = L * 0.34; }
      fx = vx + oh * body.foSplit;
      rx = fx + WB;
    } else {
      fx = vx + L * 0.175; rx = vx + L * 0.805;
    }
    var wy = Y(wr);
    o.push('<g class="vvy-wheels">');
    o.push('<circle cx="' + r1(fx) + '" cy="' + wy + '" r="' + r1(wr) + '" fill="#20272e"/>');
    o.push('<circle cx="' + r1(fx) + '" cy="' + wy + '" r="' + r1(wr * 0.5) + '" fill="#98a3ae"/>');
    o.push('<circle cx="' + r1(rx) + '" cy="' + wy + '" r="' + r1(wr) + '" fill="#20272e"/>');
    o.push('<circle cx="' + r1(rx) + '" cy="' + wy + '" r="' + r1(wr * 0.5) + '" fill="#98a3ae"/>');
    o.push('</g>');

    /* feature guide lines */
    function guide(yIn, label, color) {
      o.push('<line x1="' + r1(mL * 0.35) + '" y1="' + Y(yIn) + '" x2="' + r1(W - mR * 0.55) + '" y2="' + Y(yIn) + '" stroke="' + color + '" stroke-width="0.45" stroke-dasharray="3 2"/>');
      o.push('<text x="' + r1(W - mR * 0.45) + '" y="' + r1(Y(yIn) + 1.3) + '" font-size="4" fill="' + color + '" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">' + esc(label) + '</text>');
    }
    guide(H, shortDim(H, metric) + ' roof', '#b44d12');
    if (cfg.hoodHeight) { guide(cfg.hoodHeight, shortDim(cfg.hoodHeight, metric) + ' hood', '#7b5ea7'); }
    if (cfg.bedHeight) { guide(cfg.bedHeight, shortDim(cfg.bedHeight, metric) + ' bed floor', '#0b7285'); }

    /* person */
    o.push(personSvg(personIn, px, Y));

    /* person height bracket */
    var bx = r1(mL * 0.30);
    o.push('<line x1="' + bx + '" y1="' + Y(0) + '" x2="' + bx + '" y2="' + Y(personIn) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<line x1="' + r1(mL * 0.30 - 2) + '" y1="' + Y(personIn) + '" x2="' + r1(mL * 0.30 + 2) + '" y2="' + Y(personIn) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<line x1="' + r1(mL * 0.30 - 2) + '" y1="' + Y(0) + '" x2="' + r1(mL * 0.30 + 2) + '" y2="' + Y(0) + '" stroke="#1f2933" stroke-width="0.5"/>');
    o.push('<text x="' + r1(mL * 0.30 + 3) + '" y="' + r1(Y(personIn) - 2.2) + '" font-size="4.4" fill="#1f2933" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif">You &#183; ' + esc(personLabel(personIn, metric)) + '</text>');

    o.push('</svg>');
    return o.join('');
  }

  /* ---------------- specs + comparisons ---------------- */

  function row(label, value, note) {
    if (value === null) { return ''; }
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
    if (cfg.bedHeight) { o.push(row('Bed floor height', dim(cfg.bedHeight, metric), isApprox(cfg, 'bedHeight') ? a : '')); }
    if (cfg.hoodHeight) { o.push(row('Hood height', dim(cfg.hoodHeight, metric), isApprox(cfg, 'hoodHeight') ? a : '')); }
    if (cfg.bedLen) { o.push(row('Bed length', dim(cfg.bedLen, metric), isApprox(cfg, 'bedLen') ? a : '')); }
    if (cfg.tire) { o.push(row('Tire size', cfg.tire, '')); }
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
    o.push('<li>' + esc(phrase('The roof', cfg.height, h, metric)) + '</li>');
    if (cfg.hoodHeight) { o.push('<li>' + esc(phrase('The top of the hood', cfg.hoodHeight, h, metric)) + '</li>'); }
    if (cfg.bedHeight) { o.push('<li>' + esc(phrase('The bed floor', cfg.bedHeight, h, metric)) + '</li>'); }
    if (cfg.clearance) {
      o.push('<li>' + esc('The lowest point of the body is ' + shortDim(cfg.clearance, metric) + ' off the ground — ' + nearest(cfg.clearance, h).lm.n + ' on you.') + '</li>');
    }
    if (cfg.length) {
      o.push('<li>' + esc('Laid on its nose it would stand ' + r1(cfg.length / h) + '× your height.') + '</li>');
    }
    if (!cfg.hoodHeight) {
      o.push('<li class="vvy-missing">No published hood height for this configuration — omitted rather than estimated.</li>');
    }
    o.push('</ul>');
    return o.join('');
  }

  function sourceHtml(cfg) {
    if (!cfg.src) { return ''; }
    return '<p class="vvy-src">Dimensions: ' + esc(cfg.src) + '</p>';
  }

  function renderAll(cfg, personIn, metric) {
    return {
      svg: renderScene(cfg, personIn, metric),
      specs: specsHtml(cfg, metric),
      comps: compsHtml(cfg, personIn, metric),
      src: sourceHtml(cfg)
    };
  }

  return {
    renderScene: renderScene,
    specsHtml: specsHtml,
    compsHtml: compsHtml,
    sourceHtml: sourceHtml,
    renderAll: renderAll,
    personLabel: personLabel,
    LANDMARKS: LANDMARKS
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = VVY; }
