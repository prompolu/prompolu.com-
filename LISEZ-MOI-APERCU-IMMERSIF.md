# Handoff: immersive homepage preview (`/preview/accueil-immersif/`)

Internal note (served as 404 by `functions/_middleware.js`, like every `LISEZ-MOI-*` file).

## What the owner asked for

1. A homepage in the style of apricode.agency: a scroll-driven 3D film, then editorial
   sections. Reuse the *approach* only. No Apricode assets, code, logo or copy.
2. Keep the live site's fonts: **Anton** for titles (uppercase, weight 400) and **DM Sans**
   for text, both from `/assets/fonts.css`.
3. The 3D must look **very realistic and very detailed**.
4. Latest request, not done yet: **remove the lag, make it feel smooth "like a dream"**.

## Where it is

- Branch `claude/stoic-faraday-q6bhoa`, commit `f5735f4`. `main` is untouched.
- Live branch preview (Cloudflare Pages, noindex):
  https://claude-stoic-faraday-q6bhoa.prompolu-com.pages.dev/preview/accueil-immersif/
- Files in `preview/accueil-immersif/`:
  - `index.html`: markup and copy (all facts from the live pages: EN 12207/12208/12210,
    S70P to S140RP specs, Fès and Sefrou addresses, hours, phones).
  - `accueil.css`: layout and type (PROMPOLU palette: paper `#f1f0ec`, ink, bronze `#a97c50`,
    aluminium, RAL 7021 `#2e3234`, RAL 1019 `#a4927c`).
  - `accueil.js`: loader, scroll → progress, copy choreography, adaptive header, reveals,
    card tilt, accordion, scroll-scrubbed "POURQUOI PROMPOLU", contact 3D cutaway, static
    fallback. Debug hook: `window.__apercu.goto(p)`. `?qualite=max` disables quality drops.
  - `scene.js`: realistic Three.js 0.169 scene at real scale (metres). Mitred 45° profiles
    built by sweeping detailed sections (`mitredBar`/`mitredFrame`), hero sliding window
    (2 sashes, 4/16/4 glazing, EPDM seals, handle, steel feet), a row of 20 frames along
    the road (4 finishes, instanced), a lift-and-slide exit bay. HDRI ground-projected
    background, sun shadows aligned with the photo, asphalt strip, post-processing.
  - `profile.js`: small 3D cutaway of a thermal-break profile in the contact section.
  - `media/`: Poly Haven CC0 assets. `goegap-road-1k.hdr` (lighting), `goegap-road-4k.webp`
    / `-2k.webp` (background plate, **HDR-encoded**: `s = (x/(1+x))^(1/2.2)`, decode
    `r = s^2.2; x = r/(1-r)`), `asphalt-*.webp` (asphalt_04 colour / normal / ARM).
- Never visually verified: the realistic rewrite of `scene.js` was pushed without a
  render check. The earlier, simpler version did render correctly.

## Next task: performance plan (agreed, not started)

1. Drop the EffectComposer chain (GTAO, UnrealBloom, Output, grade pass). Render straight to
   the canvas with `antialias: true` and renderer tone mapping. Add `#include
   <tonemapping_fragment>` and `<colorspace_fragment>` to the sky shader. Move vignette and
   film grain to CSS overlays.
2. Glass: drop `transmission` (it re-renders the scene). Use a transparent physical material
   whose alpha rises with Fresnel (`onBeforeCompile`), since flat 4 mm glass barely refracts.
3. Shadows: fit one static shadow camera to the whole road once (light-space bounds of the
   layout box, non-square map such as 4096×1024). Set `renderer.shadowMap.autoUpdate =
   false` and flag `needsUpdate` only while a sash moves. Replace GTAO with instanced
   contact-shadow decals under each frame.
4. Materials: powder coat as `MeshStandardMaterial` with orange-peel normal map, no
   clearcoat. Keep anisotropy only on desktop for anodised finishes.
5. Camera: replace per-segment smoothstep (it stops at every key) with monotone cubic
   (PCHIP / Fritsch–Carlson) interpolation of position, target and FOV over p.
6. Smooth scroll: add Lenis (jsdelivr ESM, pinned version, e.g. `lenis@1.1.13`) with lerp
   ≈ 0.07. Drive it from the existing rAF loop and read progress from Lenis's animated
   scroll. Route anchors and accordion scroll-anchoring through `lenis.scrollTo`. Disable it
   for reduced motion.
7. No layout thrashing: cache section offsets on resize and font/image load; compute
   everything from the scroll value; write a CSS property only when its value changes.
8. CSS: remove `backdrop-filter` on card arrows and the infinite `glint` animation on the
   footer wordmark. Add `will-change` on `.copy`. Add `decoding="async"` to images.
9. Adaptive resolution: watch smoothed frame time. Lower the pixel ratio in 0.85× steps
   above ~18 ms, raise it after about 2 s under 15 ms. Cap at 1.25–1.5.
10. Contact cutaway (`profile.js`): render only while something changes (pointer, assembly).

## How to check

- Tests: `node --test tests/*.test.mjs` (18 should pass).
- Local: `python3 -m http.server 8790` at the repo root, then open
  `/preview/accueil-immersif/?qualite=max`. Headless Chromium needs
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Software rendering is
  slow (about 20 s to ready, longer per frame with heavy passes), so use smaller viewports
  for screenshots.
- `.glb` and `.usdz` are behind signed links in the middleware. Keep them out of the preview.
