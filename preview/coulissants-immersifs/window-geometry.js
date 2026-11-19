/* =====================================================================
 *  coulissants.js — genere la baie coulissante STRUGAL aux cotes exactes,
 *  systeme par systeme, dans le navigateur (GLB passe a <model-viewer>).
 *
 *  Chaque systeme a ses propres traits, repris des fiches STRUGAL :
 *    - profondeur du dormant, masses vues du dormant et de l'ouvrant ;
 *    - assemblage : coupe d'onglet (perimetrique) ou coupe droite ;
 *    - noeud central (42 mm S86RP, 34 mm S88RP Prime / elevable,
 *      25 mm S140RP, 20 mm en option sur le S88RP) ;
 *    - rupture de pont thermique : barrettes polyamide visibles, bicolore ;
 *    - levant-coulissant : seuil plat, rails inox, traverse basse
 *      renforcee, levier de levage ;
 *    - S140RP Infinity : traverses d'ouvrant cachees dans le dormant
 *      (montants lateraux visibles, « ouvrant reduit »), seuil encastre
 *      avec grille de drainage ;
 *    - 3 rails pour S70P / S90P a 3 vantaux.
 *  Pour tous : double vitrage (deux verres + intercalaire), joints EPDM,
 *  joints brosse, crochets d'emboitement, bouchons de drainage, poignee
 *  sur chaque vantail ouvrant (cote mur), verre physique a l'ecran.
 *  Ouverture animee (glTF « ouvrir » / « fermer »). Coupe d'angle facon
 *  catalogue (opts.coupe) pour montrer la section des profils.
 *
 *  Les masses vues non publiees sont reconstituees (aspect, pas DXF).
 *  Autonome : ne partage rien avec pergola.js, gardecorps.js, battants.js.
 * ===================================================================== */
import {ShapeUtils, Vector2} from 'three';
(function (global) {
'use strict';
const MM = 0.001;

/* ---------------- triangulation (ear clipping) ---------------- */
function earcut(d){
  const n=d.length>>1, idx=[], V=[];
  for(let i=0;i<n;i++) V.push(i);
  let area=0;
  for(let i=0,j=n-1;i<n;j=i++) area += (d[j*2]-d[i*2])*(d[i*2+1]+d[j*2+1]);
  if(area<0) V.reverse();
  const inTri=(ax,ay,bx,by,cx,cy,px,py)=>{
    const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);
    const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);
    const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);
    return !(((d1<0)||(d2<0)||(d3<0))&&((d1>0)||(d2>0)||(d3>0)));
  };
  let g=0;
  while(V.length>3 && g++<20000){
    let cut=false;
    for(let i=0;i<V.length;i++){
      const a=V[(i+V.length-1)%V.length], b=V[i], c=V[(i+1)%V.length];
      const ax=d[a*2],ay=d[a*2+1],bx=d[b*2],by=d[b*2+1],cx=d[c*2],cy=d[c*2+1];
      if((bx-ax)*(cy-ay)-(by-ay)*(cx-ax)<=0) continue;
      let ok=true;
      for(const v of V){ if(v===a||v===b||v===c) continue;
        if(inTri(ax,ay,bx,by,cx,cy,d[v*2],d[v*2+1])){ok=false;break;} }
      if(!ok) continue;
      idx.push(a,b,c); V.splice(i,1); cut=true; break;
    }
    if(!cut) break;
  }
  if(V.length===3) idx.push(V[0],V[1],V[2]);
  return idx;
}

/* ---------------- vecteurs ---------------- */
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const sc=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const X=[1,0,0], Y=[0,1,0], Z=[0,0,1];
const NX=[-1,0,0], NY=[0,-1,0], NZ=[0,0,-1];

/* Une geometrie par matiere ; un « Part » = un noeud glTF */
function Mesh(){ this.pos=[]; this.nrm=[]; this.idx=[]; }
Mesh.prototype.tri=function(a,b,c,want){
  let n=cross(sub(b,a),sub(c,a));
  const L=Math.hypot(n[0],n[1],n[2]); if(L<1e-14) return;
  n=sc(n,1/L);
  if(want && dot(n,want)<0){ const t=b; b=c; c=t; n=sc(n,-1); }
  const base=this.pos.length/3;
  for(const p of [a,b,c]){ this.pos.push(p[0],p[1],p[2]); this.nrm.push(n[0],n[1],n[2]); }
  this.idx.push(base,base+1,base+2);
};
/* polygone plan convexe, sommets partages (eventail) : leger */
Mesh.prototype.flat=function(pts,want){
  let n=cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]));
  if(dot(n,want)<0) pts=pts.slice().reverse();
  const L=Math.hypot(want[0],want[1],want[2]), w=sc(want,1/L), base=this.pos.length/3;
  for(const p of pts){ this.pos.push(p[0],p[1],p[2]); this.nrm.push(w[0],w[1],w[2]); }
  for(let i=1;i<pts.length-1;i++) this.idx.push(base,base+i,base+i+1);
};
function Part(){ this.m={}; }
Part.prototype.get=function(mat){ return this.m[mat] || (this.m[mat]=new Mesh()); };

/* ---------------- polygones 2D ---------------- */
function area2(p){ let a=0; for(let i=0;i<p.length;i++){const j=(i+1)%p.length;
  a+=p[i][0]*p[j][1]-p[j][0]*p[i][1];} return a/2; }
/* garde le cote a*u + b*z + c >= 0 (Sutherland-Hodgman) */
function clip(poly,a,b,c){
  const out=[], f=p=>a*p[0]+b*p[1]+c;
  for(let i=0;i<poly.length;i++){
    const P=poly[i], Q=poly[(i+1)%poly.length], fp=f(P), fq=f(Q);
    if(fp>=0) out.push(P);
    if((fp>=0)!==(fq>=0)){ const t=fp/(fp-fq); out.push([P[0]+(Q[0]-P[0])*t, P[1]+(Q[1]-P[1])*t]); }
  }
  /* sommets doublons */
  const r=[]; for(const p of out){ const q=r[r.length-1];
    if(!q || Math.abs(q[0]-p[0])>1e-9 || Math.abs(q[1]-p[1])>1e-9) r.push(p); }
  if(r.length>2){ const a0=r[0], z=r[r.length-1];
    if(Math.abs(a0[0]-z[0])<1e-9 && Math.abs(a0[1]-z[1])<1e-9) r.pop(); }
  return r.length>=3 && Math.abs(area2(r))>1e-12 ? r : null;
}
/* largeur de matiere (u max) d'un profil a la profondeur z : sert aux
   coupes droites « contre-profilees » d'une traverse contre un montant */
function extent(polys,z){
  let best=0;
  for(const p of polys) for(let i=0;i<p.length;i++){
    const A=p[i], B=p[(i+1)%p.length];
    const lo=Math.min(A[1],B[1]), hi=Math.max(A[1],B[1]);
    if(z<lo-1e-9||z>hi+1e-9) continue;
    const u = Math.abs(B[1]-A[1])<1e-12 ? Math.max(A[0],B[0]) : A[0]+(B[0]-A[0])*(z-A[1])/(B[1]-A[1]);
    if(u>best) best=u;
  }
  return best;
}
function rrect(w,h,r,seg){ /* rectangle arrondi centre, (x,y) */
  r=Math.min(r,w/2,h/2); seg=seg||4; const p=[];
  const C=[[w/2-r,h/2-r,0],[-w/2+r,h/2-r,1],[-w/2+r,-h/2+r,2],[w/2-r,-h/2+r,3]];
  for(const [cx,cy,q] of C) for(let i=0;i<=seg;i++){ const a=(q+i/seg)*Math.PI/2;
    p.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); }
  return p;
}
function circle(r,seg){ const p=[]; for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2; p.push([r*Math.cos(a),r*Math.sin(a)]);} return p; }

/* Extrusion d'un polygone (u,v) le long de t, dans la base (t,n,e) :
   P = O + t*s + n*u + e*v, s de -L/2+cutA(u,v) a L/2-cutB(u,v).
   cutA / cutB : recul de chaque sommet (onglet : u ; coupe droite : 0
   ou le contour du montant).                                          */
function sweep(mesh, poly, O, t, n, e, L, cutA, cutB, caps){
  const ccw = area2(poly)>0;
  const s0=i=>-L/2+(cutA?cutA(poly[i][0],poly[i][1]):0);
  const s1=i=> L/2-(cutB?cutB(poly[i][0],poly[i][1]):0);
  const P=(i,s)=>add(add(add(O,sc(t,s)),sc(n,poly[i][0])),sc(e,poly[i][1]));
  const N=poly.length;
  for(let i=0;i<N;i++){
    const j=(i+1)%N, du=poly[j][0]-poly[i][0], dv=poly[j][1]-poly[i][1];
    const o = ccw ? add(sc(n,dv),sc(e,-du)) : add(sc(n,-dv),sc(e,du));
    const a=P(i,s0(i)), b=P(j,s0(j)), c=P(j,s1(j)), d=P(i,s1(i));
    mesh.tri(a,b,c,o); mesh.tri(a,c,d,o);
  }
  if(caps===false) return;
  const flat=[]; for(const p of poly) flat.push(p[0],p[1]);
  const T=earcut(flat);
  for(let k=0;k<T.length;k+=3){
    mesh.tri(P(T[k],s1(T[k])),P(T[k+1],s1(T[k+1])),P(T[k+2],s1(T[k+2])),t);
    mesh.tri(P(T[k],s0(T[k])),P(T[k+1],s0(T[k+1])),P(T[k+2],s0(T[k+2])),sc(t,-1));
  }
}
/* prisme : polygone (x,y) dans le plan (a,b), epaisseur le long de t,
   centre en C */
function prism(mesh, poly, C, a, b, t, len){ sweep(mesh, poly, C, t, a, b, len, null, null, true); }
/* Open profile chambers for the catalogue cutaway. Unlike dark end-face decals,
   these have actual openings and interior walls, so they remain hollow on orbit. */
function hollowSweep(mesh,core,poly,voids,O,t,n,e,L,cutA,cutB){
  const inside=(p)=>{
    let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
    }return yes;
  };
  const holes=voids.map(([u0,u1,v0,v1])=>[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]).filter(h=>h.every(inside)&&h.every((p,i)=>inside([(p[0]+h[(i+1)%4][0])/2,(p[1]+h[(i+1)%4][1])/2])));
  if(!holes.length){sweep(mesh,poly,O,t,n,e,L,cutA,cutB);return;}
  const P=(p,s)=>add(add(add(O,sc(t,s)),sc(n,p[0])),sc(e,p[1]));
  const lo=p=>-L/2+(cutA?cutA(p[0],p[1]):0),hi=p=>L/2-(cutB?cutB(p[0],p[1]):0);
  for(const [k,ring]of [poly,...holes].entries())for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],sign=(area2(ring)>0?1:-1)*(k?-1:1);
    const normal=sc(add(sc(n,b[1]-a[1]),sc(e,a[0]-b[0])),sign);
    const dest=k?core:mesh;
    dest.tri(P(a,lo(a)),P(b,lo(b)),P(b,hi(b)),normal);dest.tri(P(a,lo(a)),P(b,hi(b)),P(a,hi(a)),normal);
  }
  const points=[poly,...holes].flat(),tris=ShapeUtils.triangulateShape(poly.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))));
  for(const q of tris){mesh.tri(P(points[q[0]],hi(points[q[0]])),P(points[q[1]],hi(points[q[1]])),P(points[q[2]],hi(points[q[2]])),t);mesh.tri(P(points[q[0]],lo(points[q[0]])),P(points[q[1]],lo(points[q[1]])),P(points[q[2]],lo(points[q[2]])),sc(t,-1));}
}
function box(mesh, c, s){ /* boite alignee, centre c, tailles s */
  prism(mesh, [[-s[0]/2,-s[1]/2],[s[0]/2,-s[1]/2],[s[0]/2,s[1]/2],[-s[0]/2,s[1]/2]], c, X, Y, Z, s[2]);
}

/* ================= la gamme =================
   mm. D profondeur du dormant ; Ff masse vue du dormant ; Fv masse vue
   de l'ouvrant (hors partie engagee dans le dormant) ; sd epaisseur de
   l'ouvrant ; C noeud central (deux montants) ; g vitrage ; pf / ps
   barrette polyamide dormant / ouvrant (0 = sans rupture) ; joint :
   'onglet' (perimetrique) ou 'droit' ; face : 'biseau' | 'arrondi' |
   'droit' ; cadre : 'classique' | 'arrondi' | 'tubulaire' | 'minimal' ;
   seuil : 'std' | 'levage' | 'encastre' ; man : poignee.
   src : ce qui vient de la fiche STRUGAL (le reste est reconstitue).  */
const SYSTEMS = {
  S70P:  {D:70,  Ff:44, Fv:59, sd:27, C:62, g:20, tp:4, pf:0,  ps:0,  joint:'onglet', face:'biseau',  cadre:'classique', seuil:'std',     man:'tirage',     rails3:true,
          glass:21, tag:'Coulissant économique', vmax:null, kg:null,
          src:'Dormant 70 mm, ouvrant 27 mm, section de référence 103 mm, vitrage jusqu’à 21 mm, 3 rails possibles.'},
  S70R:  {D:70,  Ff:35, Fv:45, sd:28, C:58, g:18, tp:4, pf:0,  ps:0,  joint:'droit',  face:'droit',   cadre:'minimal',   seuil:'std',     man:'tirage',
          glass:19, tag:'Coulissant léger', vmax:null, kg:null,
          src:'Masse vue du dormant 45 mm, ouvrants à coupe droite de 28,1 mm, section de référence 80 mm, vitrage 4 à 19 mm.'},
  S86RP: {D:86,  Ff:40, Fv:40, sd:36, C:42, g:26, tp:5, pf:17, ps:14, joint:'onglet', face:'arrondi', cadre:'minimal',   seuil:'std',     man:'tirage',
          glass:26, exact:true, tag:'Minimaliste, RPT', vmax:[2000,2500], kg:140,
          src:'Dormant 85/93 mm, nœud central 42 mm, polyamide 16 à 18,6 mm, vitrage 26 mm.'},
  S88R:  {D:88,  Ff:50, Fv:66, sd:40, C:70, g:32, tp:6, pf:0,  ps:0,  joint:'droit',  face:'droit',   cadre:'classique', seuil:'std',     man:'tirage',     levageOpt:true,
          glass:32, levCap:{vmax:[3300,3200], kg:300}, tag:'Coulissant & levage', vmax:[2300,2600], kg:200,
          src:'Coulissant ou levage, vitrage jusqu’à 32 mm, sans rupture.'},
  S88RP: {D:88,  Ff:50, Fv:64, sd:42, C:70, g:32, tp:6, pf:34, ps:22, joint:'onglet', face:'arrondi', cadre:'arrondi',   seuil:'std',     man:'tirage',     levageOpt:true, c20:true,
          glass:32, levCap:{vmax:[3300,3200], kg:300}, tag:'Levage polyvalent, RPT', vmax:[2300,2600], kg:200,
          src:'Polyamide 34 mm, vitrage 32 mm, nœud central renforcé ou réduit à 20 mm, canal de drainage.'},
  'S88RP-PRIME':{D:112, Ff:46, Fv:52, sd:44, C:34, g:32, tp:6, pf:34, ps:24, joint:'droit', face:'droit', cadre:'minimal', seuil:'std', man:'tirage',
          glass:32, exact:true, tag:'Premium, nœud 34 mm', vmax:[2300,2600], kg:150,
          src:'Dormant 112 mm à deux rails, ouvrants à coupe droite 42/46 mm, nœud central 34 mm, fermeture multipoint.'},
  'S88RP-ELEV':{D:112, Ff:46, Fv:60, sd:46, C:34, g:32, tp:6, pf:34, ps:24, joint:'droit', face:'droit', cadre:'minimal', seuil:'levage', man:'levage',
          glass:32, exact:true, tag:'Levant-coulissant, RPT', vmax:[3300,3200], kg:300,
          src:'Dormant 112 mm, ouvrants à coupe droite 42/46 mm, nœud central 34 mm, 2 ou 4 vantaux levants.'},
  S90P:  {D:90,  Ff:48, Fv:63, sd:35, C:66, g:26, tp:5, pf:0,  ps:0,  joint:'onglet', face:'biseau',  cadre:'classique', seuil:'std',     man:'tirage',     rails3:true, parclose:true,
          glass:26, tag:'Économique', vmax:[2200,2600], kg:160,
          src:'Dormant 90 mm, ouvrant 35 mm, section de référence 111 mm, parclose, 3 rails possibles.'},
  S90R:  {D:90,  Ff:52, Fv:60, sd:37, C:64, g:23, tp:5, pf:0,  ps:0,  joint:'droit',  face:'droit',   cadre:'tubulaire', seuil:'std',     man:'tirage',
          glass:23, tag:'Cadre tubulaire', vmax:[2000,2500], kg:140,
          src:'Cadre tubulaire 90 mm, ouvrants à coupe droite de 37,6 mm, vitrage 6 à 23 mm.'},
  S90RP: {D:85,  Ff:48, Fv:62, sd:35, C:64, g:27, tp:5, pf:15, ps:12, joint:'onglet', face:'arrondi', cadre:'arrondi',   seuil:'std',     man:'tirage',
          glass:27, tag:'Périmétrique, RPT', vmax:[2200,2600], kg:160,
          src:'Assemblage périmétrique, dormant 85 mm, ouvrant 35 mm, polyamide 14 à 16 mm, bicolore possible.'},
  S110P: {D:110, Ff:55, Fv:88, sd:45, C:78, g:27, tp:6, pf:0,  ps:0,  joint:'onglet', face:'biseau',  cadre:'classique', seuil:'levage',  man:'levage',
          glass:27, tag:'Levage grand format', vmax:[3200,3000], kg:400,
          src:'Dormant 110 mm, ouvrant 45 mm, section de référence 143 mm, ferrure à levage 400 kg.'},
  S125RP:{D:125, Ff:56, Fv:90, sd:54, C:74, g:40, tp:8, pf:24, ps:20, joint:'onglet', face:'arrondi', cadre:'arrondi',   seuil:'levage',  man:'levage',
          glass:40, tag:'Lift & slide premium', vmax:[3200,3000], kg:400,
          src:'Dormant 125 mm, polyamide 16 à 24 mm, vitrage 40 mm, levage 400 kg.'},
  /* fiche STRUGAL : « profils horizontaux a ouvrant cache » ; les montants
     lateraux restent visibles (ouvrant reduit) et portent la fermeture
     multipoint ; ici, poignee de tirage sur ce montant. Le noeud central
     de 25 mm n'a rien.                                                 */
  S140RP:{D:137, Ff:46, Fv:40, sd:50, C:25, g:32, tp:6, pf:32, ps:22, joint:'droit',  face:'droit',   cadre:'minimal',   seuil:'encastre',man:'tirage',    cacheH:true,
          glass:32, exact:true, tag:'Infinity, traverses cachées', vmax:[2600,3200], kg:300,
          src:'Dormant 137 mm, polyamide 30 à 34 mm, nœud central 25 mm, profils horizontaux d’ouvrant cachés, fermeture multipoint dans le montant latéral, seuil encastré.'},
};
const NAMES = {'S88RP-PRIME':'S88RP Prime','S88RP-ELEV':'S88RP élevable','S140RP':'S140RP Infinity'};

/* Vue reelle Android sans WebXR (Scene Viewer) : il lui faut un fichier
   en ligne, pas un blob. Il n'existe que pour quatre familles (dossier
   models-co/) ; chaque systeme y est rattache a la plus proche.       */
const AR_FAMILY = {
  S140RP:'S140RP', S86RP:'S86RP', 'S88RP-PRIME':'S86RP',
  S70P:'S90RP', S70R:'S90RP', S90P:'S90RP', S90R:'S90RP', S90RP:'S90RP',
  S88R:'S110P', S88RP:'S110P', 'S88RP-ELEV':'S110P', S125RP:'S110P', S110P:'S110P',
};

/* ================= profils ================= */
const LIPT=3.2, TR=7, EMB=12, HID=20;   /* HID : ouvrant cache, largeur noyee */   /* levre du dormant, hauteur de rail, engagement ouvrant */

/* section du dormant (u : depuis le mur vers la baie ; v : profondeur,
   + = interieur). Une gouttiere en U : deux levres + rails sur l'ame. */
function frameProfile(S, tracks, sill, hidden){
  const h=S.D/2, Ff=S.Ff+(hidden?HID:0), st=S.cadre, ch= st==='tubulaire'?0.6:1.2;
  const uw = hidden ? Ff-(EMB+HID)-TR-2 : Ff-EMB-TR-2;   /* hidden : traverse d'ouvrant noyee */
  const lipT = st==='tubulaire' ? 4.5 : LIPT;
  const p=[];
  const lipTop=(side)=>{ /* arete de la levre cote baie, de l'exterieur vers l'interieur */
    const z0=side<0?-h:h-lipT, z1=side<0?-h+lipT:h;
    if(st==='arrondi'){ const r=Math.min(2.4,lipT*0.75), pts=[];
      /* quart de rond cote face vue */
      /* rayon cote face vue, petit chanfrein cote gorge */
      return side<0 ? [[Ff-r,z0],[Ff-r*0.29,z0+r*0.29],[Ff,z0+r],[Ff,z1-0.5],[Ff-0.5,z1]]
                    : [[Ff-0.5,z0],[Ff,z0+0.5],[Ff,z1-r],[Ff-r*0.29,z1-r*0.29],[Ff-r,z1]];
    }
    return side<0 ? [[Ff-ch,z0],[Ff,z0+ch],[Ff,z1-0.4],[Ff-0.4,z1]]
                  : [[Ff-0.4,z0],[Ff,z0+0.4],[Ff,z1-ch],[Ff-ch,z1]];
  };
  /* face exterieure (v = -h), du mur vers la baie */
  p.push([0,-h+ch],[ch,-h]);
  if(st==='classique'){ const g=Ff*0.42; p.push([g-1.6,-h],[g,-h+1.1],[g+1.6,-h]); }
  p.push(...lipTop(-1));
  /* fond de gorge et rails */
  p.push([uw+1,-h+lipT],[uw,-h+lipT+1]);
  for(const zc of tracks){
    const w = sill==='std' ? 1.6 : 0;   /* seuils plats : rails inox poses a part */
    if(!w) continue;
    p.push([uw,zc-w-0.8],[uw+TR-1.2,zc-w],[uw+TR,zc-0.6],[uw+TR,zc+0.6],[uw+TR-1.2,zc+w],[uw,zc+w+0.8]);
  }
  p.push([uw,h-lipT-1],[uw+1,h-lipT]);
  p.push(...lipTop(1));
  if(st==='classique'){ const g=Ff*0.42; p.push([g+1.6,h],[g,h-1.1],[g-1.6,h]); }
  p.push([ch,h],[0,h-ch]);
  return {poly:p, uw, lipT, Ff};
}
/* seuil plat des levant-coulissants (et encastre pour l'Infinity) :
   levres basses, nez exterieur de rejet d'eau                        */
function sillProfile(S, tracks){
  const h=S.D/2, lipT=LIPT, uw=24;
  const lowExt=uw+3, lowInt=uw+6;
  const p=[[0,-h-16],[uw-12,-h-16],[uw-10,-h-14],[lowExt,-h+lipT-0.5],[lowExt-0.5,-h+lipT],
           [uw+1,-h+lipT],[uw,-h+lipT+1],[uw,h-lipT-1],[uw+1,h-lipT],
           [lowInt-0.5,h-lipT],[lowInt,h-lipT+0.5],[lowInt,h-1.5],[lowInt-1.5,h],[0,h]];
  return {poly:p, uw, lipT};
}

/* section d'ouvrant : u depuis l'arete exterieure du vantail (engagee
   dans le dormant) vers le vitrage ; v profondeur centree.            */
function sashProfile(S, F, sd, g, rb, opt){
  const h=sd/2, gl=g/2+2.5, lip=h-gl, ch=1.0;
  const st=opt.face||S.face;
  const edge=(side)=>{ /* de (F, side*gl) a la face vue, cote side */
    let pts;
    if(st==='biseau'){ const bv=Math.min(4,lip*0.7), bw=7;
      pts=[[F,gl],[F,h-bv],[F-bw,h]]; }
    else if(st==='arrondi'){ const r=Math.min(3.2,lip*0.85); pts=[[F,gl]];
      for(let i=0;i<=4;i++){ const a=i/4*Math.PI/2; pts.push([F-r+r*Math.cos(a), h-r+r*Math.sin(a)]); } }
    else pts=[[F,gl],[F,h-0.7],[F-0.7,h]];
    if(opt.parclose && side>0) pts.push([F-10.6,h],[F-11,h-0.7],[F-11.4,h]); /* joint de parclose */
    return side>0 ? pts : pts.map(q=>[q[0],-q[1]]).reverse();
  };
  const p=[[0,-h+ch],[ch,-h]];
  p.push(...edge(-1));
  p.push([F-rb,-gl],[F-rb,gl]);
  p.push(...edge(1));
  p.push([ch,h],[0,h-ch]);
  return {poly:p, gl, h};
}
/* decoupe d'une section : coquille ext., barrette (ou ame), coquille int. */
function splitRPT(poly, pw, umax, rec){
  const p=pw/2;
  const ext=clip(poly,0,-1,-p), intr=clip(poly,0,1,-p);
  let mid=clip(clip(poly,0,1,p),0,-1,p);
  if(mid && rec){ mid=clip(mid,1,0,-rec); if(mid) mid=clip(mid,-1,0,umax-rec); }
  return {ext, mid, intr};
}

/* ================= construction ================= */
function build(o){
  const key = SYSTEMS[o.system] ? o.system : 'S90RP';
  const S = Object.assign({}, SYSTEMS[key], o.profile || {});
  const W=o.width*1000, H=o.height*1000;           /* mm en interne */
  const leaves=o.leaves, levage = S.man==='levage' || (S.levageOpt && o.levage);
  if(levage && S.man!=='levage'){ S.man='levage'; S.seuil='levage'; }
  if(S.c20 && o.noeud20) S.C=20;
  const rpt = S.pf>0;
  const three = (S.rails3 || o.tracks===3) && leaves===3;
  const D = three ? Math.round(S.D*1.45) : S.D;
  S.D = D;
  const ntr = three ? 3 : 2;

  /* rails et ouvrants */
  const lipT = S.cadre==='tubulaire'?4.5:LIPT;
  const span = D-2*lipT-6, pitch=span/ntr;
  const tracks=[]; for(let k=0;k<ntr;k++) tracks.push(-span/2+pitch*(k+0.5));
  const sd = Math.min(S.sd, pitch-3);
  const g  = Math.min(S.g, sd-9);
  const tp = Math.min(S.tp, g/3);
  const Fs = S.Fv+EMB;                       /* largeur totale des montants */
  const FsH = S.cacheH ? EMB+HID : Fs;       /* traverses (noyees si cachees) */
  const Fi = S.C/2;                          /* montant de chicane, face vue */
  const gap = pitch-sd;                      /* jeu entre deux vantaux */

  const P = {static:new Part(), leaves:[], wall:null};
  const st = P.static;
  const matExt = rpt ? 'alu_ext' : 'alu';

  /* ---------- dormant ---------- */
  const fr = frameProfile(S, tracks, 'std');
  const hd = S.cacheH ? frameProfile(S, tracks, 'std', true) : fr;     /* traverse haute */
  const sl = S.seuil==='std' ? fr : S.seuil==='encastre' ? frameProfile(S, tracks, 'encastre', !!S.cacheH) : sillProfile(S, tracks);
  const frameParts=(prof,umax)=>{
    if(!rpt) return [{poly:prof.poly, mat:'alu'}];
    const s=splitRPT(prof.poly, S.pf, prof.uw, 1.4);
    return [{poly:s.ext,mat:'alu_ext'},{poly:s.mid,mat:'polyamide'},{poly:s.intr,mat:'alu'}].filter(x=>x.poly);
  };
  const jambParts=frameParts(fr), headParts=frameParts(hd), sillParts=frameParts(sl);
  const seam=0.2;                                   /* joint d'onglet visible */
  const mit=(u)=>u+seam;
  const cope=(u,v)=>extent([fr.poly],v)+0.05;
  const mitred = S.joint==='onglet';
  const sillMitre = mitred && S.seuil==='std';
  /* montants : base (t=+Y, n=+/-X, e=Z) */
  for(const s of [-1,1]){
    const O=[s*W/2, H/2, 0], n=s<0?X:NX;
    for(const q of jambParts)
      sweep(st.get(q.mat), q.poly, O, Y, n, Z, H,
            sillMitre? mit : null, mitred? mit : null);
  }
  /* traverse haute */
  for(const q of headParts)
    sweep(st.get(q.mat), q.poly, [0,H,0], X, NY, Z, W, mitred?mit:cope, mitred?mit:cope);
  /* seuil */
  for(const q of sillParts)
    sweep(st.get(q.mat), q.poly, [0,0,0], X, Y, Z, W, sillMitre?mit:cope, sillMitre?mit:cope);
  /* rails inox des seuils plats */
  if(S.seuil!=='std'){
    for(const zc of tracks){
      const rp=[[0,-2.2],[TR-1.5,-2.2],[TR,-1],[TR,1],[TR-1.5,2.2],[0,2.2]].map(q=>[q[0]+sl.uw,q[1]+zc]);
      sweep(st.get('inox'), rp, [0,0,0], X, Y, Z, W-2*extent([fr.poly],zc));
    }
  }
  /* joints brosse / EPDM le long des levres, cote vantaux */
  /* joint brosse : depasse de 1,4 mm de la levre, trait sombre autour
     de chaque vantail comme sur une vraie baie                         */
  const lipSeal=(Ffl,side)=>[[Ffl-4.5,side*(D/2-lipT)-side*1.8],[Ffl+1.4,side*(D/2-lipT)-side*1.8],
                              [Ffl+1.4,side*(D/2-lipT)-side*0.2],[Ffl-4.5,side*(D/2-lipT)-side*0.2]];
  for(const side of [-1,1]){
    const q=lipSeal(S.Ff,side);
    const poly= side<0? q : q.slice().reverse();
    for(const s of [-1,1]) sweep(st.get('joint'), poly, [s*W/2,H/2,0], Y, s<0?X:NX, Z, H-2*S.Ff+8);
    sweep(st.get('joint'), lipSeal(hd.Ff,side)[0] && (side<0?lipSeal(hd.Ff,side):lipSeal(hd.Ff,side).slice().reverse()), [0,H,0], X, NY, Z, W-2*S.Ff+8);
  }
  /* bouchons de drainage, face exterieure du seuil */
  if(S.seuil==='std'){
    const n=Math.max(2,Math.round(W/650));
    for(let i=0;i<n;i++){
      const x=-W/2+W*(i+0.5)/n;
      prism(st.get('joint'), rrect(30,7,3.4,3), [x, S.Ff*0.55, -D/2-0.6], X, Y, Z, 1.6);
    }
  }
  /* seuil encastre de l'Infinity : grille de drainage exterieure */
  if(S.seuil==='encastre' || o.drainage){
    const z0=-D/2-2, depth=170, top=S.Ff;
    grille(st, -W/2, W/2, z0, depth, o.drainage?2:top);
  }

  /* ---------- vantaux ---------- */
  const uSash = sl.uw + TR + 2;              /* arete basse du vantail */
  const uTop  = hd.uw + TR + 2;
  const clear0=-W/2+S.Ff, clear1=W/2-S.Ff, clearW=clear1-clear0;
  const meets=[]; for(let j=1;j<leaves;j++) meets.push(clear0+clearW*j/leaves);
  /* rails : 2 vantaux -> int / ext ; 3 sur 2 rails -> int, ext, int ;
     3 rails -> un par vantail ; 4 -> int, ext, ext, int : les vantaux de
     rive (cote mur) sont les ouvrants et glissent devant les centraux  */
  let trk;
  if(leaves===2) trk=[1,0];
  else if(leaves===3) trk= three? [2,1,0] : [1,0,1];
  else trk=[1,0,0,1];
  /* vantaux qui coulissent, et dans quel sens */
  const moving = leaves===4 ? {0:1, 3:-1} : {0:1};
  /* chaque vantail ouvrant porte sa poignee, cote mur, la ou il se
     verrouille dans le dormant : 2 vantaux -> les deux ; 3 et 4 -> les
     deux vantaux de rive                                               */
  const handles = leaves===2 ? {0:'L',1:'R'} : leaves===3 ? {0:'L',2:'R'} : {0:'L',3:'R'};
  const HW = {tirage:12, levage:20};
  const yb = uSash, yt = H-uTop;
  const anchors={};

  for(let i=0;i<leaves;i++){
    const part=new Part();
    const zc=tracks[trk[i]];
    const xl = i===0 ? -W/2+(S.Ff-EMB) : meets[i-1];
    const xr = i===leaves-1 ? W/2-(S.Ff-EMB) : meets[i];
    /* type de chaque montant */
    const kl = i===0 ? 'out' : 'meet', kr = i===leaves-1 ? 'out' : 'meet';
    /* 4 vantaux : les deux vantaux centraux se rejoignent sur le meme rail,
       par des montants qui portent la fermeture (pas le noeud d'emboitement) */
    const same=(j)=>j>=0&&j<leaves&&Math.abs(tracks[trk[j]]-zc)<1e-6;
    const FiS=Math.max(Fi,30);
    const FL = kl==='out'? Fs : (same(i-1)?FiS:Fi), FR = kr==='out'? Fs : (same(i+1)?FiS:Fi);
    const Ft = FsH, Fb = FsH + (S.seuil==='levage'? 14:0);   /* traverse basse renforcee (chariots) */
    const rbFor=F=>Math.min(14, F-5);
    const prof=(F)=>sashProfile(S, F, sd, g, rbFor(F), {parclose:S.parclose});
    const sashParts=(F)=>{
      const pr=prof(F);
      const pw = rpt ? Math.min(S.ps, 2*pr.gl-2) : 2*pr.gl-2;
      const s=splitRPT(pr.poly, pw, F-rbFor(F), rpt?1.0:0);
      return {pr, parts:[{poly:s.ext,mat:matExt},{poly:s.mid,mat:rpt?'polyamide':'alu'},{poly:s.intr,mat:'alu'}].filter(x=>x.poly)};
    };
    const L=sashParts(FL), R=sashParts(FR), T=sashParts(Ft), B=sashParts(Fb);
    const mitV = S.joint==='onglet';
    const legH=yt-yb, legW=xr-xl;
    /* montants (pleine hauteur en coupe droite) */
    const stile=(sp, x, n, kind)=>{
      const onglet = mitV && kind==='out';
      for(const q of sp.parts)
        sweep(part.get(q.mat), q.poly, [x,(yb+yt)/2,zc], Y, n, Z, legH, onglet?mit:null, onglet?mit:null);
    };
    stile(L, xl, X, kl); stile(R, xr, NX, kr);
    /* traverses */
    const copeL=(u,v)=>extent([L.pr.poly],v)+0.15, copeR=(u,v)=>extent([R.pr.poly],v)+0.15;
    const rail=(sp,y,n)=>{
      for(const q of sp.parts)
        sweep(part.get(q.mat), q.poly, [(xl+xr)/2,y,zc], X, n, Z, legW,
              (mitV&&kl==='out')?mit:copeL, (mitV&&kr==='out')?mit:copeR);
    };
    rail(T, yt, NY); rail(B, yb, Y);
    /* crochets d'emboitement + joint brosse au noeud central. Chaque
       crochet depasse de son vantail, dans le jeu entre les deux rails :
       le vantail mobile s'en eloigne en s'ouvrant, comme en vrai.     */
    for(const [k,x,n] of [[kl,xl,1],[kr,xr,-1]]){
      if(k!=='meet') continue;
      const j = n>0 ? i-1 : i+1;              /* voisin */
      const dz = tracks[trk[j]]-zc;
      if(Math.abs(dz)<1e-6){                  /* meme rail (4 vantaux) : couvre-joint */
        if(n>0) box(part.get(matExt), [x-3, (yb+yt)/2, zc-sd/2-1.2], [10, legH-20, 2.4]);
        continue;
      }
      const dir=Math.sign(dz), w=3.2, len=gap-0.5;
      const z0=zc+dir*sd/2, z1=z0+dir*len, xx=x-n*w/2;
      box(part.get(matExt==='alu'||dir>0?'alu':matExt), [xx, (yb+yt)/2, (z0+z1)/2], [w, legH-8, len]);
      box(part.get('brosse'), [x-n*(w+0.6)/2, (yb+yt)/2, z1-dir*0.3], [w+0.6, legH-12, 0.6]);
    }
    /* ---------- vitrage isolant ---------- */
    const gx0=xl+FL-rbFor(FL)+1.5, gx1=xr-FR+rbFor(FR)-1.5;
    const gy0=yb+Fb-rbFor(Fb)+1.5, gy1=yt-Ft+rbFor(Ft)-1.5;
    const gw=gx1-gx0, gh=gy1-gy0, gcx=(gx0+gx1)/2, gcy=(gy0+gy1)/2;
    for(const s of (S.singleGlass?[0]:[-1,1])){
      const z=zc+s*(g/2-tp/2);
      box(part.get('verre'), [gcx,gcy,z], [gw,gh,S.singleGlass?g:tp]);
    }
    /* intercalaire (vu en biais derriere le joint) */
    const spH=Math.min(16, Math.max(rbFor(FL),rbFor(Ft))+2), spT=g-2*tp-0.4;
    const spMat = rpt ? 'intercalaire_noir' : 'intercalaire';
    if(!S.singleGlass){
    box(part.get(spMat), [gcx, gy1-spH/2, zc], [gw, spH, spT]);
    box(part.get(spMat), [gcx, gy0+spH/2, zc], [gw, spH, spT]);
    box(part.get(spMat), [gx0+spH/2, gcy, zc], [spH, gh-2*spH, spT]);
    box(part.get(spMat), [gx1-spH/2, gcy, zc], [spH, gh-2*spH, spT]);
    }
    /* joints EPDM sur les deux faces (levre de 2,5 mm sur le verre) */
    const vx0=xl+FL, vx1=xr-FR, vy0=yb+Fb, vy1=yt-Ft;
    for(const s of [-1,1]){
      const z=zc+s*(g/2+1.25), b=3;
      box(part.get('joint'), [(vx0+vx1)/2, vy1-b/2+0.6, z], [vx1-vx0+2, b, 2.5]);
      box(part.get('joint'), [(vx0+vx1)/2, vy0+b/2-0.6, z], [vx1-vx0+2, b, 2.5]);
      box(part.get('joint'), [vx0+b/2-0.6, (vy0+vy1)/2, z], [b, vy1-vy0, 2.5]);
      box(part.get('joint'), [vx1-b/2+0.6, (vy0+vy1)/2, z], [b, vy1-vy0, 2.5]);
    }
    /* ---------- quincaillerie ---------- */
    const dirMove = moving[i];
    // Reinforcement shown as an optional centre-stile rib in the S88R catalogue.
    if(o.reinforced)for(const [kind,x,dir]of [[kl,xl,1],[kr,xr,-1]])if(kind==='meet'){
      prism(part.get(matExt),rrect(16,26,1.5,3),[x+dir*9,(yb+yt)/2,zc+sd/2+12],X,Z,Y,legH-8);
    }
    const hy = Math.min(1050, (yb+yt)/2);
    let hx, hStile=handles[i];
    if(hStile){
      const Fh = hStile==='L'? FL : FR;
      const vis = (hStile==='L' ? (kl==='out'? Fh-EMB : Fh) : (kr==='out'? Fh-EMB : Fh));
      hx = hStile==='L' ? xl+Fh-vis/2 : xr-Fh+vis/2;
      const zi=zc+sd/2, ze=zc-sd/2;
      const handle = handleGeom(S.man, part, hx, hy, zi);
      if(handle) part.handle=handle;
      part.hx=hx; part.hw=(HW[S.man]||15);
      /* cuvette exterieure, affleurante */
      if(vis>=24){
        prism(part.get('quinc'), rrect(Math.min(26,vis-6),130,5,3), [hx,hy,ze-0.35], X, Y, NZ, 0.7);
        prism(part.get('joint'), rrect(Math.min(16,vis-14),104,4,3), [hx,hy,ze-0.75], X, Y, NZ, 0.3);
      }
      if(!anchors.handle) anchors.handle=[hx*MM, hy*MM, (zi+30)*MM];
    }
    if(dirMove!==undefined) part.travel = dirMove*(legW - EMB - Fi - 40);
    part.zc=zc; part.x=[xl,xr];
    P.leaves.push(part);
  }
  // Three-track cascade: both sliding leaves stack beside the last leaf.
  if(three){
    const last=P.leaves[2];
    for(const [i,lf]of P.leaves.entries())if(i<2)lf.travel=Math.max(0,last.x[0]-lf.x[0]-(2-i)*18);
  }
  /* butee : le vantail qui s'ouvre s'arrete avant la poignee du vantail
     sur lequel il passe (2 vantaux), comme les butees en atelier       */
  if(leaves===2){
    const a=P.leaves[0], b=P.leaves[1];
    const tmax=(b.hx-b.hw-25)-a.x[1];
    if(a.travel>tmax) a.travel=Math.max(0,tmax);
  }
  /* 4 vantaux : les deux vantaux de rive s'ouvrent ensemble vers le
     centre, sur le meme rail : ils s'arretent avant de se toucher      */
  if(leaves===4){
    const a=P.leaves[0], d=P.leaves[3];
    const tmax=(d.x[0]-a.x[1]-20)/2;
    if(a.travel>tmax){ a.travel=Math.max(0,tmax); d.travel=-a.travel; }
  }
  anchors.meet=[ (meets[0]||0)*MM, H*0.5*MM, D/2*MM ];
  anchors.corner=[ (-W/2+S.Ff)*MM, S.Ff*MM, D/2*MM ];
  anchors.sill=[ 0, 0.02, 0 ];

  /* ---------- mise en situation (vue 3D seulement, pas la vue reelle) ---------- */
  if(o.context){
    const wall=new Part(), m=wall.get('mur'), f=wall.get('sol'), te=wall.get('terrasse');
    const T=200, zf=-D/2-20, zWall=zf+T/2, side=650, top=450;
    box(m, [-W/2-side/2, (H+top)/2, zWall], [side, H+top, T]);
    box(m, [ W/2+side/2, (H+top)/2, zWall], [side, H+top, T]);
    box(m, [0, H+top/2, zWall], [W, top, T]);
    const zi=zf+T;                               /* nu interieur */
    box(f, [0,-10, (-D/2+zi+1500)/2], [W+2*side, 20, zi+1500+D/2]);
    box(te,[0,-12, -D/2-700], [W+2*side, 20, 1400]);
    P.wall=wall;
  }
  /* largeur du plus grand vantail, et passage libre de chaque vantail
     ouvert (de la levre du dormant a l'arete du vantail ouvert)        */
  const leafW = Math.max(...P.leaves.map(l=>l.x[1]-l.x[0]));
  const opens = P.leaves.filter(l=>l.travel).map(l=>Math.round(Math.abs(l.travel)-EMB));
  return {P, S, key, W, H, D, anchors, sd, g, rpt, levage, ntr, Fs, Fi, leafW, opens};
}

/* grille de drainage perforee (option canalette de l'Infinity) : tole
   inox a trous oblongs en quinconce, au-dessus d'un caniveau sombre   */
function grille(part, x0, x1, z0, depth, top){
  const W=x1-x0, cx=(x0+x1)/2;
  box(part.get('joint'), [cx, top-16, z0-depth/2], [W, 26, depth-4]);
  box(part.get('inox'), [cx, top-1.5, z0-depth/2], [W, 3, depth]);
  const sl=part.get('joint');
  let row=0;
  for(let z=z0-18; z>z0-depth+14; z-=21, row++)
    for(let x=x0+36+(row%2)*36; x<x1-36; x+=72)
      sl.flat(rrect(36,8,4,1).map(q=>[x+q[0], top+0.04, z+q[1]]), Y);
}

/* ================= coupe d'angle =================
   Comme les vues des catalogues STRUGAL : l'angle bas d'une baie, scie
   a 30 cm, pour voir la section des profils — chambres, barrettes
   polyamide, rails, joints, double vitrage. C'est a cette echelle que
   les systemes se distinguent vraiment.                               */
function intervals(a,b,walls){
  let segs=[[a,b]];
  for(const [w0,w1] of walls){
    const n=[];
    for(const [s0,s1] of segs){
      if(w1<=s0||w0>=s1){ n.push([s0,s1]); continue; }
      if(w0>s0) n.push([s0,w0]);
      if(w1<s1) n.push([w1,s1]);
    }
    segs=n;
  }
  return segs.filter(([x,y])=>y-x>2.2);
}
/* vides des chambres, poses sur la face sciee (quad sombre) */
function chamberQuads(mesh, rects, Oend, n, e, t){
  for(const [u0,u1,v0,v1] of rects){
    if(u1-u0<1.5||v1-v0<1.5) continue;
    const P=(u,v)=>add(add(add(Oend,sc(n,u)),sc(e,v)),sc(t,0.06));
    mesh.tri(P(u0,v0),P(u1,v0),P(u1,v1),t); mesh.tri(P(u0,v0),P(u1,v1),P(u0,v1),t);
  }
}
function frameChambers(S, prof, tracks, rpt, lev){
  const h=S.D/2, w=1.6, uw=prof.uw, p=S.pf/2, out=[];
  if(uw<5) return out;
  const walls=tracks.map(z=>[z-0.9,z+0.9]);
  if(rpt) walls.push([-p-w,p+w]);
  /* une cloison horizontale coupe les ames hautes en deux etages */
  const levels = uw>26 ? [[w,uw*0.48-0.8],[uw*0.48+0.8,uw-w]] : [[w,uw-w]];
  for(const [u0,u1] of levels) for(const [v0,v1] of intervals(-h+w,h-w,walls)) out.push([u0,u1,v0,v1]);
  if(rpt) out.push([1.4+1.5,uw-1.4-1.5,-p+1.1,p-1.1]);   /* les deux barrettes */
  return out;
}
function sashChambers(F, rb, sd, rpt, ps){
  const h=sd/2, w=1.4, umax=F-rb, p=ps/2, out=[];
  if(umax<5) return out;
  const walls = rpt ? [[-p-w,p+w]] : (sd>30 ? [[-0.8,0.8]] : []);
  for(const [v0,v1] of intervals(-h+w,h-w,walls)) out.push([w,umax-w,v0,v1]);
  if(rpt) out.push([1.0+1.2,umax-1.0-1.2,-p+1,p-1]);
  return out;
}
function framePartsOf(prof, S, rpt){
  if(!rpt) return [{poly:prof.poly, mat:'alu'}];
  const s=splitRPT(prof.poly, S.pf, prof.uw, 1.4);
  return [{poly:s.ext,mat:'alu_ext'},{poly:s.mid,mat:'polyamide'},{poly:s.intr,mat:'alu'}].filter(x=>x.poly);
}

function buildCorner(o){
  const key = SYSTEMS[o.system] ? o.system : 'S90RP';
  const S = Object.assign({}, SYSTEMS[key], o.profile || {});
  if(S.c20 && o.noeud20) S.C=20;
  const levage = S.man==='levage' || (S.levageOpt && o.levage);
  if(levage && S.man!=='levage'){ S.man='levage'; S.seuil='levage'; }
  const ntr=o.tracks===3?3:2;
  if(ntr===3)S.D=Math.round(S.D*1.45);
  const rpt=S.pf>0, D=S.D, L=320;
  const lipT = S.cadre==='tubulaire'?4.5:LIPT;
  const span=D-2*lipT-6, pitch=span/ntr, tracks=Array.from({length:ntr},(_,i)=>-span/2+pitch*(i+.5));
  const sd=Math.min(S.sd,pitch-3), g=Math.min(S.g,sd-9), tp=Math.min(S.tp,g/3);
  const Fs = S.Fv+EMB, FsH = S.cacheH ? EMB+HID : Fs;
  const P={static:new Part(), leaves:[], wall:null}, st=P.static;
  const matExt = rpt ? 'alu_ext' : 'alu';
  const fr=frameProfile(S,tracks,'std');
  const sl= S.seuil==='std' ? fr : S.seuil==='encastre' ? frameProfile(S,tracks,'encastre',!!S.cacheH) : sillProfile(S,tracks);
  const mitred=S.joint==='onglet', sillMitre=mitred && S.seuil==='std';
  const mit=u=>u+0.2, cope=(u,v)=>extent([fr.poly],v)+0.05;
  const core=q=>q.mat==='polyamide'?st.get(q.mat):st.get('alu_core');
  /* dormant : montant gauche et seuil, scies net en bout */
  for(const q of framePartsOf(fr,S,rpt)) hollowSweep(st.get(q.mat),core(q),q.poly,frameChambers(S,fr,tracks,rpt),[0,L/2,0],Y,X,Z,L,sillMitre?mit:null,null);
  for(const q of framePartsOf(sl,S,rpt)) hollowSweep(st.get(q.mat),core(q),q.poly,frameChambers(S,sl,S.seuil==='std'?tracks:[],rpt),[L/2,0,0],X,Y,Z,L,sillMitre?mit:cope,null);
  if(S.seuil!=='std'){
    for(const zc of tracks){
      const e0=extent([fr.poly],zc);
      const rp=[[0,-2.2],[TR-1.5,-2.2],[TR,-1],[TR,1],[TR-1.5,2.2],[0,2.2]].map(q=>[q[0]+sl.uw,q[1]+zc]);
      sweep(st.get('inox'), rp, [(e0+L)/2,0,0], X, Y, Z, L-e0);
    }
  }
  if(S.seuil==='encastre' || o.drainage){
    const z0=-D/2-2, depth=170, top=S.Ff;
    grille(st, 0, L, z0, depth, o.drainage?2:top);
  }
  /* joints de levre sur le montant */
  for(const side of [-1,1]){
    const q=[[S.Ff-4.5,side*(D/2-lipT)-side*1.8],[S.Ff+1.4,side*(D/2-lipT)-side*1.8],
             [S.Ff+1.4,side*(D/2-lipT)-side*0.2],[S.Ff-4.5,side*(D/2-lipT)-side*0.2]];
    sweep(st.get('joint'), side<0?q:q.slice().reverse(), [0,(S.Ff+L)/2,0], Y, X, Z, L-S.Ff);
  }
  /* vantail interieur (celui qui coulisse le long du montant) */
  const zc=tracks[ntr-1];
  const xl=S.Ff-EMB, yb=sl.uw+TR+2;
  const FL=Fs, Fb=FsH+(S.seuil==='levage'?14:0), rbF=F=>Math.min(14,F-5);
  const xR=L-18, yT=L-18;
  const sashParts=F=>{
    const pr=sashProfile(S,F,sd,g,rbF(F),{parclose:S.parclose});
    const pw = rpt ? Math.min(S.ps,2*pr.gl-2) : 2*pr.gl-2;
    const sp=splitRPT(pr.poly,pw,F-rbF(F),rpt?1.0:0);
    return {pr,pw,parts:[{poly:sp.ext,mat:matExt},{poly:sp.mid,mat:rpt?'polyamide':'alu'},{poly:sp.intr,mat:'alu'}].filter(x=>x.poly)};
  };
  const Ls=sashParts(FL), Bs=sashParts(Fb);
  const mitV=mitred;
  for(const q of Ls.parts) hollowSweep(st.get(q.mat),core(q),q.poly,sashChambers(FL,rbF(FL),sd,rpt,Ls.pw),[xl,(yb+yT)/2,zc],Y,X,Z,yT-yb,mitV?mit:null,null);
  const copeL=(u,v)=>extent([Ls.pr.poly],v)+0.15;
  for(const q of Bs.parts) hollowSweep(st.get(q.mat),core(q),q.poly,sashChambers(Fb,rbF(Fb),sd,rpt,Bs.pw),[(xl+xR)/2,yb,zc],X,Y,Z,xR-xl,mitV?mit:copeL,null);
  /* double vitrage, scie avec le vantail */
  const gx0=xl+FL-rbF(FL)+1.5, gy0=yb+Fb-rbF(Fb)+1.5;
  const gw=xR-gx0, gh=yT-gy0;
  for(const s of (S.singleGlass?[0]:[-1,1])){
    const z=zc+s*(g/2-tp/2);
    box(st.get('verre'), [gx0+gw/2, gy0+gh/2, z], [gw, gh, S.singleGlass?g:tp]);
    /* chant vert du verre sur les faces sciees */
    box(st.get('verre_chant'), [xR+0.05, gy0+gh/2, z], [0.12, gh, (S.singleGlass?g:tp)-0.05]);
    box(st.get('verre_chant'), [gx0+gw/2, yT+0.05, z], [gw, 0.12, (S.singleGlass?g:tp)-0.05]);
  }
  const spH=16, spT=g-2*tp-0.4, spM=rpt?'intercalaire_noir':'intercalaire';
  if(!S.singleGlass){
    box(st.get(spM), [gx0+gw/2, gy0+spH/2, zc], [gw, spH, spT]);
    box(st.get(spM), [gx0+spH/2, gy0+spH+(gh-spH)/2, zc], [spH, gh-spH, spT]);
  }
  /* mastic de scellement (noir) sous l'intercalaire */
  box(st.get('joint'), [gx0+gw/2, gy0+1.5, zc], [gw, 3, spT]);
  box(st.get('joint'), [gx0+1.5, gy0+3+(gh-3)/2, zc], [3, gh-3, spT]);
  const vx0=xl+FL, vy0=yb+Fb;
  for(const s of [-1,1]){
    const z=zc+s*(g/2+1.25), b=3;
    box(st.get('joint'), [(vx0+xR)/2, vy0+b/2-0.6, z], [xR-vx0, b, 2.5]);
    box(st.get('joint'), [vx0+b/2-0.6, (vy0+yT)/2, z], [b, yT-vy0, 2.5]);
  }
  const anchors={corner:[0,0,0], meet:[L/2*MM,L/2*MM,0], sill:[0,0,0]};
  return {P,S,key,W:L,H:L,D,anchors,sd,g,rpt,levage,ntr,Fs,Fi:S.C/2,corner:true};
}

/* poignees, cote interieur. Renvoie la geometrie de la partie mobile
   (levier) dans un repere centre sur son pivot.                       */
function handleGeom(kind, part, x, y, z){
  const q=part.get('quinc');
  if(kind==='tirage'){      /* poignee de tirage : barre sur deux pieds */
    const L=340, e=L/2-34;
    for(const k of [-1,1]){
      prism(q, rrect(22,44,8,4), [x,y+k*e,z+1.5], X, Y, Z, 3);        /* embase */
      prism(q, circle(8,18), [x,y+k*e,z+18], X, Y, Z, 32);            /* pied */
    }
    prism(q, rrect(22,L,10,6), [x,y,z+42], X, Y, Z, 18);              /* prise */
    return null;
  }
  if(kind==='levage'){
    prism(q, rrect(40,270,9,5), [x,y,z+4], X, Y, Z, 8);
    prism(q, circle(17,24), [x,y+70,z+14], X, Y, Z, 14);
    const lever=new Mesh();
    prism(lever, rrect(27,330,12,6), [0,-150,36], X, Y, Z, 20);
    prism(lever, circle(14,20), [0,0,26], X, Y, Z, 8);
    prism(lever, rrect(31,70,13,6), [0,-280,40], X, Y, Z, 22);   /* prise */
    return {mesh:lever, pivot:[x,y+70,z], angle:Math.PI};
  }
  return null;
}

/* ================= export GLB ================= */
const s2l=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
function materialDefs(finish, finishExt, tint){
  const dark = (finish.lin[0]+finish.lin[1]+finish.lin[2])/3 < 0.08;
  const metal = finish.m>=0.5;
  const alu=(f,name)=>({name, pbrMetallicRoughness:{baseColorFactor:[...f.lin,1], metallicFactor:f.m, roughnessFactor:f.r},
    extensions:{KHR_materials_clearcoat:{clearcoatFactor: f.m>=0.5?0.12:0.45, clearcoatRoughnessFactor:0.28}}});
  const glass = {name:'verre', pbrMetallicRoughness:{baseColorFactor:[...tint.lin,1], metallicFactor:0, roughnessFactor:tint.r},
    extensions:{
      KHR_materials_transmission:{transmissionFactor:tint.tr},
      KHR_materials_ior:{ior:1.52},
      KHR_materials_volume:{thicknessFactor:0.006, attenuationColor:tint.att, attenuationDistance:tint.dist}
    }};
  if(tint.refl) glass.pbrMetallicRoughness.metallicFactor=tint.refl;
  return {
    alu: alu(finish,'alu'),
    alu_ext: alu(finishExt||finish,'alu_ext'),
    polyamide:{name:'polyamide', pbrMetallicRoughness:{baseColorFactor:[0.028,0.03,0.032,1],metallicFactor:0,roughnessFactor:0.62}},
    joint:{name:'joint', pbrMetallicRoughness:{baseColorFactor:[0.018,0.018,0.02,1],metallicFactor:0,roughnessFactor:0.82}},
    brosse:{name:'brosse', pbrMetallicRoughness:{baseColorFactor:[0.03,0.03,0.034,1],metallicFactor:0,roughnessFactor:1}},
    verre: glass,
    intercalaire:{name:'intercalaire', pbrMetallicRoughness:{baseColorFactor:[0.62,0.63,0.64,1],metallicFactor:0.9,roughnessFactor:0.38}},
    intercalaire_noir:{name:'intercalaire_noir', pbrMetallicRoughness:{baseColorFactor:[0.03,0.03,0.035,1],metallicFactor:0,roughnessFactor:0.55}},
    chambre:{name:'chambre', pbrMetallicRoughness:{baseColorFactor:[0.05,0.05,0.052,1],metallicFactor:0.3,roughnessFactor:0.75}},
    alu_core:{name:'alu_core', pbrMetallicRoughness:{baseColorFactor:[0.55,0.58,0.60,1],metallicFactor:0.85,roughnessFactor:0.4}},
    verre_chant:{name:'verre_chant', pbrMetallicRoughness:{baseColorFactor:[0.16,0.36,0.30,1],metallicFactor:0,roughnessFactor:0.15}},
    inox:{name:'inox', pbrMetallicRoughness:{baseColorFactor:[0.66,0.66,0.67,1],metallicFactor:1,roughnessFactor:0.24}},
    quinc: dark ? {name:'quinc', pbrMetallicRoughness:{baseColorFactor:[0.022,0.022,0.024,1],metallicFactor:0.2,roughnessFactor:0.38},
                   extensions:{KHR_materials_clearcoat:{clearcoatFactor:0.6,clearcoatRoughnessFactor:0.2}}}
                : (metal ? {name:'quinc', pbrMetallicRoughness:{baseColorFactor:[0.75,0.75,0.76,1],metallicFactor:1,roughnessFactor:0.3}}
                         : {name:'quinc', pbrMetallicRoughness:{baseColorFactor:[...finish.lin,1],metallicFactor:finish.m,roughnessFactor:Math.max(0.25,finish.r-0.12)},
                            extensions:{KHR_materials_clearcoat:{clearcoatFactor:0.6,clearcoatRoughnessFactor:0.2}}}),
    mur:{name:'mur', pbrMetallicRoughness:{baseColorFactor:[0.80,0.77,0.72,1],metallicFactor:0,roughnessFactor:0.92}},
    sol:{name:'sol', pbrMetallicRoughness:{baseColorFactor:[0.55,0.50,0.44,1],metallicFactor:0,roughnessFactor:0.35}},
    terrasse:{name:'terrasse', pbrMetallicRoughness:{baseColorFactor:[0.33,0.32,0.30,1],metallicFactor:0,roughnessFactor:0.85}},
  };
}

function toGLB(B, finish, finishExt, tint, opening){
  const defs=materialDefs(finish, finishExt, tint);
  /* seulement les matieres reellement employees : <model-viewer> refuse
     qu'on regle une matiere qu'aucune piece n'utilise (ex. alu_ext sur
     un profil sans rupture de pont thermique)                          */
  const usedMats=new Set();
  const note=m=>{ for(const k of Object.keys(m)) if(m[k].pos.length) usedMats.add(k); };
  note(B.P.static.m); if(B.P.wall) note(B.P.wall.m);
  for(const lf of B.P.leaves){ note(lf.m); if(lf.handle) usedMats.add('quinc'); }
  const matNames=Object.keys(defs).filter(k=>usedMats.has(k)), materials=matNames.map(k=>defs[k]);
  const accessors=[], bufferViews=[], chunks=[], meshes=[], nodes=[], animations=[];
  let offset=0;
  const pushBuf=(typed,target)=>{
    const bytes=new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    while(offset%4){chunks.push(new Uint8Array([0]));offset++;}
    const v={buffer:0,byteOffset:offset,byteLength:bytes.length}; if(target) v.target=target;
    bufferViews.push(v); chunks.push(bytes); offset+=bytes.length; return bufferViews.length-1; };
  const acc=(bv,type,comp,count,min,max)=>{
    const a={bufferView:bv,componentType:comp,count,type}; if(min){a.min=min;a.max=max;}
    accessors.push(a); return accessors.length-1; };
  /* mm -> m, et centrage sur l'origine (offset) */
  const meshFrom=(byMat, off)=>{
    const prims=[];
    for(const name of Object.keys(byMat)){
      const m=byMat[name]; if(!m.pos.length) continue;
      const n=m.pos.length/3, pos=new Float32Array(n*3);
      let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
      for(let i=0;i<n;i++)for(let k=0;k<3;k++){
        const v=(m.pos[i*3+k]-off[k])*MM; pos[i*3+k]=v; if(v<mn[k])mn[k]=v; if(v>mx[k])mx[k]=v; }
      const pa=acc(pushBuf(pos,34962),'VEC3',5126,n,mn,mx);
      const na=acc(pushBuf(new Float32Array(m.nrm),34962),'VEC3',5126,n);
      const ia=acc(pushBuf(new Uint32Array(m.idx),34963),'SCALAR',5125,m.idx.length);
      prims.push({attributes:{POSITION:pa,NORMAL:na}, indices:ia, material:matNames.indexOf(name)});
    }
    if(!prims.length) return -1;
    meshes.push({primitives:prims}); return meshes.length-1;
  };
  const rootChildren=[];
  const addNode=(nd)=>{ nodes.push(nd); return nodes.length-1; };
  const sm=meshFrom(B.P.static.m,[0,0,0]); if(sm>=0) rootChildren.push(addNode({name:'dormant',mesh:sm}));
  if(B.P.wall){ const wm=meshFrom(B.P.wall.m,[0,0,0]); rootChildren.push(addNode({name:'mur',mesh:wm})); }

  const anim={name:'ouvrir', samplers:[], channels:[]};
  const animBack={name:'fermer', samplers:[], channels:[]};
  const DUR=2.4, NS=36;
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const keyTimes=[]; for(let i=0;i<=NS;i++) keyTimes.push(i/NS*DUR);
  const timeAcc=acc(pushBuf(new Float32Array(keyTimes)),'SCALAR',5126,keyTimes.length,[0],[DUR]);
  const lift = B.levage ? 6 : 0;              /* le vantail se souleve (mm) */
  B.P.leaves.forEach((lf,i)=>{
    const mi=meshFrom(lf.m,[0,0,0]);
    const T = lf.travel ? lf.travel*MM : 0;
    const nd={name:'vantail'+(i+1), mesh:mi};
    if(T) nd.translation=[opening?T:0, 0, 0];
    const ni=addNode(nd); rootChildren.push(ni);
    if(lf.handle){
      const h=lf.handle, rot=!!T;
      const hm=meshFrom({quinc:h.mesh},[0,0,0]);
      const piv=h.pivot.map(v=>v*MM);
      const qOpen=[0,0,Math.sin(h.angle/2),Math.cos(h.angle/2)];
      const hn=addNode({name:'poignee', mesh:hm, translation:piv, rotation: (opening&&rot)? qOpen:[0,0,0,1]});
      (nodes[ni].children=nodes[ni].children||[]).push(hn);
      /* rotation : premier quart du temps (vantail qui s'ouvre seulement) */
      if(rot){
      const rotKeys=[], rotBack=[];
      for(const t of keyTimes){ const k=ease(Math.min(1,t/(DUR*0.28)));
        const a=h.angle*k; rotKeys.push(0,0,Math.sin(a/2),Math.cos(a/2));
        const kb=ease(Math.max(0,(t-DUR*0.72)/(DUR*0.28))); const b=h.angle*(1-kb);
        rotBack.push(0,0,Math.sin(b/2),Math.cos(b/2)); }
      const ra=acc(pushBuf(new Float32Array(rotKeys)),'VEC4',5126,keyTimes.length);
      const rb=acc(pushBuf(new Float32Array(rotBack)),'VEC4',5126,keyTimes.length);
      anim.samplers.push({input:timeAcc,output:ra,interpolation:'LINEAR'});
      anim.channels.push({sampler:anim.samplers.length-1,target:{node:hn,path:'rotation'}});
      animBack.samplers.push({input:timeAcc,output:rb,interpolation:'LINEAR'});
      animBack.channels.push({sampler:animBack.samplers.length-1,target:{node:hn,path:'rotation'}});
      }
    }
    if(T){
      const tr=[], trb=[];
      for(const t of keyTimes){
        /* levage (0-30 %), glissement (30-100 %) */
        const u=t/DUR, up=lift?Math.min(1,u/0.3):0, sl=ease(Math.max(0,(u-0.3)/0.7));
        tr.push(T*sl, up*lift*MM, 0);
        const sb=ease(Math.min(1,u/0.7)), down=lift?Math.min(1,Math.max(0,(u-0.7)/0.3)):1;
        trb.push(T*(1-sb), (1-down)*lift*MM, 0);
      }
      const ta=acc(pushBuf(new Float32Array(tr)),'VEC3',5126,keyTimes.length);
      const tb=acc(pushBuf(new Float32Array(trb)),'VEC3',5126,keyTimes.length);
      anim.samplers.push({input:timeAcc,output:ta,interpolation:'LINEAR'});
      anim.channels.push({sampler:anim.samplers.length-1,target:{node:ni,path:'translation'}});
      animBack.samplers.push({input:timeAcc,output:tb,interpolation:'LINEAR'});
      animBack.channels.push({sampler:animBack.samplers.length-1,target:{node:ni,path:'translation'}});
    }
  });
  if(anim.channels.length) animations.push(anim, animBack);
  const root={name:'baie', children:rootChildren};
  nodes.push(root);
  let total=0; for(const c of chunks) total+=c.length;
  const used=new Set(); for(const m of materials) for(const k of Object.keys(m.extensions||{})) used.add(k);
  const gltf={asset:{version:'2.0',generator:'prompolu-coulissant'},
    extensionsUsed:[...used],
    scene:0, scenes:[{nodes:[nodes.length-1]}], nodes, meshes, materials, accessors, bufferViews,
    buffers:[{byteLength:total}]};
  if(animations.length) gltf.animations=animations;
  const json=new TextEncoder().encode(JSON.stringify(gltf));
  const jp=(4-json.length%4)%4;
  const jc=new Uint8Array(json.length+jp); jc.set(json); jc.fill(0x20,json.length);
  const bp=(4-total%4)%4, binLen=total+bp;
  const out=new Uint8Array(12+8+jc.length+8+binLen);
  const dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546C67,true);dv.setUint32(4,2,true);dv.setUint32(8,out.length,true);
  dv.setUint32(12,jc.length,true);dv.setUint32(16,0x4E4F534A,true);
  out.set(jc,20);
  let p=20+jc.length;
  dv.setUint32(p,binLen,true);dv.setUint32(p+4,0x004E4942,true);
  p+=8; for(const c of chunks){out.set(c,p);p+=c.length;}
  return new Blob([out],{type:'model/gltf-binary'});
}

global.Coulissant = {
  SYSTEMS, NAMES, AR_FAMILY, build, buildCorner,
  label: k => NAMES[k] || k,
  /* capacite par vantail (fiche STRUGAL) ; null = non publiee */
  capacity(k, levage){
    const S = SYSTEMS[k] || SYSTEMS.S90RP;
    return (levage && S.levCap) ? S.levCap : {vmax:S.vmax, kg:S.kg};
  },
  /* systeme dont le fichier statique sert a Scene Viewer */
  arFamily: k => AR_FAMILY[k] || 'S90RP',
  /* largeur de vantail et passages libres, sans fabriquer le GLB */
  stats(opts){
    const B = build(Object.assign({}, opts, {coupe:false, context:false}));
    return {leafW:B.leafW, opens:B.opens, D:B.D, levage:B.levage};
  },
  make(opts, finish, finishExt, tint){
    const B = opts.coupe ? buildCorner(opts) : build(opts);
    const blob = toGLB(B, finish, finishExt, tint, opts.opening);
    return {url:URL.createObjectURL(blob), size:blob.size, info:B};
  },
};
})(window);
