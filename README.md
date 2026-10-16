# NOFACE

*[English version](README.en.md)*

Masquer les visages d'une vidéo ou d'une photo avant de la poster, directement dans le navigateur du téléphone.
Rien n'est envoyé à un serveur : pas de compte, pas de statistiques, pas de fichier chargé depuis un autre site.

**Site : https://fr44k-ll.github.io/noface/** · Code : https://github.com/FR44K-ll/noface

> **NOFACE est une version modifiée de [Vesky](https://github.com/Nctrn17/vesky), sous licence AGPL-3.0.**
> Le moteur (détection, suivi, export, tests) vient de Vesky. NOFACE change le nom, les textes,
> la mise en page, la police, les couleurs et les icônes. Merci aux auteurs de Vesky.

## Pourquoi

Les vidéos de blocus et de manifestation servent à identifier les personnes filmées. Un flou ou une mosaïque
peuvent être défaits par une IA. Un carré plein, non : il n'y a plus d'image dessous.

## Ce que fait l'outil

1. Vous choisissez une vidéo ou une photo.
2. La vidéo est analysée 30 fois par seconde, et un carré noir (ou un émoji posé sur un carré noir) est placé sur chaque visage, sur toutes les images.
3. Vous vérifiez : vous ajoutez un masque là où un visage a été raté, vous retirez un masque posé à tort.
4. Le fichier est entièrement refait : le lieu, la date et le modèle du téléphone du fichier d'origine disparaissent.

## Ce que l'outil ne fait pas

- Il ne cache ni les vêtements, ni les tatouages, ni la voix, ni le lieu.
- Il peut rater un visage. Regarder le résultat avant de poster reste indispensable.
- Il ne promet pas une protection totale.

## Comment le vérifier

- **En mode avion.** Ouvrez le site une première fois avec du réseau, passez en mode avion, traitez une vidéo :
  tout marche. Sans réseau, rien ne peut partir.
- **L'onglet Réseau du navigateur.** Sur ordinateur (F12, onglet Réseau) : après le chargement de la page,
  aucune requête pendant l'analyse ni pendant l'export.
- **La politique de sécurité.** `Content-Security-Policy` (`index.html` et `_headers`) : `connect-src 'self'`
  interdit au navigateur toute connexion vers un autre site.
- **Le test automatique** (voir « Tester ») échoue si une seule requête part après le chargement de la page.
- **Le code est public.** `grep -rn "fetch(" app.js sw.js`.

## Identité visuelle

- Couleurs : noir, gris, blanc. Rien d'autre. Fond `#0C0F14`, texte `#F0F0EC`, gris `#969696`, labels `#828282`,
  traits `#4C4E52`, cercles `#C8C8C8`.
- Police : DejaVu Sans Mono, servie par le site (`vendor/fonts/`), jamais depuis un autre serveur.
- Labels en capitales espacées, traits fins, beaucoup de vide. Pas d'ombres, pas de dégradés, pas d'effets.
- Icône : cercle fin et « NF » (`icons/`, `favicon.ico`, `icon.svg`).
- Ton : sec, court, vouvoiement. Les mises en garde restent dites clairement.

## Comment c'est fait

- Site statique, sans étape de construction : `index.html`, `style.css`, `app.js`.
- Détection des visages : modèle YuNet_n réentraîné par Vesky pour mieux voir la nuit (`models/README.md`),
  exécuté par ONNX Runtime Web (`detector.js`, `detect-worker.js`), sur plusieurs cœurs en parallèle.
- Suivi : une seule case par visage d'une image à l'autre, agrandie de 30 %, prolongée de quelques images avant et après.
- Export rapide : chaque image est masquée puis réencodée par l'encodeur du téléphone (WebCodecs, via Mediabunny).
  Export de secours (canvas + MediaRecorder) si le navigateur ne sait pas faire l'export rapide. `?lent` force ce mode.
- Photo : JPEG.
- Installable sur l'écran d'accueil (`manifest.webmanifest`) et utilisable sans réseau (`sw.js`).

## Rangement

- À la racine : le site (`index.html`, `app.js`, `style.css`…), avec `models/`, `vendor/` (bibliothèques et police) et `icons/`.
- `outils/` : construire le site publié, le servir en local, comparer un site en ligne au dépôt.
- `test/` : les tests du site.
- `entrainement/` : mesure et entraînement du modèle de détection (repris de Vesky tel quel).
- `android/` et `fastlane/` : l'app Android **de Vesky**, pas encore adaptée à NOFACE (nom, paquet `fr.vesky.app`,
  icônes). Ne pas la publier sous ce nom.

## Lancer en local

```bash
node outils/dev-server.mjs
```

Puis ouvrir http://localhost:5173.

## Tester

```bash
python test/make-test-video.py      # besoin : opencv-python, scikit-image, ffmpeg
node test/run-test.mjs              # Node 22+, ou node --experimental-websocket sur Node 20
python test/make-faces-pair.py
node test/test-sans-trace.mjs
```

Chrome se choisit avec la variable `CHROME` (par exemple `CHROME=/usr/bin/google-chrome`).
`run-test.mjs` analyse une vidéo dont la position des visages est connue, exporte, puis vérifie image par image
qu'aucun visage n'est visible, que les métadonnées ont disparu et qu'aucune requête n'est partie.

`bash test/verifier-tiers.sh` vérifie qu'ONNX Runtime et Mediabunny sont identiques aux versions officielles.

## Mettre en ligne

Adresse : https://fr44k-ll.github.io/noface/, servie par GitHub Pages depuis la racine de la branche `main`.
Chaque `git push` sur `main` met le site à jour. Le fichier `.nojekyll` empêche GitHub de retraiter les fichiers.

GitHub Pages ignore `_headers` : la politique de sécurité qui compte est celle écrite dans chaque page
(`<meta http-equiv="Content-Security-Policy">`). Elle interdit toujours toute connexion vers un autre site.
Ce que Pages ne permet pas : interdire l'affichage du site dans un cadre (`frame-ancestors`, `X-Frame-Options`).
Rien d'autre ne manque : l'outil n'a pas besoin d'isolation cross-origin (ONNX Runtime tourne sur un seul fil
par moteur, `detector.js`), et tous les chemins sont relatifs, donc le sous-dossier `/noface/` ne gêne pas.
Seul `404.html` renvoie vers `/noface/` en dur.

`wrangler.jsonc` reste prêt pour Cloudflare, si un jour un domaine est choisi.

## Composants tiers

- [Vesky](https://github.com/Nctrn17/vesky), licence AGPL-3.0 : le projet d'origine.
- [YuNet_n](https://github.com/ShiqiYu/libfacedetection.train), licence BSD-3, réentraîné par Vesky (`models/`).
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), licence MIT (`vendor/ort/`).
- [Mediabunny](https://github.com/Vanilagy/mediabunny), licence MPL-2.0 (`vendor/mediabunny/`).
- [DejaVu Sans Mono](https://dejavu-fonts.github.io/), licence Bitstream Vera, modifications DejaVu dans le domaine public (`vendor/fonts/`).

## Licence

Code sous licence [AGPL-3.0](LICENSE), comme Vesky. Vous pouvez le copier, le modifier et le mettre en ligne,
à condition de publier le code de votre version sous la même licence, y compris si elle n'est servie que sur un site.
Les fichiers modifiés par rapport à Vesky le signalent en tête de fichier.

**Ne chargez rien depuis un autre site.** Une police Google Fonts, un script de statistiques ou une image hébergée
ailleurs suffit à envoyer l'adresse IP des visiteurs à un tiers. Gardez tout sur votre propre serveur.
