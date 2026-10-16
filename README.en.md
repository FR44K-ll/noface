# NOFACE

*[Version française](README.md)*

Hide the faces in a video or photo before posting it, right in the phone's browser.
Nothing is sent to a server: no account, no analytics, no file loaded from another site.

**Site: https://fr44k-ll.github.io/noface/** · Code: https://github.com/FR44K-ll/noface

> **NOFACE is a modified version of [Vesky](https://github.com/Nctrn17/vesky), licensed under AGPL-3.0.**
> The engine (detection, tracking, export, tests) comes from Vesky. NOFACE changes the name, the copy,
> the layout, the font, the colours and the icons. Thanks to the Vesky authors.

## Why

Videos of blockades and protests are used to identify the people filmed. Blur or pixelation can be undone
by AI. A solid square cannot: there is no image left underneath.

## What it does

1. You pick a video or a photo.
2. The video is analysed 30 times per second, and a solid black square (or an emoji on top of a black square) is placed over every face, on every frame.
3. You review: add a mask where a face was missed, remove a mask placed by mistake.
4. The file is fully re-encoded: location, date and phone model from the original file are gone.

### Mask styles

Square button on the review screen: black square (default, safest), circle, "444" logo, emoji (presets or any typed
emoji), or an image picked from the device (transparent PNG recommended). Whatever the style, an opaque fill covers the
whole box first: circle and 444 are discs through the four corners of the box, emoji and image sit on a black square.
Transparent pixels show black, never the face. The picked image is read locally, never uploaded. Same rendering for
photo and video.

### License plates (option)

"Masquer aussi les plaques" checkbox on the home screen, **off by default**, remembered on the device. Plates always
get a black rectangle regardless of the face style, and can be removed/restored by hand like faces. Off by default
because video analysis becomes about 3x slower (measured on desktop, more on phones) and most protest videos don't
need it. The model loads with the rest of the site, before a file is picked: no request afterwards either way.
Model: YOLOv9-t from [open-image-models](https://github.com/ankandrew/open-image-models), MIT, 7.8 MB
(`models/README.md`). It can miss distant, skewed or dark plates: check.

## What it does not do

- It does not hide clothes, tattoos, voice or location. Plates only when the option is on.
- It can miss a face. Watching the result before posting is mandatory.
- It does not promise full protection.

## How to check it

- **Airplane mode.** Open the site once with a connection, switch to airplane mode, process a video: it works.
  Without a network, nothing can leave.
- **Browser Network tab.** On desktop (F12, Network): after the page has loaded, no request during analysis or export.
- **Security policy.** `Content-Security-Policy` (`index.html` and `_headers`): `connect-src 'self'` blocks any
  connection to another site.
- **The automated test** (see "Testing") fails if a single request is made after page load.

## Visual identity

- Colours: black, grey, white. Nothing else. Background `#0C0F14`, text `#F0F0EC`, grey `#969696`, labels `#828282`,
  rules `#4C4E52`, circles `#C8C8C8`.
- Font: DejaVu Sans Mono, served by the site itself (`vendor/fonts/`), never from another server.
- Widely letter-spaced capital labels, thin rules, lots of empty space. No shadows, gradients or effects.
- Icon: thin circle with "NF" (`icons/`, `favicon.ico`, `icon.svg`).
- Tone: dry, short, French "vous". Safety warnings stay explicit.

## Layout

- Root: the site (`index.html`, `app.js`, `style.css`…), plus `models/`, `vendor/` (libraries and font) and `icons/`.
- `outils/`: build the published folder, serve locally, compare a live site to the repo.
- `test/`: site tests.
- `entrainement/`: detection model measurement and training (unchanged from Vesky).
- `android/` and `fastlane/`: **Vesky's** Android app, not yet adapted to NOFACE (name, package `fr.vesky.app`,
  icons). Do not publish it under this name.

## Run locally

```bash
node outils/dev-server.mjs
```

Then open http://localhost:5173.

## Testing

```bash
python test/make-test-video.py      # needs opencv-python, scikit-image, ffmpeg
node test/run-test.mjs              # Node 22+, or node --experimental-websocket on Node 20
python test/make-faces-pair.py
node test/test-sans-trace.mjs
python test/test-masques.py   # mask styles and plates (Playwright)
```

Pick Chrome with the `CHROME` variable (e.g. `CHROME=/usr/bin/google-chrome`).

## Deploying

Live at https://fr44k-ll.github.io/noface/, served by GitHub Pages from the root of `main`. Every push to `main`
updates the site. `.nojekyll` stops GitHub from processing the files.

GitHub Pages ignores `_headers`: the security policy that applies is the one in each page's
`<meta http-equiv="Content-Security-Policy">`, which still blocks any connection to another site. Pages cannot send
`frame-ancestors` / `X-Frame-Options`. No cross-origin isolation is needed (ONNX Runtime runs single-threaded per
worker), and all paths are relative, so the `/noface/` subpath is fine. Only `404.html` hard-codes `/noface/`.

## Third-party components

- [Vesky](https://github.com/Nctrn17/vesky), AGPL-3.0: the original project.
- [YuNet_n](https://github.com/ShiqiYu/libfacedetection.train), BSD-3, retrained by Vesky (`models/`).
- YOLOv9-t 512 plate detector from [open-image-models](https://github.com/ankandrew/open-image-models) (ankandrew), MIT (`models/plaques.onnx`, `models/LICENSE-plaques.txt`).
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), MIT (`vendor/ort/`).
- [Mediabunny](https://github.com/Vanilagy/mediabunny), MPL-2.0 (`vendor/mediabunny/`).
- [DejaVu Sans Mono](https://dejavu-fonts.github.io/), Bitstream Vera licence, DejaVu changes in the public domain (`vendor/fonts/`).

## Licence

[AGPL-3.0](LICENSE), like Vesky. You may copy, modify and host it, provided you publish the source of your version
under the same licence, even if it is only served as a website. Files modified from Vesky say so in their header.
