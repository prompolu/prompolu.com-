/**
 * Accès à l'espace 3D (/ar/) — Cloudflare Pages Functions.
 *
 * Le configurateur 3D n'est servi qu'avec un lien donné par PROMPOLU :
 *   https://prompolu.com/ar/?p=<jeton>
 * Le jeton contient le partenaire (nom, WhatsApp des demandes de devis,
 * couleur, logo) et sa date de fin, signés avec la clé secrète de PROMPOLU
 * (générateur de codes Debromp, mode « Espace 3D »). Ici, seule la clé
 * publique : on peut vérifier un lien, pas en fabriquer. Modifier le numéro
 * ou la date dans le lien casse la signature.
 *
 * Tout ce qui est sous /ar/ (pages, scripts, modèles) et tout fichier .glb /
 * .usdz du site passe par cette vérification. Le reste du site est public.
 */

const PUBLIC_KEYS = ['3ff022edf370eb0fd27cc1e567d8d49c716cdaef187a01f0ab70b14a1d8b7b58'];
const PREFIX = 'PROMPOLU-AR-1.';
const WHATSAPP = '212668378538';
const COOKIE = 'prompolu_ar';
const DAY = 86_400_000;

const isProtected = (path) => path === '/ar' || path.startsWith('/ar/') || /\.(glb|usdz)$/i.test(path);
// The repository root is published as-is: its notes, tests and marketing context are
// not pages, so search engines and AI assistants must not fetch, index or quote them.
const INTERNAL = /^\/(?:README\.md|CNAME|(?:COURRIER|LISEZ-MOI)[^/]*|(?:tests|\.agents)\/.*)$/;
// Public documents use the same extension-less URLs as Pages' static routing.
// Leave preview hosts, signed AR links and non-page resources on their own routes.
const PUBLIC_PAGES = new Set([
  '/', '/coulissants', '/battants', '/agencement', '/exterieur',
  '/notre-activite', '/contact', '/conseils/',
  '/conseils/guide-choisir-systeme-coulissant-aluminium',
  '/conseils/coulissant-ou-battant-comment-choisir',
  '/conseils/rupture-de-pont-thermique-aluminium',
  '/conseils/finitions-aluminium-thermolaquage-anodisation',
  '/visualisation-3d', '/showroom-sefrou', '/grossiste-aluminium-fes',
  '/distributeur-strugal-maroc',
  '/battants/s53rp',
  '/battants/s46',
  '/coulissants/s86rp',
  '/coulissants/s88r',
  '/coulissants/s88rp',
  '/coulissants/s90r',
  '/coulissants/s90rp',
  '/coulissants/s125rp',
  '/coulissants/s140rp',
  '/battants/s47',
  '/exterieur/mur-rideau-s52',
  '/exterieur/volets-roulants',
  '/exterieur/garde-corps',
  '/exterieur/pergolas',
  '/exterieur/bardage-aluminium',
]);
// Pages taken off the site: their old URLs send visitors to the closest live page.
const REMOVED_PAGES = new Map([
  ['/coulissants/s70', '/coulissants'],
]);

function publicRedirect(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (url.hostname !== 'prompolu.com' && url.hostname !== 'www.prompolu.com') return null;
  var path = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (path === '/conseils') path = '/conseils/';
  if (REMOVED_PAGES.has(path)) path = REMOVED_PAGES.get(path);
  if (!PUBLIC_PAGES.has(path)) return null;
  if (url.hostname === 'prompolu.com' && url.protocol === 'https:' && url.pathname === path) return null;
  const target = new URL(url);
  target.protocol = 'https:';
  target.hostname = 'prompolu.com';
  target.port = '';
  target.pathname = path;
  return Response.redirect(target.toString(), 308);
}
const looksLikeToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/.test(t);

const unb64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const unhex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

let keysPromise;
/** AR_TEST_KEYS: extra public keys for local tests only (wrangler --binding), never set on the site. */
function publicKeys(env) {
  const extra = (env && env.AR_TEST_KEYS ? String(env.AR_TEST_KEYS).split(',') : []).filter((k) => /^[0-9a-f]{64}$/.test(k));
  keysPromise ??= Promise.all([...PUBLIC_KEYS, ...extra].map((k) =>
    crypto.subtle.importKey('raw', unhex(k), { name: 'Ed25519' }, false, ['verify'])
      .catch(() => crypto.subtle.importKey('raw', unhex(k), { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, false, ['verify']))));
  return keysPromise;
}

/** { ok, access } or { ok: false, reason: 'MISSING' | 'INVALID' | 'EXPIRED', expiresOn? } */
async function check(token, env, now = Date.now()) {
  if (!token) return { ok: false, reason: 'MISSING' };
  if (!looksLikeToken(token)) return { ok: false, reason: 'INVALID' };
  const [body, sig] = token.split('.');
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
  } catch {
    return { ok: false, reason: 'INVALID' };
  }
  const msg = new TextEncoder().encode(PREFIX + body);
  let valid = false;
  for (const key of await publicKeys(env)) {
    const algo = key.algorithm.name === 'NODE-ED25519' ? { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' } : { name: 'Ed25519' };
    if (await crypto.subtle.verify(algo, key, unb64url(sig), msg)) { valid = true; break; }
  }
  if (!valid || payload.v !== 1 || typeof payload.nm !== 'string' || typeof payload.ph !== 'string') return { ok: false, reason: 'INVALID' };
  if (payload.x) {
    const end = Date.parse(`${payload.x}T00:00:00Z`) + DAY; // valable tout le dernier jour
    if (!(now < end)) return { ok: false, reason: 'EXPIRED', expiresOn: payload.x };
  }
  return { ok: true, access: payload };
}

function readCookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  for (const part of all.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const isPage = (request, path) =>
  path.endsWith('/') || path.endsWith('.html') || !/\.[a-z0-9]+$/i.test(path) ||
  (request.headers.get('Accept') || '').includes('text/html');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function denied(reason, expiresOn) {
  const frDate = expiresOn ? new Date(`${expiresOn}T12:00:00Z`).toLocaleDateString('fr-FR') : '';
  const copy = {
    MISSING: {
      status: 'Accès réservé', tone: 'lock',
      note: 'Cet espace s’ouvre avec un lien personnel donné par PROMPOLU.',
      cta: 'Demander mon accès',
      wa: 'Bonjour, je souhaite un accès à la visualisation 3D PROMPOLU.',
    },
    INVALID: {
      status: 'Lien non valable', tone: 'warn',
      note: 'Ce lien a été mal copié ou modifié. Demandez-nous de vous le renvoyer.',
      cta: 'Recevoir mon lien',
      wa: 'Bonjour, mon lien de visualisation 3D PROMPOLU ne fonctionne pas.',
    },
    EXPIRED: {
      status: `Expiré le ${frDate}`, tone: 'warn',
      note: 'Votre accès est arrivé à son terme. Nous vous envoyons un nouveau lien dès le renouvellement.',
      cta: 'Renouveler mon accès',
      wa: 'Bonjour, je souhaite renouveler mon accès à la visualisation 3D PROMPOLU.',
    },
  }[reason];
  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(copy.wa)}`;
  const i = {
    wa: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.03c-.25.69-1.44 1.32-1.99 1.37-.51.05-.99.24-3.33-.69-2.81-1.11-4.6-3.99-4.74-4.18-.14-.18-1.13-1.5-1.13-2.87 0-1.36.71-2.03.97-2.31.25-.28.55-.35.74-.35l.53.01c.17.01.4-.07.62.47.23.55.78 1.9.85 2.04.07.14.11.3.02.48-.09.18-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.07.95 1.97 1.25 2.25 1.39.28.14.44.12.6-.07.16-.18.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.67-.18 1.36Z"/></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    home: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>',
    cube: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>',
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  const steps = [
    ['/assets/acces-3d-etape-1.svg', 'Écrivez-nous sur WhatsApp', 'Le nom de votre menuiserie et le numéro qui recevra les demandes de devis.', '2 min', 'Sur WhatsApp'],
    ['/assets/acces-3d-etape-2.svg', 'Recevez votre lien personnel', 'À votre nom et à vos couleurs, pour la durée convenue.', 'Même jour', 'Lien signé'],
    ['/assets/acces-3d-etape-3.svg', 'Envoyez-le à vos clients', 'Ils voient le produit chez eux, à taille réelle, et vous renvoient leur demande.', 'Sans appli', 'Réalité augmentée'],
  ].map(([img, t, d, a, b], n) => `
      <li class="row">
        <img src="${img}" alt="" width="120" height="90" loading="lazy">
        <div class="row-t"><b>${t}</b><span>${d}</span></div>
        <span class="chip"><i class="dot y"></i>${a}</span>
        <span class="chip"><i class="dot g"></i>${b}</span>
        <span class="num">0${n + 1}</span>
      </li>`).join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="theme-color" content="#121110">
<title>Visualisation 3D — accès réservé | PROMPOLU</title>
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600&family=Manrope:wght@400;500;600;700&display=swap">
<style>
:root{--bg:#121110;--ink:#f4f1ec;--mut:#b6aea5;--dim:#8a837c;--glass:rgba(255,255,255,.055);--glass2:rgba(255,255,255,.09);--edge:rgba(255,255,255,.09);
  --bronze:#c4884e;--glow:#d9772f;--r:30px}
*{box-sizing:border-box}
html,body{margin:0}
body{min-height:100vh;background:radial-gradient(1200px 700px at 70% -10%,#3a2618 0%,transparent 60%),radial-gradient(900px 600px at -10% 110%,#231914 0%,transparent 55%),var(--bg);
  color:var(--ink);font:15px/1.55 Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:28px}
a{color:inherit;text-decoration:none}
h1,h2,.stat b,.status b{font-family:Sora,Manrope,sans-serif;font-weight:600;letter-spacing:-.02em}
.frame{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:76px 1fr;gap:22px;padding:22px;border-radius:40px;
  background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid var(--edge);box-shadow:0 40px 120px rgba(0,0,0,.45)}
.rail{background:#0c0b0a;border-radius:28px;padding:18px 0;display:flex;flex-direction:column;align-items:center;gap:14px}
.rail .logo{width:42px;height:42px;border-radius:14px;background:#1b1917;display:grid;place-items:center;margin-bottom:14px;overflow:hidden}
.rail .logo img{width:40px;height:40px}
.rail a{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:var(--mut);transition:.2s}
.rail a:hover,.rail a.on{background:#232120;color:var(--ink)}
.rail .sp{flex:1}
.main{min-width:0}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:6px 6px 20px}
.top h1{font-size:clamp(1.6rem,2.6vw,2.2rem);margin:0}
.top .brand{height:20px;filter:invert(1) brightness(1.4);opacity:.85}
.grid{display:grid;grid-template-columns:1.62fr 1fr;gap:18px}
.card{background:var(--glass);border:1px solid var(--edge);border-radius:var(--r);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);position:relative;overflow:hidden}
.hero{grid-row:span 2;min-height:440px;padding:32px;display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);grid-template-rows:1fr auto;gap:22px 26px}
.hero::before{content:"";position:absolute;right:-60px;top:40px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(217,119,47,.55),rgba(217,119,47,0) 65%);filter:blur(10px)}
.hero::after{content:"";position:absolute;right:30px;top:60px;width:360px;height:360px;border-radius:50%;border:1px solid rgba(255,255,255,.07);box-shadow:0 0 0 60px rgba(255,255,255,.015)}
.hero .pic{position:relative;z-index:1;grid-column:2;grid-row:1;width:100%;height:100%;min-height:260px;object-fit:cover;border-radius:24px;border:1px solid var(--edge);box-shadow:0 30px 80px rgba(217,119,47,.28)}
  -webkit-mask-image:radial-gradient(ellipse 70% 70% at 55% 50%,#000 55%,transparent 80%);mask-image:radial-gradient(ellipse 70% 70% at 55% 50%,#000 55%,transparent 80%)}
.hero .txt{position:relative;z-index:2;grid-column:1;grid-row:1;align-self:center}
.kick{font-size:12px;color:var(--mut);margin:0 0 14px}
.hero h2{font-size:clamp(2rem,3.3vw,2.9rem);line-height:1.07;margin:0 0 16px}
.hero p{color:var(--mut);margin:0 0 26px;max-width:36ch}
.btns{display:flex;flex-wrap:wrap;gap:10px}
.pill{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:52px;padding:0 28px;border-radius:16px;font-weight:700;font-size:14.5px;transition:.2s}
.pill.w{background:#fff;color:#121110;box-shadow:0 10px 30px rgba(255,255,255,.12)}
.pill.w:hover{transform:translateY(-1px);box-shadow:0 14px 36px rgba(255,255,255,.18)}
.pill.g{background:var(--glass2);border:1px solid var(--edge)}
.pill.g:hover{background:rgba(255,255,255,.14)}
.stats{position:relative;z-index:2;grid-column:1 / -1;grid-row:2;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:20px 22px;border-radius:24px;
  background:rgba(20,18,17,.55);border:1px solid var(--edge);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.stat b{display:block;font-size:clamp(1.5rem,2.6vw,2.2rem);line-height:1.1}
.stat span{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:7px;margin-top:6px}
.stat span::after{content:"";flex:1;max-width:56px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--bronze),transparent)}
.status{padding:24px 26px}
.status .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:rgba(196,136,78,.16);color:var(--bronze);margin-bottom:18px}
.status .ic.warn{background:rgba(232,120,70,.16);color:#ef8a5a}
.status small{display:block;color:var(--mut);font-size:12.5px;margin-bottom:4px}
.status b{display:block;font-size:1.7rem;line-height:1.15;margin-bottom:10px}
.status p{color:var(--mut);margin:0 0 18px;font-size:14px}
.status .wave{display:block;width:100%;height:40px}
.tile{display:grid;grid-template-columns:1fr 1.1fr;gap:10px;padding:22px;min-height:190px;align-items:end}
.tile small{color:var(--mut);font-size:12.5px}
.tile b{display:block;font-family:Sora,sans-serif;font-weight:600;font-size:1.25rem;line-height:1.2;margin:6px 0 12px}
.tile .go{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--bronze)}
.tile .ph{align-self:stretch;border-radius:22px;background:rgba(255,255,255,.07);display:grid;place-items:center;overflow:hidden;position:relative}
.tile .ph img{width:100%;height:100%;object-fit:cover;mix-blend-mode:luminosity;opacity:.9}
.tile .ph span{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:11.5px;color:var(--ink)}
.list{grid-column:1/-1;padding:26px 26px 18px}
.list-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.list-h h2{font-size:1.15rem;margin:0}
.list-h .sel{height:44px;padding:0 18px;border-radius:14px;background:var(--glass2);border:1px solid var(--edge);display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:600}
.cols{display:grid;grid-template-columns:120px 1fr 140px 170px 40px;gap:18px;font-size:12px;color:var(--dim);padding:0 14px 12px;border-bottom:1px solid var(--edge);margin-bottom:12px}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.row{display:grid;grid-template-columns:120px 1fr 140px 170px 40px;gap:18px;align-items:center;padding:10px 14px 10px 10px;border-radius:22px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06)}
.row img{width:120px;height:78px;object-fit:cover;border-radius:16px}
.row-t b{display:block;font-size:14.5px}
.row-t span{font-size:12.5px;color:var(--mut)}
.chip{font-size:12.5px;color:var(--mut);display:flex;align-items:center;gap:8px}
.dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.dot.y{background:#e8c547}.dot.g{background:#3fbf7f}
.num{font-family:Sora,sans-serif;color:var(--dim);font-size:13px;text-align:right}
footer{max-width:1240px;margin:16px auto 0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;color:var(--dim);font-size:12.5px;padding:0 10px}
@media (max-width:980px){
  body{padding:12px}
  .frame{grid-template-columns:1fr;padding:12px;border-radius:30px}
  .rail{flex-direction:row;padding:10px 14px;border-radius:22px;justify-content:flex-start}
  .rail .logo{margin:0 6px 0 0}.rail .sp{display:none}
  .grid{grid-template-columns:1fr}
  .hero{grid-row:auto;min-height:0;padding:26px 22px 22px}
  .hero{grid-template-columns:1fr;grid-template-rows:auto}
  .hero .pic{grid-column:1;grid-row:2;height:auto;aspect-ratio:4/3}
  .stats{grid-row:3}
  .hero .txt{max-width:none}
  .hero::before{right:-120px;top:120px}
  .hero::after{display:none}
  .stats{grid-template-columns:repeat(2,1fr);gap:16px}
  .btns .pill{flex:1 1 100%}
  .cols{display:none}
  .row{grid-template-columns:84px 1fr;row-gap:8px}
  .row img{width:84px;height:64px;grid-row:span 2}
  .row .chip{grid-column:2}.row .chip+.chip{display:none}
  .num{display:none}
}
</style></head><body>
<div class="frame">
  <nav class="rail" aria-label="Navigation">
    <a class="logo" href="/" aria-label="PROMPOLU — accueil"><img src="/assets/apple-touch-icon.png" alt=""></a>
    <a class="on" href="/visualisation-3d" aria-label="Visualisation 3D">${i.cube}</a>
    <a href="/" aria-label="Accueil">${i.home}</a>
    <a href="${esc(wa)}" aria-label="WhatsApp PROMPOLU">${i.wa}</a>
    <span class="sp"></span>
    <a href="/visualisation-3d" aria-label="Espace réservé">${i.lock}</a>
  </nav>
  <div class="main">
    <div class="top">
      <h1>Visualisation 3D</h1>
      <img class="brand" src="/assets/logo-prompolu.png" alt="PROMPOLU ALUMINIUM" width="145" height="20">
    </div>
    <div class="grid">
      <section class="card hero">
        <img class="pic" src="/assets/visualisation-3d-teaser.jpg" alt="Pergola bioclimatique en aluminium" width="1200" height="900">
        <div class="txt">
          <p class="kick">Espace réservé aux professionnels</p>
          <h2>Montrez l’aluminium chez votre client.</h2>
          <p>Pergola, garde-corps, baie coulissante ou battant : votre client pointe son téléphone et voit le produit chez lui, à taille réelle, avant de signer.</p>
          <div class="btns">
            <a class="pill w" href="${esc(wa)}">${i.wa}${esc(copy.cta)}</a>
            <a class="pill g" href="/visualisation-3d">Découvrir l’outil</a>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>4</b><span>Produits</span></div>
          <div class="stat"><b>11</b><span>Systèmes STRUGAL</span></div>
          <div class="stat"><b>1:1</b><span>Taille réelle</span></div>
          <div class="stat"><b>0</b><span>Appli à installer</span></div>
        </div>
      </section>
      <section class="card status" data-reason="${reason}">
        <div class="ic ${copy.tone === 'warn' ? 'warn' : ''}">${copy.tone === 'warn' ? i.warn : i.lock}</div>
        <small>Statut de l’accès</small>
        <b>${esc(copy.status)}</b>
        <p>${esc(copy.note)}</p>
        <svg class="wave" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 28 C 30 6, 55 6, 80 22 S 130 38, 160 20 S 215 2, 245 18 S 285 30, 300 12" fill="none" stroke="#c4884e" stroke-width="2.2" stroke-linecap="round"/><path d="M0 34 C 40 22, 70 30, 100 26 S 170 10, 210 24 S 270 34, 300 26" fill="none" stroke="rgba(244,241,236,.35)" stroke-width="1.6" stroke-linecap="round"/></svg>
      </section>
      <section class="card tile">
        <div><small>À votre nom</small><b>Les demandes de devis arrivent sur votre WhatsApp</b><a class="go" href="${esc(wa)}">Nous écrire ${i.arrow}</a></div>
        <div class="ph"><img src="/assets/garde-corps-teaser.jpg" alt="" loading="lazy"><span>Garde-corps Glass Line</span></div>
      </section>
      <section class="card list">
        <div class="list-h"><h2>Obtenir votre accès en 3 étapes</h2><a class="sel" href="${esc(wa)}">${i.wa}WhatsApp</a></div>
        <div class="cols"><span>Étape</span><span></span><span>Délai</span><span>Comment</span><span></span></div>
        <ol>${steps}</ol>
      </section>
    </div>
  </div>
</div>
<footer><span>© ${new Date().getFullYear()} PROMPOLU ALUMINIUM — Fès &amp; Sefrou, Maroc</span><span>+212 6 68 37 85 38</span></footer>
</body></html>`;
  return new Response(html, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  if (INTERNAL.test(url.pathname)) {
    return new Response('Page introuvable', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  }
  const redirect = publicRedirect(request, url);
  if (redirect) return redirect;
  if (!isProtected(url.pathname)) return context.next();

  // The link's token wins; otherwise the one this browser already received.
  const fromQuery = url.searchParams.get('p');
  const fromCookie = readCookie(request, COOKIE);
  const token = fromQuery ?? fromCookie;
  const result = await check(token, context.env);
  const page = isPage(request, url.pathname);

  if (!result.ok) {
    return page ? denied(result.reason, result.expiresOn) : new Response('Accès réservé', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  // Page opened without the link's token (bookmark, back from AR): put it
  // back in the address, the page needs it for the partner and the AR files.
  if (page && fromQuery === null) {
    url.searchParams.set('p', token);
    return Response.redirect(url.toString(), 302);
  }

  // The partner, for the pages (they look it up by the ?p= of their address).
  if (url.pathname === '/ar/partners.json') {
    const a = result.access;
    const partner = { name: a.nm, phone: a.ph, email: '', logo: a.lg ? `/ar/logos/${a.lg}` : '', ...(a.ac ? { accent: a.ac } : {}) };
    return new Response(JSON.stringify({ [token]: partner }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  }

  const upstream = await context.next();
  const res = new Response(upstream.body, upstream);
  res.headers.set('Cache-Control', page ? 'private, no-cache' : 'private, max-age=86400');
  res.headers.set('X-Robots-Tag', 'noindex');
  if (fromQuery !== null && fromQuery !== fromCookie) {
    const end = result.access.x ? Date.parse(`${result.access.x}T00:00:00Z`) + DAY : Date.now() + 400 * DAY;
    const maxAge = Math.max(60, Math.floor((end - Date.now()) / 1000));
    res.headers.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`);
  }
  return res;
}

