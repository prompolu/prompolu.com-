# Configurateur pergola en réalité augmentée — PROMPOLU

Outil en marque blanche. Chaque menuisier partenaire reçoit **son propre lien**,
à son nom, qu'il envoie à ses clients. Le client visualise la pergola **à taille
réelle chez lui**, la configure, et renvoie sa demande de devis **au menuisier**
— pas à PROMPOLU. C'est ce qui en fait un argument commercial : le menuisier ne
peut avoir cet outil qu'en achetant ses profilés chez vous.

---

## 1. Mise en ligne

Le site est publié par **GitHub Pages** depuis le dépôt `prompolu/prompolu.com-`
(le fichier `CNAME` à la racine pointe vers prompolu.com). Il n'y a donc **rien
à envoyer par FTP** : dès que le dépôt est mis à jour, GitHub republie le site
tout seul, en une à deux minutes.

Ce dossier `ar/` doit simplement se trouver à la racine du dépôt. Le
configurateur est alors accessible sur :

```
https://prompolu.com/ar/?p=demo
```

> **Note pour plus tard :** une version précédente de ces instructions parlait
> d'un fichier `.htaccess` et de types MIME à déclarer. Cela ne vaut que pour un
> hébergement Apache classique. **GitHub Pages ignore `.htaccess`** — le fichier
> a donc été retiré. GitHub Pages sert correctement les fichiers `.glb` et
> `.usdz` (le site officiel de `model-viewer` est lui-même hébergé ainsi), il
> n'y a rien à configurer.

Un fichier `.nojekyll` a été ajouté à la racine du dépôt : il demande à GitHub
de publier les fichiers tels quels, sans passer par Jekyll. C'est plus rapide et
cela évite tout risque qu'un fichier soit ignoré au passage.

Vérifiez enfin, dans **Settings → Pages** du dépôt, que **« Enforce HTTPS »**
est bien coché : la caméra et la réalité augmentée sont bloquées par les
navigateurs en `http://`.

---

## 2. Ajouter un menuisier partenaire

Ouvrez `partners.json` et ajoutez un bloc :

```json
"menuiserie-bennani": {
  "name": "Menuiserie Bennani — Sefrou",
  "logo": "logos/bennani.png",
  "phone": "212661234567",
  "email": "contact@bennani.ma",
  "accent": "#1f6f8b"
}
```

Son lien devient :

```
https://prompolu.com/ar/?p=menuiserie-bennani
```

- `phone` : format international **sans `+` ni espaces**. La demande de devis
  part directement sur **son** WhatsApp, pré-remplie avec la configuration.
- `logo` : facultatif. Déposez l'image dans un dossier `ar/logos/`.
- `accent` : facultatif. Colore les boutons à ses couleurs.
- Sans `?p=`, la page s'affiche en version neutre PROMPOLU.

---

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
