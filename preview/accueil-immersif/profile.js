// Coupe 3D illustrative d'un profilé à rupture de pont thermique (dimensions
// indicatives, en millimètres / 100). Les pièces s'assemblent au défilement et
// l'ensemble s'oriente vers le pointeur.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function rect(path, x0, y0, x1, y1) {
  path.moveTo(x0, y0); path.lineTo(x1, y0); path.lineTo(x1, y1); path.lineTo(x0, y1); path.closePath();
  return path;
}
function shell(outer, holes) {
  const s = rect(new THREE.Shape(), ...outer);
  for (const h of holes) s.holes.push(rect(new THREE.Path(), ...h));
  return s;
}
function extrude(shape, depth = 1.4) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 1 });
  g.translate(-0.45, -1.0, -depth / 2);
  return g;
}

export async function createProfile(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.03).texture;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#f1f0ec', '#5a5048', 1.2));
  const key = new THREE.DirectionalLight('#fff3e2', 2.2);
  key.position.set(-3, 4, 5);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0.25, 6.4);
  camera.lookAt(0, 0.05, 0);

  const alu = new THREE.MeshStandardMaterial({ color: '#c7c9cc', metalness: 0.95, roughness: 0.28 });
  const lacquer = new THREE.MeshStandardMaterial({ color: '#2e3234', metalness: 0.55, roughness: 0.4 });
  const poly = new THREE.MeshStandardMaterial({ color: '#141516', metalness: 0, roughness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({ color: '#a9c2c4', metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.38, envMapIntensity: 1.5 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#a97c50', metalness: 0.85, roughness: 0.3 });

  const model = new THREE.Group();
  scene.add(model);
  const parts = [];
  const add = (geo, mat, from) => {
    const m = new THREE.Mesh(geo, mat);
    m.userData.from = new THREE.Vector3(...from);
    model.add(m);
    parts.push(m);
    return m;
  };
  // Dormant : coquille extérieure (laquée), barrettes polyamide, coquille intérieure (anodisée).
  add(extrude(shell([0, 0, 0.36, 0.72], [[0.04, 0.04, 0.32, 0.3], [0.04, 0.34, 0.32, 0.68]])), lacquer, [-1.4, 0, 0]);
  add(extrude(shell([0.36, 0.06, 0.52, 0.13], [])), poly, [0, -0.9, 0]);
  add(extrude(shell([0.36, 0.59, 0.52, 0.66], [])), poly, [0, -0.9, 0]);
  add(extrude(shell([0.52, 0, 0.9, 0.72], [[0.56, 0.04, 0.86, 0.3], [0.56, 0.34, 0.86, 0.68]])), alu, [1.4, 0, 0]);
  // Ouvrant : deux demi-profils et sa propre rupture.
  add(extrude(shell([0.1, 0.76, 0.4, 1.18], [[0.14, 0.8, 0.36, 1.14]])), lacquer, [-1.1, 0.5, 0]);
  add(extrude(shell([0.4, 0.84, 0.52, 0.9], [])), poly, [0, 1.1, 0]);
  add(extrude(shell([0.52, 0.76, 0.8, 1.18], [[0.56, 0.8, 0.76, 1.14]])), alu, [1.1, 0.5, 0]);
  // Joints et rail de roulement.
  add(extrude(shell([0.17, 0.72, 0.23, 0.76], [])), poly, [0, -0.4, 0]);
  add(extrude(shell([0.62, 0.72, 0.68, 0.76], [])), bronze, [0, -0.4, 0]);
  // Double vitrage 4 / 16 / 4 tenu par l'ouvrant.
  add(extrude(shell([0.26, 1.18, 0.3, 2.1], [])), glass, [0, 1.6, 0]);
  add(extrude(shell([0.5, 1.18, 0.54, 2.1], [])), glass, [0, 1.6, 0]);
  add(extrude(shell([0.3, 1.18, 0.5, 1.26], [])), alu, [0, 1.3, 0]);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.4),
    new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'varying vec2 vUv; void main(){ vec2 d = (vUv - .5) * 2.; gl_FragColor = vec4(.08, .07, .06, exp(-dot(d, d) * 2.4) * .3); }' }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.05;
  scene.add(shadow);

  const look = new THREE.Vector2(), aim = new THREE.Vector2();
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  function render({ assemble = 1, time = 0, dt = 0, pointer = null } = {}) {
    aim.set(pointer ? pointer.x : Math.sin(time * 0.35) * 0.35, pointer ? pointer.y : 0);
    look.lerp(aim, 1 - Math.exp(-dt * 6));
    model.rotation.set(0.32 + look.y * 0.22, -0.7 + look.x * 0.6, 0);
    parts.forEach((m, i) => {
      const k = ramp(i * 0.045, i * 0.045 + 0.5, assemble);
      m.position.copy(m.userData.from).multiplyScalar(1 - k);
    });
    renderer.render(scene, camera);
  }
  resize();
  await renderer.compileAsync(scene, camera);
  return { render, resize };
}
