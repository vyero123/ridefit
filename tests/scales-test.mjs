// scales-test.mjs — scale generation, spelling and key signatures.
//
//   node tests/scales-test.mjs
//
// Spelling is the thing that "looks broken to anyone who reads music", so it
// gets checked against written-out expectations for every key, both modes, and
// all three minor forms.

import {
  generateScale, degreeSpellings, keySignatureFor, parseTonic,
  accidentalForKey, MODES, TONICS
} from '../js/music/scales.js';

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  ' + detail : ''}`);
};

const spellStr = (s) =>
  s.letter + (s.alter > 0 ? '#'.repeat(s.alter) : s.alter < 0 ? 'b'.repeat(-s.alter) : '');

const scaleStr = (tonic, mode) =>
  degreeSpellings(parseTonic(tonic), MODES[mode].asc).map(spellStr).join(' ');

// ---------------------------------------------------------------------------
console.log('\nMajor scale spelling — every key');
{
  const expected = {
    'C':  'C D E F G A B',
    'G':  'G A B C D E F#',
    'D':  'D E F# G A B C#',
    'A':  'A B C# D E F# G#',
    'E':  'E F# G# A B C# D#',
    'B':  'B C# D# E F# G# A#',
    'F#': 'F# G# A# B C# D# E#',      // E#, not F natural
    'F':  'F G A Bb C D E',
    'Bb': 'Bb C D Eb F G A',          // the case from the brief
    'Eb': 'Eb F G Ab Bb C D',
    'Ab': 'Ab Bb C Db Eb F G',
    'Db': 'Db Eb F Gb Ab Bb C',
    'Gb': 'Gb Ab Bb Cb Db Eb F'       // Cb, not B
  };
  for (const [tonic, want] of Object.entries(expected)) {
    const got = scaleStr(tonic, 'major');
    check(got === want, `${tonic} major`, got === want ? '' : `got "${got}", want "${want}"`);
  }
}

console.log('\nMinor scale spelling — all three forms');
{
  const cases = [
    ['A',  'natural-minor',  'A B C D E F G'],
    ['A',  'harmonic-minor', 'A B C D E F G#'],
    ['A',  'melodic-minor',  'A B C D E F# G#'],
    ['C',  'natural-minor',  'C D Eb F G Ab Bb'],
    ['C',  'harmonic-minor', 'C D Eb F G Ab B'],       // B natural, not Cb
    ['C',  'melodic-minor',  'C D Eb F G A B'],
    ['G#', 'harmonic-minor', 'G# A# B C# D# E Fx'],    // F double sharp
    ['Bb', 'natural-minor',  'Bb C Db Eb F Gb Ab'],
    ['Eb', 'natural-minor',  'Eb F Gb Ab Bb Cb Db'],   // Cb again
    ['F#', 'harmonic-minor', 'F# G# A B C# D E#']
  ];
  for (const [tonic, mode, want] of cases) {
    const got = degreeSpellings(parseTonic(tonic), MODES[mode].asc).map(s => {
      // render double sharp as "x" to match the expectation strings
      if (s.alter === 2) return s.letter + 'x';
      return spellStr(s);
    }).join(' ');
    check(got === want, `${tonic} ${mode}`, got === want ? '' : `got "${got}", want "${want}"`);
  }
}

console.log('\nKey signatures');
{
  const major = { 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6,
                  'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6 };
  for (const [t, want] of Object.entries(major)) {
    const got = keySignatureFor(parseTonic(t), 'major');
    check(got === want, `${t} major -> ${want}`, got === want ? '' : `got ${got}`);
  }
  const minor = { 'A': 0, 'E': 1, 'B': 2, 'F#': 3, 'C#': 4, 'G#': 5,
                  'D': -1, 'G': -2, 'C': -3, 'F': -4, 'Bb': -5, 'Eb': -6 };
  for (const [t, want] of Object.entries(minor)) {
    for (const mode of ['natural-minor', 'harmonic-minor', 'melodic-minor']) {
      const got = keySignatureFor(parseTonic(t), mode);
      check(got === want, `${t} ${mode} -> ${want}`, got === want ? '' : `got ${got}`);
    }
  }
}

console.log('\nAccidentals printed against the key signature');
{
  // A minor: no signature, so the harmonic minor's G# must be printed.
  const aHarm = degreeSpellings(parseTonic('A'), MODES['harmonic-minor'].asc);
  check(accidentalForKey(aHarm[6], 0) === 'sharp', 'A harmonic minor prints the G♯');
  check(accidentalForKey(aHarm[5], 0) === null, 'and prints nothing on the F');

  // B♭ major: two flats in the signature, so B♭ and E♭ print nothing.
  const bb = degreeSpellings(parseTonic('Bb'), MODES.major.asc);
  check(accidentalForKey(bb[0], -2) === null, 'B♭ major prints nothing on the B♭');
  check(accidentalForKey(bb[3], -2) === null, 'and nothing on the E♭');

  // C harmonic minor: signature has 3 flats including B♭, so the raised 7th
  // (B natural) must print a natural sign.
  const cHarm = degreeSpellings(parseTonic('C'), MODES['harmonic-minor'].asc);
  check(accidentalForKey(cHarm[6], -3) === 'natural',
    'C harmonic minor prints a natural on the raised 7th', spellStr(cHarm[6]));

  // D melodic minor ascending: signature has B♭, raised 6th is B natural.
  const dMel = degreeSpellings(parseTonic('D'), MODES['melodic-minor'].asc);
  check(accidentalForKey(dMel[5], -1) === 'natural', 'D melodic minor prints a natural on the B');
  check(accidentalForKey(dMel[6], -1) === 'sharp', 'and a sharp on the C♯');
}

// ---------------------------------------------------------------------------
console.log('\nSequence shape');
{
  const s = generateScale({ tonic: 'C', mode: 'major', octaves: 2, direction: 'up-down', hand: 'right' });
  check(s.notes.length === 29, 'two octaves up and down is 29 notes', `${s.notes.length}`);
  check(s.notes[0].pitch === 60 && s.notes[14].pitch === 84 && s.notes[28].pitch === 60,
    'C major right hand runs C4 → C6 → C4',
    `${s.notes[0].pitch}, ${s.notes[14].pitch}, ${s.notes[28].pitch}`);
  check(s.clef === 'treble', 'right hand uses the treble clef');

  const asc = s.notes.slice(0, 15).map(n => n.pitch);
  check(asc.every((p, i) => i === 0 || p > asc[i - 1]), 'the ascending half rises monotonically');
  const desc = s.notes.slice(14).map(n => n.pitch);
  check(desc.every((p, i) => i === 0 || p < desc[i - 1]), 'and the descending half falls monotonically');

  const l = generateScale({ tonic: 'C', mode: 'major', hand: 'left' });
  check(l.clef === 'bass', 'left hand uses the bass clef');
  check(l.notes[0].pitch === 36 && l.notes[14].pitch === 60,
    'C major left hand runs C2 → C4', `${l.notes[0].pitch} → ${l.notes[14].pitch}`);

  const one = generateScale({ tonic: 'C', octaves: 1, direction: 'up' });
  check(one.notes.length === 8, 'one octave ascending is 8 notes', `${one.notes.length}`);
  const down = generateScale({ tonic: 'C', octaves: 1, direction: 'down' });
  check(down.notes[0].pitch === 72 && down.notes[7].pitch === 60,
    'descending only starts at the top', `${down.notes[0].pitch} → ${down.notes[7].pitch}`);
}

console.log('\nMelodic minor really does differ on the way down');
{
  const s = generateScale({ tonic: 'A', mode: 'melodic-minor', octaves: 1, direction: 'up-down', hand: 'right' });
  const names = s.notes.map(n => spellStr(n.spelling) + n.spelling.octave);
  // A B C D E F# G# A | G F E D C B A
  check(names.join(' ') === 'A3 B3 C4 D4 E4 F#4 G#4 A4 G4 F4 E4 D4 C4 B3 A3',
    'A melodic minor, one octave up and down', names.join(' '));

  const up = s.notes.slice(0, 8).map(n => n.pitch);
  const down = s.notes.slice(8).map(n => n.pitch);
  check(up.includes(66) && up.includes(68), 'raised 6th and 7th going up (F♯, G♯)');
  check(down.includes(65) && down.includes(67), 'natural 6th and 7th coming down (F, G)');

  const upOnly = generateScale({ tonic: 'A', mode: 'melodic-minor', octaves: 1, direction: 'up' });
  check(upOnly.notes.map(n => spellStr(n.spelling)).join(' ') === 'A B C D E F# G# A',
    'ascending-only uses the ascending form throughout');
  const downOnly = generateScale({ tonic: 'A', mode: 'melodic-minor', octaves: 1, direction: 'down' });
  check(downOnly.notes.map(n => spellStr(n.spelling)).join(' ') === 'A G F E D C B A',
    'descending-only uses the natural form throughout',
    downOnly.notes.map(n => spellStr(n.spelling)).join(' '));

  // Harmonic minor, by contrast, must NOT change on the way down.
  const h = generateScale({ tonic: 'A', mode: 'harmonic-minor', octaves: 1, direction: 'up-down' });
  const hNames = h.notes.map(n => spellStr(n.spelling));
  check(hNames[6] === 'G#' && hNames[8] === 'G#',
    'harmonic minor keeps its raised 7th in both directions', `${hNames[6]} / ${hNames[8]}`);
}

console.log('\nEvery offered tonic produces a playable scale');
{
  let worstLow = 127, worstHigh = 0, bad = 0;
  for (const family of ['major', 'minor']) {
    for (const tonic of TONICS[family]) {
      const modes = family === 'major' ? ['major'] : ['natural-minor', 'harmonic-minor', 'melodic-minor'];
      for (const mode of modes) {
        for (const hand of ['right', 'left']) {
          const s = generateScale({ tonic, mode, hand, octaves: 2, direction: 'up-down' });
          const pitches = s.notes.map(n => n.pitch);
          const lo = Math.min(...pitches), hi = Math.max(...pitches);
          worstLow = Math.min(worstLow, lo); worstHigh = Math.max(worstHigh, hi);
          if (lo < 21 || hi > 108) bad++;
          if (Math.abs(keySignatureFor(parseTonic(tonic), mode)) > 7) bad++;
          // Every note must be spelled on a letter that actually sounds it.
          for (const n of s.notes) {
            const pc = ((n.pitch % 12) + 12) % 12;
            const want = (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[n.spelling.letter]
              + n.spelling.alter + 120) % 12;
            if (pc !== want) bad++;
          }
        }
      }
    }
  }
  check(bad === 0, 'all 48 hand/key/mode combinations spell and sound consistently', `${bad} problems`);
  check(worstLow >= 36 && worstHigh <= 95,
    'and all stay inside a sane part of the keyboard',
    `lowest MIDI ${worstLow}, highest ${worstHigh}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
