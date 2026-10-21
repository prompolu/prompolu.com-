/* Desktop navigation disclosure and current-page labels for the approved design. */
(() => {
  const disclosure = document.querySelector('.nav-disclosure');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && disclosure) disclosure.open = false;
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav-disclosure') && disclosure) disclosure.open = false;
  });
  document.querySelectorAll('.nav-panel a').forEach(a => a.addEventListener('click', () => {
    if (disclosure) disclosure.open = false;
  }));
  const normalize = path => path.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '') || '/';
  document.querySelectorAll('.desktop-nav a,.mobile-nav a,.page-directory a').forEach(a => {
    if (a.origin === window.location.origin && normalize(a.pathname) === normalize(window.location.pathname)) {
      a.setAttribute('aria-current', 'page');
    }
  });
  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
