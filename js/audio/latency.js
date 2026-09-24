// latency.js — latency measurement, calibration and the stored offset.
//
// WHY THIS EXISTS
// ---------------
// When the app decides whether you played on the beat, it compares a detected
// onset time against a scheduled beat time. Those two numbers live on the same
// AudioContext clock, but they are separated by a chain of delays that the
// clock knows nothing about:
//
//   your finger -> the piano's own sound -> air -> the phone's microphone ->
//   OS input buffer -> browser input buffer -> our worklet -> onset detected
//
// and on the output side, from the beat time we scheduled to the click you
// actually hear. Nothing in the Web Audio API reports the input half. So the
// only honest way to get the number is to measure it: play a click track, have
// the user play along with it, and look at the systematic offset between when
// each note *should* have landed and when we *detected* it.
//
// The result is a single scalar, `offsetSec`, defined as:
//     offsetSec = median(detectedOnsetTime - intendedBeatTime)
// It is almost always positive (detection lags reality). The scorer subtracts
// it from every detected onset before comparing against the beat grid.
//
// We keep the spread as well, because a wide spread means the measurement is
// not trustworthy (the user played sloppily, or the environment is noisy) and
// the UI should say so rather than quietly applying a bad number.

const STORAGE_KEY = 'pianotrainer.latency.v1';

/** @returns {number} */
function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ---------------------------------------------------------------------------

export class LatencyCalibration {
  constructor() {
    this.offsetSec = 0;
    this.spreadSec = null;
    this.sampleCount = 0;
    this.measuredAt = null;
    this.manualAdjustSec = 0;
    this.source = 'default';   // 'default' | 'measured' | 'manual'
    this.load();
  }

  /** The number the scorer actually uses. */
  get effectiveOffsetSec() { return this.offsetSec + this.manualAdjustSec; }

  /**
   * Convert a raw detected onset time into the time the note was really played,
   * on the same clock as the scheduled beat grid.
   */
  correct(detectedTime) { return detectedTime - this.effectiveOffsetSec; }

  /** Is the stored measurement good enough to trust? */
  get quality() {
    if (this.source === 'default') return { level: 'none', note: 'Not calibrated yet — timing scores will be unreliable.' };
    if (this.sampleCount < 6) return { level: 'poor', note: 'Too few usable notes. Run calibration again.' };
    if (this.spreadSec == null) return { level: 'ok', note: '' };
    const ms = this.spreadSec * 1000;
    if (ms > 60) return { level: 'poor', note: `Very inconsistent (±${ms.toFixed(0)} ms). Try again, playing steadily with the click.` };
    if (ms > 30) return { level: 'fair', note: `Somewhat inconsistent (±${ms.toFixed(0)} ms).` };
    return { level: 'good', note: `Consistent (±${ms.toFixed(0)} ms).` };
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.offsetSec = d.offsetSec || 0;
      this.spreadSec = d.spreadSec != null ? d.spreadSec : null;
      this.sampleCount = d.sampleCount || 0;
      this.measuredAt = d.measuredAt || null;
      this.manualAdjustSec = d.manualAdjustSec || 0;
      this.source = d.source || 'measured';
    } catch (_) { /* private browsing, quota, corrupt value — ignore */ }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        offsetSec: this.offsetSec,
        spreadSec: this.spreadSec,
        sampleCount: this.sampleCount,
        measuredAt: this.measuredAt,
        manualAdjustSec: this.manualAdjustSec,
        source: this.source
      }));
    } catch (_) { /* nothing we can do; the session still works */ }
  }

  applyResult(result) {
    this.offsetSec = result.offsetSec;
    this.spreadSec = result.spreadSec;
    this.sampleCount = result.accepted.length;
    this.measuredAt = new Date().toISOString();
    this.source = 'measured';
    this.save();
  }

  setManualAdjust(sec) {
    this.manualAdjustSec = sec;
    this.save();
  }

  reset() {
    this.offsetSec = 0; this.spreadSec = null; this.sampleCount = 0;
    this.measuredAt = null; this.manualAdjustSec = 0; this.source = 'default';
    this.save();
  }
}

// ---------------------------------------------------------------------------

/**
 * Run one calibration pass.
 *
 * The user hears `leadInBeats` clicks to lock onto the tempo, then plays any
 * single note on each of the following `measureBeats` clicks. We record the
 * detected onset for each and take the median deviation.
 *
 * Median rather than mean, and IQR rather than standard deviation, because one
 * missed or doubled note would drag a mean badly and we would never know.
 *
 * @param {object} o
 * @param {import('./engine.js').AudioEngine} o.engine
 * @param {import('./metronome.js').Metronome} o.metronome
 * @param {import('./input-source.js').InputSource} o.input
 * @param {number} [o.bpm]
 * @param {number} [o.leadInBeats]
 * @param {number} [o.measureBeats]
 * @param {(p:{phase:string, beat:number, total:number, hits:number})=>void} [o.onProgress]
 * @returns {Promise<{offsetSec:number, spreadSec:number, accepted:number[], rejected:number[], beatTimes:number[], raw:{t:number,delta:number}[]}>}
 */
export async function runCalibration(o) {
  const {
    engine, metronome, input,
    bpm = 72, leadInBeats = 4, measureBeats = 12,
    onProgress = () => {}
  } = o;

  const ctx = engine.ctx;
  const prevBpm = metronome.bpm;
  metronome.bpm = bpm;
  const period = metronome.period;

  // Everything is scheduled up front against the audio clock. Half a second of
  // headroom so the first click is not late on a slow device.
  const start = ctx.currentTime + 0.5;
  const totalBeats = leadInBeats + measureBeats;
  const allBeats = metronome.scheduleRun(start, totalBeats);
  const targetBeats = allBeats.slice(leadInBeats);

  /** @type {{t:number}[]} */
  const onsets = [];
  const windowStart = targetBeats[0] - period / 2;
  const windowEnd = targetBeats[targetBeats.length - 1] + period / 2;

  const unsub = input.on('note', ev => {
    if (ev.t >= windowStart && ev.t <= windowEnd) {
      onsets.push({ t: ev.t });
      onProgress({ phase: 'measuring', beat: 0, total: measureBeats, hits: onsets.length });
    }
  });

  // Wait out the run on the audio clock. requestAnimationFrame is only a
  // polling wakeup; the decision to finish is made by comparing ctx.currentTime
  // against a time we computed from the audio clock in the first place.
  await waitUntil(ctx, windowEnd + 0.35, (now) => {
    const beat = Math.max(0, Math.floor((now - start) / period));
    onProgress({
      phase: beat < leadInBeats ? 'lead-in' : 'measuring',
      beat: Math.min(beat, totalBeats),
      total: totalBeats,
      hits: onsets.length
    });
  });

  unsub();
  metronome.bpm = prevBpm;

  // Pair each onset with its nearest intended beat, one onset per beat.
  const raw = [];
  const used = new Set();
  for (const on of onsets) {
    let bestIdx = -1, bestAbs = Infinity;
    for (let i = 0; i < targetBeats.length; i++) {
      const d = Math.abs(on.t - targetBeats[i]);
      if (d < bestAbs) { bestAbs = d; bestIdx = i; }
    }
    if (bestIdx < 0) continue;
    // Two onsets nearest the same beat: keep the closer one, drop the other as
    // a stray (a bounced key, a page turn, a cough).
    const key = bestIdx;
    const delta = on.t - targetBeats[bestIdx];
    const existing = raw.find(r => r.beatIdx === key);
    if (existing) {
      if (Math.abs(delta) < Math.abs(existing.delta)) { existing.delta = delta; existing.t = on.t; }
      continue;
    }
    used.add(key);
    raw.push({ beatIdx: key, t: on.t, delta });
  }

  // Reject anything more than a third of a beat, or 150 ms, from its beat.
  // Beyond that it is a wrong note rather than a latency measurement.
  const limit = Math.min(0.15, period / 3);
  const accepted = [], rejected = [];
  for (const r of raw) (Math.abs(r.delta) <= limit ? accepted : rejected).push(r.delta);

  accepted.sort((a, b) => a - b);
  const offsetSec = median(accepted);
  const q1 = quantile(accepted, 0.25), q3 = quantile(accepted, 0.75);
  const spreadSec = accepted.length >= 4 ? (q3 - q1) / 2 : null;

  return {
    offsetSec: accepted.length ? offsetSec : 0,
    spreadSec,
    accepted,
    rejected,
    beatTimes: targetBeats,
    raw
  };
}

/**
 * Resolve once the audio clock passes `time`.
 * @param {AudioContext} ctx
 * @param {number} time
 * @param {(now:number)=>void} [onTick]
 */
function waitUntil(ctx, time, onTick) {
  return new Promise(resolve => {
    const step = () => {
      const now = ctx.currentTime;
      if (onTick) onTick(now);
      if (now >= time) { resolve(); return; }
      requestAnimationFrame(step);
    };
    step();
  });
}
