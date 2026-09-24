/* pitch-processor.js — the AudioWorkletProcessor. PLAIN SCRIPT, no import/export.
 *
 * Loaded by worklet-loader.js, which concatenates dsp.js + this file into one
 * Blob and hands it to audioWorklet.addModule(). That avoids relying on ES
 * module imports working inside AudioWorkletGlobalScope, which is patchy on
 * iOS Safari, while still keeping exactly one copy of the DSP code.
 *
 * AudioWorklet, not ScriptProcessorNode: ScriptProcessorNode is deprecated,
 * runs on the main thread, and its buffering adds tens of milliseconds of
 * jitter to exactly the measurement we care most about here.
 *
 * Every event leaving this processor is stamped against the audio clock
 * (derived from the sample counter), never Date.now() or performance.now().
 */

const RING_SIZE = 32768;      // >= largest analysis window, power of two
const HOP = 512;              // analysis hop in samples (~10.7 ms at 48 kHz)
const ONSET_FFT = 1024;       // onset analysis window
const FLUX_HISTORY = 43;      // ~0.46 s of flux history for the median threshold

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return []; }

  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};

    this.windowSize = opts.windowSize || 4096;
    this.minFreq = opts.minFreq || 27.0;     // A0 is 27.5 Hz
    this.maxFreq = opts.maxFreq || 4300.0;   // C8 is 4186 Hz
    this.clarityThreshold = opts.clarityThreshold != null ? opts.clarityThreshold : 0.55;
    this.minOnsetGapSec = opts.minOnsetGapSec != null ? opts.minOnsetGapSec : 0.045;

    this.mpm = new PianoDSP.MPM(this.windowSize);
    this.onset = new PianoDSP.OnsetDetector(ONSET_FFT, FLUX_HISTORY);

    this.ring = new Float32Array(RING_SIZE);
    this.writeIdx = 0;          // next write position in the ring
    this.written = 0;           // total samples ever written (the sample clock)
    this.sinceHop = 0;

    this.pitchWin = new Float32Array(this.windowSize);
    this.onsetWin = new Float32Array(ONSET_FFT);

    this.hopCount = 0;
    this.lastOnsetTime = -1;

    // Clock anchor, captured on the very first render quantum. Sample n
    // (0-based, counting every sample ever handed to this processor) occurred
    // at context time anchorTime + n / sampleRate.
    this.anchorTime = -1;

    this.running = true;

    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'config') {
        if (msg.windowSize && msg.windowSize !== this.windowSize) {
          this.windowSize = msg.windowSize;
          this.mpm = new PianoDSP.MPM(this.windowSize);
          this.pitchWin = new Float32Array(this.windowSize);
        }
        if (msg.minFreq != null) this.minFreq = msg.minFreq;
        if (msg.maxFreq != null) this.maxFreq = msg.maxFreq;
        if (msg.clarityThreshold != null) this.clarityThreshold = msg.clarityThreshold;
        if (msg.minOnsetGapSec != null) this.minOnsetGapSec = msg.minOnsetGapSec;
      } else if (msg.type === 'stop') {
        this.running = false;
      }
    };
  }

  /** Copy the most recent `len` samples out of the ring, oldest first. */
  _readTail(len, out) {
    let start = (this.writeIdx - len + RING_SIZE) % RING_SIZE;
    if (start + len <= RING_SIZE) {
      out.set(this.ring.subarray(start, start + len));
    } else {
      const first = RING_SIZE - start;
      out.set(this.ring.subarray(start, RING_SIZE), 0);
      out.set(this.ring.subarray(0, len - first), first);
    }
  }

  /** Context time of the newest sample currently in the ring. */
  _tailTime() {
    return this.anchorTime + this.written / sampleRate;
  }

  process(inputs) {
    if (!this.running) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch) return true;

    if (this.anchorTime < 0) {
      this.anchorTime = currentTime;
      this.port.postMessage({
        type: 'anchor',
        anchorTime: this.anchorTime,
        currentFrame: currentFrame,
        sampleRate: sampleRate,
        // currentTime and currentFrame/sampleRate should agree; any gap is
        // worth surfacing because it means the clock is not what we assume.
        frameClockSkew: this.anchorTime - currentFrame / sampleRate
      });
    }

    for (let i = 0; i < ch.length; i++) {
      this.ring[this.writeIdx] = ch[i];
      this.writeIdx = (this.writeIdx + 1) % RING_SIZE;
    }
    this.written += ch.length;
    this.sinceHop += ch.length;

    while (this.sinceHop >= HOP) {
      this.sinceHop -= HOP;
      this._runHop();
    }

    return true;
  }

  _runHop() {
    if (this.written < ONSET_FFT) return;
    const now = this._tailTime();
    this.hopCount++;

    // --- Onset path (every hop, so timing resolution is ~10.7 ms) ---------
    this._readTail(ONSET_FFT, this.onsetWin);
    const isOnset = this.onset.process(this.onsetWin);
    if (isOnset && (this.lastOnsetTime < 0 || now - this.lastOnsetTime >= this.minOnsetGapSec)) {
      this.lastOnsetTime = now;
      this.port.postMessage({
        type: 'onset',
        // Stamped at the end of the analysis window: the attack transient is
        // what pushed the flux over threshold, and it arrived within this hop.
        // Remaining bias is systematic and is what calibration removes.
        t: now,
        flux: this.onset.lastFlux,
        threshold: this.onset.lastThreshold
      });
    }

    // --- Pitch path (every other hop, ~21 ms) ----------------------------
    if (this.hopCount % 2 !== 0) return;
    if (this.written < this.windowSize) return;
    this._readTail(this.windowSize, this.pitchWin);
    const r = this.mpm.detect(this.pitchWin, sampleRate, this.minFreq, this.maxFreq);
    this.port.postMessage({
      type: 'analysis',
      t: now,
      // The window looks backwards, so the pitch estimate is centred roughly
      // half a window ago. The UI uses `t` for display and `centreT` when it
      // needs to associate a pitch with an onset.
      centreT: now - (this.windowSize / 2) / sampleRate,
      frequency: r.frequency,
      clarity: r.clarity,
      rms: r.rms,
      voiced: r.frequency > 0 && r.clarity >= this.clarityThreshold
    });
  }
}

registerProcessor('pitch-processor', PitchProcessor);
