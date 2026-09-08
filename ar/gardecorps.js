/* =====================================================================
 *  gardecorps.js — genere le garde-corps a la volee, a la longueur exacte.
 *
 *  Deux familles, comme au catalogue :
 *    - Glass Line : profil de base en U 125 x 90 mm, verre feuillete,
 *                   main courante et bandeau LED en option
 *    - S80B       : montants, main courante, barreaudage et/ou verre
 *
 *  Volontairement autonome : ne partage pas de code avec pergola.js, pour
 *  qu'une evolution ici ne puisse rien casser sur la pergola en ligne.
 * ===================================================================== */
(function (global) {
'use strict';

const MM = 0.001, PI = Math.PI;

/* ---------- triangulation d'un polygone simple (ear clipping) -------- */
function earcut(d) {
  const n = d.length >> 1, idx = [], V = [];
  for (let i = 0; i < n; i++) V.push(i);
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++)
    area += (d[j*2] - d[i*2]) * (d[i*2+1] + d[j*2+1]);
  if (area > 0) V.reverse();
  const inTri = (ax,ay,bx,by,cx,cy,px,py) => {
    const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);
    const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);
    const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);
    return !(((d1<0)||(d2<0)||(d3<0)) && ((d1>0)||(d2>0)||(d3>0)));
  };
  let guard = 0;
  while (V.length > 3 && guard++ < 8000) {
    let cut = false;
    for (let i = 0; i < V.length; i++) {
      const a=V[(i+V.length-1)%V.length], b=V[i], c=V[(i+1)%V.length];
      const ax=d[a*2],ay=d[a*2+1], bx=d[b*2],by=d[b*2+1], cx=d[c*2],cy=d[c*2+1];
      if ((bx-ax)*(cy-ay)-(by-ay)*(cx-ax) <= 0) continue;
      let ok = true;
      for (const v of V) { if (v===a||v===b||v===c) continue;
        if (inTri(ax,ay,bx,by,cx,cy,d[v*2],d[v*2+1])) { ok=false; break; } }
      if (!ok) continue;
      idx.push(a,b,c); V.splice(i,1); cut = true; break;
    }
    if (!cut) break;
  }
  if (V.length === 3) idx.push(V[0],V[1],V[2]);
  return idx;
}

/* ---------- matrices 4x4, colonne-majeur ---------- */
const M = {
  id: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  mul: (a,b) => { const o=new Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++){ let s=0;
      for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; } return o; },
  T: (x,y,z) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
  RX: t => { const c=Math.cos(t), s=Math.sin(t); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
  RY: t => { const c=Math.cos(t), s=Math.sin(t); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
  apply: (m,x,y,z) => [ m[0]*x+m[4]*y+m[8]*z+m[12],
                        m[1]*x+m[5]*y+m[9]*z+m[13],
                        m[2]*x+m[6]*y+m[10]*z+m[14] ],
};

function Mesh(){ this.pos=[]; this.nrm=[]; this.idx=[]; }
Mesh.prototype.tri = function(a,b,c){
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
  const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  const L=Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
  const base=this.pos.length/3;
  for(const p of [a,b,c]){ this.pos.push(p[0],p[1],p[2]); this.nrm.push(nx,ny,nz); }
  this.idx.push(base,base+1,base+2);
};
Mesh.prototype.extrude = function(pts, len, m){
  const h=len/2, n=pts.length/2, P=(i,z)=>M.apply(m, pts[i*2], pts[i*2+1], z);
  for(let i=0;i<n;i++){ const j=(i+1)%n;
    this.tri(P(i,-h),P(j,-h),P(j,h)); this.tri(P(i,-h),P(j,h),P(i,h)); }
  const t=earcut(pts);
  for(let k=0;k<t.length;k+=3){
    this.tri(P(t[k],h),P(t[k+1],h),P(t[k+2],h));
    this.tri(P(t[k+2],-h),P(t[k+1],-h),P(t[k],-h));
  }
};
Mesh.prototype.box = function(sx,sy,sz,m){
  this.extrude([-sx/2,-sy/2, sx/2,-sy/2, sx/2,sy/2, -sx/2,sy/2], sz, m);
};
/* extrusion le long de X : la section est dessinee dans le plan YZ vu de face */
Mesh.prototype.extrudeX = function(pts, len, y, z){
  this.extrude(pts, len, M.mul(M.T(0, y||0, z||0), M.RY(PI/2)));
};

/* ============================ SECTIONS ============================= */

/* Glass Line : profil de base en U, 125 x 90 mm (catalogue STRUGAL) */
function uSection(w=125*MM, h=90*MM, slot=26*MM, depth=62*MM, ch=4*MM){
  const hw=w/2, s=slot/2, y0=h-depth;
  return [-hw+ch,0, hw-ch,0, hw,ch, hw,h-ch, hw-ch,h,
          s,h, s,y0, -s,y0, -s,h,
          -hw+ch,h, -hw,h-ch, -hw,ch];
}
/* main courante : capot en U retourne, pose sur le chant du verre */
function handrailSection(w=52*MM, h=34*MM, slot=26*MM, depth=24*MM, ch=5*MM){
  const hw=w/2, s=slot/2;
  return [-hw,0, -s,0, -s,depth, s,depth, hw,0,
          hw,h-ch, hw-ch,h, -hw+ch,h, -hw,h-ch];
}
function railSection(w,h,ch=4*MM){
  const hw=w/2, hh=h/2;
  return [-hw+ch,-hh, hw-ch,-hh, hw,-hh+ch, hw,hh-ch,
          hw-ch,hh, -hw+ch,hh, -hw,hh-ch, -hw,-hh+ch];
}

/* verres feuilletes du catalogue -> epaisseur totale (mm) */
const GLASS = {"66.2":12.8,"66.4":13.5,"88.2":16.8,"88.4":17.5,
               "1010.2":20.8,"1010.4":21.5};

const POST_MAX   = 1.20;      // entraxe maxi entre montants
const BAR_GAP_MAX = 110*MM;   // jour maxi : un enfant ne doit pas passer

/* ============================ GLASS LINE =========================== */
function buildGlassLine(o){
  const length=o.length, height=o.height;
  const t=(GLASS[o.glass]||17.5)*MM, uh=90*MM;
  const alu=new Mesh(), glz=new Mesh(), led=new Mesh();

  if (o.recessed){
    /* encastre : on ne modelise que ce qui depasse de la dalle, sinon la
       partie enterree ferait flotter tout l'objet en RA. */
    alu.box(length, 6*MM, 150*MM, M.T(0, 3*MM, 0));
  } else {
    alu.extrudeX(uSection(), length, 0, 0);
    const n = Math.max(2, Math.round(length/(150*MM)));   // M12 tous les 150 mm
    for(let i=0;i<n;i++){
      const x=-length/2+(i+0.5)*(length/n);
      alu.box(20*MM, 6*MM, 20*MM, M.T(x, uh-3*MM, 44*MM));
    }
  }
  const gBot = o.recessed ? 6*MM : 30*MM;
  const gTop = height - (o.handrail ? 10*MM : 0);
  glz.box(length-0.02, gTop-gBot, t, M.T(0, (gBot+gTop)/2, 0));

  if (o.handrail) alu.extrudeX(handrailSection(), length, height-34*MM, 0);
  if (o.led) for(const zs of [-1,1])
    led.box(length-0.06, 6*MM, 5*MM, M.T(0, gBot+14*MM, zs*(t/2+6*MM)));

  return {alu, glz, led};
}

/* ============================== S80B =============================== */
function buildS80B(o){
  const length=o.length, height=o.height, infill=o.infill||'barreaudage';
  const post=40*MM, bar=20*MM, gt=8.76*MM;
  const topH=42*MM, topW=52*MM, botH=24*MM, botW=40*MM, botY=110*MM;
  const topY=height-topH/2;
  const alu=new Mesh(), glz=new Mesh(), led=new Mesh();

  const nbays=Math.max(1, Math.ceil(length/POST_MAX));
  const span=length/nbays;
  for(let i=0;i<=nbays;i++){
    const x=-length/2+i*span;
    alu.extrude(railSection(post,post), height-topH,
                M.mul(M.T(x,(height-topH)/2,0), M.RX(-PI/2)));
    alu.box(110*MM, 8*MM, 110*MM, M.T(x, 4*MM, 0));
  }
  alu.extrudeX(railSection(topW,topH), length, topY, 0);
  if (infill!=='verre') alu.extrudeX(railSection(botW,botH), length, botY, 0);

  if (infill==='barreaudage' || infill==='mixte'){
    const bLo=botY+botH/2;
    const bHi=(infill==='barreaudage') ? (topY-topH/2)
                                       : botY+(height-botY)*0.45;
    for(let i=0;i<nbays;i++){
      const x0=-length/2+i*span+post/2, clear=span-post;
      const n=Math.max(1, Math.ceil(clear/(bar+BAR_GAP_MAX)));
      const pitch=clear/n;
      for(let k=0;k<n;k++)
        alu.box(bar, bHi-bLo, bar, M.T(x0+(k+0.5)*pitch, (bLo+bHi)/2, 0));
    }
    if (infill==='mixte'){
      const gLo=bHi+10*MM, gHi=topY-topH/2;
      glz.box(length-post, gHi-gLo, gt, M.T(0,(gLo+gHi)/2,0));
    }
  } else {
    const gLo=botY*0.35, gHi=topY-topH/2;
    glz.box(length-post, gHi-gLo, gt, M.T(0,(gLo+gHi)/2,0));
  }
  if (o.led) led.box(length-post, 5*MM, 6*MM, M.T(0, topY-topH/2-6*MM, 0));
  return {alu, glz, led};
}

function build(o){
  return (o.system === 's80b') ? buildS80B(o) : buildGlassLine(o);
}

/* ============================ EXPORT GLB =========================== */
function toGLB(parts, finish, tint, ledOn){
  const accessors=[], prims=[], materials=[], bufferViews=[], chunks=[];
  let offset=0;
  const push=(arr,ctor,target)=>{
    const bytes=new Uint8Array(new ctor(arr).buffer);
    while(offset%4){ chunks.push(new Uint8Array([0])); offset++; }
    bufferViews.push({buffer:0, byteOffset:offset, byteLength:bytes.length, target});
    chunks.push(bytes); offset+=bytes.length;
    return bufferViews.length-1;
  };
  const acc=(bv,type,comp,count,min,max)=>{
    accessors.push(Object.assign({bufferView:bv, componentType:comp, count, type},
                                 min?{min,max}:{}));
    return accessors.length-1;
  };
  const groups=[
    {m:parts.alu, mat:{name:'alu', color:finish.lin, metallic:finish.m, rough:finish.r, alpha:1}},
    {m:parts.glz, mat:{name:'verre', color:tint.lin, metallic:0, rough:tint.r,
                       alpha:tint.a, blend:true}},
  ];
  if (parts.led && parts.led.pos.length) groups.push({m:parts.led, mat:{
    name:'led', color: ledOn?[1,0.94,0.86]:[0.05,0.05,0.05], metallic:0, rough:0.25,
    alpha:1, emissive: ledOn?[1,0.94,0.82]:[0,0,0]}});

  for(const g of groups){
    if(!g.m || !g.m.pos.length) continue;
    const n=g.m.pos.length/3;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for(let i=0;i<n;i++) for(let k=0;k<3;k++){
      const v=g.m.pos[i*3+k]; if(v<mn[k])mn[k]=v; if(v>mx[k])mx[k]=v; }
    const pa=acc(push(g.m.pos,Float32Array,34962),'VEC3',5126,n,mn,mx);
    const na=acc(push(g.m.nrm,Float32Array,34962),'VEC3',5126,n);
    const ia=acc(push(g.m.idx,Uint32Array,34963),'SCALAR',5125,g.m.idx.length);
    const mi=materials.length;
    materials.push(Object.assign({
      name:g.mat.name, doubleSided:!!g.mat.blend,
      pbrMetallicRoughness:{baseColorFactor:[...g.mat.color, g.mat.alpha],
        metallicFactor:g.mat.metallic, roughnessFactor:g.mat.rough}},
      g.mat.blend?{alphaMode:'BLEND'}:{},
      g.mat.emissive?{emissiveFactor:g.mat.emissive}:{}));
    prims.push({attributes:{POSITION:pa, NORMAL:na}, indices:ia, material:mi});
  }

  let total=0; for(const c of chunks) total+=c.length;
  const gltf={asset:{version:'2.0', generator:'prompolu-gardecorps'},
    scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:prims}], materials, accessors, bufferViews,
    buffers:[{byteLength:total}]};

  const json=new TextEncoder().encode(JSON.stringify(gltf));
  const jpad=(4-json.length%4)%4;
  const jc=new Uint8Array(json.length+jpad); jc.set(json); jc.fill(0x20,json.length);
  const bpad=(4-total%4)%4, binLen=total+bpad;
  const out=new Uint8Array(12+8+jc.length+8+binLen);
  const dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546C67,true); dv.setUint32(4,2,true); dv.setUint32(8,out.length,true);
  dv.setUint32(12,jc.length,true); dv.setUint32(16,0x4E4F534A,true);
  out.set(jc,20);
  let p=20+jc.length;
  dv.setUint32(p,binLen,true); dv.setUint32(p+4,0x004E4942,true);
  p+=8; for(const c of chunks){ out.set(c,p); p+=c.length; }
  return new Blob([out],{type:'model/gltf-binary'});
}

global.GardeCorps = {
  build, toGLB, POST_MAX, BAR_GAP_MAX, GLASS,
  /* nombre de barreaux reellement pose, pour la fiche technique */
  barCount(length){
    const nbays=Math.max(1, Math.ceil(length/POST_MAX));
    const span=length/nbays, clear=span-40*MM;
    return nbays * Math.max(1, Math.ceil(clear/(20*MM+BAR_GAP_MAX)));
  },
  postCount(length){ return Math.max(1, Math.ceil(length/POST_MAX)) + 1; },
  makeURL(opts, finish, tint, ledOn){
    return URL.createObjectURL(toGLB(build(opts), finish, tint, ledOn));
  }
};
})(window);
