// pitch.js — conversions between frequency, MIDI number and note spelling.
// A4 = 440 Hz by default but the reference is configurable, because an
// acoustic piano that has drifted (or is tuned to 442) would otherwise show a
// constant cents offset on every note.

export const A4_DEFAULT = 440;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Letter and accidental offset for each pitch class, sharp spelling. */
const SHARP_STEPS = [
  { letter: 'C', alter: 0 }, { letter: 'C', alter: 1 },
  { letter: 'D', alter: 0 }, { letter: 'D', alter: 1 },
  { letter: 'E', alter: 0 }, { letter: 'F', alter: 0 },
  { letter: 'F', alter: 1 }, { letter: 'G', alter: 0 },
  { letter: 'G', alter: 1 }, { letter: 'A', alter: 0 },
  { letter: 'A', alter: 1 }, { letter: 'B', alter: 0 }
];
const FLAT_STEPS = [
  { letter: 'C', alter: 0 }, { letter: 'D', alter: -1 },
  { letter: 'D', alter: 0 }, { letter: 'E', alter: -1 },
  { letter: 'E', alter: 0 }, { letter: 'F', alter: 0 },
  { letter: 'G', alter: -1 }, { letter: 'G', alter: 0 },
  { letter: 'A', alter: -1 }, { letter: 'A', alter: 0 },
  { letter: 'B', alter: -1 }, { letter: 'B', alter: 0 }
];

/** @returns {number} fractional MIDI number */
export function freqToMidiFloat(freq, a4 = A4_DEFAULT) {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi, a4 = A4_DEFAULT) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Nearest equal-tempered note plus how far off it is.
 * @returns {{midi:number, cents:number}} cents in [-50, 50)
 */
export function analyseFreq(freq, a4 = A4_DEFAULT) {
  const f = freqToMidiFloat(freq, a4);
  const midi = Math.round(f);
  return { midi, cents: (f - midi) * 100 };
}

/** "C#4" style name. `preferFlats` switches the enharmonic spelling. */
export function midiToName(midi, preferFlats = false) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc] + octave;
}

/** Letter/alter/octave, which is what the notation renderer needs. */
export function midiToStep(midi, preferFlats = false) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const s = (preferFlats ? FLAT_STEPS : SHARP_STEPS)[pc];
  return { letter: s.letter, alter: s.alter, octave };
}

const NAME_RE = /^([A-Ga-g])([#b♯♭x]*)(-?\d+)$/;
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parse "C4", "F#3", "Bb5", "Eb2" into a MIDI number.
 * Accepts a plain number too, so exercise files can use either.
 * @returns {number|null}
 */
export function nameToMidi(name) {
  if (typeof name === 'number') return name;
  const m = NAME_RE.exec(String(name).trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let alter = 0;
  for (const c of m[2]) {
    if (c === '#' || c === '♯') alter += 1;
    else if (c === 'b' || c === '♭') alter -= 1;
    else if (c === 'x') alter += 2;
  }
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + LETTER_PC[letter] + alter;
}

/**
 * Choose how to WRITE a pitch that we only know as a MIDI number.
 *
 * This is genuinely ambiguous and no amount of signal processing can resolve
 * it: the microphone hears one black key, and F#4 and Gb4 are the same black
 * key. Something has to decide, so the rule is "agree with the music in front
 * of you", in this order:
 *
 *   1. Same note as the target — spell it exactly as the target is written.
 *      Play the G♭4 that the exercise asked for and you see a G♭4, not an F♯4.
 *   2. Same pitch class as the target, wrong octave — keep the target's letter
 *      and accidental, change the octave. Octave slips stay legible.
 *   3. Otherwise — follow the exercise's key signature: flats for flat keys,
 *      sharps for sharp keys and for C major.
 *
 * @param {number} midi
 * @param {{reference?: {midi:number, spelling:object}, preferFlats?: boolean}} [opts]
 */
export function spellForDisplay(midi, opts = {}) {
  const ref = opts.reference;
  if (ref && ref.spelling) {
    if (ref.midi === midi) return { ...ref.spelling };
    const samePc = (((ref.midi - midi) % 12) + 12) % 12 === 0;
    if (samePc) {
      const octaveShift = Math.round((midi - ref.midi) / 12);
      return { ...ref.spelling, octave: ref.spelling.octave + octaveShift };
    }
  }
  return midiToStep(midi, opts.preferFlats === true);
}

/**
 * Diatonic step number, used for vertical placement on a staff.
 * C4 (middle C) is 0; each letter name up is +1, each octave is +7.
 */
export function diatonicStep(letter, octave) {
  const order = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  return (octave - 4) * 7 + order[letter];
}
