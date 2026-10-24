// Orchestration de l'aperçu : rideau de chargement, film au défilement,
// en-tête adaptatif, apparitions, cartes inclinables, accordéon et coupe 3D.
const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = innerWidth < 761 || matchMedia('(pointer: coarse)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

const journey = $('.journey');
const stage = $('.stage');
const canvas = $('.stage-canvas');
const header = $('.nav');
const loader = $('.loader');

function setVh() { root.style.setProperty('--vh', `${innerHeight / 100}px`); }
setVh();

// ---------- Rideau de chargement ----------
const sheet = $('.loader-sheet');
const edge = $('.loader-edge');
const count = $('.loader-count');
let shown = 0;
function loadProgress(v) {
  shown = Math.max(shown, Math.min(0.99, v));
  loader.style.setProperty('--load', shown.toFixed(3));
  count.textContent = String(Math.floor(shown * 100)).padStart(2, '0');
}
function tween(duration, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp01((now - t0) / duration);
      fn(t);
      t < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  });
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function finishLoader() { loader.classList.add('is-done'); root.classList.add('is-ready'); }

// L'ouverture du rideau part des coins réels de l'ouverture 3D, puis s'élargit à l'écran.
async function revealLoader(corners) {
  loadProgress(1);
  count.textContent = '100';
  loader.classList.add('is-revealing');
  const screen = [[-24, -24], [1024, -24], [1024, 1024], [-24, 1024]];
  const centre = corners.reduce((a, c) => [a[0] + c[0] / 4, a[1] + c[1] / 4], [0, 0]);
  await tween(1150, (t) => {
    const open = easeInOut(clamp01(t / 0.45));
    const spread = easeInOut(clamp01((t - 0.3) / 0.7));
    const pts = corners.map((c, i) => c.map((v, j) => {
      const fromCentre = centre[j] + (v - centre[j]) * open;
      return fromCentre + (screen[i][j] - fromCentre) * spread;
    }));
    const hole = `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join('L')}Z`;
    sheet.setAttribute('d', `M-12 -12H1012V1012H-12Z ${hole}`);
    edge.setAttribute('d', hole);
    edge.style.opacity = String(0.6 * (1 - spread));
  });
  finishLoader();
}
$('.loader-skip').addEventListener('click', () => goStatic());

// ---------- Copie du film ----------
const copies = Object.fromEntries($$('[data-copy]').map((el) => [el.dataset.copy, { el, lines: $$('.line > span', el) }]));
const BEATS = [
  ['b1', 0.11, 0.15, 0.22, 0.26],
  ['b2', 0.42, 0.47, 0.55, 0.6],
  ['b3', 0.6, 0.65, 0.72, 0.77],
];
function paintCopy(key, enter, leave) {
  const { el, lines } = copies[key];
  const o = enter * (1 - leave);
  el.style.opacity = o.toFixed(3);
  el.classList.toggle('is-current', o > 0.1);
  el.inert = o < 0.05;
  lines.forEach((line, i) => {
    const k = ramp(0, 1, enter * 1.18 - i * 0.16);
    line.style.transform = `translate3d(0, ${((1 - k) * 112 - leave * 30).toFixed(2)}%, 0)`;
  });
  if (key !== 'hero') el.style.transform = `translateY(${((1 - enter) * 24 - leave * 30).toFixed(1)}px) scale(${(0.94 + enter * 0.06 + leave * 0.05).toFixed(4)})`;
}
const chapters = $$('.chapters a');
const invite = $('.scroll-invite');
function paintStage(p, intro) {
  paintCopy('hero', intro, ramp(0.03, 0.12, p));
  for (const [k, a, b, c, d] of BEATS) paintCopy(k, ramp(a, b, p), ramp(c, d, p));
  stage.style.setProperty('--hero', ((1 - ramp(0.03, 0.12, p)) * intro).toFixed(3));
  stage.style.setProperty('--shade', (1 - 0.6 * ramp(0.1, 0.24, p)).toFixed(3));
  stage.style.setProperty('--progress', p.toFixed(4));
  stage.style.setProperty('--flood', ramp(0.9, 0.99, p).toFixed(3));
  const n = p < 0.25 ? 0 : p < 0.8 ? 1 : 2;
  chapters.forEach((a, i) => (i === n ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
}

// ---------- Mode statique ----------
let scene = null;
let isStatic = false;
function goStatic() {
  isStatic = true;
  root.classList.add('static');
  finishLoader();
  for (const { el, lines } of Object.values(copies)) { el.removeAttribute('style'); el.inert = false; lines.forEach((l) => l.removeAttribute('style')); }
  stage.removeAttribute('style');
}

// ---------- Boucle ----------
let target = 0, progress = 0, time = 0, last = 0, intro = 0, paused = false;
const pointer = { x: 0, y: 0 }, pointerAim = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointerAim.x = (e.clientX / innerWidth - 0.5) * 2;
  pointerAim.y = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });

function journeyTarget() {
  const r = journey.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  if (!paused) time += dt;
  target = journeyTarget();
  progress += (target - progress) * (1 - Math.exp(-dt * 7));
  if (Math.abs(target - progress) < 1e-4) progress = target;
  const k = 1 - Math.exp(-dt * 5);
  pointer.x += (pointerAim.x - pointer.x) * k;
  pointer.y += (pointerAim.y - pointer.y) * k;
  const r = journey.getBoundingClientRect();
  const visible = r.bottom > 0 && r.top < innerHeight;
  if (visible && !isStatic) {
    paintStage(progress, intro);
    if (scene && progress < 0.999) { scene.render({ p: progress, time, pointer }); watchBudget(dt); }
  }
  paintHeader();
  paintWhy();
  paintProfile(now, dt);
}

// Qualité adaptative : sans occlusion ambiante puis sans halo si l'appareil peine.
const lockQuality = new URLSearchParams(location.search).get('qualite') === 'max';
let quality = 2, slowFrames = 0, sampled = 0;
function watchBudget(dt) {
  if (lockQuality || !dt || quality === 0 || sampled > 600) return;
  sampled++;
  slowFrames = dt > 0.034 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
  if (slowFrames > 40) { quality--; scene.setQuality(quality); slowFrames = 0; }
}

// ---------- En-tête : se cache en descendant, encre selon la surface dessous ----------
let lastY = scrollY, travelY = 0;
addEventListener('scroll', () => {
  const d = scrollY - lastY;
  lastY = scrollY;
  if (Math.sign(d) !== Math.sign(travelY)) travelY = 0;
  travelY += d;
  if (scrollY < 80 || travelY < -14) header.classList.remove('is-away');
  else if (travelY > 14) header.classList.add('is-away');
}, { passive: true });
const toned = $$('[data-tone]');
function paintHeader() {
  let ink = 'light';
  const y = 36;
  const jr = journey.getBoundingClientRect();
  if (jr.top <= y && jr.bottom > y) ink = progress > 0.93 && !isStatic ? 'dark' : 'light';
  else {
    const under = toned.find((el) => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
    if (under) ink = under.dataset.tone === 'paper' ? 'dark' : 'light';
  }
  if (header.dataset.ink !== ink) header.dataset.ink = ink;
}

// ---------- Apparitions ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('[data-reveal],[data-rise],[data-sheet]').forEach((el) => io.observe(el));

// ---------- Cartes : inclinaison vers le pointeur et reflet ----------
for (const card of $$('.card')) {
  const media = $('.card-media', card);
  card.addEventListener('pointermove', (e) => {
    if (!finePointer.matches || reduced.matches) return;
    const r = media.getBoundingClientRect();
    const x = clamp01((e.clientX - r.left) / r.width), y = clamp01((e.clientY - r.top) / r.height);
    media.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
    media.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
    media.style.setProperty('--lx', `${(x * 100).toFixed(1)}%`);
    media.style.setProperty('--ly', `${(y * 100).toFixed(1)}%`);
    media.style.setProperty('--sheen', '1');
  });
  card.addEventListener('pointerleave', () => {
    for (const p of ['--rx', '--ry']) media.style.setProperty(p, '0deg');
    media.style.setProperty('--sheen', '0');
  });
}

// ---------- Accordéon « Pourquoi PROMPOLU » ----------
const rows = $$('.row').map((row) => ({ row, button: $('.row-toggle', row), panel: $('.row-panel', row), inner: $('.row-inner', row) }));
function setRow(r, open) {
  if (r.row.classList.contains('is-open') === open) return;
  const from = r.panel.hidden ? 0 : r.panel.getBoundingClientRect().height;
  r.row.classList.toggle('is-open', open);
  r.button.setAttribute('aria-expanded', String(open));
  r.panel.hidden = false;
  const to = open ? r.inner.getBoundingClientRect().height : 0;
  if (reduced.matches) { r.panel.hidden = !open; return; }
  const duration = Math.max(260, 680 * Math.sqrt(Math.abs(to - from) / Math.max(1, to, from)));
  const anim = r.panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing: 'cubic-bezier(.32,0,.2,1)' });
  r.inner.animate([{ opacity: open ? 0 : 1, transform: open ? 'translateY(12px)' : 'none' }, { opacity: open ? 1 : 0, transform: open ? 'none' : 'translateY(-6px)' }], { duration, easing: 'cubic-bezier(.32,0,.2,1)' });
  const art = $('.row-art img', r.row);
  if (open && art) art.animate([{ clipPath: 'inset(0 0 36% 0)', transform: 'perspective(1000px) translate3d(20px,40px,0) rotateX(9deg) rotateY(-8deg) scale(.9)', opacity: 0 }, { clipPath: 'inset(0 0 0 0)', transform: 'none', opacity: 1 }], { duration: 1000, easing: 'cubic-bezier(.2,.65,.18,1)' });
  anim.onfinish = () => { r.panel.hidden = !open; };
}
for (const r of rows) {
  r.button.addEventListener('click', () => {
    const open = !r.row.classList.contains('is-open');
    const top = r.button.getBoundingClientRect().top;
    rows.forEach((o) => o !== r && setRow(o, false));
    setRow(r, open);
    // Garde le titre cliqué immobile pendant que les panneaux changent de hauteur.
    tween(720, () => { const d = r.button.getBoundingClientRect().top - top; if (Math.abs(d) > 0.5) scrollBy(0, d); });
  });
}

// ---------- Titre « Pourquoi PROMPOLU » piloté par le défilement ----------
const whyHead = $('.why-head');
const glyphs = $$('.why-head .g');
const brand = $('.why-brand');
function paintWhy() {
  if (reduced.matches) return;
  const r = whyHead.getBoundingClientRect();
  if (r.bottom < -200 || r.top > innerHeight + 200) return;
  const p = clamp01((innerHeight * 0.92 - r.top) / Math.min(innerHeight * 0.6, r.height + 120));
  glyphs.forEach((g, i) => {
    const k = ramp(0.02 + i * 0.035, 0.46 + i * 0.035, p);
    g.style.setProperty('--y', `${((1 - k) * 115).toFixed(2)}%`);
    g.style.setProperty('--r', `${((1 - k) * 6).toFixed(2)}deg`);
    g.style.setProperty('--o', k.toFixed(3));
  });
  const b = ramp(0.2, 0.7, p), fill = ramp(0.45, 0.98, p);
  brand.style.setProperty('--by', `${((1 - b) * 110).toFixed(2)}%`);
  brand.style.setProperty('--bo', b.toFixed(3));
  brand.style.setProperty('--clip', `${((1 - fill) * 100).toFixed(2)}%`);
  brand.style.setProperty('--outline', ((1 - fill) * 0.6 + 0.1).toFixed(3));
}

// ---------- Coupe 3D du profilé ----------
const profileCanvas = $('.section-canvas');
let profile = null, profileNear = false, profilePointer = null;
new IntersectionObserver(async ([e]) => {
  profileNear = e.isIntersecting;
  if (profileNear && !profile && !profile?.loading && !isStatic) {
    profile = { loading: true };
    try {
      const { createProfile } = await import('./profile.js');
      profile = await createProfile(profileCanvas);
    } catch (err) { console.warn('Coupe 3D indisponible', err); profile = { failed: true }; }
  }
}, { rootMargin: '300px 0px' }).observe(profileCanvas);
$('.contact').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const r = profileCanvas.getBoundingClientRect();
  profilePointer = { x: clamp01((e.clientX - r.left) / r.width) * 2 - 1, y: clamp01((e.clientY - r.top) / r.height) * 2 - 1 };
}, { passive: true });
$('.contact').addEventListener('pointerleave', () => { profilePointer = null; });
addEventListener('resize', () => profile?.resize?.(), { passive: true });
function paintProfile(now, dt) {
  if (!profile?.render || !profileNear) return;
  const r = profileCanvas.getBoundingClientRect();
  const assemble = reduced.matches ? 1 : clamp01((innerHeight - r.top) / (innerHeight * 0.75));
  profile.render({ assemble, time, dt: paused ? 0 : dt, pointer: profilePointer });
}

// ---------- Pause du mouvement ambiant ----------
const motion = $('.motion-toggle');
motion.addEventListener('click', () => {
  paused = !paused;
  motion.setAttribute('aria-pressed', String(paused));
  motion.innerHTML = paused ? 'Reprendre <span aria-hidden="true">▷</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>';
});

addEventListener('resize', () => {
  setVh();
  scene?.resize(stage.clientWidth, stage.clientHeight);
}, { passive: true });

// ---------- Démarrage ----------
async function boot() {
  const canWebGL = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
  if (reduced.matches || navigator.connection?.saveData || !canWebGL) { goStatic(); requestAnimationFrame(frame); return; }
  const watchdog = setTimeout(() => !scene && goStatic(), 20000);
  try {
    loadProgress(0.05);
    const fonts = Promise.all([document.fonts?.load('400 16px Anton'), document.fonts?.load('400 16px "DM Sans"')]).catch(() => {});
    const { createScene } = await import('./scene.js');
    scene = await createScene(canvas, { mobile, onProgress: loadProgress });
    await fonts;
    clearTimeout(watchdog);
    if (isStatic) return;
    progress = target = journeyTarget();
    requestAnimationFrame(frame);
    const corners = progress < 0.02 ? scene.apertureCorners() : [[400, 400], [600, 400], [600, 600], [400, 600]];
    scene.render({ p: progress, time: 0, pointer });
    const reveal = revealLoader(corners);
    await tween(900, (t) => { intro = 1 - (1 - t) ** 3; });
    await reveal;
  } catch (err) {
    console.warn('Scène 3D indisponible, vue statique', err);
    clearTimeout(watchdog);
    goStatic();
    requestAnimationFrame(frame);
  }
}
boot();

// Outil de relecture : aller directement à un instant du film (ex. __apercu.goto(0.4)).
window.__apercu = {
  goto(p) {
    const j = journey;
    scrollTo(0, j.offsetTop + clamp01(p) * (j.offsetHeight - innerHeight));
    target = progress = clamp01(p);
    intro = 1;
  },
  get progress() { return progress; },
};
