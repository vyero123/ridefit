// coach.js — turns what the simulation measured into specific feedback.
//
// The rule throughout: never say "wrong". Say what the engine was doing,
// what that does to the car, and what the range is.

import { CAR, kphPer1000, maxSpeedForGear } from './car.js';

const r = (n) => Math.round(n).toLocaleString('en-GB');

/** Verdict levels, worst first. */
export const LEVEL = { damage: 4, bad: 3, off: 2, ok: 1, good: 0 };

function worst(a, b) { return LEVEL[a] >= LEVEL[b] ? a : b; }

/**
 * Judge one gear change.
 * @param {object} rec  the shift record from Sim
 * @param {object} rel  the matching release record, if the clutch is back up
 * @param {object} opts { band: [lo,hi] expected upshift window }
 */
export function judgeShift(rec, rel, opts = {}) {
  const band = opts.band || CAR.upshiftNormal;
  const lines = [];
  let level = 'good';
  let headline = '';

  const atRpm = rec.rpmAtDecision;
  const after = rec.rpmAfterPredicted;

  if (rec.kind === 'upshift') {
    headline = `${rec.from} → ${rec.to} at ${r(atRpm)} rpm, ${r(rec.kphAtDecision)} km/h`;

    if (atRpm < CAR.lugBand[1]) {
      level = 'bad';
      lines.push(`You shifted at ${r(atRpm)} rpm — that is already into lugging territory, and the gear above will be worse. Below about ${CAR.lugBand[1]} rpm the engine is being asked to pull from too far down.`);
    } else if (atRpm < band[0] - 250) {
      level = 'off';
      lines.push(`${r(atRpm)} rpm is early. There is nothing dangerous about it, but the new gear lands at ${r(after)} rpm, and from there the car has very little left to give. If you need to accelerate again you will be straight back down a gear.`);
    } else if (atRpm > CAR.redlineRpm - 400) {
      level = 'bad';
      lines.push(`${r(atRpm)} rpm is at the limiter. On the way up the limiter protects the engine, so this is not damage — but it is a long way past the point where the gear stopped being useful.`);
    } else if (atRpm > band[1] + 900) {
      level = 'off';
      lines.push(`${r(atRpm)} rpm is late for normal driving. That is a brisk-acceleration shift point, which is fine when you want the acceleration and wasteful when you don't.`);
    } else if (atRpm > band[1]) {
      level = 'ok';
      lines.push(`${r(atRpm)} rpm — just past the window, which is a perfectly normal shift if you wanted a bit more out of the gear.`);
    } else if (after < CAR.lugBand[1]) {
      level = worst(level, 'ok');
      lines.push(`${r(atRpm)} rpm is inside the ${band[0]}–${band[1]} window — but look where it landed: ${r(after)} rpm in ${rec.to}. The gaps between the lower gears are wide, so in 1st, 2nd and 3rd you want the top of the window or a little past it. Higher up the box the gaps close and the window works as written.`);
    } else {
      lines.push(`${r(atRpm)} rpm sits in the ${band[0]}–${band[1]} window. The new gear picks up at ${r(after)} rpm, which is still pulling.`);
    }

    if (after < CAR.lugBand[0]) {
      level = worst(level, 'bad');
      lines.push(`Where it left the engine is the real problem: ${r(after)} rpm in ${rec.to}. That is below ${CAR.lugBand[0]}, so any throttle from here is lugging. Either hold the lower gear longer, or accept that you will need to come straight back down.`);
    }
  }

  if (rec.kind === 'downshift') {
    headline = `${rec.from} → ${rec.to} at ${r(rec.kphAtDecision)} km/h`;

    if (after > CAR.mechanicalLimitRpm) {
      level = 'damage';
      // Short, blunt first line: it is the one shown live, above the controls.
      lines.push(`${rec.to} at ${r(rec.kphAtDecision)} km/h forces the engine to ${r(after)} rpm. That engine is scrap.`);
      lines.push(`This is the money shift. The wheels are driving the engine through the clutch, so the limiter cannot save you — it only cuts fuel, and fuel is not the problem. Valve springs cannot keep up, valves meet pistons, and it is over before you finish lifting your foot.`);
      lines.push(`${rec.to} can only be selected below about ${r(maxSpeedForGear(rec.to))} km/h.`);
    } else if (after > CAR.redlineRpm) {
      level = 'bad';
      lines.push(`${rec.to} at this speed means ${r(after)} rpm — over the ${r(CAR.redlineRpm)} limiter. ${rec.to} is good to about ${r(maxSpeedForGear(rec.to))} km/h.`);
      lines.push(`The clutch absorbed some of the shock, but you have just spun the engine past its limit from the wheel end. A little more speed and that is a destroyed engine rather than a frightened one.`);
    } else if (after > CAR.redlineRpm - 900) {
      level = 'off';
      lines.push(`${r(after)} rpm. Legal, but there is almost no margin left — a slightly higher speed and the same shift would be over the limiter.`);
    } else if (after < CAR.lugBand[1]) {
      level = 'off';
      lines.push(`${rec.to} only brings the engine to ${r(after)} rpm. That is too low to be useful: you have changed gear and still cannot accelerate. You probably wanted one gear lower.`);
    } else {
      lines.push(`${rec.to} puts the engine at ${r(after)} rpm — in the band where it pulls, with room above.`);
    }
  }

  // Clutch handling, which applies to every shift.
  const held = rec.pedalHeldMs ?? (rel && rel.heldMs);
  if (held != null) {
    if (held > 2200) {
      level = worst(level, 'off');
      lines.push(`The pedal was down ${(held / 1000).toFixed(1)} s. A gear change takes about half a second to a second. Everything beyond that is the release bearing spinning under load for no reason.`);
    } else if (held > 1300) {
      level = worst(level, 'ok');
      lines.push(`Pedal down ${(held / 1000).toFixed(1)} s — a little long. Aim for the shift to take the pedal with it: down, lever, up.`);
    } else if (held < 250) {
      lines.push(`Pedal down ${Math.round(held)} ms — quick, and that is fine as long as the lever actually had time to go in.`);
    } else {
      lines.push(`Pedal down ${(held / 1000).toFixed(2)} s, which is about right for a gear change.`);
    }
  }

  if (rel) {
    if (rel.mismatch != null && Math.abs(rel.mismatch) > 900) {
      level = worst(level, 'off');
      const dir = rel.mismatch < 0 ? 'below' : 'above';
      lines.push(`At the bite point the engine was ${r(Math.abs(rel.mismatch))} rpm ${dir} what the wheels wanted. That mismatch comes out as a jolt through the car and heat in the clutch. A blip of throttle while the pedal is down closes the gap.`);
    } else if (rel.mismatch != null && Math.abs(rel.mismatch) < CAR.revMatchTolerance) {
      lines.push(`Engine and wheels were within ${r(Math.abs(rel.mismatch))} rpm at the bite point — that is a smooth, matched release.`);
    }
    if (rel.biteMs != null && rel.biteMs > 1400) {
      level = worst(level, 'off');
      lines.push(`You spent ${(rel.biteMs / 1000).toFixed(1)} s coming through the bite point. That is where the clutch is slipping and generating heat. A dry clutch has no oil to carry that heat away, so the bite range wants to be crossed deliberately but not dawdled in.`);
    }
    if (rel.freeMs != null && rel.freeMs > 900 && rel.biteMs != null && rel.biteMs < 900) {
      lines.push(`You came off the floor slowly. That part of the travel does nothing — the clutch is still fully clear. Be brisk through the free travel and save the care for the bite point.`);
    }
  }

  return { level, headline, lines };
}

export function judgeRelease(rel) {
  const lines = [];
  let level = 'good';
  if (rel.mismatch == null) return { level, lines };
  const m = Math.abs(rel.mismatch);
  if (m < 200) lines.push(`${r(m)} rpm apart at the bite point. That is a matched release — the car will not have felt it.`);
  else if (m < 500) { level = 'ok'; lines.push(`${r(m)} rpm apart. Close; a small nudge of throttle would have made it invisible.`); }
  else if (m < 1100) { level = 'off'; lines.push(`${r(m)} rpm apart. You will have felt that as a shove. The engine was ${rel.mismatch < 0 ? 'too slow' : 'too fast'} for the gear.`); }
  else { level = 'bad'; lines.push(`${r(m)} rpm apart. The clutch absorbed all of that, as heat, and the car lurched. The engine was ${rel.mismatch < 0 ? 'far too slow' : 'far too fast'} for the gear at this speed.`); }
  return { level, lines };
}

/** Standing habit notes drawn from the accumulators, shown after a drill. */
export function habitNotes(sim) {
  const out = [];
  if (sim.moneyShifted) out.push({
    level: 'bad',
    text: `A gear was selected that forced the engine to ${r(sim.worstPredictedRpm)} rpm — past ${r(CAR.mechanicalLimitRpm)}, where valves and pistons meet. In a real car that engine is finished, and no amount of good clutch technique afterwards matters. Check the speedometer before the lever, every time.`,
  });
  else if (sim.peakRpm > CAR.redlineRpm || sim.worstPredictedRpm > CAR.redlineRpm) out.push({
    level: 'bad',
    text: `Peak of ${r(Math.max(sim.peakRpm, sim.worstPredictedRpm))} rpm, over the ${r(CAR.redlineRpm)} limiter. On the way up that is just noise; on a downshift it is the first half of a destroyed engine.`,
  });
  if (sim.lugSeconds > 0.8) out.push({
    level: 'bad',
    text: `${sim.lugSeconds.toFixed(1)} s spent lugging — on the throttle below ${CAR.lugBand[1]} rpm. The engine is shaking the whole drivetrain against itself there: that is what loads bearings and cracks mounts over time.`,
  });
  if (sim.overRevSeconds > 0.2) out.push({
    level: 'bad',
    text: `${sim.overRevSeconds.toFixed(1)} s over the ${r(CAR.redlineRpm)} limiter.`,
  });
  if (sim.ridingSeconds > 1.5) out.push({
    level: 'bad',
    text: `${sim.ridingSeconds.toFixed(1)} s riding the clutch — partly engaged while the engine was pulling. On your bike the wet clutch sits in oil that cools it, so a bit of slip is cheap. A dry clutch has nothing but air, so the same habit glazes the friction material and shortens its life.`,
  });
  if (sim.restingSeconds > 2.5) out.push({
    level: 'off',
    text: `${sim.restingSeconds.toFixed(1)} s with your foot resting on the pedal. Even inside the free travel, that holds the release bearing against a spinning cover. Floor on the left of the pedal, not the pedal.`,
  });
  if (sim.slipEnergy > 45000) out.push({
    level: 'off',
    text: `About ${(sim.slipEnergy / 1000).toFixed(0)} kJ went into the clutch as slip heat this run. A launch unavoidably costs 10–20 kJ; much more than that usually means one long, drawn-out release rather than several short ones.`,
  });
  if (!out.length) out.push({ level: 'good', text: 'No bad habits recorded this run: no lugging, no over-rev, no clutch riding.' });
  return out;
}

export function gearAdviceFor(kph) {
  const rows = [];
  for (let g = 1; g <= 6; g++) {
    const rpm = (kph / 3.6) / (kphPer1000(g) / 3.6) * 1000;
    rows.push({ gear: g, rpm });
  }
  return rows;
}
