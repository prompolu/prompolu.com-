/* =====================================================================
 *  battants.js — genere la fenetre ou la porte battante aux cotes exactes.
 *
 *  Donnees reelles (page /battants.html) :
 *    S53RP+ : battant RPT, 120 kg et 1500 x 2400 mm par vantail,
 *             Rw <= 43 dB, Uw >= 1,6 W/m2K
 *    S46    : battant canal europeen, 120 kg et 1500 x 2400 mm par vantail,
 *             vitrage 27 mm, Rw 33 dB
 *    A400K     : porte d'entree ALUDOORS, collection lisse et fraisee
 *    A200 4FH2 : porte interieure ALUDOORS, collection fraisee, gris anthracite
 *
 *  Les masses vues de dormant et d'ouvrant ne sont pas publiees : elles sont
 *  reconstituees, et l'interface le dit. Les motifs fraises des portes
 *  ALUDOORS ne sont pas reproduits : le vantail est un panneau plein lisse.
 *
 *  Autonome : ne partage rien avec pergola.js, gardecorps.js ni coulissants.js.
 * ===================================================================== */
(function (global) {
'use strict';
const MM = 0.001, PI = Math.PI, DEG = PI/180;

/* ---------- triangulation (ear clipping) ---------- */
function earcut(d){
  const n=d.length>>1, idx=[], V=[];
  for(let i=0;i<n;i++) V.push(i);
  let area=0;
  for(let i=0,j=n-1;i<n;j=i++) area += (d[j*2]-d[i*2])*(d[i*2+1]+d[j*2+1]);
  if(area>0) V.reverse();
  const inTri=(ax,ay,bx,by,cx,cy,px,py)=>{
    const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);
    const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);
    const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);
    return !(((d1<0)||(d2<0)||(d3<0))&&((d1>0)||(d2>0)||(d3>0)));
  };
  let g=0;
  while(V.length>3 && g++<8000){
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
const M={
  mul:(a,b)=>{const o=new Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;
      for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  T:(x,y,z)=>[1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
  RX:t=>{const c=Math.cos(t),s=Math.sin(t);return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];},
  RY:t=>{const c=Math.cos(t),s=Math.sin(t);return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];},
  apply:(m,x,y,z)=>[m[0]*x+m[4]*y+m[8]*z+m[12],
                    m[1]*x+m[5]*y+m[9]*z+m[13],
                    m[2]*x+m[6]*y+m[10]*z+m[14]],
};
function Mesh(){this.pos=[];this.nrm=[];this.idx=[];}
Mesh.prototype.tri=function(a,b,c){
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
  const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const L=Math.hypot(nx,ny,nz)||1;nx/=L;ny/=L;nz/=L;
  const base=this.pos.length/3;
  for(const p of [a,b,c]){this.pos.push(p[0],p[1],p[2]);this.nrm.push(nx,ny,nz);}
  this.idx.push(base,base+1,base+2);
};
Mesh.prototype.extrude=function(pts,len,m){
  const h=len/2,n=pts.length/2,P=(i,z)=>M.apply(m,pts[i*2],pts[i*2+1],z);
  for(let i=0;i<n;i++){const j=(i+1)%n;
    this.tri(P(i,-h),P(j,-h),P(j,h)); this.tri(P(i,-h),P(j,h),P(i,h));}
  const t=earcut(pts);
  for(let k=0;k<t.length;k+=3){
    this.tri(P(t[k],h),P(t[k+1],h),P(t[k+2],h));
    this.tri(P(t[k+2],-h),P(t[k+1],-h),P(t[k],-h));}
};
Mesh.prototype.box=function(sx,sy,sz,m){
  this.extrude([-sx/2,-sy/2, sx/2,-sy/2, sx/2,sy/2, -sx/2,sy/2], sz, m);
};

/* ---------- la gamme ---------- */
const SYSTEMS = {
  S53RP: {label:'S53RP+', depth:53, frame:62, sash:70, glass:32,
          wmax:1500, hmax:2400, kg:120, kind:'fenetre', panel:false,
          tag:'Battant, rupture de pont thermique',
          note:'Rw ≤ 43 dB, Uw ≥ 1,6 W/m²K', exactGlass:false},
  S46:   {label:'S46', depth:46, frame:55, sash:63, glass:27,
          wmax:1500, hmax:2400, kg:120, kind:'fenetre', panel:false,
          tag:'Battant, canal européen',
          note:'Rw 33 dB, solution économique', exactGlass:true},
  A400K: {label:'A400K', depth:70, frame:68, sash:95, glass:0,
          wmax:1200, hmax:2400, kg:120, kind:'porte', panel:true,
          tag:"Porte d'entrée ALUDOORS",
          note:'Collection lisse et fraisée — panneau plein lisse ici',
          exactGlass:true},
  A200:  {label:'A200 4FH2', depth:50, frame:58, sash:95, glass:0,
          wmax:1000, hmax:2200, kg:80, kind:'porte', panel:true,
          tag:'Porte intérieure ALUDOORS',
          note:'Collection fraisée — panneau plein lisse ici',
          exactGlass:true},
};

const OPEN_ANGLE = 95;   // ouverture a la francaise
const TILT_ANGLE = 7;    // oscillo-battant : ~150 mm au linteau

function frameSection(depth, face, ch){
  ch = ch===undefined ? 2.5*MM : ch;
  const hd=depth/2, hf=face/2;
  return [-hd+ch,-hf, hd-ch,-hf, hd,-hf+ch, hd,hf-ch,
          hd-ch,hf, -hd+ch,hf, -hd,hf-ch, -hd,-hf+ch];
}

/* cadre rectangulaire w x h hors-tout, centre a l'origine du repere 'base' */
function rectFrame(mesh, w, h, face, depth, base){
  const secV=frameSection(face, depth), secH=frameSection(depth, face);
  for(const sx of [-1,1])
    mesh.extrude(secV, h, M.mul(base, M.mul(M.T(sx*(w/2-face/2),0,0), M.RX(-PI/2))));
  for(const sy of [-1,1])
    mesh.extrude(secH, w-2*face, M.mul(base, M.mul(M.T(0,sy*(h/2-face/2),0), M.RY(PI/2))));
}

function build(o){
  const S = SYSTEMS[o.system] || SYSTEMS.S53RP;
  const width=o.width, height=o.height;
  const isDoor = S.panel;
  const leaves = isDoor ? 1 : (o.leaves===2 ? 2 : 1);
  let mode = ['ferme','ouvert','oscillo'].indexOf(o.mode)>=0 ? o.mode : 'ferme';
  if(isDoor && mode==='oscillo') mode='ouvert';

  const D=S.depth*MM, F=S.frame*MM, C=S.sash*MM, gt=S.glass*MM;
  const lt=D*0.80;                       // epaisseur de l'ouvrant
  const alu=new Mesh(), glz=new Mesh(), pan=new Mesh();

  /* dormant */
  rectFrame(alu, width, height, F, D, M.T(0, height/2, 0));

  /* seuil / rejet d'eau, pour que la menuiserie ne semble pas flotter */
  if(!isDoor) alu.box(width, 12*MM, D+14*MM, M.T(0, 6*MM, 7*MM));

  const clearW=width-2*F, clearH=height-2*F;
  const cy=F+clearH/2;
  const lcz=-D/2+lt/2+3*MM;              // l'ouvrant se ferme cote interieur

  /* battement central, pour deux vantaux */
  if(leaves===2)
    alu.extrude(frameSection(C*0.55, lt), clearH,
      M.mul(M.T(0, cy, lcz), M.RX(-PI/2)));

  const leafW=clearW/leaves;
  for(let i=0;i<leaves;i++){
    const x0=-clearW/2 + i*leafW;
    const lcx=x0+leafW/2;
    const service=(i===leaves-1);        // le dernier vantail manoeuvre

    /* transformation du vantail */
    let Tl;
    if(service && mode==='ouvert'){
      const hx=lcx+leafW/2-C/2;          // charniere sur le montant droit
      Tl=M.mul(M.mul(M.T(hx, cy, lcz), M.RY(OPEN_ANGLE*DEG)),
               M.T(-(leafW/2-C/2), 0, 0));
    } else if(service && mode==='oscillo'){
      const hy=cy-clearH/2+C/2;          // pivot sur la traverse basse
      Tl=M.mul(M.mul(M.T(lcx, hy, lcz), M.RX(TILT_ANGLE*DEG)),
               M.T(0, clearH/2-C/2, 0));
    } else {
      Tl=M.T(lcx, cy, lcz);
    }

    rectFrame(alu, leafW, clearH, C, lt, Tl);
    if(isDoor){
      pan.box(leafW-2*C+4*MM, clearH-2*C+4*MM, lt*0.62, Tl);
      alu.box(26*MM, 210*MM, 26*MM,
        M.mul(Tl, M.T(-leafW/2+C*0.6, -clearH*0.06, lt/2+13*MM)));
    } else {
      glz.box(leafW-2*C, clearH-2*C, gt, Tl);
      if(service)
        alu.box(22*MM, 150*MM, 22*MM,
          M.mul(Tl, M.T(-leafW/2+C*0.55, 0, lt/2+11*MM)));
    }
  }
  /* saillie reelle dans la piece : mesuree sur la geometrie, pas estimee.
     C'est le chiffre qui decide sur un battant. */
  let zmax=-1e9;
  for(const m of [alu, glz, pan])
    for(let k=2;k<m.pos.length;k+=3) if(m.pos[k]>zmax) zmax=m.pos[k];

  return {alu, glz:glz.pos.length?glz:null, pan:pan.pos.length?pan:null,
          leafW, clearH, swing:zmax};
}

/* ---------- export GLB ---------- */
function toGLB(parts, finish, tint){
  const accessors=[],prims=[],materials=[],bufferViews=[],chunks=[];
  let offset=0;
  const push=(arr,ctor,target)=>{
    const bytes=new Uint8Array(new ctor(arr).buffer);
    while(offset%4){chunks.push(new Uint8Array([0]));offset++;}
    bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});
    chunks.push(bytes);offset+=bytes.length;return bufferViews.length-1;};
  const acc=(bv,type,comp,count,min,max)=>{
    accessors.push(Object.assign({bufferView:bv,componentType:comp,count,type},min?{min,max}:{}));
    return accessors.length-1;};
  const groups=[
    {m:parts.alu, mat:{name:'alu', color:finish.lin, metallic:finish.m, rough:finish.r, alpha:1}},
    {m:parts.pan, mat:{name:'panneau', color:finish.lin,
       metallic:Math.max(0,finish.m-0.15), rough:Math.min(1,finish.r+0.10), alpha:1}},
    {m:parts.glz, mat:{name:'verre', color:tint.lin, metallic:0, rough:tint.r, alpha:tint.a, blend:true}},
  ];
  for(const g of groups){
    if(!g.m || !g.m.pos.length) continue;
    const n=g.m.pos.length/3;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for(let i=0;i<n;i++)for(let k=0;k<3;k++){
      const v=g.m.pos[i*3+k]; if(v<mn[k])mn[k]=v; if(v>mx[k])mx[k]=v;}
    const pa=acc(push(g.m.pos,Float32Array,34962),'VEC3',5126,n,mn,mx);
    const na=acc(push(g.m.nrm,Float32Array,34962),'VEC3',5126,n);
    const ia=acc(push(g.m.idx,Uint32Array,34963),'SCALAR',5125,g.m.idx.length);
    const mi=materials.length;
    materials.push(Object.assign({name:g.mat.name, doubleSided:!!g.mat.blend,
      pbrMetallicRoughness:{baseColorFactor:[...g.mat.color,g.mat.alpha],
        metallicFactor:g.mat.metallic, roughnessFactor:g.mat.rough}},
      g.mat.blend?{alphaMode:'BLEND'}:{}));
    prims.push({attributes:{POSITION:pa,NORMAL:na}, indices:ia, material:mi});
  }
  let total=0; for(const c of chunks) total+=c.length;
  const gltf={asset:{version:'2.0',generator:'prompolu-battant'},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:prims}],materials,accessors,bufferViews,
    buffers:[{byteLength:total}]};
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

/* Vue RA iPhone : Quick Look charge un fichier fige. Chaque systeme a ses
   propres modeles, aux cotes de reference ci-dessous ; le devis reprend les
   cotes exactes saisies par le client.
   Ancrage : une fenetre s'applique contre un MUR, une porte se pose au SOL. */
const AR_SIZE = {
  S53RP: {1:[120,140], 2:[240,160]},
  S46:   {1:[120,140], 2:[240,160]},
  A400K: {1:[100,215]},
  A200:  {1:[90,205]},
};

global.Battant = {
  SYSTEMS, build, toGLB, AR_SIZE, OPEN_ANGLE, TILT_ANGLE,
  /* cotes du modele AR reellement servi */
  arSize(system, leaves){
    const t=AR_SIZE[system] || AR_SIZE.S53RP;
    return t[leaves] || t[1];
  },
  /* largeur d'un vantail, pour verifier la cote maxi du systeme */
  leafWidth(system, width, leaves){
    const S=SYSTEMS[system]||SYSTEMS.S53RP;
    const n=S.panel?1:(leaves===2?2:1);
    return (width-2*S.frame*MM)/n;
  },
  /* build() renvoie 'swing' : la saillie mesuree sur la geometrie */
  makeURL(opts, finish, tint){
    const parts = build(opts);
    return {url: URL.createObjectURL(toGLB(parts, finish, tint)),
            swing: parts.swing, leafW: parts.leafW};
  }
};
})(window);
