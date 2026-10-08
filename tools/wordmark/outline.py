"""Outlines "effortless" in Outfit at the website's weight, as one SVG path at font-size 100, for hooks/wordmark.ts.

The site (site/index.html, h1 .word) sets the word in Outfit 500 with letter-spacing -.025em. The app draws an Svg as
an image, where no web font loads, so the letters go in as outlines.

    py tools/wordmark/outline.py path/to/Outfit[wght].ttf

prints the bounds and the path; hooks/wordmark.ts holds them with the line metrics (baseline, ascent, descent).
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

WORD, WEIGHT, SIZE, TRACK = 'effortless', 500, 100, -0.025

font = instancer.instantiateVariableFont(TTFont(sys.argv[1]), {'wght': WEIGHT})
upm = font['head'].unitsPerEm
k = SIZE / upm
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
names = [cmap[ord(c)] for c in WORD]

# Pair kerning from GPOS, where the font has it (format 1 pairs and format 2 classes).
def kern(a, b):
    if 'GPOS' not in font:
        return 0
    total = 0
    for lookup in font['GPOS'].table.LookupList.Lookup:
        if lookup.LookupType not in (2, 9):
            continue
        for sub in lookup.SubTable:
            st = sub.ExtSubTable if lookup.LookupType == 9 else sub
            if getattr(st, 'LookupType', 2) != 2 or a not in st.Coverage.glyphs:
                continue
            if st.Format == 1:
                ps = st.PairSet[st.Coverage.glyphs.index(a)]
                for rec in ps.PairValueRecord:
                    if rec.SecondGlyph == b and rec.Value1 and getattr(rec.Value1, 'XAdvance', 0):
                        return rec.Value1.XAdvance
            else:
                c1 = st.ClassDef1.classDefs.get(a, 0)
                c2 = st.ClassDef2.classDefs.get(b, 0)
                v = st.Class1Record[c1].Class2Record[c2].Value1
                if v and getattr(v, 'XAdvance', 0):
                    return v.XAdvance
    return total

pen = SVGPathPen(glyphs)
bounds = BoundsPen(glyphs)
x = 0.0
for i, n in enumerate(names):
    # Font units grow upward; SVG grows down: flip about the baseline, scaled to font-size 100.
    t = (k, 0, 0, -k, x, 0)
    glyphs[n].draw(TransformPen(pen, t))
    glyphs[n].draw(TransformPen(bounds, t))
    x += glyphs[n].width * k + TRACK * SIZE
    if i + 1 < len(names):
        x += kern(n, names[i + 1]) * k
x0, y0, x1, y1 = bounds.bounds
print(f'// bounds {x0:.1f} {y0:.1f} {x1:.1f} {y1:.1f}')
print(pen.getCommands())
