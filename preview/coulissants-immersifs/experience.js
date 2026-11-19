import {PRODUCTS,clamp,smooth,productAt,progressFor} from './catalogue.js';
import {createScene} from './experience-scene.js';
import {createInspector} from './inspection.js';
import {PROFILES} from './catalogue-section.js';
const root=document.documentElement,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const journey=$('.journey'),stage=$('.stage'),canvas=$('#scene'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let scene=null,staticMode=false,ready=false,progress=0,target=0,last=0,painted=-1,active=-1,autoplay=false,quality=1,slow=0,origin=0,distance=1,dirty=true;
const inspection=$('#inspection');let inspector=null,inspectionIndex=0,inspectionView='corner';
const pointer={x:0,y:0},pointerAim={x:0,y:0};
function measure(){origin=journey.offsetTop;distance=Math.max(1,journey.offsetHeight-innerHeight);scene?.resize(stage.clientWidth,stage.clientHeight,quality);dirty=true;}
function goto(p,{animate=false}={}){autoplay=false;setPlay();target=clamp(p);if(!animate)progress=target;scrollTo({top:origin+target*distance,behavior:'instant'});dirty=true;}
function setPlay(){const b=$('#autoplay');b.setAttribute('aria-pressed',String(autoplay));b.textContent=autoplay?'Pause de la lecture':'Lecture automatique';}
function staticView(on){staticMode=on;root.classList.toggle('is-static',on);root.classList.remove('is-loading');$('#static-toggle').setAttribute('aria-pressed',String(on));$('#static-toggle').textContent=on?'Activer la 3D':'Sans animation';autoplay=false;setPlay();measure();dirty=true;}
function product(index){
 if(index===active)return;active=index;const p=PRODUCTS[index];
 $('#active-family').textContent=p.family;$('#active-name').textContent=p.name;$('#active-count').textContent=`${String(index+1).padStart(2,'0')} / ${PRODUCTS.length}`;
 $('#active-phrase').textContent=p.type;$('#active-glass').textContent=p.glass;
 $('#active-capacity-label').textContent=p.weight?'Poids max / ouvrant':'Configuration';$('#active-capacity').textContent=p.weight||'2 à 4 vantaux';
 $('#active-feature').textContent=p.feature;$('#active-config').textContent=p.configuration;$('#active-thermal').textContent=p.thermal?'Rupture de pont thermique':'Sans rupture de pont thermique';$('#active-link').href=`https://prompolu.com/coulissants/${p.slug}`;
 $$('.product-rail button').forEach((b,i)=>{if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 const rail=$('.product-rail'),b=rail.children[index];if(b&&innerWidth<1000){const left=b.offsetLeft-rail.clientWidth/2+b.clientWidth/2;if(left>rail.scrollLeft||b.offsetLeft<rail.scrollLeft)rail.scrollLeft=left;}
}
function paint(p){
 product(productAt(p));stage.style.setProperty('--progress',p.toFixed(4));stage.style.setProperty('--hero',(1-smooth(.015,.065,p)).toFixed(4));
 stage.style.setProperty('--macro',(smooth(.045,.085,p)*(1-smooth(.145,.19,p))).toFixed(4));stage.style.setProperty('--product',smooth(.16,.205,p).toFixed(4));stage.style.setProperty('--journey',(smooth(.21,.25,p)*(1-smooth(.34,.38,p))).toFixed(4));
 $('.hero').inert=p>.065;$('.product-panel').inert=p<.16;
 $('.travel-percent').textContent=`${Math.round(p*100)}%`;
}
function frame(now){
 requestAnimationFrame(frame);const dt=last?Math.min(.1,(now-last)/1000):.016;last=now;
 $('.header').classList.toggle('is-paper',scrollY>origin+distance+innerHeight-100);
 if(document.hidden||inspection.open||scrollY<origin-innerHeight||scrollY>origin+distance+innerHeight)return;
 if(autoplay&&!staticMode){target=clamp(target+dt*.022);scrollTo({top:origin+target*distance,behavior:'instant'});if(target===1){autoplay=false;setPlay();}}
 else target=clamp((scrollY-origin)/distance);
 progress+=(target-progress)*(1-Math.exp(-dt*9));if(Math.abs(target-progress)<.00003)progress=target;
 pointer.x+=(pointerAim.x-pointer.x)*.1;pointer.y+=(pointerAim.y-pointer.y)*.1;
 const change=Math.abs(painted-progress)>.00001;
 if(scene&&ready&&!staticMode&&(change||dirty||progress<.04&&(Math.abs(pointer.x-pointerAim.x)>.001||Math.abs(pointer.y-pointerAim.y)>.001))){
  const t=performance.now();scene.render({p:progress,pointer});paint(progress);painted=progress;dirty=false;
  if(change&&performance.now()-t>32){if(++slow>32&&quality>.55){quality*=.85;scene.resize(stage.clientWidth,stage.clientHeight,quality);slow=0;dirty=true;}}
 }
}
$$('[data-visit]').forEach(b=>b.addEventListener('click',()=>{if(staticMode&&scene)staticView(false);goto(progressFor(Number(b.dataset.visit)));}));
$$('[data-start]').forEach(b=>b.addEventListener('click',()=>{if(staticMode){$('#systemes').scrollIntoView({behavior:reduced.matches?'instant':'smooth'});return;}goto(.2);}));
$$('[data-replay]').forEach(b=>b.addEventListener('click',()=>{if(staticMode&&scene)staticView(false);goto(0);}));
$('#autoplay').addEventListener('click',()=>{if(progress>.99)goto(0);autoplay=!autoplay;setPlay();});
function showInspection(index=active,view=inspectionView){
 inspectionIndex=clamp(index,0,PRODUCTS.length-1);inspectionView=view;autoplay=false;setPlay();
 const p=PRODUCTS[inspectionIndex];$('#inspection-title').textContent=p.name;$('#inspection-configuration').textContent=p.configuration;$('#inspection-count').textContent=`${inspectionIndex+1} / ${PRODUCTS.length}`;
 const source=PROFILES[p.id],section=view==='corner'||view==='profile';
 inspection.classList.toggle('no-source-geometry',section&&!source);
 $('#inspection-geometry-source').textContent=source?.reference||'S90RP · fiche commerciale disponible ; sections de fabrication manquantes';
 $('#inspection-fidelity').textContent=section?(source?(source.completeCorner?'Contours aluminium repris des sections latérale et inférieure du catalogue.':'Section latérale reprise du catalogue. Le seuil n’est pas reconstitué sans son dessin.'):'La géométrie S90RP reste à documenter. La référence catalogue est affichée en attendant ses plans.'):'Vue d’ensemble provisoire : les assemblages et la quincaillerie restent à vérifier sur les fichiers du fabricant.';
 $('[data-inspection-view="corner"]').textContent=source?(source.completeCorner?'Coupe d’angle':'Profil latéral'):'Référence catalogue';
 if(section&&source)$('#inspection-configuration').textContent=source.completeCorner?'Profils latéral et inférieur · '+(source.profiles?.join(' / ')||'sections du catalogue'):'Échantillon du profil latéral';
 const img=$('#inspection-reference-image'),reference=$(`.product-card[data-system="${p.id}"] img`);img.src=reference.currentSrc||reference.src;img.alt=`Section du profilé STRUGAL ${p.name}`;
 $('#inspection-source').href=p.source;const list=$('#inspection-features');
 const details=section&&source?[source.completeCorner?'Profils latéral et inférieur issus de leurs dessins respectifs':'Profil latéral uniquement : dessin du seuil à compléter',`Vitrage de ${source.glass} mm représenté`,source.profiles?`Références de profils : ${source.profiles.join(', ')}`:'Chambres, rainures et poches de retenue reprises du tracé']:p.details;
 list.replaceChildren(...details.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $$('[data-inspection-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inspectionView===view)));$('.inspection-opening').hidden=section;
 if(!inspection.open)inspection.showModal();
 requestAnimationFrame(()=>{
  try{if(section&&!source){inspector?.pause();return;}inspector||=createInspector($('#inspection-canvas'));inspector.resume();inspector.show(p,view);$('#inspection-opening').value=view==='centre'?'0':'35';}
  catch(e){console.warn('Vue de détail indisponible',e);inspection.classList.add('no-inspector');}
 });
}
$('#details').addEventListener('click',()=>showInspection());
$$('[data-inspect]').forEach(b=>b.addEventListener('click',()=>showInspection(Number(b.dataset.inspect))));
$$('[data-inspection-view]').forEach(b=>b.addEventListener('click',()=>showInspection(inspectionIndex,b.dataset.inspectionView)));
$$('[data-inspection-step]').forEach(b=>b.addEventListener('click',()=>showInspection((inspectionIndex+Number(b.dataset.inspectionStep)+PRODUCTS.length)%PRODUCTS.length)));
$('#inspection-close').addEventListener('click',()=>inspection.close());
inspection.addEventListener('close',()=>{inspector?.pause();if(!staticMode)goto(progressFor(inspectionIndex));});
$('#inspection-opening').addEventListener('input',e=>inspector?.setOpening(Number(e.target.value)/100));
addEventListener('resize',()=>{if(inspection.open)inspector?.resize();},{passive:true});
$('#static-toggle').addEventListener('click',async()=>{if(!scene&&!staticMode)return;staticView(!staticMode);if(!staticMode&&!scene)await boot();});
$('#skip-loader').addEventListener('click',()=>{staticView(true);$('#systemes').scrollIntoView();});
$('#filter').addEventListener('change',e=>{$$('.product-card').forEach((c,i)=>{c.hidden=e.target.value==='thermal'?!PRODUCTS[i].thermal:e.target.value==='large'?!/300|400/.test(PRODUCTS[i].weight||''):false;});});
addEventListener('wheel',()=>{if(autoplay){autoplay=false;setPlay();}},{passive:true});addEventListener('touchstart',()=>{autoplay=false;setPlay();},{passive:true});
addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;pointerAim.x=(e.clientX/innerWidth-.5)*2;pointerAim.y=(e.clientY/innerHeight-.5)*2;},{passive:true});
addEventListener('keydown',e=>{if(inspection.open||e.target.closest('input,select,button,a,textarea')||scrollY>distance)return;if(e.code==='ArrowRight'){e.preventDefault();goto(progressFor(clamp(active+1,0,PRODUCTS.length-1)));}if(e.code==='ArrowLeft'){e.preventDefault();goto(progressFor(clamp(active-1,0,PRODUCTS.length-1)));}});
addEventListener('resize',measure,{passive:true});document.fonts.ready.then(measure);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();staticView(true);$('#static-toggle').textContent='Recharger la 3D';});
reduced.addEventListener('change',e=>{if(e.matches)staticView(true);});
async function boot(){
 root.classList.add('is-loading');const watchdog=setTimeout(()=>{if(!ready)staticView(true);},45000);
 try{
  scene=await createScene(canvas,{mobile:innerWidth<700,onProgress:p=>{stage.style.setProperty('--load',p.toFixed(3));$('#loading-percent').textContent=`${Math.round(p*100)}%`;}});
  clearTimeout(watchdog);ready=true;root.classList.remove('is-loading');root.classList.add('is-ready');measure();paint(progress);dirty=true;
 }catch(e){clearTimeout(watchdog);console.error('Preview 3D:',e);window.__preview.error=String(e);staticView(true);}
}
window.__preview={goto:p=>goto(p),visit:i=>goto(progressFor(i)),inspect:(i,v)=>showInspection(i,v),get inspector(){return inspector;},get progress(){return progress;},get active(){return PRODUCTS[active];},get ready(){return ready;},get scene(){return scene;},get static(){return staticMode;},error:null};
measure();product(0);requestAnimationFrame(frame);
const initialInspection=new URLSearchParams(location.search).get('inspect'),initialIndex=PRODUCTS.findIndex(p=>p.id===initialInspection);
const openInitialInspection=()=>{if(initialIndex>=0)showInspection(initialIndex,'corner');};
if(reduced.matches||navigator.connection?.saveData){staticView(true);openInitialInspection();}else boot().then(openInitialInspection);
