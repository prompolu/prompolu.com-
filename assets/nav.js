// Mobile nav toggle + active-link highlighting, shared across all pages.
(function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');

  if (toggle && nav) {
    function setOpen(open) {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    }

    toggle.setAttribute('aria-controls', nav.id);
    setOpen(false);
    toggle.addEventListener('click', function () {
      var open = !nav.classList.contains('open');
      setOpen(open);
      var firstLink = nav.querySelector('a[href]');
      if (open && firstLink) firstLink.focus();
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        setOpen(false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
  }

  // Mark the current page's nav link as active by comparing normalized
  // pathnames (so "/index.html" === "/" and "/conseils/index.html" !== "/").
  function normalize(path) {
    var p = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '');
    return p === '' ? '/' : p;
  }

  var currentPath = normalize(window.location.pathname);
  if (nav) {
    nav.querySelectorAll('a[href]').forEach(function (a) {
      var linkPath = normalize(a.pathname);
      var exact = linkPath === currentPath;
      var section = linkPath !== '/' && currentPath.indexOf(linkPath + '/') === 0;
      if (exact || section) {
        a.classList.add('active');
        a.setAttribute('aria-current', exact ? 'page' : 'location');
      }
    });
  }
})();

/* Plans Google en chargement differé : l'iframe n'est créé qu'au clic. */
(function () {
  document.querySelectorAll('.map-load').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = b.getAttribute('data-src');
      f.title = b.getAttribute('data-title') || 'Plan Google Maps';
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      f.setAttribute('allowfullscreen', '');
      b.replaceWith(f);
    });
  });
})();
