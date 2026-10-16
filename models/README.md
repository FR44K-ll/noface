# Modèle de détection : YuNet_n réentraîné pour la nuit (licence BSD-3)

Base : YuNet_n de [libfacedetection.train](https://github.com/ShiqiYu/libfacedetection.train) (Shiqi Yu, BSD-3,
`LICENSE-yunet.txt`), même famille et mêmes sorties que le YuNet d'OpenCV.

`yunet.onnx` part des poids publiés (`weights/yunet_n.pth`) et a été réentraîné 40 passes sur WIDER FACE
(photos de jour) et DARK FACE (photos de nuit). Recette complète : `entrainement/entrainer-nuit.sh`, après
`entrainement/prepare-darkface.py`. 1 000 photos de DARK FACE (`entrainement/darkface-split.json`) n'ont jamais servi à
l'entraînement et servent à la mesure.

Mesuré avec la règle du site (`entrainement/eval-faces.py`), contre l'ancien modèle (YuNet 2023mar d'OpenCV Zoo) :

| | Visages ratés de nuit (1 287) | Visages ratés de jour (14 954) | Grands masques sans visage, jour |
|---|---|---|---|
| Ancien modèle | 185 | 1 016 | 326 |
| Celui-ci | 64 | 938 | 332 |

Le décodage des sorties (dans `detector.js`) suit `modules/objdetect/src/face_detect.cpp` d'OpenCV.

# Modèle des plaques d'immatriculation (ajout NOFACE, licence MIT)

`plaques.onnx` est le fichier `yolo-v9-t-512-license-plates-end2end.onnx` publié tel quel par
[open-image-models](https://github.com/ankandrew/open-image-models) (ankandrew, licence MIT, `LICENSE-plaques.txt`),
release « assets ». YOLOv9-t, entrée 512 x 512, NMS incluse dans le modèle. 7,8 Mo.
SHA-256 : `746fdd358ec110418775d7c9d8d07910d48b1a21471f92bf4421f6510d6daade`.

Chiffres publiés par l'auteur (version 512) : précision 0,955, rappel 0,901, mAP50 0,948. Architecture YOLOv9
(Wang et Liao, 2024). Le jeu d'entraînement n'est pas détaillé par l'auteur.

Utilisation (`detector.js`, `createPlateDetector`) : image entière, puis morceaux qui se recouvrent (4 pour une photo,
2 pour une vidéo, aucun en mode rapide) pour les plaques lointaines. Seuil 0,25 pour ouvrir un masque, 0,1 pour
prolonger un masque déjà ouvert. Vidéo : une image analysée sur deux, le suivi bouche les trous.
