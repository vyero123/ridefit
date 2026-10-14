// instruments.js — the gauge cluster.
//
// The tachometer and speedometer are the familiar part. The one that earns
// its place in a coordination trainer is the slip bar: engine speed against
// the speed the wheels are asking for. Every clutch skill in the app is
// visible in that one gap — finding the bite is watching it start to close,
// a launch is closing it smoothly, rev matching is closing it before the
// clutch has to.

import { CAR } from './car.js';

const NS = 'http://www.w3.org/2000/svg';

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arcPath(cx, cy, r, d1, d2) {
  const [x1, y1] = polar(cx, cy, r, d1);
  const [x2, y2] = polar(cx, cy, r, d2);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${Math.abs(d2 - d1) > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

const T = { cx: 78, cy: 98, r: 70, start: -124, sweep: 248 };
const rpmToDeg = (rpm) => T.start + Math.max(0, Math.min(1, rpm / CAR.maxRpm)) * T.sweep;

// Slip bar geometry, in the cluster's own coordinates.
const S = { x: 166, y: 150, w: 134, h: 16, max: 2600 };

export class Cluster {
  constructor(host) {
    this.host = host;
    this.window = null;
    this._build();
  }

  _build() {
    const svg = el('svg', {
      viewBox: '0 0 304 206', class: 'cluster-svg',
      role: 'img', 'aria-label': 'Tachometer, speedometer, gear and clutch slip',
    });
    this.svg = svg;
    const { cx, cy, r } = T;

    svg.appendChild(el('rect', { x: 0, y: 0, width: 304, height: 206, rx: 11, fill: 'var(--panel)' }));
    svg.appendChild(el('circle', { cx, cy, r: r + 10, fill: 'var(--dial)', stroke: 'var(--hairline)' }));

    svg.appendChild(el('path', {
      d: arcPath(cx, cy, r - 5, rpmToDeg(0), rpmToDeg(CAR.lugBand[1])),
      stroke: 'var(--lug)', 'stroke-width': 9, fill: 'none', opacity: 0.5,
    }));
    this.windowBand = el('path', { stroke: 'var(--go)', 'stroke-width': 9, fill: 'none', opacity: 0.9 });
    svg.appendChild(this.windowBand);
    svg.appendChild(el('path', {
      d: arcPath(cx, cy, r - 5, rpmToDeg(CAR.redlineRpm), rpmToDeg(CAR.maxRpm)),
      stroke: 'var(--danger)', 'stroke-width': 9, fill: 'none',
    }));
    svg.appendChild(el('path', {
      d: arcPath(cx, cy, r, rpmToDeg(0), rpmToDeg(CAR.maxRpm)),
      stroke: 'var(--hairline)', 'stroke-width': 1.5, fill: 'none',
    }));

    for (let k = 0; k <= 7; k++) {
      const d = rpmToDeg(k * 1000);
      const [x1, y1] = polar(cx, cy, r, d);
      const [x2, y2] = polar(cx, cy, r - 11, d);
      svg.appendChild(el('line', { x1, y1, x2, y2, stroke: 'var(--ink)', 'stroke-width': 2 }));
      const [tx, ty] = polar(cx, cy, r - 25, d);
      svg.appendChild(el('text', { x: tx, y: ty + 4.5, 'text-anchor': 'middle', class: 'tick-num' }, String(k)));
      if (k < 7) {
        const dh = rpmToDeg(k * 1000 + 500);
        const [hx1, hy1] = polar(cx, cy, r, dh);
        const [hx2, hy2] = polar(cx, cy, r - 6, dh);
        svg.appendChild(el('line', { x1: hx1, y1: hy1, x2: hx2, y2: hy2, stroke: 'var(--hairline)', 'stroke-width': 1.5 }));
      }
    }

    // A ghost needle showing what the wheels are asking for. When the clutch
    // is doing its job the two needles come together.
    this.wheelNeedle = el('g', {});
    this.wheelNeedle.appendChild(el('line', {
      x1: 0, y1: 0, x2: 0, y2: -(r - 4), stroke: 'var(--wheel)',
      'stroke-width': 2, 'stroke-dasharray': '4 3', 'stroke-linecap': 'round',
    }));
    svg.appendChild(this.wheelNeedle);

    this.rpmText = el('text', { x: cx, y: cy + 30, 'text-anchor': 'middle', class: 'rpm-digits' }, '800');
    svg.appendChild(this.rpmText);
    this.rpmLabel = el('text', { x: cx, y: cy + 44, 'text-anchor': 'middle', class: 'dial-sub' }, 'rpm');
    svg.appendChild(this.rpmLabel);

    this.needle = el('g', {});
    this.needle.appendChild(el('line', { x1: 0, y1: 9, x2: 0, y2: -(r - 2), stroke: 'var(--needle)', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
    svg.appendChild(this.needle);
    svg.appendChild(el('circle', { cx, cy, r: 4.5, fill: 'var(--needle)' }));

    // --- Speed and gear ---
    svg.appendChild(el('text', { x: 166, y: 26, class: 'panel-label' }, 'SPEED'));
    this.speedText = el('text', { x: 166, y: 60, class: 'speed-digits' }, '0');
    svg.appendChild(this.speedText);
    svg.appendChild(el('text', { x: 166, y: 76, class: 'dial-unit-l' }, 'km/h'));

    svg.appendChild(el('text', { x: 262, y: 26, class: 'panel-label' }, 'GEAR'));
    this.gearText = el('text', { x: 262, y: 62, class: 'gear-digits' }, 'N');
    svg.appendChild(this.gearText);

    // --- Slip bar ---
    svg.appendChild(el('text', { x: S.x, y: 112, class: 'panel-label' }, 'ENGINE vs WHEELS'));
    svg.appendChild(el('rect', { x: S.x, y: S.y - 26, width: S.w, height: 20, fill: 'none' }));
    this.slipText = el('text', { x: S.x, y: 140, class: 'slip-digits' }, 'in neutral');
    svg.appendChild(this.slipText);

    svg.appendChild(el('rect', { x: S.x, y: S.y, width: S.w, height: S.h, rx: 4, fill: 'var(--dial)', stroke: 'var(--hairline)' }));
    const mid = S.x + S.w / 2;
    svg.appendChild(el('rect', { x: mid - 9, y: S.y + 1, width: 18, height: S.h - 2, fill: 'var(--go)', opacity: 0.22 }));
    svg.appendChild(el('line', { x1: mid, y1: S.y, x2: mid, y2: S.y + S.h, stroke: 'var(--go)', 'stroke-width': 1.5 }));
    this.slipMark = el('rect', { x: mid - 2, y: S.y - 3, width: 4, height: S.h + 6, rx: 2, fill: 'var(--needle)' });
    svg.appendChild(this.slipMark);
    svg.appendChild(el('text', { x: S.x, y: S.y + S.h + 11, class: 'slip-end' }, 'wheels faster'));
    svg.appendChild(el('text', { x: S.x + S.w, y: S.y + S.h + 11, 'text-anchor': 'end', class: 'slip-end' }, 'engine faster'));

    // --- Clutch heat ---
    svg.appendChild(el('text', { x: 6, y: 194, class: 'panel-label' }, 'CLUTCH HEAT'));
    svg.appendChild(el('rect', { x: 74, y: 186, width: 224, height: 7, rx: 3.5, fill: 'var(--dial)', stroke: 'var(--hairline)' }));
    this.heatFill = el('rect', { x: 75, y: 187, width: 0, height: 5, rx: 2.5, fill: 'var(--go)' });
    svg.appendChild(this.heatFill);

    this.host.appendChild(svg);
  }

  setWindow(band) {
    this.window = band;
    if (!band) { this.windowBand.setAttribute('d', ''); return; }
    this.windowBand.setAttribute('d', arcPath(T.cx, T.cy, T.r - 5, rpmToDeg(band[0]), rpmToDeg(band[1])));
  }

  update(sim) {
    const { cx, cy } = T;
    const rpm = sim.stalled ? 0 : sim.rpm;
    this.needle.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rpmToDeg(rpm).toFixed(2)})`);

    const wheelRpm = sim.inGear ? Math.abs(sim.drivenRpm) : null;
    if (wheelRpm == null) this.wheelNeedle.setAttribute('opacity', '0');
    else {
      this.wheelNeedle.setAttribute('opacity', '1');
      this.wheelNeedle.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rpmToDeg(wheelRpm).toFixed(2)})`);
    }

    this.rpmText.textContent = sim.stalled ? '—' : String(Math.round(rpm / 10) * 10);
    let label = 'rpm';
    if (sim.stalled) label = 'STALLED';
    else if (rpm > CAR.mechanicalLimitRpm) label = 'DAMAGE';
    else if (rpm > CAR.redlineRpm) label = 'over-rev';
    else if (sim.inGear && sim.engagement > 0.9 && Math.abs(sim.slipRpm) < 60 && rpm < CAR.lugBand[0]) label = 'lugging';
    else if (rpm < CAR.idleRpm + 110) label = 'idle';
    this.rpmLabel.textContent = label;
    this.rpmLabel.setAttribute('class', 'dial-sub'
      + (rpm > CAR.redlineRpm || sim.stalled ? ' is-danger' : (label === 'lugging' ? ' is-warn' : '')));

    this.speedText.textContent = String(Math.round(Math.abs(sim.kph)));
    this.gearText.textContent = sim.gear === 0 ? 'N' : (sim.gear === -1 ? 'R' : String(sim.gear));

    const mid = S.x + S.w / 2;
    if (!sim.inGear) {
      this.slipText.textContent = 'in neutral';
      this.slipText.setAttribute('class', 'slip-digits');
      this.slipMark.setAttribute('x', mid - 2);
      this.slipMark.setAttribute('opacity', '0.25');
    } else {
      const slip = sim.stalled ? 0 : sim.slipRpm;
      const frac = Math.max(-1, Math.min(1, slip / S.max));
      this.slipMark.setAttribute('x', (mid + frac * (S.w / 2 - 3) - 2).toFixed(1));
      this.slipMark.setAttribute('opacity', '1');
      const a = Math.abs(Math.round(slip));
      const matched = a < CAR.revMatchTolerance;
      this.slipText.textContent = matched ? 'matched' : `${a.toLocaleString('en-GB')} rpm apart`;
      this.slipText.setAttribute('class', 'slip-digits' + (matched ? ' is-good' : (a > 1200 ? ' is-warn' : '')));
    }

    const heat = Math.max(0, Math.min(1, sim.clutchHeat));
    this.heatFill.setAttribute('width', (heat * 222).toFixed(1));
    this.heatFill.setAttribute('fill', heat > 0.65 ? 'var(--danger)' : heat > 0.3 ? 'var(--bite)' : 'var(--go)');
  }
}
