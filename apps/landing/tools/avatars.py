"""
Squeak: avatares dos usuários das demos (patos com acessórios), a partir de tools/brand/avatars/*.png.

    python tools/avatars.py

Tira o fundo branco (flood fill a partir das bordas; o contorno preto dos patos segura o preenchimento)
e grava public/avatars/<nome>.webp em 192px, para avatares circulares de até ~96px. Só usa Pillow.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'brand' / 'avatars'
OUT = ROOT / 'public' / 'avatars'
OUT.mkdir(parents=True, exist_ok=True)
KEY = (255, 0, 255)

for f in sorted(SRC.glob('*.png')):
    im = Image.open(f).convert('RGB')
    W, H = im.size
    for i in range(0, W, 24):
        for (x, y) in ((i, 0), (i, H - 1), (0, i), (W - 1, i)):
            r, g, b = im.getpixel((x, y))
            if min(r, g, b) > 225 and im.getpixel((x, y)) != KEY:
                ImageDraw.floodfill(im, (x, y), KEY, thresh=60)
    px = im.load()
    mask = Image.new('L', (W, H), 255)
    mp = mask.load()
    for y in range(H):
        for x in range(W):
            if px[x, y] == KEY:
                mp[x, y] = 0
                px[x, y] = (20, 16, 10)  # fundo vira a cor do contorno: sem franja clara ao reduzir
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    im = im.convert('RGBA')
    im.putalpha(mask)
    im.resize((192, 192), Image.LANCZOS).save(OUT / f'{f.stem}.webp', quality=90, method=6)
    print(f.stem)
