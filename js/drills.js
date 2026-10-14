// drills.js — the progressive drills.
//
// Each one isolates a single skill, teaches it, tests it, then shows what
// actually happened. None of them time you or reward going faster.

import { CAR, maxSpeedForGear, kphPer1000, rpmAtSpeed } from './car.js';
import { judgeShift, judgeRelease, habitNotes } from './coach.js';

const r = (n) => Math.round(n).toLocaleString('en-GB');

class Drill {
  constructor() {
    this.attempts = [];
    this.done = false;
    this.band = CAR.upshiftNormal;
    this.targetGear = null;
  }
  // Overridden by each drill.
  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }
  instruction() { return { title: '', detail: '' }; }
  onShift() { return null; }
  onRelease() { return null; }
  tick() {}
  push(card) { this.attempts.push(card); return card; }
  report(sim) { return habitNotes(sim); }
}

/* ------------------------------------------------------------------ 1 */

export class UpshiftDrill extends Drill {
  id = 'upshift';
  title = 'Upshifts only';
  aim = 'Find the window where a gear has done its job.';
  teach = [
    'An upshift is not triggered by a number. It is triggered by a question: do I still need what this gear is giving me? When the answer is no, go up.',
    `In normal driving that question answers itself somewhere around <b>${CAR.upshiftNormal[0]}–${CAR.upshiftNormal[1]} rpm</b> in a petrol car, and lower in a diesel — roughly <b>1,800–2,200</b>, because a diesel runs out of revs much sooner. When you actually want the acceleration, hold on to <b>${CAR.upshiftBrisk[0]}–${CAR.upshiftBrisk[1]}</b>.`,
    'These are ranges, not settings. Uphill, loaded, or about to overtake, you hold the gear longer. Gently downhill you can go up earlier. Nobody shifts at exactly 2,300 rpm.',
    'One wrinkle worth knowing before you start: <b>the gaps between the lower gears are much wider than between the higher ones.</b> First to second drops the revs by nearly half, fifth to sixth barely at all. So in the low gears you hold on to the top of the window; higher up the box the window works as written.',
    'Sequence, every time: <b>throttle off → clutch down → lever → clutch up → throttle on</b>. The pedal is down only while the lever is moving.',
  ];

  setup() { return { speed: 15 / 3.6, gear: 1, rpm: rpmAtSpeed(15 / 3.6, 1) }; }

  instruction(sim) {
    const next = Math.min(6, (sim.gear || 1) + 1);
    this.targetGear = sim.gear >= 6 ? null : next;
    if (sim.gear >= 6) return { title: 'Sixth. That is the drill.', detail: 'Hold it there, or finish below.' };
    return {
      title: `Accelerate in ${sim.gear || 1}, then take ${next}`,
      detail: `Hold the throttle. When the needle reaches the green band, shift up. Clutch down, lever across, clutch up.`,
    };
  }

  onShift(rec, rel, sim) {
    if (rec.kind !== 'upshift' && rec.to !== 0) {
      if (rec.kind === 'downshift') {
        return this.push({ level: 'off', headline: `${rec.from} → ${rec.to}`, lines: ['This drill is upshifts only — carry on up the box.'] });
      }
      return null;
    }
    if (rec.kind !== 'upshift') return null;
    const card = judgeShift(rec, rel, { band: this.band });
    if (rec.to >= 6) this.done = true;
    return this.push(card);
  }
}

/* ------------------------------------------------------------------ 2 */

export class DownshiftDrill extends Drill {
  id = 'downshift';
  title = 'Downshifts only';
  aim = 'Come down the box before the engine bogs — and never into a gear that cannot take the speed.';
  teach = [
    `Going down, the trigger is the opposite question: is the engine still turning fast enough to pull? Below roughly <b>${CAR.lugBand[0]}–${CAR.lugBand[1]} rpm with your foot in it</b> the engine is lugging — labouring against a load it cannot answer. Change down before you get there, not after.`,
    `Now the dangerous half. On an upshift the rev limiter protects the engine. On a downshift it cannot: the <b>wheels are driving the engine</b> through the clutch, and the limiter can only cut fuel. Select a gear too low for your speed and the road spins the engine straight past its mechanical limit — valves meet pistons, and the engine is finished in under a second. That is the <b>money shift</b>, and it is the most expensive mistake available to you in a manual car.`,
    'So each gear has a ceiling. In this car, at the limiter:',
    () => '<ul class="speed-table">' + [1, 2, 3, 4, 5].map((g) =>
      `<li><span>${g}</span><b>up to ~${r(maxSpeedForGear(g))} km/h</b><i>${kphPer1000(g).toFixed(1)} km/h per 1,000&nbsp;rpm</i></li>`).join('') + '</ul>',
    'Learn the shape of that list, not the digits: <b>second is a town gear, third is a roundabout gear, fourth and fifth are road gears.</b> If you are doing 100 km/h, second is not a choice you have.',
  ];

  // No upshift window on the dial here — the only band that matters coming
  // down is the lugging zone, which the dial always shows.
  constructor() { super(); this.band = null; }

  setup() { return { speed: 100 / 3.6, gear: 6, rpm: rpmAtSpeed(100 / 3.6, 6) }; }

  instruction(sim) {
    if (sim.kph < 12 && sim.gear <= 2) { this.done = true; }
    const next = sim.gear > 1 ? sim.gear - 1 : null;
    this.targetGear = next;
    if (this.done) return { title: 'Down to a crawl in second. Good.', detail: 'Finish below to see the breakdown.' };
    return {
      title: `Braking from ${r(sim.kph)} km/h — take ${next ?? 1}`,
      detail: `Brake, and come down one gear at a time. Check the speed before each one: ${next ? `${next} is good to about ${r(maxSpeedForGear(next))} km/h.` : ''}`,
    };
  }

  onShift(rec, rel, sim) {
    if (rec.kind !== 'downshift') return null;
    return this.push(judgeShift(rec, rel, { band: this.band }));
  }
}

/* ------------------------------------------------------------------ 3 */

export class BothDrill extends Drill {
  id = 'both';
  title = 'Up and down';
  aim = 'Put the two together, and choose the gear that suits what comes next.';
  teach = [
    'Real driving is not a sequence of upshifts. It is a running answer to one question: <b>does the gear I am in suit the road in front of me?</b>',
    'Two habits worth building here. Going up, do not skip past the window and then sit at low revs in too high a gear — that is how people end up lugging without noticing. Coming down, look at the speed first and the gear second.',
    'You can skip gears in both directions when it suits — fifth straight to third slowing for a junction, second straight to fourth on a gentle pull-away. Just do the speed arithmetic before you commit.',
  ];

  constructor() { super(); this.phase = 0; this.script = [
    { want: 'up', to: 5, text: 'Build up to fifth, shifting in the window each time.' },
    { want: 'down', to: 2, text: 'Now a junction is coming. Brake and come down to second.' },
    { want: 'up', to: 4, text: 'Clear again — back up to fourth.' },
  ]; }

  setup() { return { speed: 12 / 3.6, gear: 1, rpm: rpmAtSpeed(12 / 3.6, 1) }; }

  instruction(sim) {
    const s = this.script[this.phase];
    if (!s) { this.done = true; return { title: 'Done.', detail: 'Finish below for the breakdown.' }; }
    this.targetGear = null;
    if (s.want === 'up' && sim.gear >= s.to) { this.phase++; return this.instruction(sim); }
    if (s.want === 'down' && sim.gear <= s.to && sim.gear !== 0 && sim.kph < 45) { this.phase++; return this.instruction(sim); }
    return { title: s.want === 'up' ? `Up to ${s.to}` : `Down to ${s.to}`, detail: s.text };
  }

  onShift(rec, rel) {
    if (rec.kind !== 'upshift' && rec.kind !== 'downshift') return null;
    return this.push(judgeShift(rec, rel, { band: this.band }));
  }
}

/* ------------------------------------------------------------------ 4 */

export class RevMatchDrill extends Drill {
  id = 'revmatch';
  title = 'Rev matching';
  aim = 'Meet the engine and the wheels at the same speed, so the clutch has nothing to absorb.';
  teach = [
    'When you change down, the wheels need the engine spinning faster than it currently is. If you just let the clutch out, <b>the clutch itself drags the engine up to speed</b> — you feel a shove, and the friction material eats the difference as heat.',
    'Instead, while the pedal is down, <b>blip the throttle</b> to lift the engine to roughly where the new gear needs it, then let the clutch out. Done right the car does not move on its springs at all.',
    'This is where your bike instinct helps: it is the same blip you already use. The difference is only that a dry clutch punishes you much faster for not bothering.',
    'The target rpm is shown for each attempt. Within about 300 rpm is a smooth release.',
  ];

  constructor() { super(); this.steps = [[5, 3], [4, 2], [6, 4]]; this.i = 0; this.band = null; }

  setup() { const s = 60 / 3.6; return { speed: s, gear: 5, rpm: rpmAtSpeed(s, 5) }; }

  instruction(sim) {
    const s = this.steps[this.i];
    if (!s) { this.done = true; return { title: 'Three matched downshifts attempted.', detail: 'Finish below.' }; }
    const [from, to] = s;
    this.targetGear = to;
    const target = rpmAtSpeed(sim.speed, to);
    this.band = [Math.max(0, target - 300), target + 300];
    return {
      title: `${from} → ${to}: aim for ${r(target)} rpm`,
      detail: sim.gear === from
        ? 'Clutch down, blip the throttle up to the green band, then let the clutch out through the bite point.'
        : `Get back into ${from} first.`,
    };
  }

  onShift(rec, rel, sim) {
    const s = this.steps[this.i];
    if (!s || rec.to !== s[1]) return null;
    this._pendingRec = rec;
    return null; // judged on release, when the mismatch is real
  }

  onRelease(rel, sim) {
    const s = this.steps[this.i];
    if (!s || !this._pendingRec || rel.gear !== s[1]) return null;
    const rec = this._pendingRec;
    this._pendingRec = null;
    const shift = judgeShift(rec, rel, { band: CAR.upshiftNormal });
    const match = judgeRelease(rel);
    this.i++;
    return this.push({
      level: match.level === 'good' ? shift.level : match.level,
      headline: `${rec.from} → ${rec.to}: engine ${r(rel.engineRpm)} rpm, wheels wanted ${r(rel.drivenRpm)} rpm`,
      lines: [...match.lines, ...shift.lines.slice(0, 2)],
    });
  }
}

/* ------------------------------------------------------------------ 5 */

export class HillStartDrill extends Drill {
  id = 'hill';
  title = 'Hill start';
  aim = 'Pull away uphill without rolling back, stalling, or holding the car on the clutch.';
  teach = [
    'This is the one that tempts every new driver into the habit that kills dry clutches: <b>balancing the car on a slipping clutch</b> so it neither rolls back nor moves. It works. It also puts the full weight of the car through a slipping plate with nothing to cool it. Do it at every hill junction and you will be buying a clutch.',
    '<b>Holding position is the brake\'s job, or the handbrake\'s.</b> Never the clutch.',
    'The sequence: handbrake on, into first, a little throttle, bring the clutch up to the bite point until you feel the car want to go — then <b>release the handbrake and keep the clutch coming up</b>. The slip lasts a second or so, not ten.',
    'If you stall, nothing is damaged. Stalling is embarrassing, not expensive. Riding the clutch is the opposite: invisible, and expensive.',
  ];

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm, gradePercent: 10, handbrake: true }; }

  constructor() { super(); this.rollback = 0; this.launched = false; this.band = null; }

  instruction(sim) {
    this.targetGear = sim.gear === 0 ? 1 : null;
    if (this.done) return { title: 'Away and up the hill.', detail: 'Finish below.' };
    if (sim.gear === 0) return { title: 'A 10% hill, handbrake on', detail: 'Into first. Then a little throttle, and bring the clutch up to the bite.' };
    if (sim.handbrake) return { title: 'Find the bite point', detail: 'A little throttle, clutch up until the nose lifts — then drop the handbrake.' };
    return { title: 'Clutch the rest of the way up', detail: 'Keep it coming up smoothly. Do not sit at the bite point.' };
  }

  tick(sim, dt = 0) {
    if (sim.speed < 0) this.rollback += -sim.speed * dt;
    if (sim.kph > 12 && !this.launched) {
      this.launched = true;
      this.done = true;
      const lines = [];
      let level = 'good';
      if (this.rollback > 0.25) {
        level = 'off';
        lines.push(`You rolled back about ${this.rollback.toFixed(1)} m before the car took up. On a hill that is the gap between you and whatever is behind you. A little more throttle, and drop the handbrake slightly later — once you can feel the car straining against it.`);
      }
      if (sim.ridingSeconds > 1.6) {
        level = 'bad';
        lines.push(`You held the car on a slipping clutch for ${sim.ridingSeconds.toFixed(1)} s. That is the habit to unlearn: ${(sim.slipEnergy / 1000).toFixed(0)} kJ of heat went into a plate with no oil to take it away. The handbrake does this job for free.`);
      } else {
        lines.push(`Slip under control — the clutch was only working for about ${Math.max(0.3, sim.ridingSeconds).toFixed(1)} s. That is what a hill start should cost.`);
      }
      if (sim.slipEnergy < 12000) lines.push(`Total clutch heat for the launch: ${(sim.slipEnergy / 1000).toFixed(0)} kJ. Low.`);
      return this.push({ level, headline: 'Away on the hill', lines });
    }
    if (sim.stalled && !this.launched && !this._stallNoted) {
      this._stallNoted = true;
      return this.push({
        level: 'ok', headline: 'Stalled',
        lines: ['Nothing was harmed. The engine ran out of revs because the clutch asked for more torque than it had at that rpm. Slightly more throttle before the bite, and bring the pedal up a touch slower through the bite itself.'],
      });
    }
    return null;
  }
}

/* ------------------------------------------------------------------ 6 */

export class MixedDrill extends Drill {
  id = 'mixed';
  title = 'A short drive';
  aim = 'Everything together, at the pace of an ordinary road.';
  teach = [
    'No new material. A few minutes of ordinary driving: pull away, work up the box, slow for a junction, pull away again, and stop properly.',
    'One thing to watch for, because it only shows up in a real drive: <b>at a standstill, go to neutral and take your foot off the pedal.</b> Sitting at lights with the clutch pinned down wears the release bearing for the whole wait, and it is the single most common bad habit in traffic.',
  ];

  constructor() {
    super();
    this.i = 0;
    this.script = [
      { text: 'Pull away in first and get up to third.', ok: (s) => s.gear >= 3 && s.kph > 30 },
      { text: 'Cruise up to fifth.', ok: (s) => s.gear >= 5 && s.kph > 60 },
      { text: 'Junction ahead — brake and come down to second.', ok: (s) => s.gear <= 2 && s.gear > 0 && s.kph < 30 },
      { text: 'Clear — build back up to fourth.', ok: (s) => s.gear >= 4 && s.kph > 50 },
      { text: 'Now stop completely. Neutral, and foot off the clutch.', ok: (s) => s.kph < 1 && s.gear === 0 && s.clutchPedal < 0.1 },
    ];
  }

  setup() { return { speed: 0, gear: 0, rpm: CAR.idleRpm }; }

  instruction(sim) {
    const s = this.script[this.i];
    if (!s) { this.done = true; return { title: 'Drive complete.', detail: 'Finish below for the breakdown.' }; }
    if (s.ok(sim)) { this.i++; return this.instruction(sim); }
    this.targetGear = null;
    return { title: `Step ${this.i + 1} of ${this.script.length}`, detail: s.text };
  }

  onShift(rec, rel) {
    if (rec.kind !== 'upshift' && rec.kind !== 'downshift') return null;
    const card = judgeShift(rec, rel, { band: this.band });
    // In the mixed drive, keep the running commentary short.
    card.lines = card.lines.slice(0, 2);
    return this.push(card);
  }
}

export const DRILLS = [
  UpshiftDrill, DownshiftDrill, BothDrill, RevMatchDrill, HillStartDrill, MixedDrill,
];
