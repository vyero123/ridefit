// engine.js — owns the AudioContext, the microphone stream and the worklet.
//
// One rule runs through this whole file: the AudioContext clock is the only
// clock. Nothing here uses setInterval, setTimeout or performance.now() for
// anything musical. Timers are used only to poll for UI repaints, never to
// decide when a sound happens or when a note was played.

import { loadPitchWorklet } from './worklet-loader.js';

export class AudioEngine {
  constructor(opts = {}) {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this.sourceNode = null;
    /** @type {AudioWorkletNode|null} */
    this.workletNode = null;
    /** @type {GainNode|null} */
    this.outputBus = null;

    this.windowSize = opts.windowSize || 4096;
    this.basePath = opts.basePath || 'js/audio/';

    this._messageHandlers = new Set();
    this._stateHandlers = new Set();

    // Clock anchor reported by the worklet on its first render quantum.
    this.anchor = null;
    this.unlocked = false;
  }

  // -------------------------------------------------------------------------
  // Context lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create and unlock the AudioContext. MUST be called synchronously from
   * inside a real user gesture handler (a click/touch listener), because iOS
   * Safari will otherwise create the context in 'suspended' state and refuse
   * to resume it. We also play one silent buffer, which is the long-standing
   * incantation that actually flips iOS out of its muted state.
   */
  async unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('This browser has no Web Audio support.');
      // `latencyHint: 'interactive'` asks for the smallest buffer the platform
      // will give us, which is what we want for a practice trainer.
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.outputBus = this.ctx.createGain();
      this.outputBus.gain.value = 1;
      this.outputBus.connect(this.ctx.destination);

      this.ctx.addEventListener?.('statechange', () => {
        for (const fn of this._stateHandlers) fn(this.ctx.state);
      });
    }

    if (this.ctx.state === 'suspended') await this.ctx.resume();

    if (!this.unlocked) {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      this.unlocked = true;
    }

    return this.ctx;
  }

  onStateChange(fn) {
    this._stateHandlers.add(fn);
    return () => this._stateHandlers.delete(fn);
  }

  /** iOS suspends the context when the app backgrounds or a call comes in. */
  async resumeIfInterrupted() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) { /* needs a fresh gesture */ }
    }
  }

  get currentTime() { return this.ctx ? this.ctx.currentTime : 0; }

  // -------------------------------------------------------------------------
  // Microphone
  // -------------------------------------------------------------------------

  /**
   * Open the microphone and wire it to the pitch worklet.
   * Assumes unlock() has already run inside a user gesture.
   */
  async startInput() {
    if (!this.ctx) throw new Error('Call unlock() from a user gesture first.');
    if (this.workletNode) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const e = new Error('getUserMedia is unavailable. This page must be served over HTTPS.');
      e.name = 'SecurityError';
      throw e;
    }

    // Every one of these processing features is actively harmful here.
    // Echo cancellation and noise suppression are tuned for speech and will
    // gate, duck and spectrally mangle a piano; AGC makes the RMS reading
    // meaningless and pumps during decay. iOS honours these hints only
    // partially, which is one more reason calibration is not optional.
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      },
      video: false
    };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Safari rejects the whole request if it dislikes any constraint, so
      // fall back to the barest possible ask rather than failing outright.
      if (err && (err.name === 'OverconstrainedError' || err.name === 'TypeError')) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw err;
      }
    }

    // Holding this reference matters: Safari has historically garbage-collected
    // a MediaStream that only the graph refers to, killing audio mid-session.
    this.stream = stream;

    await loadPitchWorklet(this.ctx, this.basePath);

    this.sourceNode = this.ctx.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(this.ctx, 'pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { windowSize: this.windowSize }
    });

    this.workletNode.port.onmessage = (e) => {
      const msg = e.data;
      if (msg && msg.type === 'anchor') this.anchor = msg;
      for (const fn of this._messageHandlers) fn(msg);
    };

    // The worklet has zero outputs, so it needs no connection to destination.
    // Chrome will still pull on it because it has a connected input.
    this.sourceNode.connect(this.workletNode);
  }

  async stopInput() {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'stop' }); } catch (_) {}
      try { this.workletNode.disconnect(); } catch (_) {}
      this.workletNode = null;
    }
    if (this.sourceNode) { try { this.sourceNode.disconnect(); } catch (_) {} this.sourceNode = null; }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.anchor = null;
  }

  onWorkletMessage(fn) {
    this._messageHandlers.add(fn);
    return () => this._messageHandlers.delete(fn);
  }

  configureDetector(cfg) {
    if (this.workletNode) this.workletNode.port.postMessage({ type: 'config', ...cfg });
  }

  // -------------------------------------------------------------------------
  // Latency reporting
  // -------------------------------------------------------------------------

  /**
   * Everything the platform will tell us about latency, plus honest notes on
   * what each number does and does not cover.
   *
   * baseLatency   — the context's own processing buffer, output side.
   * outputLatency — buffer + OS + device, i.e. how long after currentTime a
   *                 sample scheduled now actually leaves the speaker. Safari
   *                 frequently reports 0 or omits it entirely.
   * INPUT latency is not exposed by any browser. The microphone path has its
   * own buffering, the OS has its own, and on iOS a Bluetooth headset adds
   * 100-200 ms on top. That unknown is exactly what the calibration routine
   * measures, and it is why the calibrated figure, not these numbers, is what
   * the scorer uses.
   */
  getLatencyReport() {
    const ctx = this.ctx;
    if (!ctx) return { available: false };

    const baseLatency = typeof ctx.baseLatency === 'number' ? ctx.baseLatency : null;
    const rawOutput = typeof ctx.outputLatency === 'number' ? ctx.outputLatency : null;
    const outputLatency = (rawOutput && rawOutput > 0) ? rawOutput : null;

    let deviceLabel = null;
    if (this.stream) {
      const track = this.stream.getAudioTracks()[0];
      if (track) deviceLabel = track.label || null;
    }

    return {
      available: true,
      sampleRate: ctx.sampleRate,
      state: ctx.state,
      baseLatency,
      outputLatency,
      outputLatencyReported: rawOutput !== null,
      // Round-trip lower bound from the numbers we actually have. The true
      // figure is always larger because the input path is invisible.
      knownOutputPathSec: (baseLatency || 0) + (outputLatency || 0),
      frameClockSkew: this.anchor ? this.anchor.frameClockSkew : null,
      inputDevice: deviceLabel,
      renderQuantumSec: 128 / ctx.sampleRate
    };
  }
}
