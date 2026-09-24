// listen.js — the "what am I hearing" view.
//
// An observer on the AudioSession. It owns DOM and nothing else. Its activate
// and deactivate methods subscribe and unsubscribe; neither touches audio.

import { midiToName } from '../music/pitch.js';

const $ = (id) => document.getElementById(id);

export class ListenView {
  constructor(session) {
    this.session = session;
    this._unsub = null;
    this._lastPaint = 0;
    this._onsetFlashTimer = null;
  }

  activate() {
    if (this._unsub) return;
    this._unsub = this.session.subscribe(this);
  }

  deactivate() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  onStatus() { /* the shell owns the status pill */ }

  onFrame(f) {
    // Display-rate throttle only. Never used for musical timing.
    const now = performance.now();
    if (now - this._lastPaint < 45) return;
    this._lastPaint = now;
    this.paint(f);
  }

  onNote(ev) {
    $('onset-count').textContent = String(this.session.stats.notes);
    $('last-onset').innerHTML = `${ev.t.toFixed(2)}<small> s</small>`;
    const flash = $('onset-flash');
    flash.classList.add('hit');
    clearTimeout(this._onsetFlashTimer);
    this._onsetFlashTimer = setTimeout(() => flash.classList.remove('hit'), 120);
  }

  paint(f) {
    const nameEl = $('note-name');
    const clarity = f ? f.clarity : 0;
    const rms = f ? f.rms : 0;
    const db = 20 * Math.log10(Math.max(rms, 1e-6));

    $('clarity-value').textContent = f ? clarity.toFixed(2) : '—';
    setMeter('clarity-meter', clarity, clarity > 0.8);
    $('rms-value').textContent = f ? `${db.toFixed(0)} dB` : '—';
    setMeter('rms-meter', f ? Math.min(1, (db + 60) / 60) : 0);

    if (!f || !f.voiced || f.midi == null) {
      nameEl.textContent = '—';
      nameEl.classList.add('silent');
      $('freq-hz').textContent = '—';
      $('cents-value').textContent = '0¢';
      $('cents-needle').style.left = '50%';
      return;
    }

    const name = midiToName(f.midi);
    const letter = name.replace(/-?\d+$/, '');
    const octave = name.slice(letter.length);
    nameEl.classList.remove('silent');
    nameEl.innerHTML = `${letter}<span class="octave">${octave}</span>`;

    $('freq-hz').textContent = f.frequency.toFixed(1);
    const cents = Math.max(-50, Math.min(50, f.cents));
    $('cents-value').textContent = `${cents >= 0 ? '+' : ''}${cents.toFixed(0)}¢`;
    $('cents-needle').style.left = `${50 + cents}%`;
    $('cents-needle').style.background = Math.abs(cents) <= 10
      ? 'var(--good)' : Math.abs(cents) <= 25 ? 'var(--warn)' : 'var(--bad)';
  }

  clear() { this.paint(null); }
}

function setMeter(id, value01, good = false) {
  const m = $(id);
  m.classList.toggle('good', good);
  m.firstElementChild.style.width = `${Math.max(0, Math.min(1, value01)) * 100}%`;
}
