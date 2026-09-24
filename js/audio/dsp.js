/* dsp.js — pitch and onset DSP. PLAIN SCRIPT, no import/export.
 *
 * This file is deliberately dependency-free and module-free so that it can be
 * used in two places without duplicating the code:
 *   1. concatenated into the AudioWorklet module (see worklet-loader.js), and
 *   2. loaded with a plain <script> tag by tests/dsp-test.html.
 *
 * Everything hangs off the single global `PianoDSP`.
 */
var PianoDSP = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // FFT — iterative radix-2, in place.
  // ---------------------------------------------------------------------------
  function FFT(size) {
    if ((size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.size = size;
    this.levels = Math.round(Math.log2(size));
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (var i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    for (var k = 0; k < size; k++) {
      var x = k, r = 0;
      for (var j = 0; j < this.levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[k] = r;
    }
  }

  FFT.prototype.transform = function (re, im, inverse) {
    var n = this.size, i, j, k, t;
    for (i = 0; i < n; i++) {
      j = this.rev[i];
      if (j > i) {
        t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1, step = n / size;
      for (i = 0; i < n; i += size) {
        for (j = i, k = 0; j < i + half; j++, k += step) {
          var c = this.cos[k];
          var s = inverse ? this.sin[k] : -this.sin[k];
          var l = j + half;
          var tre = re[l] * c - im[l] * s;
          var tim = re[l] * s + im[l] * c;
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre;        im[j] += tim;
        }
      }
    }
    if (inverse) {
      var inv = 1 / n;
      for (i = 0; i < n; i++) { re[i] *= inv; im[i] *= inv; }
    }
  };

  // ---------------------------------------------------------------------------
  // McLeod Pitch Method (MPM)
  //
  // Why MPM and not FFT peak-picking: on a piano the fundamental is frequently
  // 10-20 dB weaker than the 2nd or 3rd partial, especially in the bass and
  // especially on an upright or a digital piano's speaker. A spectral peak
  // picker locks onto the loudest partial and reports the wrong octave. MPM
  // works in the time domain on the Normalised Square Difference Function,
  // which peaks at the true period regardless of which partial is loudest.
  //
  // Why MPM and not YIN: they are close cousins, but MPM's NSDF is normalised
  // into [-1, 1] and its peak height at the chosen lag is directly usable as a
  // "clarity" confidence figure, which this app surfaces in the UI. YIN's
  // CMNDF needs extra massaging to get an equivalent number.
  //
  // Known limits (documented honestly in the README too):
  //   - Low notes need long windows. Two periods of A0 (27.5 Hz) is 73 ms.
  //     With the default 4096-sample window at 48 kHz (85 ms) the bottom
  //     octave is right at the edge and will be unreliable; the 8192 window
  //     ("low range" mode) covers it but costs latency.
  //   - The sustain pedal blurs notes together. MPM assumes one periodic
  //     source; overlapping decaying notes drive clarity down and can produce
  //     a pitch somewhere between the two.
  //   - Very high notes (above ~C7) have few samples per period and little
  //     harmonic content, so the parabolic interpolation gets noisy; cents
  //     readings up there wobble by several cents.
  // ---------------------------------------------------------------------------

  /**
   * @param {number} windowSize analysis window in samples (power of two)
   */
  function MPM(windowSize) {
    this.windowSize = windowSize;
    this.fftSize = windowSize * 2;
    this.fft = new FFT(this.fftSize);
    this.re = new Float32Array(this.fftSize);
    this.im = new Float32Array(this.fftSize);
    this.nsdf = new Float32Array(windowSize);
    // Scratch arrays for key-maximum collection, sized generously.
    this._maxPos = new Int32Array(256);
    this._maxVal = new Float32Array(256);
  }

  /**
   * @param {Float32Array} x windowSize samples
   * @param {number} sampleRate
   * @param {number} minFreq
   * @param {number} maxFreq
   * @returns {{frequency:number, clarity:number, rms:number}} frequency is 0 when unvoiced
   */
  MPM.prototype.detect = function (x, sampleRate, minFreq, maxFreq) {
    var W = this.windowSize, N = this.fftSize, i;

    // RMS gate first — cheap rejection of silence.
    var power = 0;
    for (i = 0; i < W; i++) power += x[i] * x[i];
    var rms = Math.sqrt(power / W);
    if (rms < 1e-4) return { frequency: 0, clarity: 0, rms: rms };

    // Autocorrelation r(tau) via FFT of the zero-padded window.
    this.re.fill(0); this.im.fill(0);
    for (i = 0; i < W; i++) this.re[i] = x[i];
    this.fft.transform(this.re, this.im, false);
    for (i = 0; i < N; i++) {
      var mag = this.re[i] * this.re[i] + this.im[i] * this.im[i];
      this.re[i] = mag; this.im[i] = 0;
    }
    this.fft.transform(this.re, this.im, true);
    // this.re[tau] is now r(tau) (unnormalised).

    // m(tau), the NSDF denominator, computed incrementally.
    // m(0) = 2 * sum(x^2); m(tau) = m(tau-1) - x[tau-1]^2 - x[W-tau]^2
    var m = 2 * power;
    this.nsdf[0] = 1;
    for (var tau = 1; tau < W; tau++) {
      m -= x[tau - 1] * x[tau - 1] + x[W - tau] * x[W - tau];
      this.nsdf[tau] = m > 0 ? (2 * this.re[tau]) / m : 0;
    }

    var tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
    var tauMax = Math.min(W - 2, Math.ceil(sampleRate / minFreq));
    if (tauMax <= tauMin) return { frequency: 0, clarity: 0, rms: rms };

    // Collect key maxima: within each region between a positive-going and the
    // following negative-going zero crossing of the NSDF, keep the single
    // highest value.
    var count = 0;
    var pos = -1, best = -1;
    var prev = this.nsdf[tauMin];
    for (var t = tauMin + 1; t <= tauMax; t++) {
      var v = this.nsdf[t];
      if (prev <= 0 && v > 0) {           // entering a positive region
        pos = t; best = v;
      } else if (pos >= 0) {
        if (v > best) { best = v; pos = t; }
        if (v <= 0) {                     // leaving it — commit the maximum
          if (count < this._maxPos.length) { this._maxPos[count] = pos; this._maxVal[count] = best; count++; }
          pos = -1;
        }
      }
      prev = v;
    }
    if (pos >= 0 && count < this._maxPos.length) { this._maxPos[count] = pos; this._maxVal[count] = best; count++; }
    if (count === 0) return { frequency: 0, clarity: 0, rms: rms };

    // Threshold: first key maximum reaching k * the highest key maximum.
    var globalMax = 0;
    for (i = 0; i < count; i++) if (this._maxVal[i] > globalMax) globalMax = this._maxVal[i];
    if (globalMax < 0.3) return { frequency: 0, clarity: globalMax, rms: rms };

    var K = 0.9;
    var threshold = K * globalMax;
    var chosen = 0;
    for (i = 0; i < count; i++) {
      if (this._maxVal[i] >= threshold) { chosen = i; break; }
    }

    // NOTE ON OCTAVE ERRORS. An earlier version of this file added a
    // "sub-octave guard" that preferred a key maximum at ~2x the chosen lag
    // when it was nearly as tall. That is wrong, and the test suite caught it
    // reporting every note exactly one octave flat: for a periodic signal the
    // NSDF peaks at EVERY integer multiple of the true period, all of them
    // nearly equal in height, so such a rule always fires and always halves
    // the frequency. The k-threshold below is the correct and sufficient
    // mechanism — taking the FIRST key maximum that reaches k * the tallest
    // one is precisely what stops a dominant 2nd partial winning, without
    // dragging the estimate down an octave.
    var chosenTau = this._maxPos[chosen];

    // Parabolic interpolation around the chosen lag for sub-sample precision.
    var tIdx = chosenTau;
    var y0 = this.nsdf[tIdx - 1], y1 = this.nsdf[tIdx], y2 = this.nsdf[tIdx + 1];
    var denom = 2 * (2 * y1 - y0 - y2);
    var delta = denom !== 0 ? (y2 - y0) / denom : 0;
    if (delta > 1 || delta < -1) delta = 0;
    var period = tIdx + delta;
    var clarity = y1 - 0.25 * (y0 - y2) * delta;

    var frequency = sampleRate / period;
    if (frequency < minFreq || frequency > maxFreq) return { frequency: 0, clarity: clarity, rms: rms };
    return { frequency: frequency, clarity: Math.max(0, Math.min(1, clarity)), rms: rms };
  };

  // ---------------------------------------------------------------------------
  // Onset detector — spectral flux with an adaptive median threshold.
  //
  // Kept completely separate from pitch tracking. That separation is the whole
  // point: if you infer note events from pitch alone, playing the same note
  // twice in a row reads as one long held pitch. Spectral flux sees the second
  // attack as a burst of new energy and fires a second event.
  // ---------------------------------------------------------------------------

  /**
   * @param {number} fftSize analysis size for the flux spectrum
   * @param {number} historyLen frames of flux history for the adaptive threshold
   */
  function OnsetDetector(fftSize, historyLen) {
    this.fftSize = fftSize;
    this.fft = new FFT(fftSize);
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.window = new Float32Array(fftSize);
    for (var i = 0; i < fftSize; i++) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)); // Hann
    }
    this.bins = fftSize / 2;
    this.prevMag = new Float32Array(this.bins);
    this.historyLen = historyLen;
    this.history = new Float32Array(historyLen);
    this.historyIdx = 0;
    this.historyFilled = 0;
    this._sorted = new Float32Array(historyLen);
    this.lastFlux = 0;
    this.lastThreshold = 0;

    // Magnitudes are normalised so that a sinusoid of amplitude a produces a
    // peak of about a/4 (half from the transform, half from the Hann window).
    // That makes the absolute noise floor below a real, tunable number rather
    // than something that silently scales with the FFT size.
    this.magScale = 2 / fftSize;

    // The absolute floor is tight, and measurement says it has to be. Striking
    // a key that is ALREADY ringing changes the spectrum only slightly: the
    // browser suite measures flux of about 0.0185 for the second strike of a
    // repeated note, against this floor of 0.015 — a margin of 23%. Raise the
    // floor and repeated notes start being swallowed, which is the single
    // thing the separate onset path exists to get right.
    //
    // The cost of a floor that low is honest sensitivity to broadband thumps:
    // a dropped book, a slammed lid, a knock on the piano case can register as
    // a note. Such an onset usually resolves to no confident pitch and is then
    // discarded by MicInputSource._flush, so it rarely reaches the UI — but it
    // is the reason the detector is not, and cannot be, immune to clatter.
    this.floor = 0.015;
    this.factor = 3.0;

    // Hysteresis. Without it a single piano attack fires an onset on every
    // frame until the running median catches up, because the median is still
    // dominated by the silence that preceded the note. The detector re-arms
    // only after the flux has fallen well back below threshold.
    this.armed = true;
    this.rearmRatio = 0.5;
  }

  /**
   * Feed one frame. Returns true when this frame is an onset.
   * @param {Float32Array} x fftSize samples ending at "now"
   */
  OnsetDetector.prototype.process = function (x) {
    var n = this.fftSize, i;
    for (i = 0; i < n; i++) { this.re[i] = x[i] * this.window[i]; this.im[i] = 0; }
    this.fft.transform(this.re, this.im, false);

    // Half-wave rectified spectral flux over the low 2/3 of the spectrum.
    // Ignoring the very top bins keeps hiss and key-noise from firing onsets.
    var flux = 0;
    var top = Math.floor(this.bins * 0.66);
    var s = this.magScale;
    for (i = 1; i < top; i++) {
      var mag = Math.sqrt(this.re[i] * this.re[i] + this.im[i] * this.im[i]) * s;
      var d = mag - this.prevMag[i];
      if (d > 0) flux += d;
      this.prevMag[i] = mag;
    }
    for (; i < this.bins; i++) {
      this.prevMag[i] = Math.sqrt(this.re[i] * this.re[i] + this.im[i] * this.im[i]) * s;
    }
    this.lastFlux = flux;

    // Adaptive threshold: median of recent flux, scaled, plus an absolute
    // floor. Median rather than mean so that the attack transients already in
    // the history do not raise the bar for the next note.
    var thr = Infinity;
    if (this.historyFilled >= 8) {
      var len = this.historyFilled;
      for (i = 0; i < len; i++) this._sorted[i] = this.history[i];
      var sub = this._sorted.subarray(0, len);
      Array.prototype.sort.call(sub, function (a, b) { return a - b; });
      var median = sub[len >> 1];
      thr = median * this.factor + this.floor;
    }
    this.lastThreshold = thr;

    this.history[this.historyIdx] = flux;
    this.historyIdx = (this.historyIdx + 1) % this.historyLen;
    if (this.historyFilled < this.historyLen) this.historyFilled++;

    if (!this.armed) {
      if (flux < thr * this.rearmRatio) this.armed = true;
      return false;
    }
    if (flux > thr) { this.armed = false; return true; }
    return false;
  };

  return { FFT: FFT, MPM: MPM, OnsetDetector: OnsetDetector };
})();

// Make it reachable from a module context too when loaded via <script>.
if (typeof self !== 'undefined') { self.PianoDSP = PianoDSP; }
