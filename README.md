# prompolu.com-

Site statique servi par Cloudflare Pages, avec une fonction de contrôle d'accès à l'espace 3D.

Les pages publiques utilisent des URL sans `.html` : `/coulissants`, `/contact`,
et `/conseils/` pour le dossier de guides. Conserver cette forme dans les liens,
les données structurées, les balises canonical, `sitemap.xml` et `llms.txt`.

La racine du dépôt est publiée telle quelle. Les notes internes (`README.md`,
`COURRIER-*`, `LISEZ-MOI*`, `CNAME`, `tests/`, `.agents/`) sont renvoyées en 404
par `functions/_middleware.js` ; une nouvelle note interne doit suivre ces noms.

## Vérification locale

Avec Node.js 22 ou une version plus récente, sans dépendance à installer :

```sh
node --test tests/*.test.mjs
```

Les tests vérifient les URL publiques, les références des demandes de devis,
les scripts de navigation/formulaire et le maintien du contrôle d'accès signé
à la 3D. Les interactions utilisent des doublures DOM ; elles ne mesurent pas
le rendu mobile ou les Core Web Vitals. Aucun message n'est envoyé.

Les données S125RP citées renvoient à STRUGAL Maroc. Valider ensemble la version,
la quincaillerie et les dimensions avant toute fabrication.
