// Facts from /coulissants and its product pages. Display sizes are illustrative.
export const PRODUCTS = [
 {id:'S70P',slug:'s70p',name:'S70P',type:'Le quotidien, simplement.',family:'Coulissant standard',glass:21,weight:'80 kg',thermal:false,feature:'2 à 6 vantaux',description:'Un système résidentiel à assemblage périmétrique. Deux ou trois rails selon la configuration.',finish:'ral9005-givre',width:3.2,height:2.4},
 {id:'S70R',slug:'s70r',name:'S70R',type:'La lumière prend sa place.',family:'Coulissant léger',glass:19,weight:null,thermal:false,feature:'Dormant de 45 mm',description:'Des lignes fines, des ouvrants à coupe droite et des configurations de deux à quatre vantaux.',finish:'ral9005-givre',width:3.2,height:2.4},
 {id:'S86RP',slug:'s86rp',name:'S86RP',type:'Moins de profil. Plus de vue.',family:'Coulissant minimaliste',glass:26,weight:'140 kg',thermal:true,feature:'Nœud central de 42 mm',description:'Un dessin minimaliste associé à la rupture de pont thermique. Jusqu’à 2000 × 2500 mm par ouvrant.',finish:'ral9005-givre',width:3.6,height:2.45},
 {id:'S88R',slug:'s88r',name:'S88R',type:'L’espace, en grand.',family:'Coulissant & levage',glass:32,weight:'200 / 300 kg',thermal:false,feature:'Coulissant ou à levage',description:'200 kg par ouvrant en coulissant, 300 kg à levage, selon configuration.',finish:'ral9005-givre',width:4,height:2.55},
 {id:'S88RP',slug:'s88rp',name:'S88RP',type:'Le confort ouvre l’horizon.',family:'Coulissant à rupture thermique',glass:32,weight:'200 / 300 kg',thermal:true,feature:'Polyamide de 34 mm',description:'Coulissant classique ou à levage, avec options galandage et monorail. Uw dès 1,3 W/m²K selon vitrage et configuration.',finish:'ral9005-givre',width:4,height:2.55},
 {id:'S90P',slug:'s90p',name:'S90P',type:'Une ouverture à votre mesure.',family:'Coulissant économique',glass:26,weight:'160 kg',thermal:false,feature:'Dormant de 90 mm',description:'Deux ou trois rails, fermeture à mortaiser ou multipoint. Jusqu’à 2200 × 2600 mm par ouvrant.',finish:'ral9005-givre',width:3.6,height:2.45},
 {id:'S90R',slug:'s90r',name:'S90R',type:'La force d’une ligne nette.',family:'Cadre tubulaire',glass:23,weight:'140 kg',thermal:false,feature:'Ouvrants à coupe droite',description:'Un dormant tubulaire de 90 mm et des renforts possibles aux ouvrants centraux. Jusqu’à 2000 × 2500 mm par ouvrant.',finish:'ral9005-givre',width:3.6,height:2.45},
 {id:'S90RP',slug:'s90rp',name:'S90RP',type:'L’isolation, dans le profil.',family:'Coulissant périmétrique',glass:27,weight:'160 kg',thermal:true,feature:'Bicolore possible',description:'Assemblage périmétrique à rupture de pont thermique, finitions laquées, anodisées ou effet bois.',finish:'ral9005-givre',width:3.6,height:2.45},
 {id:'S110P',slug:'s110p',name:'S110P',type:'Le grand format s’allège.',family:'Levant-coulissant',glass:27,weight:'400 kg',thermal:false,feature:'Dormant de 110 mm',description:'De grandes baies à levage, jusqu’à 3200 × 3000 mm par ouvrant selon la typologie.',finish:'ral9005-givre',width:4.6,height:2.75},
 {id:'S125RP',slug:'s125rp',name:'S125RP',type:'L’architecture sans retenue.',family:'Lift & slide premium',glass:40,weight:'400 kg',thermal:true,feature:'Levage sur chariots',description:'Jusqu’à 3200 × 3000 mm et 400 kg par ouvrant avec la ferrure adaptée. Vitrage jusqu’à 40 mm.',finish:'ral9005-givre',width:4.8,height:2.85},
 {id:'S140RP',slug:'s140rp',name:'S140RP Infinity',type:'Le paysage, presque seul.',family:'Coulissant minimaliste Infinity',glass:32,weight:'300 kg',thermal:true,feature:'Nœud central de 25 mm',description:'Traverses horizontales d’ouvrant cachées et seuil encastré. Jusqu’à 2600 × 3200 mm, dans la limite de 7,5 m² par ouvrant.',finish:'ral9005-givre',width:4.6,height:2.85},
];
export const FINISHES = [
 {id:'ral9005-givre',name:'Noir givré',detail:'RAL 9005',color:'#0a0a0d'},
];
export const STATIONS=PRODUCTS.map((p,i)=>({...p,z:-i*5.2}));
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
export function travelAt(p){return 3.2-clamp((p-.2)/.8)*(3.2-STATIONS.at(-1).z+3.1);}
export function productAt(p){return clamp(Math.ceil((-travelAt(p)-.6)/5.2),0,STATIONS.length-1);}
export function progressFor(index){return .2+.8*(3.2-STATIONS[clamp(index,0,STATIONS.length-1)].z-3)/(3.2-STATIONS.at(-1).z+3.1);}
export function openingAt(cameraZ,stationZ){return 1-smooth(1.1,4.4,cameraZ-stationZ);}
