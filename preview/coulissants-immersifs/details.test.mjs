import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PRODUCTS,STATIONS,openingAt,travelAt} from './catalogue.js';
import {PROFILES,profileExtrusion} from './catalogue-section.js';
globalThis.window={};
const {createWindow,createCorner}=await import('./model.js');
const material=new THREE.MeshStandardMaterial();
const mats=new Proxy({}, {get:()=>material});
const models=PRODUCTS.map(p=>createWindow(p,mats));

test('catalogue configurations have different leaves, rail counts and published centre joints',()=>{
 assert.deepEqual(models.map(m=>m.leaves.length),[3,2,2,4,2,3,4,2,2,2,2]);
 assert.equal(models[0].info.ntr,3);assert.equal(models[5].info.ntr,3);
 assert.equal(models[2].info.Fi*2,42);assert.equal(models[4].info.Fi*2,20);assert.equal(models[10].info.Fi*2,25);
 assert.equal(models[8].info.levage,true);assert.equal(models[9].info.levage,true);
 assert.ok(models[10].groundOffset<0);
 assert.deepEqual(PRODUCTS.filter(p=>/PRIME|ELEV/.test(p.id)),[]);
});

test('camera corridor clears each moving sash at every threshold crossing',()=>{
 for(let i=0;i<models.length;i++){
  const model=models[i],p=.2+.8*(3.2-STATIONS[i].z)/(3.2-STATIONS.at(-1).z+3.1);
  const cameraZ=travelAt(p),open=openingAt(cameraZ,STATIONS[i].z);model.setOpen(open);
  assert.equal(open,1,PRODUCTS[i].id);
  assert.ok(model.passX>model.clearLeft+.1&&model.passX<model.clearRight-.1,PRODUCTS[i].id);
  for(const leaf of model.leaves)if(leaf.travel)assert.ok(Math.abs(leaf.group.position.x-leaf.travel)<1e-6);
 }
});

test('catalogue detail samples use ten independent source sections and expose the missing S90RP source',()=>{
 for(const p of PRODUCTS){
  const corner=createCorner(p,mats);
  if(p.id==='S90RP'){assert.equal(corner,null);continue;}
  assert.equal(corner.sourceBased,true,p.id);
  assert.equal(corner.info.source,PROFILES[p.id]);
  corner.group.traverse(m=>{
   if(!m.isMesh)return;
   const pos=m.geometry.attributes.position;
   assert.ok([...pos.array].every(Number.isFinite),p.id+' positions');
   assert.ok([...m.geometry.attributes.normal.array].every(Number.isFinite),p.id+' normals');
   if(m.geometry.index)assert.ok([...m.geometry.index.array].every(i=>i<pos.count),p.id+' indices');
  });
 }
 assert.equal(Object.values(PROFILES).filter(p=>p.completeCorner).length,7);
 assert.equal(Object.values(PROFILES).filter(p=>!p.completeCorner).length,3);
});

test('source section extrusion retains every probed air chamber and sawn aluminium face',()=>{
 const doubleSided=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 let holes=0,solids=0;
 for(const [system,source]of Object.entries(PROFILES))for(const section of [source.side,source.bottom].filter(Boolean))for(const profiles of Object.values(section))for(const profile of profiles){
  const geometry=profileExtrusion(profile,100),mesh=new THREE.Mesh(geometry,[doubleSided,doubleSided,doubleSided]);
  mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster();
  for(const [u,z]of profile.holeProbes){
   ray.set(new THREE.Vector3(u*.001,.101,z*.001),new THREE.Vector3(0,-1,0));
   assert.equal(ray.intersectObject(mesh).length,0,system+' chamber stays hollow');holes++;
  }
  const [u,z]=profile.solidProbe;ray.set(new THREE.Vector3(u*.001,.101,z*.001),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(mesh)[0];assert.ok(hit,system+' aluminium cap exists');
  assert.ok(Math.abs(hit.distance-.001)<.00001,system+' cap at original extrusion end');solids++;
  geometry.dispose();
 }
 assert.ok(holes>50);assert.ok(solids>40);
});
