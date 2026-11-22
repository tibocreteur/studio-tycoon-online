/* ===================================================================
   BOUCLE PRINCIPALE : caméra, entrées, avatar local, cadence du jeu.
   Seuls le solo et l'hôte font avancer la simulation (step) ; le client
   applique les instantanés et lisse l'horloge entre deux.
   =================================================================== */
"use strict";

/* Durée d'une journée à vitesse 1, donc le rythme réel du jeu.
   L'équilibrage vit en JOURS dans sim.js : cette valeur ne règle que le tempo. */
const JOUR_MS=7500;

(function(){

const clampv=(v,a,b)=>Math.max(a,Math.min(b,v));
const $=id=>document.getElementById(id);
let tPrec=performance.now();
let dernierBureau=-1;               /* pour détecter l'agrandissement du studio */

/* multiplicateur de temps : S.session.vitesse vaut déjà 1, 2 ou 4 (0 ou pause = arrêt) */
function multVitesse(){
  if(!S) return 0;
  const s=S.session||S;
  if(s.pause||S.fini) return 0;
  return +s.vitesse||0;
}
window.multVitesse=multVitesse;

/* ---------- caméra orbitale ---------- */
const Cam={
  theta:Math.PI*0.25, phi:Math.PI*0.30, rayon:24,
  cible:new THREE.Vector3(0,1.1,0),
  vise:{theta:Math.PI*0.25,phi:Math.PI*0.30,rayon:24,cible:new THREE.Vector3(0,1.1,0)},
  vue:0
};
const VUES=[
  {nom:"Vue d'ensemble", phi:.34, ray:1.55, y:1.2},
  {nom:"Vue rapprochée", phi:.24, ray:0.95, y:1.0},
  {nom:"Vue plongeante", phi:.12, ray:1.25, y:0.6},
];
function cadrer(instant){
  const s=World.dimensions(), v=VUES[Cam.vue];
  const d=Math.max(s.w,s.d);
  Cam.vise.rayon=d*v.ray;
  Cam.vise.phi=Math.PI*v.phi;
  Cam.vise.cible.set(0,v.y,0);
  if(instant){ Cam.rayon=Cam.vise.rayon; Cam.phi=Cam.vise.phi; Cam.cible.copy(Cam.vise.cible); }
}
function vueSuivante(){ Cam.vue=(Cam.vue+1)%VUES.length; cadrer(); UI.toast("Caméra",VUES[Cam.vue].nom,""); }
function majCamera(dt){
  const k=Math.min(1,dt*4.5);
  Cam.rayon+=(Cam.vise.rayon-Cam.rayon)*k;
  Cam.phi  +=(Cam.vise.phi-Cam.phi)*k;
  Cam.theta+=(Cam.vise.theta-Cam.theta)*k;
  Cam.cible.lerp(Cam.vise.cible,k);
  const c=World.camera;
  c.position.set(
    Cam.cible.x+Cam.rayon*Math.sin(Cam.phi)*Math.sin(Cam.theta),
    Cam.cible.y+Cam.rayon*Math.cos(Cam.phi),
    Cam.cible.z+Cam.rayon*Math.sin(Cam.phi)*Math.cos(Cam.theta)
  );
  c.lookAt(Cam.cible);
}

/* ---------- avatar local (cosmétique, hors simulation) ---------- */
const Av={x:0,z:0,cap:Math.PI,mode:"idle",cible:null,pret:false};
const VITESSE_MARCHE=3.1;           /* unités par seconde réelle */
const dirs=new Set();
function bornes(){
  if(World.bornes) return World.bornes();
  const s=World.dimensions();
  return {xmin:-s.w/2+.7,xmax:s.w/2-.7,zmin:-s.d/2+.7,zmax:s.d/2-.7};
}
function placerAvatar(){
  const b=bornes();
  Av.x=(b.xmin+b.xmax)/2+(Math.random()-.5)*2;
  Av.z=b.zmax-1.0-Math.random()*.6;
  Av.cap=Math.PI; Av.cible=null; Av.mode="idle"; Av.pret=true;
}
function majAvatar(dt){
  if(!Av.pret) placerAvatar();
  let mx=0, mz=0;
  if(dirs.size&&!UI.bloque()){
    /* déplacement relatif à la caméra : « avant » s'éloigne de l'objectif */
    const f=(dirs.has("av")?1:0)-(dirs.has("ar")?1:0);
    const r=(dirs.has("dr")?1:0)-(dirs.has("ga")?1:0);
    const st=Math.sin(Cam.theta), ct=Math.cos(Cam.theta);
    mx=-st*f+ct*r; mz=-ct*f-st*r;
    const n=Math.hypot(mx,mz); if(n>0){ mx/=n; mz/=n; Av.cible=null; }
  }else if(Av.cible){
    const dx=Av.cible.x-Av.x, dz=Av.cible.z-Av.z, n=Math.hypot(dx,dz);
    if(n<0.06){ Av.cible=null; }
    else{ const pas=Math.min(1,VITESSE_MARCHE*dt/n); mx=dx/n; mz=dz/n; if(pas>=1){ Av.x=Av.cible.x; Av.z=Av.cible.z; Av.cible=null; mx=mz=0; } }
  }
  const bouge=mx!==0||mz!==0;
  if(bouge){
    Av.x+=mx*VITESSE_MARCHE*dt; Av.z+=mz*VITESSE_MARCHE*dt;
    const voulu=Math.atan2(mx,mz);
    let d=voulu-Av.cap; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    Av.cap+=d*Math.min(1,dt*12);
  }
  const b=bornes();
  Av.x=clampv(Av.x,b.xmin,b.xmax); Av.z=clampv(Av.z,b.zmin,b.zmax);
  Av.mode=bouge?"marche":"idle";
  Net.majPos({x:Av.x,z:Av.z,cap:Av.cap,mode:Av.mode});
}

/* ---------- entrées souris ---------- */
function entrees(el){
  let drag=null, survolId=null, dernierMove=0;
  const ndc=e=>{ const r=el.getBoundingClientRect(); return [(e.clientX-r.left)/r.width*2-1, -((e.clientY-r.top)/r.height*2-1)]; };
  el.addEventListener("mousedown",e=>{
    if(UI.bloque())return;
    drag={b:e.button,x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,bouge:false};
    if(e.button===2)e.preventDefault();
  });
  addEventListener("mousemove",e=>{
    if(drag){
      const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
      /* clic tant que le pointeur a bougé de moins de 5 px depuis l'appui */
      if(Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)>=5) drag.bouge=true;
      if(drag.bouge){
        if(drag.b===0){
          Cam.vise.theta-=dx*.006;
          Cam.vise.phi=clampv(Cam.vise.phi-dy*.005,.10,1.32);
        }else{
          const s=Math.sin(Cam.theta), c=Math.cos(Cam.theta), f=Cam.rayon*.0016;
          Cam.vise.cible.x-= (dx*c - dy*s)*f;
          Cam.vise.cible.z-=(-dx*s - dy*c)*f;
          const sal=World.dimensions();
          Cam.vise.cible.x=clampv(Cam.vise.cible.x,-sal.w/2,sal.w/2);
          Cam.vise.cible.z=clampv(Cam.vise.cible.z,-sal.d/2,sal.d/2);
        }
      }
      drag.x=e.clientX; drag.y=e.clientY;
      return;
    }
    if(UI.bloque()||e.target!==World.renderer.domElement){ if(survolId!==null){ survolId=null; World.surligner(null); } UI.infobulle(null); return; }
    const now=performance.now();
    if(now-dernierMove<60)return; dernierMove=now;
    const p=ndc(e), id=World.viser(p[0],p[1]);
    if(id!==survolId){ survolId=id; World.surligner(id); el.style.cursor=(id!==null&&id!==undefined)?"pointer":"grab"; }
    UI.infobulle(id,e.clientX,e.clientY);
  });
  addEventListener("mouseup",e=>{
    const d=drag; drag=null;
    if(!d||d.bouge||d.b!==0||UI.bloque()||Net.mode==="menu"||Net.mode==="connexion") return;
    const p=ndc(e), id=World.viser(p[0],p[1]);
    if(id!==null&&id!==undefined){ UI.selectionner(id); return; }
    const sol=World.solA?World.solA(e.clientX,e.clientY):null;
    if(sol){ Av.cible={x:sol.x,z:sol.z}; }
  });
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("wheel",e=>{
    if(UI.bloque())return;
    e.preventDefault();
    const s=World.dimensions(), d=Math.max(s.w,s.d);
    Cam.vise.rayon=clampv(Cam.vise.rayon*(1+Math.sign(e.deltaY)*.12),d*.35,d*2.6);
  },{passive:false});
}

/* ---------- clavier ---------- */
/* e.code = position physique : ZQSD en AZERTY et WASD en QWERTY tombent sur les mêmes touches */
const CODES={KeyW:"av",ArrowUp:"av",KeyS:"ar",ArrowDown:"ar",KeyA:"ga",ArrowLeft:"ga",KeyD:"dr",ArrowRight:"dr"};
const LETTRES={z:"av",q:"ga"};
function dirDe(e){ return CODES[e.code]||LETTRES[String(e.key||"").toLowerCase()]||null; }
function clavier(){
  addEventListener("keydown",e=>{
    const t=e.target, tag=t&&t.tagName;
    if(tag==="INPUT"||tag==="TEXTAREA"||(t&&t.isContentEditable))return;
    const k=String(e.key||"").toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==="s"){ e.preventDefault(); UI.sauverPartie(); return; }
    if(k==="escape"){ if(UI.echap()) return; if(window.Radio&&Radio.echap()) return; return; }
    if(UI.menuOuvert()||Net.mode==="menu"||Net.mode==="connexion")return;
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const d=dirDe(e);
    if(d){ if(!UI.modalOuverte()){ dirs.add(d); if(e.code.indexOf("Arrow")===0) e.preventDefault(); } return; }
    if(UI.modalOuverte())return;
    if(e.code==="Space"){ e.preventDefault(); const s=S.session||S; Net.action("pause",!(s.pause||!s.vitesse)); }
    else if(k==="e"){ UI.basculerTableau(); }
    else if(k==="v"){ vueSuivante(); }
    else if(k==="r"){ if(window.Radio) Radio.basculer(); }
    else{
      const n={Digit1:1,Digit2:2,Digit3:3,Numpad1:1,Numpad2:2,Numpad3:3}[e.code];
      if(n) Net.action("vitesse",n);
    }
  });
  addEventListener("keyup",e=>{ const d=dirDe(e); if(d) dirs.delete(d); });
  addEventListener("blur",()=>dirs.clear());
}

/* ---------- boucle ---------- */
function boucle(t){
  const dtms=Math.min(t-tPrec,200); tPrec=t;
  const dt=dtms/1000;

  /* filet de sécurité : l'évènement resize n'arrive pas toujours */
  const el=$("scene");
  const cv=World.renderer.domElement;
  if(cv.clientWidth!==el.clientWidth||cv.clientHeight!==el.clientHeight)
    World.taille(el.clientWidth,el.clientHeight);

  const mode=Net.mode, mult=multVitesse();
  if(Net.autorite()){
    /* Avance continue, découpée par quarts de journée au plus (onglet en arrière-plan) */
    if(mult>0){
      let reste=dtms*mult/JOUR_MS, n=0;
      while(reste>0 && n<40){ const d=Math.min(reste,0.25); step(d); reste-=d; n++; }
    }
  }else if(mode==="client"){
    Net.interpoler(dtms*mult/JOUR_MS,dtms);
  }
  Net.tick(dtms);

  if(worldDirty){
    World.construire(); worldDirty=false;
    if(S.up.bureau!==dernierBureau){ dernierBureau=S.up.bureau; cadrer(); }
  }
  World.update(mult>0?dt*Math.min(mult,2):dt*0.25, dt);

  if(mode==="menu"||mode==="connexion"){
    Cam.vise.theta+=dt*0.045;              /* le bureau tourne doucement derrière le menu */
    if(World.majAvatars) World.majAvatars([]);
  }else{
    majAvatar(dt);
    if(World.majAvatars){ World.idAvatarLocal=Net.monId; World.majAvatars(Net.avatars()); }
  }
  majCamera(dt);

  UI.frame(dt);
  World.rendu();
  requestAnimationFrame(boucle);
}

/* ---------- état de fond (menu) et démarrage de partie ---------- */
function reinitialiser(){
  if(!(typeof charger==="function"&&charger())){
    if(typeof newGame==="function") newGame(); else cmd("nouvellePartie",[],"hote");
  }
  worldDirty=true; dirty=true; Av.pret=false;
}
window.Jeu={
  vueSuivante, reinitialiser,
  demarrer(){ Av.pret=false; dernierBureau=-1; worldDirty=true; },
  get avatar(){ return {x:Av.x,z:Av.z,cap:Av.cap,mode:Av.mode}; }
};

let demarre=false;
function demarrer(){
  if(demarre) return; demarre=true;   /* une seule fois, même si l'évènement arrive deux fois */
  const el=$("scene");
  const bar=$("bootbar");
  const tip=$("bootTip"); if(tip) tip.textContent=UI.astuce();
  const etapes=[
    ()=>{ World.init(el); bar.style.width="30%"; },
    ()=>{ reinitialiser(); bar.style.width="55%"; },
    ()=>{ World.construire(); worldDirty=false; dernierBureau=S.up.bureau; bar.style.width="78%"; },
    ()=>{ UI.init(); clavier(); entrees(el); cadrer(true); bar.style.width="100%"; },
    ()=>{
      addEventListener("resize",()=>World.taille(el.clientWidth,el.clientHeight));
      addEventListener("beforeunload",()=>{ if(Net.autorite()&&typeof sauver==="function") sauver(); });
      setInterval(()=>{ if(Net.autorite()&&typeof sauver==="function") sauver(); },12000);
      const b=$("boot");
      b.style.opacity=0; setTimeout(()=>b.style.display="none",600);
      UI.ouvrirMenu();
      requestAnimationFrame(boucle);
    }
  ];
  let i=0;
  (function suite(){
    if(i>=etapes.length)return;
    try{ etapes[i++](); }
    catch(err){
      $("boot").innerHTML=
        '<div class="in" style="max-width:30rem"><div class="logo" style="color:#c0533a">Oups</div>'
        +'<p class="tip" style="margin-top:1rem">'+String(err&&err.message||err).replace(/[&<>"]/g,"")+'</p></div>';
      console.error(err); return;
    }
    setTimeout(suite,60);
  })();
}
addEventListener("DOMContentLoaded",demarrer);

})();
