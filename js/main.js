// main.js — app shell: views, drill flow, the loop.

import { CAR, CLUTCH, SPEEDS, DEFAULT_SPEED, PEDAL_RATES, DEFAULT_PEDAL_RATE } from './car.js';
import { Sim } from './sim.js';
import { Cluster } from './instruments.js';
import { Gate } from './gate.js';
import { Pedal, Toggle, CLUTCH_ZONES, THROTTLE_ZONES, BRAKE_ZONES } from './controls.js';
import { EngineAudio } from './audio.js';
import { DRILLS } from './drills.js';
import { habitNotes } from './coach.js';
import { REFERENCE } from './reference.js';
import { Recorder } from './recorder.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LEVEL_WORD = { good: 'Good', ok: 'Fine', off: 'Off', bad: 'Harmful', damage: 'Destroyed' };

const app = {
  sim: new Sim(),
  audio: new EngineAudio(),
  timeScale: SPEEDS.find((s) => s.id === DEFAULT_SPEED).scale,
  speedId: DEFAULT_SPEED,
  pedalRate: 1,
  clutchMode: 'press',
  paused: false,
  replay: null,
  recorder: new Recorder(),
  drill: null, drillClass: null,
  cluster: null, gate: null,
  running: false,
  eventCursor: 0,
  pendingShift: null,
  cards: [],
};

/* ---------------------------------------------------------- views */

function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
  const tab = name === 'reference' ? 'reference' : 'drills';
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  document.body.classList.toggle('in-run', name === 'run');
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------ drill list */

function renderDrillList() {
  const host = $('#drill-list');
  host.innerHTML = '';
  let group = null;
  DRILLS.forEach((Cls, i) => {
    const d = new Cls();
    if (d.group !== group) {
      group = d.group;
      const h = document.createElement('h3');
      h.className = 'group-head';
      h.textContent = group;
      host.appendChild(h);
    }
    const b = document.createElement('button');
    b.className = 'drill-card';
    b.innerHTML = `<span class="dc-num">${i + 1}</span>
      <span class="dc-body"><span class="dc-title">${d.title}</span>
      <span class="dc-aim">${d.aim}</span></span><span class="dc-go">›</span>`;
    b.addEventListener('click', () => openDrill(Cls));
    host.appendChild(b);
  });
}

function openDrill(Cls) {
  app.drillClass = Cls;
  const d = new Cls();
  app.drill = d;
  $('#teach-title').textContent = d.title;
  $('#teach-aim').textContent = d.aim;
  $('#teach-body').innerHTML = d.teach
    .map((t) => (typeof t === 'function' ? t() : `<p>${t}</p>`)).join('');
  showView('teach');
}

/* ------------------------------------------------------- drill run */

function startRun() {
  const d = app.drill = new app.drillClass();
  app.sim.reset(d.setup());
  app.eventCursor = app.sim.events.length;
  app.pendingShift = null;
  app.cards = [];
  clearCard();
  $('#run-title').textContent = d.title;
  app.gate.syncTo(app.sim.gear);
  app.clutch.reset(); app.throttle.reset(); app.brakePedal.reset();
  app.recorder.reset(); endReplay(); setPaused(false);
  $('#settings-panel').hidden = true;
  app.handbrake.set(!!app.sim.handbrake);
  $('#grade-note').textContent = app.sim.gradePercent ? `${app.sim.gradePercent}% UPHILL` : '';
  $('#grade-note').hidden = !app.sim.gradePercent;
  app.cluster.setWindow(d.band);
  setSpeed(app.speedId);   // refresh the pace warning for this drill
  warnHold = { key: null, until: 0 };
  app.running = true;
  app.audio.enable();
  showView('run');
  $('#finish-btn').textContent = 'Finish and review';
}

function stopRun() {
  app.running = false;
  const d = app.drill;
  $('#report-title').textContent = d.title;
  $('#report-attempts').innerHTML = d.attempts.length
    ? d.attempts.map(cardHtml).join('')
    : '<p class="muted">Nothing was recorded, so there is nothing to review. Run it again and make some attempts — including bad ones; this is the place for them.</p>';
  $('#report-habits').innerHTML = habitNotes(app.sim, d.attempts)
    .map((n) => `<div class="habit lv-${n.level}"><b>${LEVEL_WORD[n.level]}</b><p>${n.text}</p></div>`).join('');
  showView('report');
}

function cardHtml(c) {
  return `<div class="card lv-${c.level}">
    <div class="card-head"><span class="pill">${LEVEL_WORD[c.level]}</span><b>${c.headline || ''}</b></div>
    ${c.lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
}

/**
 * The instruction and the newest verdict share one slot. They are never both
 * urgent, and stacking them would push the controls around mid-drill.
 */
function pushCard(c) {
  if (!c) return;
  app.cards.push(c);
  $('#cards').innerHTML = cardHtml({ ...c, lines: c.lines.slice(0, 1) });
  $('#instruction').hidden = true;
  clearTimeout(app.cardTimer);
  app.cardTimer = setTimeout(clearCard, c.level === 'damage' ? 7000 : 5000);
}

function clearCard() {
  clearTimeout(app.cardTimer);
  $('#cards').innerHTML = '';
  $('#instruction').hidden = false;
}

/* ------------------------------------------------------------ loop */

function onSelect(gear) {
  const res = app.sim.selectGear(gear);
  if (!res.ok) {
    app.audio.clunk(true);
    pushCard({ level: 'off', headline: 'The lever would not go in', lines: [res.message] });
    return res;
  }
  if (res.record && res.record.to !== 0) {
    app.pendingShift = res.record;
    app.audio.clunk(false);
  }
  return res;
}

function drainEvents() {
  const evs = app.sim.events;
  const d = app.drill;
  while (app.eventCursor < evs.length) {
    const ev = evs[app.eventCursor++];
    if (!d) continue;
    if (ev.kind === 'launch') { pushCard(d.onLaunch?.(ev, app.sim)); continue; }
    if (ev.kind !== 'release') continue;
    const rec = app.pendingShift;
    if (rec && rec.to === ev.gear) {
      app.pendingShift = null;
      pushCard(d.onShift?.(rec, ev, app.sim));
    }
    pushCard(d.onRelease?.(ev, app.sim));
  }
}

/**
 * One step of the world. `dt` is real seconds; everything below runs in
 * simulation seconds, which is where every threshold and every measurement
 * lives. Scaling here and nowhere else is what keeps the verdicts honest at
 * any practice speed.
 */
function advance(dt) {
  if (!app.running) return;
  dt = dt * app.timeScale;
  app.clutch.tick(dt);
  app.throttle.tick(dt);
  app.brakePedal.tick(dt);
  app.sim.step(dt);
  drainEvents();

  const d = app.drill;
  if (d) {
    pushCard(d.tick?.(app.sim, dt, dt / app.timeScale));
    const ins = d.instruction(app.sim);
    $('#ins-title').textContent = ins.title;
    $('#ins-detail').innerHTML = ins.detail || '';
    app.gate.setTarget(d.targetGear ?? null);
    app.cluster.setWindow(d.band);
    if (d.done) $('#finish-btn').textContent = 'See the breakdown →';
  }

  app.recorder.sample(app.sim, dt, {
    clutch: app.clutch.value, throttle: app.throttle.value, brake: app.brakePedal.value,
  });
  for (const f of app.sim.flags) {
    if (f === 'stall') app.recorder.mark(app.sim.t, 'stall', 'stalled');
    else if (f === 'snatch') app.recorder.mark(app.sim.t, 'snatch', 'take-up jolt');
    else if (f === 'riding') app.recorder.mark(app.sim.t, 'slip', 'slipping');
  }

  app.cluster.update(app.sim);
  app.audio.update(app.sim);
  renderWarnings();
  app.sim.flags.clear();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (app.replay) stepReplay(dt);
  else if (!app.paused) advance(dt);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------- pause & replay */

function setPaused(on) {
  app.paused = on;
  $('#pause-btn').textContent = on ? '▶ Resume' : '❚❚ Pause';
  $('#pause-btn').classList.toggle('is-on', on);
  document.body.classList.toggle('is-paused', on);
  if (on) app.audio.disable();
  else if ($('#sound-btn').classList.contains('is-on')) app.audio.enable();
}

function startReplay() {
  const span = app.recorder.span;
  if (!span) return;
  const from = Math.max(span[0], span[1] - 7);
  app.replay = { ...app.recorder.slice(from, span[1]), i: 0, acc: 0, rate: 0.25 };
  if (!app.replay.frames.length) { app.replay = null; return; }
  app.audio.disable();
  $('#replay-panel').hidden = false;
  $('#replay-scrub').max = String(app.replay.frames.length - 1);
  document.body.classList.add('is-replaying');
}

function endReplay() {
  app.replay = null;
  $('#replay-panel').hidden = true;
  document.body.classList.remove('is-replaying');
  if ($('#sound-btn').classList.contains('is-on')) app.audio.enable();
}

function stepReplay(dtReal) {
  const R = app.replay;
  if (!R.playing) { renderReplayFrame(R.i); return; }
  R.acc += dtReal * R.rate;
  const period = 1 / 40;
  while (R.acc >= period && R.i < R.frames.length - 1) { R.acc -= period; R.i++; }
  if (R.i >= R.frames.length - 1) R.playing = false;
  $('#replay-scrub').value = String(R.i);
  renderReplayFrame(R.i);
}

/** Draw the instruments from a recorded frame rather than the live sim. */
function renderReplayFrame(i) {
  const R = app.replay, f = R.frames[i];
  if (!f) return;
  const ghost = {
    stalled: f.stalled, rpm: f.rpm, kph: f.kph, gear: f.gear,
    inGear: f.gear !== 0, drivenRpm: f.wheelRpm, slipRpm: f.slip,
    engagement: f.engagement, clutchHeat: f.heat, clutchPedal: f.clutch,
  };
  app.cluster.update(ghost);
  app.clutch.showGhost(f.clutch);
  app.throttle.showGhost(f.throttle);
  app.brakePedal.showGhost(f.brake);
  const near = R.marks.filter((m) => Math.abs(m.t - f.t) < 0.25);
  $('#replay-read').innerHTML =
    `<b>${(f.t - R.frames[0].t).toFixed(2)}s</b> · clutch ${Math.round(f.clutch * 100)}%`
    + ` · gas ${Math.round(f.throttle * 100)}%`
    + ` · engine ${Math.round(f.rpm)} rpm · wheels want ${Math.round(f.wheelRpm)}`
    + ` · ${Math.round(f.kph)} km/h`
    + (near.length ? ` <em class="rp-mark">${near.map((m) => m.text).join(', ')}</em>` : '');
}

const WARNINGS = {
  'money-shift': ['damage', 'ENGINE DESTROYED — the wheels have spun it past its mechanical limit'],
  'over-rev': ['damage', 'OVER THE LIMITER'],
  stall: ['bad', 'Stalled — nothing broken. Clutch down, then restart.'],
  judder: ['bad', 'Juddering — the clutch is grabbing and letting go'],
  lugging: ['bad', `Lugging — throttle on below ${CAR.lugBand[1]} rpm`],
  riding: ['bad', 'Riding the clutch — slipping it for nothing'],
  'clutch-hot': ['bad', 'Clutch getting hot — a dry plate has nothing to cool it'],
  resting: ['off', 'Foot resting on the clutch — that loads the release bearing'],
  'held-at-stop': ['off', 'Pedal held down at a standstill — neutral, foot off'],
};
const WARN_ORDER = ['money-shift', 'over-rev', 'stall', 'judder', 'lugging', 'riding', 'clutch-hot', 'held-at-stop', 'resting'];
let warnHold = { key: null, until: 0 };

function renderWarnings() {
  const f = app.sim.flags;
  const now = performance.now();
  let shown = null;
  for (const k of WARN_ORDER) if (f.has(k)) { shown = k; break; }
  if (shown) {
    const rank = WARN_ORDER.indexOf(shown);
    const heldRank = warnHold.key ? WARN_ORDER.indexOf(warnHold.key) : 99;
    if (now > warnHold.until || rank <= heldRank) {
      warnHold = { key: shown, until: now + (shown === 'money-shift' ? 4000 : 1500) };
    }
  }
  const active = now < warnHold.until ? warnHold.key : null;
  const el = $('#warn');
  if (!active) { el.className = 'warn-strip'; el.textContent = ''; }
  else {
    const [lv, text] = WARNINGS[active];
    el.className = 'warn-strip is-on lv-' + lv;
    el.textContent = text;
  }
  $('#restart-btn').hidden = !app.sim.stalled;
}

/* ----------------------------------------------------- practice speed */

const store = {
  get(k, d) { try { return localStorage.getItem('shift.' + k) || d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('shift.' + k, v); } catch (e) { /* private mode */ } },
};

function setSpeed(id) {
  const s = SPEEDS.find((x) => x.id === id) || SPEEDS[0];
  app.speedId = s.id;
  app.timeScale = s.scale;
  $$('.speed-pick button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === s.id));
  $('#speed-note').innerHTML = s.note + paceWarning(s.scale);
  store.set('speed', s.id);
}

/**
 * The very slow settings are for clutch work. A drill that has to reach road
 * speed simply takes twenty times as long at 0.05×, which is not training,
 * it is waiting — so say so rather than letting him discover it.
 */
function paceWarning(scale) {
  const d = app.drill;
  if (!d || d.pace !== 'road' || scale > 0.2) return '';
  return ` <b class="pace-warn">This drill needs road speed — at this setting it will take several minutes. The slow settings suit drills 1–5.</b>`;
}

function setPedalRate(id) {
  const r = PEDAL_RATES.find((x) => x.id === id) || PEDAL_RATES[2];
  app.pedalRate = r.mult;
  $$('.rate-pick button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === r.id));
  for (const p of [app.clutch, app.throttle, app.brakePedal]) p?.setResponse(r.mult);
  store.set('pedalRate', r.id);
}

function setClutchMode(mode) {
  app.clutchMode = mode;
  $$('.mode-pick button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === mode));
  app.clutch?.setMode(mode);
  // Auto-hold only means anything for a pedal that moves on its own.
  $('#autohold-cb').disabled = mode === 'touch';
  store.set('clutchMode', mode);
}

function buildSettings() {
  const fill = (sel, items, onPick) => {
    const host = $(sel);
    host.innerHTML = items.map((i) => `<button data-v="${i.id}" title="${i.note || ''}">${i.label}</button>`).join('');
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) onPick(b.dataset.v);
    });
  };
  fill('.speed-pick', SPEEDS, setSpeed);
  fill('.rate-pick', PEDAL_RATES, setPedalRate);
  fill('.mode-pick', [
    { id: 'press', label: 'Press & hold', note: 'Hold to push the pedal down; let go and it returns.' },
    { id: 'touch', label: 'Place it', note: 'Your thumb is the pedal: slide to put it where you want.' },
  ], setClutchMode);

  $('#settings-btn').addEventListener('click', () => {
    const p = $('#settings-panel');
    p.hidden = !p.hidden;
    if (!p.hidden) $('#replay-panel').hidden = true;
  });
  $('#settings-close').addEventListener('click', () => { $('#settings-panel').hidden = true; });
  $('#autohold-cb').addEventListener('change', (e) => {
    app.clutch.setAutoHold(e.target.checked);
    store.set('autoHold', e.target.checked ? '1' : '0');
  });

  setSpeed(store.get('speed', DEFAULT_SPEED));
  setPedalRate(store.get('pedalRate', DEFAULT_PEDAL_RATE));
  setClutchMode(store.get('clutchMode', 'press'));
  const ah = store.get('autoHold', '0') === '1';
  $('#autohold-cb').checked = ah;
  app.clutch.setAutoHold(ah);
}

/* ------------------------------------------------------- reference */

function renderReference() {
  $('#ref-body').innerHTML = REFERENCE.map((s) => `
    <details class="ref-sec" ${s.id === 'coordination' ? 'open' : ''}>
      <summary>${s.title}</summary>
      <div class="ref-content">${s.body()}</div>
    </details>`).join('');
}

/* ------------------------------------------------------------ init */

function init() {
  app.cluster = new Cluster($('#cluster'));
  app.gate = new Gate($('#gate'), onSelect);

  // The pedal's top speed is set by the fastest legitimate use of it — a gear
  // change, which wants the whole travel in about a second. Anything slower
  // than that, and a launch wants much slower, the player gets by tapping:
  // press, ease off, press again. That is the rhythm the drills are about.
  app.clutch = new Pedal($('#clutch'), {
    label: 'CLUTCH', sub: 'hold to press',
    zones: CLUTCH_ZONES, downRate: 3.4, upRate: 1.7, cls: 'is-clutch',
    fineZone: [CLUTCH.biteStart - 0.05, CLUTCH.biteEnd + 0.05], fineFactor: 0.4,
  }, (v) => app.sim.setClutch(v));

  app.throttle = new Pedal($('#throttle'), {
    label: 'GAS', sub: 'hold to press',
    zones: THROTTLE_ZONES, downRate: 2.4, upRate: 3.0, cls: 'is-throttle',
  }, (v) => { app.sim.throttle = v; });

  app.brakePedal = new Pedal($('#brake'), {
    label: 'BRAKE', sub: '',
    zones: BRAKE_ZONES, downRate: 2.6, upRate: 3.4, cls: 'is-brake',
  }, (v) => { app.sim.brake = v * 0.75; });

  app.handbrake = new Toggle($('#handbrake'), 'HAND<br>BRAKE', (on) => { app.sim.handbrake = on; });

  $('#restart-btn').addEventListener('click', () => {
    if (!app.sim.startEngine()) {
      pushCard({
        level: 'off', headline: 'It will not start like that',
        lines: ['The car is in gear with the clutch up — turning the engine over would make it lurch. Clutch down, or into neutral, then start.'],
      });
    }
  });

  $('#start-btn').addEventListener('click', startRun);
  $('#finish-btn').addEventListener('click', stopRun);
  $('#again-btn').addEventListener('click', startRun);
  $('#back-btn').addEventListener('click', () => { app.running = false; showView('drills'); });
  $('#teach-back').addEventListener('click', () => showView('drills'));
  $('#report-done').addEventListener('click', () => showView('drills'));
  $('#rotate-anyway').addEventListener('click', () => document.body.classList.add('allow-portrait'));
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.tab !== 'reference') app.running = false;
    showView(t.dataset.tab);
  }));

  $('#sound-btn').addEventListener('click', (e) => {
    if (app.audio.on) { app.audio.disable(); e.currentTarget.classList.remove('is-on'); e.currentTarget.textContent = 'Sound off'; }
    else { app.audio.enable(); e.currentTarget.classList.add('is-on'); e.currentTarget.textContent = 'Sound on'; }
  });
  $('#sound-btn').classList.add('is-on');
  buildSettings();

  $('#pause-btn').addEventListener('click', () => setPaused(!app.paused));
  $('#replay-btn').addEventListener('click', () => { setPaused(false); startReplay(); });
  $('#rp-exit').addEventListener('click', endReplay);
  $('#rp-play').addEventListener('click', () => {
    const R = app.replay; if (!R) return;
    if (R.i >= R.frames.length - 1) R.i = 0;
    R.playing = !R.playing;
    $('#rp-play').textContent = R.playing ? '❚❚' : '▶';
  });
  $('#replay-scrub').addEventListener('input', (e) => {
    if (!app.replay) return;
    app.replay.playing = false; $('#rp-play').textContent = '▶';
    app.replay.i = Number(e.target.value);
    renderReplayFrame(app.replay.i);
  });

  const keys = { ' ': 'clutch', c: 'clutch', x: 'throttle', z: 'brake' };
  addEventListener('keydown', (e) => {
    const k = keys[typeof e.key === 'string' ? e.key.toLowerCase() : e.key];
    if (!k || e.repeat) return;
    e.preventDefault();
    (k === 'clutch' ? app.clutch : k === 'throttle' ? app.throttle : app.brakePedal).hold(true);
  });
  addEventListener('keyup', (e) => {
    const k = keys[typeof e.key === 'string' ? e.key.toLowerCase() : e.key];
    if (!k) return;
    (k === 'clutch' ? app.clutch : k === 'throttle' ? app.throttle : app.brakePedal).hold(false);
  });

  if (location.search.includes('debug')) window.shift = { app, advance };

  renderDrillList();
  renderReference();
  app.cluster.update(app.sim);
  showView('drills');
  requestAnimationFrame((t) => { last = t; frame(t); });
}

init();
