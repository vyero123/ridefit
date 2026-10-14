// car.js — the modelled vehicle.
//
// One generic car, stated plainly in the UI. Every number here is a
// reasonable value for a mid-size petrol hatchback; none of it is tuned to
// any real vehicle, and the app says so where it matters.

export const CAR = {
  name: 'Generic 1.6 petrol hatchback',
  blurb: '6-speed manual, front-wheel drive, 205/55 R16 tyres, ~1,300 kg.',

  // Gearbox. Index 0 is unused; gear 1..6. Reverse is handled separately.
  ratios: [null, 3.73, 2.05, 1.39, 1.03, 0.84, 0.69],
  reverseRatio: 3.59,
  finalDrive: 4.06,
  driveEfficiency: 0.92,

  // Wheel. 205/55 R16 -> diameter 0.632 m.
  wheelRadius: 0.3160,

  mass: 1300,          // kg
  dragCoeff: 0.39,     // N per (m/s)^2  -> 0.5 * rho * Cd * A
  rollingResist: 166,  // N, roughly 0.013 * m * g

  engineInertia: 0.18, // kg m^2 at the crank, flywheel included
  clutchCapacity: 330, // Nm the clutch can transmit fully clamped

  idleRpm: 800,
  stallRpm: 420,
  redlineRpm: 6500,    // where the limiter cuts fuel
  mechanicalLimitRpm: 7200, // past this, parts start leaving the engine
  maxRpm: 7600,        // gauge top

  peakTorque: 152,     // Nm
  peakTorqueRpm: 3400,

  // Teaching bands, as ranges rather than single values.
  upshiftNormal: [2000, 2500],
  upshiftBrisk: [3000, 3500],
  lugBand: [1200, 1500],   // below this, under load, the engine is lugging
  revMatchTolerance: 300,  // rpm mismatch we call "well matched"
};

export const GEAR_NAMES = { '-1': 'R', 0: 'N', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' };

/** Total reduction from crank to wheel for a gear. 0 (neutral) has none. */
export function totalRatio(gear) {
  if (gear === 0) return 0;
  if (gear === -1) return CAR.reverseRatio * CAR.finalDrive;
  return CAR.ratios[gear] * CAR.finalDrive;
}

/** Engine rpm the wheels would force, at this road speed in this gear. */
export function rpmAtSpeed(speedMs, gear) {
  const tr = totalRatio(gear);
  if (!tr) return 0;
  const wheelRadPerS = Math.abs(speedMs) / CAR.wheelRadius;
  return (wheelRadPerS * tr * 60) / (2 * Math.PI);
}

/** Road speed (m/s) that this gear and rpm imply. */
export function speedAtRpm(rpm, gear) {
  const tr = totalRatio(gear);
  if (!tr) return 0;
  return (rpm * 2 * Math.PI / 60) * CAR.wheelRadius / tr;
}

/** km/h per 1000 rpm — the number worth knowing by feel for each gear. */
export function kphPer1000(gear) {
  return speedAtRpm(1000, gear) * 3.6;
}

/**
 * The highest road speed from which you can select this gear without
 * pushing the engine past its limiter. This is the money-shift number.
 */
export function maxSpeedForGear(gear, rpm = CAR.redlineRpm) {
  return speedAtRpm(rpm, gear) * 3.6;
}

/**
 * Engine torque at the crank (Nm). Positive drives, negative brakes.
 * A simple inverted parabola for wide-open throttle, blended down to the
 * pumping and friction losses at a closed throttle. Honest in shape:
 * torque peaks in the mid range, falls off both ends, and a closed
 * throttle always brakes.
 */
export function engineTorque(rpm, throttle) {
  const drag = -(11 + rpm * 0.0085);           // closed-throttle braking
  if (rpm < 1) return throttle > 0.05 ? 40 : drag;

  // Asymmetric: the curve climbs steeply off idle, peaks in the middle, and
  // tails off more gently at the top. A symmetric parabola gets the low end
  // badly wrong and makes the car impossible to pull away in.
  const d = rpm - CAR.peakTorqueRpm;
  const fall = d < 0 ? (d / 2400) ** 2 * 0.375 : (d / 3100) ** 2 * 0.31;
  let wot = CAR.peakTorque * (1 - fall);
  if (rpm < 900) wot *= 0.62 + 0.38 * (rpm / 900); // cranking territory
  wot = Math.max(wot, 45);

  if (rpm > CAR.redlineRpm) {
    // Limiter: fuel cut. Throttle stops meaning anything.
    const over = Math.min(1, (rpm - CAR.redlineRpm) / 180);
    wot = wot * (1 - over) + drag * over;
  }

  // Pedal map. A real throttle is not linear in torque: half pedal at low
  // rpm gives far more than half the torque, which is why a car will pull
  // away up a hill on a modest amount of right foot.
  const th = Math.pow(Math.max(0, Math.min(1, throttle)), 0.6);
  return drag + th * (wot - drag);
}

/** Idle control: a little extra torque to hold idle when the driver is off the gas. */
export function idleAssist(rpm, throttle) {
  if (throttle > 0.08 || rpm > CAR.idleRpm + 260) return 0;
  const deficit = (CAR.idleRpm + 45 - rpm) / 130;
  return Math.max(0, Math.min(1, deficit)) * 58;
}

/**
 * Clutch engagement from pedal travel. pedal: 0 = foot off (fully engaged),
 * 1 = pedal on the floor (fully disengaged).
 *
 * The shape is the thing being taught: a dead zone of free travel at the
 * top, a narrow bite point where all the work happens, and nothing at all
 * near the floor.
 */
export const CLUTCH = {
  freeTravelTop: 0.18,  // pedal 0 .. 0.18 : fully clamped, no change
  biteStart: 0.30,      // engagement starts to fall
  biteEnd: 0.62,        // fully clear by here
};

export function clutchEngagement(pedal) {
  const p = Math.max(0, Math.min(1, pedal));
  if (p <= CLUTCH.biteStart) return 1;
  if (p >= CLUTCH.biteEnd) return 0;
  const t = (p - CLUTCH.biteStart) / (CLUTCH.biteEnd - CLUTCH.biteStart);
  // Smooth, slightly front-loaded: the first part of the bite range does
  // most of the clamping, which is why release speed matters there.
  return 1 - (t * t * (3 - 2 * t));
}

/** Where the bite point sits, as a fraction of pedal travel. For the gauge. */
export const BITE_CENTRE = (CLUTCH.biteStart + CLUTCH.biteEnd) / 2;
