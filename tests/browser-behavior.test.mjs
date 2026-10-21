// Run the actual browser scripts with DOM/event doubles. No external messages
// are sent. These tests cover behavior, not rendered layout or screen readers.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

class Element {
  constructor(document, attrs = {}) {
    this.document = document;
    this.attrs = { ...attrs };
    this.id = attrs.id;
    this.name = attrs.name;
    this.value = attrs.value || '';
    this.events = {};
    this.children = [];
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
    };
  }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  emit(name, props = {}) { for (const fn of this.events[name] || []) fn({ target: this, ...props }); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  focus() { this.document.activeElement = this; }
  contains(target) { return this === target || this.children.some((child) => child.contains(target)); }
}

function documentDouble() {
  const document = { elements: {}, activeElement: null };
  const events = new Element(document);
  document.addEventListener = events.addEventListener.bind(events);
  document.emit = events.emit.bind(events);
  document.getElementById = (id) => document.elements[id] || null;
  document.querySelectorAll = () => [];
  return document;
}

function navigation(pathname) {
  const document = documentDouble();
  const nav = new Element(document, { id: 'mainNav' });
  const toggle = new Element(document, { id: 'navToggle' });
  const markup = read('index.html').match(/<nav class="main mobile-nav" id="mainNav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = [...markup.matchAll(/<a href="([^"]+)"/g)].map((m) => {
    const element = new Element(document, { href: m[1] });
    element.pathname = new URL(m[1], 'https://prompolu.com').pathname;
    return element;
  });
  nav.children = links;
  nav.querySelectorAll = () => links;
  nav.querySelector = () => links[0];
  document.elements = { mainNav: nav, navToggle: toggle };
  vm.runInNewContext(read('assets/nav.js'), { document, window: { location: { pathname } } });
  return { document, nav, toggle, links };
}

test('navigation highlights canonical and legacy page URLs and the current guide section', () => {
  for (const pathname of ['/coulissants', '/coulissants.html']) {
    const { links } = navigation(pathname);
    assert.equal(links.filter((a) => a.classList.contains('active')).length, 1);
    assert.equal(links[0].getAttribute('aria-current'), 'page');
  }
  const { links } = navigation('/conseils/guide-choisir-systeme-coulissant-aluminium');
  const current = links.find((a) => a.classList.contains('active'));
  assert.equal(current.pathname, '/conseils/');
  assert.equal(current.getAttribute('aria-current'), 'location');
  assert.equal(navigation('/conseils-inexistant').links.some((a) => a.classList.contains('active')), false);
});

test('mobile menu exposes state, focuses a link and closes on Escape, navigation or outside click', () => {
  const { document, nav, toggle, links } = navigation('/');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), 'mainNav');
  toggle.emit('click');
  assert.ok(nav.classList.contains('open'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, links[0]);
  document.emit('keydown', { key: 'Escape' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, toggle);
  toggle.emit('click'); links[0].emit('click');
  assert.equal(nav.classList.contains('open'), false);
  toggle.emit('click'); document.emit('click', { target: new Element(document) });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

function quoteForm(search, restoredReference = '') {
  const document = documentDouble();
  const form = new Element(document, { id: 'devisForm' });
  const fields = {};
  for (const match of read('contact.html').matchAll(/<(?:input|select|textarea)\b([^>]+)>/g)) {
    const name = match[1].match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const element = new Element(document, { name });
    const wrapper = new Element(document);
    element.closest = () => wrapper;
    fields[name] = element;
  }
  fields.systeme.value = restoredReference;
  form.querySelector = (selector) => fields[selector.match(/name="([^"]+)"/)[1]] || null;
  document.elements = { devisForm: form };
  for (const id of ['qfWhatsapp', 'qfEmail', 'qfSent']) document.elements[id] = new Element(document, { id });
  const opened = [];
  const events = [];
  const window = { location: { search, pathname: '/contact' }, open: (...args) => opened.push(args), gtag: (...args) => events.push(args) };
  vm.runInNewContext(read('assets/devis.js'), { document, window, location: window.location, URLSearchParams });
  return { document, form, fields, window, opened, events };
}

test('reference prefill decodes plus signs, strips control characters, bounds length and keeps restored edits', () => {
  assert.equal(quoteForm('?systeme=S53RP%2B').fields.systeme.value, 'S53RP+');
  assert.equal(quoteForm('?systeme=A200%204FH2').fields.systeme.value, 'A200 4FH2');
  assert.equal(quoteForm('?systeme=S90%0ARP').fields.systeme.value, 'S90RP');
  assert.equal(quoteForm('?systeme=' + 'x'.repeat(200)).fields.systeme.value.length, 80);
  assert.equal(quoteForm('?systeme=S90RP', 'Choix corrigé').fields.systeme.value, 'Choix corrigé');
});

test('quote validation marks missing fields and does not open a draft until required fields are filled', () => {
  const { document, form, fields, opened } = quoteForm('?systeme=S125RP');
  document.elements.qfWhatsapp.emit('click');
  assert.equal(opened.length, 0);
  assert.equal(document.activeElement, fields.nom);
  assert.equal(fields.nom.getAttribute('aria-invalid'), 'true');
  assert.equal(fields.telephone.getAttribute('aria-invalid'), 'true');
  fields.nom.value = 'Atelier de test';
  form.emit('input', { target: fields.nom });
  assert.equal(fields.nom.getAttribute('aria-invalid'), 'false');
  fields.telephone.value = '0600000000';
  document.elements.qfWhatsapp.emit('click');
  assert.equal(opened.length, 1);
  const draft = new URL(opened[0][0]);
  assert.equal(draft.origin + draft.pathname, 'https://wa.me/212668378538');
  assert.match(draft.searchParams.get('text'), /Système \/ référence : S125RP/);
  assert.equal(opened[0][2], 'noopener');
});

test('email prepares a draft with the edited product, and form submit never sends automatically', () => {
  const { document, form, fields, window, opened } = quoteForm('?systeme=S90RP');
  fields.nom.value = 'Atelier de test';
  fields.telephone.value = '0600000000';
  fields.systeme.value = 'S53RP+';
  document.elements.qfEmail.emit('click');
  const draft = new URL(window.location.href);
  assert.equal(draft.protocol, 'mailto:');
  assert.match(draft.searchParams.get('body'), /Système \/ référence : S53RP\+/);
  assert.equal(opened.length, 0);
  let prevented = false;
  form.emit('submit', { preventDefault() { prevented = true; } });
  assert.ok(prevented);
});
