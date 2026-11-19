# PROMPOLU — Le passage

Independent preview based on Claude's `claude/stoic-faraday-q6bhoa` immersive POV concept. No production page, routing, sitemap or analytics was changed.

The selected catalogue contains S70P, S70R, S86RP, S88R, S88RP, S90P, S90R, S90RP, S110P, S125RP and S140RP Infinity. S88RP Prime and S88RP élevable are intentionally excluded from the presentation.

The camera moves through each unobstructed opening at human eye height. The glass slides along the rails before crossing, with a preliminary lift and handle rotation on the lift-and-slide systems. Geometry comes from the existing PROMPOLU configurator; product limits come from the current product pages. Cross-sections and display dimensions are illustrative, not fabrication drawings.

## Run

The checked-in bundle requires no build or external CDN. Serve the repository root with `python3 -m http.server 8790`, then open `/preview/coulissants-immersifs/`.

To edit/rebuild, run `npm ci` and `npm run build` in this folder. Three.js 0.170.0 and esbuild are pinned. The preview uses the repository's fonts and product images.

## Controls and accessibility

Scroll or use automatic playback. The product rail and catalogue's “Voir en 3D” buttons jump to individual bays. Left/right arrow keys change the current system when focus is outside a control. Finish buttons recolour the scene. “Sans animation”, reduced-motion and data-saver preferences expose a static presentation. The server-rendered catalogue remains available with JavaScript disabled.

Only visible or changed frames render; geometry and materials are shared, glass uses Fresnel transparency, the shadow frustum is fitted once, and resolution adapts to render cost. No post-processing chain or glass transmission render is used.

## Assets

The photographic environment and asphalt PBR maps were retained from the reference preview: Poly Haven `goegap_road` and `asphalt_04`, CC0. Three.js is MIT licensed (its notice is retained in the bundled script). PROMPOLU fonts, logos and product images come from the existing repository.

For visual QA: `window.__preview.goto(0.5)` or `window.__preview.visit(4)`. The scene exposes geometry and render statistics through `window.__preview.scene`.
