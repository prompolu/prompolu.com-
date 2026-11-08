import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUNDLES, bundleContent } from '../tools/build-css.mjs';

test('CSS bundles match their sources (run: node tools/build-css.mjs)', () => {
  for (const [target, sources] of Object.entries(BUNDLES)) {
    assert.equal(readFileSync(new URL(`../${target}`, import.meta.url), 'utf8'), bundleContent(sources), `${target} is stale: run node tools/build-css.mjs`);
  }
});

test('pages load the bundles instead of the separate stylesheets', () => {
  for (const file of ['index.html', 'contact.html', '404.html', 'battants/s40.html', 'conseils/index.html']) {
    const page = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(page, /href="\/assets\/bundle-core\.css"/, file);
    assert.doesNotMatch(page, /href="\/(?:styles|pages|image-layout)\.css/, file);
  }
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /href="\/assets\/bundle-home\.css"/);
});
