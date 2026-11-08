(() => {
  const video = document.getElementById('homeHeroVideo');
  const toggle = document.getElementById('heroVideoToggle');
  if (!video || !toggle) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  let userPaused = false;
  let userStarted = false;
  let inView = true;
  let ready = false;
  const update = () => {
    toggle.setAttribute('aria-label', video.paused ? 'Lire la vidéo' : 'Mettre la vidéo en pause');
    toggle.dataset.paused = String(video.paused);
  };
  const play = () => {
    const source = video.querySelector('source[data-src]');
    if (source) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
      video.load();
    }
    video.muted = true;
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) video.load();
    video.play().catch(() => { video.pause(); update(); });
  };
  const sync = () => {
    const preferPoster = (motion.matches || connection?.saveData) && !userStarted;
    if (!ready || preferPoster || userPaused || !inView || document.hidden) video.pause();
    else play();
  };
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    if (video.paused) { userPaused = false; userStarted = true; ready = true; play(); }
    else { userPaused = true; video.pause(); }
  });
  video.addEventListener('play', update);
  video.addEventListener('pause', update);
  const failed = () => { video.pause(); update(); };
  video.addEventListener('error', failed);
  video.querySelector('source')?.addEventListener('error', failed);
  motion.addEventListener('change', () => { userStarted = false; sync(); });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }).observe(video);
  }
  // Render the lightweight poster and real text before fetching the background movie.
  const start = () => requestAnimationFrame(() => requestAnimationFrame(() => { ready = true; sync(); }));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  update();
})();
