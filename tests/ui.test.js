/* Test headless de l'interface et du réseau (jsdom, Node 22).
   Lance : node tests/ui.test.js   (depuis la racine du jeu, après `npm i` dans tests/)
   - charge index.html avec THREE et World remplacés par des bouchons ;
   - vérifie le rendu, le routage des boutons vers Net.action, la lecture de S.fx ;
   - simule deux navigateurs (hôte + client) reliés par un faux PeerJS en mémoire. */
"use strict";
const fs=require("fs"), path=require("path");
const {JSDOM}=require("jsdom");
const RACINE=path.join(__dirname,"..");
const lire=f=>fs.readFileSync(path.join(RACINE,f),"utf8");

let ok=0, ko=0;
function verifie(cond,msg){ if(cond){ ok++; console.log("  ok  "+msg); } else { ko++; console.log("  KO  "+msg); } }
const attendre=ms=>new Promise(r=>setTimeout(r,ms));
async function jusqua(fn,ms,pas){ const t0=Date.now(); while(Date.now()-t0<(ms||3000)){ try{ if(fn()) return true; }catch(e){} await attendre(pas||20); } return false; }

/* ---------- faux PeerJS (registre partagé entre fenêtres) ---------- */
function fauxPeer(registre){
  class Conn{
    constructor(peer,meta){ this.peer=peer; this.metadata=meta; this.open=false; this.h={}; this.autre=null; this.ferme=false; }
    on(e,f){ (this.h[e]=this.h[e]||[]).push(f); return this; }
    emit(e,...a){ (this.h[e]||[]).slice().forEach(f=>f(...a)); }
    send(m){ if(!this.open) return; const o=this.autre, c=JSON.parse(JSON.stringify(m)); setTimeout(()=>{ if(o.open) o.emit("data",c); },2); }
    close(){ if(this.ferme) return; this.ferme=true; const etait=this.open; this.open=false; if(etait) this.emit("close");
      const o=this.autre; if(o&&!o.ferme) setTimeout(()=>o.close(),2); }
  }
  return class Peer{
    constructor(id){ if(typeof id!=="string") id="p"+Math.random().toString(36).slice(2,9);
      this.id=id; this.h={}; this.destroyed=false;
      setTimeout(()=>{ if(registre.has(id)){ this.emit("error",{type:"unavailable-id"}); return; } registre.set(id,this); this.emit("open",id); },4); }
    on(e,f){ (this.h[e]=this.h[e]||[]).push(f); return this; }
    emit(e,...a){ (this.h[e]||[]).slice().forEach(f=>f(...a)); }
    connect(id,o){ const a=new Conn(id,o&&o.metadata);
      setTimeout(()=>{ const t=registre.get(id); if(!t||t.destroyed){ this.emit("error",{type:"peer-unavailable"}); return; }
        const b=new Conn(this.id,o&&o.metadata); a.autre=b; b.autre=a; t.emit("connection",b);
        a.open=b.open=true; b.emit("open"); a.emit("open"); },4);
      return a; }
    destroy(){ this.destroyed=true; if(registre.get(this.id)===this) registre.delete(this.id); }
    reconnect(){}
  };
}

/* ---------- bouchons THREE / World ---------- */
const BOUCHONS=`
window.THREE={Vector3:function(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;
  this.set=function(a,b,c){this.x=a;this.y=b;this.z=c;return this};
  this.copy=function(v){this.x=v.x;this.y=v.y;this.z=v.z;return this};
  this.lerp=function(v,k){this.x+=(v.x-this.x)*k;this.y+=(v.y-this.y)*k;this.z+=(v.z-this.z)*k;return this};}};
window.__monde={celebrer:0,avatars:null,viser:null,construit:0};
var World={
  init(el){ this._cv=document.createElement("canvas"); el.appendChild(this._cv); },
  construire(){ __monde.construit++; }, update(){}, rendu(){}, taille(){},
  viser(){ return __monde.viser; }, surligner(){}, ecranDe(){ return null; },
  celebrer(ok){ __monde.celebrer++; },
  dimensions(){ return {w:14,d:10,nom:"Loft"}; },
  camera:{position:{set(){}},lookAt(){}},
  get renderer(){ return {domElement:this._cv}; },
  nomSalle:"Loft",
  majAvatars(l){ __monde.avatars=l; },
  solA(x,y){ return {x:1.5,z:-2}; },
  bornes(){ return {xmin:-6,xmax:6,zmin:-4,zmax:4}; },
  idAvatarLocal:""
};`;

async function ouvrir(opts){
  opts=opts||{};
  let html=lire("index.html").replace(/<script[\s\S]*?<\/script>/g,"");
  const dom=new JSDOM(html,{url:opts.url||"https://exemple.test/studio/index.html",runScripts:"dangerously",pretendToBeVisual:true});
  const w=dom.window;
  w.console.error=(...a)=>{ if(!opts.silence) console.log("    [console.error]",...a.map(String)); };
  w.console.warn=()=>{};
  if(opts.prefs) w.localStorage.setItem("studio-online-prefs",JSON.stringify(opts.prefs));
  if(opts.registre){ w.Peer=fauxPeer(opts.registre); w.__peerEtat="ok"; }
  else w.__peerEtat="ko";
  const injecte=code=>{ const s=w.document.createElement("script"); s.textContent=code; w.document.body.appendChild(s); };
  injecte(BOUCHONS);
  for(const f of ["sim.js","net.js","ui.js","main.js"]) injecte(lire(f));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded",{bubbles:true}));
  await jusqua(()=>w.document.getElementById("menu").classList.contains("on"),4000);
  return w;
}
const ev=(w,el,type,o)=>el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true,button:0,clientX:100,clientY:100},o||{})));
const clic=(w,el)=>{ ev(w,el,"mousedown"); ev(w,el,"mouseup"); ev(w,el,"click"); };
const touche=(w,key,code,o)=>w.dispatchEvent(new w.KeyboardEvent("keydown",Object.assign({key,code,bubbles:true},o||{})));

(async()=>{
  /* ===================== SOLO ===================== */
  console.log("Solo");
  const w=await ouvrir({prefs:{son:false,echelle:1,pauseModale:true},registre:new Map()});
  const d=w.document, $=id=>d.getElementById(id);
  verifie($("menu").classList.contains("on"),"le menu principal s'affiche au démarrage");
  verifie(d.querySelectorAll("#chips .chip").length===5,"5 pastilles de stats dans le bandeau");
  verifie($("tSon").classList.contains("off")&&$("tSon").innerHTML.includes("svg"),"icône son restaurée depuis les préférences (coupé)");
  verifie($("tagline").textContent.length>5,"phrase d'accroche au menu");
  verifie(!$("mHeberger").disabled,"multi activé quand PeerJS est là");

  /* espionnage de Net.action */
  const appels=[]; const orig=w.Net.action;
  w.Net.action=function(){ appels.push(Array.from(arguments)); return orig.apply(this,arguments); };

  $("mNom").value="Testeuse";
  clic(w,$("mSolo"));
  verifie(!$("menu").classList.contains("on")&&w.Net.mode==="solo","clic Solo : menu fermé, mode solo");
  verifie(w.eval("S.joueurs.hote.nom")==="Testeuse","S.joueurs.hote porte le nom du profil");
  await attendre(80);
  const avs=w.__monde.avatars;
  verifie(Array.isArray(avs)&&avs.length===1&&avs[0].id==="hote"&&avs[0].nom==="Testeuse","World.majAvatars reçoit l'avatar local");

  /* chips mises à jour */
  w.UI.frame();
  verifie(d.querySelector('[data-chip="argent"] b').textContent===w.eval("eur(S.argent)"),"trésorerie affichée");

  /* panneau Briefs */
  clic(w,d.querySelector('#rail [data-id="briefs"]'));
  verifie($("panneau").classList.contains("on"),"le rail ouvre le panneau");
  w.UI.render();
  const nbB=w.eval("S.briefs.length");
  const cartes=d.querySelectorAll('[data-liste="briefs"] .carte');
  verifie(nbB>0&&cartes.length===nbB,"une carte par brief ("+nbB+")");
  /* rendu à clés : même nœud après un nouveau rendu */
  const premiere=cartes[0];
  w.eval("dirty=true"); w.UI.frame(); w.UI.frame();
  verifie(d.querySelector('[data-liste="briefs"] .carte')===premiere,"pas de reconstruction du DOM quand rien ne change");
  /* acceptation via Net.action */
  const idB=w.eval("S.briefs[0].id"), nbP=w.eval("S.projets.length");
  clic(w,premiere.querySelector('[data-do="accepter"]'));
  verifie(appels.some(a=>a[0]==="accepter"&&a[1]===idB),"Accepter appelle Net.action('accepter', id numérique)");
  verifie(w.eval("S.projets.length")===nbP+1,"le projet est créé par la sim");

  /* production : verrou pendant un clic */
  clic(w,d.querySelector('#rail [data-id="prod"]')); w.UI.render();
  const carteP=d.querySelector('[data-liste="prod"] .carte');
  verifie(!!carteP,"carte de production affichée");
  const btnSup=carteP.querySelector('[data-do="sup"]');
  ev(w,btnSup,"mousedown");
  w.eval("S.projets[0].sup=!S.projets[0].sup; dirty=true"); w.UI.frame();
  verifie(btnSup.isConnected,"carte sous le pointeur non réécrite pendant le clic");
  ev(w,btnSup,"mouseup"); w.eval("S.projets[0].sup=!S.projets[0].sup");
  ev(w,btnSup,"click");
  verifie(appels.some(a=>a[0]==="toggleSup"),"heures sup via Net.action('toggleSup')");
  /* affectation via la modale */
  w.UI.render();
  const add=d.querySelector('[data-liste="prod"] [data-do="affecter"]');
  clic(w,add);
  verifie($("modal").classList.contains("on"),"modale d'affectation ouverte");
  verifie(w.eval("S.session.pause")===true,"solo : pause automatique pendant la modale");
  const pick=d.querySelector('#modal [data-do="affecterOk"]');
  if(pick) clic(w,pick);
  verifie(appels.some(a=>a[0]==="affecter"),"affectation via Net.action('affecter')");
  verifie(!$("modal").classList.contains("on")&&w.eval("S.session.pause")===false,"modale fermée, le temps repart");

  /* scroll préservé */
  const sec=d.querySelector('[data-sec="prod"]');
  sec.scrollTop=40; w.eval("dirty=true"); w.UI.frame();
  verifie(sec.scrollTop===40,"position de défilement conservée au rendu");

  /* vitesse / pause */
  clic(w,d.querySelector('[data-do="vitesse"][data-id="3"]'));
  verifie(w.eval("S.session.vitesse")===4&&w.eval("S.session.cran")===3,"bouton vitesse 3 : ×4 (cran 3)");
  w.UI.frame();
  verifie(d.querySelector('[data-do="vitesse"][data-id="3"]').classList.contains("on"),"bouton de vitesse actif surligné");
  touche(w," ","Space");
  verifie(w.eval("S.session.pause")===true,"Espace met en pause via Net.action");
  touche(w,"&","Digit1");
  verifie(w.eval("S.session.vitesse")===1&&w.eval("S.session.pause")===false,"touche 1 (AZERTY &) : vitesse normale");

  /* licenciement : confirmation */
  w.eval("var c=S.candidats[0]; if(c){ S.argent=99999; cmd('embaucher',[c.id],'hote'); }");
  clic(w,d.querySelector('#rail [data-id="equipe"]')); w.UI.render();
  const lic=d.querySelector('[data-liste="equipe"] [data-do="licencier"]');
  const nbE=w.eval("S.equipe.length");
  if(lic){ clic(w,lic);
    verifie($("modal").classList.contains("on")&&w.eval("S.equipe.length")===nbE,"licencier demande confirmation");
    clic(w,d.querySelector('#modal .btn.danger'));
    verifie(w.eval("S.equipe.length")===nbE-1,"confirmation : licenciement exécuté");
  }else verifie(false,"bouton licencier présent");

  /* studio : toutes les lignes, prestige compris */
  clic(w,d.querySelector('#rail [data-id="studio"]')); w.UI.render();
  verifie(d.querySelectorAll('[data-liste="studio"] .carte').length===w.eval("Object.keys(UPS).length"),"une carte par amélioration (prestige compris)");
  /* toutes les sections se rendent sans erreur */
  for(const k of ["recrut","journal","palmares","aide","options"]){ clic(w,d.querySelector('#rail [data-id="'+k+'"]')); w.UI.render(); }
  verifie(d.querySelector('[data-bloc="palmares"]').textContent.includes("Jalons"),"portfolio et jalons rendus");
  verifie(d.querySelector('[data-bloc="options"] [data-do="sauver"]')!==null,"options rendues");
  touche(w,"e","KeyE");
  verifie($("panneau").classList.contains("large")&&d.querySelector('[data-sec="briefs"]').classList.contains("on")&&d.querySelector('[data-sec="equipe"]').classList.contains("on"),"E : tableau de bord à trois colonnes");

  /* effets de la sim */
  const nbT=()=>$("toasts").children.length;
  w.eval("cmd('refuser',[999999],'hote')"); w.UI.frame();
  verifie(nbT()>=1,"refus de la sim : toast ciblé affiché");
  w.eval("fx('toast',{titre:'Secret',txt:'pas pour moi',c:''},'quelquun')"); w.UI.frame();
  verifie(![...$("toasts").children].some(t=>t.textContent.includes("pas pour moi")),"toast destiné à un autre joueur ignoré");
  w.eval("for(let i=0;i<12;i++) fx('toast',{titre:'T'+i,txt:'x',c:''})"); w.UI.frame();
  verifie(nbT()<=4,"notifications plafonnées à 4");
  w.eval("for(let i=0;i<5;i++) fx('toast',{titre:'Même',txt:'n'+i,c:'g'})"); w.UI.frame();
  verifie([...$("toasts").children].filter(t=>t._titre==="Même").length===1&&$("toasts").textContent.includes("×5"),"toasts identiques fusionnés (×5)");
  const c0=w.__monde.celebrer; w.eval("fx('celebrer',{ok:true})"); w.UI.frame();
  verifie(w.__monde.celebrer===c0+1,"fx celebrer : World.celebrer appelé");
  w.eval("S.fini=1; S.finRaison='faillite'; fx('fin',{gagne:false,raison:'faillite'})"); w.UI.frame();
  verifie($("modal").textContent.includes("Dépôt de bilan"),"fx fin : écran de fin");
  clic(w,[...d.querySelectorAll("#modal .btn")].find(b=>b.textContent.includes("sursis")));
  verifie(appels.some(a=>a[0]==="continuer")&&!w.eval("S.fini"),"Continuer passe par Net.action('continuer')");

  /* inspection d'un personnage (clic dans la vue 3D) */
  const cv=d.querySelector("#scene canvas");
  w.__monde.viser=w.eval("S.equipe[0].id");
  ev(w,cv,"mousedown"); ev(w,w,"mouseup");
  verifie($("inspect").classList.contains("on")&&w.UI.selection===w.eval("S.equipe[0].id"),"clic sur un personnage : fiche d'inspection");
  /* clic sur le sol : l'avatar marche */
  w.__monde.viser=null;
  ev(w,cv,"mousedown",{clientX:300,clientY:300}); ev(w,w,"mousemove",{clientX:302,clientY:301}); ev(w,w,"mouseup",{clientX:302,clientY:301});
  await attendre(400);
  const a=w.Jeu.avatar;
  verifie(Math.hypot(a.x-1.5,a.z+2)<Math.hypot(0-1.5,3.5+2)-0.3,"clic sur le sol (moins de 5 px) : l'avatar avance vers la cible");
  /* glisser = orbite, pas de déplacement */
  touche(w,"Escape","Escape");
  verifie(!$("inspect").classList.contains("on"),"Échap ferme la fiche");

  /* Konami */
  ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"].forEach(k=>touche(w,k,k.length>1?k:"Key"+k.toUpperCase()));
  verifie($("toasts").textContent.includes("30 vies"),"code Konami : easter egg");

  /* ===================== HORS LIGNE ===================== */
  console.log("PeerJS absent");
  const w2=await ouvrir({url:"https://exemple.test/studio/index.html?rejoindre=AB2CD",silence:true});
  verifie(w2.document.getElementById("mHeberger").disabled&&w2.document.getElementById("mRejoindre").disabled,"boutons multi désactivés");
  verifie(w2.document.getElementById("mEtat").textContent.includes("indisponible"),"explication affichée");
  verifie(w2.document.getElementById("mCode").value==="AB2CD","?rejoindre=CODE prérempli");
  clic(w2,w2.document.getElementById("mSolo"));
  verifie(w2.Net.mode==="solo","le solo marche sans PeerJS");

  /* ===================== COOP ===================== */
  console.log("Coop (faux PeerJS)");
  const reg=new Map();
  const H=await ouvrir({registre:reg}), C=await ouvrir({registre:reg});
  H.document.getElementById("mNom").value="Hote";
  clic(H,H.document.getElementById("mHeberger"));
  await jusqua(()=>H.Net.mode==="hote",2000);
  const code=H.Net.code;
  verifie(H.Net.mode==="hote"&&/^[A-HJ-NP-Z2-9]{5}$/.test(code),"hôte : code de 5 caractères sans ambiguïté ("+code+")");
  verifie(H.document.getElementById("modal").textContent.includes(code),"code affiché dans la modale d'invitation");
  verifie(H.Net.lien()==="https://exemple.test/studio/index.html?rejoindre="+code,"lien d'invitation correct");
  C.document.getElementById("mNom").value="Amie";
  C.document.querySelector('#mCouleurs [data-c="#3fa7a0"]').click();
  C.document.getElementById("mCode").value=code;
  clic(C,C.document.getElementById("mRejoindre"));
  const connecte=await jusqua(()=>C.Net.mode==="client",3000);
  verifie(connecte,"client connecté");
  verifie(C.eval("S.nom")===H.eval("S.nom"),"le client reçoit l'état de l'hôte");
  await jusqua(()=>Object.keys(H.eval("S.joueurs")).length===2,2000);
  const jH=H.eval("S.joueurs"), idC=C.Net.monId;
  verifie(jH[idC]&&jH[idC].nom==="Amie"&&jH[idC].couleur==="#3fa7a0","l'hôte ajoute le client dans S.joueurs (cmd rejoindre)");
  /* commande du client */
  const idB2=C.eval("S.briefs[0].id"), nbP2=H.eval("S.projets.length");
  C.UI.ouvrirOnglet("briefs"); C.UI.render();
  clic(C,C.document.querySelector('[data-liste="briefs"] [data-do="accepter"]'));
  await jusqua(()=>H.eval("S.projets.length")===nbP2+1,2000);
  verifie(H.eval("S.projets.some(p=>p.id==="+idB2+")"),"clic du client exécuté chez l'hôte");
  await jusqua(()=>C.eval("S.projets.length")===nbP2+1,2000);
  verifie(C.eval("S.projets.length")===nbP2+1,"le client voit le résultat (instantané)");
  /* vitesse partagée */
  clic(C,C.document.querySelector('[data-do="vitesse"][data-id="2"]'));
  await jusqua(()=>H.eval("S.session.vitesse")===2,2000);
  verifie(H.eval("S.session.vitesse")===2,"le client change la vitesse commune");
  /* avatars */
  await attendre(400);
  verifie((C.__monde.avatars||[]).some(x=>x.id==="hote"&&x.nom==="Hote"),"le client voit l'avatar de l'hôte");
  verifie((H.__monde.avatars||[]).some(x=>x.id===idC),"l'hôte voit l'avatar du client");
  verifie(C.__monde.avatars.length===2&&C.__monde.avatars[0].id===idC,"pas de doublon de l'avatar local");
  H.UI.frame(); C.UI.frame();
  verifie(H.document.getElementById("joueurs").classList.contains("on")&&H.document.getElementById("joueurs").textContent.includes("Amie"),"liste des joueurs chez l'hôte");
  /* refus ciblé : seul le client voit le toast */
  C.Net.action("refuser",987654);
  await attendre(400); C.UI.frame(); H.UI.frame();
  verifie([...C.document.getElementById("toasts").children].some(t=>/refus|introuvable|brief/i.test(t.textContent)),"toast de refus reçu par le client");
  /* temps lissé côté client */
  const j1=C.eval("S.jour"); await attendre(300); const j2=C.eval("S.jour");
  verifie(j2>j1,"le jour avance côté client entre deux instantanés");
  /* départ de l'hôte */
  H.Net.quitter();
  await jusqua(()=>C.document.getElementById("menu").classList.contains("on"),2000);
  verifie(C.document.getElementById("modal").textContent.includes("Hôte déconnecté")&&C.Net.mode==="menu","client : « Hôte déconnecté » et retour au menu");

  console.log("\n"+ok+" ok, "+ko+" KO");
  process.exit(ko?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
