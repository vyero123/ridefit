// main.js — app shell: views, drill flow, the loop.

import { CAR, CLUTCH } from './car.js';
import { Sim } from './sim.js';
import { Cluster } from './instruments.js';
import { Gate } from './gate.js';
import { Pedal, Toggle, CLUTCH_ZONES, THROTTLE_ZONES, BRAKE_ZONES } from './controls.js';
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
  app.handbrake.set(!!app.sim.handbrake);
  $('#grade-note').textContent = app.sim.gradePercent ? `${app.sim.gradePercent}% UPHILL` : '';
  $('#grade-note').hidden = !app.sim.gradePercent;
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

function advance(dt) {
  if (!app.running) return;
  app.clutch.tick(dt);
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  advance(dt);
  requestAnimationFrame(frame);
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

  // Rates tuned together: a short press gets you past the friction zone for a
  // gear change, and a steady release crosses the zone in about a third of a
  // second — fast enough that holding a position means pressing in rhythm.
  app.clutch = new Pedal($('#clutch'), {
    label: 'CLUTCH', sub: 'hold to press',
    zones: CLUTCH_ZONES, downRate: 3.2, upRate: 1.0, cls: 'is-clutch',
    fineZone: [CLUTCH.biteStart - 0.05, CLUTCH.biteEnd + 0.05],
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
