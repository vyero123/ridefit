# Shift — a manual-transmission timing trainer

A focused trainer for learning **when** to change gear in a manual car, and
**how** to treat a dry clutch. Built for someone who can already ride a
motorcycle with a wet clutch and is moving to a pedal-operated car.

It is not a racing simulator. Nothing here is timed or scored for speed.
The only things measured are the rpm at which a shift was made, where that
left the engine, and what the clutch pedal did.

Live: https://ride-fit.netlify.app

## What it teaches

- **Upshifts** — the principle (shift up when you no longer need the
  acceleration the gear is giving you) plus the ranges: ~2,000–2,500 rpm
  petrol, ~1,800–2,200 diesel, 3,000–3,500 when driving briskly.
- **Downshifts** — change down before the engine lugs (below roughly
  1,200–1,500 rpm under load), and the maximum safe speed for each gear.
  The money shift — selecting a gear so low that the wheels spin the engine
  past its mechanical limit — is treated as the headline risk it is.
- **The clutch**, tailored to a rider: a wet clutch sits in oil and tolerates
  slip; a dry clutch has no cooling and does not. Pedal down only as long as
  the shift takes; never ride it; neutral and foot off at a stop; never hold
  a hill on it; release speed matters more than total duration.
- **Damage mechanisms** as cause and effect: lugging, over-revving, clutch
  slip and heat, release-bearing wear, resting a foot on the pedal.

## The app

- Tachometer with a marked shift window, speedometer, gear indicator and a
  clutch-position gauge with a live hold timer.
- A real H-pattern gate the lever is dragged through — not six buttons. The
  lever will not enter a gear while the clutch is still gripping.
- The clutch is a travel strip: your finger position is the pedal position,
  so you control release speed through the bite point.
- Six progressive drills: upshifts, downshifts, both, rev matching, hill
  start, a short mixed drive. Each teaches, then tests, then reports.
- A reference section: gear/speed/rpm table, the clutch rules, the damage
  mechanisms, and a plain statement of what the model does not cover.

## Model

One invented, clearly-stated car: generic 1.6 petrol hatchback, 6-speed,
ratios 3.73/2.05/1.39/1.03/0.84/0.69, final drive 4.06, 205/55 R16.

Two masses — engine flywheel and vehicle — joined by a clutch that can slip.
rpm comes from road speed through gear ratio, final drive and tyre
circumference. An asymmetric torque curve, closed-throttle engine braking,
clutch slip with heat accumulation, and a stall when the engine is dragged
below idle while engaged. Fixed 1/480 s substeps.

Real shift points vary by vehicle, load and gradient. Everything here is a
range and a principle, not a specification — and the app says so.

**For use away from the road.** Nobody should be looking at a phone while
driving, and this is no substitute for instruction in a real car.

## Structure

No build step, no dependencies, plain ES modules.

    index.html
    css/app.css
    js/car.js         vehicle constants, ratios, torque curve, clutch curve
    js/sim.js         the two-mass drivetrain simulation
    js/instruments.js SVG gauge cluster
    js/gate.js        H-pattern gate
    js/controls.js    clutch travel strip and ramp pedals
    js/audio.js       engine note
    js/coach.js       feedback and habit assessment
    js/drills.js      the six drills
    js/reference.js   reference content
    js/main.js        app shell and loop

The previous occupant of this repo root, a piano practice app, is preserved
on branch `piano-final` and tag `piano-v1`.
