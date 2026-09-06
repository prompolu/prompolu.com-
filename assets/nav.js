// Mobile nav toggle + active-link highlighting, shared across all pages.
(function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
      });
    });
  }

  // Mark the current page's nav link as active by comparing normalized
  // pathnames (so "/index.html" === "/" and "/conseils/index.html" !== "/").
  function normalize(path) {
    var p = path.replace(/index\.html$/, '').replace(/\/$/, '');
    return p === '' ? '/' : p;
  }

  var currentPath = normalize(window.location.pathname);
  if (nav) {
    nav.querySelectorAll('a[href]').forEach(function (a) {
      if (normalize(a.pathname) === currentPath) {
        a.classList.add('active');
      }
    });
  }
})();
