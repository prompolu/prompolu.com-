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
  const wideScreen = matchMedia('(min-width: 851px)');
  const renderRanges = () => {
    const enabled = wideScreen.matches && !reduced.matches && rangeCards.length > 1;
    document.documentElement.classList.toggle('has-range-motion', enabled);
    if (!enabled) {
      rangeGrid?.style.removeProperty('--range-x');
      return;
    }
    const bounds = ranges.getBoundingClientRect();
    const travel = Math.max(1, bounds.height - innerHeight);
    const progress = clamp(-bounds.top / travel, 0, 1);
    const center = (ranges.clientWidth - rangeCards[0].offsetWidth) / 2 - rangeGrid.offsetLeft;
    const start = center - rangeCards[0].offsetLeft;
    const end = center - rangeCards[rangeCards.length - 1].offsetLeft;
    rangeGrid.style.setProperty('--range-x', `${(start + (end - start) * progress).toFixed(1)}px`);
  };
  rangeGrid?.addEventListener('focusin', (event) => {
    if (!wideScreen.matches || reduced.matches) return;
    const card = event.target.closest('.range-card');
    const index = rangeCards.indexOf(card);
    if (index < 0) return;
    const top = ranges.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (ranges.offsetHeight - innerHeight) * index / (rangeCards.length - 1), behavior: 'smooth' });
  });
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
