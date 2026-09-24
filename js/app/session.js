// session.js — the one audio pipeline.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
// ------------------------------------
// There is exactly one AudioContext, one microphone stream, one worklet and
// one InputSource for the whole life of the page. They are created by
// start() — which only the Start button calls — and torn down by stop() —
// which only the Stop button calls. NOTHING ELSE MAY TOUCH THE AUDIO GRAPH.
// In particular, switching tabs must never create, destroy, connect,
// disconnect, suspend or resume anything.
//
// Views are observers. They subscribe when they become visible and unsubscribe
// when they are hidden, and that is the entire extent of their power over the
// pipeline. A view that forgets to unsubscribe leaks a little work; a view
// that forgets to subscribe shows nothing. Neither can stop the audio.
//
// The session also keeps a PERMANENT internal subscriber that updates counters
// and the played-note model. It is registered in the constructor and never
// removed. That is deliberate: it means the pipeline's liveness is observable
// (and assertable) independently of whether any view happens to be watching,
// which is exactly the property that was missing when the Practice tab looked
// dead. See assertLive() below and tests/browser-test.html.

import { AudioEngine } from '../audio/engine.js';
import { MicInputSource } from '../audio/input-source.js';
import { Metronome } from '../audio/metronome.js';
import { LatencyCalibration } from '../audio/latency.js';
import { PlayedNoteTracker } from '../practice/played-note.js';

export class AudioSession {
  constructor(opts = {}) {
    this.engine = new AudioEngine({ windowSize: opts.windowSize || 4096 });
    this.metronome = new Metronome(this.engine);
    this.calibration = new LatencyCalibration();
    this.playedNote = new PlayedNoteTracker();

    /** @type {MicInputSource|null} */
    this.input = null;

    this.running = false;
    this.a4 = opts.a4 || 440;
    this.status = { state: 'idle', message: 'Idle' };

    /** Observers. Each may implement onFrame / onNote / onStatus / onPlayed. */
    this._observers = new Set();

    /** Liveness counters. Never reset by a view change — that is the point. */
    this.stats = {
      frames: 0, notes: 0,
      lastFrameT: null, lastNoteT: null,
      viewChanges: 0,
      framesAtLastViewChange: 0, notesAtLastViewChange: 0
    };

    this._unsubInput = [];
  }

  // -------------------------------------------------------------------------
  // Observers
  // -------------------------------------------------------------------------

  /**
   * @param {{onFrame?:Function, onNote?:Function, onStatus?:Function, onPlayed?:Function}} observer
   * @returns {() => void} unsubscribe
   */
  subscribe(observer) {
    this._observers.add(observer);
    // Give a newly-attached view the current state immediately, so that
    // switching to a tab mid-note does not leave it blank until the next
    // event. A view must never have to wait for the pipeline to "come back".
    if (observer.onStatus) safely(() => observer.onStatus(this.status));
    if (observer.onPlayed) safely(() => observer.onPlayed({ type: this.playedNote.current ? 'start' : 'end', note: this.playedNote.current }));
    return () => this._observers.delete(observer);
  }

  _dispatch(method, payload) {
    for (const o of this._observers) {
      if (typeof o[method] === 'function') safely(() => o[method](payload));
    }
  }

  /** Views call this when the visible tab changes. It touches no audio. */
  noteViewChange() {
    this.stats.viewChanges++;
    this.stats.framesAtLastViewChange = this.stats.frames;
    this.stats.notesAtLastViewChange = this.stats.notes;

    // Runtime guard against the class of regression this whole refactor is
    // about: if the pipeline is supposed to be running and the graph has gone
    // missing at the moment a view appeared, say so loudly instead of looking
    // merely broken.
    const live = this.assertLive();
    if (!live.ok) console.error('[AudioSession] pipeline not intact at view change:', live.problems, this.engine.pipelineHealth());
    return live;
  }

  /**
   * Is the pipeline in a state where detection events should be arriving?
   * @returns {{ok:boolean, problems:string[], health:object}}
   */
  assertLive() {
    const problems = [];
    const h = this.engine.pipelineHealth();
    if (!this.running) {
      return { ok: true, problems: [], health: h };   // stopped on purpose
    }
    if (!h.hasContext) problems.push('no AudioContext');
    if (h.contextState !== 'running') problems.push(`AudioContext is "${h.contextState}"`);
    if (!h.hasWorkletNode) problems.push('worklet node is gone');
    if (!h.hasSourceNode) problems.push('input source node is gone');
    if (!h.synthetic && h.trackReadyState && h.trackReadyState !== 'live') {
      problems.push(`microphone track is "${h.trackReadyState}"`);
    }
    if (!h.synthetic && h.trackEnabled === false) problems.push('microphone track is disabled');
    if (!this.input) problems.push('no InputSource');
    if (h.subscribers === 0) problems.push('nothing is listening to the worklet');
    return { ok: problems.length === 0, problems, health: h };
  }

  // -------------------------------------------------------------------------
  // Lifecycle — ONLY the Start and Stop buttons call these
  // -------------------------------------------------------------------------

  /**
   * @param {object} [o]
   * @param {AudioNode} [o.sourceNode] test harness injection; see engine.startInput
   */
  async start(o = {}) {
    if (this.running) return;

    // unlock() must be reached synchronously from a user gesture on iOS, so
    // the caller is responsible for calling this from a click handler with no
    // awaits before it.
    await this.engine.unlock();

    this.input = new MicInputSource(this.engine, { a4: this.a4 });

    this._unsubInput.push(this.input.on('status', s => {
      this.status = s;
      this._dispatch('onStatus', s);
    }));

    // THE PERMANENT SUBSCRIBERS. Registered once, never removed, independent
    // of every view.
    this._unsubInput.push(this.input.on('frame', f => {
      this.stats.frames++;
      this.stats.lastFrameT = f.t;
      this.playedNote.onFrame(f);
      this._dispatch('onFrame', f);
    }));

    this._unsubInput.push(this.input.on('note', ev => {
      this.stats.notes++;
      this.stats.lastNoteT = ev.t;
      this.playedNote.onNote(ev);
      this._dispatch('onNote', ev);
    }));

    this._unsubInput.push(this.playedNote.subscribe(s => this._dispatch('onPlayed', s)));

    await this.input.start(o);
    this.running = true;
    return this.assertLive();
  }

  async stop() {
    if (!this.running && !this.input) return;
    for (const u of this._unsubInput) u();
    this._unsubInput = [];
    this.playedNote.reset();
    if (this.input) await this.input.stop();
    this.input = null;
    this.running = false;
    this.status = { state: 'stopped', message: 'Stopped' };
    this._dispatch('onStatus', this.status);
  }

  setA4(hz) {
    this.a4 = hz;
    if (this.input) this.input.setA4(hz);
  }

  setWindowSize(n) {
    this.engine.windowSize = n;
    this.engine.configureDetector({ windowSize: n });
  }
}

function safely(fn) {
  try { fn(); } catch (e) { console.error('[AudioSession] observer threw', e); }
}
