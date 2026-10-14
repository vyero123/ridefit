// sim.js — the drivetrain simulation.
//
// Two masses: the engine (a flywheel) and the car (a lump on wheels),
// joined by a clutch that can slip. That one structure is enough to produce
// everything this app needs to teach: stalling, lugging, engine braking,
// clutch slip and heat, over-revving on a careless downshift.

import {
  CAR, CLUTCH, engineTorque, idleAssist, clutchEngagement,
  rpmAtSpeed, totalRatio,
} from './car.js';

const CLUTCH_BOUNDS = CLUTCH;

const RPM_TO_RADS = (2 * Math.PI) / 60;
const RADS_TO_RPM = 1 / RPM_TO_RADS;
const SUBSTEP = 1 / 480; // fixed physics step, in seconds

export class Sim {
  constructor() { this.reset(); }

  reset(opts = {}) {
    this.speed = opts.speed ?? 0;            // m/s, forward positive
    this.gear = opts.gear ?? 0;              // -1 R, 0 N, 1..6
    this.omega = (opts.rpm ?? CAR.idleRpm) * RPM_TO_RADS;
    this.clutchPedal = 0;                    // 0 foot off .. 1 floor
    this.throttle = 0;                       // 0..1
    this.brake = 0;                          // 0..1
    this.handbrake = opts.handbrake ?? false;
    this.gradePercent = opts.gradePercent ?? 0;
    this.stalled = false;
    this.running = true;
    this.t = 0;

    // Wear and habit accumulators. These are the honest cost of the
    // driver's choices, not a score.
    this.slipEnergy = 0;        // joules dissipated in the clutch, this run
    this.clutchHeat = 0;        // 0..1-ish, decays
    this.lugSeconds = 0;
    this.overRevSeconds = 0;
    this.ridingSeconds = 0;     // clutch partially engaged while moving
    this.restingSeconds = 0;    // foot on the pedal inside the free travel
    this.heldAtStopSeconds = 0;  // pedal down, stationary, in gear

    this.events = [];           // shift / stall / over-rev records
    this.flags = new Set();     // transient, cleared each frame by the UI

    // Clutch pedal timing.
    this.pedalDownSince = null;
    this.lastPedalDownMs = null;
    this.pressCount = 0;
    this.rpmAtPress = null;
    this.kphAtPress = null;
    this.gearAtPress = null;
    this.lastRelease = null;
    this.lastFreeMs = null;
    this._tFloor = null;
    this._tBiteEnter = null;
    this._slipRate = 0;
    this.gearBeforeNeutral = null;
    this._neutralAt = -99;
    this.peakRpm = this.rpm;
    this.moneyShifted = false;
    this.worstPredictedRpm = 0;
  }

  get rpm() { return Math.max(0, this.omega * RADS_TO_RPM); }
  get kph() { return this.speed * 3.6; }
  get engagement() { return clutchEngagement(this.clutchPedal); }
  get inGear() { return this.gear !== 0; }

  /** rpm the wheels are asking the engine for, in the current gear. */
  get drivenRpm() { return rpmAtSpeed(this.speed, this.gear); }

  /** Would selecting this gear right now over-rev the engine? */
  rpmIfGear(gear) { return rpmAtSpeed(this.speed, gear); }

  setClutch(pedal) {
    const prev = this.clutchPedal;
    const now = Math.max(0, Math.min(1, pedal));
    this.clutchPedal = now;

    // The moment the foot starts to move is the moment the driver decided.
    // Quoting the rpm from here, rather than from when the pedal hits the
    // floor, is what makes the feedback match what they were looking at.
    if (prev <= 0.03 && now > 0.03) {
      this.rpmAtPress = this.rpm;
      this.kphAtPress = this.kph;
      this.gearAtPress = this.gear;
    }

    const wasDown = prev > 0.5, isDown = now > 0.5;
    if (!wasDown && isDown) {
      this.pedalDownSince = this.t;
      this.pressCount++;
      if (this.rpmAtPress == null) { this.rpmAtPress = this.rpm; this.kphAtPress = this.kph; }
      this._tFloor = this.t;
      this._tBiteEnter = null;
    } else if (wasDown && !isDown && this.pedalDownSince != null) {
      this.lastPedalDownMs = (this.t - this.pedalDownSince) * 1000;
      this.pedalDownSince = null;
    }

    // Threshold crossings on the way back up. Release *speed* through each
    // part of the travel matters more than the total time down.
    const { biteStart, biteEnd } = CLUTCH_BOUNDS;
    if (prev > biteEnd && now <= biteEnd) {
      this._tBiteEnter = this.t;
      this.lastFreeMs = this._tFloor != null ? (this.t - this._tFloor) * 1000 : null;
    }
    if (prev > biteStart && now <= biteStart) {
      const engineRpm = this.rpm;
      const drivenRpm = rpmAtSpeed(this.speed, this.gear);
      this.lastRelease = {
        kind: 'release',
        t: this.t,
        gear: this.gear,
        engineRpm,
        drivenRpm,
        mismatch: engineRpm - drivenRpm,
        biteMs: this._tBiteEnter != null ? (this.t - this._tBiteEnter) * 1000 : null,
        freeMs: this.lastFreeMs ?? null,
        kph: this.kph,
        heldMs: this.lastPedalDownMs,
      };
      this.events.push(this.lastRelease);
      this.flags.add('released');
    }
    if (prev > 0.03 && now <= 0.03) this.rpmAtPress = null;
  }

  /** Time in ms the clutch pedal has been held past half travel, or null. */
  get pedalHeldMs() {
    return this.pedalDownSince == null ? null : (this.t - this.pedalDownSince) * 1000;
  }

  /**
   * Try to select a gear. Returns a result object describing what happened,
   * because the refusals are themselves part of the lesson.
   */
  selectGear(gear) {
    if (gear === this.gear) return { ok: true, same: true };

    const eng = clutchEngagement(this.clutchPedal);

    if (gear === 0) { // into neutral: always possible
      const from = this.gear;
      if (from !== 0) { this.gearBeforeNeutral = from; this._neutralAt = this.t; }
      this.gear = 0;
      return { ok: true, from, to: 0, neutral: true };
    }

    if (eng > 0.12) {
      this.flags.add('grind');
      return {
        ok: false, reason: 'clutch-not-clear', engagement: eng,
        message: 'Crunch. The clutch was still gripping, so the gear could not go in. The pedal has to be clear of the bite point before the lever moves.',
      };
    }

    if (gear === -1 && this.kph > 3) {
      this.flags.add('grind');
      return { ok: false, reason: 'reverse-while-moving', message: 'Reverse, while still rolling forwards. Stop completely first.' };
    }

    const wouldBe = rpmAtSpeed(this.speed, gear);
    // Passing through neutral is part of every shift, so a gear selected
    // shortly after dropping out of another one still counts as a change
    // from that gear — otherwise every shift would read as "from neutral".
    let from = this.gear;
    if (from === 0 && this.gearBeforeNeutral && this.t - this._neutralAt < 4) {
      from = this.gearBeforeNeutral;
    }
    const fromRpm = this.rpm;
    this.gear = gear;
    this.gearBeforeNeutral = null;

    const rec = {
      kind: from > 0 && gear > from ? 'upshift' : (from > 0 && gear < from && gear > 0 ? 'downshift' : 'select'),
      t: this.t,
      from, to: gear,
      rpmBefore: fromRpm,
      // The rpm the driver was looking at when they reached for the pedal.
      rpmAtDecision: this.rpmAtPress ?? fromRpm,
      kphAtDecision: this.kphAtPress ?? this.kph,
      rpmAfterPredicted: wouldBe,
      kph: this.kph,
      pedalHeldMs: this.pedalHeldMs,
      engineRpmAtShift: this.rpm,
      mismatch: this.rpm - wouldBe,
      willOverRev: wouldBe > CAR.redlineRpm,
      willLug: wouldBe < CAR.lugBand[0],
      overRevRpm: wouldBe,
    };
    // Flag the money shift on the decision, not on the measured peak: the
    // clutch bleeds off some of the spike, but the mistake was committed the
    // moment the lever went in.
    if (wouldBe > this.worstPredictedRpm) this.worstPredictedRpm = wouldBe;
    if (wouldBe > CAR.mechanicalLimitRpm) { this.flags.add('money-shift'); this.moneyShifted = true; }
    else if (wouldBe > CAR.redlineRpm) this.flags.add('over-rev');
    this.events.push(rec);
    return { ok: true, record: rec };
  }

  /** Restart after a stall. */
  startEngine() {
    if (!this.stalled) return false;
    if (clutchEngagement(this.clutchPedal) > 0.2 && this.inGear && Math.abs(this.speed) < 0.3) {
      this.flags.add('start-refused');
      return false; // in gear, clutch up: the car would jump
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

  _substep(h) {
    const eng = clutchEngagement(this.clutchPedal);
    const tr = totalRatio(this.gear);
    const r = CAR.wheelRadius;

    // --- Resistive forces on the car (N, opposing motion) ---
    const v = this.speed;
    const grade = CAR.mass * 9.81 * Math.sin(Math.atan(this.gradePercent / 100));
    let resist = CAR.dragCoeff * v * Math.abs(v) + grade;
    const rollSign = Math.abs(v) < 0.05 ? 0 : Math.sign(v);
    resist += CAR.rollingResist * rollSign;

    const brakeForce = this.brake * 9000 + (this.handbrake ? 3400 : 0);

    let clutchTorque = 0; // Nm at the crank, positive = engine drives wheels

    if (this.stalled) {
      this.omega = 0;
    } else {
      const Te = engineTorque(this.rpm, this.throttle) + idleAssist(this.rpm, this.throttle);

      if (tr === 0 || eng < 0.004) {
        // Engine free of the car.
        this.omega += (Te / CAR.engineInertia) * h;
      } else {
        const wheelOmega = v / r;
        const drivenOmega = wheelOmega * tr * (this.gear === -1 ? -1 : 1);
        const slip = this.omega - drivenOmega;
        const capacity = eng * CAR.clutchCapacity;
        const lockedish = eng > 0.985 && Math.abs(slip) < 3;

        if (lockedish) {
          // Solid connection: one combined inertia, so no numerical buzz.
          const sign = this.gear === -1 ? -1 : 1;
          const resistTorque = (resist + brakeForce * rollSign) * r / (tr * CAR.driveEfficiency) * sign;
          const Ieff = CAR.engineInertia + (CAR.mass * r * r) / (tr * tr * CAR.driveEfficiency);
          const net = Te - resistTorque;
          this.omega += (net / Ieff) * h;
          if (this.omega < 0) this.omega = 0;
          this.speed = (this.omega / tr) * r * sign;
          // Brakes and resistance can stop the car and thus the engine.
          if (this.rpm < CAR.stallRpm) this._stall();
          this._slipRate = 0;
          this._clutchTorqueNow = Te;
          return;
        }

        clutchTorque = capacity * Math.tanh(slip / 18);
        this.omega += ((Te - clutchTorque) / CAR.engineInertia) * h;
        if (this.omega < 0) this.omega = 0;
        this._slipRate = Math.abs(slip) * Math.abs(clutchTorque); // watts
      }
    }

    // --- Car ---
    const sign = this.gear === -1 ? -1 : 1;
    let driveForce = (clutchTorque * tr * CAR.driveEfficiency / r) * sign;
    if (tr === 0) driveForce = 0;

    let net = driveForce - resist;
    // Brakes act against motion, and can hold the car still.
    if (Math.abs(v) < 0.08 && brakeForce > Math.abs(net)) {
      this.speed = 0;
    } else {
      net -= brakeForce * (Math.abs(v) < 0.05 ? Math.sign(net) : rollSign);
      this.speed += (net / CAR.mass) * h;
    }

    if (!this.stalled && tr !== 0 && eng > 0.5 && this.rpm < CAR.stallRpm) this._stall();
    this._clutchTorqueNow = clutchTorque;
  }

  _stall() {
    if (this.stalled) return;
    this.stalled = true;
    this.omega = 0;
    this.flags.add('stall');
    this.events.push({ kind: 'stall', t: this.t, kph: this.kph, gear: this.gear });
  }

  _accumulate(dt) {
    const eng = clutchEngagement(this.clutchPedal);
    const rpm = this.rpm;
    if (rpm > this.peakRpm) this.peakRpm = rpm;

    // Clutch heat from slip.
    const watts = this._slipRate || 0;
    this.slipEnergy += watts * dt;
    this.clutchHeat += (watts / 26000) * dt;
    this.clutchHeat = Math.max(0, this.clutchHeat - 0.09 * dt);
    if (this.clutchHeat > 0.6) this.flags.add('clutch-hot');

    // Riding the clutch: partially engaged while the engine is pulling.
    if (eng > 0.05 && eng < 0.95 && this.inGear && !this.stalled && watts > 600) {
      this.ridingSeconds += dt;
      if (this.ridingSeconds > 1.4) this.flags.add('riding');
    }

    // Resting a foot on the pedal: inside the free travel, no slip yet,
    // but the release bearing is loaded and spinning the whole time.
    if (this.clutchPedal > 0.04 && eng > 0.97) {
      this.restingSeconds += dt;
      if (this.restingSeconds > 2) this.flags.add('resting');
    } else if (this.clutchPedal <= 0.04) {
      this.restingSeconds = Math.max(0, this.restingSeconds - dt * 0.5);
    }

    // Pedal pinned at a standstill, in gear.
    if (this.clutchPedal > 0.6 && Math.abs(this.speed) < 0.4 && this.inGear) {
      this.heldAtStopSeconds += dt;
      if (this.heldAtStopSeconds > 6) this.flags.add('held-at-stop');
    } else {
      this.heldAtStopSeconds = 0;
    }

    // Lugging: engaged, low revs, driver asking for more.
    if (!this.stalled && this.inGear && eng > 0.9 && rpm < CAR.lugBand[1] && this.throttle > 0.35) {
      this.lugSeconds += dt;
      this.flags.add('lugging');
    }

    if (rpm > CAR.redlineRpm) {
      this.overRevSeconds += dt;
      this.flags.add('over-rev');
      if (rpm > CAR.mechanicalLimitRpm) this.flags.add('money-shift');
    }
  }
}
