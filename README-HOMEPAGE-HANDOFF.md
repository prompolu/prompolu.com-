# PROMPOLU homepage preview — Codex handoff

The approved work from the prior Codex environment is in `preview/homepage-video/`.

Branch: `codex/homepage-video-preview-20261106`

Base: `af13496f020c28d30766931f8db365e69d574de5` on `main`.

## User requirements

- Use https://aluminiumdumaroc.com/ as a layout reference while keeping PROMPOLU branding and business details.
- Keep the live website's fonts: Anton for display headings, DM Sans for body text and navigation.
- Use the supplied Wan video as the opening section background. Remove visible writing/watermark; the bottom watermark was removed by cropping 64 pixels from the bottom. The edited file is silent, 5 seconds, 1280 × 656, 30 fps.
- Work in preview only. Do not merge into `main`, change the live homepage, or deploy to `prompolu.com` without a separate request from the user.

## Files and resulting behavior

- `preview/homepage-video/index.html`: reference-inspired homepage with a transparent header, full-screen background video, company introduction, solution panels, showroom section and contact details. It has a preview-only `noindex,nofollow` meta tag.
- `preview/homepage-video/style.css`: responsive styling; local Anton and DM Sans fonts.
- `preview/homepage-video/script.js`: accessible modal menu, scroll header, pause/play controls and reduced-motion behavior. Background playback pauses when the hero is outside the viewport or the browser tab is hidden.
- `preview/homepage-video/hero-clean.mp4` and `poster.jpg`: edited video and fallback still.
- Existing root `assets/`: the preview reuses the repository’s Anton/DM Sans fonts, logos and illustrative imagery through relative paths; no duplicate assets are added. These images are illustrative and must not be described as verified photographs of STRUGAL installations.
- `preview/homepage-video/checksums.sha256`: SHA-256 checksums of the preview files.

Paths are relative so this preview also works inside a nested folder. Product and other-page links open existing pages on `prompolu.com`. There are no new form submissions, analytics or external font dependencies.

The root `index.html`, existing pages, public routing, SEO metadata, access-controlled 3D features and hosting configuration are unchanged. The preview-only Vercel deployment configuration was deliberately not copied into the repository root.

## Continue in another Codex environment

If the repository is already checked out, preserve any local work and use a separate worktree:

```sh
git fetch origin codex/homepage-video-preview-20261106
git worktree add ../prompolu-homepage-review origin/codex/homepage-video-preview-20261106
cd ../prompolu-homepage-review
python3 -m http.server 8000
```

Open `http://localhost:8000/preview/homepage-video/` in that environment's browser/forwarded port.

For a fresh checkout:

```sh
git clone --branch codex/homepage-video-preview-20261106 https://github.com/prompolu/prompolu.com-.git
cd prompolu.com-
python3 -m http.server 8000
```

Suggested prompt for the next Codex session:

> Continue the homepage preview on branch `codex/homepage-video-preview-20261106` in `prompolu/prompolu.com-`. Read `README-HOMEPAGE-HANDOFF.md`. Preserve any existing local changes and work in a separate worktree. Preview `preview/homepage-video/`. Keep Anton headings, DM Sans body text, the edited video and the reference-inspired layout. Do not merge into main or deploy to the live site. Ask me what refinements I want after opening the preview.

## Validation

- `node --test tests/*.test.mjs`: 18 existing repository checks passed.
- Browser checks covered video playback/mute/loop, pause/resume, menu opening and closing, Escape, section navigation, image loading, reduced motion and horizontal overflow at 360, 390, 768, 1024 and 1920 pixels.
- Repository-subfolder asset paths were checked after preparing this handoff.

Before a future root-homepage integration, preserve the existing canonical/Open Graph metadata and structured data, reconcile any FAQ markup with visible content, and keep preview-only robots restrictions out of the live page. That integration is not part of this handoff.
