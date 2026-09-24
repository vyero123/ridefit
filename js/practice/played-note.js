// played-note.js — "what note is sounding right now", with hysteresis.
//
// This is a model, not a view. It lives in the AudioSession and keeps running
// whichever tab is showing; views read it or subscribe to it. That is on
// purpose — see the note at the top of js/app/session.js.
//
// THE PROBLEM IT SOLVES
// --------------------
// An onset tells you a note STARTED. Nothing tells you it stopped. A piano
// note decays continuously, so there is no moment where the sound switches
// off; the detector's clarity figure just slides down until it is noise. If
// you light up the staff on an onset and clear it on a fixed timer, the
// display has nothing to do with what you are actually hearing — a note held
// under the pedal goes dark while it is still ringing, and a staccato note
// stays lit long after it has gone.
//
// So the note is held for as long as the detector keeps finding it, and the
// decision to let go is deliberately made harder than the decision to grab on:
//
//   attack   an onset event, or (if we missed the attack) a frame at high
//            confidence — ATTACK_CLARITY
//   sustain  any frame at the same pitch above SUSTAIN_CLARITY keeps it alive,
//            and that threshold is well BELOW the one needed to start
//   release  only after RELEASE_HOLD_SEC of continuous failure to find it
//
// Two thresholds plus a hold time is the hysteresis. A single wobble in
// clarity — which happens constantly, especially under the pedal — cannot
// make the display flicker, because one bad frame is neither low enough for
// long enough to trigger a release.

const ATTACK_CLARITY = 0.72;    // to grab a note we did not see start
const SUSTAIN_CLARITY = 0.34;   // to keep holding one we already have
const RELEASE_HOLD_SEC = 0.13;  // of continuous failure before letting go
const PITCH_SWITCH_SEC = 0.05;  // a new pitch must persist this long to take over

export class PlayedNoteTracker {
  constructor(opts = {}) {
    this.attackClarity = opts.attackClarity ?? ATTACK_CLARITY;
    this.sustainClarity = opts.sustainClarity ?? SUSTAIN_CLARITY;
    this.releaseHoldSec = opts.releaseHoldSec ?? RELEASE_HOLD_SEC;
    this.pitchSwitchSec = opts.pitchSwitchSec ?? PITCH_SWITCH_SEC;

    /** @type {{midi:number, cents:number, clarity:number, startedAt:number}|null} */
    this.current = null;

    this._lastGoodAt = 0;
    this._candidate = null;      // { midi, since } — a rival pitch trying to take over
    this._listeners = new Set();
  }

  /** @param {(s: {type:'start'|'change'|'end', note:object|null}) => void} fn */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(type) {
    for (const fn of this._listeners) {
      try { fn({ type, note: this.current }); } catch (e) { console.error('playedNote listener threw', e); }
    }
  }

  /** A confirmed key strike. The strongest possible reason to light a note. */
  onNote(ev) {
    if (ev.midi == null) return;
    const wasActive = !!this.current;
    const changed = !wasActive || this.current.midi !== ev.midi;
    this.current = { midi: ev.midi, cents: ev.cents, clarity: ev.clarity, startedAt: ev.t };
    this._lastGoodAt = ev.t;
    this._candidate = null;
    if (changed) this._emit(wasActive ? 'change' : 'start');
  }

  /** Continuous detector state. Drives sustain and release. */
  onFrame(f) {
    const good = f.midi != null && f.clarity >= this.sustainClarity;

    if (!this.current) {
      // We did not see an attack — a note was already ringing when listening
      // started, or the onset detector missed a very soft one. Grabbing it
      // requires real confidence, so that room noise cannot light the staff.
      if (f.midi != null && f.clarity >= this.attackClarity) {
        this.current = { midi: f.midi, cents: f.cents, clarity: f.clarity, startedAt: f.t };
        this._lastGoodAt = f.t;
        this._candidate = null;
        this._emit('start');
      }
      return;
    }

    if (good && f.midi === this.current.midi) {
      this.current.cents = f.cents;
      this.current.clarity = f.clarity;
      this._lastGoodAt = f.t;
      this._candidate = null;
      return;
    }

    if (good) {
      // A different pitch is dominant. Require it to persist briefly before
      // handing over, so that one confused frame mid-decay does not yank the
      // display to a neighbouring note.
      if (!this._candidate || this._candidate.midi !== f.midi) {
        this._candidate = { midi: f.midi, since: f.t };
      } else if (f.t - this._candidate.since >= this.pitchSwitchSec) {
        this.current = { midi: f.midi, cents: f.cents, clarity: f.clarity, startedAt: f.t };
        this._lastGoodAt = f.t;
        this._candidate = null;
        this._emit('change');
        return;
      }
    }

    if (f.t - this._lastGoodAt >= this.releaseHoldSec) {
      this.current = null;
      this._candidate = null;
      this._emit('end');
    }
  }

  /** Called when input stops, so the staff does not keep a stale note lit. */
  reset() {
    if (this.current) { this.current = null; this._candidate = null; this._emit('end'); }
  }
}
