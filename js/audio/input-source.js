// input-source.js — the note-input abstraction.
//
// Everything above this layer (scoring, notation, exercises) talks only to an
// InputSource. Phase 1 ships exactly one implementation, MicInputSource, which
// is monophonic. A Web MIDI source or a polyphonic audio source can be dropped
// in later without touching anything downstream, provided it emits the same
// two events.
//
// THE CONTRACT
// ------------
//   capabilities -> { kind, polyphonic, hasVelocity, hasNoteOff }
//
//   'frame'  — continuous state, for the live readout. Fired often (~50 Hz for
//              the mic source). Payload:
//                { t, frequency, midi, cents, clarity, rms, voiced }
//              `midi` is null when unvoiced. `t` is ALWAYS an AudioContext
//              time, never wall-clock.
//
//   'note'   — a discrete note event: someone struck a key. Payload:
//                { t, midi, cents, clarity, velocity }
//              `t` is the onset time on the audio clock, uncorrected for
//              latency; the calibration offset is applied by the scorer, not
//              here, so that raw measurements stay inspectable.
//              `velocity` is null when the source cannot measure it.
//
//   'status' — { state, message } for UI plumbing; state is one of
//              'idle' | 'starting' | 'running' | 'error' | 'stopped'.
//
// A polyphonic source emits one 'note' per struck key and may emit 'frame'
// with `midi: null`; downstream code must not assume one note at a time beyond
// what `capabilities.polyphonic` says.

export class InputSource {
  constructor() {
    this._handlers = new Map();
    this.capabilities = { kind: 'none', polyphonic: false, hasVelocity: false, hasNoteOff: false };
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const s = this._handlers.get(type);
    if (s) s.delete(fn);
  }

  emit(type, payload) {
    const s = this._handlers.get(type);
    if (!s) return;
    for (const fn of s) {
      try { fn(payload); } catch (err) { console.error(`[${type}] handler threw`, err); }
    }
  }

  /** @returns {Promise<void>} */
  async start() { throw new Error('not implemented'); }
  async stop() { throw new Error('not implemented'); }
}

// ---------------------------------------------------------------------------

import { analyseFreq } from '../music/pitch.js';

/**
 * Monophonic microphone input: AudioWorklet running MPM pitch detection and a
 * separate spectral-flux onset detector.
 */
export class MicInputSource extends InputSource {
  /**
   * @param {import('./engine.js').AudioEngine} engine
   */
  constructor(engine, opts = {}) {
    super();
    this.engine = engine;
    this.capabilities = { kind: 'audio-mono', polyphonic: false, hasVelocity: false, hasNoteOff: false };

    this.a4 = opts.a4 || 440;
    this.clarityThreshold = opts.clarityThreshold != null ? opts.clarityThreshold : 0.55;

    // After an onset we wait a little for the analysis window to fill with the
    // new note before trusting its pitch. The window looks backwards, so a
    // frame stamped at t+delay is dominated by the new note only once delay is
    // an appreciable fraction of the window length.
    this.resolveMinSec = opts.resolveMinSec != null ? opts.resolveMinSec : 0.030;
    this.resolveMaxSec = opts.resolveMaxSec != null ? opts.resolveMaxSec : 0.140;

    this._pending = null;     // { t, best: {midi, cents, clarity} | null }
    this._lastFrame = null;
    this._unsub = [];
  }

  async start() {
    this.emit('status', { state: 'starting', message: 'Requesting microphone…' });
    try {
      await this.engine.startInput();
    } catch (err) {
      this.emit('status', { state: 'error', message: describeMicError(err) });
      throw err;
    }

    this._unsub.push(this.engine.onWorkletMessage(msg => this._handle(msg)));
    this.engine.configureDetector({ clarityThreshold: this.clarityThreshold });
    this.emit('status', { state: 'running', message: 'Listening' });
  }

  async stop() {
    for (const u of this._unsub) u();
    this._unsub = [];
    await this.engine.stopInput();
    this.emit('status', { state: 'stopped', message: 'Stopped' });
  }

  setA4(hz) { this.a4 = hz; }

  _handle(msg) {
    if (msg.type === 'onset') {
      // Flush any pending note that never got a confident pitch.
      this._flush(msg.t);
      this._pending = { t: msg.t, best: null };
      return;
    }
    if (msg.type !== 'analysis') return;

    let midi = null, cents = 0;
    if (msg.frequency > 0) {
      const a = analyseFreq(msg.frequency, this.a4);
      midi = a.midi; cents = a.cents;
    }

    const frame = {
      t: msg.t,
      frequency: msg.frequency,
      midi: msg.voiced ? midi : null,
      cents,
      clarity: msg.clarity,
      rms: msg.rms,
      voiced: msg.voiced
    };
    this._lastFrame = frame;
    this.emit('frame', frame);

    if (this._pending && msg.voiced) {
      const age = msg.t - this._pending.t;
      if (age >= this.resolveMinSec && age <= this.resolveMaxSec) {
        if (!this._pending.best || msg.clarity > this._pending.best.clarity) {
          this._pending.best = { midi, cents, clarity: msg.clarity };
        }
      }
    }
    this._flush(msg.t);
  }

  /** Emit the pending note once its resolution window has closed. */
  _flush(now) {
    if (!this._pending) return;
    if (now - this._pending.t < this.resolveMaxSec) return;
    const p = this._pending;
    this._pending = null;
    if (!p.best) return;    // an onset with no confident pitch: key noise, pedal, a thump
    this.emit('note', {
      t: p.t,
      midi: p.best.midi,
      cents: p.best.cents,
      clarity: p.best.clarity,
      velocity: null
    });
  }
}

function describeMicError(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission was denied. On iOS: Settings → Safari → Microphone, or tap the "aA" button in the address bar → Website Settings.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found.';
  }
  if (name === 'NotReadableError') {
    return 'The microphone is in use by another app. Close it and try again.';
  }
  if (!window.isSecureContext) {
    return 'Microphone access needs HTTPS. Open the deployed https:// URL rather than a local file.';
  }
  return `Could not start the microphone: ${err && err.message ? err.message : err}`;
}
