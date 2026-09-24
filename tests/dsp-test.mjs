// dsp-test.mjs — headless check of the pitch and onset DSP.
//
//   node tests/dsp-test.mjs
//
// Synthesises piano-like tones (deliberately with a WEAK fundamental and
// strong upper partials, which is the case that breaks FFT peak-picking) and
// checks that MPM recovers the right note and a sane cents figure. Then feeds
// a repeated-note signal to the onset detector and checks it fires twice.
//
// This runs the exact same dsp.js the browser loads — no second copy.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'audio', 'dsp.js'), 'utf8');
const PianoDSP = new Function(`${src}; return PianoDSP;`)();

const SR = 48000;
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** A piano-ish partial mix: fundamental quieter than partials 2 and 3. */
function synth(freq, n, {
  detuneCents = 0, weakFundamental = true, noise = 0.002, decay = 2.5,
  inharmonicity = 0.0004
} = {}) {
  const f = freq * Math.pow(2, detuneCents / 1200);
  const amps = weakFundamental
    ? [0.22, 1.0, 0.75, 0.40, 0.28, 0.16, 0.10, 0.06]
    : [1.0, 0.45, 0.28, 0.16, 0.10, 0.06, 0.04, 0.02];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let h = 0; h < amps.length; h++) {
      const hf = f * (h + 1) * (1 + inharmonicity * h * h);
      if (hf > SR / 2) break;
      v += amps[h] * Math.sin(2 * Math.PI * hf * t);
    }
    out[i] = 0.22 * v * Math.exp(-decay * t) + noise * (Math.random() * 2 - 1);
  }
  return out;
}

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  ' + detail : ''}`);
};

// ---------------------------------------------------------------------------
console.log('\nMPM pitch detection — weak fundamental, strong partials');
for (const W of [4096, 8192]) {
  const mpm = new PianoDSP.MPM(W);
  console.log(`\n  window ${W} (${(W / SR * 1000).toFixed(0)} ms)`);
  // A1=33, C2=36, C3=48, A3=57, C4=60, A4=69, C5=72, C6=84, C7=96
  for (const midi of [33, 36, 48, 57, 60, 69, 72, 84, 96]) {
    const f = midiToFreq(midi);
    const buf = synth(f, W);
    const r = mpm.detect(buf, SR, 27, 4300);
    const detectedMidi = r.frequency > 0 ? Math.round(69 + 12 * Math.log2(r.frequency / 440)) : null;
    const cents = r.frequency > 0 ? (12 * Math.log2(r.frequency / f)) * 100 : NaN;
    const minPeriods = (W / SR) * f;
    const expectUsable = minPeriods >= 2.5;
    const ok = detectedMidi === midi && Math.abs(cents) < 10;
    check(ok || !expectUsable,
      `midi ${midi} (${f.toFixed(1)} Hz, ${minPeriods.toFixed(1)} periods in window)`,
      `-> ${detectedMidi ?? 'none'}  ${isNaN(cents) ? '' : cents.toFixed(1) + '¢'}  clarity ${r.clarity.toFixed(2)}${expectUsable ? '' : '  [below usable range, not counted]'}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\nMPM cents accuracy — deliberately detuned A4, perfectly harmonic');
{
  const mpm = new PianoDSP.MPM(4096);
  for (const cents of [-37, -12, 0, 8, 29]) {
    const buf = synth(midiToFreq(69), 4096, { detuneCents: cents, inharmonicity: 0 });
    const r = mpm.detect(buf, SR, 27, 4300);
    const got = (12 * Math.log2(r.frequency / midiToFreq(69))) * 100;
    check(Math.abs(got - cents) < 2, `detune ${cents}¢`, `-> ${got.toFixed(1)}¢`);
  }
}

// ---------------------------------------------------------------------------
// This is behaviour, not a defect, and it is worth pinning down so nobody
// later "fixes" it. Real piano strings are stiff, so their partials sit
// progressively sharp of exact multiples of the fundamental. Any period-based
// detector — MPM, YIN, plain autocorrelation — locks onto the period implied
// by that stretched partial series and therefore reads a few cents sharp of
// the nominal fundamental. More inharmonicity (shorter, thicker strings, i.e.
// the bass end of a small piano) means more of it.
console.log('\nInharmonicity reads slightly sharp — expected physical behaviour');
{
  const mpm = new PianoDSP.MPM(4096);
  for (const inh of [0, 0.0002, 0.0004, 0.0010]) {
    const buf = synth(midiToFreq(60), 4096, { inharmonicity: inh });
    const r = mpm.detect(buf, SR, 27, 4300);
    const got = (12 * Math.log2(r.frequency / midiToFreq(60))) * 100;
    check(got >= -1 && got < 25, `inharmonicity ${inh}`, `-> ${got.toFixed(1)}¢ sharp`);
  }
}

// ---------------------------------------------------------------------------
console.log('\nMPM rejects silence and noise');
{
  const mpm = new PianoDSP.MPM(4096);
  const silence = new Float32Array(4096);
  check(mpm.detect(silence, SR, 27, 4300).frequency === 0, 'silence -> unvoiced');
  const noise = new Float32Array(4096).map(() => (Math.random() * 2 - 1) * 0.1);
  const r = mpm.detect(noise, SR, 27, 4300);
  check(r.clarity < 0.75, 'white noise -> low clarity', `clarity ${r.clarity.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
console.log('\nOnset detection — the same note struck twice');
{
  const HOP = 512, FFT = 1024;
  const det = new PianoDSP.OnsetDetector(FFT, 43);
  const total = SR * 2;                      // 2 seconds
  const sig = new Float32Array(total);
  const strikeAt = [0.45, 1.05, 1.45];       // seconds
  for (const s of strikeAt) {
    const start = Math.floor(s * SR);
    const tone = synth(midiToFreq(60), total - start, { decay: 5 });
    for (let i = 0; i < tone.length; i++) sig[start + i] += tone[i];
  }

  const win = new Float32Array(FFT);
  const found = [];
  let lastT = -1;
  for (let end = FFT; end <= total; end += HOP) {
    win.set(sig.subarray(end - FFT, end));
    const t = end / SR;
    if (det.process(win) && (lastT < 0 || t - lastT >= 0.045)) { found.push(t); lastT = t; }
  }

  check(found.length === strikeAt.length,
    `three strikes of the SAME note -> three onsets`,
    `found ${found.length}: [${found.map(f => f.toFixed(3)).join(', ')}]`);

  if (found.length === strikeAt.length) {
    const errs = found.map((f, i) => (f - strikeAt[i]) * 1000);
    const worst = Math.max(...errs.map(Math.abs));
    // Onsets are stamped at the END of the analysis window, so a positive bias
    // of up to one window (21 ms) is expected and systematic — exactly the
    // thing calibration removes.
    check(worst < 45, 'onset timing bias is small and systematic',
      `deviations ${errs.map(e => e.toFixed(1)).join(', ')} ms`);
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
