# يولّد أيقونة التطبيق وشاشة البداية (خوذة عمل + علامة صح) — يحتاج Pillow.
from PIL import Image, ImageDraw
S = 4  # تكبير للنعومة
G1, G2, GOLD, GOLD2, WHITE = (20, 83, 45), (15, 61, 33), (244, 180, 0), (214, 150, 0), (255, 255, 255)

def gradient(size):
    im = Image.new("RGB", (size, size))
    px = im.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(G1[i] + (G2[i] - G1[i]) * t) for i in range(3))
        for x in range(size): px[x, y] = c
    return im

def helmet(size=1024, shift=-10):
    n = size * S; k = n / 1024
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    def B(*v): return [v[0] * k, (v[1] + shift) * k, v[2] * k, (v[3] + shift) * k]
    d.pieslice(B(272, 300, 752, 780), 180, 360, fill=GOLD)            # القبة
    d.rounded_rectangle(B(222, 530, 802, 604), radius=37 * k, fill=GOLD)   # الحافة
    d.rounded_rectangle(B(222, 585, 802, 604), radius=9 * k, fill=GOLD2)   # ظل الحافة
    d.rounded_rectangle(B(474, 300, 550, 545), radius=30 * k, fill=GOLD2)  # الحزام الأوسط
    # علامة صح داخل دائرة بيضاء
    cx, cy, r = 700, 745, 112
    d.ellipse(B(cx - r - 14, cy - r - 14, cx + r + 14, cy + r + 14), fill=G1)
    d.ellipse(B(cx - r, cy - r, cx + r, cy + r), fill=WHITE)
    pts = [(cx - 56, cy + 2), (cx - 14, cy + 46), (cx + 62, cy - 44)]
    d.line([(p[0] * k, (p[1] + shift) * k) for p in pts], fill=G1, width=int(30 * k), joint="curve")
    for p in (pts[0], pts[2]):
        d.ellipse([(p[0] - 15) * k, (p[1] + shift - 15) * k, (p[0] + 15) * k, (p[1] + shift + 15) * k], fill=G1)
    return im.resize((size, size), Image.LANCZOS)

fg = helmet()
bg = gradient(1024)
icon = bg.convert("RGBA"); icon.alpha_composite(fg)
icon.convert("RGB").save("assets/icon-only.png")
fg.save("assets/icon-foreground.png")
bg.save("assets/icon-background.png")
sp = gradient(2732).convert("RGBA")
h = helmet(1024).resize((800, 800), Image.LANCZOS)
sp.alpha_composite(h, ((2732 - 800) // 2, (2732 - 800) // 2))
sp.convert("RGB").save("assets/splash.png"); sp.convert("RGB").save("assets/splash-dark.png")
print("ok")
