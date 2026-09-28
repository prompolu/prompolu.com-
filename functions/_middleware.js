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
  const text = {
    MISSING: 'La visualisation 3D est réservée aux clients professionnels de PROMPOLU. Demandez votre accès : nous vous envoyons votre lien personnel.',
    INVALID: 'Ce lien n’est pas valable. Il a peut-être été mal copié : demandez à PROMPOLU de vous le renvoyer.',
    EXPIRED: `Votre accès a expiré le ${frDate}. Contactez PROMPOLU pour le renouveler.`,
  }[reason];
  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(reason === 'EXPIRED'
    ? 'Bonjour, je souhaite renouveler mon accès à la visualisation 3D PROMPOLU.'
    : 'Bonjour, je souhaite un accès à la visualisation 3D PROMPOLU.')}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Accès réservé | PROMPOLU</title>
<style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15171a;color:#f1f0ec;
font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;box-sizing:border-box}
main{max-width:460px}.k{color:#8c6a45;font-size:12px;letter-spacing:.14em;font-weight:700}
h1{font-size:28px;line-height:1.2;margin:.3em 0 .5em}p{color:#c9c7c1;margin:0 0 1.4em}
a.b{display:inline-block;background:#f1f0ec;color:#15171a;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px}
a.s{display:block;margin-top:18px;color:#8c6a45}
</style></head><body><main>
<div class="k">PROMPOLU ALUMINIUM</div>
<h1>Visualisation 3D — accès réservé</h1>
<p data-reason="${reason}">${esc(text)}</p>
<a class="b" href="${esc(wa)}">Demander l’accès sur WhatsApp</a>
<a class="s" href="/visualisation-3d.html">Découvrir la visualisation 3D</a>
</main></body></html>`;
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

