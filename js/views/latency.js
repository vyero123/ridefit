// latency.js (view) — the Latency tab.
//
// Like the other views, an observer. Calibration is the one place a view
// drives the audio graph, and even then it only *schedules clicks* and
// *listens* — it never creates, destroys or reconnects anything.

import { runCalibration } from '../audio/latency.js';

const $ = (id) => document.getElementById(id);
const ms = (sec, digits = 1) => (sec * 1000).toFixed(digits);

export class LatencyView {
  constructor(session) {
    this.session = session;
    this._unsub = null;
    this.calibrating = false;

    $('manual-adjust').addEventListener('input', e => {
      const v = Number(e.target.value);
      $('manual-value').textContent = `${v} ms`;
      this.session.calibration.setManualAdjust(v / 1000);
      this.render();
    });

    $('btn-reset-calib').addEventListener('click', () => {
      this.session.calibration.reset();
      $('lat-raw').textContent = 'Nothing measured yet.';
      this.render();
    });

    $('btn-calibrate').addEventListener('click', () => this.calibrate());
    $('btn-calibrate').disabled = true;
  }

  activate() {
    if (!this._unsub) this._unsub = this.session.subscribe(this);
    this.render();
  }

  deactivate() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  onStatus() { this.render(); }

  render() {
    const c = this.session.calibration;
    $('lat-offset').innerHTML = c.source === 'default'
      ? '—<small> ms</small>' : `${ms(c.effectiveOffsetSec, 0)}<small> ms</small>`;
    $('lat-spread').innerHTML = c.spreadSec == null
      ? '—<small> ms</small>' : `±${ms(c.spreadSec, 0)}<small> ms</small>`;

    const q = c.quality;
    const qEl = $('lat-quality');
    qEl.className = `quality ${q.level}`;
    qEl.textContent = { none: 'not calibrated', poor: 'poor', fair: 'fair', ok: 'ok', good: 'good' }[q.level];
    $('lat-quality-note').textContent = q.note ? ` — ${q.note}` : '';

    const r = this.session.engine.getLatencyReport();
    if (r.available) {
      $('lat-base').innerHTML = r.baseLatency == null ? 'n/a' : `${ms(r.baseLatency)}<small> ms</small>`;
      $('lat-output').innerHTML = r.outputLatency == null
        ? (r.outputLatencyReported ? '0 <small>(reported)</small>' : 'n/a')
        : `${ms(r.outputLatency)}<small> ms</small>`;
      $('lat-sr').innerHTML = `${r.sampleRate}<small> Hz</small>`;
      $('lat-quantum').innerHTML = `${ms(r.renderQuantumSec, 2)}<small> ms</small>`;
    }

    $('manual-adjust').value = String(Math.round(c.manualAdjustSec * 1000));
    $('manual-value').textContent = `${Math.round(c.manualAdjustSec * 1000)} ms`;
    $('btn-calibrate').disabled = !this.session.running || this.calibrating;

    // Pipeline diagnostics — the thing that makes "is it listening?" a
    // question with a checkable answer.
    const live = this.session.assertLive();
    const h = live.health;
    $('pipeline-state').textContent = this.session.running
      ? (live.ok ? 'running' : 'PROBLEM')
      : 'stopped';
    $('pipeline-state').className = `quality ${this.session.running ? (live.ok ? 'good' : 'poor') : 'none'}`;
    $('pipeline-detail').textContent = [
      `context        ${h.contextState || 'none'}`,
      `worklet node   ${h.hasWorkletNode ? 'connected' : 'MISSING'}`,
      `source node    ${h.hasSourceNode ? 'connected' : 'MISSING'}${h.synthetic ? ' (synthetic)' : ''}`,
      `mic track      ${h.trackReadyState || (h.synthetic ? 'n/a' : 'none')}`,
      `worklet subs   ${h.subscribers}`,
      `worklet msgs   ${h.workletMessages}`,
      ``,
      `frames         ${this.session.stats.frames}`,
      `notes          ${this.session.stats.notes}`,
      `view changes   ${this.session.stats.viewChanges}`,
      `frames since last view change  ${this.session.stats.frames - this.session.stats.framesAtLastViewChange}`,
      `notes  since last view change  ${this.session.stats.notes - this.session.stats.notesAtLastViewChange}`,
      live.ok ? '' : `\nPROBLEMS: ${live.problems.join('; ')}`
    ].join('\n');
  }

  async calibrate() {
    const session = this.session;
    if (!session.input || this.calibrating) return;
    this.calibrating = true;
    $('btn-calibrate').disabled = true;

    const leadInBeats = 4, measureBeats = 12;
    const wrap = $('calib-beats');
    wrap.innerHTML = '';
    for (let i = 0; i < leadInBeats + measureBeats; i++) wrap.appendChild(document.createElement('i'));

    const prevStatus = session.status;
    session.status = { state: 'calibrating', message: 'Calibrating' };

    try {
      const result = await runCalibration({
        engine: session.engine,
        metronome: session.metronome,
        input: session.input,
        bpm: 72, leadInBeats, measureBeats,
        onProgress: p => {
          $('calib-status').textContent = p.phase === 'lead-in'
            ? `Counting in… ${p.beat + 1} of ${leadInBeats}`
            : `Play on each click — ${p.hits} note${p.hits === 1 ? '' : 's'} heard`;
          const kids = wrap.children;
          for (let i = 0; i < kids.length; i++) {
            kids[i].className = i > p.beat ? '' : (i < leadInBeats ? 'lead' : 'on');
          }
        }
      });

      if (result.accepted.length < 4) {
        $('calib-status').textContent = `Only ${result.accepted.length} usable note${result.accepted.length === 1 ? '' : 's'}. Play a bit louder, closer to the mic, and right on the clicks.`;
      } else {
        session.calibration.applyResult(result);
        $('calib-status').textContent = `Measured ${ms(result.offsetSec, 0)} ms of lag from ${result.accepted.length} notes.`;
      }

      $('lat-raw').textContent = [
        `offset      ${ms(result.offsetSec, 1)} ms`,
        `spread(IQR) ${result.spreadSec == null ? 'n/a' : '±' + ms(result.spreadSec, 1) + ' ms'}`,
        `accepted    ${result.accepted.length}`,
        `rejected    ${result.rejected.length}`,
        '',
        'per-note deviation (ms):',
        result.raw.map(r => `  beat ${String(r.beatIdx).padStart(2)}  ${ms(r.delta, 1).padStart(8)}`).join('\n') || '  (none)'
      ].join('\n');
    } catch (err) {
      console.error(err);
      $('calib-status').textContent = `Calibration failed: ${err.message}`;
    } finally {
      session.status = prevStatus;
      this.calibrating = false;
      this.render();
    }
  }
}
