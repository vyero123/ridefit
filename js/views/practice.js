// practice.js — the Practice view.
//
// An observer on the AudioSession, exactly like the Listen view. Becoming
// visible subscribes; becoming hidden unsubscribes. Neither does anything to
// the audio graph, the microphone or the AudioContext.
//
// Phase 2 shows the whole sequence at once rather than one note at a time.
// Completed notes turn green and stay green, the current target is highlighted,
// and the notes still to come are dimmed. A wrong note flashes red and does
// NOT advance — there is no punishment beyond that, and nothing resets.
//
// Pacing is self-directed: the sequence advances when you play the right note,
// with no clock involved. Beat-driven timing is the next phase, and nothing
// here forecloses it — every exercise note already carries `beat` and
// `duration`, and the scorer would consume the same `onNote` events with
// `session.calibration.correct(ev.t)` applied.

import { midiToFreq, spellForDisplay } from '../music/pitch.js';
import { validateExercise } from '../exercises/loader.js';
import { TONICS, MODES, MINOR_MODES, parseTonic, tonicToString } from '../music/scales.js';

const $ = (id) => document.getElementById(id);

/** How many notes fit legibly on one system at 375 px. */
const NOTES_PER_SYSTEM = 8;

export class PracticeView {
  /**
   * @param {import('../app/session.js').AudioSession} session
   * @param {import('../notation/staff.js').StaffRenderer} staff  the sequence staff
   */
  constructor(session, staff) {
    this.session = session;
    this.staff = staff;

    this.exercises = [];          // hand-written drills from exercises/*.json
    this.exercise = null;         // the exercise currently being practised
    this.noteIndex = 0;
    this.source = 'scale';        // 'scale' | 'drill'

    this.scaleSpec = {
      tonicPc: 0, family: 'major', mode: 'major',
      hand: 'right', octaves: 2, direction: 'up-down'
    };

    this._unsub = null;
    this._wrongTimer = null;

    this._wireControls();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  activate() {
    if (this._unsub) return;
    this._unsub = this.session.subscribe(this);
    this.refreshPrompt();
  }

  deactivate() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  _wireControls() {
    // Source: scales or hand-written drills.
    $('src-scale').addEventListener('click', () => this.setSource('scale'));
    $('src-drill').addEventListener('click', () => this.setSource('drill'));

    // Tonic buttons, all twelve.
    const tonicWrap = $('tonic-picker');
    tonicWrap.innerHTML = '';
    for (let pc = 0; pc < 12; pc++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.pc = String(pc);
      b.addEventListener('click', () => { this.scaleSpec.tonicPc = pc; this.buildScale(); });
      tonicWrap.appendChild(b);
    }

    const modeSel = $('scale-mode');
    modeSel.innerHTML = '';
    for (const [key, def] of Object.entries(MODES)) {
      const o = document.createElement('option');
      o.value = key; o.textContent = def.label;
      modeSel.appendChild(o);
    }
    modeSel.value = 'major';
    modeSel.addEventListener('change', e => {
      this.scaleSpec.mode = e.target.value;
      this.scaleSpec.family = MINOR_MODES.includes(e.target.value) ? 'minor' : 'major';
      this.buildScale();
    });

    $('hand-right').addEventListener('click', () => { this.scaleSpec.hand = 'right'; this.buildScale(); });
    $('hand-left').addEventListener('click', () => { this.scaleSpec.hand = 'left'; this.buildScale(); });

    $('scale-octaves').addEventListener('change', e => {
      this.scaleSpec.octaves = Number(e.target.value); this.buildScale();
    });
    $('scale-direction').addEventListener('change', e => {
      this.scaleSpec.direction = e.target.value; this.buildScale();
    });

    $('exercise-select').addEventListener('change', e => this.select(e.target.value));
    $('btn-restart').addEventListener('click', () => { this.noteIndex = 0; this.draw(); });
    $('btn-skip').addEventListener('click', () => {
      if (!this.exercise) return;
      this.noteIndex = Math.min(this.noteIndex + 1, this.exercise.notes.length);
      this.draw();
    });
  }

  setSource(source) {
    this.source = source;
    $('src-scale').setAttribute('aria-selected', String(source === 'scale'));
    $('src-drill').setAttribute('aria-selected', String(source === 'drill'));
    $('scale-controls').hidden = source !== 'scale';
    $('drill-controls').hidden = source === 'scale';
    if (source === 'scale') this.buildScale();
    else if (this.exercises.length) this.select($('exercise-select').value || this.exercises[0].id);
  }

  // -------------------------------------------------------------------------
  // Building what to practise
  // -------------------------------------------------------------------------

  /** Build a scale from the current picker state. Nothing is hand-authored. */
  buildScale(overrides = {}) {
    Object.assign(this.scaleSpec, overrides);
    const spec = this.scaleSpec;
    spec.family = MINOR_MODES.includes(spec.mode) ? 'minor' : 'major';
    const tonic = TONICS[spec.family][spec.tonicPc];

    this.exercise = validateExercise({
      id: `scale-${tonic}-${spec.mode}-${spec.hand}`,
      generator: {
        type: 'scale',
        tonic, mode: spec.mode, octaves: spec.octaves,
        direction: spec.direction, hand: spec.hand
      },
      tolerance: { cents: 50, timingMs: 150, octaveStrict: true }
    }, '(scale builder)');

    this.noteIndex = 0;
    this._syncScaleControls();
    this.draw();
    return this.exercise;
  }

  _syncScaleControls() {
    const spec = this.scaleSpec;
    const names = TONICS[spec.family];
    for (const b of $('tonic-picker').children) {
      const pc = Number(b.dataset.pc);
      b.textContent = tonicToString(parseTonic(names[pc]));
      b.setAttribute('aria-selected', String(pc === spec.tonicPc));
    }
    $('scale-mode').value = spec.mode;
    $('hand-right').setAttribute('aria-selected', String(spec.hand === 'right'));
    $('hand-left').setAttribute('aria-selected', String(spec.hand === 'left'));
    $('scale-octaves').value = String(spec.octaves);
    $('scale-direction').value = spec.direction;
  }

  setExercises(list) {
    this.exercises = list;
    const sel = $('exercise-select');
    sel.innerHTML = '';
    for (const ex of list) {
      const o = document.createElement('option');
      o.value = ex.id; o.textContent = ex.title;
      sel.appendChild(o);
    }
  }

  /** Select a hand-written drill. */
  select(id) {
    const ex = this.exercises.find(e => e.id === id);
    if (!ex) return;
    this.source = 'drill';
    $('src-scale').setAttribute('aria-selected', 'false');
    $('src-drill').setAttribute('aria-selected', 'true');
    $('scale-controls').hidden = true;
    $('drill-controls').hidden = false;
    $('exercise-select').value = id;
    this.exercise = ex;
    this.noteIndex = 0;
    this.draw();
  }

  get target() {
    return this.exercise ? this.exercise.notes[this.noteIndex] : null;
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  draw() {
    const ex = this.exercise;
    if (!ex) return;
    clearTimeout(this._wrongTimer);

    $('exercise-desc').textContent = ex.description || ex.title;

    // A grand-staff drill still uses the Phase 1 single-system path; a
    // sequence on one clef uses the wrapped multi-system path.
    if (ex.clef === 'grand') {
      this.staff.setClef('grand');
      this.staff.render(ex.notes.map((n, i) => this._noteSpec(n, i)));
    } else {
      this.staff.renderSequence({
        notes: ex.notes.map((n, i) => this._noteSpec(n, i)),
        clef: ex.clef,
        keySignature: ex.keySignature,
        notesPerSystem: NOTES_PER_SYSTEM
      });
    }

    const n = this.target;
    if (!n) return this.finish();

    $('target-name').textContent = spellingToName(n.spelling);
    $('target-freq').textContent = `${midiToFreq(n.midi, this.session.a4).toFixed(1)} Hz`;
    $('progress-count').textContent = `${this.noteIndex + 1} of ${ex.notes.length}`;
    this.refreshPrompt();
  }

  _noteSpec(n, i) {
    return {
      id: n.id,
      midi: n.midi,
      spelling: n.spelling,
      accidental: n.accidental,
      clef: n.clef,
      state: i < this.noteIndex ? 'correct' : i === this.noteIndex ? 'target' : 'pending'
    };
  }

  /** Keeps the prompt honest about whether the microphone is actually on. */
  refreshPrompt() {
    const fb = $('feedback');
    if (fb.dataset.sticky === '1') return;
    fb.className = 'feedback';
    fb.textContent = this.session.running ? 'Play the highlighted note.' : 'Start the microphone first.';
  }

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  onStatus() { this.refreshPrompt(); }

  /**
   * The note currently sounding, drawn IN THE TARGET'S OWN COLUMN at its own
   * pitch. The vertical gap between the two is the feedback — below the target
   * means flat of it, above means sharp of it, level means right — which is
   * more use than any words underneath the staff.
   *
   * When the sequence has finished there is no target left, so the renderer
   * falls back to the last note's column and the mark still works.
   */
  onPlayed(s) {
    const note = s.note;
    const readout = $('played-readout');

    if (!note) {
      this.staff.setPlayedNote(null);
      readout.classList.remove('lit');
      $('played-name').textContent = '—';
      return;
    }

    const target = this.target;
    const anchor = target || (this.exercise ? this.exercise.notes[this.exercise.notes.length - 1] : null);
    const spelling = spellForDisplay(note.midi, {
      reference: target ? { midi: target.midi, spelling: target.spelling } : null,
      preferFlats: this.exercise ? this.exercise.preferFlats : false
    });

    this.staff.setPlayedNote({ midi: note.midi, spelling }, anchor ? anchor.id : null);

    readout.classList.add('lit');
    $('played-name').textContent = spellingToName(spelling);
  }

  onNote(ev) {
    const ex = this.exercise;
    if (!ex || this.session.status.state === 'calibrating') return;
    const target = this.target;
    if (!target) return;

    const strict = ex.tolerance.octaveStrict;
    const same = strict
      ? ev.midi === target.midi
      : ((ev.midi % 12) + 12) % 12 === ((target.midi % 12) + 12) % 12;

    const fb = $('feedback');

    if (same) {
      // Mark it done and leave it done. The sequence never resets.
      this.staff.setNoteState(target.id, 'correct');
      this.noteIndex++;
      fb.dataset.sticky = '0';
      $('progress-count').textContent = `${Math.min(this.noteIndex + 1, ex.notes.length)} of ${ex.notes.length}`;

      const next = this.target;
      if (!next) return this.finish();

      this.staff.setNoteState(next.id, 'target');
      // Move the overlay to the new column so the comparison stays live while
      // the note you just played is still ringing.
      this.staff.setPlayedNote(this.session.playedNote.current
        ? { midi: this.session.playedNote.current.midi,
            spelling: spellForDisplay(this.session.playedNote.current.midi,
              { reference: { midi: next.midi, spelling: next.spelling }, preferFlats: ex.preferFlats }) }
        : null, next.id);
      $('target-name').textContent = spellingToName(next.spelling);
      $('target-freq').textContent = `${midiToFreq(next.midi, this.session.a4).toFixed(1)} Hz`;
      fb.className = 'feedback good';
      fb.textContent = `${spellingToName(target.spelling)} ✓`;
    } else {
      // Brief, distinct, and that is all. No reset, no lost progress.
      this.staff.setNoteState(target.id, 'wrong');
      const diff = ev.midi - target.midi;
      const hint = Math.abs(diff) === 12 ? ' (right note, wrong octave)' : '';
      fb.textContent = `Heard ${spellingToName(spellForDisplay(ev.midi, { preferFlats: ex.preferFlats }))}${hint} — looking for ${spellingToName(target.spelling)}`;
      fb.className = 'feedback bad';
      fb.dataset.sticky = '1';
      clearTimeout(this._wrongTimer);
      this._wrongTimer = setTimeout(() => {
        if (this.target === target) this.staff.setNoteState(target.id, 'target');
        fb.dataset.sticky = '0';
        this.refreshPrompt();
      }, 700);
    }
  }

  finish() {
    $('target-name').textContent = 'done';
    $('target-freq').textContent = '';
    const fb = $('feedback');
    fb.dataset.sticky = '0';
    fb.textContent = this.exercise && this.exercise.scale
      ? 'Scale complete.'
      : 'Exercise complete.';
    fb.className = 'feedback good';
    if (this.exercise) $('progress-count').textContent = `${this.exercise.notes.length} of ${this.exercise.notes.length}`;
  }
}

/** "C♯4" / "G♭4" from a {letter, alter, octave} spelling. */
function spellingToName(s) {
  const acc = s.alter > 0 ? '♯'.repeat(s.alter) : s.alter < 0 ? '♭'.repeat(-s.alter) : '';
  return `${s.letter}${acc}${s.octave}`;
}
