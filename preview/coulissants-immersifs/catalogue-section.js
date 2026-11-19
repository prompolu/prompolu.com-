import * as THREE from 'three';
import PROFILES from './source-profiles.json' with {type:'json'};

export {PROFILES};
const mm=.001;
const bounds=parts=>{
 const points=parts.flatMap(p=>p.outer);
 return {u0:Math.min(...points.map(p=>p[0])),u1:Math.max(...points.map(p=>p[0])),z0:Math.min(...points.map(p=>p[1])),z1:Math.max(...points.map(p=>p[1]))};
};
const glassCentres={S70P:-17,S70R:10.5,S86RP:18.29,S88R:-40.5,S88RP:-30.3,S90P:-24.1,S90R:-24.1,S110P:-27,S125RP:-32.1,S140RP:-38};

/** Extrude the original PDF contour, including its original holes. Caps expose
 * aluminium; the long faces keep the requested powder coating. No chamber is
 * replaced by a box and no outline is stretched to fit a different rail pitch. */
export function profileExtrusion(profile,length,horizontal=false,startAt=()=>0){
 const rings=[profile.outer,...profile.holes],flat=rings.flat();
 const vectors=r=>r.map(p=>new THREE.Vector2(...p));
 const triangles=THREE.ShapeUtils.triangulateShape(vectors(rings[0]),rings.slice(1).map(vectors));
 const pos=[],normal=[],uv=[],groups=[];
 const point=(p,s)=>horizontal?[s*mm,p[0]*mm,p[1]*mm]:[p[0]*mm,s*mm,p[1]*mm];
 function tri(a,b,c,index){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),C=new THREE.Vector3(...c);
  const n=B.clone().sub(A).cross(C.clone().sub(A)).normalize();
  const first=pos.length/3;
  for(const p of [a,b,c]){pos.push(...p);normal.push(n.x,n.y,n.z);uv.push((p[0]+p[2])*3,p[1]*3);}
  const last=groups.at(-1);if(last?.materialIndex===index)last.count+=3;else groups.push({start:first,count:3,materialIndex:index});
 }
 for(const [r,ring]of rings.entries()){
  const area=ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0);
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],loA=startAt(a[0]),loB=startAt(b[0]);
   const pts=[point(a,loA),point(b,loB),point(b,length),point(a,length)];
   // Cross-product differs between a horizontal and a vertical extrusion.
   const reverse=(area>0)!==Boolean(r);
   if(reverse!==horizontal)pts.reverse();
   tri(pts[0],pts[1],pts[2],r?2:1);tri(pts[0],pts[2],pts[3],r?2:1);
  }
 }
 for(const ids of triangles){
  const high=ids.map(i=>point(flat[i],length));
  const low=ids.map(i=>point(flat[i],startAt(flat[i][0])));
  tri(...high,0);tri(...low.reverse(),0);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);
 geometry.computeBoundingSphere();return geometry;
}

function pane(polygon,z,thickness,glass,edge){
 const shape=new THREE.Shape(polygon.map(p=>new THREE.Vector2(...p.map(x=>x*mm))));
 const g=new THREE.ExtrudeGeometry(shape,{depth:thickness*mm,steps:1,bevelEnabled:false});
 const m=new THREE.Mesh(g,[glass,edge]);m.position.z=(z-thickness/2)*mm;m.renderOrder=2;return m;
}

export function createCatalogueSection(product,mats){
 const source=PROFILES[product.id];if(!source)return null;
 const group=new THREE.Group(),height=440,width=330,hasBottom=source.completeCorner;
 const raw=mats.alu_core.clone();raw.side=THREE.DoubleSide;
 const coat=mats.alu.clone();coat.side=THREE.DoubleSide;
 const core=raw.clone();core.roughness=.55;
 const materials=[raw,coat,core];
 const sideBounds=bounds(source.side.sash),bottomBounds=hasBottom&&source.bottom.sash.length?bounds(source.bottom.sash):null;
 function add(parts,horizontal,start){
  for(const profile of parts){
   const mesh=new THREE.Mesh(profileExtrusion(profile,horizontal?width:height,horizontal,start),materials);
   mesh.castShadow=mesh.receiveShadow=true;mesh.userData.source='manufacturer-pdf-vector';mesh.userData.system=product.id;
   mesh.userData.finish=true;group.add(mesh);
  }
 }
 add(source.side.frame,false,u=>hasBottom?Math.max(0,u):0);
 const bottomStart=bottomBounds?.u0||0;
 add([...source.side.sash,...source.side.bead],false,u=>hasBottom?(source.joint==='mitre'?bottomStart+Math.max(0,u-sideBounds.u0):(bottomBounds?.u1||53.5)):0);
 if(hasBottom){
  add(source.bottom.frame,true,u=>Math.max(0,u));
  if(bottomBounds)add([...source.bottom.sash,...source.bottom.bead],true,u=>source.joint==='mitre'?sideBounds.u0+Math.max(0,u-bottomStart):sideBounds.u1);
 }
 const x0=sideBounds.u1-source.bite,y0=bottomBounds?bottomBounds.u1-source.bite:hasBottom?53.5:0;
 const z=glassCentres[product.id],g=source.glass,t=g<=7?g:g>=28?6:4;
 const polygon=[[x0,y0],[width-15,y0],[width-15,height-72],[width-65,height-12],[x0,height-12]];
 const edge=mats.verre_chant||new THREE.MeshStandardMaterial({color:'#7a9a8e',roughness:.22,transparent:true,opacity:.65,side:THREE.DoubleSide});
 group.add(pane(polygon,z-(g-t)/2,t,mats.verre,edge));
 if(g>7){
  group.add(pane(polygon,z+(g-t)/2,t,mats.verre,edge));
  // The visible IGU spacer is separate from both panes. It is intentionally
  // described as schematic; hardware geometry is not supplied by these paths.
  const spacer=mats.intercalaire||new THREE.MeshStandardMaterial({color:'#303635',roughness:.8});
  const strip=new THREE.Mesh(new THREE.BoxGeometry((width-15-x0)*mm,5*mm,(g-2*t)*mm),spacer);
  strip.position.set((x0+width-15)*mm/2,(y0+5)*mm,z*mm);group.add(strip);
  const upright=new THREE.Mesh(new THREE.BoxGeometry(5*mm,(height-12-y0)*mm,(g-2*t)*mm),spacer);
  upright.position.set((x0+5)*mm,(y0+height-12)*mm/2,z*mm);group.add(upright);
 }
 group.userData.source=source.reference;group.userData.completeCorner=hasBottom;
 return {group,info:{key:product.id,source,sourceBased:true},sourceBased:true,width:width*mm,height:height*mm};
}
