(() => {
  const header = document.getElementById('header');
  const video = document.getElementById('hero-film');
  const toggle = document.querySelector('.film-control');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const menu = document.getElementById('menu');
  const opener = document.querySelector('.menu-button');
  let userPaused = reduceMotion.matches;
  let hiddenPaused = false;

  function syncHeader() { header.classList.toggle('scrolled', scrollY > 60); }
  addEventListener('scroll', syncHeader, { passive: true });
  syncHeader();

  function syncControl() {
    toggle.dataset.paused = String(video.paused);
    toggle.querySelector('.control-label').textContent = video.paused ? 'Lecture' : 'Pause';
    toggle.setAttribute('aria-label', video.paused ? 'Lire la vidéo' : 'Mettre la vidéo en pause');
  }
  async function play() {
    try { await video.play(); } catch (_) { syncControl(); }
  }
  video.muted = true;
  if (reduceMotion.matches) { video.autoplay = false; video.pause(); }
  else { play(); }
  video.addEventListener('play', syncControl);
  video.addEventListener('pause', syncControl);
  video.addEventListener('error', () => { toggle.hidden = true; });
  syncControl();
  toggle.addEventListener('click', () => {
    userPaused = !video.paused;
    if (video.paused) play(); else video.pause();
  });
  reduceMotion.addEventListener('change', e => {
    userPaused = e.matches;
    if (e.matches) video.pause(); else play();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenPaused = !video.paused;
      video.pause();
    } else if (hiddenPaused && !userPaused) {
      play();
    }
  });
  const visibility = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) video.pause();
    else if (!userPaused && !document.hidden) play();
  }, { threshold: .05 });
  visibility.observe(document.querySelector('.hero'));

  opener.addEventListener('click', () => {
    menu.showModal();
    opener.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  });
  function closeMenu() { menu.close(); }
  document.querySelector('.menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('close', () => {
    document.body.classList.remove('menu-open');
    opener.setAttribute('aria-expanded', 'false');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    closeMenu();
    if (link.hash && link.origin === location.origin) {
      const target = document.getElementById(link.hash.slice(1));
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
    }
  }));
  document.getElementById('year').textContent = new Date().getFullYear();
})();
