// SEO / GEO guard: locks in the fixes from the November 2026 audit so they can't silently regress.
// Runs with the rest of the suite: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
const exists = (p) => existsSync(root + p);
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&rsquo;/g, "'").replace(/&quot;/g, '"')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const sitemap = read('sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pathOf = (u) => new URL(u).pathname;
const fileFor = (p) => (p.endsWith('/') ? p.slice(1) + 'index.html' : p.slice(1) + '.html');
const pages = urls.map((u) => ({ url: u, path: pathOf(u), file: fileFor(pathOf(u)), html: read(fileFor(pathOf(u))) }));

/** Resolve a site-relative href to a file on disk (pages are served without .html). */
function resolves(href) {
  const p = decodeURI(href.split(/[?#]/)[0]);
  if (p === '/' ) return true;
  if (p.endsWith('/')) return exists(p.slice(1) + 'index.html');
  return exists(p.slice(1)) || exists(p.slice(1) + '.html');
}

test('titles and descriptions stay within search-result limits and unique', () => {
  const descs = new Map();
  for (const { file, html } of pages) {
    const title = decode(html.match(/<title>([^<]*)<\/title>/)[1]);
    assert.ok(title.length >= 30 && title.length <= 60, `${file}: title is ${title.length} chars (30-60): ${title}`);
    const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '');
    assert.ok(desc.length >= 120 && desc.length <= 160, `${file}: description is ${desc.length} chars (120-160)`);
    assert.ok(!descs.has(desc), `${file}: same description as ${descs.get(desc)}`);
    descs.set(desc, file);
  }
});

test('every page has lang, viewport and its own existing preview image', () => {
  for (const { file, html } of pages) {
    assert.match(html, /<html lang="fr">/, file);
    assert.match(html, /<meta name="viewport"/, file);
    const og = html.match(/<meta property="og:image" content="https:\/\/prompolu\.com(\/[^"]+)"/);
    assert.ok(og && exists(og[1].slice(1)), `${file}: og:image missing or not on disk`);
  }
});

test('every page keeps a self-contained « En bref » answer near the top (GEO)', () => {
  for (const { file, html } of pages) {
    const main = html.slice(html.indexOf('<main'));
    const at = main.indexOf('class="answer-first"');
    assert.ok(at > -1, `${file}: no « En bref » answer block`);
    assert.ok(at < main.length * 0.35, `${file}: « En bref » should sit in the first third of the page`);
  }
});

test('headings: one h1, no skipped levels, no French punctuation stranded on its own line', () => {
  for (const { file, html } of pages) {
    const heads = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)];
    assert.equal(heads.filter((h) => h[1] === '1').length, 1, `${file}: h1 count`);
    let prev = 0;
    for (const [, lvl, inner] of heads) {
      assert.ok(+lvl <= prev + 1 || prev === 0, `${file}: heading jumps from h${prev} to h${lvl}: ${strip(inner)}`);
      prev = +lvl;
      if (+lvl <= 2) assert.doesNotMatch(inner.replace(/<[^>]+>/g, ''), / [?!:;]/, `${file}: use &nbsp; before ?!:; in "${strip(inner)}"`);
    }
  }
});

test('images: alt text, dimensions, and the hero image is never lazy', () => {
  for (const { file, html } of pages) {
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /\balt="/, `${file}: img without alt: ${tag.slice(0, 90)}`);
      assert.match(tag, /\bwidth="\d+"[^>]*\bheight="\d+"|\bheight="\d+"[^>]*\bwidth="\d+"/, `${file}: img without width/height (layout shift): ${tag.slice(0, 90)}`);
      assert.ok(!(/loading="lazy"/.test(tag) && /fetchpriority="high"/.test(tag)), `${file}: lazy + high priority`);
    }
    const hero = html.match(/<section class="page-hero">[\s\S]*?<\/section>/);
    for (const [tag] of (hero?.[0] || '').matchAll(/<img\b[^>]*>/g)) {
      assert.doesNotMatch(tag, /loading="lazy"/, `${file}: hero image must load immediately (LCP)`);
    }
  }
  for (const [, img] of sitemap.matchAll(/<image:loc>https:\/\/prompolu\.com\/([^<]+)<\/image:loc>/g)) {
    assert.ok(exists(img), `sitemap image missing: ${img}`);
  }
});

test('internal links all resolve, and every page is linked from at least 3 others', () => {
  const inbound = new Map(pages.map((p) => [p.path, new Set()]));
  for (const { file, path, html } of pages) {
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
      if (href.startsWith('/ar/') || href.startsWith('/assets/') && /\.(css|png|ico|woff2)$/.test(href)) continue;
      assert.ok(resolves(href), `${file}: broken internal link ${href}`);
      const target = href.split(/[?#]/)[0];
      if (target !== path && inbound.has(target)) inbound.get(target).add(path);
    }
  }
  for (const [path, from] of inbound) {
    if (path === '/') continue;
    assert.ok(from.size >= 3, `${path} is linked from only ${from.size} page(s); add internal links`);
  }
});

test('scripts never block rendering; external links use https', () => {
  for (const { file, html } of pages) {
    for (const [tag] of html.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g)) {
      assert.match(tag, /\b(defer|async)\b|type="module"/, `${file}: render-blocking script ${tag}`);
    }
    assert.doesNotMatch(html, /href="http:\/\//, `${file}: insecure http:// link`);
  }
});

test('animations never hide content from screen readers, Ctrl+F or crawlers', () => {
  const motion = read('assets/motion.js');
  assert.doesNotMatch(motion, /autoAlpha/, 'motion.js: use opacity, not autoAlpha (visibility:hidden)');
  assert.doesNotMatch(motion, /visibility\s*:/, 'motion.js: never animate visibility');
  assert.match(motion, /prefers-reduced-motion: no-preference/, 'motion.js must respect reduced motion');
  for (const css of ['assets/refinements.css', 'pages.css', 'styles.css']) {
    assert.doesNotMatch(read(css), /\.answer-first[^{]*\{[^}]*display\s*:\s*none/, `${css}: never hide the « En bref » block`);
  }
});

test('structured data stays valid and honest', () => {
  for (const { file, path, html } of pages) {
    for (const [, block] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(block);
      assert.ok(data['@context'], `${file}: JSON-LD without @context`);
      const nodes = []; (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { nodes.push(o); Object.values(o).forEach(walk); } })(data);
      for (const n of nodes) {
        if (n['@type'] === 'Article') for (const k of ['headline', 'datePublished', 'author', 'image']) assert.ok(n[k], `${file}: Article missing ${k}`);
        if (n['@type'] === 'BreadcrumbList') n.itemListElement.forEach((e, i) => assert.equal(e.position, i + 1, `${file}: breadcrumb positions`));
        // Range pages list links; full Product data lives only on each product's own page.
        if (n['@type'] === 'Product') assert.match(path, /^\/(coulissants|battants|exterieur)\/[^/]+$/, `${file}: Product markup belongs on product pages only`);
      }
    }
  }
});

test('no duplicate copies ("page 2.html", "image 2.webp") are ever published', async () => {
  const { execFileSync } = await import('node:child_process');
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  const copies = tracked.filter((f) => / \d+\.[^/]+$/.test(f));
  assert.deepEqual(copies, [], `duplicate copies tracked in git: ${copies.slice(0, 5).join(', ')}`);
});

test('crawler files stay open to search and AI search bots', () => {
  const robots = read('robots.txt');
  assert.match(robots, /Sitemap: https:\/\/prompolu\.com\/sitemap\.xml/);
  for (const bot of ['\\*', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']) {
    const group = robots.match(new RegExp(`User-agent: ${bot}\\n((?:(?!User-agent).*\\n?)*)`));
    if (group) assert.doesNotMatch(group[1], /^Disallow: \/\s*$/m, `robots.txt blocks ${bot}`);
  }
  const listed = new Set(urls);
  for (const [, u] of read('llms.txt').matchAll(/\((https:\/\/prompolu\.com\/[^)\s#]*)/g)) {
    assert.ok(listed.has(u), `llms.txt links to ${u}, which is not in the sitemap`);
  }
});
