// Mesure d'audience — Google Analytics 4 avec gestion du consentement.
//
// La bibliothèque Google (environ 70 Ko) n'est PAS téléchargée au chargement
// de la page : elle ne l'est qu'après acceptation du visiteur. Celui qui refuse,
// ou qui ne répond pas, ne paie jamais ce poids.
//
// Pour changer d'identifiant, une seule ligne à modifier : ID_MESURE ci-dessous.
(function () {
  var ID_MESURE = 'G-EF8H28NFLQ';   // ID de mesure Google Analytics 4 de prompolu.com
  var CLE = 'prompolu_consentement';
  var chargee = false;

  // --- Consent Mode : rien n'est stocké tant que le visiteur n'a pas accepté ---
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });

  // --- Chargement différé : uniquement après acceptation ---
  function charger() {
    if (chargee) return;
    chargee = true;

    gtag('js', new Date());
    gtag('config', ID_MESURE, { anonymize_ip: true });

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID_MESURE;
    document.head.appendChild(s);
  }

  function lire() {
    try { return localStorage.getItem(CLE); } catch (e) { return null; }
  }
  function ecrire(v) {
    try { localStorage.setItem(CLE, v); } catch (e) {}
  }

  function accorder() {
    gtag('consent', 'update', { analytics_storage: 'granted' });
    charger();
  }

  // --- Bandeau de consentement ---
  function bandeau() {
    var b = document.createElement('div');
    b.className = 'consent-bar';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Consentement aux statistiques de visite');
    b.innerHTML =
      '<p>Nous utilisons des statistiques de visite pour comprendre comment notre site est consulté. ' +
      'Aucune donnée n\'est utilisée à des fins publicitaires.</p>' +
      '<div class="consent-actions">' +
        '<button type="button" class="consent-no">Refuser</button>' +
        '<button type="button" class="consent-yes">Accepter</button>' +
      '</div>';
    document.body.appendChild(b);

    b.querySelector('.consent-yes').addEventListener('click', function () {
      ecrire('oui'); accorder(); b.remove();
    });
    b.querySelector('.consent-no').addEventListener('click', function () {
      ecrire('non'); b.remove();
    });
  }

  var choix = lire();
  if (choix === 'oui') {
    accorder();
  } else if (choix !== 'non') {
    if (document.body) bandeau();
    else document.addEventListener('DOMContentLoaded', bandeau);
  }

  // --- Suivi des prises de contact (les vraies conversions) ---
  // Les événements sont poussés dans dataLayer même si la bibliothèque n'est pas
  // chargée : sans consentement, ils restent simplement sans effet.
  function suivi() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a || !a.href) return;
      var h = a.getAttribute('href') || '';
      var nom = null;

      if (h.indexOf('tel:') === 0) nom = 'clic_telephone';
      else if (h.indexOf('wa.me') > -1) nom = 'clic_whatsapp';
      else if (h.indexOf('mailto:') === 0) nom = 'clic_email';
      else if (a.classList.contains('cta')) nom = 'clic_demander_devis';

      if (nom) {
        gtag('event', nom, {
          page: location.pathname,
          libelle: (a.textContent || '').trim().slice(0, 60)
        });
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suivi);
  else suivi();
})();
