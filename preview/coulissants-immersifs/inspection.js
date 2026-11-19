import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createWindow,createCorner} from './model.js';
import {materials} from './experience-scene.js';
import {orangePeel} from './environment.js';
import {FINISHES} from './catalogue.js';

function cutCoating(base){
 const m=base.clone();m.name='RAL 9005 givré · chants sciés aluminium';
 m.onBeforeCompile=s=>{
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSectionP; varying vec3 vSectionN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSectionP = position; vSectionN = normal;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSectionP; varying vec3 vSectionN;').replace('#include <color_fragment>',`#include <color_fragment>
   float cutFace = ((vSectionP.x > .285 && vSectionN.x > .98) || (vSectionP.y > .285 && vSectionN.y > .98)) ? 1. : 0.;
   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.56,.59,.62), cutFace);`).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .32, cutFace);').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .85, cutFace);');
 };
 m.customProgramCacheKey=()=> 'catalogue-cut-edges-v1';return m;
}

export function createInspector(canvas){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e7e3');
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=1.6;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight('#ecf4ff','#b8b2a8',1.6));
 const key=new THREE.DirectionalLight('#fff0d9',3.5);key.position.set(-3,5,4);scene.add(key);
 const fill=new THREE.DirectionalLight('#d0e0ff',1.7);fill.position.set(3,2,-4);scene.add(fill);
 const camera=new THREE.PerspectiveCamera(36,1,.004,50),controls=new OrbitControls(camera,canvas);
 controls.enableDamping=false;controls.enablePan=false;controls.minDistance=.15;controls.maxDistance=12;controls.addEventListener('change',render);
 const mats=materials(FINISHES[0],orangePeel()),cut=cutCoating(mats.alu);
 const cutMats={...mats,alu:cut,alu_ext:cut,quinc:cut,verre_chant:new THREE.MeshPhysicalMaterial({color:'#6b9388',transparent:true,opacity:.68,roughness:.15,side:THREE.DoubleSide})};
 let object=null,model=null,current=null,mode='corner',opening=.35;
 const caches=new Map();
 function obtain(p,view){
  const section=view==='corner'||view==='profile',k=p.id+(section?':corner':':window');
  if(!caches.has(k))caches.set(k,section?createCorner(p,cutMats):createWindow(p,mats));
  return caches.get(k);
 }
 function show(p,view=mode){
  current=p;mode=view;opening=view==='centre'?0:.35;if(object)scene.remove(object);model=obtain(p,view);object=model.group;scene.add(object);
  object.position.set(0,0,0);object.rotation.set(0,0,0);controls.reset();camera.up.set(0,1,0);camera.far=50;
  if(view==='corner'||view==='profile'){
   const w=model.width||.32,h=model.height||.32;
   object.position.set(-w*.46,-h*(canvas.clientWidth<550?.62:.55),0);controls.target.set(0,0,0);camera.position.set(.62,.45,.86);controls.minDistance=.18;controls.maxDistance=1.8;
   if(view==='profile'){
    const points=Object.values(model.info.source.side).flat().flatMap(p=>p.outer),x=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))*.0005+object.position.x;
    const y=object.position.y+h;camera.up.set(0,0,-1);controls.target.set(x,y,0);camera.position.set(x,y+.40,.00001);camera.far=.50;controls.minDistance=.20;controls.maxDistance=.46;
   }
  }else{
   model.setOpen(view==='centre'?0:opening);
   if(view==='overview'){
    controls.target.set(0,p.height*.5,0);camera.position.set(p.width*.65,p.height*.75,p.width*1.45);controls.minDistance=1;controls.maxDistance=12;
   }else if(view==='centre'){
    const a=model.info.anchors.meet;controls.target.set(...a);camera.position.set(a[0]+.32,a[1]+.19,a[2]+.48);controls.minDistance=.17;controls.maxDistance=1.8;
   }else{
    const x=model.clearLeft+.20;controls.target.set(x,.06,0);camera.position.set(x+.30,.40,.54);controls.minDistance=.15;controls.maxDistance=1.8;
   }
  }
  controls.update();resize();render();
 }
 function render(){renderer.render(scene,camera);}
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
 function setOpening(value){opening=value;if(model&&mode!=='corner'&&mode!=='profile'){model.setOpen(value);render();}}
 function pause(){controls.enabled=false;}
 function resume(){controls.enabled=true;resize();}
 return {show,resize,pause,resume,setOpening,renderer,scene,camera,get mode(){return mode;},get model(){return model;}};
}
