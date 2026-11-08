(() => {
  const stage = document.getElementById('profileMotionStage');
  const model = document.getElementById('profileMotionModel');
  if (!stage || !model) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pointer = null;
  let manualYaw = null;
  let frame = 0;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const render = () => {
    frame = 0;
    if (reduced.matches) return;
    const bounds = stage.getBoundingClientRect();
    const progress = clamp((innerHeight - bounds.top) / (innerHeight + bounds.height), 0, 1);
    const yaw = manualYaw ?? (-26 + progress * 52);
    model.style.setProperty('--yaw', `${yaw.toFixed(2)}deg`);
    model.style.setProperty('--pitch', `${(7 - progress * 11).toFixed(2)}deg`);
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
