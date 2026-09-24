// loader.js — loads and validates exercise JSON.
//
// Exercises are DATA. Nothing about an exercise lives in code: adding a drill
// means adding a .json file and listing it in exercises/index.json. The schema
// is documented in full in the README; this module is the enforcement of it.
//
// Validation is strict and loud on purpose. A hand-edited exercise file with a
// typo should tell you exactly which note is wrong, not fail silently at
// practice time.

import { nameToMidi, midiToStep } from '../music/pitch.js';

export const SCHEMA_VERSION = 1;

const VALID_CLEFS = new Set(['treble', 'bass', 'grand']);
const VALID_ACCIDENTALS = new Set(['sharp', 'flat', 'natural', 'none']);

export class ExerciseError extends Error {}

/**
 * Fetch the exercise index, then every exercise it lists.
 * @param {string} [dir]
 * @returns {Promise<{exercises: object[], errors: {file:string, message:string}[]}>}
 */
export async function loadAllExercises(dir = 'exercises/') {
  const indexRes = await fetch(dir + 'index.json');
  if (!indexRes.ok) throw new ExerciseError(`Could not load ${dir}index.json (${indexRes.status})`);
  const index = await indexRes.json();
  const files = Array.isArray(index) ? index : index.files;
  if (!Array.isArray(files)) throw new ExerciseError('index.json must be an array of filenames, or { "files": [...] }');

  const exercises = [];
  const errors = [];
  await Promise.all(files.map(async (file) => {
    try {
      const res = await fetch(dir + file);
      if (!res.ok) throw new ExerciseError(`HTTP ${res.status}`);
      const raw = await res.json();
      exercises.push(validateExercise(raw, file));
    } catch (err) {
      errors.push({ file, message: err.message });
    }
  }));

  // Keep the order given in index.json rather than whatever finished first.
  exercises.sort((a, b) => files.indexOf(a._file) - files.indexOf(b._file));
  return { exercises, errors };
}

/**
 * Validate and normalise one exercise object.
 * Returns a copy with every note carrying a resolved `midi` and `spelling`.
 */
export function validateExercise(raw, file = '(inline)') {
  const fail = (msg) => { throw new ExerciseError(`${file}: ${msg}`); };

  if (!raw || typeof raw !== 'object') fail('not a JSON object');

  const version = raw.schemaVersion != null ? raw.schemaVersion : SCHEMA_VERSION;
  if (version > SCHEMA_VERSION) {
    fail(`schemaVersion ${version} is newer than this app understands (${SCHEMA_VERSION})`);
  }

  const ex = {
    _file: file,
    schemaVersion: version,
    id: str(raw.id) || file.replace(/\.json$/, ''),
    title: str(raw.title) || 'Untitled exercise',
    description: str(raw.description) || '',
    clef: raw.clef || 'grand',
    tempo: num(raw.tempo, 72),
    timeSignature: raw.timeSignature || [4, 4],
    keySignature: num(raw.keySignature, 0),
    preferFlats: raw.preferFlats === true,
    tolerance: {
      cents: num(raw.tolerance && raw.tolerance.cents, 50),
      timingMs: num(raw.tolerance && raw.tolerance.timingMs, 120),
      octaveStrict: !(raw.tolerance && raw.tolerance.octaveStrict === false)
    },
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    notes: []
  };

  if (!VALID_CLEFS.has(ex.clef)) fail(`clef must be one of ${[...VALID_CLEFS].join(', ')}, got "${ex.clef}"`);
  if (!(ex.tempo > 0 && ex.tempo < 400)) fail(`tempo out of range: ${ex.tempo}`);
  if (!Array.isArray(ex.timeSignature) || ex.timeSignature.length !== 2) fail('timeSignature must be [beats, beatUnit]');
  if (!(ex.keySignature >= -7 && ex.keySignature <= 7)) fail('keySignature must be between -7 and 7 (sharps positive)');

  // A key signature with flats implies flat spelling unless told otherwise.
  if (raw.preferFlats === undefined && ex.keySignature < 0) ex.preferFlats = true;

  if (!Array.isArray(raw.notes) || raw.notes.length === 0) fail('notes must be a non-empty array');

  let impliedBeat = 0;
  raw.notes.forEach((n, i) => {
    const where = `notes[${i}]`;
    if (n == null || typeof n !== 'object') fail(`${where} is not an object`);

    const midi = nameToMidi(n.pitch);
    if (midi == null || !Number.isFinite(midi)) {
      fail(`${where}.pitch "${n.pitch}" is not a note name like "C4", "F#3", "Bb5", or a MIDI number`);
    }
    if (midi < 21 || midi > 108) fail(`${where}.pitch is outside the 88-key range (MIDI ${midi})`);

    const duration = num(n.duration, 1);
    if (!(duration > 0)) fail(`${where}.duration must be positive`);

    const beat = n.beat != null ? num(n.beat, impliedBeat) : impliedBeat;
    if (!(beat >= 0)) fail(`${where}.beat must be >= 0`);
    impliedBeat = beat + duration;

    let accidental = n.accidental;
    if (accidental !== undefined && accidental !== null && !VALID_ACCIDENTALS.has(accidental)) {
      fail(`${where}.accidental must be one of ${[...VALID_ACCIDENTALS].join(', ')}`);
    }
    if (accidental === 'none') accidental = null;

    const spelling = n.spelling && n.spelling.letter
      ? n.spelling
      : midiToStep(midi, ex.preferFlats);

    ex.notes.push({
      index: i,
      id: `${ex.id}-n${i}`,
      midi,
      beat,
      duration,
      spelling,
      accidental: accidental !== undefined ? accidental : undefined,
      hand: n.hand || null,          // 'left' | 'right' | null — advisory, unused in phase 1
      clef: n.clef || null,          // force a staff in grand-staff mode
      label: str(n.label) || null
    });
  });

  ex.notes.sort((a, b) => a.beat - b.beat);
  ex.totalBeats = Math.max(...ex.notes.map(n => n.beat + n.duration));
  return ex;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
