// main.js — app shell: views, drill flow, the loop.

import { CAR } from './car.js';
import { Sim } from './sim.js';
import { Cluster } from './instruments.js';
import { Gate } from './gate.js';
import { ClutchPedal, RampPedal } from './controls.js';
import { EngineAudio } from './audio.js';
import { DRILLS } from './drills.js';
import { habitNotes } from './coach.js';
import { REFERENCE } from './reference.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LEVEL_WORD = { good: 'Good', ok: 'Fine', off: 'Off', bad: 'Harmful', damage: 'Destroyed' };

const app = {
  sim: new Sim(),
  audio: new EngineAudio(),
  drill: null,
  cluster: null,
  gate: null,
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
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------ drill list */

function renderDrillList() {
  const host = $('#drill-list');
  host.innerHTML = '';
  DRILLS.forEach((Cls, i) => {
    const d = new Cls();
    const b = document.createElement('button');
    b.className = 'drill-card';
    b.innerHTML = `<span class="dc-num">${i + 1}</span>
      <span class="dc-body"><span class="dc-title">${d.title}</span>
      <span class="dc-aim">${d.aim}</span></span>
      <span class="dc-go">›</span>`;
    b.addEventListener('click', () => openDrill(Cls));
    host.appendChild(b);
  });
}

/* ----------------------------------------------------- drill teach */

function openDrill(Cls) {
  app.drillClass = Cls;
  const d = new Cls();
  app.drill = d;
  $('#teach-title').textContent = d.title;
  $('#teach-aim').textContent = d.aim;
  $('#teach-body').innerHTML = d.teach
    .map((t) => (typeof t === 'function' ? t() : `<p>${t}</p>`))
    .join('');
  showView('teach');
}

/* ------------------------------------------------------- drill run */

function startRun() {
  const d = app.drill = new app.drillClass();
  const s = d.setup();
  app.sim.reset(s);
  app.eventCursor = 0;
  app.pendingShift = null;
  app.cards = [];
  $('#cards').innerHTML = '';
  $('#run-title').textContent = d.title;
  app.gate.syncTo(app.sim.gear);
  app.clutch.hold(false);
  app.throttle.hold(false);
  app.brakePedal.hold(false);
  $('#handbrake').classList.toggle('is-on', !!app.sim.handbrake);
  $('#grade-note').textContent = app.sim.gradePercent ? `${app.sim.gradePercent}% uphill` : '';
  app.cluster.setWindow(d.band);
  warnHold = { key: null, until: 0 };
  app.running = true;
  app.audio.enable();
  showView('run');
  $('#finish-btn').textContent = 'Finish and review';
}

function stopRun() {
  app.running = false;
  const d = app.drill;
  const notes = habitNotes(app.sim);
  $('#report-title').textContent = d.title;
  const attempts = d.attempts.length
    ? d.attempts.map(cardHtml).join('')
    : '<p class="muted">No gear changes were recorded, so there is nothing to review. Run it again and make some shifts — including bad ones; this is the place for them.</p>';
  $('#report-attempts').innerHTML = attempts;
  $('#report-habits').innerHTML = notes
    .map((n) => `<div class="habit lv-${n.level}"><b>${LEVEL_WORD[n.level]}</b><p>${n.text}</p></div>`).join('');
  showView('report');
}

function cardHtml(c) {
  return `<div class="card lv-${c.level}">
    <div class="card-head"><span class="pill">${LEVEL_WORD[c.level]}</span><b>${c.headline || ''}</b></div>
    ${c.lines.map((l) => `<p>${l}</p>`).join('')}
  </div>`;
}

function pushCard(c) {
  if (!c) return;
  app.cards.push(c);
  // Live, only the newest and only the first couple of sentences: this sits
  // above the controls, and anything longer pushes the gate off the screen.
  const brief = { ...c, lines: c.lines.slice(0, 2) };
  $('#cards').innerHTML = cardHtml(brief);
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
  while (app.eventCursor < evs.length) {
    const ev = evs[app.eventCursor++];
    if (ev.kind !== 'release') continue;
    const d = app.drill;
    if (!d) continue;
    const rec = app.pendingShift;
    if (rec && rec.to === ev.gear) {
      app.pendingShift = null;
      pushCard(d.onShift?.(rec, ev, app.sim));
      pushCard(d.onRelease?.(ev, app.sim));
    } else {
      pushCard(d.onRelease?.(ev, app.sim));
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (app.running) {
    app.throttle.tick(dt);
    app.brakePedal.tick(dt);
    app.sim.step(dt);
    drainEvents();

    const d = app.drill;
    if (d) {
      pushCard(d.tick?.(app.sim, dt));
      const ins = d.instruction(app.sim);
      $('#ins-title').textContent = ins.title;
      $('#ins-detail').innerHTML = ins.detail || '';
      app.gate.setTarget(d.targetGear ?? null);
      app.cluster.setWindow(d.band);
      if (d.done) $('#finish-btn').textContent = 'See the breakdown →';
    }

    app.cluster.update(app.sim);
    app.audio.update(app.sim);
    renderWarnings();
    app.sim.flags.clear();
  }
  requestAnimationFrame(frame);
}

const WARNINGS = {
  'money-shift': ['damage', 'ENGINE DESTROYED — the wheels have spun it past its mechanical limit'],
  'over-rev': ['damage', 'OVER THE LIMITER'],
  stall: ['bad', 'Stalled — nothing broken. Clutch down, restart.'],
  lugging: ['bad', 'Lugging — on the throttle below ' + CAR.lugBand[1] + ' rpm'],
  riding: ['bad', 'Riding the clutch — it is slipping and heating up'],
  'clutch-hot': ['bad', 'Clutch getting hot — a dry clutch has nothing to cool it'],
  resting: ['off', 'Foot resting on the clutch — that loads the release bearing'],
  'held-at-stop': ['off', 'Pedal held down at a standstill — neutral, foot off'],
};

const WARN_ORDER = ['money-shift', 'over-rev', 'stall', 'lugging', 'riding', 'clutch-hot', 'held-at-stop', 'resting'];
let warnHold = { key: null, until: 0 };

function renderWarnings() {
  const f = app.sim.flags;
  const now = performance.now();
  let shown = null;
  for (const k of WARN_ORDER) if (f.has(k)) { shown = k; break; }

  // A warning raised for a single frame (a money shift is decided in one)
  // still has to be readable, so hold whatever is current for a moment.
  if (shown) {
    const rank = WARN_ORDER.indexOf(shown);
    const heldRank = warnHold.key ? WARN_ORDER.indexOf(warnHold.key) : 99;
    if (now > warnHold.until || rank <= heldRank) {
      warnHold = { key: shown, until: now + (shown === 'money-shift' ? 4000 : 1400) };
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
  $('#heat-fill').style.width = Math.min(100, app.sim.clutchHeat * 100).toFixed(0) + '%';
}

/* ------------------------------------------------------- reference */

function renderReference() {
  const host = $('#ref-body');
  host.innerHTML = REFERENCE.map((s) => `
    <details class="ref-sec" ${s.id === 'car' ? 'open' : ''}>
      <summary>${s.title}</summary>
      <div class="ref-content">${s.body()}</div>
    </details>`).join('');
}

/* ------------------------------------------------------------ init */

function init() {
  app.cluster = new Cluster($('#cluster'));
  app.gate = new Gate($('#gate'), onSelect);

  app.clutch = new ClutchPedal($('#clutch'), (v) => app.sim.setClutch(v));
  app.throttle = new RampPedal($('#throttle'), { label: 'THROTTLE', hint: 'hold', cls: 'is-throttle' }, (v) => { app.sim.throttle = v; });
  app.brakePedal = new RampPedal($('#brake'), { label: 'BRAKE', hint: 'hold', max: 0.7, riseMs: 320, cls: 'is-brake' }, (v) => { app.sim.brake = v; });

  $('#handbrake').addEventListener('click', (e) => {
    app.sim.handbrake = !app.sim.handbrake;
    e.currentTarget.classList.toggle('is-on', app.sim.handbrake);
  });
  $('#restart-btn').addEventListener('click', () => {
    if (!app.sim.startEngine()) {
      pushCard({ level: 'off', headline: 'It will not start like that', lines: ['The car is in gear with the clutch up — turning the engine over would make it lurch forward. Clutch down, or into neutral, then start.'] });
    }
  });

  $('#start-btn').addEventListener('click', startRun);
  $('#finish-btn').addEventListener('click', stopRun);
  $('#again-btn').addEventListener('click', startRun);
  $('#back-btn').addEventListener('click', () => { app.running = false; showView('drills'); });
  $('#teach-back').addEventListener('click', () => showView('drills'));
  $('#report-done').addEventListener('click', () => showView('drills'));
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.tab !== 'reference') app.running = false;
    showView(t.dataset.tab);
  }));

  $('#sound-btn').addEventListener('click', (e) => {
    if (app.audio.on) { app.audio.disable(); e.currentTarget.classList.remove('is-on'); e.currentTarget.textContent = 'Sound off'; }
    else { app.audio.enable(); e.currentTarget.classList.add('is-on'); e.currentTarget.textContent = 'Sound on'; }
  });

  // Keyboard, for desktop. The gate takes the arrow keys when focused.
  const keys = { ' ': 'clutch', c: 'clutch', x: 'throttle', z: 'brake' };
  addEventListener('keydown', (e) => {
    const k = keys[e.key.toLowerCase?.() ?? e.key];
    if (!k || e.repeat) return;
    e.preventDefault();
    (k === 'clutch' ? app.clutch : k === 'throttle' ? app.throttle : app.brakePedal).hold(true);
  });
  addEventListener('keyup', (e) => {
    const k = keys[e.key.toLowerCase?.() ?? e.key];
    if (!k) return;
    (k === 'clutch' ? app.clutch : k === 'throttle' ? app.throttle : app.brakePedal).hold(false);
  });

  renderDrillList();
  renderReference();
  app.cluster.update(app.sim);
  showView('drills');
  requestAnimationFrame((t) => { last = t; frame(t); });
}

init();
