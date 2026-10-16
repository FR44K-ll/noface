// Détection des visages avec YuNet (modèle libre d'OpenCV), exécuté dans le navigateur par ONNX Runtime.
// Tous les fichiers sont servis par le site lui-même : aucune requête vers l'extérieur.
import * as ort from './vendor/ort/ort.wasm.min.mjs';

const STRIDES = [8, 16, 32];
const NMS_IOU = 0.3;
// Nuit : en dessous de cette luminosité moyenne (sur 255), chaque valeur v devient 255 * racine(v / 255).
const DARK = 40;
const NIGHT_LUT = Float32Array.from({ length: 256 }, (_, v) => Math.floor(Math.sqrt(v / 255) * 255));

function overlap(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

// Certitude exigée d'un cadre selon sa taille (r : réglages venus d'app.js, short : petit côté de l'image).
export function neededScore(d, short, r) {
  if (d.w / short < r.from) return r.small;
  return r.min + (r.big - r.min) * Math.min(1, Math.max(0, (d.w / short - r.from) / (r.to - r.from)));
}

// Seconde passe sur l'image réduite au tiers. Un gros plan y redevient un visage de taille ordinaire, que le modèle
// reconnaît bien ; un faux visage vu dans le bruit de la nuit, lui, y disparaît le plus souvent.
// Les cadres trouvés là sont marqués { lo: true } : app.js s'en sert pour confirmer ou écarter les grands cadres.
// Elle coûte cher : on ne la fait que si `always` est vrai, ou si l'image entière contient un grand cadre
// qu'elle seule peut confirmer (assez sûr pour compter, pas assez pour se passer de confirmation).
export const LOW_FACTOR = 3;
export async function detectBoth(detect, source, sw, sh, maxSide, minScore, always, r) {
  const boxes = await detect(source, sw, sh, maxSide, minScore);
  const short = Math.min(sw, sh);
  if (!always && !boxes.some((d) => d.s >= r.min && d.s < neededScore(d, short, r))) return boxes;
  const low = await detect(source, sw, sh, Math.round(Math.min(maxSide, Math.max(sw, sh)) / LOW_FACTOR), minScore);
  return boxes.concat(low.map((b) => ({ ...b, lo: true })));
}

export async function createDetector(base) {
  ort.env.wasm.wasmPaths = base + 'vendor/ort/';
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(base + 'models/yunet.onnx', { executionProviders: ['wasm'] });

  // Une toile et un tampon par taille d'image : les deux passes alternent deux tailles, et tout recréer à chaque image
  // (plusieurs dizaines de Mo) coûtait presque autant que la détection elle-même. On ne garde que les deux
  // dernières tailles servies : d'un fichier à l'autre, les anciennes partent, sinon la mémoire ne fait que grossir.
  const sizes = new Map();
  const space = (pw, ph) => {
    const key = pw + 'x' + ph;
    let sp = sizes.get(key);
    if (sp) sizes.delete(key);
    else {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(pw, ph) : Object.assign(document.createElement('canvas'), { width: pw, height: ph });
      sp = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), buffer: new Float32Array(3 * pw * ph) };
    }
    sizes.set(key, sp);
    for (const [k, old] of sizes) {
      if (sizes.size <= 2) break;
      old.canvas.width = old.canvas.height = 0;   // rend tout de suite la mémoire de la toile
      sizes.delete(k);
    }
    return sp;
  };

  // source : image de sw x sh pixels. Renvoie les visages [{x, y, w, h, s}] en pixels de la source.
  return async function detect(source, sw, sh, maxSide, minScore) {
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale));
    // Le modèle veut des dimensions multiples de 32 : on complète avec du noir.
    const pw = Math.ceil(dw / 32) * 32, ph = Math.ceil(dh / 32) * 32;
    const { ctx, buffer } = space(pw, ph);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(source, 0, 0, dw, dh);
    const rgba = ctx.getImageData(0, 0, pw, ph).data;
    const n = pw * ph;
    // Image très sombre (luminosité moyenne sous DARK) : le modèle voit mal dans le noir. On l'analyse deux fois,
    // telle quelle et éclaircie, et on réunit les visages trouvés : l'éclaircie révèle les visages noyés dans le noir,
    // l'originale garde les tout petits que l'éclaircissement noie dans le bruit. Mesuré sur 6 000 photos de nuit
    // annotées (DARK FACE) : visages ratés divisés par plus de 3, sans effet sur les photos de jour (entrainement/eval-nuit.py).
    let sum = 0;
    for (let y = 0; y < dh; y++) for (let x = 0, p = y * pw * 4; x < dw; x++, p += 4) sum += rgba[p] + rgba[p + 1] + rgba[p + 2];
    const passes = sum / (3 * dw * dh) < DARK ? [null, NIGHT_LUT] : [null];
    const found = [];
    for (const lut of passes) {
      for (let i = 0, p = 0; i < n; i++, p += 4) {   // ordre bleu, vert, rouge, comme à l'entraînement du modèle
        buffer[i] = lut ? lut[rgba[p + 2]] : rgba[p + 2];
        buffer[n + i] = lut ? lut[rgba[p + 1]] : rgba[p + 1];
        buffer[2 * n + i] = lut ? lut[rgba[p]] : rgba[p];
      }
      const out = await session.run({ input: new ort.Tensor('float32', buffer, [1, 3, ph, pw]) });
      for (const st of STRIDES) {
        const cols = pw / st;
        const cls = out['cls_' + st].data, obj = out['obj_' + st].data, box = out['bbox_' + st].data;
        for (let i = 0; i < cls.length; i++) {
          const s = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
          if (s < minScore) continue;
          const w = Math.exp(box[i * 4 + 2]) * st, h = Math.exp(box[i * 4 + 3]) * st;
          const cx = ((i % cols) + box[i * 4]) * st, cy = (Math.floor(i / cols) + box[i * 4 + 1]) * st;
          found.push({ x: (cx - w / 2) / scale, y: (cy - h / 2) / scale, w: w / scale, h: h / scale, s });
        }
      }
    }
    // Un même visage sort plusieurs fois : on garde le cadre le plus sûr.
    found.sort((a, b) => b.s - a.s);
    const kept = [];
    for (const b of found) if (!kept.some((k) => overlap(k, b) > NMS_IOU)) kept.push(b);
    return kept;
  };
}

// ---------- Plaques d'immatriculation (ajout NOFACE, 2026-10-16) ----------
// Modèle YOLOv9-t 512 « license-plates-end2end » d'open-image-models (ankandrew, licence MIT), voir models/README.md.
// Il sort directement les cadres déjà triés (NMS incluse) : [lot, x1, y1, x2, y2, classe, score], en pixels de l'entrée.
// Les octets du modèle sont remis par la page (chargés une seule fois au démarrage) : aucune requête ici.
const PLATE_SIDE = 512;
export async function createPlateDetector(base, bytes) {
  ort.env.wasm.wasmPaths = base + 'vendor/ort/';
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  const S = PLATE_SIDE;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const buffer = new Float32Array(3 * S * S);

  // Une passe sur la zone (sx, sy, sw, sh) de la source, mise à l'échelle dans un carré gris, comme à l'entraînement.
  async function pass(source, sx, sy, sw, sh, minScore) {
    const r = Math.min(S / sw, S / sh);
    const dw = Math.round(sw * r), dh = Math.round(sh * r);
    const ox = Math.round((S - dw) / 2 - 0.1), oy = Math.round((S - dh) / 2 - 0.1);
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(source, sx, sy, sw, sh, ox, oy, dw, dh);
    const rgba = ctx.getImageData(0, 0, S, S).data;
    const n = S * S;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      buffer[i] = rgba[p] / 255;
      buffer[n + i] = rgba[p + 1] / 255;
      buffer[2 * n + i] = rgba[p + 2] / 255;
    }
    const out = await session.run({ images: new ort.Tensor('float32', buffer, [1, 3, S, S]) });
    const d = out[Object.keys(out)[0]].data;
    const found = [];
    for (let k = 0; k + 6 < d.length; k += 7) {
      const s = d[k + 6];
      if (s < minScore) continue;
      const x1 = (d[k + 1] - ox) / r + sx, y1 = (d[k + 2] - oy) / r + sy;
      const x2 = (d[k + 3] - ox) / r + sx, y2 = (d[k + 4] - oy) / r + sy;
      found.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, s });
    }
    return found;
  }

  // Image entière, puis (si tiles) des morceaux qui se recouvrent : une plaque lointaine n'a que quelques pixels
  // une fois l'image entière réduite à 512, le modèle la voit bien mieux dans un morceau.
  // tiles : 0 (image entière seule), 2 (deux moitiés dans le sens long), 4 (quatre quarts).
  return async function detectPlates(source, sw, sh, tiles, minScore) {
    let found = await pass(source, 0, 0, sw, sh, minScore);
    const zones = [];
    if (tiles === 2) {
      if (sw >= sh) { const tw = Math.round(sw * 0.6); zones.push([0, 0, tw, sh], [sw - tw, 0, tw, sh]); }
      else { const th = Math.round(sh * 0.6); zones.push([0, 0, sw, th], [0, sh - th, sw, th]); }
    } else if (tiles === 4) {
      const tw = Math.round(sw * 0.6), th = Math.round(sh * 0.6);
      for (const x of [0, sw - tw]) for (const y of [0, sh - th]) zones.push([x, y, tw, th]);
    }
    for (const z of zones) found = found.concat(await pass(source, ...z, minScore));
    // Doublons (image entière et morceaux) : on garde le plus sûr.
    found = found.filter((b) => b.w > 1 && b.h > 1).sort((a, b) => b.s - a.s);
    const kept = [];
    for (const b of found) if (!kept.some((k) => overlap(k, b) > 0.5)) kept.push(b);
    return kept;
  };
}
