// audio.js — engine note.
//
// Not decoration. Experienced drivers shift by ear far more than by the rev
// counter, so hearing the revs rise and fall is part of what is being
// trained. Deliberately plain: a sawtooth at the firing frequency of a
// four-cylinder, filtered, with a little mechanical noise on top.

export class EngineAudio {
  constructor() { this.on = false; this.ctx = null; }

  enable() {
    if (this.ctx) { this.on = true; this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 40;

    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 20;
    this.sub = ctx.createGain();
    this.sub.gain.value = 0.25;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 400;
    this.filter.Q.value = 2;

    this.osc.connect(this.filter);
    this.osc2.connect(this.sub).connect(this.filter);
    this.filter.connect(this.master);
    this.osc.start(); this.osc2.start();
    this.on = true;
  }

  disable() {
    this.on = false;
    if (this.master) this.master.gain.value = 0;
  }

  update(sim) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = sim.stalled ? 0 : sim.rpm;
    if (rpm < 50) { this.master.gain.setTargetAtTime(0, t, 0.05); return; }
    // Four-cylinder: two firing events per crank revolution.
    const f = Math.max(18, (rpm / 60) * 2);
    this.osc.frequency.setTargetAtTime(f, t, 0.02);
    this.osc2.frequency.setTargetAtTime(f / 2, t, 0.02);
    this.filter.frequency.setTargetAtTime(380 + rpm * 0.26, t, 0.04);
    const load = 0.05 + sim.throttle * 0.1 + Math.min(0.05, rpm / 90000);
    this.master.gain.setTargetAtTime(load, t, 0.05);
  }

  /** A short gear-crunch, when the lever is pushed at a gripping clutch. */
  clunk(harsh = false) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (harsh ? 0.28 : 0.06)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = 1 - i / d.length;
      d[i] = (Math.random() * 2 - 1) * env * env * (harsh ? 0.9 : 0.5);
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = harsh ? 2200 : 900; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = harsh ? 0.3 : 0.12;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }
}
