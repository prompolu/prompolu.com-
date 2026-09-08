/* =====================================================================
 *  pergola.js — genere la pergola a la volee, aux cotes exactes.
 *
 *  Meme logique que le generateur Python : on dessine une SECTION 2D et
 *  on l'extrude, comme une vraie filiere d'aluminium. Aucune dependance
 *  (pas de three.js : 600 Ko qu'on ne peut pas se permettre ici).
 *  Sortie : un .glb en memoire, passe a <model-viewer> via une blob URL.
 * ===================================================================== */
(function (global) {
'use strict';

const MM = 0.001;

/* ---------- earcut (triangulation de polygone), version compacte -----
   MIT, d'apres mapbox/earcut. Necessaire pour les faces d'extremite :
   nos sections ne sont pas convexes (gouttiere du bandeau, crochet des
   lames), donc un simple eventail de triangles ne suffit pas.        */
function earcut(data) {
  const n = data.length >> 1;
  const idx = []; const V = [];
  for (let i = 0; i < n; i++) V.push(i);
  // aire signee pour connaitre l'orientation
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++)
    area += (data[j*2] - data[i*2]) * (data[i*2+1] + data[j*2+1]);
  if (area > 0) V.reverse();

  const inTri = (ax,ay,bx,by,cx,cy,px,py) => {
    const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);
    const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);
    const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);
    const neg=(d1<0)||(d2<0)||(d3<0), pos=(d1>0)||(d2>0)||(d3>0);
    return !(neg&&pos);
  };

  let guard = 0;
  while (V.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < V.length; i++) {
      const a = V[(i + V.length - 1) % V.length], b = V[i], c = V[(i + 1) % V.length];
      const ax=data[a*2],ay=data[a*2+1], bx=data[b*2],by=data[b*2+1], cx=data[c*2],cy=data[c*2+1];
      if ((bx-ax)*(cy-ay) - (by-ay)*(cx-ax) <= 0) continue;   // pas convexe
      let ok = true;
      for (const v of V) {
        if (v===a||v===b||v===c) continue;
        if (inTri(ax,ay,bx,by,cx,cy,data[v*2],data[v*2+1])) { ok=false; break; }
      }
      if (!ok) continue;
      idx.push(a,b,c); V.splice(i,1); clipped = true; break;
    }
    if (!clipped) break;              // polygone degenere : on s'arrete
  }
  if (V.length === 3) idx.push(V[0],V[1],V[2]);
  return idx;
}

/* ---------- petite algebre 4x4 (colonne-majeur comme glTF) ---------- */
const M = {
  id: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  mul: (a,b) => { const o=new Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++){ let s=0;
      for(let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r]=s; } return o; },
  T: (x,y,z) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
  RX: t => { const c=Math.cos(t), s=Math.sin(t);
    return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
  RY: t => { const c=Math.cos(t), s=Math.sin(t);
    return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
  apply: (m,x,y,z) => [ m[0]*x+m[4]*y+m[8]*z+m[12],
                        m[1]*x+m[5]*y+m[9]*z+m[13],
                        m[2]*x+m[6]*y+m[10]*z+m[14] ],
};

/* ---------- accumulateur de maillage ---------- */
function Mesh() { this.pos=[]; this.nrm=[]; this.idx=[]; }
Mesh.prototype.tri = function (a,b,c) {
  const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
  const vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  const L=Math.hypot(nx,ny,nz) || 1; nx/=L; ny/=L; nz/=L;
  const base=this.pos.length/3;
  for (const p of [a,b,c]) { this.pos.push(p[0],p[1],p[2]); this.nrm.push(nx,ny,nz); }
  this.idx.push(base,base+1,base+2);
};

/* Extrude une section 2D (dans le plan XY) sur `len` en Z, puis applique
   la matrice `m`. Faces laterales + deux faces d'extremite.            */
Mesh.prototype.extrude = function (pts2d, len, m) {
  const h = len/2, n = pts2d.length/2;
  const P = (i,z) => M.apply(m, pts2d[i*2], pts2d[i*2+1], z);
  for (let i=0;i<n;i++){
    const j=(i+1)%n;
    const a=P(i,-h), b=P(j,-h), c=P(j,h), d=P(i,h);
    this.tri(a,b,c); this.tri(a,c,d);
  }
  const tri = earcut(pts2d);
  for (let k=0;k<tri.length;k+=3){
    this.tri(P(tri[k],h), P(tri[k+1],h), P(tri[k+2],h));
    this.tri(P(tri[k+2],-h), P(tri[k+1],-h), P(tri[k],-h));
  }
};

/* Boite alignee, exprimee comme une extrusion (evite du code en double) */
Mesh.prototype.box = function (sx, sy, sz, m) {
  this.extrude([-sx/2,-sy/2, sx/2,-sy/2, sx/2,sy/2, -sx/2,sy/2], sz, m);
};

/* ============================ SECTIONS ============================= */

/* Montant 160x160, coins chanfreines + rainure centrale par face.
   Plein et non creux : l'interieur d'un montant scelle n'est jamais
   visible, et cela evite une triangulation a trou.                    */
function postSection(sec, cham, revW, revD) {
  const h=sec/2, c=h-cham, rw=revW/2, p=[];
  const edge=(p0,p1,nx,ny)=>{
    const dx=p1[0]-p0[0], dy=p1[1]-p0[1], L=Math.hypot(dx,dy);
    const ux=dx/L, uy=dy/L, mx=(p0[0]+p1[0])/2, my=(p0[1]+p1[1])/2;
    p.push(p0[0],p0[1]);
    p.push(mx-ux*rw, my-uy*rw);
    p.push(mx-ux*rw*0.72-nx*revD, my-uy*rw*0.72-ny*revD);
    p.push(mx+ux*rw*0.72-nx*revD, my+uy*rw*0.72-ny*revD);
    p.push(mx+ux*rw, my+uy*rw);
  };
  edge([h,-c],[h,c],1,0); edge([c,h],[-c,h],0,1);
  edge([-h,c],[-h,-c],-1,0); edge([-c,-h],[c,-h],0,-1);
  return p;
}

/* Bandeau perimetrique avec gouttiere integree. Face exterieure en +x. */
function beamSection(w, h, wall, ledD) {
  const hw=w/2, hh=h/2, ch=8*MM;
  const gutW = w - wall*2 - 46*MM, gutD = h*0.52;
  return [
    hw-ch,-hh,  hw,-hh+ch,
    hw,-hh+26*MM,  hw-2.5*MM,-hh+30*MM,  hw-2.5*MM,-hh+44*MM,  hw,-hh+48*MM,
    hw,hh-ch,  hw-ch,hh,
    hw-wall-14*MM,hh,  hw-wall-14*MM,hh-gutD,
    hw-wall-14*MM-gutW,hh-gutD,  hw-wall-14*MM-gutW,hh,
    -hw+ch,hh,  -hw,hh-ch,
    -hw,-hh+ledD+16*MM,  -hw+ledD,-hh+ledD+12*MM,  -hw+ledD,-hh+10*MM,  -hw,-hh+6*MM,
    -hw+ch,-hh
  ];
}

/* Lame orientable : profil aerodynamique, crochet d'un cote, gorge de
   joint de l'autre.                                                    */
function bladeSection(w, t) {
  const n=26, top=[], bot=[];
  for (let i=0;i<n;i++){
    const x=-1+2*i/(n-1);
    top.push(x*w/2, (t/2)*Math.pow(Math.max(0,1-x*x),0.55));
  }
  for (let i=n-1;i>=0;i--){
    const x=-1+2*i/(n-1);
    bot.push(x*w/2, -(t/2)*0.62*Math.pow(Math.max(0,1-x*x),0.5));
  }
  const hook=[w/2+9*MM,1.5*MM, w/2+9*MM,9*MM, w/2+5*MM,10*MM, w/2+5*MM,2*MM];
  const groove=[-w/2-5*MM,-1*MM, -w/2-11*MM,-2*MM, -w/2-11*MM,-9*MM, -w/2-4*MM,-8*MM];
  return top.concat(hook, bot, groove);
}
function gasketSection(w) {
  const x0=w/2+5*MM;
  return [x0,2.5*MM, x0+4.5*MM,3.5*MM, x0+4.5*MM,8.5*MM, x0,9.5*MM];
}

/* ============================ ASSEMBLAGE =========================== */
const PI = Math.PI;

function build(opts) {
  const width  = opts.width,  depth = opts.depth;
  const height = opts.height || 2.60;
  const post   = 160*MM, beamH = 200*MM;
  const bladeW = 200*MM, bladeT = 34*MM, gap = 8*MM;
  const ang    = (opts.angleDeg !== undefined ? opts.angleDeg : 38) * PI/180;

  const alu = new Mesh(), seal = new Mesh(), led = new Mesh();

  const postH = height - beamH;
  const hx = width/2 - post/2, hz = depth/2 - post/2;

  /* montants + platines + trim */
  const ps = postSection(post, 10*MM, 26*MM, 3*MM);
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    alu.extrude(ps, postH, M.mul(M.T(sx*hx, postH/2, sz*hz), M.RX(-PI/2)));
    alu.box(240*MM, 12*MM, 240*MM, M.T(sx*hx, 6*MM, sz*hz));
    alu.box(post+26*MM, 55*MM, post+26*MM, M.T(sx*hx, 40*MM, sz*hz));
  }

  /* bandeaux perimetriques */
  const by = postH + beamH/2;
  const bs = beamSection(post, beamH, 4*MM, 12*MM);
  const sides = [
    [depth, M.id(),      [ width/2-post/2, by, 0]],
    [depth, M.RY(PI),    [-width/2+post/2, by, 0]],
    [width, M.RY(-PI/2), [0, by,  depth/2-post/2]],
    [width, M.RY(PI/2),  [0, by, -depth/2+post/2]],
  ];
  for (const [len, rot, pos] of sides) {
    alu.extrude(bs, len, M.mul(M.T(pos[0],pos[1],pos[2]), rot));
    if (opts.led) {
      const inX = pos[0] ? -Math.sign(pos[0]) : 0, inZ = pos[2] ? -Math.sign(pos[2]) : 0;
      const t = M.T(pos[0]+inX*(post/2-6*MM), by-beamH/2+20*MM, pos[2]+inZ*(post/2-6*MM));
      if (Math.abs(rot[0]) > 0.5) led.box(10*MM, 5*MM, len-0.2, t);
      else                        led.box(len-0.2, 5*MM, 10*MM, t);
    }
  }

  /* lames */
  const clear = depth - post, pitch = bladeW + gap;
  const nb = Math.max(1, Math.round(clear / pitch));
  const span = (nb-1)*pitch;
  const ly = postH + beamH - bladeT*1.6;
  const bl = width - post + 0.006;
  const ss = bladeSection(bladeW, bladeT), gs = gasketSection(bladeW);
  for (let i=0;i<nb;i++){
    const z = -span/2 + i*pitch;
    const m = M.mul(M.mul(M.T(0, ly, z), M.RX(ang)), M.RY(PI/2));
    alu.extrude(ss, bl, m);
    seal.extrude(gs, bl-0.01, m);
    for (const sz of [-1,1]) {
      alu.box(bladeW*0.92, bladeT*0.8, 10*MM, M.mul(m, M.T(0,0,sz*(bl/2+4*MM))));
      alu.box(18*MM, 18*MM, 26*MM,      M.mul(m, M.T(0,0,sz*(bl/2+18*MM))));
    }
  }
  return {alu, seal, led, blades: nb};
}

/* ============================ EXPORT GLB =========================== */
function toGLB(parts, finish, ledOn) {
  const bin = [], accessors = [], meshPrims = [], materials = [];
  const chunks = [];
  let offset = 0;
  const bufferViews = [];

  function push(arr, ctor, target) {
    const data = new ctor(arr);
    const bytes = new Uint8Array(data.buffer);
    while (offset % 4) { chunks.push(new Uint8Array([0])); offset++; }
    const bv = bufferViews.length;
    bufferViews.push({buffer:0, byteOffset:offset, byteLength:bytes.length, target});
    chunks.push(bytes); offset += bytes.length;
    return bv;
  }
  function addAccessor(bv, type, comp, count, min, max) {
    accessors.push(Object.assign({bufferView:bv, componentType:comp, count, type},
                                 min?{min,max}:{}));
    return accessors.length-1;
  }

  const groups = [
    {m:parts.alu,  mat:{name:'alu',  color:finish.lin, metallic:finish.m, rough:finish.r}},
    {m:parts.seal, mat:{name:'seal', color:[0.06,0.06,0.07], metallic:0, rough:0.92}},
  ];
  if (parts.led.pos.length) groups.push({m:parts.led, mat:{name:'led',
    color: ledOn?[1,0.97,0.90]:[0.05,0.05,0.05], metallic:0, rough:0.25,
    emissive: ledOn?[1,0.94,0.82]:[0,0,0]}});

  for (const g of groups) {
    if (!g.m.pos.length) continue;
    const n = g.m.pos.length/3;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for (let i=0;i<n;i++) for (let k=0;k<3;k++){
      const v=g.m.pos[i*3+k]; if(v<mn[k])mn[k]=v; if(v>mx[k])mx[k]=v; }
    const pv = push(g.m.pos, Float32Array, 34962);
    const nv = push(g.m.nrm, Float32Array, 34962);
    const iv = push(g.m.idx, Uint32Array, 34963);
    const pa = addAccessor(pv, 'VEC3', 5126, n, mn, mx);
    const na = addAccessor(nv, 'VEC3', 5126, n);
    const ia = addAccessor(iv, 'SCALAR', 5125, g.m.idx.length);
    const mat = materials.length;
    materials.push({name:g.mat.name, doubleSided:false,
      pbrMetallicRoughness:{baseColorFactor:[...g.mat.color,1],
        metallicFactor:g.mat.metallic, roughnessFactor:g.mat.rough},
      ...(g.mat.emissive?{emissiveFactor:g.mat.emissive}:{})});
    meshPrims.push({attributes:{POSITION:pa, NORMAL:na}, indices:ia, material:mat});
  }

  let total = 0; for (const c of chunks) total += c.length;
  const gltf = {
    asset:{version:'2.0', generator:'prompolu-pergola'},
    scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:meshPrims}], materials, accessors, bufferViews,
    buffers:[{byteLength:total}]
  };

  const enc = new TextEncoder();
  let json = enc.encode(JSON.stringify(gltf));
  const jpad = (4 - json.length%4)%4;
  const jsonChunk = new Uint8Array(json.length + jpad);
  jsonChunk.set(json); jsonChunk.fill(0x20, json.length);
  const bpad = (4 - total%4)%4;
  const binLen = total + bpad;

  const out = new Uint8Array(12 + 8 + jsonChunk.length + 8 + binLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, jsonChunk.length, true); dv.setUint32(16, 0x4E4F534A, true);
  out.set(jsonChunk, 20);
  let p = 20 + jsonChunk.length;
  dv.setUint32(p, binLen, true); dv.setUint32(p+4, 0x004E4942, true);
  p += 8;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return new Blob([out], {type:'model/gltf-binary'});
}

global.Pergola = {
  build,
  toGLB,
  /* raccourci : cotes en metres -> blob URL */
  makeURL(opts, finish, ledOn) {
    const parts = build(opts);
    return {url: URL.createObjectURL(toGLB(parts, finish, ledOn)), blades: parts.blades};
  }
};
})(window);
