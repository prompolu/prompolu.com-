import * as THREE from 'three';
import './window-geometry.js';
function geometry(data){
 const g=new THREE.BufferGeometry(),pos=Float32Array.from(data.pos,x=>x*.001),uv=new Float32Array(pos.length/3*2);
 for(let i=0;i<pos.length/3;i++){uv[i*2]=(pos[i*3]+pos[i*3+2])*3;uv[i*2+1]=pos[i*3+1]*3;}
 g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.nrm,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(data.idx);g.computeBoundingSphere();return g;
}
export function part(data,mats){
 const group=new THREE.Group();
 for(const [key,mesh]of Object.entries(data)){
  if(!mesh.pos.length)continue;const m=new THREE.Mesh(geometry(mesh),mats[key]||mats.alu);
  m.castShadow=m.receiveShadow=key!=='verre';m.userData.finish=['alu','alu_ext','quinc'].includes(key);
  m.userData.component=key;
  if(key==='verre')m.renderOrder=2;group.add(m);
 }return group;
}
export function createWindow(product,mats){
 const b=window.Coulissant.build({system:product.id,width:product.width,height:product.height,leaves:product.leaves||2,tracks:product.tracks,profile:product.profile,noeud20:product.noeud20,drainage:product.drainage,reinforced:product.reinforced,levage:false,context:false});
 const group=new THREE.Group(),fixed=part(b.P.static.m,mats);group.add(fixed);
 const leaves=b.P.leaves.map(l=>{
  const g=part(l.m,mats);group.add(g);let handle=null;
  if(l.handle){handle=part({quinc:l.handle.mesh},mats);handle.position.fromArray(l.handle.pivot.map(x=>x*.001));g.add(handle);}
  return {group:g,travel:(l.travel||0)*.001,handle,angle:l.handle?.angle||0};
 });
 const moving=b.P.leaves.find(l=>l.travel>0),clearLeft=-product.width/2+b.S.Ff*.001,clearRight=moving?moving.x[0]*.001+moving.travel*.001:0;
 return {group,fixed,leaves,passX:(clearLeft+clearRight)/2,clearLeft,clearRight,groundOffset:b.S.seuil==='encastre'?-b.S.Ff*.001:0,info:b,setOpen(t){leaves.forEach(l=>{if(l.travel){l.group.position.x=l.travel*t;l.group.position.y=b.levage?Math.min(1,t*4)*.006:0;if(l.handle)l.handle.rotation.z=l.angle*Math.min(1,t*4);}});}};
}
export function createCorner(product,mats){
 const b=window.Coulissant.buildCorner({system:product.id,tracks:product.tracks,profile:product.profile,noeud20:product.noeud20,drainage:product.drainage});
 return {group:part(b.P.static.m,mats),info:b};
}
