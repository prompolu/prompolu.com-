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
      kicker: 'Accès réservé — clients professionnels',
      title: 'La visualisation 3D est réservée à nos partenaires.',
      text: 'Chaque menuisier partenaire de PROMPOLU reçoit son lien personnel : l’outil porte son nom, et les demandes de devis de ses clients arrivent directement sur son WhatsApp.',
      cta: 'Demander mon accès',
      wa: 'Bonjour, je souhaite un accès à la visualisation 3D PROMPOLU.',
    },
    INVALID: {
      kicker: 'Lien non valable',
      title: 'Ce lien ne donne pas accès à la visualisation 3D.',
      text: 'Il a peut-être été mal copié ou modifié. Demandez à PROMPOLU de vous renvoyer votre lien personnel.',
      cta: 'Recevoir mon lien',
      wa: 'Bonjour, mon lien de visualisation 3D PROMPOLU ne fonctionne pas.',
    },
    EXPIRED: {
      kicker: 'Accès expiré',
      title: 'Votre accès à la visualisation 3D est arrivé à son terme.',
      text: `Il était valable jusqu’au ${frDate}. Contactez PROMPOLU pour le renouveler : nous vous enverrons un nouveau lien.`,
      cta: 'Renouveler mon accès',
      wa: 'Bonjour, je souhaite renouveler mon accès à la visualisation 3D PROMPOLU.',
    },
  }[reason];
  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(copy.wa)}`;
  const waIcon = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.03c-.25.69-1.44 1.32-1.99 1.37-.51.05-.99.24-3.33-.69-2.81-1.11-4.6-3.99-4.74-4.18-.14-.18-1.13-1.5-1.13-2.87 0-1.36.71-2.03.97-2.31.25-.28.55-.35.74-.35l.53.01c.17.01.4-.07.62.47.23.55.78 1.9.85 2.04.07.14.11.3.02.48-.09.18-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.07.95 1.97 1.25 2.25 1.39.28.14.44.12.6-.07.16-.18.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.67-.18 1.36Z"/></svg>';
  const lock = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="10.5" width="15" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Visualisation 3D — accès réservé | PROMPOLU</title>
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--ink:#15171A;--paper:#F1F0EC;--line:#D9D8D3;--bronze:#A97C50;--bronze-dark:#8A6541;--aluminium-light:#C7C9CC;--muted:#55585e}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--paper);color:var(--ink);
  font:16px/1.6 'IBM Plex Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
header{border-bottom:1px solid var(--line)}
header .in,footer .in{max-width:1180px;margin:0 auto;padding:16px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
header img{height:26px;width:auto;display:block}
header .back{font-size:13px;color:var(--muted)}
header .back:hover{color:var(--bronze-dark)}
main{flex:1;display:flex;align-items:center}
.grid{max-width:1180px;margin:0 auto;padding:56px 28px;display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;width:100%}
.kicker{font-size:13px;color:var(--bronze-dark);display:flex;align-items:center;gap:10px;margin-bottom:22px}
.kicker .dash{width:26px;height:1px;background:var(--bronze-dark)}
h1{font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:-.01em;font-size:clamp(2rem,4vw,3.1rem);line-height:1.08;margin:0 0 20px;max-width:18ch}
.lead{color:var(--muted);font-size:17px;max-width:46ch;margin:0 0 30px}
.steps{list-style:none;margin:0 0 34px;padding:0;border-top:1px solid var(--line)}
.steps li{display:grid;grid-template-columns:44px 1fr;gap:6px;padding:14px 0;border-bottom:1px solid var(--line);font-size:15px}
.steps b{font-weight:500}
.steps .n{color:var(--bronze-dark);font-size:13px;padding-top:2px}
.actions{display:flex;flex-wrap:wrap;gap:12px}
.btn{font-family:'IBM Plex Mono',monospace;font-size:13.5px;padding:14px 24px;display:inline-flex;align-items:center;gap:10px;border:1px solid var(--ink);transition:background .2s,color .2s,border-color .2s}
.btn-solid{background:var(--ink);color:var(--paper)}
.btn-solid:hover{background:var(--bronze);border-color:var(--bronze)}
.btn-outline:hover{border-color:var(--bronze);color:var(--bronze-dark)}
figure{margin:0;position:relative}
figure img{width:100%;height:auto;display:block;aspect-ratio:4/3;object-fit:cover;filter:saturate(.9)}
figure .veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(21,23,26,0) 45%,rgba(21,23,26,.72))}
figure .badge{position:absolute;left:20px;bottom:18px;right:20px;color:var(--paper);display:flex;align-items:center;gap:10px;font-size:12.5px;letter-spacing:.04em}
figure .badge span{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid rgba(241,240,236,.5)}
figure::before{content:"";position:absolute;inset:-12px 12px 12px -12px;border:1px solid var(--line);z-index:-1}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
footer .in{padding:18px 28px;flex-wrap:wrap}
@media (max-width:860px){
  .grid{grid-template-columns:1fr;gap:36px;padding:32px 22px 44px}
  figure{order:-1}
  figure::before{display:none}
  header .in,footer .in{padding-left:22px;padding-right:22px}
  .btn{width:100%;justify-content:center}
}
</style></head><body>
<header><div class="in">
  <a href="/" aria-label="PROMPOLU — accueil"><img src="/assets/logo-prompolu.png" alt="PROMPOLU ALUMINIUM" width="188" height="26"></a>
  <a class="back mono" href="/visualisation-3d.html">← Visualisation 3D</a>
</div></header>
<main><div class="grid">
  <section>
    <div class="kicker mono"><span class="dash"></span>${esc(copy.kicker)}</div>
    <h1>${esc(copy.title)}</h1>
    <p class="lead" data-reason="${reason}">${esc(copy.text)}</p>
    <ol class="steps">
      <li><span class="n mono">01</span><span><b>Écrivez-nous sur WhatsApp.</b> Nom de votre menuiserie et numéro qui recevra les demandes.</span></li>
      <li><span class="n mono">02</span><span><b>Recevez votre lien personnel</b>, à votre nom et à vos couleurs.</span></li>
      <li><span class="n mono">03</span><span><b>Envoyez-le à vos clients :</b> ils voient le produit chez eux, à taille réelle.</span></li>
    </ol>
    <div class="actions">
      <a class="btn btn-solid" href="${esc(wa)}">${waIcon}${esc(copy.cta)}</a>
      <a class="btn btn-outline" href="/visualisation-3d.html">Découvrir l’outil</a>
    </div>
  </section>
  <figure>
    <img src="/assets/visualisation-3d-teaser.jpg" alt="Pergola bioclimatique en aluminium en réalité augmentée" width="1200" height="900">
    <div class="veil"></div>
    <figcaption class="badge mono"><span>${lock}</span>Pergola · garde-corps · coulissant · battant — en réalité augmentée</figcaption>
  </figure>
</div></main>
<footer><div class="in mono"><span>© ${new Date().getFullYear()} PROMPOLU ALUMINIUM — Fès &amp; Sefrou, Maroc</span><span>+212 6 68 37 85 38</span></div></footer>
</body></html>`;
  return new Response(html, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
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

