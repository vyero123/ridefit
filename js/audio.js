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

    this._buildClutchVoice(ctx);
    this.on = true;
  }

  /**
   * The clutch voice. This is the app's substitute for the thing a
   * touchscreen cannot give you: knowing where the clutch is by feel.
   *
   * It says three things at once, without a glance:
   *   - silence means the plate is not touching;
   *   - a tone appears the moment it starts to grip, and rises as it grips
   *     harder, so the friction zone is audible as a band;
   *   - the tone flutters at a rate set by how fast the plate is slipping.
   *     Fast flutter is a big speed difference; as the two sides converge the
   *     flutter slows, and when it stops and the tone fades, you are locked.
   *
   * The flutter is not decoration — a slipping clutch really does beat, and
   * matching revs really is the act of slowing that beat to nothing.
   */
  _buildClutchVoice(ctx) {
    this.clutchGain = ctx.createGain();
    this.clutchGain.gain.value = 0;
    this.clutchGain.connect(ctx.destination);

    this.clutchOsc = ctx.createOscillator();
    this.clutchOsc.type = 'triangle';
    this.clutchOsc.frequency.value = 180;

    this.clutchFilter = ctx.createBiquadFilter();
    this.clutchFilter.type = 'bandpass';
    this.clutchFilter.frequency.value = 320;
    this.clutchFilter.Q.value = 1.1;

    // Tremolo: depth is fixed, rate tracks the slip.
    this.tremolo = ctx.createGain();
    this.tremolo.gain.value = 0.55;
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 6;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 0.45;
    this.lfo.connect(this.lfoDepth).connect(this.tremolo.gain);

    this.clutchOsc.connect(this.clutchFilter).connect(this.tremolo).connect(this.clutchGain);
    this.clutchOsc.start(); this.lfo.start();
  }

  disable() {
    this.on = false;
    if (this.master) this.master.gain.value = 0;
    if (this.clutchGain) this.clutchGain.gain.value = 0;
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
    this._updateClutch(sim, t);
  }

  _updateClutch(sim, t) {
    if (!this.clutchGain) return;
    const eng = sim.engagement;          // 0 clear .. 1 fully clamped
    const slip = Math.abs(sim.inGear ? sim.slipRpm : 0);

    // Loudest in the middle of the friction zone and while actually slipping;
    // silent when the plate is clear, and fading away as it locks.
    const inZone = Math.min(1, eng / 0.12) * Math.min(1, (1 - eng) / 0.10 + 0.25);
    const slipping = Math.min(1, slip / 180);
    const vol = sim.stalled ? 0 : 0.085 * inZone * (0.35 + 0.65 * slipping);
    this.clutchGain.gain.setTargetAtTime(vol, t, 0.04);

    // Pitch rises through the zone: low as it first touches, higher as it grips.
    this.clutchOsc.frequency.setTargetAtTime(150 + eng * 170, t, 0.05);
    this.clutchFilter.frequency.setTargetAtTime(260 + eng * 420, t, 0.05);

    // Flutter rate follows the slip, and stops when the two sides agree.
    const rate = Math.max(0.6, Math.min(26, slip / 26));
    this.lfo.frequency.setTargetAtTime(rate, t, 0.05);
    this.lfoDepth.gain.setTargetAtTime(slip < 40 ? 0.08 : 0.45, t, 0.06);
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
