// reference.js — the material behind the drills, in one place.

import { CAR, kphPer1000, maxSpeedForGear, speedAtRpm } from './car.js';

const r = (n) => Math.round(n).toLocaleString('en-GB');

function gearTable() {
  const head = `<tr><th>Gear</th><th>km/h per<br>1,000&nbsp;rpm</th><th>Upshift<br>window</th><th>Ceiling</th></tr>`;
  const rows = [];
  for (let g = 1; g <= 6; g++) {
    const lo = speedAtRpm(CAR.upshiftNormal[0], g) * 3.6;
    const hi = speedAtRpm(CAR.upshiftNormal[1], g) * 3.6;
    rows.push(`<tr><td class="g">${g}</td><td>${kphPer1000(g).toFixed(1)}</td><td>${r(lo)}–${r(hi)}</td><td class="lim">${r(maxSpeedForGear(g))}</td></tr>`);
  }
  return `<table class="ref-table">${head}${rows.join('')}</table>
    <p class="table-note">Upshift window and ceiling in km/h. The window is where you would normally change <i>up</i>; the ceiling is the fastest you can select that gear without going past the limiter — the number that matters changing <i>down</i>.</p>`;
}

export const REFERENCE = [
  {
    id: 'coordination',
    title: 'Clutch and throttle: the hand-off',
    body: () => `
      <p>Everything difficult about a manual car is one problem wearing different hats: <b>two controls that have to trade off against each other in the right order, at the right rate.</b> The gear lever is incidental. The hand-off is the skill.</p>
      <p>The clutch pedal has three regions, and only one of them matters:</p>
      <ul>
        <li><b>Free play</b>, the first part of the travel. Nothing happens. Move through it quickly — there is nothing to be careful about.</li>
        <li><b>The friction zone</b>, the middle. The plate goes from touching to gripping. <i>All</i> of clutch control happens in this band, and the bite point is where the car first wants to move.</li>
        <li><b>Disengaged</b>, the rest of the way to the floor. Also nothing — you only need to be past the top of the friction zone to change gear, not flat on the carpet.</li>
      </ul>
      <p>The hand-off itself: as the clutch comes up through the friction zone, the throttle comes on. Not after; <b>during</b>. The engine needs to be making enough torque to take the load as the plate starts carrying it, and if it is not, it dies. Too much and the extra goes into spinning the plate against the flywheel, which is heat.</p>
      <p class="caveat">The order that works, every time: a little gas first → quickly through the free play → slowly through the friction zone, feeding in more gas → then the rest of the pedal once the car is moving.</p>`,
  },
  {
    id: 'faults',
    title: 'Stalling, juddering and slipping',
    body: () => `
      <p>Three ways a take-up goes wrong, and they are not interchangeable.</p>
      <dl class="mech">
        <dt>Stalling</dt>
        <dd>The clutch asked for more torque than the engine could make at those revs, so the engine was dragged to a stop. Causes: too little throttle, or the pedal coming up faster than the engine could follow. <b>Costs nothing.</b> It is embarrassing and completely harmless, and it is the only one of these three you should be relaxed about.</dd>
        <dt>Snatching, and judder</dt>
        <dd>The clutch goes from carrying nothing to carrying everything in one step, and the car jolts. Friction material grips <i>harder</i> the slower it is slipping, so near lock-up the plate tends to grab rather than ease in — and in a real car, at low revs with a worn plate, it can grab and let go repeatedly, which is <b>judder</b>. Causes: low revs, a snatchy release, or both.
        <br><br><i>What this app measures is the size of that first jolt, which it has.</i> Sustained judder — the repeated shunting — does not emerge from this model, so the app does not claim it. Treat a large take-up jolt here as standing in for the thing that would make a real car shake.</dd>
        <dt>Slipping</dt>
        <dd>The engine races while the car crawls, and the difference is burned off as heat in a plate with no oil to cool it. Causes: too much throttle, too slow a release, or holding the car on the clutch. <b>This is the expensive one</b>, and the one that is invisible while it is happening.</dd>
      </dl>
      <p>Note the asymmetry a rider needs to internalise: the mistake that <i>feels</i> worst — stalling — is free, and the one that feels like competent smooth driving is what wears the clutch out.</p>`,
  },
  {
    id: 'car',
    title: 'The car being modelled',
    body: () => `
      <p><b>${CAR.name}.</b> ${CAR.blurb} Ratios ${CAR.ratios.slice(1).join(' / ')}, final drive ${CAR.finalDrive}, idle ${CAR.idleRpm} rpm, limiter ${r(CAR.redlineRpm)} rpm.</p>
      <p class="caveat">This car does not exist. It is a plausible average, built so the numbers hang together. A diesel shifts 300–500 rpm lower across the board; a small turbo petrol pulls from lower down than this; a high-revving sports engine wants another 1,500 rpm everywhere. <b>Treat every figure here as a range and a shape, not a specification.</b> Your own car's handbook is the authority for your own car.</p>`,
  },
  {
    id: 'gears',
    title: 'Gear, speed and rpm',
    body: () => `
      <p>Three things that are really one thing. Fix any two and the third is decided — that is all a gearbox is.</p>
      ${gearTable()}
      <p>Select a gear above its ceiling and you are over the limiter the instant the clutch bites. That is the whole of the money shift.</p>
      <p class="caveat">Rough shape worth carrying in your head: <b>second is a town gear, third is a roundabout gear, fourth and fifth are road gears, sixth is a motorway gear.</b></p>`,
  },
  {
    id: 'up',
    title: 'When to change up',
    body: () => `
      <p>The principle: <b>change up when you no longer need the acceleration the current gear is giving you.</b> The rev counter is a way of noticing that, not the reason for it.</p>
      <ul>
        <li><b>Normal driving, petrol:</b> ${CAR.upshiftNormal[0]}–${CAR.upshiftNormal[1]} rpm.</li>
        <li><b>Normal driving, diesel:</b> 1,800–2,200 rpm. Diesels make their torque low and run out of breath early.</li>
        <li><b>Brisk, when you want the acceleration:</b> ${CAR.upshiftBrisk[0]}–${CAR.upshiftBrisk[1]} rpm.</li>
        <li><b>Overtaking, uphill, fully loaded, towing:</b> hold the gear. Changing up mid-overtake is how overtakes go wrong.</li>
      </ul>
      <p>Two mistakes, equally common. Changing up too late wastes fuel and noise but harms nothing. Changing up <i>too early</i> drops the engine below its working range, and then you either lug it or change straight back down — which is why "short-shifting to save fuel" often saves none.</p>`,
  },
  {
    id: 'down',
    title: 'When to change down — and the money shift',
    body: () => `
      <p>Change down <b>before</b> the engine is labouring, not after. Under load, below roughly ${CAR.lugBand[0]}–${CAR.lugBand[1]} rpm, you are lugging: the engine is being asked for torque it cannot make, and the whole drivetrain shudders.</p>
      <p>Then the expensive part. <b>On a downshift the rev limiter cannot protect you.</b> Going up, the engine is driving the wheels, and the limiter simply cuts fuel. Going down, the <b>wheels drive the engine</b> through the clutch — and cutting fuel does nothing to a crankshaft being spun by a two-tonne flywheel called "the road".</p>
      <div class="warn-box">
        <b>The money shift.</b> Select a gear too low for your speed and the engine is dragged past its mechanical limit in a fraction of a second. Valve springs cannot keep up, valves meet pistons, and the engine is scrap before you have finished lifting your foot. Sixth to second at motorway speed, or a mis-slotted 3rd instead of 5th, has ended more engines than any other single driver error.
      </div>
      <p>The defence is arithmetic you do in advance, not reactions. Know the ceiling of each gear (the table above), and glance at the speedometer before you commit the lever. If you are unsure, go down one gear, not two.</p>
      <p>Also worth knowing: you do not have to use every gear. Fifth straight to third slowing for a junction is normal and perfectly kind to the car.</p>`,
  },
  {
    id: 'clutch',
    title: 'Your bike clutch and a car clutch are not the same part',
    body: () => `
      <p>This is the single most useful thing on this page if you have come from a motorcycle.</p>
      <p>A bike's <b>wet clutch</b> is a stack of small plates sitting <i>in engine oil</i>. The oil carries heat away and the plates are designed to be slipped — that is how you feather away from lights, hold a slow turn, or modulate drive with two fingers. Deliberate slipping is part of the technique, and the clutch is built for it.</p>
      <p>A car's <b>dry single-plate clutch</b> is one large friction disc clamped between the flywheel and the pressure plate, <i>in air</i>. There is nothing to cool it. All slip becomes heat in the friction material, and when it gets hot enough the surface glazes — goes hard and shiny — and then it slips when you do <i>not</i> want it to. That damage is cumulative and invisible until the clutch starts failing.</p>
      <p><b>The habit to carry over:</b> smooth, progressive engagement through the bite point. <b>The habit to drop:</b> slipping the clutch as a way of controlling speed.</p>`,
  },
  {
    id: 'rules',
    title: 'The clutch, in five rules',
    body: () => `
      <ol class="rules">
        <li><b>The pedal is down only as long as the shift takes.</b> Roughly half a second to a second. Down, lever, up. It is not a footrest and not a thinking position.</li>
        <li><b>Never ride the clutch.</b> Holding it partially engaged — any slip you did not need — is the main killer of dry clutches. If your foot is on the pedal and the car is moving under power, something is wrong.</li>
        <li><b>At a stop, neutral and foot off.</b> Holding the pedal flat at a red light spins the release bearing under full spring load for the whole wait. The bearing is cheap; the gearbox-out labour to replace it is not.</li>
        <li><b>Never hold the car on a hill with the clutch.</b> That is what the brake and the handbrake are for. This is the one that catches riders, because on a bike it is a legitimate technique.</li>
        <li><b>Release speed matters more than total time.</b> Brisk through the free travel at the top, where the clutch is still fully clear and nothing is happening — then smooth and deliberate through the bite point, where all the work is.</li>
      </ol>`,
  },
  {
    id: 'damage',
    title: 'What actually breaks, and why',
    body: () => `
      <p>Five mechanisms. None of them are arbitrary rules; each is a straight line from a habit to a part.</p>
      <dl class="mech">
        <dt>Lugging</dt>
        <dd>High throttle, low rpm, clutch locked. Each combustion event arrives as a hammer blow rather than a push, because the flywheel is turning too slowly to smooth it out. The load goes into big-end bearings, the crank, and the engine mounts. You can hear it as a deep knocking shudder. In a turbo engine it also means high cylinder pressure at low speed, which is how head gaskets and pistons fail.</dd>
        <dt>Over-revving</dt>
        <dd>Past the limiter the valve springs can no longer close the valves fast enough to stay ahead of the pistons. On the throttle the limiter prevents this. Dragged up by the wheels on a bad downshift, nothing does. Contact between valve and piston is instant and terminal.</dd>
        <dt>Clutch slip and heat</dt>
        <dd>A slipping clutch is a brake converting engine power into heat in a dry, enclosed space. Friction material glazes, the springs in the clamp lose temper, and the flywheel face can heat-check. Symptom: revs rise without the car accelerating, worst in high gears under load.</dd>
        <dt>Release-bearing wear</dt>
        <dd>The release bearing pushes on the spinning pressure-plate diaphragm whenever the pedal is down. Held down, it runs loaded and turning. It only has so many hours in it, and replacing it means removing the gearbox. Symptom: a rumble or squeal that appears when you press the pedal.</dd>
        <dt>Resting a foot on the pedal</dt>
        <dd>Even a few millimetres of travel takes up the free play and loads the bearing. Enough pressure to reach the bite range and you are also slipping the clutch at motorway speed without knowing it. Keep the foot on the floor or the dead pedal.</dd>
      </dl>`,
  },
  {
    id: 'honesty',
    title: 'What this app is and is not',
    body: () => `
      <p>It is a coordination trainer. The model is three bodies: an engine, a gearbox input shaft, and the car. A clutch joins the first two by friction whose grip rises as the slip falls; a torsion spring joins the second two. Everything you see comes out of that — a stall is the engine dragged below idle, slip heat is the clutch torque times the speed difference. None of those outcomes are scripted.</p>
      <p>It is <b>not</b> a racing simulator and keeps no lap times. There is no reward for going faster — only for handing off between the pedals cleanly and treating the clutch properly.</p>
      <p>Things it does not model: tyre grip, weight transfer, synchromesh wear, a real clutch's temperature dependence, turbo lag, or any gradient other than the hill drill's.</p>
      <div class="warn-box">
        And the honest limit: <b>pedal feel is most of real clutch control, and a touchscreen has none of it.</b> In a car you find the bite through the sole of your foot — resistance, a dip of the nose, the revs sagging. Here you find it by watching a bar. This app can teach you the sequence, the order of operations, what each failure means and why the dry clutch changes your habits. Your left foot still has to learn the rest in the actual car.
      </div>
      <div class="warn-box">
        Use this at home, on the sofa, away from a vehicle. Nobody should be looking at a phone while driving, and no amount of practice here substitutes for proper instruction in a car with someone qualified beside you.
      </div>`,
  },
];
