// practice.js — the Practice view.
//
// An observer on the AudioSession, exactly like the Listen view. Becoming
// visible subscribes; becoming hidden unsubscribes. Neither does anything to
// the audio graph, the microphone or the AudioContext.
//
// The note-you-are-playing mark is driven by session.playedNote, which is part
// of the session's model and keeps tracking whether or not this view exists.
// So the mark is correct the instant the tab appears, rather than waiting for
// the next attack.

import { midiToName, midiToFreq, spellForDisplay } from '../music/pitch.js';

const $ = (id) => document.getElementById(id);

export class PracticeView {
  /**
   * @param {import('../app/session.js').AudioSession} session
   * @param {import('../notation/staff.js').StaffRenderer} staff
   */
  constructor(session, staff) {
    this.session = session;
    this.staff = staff;
    this.exercises = [];
    this.exercise = null;
    this.noteIndex = 0;
    this._unsub = null;
    this._advanceTimer = null;
    this._wrongTimer = null;

    $('exercise-select').addEventListener('change', e => this.select(e.target.value));
    $('btn-restart').addEventListener('click', () => { this.noteIndex = 0; this.draw(); });
    $('btn-skip').addEventListener('click', () => {
      if (!this.exercise) return;
      this.noteIndex = Math.min(this.noteIndex + 1, this.exercise.notes.length);
      this.draw();
    });
  }

  activate() {
    if (this._unsub) return;
    this._unsub = this.session.subscribe(this);
    this.refreshPrompt();
  }

  deactivate() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
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
    if (list.length) this.select(list[0].id);
  }

  select(id) {
    const ex = this.exercises.find(e => e.id === id);
    if (!ex) return;
    this.exercise = ex;
    this.noteIndex = 0;
    $('exercise-desc').textContent = ex.description;
    this.staff.setClef(ex.clef);
    this.draw();
  }

  get target() {
    return this.exercise ? this.exercise.notes[this.noteIndex] : null;
  }

  draw() {
    const ex = this.exercise;
    if (!ex) return;
    clearTimeout(this._wrongTimer);
    const n = this.target;
    if (!n) return this.finish();

    this.staff.render([{
      id: n.id,
      midi: n.midi,
      spelling: n.spelling,
      accidental: n.accidental,
      clef: n.clef,
      state: 'target',
      x: 10
    }]);

    $('target-name').textContent = midiToName(n.midi, ex.preferFlats);
    $('target-freq').textContent = `${midiToFreq(n.midi, this.session.a4).toFixed(1)} Hz`;
    this.refreshPrompt();
    this.drawDots();
  }

  /** Keeps the prompt honest about whether the microphone is actually on. */
  refreshPrompt() {
    const fb = $('feedback');
    if (fb.dataset.sticky === '1') return;
    fb.className = 'feedback';
    fb.textContent = this.session.running ? 'Listening…' : 'Start the microphone first.';
  }

  drawDots() {
    const wrap = $('progress-dots');
    wrap.innerHTML = '';
    if (!this.exercise) return;
    this.exercise.notes.forEach((_, i) => {
      const dot = document.createElement('i');
      if (i < this.noteIndex) dot.className = 'done';
      else if (i === this.noteIndex) dot.className = 'current';
      wrap.appendChild(dot);
    });
  }

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  onStatus() { this.refreshPrompt(); }

  /**
   * The note currently sounding. Drawn in its own colour, in its own column,
   * for exactly as long as it is heard.
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
    const spelling = spellForDisplay(note.midi, {
      reference: target ? { midi: target.midi, spelling: target.spelling } : null,
      preferFlats: this.exercise ? this.exercise.preferFlats : false
    });
    this.staff.setPlayedNote({ midi: note.midi, spelling });
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
    fb.dataset.sticky = '1';

    if (same) {
      this.staff.setNoteState(target.id, 'correct');
      fb.textContent = `${midiToName(ev.midi)} — ${ev.cents >= 0 ? '+' : ''}${ev.cents.toFixed(0)}¢, confidence ${ev.clarity.toFixed(2)}`;
      fb.className = 'feedback good';
      this.noteIndex++;
      clearTimeout(this._advanceTimer);
      // Cosmetic pause so the match is visible. Nothing musical depends on it.
      this._advanceTimer = setTimeout(() => { fb.dataset.sticky = '0'; this.draw(); }, 450);
    } else {
      this.staff.setNoteState(target.id, 'wrong');
      const diff = ev.midi - target.midi;
      const hint = Math.abs(diff) === 12 ? ' (right note, wrong octave)' : '';
      fb.textContent = `Heard ${midiToName(ev.midi)}${hint} — looking for ${midiToName(target.midi, ex.preferFlats)}`;
      fb.className = 'feedback bad';
      clearTimeout(this._wrongTimer);
      this._wrongTimer = setTimeout(() => {
        this.staff.setNoteState(target.id, 'target');
        fb.dataset.sticky = '0';
        this.refreshPrompt();
      }, 700);
    }
  }

  finish() {
    this.staff.render([]);
    $('target-name').textContent = 'done';
    $('target-freq').textContent = '';
    const fb = $('feedback');
    fb.dataset.sticky = '0';
    fb.textContent = 'Exercise complete.';
    fb.className = 'feedback good';
    this.drawDots();
  }
}

/** "C#4" / "Gb4" from a {letter, alter, octave} spelling. */
function spellingToName(s) {
  const acc = s.alter > 0 ? '♯'.repeat(s.alter) : s.alter < 0 ? '♭'.repeat(-s.alter) : '';
  return `${s.letter}${acc}${s.octave}`;
}
