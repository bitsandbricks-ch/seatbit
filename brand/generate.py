import sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTS = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# Palette
INK = "#0B0B0F"; SURFACE="#16161D"; LINE="#2A2A35"; TEXT="#F4F4F5"; MUTED="#A1A1AA"
GREEN = "#2EE59D"; GREEN_DEEP = "#0E9F6E"; LIGHT_BG = "#FAFAFA"; LIGHT_TEXT = "#0B0B0F"

# Mark: 3x3 seat grid; lit cells draw a side-view chair ("a seat made of bits")
LIT = [(0,0),(0,1),(0,2),(1,1),(2,1),(2,2)]
DIM = [(1,0),(2,0),(1,2)]
def cells(ox, oy, s, g, r, which, fill, extra=""):
    out=[]
    for c,rw in which:
        out.append(f'<rect x="{ox+c*(s+g):g}" y="{oy+rw*(s+g):g}" width="{s:g}" height="{s:g}" rx="{r:g}" fill="{fill}"{extra}/>')
    return "\n  ".join(out)

def mark(ox, oy, size, lit=GREEN, dim=None, dim_stroke=None):
    # size = full grid width; cell:gap = 4:1
    s = size/ (3*4+2) * 4; g = s/4; r = s*0.22
    parts=[cells(ox,oy,s,g,r,LIT,lit)]
    if dim:
        parts.append(cells(ox,oy,s,g,r,DIM,dim))
    return "\n  ".join(parts)

def svg(w,h,body,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" role="img" aria-label="{title}">\n  <title>{title}</title>\n  {body}\n</svg>\n'

# Wordmark text to paths
font = TTFont(f"{FONTS}/geist-sans/Geist-Bold.ttf")
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
hmtx = font["hmtx"]
CAP = font["OS/2"].sCapHeight; XH = font["OS/2"].sxHeight; ASC = font["hhea"].ascent
def text_paths(txt, x, baseline, px, tracking=-0.025):
    sc = px/upm; out=[]; cx=x
    for ch in txt:
        gn = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (sc,0,0,-sc,cx,baseline))
        gs[gn].draw(tp)
        out.append(pen.getCommands())
        cx += hmtx[gn][0]*sc + tracking*px
    return out, cx - tracking*px
def word(x, baseline, px, c1, c2):
    a, x2 = text_paths("seat", x, baseline, px)
    b, x3 = text_paths("bit", x2 + (-0.025*px), baseline, px)
    return (f'<path fill="{c1}" d="{" ".join(a)}"/>\n  <path fill="{c2}" d="{" ".join(b)}"/>', x3)

files = {}
# 1. Mark on dark (dim cells visible) / on light
files["seatbit-mark.svg"] = svg(56,56, mark(0,0,56, GREEN, "#3F3F46"), "Seatbit")
files["seatbit-mark-light.svg"] = svg(56,56, mark(0,0,56, GREEN_DEEP, "#D4D4D8"), "Seatbit")
files["seatbit-mark-mono.svg"] = svg(56,56, mark(0,0,56, "currentColor"), "Seatbit")

# 2. App icon / favicon: dark rounded tile
def app_icon(n=64, radius=0.22):
    pad = n*0.2; inner = n-2*pad
    return svg(n,n, f'<rect width="{n}" height="{n}" rx="{n*radius:g}" fill="{INK}"/>\n  ' + mark(pad,pad,inner,GREEN,"#34343F"), "Seatbit")
files["seatbit-icon.svg"] = app_icon(64)
# favicon: tighter padding, no dim cells for legibility at 16px
n=32; pad=3; files["favicon.svg"] = svg(n,n, f'<rect width="{n}" height="{n}" rx="7" fill="{INK}"/>\n  ' + mark(pad,pad,n-2*pad,GREEN), "Seatbit")

# 3. Wordmark + horizontal lockup
PX=48
def lockup(textc, accent, dimc, bg=None):
    H=64; m = mark(0,4,56, accent, dimc)
    baseline = 32 + (XH/upm*PX)/2  # center x-height on mark
    w, end = word(56+16, baseline, PX, textc, accent)
    W = end + 2
    body = (f'<rect width="{W:g}" height="{H}" fill="{bg}"/>\n  ' if bg else "") + m + "\n  " + w
    return svg(round(W,1), H, body, "Seatbit")
files["seatbit-logo.svg"] = lockup(TEXT, GREEN, "#3F3F46")
files["seatbit-logo-light.svg"] = lockup(LIGHT_TEXT, GREEN_DEEP, "#D4D4D8")
w, end = word(0, 36, PX, TEXT, GREEN); files["seatbit-wordmark.svg"] = svg(round(end+1,1), 48, w, "Seatbit")
w, end = word(0, 36, PX, LIGHT_TEXT, GREEN_DEEP); files["seatbit-wordmark-light.svg"] = svg(round(end+1,1), 48, w, "Seatbit")
w, end = word(0, 36, PX, "currentColor", "currentColor"); files["seatbit-wordmark-mono.svg"] = svg(round(end+1,1), 48, w, "Seatbit")

# 4. OG image 1200x630
fontM = TTFont(f"{FONTS}/geist-sans/Geist-Medium.ttf")
def tag_paths(txt, x, baseline, px):
    gsm=fontM.getGlyphSet(); cm=fontM.getBestCmap(); hm=fontM["hmtx"]; sc=px/upm; out=[]; cx=x
    for ch in txt:
        gn=cm[ord(ch)]; pen=SVGPathPen(gsm); gsm[gn].draw(TransformPen(pen,(sc,0,0,-sc,cx,baseline))); out.append(pen.getCommands()); cx+=hm[gn][0]*sc
    return out, cx
TAG="Seats, nicks and attendance for your LAN party."
_, wend = word(0, 0, 140, TEXT, GREEN); _, tend = tag_paths(TAG, 0, 0, 30)
gw = 190 + 48 + max(wend, tend); ox = (1200-gw)/2
mk = mark(ox, 220, 190, GREEN, "#34343F")
wm, _ = word(ox+238, 340, 140, TEXT, GREEN)
tag, _ = tag_paths(TAG, ox+242, 400, 30)
grid = "".join(f'<rect x="{x}" y="{y}" width="34" height="34" rx="7" fill="#14141B"/>' for x in range(-20,1240,44) for y in range(-20,660,44))
og = svg(1200,630, f'<rect width="1200" height="630" fill="{INK}"/>{grid}<rect x="{ox-60:g}" y="160" width="{gw+120:g}" height="310" rx="40" fill="{INK}"/>\n  {mk}\n  {wm}\n  <path fill="{MUTED}" d="{" ".join(tag)}"/>', "Seatbit")
files["og-image.svg"] = og

for k,v in files.items():
    open(f"{OUT}/{k}","w").write(v)
print("\n".join(files))
