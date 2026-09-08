/* =====================================================================
 *  coulissants.js — genere la baie coulissante aux cotes exactes.
 *
 *  Donnees reelles (page /coulissants.html + catalogue STRUGAL) :
 *    le nombre du nom = profondeur du cadre en mm (S70 -> 70, S140 -> 140).
 *    S86RP : 42 mm au centre. S140RP Infinity : meneau central de 25 mm.
 *    Poids/vantail, cotes maxi et vitrage repris tels quels.
 *  Les masses vues non publiees sont reconstituees, et signalees dans l'UI.
 *
 *  Autonome : ne partage rien avec pergola.js ni gardecorps.js.
 * ===================================================================== */
(function (global) {
'use strict';
const MM = 0.001, PI = Math.PI;

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
  S70P:  {depth:70,  centre:62, vmax:[1200,2400], kg:80,  glass:21, tag:'Coulissant standard',       exact:false},
  S70R:  {depth:70,  centre:58, vmax:[1200,2400], kg:80,  glass:19, tag:'Rupture de pont thermique', exact:false},
  S86RP: {depth:86,  centre:42, vmax:[2000,2500], kg:140, glass:24, tag:'Minimaliste, RPT',          exact:true},
  S88R:  {depth:88,  centre:70, vmax:[3300,3200], kg:300, glass:32, tag:'Coulissant & levage',       exact:false},
  S88RP: {depth:88,  centre:70, vmax:[3300,3200], kg:300, glass:32, tag:'Levage polyvalent',         exact:false},
  S90P:  {depth:90,  centre:66, vmax:[2200,2600], kg:160, glass:26, tag:'Économique',                exact:false},
  S90R:  {depth:90,  centre:64, vmax:[2200,2600], kg:160, glass:23, tag:'Sécurité renforcée',        exact:false},
  S90RP: {depth:90,  centre:64, vmax:[2000,2500], kg:160, glass:24, tag:'Rupture de pont thermique', exact:false},
  S110P: {depth:110, centre:78, vmax:[3200,3000], kg:400, glass:27, tag:'Grand format architectural',exact:false},
  S125RP:{depth:125, centre:74, vmax:[3200,3200], kg:400, glass:30, tag:'Lift & slide premium',      exact:false},
  S140RP:{depth:140, centre:25, vmax:[2600,3200], kg:300, glass:32, tag:'Lift & slide Infinity',     exact:true},
};

function frameSection(depth, face, ch){
  ch = ch===undefined ? 3*MM : ch;
  const hd=depth/2, hf=face/2;
  return [-hd+ch,-hf, hd-ch,-hf, hd,-hf+ch, hd,hf-ch,
          hd-ch,hf, -hd+ch,hf, -hd,hf-ch, -hd,-hf+ch];
}

function build(o){
  const S = SYSTEMS[o.system] || SYSTEMS.S90RP;
  const width=o.width, height=o.height, leaves=o.leaves;
  const D=S.depth*MM, F=54*MM, C=S.centre*MM, gt=S.glass*MM;
  const alu=new Mesh(), glz=new Mesh();

  /* dormant. Orientation : un montant veut sa masse vue en X local et sa
     profondeur en Y local ; une traverse veut l'inverse. */
  const secV=frameSection(F,D), secH=frameSection(D,F);
  for(const sx of [-1,1])
    alu.extrude(secV, height, M.mul(M.T(sx*(width/2-F/2), height/2, 0), M.RX(-PI/2)));
  for(const yy of [F/2, height-F/2])
    alu.extrude(secH, width-2*F, M.mul(M.T(0, yy, 0), M.RY(PI/2)));

  /* rails */
  const ntr=Math.max(2, Math.min(leaves,4));
  const pitch=(D-16*MM)/ntr;
  const z0=-D/2 + pitch/2 + 8*MM;
  for(let i=0;i<ntr;i++)
    alu.box(width-2*F, 9*MM, 5*MM, M.T(0, F+4*MM, z0+i*pitch));

  /* vantaux */
  const clearW=width-2*F, clearH=height-2*F;
  const leafW=(clearW+(leaves-1)*C)/leaves;
  const lt=pitch*0.72;
  const lsecV=frameSection(C,lt), lsecH=frameSection(lt,C);
  /* ouverture : le vantail 0 (celui qui porte la poignee) coulisse sur son
     propre rail et vient se ranger derriere son voisin. Course : leafW - C. */
  const op=Math.min(1, Math.max(0, +o.opening || 0));
  for(let i=0;i<leaves;i++){
    const x0=-clearW/2 + i*(leafW-C);
    let cx=x0+leafW/2;
    if(i===0 && op>0) cx += (leafW-C)*op;
    const cz=z0+(i%ntr)*pitch;
    for(const sx of [-1,1])
      alu.extrude(lsecV, clearH,
        M.mul(M.T(cx+sx*(leafW/2-C/2), F+clearH/2, cz), M.RX(-PI/2)));
    for(const yy of [F+C/2, height-F-C/2])
      alu.extrude(lsecH, leafW-2*C, M.mul(M.T(cx, yy, cz), M.RY(PI/2)));
    glz.box(leafW-2*C, clearH-2*C, gt, M.T(cx, height/2, cz));
    if(i===0)
      alu.box(20*MM, 190*MM, 22*MM,
        M.T(cx+leafW/2-C/2, height*0.45, cz+lt/2+11*MM));
  }
  return {alu, glz, leafW};
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
  const gltf={asset:{version:'2.0',generator:'prompolu-coulissant'},
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

/* Vue RA iPhone : Quick Look charge un fichier fige, on ne peut pas
   pre-generer les 11 systemes. Chacun est donc rattache au systeme de la
   gamme dont les masses vues sont les plus proches — et c'est ce NOM que
   l'interface affiche, pas une classe en millimetres. */
const AR_FAMILY = {
  S140RP:'S140RP',                                   // meneau 25 mm
  S86RP :'S86RP',                                    // 42 mm au centre
  S70P:'S90RP', S70R:'S90RP', S90P:'S90RP',
  S90R:'S90RP', S90RP:'S90RP',                       // famille S70 / S90
  S88R:'S110P', S88RP:'S110P', S125RP:'S110P', S110P:'S110P',  // grand format
};
const AR_WIDTH={2:240, 3:360, 4:480};

global.Coulissant = {
  SYSTEMS, build, toGLB, AR_FAMILY, AR_WIDTH,
  /* systeme reellement utilise par la vue en realite augmentee */
  arSystem(system){ return AR_FAMILY[system] || 'S90RP'; },
  /* largeur d'un vantail, utile pour verifier la cote maxi du systeme */
  leafWidth(system, width, leaves){
    const C=(SYSTEMS[system]||SYSTEMS.S90RP).centre*MM;
    return ((width-2*54*MM)+(leaves-1)*C)/leaves;
  },
  makeURL(opts, finish, tint){
    return URL.createObjectURL(toGLB(build(opts), finish, tint));
  }
};
})(window);
