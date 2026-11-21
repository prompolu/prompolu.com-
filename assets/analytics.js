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
  var accord = false;

  // --- Consent Mode : rien n'est stocké tant que le visiteur n'a pas accepté ---
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
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
    if (!['prompolu.com', 'www.prompolu.com'].includes(location.hostname)) return;
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
    accord = true;
    window['ga-disable-' + ID_MESURE] = false;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    charger();
  }

  // --- Bandeau de consentement ---
  function bandeau() {
    if (document.querySelector('.consent-bar')) return;
    var b = document.createElement('div');
    b.className = 'consent-bar';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Consentement aux statistiques de visite');
    b.innerHTML =
      '<p>Nous utilisons des statistiques de visite pour comprendre comment notre site est consulté. ' +
      'Aucune donnée n\'est utilisée à des fins publicitaires. <a href="/confidentialite">Confidentialité et choix</a>.</p>' +
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

  function reinitialiser() {
    accord = false;
    window['ga-disable-' + ID_MESURE] = true;
    gtag('consent', 'update', { analytics_storage: 'denied' });
    try { localStorage.removeItem(CLE); } catch (e) {}
    // Retirer les cookies GA déjà déposés, sans toucher aux autres cookies.
    (document.cookie || '').split(';').forEach(function (part) {
      var nom = part.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(nom)) return;
      ['', '; domain=' + location.hostname, '; domain=.prompolu.com'].forEach(function (domaine) {
        document.cookie = nom + '=; Max-Age=0; path=/' + domaine + '; SameSite=Lax';
      });
    });
    bandeau();
  }

  var choix = lire();
  if (choix === 'oui') {
    accorder();
  } else if (choix !== 'non') {
    if (document.body) bandeau();
    else document.addEventListener('DOMContentLoaded', bandeau);
  }

  // Actions de contact, pas messages reçus ni commandes. Ne pas conserver les
  // clics avant consentement pour les rejouer lors d'une acceptation ultérieure.
  var references = ['A200 4FH2', 'A400K', 'S40', 'S45C', 'S46', 'S47', 'S52', 'S53RP+', 'S70P', 'S70R', 'S86RP', 'S88R', 'S88RP', 'S88RP Prime', 'S88RP élevable', 'S90P', 'S90R', 'S90RP', 'S110P', 'S125RP', 'S140RP', 'Bardage aluminium', 'Garde-corps', 'Habillage extérieur', 'Pergola', 'Pergolas', 'Volets roulants', 'Accessoires aluminium', 'Tubes aluminium'];
  function referenceSure(valeur) {
    var ref = (valeur || '').replace(/ \(catalogue de fabrication\)$/, '');
    return references.indexOf(ref) > -1 ? ref : 'autre';
  }
  function magasinSure(valeur) {
    return valeur === 'fes' || valeur === 'sefrou' ? valeur : 'a_preciser';
  }
  function suivre(nom, contexte) {
    if (!accord) return;
    contexte = contexte || {};
    gtag('event', nom, {
      page: location.pathname,
      product_reference: referenceSure(contexte.reference),
      magasin: magasinSure(contexte.magasin),
      emplacement: contexte.emplacement || 'contenu'
    });
  }
  window.prompoluTrack = suivre;
  function suivi() {
    document.addEventListener('click', function (e) {
      var choix = e.target.closest && e.target.closest('[data-consent-reset]');
      if (choix) { reinitialiser(); return; }
      var a = e.target.closest && e.target.closest('a');
      if (!a || !a.href) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (e) { return; }
      var nom = null;
      if (url.protocol === 'tel:') nom = 'clic_telephone';
      else if (url.hostname === 'wa.me') nom = 'clic_whatsapp';
      else if (url.protocol === 'mailto:') nom = 'clic_email';
      else if (url.origin === location.origin && url.pathname.replace(/\.html$/, '') === '/contact') {
        nom = url.hash === '#formulaire' || url.searchParams.has('systeme') ? 'clic_demander_devis' : 'clic_contact';
      } else if (url.hostname === 'maps.google.com' || url.hostname === 'www.google.com' && url.pathname.indexOf('/maps') === 0) nom = 'clic_itineraire';

      if (nom) {
        var branche = location.pathname.indexOf('sefrou') > -1 ? 'sefrou' : location.pathname.indexOf('fes') > -1 ? 'fes' : '';
        suivre(nom, {
          reference: url.searchParams.get('systeme'),
          magasin: url.searchParams.get('magasin') || a.getAttribute('data-magasin') || branche,
          emplacement: a.closest('header') ? 'entete' : a.closest('.mobile-nav') ? 'menu' : a.closest('.mobile-cta-bar') ? 'barre_mobile' : a.closest('.page-hero') ? 'accroche' : 'contenu'
        });
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suivi);
  else suivi();
})();
