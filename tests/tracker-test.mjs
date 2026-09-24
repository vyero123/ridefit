// tracker-test.mjs — PlayedNoteTracker and enharmonic spelling.
//
//   node tests/tracker-test.mjs
//
// Pure logic, no audio. These cover the sustain/release hysteresis rules,
// which are the part most likely to be "simplified" later by someone who has
// not watched a note decay under the pedal.

import { PlayedNoteTracker } from '../js/practice/played-note.js';
import { spellForDisplay, midiToStep } from '../js/music/pitch.js';

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  ' + detail : ''}`);
};

/** Drive the tracker with frames at 21 ms intervals, as the worklet does. */
function feed(tracker, { from, to, midi, clarity, step = 0.021 }) {
  for (let t = from; t < to; t += step) {
    tracker.onFrame({ t, midi, cents: 0, clarity, rms: 0.05, voiced: clarity >= 0.55, frequency: 440 });
  }
}

console.log('\nPlayedNoteTracker — attack, sustain, release');
{
  const tr = new PlayedNoteTracker();
  const events = [];
  tr.subscribe(e => events.push({ type: e.type, midi: e.note ? e.note.midi : null }));

  tr.onNote({ t: 1.00, midi: 60, cents: 3, clarity: 0.9 });
  check(tr.current && tr.current.midi === 60, 'onset lights the note immediately');

  // A long decay whose clarity slides from healthy to marginal but never dies.
  feed(tr, { from: 1.02, to: 2.40, midi: 60, clarity: 0.45 });
  check(tr.current && tr.current.midi === 60, 'held through a long decay at clarity 0.45',
    'sustain threshold is 0.34, below the 0.55 needed to start');

  // Now it really stops.
  feed(tr, { from: 2.40, to: 2.70, midi: null, clarity: 0.05 });
  check(tr.current === null, 'released once the pitch is gone');
  check(events.map(e => e.type).join(',') === 'start,end', 'exactly one start and one end',
    `got [${events.map(e => e.type).join(', ')}]`);
}

console.log('\nHysteresis — a clarity wobble must not flicker the display');
{
  const tr = new PlayedNoteTracker();
  const events = [];
  tr.subscribe(e => events.push(e.type));
  tr.onNote({ t: 0, midi: 64, cents: 0, clarity: 0.9 });

  // Two bad frames (42 ms) in the middle of an otherwise healthy note. The
  // release hold is 130 ms, so this must not end the note.
  feed(tr, { from: 0.02, to: 0.30, midi: 64, clarity: 0.6 });
  feed(tr, { from: 0.30, to: 0.35, midi: null, clarity: 0.02 });
  check(tr.current !== null, 'survives a 50 ms dropout');
  feed(tr, { from: 0.35, to: 0.60, midi: 64, clarity: 0.6 });
  check(tr.current !== null && tr.current.midi === 64, 'still the same note after recovery');
  check(events.length === 1 && events[0] === 'start', 'no spurious end/start pair',
    `got [${events.join(', ')}]`);

  // A dropout longer than the hold time does end it.
  feed(tr, { from: 0.60, to: 0.90, midi: null, clarity: 0.02 });
  check(tr.current === null, 'a 300 ms dropout does end the note');
}

console.log('\nRepeated note — the same pitch struck twice stays lit and re-triggers');
{
  const tr = new PlayedNoteTracker();
  const events = [];
  tr.subscribe(e => events.push(e.type));
  tr.onNote({ t: 0, midi: 60, cents: 0, clarity: 0.9 });
  feed(tr, { from: 0.02, to: 0.40, midi: 60, clarity: 0.7 });
  tr.onNote({ t: 0.41, midi: 60, cents: 0, clarity: 0.9 });   // struck again, same pitch
  feed(tr, { from: 0.43, to: 0.80, midi: 60, clarity: 0.7 });
  check(tr.current && tr.current.midi === 60, 'still showing the note');
  check(!events.includes('end'), 'no gratuitous end between two strikes of the same key',
    `got [${events.join(', ')}]`);
}

console.log('\nPitch change must persist briefly before taking over');
{
  const tr = new PlayedNoteTracker();
  tr.onNote({ t: 0, midi: 60, cents: 0, clarity: 0.9 });
  feed(tr, { from: 0.02, to: 0.30, midi: 60, clarity: 0.7 });
  // One confused frame reporting a neighbour.
  tr.onFrame({ t: 0.31, midi: 61, cents: 0, clarity: 0.7, rms: 0.05, voiced: true });
  check(tr.current.midi === 60, 'one stray frame does not yank the display');
  // A sustained new pitch does take over.
  feed(tr, { from: 0.32, to: 0.60, midi: 67, clarity: 0.8 });
  check(tr.current.midi === 67, 'a sustained new pitch takes over');
}

console.log('\nAttack without an onset needs real confidence');
{
  const tr = new PlayedNoteTracker();
  feed(tr, { from: 0, to: 0.30, midi: 60, clarity: 0.50 });
  check(tr.current === null, 'clarity 0.50 alone does not light a note');
  feed(tr, { from: 0.30, to: 0.60, midi: 60, clarity: 0.85 });
  check(tr.current !== null && tr.current.midi === 60, 'clarity 0.85 does');
}

console.log('\nEnharmonic spelling of the played note');
{
  const gb4 = { letter: 'G', alter: -1, octave: 4 };
  const ref = { midi: 66, spelling: gb4 };

  let s = spellForDisplay(66, { reference: ref });
  check(s.letter === 'G' && s.alter === -1 && s.octave === 4,
    'playing the written G♭4 shows G♭4, not F♯4', `${s.letter}${s.alter}${s.octave}`);

  s = spellForDisplay(78, { reference: ref });
  check(s.letter === 'G' && s.alter === -1 && s.octave === 5,
    'an octave up keeps the target spelling', `${s.letter}${s.alter}${s.octave}`);

  s = spellForDisplay(54, { reference: ref });
  check(s.letter === 'G' && s.alter === -1 && s.octave === 3,
    'an octave down keeps the target spelling', `${s.letter}${s.alter}${s.octave}`);

  s = spellForDisplay(61, { reference: ref, preferFlats: true });
  check(s.letter === 'D' && s.alter === -1,
    'an unrelated black key follows the key signature (flats)', `${s.letter}${s.alter}`);

  s = spellForDisplay(61, { reference: ref, preferFlats: false });
  check(s.letter === 'C' && s.alter === 1,
    'an unrelated black key follows the key signature (sharps)', `${s.letter}${s.alter}`);

  s = spellForDisplay(60, {});
  check(s.letter === 'C' && s.alter === 0 && s.octave === 4, 'no reference falls back to plain spelling');
}

console.log('\nStaff position maths — the played note lands where the target would');
{
  // A played C4 and a written C4 must resolve to the same diatonic step, or
  // the two columns would sit at different heights for the same pitch.
  const a = midiToStep(60, false);
  const b = spellForDisplay(60, { reference: { midi: 60, spelling: midiToStep(60, false) } });
  check(a.letter === b.letter && a.octave === b.octave, 'same pitch, same staff position');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
