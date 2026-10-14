// controls.js — the pedals.
//
// A pedal is pressed, not dragged. Holding it down pushes it further down;
// letting go lets it come back up. Neither happens instantly, so holding a
// position part-way — which is the whole of clutch control — is a matter of
// pressing and easing off in rhythm. That is a real analogue of modulating
// with a foot: you are managing a position you cannot simply set.
//
// The rates matter more than anything else here. Too fast and the friction
// zone is impossible to sit in; too slow and it is not a pedal, it is a
// slider. These are tuned so that the bite range takes roughly a second to
// cross on a steady release, and a tap of 100 ms buys about 200 ms of hold.

import { CLUTCH } from './car.js';

export const CLUTCH_ZONES = [
  { h: CLUTCH.biteStart, cls: 'pz-free', text: 'free play' },
  { h: CLUTCH.biteEnd - CLUTCH.biteStart, cls: 'pz-bite', text: 'FRICTION ZONE' },
  { h: 1 - CLUTCH.biteEnd, cls: 'pz-clear', text: 'disengaged' },
];

export const THROTTLE_ZONES = [
  { h: 0.26, cls: 'pz-t0', text: '' },
  { h: 0.36, cls: 'pz-t1', text: '' },
  { h: 0.38, cls: 'pz-t2', text: '' },
];

export const BRAKE_ZONES = [
  { h: 0.35, cls: 'pz-b0', text: '' },
  { h: 0.65, cls: 'pz-b1', text: '' },
];

export class Pedal {
  /**
   * @param {HTMLElement} host
   * @param {object} opts  label, sub, zones, downRate, upRate, marks, cls
   * @param {(v:number)=>void} onChange
   */
  constructor(host, opts, onChange) {
    this.host = host;
    this.opts = opts;
    this.onChange = onChange;
    this.value = 0;
    this.pressed = false;
    this.autoHeld = false;
    this.mode = opts.mode || 'press';
    this.pointers = new Set();
    this._build();
    this.setMode(this.mode);
  }

  _build() {
    const { label, sub, zones, marks = [], cls = '' } = this.opts;
    this.host.className = 'pedal ' + cls;
    this.host.innerHTML = `
      <div class="pedal-name">${label}<i>${sub || '&nbsp;'}</i></div>
      <div class="pedal-body">
        <div class="pedal-zones">
          ${zones.map((z) => `<div class="pedal-zone ${z.cls}" style="flex:${z.h}"><span>${z.text}</span></div>`).join('')}
        </div>
        ${marks.map((m) => `<div class="pedal-mark" style="top:${m.at * 100}%"><span>${m.text}</span></div>`).join('')}
        <div class="pedal-fill"></div>
        <div class="pedal-plate"><span class="pedal-pct">0</span></div>
      </div>`;
    this.body = this.host.querySelector('.pedal-body');
    this.fill = this.host.querySelector('.pedal-fill');
    this.plate = this.host.querySelector('.pedal-plate');
    this.pct = this.host.querySelector('.pedal-pct');

    this.body.style.touchAction = 'none';
    const down = (e) => {
      e.preventDefault();
      this.pointers.add(e.pointerId);
      this.body.setPointerCapture?.(e.pointerId);
      // Position mode grabs from wherever the thumb lands, so the pedal never
      // jumps: the touch point becomes "here", and moving from it moves the
      // pedal by the same proportion of the body's height.
      this._grabY = e.clientY;
      this._grabValue = this.value;
      this.autoHeld = false;
      this._setPressed(true);
    };
    const move = (e) => {
      if (!this.pointers.has(e.pointerId) || this.mode !== 'touch') return;
      e.preventDefault();
      const h = this.body.getBoundingClientRect().height || 1;
      const gain = 1 / (this.opts.response ?? 1);   // slower pedal = more thumb per unit
      const v = this._grabValue + ((e.clientY - this._grabY) / h) / Math.max(0.35, gain * 0.9);
      this.value = Math.max(0, Math.min(1, v));
      this._dirty = true;
    };
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      this.body.releasePointerCapture?.(e.pointerId);
      if (!this.pointers.size) this._setPressed(false);
    };
    this.body.addEventListener('pointerdown', down);
    this.body.addEventListener('pointermove', move);
    this.body.addEventListener('pointerup', up);
    this.body.addEventListener('pointercancel', up);
    this.body.addEventListener('lostpointercapture', up);
    this._render();
  }

  _setPressed(on) {
    this.pressed = on;
    this.host.classList.toggle('is-pressed', on);
    if (on) this.autoHeld = false;
  }

  /** Keyboard and programmatic pressing use the same path as a finger. */
  hold(on) { this._setPressed(on); }

  /** 'press' = hold to push it down; 'touch' = the thumb is the pedal. */
  setMode(mode) {
    this.mode = mode;
    this.host.classList.toggle('is-touch', mode === 'touch');
    const sub = this.host.querySelector('.pedal-name i');
    if (sub) sub.innerHTML = mode === 'touch' ? 'slide to place' : (this.opts.sub || '&nbsp;');
  }

  setResponse(mult) { this.opts.response = mult; }
  setAutoHold(on) { this.opts.autoHold = on; if (!on) this.autoHeld = false; }

  tick(dt) {
    const { downRate, upRate, fineZone, fineFactor = 0.42, response = 1, autoHold } = this.opts;
    const before = this.value;

    if (this.mode === 'touch') {
      // The finger holds the position; nothing moves on its own except the
      // spring, which returns the pedal when the foot comes off.
      if (!this.pressed && this.value > 0) {
        this.value = Math.max(0, this.value - upRate * response * dt);
      }
    } else {
      // The pedal moves more slowly through the band where the skill lives.
      // A real pedal does this too — the diaphragm spring goes over centre and
      // the force needed changes — but the reason it is here is resolution: all
      // of clutch control happens inside a third of the travel, and a control
      // that crosses that band in a tenth of a second cannot be held in it.
      const fine = fineZone && this.value > fineZone[0] && this.value < fineZone[1];
      const k = (fine ? fineFactor : 1) * response;
      if (this.pressed) {
        this.value = Math.min(1, this.value + downRate * k * dt);
      } else if (!this.autoHeld) {
        const next = Math.max(0, this.value - upRate * k * dt);
        // Auto-hold: coming up, stop dead at the top of the friction zone so
        // the pedal can be inspected there. An explicit training wheel.
        if (autoHold && fineZone && this.value > fineZone[1] && next <= fineZone[1]) {
          this.value = fineZone[1];
          this.autoHeld = true;
          this.host.classList.add('is-autoheld');
        } else {
          this.value = next;
        }
      }
    }
    if (!this.autoHeld) this.host.classList.remove('is-autoheld');

    if (this.value !== before || this._dirty) {
      this._dirty = false;
      this._render();
    }
    this.onChange(this.value);
  }

  reset() {
    this.pressed = false;
    this.autoHeld = false;
    this.pointers.clear();
    this.value = 0;
    this.host.classList.remove('is-pressed', 'is-autoheld');
    this._dirty = true;
    this._render();
    this.onChange(0);
  }

  /** Draw a recorded position during replay, without touching the live value. */
  showGhost(v) {
    this.fill.style.height = (v * 100) + '%';
    this.plate.style.top = `calc(${(v * 100).toFixed(1)}% - ${(v * 24).toFixed(1)}px)`;
    this.pct.textContent = Math.round(v * 100);
    this._dirty = true;
  }

  _render() {
    const v = this.value;
    this.fill.style.height = (v * 100) + '%';
    // The pedal face travels inside the body rather than off the top of it.
    this.plate.style.top = `calc(${(v * 100).toFixed(1)}% - ${(v * 24).toFixed(1)}px)`;
    this.pct.textContent = Math.round(v * 100);
    this.host.classList.toggle('is-down', v > 0.02);
  }
}

/** A latching button, for the handbrake. */
export class Toggle {
  constructor(host, label, onChange) {
    this.host = host;
    this.on = false;
    host.className = 'toggle';
    host.innerHTML = label;
    host.addEventListener('click', () => {
      this.on = !this.on;
      host.classList.toggle('is-on', this.on);
      onChange(this.on);
    });
  }
  set(on) {
    this.on = on;
    this.host.classList.toggle('is-on', on);
  }
}
