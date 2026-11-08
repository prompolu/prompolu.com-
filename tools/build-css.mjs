// Regroupe les feuilles de style pour réduire le nombre de requêtes bloquantes.
// Après toute modification d'un CSS source : node tools/build-css.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// L'ordre compte : c'est celui de la cascade. Les bundles sont dans /assets/,
// les url() relatives de fonts.css restent donc valides.
export const BUNDLES = {
  'assets/bundle-core.css': ['assets/fonts.css', 'assets/site.css', 'assets/visualisation-3d.css', 'styles.css', 'navigation.css', 'pages.css', 'image-layout.css'],
  'assets/bundle-home.css': ['home.css', 'assets/home-video.css'],
};

export function bundleContent(sources) {
  const body = sources.map((file) => `/* ${file} */\n${readFileSync(join(root, file), 'utf8').trim()}\n`).join('\n');
  return `/* Généré par tools/build-css.mjs : ne pas modifier ce fichier directement. */\n${body}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [target, sources] of Object.entries(BUNDLES)) {
    writeFileSync(join(root, target), bundleContent(sources));
    console.log(`${target} (${sources.length} fichiers)`);
  }
}
