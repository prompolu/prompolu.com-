/* =====================================================================
 *  rendu.js — qualite d'image commune aux quatre configurateurs.
 *
 *  Charge apres <model-viewer> (defer) ; ne touche ni aux cotes, ni aux
 *  teintes, ni a la realite augmentee : seulement a la lumiere et aux
 *  matieres, une fois le modele charge.
 *    - eclairage « studio » (studio.hdr, 74 Ko) au lieu de l'eclairage
 *      neutre uniforme : de vrais reflets sur l'aluminium et le verre ;
 *    - rendu des couleurs « Khronos PBR Neutral », fait pour les
 *      produits : les teintes RAL ne sont ni delavees ni saturees ;
 *    - ombre au sol nette (lames de la pergola, pieds, cadres) ;
 *    - aluminium laque : le voile satine du thermolaquage (vernis leger) ;
 *    - LED : vraiment lumineuses dans la vue du soir.
 * ===================================================================== */
(function () {
'use strict';

const mv = document.querySelector('model-viewer');
if (!mv) return;

/* l'URL doit finir par .hdr : c'est ce qui fait choisir a <model-viewer>
   son lecteur HDR. Le cookie d'acces suffit, pas besoin de ?p=.       */
mv.setAttribute('environment-image', new URL('studio.hdr', document.currentScript.src).href);
mv.setAttribute('tone-mapping', 'neutral');
/* 0 = ombre portee nette, comme au soleil : on voit le jeu des lames
   de la pergola au sol. Au-dessus de 0, l'ombre douce disparait sous
   un produit haut de 2,60 m.                                          */
mv.setAttribute('shadow-softness', '0');

/* une version de <model-viewer> sans l'une de ces fonctions garde
   simplement le rendu d'origine pour ce reglage                      */
const call = (m, fn, v) => { if (typeof m[fn] === 'function') m[fn](v); };

/* a rappeler apres chaque changement de teinte fait sans recharger le
   modele (pergola) : le vernis depend de la finition                 */
function tune() {
  const mats = mv.model && mv.model.materials;
  if (!mats) return;
  for (const m of mats) {
    if (m.name === 'alu') {
      /* thermolaquage : vernis satine par-dessus la teinte. A peine
         marque sur les finitions metallisees (RAL 9006, anodise).    */
      const metal = m.pbrMetallicRoughness.metallicFactor >= 0.5;
      call(m, 'setClearcoatFactor', metal ? 0.15 : 0.5);
      call(m, 'setClearcoatRoughnessFactor', 0.25);
    } else if (m.name === 'led') {
      /* sans effet LED eteintes (emissif nul), eclatantes allumees */
      call(m, 'setEmissiveStrength', 6);
    }
  }
}
mv.addEventListener('load', tune);
window.Rendu = { tune };
})();
