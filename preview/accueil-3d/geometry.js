// Géométrie des profilés de l'aperçu 3D (mètres).
// Coupes illustratives inspirées des systèmes coulissants à rupture de pont
// thermique : dimensions indicatives, ce ne sont pas des plans de fabrication.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MM = 0.001;

// Contour fermé à coins arrondis, à partir de points en millimètres.
export function roundedPoly(points, radius, Kind = THREE.Shape) {
  const s = new Kind();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n], p1 = points[i], p2 = points[(i + 1) % n];
    const d0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const r = Math.min(radius, d0 / 2, d1 / 2);
    const a = [p1[0] + (p0[0] - p1[0]) / d0 * r, p1[1] + (p0[1] - p1[1]) / d0 * r];
    const b = [p1[0] + (p2[0] - p1[0]) / d1 * r, p1[1] + (p2[1] - p1[1]) / d1 * r];
    if (i === 0) s.moveTo(a[0] * MM, a[1] * MM); else s.lineTo(a[0] * MM, a[1] * MM);
    s.quadraticCurveTo(p1[0] * MM, p1[1] * MM, b[0] * MM, b[1] * MM);
  }
  s.closePath();
  return s;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function withHoles(points, radius, holes, holeRadius = 0.8) {
  const s = roundedPoly(points, radius);
  for (const h of holes) s.holes.push(roundedPoly(h, holeRadius, THREE.Path));
  return s;
}

// ---------- Profils de la baie (coordonnées a = depuis le bord extérieur, b = profondeur) ----------
// Dormant coulissant (≈ 86 mm de profondeur), deux rails de roulement, chambres internes.
export const DORMANT = withHoles([
  [0, -43], [58, -43], [58, -39.5], [49, -39.5], [49, -21], [61, -21], [61, -17.5], [49, -17.5],
  [49, 11], [61, 11], [61, 14.5], [49, 14.5], [49, 39.5], [58, 39.5], [58, 43], [0, 43],
  [0, 18], [-2.5, 18], [-2.5, 9], [0, 9], [0, -9], [-2.5, -9], [-2.5, -18], [0, -18],
], 1.1, [rect(4, -38, 44, -25), rect(4, -13, 44, 6), rect(4, 19, 44, 35)]);
export const DORMANT_INNER = 49;
export const DORMANT_SEALS = [rect(52, -39.5, 58, -37.5), rect(52, 37.5, 58, 39.5)].map((p) => roundedPoly(p, 0.4));
// Ouvrant (52 × 32 mm) avec feuillure de vitrage.
export const SASH = withHoles(
  [[0, -16], [52, -16], [52, -13], [37, -13], [37, 13], [52, 13], [52, 16], [0, 16], [0, 4], [-3, 4], [-3, -4], [0, -4]],
  0.9, [rect(4, -12, 33, -2), rect(4, 2, 33, 12)], 0.6,
);
export const SASH_GLAZING = 37;
export const SASH_SEALS = [rect(47, -13, 52, -11.8), rect(47, 11.8, 52, 13)].map((p) => roundedPoly(p, 0.3));
export const SPACER = withHoles(rect(0, -8, 8, 8), 0.6, [rect(1.2, -6.8, 6.8, 6.8)], 0.4);

// Barre extrudée sur sa longueur puis coupée à 45° aux deux bouts.
// Le profil est posé le long de X : a → +Y (vers l'intérieur du cadre), b → Z.
export function mitredBar(shape, L) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false, curveSegments: 3, steps: 1 });
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i), b = pos.getY(i), s = pos.getZ(i);
    pos.setXYZ(i, a + (s / L) * (L - 2 * a) - L / 2, a, b);
    const na = nor.getX(i), nb = nor.getY(i), ns = nor.getZ(i);
    if (Math.abs(ns) > 0.5) nor.setXYZ(i, ns < 0 ? -0.7071 : 0.7071, 0.7071, 0);
    else nor.setXYZ(i, 0, na, nb);
  }
  g.computeBoundingSphere();
  return g;
}

// Position finale des quatre barres d'un cadre W × H (cotes extérieures).
export function framePoses(W, H) {
  return [
    { L: W, rot: 0, x: 0, y: -H / 2 },
    { L: W, rot: Math.PI, x: 0, y: H / 2 },
    { L: H, rot: -Math.PI / 2, x: -W / 2, y: 0 },
    { L: H, rot: Math.PI / 2, x: W / 2, y: 0 },
  ];
}

// Cadre complet fusionné en une seule géométrie.
export function mitredFrame(shape, W, H) {
  const parts = framePoses(W, H).map(({ L, rot, x, y }) => {
    const g = mitredBar(shape, L);
    g.rotateZ(rot);
    g.translate(x, y, 0);
    return g;
  });
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// ---------- Coupe éclatée « au cœur du profil » ----------
// Plan de coupe : x = profondeur (extérieur à gauche), y = hauteur, en mm.
// Chaque pièce porte la direction de son éclatement (mm) et sa matière.
const DOVETAIL = (y) => [[-14, y], [-11, y + 1.5], [11, y + 1.5], [14, y], [14, y + 8], [11, y + 6.5], [-11, y + 6.5], [-14, y + 8]];
export const CUTAWAY = [
  { id: 'outer', mat: 'finish', explode: [-34, 0, 0],
    shape: withHoles([[-36, 0], [-11, 0], [-11, 64], [-15, 64], [-15, 88], [-20, 88], [-20, 64], [-36, 64]], 1.2,
      [rect(-32, 4, -16, 28), rect(-32, 33, -16, 59)]) },
  { id: 'inner', mat: 'anodise', explode: [34, 0, 0],
    shape: withHoles(rect(11, 0, 36, 64), 1.2, [rect(16, 4, 32, 28), rect(16, 33, 32, 59)]) },
  { id: 'strip', mat: 'poly', explode: [0, -6, 34], shape: roundedPoly(DOVETAIL(4), 0.5) },
  { id: 'strip', mat: 'poly', explode: [0, 6, 34], shape: roundedPoly(DOVETAIL(52), 0.5) },
  { id: 'bead', mat: 'anodise', explode: [30, 16, 0],
    shape: withHoles(rect(15, 64, 24, 88), 1, [rect(17.5, 67, 21.5, 85)], 0.5) },
  { id: 'seal', mat: 'epdm', explode: [-22, 10, 0], shape: roundedPoly(rect(-15, 74, -14, 86), 0.3) },
  { id: 'seal', mat: 'epdm', explode: [22, 14, 0], shape: roundedPoly(rect(14, 74, 15, 86), 0.3) },
  { id: 'glass', mat: 'glass', explode: [0, 46, 0], shape: roundedPoly(rect(-14, 66, -10, 150), 0.4) },
  { id: 'glass', mat: 'glass', explode: [0, 46, 0], shape: roundedPoly(rect(10, 66, 14, 150), 0.4) },
  { id: 'spacer', mat: 'anodise', explode: [0, 46, 0], shape: withHoles(rect(-10, 66, 10, 74), 0.5, [rect(-8.5, 67.3, 8.5, 72.7)], 0.3) },
];
// Points d'ancrage des étiquettes (mm, avant éclatement) et index de la pièce qui les déplace.
export const CUTAWAY_LABELS = [
  { key: 'outer', at: [-24, 32, 30], follows: 0 },
  { key: 'strip', at: [0, 56, 30], follows: 3 },
  { key: 'inner', at: [24, 32, 30], follows: 1 },
  { key: 'glass', at: [-12, 140, 0], follows: 7 },
  { key: 'seal', at: [-14.5, 82, 30], follows: 5 },
];

export function extrudeSection(shape, depthMM) {
  const depth = depthMM * MM;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments: 4, steps: 1,
    bevelEnabled: true, bevelSize: 0.35 * MM, bevelThickness: 0.35 * MM, bevelSegments: 2,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
