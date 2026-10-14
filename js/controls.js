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
    this.pointers = new Set();
    this._build();
  }

  _build() {
    const { label, sub, zones, marks = [], cls = '' } = this.opts;
    this.host.className = 'pedal ' + cls;
    this.host.innerHTML = `
      <div class="pedal-name">${label}<i>${sub || ''}</i></div>
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
      this._setPressed(true);
    };
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      this.body.releasePointerCapture?.(e.pointerId);
      if (!this.pointers.size) this._setPressed(false);
    };
    this.body.addEventListener('pointerdown', down);
    this.body.addEventListener('pointerup', up);
    this.body.addEventListener('pointercancel', up);
    this.body.addEventListener('lostpointercapture', up);
    this._render();
  }

  _setPressed(on) {
    this.pressed = on;
    this.host.classList.toggle('is-pressed', on);
  }

  /** Keyboard and programmatic pressing use the same path as a finger. */
  hold(on) { this._setPressed(on); }

  tick(dt) {
    const { downRate, upRate } = this.opts;
    const before = this.value;
    if (this.pressed) this.value = Math.min(1, this.value + downRate * dt);
    else this.value = Math.max(0, this.value - upRate * dt);
    if (this.value !== before || this._dirty) {
      this._dirty = false;
      this._render();
    }
    this.onChange(this.value);
  }

  reset() {
    this.pressed = false;
    this.pointers.clear();
    this.value = 0;
    this.host.classList.remove('is-pressed');
    this._dirty = true;
    this._render();
    this.onChange(0);
  }

  _render() {
    const v = this.value;
    this.fill.style.height = (v * 100) + '%';
    this.plate.style.top = `calc(${v * 100}% - 11px)`;
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
