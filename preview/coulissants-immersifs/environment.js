import * as THREE from 'three';
const CAPTURE_HEIGHT = 1.7;
const mix = (a,b,t) => a+(b-a)*t;
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
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
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


export { orangePeel, brushed, groundedSky, roadStrip };
