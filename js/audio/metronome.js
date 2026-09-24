// metronome.js — click track scheduled entirely on the audio clock.
//
// Two modes:
//   scheduleRun()  — lays down a fixed number of clicks at exact audio times,
//                    up front, with no timer involved at all. This is what the
//                    calibration routine uses, because there the beat grid
//                    must be exact and known in advance.
//   start()/stop() — an open-ended metronome using a lookahead scheduler. The
//                    timer here is a requestAnimationFrame wakeup that only
//                    decides *when to think about scheduling*; every click's
//                    actual time is still computed on the audio clock and
//                    handed to the audio thread ahead of time. No sound event
//                    is ever triggered by a timer firing.

const LOOKAHEAD_SEC = 0.25;

export class Metronome {
  /** @param {import('./engine.js').AudioEngine} engine */
  constructor(engine) {
    this.engine = engine;
    this.bpm = 80;
    this.beatsPerBar = 4;
    this.gain = 0.35;

    this._running = false;
    this._nextBeat = 0;
    this._nextTime = 0;
    this._rafId = null;
    this._onBeat = null;
  }

  get period() { return 60 / this.bpm; }

  /**
   * One click at an exact audio time.
   * @param {number} time AudioContext time
   * @param {boolean} accent downbeat
   */
  click(time, accent = false) {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 1600 : 1100, time);

    // Short percussive envelope. Deliberately clicky and broadband-ish so the
    // user can hear it clearly over a piano, and short enough that it does not
    // bleed into the microphone during the note they are playing.
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(this.gain * (accent ? 1 : 0.7), time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

    osc.connect(env);
    env.connect(this.engine.outputBus);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  /**
   * Schedule a fixed run of clicks, all at once, no timers.
   * @param {number} startTime AudioContext time of beat 0
   * @param {number} beats how many clicks
   * @returns {number[]} the exact beat times
   */
  scheduleRun(startTime, beats) {
    const times = [];
    for (let i = 0; i < beats; i++) {
      const t = startTime + i * this.period;
      this.click(t, i % this.beatsPerBar === 0);
      times.push(t);
    }
    return times;
  }

  /**
   * Open-ended metronome.
   * @param {(beat:number, time:number)=>void} [onBeat] called during scheduling,
   *   ahead of the sound, with the exact audio time of the beat.
   */
  start(onBeat) {
    if (this._running) return;
    const ctx = this.engine.ctx;
    this._running = true;
    this._onBeat = onBeat || null;
    this._nextBeat = 0;
    this._nextTime = ctx.currentTime + 0.1;
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  _tick = () => {
    if (!this._running) return;
    const ctx = this.engine.ctx;
    while (this._nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      this.click(this._nextTime, this._nextBeat % this.beatsPerBar === 0);
      if (this._onBeat) this._onBeat(this._nextBeat, this._nextTime);
      this._nextBeat++;
      this._nextTime += this.period;
    }
    this._rafId = requestAnimationFrame(this._tick);
  };
}
