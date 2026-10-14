// instruments.js — the gauges.
//
// Built once as SVG, then updated by moving a needle and rewriting a few
// text nodes. The design brief is legibility at a glance, because glancing
// is the skill being trained.

import { CAR, CLUTCH, clutchEngagement } from './car.js';

const NS = 'http://www.w3.org/2000/svg';

/** deg 0 is twelve o'clock, increasing clockwise. */
function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arcPath(cx, cy, r, d1, d2) {
  const [x1, y1] = polar(cx, cy, r, d1);
  const [x2, y2] = polar(cx, cy, r, d2);
  const large = Math.abs(d2 - d1) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

const TACHO = { cx: 86, cy: 88, r: 70, start: -124, sweep: 248 };

function rpmToDeg(rpm) {
  const f = Math.max(0, Math.min(1, rpm / CAR.maxRpm));
  return TACHO.start + f * TACHO.sweep;
}

export class Cluster {
  /**
   * @param {HTMLElement} host
   */
  constructor(host) {
    this.host = host;
    this.window = CAR.upshiftNormal;
    this._build();
  }

  _build() {
    const svg = el('svg', {
      viewBox: '0 0 344 176', class: 'cluster-svg',
      role: 'img', 'aria-label': 'Tachometer, speedometer, gear and clutch position',
    });
    this.svg = svg;
    const { cx, cy, r } = TACHO;

    svg.appendChild(el('rect', { x: 0, y: 0, width: 344, height: 176, rx: 10, fill: 'var(--panel)' }));

    // --- Tachometer ---
    svg.appendChild(el('circle', { cx, cy, r: r + 10, fill: 'var(--dial)', stroke: 'var(--hairline)', 'stroke-width': 1 }));

    // Lugging zone, drawn as a dim band rather than a warning: it is where
    // the engine is unhappy, not where it is broken.
    svg.appendChild(el('path', {
      d: arcPath(cx, cy, r - 5, rpmToDeg(0), rpmToDeg(CAR.lugBand[1])),
      stroke: 'var(--lug)', 'stroke-width': 9, fill: 'none', opacity: 0.55,
    }));

    // Shift window, repositioned per drill.
    this.windowBand = el('path', { stroke: 'var(--go)', 'stroke-width': 9, fill: 'none', opacity: 0.9 });
    svg.appendChild(this.windowBand);

    // Redline.
    svg.appendChild(el('path', {
      d: arcPath(cx, cy, r - 5, rpmToDeg(CAR.redlineRpm), rpmToDeg(CAR.maxRpm)),
      stroke: 'var(--danger)', 'stroke-width': 9, fill: 'none',
    }));

    // Outer scale line.
    svg.appendChild(el('path', {
      d: arcPath(cx, cy, r, rpmToDeg(0), rpmToDeg(CAR.maxRpm)),
      stroke: 'var(--hairline)', 'stroke-width': 1.5, fill: 'none',
    }));

    // Ticks and numerals.
    for (let k = 0; k <= 7; k++) {
      const rpm = k * 1000;
      if (rpm > CAR.maxRpm) break;
      const d = rpmToDeg(rpm);
      const [x1, y1] = polar(cx, cy, r, d);
      const [x2, y2] = polar(cx, cy, r - 11, d);
      svg.appendChild(el('line', { x1, y1, x2, y2, stroke: 'var(--ink)', 'stroke-width': 2 }));
      const [tx, ty] = polar(cx, cy, r - 26, d);
      svg.appendChild(el('text', {
        x: tx, y: ty + 5, 'text-anchor': 'middle', class: 'tick-num',
      }, String(k)));
      if (k < 7) {
        const dh = rpmToDeg(rpm + 500);
        const [hx1, hy1] = polar(cx, cy, r, dh);
        const [hx2, hy2] = polar(cx, cy, r - 6, dh);
        svg.appendChild(el('line', { x1: hx1, y1: hy1, x2: hx2, y2: hy2, stroke: 'var(--hairline)', 'stroke-width': 1.5 }));
      }
    }
    svg.appendChild(el('text', { x: cx, y: cy + 46, 'text-anchor': 'middle', class: 'dial-unit' }, 'rpm x1000'));

    // Live digital rpm inside the dial.
    this.rpmText = el('text', { x: cx, y: cy + 10, 'text-anchor': 'middle', class: 'rpm-digits' }, '800');
    svg.appendChild(this.rpmText);
    this.rpmLabel = el('text', { x: cx, y: cy + 26, 'text-anchor': 'middle', class: 'dial-sub' }, 'idle');
    svg.appendChild(this.rpmLabel);

    // Needle last, on top.
    this.needle = el('g', {});
    this.needle.appendChild(el('line', { x1: 0, y1: 10, x2: 0, y2: -(r - 2), stroke: 'var(--needle)', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
    svg.appendChild(this.needle);
    svg.appendChild(el('circle', { cx, cy, r: 5, fill: 'var(--needle)' }));
    svg.appendChild(el('circle', { cx, cy, r: 2, fill: 'var(--dial)' }));

    // --- Speed ---
    svg.appendChild(el('text', { x: 180, y: 34, class: 'panel-label' }, 'SPEED'));
    this.speedText = el('text', { x: 180, y: 76, class: 'speed-digits' }, '0');
    svg.appendChild(this.speedText);
    svg.appendChild(el('text', { x: 180, y: 94, class: 'dial-unit-l' }, 'km/h'));

    // --- Gear ---
    svg.appendChild(el('text', { x: 180, y: 122, class: 'panel-label' }, 'GEAR'));
    this.gearText = el('text', { x: 180, y: 160, class: 'gear-digits' }, 'N');
    svg.appendChild(this.gearText);
    this.gearHint = el('text', { x: 212, y: 160, class: 'dial-sub-l' }, '');
    svg.appendChild(this.gearHint);

    // --- Clutch position gauge ---
    const gx = 286, gy = 26, gw = 40, gh = 126;
    svg.appendChild(el('text', { x: gx, y: 18, class: 'panel-label' }, 'CLUTCH'));
    svg.appendChild(el('rect', { x: gx, y: gy, width: gw, height: gh, rx: 5, fill: 'var(--dial)', stroke: 'var(--hairline)' }));
    const zone = (a, b, fill, op) => el('rect', {
      x: gx + 1, y: gy + a * gh, width: gw - 2, height: (b - a) * gh, fill, opacity: op,
    });
    svg.appendChild(zone(0, CLUTCH.biteStart, 'var(--free)', 0.5));
    svg.appendChild(zone(CLUTCH.biteStart, CLUTCH.biteEnd, 'var(--bite)', 0.75));
    svg.appendChild(zone(CLUTCH.biteEnd, 1, 'var(--clear)', 0.45));
    svg.appendChild(el('text', { x: gx + gw / 2, y: gy + 13, 'text-anchor': 'middle', class: 'zone-tag' }, 'UP'));
    svg.appendChild(el('text', { x: gx + gw / 2, y: gy + (CLUTCH.biteStart + CLUTCH.biteEnd) / 2 * gh + 4, 'text-anchor': 'middle', class: 'zone-tag' }, 'BITE'));
    svg.appendChild(el('text', { x: gx + gw / 2, y: gy + gh - 7, 'text-anchor': 'middle', class: 'zone-tag' }, 'FLOOR'));
    this.clutchMark = el('rect', { x: gx - 4, y: gy - 1.5, width: gw + 8, height: 3, rx: 1.5, fill: 'var(--needle)' });
    svg.appendChild(this.clutchMark);
    this._cg = { gx, gy, gw, gh };

    this.host.appendChild(svg);

    // Hold timer, in HTML so it can use real type.
    this.holdEl = document.createElement('div');
    this.holdEl.className = 'hold-readout';
    this.holdEl.innerHTML = '<span class="hold-time">—</span><span class="hold-label">pedal down</span>';
    this.host.appendChild(this.holdEl);
    this.holdTime = this.holdEl.querySelector('.hold-time');

    this.setWindow(CAR.upshiftNormal);
  }

  setWindow(band) {
    this.window = band;
    const { cx, cy, r } = TACHO;
    if (!band) { this.windowBand.setAttribute('d', ''); return; }
    this.windowBand.setAttribute('d', arcPath(cx, cy, r - 5, rpmToDeg(band[0]), rpmToDeg(band[1])));
  }

  update(sim, extra = {}) {
    const rpm = sim.stalled ? 0 : sim.rpm;
    const { cx, cy } = TACHO;
    // The needle line is authored about the origin, pointing up, so move it
    // to the dial centre first and then rotate.
    this.needle.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rpmToDeg(rpm).toFixed(2)})`);

    this.rpmText.textContent = sim.stalled ? '—' : String(Math.round(rpm / 10) * 10);
    let label = '';
    if (sim.stalled) label = 'stalled';
    else if (rpm > CAR.mechanicalLimitRpm) label = 'DAMAGE';
    else if (rpm > CAR.redlineRpm) label = 'over-rev';
    else if (sim.inGear && sim.engagement > 0.9 && rpm < CAR.lugBand[0]) label = 'lugging';
    else if (rpm < CAR.idleRpm + 120) label = 'idle';
    this.rpmLabel.textContent = label;
    this.rpmLabel.setAttribute('class',
      'dial-sub' + (rpm > CAR.redlineRpm ? ' is-danger' : (label === 'lugging' ? ' is-warn' : '')));

    this.speedText.textContent = String(Math.round(Math.abs(sim.kph)));
    this.gearText.textContent = sim.gear === 0 ? 'N' : (sim.gear === -1 ? 'R' : String(sim.gear));
    this.gearHint.textContent = extra.gearHint || '';

    const { gy, gh } = this._cg;
    this.clutchMark.setAttribute('y', (gy + sim.clutchPedal * gh - 1.5).toFixed(1));
    const held = sim.pedalHeldMs;
    const shown = held != null ? held : sim.lastPedalDownMs;
    this.holdTime.textContent = shown == null ? '—' : (shown / 1000).toFixed(2) + 's';
    this.holdEl.className = 'hold-readout'
      + (held != null ? ' is-live' : '')
      + (shown != null && shown > 2500 ? ' is-warn' : '');
  }
}

export function engagementLabel(pedal) {
  const e = clutchEngagement(pedal);
  if (e > 0.995) return 'fully engaged';
  if (e < 0.005) return 'fully clear';
  return 'slipping';
}
