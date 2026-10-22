import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');
const locations = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const fileFor = (url) => {
  const path = new URL(url).pathname;
  return path.endsWith('/') ? path.slice(1) + 'index.html' : path.slice(1) + '.html';
};

test('all 16 public sitemap destinations match existing pages and self canonicals', () => {
  assert.equal(locations.length, 16);
  assert.equal(new Set(locations).size, 16);
  const titles = new Set();
  const organizationDescriptions = new Set();
  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.origin, 'https://prompolu.com');
    assert.doesNotMatch(url.pathname, /\.html$/);
    const file = fileFor(location);
    assert.ok(existsSync(root + file), file);
    const page = read(file);
    assert.doesNotMatch(page, /<meta[^>]+(?:name="robots"|http-equiv="X-Robots-Tag")[^>]+content="[^"]*noindex/i, file);
    for (const [, href] of page.matchAll(/<link rel="stylesheet" href="(\/[^"]+)"/g)) {
      assert.ok(existsSync(root + new URL(href, 'https://prompolu.com').pathname.slice(1)), href);
    }
    assert.equal(page.match(/<link rel="canonical" href="([^"]+)"/)[1], location, file);
    assert.equal(page.match(/<meta property="og:url" content="([^"]+)"/)[1], location, file);
    assert.equal(page.match(/<meta property="og:site_name" content="([^"]+)"/)?.[1], 'PROMPOLU ALUMINIUM', file);
    assert.equal((page.match(/<h1[\s>]/g) || []).length, 1, file);
    titles.add(page.match(/<title>([^<]+)<\/title>/)[1]);
    assert.doesNotMatch(page, /href="\/(?!ar\/)[^"?#]*\.html(?:["?#])/);
    assert.match(page, /id="navToggle"[^>]*aria-controls="mainNav"[^>]*aria-expanded="false"/);
    for (const match of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(match[1]);
      assert.doesNotMatch(JSON.stringify(data), /https:\/\/(?:www\.)?prompolu\.com\/[^"\s]*\.html/);
      if (data['@graph']) {
        for (const org of data['@graph'].filter((n) => n['@type'] === 'Organization')) {
          assert.ok(org.description, file);
          organizationDescriptions.add(org.description);
        }
        const branches = data['@graph'].filter((n) => n['@type'] === 'HomeAndConstructionBusiness');
        for (const branch of branches) {
          const expected = branch['@id'].endsWith('magasin-fes') ? '/grossiste-aluminium-fes' : '/showroom-sefrou';
          assert.equal(new URL(branch.url).pathname, expected);
        }
      }
    }
  }
  assert.equal(titles.size, 16);
  assert.equal(organizationDescriptions.size, 1);
  assert.doesNotMatch(read('llms.txt'), /https:\/\/prompolu\.com\/[^\s)]*\.html/);
});

test('all product quote links carry their exact reference, including plus signs and spaces', () => {
  for (const [file, count] of [['coulissants.html', 11], ['battants.html', 4]]) {
    const cards = [...read(file).matchAll(/<div class="sys-name display">([^<]+)<\/div>[\s\S]*?<a class="sys-quote" href="([^"]+)"/g)];
    assert.equal(cards.length, count);
    for (const [, name, href] of cards) {
      const url = new URL(href, 'https://prompolu.com');
      assert.equal(url.pathname, '/contact');
      assert.equal(url.hash, '#formulaire');
      assert.equal(url.searchParams.get('systeme'), name);
    }
  }
  const contact = read('contact.html');
  assert.match(contact, /id="qf-nom"[^>]*required[^>]*aria-describedby="qf-nom-error"/);
  assert.match(contact, /id="qf-tel"[^>]*required[^>]*aria-describedby="qf-tel-error"/);
});

test('technical corrections cite the regional manufacturer and state configuration conditions', () => {
  for (const file of ['coulissants.html', 'conseils/guide-choisir-systeme-coulissant-aluminium.html']) {
    const text = read(file);
    assert.match(text, /strugal\.ma\/fr\/fen%C3%AAtres-en-aluminium\/strugal-s125rp/);
    assert.match(text, /400 kg\*/);
    assert.match(text, /3200 × 3000 mm/);
    assert.match(text, /maxima ne sont pas automatiquement cumulables/);
    assert.doesNotMatch(text, /valeurs que STRUGAL ne publie pas/);
  }
  for (const file of ['conseils/index.html', 'conseils/guide-choisir-systeme-coulissant-aluminium.html', 'conseils/rupture-de-pont-thermique-aluminium.html']) {
    assert.match(read(file), /137 mm/);
    assert.doesNotMatch(read(file), /Le chiffre (?:indique|donne) la largeur du cadre/);
  }
});

const visibleText = (fragment) => fragment.replace(/<span class="q-mark">\+<\/span>/g, '').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const jsonLdNodes = (page) => [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((m) => { const data = JSON.parse(m[1]); return data['@graph'] || [data]; });

test('guide structured data mirrors the visible headline, dates, breadcrumbs and FAQ', () => {
  const guides = locations.filter((l) => /\/conseils\/[^/]+$/.test(l));
  assert.equal(guides.length, 4);
  for (const location of guides) {
    const file = fileFor(location);
    const page = read(file);
    const nodes = jsonLdNodes(page);
    const byType = (type) => nodes.filter((n) => n['@type'] === type);
    assert.ok(byType('Organization').some((n) => n['@id'] === 'https://prompolu.com/#organization'), file);
    const [article] = byType('Article');
    assert.equal(article.headline, visibleText(page.match(/<h1>([\s\S]*?)<\/h1>/)[1]), file);
    assert.equal(article.mainEntityOfPage, location, file);
    assert.equal(article.author['@id'], 'https://prompolu.com/#organization', file);
    assert.match(article.image, /^https:\/\/prompolu\.com\/assets\/[\w-]+\.(jpg|webp)$/, file);
    assert.ok(existsSync(root + new URL(article.image).pathname.slice(1)), file);
    const meta = visibleText(page.match(/<p class="post-meta">([\s\S]*?)<\/p>/)[1]);
    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const frDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${months[m - 1]} ${y}`; };
    assert.ok(meta.includes('Publié le ' + frDate(article.datePublished)), file);
    if (article.dateModified !== article.datePublished) assert.ok(meta.includes('Mis à jour le ' + frDate(article.dateModified)), file);
    const crumbs = byType('BreadcrumbList')[0].itemListElement;
    assert.deepEqual(crumbs.map((c) => c.item), ['https://prompolu.com/', 'https://prompolu.com/conseils/', location], file);
    const visibleFaq = [...page.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p class="faq-a">([\s\S]*?)<\/p>/g)]
      .map(([, q, a]) => [visibleText(q), visibleText(a)]);
    const faq = byType('FAQPage');
    if (!visibleFaq.length) { assert.equal(faq.length, 0, file); continue; }
    assert.deepEqual(faq[0].mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), visibleFaq, file);
  }
  const listed = jsonLdNodes(read('conseils/index.html')).find((n) => n['@type'] === 'CollectionPage').mainEntity.itemListElement;
  assert.deepEqual(listed.map((i) => i.url).sort(), guides.sort());
});

const moduleSource = read('functions/_middleware.js');
const middleware = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));
const invoke = (url, { method = 'GET', cookie, env = {} } = {}) => {
  let calls = 0;
  const headers = cookie ? { Cookie: cookie } : {};
  return middleware.onRequest({
    request: new Request(url, { method, headers }), env,
    next: () => { calls++; return new Response('origin', { headers: { 'X-Test-Next': String(calls) } }); },
  });
};

test('production public aliases redirect once to the intended canonical and retain query strings', async () => {
  for (const canonical of locations) {
    const target = new URL(canonical);
    const filePath = '/' + fileFor(canonical);
    for (const host of ['prompolu.com', 'www.prompolu.com']) {
      const response = await invoke(`https://${host}${filePath}?source=atelier&systeme=S53RP%2B`);
      assert.equal(response.status, 308);
      const result = new URL(response.headers.get('location'));
      assert.equal(result.origin + result.pathname, canonical);
      assert.equal(result.searchParams.get('systeme'), 'S53RP+');
      const final = await invoke(result.href);
      assert.equal(final.status, 200);
      assert.equal(final.headers.get('location'), null);
    }
    const www = await invoke(`https://www.prompolu.com${target.pathname}`, { method: 'HEAD' });
    assert.equal(www.status, 308);
    assert.equal(www.headers.get('location'), canonical);
  }
});

test('canonical requests, previews, unknown paths, assets and POSTs retain their existing routing', async () => {
  for (const url of ['https://prompolu.com/coulissants', 'https://preview.pages.dev/contact.html', 'http://localhost:8788/contact.html', 'https://prompolu.com/not-a-real-page.html', 'https://www.prompolu.com/assets/site.css']) {
    const response = await invoke(url);
    assert.equal(response.headers.get('X-Test-Next'), '1', url);
    assert.equal(response.headers.get('location'), null, url);
  }
  const post = await invoke('https://www.prompolu.com/contact.html', { method: 'POST' });
  assert.equal(post.headers.get('X-Test-Next'), '1');
});

test('private 3D routes and model assets remain denied without a signed token', async () => {
  for (const path of ['/ar/', '/ar/coulissants/', '/ar/partners.json', '/ar/models/example.glb', '/example.usdz']) {
    const response = await invoke('https://www.prompolu.com' + path);
    assert.equal(response.status, 403, path);
    assert.equal(response.headers.get('location'), null, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
  }
});

test('repository notes, tests and marketing context are not served; crawler files stay public', async () => {
  for (const path of ['/README.md', '/COURRIER-STRUGAL.md', '/LISEZ-MOI-DEPLOIEMENT.txt', '/CNAME', '/tests/seo.test.mjs', '/.agents/product-marketing.md']) {
    const response = await invoke('https://prompolu.com' + path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('X-Test-Next'), null, path);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex', path);
  }
  for (const path of ['/robots.txt', '/llms.txt', '/sitemap.xml', '/assets/battants.webp']) {
    assert.equal((await invoke('https://prompolu.com' + path)).headers.get('X-Test-Next'), '1', path);
  }
});

const keys = await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
const testEnv = { AR_TEST_KEYS: publicKey };
async function tokenFor(payload) {
  const body = Buffer.from(JSON.stringify({ v: 1, nm: 'Atelier de test', ph: '212600000000', ...payload })).toString('base64url');
  const signature = await webcrypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode('PROMPOLU-AR-1.' + body));
  return body + '.' + Buffer.from(signature).toString('base64url');
}

test('valid AR links still set the private cookie; cookie navigation restores the signed query', async () => {
  const token = await tokenFor({ x: '2099-01-01' });
  const response = await invoke('https://www.prompolu.com/ar/coulissants/?p=' + token, { env: testEnv });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(response.headers.get('cache-control'), 'private, no-cache');
  assert.match(response.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Lax/);
  const restored = await invoke('https://www.prompolu.com/ar/coulissants/', { env: testEnv, cookie: 'prompolu_ar=' + token });
  assert.equal(restored.status, 302);
  const url = new URL(restored.headers.get('location'));
  assert.equal(url.hostname, 'www.prompolu.com');
  assert.equal(url.searchParams.get('p'), token);
});

test('expired or modified AR tokens remain denied and signed model requests stay private', async () => {
  const expired = await tokenFor({ x: '2020-01-01' });
  assert.equal((await invoke('https://prompolu.com/ar/?p=' + expired, { env: testEnv })).status, 403);
  const valid = await tokenFor({ x: '2099-01-01' });
  const tampered = valid.replace(/^[^.]+/, Buffer.from(JSON.stringify({ v: 1, nm: 'Modified', ph: '212600000000' })).toString('base64url'));
  assert.equal((await invoke('https://prompolu.com/ar/?p=' + tampered, { env: testEnv })).status, 403);
  const model = await invoke('https://prompolu.com/ar/models/example.glb', { env: testEnv, cookie: 'prompolu_ar=' + valid });
  assert.equal(model.status, 200);
  assert.equal(model.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(model.headers.get('X-Robots-Tag'), 'noindex');
});
