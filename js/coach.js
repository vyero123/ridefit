// coach.js — turns what the simulation measured into specific feedback.
//
// Never "wrong". Always: what the engine and the clutch were doing, what
// that does to the car, and what to change next time.

import { CAR, kphPer1000, maxSpeedForGear } from './car.js';
import { SNATCH_LEVEL } from './sim.js';

const r = (n) => Math.round(n).toLocaleString('en-GB');
const s1 = (n) => n.toFixed(1);

export const LEVEL = { damage: 4, bad: 3, off: 2, ok: 1, good: 0 };
const worst = (a, b) => (LEVEL[a] >= LEVEL[b] ? a : b);

/* ------------------------------------------------------------- launches */

/**
 * Classify a launch. Three outcomes come straight out of the physics:
 * the engine died, the clutch was used as a brake, or neither. Snatchiness
 * is reported alongside rather than as a category of its own, because the
 * model measures the size of the take-up jolt honestly and does not pretend
 * to reproduce sustained judder.
 */
export function launchOutcome(L, stalled) {
  if (stalled || L.stalled) return 'stalled';
  if (L.energy > 14000 || L.slipSeconds > 2.5) return 'slipped';
  return 'clean';
}

export function judgeLaunch(L, sim) {
  const outcome = launchOutcome(L, L.stalled);
  const lines = [];
  let level = 'good';
  let headline = '';

  if (outcome === 'stalled') {
    level = 'bad';
    headline = 'Stalled';
    if (L.maxThrottle < 0.12) {
      lines.push(`No throttle at all, and the clutch came up faster than the engine could cope with. At a standstill the engine is turning at ${r(CAR.idleRpm)} rpm and the wheels at nothing — the clutch has to bridge that gap gradually, and with no gas there is almost nothing in reserve to bridge it with.`);
    } else {
      lines.push(`The clutch came up faster than the engine could follow. It was pulled down from ${r(L.maxRpm)} rpm to a stop in well under a second, which means the clutch was asking for more torque than the engine could make at those revs.`);
    }
    lines.push('Two fixes, and you need both: a little more throttle before the clutch reaches the friction zone, and a slower hand through the zone itself. Stalling costs nothing but your dignity — it is the one mistake on this list that does no damage.');
  }

  if (outcome === 'slipped') {
    level = 'bad';
    headline = `Slipped the clutch for ${s1(L.slipSeconds)} s`;
    lines.push(`Away cleanly enough, but it cost ${r(L.energy / 1000)} kJ of heat in the clutch, and the engine was up at ${r(L.maxRpm)} rpm while the car was barely moving. That gap was being bridged by friction, and friction here means a dry plate with nothing to cool it.`);
    lines.push('This is the habit that transfers badly from a bike. A wet clutch sits in oil and is designed to be slipped; this one is not. Less throttle, and let the pedal come up sooner.');
  }

  if (outcome === 'clean') {
    const snatched = L.lurch > SNATCH_LEVEL;
    headline = snatched ? 'Away, but it snatched' : 'Clean';
    lines.push(`Engine held at ${r(L.minRpm)} rpm, clutch working for ${s1(L.slipSeconds)} s, ${r(L.energy / 1000)} kJ of heat into the plate. Nothing died and nothing was burned.`);
    if (snatched) {
      level = 'ok';
      lines.push(`It took up with a jolt of ${s1(L.lurch)} m/s² though — a snatch rather than a squeeze. The clutch went from carrying nothing to carrying everything in one step, and the whole driveline took the shock at once. ${L.minRpm < 950 ? `The engine was down at ${r(L.minRpm)} rpm when it bit, which makes it worse.` : 'Slower through the friction zone would smooth it out.'}`);
    } else {
      lines.push(`Take-up jolt of ${s1(L.lurch)} m/s² — gentle. A passenger would not have noticed that.`);
    }
    if (L.energy < 9000 && !snatched) lines.push('That is a cheap launch: a dry clutch would take a few of those a minute all day.');
  }

  if (L.rollback > 0.25) {
    level = worst(level, 'off');
    lines.push(`You also rolled back about ${s1(L.rollback)} m before it took up.`);
  }
  return { level, headline, lines, outcome };
}

/* ------------------------------------------------- the shift hand-off */

/**
 * A gear change judged on the hand-off rather than the timing: how long the
 * clutch was down, how well matched the two sides were when it came back,
 * and how roughly the car took it.
 */
export function judgeHandoff(rec, rel, sim, opts = {}) {
  const lines = [];
  let level = 'good';
  const name = rec ? `${rec.from} → ${rec.to}` : 'Clutch back up';
  let headline = name;

  const mismatch = rel ? rel.mismatch : null;
  const held = rec?.pedalHeldMs ?? rel?.heldMs ?? null;

  if (mismatch != null) {
    const a = Math.abs(mismatch);
    headline = `${name} — ${a < 150 ? 'matched' : `${r(a)} rpm apart`}`;
    if (a < CAR.revMatchTolerance) {
      lines.push(`Engine and wheels were within ${r(a)} rpm when the clutch took up. Nothing for the plate to absorb and nothing for the car to lurch about — that is the hand-off done properly.`);
    } else if (a < 800) {
      level = 'ok';
      lines.push(`${r(a)} rpm apart at the friction zone. You would feel a small nudge. The engine was ${mismatch < 0 ? 'a little slow' : 'a little fast'} for the gear — ${mismatch < 0 ? 'a short blip of throttle while the pedal is down' : 'a touch less throttle, or let it fall further'} closes it.`);
    } else {
      level = 'off';
      lines.push(`${r(a)} rpm apart. The engine was ${mismatch < 0 ? 'much slower' : 'much faster'} than the gear wanted, so the clutch had to drag the two together — that is the shove you felt, and the heat went into the plate.`);
    }
  }

  if (rel?.biteMs != null) {
    if (rel.biteMs < 150) {
      level = worst(level, 'off');
      lines.push(`You came through the friction zone in ${Math.round(rel.biteMs)} ms. That is dropping it rather than releasing it; whatever mismatch there was arrived all at once.`);
    } else if (rel.biteMs > 1400) {
      level = worst(level, 'off');
      lines.push(`${s1(rel.biteMs / 1000)} s spent in the friction zone. That is where the plate is slipping and heating. Through it deliberately, but do not live there.`);
    } else {
      lines.push(`${Math.round(rel.biteMs)} ms through the friction zone, which is about right for a gear change.`);
    }
  }

  if (rel?.freeMs != null && rel.freeMs > 700 && rel.biteMs != null && rel.biteMs < 900) {
    lines.push(`You were slow off the floor. That part of the travel does nothing at all — be quick through the free play and save the care for the friction zone.`);
  }

  if (held != null) {
    if (held > 2200) {
      level = worst(level, 'off');
      lines.push(`The pedal was down ${s1(held / 1000)} s in total. A change takes about half a second to a second; the rest is the release bearing spinning under load for nothing.`);
    } else if (held < 2200 && held > 1300) {
      level = worst(level, 'ok');
      lines.push(`Pedal down ${s1(held / 1000)} s — slightly long. Down, lever, up, as one movement.`);
    }
  }

  if (opts.lurch != null && opts.lurch > SNATCH_LEVEL) {
    level = worst(level, 'off');
    lines.push(`The car took the gear with a jolt of ${s1(opts.lurch)} m/s² — the clutch picked up the mismatch all at once instead of easing into it.`);
  }

  return { level, headline, lines };
}

/* ----------------------------------------------------- shift timing */

export function judgeShift(rec, rel, opts = {}) {
  const band = opts.band || CAR.upshiftNormal;
  const lines = [];
  let level = 'good';
  const atRpm = rec.rpmAtDecision;
  const after = rec.rpmAfterPredicted;
  let headline = '';

  if (rec.kind === 'upshift') {
    headline = `${rec.from} → ${rec.to} at ${r(atRpm)} rpm`;
    if (atRpm < CAR.lugBand[1]) {
      level = 'bad';
      lines.push(`Shifted at ${r(atRpm)} rpm, which is already lugging territory, and the next gear is lower still. Below about ${CAR.lugBand[1]} rpm the engine is being asked to pull from too far down.`);
    } else if (atRpm > CAR.redlineRpm - 400) {
      level = 'off';
      lines.push(`${r(atRpm)} rpm is at the limiter. No harm done on the way up, but a long way past the point the gear stopped being useful.`);
    } else if (atRpm < band[0] - 250) {
      level = 'off';
      lines.push(`${r(atRpm)} rpm is early. The new gear lands at ${r(after)} rpm, and from there the car has little left to give.`);
    } else if (after < CAR.lugBand[1]) {
      level = 'ok';
      lines.push(`${r(atRpm)} rpm is in the window, but it landed at ${r(after)} rpm in ${rec.to}. The gaps between the lower gears are wide, so down there hold on to the top of the window.`);
    } else {
      lines.push(`${r(atRpm)} rpm, landing at ${r(after)} rpm in ${rec.to}. Both ends of that are in the useful part of the range.`);
    }
    if (after < CAR.lugBand[0]) {
      level = worst(level, 'bad');
      lines.push(`${r(after)} rpm in ${rec.to} is below ${CAR.lugBand[0]} — any throttle from there is lugging.`);
    }
  }

  if (rec.kind === 'downshift') {
    headline = `${rec.from} → ${rec.to} at ${r(rec.kphAtDecision)} km/h`;
    if (after > CAR.mechanicalLimitRpm) {
      level = 'damage';
      lines.push(`${rec.to} at ${r(rec.kphAtDecision)} km/h forces the engine to ${r(after)} rpm. That engine is scrap.`);
      lines.push(`This is the money shift. The wheels drive the engine through the clutch, so the limiter cannot save you — it only cuts fuel, and fuel is not the problem. Valves meet pistons, and it is over before you finish lifting your foot.`);
      lines.push(`${rec.to} can only be selected below about ${r(maxSpeedForGear(rec.to))} km/h.`);
    } else if (after > CAR.redlineRpm) {
      level = 'bad';
      lines.push(`${rec.to} at this speed means ${r(after)} rpm, over the ${r(CAR.redlineRpm)} limiter. ${rec.to} is good to about ${r(maxSpeedForGear(rec.to))} km/h.`);
    } else if (after < CAR.lugBand[1]) {
      level = 'off';
      lines.push(`${rec.to} only brings the engine to ${r(after)} rpm — you have changed gear and still cannot accelerate. One gear lower was the answer.`);
    } else {
      lines.push(`${rec.to} puts the engine at ${r(after)} rpm, where it pulls, with room above.`);
    }
  }
  return { level, headline, lines };
}

/* ------------------------------------------------------------- habits */

export function habitNotes(sim, attempts = []) {
  const out = [];

  if (sim.moneyShifted) out.push({
    level: 'bad',
    text: `A gear was selected that forced the engine to ${r(sim.worstPredictedRpm)} rpm — past ${r(CAR.mechanicalLimitRpm)}, where valves and pistons meet. Check the speedometer before the lever, every time.`,
  });

  if (sim.slipEnergy > 40000) out.push({
    level: 'bad',
    text: `${r(sim.slipEnergy / 1000)} kJ of heat went into the clutch this run, over ${s1(sim.slipSeconds)} s of slipping. A launch costs 3–8 kJ; much more than that is the plate being used as a brake. On your bike the oil carries that away. Here there is nothing but air.`,
  });
  else if (sim.slipSeconds > 6) out.push({
    level: 'off',
    text: `${s1(sim.slipSeconds)} s of the run had the clutch slipping. Each second of that is wear you cannot see until the clutch starts letting go on its own.`,
  });

  if (sim.ridingSeconds > 1.2) out.push({
    level: 'bad',
    text: `${s1(sim.ridingSeconds)} s riding the clutch — slipping it while the car was already going fast enough for the gear to carry it. That slip bought nothing and cost heat.`,
  });

  if (sim.lurch > SNATCH_LEVEL * 1.4) out.push({
    level: 'off',
    text: `The worst take-up jolt was ${s1(sim.lurch)} m/s². Every one of those is the whole driveline picking up a mismatch in one step — clutch, gearbox, driveshafts and mounts all take it at once.`,
  });

  if (sim.lugSeconds > 0.8) out.push({
    level: 'bad',
    text: `${s1(sim.lugSeconds)} s lugging — throttle on below ${CAR.lugBand[1]} rpm. Each firing stroke arrives as a hammer blow rather than a push, straight into the bearings and mounts.`,
  });

  if (sim.restingSeconds > 2.5) out.push({
    level: 'off',
    text: `${s1(sim.restingSeconds)} s with weight resting on the clutch pedal. Even inside the free play that holds the release bearing against a spinning cover. Foot on the floor, not the pedal.`,
  });

  if (sim.heldAtStopSeconds > 5) out.push({
    level: 'off',
    text: `The pedal was held down at a standstill. Neutral and foot off is the right answer at a red light.`,
  });

  if (!out.length) {
    const rough = attempts.filter((a) => a.level === 'bad' || a.level === 'damage').length;
    if (rough) out.push({
      level: 'off',
      text: `No sustained bad habits, but ${rough} ${rough === 1 ? 'attempt was' : 'attempts were'} marked harmful above. Those are single moments rather than habits, and single moments are what break things.`,
    });
    else out.push({ level: 'good', text: 'Clean run: no slipping beyond what the launches needed, no judder, no lugging, nothing held down.' });
  }
  return out;
}

export { kphPer1000, maxSpeedForGear };
