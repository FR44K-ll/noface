# Tests des styles de masque et des plaques (ajout NOFACE, 2026-10-16), dans Chrome sans fenêtre via Playwright.
# Besoin : pip install playwright opencv-python numpy ; ffmpeg ; python test/make-test-video.py lancé une fois ;
# serveur local lancé (node outils/dev-server.mjs).
# Usage : python test/test-masques.py            (CHROME=/chemin/vers/chrome pour choisir le navigateur)
# Vérifie :
#  1. Plaques (photo) : sur une photo libre de droits (CC0, Wikimedia Commons), option « plaques » cochée, les
#     plaques connues sont entièrement noires dans le JPEG produit.
#  2. Styles (photo) : pour chaque style (carré, rond, 444, émoji, image en partie transparente), deux photos identiques
#     sauf l'intérieur du visage reçoivent les mêmes masques. Dans chaque case, les deux résultats doivent être
#     identiques au pixel près : rien du visage d'origine ne traverse le masque.
#  3. Image transparente (vidéo) : avec une image entièrement transparente, la vidéo produite est, dans les cases, aussi
#     noire qu'avec le carré noir : la transparence ne laisse jamais voir le visage.
#  4. Plaques (vidéo) : une vidéo tirée de la photo du point 1 (travelling), plaques noires sur toutes les images.
#  5. Aucune requête après le chargement de la page.
import asyncio, base64, json, os, subprocess, sys, urllib.request
import cv2
import numpy as np
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get('SITE', 'http://localhost:5173/')
CHROME = os.environ.get('CHROME')
PHOTO = os.path.join(HERE, 'plaque.jpg')
PHOTO_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Hong_Kong_car_with_three_license_plates.jpg/1280px-Hong_Kong_car_with_three_license_plates.jpg'
# Plaques visibles sur cette photo (1280 x 960), repérées à la main : x1, y1, x2, y2.
PLATES = [(560, 515, 800, 625), (550, 620, 815, 680)]
fails = []

def prepare():
    if not os.path.exists(PHOTO):
        req = urllib.request.Request(PHOTO_URL, headers={'User-Agent': 'noface-test/1.0'})
        open(PHOTO, 'wb').write(urllib.request.urlopen(req).read())
    astro = cv2.imread(os.path.join(HERE, 'astro.png'))
    if astro is None: sys.exit("lancez d'abord python test/make-test-video.py (astro.png)")
    cv2.imwrite(os.path.join(HERE, 'visage-a.png'), astro)
    # Transparente, avec un disque opaque au centre seulement : autour, on doit voir le noir, jamais le visage.
    st = np.zeros((256, 256, 4), np.uint8)
    cv2.circle(st, (128, 128), 60, (40, 220, 255, 255), -1)
    cv2.imwrite(os.path.join(HERE, 'sticker.png'), st)
    cv2.imwrite(os.path.join(HERE, 'vide.png'), np.zeros((64, 64, 4), np.uint8))
    # Vidéo de plaques : travelling de 3 s sur la photo.
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-i', PHOTO, '-vf', "crop=1100:820:'90*t/3':'70*t/3',fps=30",
                    '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', os.path.join(HERE, 'plaque.mp4')], check=True)

READ = """async () => { const buf = new Uint8Array(await window.noface.S.resultFile.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); return btoa(s); }"""

async def main():
    prepare()
    async with async_playwright() as p:
        b = await (p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch())
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        reqs = []
        pg.on('request', lambda r: reqs.append(r.url))
        await pg.goto(SITE + '?debug')
        await pg.wait_for_selector('#file:not([disabled])', state='attached', timeout=90000)
        loaded = len(reqs)

        async def load(path, plates=False):
            await pg.evaluate("document.getElementById('restart2').click()")
            await pg.evaluate(f"document.getElementById('plates').checked = {str(plates).lower()}")
            await pg.set_input_files('#file', path)
            await pg.wait_for_selector('#s-review:not([hidden])', timeout=180000)

        async def export():
            await pg.click('#export')
            await pg.wait_for_selector('#s-done:not([hidden])', timeout=180000)
            return base64.b64decode(await pg.evaluate(READ))

        async def export_photo():
            data = await export()
            await pg.click('#back')
            await pg.wait_for_selector('#s-review:not([hidden])')
            return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)

        async def set_style(st, emoji=None, sticker=None, shot=None):
            await pg.click('#styleBtn')
            if sticker:
                await pg.set_input_files('#stickerFile', sticker)
                await pg.wait_for_function("() => document.getElementById('stickerNote').textContent.startsWith('Image chargée')", timeout=10000)
            else:
                await pg.click(f'#maskSheet [data-style="{st}"]')
                if emoji: await pg.click(f'#maskSheet [data-emoji="{emoji}"]')
            if shot: await pg.screenshot(path=shot)
            await pg.click('#maskClose')

        # 1. Plaques sur photo
        await load(PHOTO, plates=True)
        boxes = json.loads(await pg.evaluate("JSON.stringify(window.noface.S.frames[0].map(b => ({x: b.x, y: b.y, w: b.w, h: b.h, plate: !!b.track.plate})))"))
        await pg.screenshot(path=os.path.join(HERE, 'shot-plaque.png'))
        img = await export_photo()
        res1 = []
        for (x1, y1, x2, y2) in PLATES:
            m = int(img[y1:y2, x1:x2].max())
            res1.append(m)
            if m > 24: fails.append(f'plaque {x1},{y1} visible (max {m})')
        print('plaques photo :', sum(b['plate'] for b in boxes), 'cases ; luminosité max dans les plaques :', res1)

        # 2. Styles sur photo : visage A puis visage B (intérieur du visage brouillé), mêmes masques.
        a = cv2.imread(os.path.join(HERE, 'visage-a.png'))
        await load(os.path.join(HERE, 'visage-a.png'))
        raw = await pg.evaluate("JSON.stringify(window.noface.S.raw)")
        rects = json.loads(await pg.evaluate("JSON.stringify(window.noface.S.frames[0].map(b => [b.x, b.y, b.w, b.h]))"))
        if not rects: fails.append('aucun visage trouvé sur astro.png')
        bimg = a.copy()
        rs = np.random.RandomState(1)
        for (x, y, w, h) in rects:
            y1, y2, x1, x2 = int(y + h * 0.1), int(y + h * 0.9), int(x + w * 0.1), int(x + w * 0.9)
            bimg[y1:y2, x1:x2] = rs.randint(0, 255, bimg[y1:y2, x1:x2].shape)
        cv2.imwrite(os.path.join(HERE, 'visage-b.png'), bimg)
        styles = [('noir', None, None), ('rond', None, None), ('444', None, None), ('emoji', '💀', None), ('image', None, os.path.join(HERE, 'sticker.png'))]
        outs = {}
        for name in ('a', 'b'):
            await load(os.path.join(HERE, f'visage-{name}.png'))
            await pg.evaluate(f"(() => {{ const S = window.noface.S; S.raw = {raw}; window.noface.retrack({{}}); }})()")
            for st, em, stk in styles:
                shot = os.path.join(HERE, f'shot-picker-{st}.png') if name == 'b' else None
                await set_style(st, em, stk, shot)
                outs[(name, st)] = await export_photo()
                if name == 'b': await pg.screenshot(path=os.path.join(HERE, f'shot-style-{st}.png'))
        res2 = {}
        for st, _, _ in styles:
            A, B = outs[('a', st)].astype(int), outs[('b', st)].astype(int)
            worst = 0
            for (x, y, w, h) in rects:
                # 16 pixels retirés au bord : blocs JPEG à cheval sur le bord de la case.
                y1, y2, x1, x2 = int(y) + 16, int(y + h) - 16, int(x) + 16, int(x + w) - 16
                worst = max(worst, int(np.abs(A[y1:y2, x1:x2] - B[y1:y2, x1:x2]).max()))
            res2[st] = worst
            if worst > 0: fails.append(f'style {st} : le visage traverse le masque (écart {worst})')
        print('écart max visage A / visage B dans les cases, par style :', res2)

        # 3. Image entièrement transparente sur vidéo : le résultat doit être celui du carré noir (au bruit de
        #    compression près), donc le cœur de chaque case aussi sombre qu'avec le carré noir.
        await load(os.path.join(HERE, 'test2.mp4'))
        info = json.loads(await pg.evaluate("JSON.stringify({ fps: window.noface.S.fps, frames: window.noface.S.frames.map(fr => fr.map(b => [b.x, b.y, b.w, b.h])) })"))
        def cores(path):
            cap = cv2.VideoCapture(path)
            out = []
            while True:
                ok, fr = cap.read()
                if not ok: break
                j = min(len(info['frames']) - 1, int(cap.get(cv2.CAP_PROP_POS_MSEC) / 1000 * info['fps']))
                m = 0
                for (x, y, w, h) in info['frames'][j]:
                    reg = fr[int(y + h * 0.25):int(y + h * 0.75), int(x + w * 0.25):int(x + w * 0.75)]
                    if reg.size: m = max(m, int(reg.max()))
                out.append(m)
            return out
        await set_style('noir')
        open('/tmp/noface-noir.mp4', 'wb').write(await export())
        await pg.click('#back')
        await pg.wait_for_selector('#s-review:not([hidden])')
        await set_style('image', sticker=os.path.join(HERE, 'vide.png'))
        open('/tmp/noface-vide.mp4', 'wb').write(await export())
        noir, vide = cores('/tmp/noface-noir.mp4'), cores('/tmp/noface-vide.mp4')
        worst = max(v - n for n, v in zip(noir, vide)) if vide else 999
        print('vidéo, image transparente :', len(vide), 'images ; cœur des cases, max carré noir', max(noir), '/ image transparente', max(vide), '; pire écart', worst)
        if len(vide) < 100 or worst > 8: fails.append(f'image transparente sur vidéo : {len(vide)} images, écart {worst}')

        # 4. Plaques sur vidéo.
        await load(os.path.join(HERE, 'plaque.mp4'), plates=True)
        await set_style('noir')
        await pg.screenshot(path=os.path.join(HERE, 'shot-plaque-video.png'))
        open('/tmp/noface-plaque.mp4', 'wb').write(await export())
        cap = cv2.VideoCapture('/tmp/noface-plaque.mp4')
        n, bad = 0, 0
        while True:
            ok, fr = cap.read()
            if not ok: break
            t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            k = 1100 / fr.shape[1]
            ox, oy = 90 * min(t, 3) / 3, 70 * min(t, 3) / 3
            for (x1, y1, x2, y2) in PLATES:
                # Le cœur de chaque plaque (les lettres), ramené dans l'image de la vidéo.
                reg = fr[int((y1 + 12 - oy) / k):int((y2 - 12 - oy) / k), int((x1 + 30 - ox) / k):int((x2 - 30 - ox) / k)]
                if reg.size and reg.max() > 40: bad += 1
            n += 1
        print('vidéo plaques :', n, 'images ; plaques visibles (image x plaque) :', bad)
        if n < 80 or bad: fails.append(f'plaques sur vidéo : {bad} plaques visibles sur {n} images')

        after = [u for u in reqs[loaded:] if not u.startswith(('blob:', 'data:'))]
        print('requêtes après chargement :', after)
        if after: fails.append('requêtes après chargement : ' + ', '.join(after))
        await b.close()
    print('ÉCHEC\n- ' + '\n- '.join(fails) if fails else 'OK')
    sys.exit(1 if fails else 0)

asyncio.run(main())
