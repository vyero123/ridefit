// glyphs.js — hand-built notation glyphs, drawn as SVG paths.
//
// No VexFlow and no music font. Every glyph here is constructed from explicit
// control points in units of ONE STAFF SPACE, with the origin at the pitch the
// glyph refers to (the G line for the treble clef, the F line for the bass
// clef, the notehead centre for accidentals). Scaling is therefore just a
// multiply, and any part of a glyph can be animated independently later, which
// is the entire reason for not using a font.
//
// Coordinate convention: +x right, +y DOWN, matching SVG.

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
// Treble (G) clef
//
// One continuous stroke, traced from the tail at the bottom, up the stem, into
// the curl at the top, back down crossing the stem, around the big loop, and
// spiralling inward to finish exactly on the origin — which is the G line.
// The double crossing of the stem is what gives a G clef its characteristic
// shape, so the points below deliberately pass from one side of the stem to
// the other twice.
// ---------------------------------------------------------------------------
const TREBLE_POINTS = [
  [-0.62, 1.92], [-0.12, 2.02], [ 0.24, 1.72],   // tail curl
  [ 0.28, 1.15], [ 0.26, 0.30], [ 0.22, -0.80],  // stem
  [ 0.18, -1.95], [ 0.14, -2.95], [ 0.06, -3.62],
  [-0.26, -3.96], [-0.58, -3.66], [-0.62, -3.10], // top curl
  [-0.42, -2.52], [-0.12, -2.06],                 // first crossing of the stem
  [ 0.34, -1.62], [ 0.68, -1.08], [ 0.80, -0.40],
  [ 0.64, 0.24],  [ 0.18, 0.60],                  // second crossing
  [-0.42, 0.62],  [-0.84, 0.22], [-0.92, -0.40],
  [-0.62, -0.90], [-0.08, -0.94],                 // big left bulge closing
  [ 0.34, -0.60], [ 0.42, -0.12], [ 0.18, 0.20],  // spiral
  [-0.12, 0.10],  [-0.09, -0.11], [ 0.02, -0.14]
];

export const TREBLE_CLEF = {
  /** Vertical origin: the note the clef names. */
  anchorPitch: { letter: 'G', octave: 4 },
  path: smoothPath(TREBLE_POINTS),
  strokeWidth: 0.21,
  extentAbove: 4.2,
  extentBelow: 2.3
};

// ---------------------------------------------------------------------------
// Bass (F) clef — the comma stroke plus the two dots that straddle the F line.
// ---------------------------------------------------------------------------
const BASS_POINTS = [
  [-0.80, 0.30], [-0.76, -0.18], [-0.40, -0.60],
  [ 0.14, -0.74], [ 0.60, -0.46], [ 0.74, 0.10],
  [ 0.72, 0.74], [ 0.44, 1.46], [-0.04, 2.06],
  [-0.66, 2.52]
];

export const BASS_CLEF = {
  anchorPitch: { letter: 'F', octave: 3 },
  path: smoothPath(BASS_POINTS),
  strokeWidth: 0.34,
  /** Dot centres, in staff spaces from the F line. */
  dots: [[1.12, -0.5], [1.12, 0.5]],
  dotRadius: 0.13,
  /** The thick starting blob that a real F clef has. */
  head: { x: -0.80, y: 0.30, r: 0.20 },
  extentAbove: 1.0,
  extentBelow: 2.8
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
