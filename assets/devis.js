// Formulaire de demande de devis — sans serveur.
// Le formulaire compose un message et l'ouvre soit dans WhatsApp,
// soit dans le logiciel de messagerie du visiteur.
// Pour changer le numéro WhatsApp ou l'adresse e-mail : les deux constantes ci-dessous.
(function () {
  var WHATSAPP = '212668378538';          // format international, sans + ni espaces
  var EMAIL    = 'PROMPOLU@LIVE.FR';

  var form = document.getElementById('devisForm');
  if (!form) return;

  var sent = document.getElementById('qfSent');

  function champ(nom) {
    return form.querySelector('[name="' + nom + '"]');
  }

  function valeur(nom) {
    var el = champ(nom);
    return el ? el.value.trim() : '';
  }

  function erreur(el, actif) {
    var bloc = el.closest('.qf-field');
    if (!bloc) return;
    bloc.classList.toggle('qf-error', actif);
  }

  // Vérifie les deux seuls champs indispensables pour pouvoir répondre.
  function valide() {
    var ok = true;
    ['nom', 'telephone'].forEach(function (n) {
      var el = champ(n);
      if (!el) return;
      var vide = el.value.trim() === '';
      erreur(el, vide);
      if (vide && ok) { el.focus(); ok = false; }
      else if (vide) { ok = false; }
    });
    return ok;
  }

  // Construit un message lisible, en n'incluant que les champs remplis.
  function message() {
    var l = [];
    l.push('Demande de devis — PROMPOLU ALUMINIUM');
    l.push('');
    l.push('Nom / entreprise : ' + valeur('nom'));
    if (valeur('ville'))     l.push('Ville : ' + valeur('ville'));
    l.push('Téléphone : ' + valeur('telephone'));
    if (valeur('email'))     l.push('Email : ' + valeur('email'));
    l.push('');
    if (valeur('systeme'))   l.push('Système / référence : ' + valeur('systeme'));
    if (valeur('quantite'))  l.push('Quantité : ' + valeur('quantite'));
    if (valeur('finition'))  l.push('Finition : ' + valeur('finition'));
    if (valeur('livraison')) l.push('Livraison : ' + valeur('livraison'));
    if (valeur('echeance'))  l.push('Échéance de chantier : ' + valeur('echeance'));
    if (valeur('detail_compte')) l.push('Compte : ' + valeur('detail_compte'));
    if (valeur('detail')) {
      l.push('');
      l.push('Détail :');
      l.push(valeur('detail'));
    }
    return l.join('\n');
  }

  function suivre(nom) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', nom, { page: location.pathname });
    }
  }

  function confirmer(texte) {
    if (!sent) return;
    sent.textContent = texte;
    sent.classList.add('on');
  }

  var btnWa = document.getElementById('qfWhatsapp');
  if (btnWa) {
    btnWa.addEventListener('click', function () {
      if (!valide()) return;
      suivre('devis_whatsapp');
      window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(message()),
                  '_blank', 'noopener');
      confirmer('WhatsApp vient de s’ouvrir avec votre demande. Il ne reste qu’à appuyer sur envoyer.');
    });
  }

  var btnMail = document.getElementById('qfEmail');
  if (btnMail) {
    btnMail.addEventListener('click', function () {
      if (!valide()) return;
      suivre('devis_email');
      var sujet = 'Demande de devis — ' + (valeur('nom') || 'profilés aluminium');
      window.location.href = 'mailto:' + EMAIL +
        '?subject=' + encodeURIComponent(sujet) +
        '&body=' + encodeURIComponent(message());
      confirmer('Votre logiciel de messagerie vient de s’ouvrir avec votre demande. Il ne reste qu’à l’envoyer.');
    });
  }

  // Efface le liseré rouge dès que le visiteur corrige un champ.
  form.addEventListener('input', function (e) {
    if (e.target && e.target.name) erreur(e.target, false);
  });

  // Empêche la soumission classique : il n'y a pas de serveur derrière.
  form.addEventListener('submit', function (e) { e.preventDefault(); });
})();
