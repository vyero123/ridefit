// scales.js — scale generation from intervals, with correct spelling.
//
// No table of 24 scales. A scale is a tonic plus a list of intervals, and the
// SPELLING falls out of a rule rather than being written down: a diatonic
// scale uses each letter name exactly once, in order, and the accidental on
// each is whatever is needed to hit the right pitch. Get that rule right and
// B♭ major comes out as B♭ C D E♭ F G A rather than A♯ C D D♯ F G A, for every
// key, without anyone having to type them out.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Interval patterns in semitones from the tonic.
 *
 * `desc` is the descending form where it differs from the ascending one. Only
 * melodic minor has one — and it is the whole reason melodic minor is worth
 * treating carefully rather than fudging.
 */
export const MODES = {
  'major': {
    label: 'Major',
    asc: [0, 2, 4, 5, 7, 9, 11],
    desc: null,
    signatureFrom: 'self'
  },
  'natural-minor': {
    label: 'Natural minor',
    asc: [0, 2, 3, 5, 7, 8, 10],
    desc: null,
    signatureFrom: 'self'
  },
  'harmonic-minor': {
    label: 'Harmonic minor',
    // Raised 7th, the same going up and coming down.
    asc: [0, 2, 3, 5, 7, 8, 11],
    desc: null,
    signatureFrom: 'natural-minor'
  },
  'melodic-minor': {
    label: 'Melodic minor',
    // Raised 6th AND 7th ascending; plain natural minor descending. This is
    // the real thing, not the "jazz minor" simplification that uses the
    // ascending form in both directions.
    asc: [0, 2, 3, 5, 7, 9, 11],
    desc: [0, 2, 3, 5, 7, 8, 10],
    signatureFrom: 'natural-minor'
  }
};

export const MINOR_MODES = ['natural-minor', 'harmonic-minor', 'melodic-minor'];

/**
 * Conventional tonic spelling for each pitch class, by mode family. This is a
 * spelling table (12 short strings), not a table of scales — the scales are
 * still generated. It exists because pitch class 1 is D♭ in major (5 flats)
 * but C♯ in minor (4 sharps), and picking the wrong one gives a key signature
 * nobody writes.
 */
export const TONICS = {
  major: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  minor: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
};

/** Lowest MIDI note a generated scale will start on, per hand. */
const HAND = {
  // Treble floor F3: C major then lands on C4–C6, the textbook right-hand
  // two-octave range, and no key pushes further than three ledger lines.
  right: { clef: 'treble', floorMidi: 53 },
  // Bass floor C2: C major lands on C2–C4, again the textbook left-hand range,
  // and C2 at 65 Hz is comfortably inside what the detector handles.
  left: { clef: 'bass', floorMidi: 36 }
};

// ---------------------------------------------------------------------------

/** Parse a tonic name with no octave: "C", "Bb", "F#", "Eb", "C♯". */
export function parseTonic(name) {
  const m = /^([A-Ga-g])([#b♯♭x]*)$/.exec(String(name).trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let alter = 0;
  for (const c of m[2]) {
    if (c === '#' || c === '♯') alter += 1;
    else if (c === 'b' || c === '♭') alter -= 1;
    else if (c === 'x') alter += 2;
  }
  return { letter, alter };
}

export function tonicToString(t) {
  const acc = t.alter > 0 ? '♯'.repeat(t.alter) : t.alter < 0 ? '♭'.repeat(-t.alter) : '';
  return t.letter + acc;
}

/**
 * The spelling of each scale degree.
 *
 * Each degree takes the next letter name, and its accidental is whatever makes
 * that letter land on the required pitch. That single rule produces every
 * correct scale spelling, including the awkward ones: C♭ in G♭ major, B♯ in
 * C♯ harmonic minor, and the double sharps that show up in keys nobody sane
 * asks for.
 *
 * @returns {{letter:string, alter:number}[]}
 */
export function degreeSpellings(tonic, intervals) {
  const ti = LETTERS.indexOf(tonic.letter);
  const tonicPc = ((NATURAL_PC[tonic.letter] + tonic.alter) % 12 + 12) % 12;

  return intervals.map((semitones, degree) => {
    const letter = LETTERS[(ti + degree) % 7];
    const wantPc = (tonicPc + semitones) % 12;
    let alter = wantPc - NATURAL_PC[letter];
    // Bring the accidental into a musical range: an interval of 11 semitones
    // from the letter's natural pitch means a flat, not eleven sharps.
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return { letter, alter };
  });
}

/**
 * Key signature, as a signed count of fifths (positive sharps, negative flats).
 *
 * Derived, not tabulated: it is simply the sum of the accidentals in the
 * scale's *natural* form. Harmonic and melodic minor take the natural minor
 * signature and show their raised degrees as inline accidentals, which is what
 * engraving convention does.
 */
export function keySignatureFor(tonic, mode) {
  const def = MODES[mode];
  if (!def) throw new Error(`unknown mode: ${mode}`);
  const base = def.signatureFrom === 'self' ? def.asc : MODES[def.signatureFrom].asc;
  return degreeSpellings(tonic, base).reduce((sum, s) => sum + s.alter, 0);
}

/** MIDI number of a written pitch. */
function midiOf(letter, alter, octave) {
  return (octave + 1) * 12 + NATURAL_PC[letter] + alter;
}

/** The octave number that makes this spelling equal this MIDI note. */
function octaveFor(letter, alter, midi) {
  return Math.round((midi - NATURAL_PC[letter] - alter) / 12) - 1;
}

// ---------------------------------------------------------------------------

/**
 * Generate a scale as a note sequence.
 *
 * @param {object} spec
 * @param {string} spec.tonic           "C", "Bb", "F#", …
 * @param {string} [spec.mode]          key of MODES; default 'major'
 * @param {number} [spec.octaves]       default 2
 * @param {'up'|'down'|'up-down'} [spec.direction] default 'up-down'
 * @param {'right'|'left'} [spec.hand]  default 'right'
 * @param {number} [spec.startOctave]   octave of the written tonic; derived if absent
 * @returns {{notes:object[], clef:string, keySignature:number, title:string,
 *            tonic:object, mode:string, startMidi:number}}
 */
export function generateScale(spec = {}) {
  const tonic = parseTonic(spec.tonic || 'C');
  if (!tonic) throw new Error(`unrecognised tonic: ${spec.tonic}`);

  const mode = spec.mode || 'major';
  const def = MODES[mode];
  if (!def) throw new Error(`unknown mode: ${mode}`);

  const octaves = Math.max(1, Math.min(4, spec.octaves || 2));
  const direction = spec.direction || 'up-down';
  const hand = spec.hand === 'left' ? 'left' : 'right';
  const handDef = HAND[hand];

  const ascSpell = degreeSpellings(tonic, def.asc);
  const descSpell = def.desc ? degreeSpellings(tonic, def.desc) : ascSpell;
  const ascSteps = def.asc;
  const descSteps = def.desc || def.asc;

  // Where the scale sits. The written tonic's octave, either given or chosen
  // as the lowest one at or above this hand's floor.
  const tonicPc = ((NATURAL_PC[tonic.letter] + tonic.alter) % 12 + 12) % 12;
  let startMidi;
  if (spec.startOctave != null) {
    startMidi = midiOf(tonic.letter, tonic.alter, spec.startOctave);
  } else {
    startMidi = handDef.floorMidi + ((tonicPc - handDef.floorMidi) % 12 + 12) % 12;
  }

  const top = 7 * octaves;   // degree index of the highest tonic

  /** Build one note at degree index `i`, using the given form. */
  const noteAt = (i, spellings, steps) => {
    const d = i % 7;
    const oct = Math.floor(i / 7);
    const midi = startMidi + steps[d] + 12 * oct;
    const sp = spellings[d];
    return {
      midi,
      spelling: { letter: sp.letter, alter: sp.alter, octave: octaveFor(sp.letter, sp.alter, midi) },
      degree: d + 1
    };
  };

  const seq = [];
  if (direction === 'up' || direction === 'up-down') {
    for (let i = 0; i <= top; i++) seq.push(noteAt(i, ascSpell, ascSteps));
  }
  if (direction === 'down') {
    for (let i = top; i >= 0; i--) seq.push(noteAt(i, descSpell, descSteps));
  } else if (direction === 'up-down') {
    // The top tonic is already there, so come back from one below it.
    for (let i = top - 1; i >= 0; i--) seq.push(noteAt(i, descSpell, descSteps));
  }

  const notes = seq.map((n, i) => ({
    pitch: n.midi,
    spelling: n.spelling,
    beat: i,
    duration: 1,
    hand,
    degree: n.degree
  }));

  const dirLabel = direction === 'up-down' ? 'up and down' : direction === 'up' ? 'ascending' : 'descending';
  const title = `${tonicToString(tonic)} ${def.label.toLowerCase()} — ${hand} hand, ${octaves} octave${octaves > 1 ? 's' : ''}, ${dirLabel}`;

  return {
    notes,
    clef: handDef.clef,
    keySignature: keySignatureFor(tonic, mode),
    title,
    tonic,
    mode,
    hand,
    octaves,
    direction,
    startMidi
  };
}

// ---------------------------------------------------------------------------
// Key signature layout
// ---------------------------------------------------------------------------

/** Letters in the order accidentals are added to a key signature. */
export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/**
 * What the key signature does to each letter.
 * @returns {Object<string, number>} letter -> alter
 */
export function keySignatureAlters(fifths) {
  const map = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) for (let i = 0; i < Math.min(7, fifths); i++) map[SHARP_ORDER[i]] = 1;
  if (fifths < 0) for (let i = 0; i < Math.min(7, -fifths); i++) map[FLAT_ORDER[i]] = -1;
  return map;
}

/**
 * Which accidental, if any, to print on a note given the key signature.
 *
 * A note that agrees with the signature gets nothing — that is what a key
 * signature is for. A note that differs gets an accidental, including a
 * natural when the signature would otherwise alter it. This is what makes a
 * harmonic minor scale look right: the raised 7th carries a visible accidental
 * because it contradicts the signature.
 *
 * (Bar-by-bar accidental persistence is not modelled. Scales run one note per
 * beat with no barlines drawn, so every altered note is marked. That is
 * correct for the material here and would need revisiting alongside barlines.)
 *
 * @returns {'sharp'|'flat'|'natural'|null}
 */
export function accidentalForKey(spelling, fifths) {
  const alters = keySignatureAlters(fifths);
  const fromKey = alters[spelling.letter] || 0;
  if (spelling.alter === fromKey) return null;
  if (spelling.alter === 0) return 'natural';
  if (spelling.alter > 0) return 'sharp';
  return 'flat';
}
