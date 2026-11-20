"""
Squeak: gera os arquivos da logo a partir da arte original (tools/brand/squeak-logo-source.png).

    python tools/brand-assets.py

Saídas em public/:
  brand/squeak-logo.png / .webp        1024px, recortada, fundo transparente (hero, imprensa)
  brand/squeak-logo-256.webp           cabeçalho e lugares pequenos
  brand/squeak-glasses-mask.png        máscara só dos óculos (o brilho que passa pelas lentes)
  favicon.png (64) · favicon-32.png · apple-touch-icon.png (180, com fundo)
Só usa Pillow.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'brand' / 'squeak-logo-source.png'
OUT = ROOT / 'public'
BG = (15, 20, 32, 255)  # --bg do tema escuro

im = Image.open(SRC).convert('RGBA')

# limpa a poeira semitransparente em volta e recorta justo, com 2% de respiro
r, g, b, a = im.split()
a = a.point(lambda v: 0 if v < 24 else v)
im = Image.merge('RGBA', (r, g, b, a))
x0, y0, x1, y1 = a.point(lambda v: 255 if v > 0 else 0).getbbox()
pad = round(max(x1 - x0, y1 - y0) * 0.02)
im = im.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
w, h = im.size

# máscara dos óculos: pixels pretos opacos + os quadradinhos brancos, só na faixa dos óculos
mask = Image.new('L', (w, h), 0)
src, mk = im.load(), mask.load()
for y in range(h):
    for x in range(w):
        R, G, B, A = src[x, y]
        if A < 200:
            continue
        lum = 0.299 * R + 0.587 * G + 0.114 * B
        sat = max(R, G, B) - min(R, G, B)
        if lum < 70 or (lum > 215 and sat < 30):
            mk[x, y] = 255
# só a faixa dos óculos: a maior região contígua em linhas (descarta pretos soltos)
rows = [y for y in range(h) if sum(1 for x in range(0, w, 4) if mk[x, y]) > 6]
if rows:
    gy0, gy1 = min(rows), max(rows)
    for y in range(h):
        if not gy0 <= y <= gy1:
            for x in range(w):
                mk[x, y] = 0


def fit(img, side, resample=Image.LANCZOS):
    k = side / max(img.size)
    return img.resize((round(img.size[0] * k), round(img.size[1] * k)), resample)


def square(img, side, inset=0.0, bg=(0, 0, 0, 0)):
    canvas = Image.new('RGBA', (side, side), bg)
    inner = fit(img, round(side * (1 - 2 * inset)))
    canvas.alpha_composite(inner, ((side - inner.size[0]) // 2, (side - inner.size[1]) // 2))
    return canvas


(OUT / 'brand').mkdir(parents=True, exist_ok=True)
big = fit(im, 1024)
big.save(OUT / 'brand' / 'squeak-logo.png', optimize=True)
big.save(OUT / 'brand' / 'squeak-logo.webp', quality=90, method=6)
fit(im, 256).save(OUT / 'brand' / 'squeak-logo-256.webp', quality=92, method=6)
square(im, 64).save(OUT / 'favicon.png', optimize=True)
square(im, 32).save(OUT / 'favicon-32.png', optimize=True)
square(im, 180, inset=0.1, bg=BG).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)
print('logo', big.size, '| óculos y', gy0, gy1, 'de', h)


# ───────────────────────────────────────────────────────────────────────────────
# Camadas para a animação (óculos sobem, pato pisca): pato sem óculos + óculos soltos.
#   brand/squeak-duck.webp / -256.webp       pato com a cabeça reconstruída onde ficavam os óculos
#   brand/squeak-glasses.webp / -256.webp    só os óculos, mesmo enquadramento
# ───────────────────────────────────────────────────────────────────────────────
from PIL import ImageFilter, ImageChops

W, H = big.size
bp = big.load()
gm = Image.new('L', (W, H), 0)
gp = gm.load()
band = (round(gy0 * H / h) - 4, round(gy1 * H / h) + 4)
for y in range(max(0, band[0]), min(H, band[1])):
    for x in range(W):
        R, G, B, A = bp[x, y]
        if A < 200:
            continue
        lum = 0.299 * R + 0.587 * G + 0.114 * B
        if lum < 70 or (lum > 215 and max(R, G, B) - min(R, G, B) < 30):
            gp[x, y] = 255
gm = gm.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))  # tira pontinhos soltos
gm = gm.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))  # fecha furinhos
gp = gm.load()

# óculos soltos: preto/branco puros, borda suavizada
glasses = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gl = glasses.load()
soft = gm.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.7)).load()
for y in range(H):
    for x in range(W):
        a = soft[x, y]
        if a:
            R, G, B, _ = bp[x, y]
            white = gp[x, y] and (0.299 * R + 0.587 * G + 0.114 * B) > 128
            gl[x, y] = (255, 255, 255, a) if white else (12, 12, 14, a)

# buraco a reconstruir: os óculos + a sombra laranja em volta deles
hole = gm.filter(ImageFilter.MaxFilter(43))
dp = gm.filter(ImageFilter.MaxFilter(53)).load()  # zona de dúvida para achar a borda da cabeça
# o bico encosta nos óculos: ele fica de fora do buraco
beak = Image.new('L', (W, H), 0)
kp = beak.load()
for y in range(H):
    for x in range(W):
        R, G, B, A = bp[x, y]
        if A > 200 and R > 170 and G < 125:
            kp[x, y] = 255
beak = beak.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(9))
hole = ImageChops.subtract(hole, beak)
hp = hole.load()
alpha = big.getchannel('A')
ap = alpha.load()

# silhueta da cabeça nas linhas em que os óculos cobrem (ou passam d)a borda: interpola a borda
def edges(side):
    known = {}
    for y in range(H):
        xs = range(W) if side == 'L' else range(W - 1, -1, -1)
        run = 0
        for x in xs:  # borda = começo de um trecho opaco de verdade (ignora poeira solta)
            run = run + 1 if ap[x, y] > 128 else 0
            if run == 24:
                x0 = x - 23 if side == 'L' else x + 23
                if not any(dp[min(W - 1, max(0, x0 + d)), y] for d in (0, 8, -8, 16, -16, 23, -23)):
                    known[y] = x0
                break
    out = dict(known)
    ys = sorted(known)
    def slope(y0, step):  # inclinação da borda fora do trecho coberto
        y1 = y0 + step * 14
        return (known[y1] - known[y0]) / (y1 - y0) if y1 in known else 0.0
    for a, b in zip(ys, ys[1:]):
        if b - a < 2:
            continue
        n, ma, mb = b - a, slope(a, -1), slope(b, 1)
        for y in range(a + 1, b):  # Hermite cúbica: continua a curva da cabeça
            t = (y - a) / n
            h00, h10, h01, h11 = 2*t**3 - 3*t**2 + 1, t**3 - 2*t**2 + t, -2*t**3 + 3*t**2, t**3 - t**2
            out[y] = h00 * known[a] + h10 * n * ma + h01 * known[b] + h11 * n * mb
    return out

eL, eR = edges('L'), edges('R')
sil = Image.new('L', (W, H), 0)
sp = sil.load()
for y in range(H):
    if y in eL and y in eR:
        for x in range(max(0, round(eL[y])), min(W, round(eR[y]) + 1)):
            sp[x, y] = 255
sil = sil.filter(ImageFilter.GaussianBlur(1.0))
sp = sil.load()

# cor: difusão em baixa resolução (a cabeça é um degradê liso), sem deixar o bico vazar
K = 6
w2, h2 = W // K, H // K
small = big.convert('RGB').resize((w2, h2), Image.BOX).load()
hole_s = hole.resize((w2, h2), Image.BOX).load()
sil_s = sil.resize((w2, h2), Image.BOX).load()
a_s = alpha.resize((w2, h2), Image.BOX).load()
val, fixed, inside = {}, set(), set()
for y in range(h2):
    for x in range(w2):
        if hole_s[x, y] > 0:
            if sil_s[x, y] > 40:
                inside.add((x, y))
                val[(x, y)] = [250.0, 205.0, 30.0]
        elif a_s[x, y] > 250:
            R, G, B = small[x, y]
            if G > 135:  # ignora bico (laranja-avermelhado) como fonte de cor
                fixed.add((x, y))
                val[(x, y)] = [float(R), float(G), float(B)]
order = sorted(inside)
for it in range(500):
    for (x, y) in (order if it % 2 == 0 else reversed(order)):
        acc, n = [0.0, 0.0, 0.0], 0
        for q in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            v = val.get(q)
            if v is not None:
                acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]; n += 1
        if n:
            cur = val[(x, y)]
            for c in range(3):
                cur[c] += 1.7 * (acc[c] / n - cur[c])
fill_s = Image.new('RGB', (w2, h2))
fs = fill_s.load()
for y in range(h2):
    for x in range(w2):
        v = val.get((x, y))
        if v is None:  # fora de tudo: copia o vizinho preenchido mais próximo na linha (evita halo no upscale)
            v = next((val[(x + d, y)] for d in (1, -1, 2, -2, 3, -3) if (x + d, y) in val), (250, 205, 30))
        fs[x, y] = tuple(max(0, min(255, round(c))) for c in v)
fill = fill_s.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))

duck = big.copy()
blend = hole.filter(ImageFilter.GaussianBlur(3))
duck.paste(fill, (0, 0), blend)
# contorno laranja na borda reconstruída (só onde os óculos cobriam a borda)
hard = sil.point(lambda v: 255 if v > 128 else 0)
rim = ImageChops.subtract(hard, hard.filter(ImageFilter.MinFilter(23))).filter(ImageFilter.GaussianBlur(2.2))
rim = ImageChops.multiply(rim, hole)
duck.paste((247, 152, 8, 255), (0, 0), rim)
# alfa: dentro do buraco vale a silhueta reconstruída
new_a = Image.composite(sil, alpha, hole)
duck.putalpha(new_a)

for img, name in ((duck, 'squeak-duck'), (glasses, 'squeak-glasses')):
    img.save(OUT / 'brand' / f'{name}.webp', quality=90, method=6)
    fit(img, 256).save(OUT / 'brand' / f'{name}-256.webp', quality=92, method=6)
print('camadas ok', (W, H))


# ───────────────────────────────────────────────────────────────────────────────
# Pato de corpo inteiro (hero, nadando no mar de código): tools/brand/squeak-duck-full-source.png
#   brand/squeak-swim.webp   900px, recortado, sem a poeira de pixels em volta
# ───────────────────────────────────────────────────────────────────────────────
full = Image.open(ROOT / 'tools' / 'brand' / 'squeak-duck-full-source.png').convert('RGBA')
fa = full.getchannel('A')
solid = fa.point(lambda v: 255 if v > 60 else 0)
keep = solid.filter(ImageFilter.MinFilter(13)).filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(1.2))
fa = ImageChops.multiply(fa, keep)
full.putalpha(fa)
bx = fa.point(lambda v: 255 if v > 8 else 0).getbbox()
full = full.crop(bx)
swim = fit(full, 900)
swim.save(OUT / 'brand' / 'squeak-swim.webp', quality=90, method=6)
swim.save(OUT / 'brand' / 'squeak-swim.png')
print('nadando', swim.size)
