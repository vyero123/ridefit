// staff.js — SVG staff renderer.
//
// Everything is laid out in STAFF SPACES and put in the viewBox, so the SVG
// scales to any width without recomputing anything and stays crisp on a phone.
//
// Phase 1 draws one target note. The structure is deliberately a list of note
// objects with an x position, so a series of notes, and later a scrolling
// series, is a change of x-assignment rather than a rewrite.

import { midiToStep, diatonicStep } from '../music/pitch.js';
import { SHARP_ORDER, FLAT_ORDER } from '../music/scales.js';
import { TREBLE_CLEF, BASS_CLEF, SHARP, FLAT, NATURAL, NOTEHEAD, unitTransform } from './glyphs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const STAFF_HEIGHT = 4;      // spaces, bottom line to top line
const GRAND_GAP = 7;         // spaces between treble bottom line and bass top line

/** Bottom-line diatonic step for each clef. */
const CLEF_INFO = {
  treble: { glyph: TREBLE_CLEF, bottomLineStep: diatonicStep('E', 4) },  // E4
  bass:   { glyph: BASS_CLEF,   bottomLineStep: diatonicStep('G', 2) }   // G2
};

/**
 * Where each key-signature accidental sits, by clef. These positions are
 * convention, not arithmetic — the F♯ in a treble key signature goes on the
 * top line and the B♭ on the middle line because that is where they have
 * always gone, and a scale with them anywhere else reads as wrong.
 */
const KEY_SIG_STEPS = {
  treble: {
    sharp: { F: diatonicStep('F', 5), C: diatonicStep('C', 5), G: diatonicStep('G', 5),
             D: diatonicStep('D', 5), A: diatonicStep('A', 4), E: diatonicStep('E', 5),
             B: diatonicStep('B', 4) },
    flat:  { B: diatonicStep('B', 4), E: diatonicStep('E', 5), A: diatonicStep('A', 4),
             D: diatonicStep('D', 5), G: diatonicStep('G', 4), C: diatonicStep('C', 5),
             F: diatonicStep('F', 4) }
  },
  bass: {
    sharp: { F: diatonicStep('F', 3), C: diatonicStep('C', 3), G: diatonicStep('G', 3),
             D: diatonicStep('D', 3), A: diatonicStep('A', 2), E: diatonicStep('E', 3),
             B: diatonicStep('B', 2) },
    flat:  { B: diatonicStep('B', 2), E: diatonicStep('E', 3), A: diatonicStep('A', 2),
             D: diatonicStep('D', 3), G: diatonicStep('G', 2), C: diatonicStep('C', 3),
             F: diatonicStep('F', 2) }
  }
};

const KEY_SIG_SPACING = 0.92;   // staff spaces between successive accidentals

const round = (n) => Math.round(n * 1000) / 1000;

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
    this._playedNote = null;
    this._playedLayer = null;
    this._playedAnchorId = null;
    /** id -> { x, topLineY, clef, grand, midi } for every note drawn. */
    this._notePos = new Map();
    this._lastNotePos = null;
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

  /** y of a diatonic step on a staff whose TOP line is at `topLineY`. */
  _stepYAt(clef, topLineY, step) {
    const info = CLEF_INFO[clef];
    const bottomLineY = topLineY + STAFF_HEIGHT;
    return bottomLineY - (step - info.bottomLineStep) * 0.5;
  }

  /** y of a diatonic step within this layout's staff for that clef. */
  _stepY(clef, step) {
    return this._stepYAt(clef, this._staffTops()[clef], step);
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
    this._notePos.clear();
    this._lastNotePos = null;

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
      const x = n.x != null ? n.x : autoX;
      const g = this._drawNote(n, x);
      layer.appendChild(g);
      if (n.id) this._noteEls.set(n.id, g);
      this._recordPos(n, x, null, this._clefFor(n.midi, n.clef));
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
   * Render a sequence of notes as one or more systems (rows of staff).
   *
   * THE MOBILE LAYOUT DECISION
   * --------------------------
   * Two octaves up and down is 29 notes. On a 375 px phone that is roughly
   * 13 px per note if you put them on one line — unreadable, and the ledger
   * lines on a two-octave scale make it worse.
   *
   * The three options were horizontal scroll, a sliding window, and wrapping
   * onto several systems. This wraps, because it is what printed music does
   * and it is the only one of the three that shows the WHOLE exercise at once.
   * A scale is a shape you are trying to learn; seeing where you are inside it,
   * and how much is left, is the point. Horizontal scrolling hides most of the
   * shape and needs scroll-position management that fights the user's own
   * scrolling; a sliding window hides it too and gives no sense of progress.
   *
   * Each system repeats the clef and key signature, as printed music does.
   * Vertical padding is computed once from the actual note range so a scale
   * that never leaves the staff does not get acres of blank space.
   *
   * @param {object} o
   * @param {object[]} o.notes
   * @param {'treble'|'bass'} o.clef
   * @param {number} [o.keySignature] signed fifths
   * @param {number} [o.notesPerSystem]
   */
  renderSequence(o) {
    const notes = o.notes || [];
    const clef = o.clef === 'bass' ? 'bass' : 'treble';
    const fifths = o.keySignature || 0;
    const perSystem = Math.max(2, o.notesPerSystem || 8);

    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this._noteEls.clear();
    this._notePos.clear();
    this._lastNotePos = null;
    this._playedLayer = null;

    const info = CLEF_INFO[clef];
    const bottomStep = info.bottomLineStep;
    const topStep = bottomStep + 8;

    // How far outside the staff do the notes actually go?
    let minStep = bottomStep, maxStep = topStep;
    for (const n of notes) {
      const sp = n.spelling || midiToStep(n.midi, false);
      const s = diatonicStep(sp.letter, sp.octave);
      if (s < minStep) minStep = s;
      if (s > maxStep) maxStep = s;
    }
    // Vertical room: whichever is taller, the notes (plus stems and ledger
    // lines) or the clef itself. A treble clef hangs 1.39 spaces above the top
    // line and 1.63 below the bottom one, so it sets the minimum on its own.
    const glyph = info.glyph;
    const anchorStep = diatonicStep(glyph.anchorPitch.letter, glyph.anchorPitch.octave);
    const anchorFromTop = (topStep - anchorStep) * 0.5;          // spaces below the top line
    const clefAbove = glyph.extentAbove - anchorFromTop;
    const clefBelow = glyph.extentBelow + anchorFromTop - STAFF_HEIGHT;

    // Half a step is half a staff space; add room for the stem and a little air.
    const padAbove = Math.max(1.0, clefAbove + 0.3, (maxStep - topStep) * 0.5 + 2.2);
    const padBelow = Math.max(1.0, clefBelow + 0.3, (bottomStep - minStep) * 0.5 + 2.2);
    const systemHeight = STAFF_HEIGHT + padAbove + padBelow;
    const systemGap = 1.4;

    // Width budget: clef, key signature, then the notes.
    const clefX = 1.0;
    const keySigX = clefX + glyph.width + 0.7;
    const keySigWidth = fifths ? Math.min(7, Math.abs(fifths)) * KEY_SIG_SPACING + 0.5 : 0;
    const firstNoteX = keySigX + keySigWidth + 1.5;
    const noteSpacing = (this.widthUnits - firstNoteX - 1.2) / perSystem;

    const systemCount = Math.max(1, Math.ceil(notes.length / perSystem));
    const totalHeight = systemCount * systemHeight + (systemCount - 1) * systemGap;

    svg.setAttribute('viewBox', `0 0 ${this.widthUnits} ${round(totalHeight)}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const root = el('g', { class: 'staff-root sequence' });
    svg.appendChild(root);

    for (let sys = 0; sys < systemCount; sys++) {
      const topLineY = sys * (systemHeight + systemGap) + padAbove;
      const g = el('g', { class: 'system' });
      root.appendChild(g);

      g.appendChild(this._drawStaffLines(clef, topLineY, 0.6, this.widthUnits - 0.6));
      g.appendChild(this._drawClef(clef, topLineY, clefX));
      const ks = this._drawKeySignature(clef, topLineY, keySigX, fifths);
      if (ks.group) g.appendChild(ks.group);

      const layer = el('g', { class: 'notes' });
      g.appendChild(layer);

      const from = sys * perSystem;
      const to = Math.min(notes.length, from + perSystem);
      for (let i = from; i < to; i++) {
        const n = notes[i];
        const x = firstNoteX + (i - from + 0.5) * noteSpacing;
        const ng = this._drawNote(n, x, topLineY, clef);
        layer.appendChild(ng);
        if (n.id) this._noteEls.set(n.id, ng);
        this._recordPos(n, x, topLineY, clef);
      }
    }

    // The played-note overlay sits above every system so it is never hidden
    // behind a notehead it is meant to be compared with.
    this._playedLayer = el('g', { class: 'played-layer' });
    root.appendChild(this._playedLayer);
    if (this._playedNote) this._paintPlayed();

    this._systemLayout = { clef, perSystem, systemHeight, systemGap, padAbove, firstNoteX, noteSpacing };
    return svg;
  }

  /**
   * Show (or clear) the note currently being heard, IN THE SAME COLUMN as the
   * note it is being compared against, at its own correct vertical position.
   *
   * The vertical offset between the two is the feedback: too low and the mark
   * sits below the target, too high and it sits above, correct and they
   * coincide. That is more informative than any separate readout, so it is
   * worth the small amount of care below to keep both legible where they meet.
   *
   * @param {{midi:number, spelling?:object, accidental?:string}|null} note
   * @param {string|null} anchorId  id of the note whose column to use
   */
  setPlayedNote(note, anchorId = null) {
    this._playedNote = note;
    if (anchorId !== null) this._playedAnchorId = anchorId;
    this._paintPlayed();
  }

  /** How far outside the staff we will draw before clamping, in ledger lines. */
  static get MAX_LEDGERS() { return 4; }

  _paintPlayed() {
    const layer = this._playedLayer;
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!this._playedNote) return;

    const anchor = this._notePos.get(this._playedAnchorId) || this._lastNotePos;
    if (!anchor) return;

    const n = this._playedNote;
    const spelling = n.spelling || midiToStep(n.midi, false);
    const clef = anchor.grand ? this._clefFor(n.midi) : anchor.clef;
    const topLineY = anchor.grand ? this._staffTops()[clef] : anchor.topLineY;

    const info = CLEF_INFO[clef];
    const bottomStep = info.bottomLineStep;
    const topStep = bottomStep + 8;
    const trueStep = diatonicStep(spelling.letter, spelling.octave);

    // Clamp implausibly distant pitches. Twenty ledger lines would wreck the
    // system's vertical layout and tell the reader nothing they cannot get
    // from an arrow: the useful information at that distance is simply
    // "far above" or "far below", and the note name is in the readout anyway.
    // A note ON the Nth ledger line is 2N steps out; the space just beyond it
    // is 2N+1 and still needs only N ledger lines. So the last position we can
    // draw within the budget is 2*MAX+1 steps outside the staff.
    const limit = StaffRenderer.MAX_LEDGERS * 2 + 1;
    let step = trueStep, clamped = null;
    if (trueStep > topStep + limit) { step = topStep + limit; clamped = 'up'; }
    else if (trueStep < bottomStep - limit) { step = bottomStep - limit; clamped = 'down'; }

    const y = this._stepYAt(clef, topLineY, step);
    const x = anchor.x;
    const coincides = !clamped && anchor.midi != null && anchor.midi === n.midi;

    const g = el('g', { class: `note played${coincides ? ' coincides' : ''}${clamped ? ' clamped' : ''}` });

    if (coincides) {
      // Right note. Do not stamp a violet notehead over the target's green
      // one — ring it instead, so the "correct" colour reads at full strength
      // and the violet still says "this is what you are playing".
      g.appendChild(el('ellipse', {
        cx: 0, cy: 0, rx: NOTEHEAD.rx + 0.30, ry: NOTEHEAD.ry + 0.30,
        transform: `translate(${round(x)} ${round(y)}) rotate(${NOTEHEAD.rotationDeg})`,
        fill: 'none', 'stroke-width': 0.17, class: 'played-ring'
      }));
      layer.appendChild(g);
      return;
    }

    // Ledger lines for the played note's own position.
    const ledgerHalf = NOTEHEAD.rx * 1.35;
    const ledger = (s) => el('line', {
      x1: round(x - ledgerHalf), y1: round(this._stepYAt(clef, topLineY, s)),
      x2: round(x + ledgerHalf), y2: round(this._stepYAt(clef, topLineY, s)),
      class: 'ledger'
    });
    if (step > topStep + 1) { for (let s = topStep + 2; s <= step; s += 2) g.appendChild(ledger(s)); }
    else if (step < bottomStep - 1) { for (let s = bottomStep - 2; s >= step; s -= 2) g.appendChild(ledger(s)); }

    const acc = n.accidental !== undefined
      ? n.accidental
      : (spelling.alter > 0 ? 'sharp' : spelling.alter < 0 ? 'flat' : null);
    if (acc) g.appendChild(this._drawAccidental(acc, x - 1.45, y));

    // A halo underneath keeps the violet readable when it sits a step or two
    // from the target and the two noteheads nearly touch.
    for (const cls of ['notehead-halo', 'notehead']) {
      g.appendChild(el('ellipse', {
        cx: 0, cy: 0, rx: NOTEHEAD.rx, ry: NOTEHEAD.ry,
        transform: `translate(${round(x)} ${round(y)}) rotate(${NOTEHEAD.rotationDeg})`,
        class: cls
      }));
    }
    // Deliberately no stem: this is an overlay marker sharing a column with a
    // real note, and two stems in one column read as a chord.

    if (clamped) {
      const dir = clamped === 'up' ? -1 : 1;
      const tipY = y + dir * 1.15;
      const baseY = y + dir * 0.55;
      g.appendChild(el('path', {
        d: `M ${round(x)} ${round(tipY)} L ${round(x - 0.42)} ${round(baseY)} L ${round(x + 0.42)} ${round(baseY)} Z`,
        class: 'played-arrow'
      }));
    }

    layer.appendChild(g);
  }

  _recordPos(n, x, topLineY, clef) {
    const pos = { x, topLineY, clef, grand: this.clef === 'grand' && topLineY === null, midi: n.midi };
    if (n.id) this._notePos.set(n.id, pos);
    this._lastNotePos = pos;
  }

  /** Change a note's visual state without a full re-render (cheap, animatable). */
  setNoteState(id, state) {
    const g = this._noteEls.get(id);
    if (g) g.setAttribute('class', `note state-${state}`);
  }

  // -------------------------------------------------------------------------

  _drawStaffLines(clef, top, x0 = 0.6, x1 = this.widthUnits - 0.6) {
    const g = el('g', { class: 'staff-lines' });
    for (let i = 0; i <= 4; i++) {
      g.appendChild(el('line', { x1: x0, y1: top + i, x2: x1, y2: top + i, class: 'staff-line' }));
    }
    return g;
  }

  /**
   * Draw the key signature and report how wide it was.
   * @returns {{group: SVGGElement|null, width: number}}
   */
  _drawKeySignature(clef, topLineY, x, fifths) {
    if (!fifths) return { group: null, width: 0 };
    const kind = fifths > 0 ? 'sharp' : 'flat';
    const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
    const count = Math.min(7, Math.abs(fifths));
    const steps = KEY_SIG_STEPS[clef][kind];

    const g = el('g', { class: `key-signature key-${kind}` });
    for (let i = 0; i < count; i++) {
      const letter = order[i];
      const y = this._stepYAt(clef, topLineY, steps[letter]);
      g.appendChild(this._drawAccidental(kind, x + i * KEY_SIG_SPACING, y));
    }
    return { group: g, width: count * KEY_SIG_SPACING + 0.5 };
  }

  _drawBrace(tops) {
    const g = el('g', { class: 'brace' });
    const y1 = tops.treble, y2 = tops.bass + STAFF_HEIGHT;
    g.appendChild(el('line', { x1: 0.6, y1, x2: 0.6, y2, class: 'barline' }));
    return g;
  }

  _drawClef(clef, topLineY = null, x = 1.0) {
    const info = CLEF_INFO[clef];
    const glyph = info.glyph;
    const anchorStep = diatonicStep(glyph.anchorPitch.letter, glyph.anchorPitch.octave);
    const y = topLineY == null ? this._stepY(clef, anchorStep) : this._stepYAt(clef, topLineY, anchorStep);
    const g = el('g', { class: `clef clef-${clef}`, transform: unitTransform(x, y, 1) });

    // The clef outline is a filled shape with counters (the holes in the G
    // clef's spiral and loop), so it needs the nonzero fill rule the font
    // outlines were drawn for — which is the SVG default, stated here anyway
    // because getting it wrong fills the holes in.
    g.appendChild(el('path', {
      d: glyph.path,
      'fill-rule': 'nonzero',
      class: 'clef-fill'
    }));
    return g;
  }

  _drawNote(note, x, topLineY = null, forceClef = null) {
    const clef = forceClef || this._clefFor(note.midi, note.clef);
    const spelling = note.spelling || midiToStep(note.midi, note.preferFlats === true);
    const step = diatonicStep(spelling.letter, spelling.octave);
    const y = topLineY == null ? this._stepY(clef, step) : this._stepYAt(clef, topLineY, step);

    const g = el('g', { class: `note state-${note.state || 'target'}` });

    // Ledger lines, drawn before the head so the head sits on top.
    const info = CLEF_INFO[clef];
    const bottomStep = info.bottomLineStep;
    const topStep = bottomStep + 8;
    const ledgerHalf = NOTEHEAD.rx * 1.35;
    const ledgerY = (s) => (topLineY == null ? this._stepY(clef, s) : this._stepYAt(clef, topLineY, s));
    if (step > topStep + 1) {
      for (let s = topStep + 2; s <= step; s += 2) {
        const ly = ledgerY(s);
        g.appendChild(el('line', { x1: x - ledgerHalf, y1: ly, x2: x + ledgerHalf, y2: ly, class: 'ledger' }));
      }
    } else if (step < bottomStep - 1) {
      for (let s = bottomStep - 2; s >= step; s -= 2) {
        const ly = ledgerY(s);
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
