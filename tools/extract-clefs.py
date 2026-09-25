#!/usr/bin/env python3
"""Regenerate js/notation/clefs.js from the Bravura music font.

Bravura is the SMuFL reference font, published by Steinberg under the SIL Open
Font License 1.1. We take two glyphs from it — the G clef and the F clef — and
emit their outlines as SVG path data, already scaled into staff spaces and
positioned so that the path origin sits exactly on the line the clef names.

Usage:
    git clone --depth 1 https://github.com/steinbergmedia/bravura.git
    pip install fonttools
    python3 tools/extract-clefs.py bravura/redist/otf/Bravura.otf

Why extract rather than ship the font: we need two glyphs, and a font file is
~100 kB plus a webfont load before anything can be drawn. Two path strings are
about 3 kB, need no loading, and scale with the rest of the notation because
they are in the same staff-space coordinate system as everything else.

SMuFL conventions this relies on:
  * One staff space is 0.25 em, so a 1000 upm font has 250 units per space.
  * A clef's registration point (the glyph origin) is horizontally at its left
    edge and VERTICALLY ON THE LINE THE CLEF NAMES — the G line for a G clef,
    the F line for an F clef. That is what makes the placement automatically
    correct: draw the path with its origin on that line and the spiral centres
    and the dots straddle exactly where they should.
"""

import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

GLYPHS = [
    ('TREBLE_CLEF_PATH', 'gClef', 0xE050, 'G', 4),
    ('BASS_CLEF_PATH',   'fClef', 0xE062, 'F', 3),
]


def fmt(v):
    return f"{v:.3f}".rstrip('0').rstrip('.') or "0"


def main(font_path, out_path='js/notation/clefs.js'):
    font = TTFont(font_path)
    upm = font['head'].unitsPerEm
    space = upm / 4.0            # SMuFL: one staff space = 0.25 em
    cmap = font.getBestCmap()
    glyphset = font.getGlyphSet()

    entries = []
    for const, smufl, cp, letter, octave in GLYPHS:
        glyph = glyphset[cmap[cp]]

        bounds = BoundsPen(glyphset)
        glyph.draw(bounds)
        x0, y0, x1, y1 = bounds.bounds

        pen = SVGPathPen(glyphset, ntos=fmt)
        # Font units are y-up, SVG is y-down: scale into staff spaces and flip.
        glyph.draw(TransformPen(pen, Transform(1 / space, 0, 0, -1 / space, 0, 0)))

        entries.append({
            'const': const, 'smufl': smufl, 'cp': cp,
            'letter': letter, 'octave': octave,
            'path': pen.getCommands(),
            'left': x0 / space, 'right': x1 / space,
            'above': y1 / space, 'below': -y0 / space,
        })

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(header(font_path))
        for e in entries:
            f.write(
                f"\n/**\n"
                f" * SMuFL {e['smufl']} (U+{e['cp']:04X}).\n"
                f" * Origin sits on the {e['letter']}{e['octave']} line. Extent in staff spaces:\n"
                f" *   x {e['left']:.3f} … {e['right']:.3f}   (width {e['right'] - e['left']:.3f})\n"
                f" *   {e['above']:.3f} above the line, {e['below']:.3f} below it.\n"
                f" */\n"
                f"export const {e['const']} = '{e['path']}';\n"
                f"export const {e['const'].replace('_PATH', '_METRICS')} = "
                f"{{ left: {e['left']:.3f}, right: {e['right']:.3f}, "
                f"above: {e['above']:.3f}, below: {e['below']:.3f} }};\n"
            )
    print(f"wrote {out_path}")
    for e in entries:
        print(f"  {e['smufl']}: width {e['right'] - e['left']:.3f}, "
              f"+{e['above']:.3f}/-{e['below']:.3f} spaces, {len(e['path'])} chars")


def header(font_path):
    return f'''// clefs.js — GENERATED FILE, do not edit by hand.
//
// Regenerate with:  python3 tools/extract-clefs.py path/to/Bravura.otf
//
// ---------------------------------------------------------------------------
// These two outlines are derived from BRAVURA, the SMuFL reference music font
// by Steinberg Media Technologies GmbH, used under the SIL Open Font License
// version 1.1. The full licence text is in OFL.txt at the root of this repo.
//
//   Copyright (c) 2015-2021 Steinberg Media Technologies GmbH
//   Bravura is licensed under the SIL OFL 1.1.
//   https://github.com/steinbergmedia/bravura
//
// The OFL's Reserved Font Name clause applies to fonts, and nothing here is
// distributed as a font or under the name Bravura; these are two glyph
// outlines embedded as SVG path data in an application. The licence and
// copyright notice travel with them, as the OFL requires.
// ---------------------------------------------------------------------------
//
// Coordinates are in STAFF SPACES, y increasing downward (SVG convention),
// with the origin ON THE LINE THE CLEF NAMES. Draw the path translated to that
// line's y and it is correctly placed by construction — the G clef's spiral
// centres on the G line and the F clef's dots straddle the F line, because
// that is what the font's own registration point guarantees.
//
// Source font: {font_path}
'''


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'bravura/redist/otf/Bravura.otf',
         sys.argv[2] if len(sys.argv) > 2 else 'js/notation/clefs.js')
