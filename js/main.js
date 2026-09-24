// main.js — the shell. Creates the one AudioSession, creates the views, and
// switches between them.
//
// Note what is NOT here: any audio call in the tab-switching code. switchTab()
// deactivates one observer and activates another, and that is all it is
// allowed to do. The pipeline neither knows nor cares which tab is showing.

import { AudioSession } from './app/session.js';
import { StaffRenderer } from './notation/staff.js';
import { loadAllExercises } from './exercises/loader.js';
import { ListenView } from './views/listen.js';
import { PracticeView } from './views/practice.js';
import { LatencyView } from './views/latency.js';

const $ = (id) => document.getElementById(id);

const session = new AudioSession({ windowSize: 4096 });
const staff = new StaffRenderer($('staff'), { clef: 'treble', widthUnits: 26, playedX: 18 });

const views = {
  listen: new ListenView(session),
  practice: new PracticeView(session, staff),
  latency: new LatencyView(session)
};

const TABS = [
  ['listen', 'tab-listen', 'panel-listen'],
  ['practice', 'tab-practice', 'panel-practice'],
  ['latency', 'tab-latency', 'panel-latency']
];

let activeTab = 'listen';

// The status pill is owned by the shell, not by any view, so that it keeps
// working regardless of which tab is showing.
session.subscribe({
  onStatus: (s) => {
    const pill = $('status-pill');
    pill.className = `pill ${s.state}`;
    pill.textContent = s.message;
  }
});

if (!window.isSecureContext) $('insecure-banner').hidden = false;

for (const [name, tabId] of TABS) {
  $(tabId).addEventListener('click', () => switchTab(name));
}

/**
 * The whole of the tab-switching logic. Observers detach and attach; nothing
 * else happens. If you are ever tempted to add an audio call to this function,
 * that is the bug this refactor was written to prevent.
 */
function switchTab(name) {
  for (const [n, tabId, panelId] of TABS) {
    const on = n === name;
    $(tabId).setAttribute('aria-selected', String(on));
    $(panelId).hidden = !on;
  }
  if (views[activeTab]) views[activeTab].deactivate();
  activeTab = name;
  views[name].activate();
  session.noteViewChange();
}

views.listen.activate();

// ---------------------------------------------------------------------------
// Start / stop — the only two places that touch the audio graph
// ---------------------------------------------------------------------------

$('btn-start').addEventListener('click', async () => {
  $('start-error').textContent = '';
  try {
    // No await before session.start() reaches engine.unlock(), or iOS stops
    // counting this as a user gesture.
    await session.start();
    $('btn-start').hidden = true;
    $('btn-stop').hidden = false;
    views[activeTab].activate();
    if (views[activeTab].render) views[activeTab].render();
    if (views[activeTab].refreshPrompt) views[activeTab].refreshPrompt();
  } catch (err) {
    console.error(err);
    if (!$('start-error').textContent) {
      $('start-error').textContent = String((err && err.message) || err);
    }
  }
});

$('btn-stop').addEventListener('click', async () => {
  await session.stop();
  $('btn-start').hidden = false;
  $('btn-stop').hidden = true;
  views.listen.clear();
  staff.setPlayedNote(null);
  if (views[activeTab].render) views[activeTab].render();
});

// iOS suspends the context when the app backgrounds or a call arrives. These
// resume it; they never rebuild anything.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && session.running) session.engine.resumeIfInterrupted();
});
document.addEventListener('touchend', () => {
  if (session.running) session.engine.resumeIfInterrupted();
}, { passive: true });

session.engine.onStateChange(s => {
  if (!session.running) return;
  if (s === 'suspended') $('status-pill').textContent = 'Audio interrupted — tap anywhere';
  if (s === 'running') $('status-pill').textContent = 'Listening';
});

// ---------------------------------------------------------------------------
// Detector settings
// ---------------------------------------------------------------------------

$('a4').addEventListener('input', e => {
  session.setA4(Number(e.target.value));
  $('a4-value').textContent = `${session.a4.toFixed(1)} Hz`;
  views.practice.draw();
});

$('lowrange').addEventListener('change', e => {
  session.setWindowSize(e.target.checked ? 8192 : 4096);
});

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

loadAllExercises('exercises/').then(({ exercises, errors }) => {
  for (const e of errors) console.warn('Exercise failed to load:', e.file, e.message);
  views.practice.setExercises(exercises);
  if (errors.length) {
    const o = document.createElement('option');
    o.disabled = true;
    o.textContent = `(${errors.length} file(s) failed — see console)`;
    $('exercise-select').appendChild(o);
  }
}).catch(err => {
  console.error(err);
  $('exercise-desc').textContent = `Could not load exercises: ${err.message}`;
});

// Exposed for the browser test harness and for console poking.
window.pianoTrainer = { session, staff, views, switchTab };
