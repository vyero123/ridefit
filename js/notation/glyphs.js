// glyphs.js — notation glyphs, as SVG paths.
//
// No VexFlow. The accidentals and noteheads here are hand-built from explicit
// control points in units of ONE STAFF SPACE, with the origin at the pitch the
// glyph refers to (the notehead centre). Scaling is therefore just a multiply,
// and any part of them can be animated independently later.
//
// The two CLEFS are the exception: they come from Bravura, the SMuFL reference
// font, under the SIL Open Font Licence. See ./clefs.js and OFL.txt.
//
// Coordinate convention: +x right, +y DOWN, matching SVG.

import {
  TREBLE_CLEF_PATH, TREBLE_CLEF_METRICS,
  BASS_CLEF_PATH, BASS_CLEF_METRICS
} from './clefs.js';

/**
 * Catmull-Rom through the given points, emitted as cubic Béziers.
 * Gives a smooth curve that actually passes through each control point, which
 * makes the glyph definitions below readable and tweakable.
 * @param {[number,number][]} pts
 * @param {boolean} closed
 * @param {number} tension 0 = very loose, 1 = tight
 */
export function smoothPath(pts, closed = false, tension = 1) {
  if (pts.length < 2) return '';
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const k = tension / 6;
  let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C ${fmt(c1[0])} ${fmt(c1[1])}, ${fmt(c2[0])} ${fmt(c2[1])}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  if (closed) d += ' Z';
  return d;
}

const fmt = (n) => (Math.round(n * 1000) / 1000).toString();

/** Scale a path expressed in staff-space units. Returns an SVG transform. */
export function unitTransform(x, y, space) {
  return `translate(${fmt(x)} ${fmt(y)}) scale(${fmt(space)})`;
}

// ---------------------------------------------------------------------------
// Clefs.
//
// These two are NOT hand-drawn. They are the G and F clef outlines from
// Bravura, the SMuFL reference music font, used under the SIL Open Font
// Licence — see js/notation/clefs.js for the attribution and OFL.txt for the
// licence. An earlier version of this file drew both clefs as a single
// constant-width stroke through hand-placed control points; they were legible
// but the proportions were visibly wrong to anyone who reads music, which is
// exactly the kind of thing a reference font exists to get right.
//
// The accidentals and noteheads below remain hand-built, because their shapes
// are simple enough to construct correctly and keeping them parametric is what
// makes them animatable later.
//
// SMuFL puts a clef's origin ON THE LINE THE CLEF NAMES, so placement is
// automatic: translate the path to the G line (or the F line) and the spiral
// centres and the dots straddle exactly where a reader expects them.
// ---------------------------------------------------------------------------

export const TREBLE_CLEF = {
  anchorPitch: { letter: 'G', octave: 4 },
  path: TREBLE_CLEF_PATH,
  filled: true,
  width: TREBLE_CLEF_METRICS.right - TREBLE_CLEF_METRICS.left,
  extentAbove: TREBLE_CLEF_METRICS.above,
  extentBelow: TREBLE_CLEF_METRICS.below
};

export const BASS_CLEF = {
  anchorPitch: { letter: 'F', octave: 3 },
  path: BASS_CLEF_PATH,
  filled: true,
  width: BASS_CLEF_METRICS.right - BASS_CLEF_METRICS.left,
  extentAbove: BASS_CLEF_METRICS.above,
  extentBelow: BASS_CLEF_METRICS.below
};

// ---------------------------------------------------------------------------
// Accidentals. Origin is the notehead centre; the glyph sits to its left.
// ---------------------------------------------------------------------------

/** Sharp: two vertical strokes, two thicker bars rising left-to-right. */
export const SHARP = {
  verticals: [
    { x: -0.20, y1: -0.82, y2: 0.72 },
    { x:  0.20, y1: -0.72, y2: 0.82 }
  ],
  bars: [
    { x1: -0.42, y1: 0.22, x2: 0.42, y2: 0.00 },
    { x1: -0.42, y1: -0.28, x2: 0.42, y2: -0.50 }
  ],
  verticalWidth: 0.09,
  barWidth: 0.26,
  width: 1.0
};

/** Natural: same idea as the sharp but with an offset pair of bars. */
export const NATURAL = {
  verticals: [
    { x: -0.18, y1: -0.85, y2: 0.42 },
    { x:  0.18, y1: -0.42, y2: 0.85 }
  ],
  bars: [
    { x1: -0.18, y1: -0.22, x2: 0.18, y2: -0.38 },
    { x1: -0.18, y1: 0.38,  x2: 0.18, y2: 0.22 }
  ],
  verticalWidth: 0.09,
  barWidth: 0.22,
  width: 0.8
};

/** Flat: a tall stem with a loop hanging off its lower half. */
const FLAT_LOOP = [
  [-0.16, -0.02], [ 0.16, -0.22], [ 0.38, 0.02],
  [ 0.30, 0.34],  [ 0.02, 0.58], [-0.16, 0.66]
];

export const FLAT = {
  stem: { x: -0.16, y1: -1.05, y2: 0.66 },
  stemWidth: 0.10,
  loop: smoothPath(FLAT_LOOP),
  loopWidth: 0.17,
  width: 0.8
};

// ---------------------------------------------------------------------------
// Notehead
// ---------------------------------------------------------------------------
export const NOTEHEAD = {
  rx: 0.66,
  ry: 0.48,
  /** Real noteheads lean; this is what makes a staff look like notation. */
  rotationDeg: -21,
  /** Where a stem attaches, in staff spaces from the notehead centre. */
  stemOffsetX: 0.60,
  stemWidth: 0.13,
  stemLength: 3.4
};
