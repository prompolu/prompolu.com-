/* =====================================================================
 *  Generateur 3D du configurateur : pergola bioclimatique.
 *  Fichier autonome : la boite a outils (kit3d) est incluse ci-dessous,
 *  suivie du generateur. Aucune dependance, rien de partage avec les
 *  autres pages : une evolution ici ne peut rien casser ailleurs.
 * ===================================================================== */
/* =====================================================================
 *  kit3d.js — boite a outils commune aux generateurs detailles
 *  (pergola, garde-corps, battant). Reprise du generateur coulissant en
 *  ligne : sections 2D extrudees, coupes d'onglet, matieres PBR, glTF
 *  binaire avec arbre de noeuds et animations.
 *
 *  Unites : millimetres en interne, metres dans le fichier glTF.
 *  Repere : x largeur, y hauteur, z profondeur (+z = interieur / face vue).
 * ===================================================================== */
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
const norm=a=>{const L=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/L,a[1]/L,a[2]/L];};
const X=[1,0,0], Y=[0,1,0], Z=[0,0,1], NX=[-1,0,0], NY=[0,-1,0], NZ=[0,0,-1];
/* rotation d'un vecteur autour d'un axe unitaire (Rodrigues) */
function rot(v, k, a){
  const c=Math.cos(a), s=Math.sin(a);
  return add(add(sc(v,c), sc(cross(k,v),s)), sc(k, dot(k,v)*(1-c)));
}
const quat=(k,a)=>{ const s=Math.sin(a/2); return [k[0]*s,k[1]*s,k[2]*s,Math.cos(a/2)]; };

/* ---------------- maillages ---------------- */
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
  const n=cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]));
  if(dot(n,want)<0) pts=pts.slice().reverse();
  const w=norm(want), base=this.pos.length/3;
  for(const p of pts){ this.pos.push(p[0],p[1],p[2]); this.nrm.push(w[0],w[1],w[2]); }
  for(let i=1;i<pts.length-1;i++) this.idx.push(base,base+i,base+i+1);
};
/* surface lisse : bande de quads a normales partagees (tubes, galbes) */
Mesh.prototype.smoothStrip=function(rings, normals){
  /* rings[k][i] : point i de l'anneau k ; normals idem */
  const base=this.pos.length/3, n=rings[0].length;
  for(let k=0;k<rings.length;k++) for(let i=0;i<n;i++){
    const p=rings[k][i], q=normals[k][i];
    this.pos.push(p[0],p[1],p[2]); this.nrm.push(q[0],q[1],q[2]);
  }
  for(let k=0;k<rings.length-1;k++) for(let i=0;i<n;i++){
    const j=(i+1)%n, a=base+k*n+i, b=base+k*n+j, c=base+(k+1)*n+j, d=base+(k+1)*n+i;
    this.idx.push(a,b,c, a,c,d);
  }
};
Mesh.prototype.offset=function(o){ for(let i=0;i<this.pos.length;i+=3){ this.pos[i]-=o[0]; this.pos[i+1]-=o[1]; this.pos[i+2]-=o[2]; } };
function Part(){ this.m={}; }
Part.prototype.get=function(mat){ return this.m[mat] || (this.m[mat]=new Mesh()); };
Part.prototype.offset=function(o){ for(const k in this.m) this.m[k].offset(o); };

/* noeud glTF : piece + transformation + animations (pistes echantillonnees) */
function Node(name){
  this.name=name; this.part=new Part(); this.t=[0,0,0]; this.r=[0,0,0,1]; this.s=[1,1,1];
  this.children=[]; this.tracks={};
}
Node.prototype.add=function(n){ this.children.push(n); return n; };

/* ---------------- polygones 2D ---------------- */
function area2(p){ let a=0; for(let i=0;i<p.length;i++){const j=(i+1)%p.length;
  a+=p[i][0]*p[j][1]-p[j][0]*p[i][1];} return a/2; }
function clip(poly,a,b,c){
  const out=[], f=p=>a*p[0]+b*p[1]+c;
  for(let i=0;i<poly.length;i++){
    const P=poly[i], Q=poly[(i+1)%poly.length], fp=f(P), fq=f(Q);
    if(fp>=0) out.push(P);
    if((fp>=0)!==(fq>=0)){ const t=fp/(fp-fq); out.push([P[0]+(Q[0]-P[0])*t, P[1]+(Q[1]-P[1])*t]); }
  }
  const r=[]; for(const p of out){ const q=r[r.length-1];
    if(!q || Math.abs(q[0]-p[0])>1e-9 || Math.abs(q[1]-p[1])>1e-9) r.push(p); }
  if(r.length>2){ const a0=r[0], z=r[r.length-1];
    if(Math.abs(a0[0]-z[0])<1e-9 && Math.abs(a0[1]-z[1])<1e-9) r.pop(); }
  return r.length>=3 && Math.abs(area2(r))>1e-12 ? r : null;
}
/* largeur de matiere (u max) d'un profil a la profondeur v */
function extent(polys,v){
  let best=0;
  for(const p of polys) for(let i=0;i<p.length;i++){
    const A=p[i], B=p[(i+1)%p.length];
    const lo=Math.min(A[1],B[1]), hi=Math.max(A[1],B[1]);
    if(v<lo-1e-9||v>hi+1e-9) continue;
    const u = Math.abs(B[1]-A[1])<1e-12 ? Math.max(A[0],B[0]) : A[0]+(B[0]-A[0])*(v-A[1])/(B[1]-A[1]);
    if(u>best) best=u;
  }
  return best;
}
/* decoupe d'une section en coquille ext. / barrette / coquille int. */
function splitRPT(poly, pw, umax, rec){
  const p=pw/2;
  const ext=clip(poly,0,-1,-p), intr=clip(poly,0,1,-p);
  let mid=clip(clip(poly,0,1,p),0,-1,p);
  if(mid && rec){ mid=clip(mid,1,0,-rec); if(mid) mid=clip(mid,-1,0,umax-rec); }
  return {ext, mid, intr};
}
function rrect(w,h,r,seg){
  r=Math.max(0,Math.min(r,w/2-1e-6,h/2-1e-6)); seg=seg||4; const p=[];
  if(r<1e-6) return [[w/2,h/2],[-w/2,h/2],[-w/2,-h/2],[w/2,-h/2]];
  const C=[[w/2-r,h/2-r,0],[-w/2+r,h/2-r,1],[-w/2+r,-h/2+r,2],[w/2-r,-h/2+r,3]];
  for(const [cx,cy,q] of C) for(let i=0;i<=seg;i++){ const a=(q+i/seg)*Math.PI/2;
    p.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); }
  return p;
}
function circle(r,seg){ const p=[]; for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2; p.push([r*Math.cos(a),r*Math.sin(a)]);} return p; }
const shift=(poly,du,dv)=>poly.map(q=>[q[0]+du,q[1]+dv]);
const mirrorV=poly=>poly.map(q=>[q[0],-q[1]]).reverse();

/* Extrusion d'un polygone (u,v) le long de t, base (t,n,e) :
   P = O + t*s + n*u + e*v, s de -L/2+cutA(u,v) a L/2-cutB(u,v).       */
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
/* extrusion lisse : sommets partages, normales moyennees (profils galbes,
   lames d'aile) ; bien plus legere que sweep()                        */
function sweepSmooth(mesh, poly, O, t, n, e, L, caps){
  const ccw=area2(poly)>0, N=poly.length, en=[];
  for(let i=0;i<N;i++){ const j=(i+1)%N, du=poly[j][0]-poly[i][0], dv=poly[j][1]-poly[i][1];
    const l=Math.hypot(du,dv)||1; en.push(ccw?[dv/l,-du/l]:[-dv/l,du/l]); }
  const P=(i,s)=>add(add(add(O,sc(t,s)),sc(n,poly[i][0])),sc(e,poly[i][1]));
  const base=mesh.pos.length/3;
  for(const k of [-1,1]) for(let i=0;i<N;i++){
    const a=en[(i+N-1)%N], b=en[i], v=norm(add(sc(n,a[0]+b[0]),sc(e,a[1]+b[1]))), p=P(i,k*L/2);
    mesh.pos.push(p[0],p[1],p[2]); mesh.nrm.push(v[0],v[1],v[2]);
  }
  /* orientation des quads d'apres la normale du premier sommet */
  const A=P(0,-L/2), B=P(1,-L/2), Cc=P(1,L/2), o=add(sc(n,en[0][0]),sc(e,en[0][1]));
  const flip = dot(cross(sub(B,A),sub(Cc,A)),o)<0;
  for(let i=0;i<N;i++){ const j=(i+1)%N, a=base+i, b=base+j, c=base+N+j, d=base+N+i;
    if(flip) mesh.idx.push(a,c,b, a,d,c); else mesh.idx.push(a,b,c, a,c,d); }
  if(caps===false) return;
  const flat=[]; for(const q of poly) flat.push(q[0],q[1]);
  const T=earcut(flat);
  for(const k of [-1,1]){
    const cb=mesh.pos.length/3, w=sc(t,k);
    for(let i=0;i<N;i++){ const p=P(i,k*L/2); mesh.pos.push(p[0],p[1],p[2]); mesh.nrm.push(w[0],w[1],w[2]); }
    for(let m=0;m<T.length;m+=3){
      const a=P(T[m],0), b=P(T[m+1],0), c=P(T[m+2],0);
      const ok=dot(cross(sub(b,a),sub(c,a)),w)>=0;
      if(ok) mesh.idx.push(cb+T[m],cb+T[m+1],cb+T[m+2]); else mesh.idx.push(cb+T[m],cb+T[m+2],cb+T[m+1]);
    }
  }
}
function prism(mesh, poly, C, a, b, t, len){ sweep(mesh, poly, C, t, a, b, len, null, null, true); }
function box(mesh, c, s){
  prism(mesh, [[-s[0]/2,-s[1]/2],[s[0]/2,-s[1]/2],[s[0]/2,s[1]/2],[-s[0]/2,s[1]/2]], c, X, Y, Z, s[2]);
}
/* boite orientee : axes a (largeur sa), b (hauteur sb), t (longueur st) */
function obox(mesh, c, a, b, t, sa, sb, st){
  prism(mesh, [[-sa/2,-sb/2],[sa/2,-sb/2],[sa/2,sb/2],[-sa/2,sb/2]], c, a, b, t, st);
}
/* cylindre lisse (normales partagees), axe t, rayon r */
function cyl(mesh, C, t, r, len, seg, caps){
  seg=seg||20; t=norm(t);
  const a=norm(Math.abs(t[1])<0.9 ? cross(t,Y) : cross(t,X)), b=cross(t,a);
  const rings=[[],[]], nr=[[],[]];
  for(let k=0;k<2;k++){
    const c=add(C, sc(t,(k?1:-1)*len/2));
    for(let i=0;i<seg;i++){ const ang=i/seg*Math.PI*2, d=add(sc(a,Math.cos(ang)),sc(b,Math.sin(ang)));
      rings[k].push(add(c,sc(d,r))); nr[k].push(d); }
  }
  mesh.smoothStrip(rings, nr);
  if(caps!==false) for(const k of [0,1]) mesh.flat(rings[k], sc(t,k?1:-1));
}
/* tube a section quelconque le long d'un chemin polyligne (coudes en
   onglet), normales lisses autour de la section si smooth             */
function pipe(mesh, sec, path, up, smooth){
  const rings=[], nrs=[];
  for(let k=0;k<path.length;k++){
    const pv=path[Math.max(0,k-1)], nx=path[Math.min(path.length-1,k+1)];
    const tt=norm(sub(nx,pv));
    const a=norm(cross(up,tt)), b=cross(tt,a);
    let scale=1;
    if(k>0 && k<path.length-1){
      const t1=norm(sub(path[k],path[k-1])), t2=norm(sub(path[k+1],path[k]));
      scale=1/Math.max(0.35, Math.cos(Math.acos(Math.max(-1,Math.min(1,dot(t1,t2))))/2));
    }
    const ring=[], nr=[];
    for(const q of sec){ ring.push(add(path[k], add(sc(a,q[0]*scale), sc(b,q[1])))); }
    for(let i=0;i<sec.length;i++){ const q=sec[i]; nr.push(norm(add(sc(a,q[0]),sc(b,q[1])))); }
    rings.push(ring); nrs.push(nr);
  }
  mesh.smoothStrip(rings, nrs);
  const t0=norm(sub(path[0],path[1])), t1=norm(sub(path[path.length-1],path[path.length-2]));
  mesh.flat(rings[0], t0); mesh.flat(rings[rings.length-1], t1);
}

/* ---------------- matieres ---------------- */
const s2l=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const hexLin=h=>[1,3,5].map(i=>s2l(parseInt(h.substr(i,2),16)/255));
/* finish : {lin,m,r}; tint : verre physique {lin,r,tr,att,dist,refl} */
function materials(o){
  const fin=o.finish, ext=o.finishExt||fin, tint=o.tint||{lin:[0.97,0.99,0.98],r:0.02,tr:0.96,att:[0.8,0.93,0.88],dist:0.045};
  const dark=(fin.lin[0]+fin.lin[1]+fin.lin[2])/3<0.08, metal=fin.m>=0.5;
  const alu=(f,name)=>({name, pbrMetallicRoughness:{baseColorFactor:[...f.lin,1], metallicFactor:f.m, roughnessFactor:f.r},
    extensions:{KHR_materials_clearcoat:{clearcoatFactor:f.m>=0.5?0.12:0.45, clearcoatRoughnessFactor:0.28}}});
  const pbr=(name,c,m,r,extra)=>Object.assign({name, pbrMetallicRoughness:{baseColorFactor:c.length===4?c:[...c,1],metallicFactor:m,roughnessFactor:r}},extra||{});
  const glass={name:'verre', pbrMetallicRoughness:{baseColorFactor:[...tint.lin,1], metallicFactor:tint.refl||0, roughnessFactor:tint.r},
    extensions:{KHR_materials_transmission:{transmissionFactor:tint.tr}, KHR_materials_ior:{ior:1.52},
      KHR_materials_volume:{thicknessFactor:0.006, attenuationColor:tint.att, attenuationDistance:tint.dist}}};
  const groove=fin.lin.map(v=>v*0.32+0.004);
  const led = o.ledOn
    ? pbr('led',[1,0.96,0.88],0,0.3,{emissiveFactor:[1,0.92,0.78], extensions:{KHR_materials_emissive_strength:{emissiveStrength:6}}})
    : pbr('led',[0.85,0.85,0.82],0,0.35,{extensions:{KHR_materials_transmission:{transmissionFactor:0.3}}});
  return {
    alu:alu(fin,'alu'), alu_ext:alu(ext,'alu_ext'),
    panneau:Object.assign(alu(fin,'panneau'),{}),
    rainure:pbr('rainure',groove,Math.min(0.4,fin.m),Math.min(1,fin.r+0.25)),
    polyamide:pbr('polyamide',[0.028,0.03,0.032],0,0.62),
    joint:pbr('joint',[0.018,0.018,0.02],0,0.82),
    brosse:pbr('brosse',[0.03,0.03,0.034],0,1),
    chambre:pbr('chambre',[0.05,0.05,0.052],0.3,0.75),
    verre:glass,
    verre_chant:pbr('verre_chant',[0.16,0.36,0.30],0,0.15),
    pvb:pbr('pvb',[0.80,0.84,0.82],0,0.4),
    intercalaire:pbr('intercalaire',[0.62,0.63,0.64],0.9,0.38),
    intercalaire_noir:pbr('intercalaire_noir',[0.03,0.03,0.035],0,0.55),
    inox:pbr('inox',[0.66,0.66,0.67],1,0.22),
    chrome:pbr('chrome',[0.8,0.8,0.82],1,0.08),
    quinc: dark ? pbr('quinc',[0.022,0.022,0.024],0.2,0.38,{extensions:{KHR_materials_clearcoat:{clearcoatFactor:0.6,clearcoatRoughnessFactor:0.2}}})
         : (metal ? pbr('quinc',[0.75,0.75,0.76],1,0.3)
                  : pbr('quinc',fin.lin,fin.m,Math.max(0.25,fin.r-0.12),{extensions:{KHR_materials_clearcoat:{clearcoatFactor:0.6,clearcoatRoughnessFactor:0.2}}})),
    led,
    vis:pbr('vis',[0.55,0.55,0.56],1,0.35),
    mur:pbr('mur',[0.80,0.77,0.72],0,0.92),
    sol:pbr('sol',[0.55,0.50,0.44],0,0.35),
    joint_sol:pbr('joint_sol',[0.36,0.33,0.30],0,0.9),
    terrasse:pbr('terrasse',[0.33,0.32,0.30],0,0.85),
    beton:pbr('beton',[0.58,0.57,0.55],0,0.9),
    gazon:pbr('gazon',[0.045,0.075,0.028],0,0.95),
  };
}

/* ---------------- export GLB ----------------
   roots : noeuds de premier niveau. anims : {nom: duree en s}. Chaque
   noeud porte ses pistes : node.tracks[nom] = {rotation|translation:
   [valeurs par cle]} echantillonnees sur NS+1 cles regulieres.       */
function toGLB(roots, defs, anims){
  anims=anims||{};
  const usedMats=new Set();
  const walk=(n,f)=>{ f(n); for(const c of n.children) walk(c,f); };
  for(const r of roots) walk(r, n=>{ for(const k in n.part.m) if(n.part.m[k].pos.length) usedMats.add(k); });
  const matNames=Object.keys(defs).filter(k=>usedMats.has(k));
  const materialsArr=matNames.map(k=>defs[k]);
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
  const meshFrom=(byMat)=>{
    const prims=[];
    for(const name of Object.keys(byMat)){
      const m=byMat[name]; if(!m.pos.length) continue;
      const n=m.pos.length/3, pos=new Float32Array(n*3);
      const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
      for(let i=0;i<n;i++)for(let k=0;k<3;k++){
        const v=m.pos[i*3+k]*MM; pos[i*3+k]=v; if(v<mn[k])mn[k]=v; if(v>mx[k])mx[k]=v; }
      const pa=acc(pushBuf(pos,34962),'VEC3',5126,n,mn,mx);
      const na=acc(pushBuf(new Float32Array(m.nrm),34962),'VEC3',5126,n);
      const ia=acc(pushBuf(new Uint32Array(m.idx),34963),'SCALAR',5125,m.idx.length);
      prims.push({attributes:{POSITION:pa,NORMAL:na}, indices:ia, material:matNames.indexOf(name)});
    }
    if(!prims.length) return -1;
    meshes.push({primitives:prims}); return meshes.length-1;
  };
  const chans={};               /* nom -> [{node, path, values}] */
  const emit=(n)=>{
    const nd={name:n.name};
    const mi=meshFrom(n.part.m); if(mi>=0) nd.mesh=mi;
    if(n.t[0]||n.t[1]||n.t[2]) nd.translation=n.t.map(v=>v*MM);
    if(n.r[0]||n.r[1]||n.r[2]) nd.rotation=n.r;
    if(n.s[0]!==1||n.s[1]!==1||n.s[2]!==1) nd.scale=n.s;
    const kids=n.children.map(emit);
    if(kids.length) nd.children=kids;
    nodes.push(nd); const idx=nodes.length-1;
    for(const name in n.tracks){
      const tr=n.tracks[name];
      for(const path of ['rotation','translation','scale']) if(tr[path])
        (chans[name]=chans[name]||[]).push({node:idx, path, values: path==='translation'? tr[path].map(v=>v*MM) : tr[path]});
    }
    return idx;
  };
  const rootIdx=roots.map(emit);
  for(const name in chans){
    const list=chans[name], dur=anims[name]||2.4;
    const nk=list[0].values.length/(list[0].path==='rotation'?4:3);
    const times=[]; for(let i=0;i<nk;i++) times.push(i/(nk-1)*dur);
    const ta=acc(pushBuf(new Float32Array(times)),'SCALAR',5126,nk,[0],[dur]);
    const A={name, samplers:[], channels:[]};
    for(const c of list){
      const out=acc(pushBuf(new Float32Array(c.values)), c.path==='rotation'?'VEC4':'VEC3', 5126, nk);
      A.samplers.push({input:ta, output:out, interpolation:'LINEAR'});
      A.channels.push({sampler:A.samplers.length-1, target:{node:c.node, path:c.path}});
    }
    animations.push(A);
  }
  let total=0; for(const c of chunks) total+=c.length;
  const ext=new Set(); for(const m of materialsArr) for(const k of Object.keys(m.extensions||{})) ext.add(k);
  const gltf={asset:{version:'2.0',generator:'prompolu-kit3d'}, scene:0,
    scenes:[{nodes:rootIdx}], nodes, meshes, materials:materialsArr, accessors, bufferViews,
    buffers:[{byteLength:total}]};
  if(ext.size) gltf.extensionsUsed=[...ext];
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
/* courbe d'animation : n+1 cles, f(u) pour u de 0 a 1 */
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function keys(n, f){ const out=[]; for(let i=0;i<=n;i++){ const v=f(i/n); for(const x of v) out.push(x); } return out; }

/* compte de triangles et sommets invalides : pour les tests */
function stats(roots){
  let tris=0, bad=0;
  const walk=n=>{ for(const k in n.part.m){ const m=n.part.m[k]; tris+=m.idx.length/3;
      for(const v of m.pos) if(!Number.isFinite(v)) bad++; } n.children.forEach(walk); };
  roots.forEach(walk); return {tris, bad};
}

global.K3 = { MM, earcut, add, sub, sc, dot, cross, norm, rot, quat, X, Y, Z, NX, NY, NZ,
  Mesh, Part, Node, area2, clip, extent, splitRPT, rrect, circle, shift, mirrorV,
  sweep, sweepSmooth, prism, box, obox, cyl, pipe, s2l, hexLin, materials, toGLB, ease, keys, stats };
})(typeof window!=='undefined'?window:globalThis);

/* =====================================================================
 *  pergola-detail.js — pergola bioclimatique a lames orientables.
 *
 *  Reference de forme : Gaviota Climatika (montants 160 x 160, lames
 *  a joint EPDM, gouttiere integree, eau evacuee par les poteaux).
 *  Details : poteaux a rainures, platine et cache-platine, sortie d'eau
 *  au pied du poteau ; bandeaux a gouttiere integree, rainure de facade
 *  et canal LED, coupes d'onglet ; lames profilees (bord d'attaque
 *  arrondi, larmier, joint EPDM) avec embouts, axes et manivelles ;
 *  bielle de manoeuvre qui suit l'angle ; LED dans les bandeaux.
 *  Animation des lames entre fermees, inclinees et ouvertes.
 *  Repere : x largeur (longueur des lames), y hauteur, z avancee.
 * ===================================================================== */
(function (global) {
'use strict';
const K = global.K3;
const {X,Y,Z,NX,NY,NZ,Node,sweep,sweepSmooth,prism,box,cyl,rrect,quat,ease,keys} = K;
const PI=Math.PI, DEG=PI/180, SEAM=0.2;
const POST=160, BEAM_H=200, CHORD=200, NS=16;
const ANGLES={closed:2, mid:38, open:88};

/* poteau 160 x 160 : angles arrondis, deux rainures par face */
function postSection(){
  const h=POST/2, r=6, p=[];
  const face=(pts)=>{ for(const q of pts) p.push(q); };
  for(let k=0;k<4;k++){
    const a0=k*PI/2, c=Math.cos(a0), s=Math.sin(a0);
    const R=(x,y)=>[x*c-y*s, x*s+y*c];
    /* face orientee vers +x dans le repere tourne : de y=-h+r a y=h-r */
    const pts=[R(h,-h+r)];
    for(const g of [-50,50]) pts.push(R(h,g-3),R(h-2,g-1.5),R(h-2,g+1.5),R(h,g+3));
    pts.push(R(h,h-r));
    for(let i=1;i<4;i++){ const a=i/4*PI/2; pts.push(R(h-r+r*Math.cos(a), h-r+r*Math.sin(a))); }
    face(pts);
  }
  return p;
}
/* bandeau a gouttiere integree (u : depuis la face exterieure vers
   l'interieur ; v : depuis le dessous)                              */
function beamSection(){
  return [[0,4],[4,0],[128,0],[128,9],[150,9],[150,0],[156,0],[160,4],[160,150],[158,152],
          [150,152],[150,122],[146,118],[48,118],[44,122],[44,196],[40,200],[4,200],[0,196],
          [0,63],[1.6,61.5],[0,60],[0,4]].slice(0,-1);
}
/* lame : profil d'aile, larmier au bord de fuite (z local), axe a l'origine */
function bladeSection(){
  const c=CHORD/2, top=[], bot=[];
  for(let i=0;i<=12;i++){ const z=-c+CHORD*i/12, t=Math.cos(PI/2*z/c);
    top.push([z, 4+13*t]); bot.push([z, -4-6*t]); }
  const p=[[-c-3,0]];
  for(const q of bot) p.push(q);          /* dessous, d'avant en arriere */
  p.push([c+4,-6],[c+4,2]);               /* larmier */
  for(let i=top.length-1;i>=0;i--) p.push(top[i]);
  return p;
}

function build(o){
  const W=o.width*1000, D=o.depth*1000, Ht=(o.height||2.6)*1000;
  const slat=ANGLES[o.slat]!==undefined?o.slat:'mid';
  const root=new Node('pergola'), st=root.part, alu=st.get('alu');
  const postH=Ht-BEAM_H, hx=W/2-POST/2, hz=D/2-POST/2;

  /* ---------- poteaux ---------- */
  const ps=postSection();
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const x=sx*hx, z=sz*hz;
    prism(alu, ps, [x,postH/2,z], X, NZ, Y, postH);
    prism(alu, rrect(240,240,6,3), [x,6,z], X, NZ, Y, 12);
    prism(alu, rrect(200,200,12,4), [x,12+34,z], X, NZ, Y, 68);
    prism(alu, rrect(178,178,9,4), [x,80+3,z], X, NZ, Y, 6);
    /* sortie d'eau de la descente integree, face tournee vers l'interieur */
    const fx=-sx, fz=-sz;
    prism(st.get('joint'), rrect(56,22,6,3), [x+fx*0, 140, z+fz*(POST/2+0.4)], X, Y, fz>0?Z:NZ, 0.8);
    box(alu,[x, 128, z+fz*(POST/2+6)],[64,4,12]);
  }

  /* ---------- bandeaux, coupes d'onglet ---------- */
  const bs=beamSection(), y0=postH, m=u=>u+SEAM;
  sweep(alu, bs, [ W/2,y0,0], Z, NX, Y, D, m, m);
  sweep(alu, bs, [-W/2,y0,0], Z, X,  Y, D, m, m);
  sweep(alu, bs, [0,y0, D/2], X, NZ, Y, W, m, m);
  sweep(alu, bs, [0,y0,-D/2], X, Z,  Y, W, m, m);
  /* LED dans le canal sous les bandeaux */
  const led=st.get('led'), ly=y0+7;
  box(led,[ W/2-139,ly,0],[14,1.2,D-2*160]); box(led,[-W/2+139,ly,0],[14,1.2,D-2*160]);
  box(led,[0,ly, D/2-139],[W-2*160,1.2,14]); box(led,[0,ly,-D/2+139],[W-2*160,1.2,14]);

  /* ---------- lames ---------- */
  const clear=D-2*POST, nb=Math.max(1,Math.round(clear/190)), pitch=clear/nb;
  const Lb=W-2*(POST-44)-12, axleY=y0+170;
  const sec=bladeSection();
  const a0=ANGLES[slat]*DEG;
  const blades=[];
  for(let i=0;i<nb;i++){
    const z=-clear/2+pitch*(i+0.5);
    const n=new Node('lame'+(i+1)), p=n.part, a=p.get('alu');
    sweepSmooth(a, sec, [0,0,0], X, Z, Y, Lb);
    /* joint EPDM sous le larmier, embouts, axes et manivelles */
    box(p.get('joint'),[0,-5.5,CHORD/2-2],[Lb-10,5,5]);
    for(const s of [-1,1]){
      sweepSmooth(p.get('quinc'), sec, [s*(Lb/2+4),0,0], X, Z, Y, 8);
      cyl(p.get('inox'),[s*(Lb/2+20),0,0],X,8,24,10);
    }
    box(p.get('inox'),[Lb/2+30,-25,0],[6,56,16]);
    cyl(p.get('inox'),[Lb/2+30,-50,0],X,5,14,12);
    n.t=[0,axleY,z]; n.r=quat(X,a0);
    root.add(n); blades.push(n);
  }
  /* bielle : relie les manivelles, suit l'angle des lames */
  const bar=new Node('bielle');
  const barLen=clear-pitch+120;
  box(bar.part.get('inox'),[0,0,0],[6,20,barLen]);
  const barPos=a=>[Lb/2+38, axleY-50*Math.cos(a), -50*Math.sin(a)];
  bar.t=barPos(a0); root.add(bar);

  /* animations entre les trois positions */
  const names=['closed','mid','open'];
  for(const s0 of names) for(const s1 of names){
    if(s0===s1) continue;
    const A0=ANGLES[s0]*DEG, A1=ANGLES[s1]*DEG, nm=s0+'>'+s1;
    for(const b of blades) b.tracks[nm]={rotation:keys(NS,u=>quat(X,A0+(A1-A0)*ease(u)))};
    bar.tracks[nm]={translation:keys(NS,u=>barPos(A0+(A1-A0)*ease(u)))};
  }

  if(o.context) context(root, W, D);
  return {root, info:{blades:nb, pitch, slat}, anchors:{post:[hx,1000,hz], beam:[0,y0+100,D/2], corner:[hx,postH,hz]}};
}

/* terrasse carrelee autour de la pergola */
function context(root, W, D){
  const c=new Node('terrasse'), m=c.part, PW=W+2400, PD=D+2400;
  box(m.get('sol'),[0,-6,0],[PW,12,PD]);
  for(let x=-PW/2+600; x<PW/2; x+=600) box(m.get('joint_sol'),[x,0.5,0],[3,1,PD]);
  for(let z=-PD/2+600; z<PD/2; z+=600) box(m.get('joint_sol'),[0,0.5,z],[PW,1,3]);
  root.add(c);
}

global.Pergola = {
  ANGLES, build,
  make(opts, finish, finishExt, tint, ledOn){
    const r=build(opts);
    const defs=K.materials({finish, ledOn:!!ledOn});
    const an={}; for(const a of ['closed','mid','open']) for(const b of ['closed','mid','open']) if(a!==b) an[a+'>'+b]=2.8;
    const blob=K.toGLB([r.root], defs, an);
    return {url:URL.createObjectURL(blob), size:blob.size, info:r};
  },
};
})(typeof window!=='undefined'?window:globalThis);
