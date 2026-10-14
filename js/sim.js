// sim.js — the drivetrain simulation.
//
// Two masses: the engine (a flywheel) and the car (a lump on wheels), joined
// by a clutch that can slip and whose grip rises as the slip falls. That last
// detail is what the whole app rests on, because it is what makes a clutch
// judder, stall and glaze rather than behaving like a smooth dial.

import {
  CAR, CLUTCH, engineTorque, idleAssist, clutchEngagement, clutchTorque,
  rpmAtSpeed, totalRatio,
} from './car.js';

const RPM_TO_RADS = (2 * Math.PI) / 60;
const RADS_TO_RPM = 1 / RPM_TO_RADS;
const SUBSTEP = 1 / 2000; // small enough to resolve the driveline mode cleanly

// A take-up jolt, in m/s^2 above the trend, beyond which the engagement was
// a snatch rather than a squeeze. Calibrated against the model: easing away
// on idle alone peaks near 2, an ordinary launch around 5, a dropped clutch
// well above that.
export const SNATCH_LEVEL = 5.0;
export const JUDDER_AMPLITUDE = 0.6;  // m/s^2 a reversal must carry to count

export class Sim {
  constructor() { this.reset(); }

  reset(opts = {}) {
    this.speed = opts.speed ?? 0;
    this.gear = opts.gear ?? 0;
    this.omega = (opts.rpm ?? CAR.idleRpm) * RPM_TO_RADS;
    this.omegaShaft = totalRatio(this.gear) ? (this.speed / CAR.wheelRadius) * totalRatio(this.gear) : 0;
    this.twist = 0;
    this._driveTorque = 0;
    this.engSmooth = 1;   // pedal up, clutch clamped
    this.throttleEff = 0;
    this.clutchPedal = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = opts.handbrake ?? false;
    this.gradePercent = opts.gradePercent ?? 0;
    this.stalled = false;
    this.t = 0;

    // Wear and habit accumulators: the honest cost of the driver's choices.
    this.slipEnergy = 0;
    this.clutchHeat = 0;
    this.lugSeconds = 0;
    this.overRevSeconds = 0;
    this.slipSeconds = 0;       // clutch transmitting while genuinely slipping
    this.ridingSeconds = 0;     // slipping when it did not need to be
    this.restingSeconds = 0;
    this.heldAtStopSeconds = 0;
    this._shudderCount = 0;
    this._shudderTime = 0;
    this._lurch = 0;
    this._lurchMark = 0;
    this._lastSign = 0;
    this._aTrend = 0;
    this._subPrevSpeed = this.speed;

    this.events = [];
    this.flags = new Set();

    this.pedalDownSince = null;
    this.lastPedalDownMs = null;
    this.pressCount = 0;
    this.rpmAtPress = null;
    this.kphAtPress = null;
    this.lastRelease = null;
    this.lastFreeMs = null;
    this.lastLaunch = null;
    this._pressMax = 0;
    this._tAtMax = null;
    this._tBiteEnter = null;
    this._match = null;
    this._slipRate = 0;
    this._accel = 0;
    this._prevSpeed = this.speed;
    this.gearBeforeNeutral = null;
    this._neutralAt = -99;
    this.peakRpm = this.rpm;
    this.moneyShifted = false;
    this.worstPredictedRpm = 0;
    this._launch = null;
  }

  get rpm() { return Math.max(0, this.omega * RADS_TO_RPM); }
  get kph() { return this.speed * 3.6; }
  /** How hard the clutch is actually clamped, after the hydraulic lag. */
  get engagement() { return this.engSmooth; }
  get pedalEngagement() { return clutchEngagement(this.clutchPedal); }
  get inGear() { return this.gear !== 0; }
  get drivenRpm() { return rpmAtSpeed(this.speed, this.gear); }
  get slipRpm() { return this.inGear ? this.rpm - this.drivenRpm : 0; }

  /** True while the clutch is passing torque but the two sides disagree. */
  get isSlipping() {
    return this.inGear && !this.stalled
      && this.engagement > 0.02 && Math.abs(this.slipRpm) > 40;
  }

  rpmIfGear(gear) { return rpmAtSpeed(this.speed, gear); }

  setClutch(pedal) {
    const prev = this.clutchPedal;
    const now = Math.max(0, Math.min(1, pedal));
    this.clutchPedal = now;

    if (prev <= 0.03 && now > 0.03) {
      this.rpmAtPress = this.rpm;
      this.kphAtPress = this.kph;
    }

    const wasDown = prev > 0.5, isDown = now > 0.5;
    if (!wasDown && isDown) {
      this.pedalDownSince = this.t;
      this.pressCount++;
      if (this.rpmAtPress == null) { this.rpmAtPress = this.rpm; this.kphAtPress = this.kph; }
      this._pressMax = now;
      this._tAtMax = this.t;
      this._tBiteEnter = null;
      this._match = null;
    } else if (wasDown && !isDown && this.pedalDownSince != null) {
      this.lastPedalDownMs = (this.t - this.pedalDownSince) * 1000;
      this.pedalDownSince = null;
    }

    if (now >= (this._pressMax ?? 0) - 0.015) {
      this._pressMax = Math.max(this._pressMax ?? 0, now);
      this._tAtMax = this.t;
    }

    const { biteStart, biteEnd } = CLUTCH;
    if (prev > biteEnd && now <= biteEnd) {
      this._tBiteEnter = this.t;
      this.lastFreeMs = this._tAtMax != null ? (this.t - this._tAtMax) * 1000 : null;
      // Read the mismatch here, at the top of the bite range, while engine
      // and wheels still disagree. By the bottom the clutch has pulled them
      // together and the difference has already become heat.
      this._match = { engineRpm: this.rpm, drivenRpm: rpmAtSpeed(this.speed, this.gear) };
    }
    if (prev > biteStart && now <= biteStart) {
      const m = this._match || { engineRpm: this.rpm, drivenRpm: rpmAtSpeed(this.speed, this.gear) };
      this.lastRelease = {
        kind: 'release', t: this.t, gear: this.gear,
        engineRpm: m.engineRpm, drivenRpm: m.drivenRpm,
        mismatch: m.engineRpm - m.drivenRpm,
        biteMs: this._tBiteEnter != null ? (this.t - this._tBiteEnter) * 1000 : null,
        freeMs: this.lastFreeMs ?? null,
        kph: this.kph, heldMs: this.lastPedalDownMs,
      };
      this.events.push(this.lastRelease);
      this.flags.add('released');
    }
    if (prev > 0.03 && now <= 0.03) this.rpmAtPress = null;
  }

  get pedalHeldMs() {
    return this.pedalDownSince == null ? null : (this.t - this.pedalDownSince) * 1000;
  }

  selectGear(gear) {
    if (gear === this.gear) return { ok: true, same: true };
    const eng = this.engSmooth;

    if (gear === 0) {
      const from = this.gear;
      if (from !== 0) { this.gearBeforeNeutral = from; this._neutralAt = this.t; }
      this.gear = 0;
      return { ok: true, from, to: 0, neutral: true };
    }

    if (eng > 0.12) {
      this.flags.add('grind');
      return {
        ok: false, reason: 'clutch-not-clear', engagement: eng,
        message: 'That is the gears grinding — the clutch was still gripping, so the teeth could not line up. The pedal has to be clear of the bite point before the lever moves.',
      };
    }

    if (gear === -1 && this.kph > 3) {
      this.flags.add('grind');
      return { ok: false, reason: 'reverse-while-moving', message: 'Reverse, while still rolling forwards. Stop completely first.' };
    }

    const wouldBe = rpmAtSpeed(this.speed, gear);
    let from = this.gear;
    if (from === 0 && this.gearBeforeNeutral && this.t - this._neutralAt < 4) from = this.gearBeforeNeutral;
    const fromRpm = this.rpm;
    this.gear = gear;
    this.gearBeforeNeutral = null;
    // The synchros bring the input shaft to the wheels' speed as the gear
    // goes in, and the driveline starts the new gear unwound.
    this.omegaShaft = (this.speed / CAR.wheelRadius) * totalRatio(gear) * (gear === -1 ? -1 : 1);
    this.twist = 0;

    const rec = {
      kind: from > 0 && gear > from ? 'upshift' : (from > 0 && gear < from && gear > 0 ? 'downshift' : 'select'),
      t: this.t, from, to: gear,
      rpmBefore: fromRpm,
      rpmAtDecision: this.rpmAtPress ?? fromRpm,
      kphAtDecision: this.kphAtPress ?? this.kph,
      rpmAfterPredicted: wouldBe,
      kph: this.kph,
      pedalHeldMs: this.pedalHeldMs,
      willOverRev: wouldBe > CAR.redlineRpm,
    };
    if (wouldBe > this.worstPredictedRpm) this.worstPredictedRpm = wouldBe;
    if (wouldBe > CAR.mechanicalLimitRpm) { this.flags.add('money-shift'); this.moneyShifted = true; }
    else if (wouldBe > CAR.redlineRpm) this.flags.add('over-rev');
    this.events.push(rec);
    return { ok: true, record: rec };
  }

  startEngine() {
    if (!this.stalled) return false;
    if (clutchEngagement(this.clutchPedal) > 0.2 && this.inGear && Math.abs(this.speed) < 0.3) {
      this.flags.add('start-refused');
      return false;
    }
    this.stalled = false;
    this.omega = CAR.idleRpm * RPM_TO_RADS;
    return true;
  }

  step(dt) {
    dt = Math.min(dt, 0.05);
    let remaining = dt;
    while (remaining > 1e-6) {
      const h = Math.min(SUBSTEP, remaining);
      this._substep(h);
      remaining -= h;
    }
    this._accumulate(dt);
    this.t += dt;
  }

  /**
   * Three bodies: the engine, the gearbox input shaft, and the car. The
   * clutch couples the first two by friction; a torsion spring couples the
   * second two. Judder is the spring ringing, driven by a clutch whose grip
   * rises as it stops slipping.
   */
  _substep(h) {
    // The clamp follows the pedal through a hydraulic line and a diaphragm
    // spring, so it lags the foot slightly. That lag is real, and it matters
    // here for a second reason: holding this pedal part-way means pressing in
    // rhythm, and without the lag that rhythm would itself read as judder.
    const target = clutchEngagement(this.clutchPedal);
    this.engSmooth += (target - this.engSmooth) * (1 - Math.exp(-h / 0.075));
    const eng = this.engSmooth;

    // Torque does not appear the instant the pedal moves: the manifold has to
    // fill and the next cylinder has to fire. Same reasoning as the clutch
    // lag — without it, the rhythm of holding a pedal would read as judder.
    this.throttleEff += (this.throttle - this.throttleEff) * (1 - Math.exp(-h / 0.09));
    const tr = totalRatio(this.gear);
    const r = CAR.wheelRadius;
    const v = this.speed;
    const sign = this.gear === -1 ? -1 : 1;

    const grade = CAR.mass * 9.81 * Math.sin(Math.atan(this.gradePercent / 100));
    const rollSign = Math.abs(v) < 0.05 ? 0 : Math.sign(v);
    const resist = CAR.dragCoeff * v * Math.abs(v) + grade + CAR.rollingResist * rollSign;
    const brakeForce = this.brake * 9000 + (this.handbrake ? 3400 : 0);

    if (!this.stalled) {
      const Te = engineTorque(this.rpm, this.throttleEff) + idleAssist(this.rpm, this.throttleEff);
      if (tr === 0) {
        this.omega += (Te / CAR.engineInertia) * h;
        this.omegaShaft = 0; this.twist = 0; this._slipRate = 0;
      } else {
        const wheelRef = (v / r) * tr * sign;
        const slip = this.omega - this.omegaShaft;
        const Tc = eng < 0.002 ? 0 : clutchTorque(eng, slip);
        const Td = CAR.shaftStiffness * this.twist
                 + CAR.shaftDamping * (this.omegaShaft - wheelRef);

        this.omega += ((Te - Tc) / CAR.engineInertia) * h;
        this.omegaShaft += ((Tc - Td) / CAR.shaftInertia) * h;
        this.twist += (this.omegaShaft - wheelRef) * h;
        this.twist = Math.max(-0.7, Math.min(0.7, this.twist));
        if (this.omega < 0) this.omega = 0;

        this._driveTorque = Td;
        this._slipRate = Math.abs(slip) * Math.abs(Tc);
      }
    } else {
      this.omega = 0;
      // A stalled engine still holds the driveline, so the car is dragged down.
      const wheelRef = tr === 0 ? 0 : (v / r) * tr * sign;
      if (tr !== 0 && eng > 0.3) {
        this.omegaShaft += ((0 - this.omegaShaft) * 60) * h;
        this.twist += (this.omegaShaft - wheelRef) * h;
        this._driveTorque = CAR.shaftStiffness * this.twist
          + CAR.shaftDamping * (this.omegaShaft - wheelRef);
      } else { this._driveTorque = 0; this.twist = 0; }
      this._slipRate = 0;
    }

    const driveForce = tr === 0 ? 0 : ((this._driveTorque || 0) * tr * CAR.driveEfficiency / r) * sign;
    let net = driveForce - resist;
    if (Math.abs(v) < 0.08 && brakeForce > Math.abs(net)) {
      this.speed = 0;
    } else {
      net -= brakeForce * (Math.abs(v) < 0.05 ? Math.sign(net) : rollSign);
      this.speed += (net / CAR.mass) * h;
    }

    this._measureShudder(h, eng, tr);
    if (!this.stalled && tr !== 0 && eng > 0.06 && this.rpm < CAR.stallRpm) this._stall();
  }

  /**
   * Judder, measured the way a passenger feels it: how much the car's
   * acceleration wobbles about its own trend. A smooth take-up pushes once
   * and settles; a juddering one shakes. Sampled inside the physics loop,
   * so it does not depend on the frame rate.
   */
  _measureShudder(h, eng, tr) {
    const a = (this.speed - this._subPrevSpeed) / h;
    this._subPrevSpeed = this.speed;
    const k = 1 - Math.exp(-h / 0.053);   // ~3 Hz: passes judder, drops trend
    this._aTrend += (a - this._aTrend) * k;
    if (tr === 0 || eng <= 0.02 || this.stalled) return;

    const d = a - this._aTrend;
    this._shudderTime += h;
    if (Math.abs(d) > this._lurch) this._lurch = Math.abs(d);
    if (Math.abs(d) > this._lurchMark) this._lurchMark = Math.abs(d);
    if (this._launch && Math.abs(d) > this._launch.lurch) this._launch.lurch = Math.abs(d);

    // Judder is repetition, not violence. One hard take-up is a lurch — a
    // single shove and done. Judder is the car shuttling back and forth, so
    // what gets counted is how often the acceleration crosses its own trend
    // with real amplitude behind it.
    const sg = Math.abs(d) > JUDDER_AMPLITUDE ? Math.sign(d) : 0;
    if (sg && this._lastSign && sg !== this._lastSign) {
      this._shudderCount++;
      if (this._launch) this._launch.shudderCount++;
    }
    if (sg) this._lastSign = sg;
    if (this._launch) this._launch.shudderTime += h;
  }

  /** Reversals per second of engagement — how hard the car is shuttling. */
  get shudder() {
    return this._shudderTime > 0.15 ? this._shudderCount / this._shudderTime : 0;
  }
  /** Worst single jolt, m/s^2, above the trend. */
  get lurch() { return this._lurch; }

  /** Snapshot, so a drill can ask how rough one particular moment was. */
  markShudder() { this._lurchMark = 0; return { n: this._shudderCount, t: this._shudderTime }; }
  /** Worst jolt since the last markShudder(). */
  lurchSince() { return this._lurchMark; }
  shudderSince(mark) {
    if (!mark) return 0;
    const dt = this._shudderTime - mark.t;
    return dt > 0.15 ? (this._shudderCount - mark.n) / dt : 0;
  }

  _stall() {
    if (this.stalled) return;
    this.stalled = true;
    this.omega = 0;
    this.flags.add('stall');
    this.events.push({ kind: 'stall', t: this.t, kph: this.kph, gear: this.gear });
    if (this._launch) this._launch.stalled = true;
  }

  _accumulate(dt) {
    const eng = this.engSmooth;
    const rpm = this.rpm;
    if (rpm > this.peakRpm) this.peakRpm = rpm;

    if (this._lurch > SNATCH_LEVEL) this.flags.add('snatch');

    const watts = this._slipRate || 0;
    this.slipEnergy += watts * dt;
    this.clutchHeat += (watts / 26000) * dt;
    this.clutchHeat = Math.max(0, this.clutchHeat - 0.085 * dt);
    if (this.clutchHeat > 0.6) this.flags.add('clutch-hot');

    if (this.isSlipping && watts > 400) {
      this.slipSeconds += dt;
      if (this._launch) this._launch.slipSeconds += dt;
      // Slipping while already moving at a speed the gear could carry on its
      // own is riding it — the slip is buying nothing.
      if (Math.abs(this.drivenRpm) > CAR.idleRpm + 350) {
        this.ridingSeconds += dt;
        if (this.ridingSeconds > 1.2) this.flags.add('riding');
      } else if (this.slipSeconds > 3.5) {
        this.flags.add('riding');
      }
    }

    if (this.clutchPedal > 0.04 && eng > 0.97) {
      this.restingSeconds += dt;
      if (this.restingSeconds > 2) this.flags.add('resting');
    } else if (this.clutchPedal <= 0.04) {
      this.restingSeconds = Math.max(0, this.restingSeconds - dt * 0.5);
    }

    if (this.clutchPedal > 0.6 && Math.abs(this.speed) < 0.4 && this.inGear) {
      this.heldAtStopSeconds += dt;
      if (this.heldAtStopSeconds > 6) this.flags.add('held-at-stop');
    } else {
      this.heldAtStopSeconds = 0;
    }

    if (!this.stalled && this.inGear && eng > 0.9 && rpm < CAR.lugBand[1] && this.throttle > 0.35
        && Math.abs(this.slipRpm) < 60) {
      this.lugSeconds += dt;
      this.flags.add('lugging');
    }

    if (rpm > CAR.redlineRpm) {
      this.overRevSeconds += dt;
      this.flags.add('over-rev');
      if (rpm > CAR.mechanicalLimitRpm) this.flags.add('money-shift');
    }

    this._trackLaunch(dt);
  }

  /**
   * A launch is the stretch from the clutch first biting at a standstill to
   * the car being under way with the clutch home. It gets measured as one
   * event, because that is how it is learned.
   */
  _trackLaunch(dt) {
    const eng = this.engSmooth;
    if (!this._launch) {
      if (this.inGear && !this.stalled && eng > 0.03 && Math.abs(this.speed) < 0.6) {
        this._launch = {
          kind: 'launch', t0: this.t, gear: this.gear,
          shudderCount: 0, shudderTime: 0, slipSeconds: 0, stalled: false, lurch: 0,
          minRpm: this.rpm, maxRpm: this.rpm, maxThrottle: this.throttle,
          startEnergy: this.slipEnergy, rollback: 0, done: false,
        };
      }
      return;
    }
    const L = this._launch;
    L.minRpm = Math.min(L.minRpm, this.stalled ? 0 : this.rpm);
    L.maxRpm = Math.max(L.maxRpm, this.rpm);
    L.maxThrottle = Math.max(L.maxThrottle, this.throttle);
    if (this.speed < 0) L.rollback += -this.speed * dt;

    const abandoned = eng < 0.02 && Math.abs(this.speed) < 0.6 && !this.stalled;
    // Away and the clutch is home: that is the launch finished. The speed
    // bar is low because an idle creep is a legitimate way to pull away.
    const movingFree = eng > 0.97 && this.kph > 4;
    if (L.stalled || movingFree || abandoned) {
      L.energy = this.slipEnergy - L.startEnergy;
      L.shudder = L.shudderTime > 0.15 ? L.shudderCount / L.shudderTime : 0;
      L.seconds = this.t - L.t0;
      L.kph = this.kph;
      L.abandoned = abandoned && !L.stalled;
      L.done = true;
      this._launch = null;
      if (!L.abandoned) {
        this.lastLaunch = L;
        this.events.push(L);
        this.flags.add('launch-done');
      }
    }
  }
}
