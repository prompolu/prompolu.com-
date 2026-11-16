/* Desktop navigation disclosure and current-page labels for the approved design. */
(() => {
  // Several menus (Nos gammes, Nos technologies, Nos guides): one open at a time.
  const disclosures = document.querySelectorAll('.nav-disclosure');
  const closeAll = except => disclosures.forEach(d => { if (d !== except) d.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAll();
  });
  document.addEventListener('click', event => closeAll(event.target.closest('.nav-disclosure')));
  document.querySelectorAll('.nav-panel a').forEach(a => a.addEventListener('click', () => closeAll()));
  const normalize = path => path.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '') || '/';
  document.querySelectorAll('.desktop-nav a,.mobile-nav a,.page-directory a').forEach(a => {
    if (a.origin === window.location.origin && normalize(a.pathname) === normalize(window.location.pathname)) {
      a.setAttribute('aria-current', 'page');
    }
  });
  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
