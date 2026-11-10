// Scène WebGL de l'aperçu 3D (Three.js, échelle réelle en mètres).
// Studio sombre : une barre de profilé sort de filière, le cadre s'assemble à 45°,
// la baie coulisse et la caméra la traverse, la coupe de la rupture de pont
// thermique s'éclate, puis la baie revient sur un plateau tournant pour les finitions.
// Tout dépend de la progression P (0 → 5) calculée à partir du défilement.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  MM, DORMANT, DORMANT_INNER, DORMANT_SEALS, SASH, SASH_GLAZING, SASH_SEALS, SPACER,
  CUTAWAY, CUTAWAY_LABELS, mitredBar, mitredFrame, framePoses, extrudeSection,
} from './geometry.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const W = 2.2, H = 1.5;          // baie coulissante deux vantaux, cotes extérieures
const CUT_Z = -5.2;              // la coupe éclatée et le plateau des finitions
const CUT_SCALE = 10;            // la coupe est montrée à l'échelle 10:1
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
// Mélange additif qui n'écrit pas l'alpha : le canevas reste transparent sous les reflets et la lumière.
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };

export const FINISHES = {
  anodise: { label: 'Anodisé', code: 'Naturel', swatch: 'linear-gradient(135deg,#f2f3f4,#9da1a5 55%,#e2e4e6)', color: '#d5d7d9', metalness: 1, roughness: 0.26, clearcoat: 0.001, normal: 'brush', ns: 0.08, rough: 'brush', aniso: 0.7 },
  grisNuit: { label: 'Gris nuit', code: 'RAL 7021', swatch: '#2e3234', color: '#2e3234', metalness: 0.15, roughness: 0.5, clearcoat: 0.35, normal: 'peel', ns: 0.18 },
  quartz: { label: 'Quartz', code: 'RAL 1019', swatch: '#a4927c', color: '#a4927c', metalness: 0.15, roughness: 0.5, clearcoat: 0.35, normal: 'peel', ns: 0.18 },
  noir: { label: 'Noir', code: 'RAL 9005', swatch: '#151617', color: '#111213', metalness: 0.1, roughness: 0.38, clearcoat: 0.5, normal: 'peel', ns: 0.14 },
  blanc: { label: 'Blanc', code: 'RAL 9016', swatch: '#efeee9', color: '#eeede8', metalness: 0.05, roughness: 0.5, clearcoat: 0.3, normal: 'peel', ns: 0.14 },
  bois: { label: 'Effet bois', code: 'Décor', swatch: 'linear-gradient(90deg,#6b4a2e,#8a6240 40%,#5d3f26 70%,#7a5634)', color: '#ffffff', metalness: 0.02, roughness: 0.55, clearcoat: 0.3, normal: 'peel', ns: 0.08, map: 'wood' },
};

// ---------- Textures procédurales ----------
function periodicNoise(size, cells, seed) {
  const rnd = (x, y) => { const s = Math.sin((x % cells) * 127.1 + (y % cells) * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    out[y * size + x] = mix(mix(rnd(ix, iy), rnd(ix + 1, iy), sx), mix(rnd(ix, iy + 1), rnd(ix + 1, iy + 1), sx), sy);
  }
  return out;
}
function heightToNormal(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x + size - 1) % size)];
    const dy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    data.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
  }
  return data;
}
function dataTexture(data, size, repeat, anisotropy) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}
function createTextures(mobile, anisotropy) {
  // Peau d'orange du thermolaquage.
  const ps = 256, pa = periodicNoise(ps, 32, 1), pb = periodicNoise(ps, 64, 2);
  const peel = dataTexture(heightToNormal(pa.map((v, i) => v * 0.7 + pb[i] * 0.3), ps, 2.2), ps, 24, anisotropy);
  // Brossage de l'anodisé : stries fines dans le sens de la barre.
  const bs = mobile ? 256 : 512, streak = periodicNoise(bs, bs / 2, 3), wave = periodicNoise(bs, 6, 4);
  const h = new Float32Array(bs * bs);
  for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) h[y * bs + x] = streak[(y % 4) * bs + x] * 0.85 + wave[y * bs + x] * 0.15;
  const brushNormal = dataTexture(heightToNormal(h, bs, 1.4), bs, 4, anisotropy);
  const rough = new Uint8Array(bs * bs * 4);
  for (let i = 0; i < bs * bs; i++) { const v = 200 + (h[i] - 0.5) * 70; rough.set([v, v, v, 255], i * 4); }
  const brushRough = dataTexture(rough, bs, 4, anisotropy);
  // Décor bois : veinage dans le sens de la barre.
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#6b4a2e'); grd.addColorStop(0.5, '#7d5836'); grd.addColorStop(1, '#664429');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    const x = rnd() * 256, dark = rnd() < 0.6, amp = 1 + rnd() * 3, freq = 0.004 + rnd() * 0.01, ph = rnd() * 6.28;
    g.strokeStyle = dark ? `rgba(40,24,12,${0.12 + rnd() * 0.35})` : `rgba(176,126,80,${0.08 + rnd() * 0.2})`;
    g.lineWidth = 0.4 + rnd() * 1.8;
    g.beginPath();
    for (let y = 0; y <= 512; y += 8) { const xx = x + Math.sin(y * freq + ph) * amp; if (y) g.lineTo(xx, y); else g.moveTo(xx, y); }
    g.stroke();
  }
  const wood = new THREE.CanvasTexture(c);
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(9, 0.45);
  wood.anisotropy = anisotropy;
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  white.needsUpdate = true;
  return { peel, brush: brushNormal, brushRough, wood, white };
}

// ---------- Studio : réflexions de boîtes à lumière, cuivrées au fond ----------
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: '#0c0c0e', side: THREE.BackSide })));
  const panel = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(10, 3, '#ffffff', 7, [0, 6.5, 1.5]);       // boîte à lumière zénithale
  panel(1.6, 9, '#ffffff', 6, [-8, 1, 3]);         // bande gauche
  panel(1.6, 9, '#fff2e2', 4.5, [8, 1, -1]);       // bande droite
  panel(8, 4, '#c08a52', 3.2, [0, 1.8, -9]);       // panneau cuivré au fond
  panel(5, 1.6, '#ffffff', 2.4, [3, -2, 8]);       // débouchage bas
  panel(3, 3, '#ffffff', 3, [-5, 3, 7]);           // face avant gauche
  panel(7, 2, '#fff6ec', 2.6, [1.5, 4, 9]);        // face avant haute : éclaire les faces vues de front
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return texture;
}

// La coupe est montrée à l'échelle 10:1 : ses textures de surface doivent rester fines.
function scaledClone(material, k) {
  const m = material.clone();
  for (const key of ['normalMap', 'roughnessMap']) {
    if (!m[key]) continue;
    m[key] = m[key].clone();
    m[key].repeat.multiplyScalar(k);
    m[key].needsUpdate = true;
  }
  m.normalScale = m.normalScale.clone().multiplyScalar(0.6);
  return m;
}

function createMaterials(tex, mobile) {
  const aniso = mobile ? {} : { anisotropy: 0.001, anisotropyRotation: Math.PI / 2 };
  const f = FINISHES.anodise;
  const finish = new THREE.MeshPhysicalMaterial({
    color: f.color, metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: 0.32,
    map: tex.white, normalMap: tex.brush, normalScale: new THREE.Vector2(f.ns, f.ns), roughnessMap: tex.brushRough,
    ...(mobile ? {} : { anisotropy: f.aniso, anisotropyRotation: Math.PI / 2 }),
  });
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: '#2e3234', metalness: 0.15, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.32, normalMap: tex.peel, normalScale: new THREE.Vector2(0.18, 0.18),
  });
  const anodise = new THREE.MeshPhysicalMaterial({
    color: '#d5d7d9', metalness: 1, roughness: 0.36, roughnessMap: tex.brushRough, normalMap: tex.brush,
    normalScale: new THREE.Vector2(0.08, 0.08), ...(mobile ? {} : { anisotropy: 0.7, anisotropyRotation: Math.PI / 2 }),
  });
  return {
    finish, anodise, lacquer, anodiseCut: scaledClone(anodise, 10), lacquerCut: scaledClone(lacquer, 6),
    epdm: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.86, metalness: 0 }),
    poly: new THREE.MeshStandardMaterial({ color: '#1d1e1f', roughness: 0.62, metalness: 0, emissive: new THREE.Color('#b8834f'), emissiveIntensity: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: '#2b2d2f', roughness: 0.42, metalness: 0.85 }),
    // Verre sans transmission (pas de second rendu de la scène) : une feuille teintée
    // qui assombrit légèrement, une feuille miroir additive qui porte les reflets du studio.
    glassTint: new THREE.MeshBasicMaterial({ color: '#0b1213', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    glassShine: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.05, transparent: true, opacity: 1, depthWrite: false, envMapIntensity: 0.32, side: THREE.DoubleSide, ...ADD }),
    cutGlass: new THREE.MeshPhysicalMaterial({ color: '#9fc2bb', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.42, envMapIntensity: 2, depthWrite: false }),
  };
}

function shadowBlob(w, d) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main(){ vec2 d = (vUv - .5) * 2.; gl_FragColor = vec4(0., 0., 0., exp(-dot(d, d) * 3.) * uOpacity); }',
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// ---------- Baie coulissante ----------
function buildSash(w, h, m, handleSide) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mitredFrame(SASH, w, h), m.finish));
  for (const s of SASH_SEALS) g.add(new THREE.Mesh(mitredFrame(s, w, h), m.epdm));
  const gw = w - 2 * SASH_GLAZING * MM + 0.01, gh = h - 2 * SASH_GLAZING * MM + 0.01;
  const pane = new THREE.BoxGeometry(gw, gh, 0.004);
  const tint = new THREE.Mesh(pane, m.glassTint), shine = new THREE.Mesh(pane, m.glassShine);
  tint.position.z = -0.01; shine.position.z = 0.01; tint.renderOrder = 2; shine.renderOrder = 3;
  g.add(tint, shine);
  g.add(new THREE.Mesh(mitredFrame(SPACER, gw, gh), m.anodise));
  if (handleSide) {
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.17, 0.016, 3, 0.006), m.steel);
    handle.position.set(handleSide * (w / 2 - 0.026), 0, 0.026);
    g.add(handle);
  }
  return g;
}

function buildWindow(m) {
  const root = new THREE.Group();
  const centre = 0.03; // ≈ moitié de la hauteur du dormant : pivot au centre de la barre
  const bars = framePoses(W, H).map((p) => {
    const mesh = new THREE.Mesh(mitredBar(DORMANT, p.L), m.finish);
    mesh.position.y = -centre;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    root.add(pivot);
    const q = new THREE.Quaternion().setFromAxisAngle(AXIS_Z, p.rot);
    return { pivot, finalPos: new THREE.Vector3(p.x, p.y, 0).add(new THREE.Vector3(0, centre, 0).applyQuaternion(q)), finalQuat: q };
  });
  // Trajectoires d'arrivée : la première barre est celle du héros, les trois autres entrent hors champ.
  const loose = [
    null,
    { pos: new THREE.Vector3(0.6, 2.8, -1.2), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.3, Math.PI + 0.7)) },
    { pos: new THREE.Vector3(-3.6, 0.4, -0.9), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, -Math.PI / 2 + 0.9)) },
    { pos: new THREE.Vector3(3.6, -0.5, -0.7), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, -0.6, Math.PI / 2 - 0.8)) },
  ];
  const seals = new THREE.Group();
  for (const s of DORMANT_SEALS) seals.add(new THREE.Mesh(mitredFrame(s, W, H), m.epdm));
  root.add(seals);
  const innerW = W - 2 * DORMANT_INNER * MM, innerH = H - 2 * DORMANT_INNER * MM;
  const overlap = 0.04, sw = innerW / 2 + overlap / 2, sh = innerH - 0.012;
  const front = buildSash(sw, sh, m, -1), back = buildSash(sw, sh, m, 0);
  root.add(front, back);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(W * 3.2, 3.2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, ...ADD, uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main(){ vec2 d = (vUv - .5) * 2.; float g = exp(-dot(d, d) * 2.2); gl_FragColor = vec4(vec3(.33, .25, .17) * g * uOpacity, 1.); }',
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -H / 2 - 0.065;
  root.add(pool);
  const shadow = shadowBlob(W * 1.5, 1.1);
  shadow.position.y = -H / 2 - 0.06;
  root.add(shadow);
  return {
    root, bars, loose, seals, front, back, shadow, pool,
    frontPos: new THREE.Vector3(-innerW / 4 + overlap / 4 - 0.002, 0.004, 0.0215),
    backPos: new THREE.Vector3(innerW / 4 - overlap / 4 + 0.002, 0.004, -0.0215),
    travel: sw - overlap - 0.03,
  };
}

function buildCutaway(m) {
  const root = new THREE.Group();
  root.position.set(0, 0, CUT_Z);
  root.scale.setScalar(CUT_SCALE);
  const inner = new THREE.Group();
  inner.position.y = -62 * MM; // centre la coupe (0 → 150 mm) autour de l'axe
  root.add(inner);
  const parts = CUTAWAY.map((p) => {
    const mat = { glass: m.cutGlass, finish: m.lacquerCut, anodise: m.anodiseCut }[p.mat] || m[p.mat];
    const mesh = new THREE.Mesh(extrudeSection(p.shape, 60), mat);
    if (p.mat === 'glass') mesh.renderOrder = 2;
    inner.add(mesh);
    return { mesh, explode: new THREE.Vector3(...p.explode).multiplyScalar(MM) };
  });
  const shadow = shadowBlob(0.2, 0.12);
  shadow.position.y = -66 * MM;
  inner.add(shadow);
  return { root, inner, parts, shadow };
}

// ---------- Trajectoire caméra ----------
// fit : largeur (m) à garder visible ; sur un écran étroit la caméra recule d'autant.
// tall : cible et position de remplacement pour les écrans en portrait.
const KEYS = [
  { P: 0, pos: [0, 0.1, 2.4], tgt: [0, 0.05, 1.0], tall: { pos: [0.1, -0.12, 2.75], tgt: [0.12, 0, 1.5] } },
  { P: 1, pos: [-0.6, 0.5, 4.5], tgt: [0.95, -0.05, 0], fit: 2.4, tall: { pos: [0, 0.4, 4.3], tgt: [0, -0.35, 0] } },
  { P: 1.5, pos: [-2.3, 0.9, 4.5], tgt: [1.05, 0, 0], fit: 2.8, tall: { pos: [-2, 0.8, 4], tgt: [0, -0.35, 0] } },
  { P: 2, pos: [0.6, 0.14, 5.5], tgt: [1.15, 0, 0], fit: 2.9, tall: { pos: [0, 0.1, 5.3], tgt: [0, -0.45, 0] } },
  { P: 2.45, pos: [-0.38, 0.05, 2.5], tgt: [-0.52, 0, 0] },
  { P: 2.75, pos: [-0.54, 0.02, 0.35], tgt: [-0.52, 0, -3] },
  { P: 2.95, pos: [-0.42, 0.06, -1.4], tgt: [-0.12, 0.05, CUT_Z] },
  { P: 3.2, pos: [-0.05, 0.25, -1.75], tgt: [-0.22, 0.1, CUT_Z], fit: 2.0, tall: { pos: [0, 0.2, -2.6], tgt: [0, -0.05, CUT_Z] } },
  { P: 3.55, pos: [1.45, 0.85, -2.2], tgt: [-0.25, 0.1, CUT_Z], fit: 2.2, tall: { pos: [1.2, 0.8, -3.3], tgt: [0, -0.05, CUT_Z] } },
  { P: 3.9, pos: [-1.45, 0.5, -2.2], tgt: [-0.25, 0.1, CUT_Z], fit: 2.2, tall: { pos: [-1.3, 0.45, -3.2], tgt: [0, -0.05, CUT_Z] } },
  { P: 4.3, pos: [-0.5, 0.3, CUT_Z + 5.6], tgt: [-0.85, 0.02, CUT_Z], fit: 3.0, tall: { pos: [0, 0.3, CUT_Z + 5.4], tgt: [0, -0.25, CUT_Z] } },
  { P: 5, pos: [-0.5, 0.42, CUT_Z + 5.3], tgt: [-0.85, 0.02, CUT_Z], fit: 3.0, tall: { pos: [0, 0.42, CUT_Z + 5.1], tgt: [0, -0.25, CUT_Z] } },
];
function buildCurves(aspect, fov) {
  const tall = aspect < 0.9;
  const halfTan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const pos = [], tgt = [];
  for (const k of KEYS) {
    const t = new THREE.Vector3(...((tall && k.tall?.tgt) || k.tgt));
    const p = new THREE.Vector3(...((tall && k.tall?.pos) || k.pos));
    if (k.fit) {
      const d = p.distanceTo(t), visible = 2 * d * halfTan * aspect;
      if (visible < k.fit) p.sub(t).multiplyScalar(k.fit / visible).add(t);
    }
    pos.push(p); tgt.push(t);
  }
  return { pos: new THREE.CatmullRomCurve3(pos, false, 'centripetal'), tgt: new THREE.CatmullRomCurve3(tgt, false, 'centripetal') };
}
function curveParam(P) {
  const n = KEYS.length;
  if (P <= KEYS[0].P) return 0;
  if (P >= KEYS[n - 1].P) return 1;
  let i = 0;
  while (i < n - 2 && P > KEYS[i + 1].P) i++;
  return (i + (P - KEYS[i].P) / (KEYS[i + 1].P - KEYS[i].P)) / (n - 1);
}

// ---------- Scène ----------
export async function createStage(canvas, { mobile = false, reducedMotion = false, onProgress = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  onProgress(0.35);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1;
  scene.add(new THREE.HemisphereLight('#f4efe6', '#16130f', 0.6));
  const key = new THREE.DirectionalLight('#fff4e6', 2.2);
  key.position.set(-3, 5, 4);
  const rim = new THREE.DirectionalLight('#d39a5e', 2.4);
  rim.position.set(4, 2, -5);
  scene.add(key, rim);
  onProgress(0.5);

  const tex = createTextures(mobile, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const mats = createMaterials(tex, mobile);
  const win = buildWindow(mats);
  const cut = buildCutaway(mats);
  scene.add(win.root, cut.root);
  onProgress(0.7);

  const fov = 32;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 60);
  let curves = buildCurves(16 / 9, fov);

  // Résolution adaptative : on baisse la densité de pixels si les images ralentissent.
  const maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  let dpr = maxDpr, frameMs = 16, calm = 0;
  let width = 1, height = 1;
  function resize() {
    width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    curves = buildCurves(camera.aspect, fov);
  }
  resize();

  // Préchauffe les shaders : tout est rendu visible le temps de la compilation.
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  camera.position.set(0, 0.5, 6); camera.lookAt(0, 0, 0);
  await renderer.compileAsync(scene, camera);
  hidden.forEach((o) => { o.visible = false; });
  onProgress(0.95);

  // ---------- État ----------
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
  const look = new THREE.Vector2(), right = new THREE.Vector3(), up = new THREE.Vector3();
  // Héros : le bout coupé de la barre à ~0,9 m de l'objectif, la barre fuyant vers la droite.
  const heroAxis = new THREE.Vector3(0.631, 0.067, -0.773).normalize();
  const heroQuat = new THREE.Quaternion().setFromUnitVectors(AXIS_X, heroAxis).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, 0.5));
  const heroPos = new THREE.Vector3(0.81, 0.135, 0.65);
  const spin = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const startTime = performance.now() / 1000;
  let first = true, turn = -0.55, turnVel = 0, dragging = false;
  let finishT = 1, currentFinish = 'anodise';
  const labelPts = CUTAWAY_LABELS.map(() => ({ x: 0, y: 0, a: 0 }));

  function finishParams(f) {
    return {
      c: new THREE.Color(f.color), metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat,
      ns: f.ns, normal: f.normal === 'brush' ? tex.brush : tex.peel, rough: f.rough === 'brush' ? tex.brushRough : tex.white,
      map: f.map === 'wood' ? tex.wood : tex.white, aniso: f.aniso || 0,
    };
  }
  let fromP = finishParams(FINISHES.anodise), toP = fromP;
  function applyFinish(t) {
    const m = mats.finish, e = easeInOut(t);
    m.color.copy(fromP.c).lerp(toP.c, e);
    m.metalness = mix(fromP.metalness, toP.metalness, e);
    m.roughness = mix(fromP.roughness, toP.roughness, e);
    m.clearcoat = Math.max(0.001, mix(fromP.clearcoat, toP.clearcoat, e));
    const second = t >= 0.5;
    m.normalMap = second ? toP.normal : fromP.normal;
    m.roughnessMap = second ? toP.rough : fromP.rough;
    m.map = second ? toP.map : fromP.map;
    m.normalScale.setScalar(second ? toP.ns * (2 * t - 1) : fromP.ns * (1 - 2 * t));
    if (!mobile) m.anisotropy = Math.max(0.001, mix(fromP.aniso, toP.aniso, e));
  }

  function update({ P = 0, dt = 1 / 60, time = performance.now() / 1000, pointer = { x: 0, y: 0 }, snap = false }) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    look.x += (pointer.x - look.x) * k; look.y += (pointer.y - look.y) * k;
    const idle = reducedMotion ? 0 : time - startTime;
    const a = clamp01(P - 1), o = clamp01(P - 2), c = clamp01(P - 3), f = clamp01(P - 4);

    // Entrée : la barre sort de filière.
    const intro = reducedMotion || snap ? 1 : easeOutExpo(clamp01((time - startTime - 0.15) / 1.9));

    // Cadre : la barre du héros rejoint sa place, les trois autres arrivent en arc.
    win.bars.forEach((b, i) => {
      let kk, lp, lq;
      if (i === 0) {
        kk = easeInOut(ramp(0, 0.42, a));
        spin.setFromAxisAngle(AXIS_X, idle * 0.22 + look.x * 0.5);
        lq = tmpQ.copy(heroQuat).multiply(spin);
        lp = tmpV.copy(heroPos).addScaledVector(heroAxis, (1 - intro) * 3.2);
        lp.y += Math.sin(idle * 0.8) * 0.012 + look.y * 0.02;
      } else {
        kk = easeInOut(ramp(0.08 + i * 0.09, 0.46 + i * 0.09, a));
        lp = tmpV.copy(win.loose[i].pos); lq = tmpQ.copy(win.loose[i].quat);
      }
      b.pivot.position.lerpVectors(lp, b.finalPos, kk);
      if (i > 0) b.pivot.position.z += Math.sin(kk * Math.PI) * 0.7;
      b.pivot.quaternion.slerpQuaternions(lq, b.finalQuat, kk);
      b.pivot.visible = i === 0 || kk > 0.002;
    });
    win.seals.visible = a > 0.72;
    const sb = easeInOut(ramp(0.5, 0.78, a)), sf = easeInOut(ramp(0.6, 0.88, a));
    const slide = P < 3.5 ? win.travel * easeInOut(ramp(0.05, 0.45, o)) : 0;
    win.front.position.copy(win.frontPos).add(tmpV.set(slide, 0, (1 - sf) * 1.3));
    win.front.rotation.y = (1 - sf) * 0.55;
    win.front.visible = sf > 0.002;
    win.back.position.copy(win.backPos).add(tmpV.set(0, 0, -(1 - sb) * 1.4));
    win.back.rotation.y = -(1 - sb) * 0.5;
    win.back.visible = sb > 0.002;
    const gl = ramp(0.78, 1, a);
    mats.glassTint.opacity = 0.3 * gl; mats.glassShine.opacity = gl;
    mats.glassTint.visible = mats.glassShine.visible = gl > 0.002;

    // Plateau tournant des finitions (la baie y est replacée hors champ, sous la coupe).
    if (P < 3.5) {
      win.root.position.set(0, 0, 0);
      win.root.rotation.y = 0;
      win.root.visible = P < 3.05;
      win.shadow.material.uniforms.uOpacity.value = 0.55 * ramp(0.4, 0.9, a);
      win.pool.material.uniforms.uOpacity.value = ramp(0.3, 1, a);
    } else {
      const rise = easeInOut(ramp(3.92, 4.32, P));
      if (!dragging) {
        turnVel *= Math.exp(-dt * 2.5);
        turn += turnVel * dt + (reducedMotion || f <= 0 ? 0 : dt * 0.22 * (1 - Math.min(1, Math.abs(turnVel))));
      }
      win.root.position.set(0, mix(-2.4, 0, rise), CUT_Z);
      win.root.rotation.y = turn + (1 - rise) * 1.4;
      win.root.visible = rise > 0.001;
      win.shadow.material.uniforms.uOpacity.value = 0.55 * rise;
      win.pool.material.uniforms.uOpacity.value = rise;
    }

    // Coupe éclatée de la rupture de pont thermique.
    const cin = easeInOut(ramp(2.82, 3.12, P)), cout = easeInOut(ramp(3.9, 4.15, P));
    cut.root.visible = cin > 0.001 && cout < 0.999;
    cut.root.position.y = mix(-1.6, 0, cin) + cout * 1.8;
    cut.inner.rotation.set(0.1 + look.y * 0.12, -0.32 + (1 - cin) * 0.9 + look.x * 0.3 + Math.sin(idle * 0.3) * 0.05, 0);
    const e = easeInOut(ramp(0.12, 0.5, c)) * (1 - easeInOut(ramp(0.84, 0.97, c)));
    cut.parts.forEach((pt) => pt.mesh.position.copy(pt.explode).multiplyScalar(e));
    mats.poly.emissiveIntensity = 0.6 * ramp(0.4, 0.55, c) * (1 - ramp(0.8, 0.9, c)) * (0.75 + 0.25 * Math.sin(idle * 3));
    cut.shadow.material.uniforms.uOpacity.value = 0.5 * cin * (1 - cout);

    // Matière : transition de finition.
    if (finishT < 1) { finishT = Math.min(1, finishT + dt / 0.9); applyFinish(snap ? 1 : finishT); }

    // Lumières et reflets qui glissent lentement sur le métal.
    scene.environmentRotation.y = idle * 0.06 + look.x * 0.35;
    rim.position.set(Math.cos(idle * 0.25) * 5, 2 + Math.sin(idle * 0.4), -5 + Math.sin(idle * 0.25) * 2);
    rim.intensity = 2.8 + (1 - intro) * 4;
    key.intensity = 2.2 * mix(0.35, 1, intro);

    // Caméra : spline sur les images clés, amortie, parallaxe du pointeur.
    const u = curveParam(P);
    curves.pos.getPoint(u, wantPos); curves.tgt.getPoint(u, wantTgt);
    if (!reducedMotion && P < 0.6) wantPos.z += (1 - intro) * 0.9;
    const dist = wantPos.distanceTo(wantTgt);
    camera.position.copy(wantPos); camera.lookAt(wantTgt);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const par = reducedMotion ? 0 : 0.035 * dist;
    wantPos.addScaledVector(right, look.x * par).addScaledVector(up, look.y * par * 0.6);
    const ck = snap || first ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(wantPos, ck); camTgt.lerp(wantTgt, ck);
    first = false;
    camera.position.copy(camPos); camera.lookAt(camTgt);
    camera.updateMatrixWorld();

    // Étiquettes de la coupe projetées à l'écran.
    const la = ramp(0.45, 0.56, c) * (1 - ramp(0.8, 0.86, c)) * (cut.root.visible ? 1 : 0);
    if (la > 0) cut.root.updateMatrixWorld(true);
    CUTAWAY_LABELS.forEach((l, i) => {
      const pt = labelPts[i];
      pt.a = la;
      if (la <= 0) return;
      tmpV.set(l.at[0] * MM, l.at[1] * MM, l.at[2] * MM).add(cut.parts[l.follows].mesh.position);
      cut.inner.localToWorld(tmpV).project(camera);
      pt.x = (tmpV.x * 0.5 + 0.5) * width; pt.y = (-tmpV.y * 0.5 + 0.5) * height;
    });
  }

  function render(dt = 1 / 60) {
    renderer.render(scene, camera);
    // Ajuste la densité de pixels selon le temps réel entre deux images.
    frameMs = mix(frameMs, Math.min(100, dt * 1000), 0.06);
    calm += dt;
    if (frameMs > 24 && dpr > 0.7 && calm > 0.6) { dpr = Math.max(0.7, dpr * 0.85); calm = 0; frameMs = 17; resize(); }
    else if (frameMs < 15 && dpr < maxDpr && calm > 2.5) { dpr = Math.min(maxDpr, dpr * 1.1); calm = 0; resize(); }
  }

  return {
    update, render, resize, startTime,
    labels: () => labelPts,
    setFinish(name) {
      if (!FINISHES[name] || name === currentFinish) return;
      fromP = finishT >= 1 ? finishParams(FINISHES[currentFinish]) : (() => { applyFinish(finishT); const m = mats.finish; return { ...toP, c: m.color.clone(), metalness: m.metalness, roughness: m.roughness, clearcoat: m.clearcoat }; })();
      toP = finishParams(FINISHES[name]);
      currentFinish = name; finishT = 0;
    },
    drag(dx) { dragging = true; turn += dx * 0.008; turnVel = dx * 0.5; },
    release() { dragging = false; turnVel = Math.max(-3, Math.min(3, turnVel)); },
    info: () => ({ dpr: +dpr.toFixed(2), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  };
}
