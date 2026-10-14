// recorder.js — a rolling record of the last few seconds, for replay.
//
// Watching back what you just did, slowly, with the moment of the stall or
// the jolt marked, teaches more per attempt than another attempt does. It is
// also the one thing here that a real car cannot offer at all.

const HZ = 40;           // samples per simulation second
const SECONDS = 14;

export class Recorder {
  constructor() { this.reset(); }

  reset() {
    this.frames = [];
    this.marks = [];
    this._acc = 0;
  }

  /** Called every step with simulation dt. */
  sample(sim, dt, pedals) {
    this._acc += dt;
    const period = 1 / HZ;
    if (this._acc < period) return;
    this._acc = 0;
    this.frames.push({
      t: sim.t,
      clutch: pedals.clutch, throttle: pedals.throttle, brake: pedals.brake,
      engagement: sim.engagement,
      rpm: sim.stalled ? 0 : sim.rpm,
      wheelRpm: sim.inGear ? Math.abs(sim.drivenRpm) : 0,
      kph: sim.kph, gear: sim.gear, stalled: sim.stalled,
      heat: sim.clutchHeat, slip: sim.inGear ? sim.slipRpm : 0,
    });
    const max = HZ * SECONDS;
    if (this.frames.length > max) {
      const drop = this.frames.length - max;
      this.frames.splice(0, drop);
      this.marks = this.marks.filter((m) => m.t >= this.frames[0].t);
    }
  }

  mark(t, kind, text) { this.marks.push({ t, kind, text }); }

  /** The slice around an event, for replaying one attempt. */
  slice(fromT, toT) {
    return {
      frames: this.frames.filter((f) => f.t >= fromT && f.t <= toT),
      marks: this.marks.filter((m) => m.t >= fromT && m.t <= toT),
    };
  }

  get span() {
    if (!this.frames.length) return null;
    return [this.frames[0].t, this.frames[this.frames.length - 1].t];
  }
}
