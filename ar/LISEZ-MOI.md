# Configurateur pergola en réalité augmentée — PROMPOLU

Outil en marque blanche. Chaque menuisier partenaire reçoit **son propre lien**,
à son nom, qu'il envoie à ses clients. Le client visualise la pergola **à taille
réelle chez lui**, la configure, et renvoie sa demande de devis **au menuisier**
— pas à PROMPOLU. C'est ce qui en fait un argument commercial : le menuisier ne
peut avoir cet outil qu'en achetant ses profilés chez vous.

---

## 1. Mise en ligne et accès réservé

Le site est publié par **Cloudflare Pages** depuis le dépôt privé
`prompolu/prompolu.com-` : chaque mise à jour du dépôt republie le site en une à
deux minutes.

L'espace 3D (`/ar/`, et tous les fichiers `.glb` / `.usdz`) n'est servi qu'avec
un **lien donné par PROMPOLU**. La vérification est faite par Cloudflare, avant
d'envoyer la page ou le moindre modèle 3D (`functions/_middleware.js`) : sans
lien valable, le visiteur voit « Visualisation 3D — accès réservé » et un bouton
WhatsApp vers PROMPOLU. Le reste du site reste public.

Projet Cloudflare Pages : `prompolu-com` (production : branche `main`). Chaque
autre branche est publiée à part pour les essais, par exemple la branche
`acces-3d` sur https://acces-3d.prompolu-com.pages.dev — pour y tester un lien
du générateur, remplacer `prompolu.com` par cette adresse dans le lien.

## 2. Donner un accès

Dans le **générateur de codes** (https://cutter-hard.pages.dev/generateur.html),
mode **Espace 3D** : nom du menuisier (ou du prospect), son numéro WhatsApp
(format international, ex. 212661234567), couleur des boutons (facultatif),
logo (facultatif), durée — essai de quelques jours, annuel jusqu'à une date,
ou permanent. Le générateur donne le lien complet :

```
https://prompolu.com/ar/?p=<jeton>
```

- Le nom, le numéro et la date de fin sont **signés dans le lien** : les
  modifier le rend invalide. La demande de devis part sur **ce** numéro.
- À la date de fin, le lien affiche « Votre accès a expiré » et propose de
  contacter PROMPOLU.
- `logo` : déposez l'image dans `ar/logos/` (ex. `bennani.png`) et indiquez ce
  nom de fichier dans le générateur.
- Le menuisier envoie son lien à ses clients ; le navigateur de chacun le
  garde (cookie), et le lien suit dans le QR code et entre les produits.
- Retirer un accès avant sa date de fin : ajouter une liste de liens bloqués
  dans `functions/_middleware.js` (demander au développeur).

## 3. Ce que le client peut régler

| Réglage | Options |
|---|---|
| Finition | RAL 7016, RAL 9016, RAL 9006, bronze anodisé, RAL 9005 |
| Largeur | 3,00 / 3,60 / 4,20 m |
| Avancée | 3,00 / 4,20 / 6,00 m |
| Lames | fermées / inclinées / ouvertes |
| LED | activées, avec ambiance du soir |

Chaque réglage est **inscrit dans l'adresse de la page**
(`?f=ral7016-anthracite&w=420&d=600&s=open&led=1`). Un lien envoyé sur WhatsApp,
ou le QR code affiché à l'écran, rouvre donc **exactement** la même pergola sur
le téléphone du client.

---

## 4. Le QR code, et pourquoi il compte

La réalité augmentée n'existe pas sur un ordinateur : il n'a pas de caméra qui
comprend l'espace. En magasin, le menuisier montre donc la pergola sur son écran,
le client scanne le QR affiché, et la configuration exacte s'ouvre sur **son**
téléphone, prête à être posée sur sa terrasse.

---

## 5. Comment c'est construit

- Les modèles sont **paramétriques** : générés par script à partir des cotes de
  profilés, section 2D extrudée — comme une vraie filière. Ajouter une taille ou
  une teinte = une ligne, pas une modélisation.
- **La couleur et les LED sont appliquées en direct** sur le modèle chargé
  (API scene-graph de `<model-viewer>`). D'où **27 fichiers `.glb` seulement**
  au lieu de 135.
- Les `.usdz` (iPhone) ne peuvent pas être recolorés à la volée — Apple Quick
  Look charge un fichier figé. D'où un `.usdz` par taille **et** par teinte,
  aux lames inclinées.
- **Rendu à l'écran** (`ar/rendu.js`, commun aux quatre pages) : éclairage
  studio `ar/studio.hdr` (74 Ko, refait par `python3 ar/studio-hdr.py`),
  couleurs « PBR Neutral » fidèles aux RAL, ombre portée nette au sol, vernis
  satiné du thermolaquage, LED lumineuses. Les laques RAL sont rendues comme
  une peinture (non métallique) ; RAL 9006 et l'anodisé restent métalliques.
  Cela ne change que l'affichage dans le navigateur, pas les fichiers de la
  vue réelle.
- **Détails des profils** (coulissant, battant, garde-corps, dessinés dans le
  navigateur) : angles coupés d'onglet à 45°, gorge d'ombre sur le dormant,
  parclose biseautée, joints EPDM noirs autour de chaque vitrage, joints de
  serrage et embouts du profil en U Glass Line, poignées à béquille ou de
  tirage. Formes reconstituées pour l'aspect, pas les DXF STRUGAL.
- Poids : `.glb` ≈ 150 Ko, chargé en environ une seconde en 4G. La plupart des
  configurateurs 3D pèsent 5 à 20 Mo et le visiteur part avant la fin.

## 6. Limites à connaître

- **Visuellement fidèle, pas bon pour la fabrication.** Les sections de profilés
  sont reconstituées d'après les spécifications publiées Gaviota Climatika
  (montants 160×160, lames à joint EPDM, gouttière intégrée), pas d'après les
  DXF Gaviota. Suffisant pour vendre. Pas pour découper.
- **Les teintes sont indicatives.** Le rendu écran ne remplace pas un nuancier.
- **Android** ouvre la vue réelle dans le navigateur (WebXR) : la teinte choisie
  est conservée. **iPhone** passe par Quick Look : la position des lames y est
  celle par défaut (inclinées).
- Les cotes affichées sont nominales. Le relevé sur site reste indispensable.
