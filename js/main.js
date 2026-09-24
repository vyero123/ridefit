// main.js — wiring. Owns no DSP and no music theory; it connects the engine,
// the input source, the notation renderer and the DOM.

import { AudioEngine } from './audio/engine.js';
import { MicInputSource } from './audio/input-source.js';
import { Metronome } from './audio/metronome.js';
import { LatencyCalibration, runCalibration } from './audio/latency.js';
import { StaffRenderer } from './notation/staff.js';
import { midiToName, midiToFreq } from './music/pitch.js';
import { loadAllExercises } from './exercises/loader.js';

const $ = (id) => document.getElementById(id);
const ms = (sec, digits = 1) => (sec * 1000).toFixed(digits);

const engine = new AudioEngine({ windowSize: 4096 });
const metronome = new Metronome(engine);
const calibration = new LatencyCalibration();
/** @type {MicInputSource|null} */
let input = null;

const staff = new StaffRenderer($('staff'), { clef: 'treble', widthUnits: 26 });

const state = {
  running: false,
  a4: 440,
  onsetCount: 0,
  exercises: [],
  exercise: null,
  noteIndex: 0,
  lastFrameAt: 0,
  calibrating: false
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (!window.isSecureContext) $('insecure-banner').hidden = false;

setupTabs();
setupControls();
renderLatencyPanel();
loadExercises();

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

$('btn-start').addEventListener('click', async () => {
  $('start-error').textContent = '';
  setStatus('starting', 'Starting…');
  try {
    // unlock() must run inside this gesture handler. Any await before it and
    // iOS no longer counts the call as user-initiated.
    await engine.unlock();

    input = new MicInputSource(engine, { a4: state.a4 });
    input.on('status', s => {
      setStatus(s.state, s.message);
      if (s.state === 'error') $('start-error').textContent = s.message;
    });
    input.on('frame', onFrame);
    input.on('note', onNote);

    await input.start();
    state.running = true;
    $('btn-start').hidden = true;
    $('btn-stop').hidden = false;
    $('btn-calibrate').disabled = false;
    renderLatencyPanel();
  } catch (err) {
    console.error(err);
    setStatus('error', 'Could not start');
    if (!$('start-error').textContent) $('start-error').textContent = String(err && err.message || err);
  }
});

$('btn-stop').addEventListener('click', async () => {
  if (input) await input.stop();
  state.running = false;
  $('btn-start').hidden = false;
  $('btn-stop').hidden = true;
  $('btn-calibrate').disabled = true;
  setNoteReadout(null);
});

// iOS suspends the context when the app goes to the background or a call
// arrives. Try to pick it back up when we return.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.running) engine.resumeIfInterrupted();
});
engine.onStateChange(s => {
  if (s === 'suspended' && state.running) setStatus('starting', 'Audio interrupted — tap anywhere');
  if (s === 'running' && state.running) setStatus('running', 'Listening');
});
document.addEventListener('touchend', () => { if (state.running) engine.resumeIfInterrupted(); }, { passive: true });

// ---------------------------------------------------------------------------
// Live readout
// ---------------------------------------------------------------------------

function onFrame(f) {
  // Throttle DOM writes to roughly a frame's worth; the detector runs faster
  // than the screen can usefully show.
  const now = performance.now();          // display-rate throttle only, never musical timing
  if (now - state.lastFrameAt < 45) return;
  state.lastFrameAt = now;

  setNoteReadout(f);
}

function setNoteReadout(f) {
  const nameEl = $('note-name');
  if (!f || !f.voiced || f.midi == null) {
    nameEl.textContent = '—';
    nameEl.classList.add('silent');
    $('freq-hz').textContent = '—';
    $('cents-value').textContent = '0¢';
    $('cents-needle').style.left = '50%';
    setMeter('clarity-meter', f ? f.clarity : 0);
    $('clarity-value').textContent = f ? f.clarity.toFixed(2) : '—';
    setMeter('rms-meter', f ? Math.min(1, f.rms * 8) : 0);
    $('rms-value').textContent = f ? (20 * Math.log10(Math.max(f.rms, 1e-6))).toFixed(0) + ' dB' : '—';
    return;
  }

  const name = midiToName(f.midi);
  const letter = name.replace(/-?\d+$/, '');
  const octave = name.slice(letter.length);
  nameEl.classList.remove('silent');
  nameEl.innerHTML = `${letter}<span class="octave">${octave}</span>`;

  $('freq-hz').textContent = f.frequency.toFixed(1);
  const cents = Math.max(-50, Math.min(50, f.cents));
  $('cents-value').textContent = `${cents >= 0 ? '+' : ''}${cents.toFixed(0)}¢`;
  $('cents-needle').style.left = `${50 + cents}%`;
  $('cents-needle').style.background = Math.abs(cents) <= 10
    ? 'var(--good)' : Math.abs(cents) <= 25 ? 'var(--warn)' : 'var(--bad)';

  $('clarity-value').textContent = f.clarity.toFixed(2);
  setMeter('clarity-meter', f.clarity, f.clarity > 0.8);
  const db = 20 * Math.log10(Math.max(f.rms, 1e-6));
  $('rms-value').textContent = `${db.toFixed(0)} dB`;
  setMeter('rms-meter', Math.min(1, (db + 60) / 60));
}

function setMeter(id, value01, good = false) {
  const m = $(id);
  m.classList.toggle('good', good);
  m.firstElementChild.style.width = `${Math.max(0, Math.min(1, value01)) * 100}%`;
}

function onNote(ev) {
  state.onsetCount++;
  $('onset-count').textContent = String(state.onsetCount);
  $('last-onset').innerHTML = `${ev.t.toFixed(2)}<small> s</small>`;

  const flash = $('onset-flash');
  flash.classList.add('hit');
  setTimeout(() => flash.classList.remove('hit'), 120);   // purely cosmetic

  if (!state.calibrating) checkPracticeNote(ev);
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

async function loadExercises() {
  try {
    const { exercises, errors } = await loadAllExercises('exercises/');
    state.exercises = exercises;
    for (const e of errors) console.warn('Exercise failed to load:', e.file, e.message);

    const sel = $('exercise-select');
    sel.innerHTML = '';
    for (const ex of exercises) {
      const o = document.createElement('option');
      o.value = ex.id; o.textContent = ex.title;
      sel.appendChild(o);
    }
    if (errors.length) {
      const o = document.createElement('option');
      o.disabled = true;
      o.textContent = `(${errors.length} file(s) failed — see console)`;
      sel.appendChild(o);
    }
    if (exercises.length) selectExercise(exercises[0].id);
  } catch (err) {
    console.error(err);
    $('exercise-desc').textContent = `Could not load exercises: ${err.message}`;
  }
}

function selectExercise(id) {
  const ex = state.exercises.find(e => e.id === id);
  if (!ex) return;
  state.exercise = ex;
  state.noteIndex = 0;
  $('exercise-desc').textContent = ex.description;
  staff.setClef(ex.clef);
  drawExercise();
}

/** Phase 1 shows one note at a time. The renderer already takes a list. */
function drawExercise() {
  const ex = state.exercise;
  if (!ex) return;
  const n = ex.notes[state.noteIndex];
  if (!n) { finishExercise(); return; }

  staff.render([{
    id: n.id,
    midi: n.midi,
    spelling: n.spelling,
    accidental: n.accidental,
    clef: n.clef,
    state: 'target',
    x: 11
  }]);

  $('target-name').textContent = midiToName(n.midi, ex.preferFlats);
  $('target-freq').textContent = `${midiToFreq(n.midi, state.a4).toFixed(1)} Hz`;
  $('feedback').textContent = state.running ? 'Listening…' : 'Start the microphone first.';
  $('feedback').className = 'feedback';
  drawProgressDots();
}

function drawProgressDots() {
  const ex = state.exercise;
  const wrap = $('progress-dots');
  wrap.innerHTML = '';
  ex.notes.forEach((_, i) => {
    const dot = document.createElement('i');
    if (i < state.noteIndex) dot.className = 'done';
    else if (i === state.noteIndex) dot.className = 'current';
    wrap.appendChild(dot);
  });
}

function checkPracticeNote(ev) {
  const ex = state.exercise;
  if (!ex) return;
  const target = ex.notes[state.noteIndex];
  if (!target) return;

  const strict = ex.tolerance.octaveStrict;
  const same = strict
    ? ev.midi === target.midi
    : ((ev.midi % 12) + 12) % 12 === ((target.midi % 12) + 12) % 12;

  const fb = $('feedback');
  if (same) {
    staff.setNoteState(target.id, 'correct');
    fb.textContent = `${midiToName(ev.midi)} — ${ev.cents >= 0 ? '+' : ''}${ev.cents.toFixed(0)}¢, confidence ${ev.clarity.toFixed(2)}`;
    fb.className = 'feedback good';
    state.noteIndex++;
    // Cosmetic pause so the green flash is visible; nothing musical depends
    // on this timer.
    setTimeout(drawExercise, 420);
  } else {
    staff.setNoteState(target.id, 'wrong');
    const diff = ev.midi - target.midi;
    const hint = Math.abs(diff) === 12 ? ' (right note, wrong octave)' : '';
    fb.textContent = `Heard ${midiToName(ev.midi)}${hint} — looking for ${midiToName(target.midi, ex.preferFlats)}`;
    fb.className = 'feedback bad';
    setTimeout(() => staff.setNoteState(target.id, 'target'), 500);
  }
}

function finishExercise() {
  staff.render([]);
  $('target-name').textContent = 'done';
  $('target-freq').textContent = '';
  $('feedback').textContent = 'Exercise complete.';
  $('feedback').className = 'feedback good';
  drawProgressDots();
}

$('exercise-select').addEventListener('change', e => selectExercise(e.target.value));
$('btn-restart').addEventListener('click', () => { state.noteIndex = 0; drawExercise(); });
$('btn-skip').addEventListener('click', () => {
  if (!state.exercise) return;
  state.noteIndex = Math.min(state.noteIndex + 1, state.exercise.notes.length);
  drawExercise();
});

// ---------------------------------------------------------------------------
// Latency panel
// ---------------------------------------------------------------------------

function renderLatencyPanel() {
  const c = calibration;
  $('lat-offset').innerHTML = c.source === 'default'
    ? '—<small> ms</small>'
    : `${ms(c.effectiveOffsetSec, 0)}<small> ms</small>`;
  $('lat-spread').innerHTML = c.spreadSec == null
    ? '—<small> ms</small>'
    : `±${ms(c.spreadSec, 0)}<small> ms</small>`;

  const q = c.quality;
  const qEl = $('lat-quality');
  qEl.className = `quality ${q.level}`;
  qEl.textContent = { none: 'not calibrated', poor: 'poor', fair: 'fair', ok: 'ok', good: 'good' }[q.level];
  $('lat-quality-note').textContent = q.note ? ` — ${q.note}` : '';

  const r = engine.getLatencyReport();
  if (r.available) {
    $('lat-base').innerHTML = r.baseLatency == null ? 'n/a' : `${ms(r.baseLatency)}<small> ms</small>`;
    $('lat-output').innerHTML = r.outputLatency == null
      ? (r.outputLatencyReported ? '0 <small>(reported)</small>' : 'n/a')
      : `${ms(r.outputLatency)}<small> ms</small>`;
    $('lat-sr').innerHTML = `${r.sampleRate}<small> Hz</small>`;
    $('lat-quantum').innerHTML = `${ms(r.renderQuantumSec, 2)}<small> ms</small>`;
  }

  $('manual-adjust').value = String(Math.round(c.manualAdjustSec * 1000));
  $('manual-value').textContent = `${Math.round(c.manualAdjustSec * 1000)} ms`;
  $('btn-calibrate').disabled = !state.running;
}

$('manual-adjust').addEventListener('input', e => {
  const v = Number(e.target.value);
  $('manual-value').textContent = `${v} ms`;
  calibration.setManualAdjust(v / 1000);
  renderLatencyPanel();
});

$('btn-reset-calib').addEventListener('click', () => {
  calibration.reset();
  $('lat-raw').textContent = 'Nothing measured yet.';
  renderLatencyPanel();
});

$('btn-calibrate').addEventListener('click', async () => {
  if (!input || state.calibrating) return;
  state.calibrating = true;
  $('btn-calibrate').disabled = true;

  const leadInBeats = 4, measureBeats = 12;
  buildCalibBeats(leadInBeats + measureBeats);

  try {
    const result = await runCalibration({
      engine, metronome, input,
      bpm: 72, leadInBeats, measureBeats,
      onProgress: p => {
        $('calib-status').textContent = p.phase === 'lead-in'
          ? `Counting in… ${p.beat + 1} of ${leadInBeats}`
          : `Play on each click — ${p.hits} note${p.hits === 1 ? '' : 's'} heard`;
        markCalibBeat(p.beat, leadInBeats);
      }
    });

    if (result.accepted.length < 4) {
      $('calib-status').textContent = `Only ${result.accepted.length} usable note${result.accepted.length === 1 ? '' : 's'}. Play a bit louder, closer to the mic, and right on the clicks.`;
    } else {
      calibration.applyResult(result);
      $('calib-status').textContent = `Measured ${ms(result.offsetSec, 0)} ms of lag from ${result.accepted.length} notes.`;
    }

    $('lat-raw').textContent = [
      `offset      ${ms(result.offsetSec, 1)} ms`,
      `spread(IQR) ${result.spreadSec == null ? 'n/a' : '±' + ms(result.spreadSec, 1) + ' ms'}`,
      `accepted    ${result.accepted.length}`,
      `rejected    ${result.rejected.length}`,
      '',
      'per-note deviation (ms):',
      result.raw.map(r => `  beat ${String(r.beatIdx).padStart(2)}  ${ms(r.delta, 1).padStart(8)}`).join('\n') || '  (none)'
    ].join('\n');

    renderLatencyPanel();
  } catch (err) {
    console.error(err);
    $('calib-status').textContent = `Calibration failed: ${err.message}`;
  } finally {
    state.calibrating = false;
    $('btn-calibrate').disabled = !state.running;
  }
});

function buildCalibBeats(total) {
  const wrap = $('calib-beats');
  wrap.innerHTML = '';
  for (let i = 0; i < total; i++) wrap.appendChild(document.createElement('i'));
}

function markCalibBeat(beat, leadInBeats) {
  const kids = $('calib-beats').children;
  for (let i = 0; i < kids.length; i++) {
    kids[i].className = i > beat ? '' : (i < leadInBeats ? 'lead' : 'on');
  }
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function setStatus(kind, text) {
  const pill = $('status-pill');
  pill.className = `pill ${kind}`;
  pill.textContent = text;
}

function setupTabs() {
  const tabs = [['tab-listen', 'panel-listen'], ['tab-practice', 'panel-practice'], ['tab-latency', 'panel-latency']];
  for (const [tabId, panelId] of tabs) {
    $(tabId).addEventListener('click', () => {
      for (const [t, p] of tabs) {
        const on = t === tabId;
        $(t).setAttribute('aria-selected', String(on));
        $(p).hidden = !on;
      }
      if (panelId === 'panel-latency') renderLatencyPanel();
    });
  }
}

function setupControls() {
  $('a4').addEventListener('input', e => {
    state.a4 = Number(e.target.value);
    $('a4-value').textContent = `${state.a4.toFixed(1)} Hz`;
    if (input) input.setA4(state.a4);
    if (state.exercise) {
      const n = state.exercise.notes[state.noteIndex];
      if (n) $('target-freq').textContent = `${midiToFreq(n.midi, state.a4).toFixed(1)} Hz`;
    }
  });

  $('lowrange').addEventListener('change', e => {
    const windowSize = e.target.checked ? 8192 : 4096;
    engine.windowSize = windowSize;
    engine.configureDetector({ windowSize });
  });

  $('btn-calibrate').disabled = true;
}

// Expose for console poking during development.
window.pianoTrainer = { engine, calibration, staff, state, metronome };
