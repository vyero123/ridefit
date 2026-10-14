// controls.js — the pedals.
//
// The clutch is the important one. It is a travel strip, not a button: your
// finger position *is* the pedal position, so you control the release speed
// through the bite point, which is the thing being taught. Lifting your
// finger off is taking your foot off.

import { CLUTCH } from './car.js';

export const CLUTCH_ZONES = [
  { h: CLUTCH.biteStart, cls: 'ct-free', text: 'free travel' },
  { h: CLUTCH.biteEnd - CLUTCH.biteStart, cls: 'ct-bite', text: 'BITE POINT' },
  { h: 1 - CLUTCH.biteEnd, cls: 'ct-clear', text: 'clear' },
];

export const THROTTLE_ZONES = [
  { h: 0.22, cls: 'tt-0', text: 'off' },
  { h: 0.38, cls: 'tt-1', text: 'light' },
  { h: 0.40, cls: 'tt-2', text: 'full' },
];

/**
 * A pedal whose position follows your finger, in both directions. Press-and-
 * hold keeps it where you are holding it; sliding up is you letting it out at
 * whatever speed you choose; lifting the finger is taking your foot off.
 * The clutch needs this because release speed is half of what it teaches, and
 * the throttle needs it because a pedal that is only ever flat to the floor
 * cannot hold a steady 2,000 rpm or deliver a blip.
 */
export class TravelPedal {
  constructor(host, { label, hint, zones, cls = '' }, onChange) {
    this.host = host;
    this.onChange = onChange;
    this.value = 0;
    this.active = false;
    this.opts = { label, hint, zones, cls };
    this._build();
  }

  _build() {
    const { label, hint, zones, cls } = this.opts;
    this.host.classList.add('travel-pad');
    if (cls) this.host.classList.add(cls);
    this.host.innerHTML = `
      <div class="pad-label">${label}<span class="pad-hint">${hint}</span></div>
      <div class="clutch-track" aria-hidden="true">
        ${zones.map((z) => `<div class="ct-zone ${z.cls}" style="height:${z.h * 100}%"><span>${z.text}</span></div>`).join('')}
        <div class="ct-foot"></div>
      </div>`;
    this.track = this.host.querySelector('.clutch-track');
    this.foot = this.host.querySelector('.ct-foot');

    const frac = (e) => {
      const r = this.track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    };
    const set = (v) => {
      this.value = v;
      this.foot.style.top = (v * 100) + '%';
      this.host.classList.toggle('is-down', v > 0.05);
      this.onChange(v);
    };

    this.track.style.touchAction = 'none';
    this.track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.active = true;
      this.track.setPointerCapture?.(e.pointerId);
      this.host.classList.add('is-held');
      set(frac(e));
    });
    this.track.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      e.preventDefault();
      set(frac(e));
    });
    const end = (e) => {
      if (!this.active) return;
      this.active = false;
      this.host.classList.remove('is-held');
      this.track.releasePointerCapture?.(e.pointerId);
      // Foot off: the pedal comes back up on its own spring, fast.
      this._springUp();
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);
    this._set = set;
  }

  // A timer rather than requestAnimationFrame: a pedal that got stuck down
  // because the tab was throttled would be measuring nonsense.
  _springUp() {
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      if (this.active) { clearInterval(this._timer); return; }
      const v = Math.max(0, this.value - 0.16);
      this._set(v);
      if (v <= 0) clearInterval(this._timer);
    }, 16);
  }

  /** Keyboard / programmatic: hold to the floor, release to spring up. */
  hold(down) {
    if (down) {
      this.active = true;
      this.host.classList.add('is-held');
      this._set(1);
    } else if (this.active) {
      this.active = false;
      this.host.classList.remove('is-held');
      this._springUp();
    }
  }
}

/** A simple press-and-hold pedal that ramps up and falls back. */
export class RampPedal {
  constructor(host, { label, hint, max = 1, riseMs = 260, fallMs = 190, cls = '' }, onChange) {
    this.host = host;
    this.max = max;
    this.rise = 1 / (riseMs / 1000);
    this.fall = 1 / (fallMs / 1000);
    this.value = 0;
    this.pressed = false;
    this.onChange = onChange;
    host.classList.add('ramp-pad', cls);
    host.innerHTML = `<div class="pad-label">${label}<span class="pad-hint">${hint || ''}</span></div>
      <div class="ramp-fill"></div><div class="ramp-cap">HOLD</div>`;
    this.fill = host.querySelector('.ramp-fill');
    host.style.touchAction = 'none';
    const on = (e) => { e.preventDefault(); this.pressed = true; host.setPointerCapture?.(e.pointerId); host.classList.add('is-held'); };
    const off = (e) => { this.pressed = false; host.releasePointerCapture?.(e.pointerId); host.classList.remove('is-held'); };
    host.addEventListener('pointerdown', on);
    host.addEventListener('pointerup', off);
    host.addEventListener('pointercancel', off);
    host.addEventListener('pointerleave', (e) => { if (!host.hasPointerCapture?.(e.pointerId)) off(e); });
  }

  tick(dt) {
    const target = this.pressed ? 1 : 0;
    const rate = this.pressed ? this.rise : this.fall;
    const next = this.value + Math.sign(target - this.value) * rate * dt;
    this.value = target > this.value ? Math.min(target, next) : Math.max(target, next);
    this.fill.style.height = (this.value * 100) + '%';
    this.onChange(this.value * this.max);
  }

  hold(down) { this.pressed = down; this.host.classList.toggle('is-held', down); }
}
