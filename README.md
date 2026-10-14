# Shift — a clutch and gear coordination trainer

A trainer for the part of driving a manual car that actually takes weeks:
**coordinating the clutch and the throttle.** Finding the friction zone,
handing off between the two pedals, and letting the clutch back out in gear
without the car lurching or stalling. Shift timing is in here too, but as
supporting material — knowing that 2,300 rpm is a sensible moment to change
up takes a minute to learn.

Built for someone who can already ride a motorcycle with a wet clutch and is
moving to a dry, pedal-operated one.

Live: https://ride-fit.netlify.app

## Layout

Landscape, laid out the way the car is: **pedals under the left thumb, gear
lever under the right, instruments between them.** Portrait asks you to
rotate, with an upright fallback for anyone who would rather not.

## Controls

Pedals are **pressed, not dragged**: hold to push one down, let go and it
comes back up, neither instantly. Holding a position part-way — which is the
whole of clutch control — is therefore a matter of pressing and easing off in
rhythm. The clutch moves at about 60% speed inside the friction zone, because
all of the skill lives in a third of the travel and a control that crosses
that band in a tenth of a second cannot be held in it. Travel and effort are
shown live on each pedal.

The gear lever is a real H-pattern gate you drag through, and it will not
enter a gear while the clutch is still gripping.

## Drills

**Clutch control** — finding the bite point, pulling away, crawling in
traffic, stopping and starting again, hill start.
**Shifting** — the hand-off in a gear change, rev matching, downshifting into
a corner.
**When to change** — the rev ranges and the money shift.
**Putting it together** — a short drive.

Each one teaches, then tests, then reports. Launches are judged as single
events: **stalled**, **slipped** or **clean**, with the size of the take-up
jolt reported alongside.

## Model

Three bodies — engine, gearbox input shaft, car. A friction clutch couples the
first two, with grip that rises as the slip falls; a torsion spring couples
the second two. An idle governor with real authority, which is what lets the
car creep away on idle alone and therefore what makes the bite-point drill
possible. Hydraulic lag on the clutch and intake lag on the throttle, both
real, and both needed so that holding a pedal in rhythm does not read as
roughness.

Stalling, clutch heat, engine braking, lugging and over-revving all fall out
of that rather than being scripted. **Sustained judder does not** — the model
produces a single take-up jolt and settles, so the app reports the jolt and
says plainly that it is not reproducing judder proper.

One invented car: generic 1.6 petrol hatchback, 6-speed, ratios
3.73/2.05/1.39/1.03/0.84/0.69, final drive 4.06, 205/55 R16, ~1,300 kg.

Real pedals, bite points and shift points vary enormously. Everything here is
a range and a principle, not your car's numbers — and **pedal feel, which is
most of real clutch control, is the one thing a touchscreen cannot give you.**

**For use away from the road.**

## Structure

No build step, no dependencies, plain ES modules.

    index.html
    css/app.css
    js/car.js         vehicle constants, torque curve, clutch friction
    js/sim.js         the three-body drivetrain simulation
    js/instruments.js SVG cluster, including the engine-vs-wheels slip bar
    js/gate.js        H-pattern gate
    js/controls.js    pressed pedals with progressive travel
    js/audio.js       engine note
    js/coach.js       verdicts and habit assessment
    js/drills.js      the ten drills
    js/reference.js   reference content
    js/main.js        app shell and loop

`?debug` exposes the app object and a manual `advance(dt)` on `window.shift`.

The piano practice app that previously occupied this repo root is preserved
on branch `piano-final` and tag `piano-v1`.
