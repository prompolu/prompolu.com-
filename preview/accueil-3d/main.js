// Aperçu 3D PROMPOLU : défilement fluide, récit synchronisé, interactions et boucle de rendu.
// La scène Three.js est chargée à part : si WebGL manque, le récit reste lisible sur une image fixe.
import Lenis from 'lenis';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const params = new URLSearchParams(location.search);
const capture = params.has('capture');            // rendu image par image piloté de l'extérieur
const reduced = !capture && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const mobile = !fine || Math.min(innerWidth, innerHeight) < 700;
const root = document.documentElement, body = document.body;
if (reduced) body.classList.add('reduced');
if (capture) { body.classList.remove('is-loading'); document.querySelector('.loader')?.remove(); }

const canvas = $('#stage');
const chapters = $$('[data-chapter]');
const beats = $$('.story [data-beat]').map((el) => {
  const [a, b] = el.dataset.beat.split(' ').map(Number);
  return { el, a, b, o: -1, y: NaN };
});
const railLinks = $$('[data-rail]');
const toneSections = $$('[data-tone]');
const labelEls = $$('.label');
const leaders = $('.leaders');
const firstPanel = $('.panel');
const SVG = 'http://www.w3.org/2000/svg';
const lines = labelEls.map(() => {
  const g = document.createElementNS(SVG, 'g');
  const l = document.createElementNS(SVG, 'line'), c = document.createElementNS(SVG, 'circle');
  c.setAttribute('r', '3.5');
  g.append(l, c); g.style.opacity = '0'; leaders.append(g);
  return { g, l, c };
});

let vh = innerHeight, tops = [], heights = [], panelTop = 0, tones = [], labelSizes = [];
let stage = null, lastY = -1, railOn = -1, headerInk = null, canvasShown = true;
const pointer = { x: 0, y: 0 };
const setVar = (el, k, v) => el.style.setProperty(k, v);

function measure() {
  vh = innerHeight;
  tops = chapters.map((el) => el.getBoundingClientRect().top + scrollY);
  heights = chapters.map((el) => el.offsetHeight);
  panelTop = firstPanel.getBoundingClientRect().top + scrollY;
  tones = toneSections.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, ink: el.dataset.tone === 'paper' }; });
  labelSizes = labelEls.map((el) => [el.offsetWidth, el.offsetHeight]);
  lastY = -1;
}
function progressAt(y) {
  for (let i = chapters.length - 1; i >= 0; i--) if (y >= tops[i]) return i + (y - tops[i]) / heights[i];
  return 0;
}

// ---------- Récit ----------
function updateStory(P) {
  for (const b of beats) {
    const fin = b.a <= 0 ? 1 : ramp(b.a, b.a + 0.07, P);
    const fout = 1 - ramp(b.b - 0.07, b.b, P);
    const o = Math.round(Math.min(fin, fout) * 1000) / 1000;
    const y = (P < (b.a + b.b) / 2 ? 1 - fin : -(1 - fout)) * (reduced ? 0 : 30);
    if (o !== b.o) { b.el.style.opacity = o; b.el.style.visibility = o > 0.002 ? 'visible' : 'hidden'; b.o = o; }
    if (!(Math.abs(y - b.y) < 0.05)) { setVar(b.el, '--by', `${y.toFixed(2)}px`); b.y = y; }
  }
}
function updateChrome(P, y) {
  const on = P > 4.6 ? -1 : Math.min(4, Math.floor(P));
  if (on !== railOn) { railLinks.forEach((a, i) => a.classList.toggle('on', i === on)); setVar(root, '--rail-o', on < 0 ? 0 : 1); railOn = on; }
  setVar(root, '--flash', (ramp(2.6, 2.76, P) * (1 - ramp(2.8, 2.98, P)) * 0.8).toFixed(3));
  const probe = y + 42;
  const ink = tones.some((t) => t.ink && probe >= t.top && probe < t.bottom);
  if (ink !== headerInk) { body.classList.toggle('header-ink', ink); headerInk = ink; }
}

// ---------- Étiquettes de la coupe ----------
function updateLabels(pts) {
  const a = pts[0].a;
  if (a <= 0.001) {
    if (labelEls[0]._o !== 0) { labelEls.forEach((el, i) => { el.style.opacity = '0'; lines[i].g.style.opacity = '0'; el._o = 0; }); }
    return;
  }
  // Colonne de légendes à droite de la coupe, triées par hauteur, sans chevauchement.
  const W = innerWidth, edge = mobile ? 12 : Math.max(24, W * 0.045);
  const widest = Math.max(...labelSizes.map((s) => s[0]));
  const colX = mobile ? W - edge - widest : Math.min(W * 0.71, W - edge - widest - (W > 1100 ? 150 : 0));
  const order = pts.map((_, i) => i).sort((i, j) => pts[i].y - pts[j].y);
  let minY = mobile ? 84 : 100;
  for (const i of order) {
    const el = labelEls[i], ln = lines[i], pt = pts[i], [, h] = labelSizes[i];
    const ly = Math.max(minY, pt.y - h / 2);
    minY = ly + h + 10;
    el.style.opacity = a; el._o = a;
    el.style.transform = `translate3d(${colX.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
    ln.g.style.opacity = a;
    ln.l.setAttribute('x1', pt.x.toFixed(1)); ln.l.setAttribute('y1', pt.y.toFixed(1));
    ln.l.setAttribute('x2', colX.toFixed(1)); ln.l.setAttribute('y2', (ly + h / 2).toFixed(1));
    ln.c.setAttribute('cx', pt.x.toFixed(1)); ln.c.setAttribute('cy', pt.y.toFixed(1));
  }
}

// ---------- Finitions ----------
function buildSwatches(finishes) {
  const wrap = $('.swatches'), name = $('.finish-name');
  Object.entries(finishes).forEach(([key, f], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === 0)); b.setAttribute('aria-label', `${f.label} ${f.code}`);
    b.title = `${f.label} · ${f.code}`;
    setVar(b, '--sw', f.swatch);
    b.addEventListener('click', () => {
      stage?.setFinish(key);
      $$('.swatch', wrap).forEach((s) => s.setAttribute('aria-checked', String(s === b)));
      name.innerHTML = `<b>${f.label}</b> ${f.code}`;
    });
    wrap.append(b);
  });
}
const zone = $('.drag-zone');
let dragX = null;
zone.addEventListener('pointerdown', (e) => { dragX = e.clientX; zone.setPointerCapture(e.pointerId); });
zone.addEventListener('pointermove', (e) => { if (dragX === null) return; stage?.drag(e.clientX - dragX); dragX = e.clientX; });
const endDrag = () => { if (dragX !== null) { dragX = null; stage?.release(); } };
zone.addEventListener('pointerup', endDrag);
zone.addEventListener('pointercancel', endDrag);

// ---------- Pointeur, cartes, apparitions, compteurs ----------
if (fine && !reduced) {
  addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = -((e.clientY / innerHeight) * 2 - 1); }, { passive: true });
  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.classList.add('tilting');
      setVar(card, '--ry', `${((px - 0.5) * 10).toFixed(2)}deg`); setVar(card, '--rx', `${(-(py - 0.5) * 8).toFixed(2)}deg`);
      setVar(card, '--gx', `${(px * 100).toFixed(1)}%`); setVar(card, '--gy', `${(py * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => { card.classList.remove('tilting'); setVar(card, '--rx', '0deg'); setVar(card, '--ry', '0deg'); });
  });
}
function countUp(el) {
  const end = Number(el.dataset.count);
  if (reduced) { el.textContent = end; return; }
  const t0 = performance.now();
  const step = (now) => { const t = clamp01((now - t0) / 1400); el.textContent = Math.round(end * (1 - Math.pow(1 - t, 3))); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  $$('.count', e.target).forEach(countUp);
  io.unobserve(e.target);
}), { rootMargin: '0px 0px -12% 0px' });
$$('[data-reveal]').forEach((el) => io.observe(el));

// ---------- Défilement ----------
const lenis = reduced || capture ? null : new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const target = document.getElementById(a.getAttribute('href').slice(1));
  if (!target) return;
  e.preventDefault();
  const i = chapters.indexOf(target);
  const y = i >= 0 ? tops[i] + heights[i] * (i === 4 ? 0.2 : i === 0 ? 0 : 0.1) : target.getBoundingClientRect().top + scrollY;
  if (lenis) lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
}));

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  lenis?.raf(now);
  const y = scrollY, P = progressAt(y);
  if (y !== lastY) { updateStory(P); updateChrome(P, y); lastY = y; }
  const show = !!stage && y < panelTop - 1;
  if (show !== canvasShown) { canvas.style.visibility = show ? 'visible' : 'hidden'; $('.labels').style.visibility = canvas.style.visibility; canvasShown = show; }
  if (show && !document.hidden) {
    stage.update({ P, dt, time: now / 1000, pointer });
    stage.render(dt);
    updateLabels(stage.labels());
  }
}

// ---------- Démarrage ----------
const setLoad = (v) => setVar(root, '--load', v.toFixed(2));
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
window.__p3d = {
  ready: false,
  // Mode capture : une image à la progression P et au temps t (secondes depuis la création de la scène).
  frame(P, t, dt = 1 / 30) {
    updateStory(P); updateChrome(P, progressAt(0));
    if (!stage) return;
    stage.update({ P, dt, time: stage.startTime + t, pointer });
    stage.render(1 / 60);
    updateLabels(stage.labels());
  },
  setFinish: (k) => { const i = Object.keys(window.__p3d.finishes || {}).indexOf(k); $$('.swatch')[i]?.click(); },
  info: () => ({ mode: body.classList.contains('no-3d') ? 'fallback' : '3d', ...(stage ? stage.info() : {}) }),
};

async function boot() {
  measure();
  updateStory(progressAt(scrollY));
  setLoad(0.15);
  const giveUp = setTimeout(() => body.classList.remove('is-loading'), 12000);
  try {
    if (!hasWebGL()) throw new Error('WebGL indisponible');
    const mod = await import('./scene.js');
    setLoad(0.3);
    stage = await mod.createStage(canvas, { mobile, reducedMotion: reduced, onProgress: setLoad });
    window.__p3d.finishes = mod.FINISHES;
    buildSwatches(mod.FINISHES);
  } catch (err) {
    console.warn('Aperçu 3D : scène indisponible, affichage de repli.', err);
    body.classList.add('no-3d');
  }
  setLoad(1);
  if (document.fonts) await document.fonts.ready;
  measure();
  clearTimeout(giveUp);
  if (capture) body.classList.add('ready');
  setTimeout(() => { body.classList.remove('is-loading'); body.classList.add('ready'); }, 300);
  addEventListener('resize', () => { measure(); stage?.resize(); });
  new ResizeObserver(() => measure()).observe(body);
  if (!capture) requestAnimationFrame(frame);
  window.__p3d.ready = true;
}
boot();
