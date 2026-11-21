# Mise en œuvre SEO locale — 21 novembre 2026

Objectif confirmé : ventes de profilés aluminium aux professionnels, Fès et Sefrou à priorité égale. Ce fichier est interne et bloqué par le middleware. Il ne doit pas devenir une page indexable.

## Faits confirmés par le propriétaire le 21 novembre 2026

- Fès : N° 21, Rue Pékin, Av. El Wafaa 2, Rte de Sefrou, Fès 30050.
- Sefrou : **Route d’El Menzel, Sefrou 31000**. L’adresse du site est l’adresse actuelle confirmée.
- Les deux magasins : lundi–samedi, 09:00–19:00.
- Contacts actuels du site : 06 68 37 85 38 / 06 69 59 47 74 ; prompolu@live.fr.
- **0535 61 87 26 est inactif** : demander sa suppression ou son remplacement sur les annuaires.
- Fourniture de matière première et accessoires aux ateliers. Pas de fabrication/pose d’ouvrages finis.
- Sefrou porte le showroom et le point de distribution STRUGAL ; les gammes des deux magasins diffèrent. Ne pas promettre que toutes les références sont en stock dans les deux magasins.

## Changements livrés sur le site

- Accès direct au devis et au téléphone sur les quatre pages locales FR/AR, avec le magasin souhaité prérempli.
- Pages /accessoires-aluminium et /tubes-profiles-aluminium : identification, compatibilité et préparation d’une commande, sans stock ni tarif inventé.
- Liens de navigation et liens contextuels vers ces pages ; sitemap et middleware à jour.
- Référence directe à l’annuaire officiel STRUGAL ; rectification de plusieurs affirmations thermiques et de la portée d’ISO 9001 ; FAQ visible et JSON-LD cohérents.
- Retrait du chiffre d’ancienneté non documenté, sans inventer une autre date de fondation.
- /confidentialite : fonctionnement réel du formulaire, services externes, statistiques facultatives et bouton de modification du consentement.
- Suivi des liens de devis par destination, paramètres contrôlés, magasin et emplacement ; pas de nom/téléphone/e-mail/texte libre transmis par ces événements.
- Aucun clic conservé avant consentement pour être rejoué ensuite. Retrait du consentement et suppression des cookies GA accessibles au site.

## Corrections externes prêtes à appliquer

Aucune fiche externe n’a été modifiée et aucun message n’a été envoyé. Les accès aux fiches Google Business Profile, aux annuaires, à Search Console et aux rapports GA4 ne sont pas disponibles dans ce travail.

| Support | Correction à saisir / demander | URL de destination |
|---|---|---|
| STRUGAL, annuaire des distributeurs | Remplacer l’adresse ancienne de Sefrou par Route d’El Menzel, Sefrou 31000 ; conserver le mobile actuel ; ajouter le lien du showroom si le champ existe | https://prompolu.com/showroom-sefrou |
| Telecontact | Remplacer la description de graveur/décorateur sur verre par fournisseur/distributeur de profilés et accessoires aluminium ; vérifier les coordonnées ; ajouter le site | https://prompolu.com/grossiste-aluminium-fes |
| Welipro | Corriger la description commerciale de gravure sur verre ; ne pas modifier des faits d’immatriculation pour des raisons marketing | https://prompolu.com/grossiste-aluminium-fes |
| Yelo, Annuaire Gratuit, Cutter | Supprimer le téléphone inactif 0535618726 ; ajouter les contacts actuels et le site dans les champs autorisés | https://prompolu.com/grossiste-aluminium-fes |
| CityBook | Activité de fournisseur aluminium, contacts actuels et horaires 09:00–19:00 ; demander la correction de l’ancien téléphone | https://prompolu.com/grossiste-aluminium-fes |

Texte factuel à adapter pour une demande de correction :

« Nous représentons PROMPOLU ALUMINIUM. Merci de mettre à jour notre fiche : fourniture de profilés, tubes et accessoires aluminium pour les menuisiers et fabricants ; coordonnées actuelles 06 68 37 85 38 / 06 69 59 47 74, prompolu@live.fr. L’ancien 0535 61 87 26 est inactif. Nos horaires sont du lundi au samedi, de 9h à 19h. [Ajouter ici la seule adresse et l’URL du magasin concerné.] Merci de nous indiquer si un justificatif ou un accès de gestion est nécessaire. »

## Google Business Profile — deux fiches existantes, pas de doublons

Fès : CID 10734799803496495182 ; Sefrou : CID 12820306876096417573. Vérifier directement les fiches, leurs propriétaires, l’enseigne réelle, l’adresse, le repère et les doublons avant toute création.

- Nom : celui réellement affiché sur l’enseigne, sans ajout artificiel de mots-clés.
- Catégorie : la plus précise et exacte disponible pour la fourniture/distribution aluminium. Ne pas choisir installateur de fenêtres si l’activité ne le fait pas.
- Site de Fès : https://prompolu.com/grossiste-aluminium-fes?utm_source=google&utm_medium=organic&utm_campaign=gbp_fes
- Site de Sefrou : https://prompolu.com/showroom-sefrou?utm_source=google&utm_medium=organic&utm_campaign=gbp_sefrou
- Ajouter les horaires confirmés et les exceptions réelles ; coordonnées actuelles ; produits effectivement proposés.
- Photos réelles manquantes : enseigne/façade, entrée, comptoir, stock, présentoir STRUGAL de Sefrou. Ne pas présenter un visuel généré ou d’ambiance comme une photo du magasin.
- Avis : inviter tous les vrais clients éligibles après livraison/retrait, sans incitation ni filtrage de satisfaction ; utiliser le vrai lien d’avis de chaque fiche, à récupérer dans GBP.

Description proposée, à adapter par magasin :

« PROMPOLU ALUMINIUM fournit aux menuisiers et fabricants des profilés, systèmes et accessoires aluminium. Magasin à Fès et showroom/point de distribution STRUGAL à Sefrou. Fourniture de matière première, devis selon référence, finition et quantité ; retrait à confirmer avec le magasin ou livraison au Maroc. Nous ne fabriquons et ne posons pas les ouvrages finis. »

## Mesure : clic ≠ message reçu ≠ commande

Événements consentis : clic_demander_devis, clic_contact, clic_telephone, clic_whatsapp, clic_email, clic_itineraire, devis_whatsapp et devis_email. Les deux derniers indiquent l’ouverture d’un brouillon externe, pas son envoi ni sa réception. Les nouveaux paramètres sont product_reference (liste de références reconnues, sinon autre), magasin (fes/sefrou/a_preciser) et emplacement. Déclarer les dimensions nécessaires dans GA4 et vérifier DebugView avec consentement. L’ingestion des événements dans le compte n’a pas été contrôlée.

Tenir un journal commercial séparé : date, ville, famille de produit, source connue, demande reçue, professionnel qualifié, devis établi, commande gagnée. Ne pas envoyer le contenu personnel de ce journal à Analytics.

Search Console : vérifier les pages locales, les deux nouveaux hubs et la canonique choisie par Google ; soumettre le sitemap seulement après la publication effective. Les URL 200 ne prouvent pas l’indexation. Comparer les données de requêtes/pages au Maroc par appareil et sur des périodes comparables.

Suivre séparément Maps et organique pour les mêmes familles dans chaque ville : grossiste aluminium, fournisseur aluminium, profilés aluminium, distributeur STRUGAL, accessoires aluminium. Conserver coordonnées de recherche, appareil, langue et date ; mesurer la couverture rang 1/top 3 sur une grille stable, pas une recherche personnalisée unique. Aucun rang, volume ou délai de première place n’est garanti.

## Ce qui nécessite des données réelles

- Les photos de chaque magasin et des exemples de commandes/formations réels.
- Les références de stock, leurs dimensions/compatibilités et leur disponibilité maintenue par un responsable.
- Les prix/exemples de devis approuvés si une publication est souhaitée.
- Un responsable technique réel acceptant une attribution nominative.
- Les accès GBP/GSC/GA4 et une mesure locale répétable ; données CrUX/PSI avec quota disponible pour les CWV.

Ne pas inventer ces éléments pour compléter une page. Le prochain contrôle doit tester l’indexation, les fiches corrigées, les requêtes commerciales des deux villes et les demandes professionnelles réellement reçues.
