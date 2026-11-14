/* =====================================================================
 *  Generateur 3D du configurateur : fenetres et portes battantes.
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
 *  battants-detail.js — fenetres et portes battantes, systeme par systeme.
 *
 *  Fenetres STRUGAL (fiches strugal.ma) :
 *    S40    dormant 40, ouvrant 47, section de reference 89 mm, vitrage 27
 *    S46    dormant 46, canal europeen, vitrage 27, ouvrant galbe
 *    S53RP+ dormant 53/60, ouvrant 60, polyamide 24 mm, vitrage jusqu'a 40
 *  Portes :
 *    S45C       porte coplanaire vitree, dormant et vantail de 45 mm,
 *               180 kg et 1400 x 3000 mm par vantail, vitrage 31
 *    A400K      porte d'entree ALUDOORS, panneau plein fraise
 *    A200 4FH2  porte interieure ALUDOORS, quatre rainures horizontales
 *
 *  Details dessines : dormant a feuillure et levre d'arret, ouvrant qui
 *  recouvre le dormant, parclose (biseautee S40, galbee S46, droite
 *  S53RP+), barrettes polyamide et bicolore (S53RP+), joints, double
 *  vitrage avec intercalaire, rejet d'eau, bouchons de drainage,
 *  battement central (2 vantaux), quincaillerie oscillo-battante (fiche
 *  d'angle, compas visible en soufflet), poignee qui tourne avec le
 *  mode. Portes : paumelles, seuil, barre de tirage, bequilles, rosaces,
 *  rainures fraisees, chambranles.
 *  Masses vues non publiees : reconstituees (aspect, pas DXF).
 * ===================================================================== */
(function (global) {
'use strict';
const K = global.K3;
const {X,Y,Z,NX,NY,NZ,add,sub,sc,dot,cross,norm,rot,quat,Node,sweep,prism,box,obox,cyl,pipe,rrect,circle,splitRPT,extent,ease,keys} = K;
const PI=Math.PI, DEG=PI/180;
const SEAM=0.2, NS=24;

/* --------------------------- la gamme --------------------------- */
const SYSTEMS = {
  S40:   {label:'S40', kind:'fenetre', D:40, sd:47, Ff:40, Fsb:43, ov:7, g:24, tp:4, glass:27, pf:0, ps:0,
          bead:'biseau', face:'droit', frameGroove:true, wmax:1500, hmax:2400, kg:120,
          tag:'Battant canal européen, le plus accessible', note:'Rw 32 à 38 dB',
          src:'Dormant 40 mm, ouvrant 47 mm, section de référence dès 89 mm, vitrage jusqu’à 27 mm.'},
  S46:   {label:'S46', kind:'fenetre', D:46, sd:54, Ff:44, Fsb:50, ov:8, g:24, tp:4, glass:27, pf:0, ps:0,
          bead:'galbe', face:'galbe', frameGroove:false, frameRound:true, wmax:1500, hmax:2400, kg:120,
          tag:'Battant, canal européen', note:'Rw 32 à 38 dB',
          src:'Dormant 46 mm, canal européen, vitrage jusqu’à 27 mm, ouvrant galbé.'},
  S53RP: {label:'S53RP+', kind:'fenetre', D:53, sd:60, Ff:48, Fsb:56, ov:8, g:28, tp:5, glass:40, pf:24, ps:24,
          bead:'droit', face:'droit', frameGroove:false, wmax:1500, hmax:2400, kg:120,
          tag:'Battant, rupture de pont thermique', note:'Rw ≤ 43 dB, Uw ≥ 1,6 W/m²K',
          src:'Dormant 53/60 mm, ouvrant 60 mm, polyamide 24 mm, vitrage jusqu’à 40 mm.'},
  S45C:  {label:'S45C', kind:'porte', glazed:true, coplanar:true, D:45, sd:45, Ff:52, ov:0, stile:96, rail:96, bottom:190,
          g:24, tp:4, glass:31, pf:0, ps:0, bead:'droit', face:'droit', threshold:true, wmax:1400, hmax:3000, kg:180,
          tag:'Porte coplanaire, passages fréquents', note:'Double joint, va-et-vient possible',
          src:'Dormant et vantail coplanaires de 45 mm, 180 kg et 1400 × 3000 mm par vantail, vitrage jusqu’à 31 mm.'},
  A400K: {label:'A400K', kind:'porte', panel:true, D:70, Ff:68, leafT:62, decor:'k', ext:'barre', threshold:true,
          wmax:1200, hmax:2400, kg:120, tag:'Porte d’entrée ALUDOORS', note:'Collection lisse et fraisée',
          src:'Panneau plein, décor fraisé, barre de tirage extérieure (motif indicatif).'},
  A200:  {label:'A200 4FH2', kind:'porte', panel:true, interior:true, D:50, Ff:30, leafT:40, decor:'4h', ext:'bequille',
          threshold:false, wmax:1000, hmax:2200, kg:80, tag:'Porte intérieure ALUDOORS', note:'Collection fraisée',
          src:'Vantail plein à quatre rainures horizontales, chambranles des deux côtés.'},
};
const OPEN=95*DEG, TILT=7*DEG;

/* ------------------------------ profils ------------------------------
   u : depuis l'arete exterieure (cote mur) vers la baie ; v : profondeur,
   - = exterieur, + = interieur.                                        */
const LIPT=7, LIP=12, GAP=3;
function frameProfile(S){
  const h=S.D/2, Ff=S.Ff, c=1.2, p=[[0,-h+c],[c,-h]];
  if(!S.coplanar && !S.panelFrame){
    p.push([Ff+LIP-1,-h],[Ff+LIP,-h+1],[Ff+LIP,-h+LIPT-1],[Ff+LIP-1,-h+LIPT],[Ff+1,-h+LIPT],[Ff,-h+LIPT+1]);
  } else p.push([Ff-c,-h],[Ff,-h+c]);
  if(S.frameRound){ const r=4; for(let i=0;i<=4;i++){ const a=i/4*PI/2; p.push([Ff-r+r*Math.cos(a), h-r+r*Math.sin(a)]); } }
  else p.push([Ff,h-1.4],[Ff-1.4,h]);
  if(S.frameGroove){ const g=Ff*0.45; p.push([g+1.6,h],[g,h-1.1],[g-1.6,h]); }
  p.push([c,h],[0,h-c]);
  return p;
}
/* cotes de l'ouvrant dans l'epaisseur */
function sashZ(S){
  const h=S.D/2;
  if(S.coplanar){ const zs0=-h, zs1=h, zg0=-S.g/2, zg1=S.g/2; return {zs0,zs1,zg0,zg1,lipZ:h}; }
  const zs0=-h+LIPT+2, zs1=zs0+S.sd, zg0=zs0+5, zg1=zg0+S.g;
  return {zs0, zs1, zg0, zg1, lipZ:h+1};
}
/* section d'ouvrant : 'out' recouvre le dormant (levre), 'meet' bord a
   bord au battement central, 'cop' coplanaire                        */
function sashProfile(S, F, kind, Z){
  const ov = (kind==='out' && S.ov) ? S.ov : 0;
  const a = ov ? ov+GAP : 0, b=a+F, rb=Math.min(14,F-6), ch=1.2;
  const p=[[a,Z.zs0+ch],[a+ch,Z.zs0]];
  if(S.coplanar){ p.push([b-1,Z.zs0],[b,Z.zs0+1],[b,Z.zg0-2.5]); }
  else p.push([b-1,Z.zs0],[b,Z.zs0+1],[b,Z.zg0-2.5]);
  p.push([b-rb,Z.zg0-2.5]);
  if(S.coplanar){
    /* coplanaire : parclose exterieure symetrique, le vantail a deux faces */
    p.push([b-rb,Z.zg1+2.5],[b,Z.zg1+2.5],[b,Z.zs1-1],[b-1,Z.zs1]);
  } else p.push([b-rb,Z.zs1-1.5],[b-rb-1.5,Z.zs1]);
  if(ov){
    if(S.face==='galbe'){ const r=5; for(let i=0;i<=4;i++){ const ang=PI/2+i/4*PI/2; p.push([r+r*Math.cos(ang), Z.zs1-r+r*Math.sin(ang)]); } }
    else p.push([2.4,Z.zs1],[0,Z.zs1-2.4]);
    p.push([0,Z.lipZ+1],[1,Z.lipZ],[a,Z.lipZ]);
  } else {
    if(S.face==='galbe'){ const r=4; for(let i=0;i<=3;i++){ const ang=PI/2+i/3*PI/2; p.push([r+r*Math.cos(ang), Z.zs1-r+r*Math.sin(ang)]); } }
    else p.push([ch,Z.zs1],[0,Z.zs1-ch]);
  }
  return {poly:p, a, b, rb};
}
/* parclose, en coordonnees w = distance au bord du clair de vitrage
   (0 au clair, + vers le cadre), v profondeur                          */
function beadProfile(S, rb, Z, side){
  const w1=rb-1, v0 = side<0 ? Z.zs0+1.5 : Z.zg1+2.5, v1 = side<0 ? Z.zg0-2.5 : Z.zs1-1.5;
  const st=S.bead;
  if(side<0) return [[0,v0+1],[1,v0],[w1,v0],[w1,v1],[0,v1]];   /* coplanaire, face exterieure */
  if(st==='biseau') return [[0,v0],[w1,v0],[w1,v1],[8,v1],[0,v0+2.2]];
  if(st==='galbe'){
    const pts=[[0,v0],[w1,v0],[w1,v1]], r=Math.min(10,v1-v0-1);
    for(let i=0;i<=5;i++){ const ang=i/5*PI/2; pts.push([r-r*Math.sin(ang), v1-r+r*Math.cos(ang)]); }
    pts.push([0,v0+0.8]); return pts;
  }
  return [[0,v0],[w1,v0],[w1,v1],[1.2,v1],[0,v1-1.2]];
}
const mit=u=>u+SEAM;

/* ------------------- outils : membres d'un cadre ------------------- */
/* cadre rectangulaire d'apres son contour EXTERIEUR (u vers l'interieur) */
function frameRect(part, parts, rect, sides, cut){
  const {xl,xr,yb,yt}=rect, H=yt-yb, W=xr-xl;
  for(const q of parts){
    const m=part.get(q.mat);
    if(sides.L) sweep(m,q.poly,[xl,(yb+yt)/2,0],Y,X,Z,H, cut.LB, cut.LT);
    if(sides.R) sweep(m,q.poly,[xr,(yb+yt)/2,0],Y,NX,Z,H, cut.RB, cut.RT);
    if(sides.T) sweep(m,q.poly,[(xl+xr)/2,yt,0],X,NY,Z,W, cut.TL, cut.TR);
    if(sides.B) sweep(m,q.poly,[(xl+xr)/2,yb,0],X,Y,Z,W, cut.BL, cut.BR);
  }
}
/* parcloses autour du clair (rect), mitrees : w vers l'exterieur du clair */
function beadRect(part, poly, rect, mat){
  const {xl,xr,yb,yt}=rect, m=part.get(mat), c=w=>-w+SEAM;
  sweep(m,poly,[xl,(yb+yt)/2,0],Y,NX,Z,yt-yb,c,c);
  sweep(m,poly,[xr,(yb+yt)/2,0],Y,X,Z,yt-yb,c,c);
  sweep(m,poly,[(xl+xr)/2,yt,0],X,Y,Z,xr-xl,c,c);
  sweep(m,poly,[(xl+xr)/2,yb,0],X,NY,Z,xr-xl,c,c);
}
const partsOf=(poly,S,umax,pw,rec,matExt)=>{
  if(!pw) return [{poly,mat:'alu'}];
  const s=splitRPT(poly,pw,umax,rec);
  return [{poly:s.ext,mat:matExt},{poly:s.mid,mat:'polyamide'},{poly:s.intr,mat:'alu'}].filter(x=>x.poly);
};

/* double vitrage : deux verres, intercalaire, joints EPDM */
function glazing(part, S, clear, rbs, Z, zc){
  const {xl,xr,yb,yt}=clear, g=S.g, tp=S.tp;
  const gx0=xl-rbs.L+2, gx1=xr+rbs.R-2, gy0=yb-rbs.B+2, gy1=yt+rbs.T-2;
  const gw=gx1-gx0, gh=gy1-gy0, cx=(gx0+gx1)/2, cy=(gy0+gy1)/2;
  for(const s of [-1,1]) box(part.get('verre'),[cx,cy,zc+s*(g/2-tp/2)],[gw,gh,tp]);
  const spH=15, spT=g-2*tp-0.4, sp=S.pf?'intercalaire_noir':'intercalaire';
  box(part.get(sp),[cx,gy1-spH/2,zc],[gw,spH,spT]); box(part.get(sp),[cx,gy0+spH/2,zc],[gw,spH,spT]);
  box(part.get(sp),[gx0+spH/2,cy,zc],[spH,gh-2*spH,spT]); box(part.get(sp),[gx1-spH/2,cy,zc],[spH,gh-2*spH,spT]);
  for(const s of [-1,1]){
    const z=zc+s*(g/2+1.25), b=3, m=part.get('joint');
    box(m,[(xl+xr)/2,yt-b/2+0.6,z],[xr-xl+2,b,2.5]); box(m,[(xl+xr)/2,yb+b/2-0.6,z],[xr-xl+2,b,2.5]);
    box(m,[xl+b/2-0.6,(yb+yt)/2,z],[b,yt-yb,2.5]); box(m,[xr-b/2+0.6,(yb+yt)/2,z],[b,yt-yb,2.5]);
  }
}

/* --------------------------- quincaillerie --------------------------- */
/* poignee de fenetre (rosace + levier) : renvoie le levier, a part, pour
   qu'il tourne : bas = ferme, horizontal = ouvert, haut = soufflet     */
function windowHandle(part, x, y, z){
  const q=part.get('quinc');
  prism(q, rrect(30,82,8,5), [x,y-12,z+4.5], X, Y, Z, 9);
  const lever=new K.Part(), m=lever.get('quinc');
  cyl(m,[0,0,14],Z,9,14,18);
  prism(m, rrect(17,120,8,5), [0,-50,28], X, Y, Z, 13);
  cyl(m,[0,-108,28],Z,9.5,13,16);
  return lever;
}
/* bequille de porte sur rosace ronde (+ rosace de cle) */
function doorLever(part, x, y, z, dirOut, toHinge){
  const q=part.get('quinc'), s=dirOut;          /* s = +1 face interieure, -1 exterieure */
  cyl(q,[x,y,z+s*4.5],Z,26,9,24);
  cyl(q,[x,y,z+s*16],Z,9,16,16);
  pipe(q, rrect(20,14,6,3), [[x,y,z+s*24],[x+toHinge*40,y,z+s*30],[x+toHinge*135,y,z+s*30]], Y, true);
  cyl(q,[x,y-170,z+s*4],Z,20,8,20);
  prism(part.get('joint'), rrect(6,16,3,2), [x,y-170,z+s*8.2], X, Y, Z, 0.4);
}
/* plaque longue + bequille + cylindre (porte d'entree, cote interieur) */
function longPlate(part, x, y, z, s, toHinge){
  const q=part.get('quinc');
  prism(q, rrect(42,250,10,5), [x,y-40,z+s*5], X, Y, Z, 10);
  cyl(q,[x,y,z+s*18],Z,10,18,16);
  pipe(q, rrect(20,14,6,3), [[x,y,z+s*26],[x+toHinge*40,y,z+s*32],[x+toHinge*140,y,z+s*32]], Y, true);
  cyl(q,[x,y-130,z+s*11],Z,9,4,18);
  prism(part.get('joint'), rrect(4,12,2,2), [x,y-130,z+s*13.2], X, Y, Z, 0.4);
}
/* barre de tirage exterieure : tube sur deux pieds */
function pullBar(part, x, y, z, s, L){
  const q=part.get('quinc'), e=L/2-140;
  for(const k of [-1,1]){ cyl(q,[x,y+k*e,z+s*36],Z,9,72,16); cyl(q,[x,y+k*e,z+s*3],Z,16,6,20); }
  cyl(q,[x,y,z+s*80],Y,15,L,24);
}
/* paumelle (charniere) : deux noeuds de 50 mm, embouts */
function hingeKnuckle(m, x, y, z, r, len, top){
  cyl(m,[x,y,z],Y,r,len,18);
  if(top) cyl(m,[x,y+len/2+3,z],Y,r*0.82,6,16); else cyl(m,[x,y-len/2-3,z],Y,r*0.82,6,16);
}

/* ------------------------------ fenetre ------------------------------ */
function buildWindow(o, S){
  const W=o.width*1000, H=o.height*1000, leaves=o.leaves===2?2:1;
  const mode=['ferme','ouvert','oscillo'].includes(o.mode)?o.mode:'ferme';
  const rpt=S.pf>0, matExt=rpt?'alu_ext':'alu';
  const root=new Node('fenetre'), st=root.part;
  const Z0=sashZ(S), h=S.D/2;

  /* dormant, quatre coupes d'onglet */
  const fp=frameProfile(S);
  const fparts=partsOf(fp,S,S.Ff,rpt?S.pf:0,1.4,matExt);
  frameRect(st,fparts,{xl:-W/2,xr:W/2,yb:0,yt:H},{L:1,R:1,T:1,B:1},
    {LB:mit,LT:mit,RB:mit,RT:mit,TL:mit,TR:mit,BL:mit,BR:mit});
  /* joint d'arret : trait noir entre levre et ouvrant (vu de l'exterieur) */
  const sealP=[[S.Ff+LIP-4,-h+LIPT],[S.Ff+LIP+1.4,-h+LIPT],[S.Ff+LIP+1.4,-h+LIPT+1.8],[S.Ff+LIP-4,-h+LIPT+1.8]];
  frameRect(st,[{poly:sealP,mat:'joint'}],{xl:-W/2,xr:W/2,yb:0,yt:H},{L:1,R:1,T:1,B:1},
    {LB:mit,LT:mit,RB:mit,RT:mit,TL:mit,TR:mit,BL:mit,BR:mit});
  /* bouchons de drainage, face exterieure de la traverse basse */
  const nd=Math.max(2,Math.round(W/600));
  for(let i=0;i<nd;i++){ const x=-W/2+W*(i+0.5)/nd;
    prism(st.get('joint'), rrect(28,6,3,3), [x,S.Ff*0.5,-h-0.5], X, Y, Z, 1.4); }

  /* vantaux */
  const ov=S.ov, rects=[];
  const xl0=-W/2+S.Ff-ov, xr0=W/2-S.Ff+ov, yb=S.Ff-ov, yt=H-S.Ff+ov;
  if(leaves===1) rects.push({xl:xl0,xr:xr0,L:'out',R:'out',main:true});
  else { rects.push({xl:xl0,xr:-1.5,L:'out',R:'meet',main:false}); rects.push({xl:1.5,xr:xr0,L:'meet',R:'out',main:true}); }
  const out={leaves:[], leafW:0};
  let anchors={};
  for(const R of rects){
    const node=new Node(R.main?'vantail':'vantail-fixe'), part=node.part;
    const pr={}; for(const k of ['L','R','T','B']) pr[k]=sashProfile(S,S.Fsb,k==='L'?R.L:k==='R'?R.R:'out',Z0);
    const sp=k=>partsOf(pr[k].poly,S,pr[k].b-pr[k].rb,rpt?S.ps:0,1.0,matExt);
    const rect={xl:R.xl,xr:R.xr,yb,yt};
    const cope=k=>(u,v)=>extent([pr[k].poly],v)+0.15;
    for(const k of ['L','R','T','B']){
      const sides={L:k==='L',R:k==='R',T:k==='T',B:k==='B'};
      const cut={
        LB:R.L==='meet'?null:mit, LT:R.L==='meet'?null:mit, RB:R.R==='meet'?null:mit, RT:R.R==='meet'?null:mit,
        TL:R.L==='meet'?cope('L'):mit, TR:R.R==='meet'?cope('R'):mit,
        BL:R.L==='meet'?cope('L'):mit, BR:R.R==='meet'?cope('R'):mit};
      frameRect(part,sp(k),rect,sides,cut);
    }
    /* clair de vitrage */
    const clear={xl:R.xl+pr.L.b, xr:R.xr-pr.R.b, yb:yb+pr.B.b, yt:yt-pr.T.b};
    const rbs={L:pr.L.rb,R:pr.R.rb,T:pr.T.rb,B:pr.B.rb};
    const zc=(Z0.zg0+Z0.zg1)/2;
    glazing(part,S,clear,rbs,Z0,zc);
    beadRect(part, beadProfile(S,Math.min(rbs.L,rbs.T),Z0,1), clear, 'alu');
    /* rejet d'eau sous la traverse basse, cote exterieur */
    const a=pr.B.a, dz=Z0.zs0;
    sweep(part.get(matExt), [[a+12,dz],[a+30,dz],[a+16,dz-13],[a+12,dz-13]],
          [(R.xl+R.xr)/2,yb,0], X, Y, Z, R.xr-R.xl-2*(a+4));
    /* battement central, porte par le vantail principal */
    if(leaves===2 && R.main){
      const zz=Z0.zs1;
      sweep(part.get('alu'), [[-24,zz+0.5],[6,zz+0.5],[6,zz+5],[5,zz+6],[-23,zz+6],[-24,zz+5]],
            [R.xl,(yb+yt)/2,0], Y, X, Z, yt-yb-2);
    }
    out.leafW=Math.max(out.leafW, R.xr-R.xl);

    if(R.main){
      /* charniere a droite : pivot au coin bas droit, face interieure */
      const P=[R.xr, yb, Z0.zs1];
      /* quincaillerie oscillo-battante : fiche d'angle bas, fiche haute */
      const hx=R.xr+1, hz=Z0.zs1+5;
      hingeKnuckle(part.get('quinc'), hx, yb+40, hz, 6.5, 34, false);
      hingeKnuckle(st.get('quinc'), hx, yb+76, hz, 6.5, 30, true);
      hingeKnuckle(part.get('quinc'), hx, yt-60, hz, 6, 30, true);
      /* poignee : montant oppose a la charniere, a mi-hauteur */
      const hpX = R.L==='meet' ? R.xl+pr.L.b/2+3 : R.xl+(pr.L.a+pr.L.b)/2;
      const hpY = Math.min((yb+yt)/2, 1050);
      const lever=windowHandle(part, hpX, hpY, Z0.zs1);
      const hn=new Node('poignee'); hn.part=lever;
      /* compas de soufflet : bras plat entre la traverse haute du dormant
         et celle du vantail, visible quand on bascule                     */
      const A=[R.xr-50, H-S.Ff*0.45, h+2], B0=[R.xr-330, yt-S.Fsb*0.4, Z0.zs1+1];
      const arm=new Node('compas'); arm.t=A;
      const Lr=Math.hypot(...sub(B0,A));
      obox(arm.part.get('inox'), [Lr/2,0,0], Y, Z, X, 3, 12, Lr);
      /* poses : leaf (ouvert / soufflet), levier, bras */
      const leafQ=m=> m==='ouvert'?quat(Y,OPEN): m==='oscillo'?quat(X,TILT):[0,0,0,1];
      const leverQ=m=> m==='ouvert'?quat(Z,PI/2): m==='oscillo'?quat(Z,PI):[0,0,0,1];
      /* replie (invisible) tant que le vantail n'est pas bascule */
      const armPose=(phi)=>{
        if(phi<0.2*DEG) return {q:[0,0,0,1], sc:0.02};
        const Bp=add(P, rot(sub(B0,P), X, phi)), d=sub(Bp,A), L=Math.hypot(...d), u=norm(d);
        const ax=cross(X,u), s=Math.hypot(...ax), ang=Math.atan2(s, dot(X,u));
        return {q: s<1e-9?[0,0,0,1]:quat(norm(ax),ang), sc:L/Lr};
      };
      node.t=P; node.part.offset(P); node.r=leafQ(mode);
      hn.t=sub([hpX,hpY,Z0.zs1],P); hn.r=leverQ(mode); node.add(hn);
      const ap=armPose(mode==='oscillo'?TILT:0); arm.r=ap.q; arm.s=[ap.sc,1,1];
      root.add(node); root.add(arm);
      /* animations : levier d'abord, puis le vantail */
      const seg=(u,a,b)=>ease(Math.min(1,Math.max(0,(u-a)/(b-a))));
      node.tracks.ouvrir   ={rotation:keys(NS,u=>quat(Y,OPEN*seg(u,0.25,1)))};
      node.tracks.fermer   ={rotation:keys(NS,u=>quat(Y,OPEN*(1-seg(u,0,0.75))))};
      node.tracks.basculer ={rotation:keys(NS,u=>quat(X,TILT*seg(u,0.3,1)))};
      node.tracks.redresser={rotation:keys(NS,u=>quat(X,TILT*(1-seg(u,0,0.7))))};
      hn.tracks.ouvrir   ={rotation:keys(NS,u=>quat(Z,PI/2*seg(u,0,0.25)))};
      hn.tracks.fermer   ={rotation:keys(NS,u=>quat(Z,PI/2*(1-seg(u,0.75,1))))};
      hn.tracks.basculer ={rotation:keys(NS,u=>quat(Z,PI*seg(u,0,0.3)))};
      hn.tracks.redresser={rotation:keys(NS,u=>quat(Z,PI*(1-seg(u,0.7,1))))};
      const armTrack=f=>({rotation:keys(NS,u=>armPose(f(u)).q), scale:keys(NS,u=>[armPose(f(u)).sc,1,1])});
      arm.tracks.basculer =armTrack(u=>TILT*seg(u,0.3,1));
      arm.tracks.redresser=armTrack(u=>TILT*(1-seg(u,0,0.7)));
      arm.tracks.ouvrir   =armTrack(()=>0);
      arm.tracks.fermer   =armTrack(()=>0);
      anchors.handle=[hpX,hpY,Z0.zs1+40]; anchors.hinge=[hx,yb+60,hz];
      out.pivot=P; out.leafNode=node; out.handleNode=hn; out.leafQ=leafQ; out.leverQ=leverQ;
    } else {
      /* vantail semi-fixe : charniere a gauche, fiches visibles */
      const hx=R.xl-1, hz=Z0.zs1+5;
      hingeKnuckle(part.get('quinc'), hx, yb+40, hz, 6.5, 34, false);
      hingeKnuckle(st.get('quinc'), hx, yb+76, hz, 6.5, 30, true);
      hingeKnuckle(part.get('quinc'), hx, yt-60, hz, 6, 30, true);
      root.add(node);
    }
  }
  anchors.corner=[-W/2+S.Ff, S.Ff, h]; anchors.top=[0,H,h];
  return {root, out, anchors, mode, W, H, S, Z0};
}

/* -------------------------------- porte -------------------------------- */
function buildDoor(o, S){
  const W=o.width*1000, H=o.height*1000;
  const mode=o.mode==='ouvert'?'ouvert':'ferme';
  const root=new Node('porte'), st=root.part, h=S.D/2;
  const Ff=S.Ff;
  /* dormant trois cotes (huisserie), seuil a part */
  const fp=S.panel ? doorFrameProfile(S) : frameProfile(S);
  frameRect(st,[{poly:fp,mat:'alu'}],{xl:-W/2,xr:W/2,yb:0,yt:H},{L:1,R:1,T:1,B:0},
    {LB:null,LT:mit,RB:null,RT:mit,TL:mit,TR:mit});
  const thH = S.threshold ? 22 : 0;
  if(S.threshold){
    /* seuil aluminium bas, joint brosse, rampe exterieure */
    sweep(st.get('alu'), [[0,-h-18],[6,-h-18],[thH,-h+6],[thH,h-2],[thH-2,h],[0,h]], [0,0,0], X, Y, Z, W-2*Ff+0.4);
    box(st.get('brosse'), [0,thH+3,-h+LIPT+5], [W-2*Ff-8, 6, 3]);
  }
  if(S.interior){
    /* chambranles 70 x 12 des deux cotes, coupes d'onglet en tete */
    const cp=[[0,0],[70,0],[70,8],[66,12],[0,12]];
    for(const s of [-1,1]){
      const z=s*(h+0.5), e=s>0?Z:NZ;
      for(const q of [cp]){
        const m=st.get('alu');
        /* bord interieur a Ff*0,4 de l'arete : onglet = prolongement de u */
        const xi=W/2-Ff*0.4, yi=H-Ff*0.4, ext=u=>-u+SEAM;
        sweep(m,q,[-xi,yi/2,z],Y,NX,e,yi,null,ext);
        sweep(m,q,[ xi,yi/2,z],Y,X,e,yi,null,ext);
        sweep(m,q,[0,yi,z],X,Y,e,2*xi,ext,ext);
      }
    }
  }
  /* vantail */
  const node=new Node('vantail'), part=node.part;
  const gap=3, lxl=-W/2+Ff+gap, lxr=W/2-Ff-gap, lyb=thH+(S.threshold?6:8), lyt=H-Ff-gap;
  const lw=lxr-lxl, lh=lyt-lyb;
  let zf0, zf1;                     /* faces du vantail */
  const anchors={};
  if(S.panel){
    zf0 = -h+LIPT+2; zf1 = zf0+S.leafT;
    const zc=(zf0+zf1)/2;
    /* panneau plein, chants arrondis */
    prism(part.get('panneau'), rrect(lw,lh,3,3), [(lxl+lxr)/2,(lyb+lyt)/2,zc], X, Y, Z, S.leafT);
    /* rainures fraisees : traits sombres sur les faces */
    const groove=(p0,p1,face,w)=>{
      const d=sub(p1,p0), L=Math.hypot(...d), u=norm(d), n=cross(face<0?NZ:Z,u);
      const c=add(sc(add(p0,p1),0.5),[0,0,face<0?zf0-0.15:zf1+0.15]);
      obox(part.get('rainure'), c, u, face<0?NZ:Z, cross(u,face<0?NZ:Z), L, 0.3, w);
    };
    const gx=(f)=>lxl+lw*f, gy=(f)=>lyb+lh*f;
    if(S.decor==='k'){
      /* decor « K » de la face exterieure (motif indicatif) */
      groove([gx(0.14),gy(0.88),0],[gx(0.74),gy(0.52),0],-1,7);
      groove([gx(0.14),gy(0.14),0],[gx(0.74),gy(0.52),0],-1,7);
      groove([gx(0.74),gy(0.52),0],[gx(0.88),gy(0.60),0],-1,7);
    } else if(S.decor==='4h'){
      for(const f of [0.2,0.4,0.6,0.8]) for(const face of [-1,1])
        groove([lxl+60,gy(f),0],[lxr-60,gy(f),0],face,6);
    }
  } else {
    /* porte vitree coplanaire : montants larges, soubassement haut */
    const Z0=sashZ(S); zf0=Z0.zs0; zf1=Z0.zs1;
    const pr={L:sashProfile(S,S.stile,'cop',Z0),R:sashProfile(S,S.stile,'cop',Z0),
              T:sashProfile(S,S.rail,'cop',Z0),B:sashProfile(S,S.bottom,'cop',Z0)};
    const rect={xl:lxl,xr:lxr,yb:lyb,yt:lyt};
    const cope=k=>(u,v)=>extent([pr[k].poly],v)+0.15;
    for(const k of ['L','R','T','B'])
      frameRect(part,[{poly:pr[k].poly,mat:'alu'}],rect,{L:k==='L',R:k==='R',T:k==='T',B:k==='B'},
        {LB:null,LT:null,RB:null,RT:null,TL:cope('L'),TR:cope('R'),BL:cope('L'),BR:cope('R')});
    const clear={xl:lxl+pr.L.b, xr:lxr-pr.R.b, yb:lyb+pr.B.b, yt:lyt-pr.T.b};
    const rbs={L:pr.L.rb,R:pr.R.rb,T:pr.T.rb,B:pr.B.rb};
    glazing(part,S,clear,rbs,Z0,0);
    beadRect(part, beadProfile(S,14,Z0,1), clear, 'alu');
    beadRect(part, beadProfile(S,14,Z0,-1), clear, 'alu');
    /* double joint coplanaire : trait sombre continu entre dormant et vantail */
    for(const s of [-1,1]) box(st.get('joint'),[s*(W/2-Ff-1.5),H/2,0],[2.4,H-10,S.D-6]);
    box(st.get('joint'),[0,H-Ff-1.5,0],[W-2*Ff,2.4,S.D-6]);
  }
  /* paumelles (3) cote droit, sur la face interieure */
  const hx=lxr+2, hz=zf1+6, hk=part.get('quinc'), hs=st.get('quinc');
  for(const y of [lyb+220, (lyb+lyt)/2+120, lyt-220]){
    hingeKnuckle(hk,hx,y-26,hz,8.5,50,false); hingeKnuckle(hs,hx,y+26,hz,8.5,50,true);
    box(hk,[hx-20,y-26,zf1+1.5],[34,48,3]); box(hs,[hx+16,y+26,zf1+1.5],[24,48,3]);
  }
  /* poignees : cote gauche (serrure), bequille a 1050 mm */
  const lx=lxl+62, ly=Math.min(1050, lyb+lh*0.48);
  if(S.ext==='barre'){
    pullBar(part, lxl+110, Math.min(1100,lyb+lh*0.5), zf0, -1, 1200);
    longPlate(part, lx, ly, zf1, 1, 1);
    cyl(part.get('quinc'),[lx,ly-130,zf0-4],Z,10,8,18);
  } else if(S.glazed){
    longPlate(part, lxl+S.stile/2, ly, zf1, 1, 1);
    longPlate(part, lxl+S.stile/2, ly, zf0, -1, 1);
  } else {
    doorLever(part, lx, ly, zf1, 1, 1);
    doorLever(part, lx, ly, zf0, -1, 1);
  }
  /* pivot : axe des paumelles */
  const P=[hx, lyb, hz];
  node.t=P; node.part.offset(P); node.r = mode==='ouvert'?quat(Y,OPEN):[0,0,0,1];
  const seg=(u,a,b)=>ease(Math.min(1,Math.max(0,(u-a)/(b-a))));
  node.tracks.ouvrir={rotation:keys(NS,u=>quat(Y,OPEN*seg(u,0.1,1)))};
  node.tracks.fermer={rotation:keys(NS,u=>quat(Y,OPEN*(1-seg(u,0,0.9))))};
  root.add(node);
  anchors.handle=[lx,ly,zf1+40]; anchors.hinge=[hx,lyb+220,hz]; anchors.corner=[-W/2+Ff,0,h]; anchors.top=[0,H,h];
  return {root, out:{leafW:lw, pivot:P, leafNode:node, leafQ:m=>m==='ouvert'?quat(Y,OPEN):[0,0,0,1]}, anchors, mode, W, H, S};
}
/* huisserie de porte pleine : profil a feuillure arrondi */
function doorFrameProfile(S){
  const h=S.D/2, Ff=S.Ff, p=[[0,-h+1.5],[1.5,-h],[Ff+LIP,-h],[Ff+LIP,-h+LIPT],[Ff,-h+LIPT+1]];
  const r=5; for(let i=0;i<=4;i++){ const a=i/4*PI/2; p.push([Ff-r+r*Math.cos(a), h-r+r*Math.sin(a)]); }
  p.push([1.5,h],[0,h-1.5]);
  return p;
}

/* -------------------- mise en situation (vue 3D) -------------------- */
function context(root, W, H, D, door){
  const c=new Node('mur'), m=c.part.get('mur'), T=220, side=600, top=420, zf=-D/2-18, zw=zf+T/2;
  const below = door ? 0 : 900;
  box(m,[-W/2-side/2,(H-below+top)/2,zw],[side,H+below+top,T]);
  box(m,[ W/2+side/2,(H-below+top)/2,zw],[side,H+below+top,T]);
  box(m,[0,H+top/2,zw],[W,top,T]);
  if(!door){
    box(m,[0,-below/2,zw],[W,below,T]);
    /* appui exterieur en pierre, tablette interieure */
    box(c.part.get('beton'),[0,-15,zf-40],[W+80,30,110]);
    box(c.part.get('sol'),[0,-12,zf+T-4+60],[W+40,24,130]);
  }
  const yfl=door?0:-below;
  box(c.part.get('sol'),[0,yfl-10,zf+T+700],[W+2*side,20,1400]);
  box(c.part.get('terrasse'),[0,yfl-12,zf-700],[W+2*side,20,1400]);
  root.add(c);
}

/* ------------------------------ entree ------------------------------ */
function build(o){
  const key=SYSTEMS[o.system]?o.system:'S53RP', S=SYSTEMS[key];
  const r = S.kind==='porte' ? buildDoor(o,S) : buildWindow(o,S);
  r.key=key;
  /* saillie mesuree sur la geometrie, pour chaque position d'ouverture */
  const L=r.out.leafNode, hn=r.out.handleNode, keepL=L.r, keepH=hn&&hn.r;
  r.swings={};
  for(const m of (S.kind==='porte'?['ferme','ouvert']:['ferme','ouvert','oscillo'])){
    L.r=r.out.leafQ(m); if(hn) hn.r=r.out.leverQ(m); r.swings[m]=swingOf(r);
  }
  L.r=keepL; if(hn) hn.r=keepH;
  r.swing = r.swings[r.mode];
  if(o.context) context(r.root, r.W, r.H, S.D, S.kind==='porte');
  return r;
}
function swingOf(r){
  const leaf=r.out.leafNode; let zmax=-1e9;
  const walk=(n,acc)=>{ for(const k in n.part.m){ const p=n.part.m[k].pos;
      for(let i=0;i<p.length;i+=3){ const v=acc([p[i],p[i+1],p[i+2]]); if(v[2]>zmax) zmax=v[2]; } }
    for(const c of n.children) walk(c, v=>acc(add(c.t, qrot(c.r, v)))); };
  walk(r.root, v=>v);
  return zmax/1000;
}
function qrot(q, v){
  const [x,y,z,w]=q, u=[x,y,z], t=sc(cross(u,v),2);
  return add(add(v, sc(t,w)), cross(u,t));
}

global.Battant = {
  SYSTEMS, build, OPEN, TILT,
  make(opts, finish, finishExt, tint){
    const r=build(opts);
    const defs=K.materials({finish, finishExt:(r.S.pf&&finishExt)?finishExt:null, tint});
    const blob=K.toGLB([r.root], defs, {ouvrir:2.0, fermer:2.0, basculer:1.6, redresser:1.6});
    return {url:URL.createObjectURL(blob), size:blob.size, info:r};
  },
};
})(typeof window!=='undefined'?window:globalThis);
