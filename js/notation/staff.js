// staff.js — SVG staff renderer.
//
// Everything is laid out in STAFF SPACES and put in the viewBox, so the SVG
// scales to any width without recomputing anything and stays crisp on a phone.
//
// Phase 1 draws one target note. The structure is deliberately a list of note
// objects with an x position, so a series of notes, and later a scrolling
// series, is a change of x-assignment rather than a rewrite.

import { midiToStep, diatonicStep } from '../music/pitch.js';
import { TREBLE_CLEF, BASS_CLEF, SHARP, FLAT, NATURAL, NOTEHEAD, unitTransform } from './glyphs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const STAFF_HEIGHT = 4;      // spaces, bottom line to top line
const GRAND_GAP = 7;         // spaces between treble bottom line and bass top line

/** Bottom-line diatonic step for each clef. */
const CLEF_INFO = {
  treble: { glyph: TREBLE_CLEF, bottomLineStep: diatonicStep('E', 4) },  // E4
  bass:   { glyph: BASS_CLEF,   bottomLineStep: diatonicStep('G', 2) }   // G2
};

function el(name, attrs = {}) {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  }
  return n;
}

export class StaffRenderer {
  /**
   * @param {SVGSVGElement} svg
   * @param {object} [opts]
   * @param {'treble'|'bass'|'grand'} [opts.clef]
   * @param {number} [opts.widthUnits] staff width in spaces
   */
  constructor(svg, opts = {}) {
    this.svg = svg;
    this.clef = opts.clef || 'grand';
    this.widthUnits = opts.widthUnits || 26;
    this.padTop = 7;      // room for ledger lines and high notes
    this.padBottom = 7;
    this.notes = [];
    this._noteEls = new Map();

    /** Column for the "note you are playing" mark, clear of the target. */
    this.playedX = opts.playedX || 18;
    this._playedNote = null;
    this._playedLayer = null;
  }

  setClef(clef) { this.clef = clef; }

  /** Vertical origin (y of the bottom line) for each staff in the layout. */
  _staffTops() {
    if (this.clef === 'grand') {
      return { treble: this.padTop, bass: this.padTop + STAFF_HEIGHT + GRAND_GAP };
    }
    return { [this.clef]: this.padTop };
  }

  _totalHeight() {
    const tops = this._staffTops();
    const lowest = Math.max(...Object.values(tops)) + STAFF_HEIGHT;
    return lowest + this.padBottom;
  }

  /** y of a diatonic step within a given staff. */
  _stepY(clef, step) {
    const top = this._staffTops()[clef];
    const info = CLEF_INFO[clef];
    // top is the y of the TOP line; the bottom line is STAFF_HEIGHT below it.
    const bottomLineY = top + STAFF_HEIGHT;
    return bottomLineY - (step - info.bottomLineStep) * 0.5;
  }

  /** Which staff a MIDI note belongs on. */
  _clefFor(midi, preferred) {
    if (preferred && CLEF_INFO[preferred]) return preferred;
    if (this.clef !== 'grand') return this.clef;
    return midi >= 60 ? 'treble' : 'bass';
  }

  /**
   * @param {{midi:number, spelling?:{letter:string,alter:number,octave:number},
   *          accidental?:'sharp'|'flat'|'natural'|null, clef?:string,
   *          x?:number, state?:string, id?:string}[]} notes
   */
  render(notes = []) {
    this.notes = notes;
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this._noteEls.clear();

    const h = this._totalHeight();
    svg.setAttribute('viewBox', `0 0 ${this.widthUnits} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const root = el('g', { class: 'staff-root' });
    svg.appendChild(root);

    const tops = this._staffTops();
    for (const clef of Object.keys(tops)) {
      root.appendChild(this._drawStaffLines(clef, tops[clef]));
      root.appendChild(this._drawClef(clef));
    }

    if (this.clef === 'grand') root.appendChild(this._drawBrace(tops));

    const layer = el('g', { class: 'notes' });
    root.appendChild(layer);

    let autoX = 9;
    for (const n of notes) {
      const g = this._drawNote(n, n.x != null ? n.x : autoX);
      layer.appendChild(g);
      if (n.id) this._noteEls.set(n.id, g);
      autoX += 4.5;
    }

    // The played-note layer is separate from the exercise notes and is never
    // cleared by render(). It has its own column so that a played note which
    // happens to BE the target is still visible as its own mark rather than
    // hidden underneath one — the target meanwhile changes colour to say it
    // was matched.
    this._playedLayer = el('g', { class: 'played-layer' });
    root.appendChild(this._playedLayer);
    if (this._playedNote) this._paintPlayed();

    return svg;
  }

  /**
   * Show (or clear) the note currently being heard.
   * @param {{midi:number, spelling?:object, accidental?:string}|null} note
   */
  setPlayedNote(note) {
    this._playedNote = note;
    this._paintPlayed();
  }

  _paintPlayed() {
    const layer = this._playedLayer;
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!this._playedNote) return;
    const n = this._playedNote;
    const g = this._drawNote({ ...n, state: 'played' }, this.playedX);
    g.setAttribute('class', 'note played');
    layer.appendChild(g);
  }

  /** Change a note's visual state without a full re-render (cheap, animatable). */
  setNoteState(id, state) {
    const g = this._noteEls.get(id);
    if (g) g.setAttribute('class', `note state-${state}`);
  }

  // -------------------------------------------------------------------------

  _drawStaffLines(clef, top) {
    const g = el('g', { class: 'staff-lines' });
    for (let i = 0; i <= 4; i++) {
      g.appendChild(el('line', {
        x1: 0.6, y1: top + i, x2: this.widthUnits - 0.6, y2: top + i,
        class: 'staff-line'
      }));
    }
    return g;
  }

  _drawBrace(tops) {
    const g = el('g', { class: 'brace' });
    const y1 = tops.treble, y2 = tops.bass + STAFF_HEIGHT;
    g.appendChild(el('line', { x1: 0.6, y1, x2: 0.6, y2, class: 'barline' }));
    return g;
  }

  _drawClef(clef) {
    const info = CLEF_INFO[clef];
    const glyph = info.glyph;
    const anchorStep = diatonicStep(glyph.anchorPitch.letter, glyph.anchorPitch.octave);
    const y = this._stepY(clef, anchorStep);
    const g = el('g', { class: `clef clef-${clef}`, transform: unitTransform(2.6, y, 1) });

    g.appendChild(el('path', {
      d: glyph.path,
      fill: 'none',
      'stroke-width': glyph.strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'clef-stroke'
    }));

    if (glyph.head) {
      g.appendChild(el('circle', { cx: glyph.head.x, cy: glyph.head.y, r: glyph.head.r, class: 'clef-fill' }));
    }
    if (glyph.dots) {
      for (const [dx, dy] of glyph.dots) {
        g.appendChild(el('circle', { cx: dx, cy: dy, r: glyph.dotRadius, class: 'clef-fill' }));
      }
    }
    return g;
  }

  _drawNote(note, x) {
    const clef = this._clefFor(note.midi, note.clef);
    const spelling = note.spelling || midiToStep(note.midi, note.preferFlats === true);
    const step = diatonicStep(spelling.letter, spelling.octave);
    const y = this._stepY(clef, step);

    const g = el('g', { class: `note state-${note.state || 'target'}` });

    // Ledger lines, drawn before the head so the head sits on top.
    const info = CLEF_INFO[clef];
    const bottomStep = info.bottomLineStep;
    const topStep = bottomStep + 8;
    const ledgerHalf = NOTEHEAD.rx * 1.35;
    if (step > topStep + 1) {
      for (let s = topStep + 2; s <= step; s += 2) {
        const ly = this._stepY(clef, s);
        g.appendChild(el('line', { x1: x - ledgerHalf, y1: ly, x2: x + ledgerHalf, y2: ly, class: 'ledger' }));
      }
    } else if (step < bottomStep - 1) {
      for (let s = bottomStep - 2; s >= step; s -= 2) {
        const ly = this._stepY(clef, s);
        g.appendChild(el('line', { x1: x - ledgerHalf, y1: ly, x2: x + ledgerHalf, y2: ly, class: 'ledger' }));
      }
    }

    // Accidental, if the spelling calls for one.
    const acc = note.accidental !== undefined
      ? note.accidental
      : (spelling.alter > 0 ? 'sharp' : spelling.alter < 0 ? 'flat' : null);
    if (acc) g.appendChild(this._drawAccidental(acc, x - 1.35, y));

    // Notehead.
    g.appendChild(el('ellipse', {
      cx: 0, cy: 0, rx: NOTEHEAD.rx, ry: NOTEHEAD.ry,
      transform: `translate(${x} ${y}) rotate(${NOTEHEAD.rotationDeg})`,
      class: 'notehead'
    }));

    // Stem: up when the note sits below the middle line, down when above.
    // Phase 1 notes are all unbeamed quarter notes.
    if (note.stem !== 'none') {
      const middleStep = bottomStep + 4;
      const stemUp = note.stem ? note.stem === 'up' : step < middleStep;
      const sx = x + (stemUp ? NOTEHEAD.stemOffsetX : -NOTEHEAD.stemOffsetX);
      const sy2 = stemUp ? y - NOTEHEAD.stemLength : y + NOTEHEAD.stemLength;
      g.appendChild(el('line', {
        x1: sx, y1: y, x2: sx, y2: sy2,
        'stroke-width': NOTEHEAD.stemWidth, 'stroke-linecap': 'round',
        class: 'stem'
      }));
    }

    return g;
  }

  _drawAccidental(kind, x, y) {
    const g = el('g', { class: `accidental acc-${kind}`, transform: unitTransform(x, y, 1) });
    const spec = kind === 'sharp' ? SHARP : kind === 'flat' ? FLAT : NATURAL;

    if (kind === 'flat') {
      g.appendChild(el('line', {
        x1: spec.stem.x, y1: spec.stem.y1, x2: spec.stem.x, y2: spec.stem.y2,
        'stroke-width': spec.stemWidth, 'stroke-linecap': 'round', class: 'acc-stroke'
      }));
      g.appendChild(el('path', {
        d: spec.loop, fill: 'none', 'stroke-width': spec.loopWidth,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'acc-stroke'
      }));
      return g;
    }

    for (const v of spec.verticals) {
      g.appendChild(el('line', {
        x1: v.x, y1: v.y1, x2: v.x, y2: v.y2,
        'stroke-width': spec.verticalWidth, 'stroke-linecap': 'round', class: 'acc-stroke'
      }));
    }
    for (const b of spec.bars) {
      g.appendChild(el('line', {
        x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2,
        'stroke-width': spec.barWidth, 'stroke-linecap': 'butt', class: 'acc-stroke'
      }));
    }
    return g;
  }
}
