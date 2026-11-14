(() => {
  const stage = document.getElementById('profileMotionStage');
  const model = document.getElementById('profileMotionModel');
  const section = document.getElementById('profileMotion');
  const chapters = [...document.querySelectorAll('.profile-motion-chapters span')];
  if (!stage || !model) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pointer = null;
  let manualYaw = null;
  let frame = 0;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const ranges = document.getElementById('gammes');
  const rangeGrid = ranges?.querySelector('.range-grid');
  const rangeCards = rangeGrid ? [...rangeGrid.querySelectorAll('.range-card')] : [];
  const rangeStatus = ranges?.querySelector('.range-motion-status');
  const wideScreen = matchMedia('(min-width: 851px)');
  let activeRange = -1;
  const showRange = (index, orbit = true) => {
    if (index === activeRange) return;
    const previous = activeRange;
    activeRange = index;
    rangeCards.forEach((card, cardIndex) => {
      const current = cardIndex === index;
      card.hidden = !current;
      card.inert = !current;
      card.setAttribute('aria-hidden', String(!current));
      if (current) card.getAnimations().forEach(animation => animation.cancel());
    });
    if (rangeStatus) rangeStatus.textContent = `${String(index + 1).padStart(2, '0')} / 04 · Défiler pour explorer`;
    if (!orbit || previous < 0) return;
    const direction = index > previous ? -1 : 1;
    rangeCards[index].animate([
      { opacity: 0, transform: `translateX(calc(-50% + ${direction * 210}px)) translateY(34px) rotateY(${direction * 48}deg) scale(.82)` },
      { opacity: .68, transform: `translateX(calc(-50% + ${direction * 46}px)) translateY(-12px) rotateY(${direction * 12}deg) scale(.97)`, offset: .68 },
      { opacity: 1, transform: 'translateX(-50%) translateY(0) rotateY(0) scale(1)' }
    ], { duration: 560, easing: 'cubic-bezier(.18,.7,.2,1)' });
  };
  const renderRanges = () => {
    const enabled = wideScreen.matches && !reduced.matches && rangeCards.length > 1;
    document.documentElement.classList.toggle('has-range-motion', enabled);
    if (!enabled) {
      if (activeRange !== -1) {
        rangeCards.forEach(card => { card.hidden = false; card.inert = false; card.removeAttribute('aria-hidden'); card.getAnimations().forEach(animation => animation.cancel()); });
        activeRange = -1;
      }
      return;
    }
    const bounds = ranges.getBoundingClientRect();
    const travel = Math.max(1, bounds.height - innerHeight);
    const progress = clamp(-bounds.top / travel, 0, 1);
    const index = Math.min(rangeCards.length - 1, Math.floor(progress * rangeCards.length));
    showRange(index, bounds.top < innerHeight && bounds.bottom > 0);
  };
  rangeGrid?.addEventListener('focusin', (event) => {
    if (!wideScreen.matches || reduced.matches) return;
    const index = rangeCards.indexOf(event.target.closest('.range-card'));
    if (index < 0) return;
    const top = ranges.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (ranges.offsetHeight - innerHeight) * (index + .5) / rangeCards.length, behavior: 'smooth' });
  });
  rangeGrid?.addEventListener('scroll', () => {
    if (wideScreen.matches || !rangeStatus) return;
    const step = rangeCards[0]?.offsetWidth || 1;
    const index = Math.min(rangeCards.length - 1, Math.round(rangeGrid.scrollLeft / step));
    rangeStatus.textContent = `${String(index + 1).padStart(2, '0')} / 04 · Glisser pour explorer`;
  }, { passive: true });
  const render = () => {
    frame = 0;
    renderRanges();
    if (reduced.matches) return;
    const bounds = section.getBoundingClientRect();
    const travel = Math.max(1, bounds.height - innerHeight);
    const progress = matchMedia('(max-width: 850px)').matches
      ? clamp((innerHeight - bounds.top) / (innerHeight + bounds.height), 0, 1)
      : clamp(-bounds.top / travel, 0, 1);
    const yaw = manualYaw ?? (-24 + progress * 48);
    model.style.setProperty('--yaw', `${yaw.toFixed(2)}deg`);
    model.style.setProperty('--pitch', `${(7 - progress * 11).toFixed(2)}deg`);
    model.style.setProperty('--slide', clamp((progress - .48) / .42, 0, 1).toFixed(3));
    stage.style.setProperty('--motion-progress', progress.toFixed(3));
    chapters.forEach((chapter, index) => chapter.classList.toggle('is-active', index === Math.min(2, Math.floor(progress * 3))));
  };
  const requestRender = () => { if (!frame) frame = requestAnimationFrame(render); };
  addEventListener('scroll', requestRender, { passive: true });
  addEventListener('resize', requestRender, { passive: true });
  reduced.addEventListener('change', () => { manualYaw = null; requestRender(); });
  stage.addEventListener('pointerdown', (event) => {
    if (reduced.matches) return;
    pointer = { x: event.clientX, yaw: parseFloat(getComputedStyle(model).getPropertyValue('--yaw')) || 0 };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!pointer) return;
    manualYaw = clamp(pointer.yaw + (event.clientX - pointer.x) * .15, -38, 38);
    requestRender();
  });
  const stop = () => { pointer = null; };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
  stage.addEventListener('keydown', (event) => {
    if (reduced.matches || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    manualYaw = clamp((manualYaw ?? (parseFloat(getComputedStyle(model).getPropertyValue('--yaw')) || 0)) + (event.key === 'ArrowRight' ? 8 : -8), -38, 38);
    requestRender();
  });
  requestRender();
})();
