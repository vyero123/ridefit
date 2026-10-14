// gate.js — a real H-pattern gate you move a lever through.
//
// Not six buttons. The lever has to travel out of its slot, along the
// neutral channel and into the next slot, because that path is part of what
// has to become automatic. The lever also physically will not enter a gear
// while the clutch is still gripping.

const NS = 'http://www.w3.org/2000/svg';

const MID = 86, TOP = 32, BOT = 140;
const COLS = [
  { x: 46, up: null, down: -1, label: 'R' },
  { x: 118, up: 1, down: 2 },
  { x: 190, up: 3, down: 4 },
  { x: 262, up: 5, down: 6 },
];
const CORRIDOR = 15;   // half-height of the neutral channel
const ENGAGE = 40;     // distance from MID at which the gear is in
const KNOB_R = 19;

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

export class Gate {
  /**
   * @param {HTMLElement} host
   * @param {(gear:number)=>({ok:boolean,message?:string})} onSelect
   */
  constructor(host, onSelect) {
    this.host = host;
    this.onSelect = onSelect;
    this.col = 0;           // index into COLS the lever is in or nearest to
    this.x = COLS[1].x;
    this.y = MID;
    this.locked = false;    // true once out of the corridor
    this.lockedCol = null;
    this.gear = 0;
    this.target = null;
    this.dragging = false;
    this._build();
  }

  _build() {
    const svg = el('svg', { viewBox: '0 0 308 172', class: 'gate-svg', 'aria-label': 'Gear lever gate' });
    this.svg = svg;

    svg.appendChild(el('rect', { x: 0, y: 0, width: 308, height: 172, rx: 10, fill: 'var(--panel)' }));

    // The channel, drawn as the slot the lever actually runs in.
    const chan = el('g', { class: 'gate-channel' });
    chan.appendChild(el('rect', {
      x: COLS[0].x - 13, y: MID - 13, width: COLS[3].x - COLS[0].x + 26, height: 26,
      rx: 13, fill: 'var(--slot)',
    }));
    for (const c of COLS) {
      const y1 = c.up != null ? TOP - 13 : MID - 13;
      const y2 = c.down != null ? BOT + 13 : MID + 13;
      chan.appendChild(el('rect', { x: c.x - 13, y: y1, width: 26, height: y2 - y1, rx: 13, fill: 'var(--slot)' }));
    }
    svg.appendChild(chan);

    // Gate-end labels.
    this.labels = {};
    for (const c of COLS) {
      for (const [dir, gear] of [['up', c.up], ['down', c.down]]) {
        if (gear == null) continue;
        const y = dir === 'up' ? TOP : BOT;
        const g = el('g', { class: 'gate-end' });
        g.appendChild(el('circle', { cx: c.x, cy: y, r: 16, class: 'gate-end-ring' }));
        g.appendChild(el('text', { x: c.x, y: y + 7, 'text-anchor': 'middle', class: 'gate-end-label' },
          gear === -1 ? 'R' : String(gear)));
        svg.appendChild(g);
        this.labels[gear] = g;
      }
    }
    svg.appendChild(el('text', { x: 154, y: MID - 22, 'text-anchor': 'middle', class: 'gate-neutral-tag' }, 'N E U T R A L'));

    // Lever.
    this.knob = el('g', { class: 'gate-knob' });
    this.knob.appendChild(el('circle', { cx: 0, cy: 0, r: KNOB_R, class: 'knob-body' }));
    this.knob.appendChild(el('circle', { cx: 0, cy: 0, r: KNOB_R - 6, class: 'knob-inner' }));
    svg.appendChild(this.knob);

    this.host.appendChild(svg);
    this._wire();
    this._render();
  }

  _wire() {
    const pt = (e) => {
      const r = this.svg.getBoundingClientRect();
      const vb = this.svg.viewBox.baseVal;
      return {
        x: ((e.clientX - r.left) / r.width) * vb.width,
        y: ((e.clientY - r.top) / r.height) * vb.height,
      };
    };

    // The lever must be grabbed and moved through the gate; you cannot tap a
    // gear directly, because threading the channel is the point.
    const down = (e) => {
      const p = pt(e);
      if (Math.hypot(p.x - this.x, p.y - this.y) > 42) {
        this.knob.classList.add('is-hint');
        setTimeout(() => this.knob.classList.remove('is-hint'), 450);
        return;
      }
      e.preventDefault();
      this.dragging = true;
      this._grab = { dx: this.x - p.x, dy: this.y - p.y };
      this.svg.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      const p = pt(e);
      this._move({ x: p.x + this._grab.dx, y: p.y + this._grab.dy });
    };
    const up = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.svg.releasePointerCapture?.(e.pointerId);
      this._settle();
    };

    this.svg.addEventListener('pointerdown', down);
    this.svg.addEventListener('pointermove', move);
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', up);
    this.svg.style.touchAction = 'none';

    // Keyboard, for anyone who would rather not drag.
    this.svg.setAttribute('tabindex', '0');
    this.svg.addEventListener('keydown', (e) => {
      const step = 26;
      let p = { x: this.x, y: this.y };
      if (e.key === 'ArrowLeft') p.x -= step;
      else if (e.key === 'ArrowRight') p.x += step;
      else if (e.key === 'ArrowUp') p.y -= step;
      else if (e.key === 'ArrowDown') p.y += step;
      else return;
      e.preventDefault();
      this._move(p);
      this._settle();
    });
  }

  _move({ x, y }) {
    const dy = y - MID;

    if (!this.locked) {
      // In the neutral channel: slide along it, and pick a column by x.
      this.x = Math.max(COLS[0].x, Math.min(COLS[3].x, x));
      let best = 0, bd = Infinity;
      COLS.forEach((c, i) => { const d = Math.abs(c.x - this.x); if (d < bd) { bd = d; best = i; } });
      this.col = best;
      if (Math.abs(dy) > CORRIDOR && bd < 30) {
        const c = COLS[best];
        const wants = dy < 0 ? c.up : c.down;
        if (wants != null) { this.locked = true; this.lockedCol = best; this.x = c.x; }
      }
      this.y = this.locked ? MID + Math.sign(dy) * CORRIDOR : MID;
    }

    if (this.locked) {
      const c = COLS[this.lockedCol];
      this.x = c.x;
      const lo = c.up != null ? TOP : MID;
      const hi = c.down != null ? BOT : MID;
      this.y = Math.max(lo, Math.min(hi, y));
      if (Math.abs(this.y - MID) <= CORRIDOR) {
        // Back in the channel.
        this.locked = false; this.lockedCol = null; this.y = MID;
        if (this.gear !== 0) this._commit(0);
      } else {
        const wants = this.y < MID ? c.up : c.down;
        if (Math.abs(this.y - MID) >= ENGAGE && this.gear !== wants) {
          const res = this._commit(wants);
          if (!res || res.ok === false) {
            // Blocked: the lever will not go in. Push it back to the mouth
            // of the slot so the refusal is felt, not just read.
            this.y = MID + Math.sign(this.y - MID) * (CORRIDOR + 6);
            this._blocked = performance.now();
          }
        }
      }
    }
    this._render();
  }

  _commit(gear) {
    const res = this.onSelect(gear);
    if (res && res.ok === false) return res;
    this.gear = gear;
    return { ok: true };
  }

  _settle() {
    if (this.gear !== 0 && this.locked) {
      const c = COLS[this.lockedCol];
      this.y = this.gear === c.up ? TOP : BOT;
    } else {
      this.locked = false; this.lockedCol = null;
      this.y = MID;
      this.x = COLS[this.col].x;
      if (this.gear !== 0) this._commit(0);
    }
    this._render();
  }

  /** Force the lever to show a gear the sim set some other way (e.g. a reset). */
  syncTo(gear) {
    this.gear = gear;
    if (gear === 0) { this.locked = false; this.lockedCol = null; this.y = MID; this._render(); return; }
    const i = COLS.findIndex((c) => c.up === gear || c.down === gear);
    if (i < 0) return;
    this.col = i; this.lockedCol = i; this.locked = true;
    this.x = COLS[i].x;
    this.y = COLS[i].up === gear ? TOP : BOT;
    this._render();
  }

  setTarget(gear) {
    this.target = gear;
    for (const k in this.labels) this.labels[k].classList.toggle('is-target', Number(k) === gear);
  }

  _render() {
    this.knob.setAttribute('transform', `translate(${this.x.toFixed(1)} ${this.y.toFixed(1)})`);
    const blocked = this._blocked && performance.now() - this._blocked < 400;
    this.knob.classList.toggle('is-blocked', !!blocked);
    this.knob.classList.toggle('is-engaged', this.gear !== 0);
  }
}
