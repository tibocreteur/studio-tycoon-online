/* ===================================================================
   INTERFACE : surcouche par-dessus le bureau 3D.
   Bandeau de stats, rail de navigation, panneau (ou tableau de bord à
   trois colonnes), fiche d'inspection, notifications, menu principal.

   Règles :
   - toute action de jeu passe par Net.action(nom, ...args) ;
   - le DOM n'est jamais reconstruit en bloc : listes à clés, chaque carte
     n'est réécrite que si son contenu change, jamais sous le pointeur
     pendant un clic ; les valeurs qui bougent en continu (barres, délais)
     sont mises à jour en place ;
   - les effets de la sim (S.fx) sont lus ici : toasts, sons, fête, fin.
   =================================================================== */
"use strict";

var UI = window.UI = (function(){

const $=id=>document.getElementById(id);
const borne=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>(v!==undefined&&v!==""&&!isNaN(v))?+v:v;
const tirer=a=>a[Math.floor(Math.random()*a.length)];

/* ---------- préférences locales ---------- */
const CLE_PREFS="studio-online-prefs", CLE_PROFIL="studio-online-profil", CLE_SAUVE="studio-online-v1";
function lire(k,d){ try{ const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); }catch(e){ return d; } }
function ecrire(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
const prefs=Object.assign({son:true,echelle:1,pauseModale:true},lire(CLE_PREFS,{}));
const sauverPrefs=()=>ecrire(CLE_PREFS,prefs);

const COULEURS=["#e5a136","#7da383","#cd6447","#25344f","#ee7c69","#6f93c4","#9b7bc4","#3fa7a0"];
const NOMS_DEFAUT=["Kerning","Pixel","Bézier","Calque","Vecteur","Pantone","Gouache","Serif","Gabarit","Aplat"];
const profil=Object.assign({nom:tirer(NOMS_DEFAUT),couleur:tirer(COULEURS)},lire(CLE_PROFIL,{}));

/* ---------- clins d'œil ---------- */
const ASTUCES=[
  "Astuce : non, on ne met pas le logo plus gros.",
  "Ctrl+S, toujours.",
  "Rendez-vous au jour 42.",
  "Lorem ipsum dolor sit amet, comme disait l'autre.",
  "Comic Sans est interdit dans ce studio. Sauf le vendredi.",
  "Make it pop. Mais avec goût.",
  "Erreur 404 : inspiration introuvable. Reprends un café.",
  "Helvetica, c'est toujours un bon choix. Presque toujours.",
  "Le client voulait « un truc moderne mais intemporel ».",
  "Un canard en plastique sur le bureau résout la moitié des problèmes.",
  "Moins, c'est plus. Sauf pour le budget.",
  "final_v3_DEF_ok_vraimentfinal.psd",
  "Il est dangereux d'y aller seul. Recrute quelqu'un.",
  "Un monolithe noir a été aperçu près de la machine à café.",
  "Le Bauhaus ne s'est pas construit en un jour.",
  "Que la grille soit avec toi.",
  "Astuce : une équipe reposée livre de meilleures notes.",
  "Astuce : les charges tombent tous les 7 jours, garde de la marge.",
  "Astuce : l'affinité doit dépasser la difficulté pour faire monter la qualité.",
  "Le kerning, c'est la différence entre « clic » et une catastrophe.",
];
const astuce=()=>tirer(ASTUCES);

/* ---------- icônes (SVG en ligne, trait) ---------- */
const P={
  grille:'<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  calques:'<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  equipe:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  recrue:'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
  depart:'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M23 11h-6"/>',
  maison:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  livre:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  medaille:'<circle cx="12" cy="8" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/>',
  aide:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  reglages:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  pause:'<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>',
  lecture:'<path d="M7 4.5v15l12-7.5z"/>',
  v1:'<path d="M8 5v14l11-7z"/>',
  v2:'<path d="M3 5v14l9-7zM12 5v14l9-7z"/>',
  v3:'<path d="M2 6v12l6.5-6zM8.5 6v12l6.5-6zM15 6v12l6.5-6z"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  son:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  muet:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>',
  porte:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  agrandir:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  reduire:'<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  copier:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lien:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ok:'<path d="M20 6 9 17l-5-5"/>',
  eclair:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  piece:'<circle cx="12" cy="12" r="9"/><path d="M14.6 9.4a2.6 2.1 0 0 0-2.6-1.4c-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2a2.6 2.1 0 0 1-2.6-1.4M12 6.4V8M12 16v1.6"/>',
  etoile:'<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  horloge:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  courbe:'<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  mallette:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  calendrier:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  envoi:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  diplome:'<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  alerte:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  disquette:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  boucle:'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  oeil:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  wifi:'<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
  cafe:'<path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
  couronne:'<path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11z"/><path d="M2 21h20"/>',
};
const ico=(n,style)=>'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"'+(style?' style="'+style+'"':'')+'>'+(P[n]||"")+'</svg>';

/* ---------- état local ---------- */
const SECTIONS={
  briefs:  {nom:"Briefs",        ico:"inbox"},
  prod:    {nom:"Production",    ico:"calques"},
  equipe:  {nom:"Équipe",        ico:"equipe"},
  recrut:  {nom:"Recrutement",   ico:"recrue"},
  studio:  {nom:"Studio",        ico:"maison"},
  journal: {nom:"Journal",       ico:"livre"},
  palmares:{nom:"Portfolio",     ico:"medaille"},
  aide:    {nom:"Comment jouer", ico:"aide"},
  options: {nom:"Options",       ico:"reglages"},
};
const TABLEAU=["briefs","prod","equipe"];
let onglet=null, large=false, selection=null;
let dernierFx=-1, pauseAuto=false, finOuverte=false, modaleOuverte=false, menuOuvert=false;
let pointeurBas=null, differe=false, tRendu=0, inited=false, finAttente=0;
const secEl={}, listeEl={}, videEl={}, teteEl={}, blocEl={};

/* ---------- petits utilitaires DOM ---------- */
function setT(n,t){ if(n&&n._t!==t){ n._t=t; n.textContent=t; } }
function setH(n,h){ if(n&&n._h!==h){ n._h=h; n.innerHTML=h; } }
function setW(n,p){ if(!n)return; p=Math.round(borne(p,0,100)*10)/10; if(n._w!==p){ n._w=p; n.style.width=p+"%"; } }
function setC(n,c,on){ if(n&&n.classList.contains(c)!==!!on) n.classList.toggle(c,!!on); }
function setBg(n,c){ if(n&&n._bg!==c){ n._bg=c; n.style.background=c; } }
function refs(el){ const o={}; el.querySelectorAll("[data-r]").forEach(n=>{ o[n.getAttribute("data-r")]=n; }); return o; }
/* ne jamais réécrire l'élément sur lequel l'utilisateur est en train de cliquer */
function verrou(el){ if(pointeurBas&&el.contains(pointeurBas)){ differe=true; return true; } return false; }

const sess=()=>S?(S.session||S):{vitesse:1,pause:true};
const estPause=()=>{ const s=sess(); return !!s.pause||!s.vitesse; };
const pips=n=>'<span class="pips" title="Difficulté '+n+'/10">'+[1,2,3,4,5,6,7,8,9,10].map(i=>'<i class="'+(i<=n?"f":"")+'"></i>').join("")+'</span>';
const colFit=(f,diff)=>f>=diff+1.5?"var(--ok)":f>=diff?"#6b8f3a":f>=diff-1.5?"var(--warn)":"var(--bad)";
const colJauge=(v,a,b)=>v<a?"var(--terra)":v<b?"var(--miel)":"var(--sauge)";
const av=(d,cls)=>'<span class="av'+(cls?" "+cls:"")+'" style="background:'+avColor(d)+'">'+esc((d.prenom||"?")[0])+'</span>';
function hhmm(){ const h=heure()*24, hh=Math.floor(h), mm=Math.floor((h-hh)*60); return String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0"); }
function prochainesCharges(){ const j=S.jour, n=(Math.floor(j/7)+1)*7; return {jour:n, dans:n-j}; }
function quand(d){ return d<1?"aujourd'hui":d<2?"demain":"dans "+Math.ceil(d)+" j"; }
function detailCharges(){
  const loyer=(UPS.bureau.loyer||[])[S.up.bureau]||0, lic=(UPS.logiciel.sem||[])[S.up.logiciel]||0;
  const ent=UPS.prestige&&UPS.prestige.sem?UPS.prestige.sem[S.up.prestige||0]||0:0;
  const sal=S.equipe.reduce((a,d)=>a+(d.salaire||0),0);
  return {loyer,lic,ent,sal};
}
/* constantes et aides exposées par sim.js (avec repli si absentes) */
const seuilFaillite=()=>typeof S.seuilFaillite==="number"?S.seuilFaillite:-6000;
const coutRelance=()=>typeof COUT_RELANCE==="number"?COUT_RELANCE:400;
const VIC=()=>typeof VICTOIRE==="object"&&VICTOIRE?VICTOIRE:{rep:525,ca:720000};
const nbJ=()=>typeof nbJalons==="function"?nbJalons():Object.keys(S.jalons||{}).length;
const estFond=d=>typeof estFondateur==="function"?estFondateur(d):!d.salaire;
const pFini=p=>typeof projetFini==="function"?projetFini(p):p.avance>=p.charge-0.001;
const effet=(k,n)=>typeof effetUp==="function"?effetUp(k,n):((UPS[k].eff||[])[n]||"");

/* =====================================================================
   SONS (l'AudioContext vit ici, plus dans la sim)
   ===================================================================== */
let AC=null, dernierBip=0;
function bip(f,dur,type){
  if(!prefs.son) return;
  const now=performance.now(); if(now-dernierBip<45) return; dernierBip=now;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==="suspended") AC.resume();
    const o=AC.createOscillator(), g=AC.createGain();
    o.type=type||"sine"; o.frequency.value=f||440;
    g.gain.setValueAtTime(.05,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+(dur||.12));
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime+(dur||.12));
  }catch(e){}
}

/* =====================================================================
   NOTIFICATIONS (plafonnées, fusionnées à grande vitesse)
   ===================================================================== */
const ICO_TOAST={g:"ok",r:"alerte",y:"alerte",a:"etoile","":"info"};
function toast(titre,txt,c){
  const box=$("toasts"); if(!box) return;
  titre=String(titre||""); txt=String(txt||""); c=c||"";
  const now=performance.now();
  for(const el of box.children){
    if(el._titre===titre&&!el._sortie&&now-el._t<6000){
      el._n++; el._t=now;
      el.querySelector(".tx").textContent=txt;
      el.querySelector("b em").textContent="×"+el._n;
      el.querySelector("b em").style.display="";
      clearTimeout(el._to); el._to=setTimeout(()=>sortie(el),4200);
      return;
    }
  }
  while(box.children.length>=4){ const v=box.firstChild; clearTimeout(v._to); v.remove(); }
  const el=document.createElement("div");
  el.className="toast "+c; el._titre=titre; el._t=now; el._n=1;
  el.innerHTML='<span class="ti">'+ico(ICO_TOAST[c]||"info")+'</span><div><b>'+esc(titre)+'<em style="display:none"></em></b><div class="tx"></div></div>';
  el.querySelector(".tx").textContent=txt;
  el.addEventListener("click",()=>sortie(el));
  box.appendChild(el);
  el._to=setTimeout(()=>sortie(el),4200);
}
function sortie(el){
  if(el._sortie) return; el._sortie=true; clearTimeout(el._to);
  el.classList.add("out"); setTimeout(()=>el.remove(),360);
}

/* =====================================================================
   EFFETS DE LA SIM
   ===================================================================== */
function resetFx(){ dernierFx=-1; }
function consommerFx(){
  if(!S||!Array.isArray(S.fx)) return;
  let max=0; for(const f of S.fx) if(f&&f.id>max) max=f.id;
  if(dernierFx<0){ dernierFx=Math.max(max,+S.fxId||0); return; }   /* rien de rejoué à l'arrivée */
  if(max<dernierFx){ dernierFx=0; }                                  /* nouvelle partie : compteur remis à zéro */
  if(max===dernierFx) return;
  const moi=window.Net?Net.monId:"hote";
  const nouveaux=S.fx.filter(f=>f&&f.id>dernierFx).sort((a,b)=>a.id-b.id);
  dernierFx=max;
  for(const f of nouveaux){
    if(f.to!==undefined&&f.to!==null&&f.to!==moi) continue;
    try{ jouerFx(f); }catch(e){ console.error(e); }
  }
}
function jouerFx(f){
  switch(f.t){
    case "toast": toast(f.titre,f.txt,f.c); break;
    case "bip": bip(f.f,f.dur,f.type); break;
    case "celebrer": if(window.World&&World.celebrer) World.celebrer(f.ok!==false); break;
    case "fin": if(!finOuverte&&!menuOuvert&&performance.now()>finAttente&&S.fini) ouvrirFin(!!f.gagne,f.raison); break;
    case "log": break;     /* le journal est lu directement dans S.journal */
  }
}

/* =====================================================================
   BANDEAU
   ===================================================================== */
const CHIPS=[
  {k:"argent", lbl:"Trésorerie", ico:"piece"},
  {k:"rep",    lbl:"Réputation", ico:"etoile", barre:true},
  {k:"jour",   lbl:"Jour",       ico:"horloge"},
  {k:"charges",lbl:"Charges",    ico:"calendrier"},
  {k:"equipe", lbl:"Équipe",     ico:"equipe"},
];
const chipEl={};
function construireBandeau(){
  $("chips").innerHTML=CHIPS.map(c=>'<div class="chip verre" data-chip="'+c.k+'"><span class="ci">'+ico(c.ico)+'</span>'
    +'<div><b class="num" data-r="v"></b><small data-r="s">'+c.lbl+'</small></div>'
    +(c.barre?'<span class="cbar"><i data-r="b"></i></span>':'')+'</div>').join("");
  CHIPS.forEach(c=>{ const el=$("chips").querySelector('[data-chip="'+c.k+'"]'); chipEl[c.k]={el,r:refs(el)}; });
  $("tPause").innerHTML=ico("pause");
  document.querySelectorAll('[data-do="vitesse"]').forEach(b=>{ b.innerHTML=ico("v"+b.dataset.id)+"<kbd>"+b.dataset.id+"</kbd>"; });
  $("tCam").innerHTML=ico("camera");
  $("tMenu").innerHTML=ico("porte");
  $("phFermer").innerHTML=ico("x");
  majSon();
}
function majSon(){
  const b=$("tSon"); if(!b) return;
  b.innerHTML=ico(prefs.son?"son":"muet");
  setC(b,"off",!prefs.son);
  b.setAttribute("data-lbl",prefs.son?"Couper le son":"Activer le son");
}
function hud(){
  if(!S) return;
  const ti=tierIdx(), T=TIERS[ti], nx=TIERS[ti+1];
  setT($("nomStudio"),S.nom||"Studio");
  setT($("tierStudio"),T.nom);
  const pc=prochainesCharges(), ch=chargesSem();
  const manque=S.argent-ch<0 && pc.dans<=3;
  const a=chipEl.argent;
  setT(a.r.v,eur(S.argent)); setC(a.el,"neg",S.argent<0); setC(a.el,"warn",S.argent>=0&&manque);
  setT(a.r.s,S.argent<0?"À découvert":"Trésorerie");
  const r=chipEl.rep;
  setT(r.r.v,String(Math.round(S.rep)));
  setT(r.r.s,nx?"Vers "+(nx.nom===nx.nom.toUpperCase()?nx.nom:nx.nom.charAt(0).toLowerCase()+nx.nom.slice(1))+" à "+nx.rep:"Sommet atteint");   /* « PME » reste en capitales */
  setW(r.r.b,nx?(S.rep-T.rep)/(nx.rep-T.rep)*100:100);
  const j=chipEl.jour;
  setT(j.r.v,"Jour "+Math.floor(S.jour)); setT(j.r.s,hhmm()+(estPause()?" · en pause":""));
  const c=chipEl.charges;
  setT(c.r.v,eur(ch)+" / sem"); setT(c.r.s,"Échéance "+quand(pc.dans)); setC(c.el,"warn",manque);
  const e=chipEl.equipe;
  setT(e.r.v,S.equipe.length+" / "+capacite()); setT(e.r.s,"Projets "+S.projets.length+" / "+capacite());

  /* contrôles du temps */
  const p=estPause(), v=sess().cran||({1:1,2:2,4:3})[sess().vitesse]||1;
  const bp=$("tPause");
  if(bp._p!==p){ bp._p=p; bp.innerHTML=ico(p?"lecture":"pause"); bp.setAttribute("data-lbl",p?"Reprendre (Espace)":"Pause (Espace)"); }
  setC(bp,"on",p); setC(bp,"pause",p);
  document.querySelectorAll('[data-do="vitesse"]').forEach(b=>setC(b,"on",!p&&+b.dataset.id===v));

  /* alerte trésorerie : projection de l'échéance */
  const al=$("alerte");
  let txt="", grave=false;
  const sf=seuilFaillite();
  if(S.argent<sf/2){ txt="Trésorerie à "+eur(S.argent)+" : dépôt de bilan sous "+eur(sf)+". Livre vite ou réduis les charges."; grave=true; }
  else if(manque){ txt="Les charges ("+eur(ch)+") tombent "+quand(pc.dans)+" : il manquera "+eur(ch-S.argent)+"."; grave=S.argent-ch<-2000; }
  if(al._t!==txt){ al._t=txt; al.innerHTML=txt?ico("alerte")+"<span>"+esc(txt)+"</span>":""; }
  setC(al,"on",!!txt); setC(al,"grave",grave);
}

/* =====================================================================
   RAIL + PANNEAU
   ===================================================================== */
function construireRail(){
  const items=[["tableau","grille","Tableau de bord (E)"]];
  Object.keys(SECTIONS).forEach(k=>{ if(k==="aide") items.push(["sep"]); items.push([k,SECTIONS[k].ico,SECTIONS[k].nom]); });
  $("rail").innerHTML=items.map(it=>it[0]==="sep"?'<div class="sep"></div>'
    :'<button class="ib" data-do="onglet" data-id="'+it[0]+'" data-lbl="'+esc(it[2])+'" aria-label="'+esc(it[2])+'">'+ico(it[1])+'<span class="badge" data-badge="'+it[0]+'"></span></button>').join("");
  const pb=$("pb");
  pb.innerHTML=Object.keys(SECTIONS).map(k=>'<section class="sec" data-sec="'+k+'">'
    +'<div class="sec-h">'+ico(SECTIONS[k].ico)+SECTIONS[k].nom+' <span class="cnt" data-cnt="'+k+'"></span></div>'
    +'<div class="tete" data-tete="'+k+'"></div><div class="liste" data-liste="'+k+'"></div>'
    +'<div class="vide" data-vide="'+k+'"></div><div data-bloc="'+k+'"></div></section>').join("");
  Object.keys(SECTIONS).forEach(k=>{
    secEl[k]=pb.querySelector('[data-sec="'+k+'"]');
    teteEl[k]=secEl[k].querySelector("[data-tete]");
    listeEl[k]=secEl[k].querySelector("[data-liste]");
    videEl[k]=secEl[k].querySelector("[data-vide]");
    blocEl[k]=secEl[k].querySelector("[data-bloc]");
  });
}
function visibles(){ if(!onglet&&!large) return []; return large?TABLEAU:[onglet]; }
function majPanneau(){
  const pn=$("panneau"), on=!!(onglet||large);
  setC(pn,"on",on); setC(pn,"large",large);
  const vis=visibles();
  Object.keys(secEl).forEach(k=>setC(secEl[k],"on",vis.indexOf(k)>=0));
  document.querySelectorAll('#rail [data-do="onglet"]').forEach(b=>{
    const id=b.dataset.id; setC(b,"on",large?id==="tableau":id===onglet);
  });
  const t=large?"Tableau de bord":(onglet?SECTIONS[onglet].nom:"");
  const ic=large?"grille":(onglet?SECTIONS[onglet].ico:"grille");
  setH($("phTitre"),ico(ic)+esc(t));
  const bl=$("phLarge");
  setH(bl,ico(large?"reduire":"agrandir"));
  bl.setAttribute("data-lbl",large?"Vue simple":"Tableau de bord (E)");
  if(on) renduSections(true);
}
function ouvrirOnglet(k){
  if(k==="tableau"){ basculerTableau(); return; }
  if(!SECTIONS[k]) return;
  if(!large&&onglet===k){ onglet=null; }
  else{ onglet=k; large=false; }
  majPanneau();
}
function basculerTableau(){
  if(large){ large=false; onglet=null; }
  else{ large=true; }
  majPanneau();
}
function fermerPanneau(){ onglet=null; large=false; majPanneau(); }

/* ---------- liste à clés : chaque carte est réécrite seulement si elle change ---------- */
function keyed(box,items,cle,html,live,cls){
  const map=box._k||(box._k=new Map());
  const vus=new Set();
  let prec=null;
  for(const it of items){
    const k=String(cle(it)); vus.add(k);
    const h=html(it);
    let rec=map.get(k);
    if(!rec){
      const el=document.createElement("div");
      el.className=cls?cls(it):"carte"; el.innerHTML=h;
      rec={el,h,r:refs(el),it}; map.set(k,rec);
      if(live) live(rec.r,it,rec.el);
    }else{
      rec.it=it;
      if(rec.h!==h&&!verrou(rec.el)){
        rec.el.innerHTML=h; rec.h=h; rec.r=refs(rec.el);
        if(live) live(rec.r,it,rec.el);
      }
      if(cls){ const c=cls(it); if(rec.el.className!==c) rec.el.className=c; }
    }
    const attendu=prec?prec.nextSibling:box.firstChild;
    if(rec.el!==attendu) box.insertBefore(rec.el,attendu);
    prec=rec.el;
  }
  for(const [k,rec] of map){
    if(vus.has(k)) continue;
    if(verrou(rec.el)) continue;
    rec.el.remove(); map.delete(k);
  }
}
function liveListe(box,items,cle,live){
  if(!box._k||!live) return;
  const parCle=new Map(); items.forEach(it=>parCle.set(String(cle(it)),it));
  box._k.forEach((rec,k)=>{ const it=parCle.get(k); if(it) live(rec.r,it,rec.el); });
}
function bloc(el,html){ if(el._h!==html&&!verrou(el)){ el._h=html; el.innerHTML=html; } }

/* ---------- définition des sections ---------- */
const DEF={
  briefs:{
    items:()=>S.briefs, cle:b=>b.id, vide:ico("inbox")+"Aucun brief pour l'instant.<br>Améliore ta <b>visibilité</b> dans Studio pour en recevoir plus.",
    tete:()=>'<div class="intro"><span>Les briefs expirent : choisis ceux où ton équipe a l\'affinité.</span></div>',
    html(b){
      const T=TIERS[b.tier]||TIERS[0];
      const meilleur=S.equipe.length?Math.max.apply(null,S.equipe.map(d=>fit(d,b))):0;
      const plein=S.projets.length>=capacite();
      return '<div class="ligne"><div><div class="ttl">'+esc(b.type.nom)+'</div><div class="sub">'+esc(b.client)+'</div></div>'
        +'<span class="tag '+(b.leg?"leg":"t"+b.tier)+'">'+(b.leg?ico("couronne")+"Légendaire":esc(T.nom))+'</span></div>'
        +(b.pitch?'<div class="pitch">« '+esc(b.pitch)+' »</div>':'')
        +(b.insiste?'<div class="sub" style="color:var(--warn)">Ce client insiste. Vraiment.</div>':'')
        +'<div class="ligne" style="margin-top:.55rem;align-items:center">'+pips(b.diff)+'<span class="prix">'+eur(b.budget)+'</span></div>'
        +'<div class="meta"><span>Charge <b>'+b.charge+'</b></span><span>Délai <b>'+b.jours+' j</b></span>'
        +'<span>Exigence <b>'+T.exig+'</b></span><span>Meilleur profil <b style="color:'+colFit(meilleur,b.diff)+'">'+meilleur.toFixed(1)+'</b></span></div>'
        +'<div class="blbl"><span data-r="exp"></span></div>'
        +'<div class="actions"><button class="btn p" data-do="accepter" data-id="'+b.id+'"'
        +(plein?' disabled title="Bureau saturé : '+capacite()+' projets en parallèle au maximum"':'')+'>'+ico("ok")+'Accepter</button>'
        +'<button class="btn carre" data-do="refuser" data-id="'+b.id+'" title="Refuser" aria-label="Refuser">'+ico("x")+'</button></div>';
    },
    live(r,b){
      const rest=Math.max(0,b.exp-S.jour);
      setT(r.exp,"Expire dans "+rest.toFixed(1)+" j");
      if(r.exp) r.exp.style.color=rest<1.5?"var(--bad)":"";
    }
  },
  prod:{
    items:()=>S.projets, cle:p=>p.id, vide:ico("calques")+"Rien en production.<br>Accepte un brief, puis affecte quelqu'un dessus.",
    cls:p=>"carte"+(p.leg?" legende":"")+(pFini(p)&&qualite(p)>=TIERS[p.tier].exig?" pret":""),
    tete:()=>'<div class="intro"><span>Livre à 100 %. Sous l\'exigence, le client peut demander une révision.</span>'
      +'<button class="btn fixe'+(S.auto?" on":"")+'" data-do="auto" title="Livre seul les projets terminés qui atteignent l\'exigence">'
      +ico("envoi")+'Livraison auto : '+(S.auto?"oui":"non")+'</button></div>',
    html(p){
      const T=TIERS[p.tier], exig=T.exig, fini=pFini(p), bon=fini&&qualite(p)>=exig;
      const rest=p.deadline-S.jour, dc=rest<0?"b":rest<2?"w":"";
      const membres=p.equipe.map(id=>S.equipe.find(x=>x.id===id)).filter(Boolean);
      return '<div class="ligne"><div><div class="ttl">'+esc(p.type.nom)
        +(p.revisions?' <span class="tag t4" style="vertical-align:.1em">Révision '+p.revisions+'</span>':'')+'</div>'
        +'<div class="sub">'+(p.leg?ico("couronne","color:var(--miel)")+" ":"")+esc(p.client)+'</div>'
        +(p.pitch?'<div class="pitch">« '+esc(p.pitch)+' »</div>':'')+'</div>'
        +'<div style="text-align:right"><div class="prix">'+eur(p.budget)+'</div>'
        +'<div class="sub dl '+dc+'">'+(rest>=0?"Livraison "+(Math.ceil(rest)<=0?"aujourd'hui":"J-"+Math.ceil(rest)):Math.ceil(-rest)+" j de retard")+'</div></div></div>'
        +'<div class="barre"><i data-r="pb"></i></div>'
        +'<div class="blbl"><span>Avancement</span><b class="num" data-r="pt"></b></div>'
        +'<div class="barre q"><i data-r="qb"></i><span class="seuil" style="left:'+exig+'%" title="Exigence du client"></span></div>'
        +'<div class="blbl"><span>Qualité, exigence '+exig+'</span><b class="num" data-r="qt"></b></div>'
        +'<div class="slots">'
        +membres.map(d=>'<span class="slot">'+av(d,"s")+esc(d.prenom)+' <span class="fitv" style="color:'+colFit(fit(d,p),p.diff)+'">'+fit(d,p).toFixed(1)+'</span>'
          +'<button data-do="retirer" data-id="'+p.id+'" data-id2="'+d.id+'" title="Retirer du projet" aria-label="Retirer">'+ico("x")+'</button></span>').join("")
        +(p.equipe.length<4?'<button class="slot add" data-do="affecter" data-id="'+p.id+'">'+ico("plus")+'Affecter</button>':'')
        +'</div>'
        +'<div class="actions">'
        +'<button class="btn '+(fini?(bon?"ok pulse":"miel"):"")+'" '+(fini?"":"disabled")+' data-do="livrer" data-id="'+p.id+'">'
        +ico(fini?"envoi":"horloge")+(fini?(bon?"Livrer":"Livrer quand même"):"En cours")+'</button>'
        +'<button class="btn carre'+(p.sup?" on":"")+'" data-do="sup" data-id="'+p.id+'" title="Heures sup : plus vite, mais l\'énergie fond">'+ico("eclair")+'</button>'
        +'<button class="btn carre danger" data-do="abandon" data-id="'+p.id+'" title="Abandonner le contrat">'+ico("x")+'</button></div>';
    },
    live(r,p){
      const prog=p.charge?p.avance/p.charge*100:0, q=qualite(p);
      setW(r.pb,prog); setT(r.pt,Math.floor(borne(prog,0,100))+" %");
      setW(r.qb,q); setT(r.qt,String(Math.round(q)));
    }
  },
  equipe:{
    items:()=>S.equipe, cle:d=>d.id, vide:"Personne. Même pas toi ?",
    tete:()=>{ const dc=detailCharges(); return '<div class="intro"><span>Masse salariale <b>'+eur(dc.sal)+'</b> par semaine.</span></div>'; },
    html(d){
      const st=statut(d), fondateur=estFond(d);
      return '<div class="mem">'+av(d)+'<div style="flex:1;min-width:0"><div class="ligne"><div style="min-width:0"><div class="ttl">'+esc(nomComplet(d))+'</div>'
        +'<div class="sub">'+esc(d.role)+'</div></div><div style="text-align:right;flex:0 0 auto">'
        +'<span class="etat '+st[0]+'">'+esc(st[1])+'</span><div class="sub num">'+(d.salaire?eur(d.salaire)+" / sem":"Fondateur")+'</div></div></div>'
        +'<div class="skills"><span>Créa <b>'+d.crea+'</b></span><span>Tech <b>'+d.tech+'</b></span><span>Vitesse <b>'+d.vit+'</b></span></div></div></div>'
        +'<div class="jauges"><div><div class="barre mini"><i data-r="eb"></i></div><div class="blbl"><span>Énergie</span><b class="num" data-r="et"></b></div></div>'
        +'<div><div class="barre mini"><i data-r="mb"></i></div><div class="blbl"><span>Moral</span><b class="num" data-r="mt"></b></div></div></div>'
        +'<div class="actions"><button class="btn" data-do="inspecter" data-id="'+d.id+'">'+ico("oeil")+'Fiche</button>'
        +'<button class="btn" data-do="former" data-id="'+d.id+'">'+ico("diplome")+'Former</button>'
        +(fondateur?'':'<button class="btn" data-do="augmenter" data-id="'+d.id+'" title="Salaire en hausse, moral aussi">'+ico("courbe")+'Augmenter</button>'
          +'<button class="btn carre danger" data-do="licencier" data-id="'+d.id+'" title="Licencier">'+ico("depart")+'</button>')
        +'</div>';
    },
    live(r,d){
      setW(r.eb,d.energie); setBg(r.eb,colJauge(d.energie,28,55)); setT(r.et,String(Math.round(d.energie)));
      setW(r.mb,d.moral); setBg(r.mb,colJauge(d.moral,30,55)); setT(r.mt,String(Math.round(d.moral)));
    }
  },
  recrut:{
    items:()=>S.candidats, cle:c=>c.id, vide:"Aucune candidature cette semaine. Relance une annonce.",
    tete:()=>'<div class="intro"><span>Candidatures renouvelées chaque semaine. Places : <b>'+S.equipe.length+' / '+capacite()+'</b></span>'
      +'<button class="btn fixe" data-do="relance">'+ico("boucle")+'Relancer l\'annonce ('+eur(coutRelance())+')</button></div>',
    html(c){
      const plein=S.equipe.length>=capacite(), cher=S.argent<c.prime;
      return '<div class="mem">'+av(c)+'<div style="flex:1;min-width:0"><div class="ttl">'+esc(nomComplet(c))+'</div><div class="sub">'+esc(c.role)+'</div>'
        +'<div class="skills"><span>Créa <b>'+c.crea+'</b></span><span>Tech <b>'+c.tech+'</b></span><span>Vitesse <b>'+c.vit+'</b></span></div></div></div>'
        +'<div class="meta"><span>Salaire <b>'+eur(c.salaire)+' / sem</b></span><span>Prime d\'arrivée <b>'+eur(c.prime)+'</b></span></div>'
        +'<div class="actions"><button class="btn p" data-do="embaucher" data-id="'+c.id+'"'
        +(plein?' disabled title="Bureau plein : agrandis le studio"':cher?' disabled title="Il manque '+eur(c.prime-S.argent)+'"':'')+'>'
        +ico("recrue")+(plein?"Bureau plein":cher?"Il manque "+eur(c.prime-S.argent):"Embaucher")+'</button></div>';
    }
  },
  studio:{
    items:()=>Object.keys(UPS), cle:k=>k, cls:()=>"carte up",
    tete:()=>{
      const dc=detailCharges(), pc=prochainesCharges(), ch=chargesSem(), apres=S.argent-ch;
      return '<div class="carte"><div class="titre-s">Prévision de trésorerie</div>'
        +'<table class="tbl"><tr><td>Loyer</td><td>'+eur(dc.loyer)+'</td></tr><tr><td>Licences</td><td>'+eur(dc.lic)+'</td></tr>'
        +(dc.ent?'<tr><td>Entretien du prestige</td><td>'+eur(dc.ent)+'</td></tr>':'')
        +'<tr><td>Salaires</td><td>'+eur(dc.sal)+'</td></tr><tr><td>Prochaine échéance (jour '+pc.jour+')</td><td>'+eur(ch)+'</td></tr>'
        +'<tr><td>Trésorerie après échéance</td><td style="color:'+(apres<0?"var(--bad)":"var(--ok)")+'">'+eur(apres)+'</td></tr></table></div>';
    },
    html(k){
      const u=UPS[k], n=S.up[k], max=n>=u.cout.length-1, cost=max?0:u.cout[n+1], cher=!max&&S.argent<cost;
      const eff=esc(effet(k,n)), suite=max?"":esc(effet(k,n+1));
      return '<h4><span>'+esc(u.nom)+'</span><em>NIV '+(n+1)+' / '+u.cout.length+'</em></h4>'
        +'<p>'+esc(u.desc[n])+'</p>'
        +'<div class="niv">'+u.cout.map((_,i)=>'<i class="'+(i<=n?"f":"")+'"></i>').join("")+'</div>'
        +'<div class="eff">'+eff+(suite?'<br><span style="color:var(--encre2)">Niveau suivant : '+suite+'</span>':'')+'</div>'
        +'<button class="btn '+(max?"":"p")+'" style="width:100%" '+(max||cher?"disabled":"")+' data-do="acheter" data-id2="'+k+'"'
        +(cher?' title="Il manque '+eur(cost-S.argent)+'"':'')+'>'
        +(max?"Niveau maximum":ico("plus")+"Améliorer · "+eur(cost))+'</button>';
    }
  },
  journal:{
    bloc:()=>'<div class="journal">'+S.journal.map(l=>'<div><time class="num">J'+l.j+'</time><span class="'+esc(l.c||"m")+'">'+esc(l.t)+'</span></div>').join("")+'</div>'
  },
  palmares:{ bloc:()=>vuePalmares() },
  aide:{ bloc:()=>vueAide() },
  options:{ bloc:()=>vueOptions() },
};
function statut(d){
  const p=d.proj?S.projets.find(x=>x.id===d.proj):null;
  return d.repos>0?["ko","Repos ("+d.repos+" j)"]
       : d.form>0?["tr","Formation ("+d.form+" j)"]
       : p?["busy",p.type.nom] : ["libre","Disponible"];
}

function renduSection(k){
  const D=DEF[k]; if(!D||!S) return;
  if(D.tete) bloc(teteEl[k],D.tete());
  if(D.items){
    const it=D.items()||[];
    keyed(listeEl[k],it,D.cle,D.html,D.live,D.cls);
    setC(videEl[k],"on",!it.length);
    if(!it.length) bloc(videEl[k],D.vide||"");
  }
  if(D.bloc) bloc(blocEl[k],D.bloc());
}
function renduSections(){
  visibles().forEach(renduSection);
  /* compteurs */
  const n={briefs:S.briefs.length,prod:S.projets.length,equipe:S.equipe.length,recrut:S.candidats.length};
  Object.keys(n).forEach(k=>{ const c=secEl[k]&&secEl[k].querySelector("[data-cnt]"); setT(c,String(n[k])); });
  setT($("phCnt"),large?"":(onglet&&n[onglet]!==undefined?String(n[onglet]):""));
  setC($("phCnt"),"hidden",false); $("phCnt").style.display=(!large&&onglet&&n[onglet]!==undefined)?"":"none";
}
function liveSections(){
  visibles().forEach(k=>{ const D=DEF[k]; if(D&&D.items&&D.live) liveListe(listeEl[k],D.items()||[],D.cle,D.live); });
}
function majBadges(){
  const prets=S.projets.filter(pFini).length;
  const mal=S.equipe.filter(d=>d.energie<28||d.moral<30).length;
  const b=(k,v,ok)=>{ const el=document.querySelector('[data-badge="'+k+'"]'); if(!el) return; setT(el,v?String(v):""); setC(el,"on",!!v); setC(el,"ok",!!ok); };
  b("briefs",S.briefs.length); b("prod",prets,true); b("equipe",mal); b("tableau",0);
}

/* ---------- blocs de texte ---------- */
function vuePalmares(){
  const ti=tierIdx();
  return '<div class="kpis">'
    +'<div class="kpi"><b>'+eur(S.ca)+'</b><small>Chiffre d\'affaires</small></div>'
    +'<div class="kpi"><b>'+S.livres+'</b><small>Projets livrés</small></div>'
    +'<div class="kpi"><b>'+Math.round(S.meilleure)+'</b><small>Meilleure note</small></div>'
    +'<div class="kpi"><b>'+(S.rates||0)+'</b><small>Contrats perdus</small></div>'
    +'<div class="kpi"><b>'+(S.revisions||0)+'</b><small>Révisions</small></div>'
    +'<div class="kpi"><b>'+((S.legendes||[]).length)+(typeof LEGENDES!=="undefined"?" / "+LEGENDES.length:"")+'</b><small>Légendes</small></div>'
    +(S.faillites?'<div class="kpi"><b>'+S.faillites+'</b><small>Sursis bancaires</small></div>':'')+'</div>'
    +'<div class="titre-s" style="margin-top:.9rem">Objectif final</div>'
    +'<div class="carte"><div class="blbl"><span>Réputation</span><b>'+Math.round(S.rep)+' / '+VIC().rep+'</b></div><div class="barre"><i style="width:'+Math.min(100,S.rep/VIC().rep*100)+'%"></i></div>'
    +'<div class="blbl" style="margin-top:.6rem"><span>Chiffre d\'affaires</span><b>'+eur(S.ca)+' / '+eur(VIC().ca)+'</b></div><div class="barre"><i style="width:'+Math.min(100,S.ca/VIC().ca*100)+'%;background:var(--miel)"></i></div>'
    +'<div class="sub" style="margin-top:.5rem">Clientèle actuelle : <b>'+esc(TIERS[ti].nom)+'</b>. Charges cumulées : '+eur(S.charges||0)+'.</div></div>'
    +'<div class="titre-s" style="margin-top:.9rem">Portfolio, affiché sur le mur du studio</div>'
    +(S.palmares&&S.palmares.length?'<div class="liste">'+S.palmares.map(p=>'<div class="carte oeuvre'+(p.leg?" legende":"")+'"><span class="note">'+p.q+'</span><div style="min-width:0"><div class="ttl">'+(p.leg?ico("couronne","color:var(--miel)")+" ":"")+esc(p.n||p.t)+'</div>'
      +'<div class="sub">'+esc(p.t)+' pour '+esc(p.c)+' · jour '+p.j+' · '+eur(p.m)+'</div></div></div>').join("")+'</div>'
     :'<div class="note">Rien encore. Vise 82 ou plus : le bon profil sur le bon projet, licences à jour, équipe reposée.</div>')
    +'<div class="titre-s" style="margin-top:.9rem">Jalons ('+nbJ()+' / '+JALONS.length+')</div>'
    +JALONS.map(j=>{ const f=S.jalons&&S.jalons[j.id]; return '<div class="jalon'+(f?" f":"")+'">'+ico(f?"ok":"horloge")+'<span>'+(j.nom?'<b>'+esc(j.nom)+'</b> : ':'')+esc(j.txt)+'</span></div>'; }).join("");
}
function vueAide(){
  return '<div class="aide">'
    +'<h4>La boucle</h4>Accepte un <b>brief</b>, affecte des collaborateurs dessus, laisse le temps passer, <b>livre</b> à 100 %. '
    +'Chaque livraison rapporte argent et <b>réputation</b>, et la réputation débloque des clients plus riches.'
    +'<h4>La vraie mécanique</h4>Chaque projet demande de la <b>créativité</b> et de la <b>technique</b> dans des proportions différentes. '
    +'L\'<b>affinité</b> (le chiffre à côté de chaque personne) se compare à la <b>difficulté</b> (les pastilles). Au-dessus, la qualité monte. '
    +'En dessous, le client renvoie le projet. Les <b>licences</b> ajoutent un bonus fixe, la fatigue et le moral bas en retirent.'
    +'<h4>À surveiller</h4>L\'<b>énergie</b> baisse au travail et remonte au repos : à zéro, c\'est le burn-out. '
    +'Le <b>moral</b> chute avec la fatigue ; trop bas, les gens démissionnent. Les <b>charges</b> tombent tous les 7 jours : le bandeau te prévient si la trésorerie ne suivra pas.'
    +'<h4>Le studio évolue</h4>Chaque amélioration se voit dans le bureau : la salle s\'agrandit, les postes se multiplient, tes meilleures pièces s\'affichent au mur.'
    +'<h4>En coop</h4>Tout le monde gère le même studio : chaque clic part chez l\'hôte, qui fait tourner la partie. '
    +'La vitesse et la pause sont communes. Ton avatar se promène dans le bureau, les autres le voient.'
    +'<h4>Commandes</h4><kbd>E</kbd> tableau de bord · <kbd>Échap</kbd> fermer · <kbd>Espace</kbd> pause · '
    +'<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> vitesse normale, ×2, ×4 · <kbd>V</kbd> changer de vue · <kbd>Ctrl</kbd>+<kbd>S</kbd> sauvegarder<br>'
    +'Clic sur le sol pour marcher, ou <kbd>Z</kbd> <kbd>Q</kbd> <kbd>S</kbd> <kbd>D</kbd> (<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>) et les flèches. '
    +'Glisser pour pivoter, molette pour zoomer, clic droit pour décaler. Clic sur un collaborateur pour ouvrir sa fiche.'
    +'</div>';
}
function vueOptions(){
  const m=window.Net?Net.mode:"solo";
  const multi=m==="hote"||m==="client";
  const ech=[[.9,"Petite"],[1,"Normale"],[1.15,"Grande"],[1.3,"Très grande"]];
  return '<div>'
    +'<div class="opt"><div class="l"><b>Son</b><small>Petits bips à la signature, à la livraison, aux jalons.</small></div>'
    +'<button class="bascule'+(prefs.son?" on":"")+'" data-do="son" aria-label="Son"></button></div>'
    +'<div class="opt"><div class="l"><b>Taille de l\'interface</b><small>S\'adapte déjà à l\'écran (1080p, 4K).</small></div>'
    +'<div class="seg">'+ech.map(e=>'<button class="'+(prefs.echelle===e[0]?"on":"")+'" data-do="echelle" data-id="'+e[0]+'">'+e[1]+'</button>').join("")+'</div></div>'
    +'<div class="opt"><div class="l"><b>Pause pendant les fenêtres</b><small>En solo, le temps s\'arrête quand une fenêtre de choix est ouverte.</small></div>'
    +'<button class="bascule'+(prefs.pauseModale?" on":"")+'" data-do="pauseModale" aria-label="Pause pendant les fenêtres"></button></div>'
    +'<div class="opt"><div class="l"><b>Livraison automatique</b><small>Les projets finis et assez bons partent seuls.</small></div>'
    +'<button class="bascule'+(S.auto?" on":"")+'" data-do="auto" aria-label="Livraison automatique"></button></div>'
    +(multi?'<div class="opt"><div class="l"><b>Partie en coop</b><small>Code à partager : <b>'+esc(Net.code||"")+'</b></small></div>'
      +'<button class="btn fixe" data-do="voirCode">'+ico("lien")+'Inviter</button></div>':'')
    +'<div class="actions" style="margin-top:1rem">'
    +'<button class="btn" data-do="sauver">'+ico("disquette")+'Sauvegarder</button>'
    +(m!=="client"?'<button class="btn danger" data-do="nouvelle">'+ico("boucle")+'Nouvelle partie</button>':'')
    +'<button class="btn" data-do="menu">'+ico("porte")+'Menu principal</button></div>'
    +'</div>';
}

/* =====================================================================
   FICHE D'INSPECTION (clic sur un personnage)
   ===================================================================== */
function selectionner(id){
  selection=(id===null||id===undefined)?null:id;
  rendreInspect(true);
}
function rendreInspect(force){
  const box=$("inspect");
  const d=selection!==null&&S?S.equipe.find(x=>x.id===selection):null;
  if(!d){ if(selection!==null&&S) selection=null; setC(box,"on",false); return; }
  setC(box,"on",true);
  const st=statut(d), p=d.proj?S.projets.find(x=>x.id===d.proj):null;
  const sk=(l,v)=>'<div class="blbl"><span>'+l+'</span><b>'+v+' / 10</b></div><div class="barre mini"><i style="width:'+v*10+'%;background:var(--ciel)"></i></div>';
  let projets="";
  if(p){
    projets='<div class="titre-s" style="margin-top:.7rem">Sur le projet</div><div class="carte" style="padding:.6rem .7rem"><div class="ligne" style="align-items:center">'
      +'<div style="min-width:0"><div class="ttl" style="font-size:.9rem">'+esc(p.type.nom)+'</div><div class="sub">'+esc(p.client)+' · affinité <b style="color:'+colFit(fit(d,p),p.diff)+'">'+fit(d,p).toFixed(1)+'</b></div></div>'
      +'<button class="btn fixe" data-do="retirer" data-id="'+p.id+'" data-id2="'+d.id+'">Retirer</button></div></div>';
  }else if(libre(d)&&S.projets.length){
    projets='<div class="titre-s" style="margin-top:.7rem">Affecter à</div><div class="liste" style="gap:.35rem">'
      +S.projets.map(q=>{ const f=fit(d,q), plein=q.equipe.length>=4;
        return '<button class="pick'+(plein?" no":"")+'" '+(plein?"disabled":'data-do="affecterOk" data-id="'+q.id+'" data-id2="'+d.id+'"')+' style="padding:.45rem .6rem">'
          +'<div style="min-width:0"><div style="font-weight:800;font-size:.86rem">'+esc(q.type.nom)+'</div><div class="sub">'+esc(q.client)+'</div></div>'
          +'<div class="fit"><b style="color:'+colFit(f,q.diff)+';font-size:1rem">'+f.toFixed(1)+'</b><span>diff. '+q.diff+'</span></div></button>'; }).join("")+'</div>';
  }
  const html='<div class="ligne" style="align-items:center"><div class="mem" style="align-items:center">'+av(d)
    +'<div style="min-width:0"><div class="ttl" style="font-family:var(--f-titre)">'+esc(nomComplet(d))+'</div><div class="sub">'+esc(d.role)+'</div></div></div>'
    +'<button class="ib" data-do="deselect" aria-label="Fermer la fiche">'+ico("x")+'</button></div>'
    +'<div style="margin-top:.5rem;display:flex;justify-content:space-between;align-items:center"><span class="etat '+st[0]+'">'+esc(st[1])+'</span>'
    +'<span class="sub num">'+(d.salaire?eur(d.salaire)+" / sem":"Fondateur")+'</span></div>'
    +'<div style="margin-top:.5rem">'+sk("Créativité",d.crea)+sk("Technique",d.tech)+sk("Vitesse",d.vit)+'</div>'
    +'<div class="jauges"><div><div class="barre mini"><i data-r="eb"></i></div><div class="blbl"><span>Énergie</span><b class="num" data-r="et"></b></div></div>'
    +'<div><div class="barre mini"><i data-r="mb"></i></div><div class="blbl"><span>Moral</span><b class="num" data-r="mt"></b></div></div></div>'
    +projets
    +'<div class="actions"><button class="btn" data-do="former" data-id="'+d.id+'">'+ico("diplome")+'Former</button>'
    +(!estFond(d)?'<button class="btn" data-do="augmenter" data-id="'+d.id+'">'+ico("courbe")+'Augmenter</button>'
      +'<button class="btn carre danger" data-do="licencier" data-id="'+d.id+'" title="Licencier">'+ico("depart")+'</button>':'')+'</div>';
  if((force||box._h!==html)&&!verrou(box)){ if(box._h!==html){ box._h=html; box.innerHTML=html; box._r=refs(box); } }
  const r=box._r||{};
  setW(r.eb,d.energie); setBg(r.eb,colJauge(d.energie,28,55)); setT(r.et,String(Math.round(d.energie)));
  setW(r.mb,d.moral); setBg(r.mb,colJauge(d.moral,30,55)); setT(r.mt,String(Math.round(d.moral)));
}

/* ---------- infobulle au survol d'un personnage ---------- */
function infobulle(did,mx,my){
  const el=$("tip");
  if(did===null||did===undefined||!S){ el.style.opacity=0; return; }
  const d=S.equipe.find(x=>x.id===did);
  if(!d){ el.style.opacity=0; return; }
  const p=d.proj?S.projets.find(x=>x.id===d.proj):null;
  const tache=d.form>0?"En formation ("+d.form+" j)":d.repos>0?"Au repos ("+d.repos+" j)":p?"Sur : "+p.type.nom+", "+p.client:d.energie<70?"Pause café":"Disponible";
  setH(el,'<div class="n">'+esc(nomComplet(d))+'</div><div class="r">'+esc(d.role)+'</div>'
    +'<div class="skills"><span>Créa <b>'+d.crea+'</b></span><span>Tech <b>'+d.tech+'</b></span><span>Vitesse <b>'+d.vit+'</b></span></div>'
    +'<div class="blbl"><span>Énergie</span><b>'+Math.round(d.energie)+'</b></div><div class="barre mini"><i style="width:'+Math.round(d.energie)+'%;background:'+colJauge(d.energie,28,55)+'"></i></div>'
    +'<div class="blbl"><span>Moral</span><b>'+Math.round(d.moral)+'</b></div><div class="barre mini"><i style="width:'+Math.round(d.moral)+'%;background:'+colJauge(d.moral,30,55)+'"></i></div>'
    +'<div class="task">'+esc(tache)+'</div><div class="clic">Clic pour ouvrir la fiche</div>');
  el.style.opacity=1;
  const w=el.offsetWidth||200,h=el.offsetHeight||140;
  el.style.left=Math.min(innerWidth-w-10,Math.max(10,mx+16))+"px";
  el.style.top=Math.min(innerHeight-h-10,Math.max(10,my-h-12))+"px";
}

/* ---------- liste des joueurs (coop) ---------- */
function rendreJoueurs(){
  const box=$("joueurs"), m=window.Net?Net.mode:"menu";
  const on=m==="hote"||m==="client";
  setC(box,"on",on);
  if(!on) return;
  const l=Net.joueurs();
  const pingCls=p=>p===null||p===undefined?"x":p<120?"":p<250?"m":"b";
  const html='<div class="jt"><span>'+ico("wifi")+' Studio partagé · '+l.length+' / '+Net.MAX_JOUEURS+'</span>'
    +'<button data-do="voirCode" title="Inviter">'+esc(Net.code||"")+ico("copier")+'</button></div>'
    +l.map(j=>'<div class="jr"><span class="pt" style="background:'+esc(j.couleur)+'"></span><span class="nm">'+esc(j.nom)
      +(j.moi?' <small>(toi)</small>':'')+(j.hote?' <small>· hôte</small>':'')+'</span>'
      +(j.hote&&j.moi?'':'<span class="ping '+pingCls(j.ping)+'">'+(j.ping===null||j.ping===undefined?"...":j.ping+" ms")+'</span>')+'</div>').join("");
  bloc(box,html);
}

/* =====================================================================
   MODALES
   ===================================================================== */
let modBtns=null;
function modal(titre,html,btns,opts){
  opts=opts||{};
  const m=$("modal");
  m.innerHTML='<div class="mbox" role="dialog" aria-modal="true"><header><h3>'+esc(titre)+'</h3>'
    +(opts.sansFermer?'':'<button class="ib" data-do="fermerModal" aria-label="Fermer">'+ico("x")+'</button>')+'</header>'
    +'<div class="b">'+html+'</div>'
    +(btns&&btns.length?'<div class="f">'+btns.map((b,i)=>'<button class="btn '+(b.c||"")+'" data-mb="'+i+'">'+(b.ico?ico(b.ico):"")+esc(b.t)+'</button>').join("")+'</div>':'')
    +'</div>';
  modBtns=btns||null;
  m.classList.add("on");
  m._sansFermer=!!opts.sansFermer;
  m.onclick=e=>{
    const b=e.target.closest("[data-mb]");
    if(b&&modBtns){ const f=modBtns[+b.dataset.mb]; if(f&&f.f) f.f(); return; }
    if(e.target===m&&!m._sansFermer) fermerModal();
  };
  if(!modaleOuverte&&!opts.sansPause&&window.Net&&Net.mode==="solo"&&prefs.pauseModale&&!estPause()){
    pauseAuto=true; Net.action("pause",true);
  }
  modaleOuverte=true; finOuverte=!!opts.fin;
  const pb=m.querySelector(".f .btn.p,.f .btn.ok,.f .btn.miel"); if(pb) setTimeout(()=>{ try{ pb.focus(); }catch(e){} },30);
}
function fermerModal(){
  const m=$("modal"); m.classList.remove("on"); m.innerHTML=""; modBtns=null;
  modaleOuverte=false; finOuverte=false;
  if(pauseAuto){ pauseAuto=false; if(window.Net&&Net.mode==="solo"&&estPause()) Net.action("pause",false); }
}
function modalAffecter(pid){
  const p=S.projets.find(x=>x.id===pid); if(!p) return;
  const dispo=S.equipe.filter(d=>p.equipe.indexOf(d.id)<0);
  modal("Affecter sur "+p.type.nom,
    '<div>Difficulté <b>'+p.diff+' / 10</b>. Une affinité au-dessus fait monter la qualité.</div>'
    +(dispo.length?dispo.map(d=>{
      const f=fit(d,p), ok=libre(d);
      return '<button class="pick'+(ok?"":" no")+'" '+(ok?'data-do="affecterOk" data-id="'+pid+'" data-id2="'+d.id+'"':"disabled")+'>'+av(d)
        +'<div style="min-width:0"><div style="font-weight:800;color:var(--encre)">'+esc(nomComplet(d))+'</div>'
        +'<div class="sub">'+esc(d.role)+' · énergie '+Math.round(d.energie)+' · '
        +(ok?"disponible":(d.proj?"déjà sur un projet":d.repos>0?"au repos":"en formation"))+'</div></div>'
        +'<div class="fit"><b style="color:'+colFit(f,p.diff)+'">'+f.toFixed(1)+'</b><span>affinité</span></div></button>';
    }).join(""):'<div class="vide on">Personne d\'autre dans l\'équipe. Va recruter.</div>'));
}
function modalFormer(id){
  const d=S.equipe.find(x=>x.id===id); if(!d) return;
  const L={crea:["Créativité","Ateliers, expos, carnets de croquis"],tech:["Technique","Logiciels, prod, contraintes d'impression"],vit:["Vitesse","Raccourcis, méthode, automatisation"]};
  modal("Former "+nomComplet(d),
    '<div>Trois jours d\'indisponibilité, un point gagné pour de bon.</div>'
    +Object.keys(L).map(k=>{
      const c=coutFormation(d,k), max=d[k]>=10, cher=S.argent<c, no=max||cher;
      return '<button class="pick'+(no?" no":"")+'" '+(no?"disabled":'data-do="formerOk" data-id="'+id+'" data-id2="'+k+'"')+'>'
        +'<div><div style="font-weight:800;color:var(--encre)">'+L[k][0]+' · niveau '+d[k]+(max?'':' puis '+(d[k]+1))+'</div>'
        +'<div class="sub">'+L[k][1]+(cher&&!max?" · il manque "+eur(c-S.argent):"")+'</div></div>'
        +'<div class="fit"><b style="font-size:1rem">'+(max?"MAX":eur(c))+'</b><span>coût</span></div></button>';
    }).join(""));
}
function modalAbandon(pid){
  const p=S.projets.find(x=>x.id===pid); if(!p) return;
  modal("Abandonner le contrat ?",
    '<div>Rompre avec <b>'+esc(p.client)+'</b> coûte de la <b style="color:var(--bad)">réputation</b> et un dédit d\'environ <b style="color:var(--bad)">'+eur(p.budget*0.12)+'</b>.</div>',
    [{t:"Garder le projet",f:fermerModal},{t:"Abandonner",c:"danger",ico:"x",f:()=>{ Net.action("abandonner",pid); fermerModal(); }}]);
}
function modalLicencier(id){
  const d=S.equipe.find(x=>x.id===id); if(!d) return;
  modal("Licencier "+nomComplet(d)+" ?",
    '<div>Indemnités d\'environ <b style="color:var(--bad)">'+eur((d.salaire||0)*1.5)+'</b>, et le reste de l\'équipe le prendra mal (moral en baisse).</div>'
    +'<div class="note">Économie ensuite : '+eur(d.salaire||0)+' par semaine.</div>',
    [{t:"Annuler",f:fermerModal},{t:"Licencier",c:"danger",ico:"depart",f:()=>{ Net.action("licencier",id); if(selection===id) selection=null; fermerModal(); }}]);
}
function modalNouvelle(){
  modal("Nouvelle partie ?",'<div>Le studio actuel sera effacé'+(Net.mode==="hote"?", pour tous les joueurs":"")+'. Pas de retour possible.</div>',
    [{t:"Annuler",f:fermerModal},{t:"Recommencer",c:"danger",ico:"boucle",f:()=>{ fermerModal(); Net.action("nouvellePartie"); selection=null; }}]);
}
function modalCode(){
  const fichier=Net.estFichier();
  modal("Ta partie est ouverte",
    '<div>Donne ce code à tes amis (jusqu\'à '+(Net.MAX_JOUEURS-1)+' personnes). Ils cliquent sur <b>Rejoindre</b> dans le menu.</div>'
    +'<div class="code-gros">'+esc(Net.code||"")+'</div>'
    +(fichier?'<div class="note">Tu joues depuis un fichier local : le lien d\'invitation ne marchera pas chez les autres. '
      +'Partage plutôt le <b>code</b> (ton ami ouvre sa propre copie du jeu), ou mets le jeu en ligne (voir le README, GitHub Pages).</div>'
      :'<div class="note">Le lien ouvre directement le jeu avec le code prérempli.</div>')
    +'<div class="note">Garde cet onglet ouvert : c\'est ton navigateur qui fait tourner la partie.</div>',
    [{t:"Copier le lien",ico:"lien",f:()=>copier(Net.lien(),"Lien copié")},
     {t:"Copier le code",c:"p",ico:"copier",f:()=>copier(Net.code,"Code copié")}],{sansPause:true});
}
function ouvrirFin(gagne,raison){
  raison=raison||S.finRaison||(gagne?"victoire":"faillite");
  const titre=gagne?"Studio légendaire":raison==="stagnation"?"Retour en agence":"Dépôt de bilan";
  const texte=gagne?"Réputation au sommet, carnet de commandes plein, et un nom que les clients prononcent avec respect. <b>"+esc(S.nom)+"</b> est devenu une référence."
    :raison==="stagnation"?"Seul depuis trop longtemps, sans décoller : le fondateur raccroche. Recruter et viser des clients plus gros aurait tout changé."
    :"Les charges ont eu raison de la trésorerie. Ce n'était pas le talent qui manquait, c'était le cash-flow.";
  const client=window.Net&&Net.mode==="client";
  modal(titre,
    '<p style="line-height:1.7">'+texte+'</p>'
    +'<table class="tbl" style="margin-top:.4rem"><tr><td>Jours</td><td>'+Math.floor(S.jour)+'</td></tr>'
    +'<tr><td>Projets livrés</td><td>'+S.livres+'</td></tr><tr><td>Chiffre d\'affaires</td><td>'+eur(S.ca)+'</td></tr>'
    +'<tr><td>Réputation</td><td>'+Math.round(S.rep)+'</td></tr><tr><td>Meilleure note</td><td>'+Math.round(S.meilleure)+' / 100</td></tr></table>',
    (client?[]:[{t:"Nouvelle partie",ico:"boucle",f:()=>{ finAttente=performance.now()+2500; fermerModal(); Net.action("nouvellePartie"); selection=null; }}]).concat(
     [{t:gagne?"Continuer à jouer":raison==="stagnation"?"Un dernier essai":"Demander un sursis",c:"p",f:()=>{ finAttente=performance.now()+2500; fermerModal(); Net.action("continuer"); }}]),
    {sansPause:true,fin:true,sansFermer:true});
  if(gagne){ confettis(); bip(660,.12,"triangle"); setTimeout(()=>bip(880,.18,"triangle"),130); }
}
function modalQuitter(){
  const m=Net.mode;
  const txt=m==="hote"?"Les autres joueurs seront déconnectés. Le studio est sauvegardé dans ce navigateur."
    :m==="client"?"Tu quittes le studio de l'hôte. La partie continue sans toi."
    :"La partie est sauvegardée automatiquement.";
  modal("Revenir au menu ?",'<div>'+txt+'</div>',
    [{t:"Rester",f:fermerModal},{t:"Menu principal",c:"p",ico:"porte",f:()=>{ fermerModal(); retourMenu(); }}],{sansPause:true});
}
function retourMenu(){
  if(Net.autorite()&&typeof sauver==="function") sauver();
  Net.quitter();
  resetLocal();
  if(window.Jeu&&Jeu.reinitialiser) Jeu.reinitialiser();
  ouvrirMenu();
}
function hoteDeconnecte(raison){
  resetLocal();
  if(window.Jeu&&Jeu.reinitialiser) Jeu.reinitialiser();
  ouvrirMenu();
  modal("Hôte déconnecté",'<div>'+esc(raison||"La connexion avec l'hôte a été perdue.")+' Retour au menu.</div>',
    [{t:"OK",c:"p",f:fermerModal}],{sansPause:true});
}
function resetLocal(){
  selection=null; rendreInspect(); fermerModal(); resetFx(); onglet=null; large=false;
  if(inited) majPanneau();
}

/* ---------- presse-papiers ---------- */
function copier(txt,msg){
  const ok=()=>toast("Invitation",msg||"Copié","g");
  const secours=()=>{
    try{ const t=document.createElement("textarea"); t.value=txt; t.style.position="fixed"; t.style.opacity="0";
      document.body.appendChild(t); t.select(); const r=document.execCommand&&document.execCommand("copy"); t.remove();
      if(r) ok(); else toast("Invitation","Copie impossible : "+txt,"y"); }
    catch(e){ toast("Invitation","Copie impossible : "+txt,"y"); }
  };
  try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok,secours); else secours(); }
  catch(e){ secours(); }
}

/* =====================================================================
   MENU PRINCIPAL
   ===================================================================== */
function ouvrirMenu(){
  menuOuvert=true; $("menu").classList.add("on");
  setT($("tagline"),astuce());
  majMenu();
  fermerPanneau(); selection=null; rendreInspect();
}
function fermerMenu(){ menuOuvert=false; $("menu").classList.remove("on"); }
function etatMenu(txt,cls){ const e=$("mEtat"); e.textContent=txt||""; e.className="metat"+(cls?" "+cls:""); e._fixe=!!txt; }
function majMenu(){
  if(!inited) return;
  const sauve=(()=>{ try{ return !!localStorage.getItem(CLE_SAUVE); }catch(e){ return false; } })();
  setT($("mSoloSub"),sauve&&S?"Continuer : "+S.nom+", jour "+Math.floor(S.jour):"Nouveau studio");
  $("mNouvelle").style.display=sauve?"":"none";
  const lib=Net.etatLib(), occupe=Net.mode==="connexion";
  $("mHeberger").disabled=lib!=="ok"||occupe;
  $("mRejoindre").disabled=lib!=="ok"||occupe;
  $("mCode").disabled=lib!=="ok"||occupe;
  $("mSolo").disabled=occupe;
  const e=$("mEtat");
  if(e._fixe) return;
  if(lib==="attente") etatMenu("Chargement du module réseau...",""), e._fixe=false;
  else if(lib==="ko") etatMenu("Multijoueur indisponible : le module réseau (PeerJS) n'a pas pu être chargé. Il faut internet. Le solo marche normalement.","err"), e._fixe=false;
  else if(Net.estFichier()) etatMenu("Jeu ouvert en local : pour inviter, partage le code (le lien ne marchera qu'une fois le jeu en ligne).",""), e._fixe=false;
  else etatMenu("",""), e._fixe=false;
}
function profilDepuisMenu(){
  profil.nom=(($("mNom").value||"").trim().slice(0,16))||tirer(NOMS_DEFAUT);
  $("mNom").value=profil.nom;
  ecrire(CLE_PROFIL,profil);
  return {nom:profil.nom,couleur:profil.couleur};
}
function lancer(){ fermerMenu(); resetLocal(); if(window.Jeu&&Jeu.demarrer) Jeu.demarrer(); dirty=true; }
function initMenu(){
  $("mNom").value=profil.nom;
  $("mNom").addEventListener("change",profilDepuisMenu);
  const cc=$("mCouleurs");
  cc.innerHTML=COULEURS.map(c=>'<button style="background:'+c+'" data-c="'+c+'" role="radio" aria-label="Couleur '+c+'"></button>').join("");
  const majC=()=>cc.querySelectorAll("button").forEach(b=>{ const on=b.dataset.c===profil.couleur; b.classList.toggle("on",on); b.setAttribute("aria-checked",on); });
  cc.addEventListener("click",e=>{ const b=e.target.closest("[data-c]"); if(!b) return; profil.couleur=b.dataset.c; ecrire(CLE_PROFIL,profil); majC(); });
  majC();
  const code=(new URLSearchParams(location.search).get("rejoindre")||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);
  if(code){ $("mCode").value=code; }
  $("mCode").addEventListener("input",e=>{ e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5); });
  $("mCode").addEventListener("keydown",e=>{ if(e.key==="Enter") $("mRejoindre").click(); });

  $("mSolo").onclick=()=>{
    Net.solo(profilDepuisMenu()); lancer();
    toast("Bienvenue","Bon retour chez "+S.nom+"."+(estPause()?" Espace pour lancer le temps.":""),"a");
  };
  $("mNouvelle").onclick=()=>{
    modal("Nouveau studio ?","<div>Ton studio solo actuel sera effacé.</div>",
      [{t:"Annuler",f:fermerModal},{t:"Recommencer",c:"danger",ico:"boucle",f:()=>{
        fermerModal(); Net.solo(profilDepuisMenu()); Net.action("nouvellePartie"); lancer(); }}],{sansPause:true});
  };
  $("mHeberger").onclick=()=>{
    const p=profilDepuisMenu();
    etatMenu("Création de la partie...",""); majMenu();
    Net.heberger(p,{
      ok(){ etatMenu("",""); lancer(); modalCode(); },
      erreur(msg){ etatMenu(msg,"err"); majMenu(); }
    });
    majMenu();
  };
  $("mRejoindre").onclick=()=>{
    const p=profilDepuisMenu(), code=$("mCode").value;
    if(!code||code.length<4){ etatMenu("Entre le code de la partie (5 caractères).","err"); return; }
    etatMenu("Connexion au studio "+code+"...","");
    Net.rejoindre(code,p,{
      ok(){ etatMenu("",""); lancer(); toast("Coop","Tu as rejoint le studio "+(S&&S.nom?S.nom:"")+".","g"); },
      erreur(msg){ etatMenu(msg,"err"); majMenu(); }
    });
    majMenu();
  };
}

/* =====================================================================
   EASTER EGG : code Konami (purement cosmétique)
   ===================================================================== */
const KONAMI=["arrowup","arrowup","arrowdown","arrowdown","arrowleft","arrowright","arrowleft","arrowright","b","a"];
let konamiPos=0;
function konami(e){
  const t=e.target, tag=t&&t.tagName;
  if(tag==="INPUT"||tag==="TEXTAREA"||(t&&t.isContentEditable)) return;   /* pas pendant la saisie du nom ou du code */
  const k=String(e.key||"").toLowerCase();
  if(k===KONAMI[konamiPos]){ konamiPos++; if(konamiPos===KONAMI.length){ konamiPos=0; secret(); } }
  else konamiPos=(k===KONAMI[0])?1:0;
}
function secret(){
  confettis();
  if(window.World&&World.celebrer) try{ World.celebrer(true); }catch(e){}
  toast("Code secret","+30 vies... ah non, c'est pas ce jeu-là.","a");
  [523,659,784,1047].forEach((f,i)=>setTimeout(()=>{ dernierBip=0; bip(f,.14,"square"); },i*110));
}
function confettis(){
  const box=$("confettis"); if(!box) return;
  const cols=["#e5a136","#7da383","#cd6447","#25344f","#ee7c69","#6f93c4","#f6d38f"];
  for(let i=0;i<90;i++){
    const c=document.createElement("i");
    c.style.left=Math.random()*100+"vw";
    c.style.background=cols[i%cols.length];
    c.style.setProperty("--dx",(Math.random()*30-15)+"vw");
    c.style.setProperty("--rot",(Math.random()*1440-720)+"deg");
    c.style.animationDuration=(1.8+Math.random()*1.6)+"s";
    c.style.animationDelay=(Math.random()*.4)+"s";
    box.appendChild(c);
    setTimeout(()=>c.remove(),4200);
  }
}

/* =====================================================================
   ÉVÈNEMENTS
   ===================================================================== */
function appliquerEchelle(){ document.documentElement.style.setProperty("--ui",String(prefs.echelle||1)); }
const ACTIONS={
  accepter:id=>Net.action("accepter",id),
  refuser:id=>Net.action("refuser",id),
  affecter:id=>modalAffecter(id),
  affecterOk:(id,id2)=>{ Net.action("affecter",id,num(id2)); if(modaleOuverte) fermerModal(); },
  retirer:(id,id2)=>Net.action("retirer",id,num(id2)),
  sup:id=>Net.action("toggleSup",id),
  livrer:id=>Net.action("livrer",id),
  abandon:id=>modalAbandon(id),
  former:id=>modalFormer(id),
  formerOk:(id,id2)=>{ Net.action("former",id,id2); fermerModal(); },
  augmenter:id=>Net.action("augmenter",id),
  licencier:id=>modalLicencier(id),
  embaucher:id=>Net.action("embaucher",id),
  acheter:(id,id2)=>Net.action("acheter",id2),
  relance:()=>Net.action("relance"),
  auto:()=>Net.action("auto",!S.auto),
  pause:()=>Net.action("pause",!estPause()),
  vitesse:id=>Net.action("vitesse",id),     /* la sim relance aussi le temps */
  inspecter:id=>selectionner(id),
  deselect:()=>selectionner(null),
  onglet:id=>ouvrirOnglet(id),
  large:()=>basculerTableau(),
  fermerPanneau:()=>fermerPanneau(),
  fermerModal:()=>fermerModal(),
  camera:()=>{ if(window.Jeu&&Jeu.vueSuivante) Jeu.vueSuivante(); },
  son:()=>{ prefs.son=!prefs.son; sauverPrefs(); majSon(); if(prefs.son) bip(660,.08,"triangle"); dirty=true; },
  echelle:id=>{ prefs.echelle=+id||1; sauverPrefs(); appliquerEchelle(); dirty=true; },
  pauseModale:()=>{ prefs.pauseModale=!prefs.pauseModale; sauverPrefs(); dirty=true; },
  sauver:()=>sauverPartie(),
  nouvelle:()=>modalNouvelle(),
  menu:()=>modalQuitter(),
  voirCode:()=>modalCode(),
};
function sauverPartie(){
  if(Net.autorite()&&typeof sauver==="function"){ sauver(); toast("Sauvegarde","Partie enregistrée dans ce navigateur.","g"); }
  else toast("Sauvegarde","Seul l'hôte sauvegarde la partie.","y");
}
function init(){
  if(inited) return;
  appliquerEchelle();
  construireBandeau();
  construireRail();
  inited=true;
  initMenu();
  majPanneau();

  const bas=e=>{ pointeurBas=e.target; };
  const haut=()=>{ pointeurBas=null; if(differe){ differe=false; dirty=true; } };
  document.addEventListener("pointerdown",bas,true);
  document.addEventListener("mousedown",bas,true);
  document.addEventListener("pointerup",haut,true);
  document.addEventListener("mouseup",haut,true);
  document.addEventListener("pointercancel",haut,true);
  addEventListener("blur",haut);

  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-do]"); if(!b||b.disabled) return;
    const f=ACTIONS[b.dataset.do]; if(!f) return;
    e.preventDefault();
    try{ f(num(b.dataset.id),b.dataset.id2); }catch(err){ console.error(err); }
    dirty=true;
  });
  addEventListener("keydown",konami);
}

/* =====================================================================
   BOUCLE (appelée à chaque image par main.js)
   ===================================================================== */
function frame(){
  if(!inited||!S) return;
  consommerFx();
  hud();
  if(finOuverte&&!S.fini) fermerModal();          /* quelqu'un a cliqué sur Continuer */
  else if(S.fini&&!finOuverte&&!menuOuvert&&performance.now()>finAttente) ouvrirFin(S.fini===2,S.finRaison);   /* jamais de fin silencieuse (arrivée en cours, chargement) */
  const now=performance.now();
  if(dirty||now-tRendu>400){
    tRendu=now; dirty=false;
    renduSections();
    majBadges();
    rendreInspect();
    rendreJoueurs();
  }else{
    liveSections();
    if(selection!==null) rendreInspect();
  }
}
function render(){ dirty=true; frame(); }

return {
  init, frame, render, refresh:frame, hud, toast, bip, astuce, infobulle, selectionner,
  modal, fermerModal, ouvrirOnglet, basculerTableau, fermerPanneau,
  ouvrirMenu, fermerMenu, majMenu, hoteDeconnecte, resetFx, resetLocal, retourMenu, sauverPartie, confettis,
  bloque:()=>modaleOuverte||menuOuvert,
  modalOuverte:()=>modaleOuverte,
  menuOuvert:()=>menuOuvert,
  echap(){
    if(modaleOuverte){ if(!$("modal")._sansFermer) fermerModal(); return true; }
    if(selection!==null){ selectionner(null); return true; }
    if(onglet||large){ fermerPanneau(); return true; }
    return false;
  },
  get selection(){ return selection; }, set selection(v){ selectionner(v); },
  get prefs(){ return prefs; }, get profil(){ return profil; }
};
})();
