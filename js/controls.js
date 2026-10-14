// controls.js — the pedals.
//
// The clutch is the important one. It is a travel strip, not a button: your
// finger position *is* the pedal position, so you control the release speed
// through the bite point, which is the thing being taught. Lifting your
// finger off is taking your foot off.

import { CLUTCH } from './car.js';

export class ClutchPedal {
  constructor(host, onChange) {
    this.host = host;
    this.onChange = onChange;
    this.value = 0;
    this.active = false;
    this._build();
  }

  _build() {
    this.host.classList.add('clutch-pad');
    this.host.innerHTML = `
      <div class="pad-label">CLUTCH <span class="pad-hint">slide down · hold · slide up</span></div>
      <div class="clutch-track" aria-hidden="true">
        <div class="ct-zone ct-free" style="height:${CLUTCH.biteStart * 100}%"><span>free travel</span></div>
        <div class="ct-zone ct-bite" style="height:${(CLUTCH.biteEnd - CLUTCH.biteStart) * 100}%"><span>BITE POINT</span></div>
        <div class="ct-zone ct-clear" style="height:${(1 - CLUTCH.biteEnd) * 100}%"><span>clear</span></div>
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

  _springUp() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      if (this.active) return;
      const v = Math.max(0, this.value - 0.14);
      this._set(v);
      if (v > 0) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
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
