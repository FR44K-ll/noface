// Recherche des visages dans un fil d'exécution à part, pour utiliser plusieurs cœurs du téléphone.
// Tout reste dans le navigateur : ce fichier ne fait aucune requête en dehors du site.
// Modifié le 2026-10-16 pour NOFACE : recherche des plaques d'immatriculation en option (modèle remis par la page).
import { createDetector, detectBoth, createPlateDetector } from './detector.js';

let detect = null;
let plateBytes = null, plates = null;
const base = new URL('.', self.location.href).href;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      detect = await createDetector(base);
      // Un essai à blanc : si la détection ne marche pas ici, on le sait tout de suite.
      await detect(new OffscreenCanvas(64, 64), 64, 64, 64, 0.5);
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'plates') {
      plateBytes = m.bytes;   // le moteur n'est créé qu'à la première demande : pas de mémoire prise sinon
    } else if (m.type === 'detect') {
      const boxes = await detectBoth(detect, m.bitmap, m.w, m.h, m.maxSide, m.minScore, m.always, m.rule);
      let found = null;
      if (m.plates) {
        if (!plates) {
          if (!plateBytes) throw new Error('modèle des plaques absent');
          plates = await createPlateDetector(base, plateBytes);
        }
        found = await plates(m.bitmap, m.w, m.h, m.plates.tiles, m.plates.minScore);
      }
      m.bitmap.close();
      self.postMessage({ type: 'done', id: m.id, boxes, plates: found });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
