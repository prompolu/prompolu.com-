/* Site motion with GSAP 3.15.1 + ScrollTrigger + SplitText (assets/vendor).
   Rules:
   - Nothing is hidden by CSS: without JS (or if GSAP fails) the page reads normally.
   - Elements already on screen at load are never hidden or delayed (hero, LCP).
   - Scrubbed effects (parallax) start from the element's resting position.
   - prefers-reduced-motion: reduce turns every effect off.
   - Text stays in the HTML; SplitText adds aria-label so screen readers read whole headings.
   - Reveals use opacity only, never visibility, so screen readers and Ctrl+F always find the content. */
(() => {
  const { gsap, ScrollTrigger, SplitText } = window;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  if (SplitText) gsap.registerPlugin(SplitText);

  const below = el => el.getBoundingClientRect().top > window.innerHeight * 0.9;
  const pick = (selector, onlyBelow = true) =>
    gsap.utils.toArray(selector).filter(el => !onlyBelow || below(el));
  const ease = 'power3.out';

  const mm = gsap.matchMedia();
  mm.add({
    motion: '(prefers-reduced-motion: no-preference)',
    wide: '(min-width: 768px)',
  }, ({ conditions: { motion, wide } }) => {
    if (!motion) return;
    const cleanups = [];   // undo the few DOM changes GSAP can't revert on its own

    /* 1. Section titles (not headings inside articles): lines rise out of a mask */
    if (SplitText) {
      pick('main h2').filter(h2 => !h2.closest('article')).forEach(h2 => {
        SplitText.create(h2, {
          type: 'lines', mask: 'lines', autoSplit: true,
          onSplit: self => gsap.from(self.lines, {
            yPercent: 105, duration: 0.8, ease, stagger: 0.08,
            scrollTrigger: { trigger: h2, start: 'top 88%', once: true },
          }),
        });
      });
    }

    /* 2. Cards and blocks: rise and fade in, a few at a time */
    const GROUPS = [
      ['.range-card', { y: 60, scale: 0.96 }, 0.12],
      ['.adv', { y: 40 }, 0.08],
      ['.step', { y: 40 }, 0.12],
      ['.blog-card', { y: 50 }, 0.1],
      ['.cat-card', { y: 50 }, 0.1],
      ['.spec-row', { y: 40 }, 0],
      ['.v3d-teaser', { y: 50 }, 0],
      ['.section-head p, .section-lead', { y: 20 }, 0],
      ['.faq-item', { y: 16 }, 0.05],
      ['.page-directory > div', { y: 30 }, 0.1],
    ];
    GROUPS.forEach(([selector, from, stagger]) => {
      const items = pick(selector);
      if (!items.length) return;
      gsap.set(items, { opacity: 0, ...from });
      ScrollTrigger.batch(items, {
        start: 'top 90%', once: true,
        onEnter: batch => gsap.to(batch, {
          opacity: 1, y: 0, scale: 1, duration: 0.8, ease, stagger, overwrite: true,
          clearProps: 'transform,opacity',
        }),
      });
    });

    /* 3. Table rows (specs, comparisons, catalogue) cascade in */
    pick('main table').forEach(table => {
      const rows = table.querySelectorAll('tbody tr');
      gsap.from(rows, {
        opacity: 0, x: -16, duration: 0.5, ease: 'power2.out', stagger: 0.04, clearProps: 'transform,opacity',
        scrollTrigger: { trigger: table, start: 'top 88%', once: true },
      });
    });

    /* 4. Stats count up: 18+ ans, 400 kg */
    pick('.adv-stat').forEach(stat => {
      const node = [...stat.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue));
      if (!node) return;
      const [, num, rest] = node.nodeValue.match(/(\d+)(.*)/s);
      const counter = { v: 0 };
      const unit = stat.querySelector('small');
      stat.setAttribute('aria-label', `${num}${rest} ${unit ? unit.textContent : ''}`.trim());   // final value for screen readers
      node.nodeValue = '0' + rest;                                  // below the fold, so never seen at 18 first
      gsap.to(counter, {
        v: +num, duration: 1.4, ease: 'power2.out',
        onUpdate: () => { node.nodeValue = Math.round(counter.v) + rest; },
        scrollTrigger: { trigger: stat, start: 'top 90%', once: true },
      });
      cleanups.push(() => { node.nodeValue = num + rest; });
    });

    /* 5. Step numbers pop as their step arrives */
    pick('.step-num').forEach(num => {
      gsap.from(num, {
        scale: 0.4, rotation: -12, opacity: 0, duration: 0.7, ease: 'back.out(2)', clearProps: 'transform,opacity',
        scrollTrigger: { trigger: num, start: 'top 90%', once: true },
      });
    });

    /* 6. Parallax: photos drift inside their frames as the page scrolls.
          Starts at the resting position, so the first paint is unchanged. Frames that fit
          the photo exactly get a matching zoom so no edge ever shows. */
    if (wide) {
      const hero = document.querySelector('.hero');
      if (hero) {
        gsap.utils.toArray('.hero-window img, .hero-window video').forEach(media => {
          gsap.to(media, {
            yPercent: 4, scale: 1.1, ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
          });
        });
        gsap.to('.bronze-sheet', {
          yPercent: 10, rotation: 2, transformOrigin: '100% 0%', ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
        });
      }
      gsap.utils.toArray('.page-visual:not(.page-visual-product) img').forEach(img => {   // product images carry text: never crop them
        const frame = img.closest('.page-visual');
        const oversized = frame.matches('.page-visual-profile, .page-visual-window');
        if (frame.matches('.page-visual-profile')) gsap.set(img, { xPercent: -50, x: 0 });
        gsap.to(img, {
          yPercent: oversized ? 6 : 4, scale: oversized ? 1 : 1.1, ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top top', end: 'bottom top', scrub: true },
        });
      });
    }

    /* 7. Product cut-outs drift gently as you scroll past them (no tilt: these are technical drawings) */
    gsap.utils.toArray('.sys-thumb').filter(img => below(img)).forEach(img => {
      gsap.fromTo(img, { y: wide ? 24 : 12 }, {
        y: wide ? -24 : -12, ease: 'none',
        scrollTrigger: { trigger: img, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      });
    });

    /* 8. Reading progress bar on guides */
    if (document.querySelector('article.post .post-meta') && location.pathname.startsWith('/conseils/')) {
      const bar = document.createElement('div');
      bar.setAttribute('aria-hidden', 'true');
      Object.assign(bar.style, {
        position: 'fixed', top: '0', left: '0', right: '0', height: '3px', zIndex: '1000',
        background: 'var(--bronze-dark, #765333)', transformOrigin: '0 50%', transform: 'scaleX(0)',
        pointerEvents: 'none',
      });
      document.body.appendChild(bar);
      gsap.to(bar, {
        scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: 'article.post', start: 'top top', end: 'bottom bottom', scrub: 0.3 },
      });
      cleanups.push(() => bar.remove());
    }

    return () => cleanups.forEach(undo => undo());
  });

  /* Positions shift once lazy images and fonts arrive */
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
