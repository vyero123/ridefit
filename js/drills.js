// drills.js — the progressive drills.
//
// The first five are the point of the app: coordinating the clutch and the
// throttle. Shift timing comes afterwards, because knowing that 2,300 rpm is
// a sensible upshift takes a minute to learn and the hand-off takes weeks.

import { CAR, maxSpeedForGear, kphPer1000, rpmAtSpeed, BITE_CENTRE } from './car.js';
import { judgeShift, judgeHandoff, judgeLaunch, habitNotes } from './coach.js';

const r = (n) => Math.round(n).toLocaleString('en-GB');
const s1 = (n) => n.toFixed(1);

class Drill {
  constructor() {
    this.attempts = [];
    this.done = false;
    this.band = null;
    this.targetGear = null;
  }
  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }
  instruction() { return { title: '', detail: '' }; }
  push(card) { if (card) this.attempts.push(card); return card; }
  report(sim) { return habitNotes(sim, this.attempts); }
}

/* ============================================ 1. finding the bite point */

export class BitePointDrill extends Drill {
  id = 'bite'; group = 'Clutch control';
  title = 'Finding the bite point';
  aim = 'Feel where the clutch starts to take hold — with no throttle at all.';
  teach = [
    'Everything else rests on this. Somewhere in the clutch pedal\'s travel is a band, maybe two or three centimetres of it, where the plate goes from touching nothing to gripping fully. That band is the <b>friction zone</b>, and the point where the car first wants to move is the <b>bite point</b>.',
    'In a car you find it by feel: the nose dips slightly, the revs sag a touch, the car strains against the brake. Here you find it by watching the <b>engine-versus-wheels</b> bar: the moment the gap starts closing, the clutch is taking up.',
    'No throttle for this one. A modern engine holds its own idle, and in first gear that is enough to move the car on its own — which is exactly how you find the bite without having to manage the gas at the same time.',
    'The pedal here works like a pedal: <b>hold to push it down, let go to let it come back up.</b> To sit part-way, you press and ease off in rhythm. That is fiddly on purpose; so is a real one, until it isn\'t.',
  ];

  constructor() { super(); this.holdTime = 0; this.best = 0; this.biteAt = null; this.notedStall = false; this.overshoots = 0; }

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }

  instruction(sim) {
    this.targetGear = sim.gear === 0 ? 1 : null;
    if (this.done) return { title: 'That is the bite point.', detail: 'Finish below for the breakdown.' };
    if (sim.stalled) return { title: 'Stalled — clutch down and restart', detail: 'It came up too far, too fast. Nothing is damaged.' };
    if (sim.gear !== 1) return { title: 'Into first', detail: 'Clutch all the way down, lever into first, and leave the throttle alone entirely.' };
    if (sim.throttle > 0.1) return { title: 'No throttle for this one', detail: 'Let the idle do the work. Foot off the gas.' };
    if (sim.kph < 0.4) return {
      title: 'Ease the clutch up until the car creeps',
      detail: 'Let the pedal come up slowly. Watch the engine-versus-wheels gap — when it starts to close, you are at the bite.',
    };
    if (sim.kph > 4) return { title: 'Too far — ease back down a little', detail: 'The clutch is nearly home. Press the pedal back towards the friction zone.' };
    return {
      title: `Hold it there — ${s1(this.holdTime)} s of ${3}`,
      detail: 'Creeping, not accelerating. Small presses to hold the pedal where it is.',
    };
  }

  tick(sim, dt) {
    if (this.done) return null;
    if (sim.stalled && !this.notedStall) {
      this.notedStall = true;
      return this.push({
        level: 'ok', headline: 'Stalled',
        lines: ['The pedal came up past the friction zone and the engine could not drag the car from a standstill on idle alone. Come back down and try to stop the pedal earlier — the bite is roughly halfway through the travel, not at the top.'],
      });
    }
    if (sim.gear !== 1 || sim.throttle > 0.1 || sim.stalled) return null;

    if (sim.kph > 0.4 && this.biteAt == null) this.biteAt = sim.clutchPedal;

    if (sim.kph >= 0.4 && sim.kph <= 4) {
      this.holdTime += dt;
      this.best = Math.max(this.best, this.holdTime);
      if (this.holdTime >= 3) {
        this.done = true;
        const lines = [
          `Held the car creeping for three seconds on the clutch alone. The bite came in at about ${Math.round((this.biteAt ?? BITE_CENTRE) * 100)}% of pedal travel — a little over halfway down, which is where it sits in most cars.`,
          `Note what that cost: ${r(sim.slipEnergy / 1000)} kJ of heat in ${s1(sim.slipSeconds)} s. Finding the bite is a legitimate use of the clutch. Driving around on it is not, and this is the rate it burns at.`,
        ];
        if (this.overshoots > 1) lines.push(`You went past it ${this.overshoots} times on the way. That is the normal way to find it.`);
        return this.push({ level: 'good', headline: 'Bite point found and held', lines });
      }
    } else if (sim.kph > 4.5) {
      if (this.holdTime > 0.3) this.overshoots++;
      this.holdTime = 0;
    } else if (sim.kph < 0.2) {
      this.holdTime = 0;
    }
    return null;
  }
}

/* ======================================================= 2. the launch */

export class LaunchDrill extends Drill {
  id = 'launch'; group = 'Clutch control';
  title = 'Pulling away';
  aim = 'Hand over from clutch to throttle without stalling, juddering or burning the plate.';
  teach = [
    'A launch is one movement with two hands in it. The clutch comes up through the friction zone while the throttle comes on, and the <b>hand-off</b> between them is the whole skill. Too little gas and the engine dies; too much and you are spinning the plate against the flywheel to make up the difference.',
    'The sequence that works: a little throttle first, so the engine has something in reserve — around <b>1,200 to 1,500 rpm</b> is plenty. Then the pedal up to the top of the friction zone <i>quickly</i>, because nothing is happening there. Then <b>slowly</b> through the zone as the car starts to move, feeding in a little more gas as it does.',
    'Four things can happen, and the app will tell you which: <b>stalled</b> (clutch faster than the engine could follow), <b>juddered</b> (snatchy through the zone — the plate grabbing and letting go), <b>slipped</b> (too much gas, too slow a release, heat into the clutch), or <b>clean</b>.',
    'Three goes. Stalling is free — it is the only one of those four that costs nothing but a restart.',
  ];

  constructor() { super(); this.n = 0; this.target = 3; this.phase = 'launch'; }

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }

  instruction(sim) {
    if (this.done) return { title: 'Three launches done.', detail: 'Finish below for the breakdown.' };
    if (sim.stalled) return { title: 'Stalled — clutch down, then restart', detail: 'Press the clutch to the floor and hit restart.' };
    if (this.phase === 'stop') {
      this.targetGear = null;
      return { title: `Come back to a stop — launch ${this.n + 1} of ${this.target} next`, detail: 'Brake to a halt, clutch down before the engine dies, then into neutral.' };
    }
    this.targetGear = sim.gear === 0 ? 1 : null;
    if (sim.gear !== 1) return { title: `Launch ${this.n + 1} of ${this.target}: into first`, detail: 'Clutch down, first gear.' };
    return {
      title: `Launch ${this.n + 1} of ${this.target}`,
      detail: 'A little throttle first, then the clutch up through the friction zone as the gas comes on.',
    };
  }

  tick(sim) {
    if (this.phase === 'stop' && sim.kph < 1 && sim.gear === 0) this.phase = 'launch';
    return null;
  }

  onLaunch(L, sim) {
    const card = judgeLaunch(L, sim);
    this.n++;
    this.phase = 'stop';
    if (this.n >= this.target) { this.done = true; this.phase = 'launch'; }
    return this.push(card);
  }
}

/* =================================================== 3. traffic crawl */

export class CrawlDrill extends Drill {
  id = 'crawl'; group = 'Clutch control';
  title = 'Crawling in traffic';
  aim = 'The hardest real-world clutch test: moving slowly, repeatedly, without living on the pedal.';
  teach = [
    `There is a speed below which first gear cannot carry the car on its own. In this one it is about <b>${r(kphPer1000(1) * (CAR.idleRpm / 1000))} km/h</b> — any slower than that and the engine would be below idle, so the clutch has to make up the difference by slipping.`,
    'Which gives you exactly two honest options in slow traffic: <b>keep moving at a speed the gear can carry</b>, or <b>stop properly</b> — clutch down, or neutral and brake. There is no third option, and the tempting one — hovering in the friction zone at walking pace — is what wears clutches out in cities.',
    'This is where bike habits bite hardest. On a wet clutch, feathering along at 5 km/h all the way through a queue is normal and costs nothing. Do it in a car for a year and you are buying a clutch.',
    'Traffic ahead will stop and start. Keep up with it without parking yourself in the friction zone.',
  ];

  constructor() {
    super();
    this.i = 0;
    this.lowSlip = 0;
    this.stalls = 0;
    this.script = [
      { go: true, text: 'Traffic is moving. Get up to about 15 km/h.', ok: (s) => s.kph > 14 },
      { go: false, text: 'Brake lights ahead — come to a complete stop.', ok: (s) => s.kph < 0.6 },
      { go: true, text: 'Moving again — away to 15 km/h.', ok: (s) => s.kph > 14 },
      { go: false, text: 'Stopping again.', ok: (s) => s.kph < 0.6 },
      { go: true, text: 'Last one — away and up to 20 km/h.', ok: (s) => s.kph > 19 },
    ];
  }

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }

  instruction(sim) {
    if (this.done) return { title: 'Through the queue.', detail: 'Finish below for the breakdown.' };
    if (sim.stalled) return { title: 'Stalled — clutch down and restart', detail: '' };
    const step = this.script[this.i];
    this.targetGear = step && step.go && sim.gear === 0 ? 1 : null;
    return { title: step.go ? 'Move off' : 'Stop', detail: step.text };
  }

  tick(sim, dt) {
    if (this.done) return null;
    if (sim.isSlipping && sim.kph < 8 && sim.kph > 0.5 && sim.clutchPedal < 0.9) this.lowSlip += dt;
    const step = this.script[this.i];
    if (step && step.ok(sim)) {
      this.i++;
      if (this.i >= this.script.length) {
        this.done = true;
        const lines = [];
        let level = 'good';
        if (this.lowSlip > 4) {
          level = 'bad';
          lines.push(`You spent ${s1(this.lowSlip)} s slipping the clutch below 8 km/h. That is the crawl habit: the car is moving slower than first gear can carry, and the difference is being made up by the plate. Over a year of commuting this is the single biggest thing that shortens a clutch's life.`);
          lines.push('Instead: let the gap open, then take it in one go at a speed the gear can hold, and stop properly when you have to.');
        } else if (this.lowSlip > 1.5) {
          level = 'off';
          lines.push(`${s1(this.lowSlip)} s of slipping below 8 km/h. Some is unavoidable pulling away; this is a little more than that.`);
        } else {
          lines.push(`Only ${s1(this.lowSlip)} s of slipping below 8 km/h — you were either moving properly or stopped, which is exactly right.`);
        }
        lines.push(`Total for the queue: ${r(sim.slipEnergy / 1000)} kJ of clutch heat across ${sim.pressCount} presses.`);
        return this.push({ level, headline: 'Through the traffic', lines });
      }
    }
    return null;
  }

  onLaunch(L, sim) {
    const c = judgeLaunch(L, sim);
    c.lines = c.lines.slice(0, 1);
    return this.push(c);
  }
}

/* ============================================ 4. rolling stop, restart */

export class StopStartDrill extends Drill {
  id = 'stopstart'; group = 'Clutch control';
  title = 'Stopping and starting again';
  aim = 'Bring the car to rest without stalling it, leave it tidy, then go again.';
  teach = [
    'Coming to a stop is where beginners stall most, and the reason is simple: in gear, the wheels drive the engine, so when the wheels stop the engine stops with them. <b>The clutch has to go down before the engine runs out of revs</b> — somewhere below about 1,200 rpm, or roughly walking pace.',
    'Once stopped, leave it tidy: <b>neutral, and foot off the clutch.</b> Sitting at a red light with the pedal held down spins the release bearing under full spring load for the whole wait, and replacing that bearing means taking the gearbox out.',
    'Then away again from cold, which is the launch you already practised.',
    'Brake smoothly, clutch down in time, neutral, foot off, then go.',
  ];

  constructor() { super(); this.phase = 0; this.stalledOnStop = false; this.tidyTime = 0; }

  setup() { const v = 40 / 3.6; return { speed: v, gear: 3, rpm: rpmAtSpeed(v, 3) }; }

  instruction(sim) {
    if (this.done) return { title: 'Stopped tidily and away again.', detail: 'Finish below.' };
    if (sim.stalled) return { title: 'Stalled — clutch down and restart', detail: 'The clutch went down later than the revs ran out.' };
    if (this.phase === 0) return { title: 'Brake to a complete stop', detail: 'Clutch down before the revs fall through about 1,200. Watch the tachometer on the way down.' };
    if (this.phase === 1) return { title: 'Neutral, and foot off the clutch', detail: 'Lever to the middle, then let the pedal all the way up.' };
    this.targetGear = sim.gear === 0 ? 1 : null;
    return { title: 'Now away again in first', detail: 'Same hand-off as before: a little gas, then up through the friction zone.' };
  }

  tick(sim, dt) {
    if (this.done) return null;
    if (sim.stalled && !this.stalledOnStop && this.phase === 0) {
      this.stalledOnStop = true;
      this.push({
        level: 'off', headline: 'Stalled on the way to a stop',
        lines: ['In gear with the clutch home, the wheels and the engine are locked together — so bringing the car to a halt brings the engine to a halt too. The pedal has to be down before the revs reach idle, not after.'],
      });
    }
    if (this.phase === 0 && sim.kph < 0.6) { this.phase = 1; this.tidyTime = 0; }
    if (this.phase === 1) {
      if (sim.gear === 0 && sim.clutchPedal < 0.08) {
        this.tidyTime += dt;
        if (this.tidyTime > 1.2) {
          this.phase = 2;
          return this.push({
            level: this.stalledOnStop ? 'ok' : 'good',
            headline: 'Stopped and left tidy',
            lines: ['Neutral with your foot off the pedal. That is the right state to wait in: nothing loaded, nothing wearing, and if you are shunted from behind the car will not leap forwards.'],
          });
        }
      } else this.tidyTime = Math.max(0, this.tidyTime - dt);
    }
    return null;
  }

  onLaunch(L, sim) {
    if (this.phase < 2) return null;
    this.done = true;
    return this.push(judgeLaunch(L, sim));
  }
}

/* ========================================================= 5. hill start */

export class HillStartDrill extends Drill {
  id = 'hill'; group = 'Clutch control';
  title = 'Hill start';
  aim = 'Pull away uphill without rolling back — and without holding the car on the clutch.';
  teach = [
    'The hill is where the tempting habit lives: <b>balancing the car on a slipping clutch</b> so it neither rolls back nor moves. It works, and it puts the whole weight of the car through a slipping plate with nothing to cool it. Do that at every hill junction and you will be buying a clutch.',
    '<b>Holding position is the brake\'s job, or the handbrake\'s. Never the clutch.</b> This is the one that catches riders hardest, because on a bike balancing on the clutch is a legitimate technique.',
    'The sequence: handbrake on, into first, a little more throttle than on the flat, clutch up to the bite until you feel the car strain against the handbrake — <b>then release the handbrake and keep the clutch coming up.</b> The slip lasts about a second, not ten.',
    'A 10% hill. Roll back less than a car\'s length and do not sit in the friction zone.',
  ];

  constructor() { super(); this.launched = false; }

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm, gradePercent: 10, handbrake: true }; }

  instruction(sim) {
    if (this.done) return { title: 'Away and up the hill.', detail: 'Finish below.' };
    if (sim.stalled) return { title: 'Stalled — clutch down and restart', detail: 'Nothing damaged. More throttle before the zone next time.' };
    this.targetGear = sim.gear === 0 ? 1 : null;
    if (sim.gear !== 1) return { title: 'A 10% hill, handbrake on', detail: 'Into first.' };
    if (sim.handbrake) return { title: 'Find the bite against the handbrake', detail: 'More throttle than on the flat, then clutch up until the car strains. Then drop the handbrake.' };
    return { title: 'Clutch the rest of the way up', detail: 'Keep it coming. Do not park in the friction zone.' };
  }

  onLaunch(L, sim) {
    if (this.launched) return null;
    this.launched = true;
    this.done = true;
    const card = judgeLaunch(L, sim);
    if (sim.handbrake) card.lines.push('You went up the hill with the handbrake still on, which the car will tolerate and the brakes will not thank you for.');
    if (L.slipSeconds > 2 && card.outcome !== 'slipped') {
      card.lines.push(`The clutch was working for ${s1(L.slipSeconds)} s. On a hill that is the number to watch — it is the slip that holds the car, and holding the car is not its job.`);
    }
    return this.push(card);
  }
}

/* ================================================== 6. the shift hand-off */

export class HandoffDrill extends Drill {
  id = 'handoff'; group = 'Shifting';
  title = 'The hand-off in a gear change';
  aim = 'Change gear without the car nodding — judged on the clutch, not on the timing.';
  teach = [
    'A gear change is the same hand-off as a launch, done faster and from a running start. Throttle off, clutch down, lever across, clutch up while the throttle comes back on. The car should not nod.',
    'What makes it nod is the <b>mismatch</b>: when the clutch takes up, the engine and the gearbox are turning at different speeds, and something has to give. Either the clutch drags them together — which you feel as a shove and the plate feels as heat — or you have already brought the revs to where the new gear wants them.',
    'Going <i>up</i>, the revs need to <b>fall</b>, and they do that on their own if you give them a moment. Rushing the pedal back up before they have fallen is the most common cause of a jerky upshift.',
    'Nothing in this drill is scored on when you change gear. Change wherever you like; it is judged on how the clutch comes back.',
  ];

  constructor() { super(); this.n = 0; this.target = 4; this.mark = null; }

  setup() { const v = 35 / 3.6; return { speed: v, gear: 2, rpm: rpmAtSpeed(v, 2) }; }

  instruction(sim) {
    if (this.done) return { title: 'Four changes done.', detail: 'Finish below.' };
    this.targetGear = null;
    return {
      title: `Change ${this.n + 1} of ${this.target} — any gear you like`,
      detail: 'Up or down, your choice. Smoothness is the only thing being measured.',
    };
  }

  onShift(rec, rel, sim) {
    if (rec.kind !== 'upshift' && rec.kind !== 'downshift') return null;
    this._pending = rec;
    this.mark = sim.markShudder();
    return null;
  }

  onRelease(rel, sim) {
    if (!this._pending) return null;
    const rec = this._pending; this._pending = null;
    const card = judgeHandoff(rec, rel, sim, { lurch: sim.lurchSince(this.mark) });
    this.n++;
    if (this.n >= this.target) this.done = true;
    return this.push(card);
  }
}

/* ======================================================= 7. rev matching */

export class RevMatchDrill extends Drill {
  id = 'revmatch'; group = 'Shifting';
  title = 'Rev matching on downshifts';
  aim = 'Bring the engine up to meet the gear before the clutch has to.';
  teach = [
    'Changing down is the mismatch problem at its worst. The lower gear needs the engine turning <b>faster</b> than it currently is, and if you simply let the clutch out, the clutch itself drags it up to speed. You feel a shove; the plate eats the difference as heat.',
    'The fix is a <b>blip</b>: while the pedal is down, a quick stab of throttle to lift the revs to roughly where the new gear needs them, then let the clutch out. Done right the car does not move on its springs at all.',
    'Your bike instinct is already correct here — it is the same blip. The only difference is that a dry clutch punishes you much faster for skipping it.',
    'The target rpm is shown for each one, and the engine-versus-wheels bar shows you closing the gap. Within about 300 rpm is a smooth release.',
  ];

  constructor() { super(); this.steps = [[5, 3], [4, 2], [6, 4]]; this.i = 0; }

  setup() { const v = 60 / 3.6; return { speed: v, gear: 5, rpm: rpmAtSpeed(v, 5) }; }

  instruction(sim) {
    const st = this.steps[this.i];
    if (!st) { this.done = true; return { title: 'Three downshifts attempted.', detail: 'Finish below.' }; }
    const [from, to] = st;
    this.targetGear = to;
    const target = rpmAtSpeed(sim.speed, to);
    this.band = [Math.max(0, target - 300), target + 300];
    return {
      title: `${from} → ${to}: bring the engine to ${r(target)} rpm`,
      detail: sim.gear === from
        ? 'Clutch down, blip the throttle into the green band, then let the clutch out.'
        : `Get back into ${from} first.`,
    };
  }

  onShift(rec, rel, sim) {
    const st = this.steps[this.i];
    if (!st || rec.to !== st[1]) return null;
    this._pending = rec;
    this.mark = sim.markShudder();
    return null;
  }

  onRelease(rel, sim) {
    const st = this.steps[this.i];
    if (!st || !this._pending || rel.gear !== st[1]) return null;
    const rec = this._pending; this._pending = null;
    this.i++;
    const card = judgeHandoff(rec, rel, sim, { lurch: sim.lurchSince(this.mark) });
    card.headline = `${rec.from} → ${rec.to}: engine ${r(rel.engineRpm)}, gear wanted ${r(rel.drivenRpm)}`;
    return this.push(card);
  }
}

/* =============================================== 8. downshift for a corner */

export class CornerDrill extends Drill {
  id = 'corner'; group = 'Shifting';
  title = 'Downshifting into a corner';
  aim = 'Brake, change down and get back on the power without unsettling the car.';
  teach = [
    'A corner puts the whole sequence together under a bit of time pressure: slow down, select the gear that will pull you out the other side, release the clutch smoothly, then back on the throttle.',
    'Do the braking <b>first</b> and the gear change <b>after</b> — not both at once. Trying to brake and change together is how learners end up arriving at a corner in the wrong gear with the clutch still down.',
    'The gear you want is the one that will be in its useful range <i>on the way out</i>, not the one that suits the speed you are at now. For a corner taken at about 35 km/h, that is usually second or third.',
    'Brake from 70 to about 35, take third, release smoothly, and accelerate out.',
  ];

  constructor() { super(); this.phase = 0; this.mark = null; }

  setup() { const v = 70 / 3.6; return { speed: v, gear: 5, rpm: rpmAtSpeed(v, 5) }; }

  instruction(sim) {
    if (this.done) return { title: 'Through the corner.', detail: 'Finish below.' };
    if (this.phase === 0) {
      this.targetGear = null;
      return { title: `Corner ahead — brake from ${r(sim.kph)} to about 35 km/h`, detail: 'Braking first. Leave the gear alone for now.' };
    }
    if (this.phase === 1) {
      this.targetGear = 3;
      return { title: 'Now take third', detail: `Third wants about ${r(rpmAtSpeed(sim.speed, 3))} rpm. Blip as you go down.` };
    }
    this.targetGear = null;
    return { title: 'Back on the throttle, out of the corner', detail: 'Smoothly — the clutch should already be home.' };
  }

  tick(sim) {
    if (this.phase === 0 && sim.kph < 38) this.phase = 1;
    if (this.phase === 2 && sim.kph > 55) {
      this.done = true;
      return this.push({
        level: 'good', headline: 'Out of the corner',
        lines: [`Accelerating away in ${sim.gear} at ${r(sim.rpm)} rpm. If that number is above about ${CAR.lugBand[1]} you picked a gear that can actually pull you out, which is the whole point of changing down before a corner rather than after it.`],
      });
    }
    return null;
  }

  onShift(rec, rel, sim) {
    if (rec.kind !== 'downshift') return null;
    this._pending = rec; this.mark = sim.markShudder();
    return null;
  }

  onRelease(rel, sim) {
    if (!this._pending) return null;
    const rec = this._pending; this._pending = null;
    if (this.phase === 1) this.phase = 2;
    const card = judgeHandoff(rec, rel, sim, { lurch: sim.lurchSince(this.mark) });
    const timing = judgeShift(rec, rel, {});
    if (timing.level === 'damage' || timing.level === 'bad') {
      card.level = timing.level;
      card.lines = [...timing.lines, ...card.lines.slice(0, 1)];
    }
    return this.push(card);
  }
}

/* ========================================================= 9. shift timing */

export class TimingDrill extends Drill {
  id = 'timing'; group = 'When to change';
  title = 'When to change up and down';
  aim = 'The easy part: the rev ranges, and the one mistake that destroys engines.';
  teach = [
    'The principle for going up: <b>change up when you no longer need the acceleration the gear is giving you.</b> In normal driving that lands around <b>2,000–2,500 rpm</b> in a petrol car and <b>1,800–2,200</b> in a diesel; when you want the acceleration, hold on to <b>3,000–3,500</b>. Ranges, not settings.',
    `Going down: change before the engine is labouring. Under load, below roughly <b>${CAR.lugBand[0]}–${CAR.lugBand[1]} rpm</b>, it is lugging — being asked for torque it cannot make.`,
    'And the expensive one. On an upshift the limiter protects the engine. On a <b>downshift it cannot</b>: the wheels drive the engine through the clutch, and the limiter can only cut fuel. Select a gear too low for your speed and the road spins the engine past its mechanical limit — valves meet pistons, and it is finished in under a second. That is the <b>money shift</b>.',
    () => '<ul class="speed-table">' + [1, 2, 3, 4, 5].map((g) =>
      `<li><span>${g}</span><b>up to ~${r(maxSpeedForGear(g))} km/h</b><i>${kphPer1000(g).toFixed(1)} per 1,000&nbsp;rpm</i></li>`).join('') + '</ul>',
    'Learn the shape, not the digits: <b>second is a town gear, third is a roundabout gear, fourth and fifth are road gears.</b> Work up to sixth, then back down to second.',
  ];

  constructor() { super(); this.band = CAR.upshiftNormal; this.phase = 0; }

  setup() { const v = 15 / 3.6; return { speed: v, gear: 1, rpm: rpmAtSpeed(v, 1) }; }

  instruction(sim) {
    if (this.done) return { title: 'Up and back down.', detail: 'Finish below.' };
    if (this.phase === 0) {
      if (sim.gear >= 6) { this.phase = 1; this.band = null; }
      else {
        this.band = CAR.upshiftNormal;
        this.targetGear = sim.gear === 0 ? null : Math.min(6, sim.gear + 1);
        return { title: `Work up the box — take ${this.targetGear ?? 'a gear'}`, detail: 'Shift when the needle reaches the green band.' };
      }
    }
    if (sim.kph < 20 && sim.gear > 0 && sim.gear <= 2) { this.done = true; return { title: 'Down to second.', detail: 'Finish below.' }; }
    const next = sim.gear > 1 ? sim.gear - 1 : null;
    if (!next) { this.targetGear = null; return { title: 'Pick a gear that suits the speed', detail: '' }; }
    const ceiling = maxSpeedForGear(next);
    if (sim.kph > ceiling * 0.98) {
      this.targetGear = null;
      return {
        title: `${next} will not take ${r(sim.kph)} km/h`,
        detail: `${next} runs out at about ${r(ceiling)} km/h. Brake first — selecting it now is the money shift.`,
      };
    }
    this.targetGear = next;
    return { title: `${r(sim.kph)} km/h — now take ${next}`, detail: `${next} is good to about ${r(ceiling)} km/h, so you have room.` };
  }

  onShift(rec, rel, sim) {
    if (rec.kind !== 'upshift' && rec.kind !== 'downshift') return null;
    this._pending = rec;
    return null;
  }

  onRelease(rel, sim) {
    if (!this._pending) return null;
    const rec = this._pending; this._pending = null;
    return this.push(judgeShift(rec, rel, { band: CAR.upshiftNormal }));
  }
}

/* ========================================================= 10. a short drive */

export class DriveDrill extends Drill {
  id = 'drive'; group = 'Putting it together';
  title = 'A short drive';
  aim = 'Everything at once, at the pace of an ordinary road.';
  teach = [
    'No new material. Pull away, work up the box, slow for a junction, pull away again, and stop properly at the end.',
    'Everything is being watched: launches, hand-offs, slip, judder, lugging, and whether you leave the car tidy when you stop.',
  ];

  constructor() {
    super();
    this.i = 0;
    this.mark = null;
    this.script = [
      { text: 'Pull away and get up to third.', ok: (s) => s.gear >= 3 && s.kph > 30 },
      { text: 'Up to fifth and cruise.', ok: (s) => s.gear >= 5 && s.kph > 60 },
      { text: 'Junction ahead — brake and come down to second.', ok: (s) => s.gear <= 2 && s.gear > 0 && s.kph < 30 },
      { text: 'Clear — build back up to fourth.', ok: (s) => s.gear >= 4 && s.kph > 50 },
      { text: 'Now stop completely, neutral, foot off the clutch.', ok: (s) => s.kph < 1 && s.gear === 0 && s.clutchPedal < 0.1 },
    ];
  }

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }

  instruction(sim) {
    const st = this.script[this.i];
    if (!st) { this.done = true; return { title: 'Drive complete.', detail: 'Finish below.' }; }
    if (st.ok(sim)) { this.i++; return this.instruction(sim); }
    this.targetGear = null;
    return { title: `Step ${this.i + 1} of ${this.script.length}`, detail: st.text };
  }

  onLaunch(L, sim) {
    const c = judgeLaunch(L, sim);
    c.lines = c.lines.slice(0, 1);
    return this.push(c);
  }

  onShift(rec, rel, sim) {
    if (rec.kind !== 'upshift' && rec.kind !== 'downshift') return null;
    this._pending = rec; this.mark = sim.markShudder();
    return null;
  }

  onRelease(rel, sim) {
    if (!this._pending) return null;
    const rec = this._pending; this._pending = null;
    const hand = judgeHandoff(rec, rel, sim, { lurch: sim.lurchSince(this.mark) });
    const timing = judgeShift(rec, rel, { band: CAR.upshiftNormal });
    if (timing.level === 'damage' || timing.level === 'bad') {
      return this.push({ level: timing.level, headline: timing.headline, lines: [...timing.lines, ...hand.lines.slice(0, 1)] });
    }
    hand.lines = hand.lines.slice(0, 2);
    return this.push(hand);
  }
}

export const DRILLS = [
  BitePointDrill, LaunchDrill, CrawlDrill, StopStartDrill, HillStartDrill,
  HandoffDrill, RevMatchDrill, CornerDrill,
  TimingDrill, DriveDrill,
];
