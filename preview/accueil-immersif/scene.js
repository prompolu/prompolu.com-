// Scène 3D réaliste de l'aperçu, à l'échelle réelle (mètres) :
// une baie coulissante posée sur une route au coucher du soleil, une file de
// dormants à coupe d'onglet qui forme un passage, puis une grande baie levante-
// coulissante qui s'ouvre sur la lumière. Tout dépend de la progression p (0 → 1).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const MM = 0.001;

// Direction de la route et du soleil dans la photo HDR (goegap_road, Poly Haven, CC0).
// La scène est tournée pour que son axe −z suive la route.
const ROAD_YAW = -1.4137;
const SUN_DIR = new THREE.Vector3(0.802, 0.108, 0.587).normalize();
const CAPTURE_HEIGHT = 1.7;

// ---------- Profilés ----------
// Coupe en millimètres : a = distance depuis le bord extérieur du cadre, b = profondeur.
function roundedContour(points, radius) {
  const s = new THREE.Shape();
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

// Dormant coulissant (≈ 86 mm de profondeur) : lèvres avant et arrière, deux rails de roulement.
const DORMANT = roundedContour([
  [0, -43], [58, -43], [58, -39.5], [49, -39.5], [49, -21], [61, -21], [61, -17.5], [49, -17.5],
  [49, 11], [61, 11], [61, 14.5], [49, 14.5], [49, 39.5], [58, 39.5], [58, 43], [0, 43],
  [0, 18], [-2.5, 18], [-2.5, 9], [0, 9], [0, -9], [-2.5, -9], [-2.5, -18], [0, -18],
], 1.1);
const DORMANT_FACE = 61 * MM;
// Joints-brosses EPDM sous les lèvres.
const DORMANT_SEALS = [[[52, -39.5], [58, -39.5], [58, -37.5], [52, -37.5]], [[52, 37.5], [58, 37.5], [58, 39.5], [52, 39.5]]].map((p) => roundedContour(p, 0.4));
// Ouvrant (52 × 32 mm) avec feuillure de vitrage de 26 mm.
const SASH = roundedContour([[0, -16], [52, -16], [52, -13], [37, -13], [37, 13], [52, 13], [52, 16], [0, 16], [0, 4], [-3, 4], [-3, -4], [0, -4]], 0.9);
const SASH_FACE = 52 * MM;
const SASH_SEALS = [[[47, -13], [52, -13], [52, -11.8], [47, -11.8]], [[47, 11.8], [52, 11.8], [52, 13], [47, 13]]].map((p) => roundedContour(p, 0.3));
const SPACER = roundedContour([[0, -8], [8, -8], [8, 8], [0, 8]], 0.6);

// Barre extrudée sur sa longueur puis coupée à 45° aux deux bouts.
function mitredBar(shape, L) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false, curveSegments: 3, steps: 1 });
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i), b = pos.getY(i), s = pos.getZ(i);
    pos.setXYZ(i, a + (s / L) * (L - 2 * a) - L / 2, a, b);
    const na = nor.getX(i), nb = nor.getY(i), ns = nor.getZ(i);
    if (Math.abs(ns) > 0.5) nor.setXYZ(i, ns < 0 ? -0.7071 : 0.7071, 0.7071, 0);
    else nor.setXYZ(i, 0, na, nb);
  }
  return g;
}
// Cadre complet à coupes d'onglet, centré, dans le plan XY, profondeur en Z.
function mitredFrame(shape, W, H) {
  const parts = [];
  for (const [L, rot, tx, ty] of [[W, 0, 0, -H / 2], [W, Math.PI, 0, H / 2], [H, -Math.PI / 2, -W / 2, 0], [H, Math.PI / 2, W / 2, 0]]) {
    const g = mitredBar(shape, L);
    g.rotateZ(rot);
    g.translate(tx, ty, 0);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// ---------- Matières ----------
function periodicNoise(size, cells, seed) {
  const rnd = (x, y) => { const s = Math.sin((x % cells) * 127.1 + (y % cells) * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = mix(mix(rnd(ix, iy), rnd(ix + 1, iy), sx), mix(rnd(ix, iy + 1), rnd(ix + 1, iy + 1), sx), sy);
    out[y * size + x] = v;
  }
  return out;
}
function heightToNormal(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x + size - 1) % size)];
    const dy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    data.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], i * 4);
  }
  return data;
}
function dataTexture(data, size, repeat) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
// Peau d'orange du thermolaquage.
function orangePeel() {
  const size = 256;
  const a = periodicNoise(size, 32, 1), b = periodicNoise(size, 64, 2);
  const h = a.map((v, i) => v * 0.7 + b[i] * 0.3);
  return dataTexture(heightToNormal(h, size, 2.2), size, 24);
}
// Brossage de l'anodisé : stries fines dans le sens de la barre (axe V).
function brushed() {
  const size = 512;
  const streak = periodicNoise(size, 256, 3), wave = periodicNoise(size, 6, 4);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = streak[(y % 4) * size + x] * 0.85 + wave[y * size + x] * 0.15;
  const normal = dataTexture(heightToNormal(h, size, 1.4), size, 4);
  const rough = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = 200 + (h[i] - 0.5) * 70; rough.set([v, v, v, 255], i * 4); }
  return { normal, rough: dataTexture(rough, size, 4) };
}

function materials(mobile) {
  const peel = orangePeel();
  const brush = brushed();
  const powder = (hex) => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0, roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.38, normalMap: peel, normalScale: new THREE.Vector2(0.16, 0.16), envMapIntensity: 1 });
  const anodised = (hex, rough) => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 1, roughness: rough, roughnessMap: brush.rough, normalMap: brush.normal, normalScale: new THREE.Vector2(0.08, 0.08), anisotropy: 0.7, anisotropyRotation: Math.PI / 2, envMapIntensity: 1.1 });
  const glass = mobile
    ? new THREE.MeshPhysicalMaterial({ color: '#d8e4e2', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, envMapIntensity: 1.4 })
    : new THREE.MeshPhysicalMaterial({ color: '#f4f8f7', metalness: 0, roughness: 0.0, transmission: 1, thickness: 0.004, ior: 1.52, attenuationColor: new THREE.Color('#bfe3d4'), attenuationDistance: 0.18, specularIntensity: 1, envMapIntensity: 1.25 });
  return {
    grisNuit: powder('#2e3234'),      // RAL 7021
    quartz: powder('#a4927c'),        // RAL 1019
    anodise: anodised('#d2d4d6', 0.3),
    bronze: anodised('#7d5a3a', 0.32),
    epdm: new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.86, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: '#3b3d3f', roughness: 0.55, metalness: 0.8 }),
    glass,
  };
}

// Vitrage isolant 4/16/4 : deux verres, intercalaire alu et joint butyl noir.
function insulatedGlass(w, h, mats) {
  const g = new THREE.Group();
  const pane = new THREE.BoxGeometry(w, h, 0.004);
  for (const z of [-0.01, 0.01]) { const m = new THREE.Mesh(pane, mats.glass); m.position.z = z; g.add(m); }
  const spacer = new THREE.Mesh(mitredFrame(SPACER, w, h), mats.anodise);
  spacer.position.z = 0;
  const butyl = new THREE.Mesh(mitredFrame(roundedContour([[0, -8.5], [3, -8.5], [3, 8.5], [0, 8.5]], 0.3), w, h), mats.epdm);
  g.add(spacer, butyl);
  return g;
}

// Ouvrant complet : profilé, joints, vitrage et poignée.
function sash(w, h, mats, finish, handleSide) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(mitredFrame(SASH, w, h), finish);
  frame.castShadow = frame.receiveShadow = true;
  g.add(frame);
  for (const s of SASH_SEALS) g.add(new THREE.Mesh(mitredFrame(s, w, h), mats.epdm));
  const igu = insulatedGlass(w - 2 * 37 * MM, h - 2 * 37 * MM, mats);
  g.add(igu);
  if (handleSide) {
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.16, 0.014, 3, 0.006), mats.steel);
    handle.position.set(handleSide * (w / 2 - 0.026), 0, -0.024);
    handle.castShadow = true;
    g.add(handle);
  }
  return g;
}

// Baie coulissante deux vantaux : dormant + deux ouvrants sur deux rails.
function slidingWindow(W, H, mats, finish) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(mitredFrame(DORMANT, W, H), finish);
  frame.castShadow = frame.receiveShadow = true;
  g.add(frame);
  for (const s of DORMANT_SEALS) g.add(new THREE.Mesh(mitredFrame(s, W, H), mats.epdm));
  const innerW = W - 2 * 49 * MM, innerH = H - 2 * 49 * MM;
  const overlap = 0.04;
  const sw = innerW / 2 + overlap / 2, sh = innerH - 0.012;
  const front = sash(sw, sh, mats, finish, -1);
  const back = sash(sw, sh, mats, finish, 0);
  front.position.set(-innerW / 4 + overlap / 4 - 0.002, 0.004, -0.0215);
  back.position.set(innerW / 4 - overlap / 4 + 0.002, 0.004, 0.0215);
  g.add(front, back);
  g.userData = { front, back, travel: sw - overlap - 0.03, closedX: front.position.x, innerW, innerH };
  return g;
}

// Pieds acier qui tiennent chaque cadre debout sur la route.
function feetGeometry(W) {
  const foot = new RoundedBoxGeometry(0.05, 0.03, 0.42, 2, 0.008);
  const parts = [-W / 2 + 0.12, W / 2 - 0.12].map((x) => foot.clone().translate(x, 0.015, 0));
  foot.dispose();
  return mergeGeometries(parts);
}

// ---------- Fond photographique projeté sur le sol ----------
function groundedSky(texture) {
  const geo = new THREE.SphereGeometry(140, 128, 64);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -CAPTURE_HEIGHT) {
    const y = pos.getY(i), k = -CAPTURE_HEIGHT / y;
    pos.setXYZ(i, pos.getX(i) * k, -CAPTURE_HEIGHT, pos.getZ(i) * k);
  }
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uPlate: { value: texture }, uGain: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `
      uniform sampler2D uPlate; uniform float uGain; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec2 uv = vec2(atan(d.z, d.x) * .15915494 + .5, asin(clamp(d.y, -1., 1.)) * .31830989 + .5);
        vec3 s = texture2D(uPlate, uv).rgb;
        vec3 r = pow(s, vec3(2.2));
        gl_FragColor = vec4(r / max(1. - r, vec3(.0045)) * uGain, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// Bande d'asphalte réelle sous les cadres, fondue dans la route de la photo
// (texture asphalt_04, Poly Haven, CC0).
function roadStrip(maps, length) {
  const geo = new THREE.PlaneGeometry(6.4, length, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -length / 2 + 8);
  for (const t of [maps.color, maps.normal, maps.arm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6.4 / 4.04, length / 4.04); t.anisotropy = 8; }
  maps.color.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: maps.color, normalMap: maps.normal, roughnessMap: maps.arm, aoMap: maps.arm, aoMapIntensity: 0.8, roughness: 1, metalness: 0, color: '#c9c2b8', transparent: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vStrip;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvStrip = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vStrip;').replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
      float side = smoothstep(0., .22, vStrip.x) * smoothstep(0., .22, 1. - vStrip.x);
      float ends = smoothstep(0., .04, vStrip.y) * smoothstep(0., .12, 1. - vStrip.y);
      diffuseColor.a *= side * ends;`);
  };
  mat.customProgramCacheKey = () => 'prompolu-road-strip-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = -5;
  return mesh;
}

// ---------- Étalonnage final : vignettage, grain, légère aberration ----------
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVignette: { value: 0.55 }, uGrain: { value: 0.028 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uFlash; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - .5;
      float ca = dot(d, d) * .004;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
      c *= mix(1., smoothstep(.98, .22, length(d * vec2(1., .82))), uVignette);
      c += (hash(vUv * uRes + fract(uTime * 7.) * 113.) - .5) * uGrain;
      c = mix(c, vec3(1., .985, .96), uFlash);
      gl_FragColor = vec4(c, 1.);
    }`,
};

// ---------- Mise en scène ----------
// Clés de caméra dans le repère de la route : [p, position, cible, focale verticale].
function cameraKeys(lastZ, bayZ, bayW) {
  const passX = -bayW / 4;
  return [
    [0.0, [3.9, 1.12, 5.2], [-0.55, 1.08, -1.6], 30],
    [0.1, [1.75, 0.82, 1.55], [0.55, 0.55, -0.2], 27],
    [0.19, [1.42, 0.42, 0.42], [1.05, 0.16, -0.05], 24],
    [0.27, [0.1, 1.28, 3.1], [0, 1.18, -8], 34],
    [0.37, [-0.55, 1.24, 0.35], [-0.4, 1.22, -9], 38],
    [0.8, [-0.1, 1.3, lastZ + 0.8], [passX * 0.6, 1.32, bayZ - 12], 40],
    [0.93, [passX, 1.36, bayZ - 1.6], [passX * 0.6, 1.5, bayZ - 18], 42],
    [1.0, [passX, 1.4, bayZ - 3], [passX * 0.6, 1.55, bayZ - 18], 42],
  ];
}
function cameraAt(keys, p) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [t0, a0, b0, f0] = keys[i], [t1, a1, b1, f1] = keys[i + 1];
  const lin = clamp01((p - t0) / (t1 - t0));
  // Dans le passage, l'allure reste régulière ; ailleurs, entrée et sortie adoucies.
  const k = t0 === 0.37 ? lin * lin * (1.5 - 0.5 * lin) : lin * lin * (3 - 2 * lin);
  return { pos: a0.map((v, j) => mix(v, a1[j], k)), target: b0.map((v, j) => mix(v, b1[j], k)), fov: mix(f0, f1, k) };
}

export async function createScene(canvas, { mobile = false, onProgress = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const manager = new THREE.LoadingManager();
  const loaded = { n: 0 };
  manager.onLoad = () => {};
  const tick = () => onProgress(0.06 + 0.6 * (++loaded.n / 6));
  const texLoader = new THREE.TextureLoader(manager);
  const loadTex = (url) => texLoader.loadAsync(url).then((t) => (tick(), t));
  const [hdr, plate, color, normal, arm] = await Promise.all([
    new RGBELoader(manager).loadAsync('media/goegap-road-1k.hdr').then((t) => (tick(), t)),
    loadTex(mobile ? 'media/goegap-road-2k.webp' : 'media/goegap-road-4k.webp'),
    loadTex('media/asphalt-color.webp'),
    loadTex('media/asphalt-normal.webp'),
    loadTex('media/asphalt-arm.webp'),
  ]);
  tick();
  plate.colorSpace = THREE.NoColorSpace;
  plate.generateMipmaps = false;
  plate.minFilter = THREE.LinearFilter;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(hdr);
  hdr.dispose(); pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.95;
  const sky = groundedSky(plate);
  scene.add(sky);

  const world = new THREE.Group();
  world.rotation.y = ROAD_YAW;
  scene.add(world);
  const mats = materials(mobile);

  // Soleil rasant (≈ 6° au-dessus de l'horizon), aligné sur celui de la photo.
  const sun = new THREE.DirectionalLight('#ffd7a3', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#bcd2ec', '#5d4c3b', 0.18));

  const road = roadStrip({ color, normal, arm }, 72);
  world.add(road);

  // Baie de tête, en gris nuit RAL 7021.
  const W = 2.4, H = 2.3;
  const hero = slidingWindow(W, H, mats, mats.grisNuit);
  hero.position.set(0, H / 2 + 0.03, 0);
  world.add(hero);

  // La file de dormants : quatre finitions, deux appels de dessin par finition.
  const N = mobile ? 14 : 20, GAP = 1.32, START = -2.1;
  const pattern = ['grisNuit', 'grisNuit', 'anodise', 'grisNuit', 'bronze', 'grisNuit', 'anodise', 'quartz'];
  const dormantGeo = mitredFrame(DORMANT, W, H);
  const sealGeo = mergeGeometries(DORMANT_SEALS.map((s) => mitredFrame(s, W, H)));
  const feetGeo = feetGeometry(W);
  const byFinish = {};
  pattern.forEach((f) => { byFinish[f] = 0; });
  for (let i = 0; i < N; i++) byFinish[pattern[i % pattern.length]]++;
  const rows = {};
  for (const [finish, count] of Object.entries(byFinish)) {
    const m = new THREE.InstancedMesh(dormantGeo, mats[finish], count);
    m.castShadow = m.receiveShadow = true;
    m.count = 0;
    rows[finish] = m;
    world.add(m);
  }
  const seals = new THREE.InstancedMesh(sealGeo, mats.epdm, N);
  const feet = new THREE.InstancedMesh(feetGeo, mats.steel, N + 1);
  feet.castShadow = true;
  world.add(seals, feet);
  const frameZ = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const z = START - i * GAP;
    frameZ.push(z);
    dummy.position.set(0, H / 2 + 0.03, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    const row = rows[pattern[i % pattern.length]];
    row.setMatrixAt(row.count++, dummy.matrix);
    seals.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0;
    dummy.updateMatrix();
    feet.setMatrixAt(i, dummy.matrix);
  }
  dummy.position.set(0, 0, 0); dummy.updateMatrix(); feet.setMatrixAt(N, dummy.matrix);
  for (const m of [...Object.values(rows), seals, feet]) m.instanceMatrix.needsUpdate = true;

  // Grande baie de sortie, type levant-coulissant grand format, en anodisé bronze.
  const BAY_W = 4.6, BAY_H = 2.75, BAY_Z = START - N * GAP - 2.2;
  const bay = slidingWindow(BAY_W, BAY_H, mats, mats.bronze);
  bay.position.set(0, BAY_H / 2 + 0.03, BAY_Z);
  world.add(bay);
  const bayFeet = new THREE.Mesh(feetGeometry(BAY_W), mats.steel);
  bayFeet.position.z = BAY_Z;
  world.add(bayFeet);
  onProgress(0.72);

  const keys = cameraKeys(frameZ[N - 1], BAY_Z, BAY_W);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.03, 400);
  world.add(camera);

  // Post-traitement : occlusion ambiante, halo doux, sortie ACES, étalonnage.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: mobile ? 2 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (!mobile) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 1;
    gtao.updateGtaoMaterial({ radius: 0.22, distanceExponent: 1.4, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.55, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const tmpV = new THREE.Vector3(), tmpT = new THREE.Vector3();
  let width = 1, height = 1;

  function place(p, time, pointer) {
    const cam = cameraAt(keys, p);
    const sway = 1 - ramp(0.06, 0.2, p);
    const hand = 1 - 0.7 * ramp(0.1, 0.22, p) * (1 - ramp(0.24, 0.3, p));
    camera.position.set(
      cam.pos[0] + pointer.x * 0.28 * sway + Math.sin(time * 0.53) * 0.006 * hand,
      cam.pos[1] - pointer.y * 0.1 * sway + Math.sin(time * 0.71 + 1.3) * 0.004 * hand,
      cam.pos[2],
    );
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    tmpT.set(cam.target[0] + Math.sin(time * 0.37) * 0.01 * hand, cam.target[1], cam.target[2]);
    world.updateMatrixWorld();
    camera.lookAt(world.localToWorld(tmpT.clone()));
    camera.updateMatrixWorld();
    return cam;
  }

  function render({ p = 0, time = 0, pointer = { x: 0, y: 0 } } = {}) {
    place(p, time, pointer);
    // Le vantail avant de la baie de tête glisse, puis ceux de la baie de sortie.
    const open = ramp(0.25, 0.35, p);
    hero.userData.front.position.x = hero.userData.closedX + open * hero.userData.travel;
    const bayOpen = ramp(0.8, 0.9, p);
    bay.userData.front.position.x = bay.userData.closedX + bayOpen * bay.userData.travel;

    // Le fond suit la caméra pour garder la projection du sol exacte.
    world.localToWorld(tmpV.set(0, 0, camera.position.z));
    sky.position.set(tmpV.x, CAPTURE_HEIGHT, tmpV.z);
    // Ombres : la boîte d'ombre accompagne le regard.
    world.localToWorld(tmpT.set(0, 0, mix(-3, -24, ramp(0.3, 0.85, p))));
    sun.target.position.copy(tmpT);
    sun.position.copy(tmpT).addScaledVector(SUN_DIR, 70);
    sun.target.updateMatrixWorld();

    renderer.toneMappingExposure = 0.82 + 0.22 * ramp(0.4, 0.8, p) + 0.9 * ramp(0.9, 1, p);
    grade.uniforms.uTime.value = time;
    grade.uniforms.uFlash.value = ramp(0.93, 1, p) * 0.85;
    bloom.strength = 0.22 + 0.5 * ramp(0.86, 1, p);
    composer.render();
  }

  function resize(w, h) {
    width = w; height = h;
    const ratio = Math.min(devicePixelRatio || 1, mobile ? 1.4 : 1.5, Math.sqrt((mobile ? 0.8e6 : 2.0e6) / Math.max(1, w * h)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w * ratio, h * ratio);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  // Coins de l'ouverture vitrée de la baie de tête, à l'écran (rideau de chargement).
  function apertureCorners() {
    place(0, 0, { x: 0, y: 0 });
    hero.updateMatrixWorld(true);
    const hw = hero.userData.innerW / 2, hh = hero.userData.innerH / 2;
    return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([x, y]) => {
      tmpV.set(x, y, 0).applyMatrix4(hero.matrixWorld).project(camera);
      return [(tmpV.x * 0.5 + 0.5) * 1000, (0.5 - tmpV.y * 0.5) * 1000];
    });
  }

  resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
  place(0, 0, { x: 0, y: 0 });
  await renderer.compileAsync(scene, camera);
  onProgress(0.86);
  for (const p of [0, 0.3, 0.6, 0.9]) { render({ p }); await new Promise((r) => requestAnimationFrame(r)); }
  onProgress(0.97);
  render({ p: 0 });
  return { render, resize, apertureCorners, renderer, setQuality(level) { if (gtao) gtao.enabled = level > 1; bloom.enabled = level > 0; } };
}
