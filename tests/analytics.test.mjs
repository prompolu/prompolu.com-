import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Run the actual script with a controlled document. No Google requests are made.
function analytics(choice, path = '/coulissants') {
  const saved = new Map(choice ? [['prompolu_consentement', choice]] : []);
  const handlers = {}, scripts = [], banners = [];
  const document = {
    readyState: 'complete', cookie: '',
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector: () => banners[0] || null,
    head: { appendChild: (node) => scripts.push(node) },
    body: { appendChild: (node) => banners.push(node) },
    createElement: () => {
      const buttons = {};
      return {
        setAttribute() {},
        querySelector: (selector) => ({ addEventListener: (_, fn) => { buttons[selector] = fn; } }),
        remove() { banners.splice(banners.indexOf(this), 1); },
        buttons
      };
    }
  };
  const location = new URL('https://prompolu.com' + path);
  const window = {};
  const localStorage = { getItem: (k) => saved.get(k) || null, setItem: (k,v) => saved.set(k,v), removeItem: (k) => saved.delete(k) };
  vm.runInNewContext(readFileSync(new URL('../assets/analytics.js', import.meta.url), 'utf8'), { window, document, location, localStorage, URL });
  function click(href, placement = 'contenu') {
    const a = {
      href: new URL(href, location).href,
      getAttribute: () => null,
      closest: (selector) => selector === 'header' && placement === 'entete' ? {} : null
    };
    handlers.click({ target: { closest: (selector) => selector === 'a' ? a : null } });
  }
  const events = () => Array.from(window.dataLayer).filter((a) => a[0] === 'event');
  return { window, click, events, scripts, banners, saved, handlers };
}

test('no unanswered or refused clicks are queued or replayed on later consent', () => {
  for (const choice of [undefined, 'non']) {
    const a = analytics(choice);
    a.click('/contact?systeme=S53RP%2B#formulaire');
    assert.equal(a.scripts.length, 0);
    assert.equal(a.events().length, 0);
    if (a.banners.length) {
      a.banners[0].buttons['.consent-yes']();
      assert.equal(a.scripts.length, 1);
      assert.equal(a.events().length, 0);
      a.click('/contact?systeme=S53RP%2B#formulaire');
      assert.equal(a.events().length, 1);
    }
  }
});

test('product and inline quote links track once by destination and preserve safe context', () => {
  const a = analytics('oui', '/showroom-sefrou');
  a.click('/contact?systeme=S53RP%2B&magasin=sefrou#formulaire');
  a.click('/contact#formulaire');
  a.click('/contact');
  assert.deepEqual(a.events().map((e) => e[1]), ['clic_demander_devis', 'clic_demander_devis', 'clic_contact']);
  const context = JSON.parse(JSON.stringify(a.events()[0][2]));
  assert.equal(context.product_reference, 'S53RP+');
  assert.equal(context.magasin, 'sefrou');
  assert.equal(context.page, '/showroom-sefrou');
  // User-entered names/references are never forwarded as analytics dimensions.
  a.click('/contact?systeme=CLIENT%20NAME%20client%40example.com&magasin=0600000000#formulaire');
  assert.equal(a.events().at(-1)[2].product_reference, 'autre');
  assert.equal(a.events().at(-1)[2].magasin, 'a_preciser');
  assert.doesNotMatch(JSON.stringify(a.events()), /client@|CLIENT NAME|0600000000/);
});

test('tracking uses exact destinations rather than CSS or similar external hosts', () => {
  const a = analytics('oui');
  a.click('https://wa.me.attacker.example/contact');
  a.click('https://elsewhere.example/contact#formulaire');
  a.click('/visualisation-3d');
  assert.equal(a.events().length, 0);
  a.click('https://wa.me/212668378538');
  a.click('tel:+212668378538');
  a.click('https://maps.google.com/?cid=10734799803496495182');
  assert.deepEqual(a.events().map((e) => e[1]), ['clic_whatsapp', 'clic_telephone', 'clic_itineraire']);
});

test('changing consent disables subsequent events and offers a new choice', () => {
  const a = analytics('oui');
  a.handlers.click({ target: { closest: (s) => s === '[data-consent-reset]' ? {} : null } });
  a.click('/contact#formulaire');
  a.window.prompoluTrack('devis_whatsapp', { reference: 'S90RP', magasin: 'fes' });
  assert.equal(a.events().length, 0);
  assert.equal(a.window['ga-disable-G-EF8H28NFLQ'], true);
  assert.equal(a.saved.has('prompolu_consentement'), false);
  assert.equal(a.banners.length, 1);
  a.banners[0].buttons['.consent-yes']();
  a.click('/contact#formulaire');
  assert.equal(a.events().length, 1);
  assert.equal(a.scripts.length, 1);
});
