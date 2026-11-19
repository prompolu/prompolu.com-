import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {orangePeel,groundedSky,roadStrip} from './environment.js';
import {createWindow} from './model.js';
import {STATIONS,FINISHES,clamp,smooth,travelAt,openingAt} from './catalogue.js';
const YAW=-1.4137,SUN=new THREE.Vector3(.802,.108,.587).normalize();
export function materials(finish,peel){
 // RAL 9005 givré: fine-grain, matte powder coating on every frame and sash.
 const alu=new THREE.MeshStandardMaterial({name:'RAL 9005 givré',color:finish.color,metalness:.05,roughness:.72,normalMap:peel,normalScale:new THREE.Vector2(.22,.22),envMapIntensity:1});
 const glass=new THREE.MeshPhysicalMaterial({color:'#e4efec',roughness:.025,metalness:0,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.7,ior:1.52});
 glass.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`diffuseColor.a = .045 + .40 * pow(1. - abs(dot(normalize(vViewPosition), normal)), 4.);\n#include <opaque_fragment>`);};
 glass.customProgramCacheKey=()=> 'pov-fresnel-glass-v1';
 const black=new THREE.MeshStandardMaterial({color:'#111315',roughness:.82}),steel=new THREE.MeshStandardMaterial({color:'#9b9d9e',metalness:1,roughness:.25});
 const core=new THREE.MeshStandardMaterial({name:'Aluminium brut intérieur',color:'#91999b',metalness:.85,roughness:.4});
 return {alu,alu_ext:alu,alu_core:core,verre:glass,quinc:alu,polyamide:black,joint:black,brosse:black,intercalaire:steel,intercalaire_noir:black,verre_chant:glass,inox:steel,chambre:black};
}
export async function createScene(canvas,{mobile=false,onProgress=()=>{}}={}){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',stencil:false});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const tex=new THREE.TextureLoader();let loaded=0;
 const load=url=>tex.loadAsync(url).then(t=>{onProgress(.1+ ++loaded*.1);return t;});
 const [hdr,plate,color,normal,arm]=await Promise.all([new RGBELoader().loadAsync('media/goegap-road-1k.hdr'),load(mobile?'media/goegap-road-2k.webp':'media/goegap-road-4k.webp'),load('media/asphalt-color.webp'),load('media/asphalt-normal.webp'),load('media/asphalt-arm.webp')]);
 const scene=new THREE.Scene(),pmrem=new THREE.PMREMGenerator(renderer);hdr.mapping=THREE.EquirectangularReflectionMapping;
 const env=pmrem.fromEquirectangular(hdr);scene.environment=env.texture;scene.environmentIntensity=1.1;pmrem.dispose();hdr.dispose();
 plate.colorSpace=THREE.NoColorSpace;plate.generateMipmaps=false;plate.minFilter=THREE.LinearFilter;
 const sky=groundedSky(plate);scene.add(sky);const world=new THREE.Group();world.rotation.y=YAW;scene.add(world);world.add(roadStrip({color,normal,arm},85));
 const peel=orangePeel(),palettes=Object.fromEntries(FINISHES.map(f=>[f.id,materials(f,peel)])),objects=[];
 const plinthMat=new THREE.MeshStandardMaterial({color:'#272a2b',roughness:.48,metalness:.55});
 for(const [i,p]of STATIONS.entries()){
  const w=createWindow(p,palettes[p.finish]);w.group.position.set(0,p.id==='S140RP'?.005+w.groundOffset:.035,p.z);world.add(w.group);objects.push(w);
  const base=new THREE.Mesh(new RoundedBoxGeometry(p.width+.28,p.id==='S140RP'?.008:.035,.52,2,.004),plinthMat);base.position.set(0,p.id==='S140RP'?-.008:.017,p.z);base.receiveShadow=base.castShadow=true;world.add(base);
  if(i%3===0)await new Promise(r=>setTimeout(r,0));
 }
 onProgress(.76);
 const sun=new THREE.DirectionalLight('#ffdaa9',3.1);sun.castShadow=true;sun.shadow.mapSize.set(mobile?2048:4096,mobile?512:1024);sun.shadow.bias=-.00018;sun.shadow.normalBias=.007;
 scene.add(sun,sun.target,new THREE.HemisphereLight('#b6cce5','#705642',.3));
 const midpoint=world.localToWorld(new THREE.Vector3(0,0,-25));sun.target.position.copy(midpoint);sun.position.copy(midpoint).addScaledVector(SUN,75);sun.target.updateMatrixWorld();sun.updateMatrixWorld();
 sun.shadow.updateMatrices(sun);
 const view=sun.shadow.camera.matrixWorldInverse,bounds=new THREE.Box3();
 for(const x of [-5,5])for(const y of [0,3.5])for(const z of [4,-57])bounds.expandByPoint(world.localToWorld(new THREE.Vector3(x,y,z)).applyMatrix4(view));
 Object.assign(sun.shadow.camera,{left:bounds.min.x-2,right:bounds.max.x+2,bottom:bounds.min.y-2,top:bounds.max.y+2,near:1,far:160});sun.shadow.camera.updateProjectionMatrix();
 const camera=new THREE.PerspectiveCamera(38,1,.035,220);world.add(camera);
 let lastOpen=[],lastP=-1,ratio=1;const aim=new THREE.Vector3(),eye=new THREE.Vector3();
 function place(p,pointer={x:0,y:0}){
  const z=travelAt(p),f=clamp(-z/5.2,0,STATIONS.length-1),a=Math.floor(f),b=Math.min(a+1,objects.length-1),px=THREE.MathUtils.lerp(objects[a].passX,objects[b].passX,f-a);
  if(p<.1){const t=smooth(0,.1,p);eye.set(THREE.MathUtils.lerp(4.6,1.8,t),THREE.MathUtils.lerp(1.5,.52,t),THREE.MathUtils.lerp(5.5,1.3,t));aim.set(.25+t*.7,1.1-t*.9,-.15);camera.fov=38-t*6;}
  else if(p<.2){const t=smooth(.1,.2,p);eye.set(THREE.MathUtils.lerp(1.8,px,t),THREE.MathUtils.lerp(.52,1.62,t),THREE.MathUtils.lerp(1.3,3.2,t));aim.set(THREE.MathUtils.lerp(.95,px,t),THREE.MathUtils.lerp(.2,1.6,t),THREE.MathUtils.lerp(-.15,-7,t));camera.fov=32+t*14;}
  else{eye.set(px,1.62,z);aim.set(px,1.62,z-12);camera.fov=46;}
  if(innerWidth<700)camera.fov+=14;const sway=1-smooth(.03,.12,p);eye.x+=pointer.x*.08*sway;eye.y-=pointer.y*.035*sway;
  camera.position.copy(eye);camera.updateProjectionMatrix();world.updateMatrixWorld();camera.lookAt(world.localToWorld(aim.clone()));camera.updateMatrixWorld();return {z,passX:px};
 }
 function render({p=0,pointer={x:0,y:0}}={}){
  const {z}=place(p,pointer);let changed=false;
  objects.forEach((o,i)=>{const open=openingAt(z,STATIONS[i].z)*smooth(.17,.215,p);if(Math.abs(open-(lastOpen[i]??-1))>.0001){o.setOpen(open);lastOpen[i]=open;changed=true;}o.group.visible=STATIONS[i].z<eye.z+.3&&STATIONS[i].z>eye.z-27;});
  if(changed||lastP<0)renderer.shadowMap.needsUpdate=true;
  const pos=world.localToWorld(new THREE.Vector3(0,0,p<.2?0:z));sky.position.set(pos.x,1.7,pos.z);renderer.toneMappingExposure=.92+.1*smooth(.6,1,p);renderer.render(scene,camera);lastP=p;
 }
 function resize(w,h,quality=1){ratio=Math.min(devicePixelRatio||1,mobile?1.25:1.5,Math.sqrt((mobile?.85e6:1.65e6)/Math.max(1,w*h)))*quality;renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();lastP=-1;}
 function project(point,index=0){return new THREE.Vector3(...point).add(objects[index].group.position).applyMatrix4(world.matrixWorld).project(camera);}
 resize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight);place(0);await renderer.compileAsync(scene,camera);onProgress(.96);render({p:0});
 return {render,resize,project,renderer,objects,scene,camera,get info(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:ratio};}};
}
