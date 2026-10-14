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

  engineInertia: 0.25, // kg m^2 at the crank, flywheel and clutch included
  clutchCapacity: 330, // Nm the clutch can transmit fully clamped
  idleAuthority: 88,   // Nm the idle governor can add to hold idle under load

  // Friction material grips harder the slower it is slipping. That one fact
  // is what makes a clutch judder: as the plate approaches lock-up it grabs,
  // drags the engine down, breaks away again, and the car shunts back and
  // forth. It is not scripted here — it falls out of these two numbers.
  muStaticRatio: 1.9,   // peak grip, as a multiple of the fully-sliding grip
  muSlipRef: 40,        // rad/s of slip over which the extra grip decays
  muRise: 10,           // rad/s over which torque builds from zero slip

  // A driveline is not a rigid bar. Clutch damper springs and driveshafts
  // wind up and spring back, and that is the thing judder is an oscillation
  // *of* — the grabbing clutch is only what feeds it. Without this the model
  // cannot judder at all, it can only snap.
  shaftInertia: 0.05,   // kg m^2, gearbox input shaft and clutch disc
  shaftStiffness: 300,  // Nm per radian of wind-up
  shaftDamping: 2.2,    // Nm per rad/s

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
  // Mismatch is read at the top of the bite range, where the engine and the
  // wheels are still independent — by the bottom the clutch has already
  // dragged them together and the difference has gone into heat.
};

export const GEAR_NAMES = { '-1': 'R', 0: 'N', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' };

/**
 * Practice speed. The whole world runs at this fraction of real time —
 * pedals, engine, how fast the revs fall, how fast the car gathers speed.
 *
 * It has to be all of them together. Slowing only the pedals would put the
 * controls out of step with the car, and the thing being learned here is
 * precisely the relationship between the two. Because the scale is uniform,
 * a given sequence of pedal movements produces exactly the same outcome at
 * any speed — you simply have more real seconds in which to make it.
 *
 * Everything the app measures (slip seconds, clutch heat, hold times, the
 * take-up jolt) is computed from simulation time, so the verdicts mean the
 * same thing at every setting.
 */
export const SPEEDS = [
  { id: 'slow', scale: 0.4, label: '0.4×', note: 'Practice — well slower than a real car' },
  { id: 'mid', scale: 0.6, label: '0.6×', note: 'Closing on real time' },
  { id: 'real', scale: 1.0, label: '1×', note: 'Real time — what the car actually does' },
];
export const DEFAULT_SPEED = 'slow';

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
/**
 * The idle governor. Not a nicety: it is the reason a car will creep away in
 * first with no throttle at all, which is how the bite point gets found. A
 * real ECU opens the throttle on its own as soon as the clutch starts to drag
 * the engine down, and it has a lot of authority.
 */
export function idleAssist(rpm, throttle) {
  if (throttle > 0.1 || rpm > CAR.idleRpm + 450) return 0;
  const droop = CAR.idleRpm + 60 - rpm;
  if (droop <= 0) return 0;
  return Math.min(CAR.idleAuthority, droop * 0.95);
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

/**
 * Torque the clutch can transmit, given how hard it is clamped and how fast
 * it is slipping. Positive means the engine is driving the wheels.
 *
 * @param {number} engagement 0 (clear) .. 1 (fully clamped)
 * @param {number} slip  engine minus driven speed, rad/s
 */
export function clutchTorque(engagement, slip) {
  const grip = 1 + (CAR.muStaticRatio - 1) * Math.exp(-Math.abs(slip) / CAR.muSlipRef);
  return engagement * CAR.clutchCapacity * grip * Math.tanh(slip / CAR.muRise);
}
