/* ===================================================================
   RADIO DU STUDIO : de la musique pendant que l'équipe bosse.
   Source : Radio Browser (https://www.radio-browser.info), base
   communautaire et gratuite, sans clé, CORS ouvert. Les flux appartiennent
   à leurs diffuseurs.

   Règles :
   - purement cosmétique : rien dans S ni dans les instantanés ;
   - un seul HTMLAudioElement, pas de WebAudio ;
   - peu de requêtes : rien n'est demandé avant l'ouverture du panneau,
     les listes sont gardées un jour (mémoire + localStorage) ;
   - aucune donnée personnelle envoyée ;
   - les textes venus de l'API passent par textContent, jamais innerHTML ;
   - page en https : seuls les flux https sont gardés (contenu mixte bloqué),
     quelques diffuseurs connus pour servir aussi en https sont « montés » en https ;
   - lecture seulement après un geste du joueur (règle d'autoplay).
   =================================================================== */
"use strict";

var Radio = window.Radio = (function(){

const $=id=>document.getElementById(id);
const CLE_PREFS="studio-online-radio", CLE_CACHE="studio-online-radio-cache";
const JOUR_MS_REEL=24*3600*1000, DELAI_API=7000, SILENCE_MS=8000, MAX_LISTE=30;
const MIROIRS_SECOURS=["de1.api.radio-browser.info","de2.api.radio-browser.info"];
const CODECS={"MP3":1,"AAC":1,"AAC+":1,"OGG":1};
/* diffuseurs qui servent le même flux en https (vérifié) */
const HOTES_HTTPS=/(^|\.)(radiofrance\.fr|fipradio\.fr|infomaniak\.ch|fluxfm\.de|laut\.fm|somafm\.com|nightride\.fm|bigfm\.de)$/i;
const BADGES=["#e5a136","#7da383","#cd6447","#25344f","#ee7c69","#6f93c4","#9b7bc4","#3fa7a0"];

/* ---------- coups de cœur : stations choisies à la main, vérifiées (flux https) ----------
   Les données ci-dessous servent de secours : à l'ouverture, l'API les rafraîchit
   (adresse du flux, logo) par identifiant Radio Browser. */
const COEURS=[
  {id:"827d7140-1da5-4f8d-a553-2d76343ca82f",nom:"FIP",url:"https://direct.fipradio.fr/live/fip-hifi.aac",favicon:"",pays:"FR",tags:["éclectique","jazz","groove"],codec:"AAC",bitrate:192},
  {id:"960cf833-0601-11e8-ae97-52543be04c81",nom:"SomaFM Groove Salad",url:"https://ice5.somafm.com/groovesalad-128-mp3",favicon:"https://somafm.com/img3/groovesalad-400.jpg",pays:"US",tags:["ambient","downtempo","chill"],codec:"MP3",bitrate:128},
  {id:"261bb8f7-70a7-4621-9ff2-fffc327f328a",nom:"Radio Nova",url:"https://novazz.ice.infomaniak.ch/novazz-128.mp3",favicon:"",pays:"FR",tags:["groove","hip-hop","électro"],codec:"MP3",bitrate:128},
  {id:"ae154423-8adb-40d2-b0e3-0c2d4089d852",nom:"bigFM LoFi Focus",url:"https://stream.bigfm.de/lofifocus/mp3-128/radiobrowser",favicon:"https://image.atsw.de/atsw/production/2022-12/LoFi%20Focus_1600x1600Px.jpg",pays:"DE",tags:["lofi","chill beats","focus"],codec:"MP3",bitrate:128},
  {id:"241e1e0d-dbd0-4797-9fb9-ed3b391ac60a",nom:"Nightride FM Chillsynth",url:"https://stream.nightride.fm/chillsynth.mp3",favicon:"https://f4.bcbits.com/img/0021204033_20.jpg",pays:"AU",tags:["synthwave","chillsynth","retro"],codec:"MP3",bitrate:320},
  {id:"d19052d9-963d-4559-98d2-ebd8337023cb",nom:"Radio Meuh",url:"https://radiomeuh2.ice.infomaniak.ch/radiomeuh2-128.mp3",favicon:"https://www.radiomeuh.com/android-icon-192x192.png",pays:"FR",tags:["funk","soul","électro"],codec:"MP3",bitrate:128},
  {id:"960c7c81-0601-11e8-ae97-52543be04c81",nom:"SomaFM Secret Agent",url:"https://ice6.somafm.com/secretagent-128-mp3",favicon:"https://somafm.com/img3/secretagent-400.jpg",pays:"US",tags:["lounge","easy","espionnage"],codec:"MP3",bitrate:128},
  {id:"960eb2e9-0601-11e8-ae97-52543be04c81",nom:"SomaFM Drone Zone",url:"https://ice5.somafm.com/dronezone-128-mp3",favicon:"https://somafm.com/img3/dronezone-400.jpg",pays:"US",tags:["ambient","focus","drone"],codec:"MP3",bitrate:128},
];

/* ---------- humeurs : recherches par tags ---------- */
const HUMEURS=[
  {k:"coeur",  nom:"Coups de cœur"},
  {k:"favs",   nom:"Favoris"},
  {k:"lofi",   nom:"Lofi / chill beats", q:[{tag:"lofi"},{tag:"chillhop"}]},
  {k:"jazz",   nom:"Jazz",               q:[{tag:"jazz"}]},
  {k:"synth",  nom:"Synthwave / retro",  q:[{tag:"synthwave"},{tag:"retrowave"}]},
  {k:"funk",   nom:"Funk & soul",        q:[{tag:"funk"},{tag:"soul"}]},
  {k:"electro",nom:"Électro chill",      q:[{tag:"chillout"},{tag:"downtempo"}]},
  {k:"ambient",nom:"Ambient / focus",    q:[{tag:"ambient"}]},
  {k:"hiphop", nom:"Hip-hop",            q:[{tag:"hip hop"},{tag:"hiphop"}]},
  {k:"indie",  nom:"Rock indé",          q:[{tag:"indie rock"},{tag:"indie"}]},
  {k:"fr",     nom:"Radios françaises",  q:[{countrycode:"FR"}], exclure:/news|talk|info|sport|actualit|relig|cathol|chr[eé]tien|islam|evang/i},
];
const HUMEUR={}; HUMEURS.forEach(h=>{ HUMEUR[h.k]=h; });

/* ---------- préférences locales ---------- */
function lire(k,d){ try{ const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); }catch(e){ return d; } }
function ecrire(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
const prefs=Object.assign({vol:.6,favs:[],dernier:null,enLecture:false,humeur:"coeur"},lire(CLE_PREFS,{}));
if(!Array.isArray(prefs.favs)) prefs.favs=[];
prefs.favs=prefs.favs.map(revalider).filter(Boolean).slice(0,60);
prefs.dernier=revalider(prefs.dernier);
prefs.vol=Math.max(0,Math.min(1,+prefs.vol||0));
if(!HUMEUR[prefs.humeur]) prefs.humeur="coeur";
const sauver=()=>ecrire(CLE_PREFS,prefs);

/* ---------- nettoyage des données de l'API ---------- */
const pageHttps=()=>location.protocol==="https:";
function propre(t,n){ return String(t==null?"":t).replace(/[\u0000-\u001f\u007f<>]/g,"").replace(/[–—]/g,"-").replace(/\s+/g," ").trim().slice(0,n); }
function urlJouable(u){
  u=String(u||"").trim(); if(!u||u.length>500) return null;
  let p; try{ p=new URL(u); }catch(e){ return null; }
  if(p.protocol!=="https:"&&p.protocol!=="http:") return null;
  if(p.username||p.password) return null;
  if(/\.(m3u8?|pls|asx|xspf)$/i.test(p.pathname)) return null;          /* listes de lecture : pas pour <audio> */
  if(p.protocol==="http:"&&pageHttps()){                                 /* contenu mixte bloqué */
    if(!HOTES_HTTPS.test(p.hostname)||(p.port&&p.port!=="80")) return null;
    p.protocol="https:"; p.port="";
  }
  return p.href;
}
function urlImage(u){
  u=String(u||"").trim(); if(!u||u.length>400) return "";
  let p; try{ p=new URL(u); }catch(e){ return ""; }
  return p.protocol==="https:"&&!p.username&&!p.password?p.href:"";      /* https seulement : pas de contenu mixte */
}
function normaliser(s){
  if(!s||typeof s!=="object") return null;
  if(String(s.lastcheckok)!=="1") return null;
  const codec=String(s.codec||"").toUpperCase();
  if(!CODECS[codec]) return null;
  const url=urlJouable(s.url_resolved||s.url); if(!url) return null;
  const nom=propre(s.name,70); if(!nom) return null;
  return {
    id:propre(s.stationuuid||url,80), nom, url, favicon:urlImage(s.favicon),
    pays:String(s.countrycode||"").replace(/[^A-Za-z]/g,"").slice(0,2).toUpperCase(),
    tags:String(s.tags||"").split(",").map(t=>propre(t,22).toLowerCase()).filter(Boolean).slice(0,3),
    codec, bitrate:Math.max(0,Math.min(9999,parseInt(s.bitrate,10)||0))
  };
}
/* station déjà propre (localStorage, partage) : on revérifie tout de même */
function revalider(st){
  if(!st||typeof st!=="object") return null;
  const url=urlJouable(st.url); const nom=propre(st.nom,70);
  if(!url||!nom) return null;
  return {id:propre(st.id||url,80),nom,url,favicon:urlImage(st.favicon),pays:propre(st.pays,2).toUpperCase(),
    tags:Array.isArray(st.tags)?st.tags.map(t=>propre(t,22)).filter(Boolean).slice(0,3):[],
    codec:propre(st.codec,6).toUpperCase(),bitrate:Math.max(0,Math.min(9999,parseInt(st.bitrate,10)||0))};
}
const cleNom=n=>String(n).toLowerCase().replace(/\(.*?\)|\[.*?\]/g,"").replace(/[^a-z0-9]+/g,"");
/* dédoublonnage par nom et par flux, puis débit >= 96 kbps devant (ordre des votes conservé sinon) */
function trier(l,exclure){
  const vusN=new Set(), vusU=new Set(), out=[];
  for(const s of l){
    if(!s) continue;
    if(exclure&&exclure.test(s.nom+" "+s.tags.join(" "))) continue;
    const n=cleNom(s.nom)||s.nom, u=s.url.replace(/^https?:/,"");
    if(vusN.has(n)||vusU.has(u)) continue;
    vusN.add(n); vusU.add(u); out.push(s);
  }
  const rang=s=>s.bitrate>=96?0:s.bitrate===0?1:2;
  return out.map((s,i)=>[s,i]).sort((a,b)=>rang(a[0])-rang(b[0])||a[1]-b[1]).map(x=>x[0]).slice(0,MAX_LISTE);
}

/* ---------- API Radio Browser (miroirs, délai, cache d'un jour) ---------- */
let miroirs=null, miroirIdx=0;
async function getJSON(url,ms){
  const ac=typeof AbortController==="function"?new AbortController():null;
  const t=setTimeout(()=>{ if(ac) ac.abort(); },ms||DELAI_API);
  try{
    const r=await fetch(url,{signal:ac?ac.signal:undefined,credentials:"omit",referrerPolicy:"no-referrer"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }finally{ clearTimeout(t); }
}
async function listeMiroirs(){
  if(miroirs) return miroirs;
  let l=[];
  try{
    const r=await getJSON("https://all.api.radio-browser.info/json/servers",5000);
    if(Array.isArray(r)) l=r.map(s=>s&&String(s.name||"")).filter(n=>/^[a-z0-9-]+\.api\.radio-browser\.info$/i.test(n));
  }catch(e){}
  miroirs=[...new Set(l.concat(MIROIRS_SECOURS))];
  miroirIdx=Math.floor(Math.random()*Math.min(miroirs.length,Math.max(1,l.length)));   /* on répartit la charge */
  return miroirs;
}
async function api(chemin){
  const l=await listeMiroirs();
  let err=null;
  for(let k=0;k<l.length;k++){
    const i=(miroirIdx+k)%l.length;
    try{ const r=await getJSON("https://"+l[i]+chemin); miroirIdx=i; return r; }catch(e){ err=e; }
  }
  throw err||new Error("API indisponible");
}
const memo=new Map();
function cacheLire(k){
  const m=memo.get(k); if(m&&Date.now()-m.t<JOUR_MS_REEL) return m.st;
  const c=lire(CLE_CACHE,null);
  const e=c&&c.v===1&&c.l&&c.l[k];
  if(e&&Date.now()-e.t<JOUR_MS_REEL&&Array.isArray(e.st)){
    const st=e.st.map(revalider).filter(Boolean);
    memo.set(k,{t:e.t,st}); return st;
  }
  return null;
}
function cacheEcrire(k,st){
  const t=Date.now(); memo.set(k,{t,st});
  let c=lire(CLE_CACHE,null); if(!c||c.v!==1||!c.l) c={v:1,l:{}};
  for(const x in c.l) if(!c.l[x]||t-c.l[x].t>JOUR_MS_REEL) delete c.l[x];
  c.l[k]={t,st}; ecrire(CLE_CACHE,c);
}
function requete(q,limite){
  const p=new URLSearchParams(Object.assign({},q,{order:"votes",reverse:"true",hidebroken:"true",limit:String(limite||40)}));
  return "/json/stations/search?"+p.toString();
}
const proto=()=>pageHttps()?"s":"h";
async function chargerHumeur(k){
  const h=HUMEUR[k]; if(!h) return [];
  if(k==="coeur") return chargerCoeurs();
  if(k==="favs") return prefs.favs.slice();
  const ck="h:"+k+":"+proto();
  const c=cacheLire(ck); if(c) return c;
  let ko=0;
  const res=await Promise.all(h.q.map(q=>api(requete(q)).catch(()=>{ ko++; return []; })));
  if(ko===h.q.length) throw new Error("API indisponible");
  const out=trier([].concat(...res.map(r=>Array.isArray(r)?r.map(normaliser):[])),h.exclure);
  cacheEcrire(ck,out);
  return out;
}
let coeurs=COEURS.map(revalider).filter(Boolean), coeursFrais=false;
async function chargerCoeurs(){
  if(coeursFrais) return coeurs;
  const ck="coeurs:"+proto();
  const c=cacheLire(ck);
  if(c&&c.length){ coeurs=c; coeursFrais=true; return coeurs; }
  try{
    const r=await api("/json/stations/byuuid?uuids="+COEURS.map(s=>s.id).join(","));
    const parId={}; if(Array.isArray(r)) r.forEach(s=>{ if(s&&s.stationuuid) parId[s.stationuuid]=s; });
    const l=[];
    COEURS.forEach(base=>{
      const s=parId[base.id];
      if(!s){ const b=revalider(base); if(b) l.push(b); return; }   /* inconnue de l'API : on garde la version vérifiée */
      if(String(s.lastcheckok)!=="1") return;                       /* signalée muette : on l'écarte */
      const url=urlJouable(s.url_resolved||s.url)||urlJouable(base.url); if(!url) return;
      l.push(Object.assign({},base,{url,favicon:base.favicon||urlImage(s.favicon)}));
    });
    if(l.length){ coeurs=l; cacheEcrire(ck,l); }
    coeursFrais=true;
  }catch(e){ /* hors ligne : les données de secours suffisent */ }
  return coeurs;
}
const memoRecherche=new Map();
async function rechercher(txt){
  const q=propre(txt,40); if(q.length<2) return [];
  const k=q.toLowerCase()+":"+proto();
  if(memoRecherche.has(k)) return memoRecherche.get(k);
  let l=(await api(requete({name:q},30)).catch(()=>[])).map(normaliser);
  if(l.filter(Boolean).length<8) l=l.concat((await api(requete({tag:q.toLowerCase()},30)).catch(()=>[])).map(normaliser));
  const out=trier(l);
  memoRecherche.set(k,out);
  return out;
}
/* bonne pratique Radio Browser : signaler une écoute (compteur de clics), une fois par station */
const cliques=new Set();
function signalerEcoute(st){
  if(!st||!/^[0-9a-f-]{36}$/i.test(st.id)||cliques.has(st.id)) return;
  cliques.add(st.id);
  api("/json/url/"+st.id).catch(()=>{});
}

/* =====================================================================
   LECTEUR
   ===================================================================== */
const audio=new Audio();
audio.preload="none";
let courant=null, liste=[], idx=-1;
let etat="arret";                 /* arret | chargement | lecture | pause | erreur */
let essai=0, tDebut=0, tProgres=0, dernierTemps=0, sauts=0, reprendreAuGeste=false;
let musiqueVue=null;

const sonJeu=()=>!(window.UI&&UI.prefs&&UI.prefs.son===false);
const toast=(t,x,c,a)=>{ if(window.UI&&UI.toast) UI.toast(t,x,c,a); };

function majSon(){
  const m=!sonJeu();
  if(audio.muted!==m) audio.muted=m;
  majMonde();
  majUI();
}
function majVolume(){ audio.volume=prefs.vol; audio.muted=!sonJeu(); }
function majMonde(){
  const on=etat==="lecture"&&sonJeu();
  if(on!==musiqueVue){ musiqueVue=on; if(window.World&&World.musique) try{ World.musique(on); }catch(e){} }
}

function jouer(st,l,i){
  st=revalider(st); if(!st) return false;
  if(Array.isArray(l)&&l.length){ liste=l.slice(); idx=typeof i==="number"?i:liste.findIndex(x=>x.id===st.id); }
  else{ idx=liste.findIndex(x=>x.id===st.id); if(idx<0){ liste=[st].concat(coeurs.filter(x=>x.id!==st.id)); idx=0; } }
  courant=st; etat="chargement"; reprendreAuGeste=false;
  const tok=++essai;
  tDebut=tProgres=performance.now(); dernierTemps=0;
  majVolume();
  try{
    if(audio.error){ audio.removeAttribute("src"); audio.load(); }   /* repartir d'un élément propre après un flux mort */
    audio.src=st.url;
  }catch(e){ echec(tok); return false; }
  let p=null;
  try{ p=audio.play(); }catch(e){ echec(tok); return false; }
  if(p&&typeof p.catch==="function") p.catch(e=>{
    if(tok!==essai) return;
    if(e&&e.name==="NotAllowedError"){
      etat="pause"; essai++; reprendreAuGeste=true;
      toast("Radio","Clique sur lecture pour lancer "+st.nom+" (le navigateur bloque le son automatique).","");
      majUI(); majMonde();
    }else if(e&&e.name==="AbortError") return;
    /* le rejet peut venir de l'erreur en retard du flux précédent : on ne conclut que si
       l'élément est vraiment en erreur sur CE flux (sinon le chien de garde tranchera) */
    else if(audio.error&&audio.src===st.url) echec(tok);
  });
  prefs.dernier=st; prefs.enLecture=true; sauver();
  majUI(); majMonde();
  return true;
}
function echec(tok){
  if(tok!==essai) return;                  /* une tentative plus récente a pris la main */
  essai++;
  sauts++;
  const max=Math.min(6,liste.length-1);
  if(liste.length>1&&sauts<=max){
    toast("Zapping","Station muette, on passe à la suivante.","y");
    idx=(idx+1)%liste.length;
    /* hors de l'évènement d'erreur : changer src pendant sa diffusion fait échouer le flux suivant */
    const s=sauts, st=liste[idx], t=++essai;
    etat="chargement"; courant=st; tDebut=performance.now(); majUI();
    setTimeout(()=>{ if(t!==essai) return; jouer(st); sauts=s; },250);
  }else{
    sauts=0;
    try{ audio.pause(); audio.removeAttribute("src"); audio.load(); }catch(e){}
    etat="erreur"; prefs.enLecture=false; sauver();
    toast("Silence radio","Aucune station ne répond. Même le canard s'ennuie.","r");
    majUI(); majMonde();
  }
}
function pause(){
  if(etat!=="lecture"&&etat!=="chargement") return;
  essai++; etat="pause";
  try{ audio.pause(); }catch(e){}
  prefs.enLecture=false; sauver();
  majUI(); majMonde();
}
function arreter(){
  essai++; etat="arret";
  try{ audio.pause(); audio.removeAttribute("src"); audio.load(); }catch(e){}
  prefs.enLecture=false; sauver();
  majUI(); majMonde();
}
/* en direct : reprendre = recharger le flux (sinon on entend le tampon d'il y a dix minutes) */
function basculerLecture(){
  if(etat==="lecture"||etat==="chargement"){ pause(); return; }
  sauts=0;
  if(courant){ jouer(courant); return; }
  const l=vue.length?vue:coeurs;
  if(l.length) jouer(l[0],l,0);
}
function suivante(){ if(!liste.length) return; sauts=0; idx=(idx+1)%liste.length; jouer(liste[idx]); }
function precedente(){ if(!liste.length) return; sauts=0; idx=(idx-1+liste.length)%liste.length; jouer(liste[idx]); }
function auHasard(){
  const l=(vue.length?vue:coeurs).filter(s=>!courant||s.id!==courant.id);
  if(!l.length){ toast("Radio","Rien à tirer au sort ici.",""); return; }
  const s=l[Math.floor(Math.random()*l.length)];
  sauts=0; jouer(s,vue.length?vue:coeurs);
}

audio.addEventListener("playing",()=>{
  if(!courant) return;
  etat="lecture"; sauts=0; tProgres=performance.now(); dernierTemps=audio.currentTime||0;
  signalerEcoute(courant);
  majUI(); majMonde();
});
audio.addEventListener("error",()=>{
  /* une erreur en file d'attente pour l'ancien flux arrive parfois après le changement de src :
     le nouveau chargement a remis audio.error à null, on l'ignore */
  if(!audio.error||!courant||audio.src!==courant.url) return;
  if(etat==="chargement"||etat==="lecture") echec(essai);
});
/* chien de garde : rien après 8 s de chargement, ou flux figé 8 s => station suivante */
setInterval(()=>{
  const now=performance.now();
  if(etat==="chargement"&&now-tDebut>SILENCE_MS) echec(essai);
  else if(etat==="lecture"){
    const t=audio.currentTime||0;
    if(t>dernierTemps+0.05){ dernierTemps=t; tProgres=now; }
    else if(now-tProgres>SILENCE_MS) echec(essai);
  }
  const m=!sonJeu(); if(audio.muted!==m){ audio.muted=m; majMonde(); majUI(); }
  else if(ouvert) majUI();                 /* mode coop qui change, etc. (mises à jour à clés, sans coût) */
},500);

/* reprise de la dernière station au premier geste du joueur en partie */
function geste(){
  if(!reprendreAuGeste||!courant) return;
  const m=window.Net?Net.mode:"menu";
  if(m!=="solo"&&m!=="hote"&&m!=="client") return;
  if(window.UI&&UI.menuOuvert&&UI.menuOuvert()) return;
  reprendreAuGeste=false;
  jouer(courant);
}

/* ---------- favoris ---------- */
const estFav=st=>!!st&&prefs.favs.some(f=>f.id===st.id||f.url===st.url);
function basculerFav(st){
  st=revalider(st); if(!st) return;
  if(estFav(st)){ prefs.favs=prefs.favs.filter(f=>f.id!==st.id&&f.url!==st.url); toast("Radio",st.nom+" retirée des favoris.",""); }
  else{ prefs.favs.unshift(st); prefs.favs=prefs.favs.slice(0,60); toast("Radio",st.nom+" ajoutée aux favoris.","g"); }
  sauver();
  if(humeur==="favs") afficher(prefs.favs.slice());
  majUI();
}

/* ---------- coop : partager / recevoir ---------- */
function partager(){
  if(!courant){ toast("Radio","Lance d'abord une station.",""); return; }
  if(!window.Net||!Net.partagerRadio) return;
  const r=Net.partagerRadio({nom:courant.nom,url:courant.url,favicon:courant.favicon});
  if(r&&r.ok) toast("Radio",courant.nom+" partagée avec le studio.","g");
  else toast("Radio",(r&&r.msg)||"Partage impossible.","y");
}
function recu(m){
  if(!m||typeof m!=="object") return;
  const st=revalider({id:"partage:"+m.url,nom:m.nom,url:m.url,favicon:m.favicon});
  if(!st) return;                           /* flux http sur une page https, ou adresse refusée */
  const de=propre(m.de,16)||"Quelqu'un";
  toast("Radio",de+" met "+st.nom,"a",{t:"Écouter aussi",f:()=>{ sauts=0; jouer(st); }});
}

/* =====================================================================
   INTERFACE
   ===================================================================== */
const P={
  radio:'<rect x="2.5" y="8" width="19" height="13" rx="2.5"/><path d="m7 8 9-5"/><circle cx="8" cy="14.5" r="3"/><path d="M15 12.5h3.5M15 16h3.5"/>',
  lecture:'<path d="M7 4.5v15l12-7.5z"/>',
  pause:'<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>',
  suiv:'<path d="M5 5v14l10-7zM19 5v14"/>',
  prec:'<path d="M19 5v14L9 12zM5 5v14"/>',
  hasard:'<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  etoile:'<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  partage:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  volume:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  muet:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>',
  loupe:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
};
const ico=(n,cls)=>'<svg class="i'+(cls?" "+cls:"")+'" viewBox="0 0 24 24" aria-hidden="true">'+(P[n]||"")+'</svg>';
function setT(n,t){ if(n&&n._t!==t){ n._t=t; n.textContent=t; } }
function setC(n,c,on){ if(n&&n.classList.contains(c)!==!!on) n.classList.toggle(c,!!on); }
function setA(n,a,v){ if(n&&n.getAttribute(a)!==v) n.setAttribute(a,v); }
function el(tag,cls,txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!==undefined) e.textContent=txt; return e; }

let ouvert=false, inited=false, humeur=prefs.humeur, vue=[], chargeTok=0, rechercheTxt="", tRecherche=null;
const R={};                       /* références DOM */
const lignes=new Map();           /* id station -> élément de liste (liste à clés) */
let cleVue="";

/* logo de station : favicon https, ou pastille avec l'initiale */
function hashTxt(t){ let h=0; for(let i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))|0; return Math.abs(h); }
function pastille(st,cls){
  const s=el("span",(cls||"rlogo")+" rbadge",(st&&st.nom?st.nom.replace(/^(radio|somafm|the)\s+/i,"").charAt(0):"?").toUpperCase()||"?");
  s.style.background=BADGES[hashTxt(st&&st.nom||"")%BADGES.length];
  s.setAttribute("aria-hidden","true");
  return s;
}
function logo(st,cls){
  if(!st||!st.favicon) return pastille(st,cls);
  const w=el("span",cls||"rlogo");
  const img=new Image();
  img.alt=""; img.decoding="async"; img.loading="lazy"; img.referrerPolicy="no-referrer";
  img.onerror=()=>{ const p=pastille(st,cls); if(w.parentNode) w.replaceWith(p); };
  img.src=st.favicon;
  w.appendChild(img);
  return w;
}
function metaDe(st){
  if(!st) return "";
  const m=[];
  if(st.pays) m.push(st.pays);
  if(st.tags&&st.tags.length) m.push(st.tags.slice(0,2).join(", "));
  if(st.bitrate) m.push(st.bitrate+" kbps");
  else if(st.codec) m.push(st.codec);
  return m.join(" · ");
}

function construire(){
  if(inited) return;
  const box=$("radio"), pill=$("radioPill"), btn=$("tRadio");
  if(!box||!pill||!btn) return;
  inited=true;
  btn.innerHTML=ico("radio")+'<i class="rpt" aria-hidden="true"></i>';
  box.innerHTML=
    '<header class="rph"><span class="rti" title="Musique d\'ascenseur interdite">'+ico("radio")+'</span>'
    +'<div class="rtt"><h2>Radio du studio</h2><small>Musique d\'ascenseur interdite</small></div>'
    +'<button class="ib" data-radio="fermer" data-lbl="Fermer (R)" aria-label="Fermer la radio">'+ico("x")+'</button></header>'
    +'<div class="rnow" data-r="now">'
      +'<span class="rlogo-zone" data-r="logo"></span>'
      +'<div class="rnt"><b data-r="nom"></b><small data-r="meta"></small><span class="retat" data-r="etat"></span></div>'
      +'<span class="eq stop" data-r="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
    +'</div>'
    +'<div class="rctl">'
      +'<button class="ib" data-radio="prec" data-lbl="Station précédente" aria-label="Station précédente">'+ico("prec")+'</button>'
      +'<button class="rplay" data-radio="lecture" data-r="play" aria-label="Lecture"></button>'
      +'<button class="ib" data-radio="suiv" data-lbl="Station suivante" aria-label="Station suivante">'+ico("suiv")+'</button>'
      +'<button class="ib" data-radio="hasard" data-lbl="Au hasard" aria-label="Au hasard">'+ico("hasard")+'</button>'
      +'<button class="ib" data-radio="fav" data-r="fav" data-lbl="Favori" aria-label="Ajouter aux favoris">'+ico("etoile")+'</button>'
      +'<button class="ib" data-radio="partager" data-r="part" data-lbl="Partager au studio" aria-label="Partager au studio">'+ico("partage")+'</button>'
    +'</div>'
    +'<label class="rvol"><span data-r="volIco">'+ico("volume")+'</span><input type="range" min="0" max="100" step="1" data-r="vol" aria-label="Volume de la radio"><b data-r="volTxt" class="num"></b></label>'
    +'<div class="rchips" data-r="chips" role="tablist" aria-label="Ambiances"></div>'
    +'<label class="rcherche">'+ico("loupe")+'<input type="search" data-r="cherche" maxlength="40" placeholder="Chercher une station ou un style" autocomplete="off" spellcheck="false" aria-label="Chercher une station"></label>'
    +'<div class="rliste" data-r="liste" role="list"></div>'
    +'<div class="rvide" data-r="vide"></div>'
    +'<p class="rsrc">Stations : <a href="https://www.radio-browser.info" target="_blank" rel="noopener noreferrer">Radio Browser</a>, base communautaire. Les flux appartiennent à leurs diffuseurs.</p>';
  box.querySelectorAll("[data-r]").forEach(n=>{ R[n.getAttribute("data-r")]=n; });
  pill.innerHTML='<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="rpn"></span>'
    +'<button class="rpb" data-radio="lecture" aria-label="Pause">'+ico("pause")+'</button>';
  R.pill=pill; R.pillNom=pill.querySelector(".rpn"); R.pillBtn=pill.querySelector(".rpb"); R.pillEq=pill.querySelector(".eq"); R.btn=btn;

  /* ambiances */
  HUMEURS.forEach(h=>{
    const b=el("button","rchip",h.nom); b.type="button";
    b.setAttribute("data-radio","humeur"); b.setAttribute("data-k",h.k); b.setAttribute("role","tab");
    R.chips.appendChild(b);
  });
  R.vol.value=String(Math.round(prefs.vol*100));
  R.vol.addEventListener("input",()=>{ prefs.vol=Math.max(0,Math.min(1,(+R.vol.value||0)/100)); audio.volume=prefs.vol; majUI(); });
  R.vol.addEventListener("change",sauver);
  R.cherche.addEventListener("input",()=>{
    clearTimeout(tRecherche);
    const t=R.cherche.value.trim();
    tRecherche=setTimeout(()=>{ if(t.length>=2) chercher(t); else if(rechercheTxt){ rechercheTxt=""; choisirHumeur(humeur); } },450);
  });
  R.cherche.addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.stopPropagation(); R.cherche.blur(); } });

  /* un seul gestionnaire pour tout le panneau, la pastille et le bouton du bandeau */
  const clic=e=>{
    const b=e.target.closest("[data-radio]");
    if(!b){
      if(e.currentTarget===pill){ ouvrir(); return; }
      const ln=e.target.closest(".rst");
      if(ln&&ln._st){ sauts=0; jouer(ln._st,vue,vue.indexOf(ln._st)); }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const a=b.getAttribute("data-radio");
    if(a==="basculer") basculer();
    else if(a==="fermer") fermer();
    else if(a==="lecture") basculerLecture();
    else if(a==="suiv") suivante();
    else if(a==="prec") precedente();
    else if(a==="hasard") auHasard();
    else if(a==="fav") basculerFav(courant);
    else if(a==="partager") partager();
    else if(a==="humeur"){ rechercheTxt=""; R.cherche.value=""; choisirHumeur(b.getAttribute("data-k")); }
    else if(a==="favLigne"){ const ln=b.closest(".rst"); if(ln&&ln._st) basculerFav(ln._st); }
  };
  box.addEventListener("click",clic); pill.addEventListener("click",clic); btn.addEventListener("click",clic);
  box.addEventListener("keydown",e=>{
    if(e.key!=="Enter"&&e.key!==" ") return;
    const ln=e.target.closest&&e.target.closest(".rst");
    if(ln&&e.target===ln&&ln._st){ e.preventDefault(); sauts=0; jouer(ln._st,vue,vue.indexOf(ln._st)); }
  });
  document.addEventListener("pointerdown",geste,true);
  document.addEventListener("keydown",geste,true);
  majUI();
}

/* liste à clés : chaque ligne n'est créée qu'une fois par station, puis seulement mise à jour */
function ligne(st){
  let n=lignes.get(st.id);
  if(n&&n._url===st.url) { n._st=st; return n; }
  n=el("div","rst"); n.setAttribute("role","listitem"); n.tabIndex=0;
  n._st=st; n._url=st.url;
  n.appendChild(logo(st));
  const tx=el("span","rtx"); tx.appendChild(el("b","",st.nom)); tx.appendChild(el("small","",metaDe(st))); n.appendChild(tx);
  const eq=el("span","eq mini"); eq.setAttribute("aria-hidden","true"); for(let i=0;i<3;i++) eq.appendChild(el("i")); n.appendChild(eq);
  const f=el("button","rfav"); f.type="button"; f.setAttribute("data-radio","favLigne"); f.innerHTML=ico("etoile"); n.appendChild(f);
  n._fav=f;
  lignes.set(st.id,n);
  return n;
}
function afficher(l,vide){
  vue=Array.isArray(l)?l:[];
  if(!inited) return;
  const cle=vue.map(s=>s.id+"|"+s.url).join(",");
  if(cle!==cleVue){
    cleVue=cle;
    const garder=new Set(vue.map(s=>s.id));
    lignes.forEach((n,id)=>{ if(!garder.has(id)){ n.remove(); lignes.delete(id); } });
    const frag=document.createDocumentFragment();
    vue.forEach(s=>frag.appendChild(ligne(s)));
    R.liste.appendChild(frag);
    R.liste.scrollTop=0;
  }
  setT(R.vide,vue.length?"":(vide||"Silence radio. Même le canard s'ennuie."));
  setC(R.vide,"on",!vue.length);
  majUI();
}
function charge(msg){
  if(!inited) return;
  setT(R.vide,msg||"Réglage de l'antenne..."); setC(R.vide,"on",true); setC(R.liste,"attente",true);
}
async function choisirHumeur(k){
  if(!HUMEUR[k]) k="coeur";
  humeur=k; prefs.humeur=k; sauver();
  const tok=++chargeTok;
  majUI();
  if(k==="coeur"&&!coeursFrais) afficher(coeurs);      /* immédiat, puis rafraîchi */
  else if(k==="favs") { afficher(prefs.favs.slice(),"Pas encore de favoris. Une étoile sur une station, et elle vit ici."); return; }
  else if(!memo.has("h:"+k+":"+proto())) { afficher([]); charge(); }
  try{
    const l=await chargerHumeur(k);
    if(tok!==chargeTok) return;
    setC(R.liste,"attente",false);
    afficher(l,"Rien de bon sur cette fréquence. Essaie une autre ambiance.");
  }catch(e){
    if(tok!==chargeTok) return;
    setC(R.liste,"attente",false);
    afficher(k==="coeur"?coeurs:[],"Antenne introuvable (pas de connexion ?). Les coups de cœur marchent quand même.");
  }
}
async function chercher(t){
  rechercheTxt=t; humeur=""; majUI();
  const tok=++chargeTok;
  afficher([]); charge("On cherche « "+propre(t,40)+" »...");
  try{
    const l=await rechercher(t);
    if(tok!==chargeTok) return;
    setC(R.liste,"attente",false);
    afficher(l,"Aucune station pour « "+propre(t,40)+" ». Silence radio.");
  }catch(e){
    if(tok!==chargeTok) return;
    setC(R.liste,"attente",false);
    afficher([],"Recherche impossible pour l'instant.");
  }
}

const LIB_ETAT={arret:"Choisis une station",chargement:"Réglage de l'antenne...",lecture:"En direct",pause:"En pause",erreur:"Silence radio"};
function majUI(){
  if(!inited) return;
  const joue=etat==="lecture", charge_=etat==="chargement", actif=joue||charge_;
  const coop=!!(window.Net&&(Net.mode==="hote"||Net.mode==="client"));
  /* bouton du bandeau + pastille */
  setC(R.btn,"on",ouvert); setC(R.btn,"joue",actif);
  setA(R.btn,"data-lbl",ouvert?"Fermer la radio (R)":"Radio du studio (R)");
  setC(R.pill,"on",actif&&!ouvert&&!!courant);
  setT(R.pillNom,courant?courant.nom:"");
  setC(R.pillEq,"stop",!joue||!sonJeu());
  /* carte « à l'antenne » */
  const st=courant;
  if(R.logo._id!==(st?st.id+st.favicon:"")){
    R.logo._id=st?st.id+st.favicon:"";
    R.logo.textContent="";
    R.logo.appendChild(st?logo(st,"rlogo grand"):pastille({nom:"?"},"rlogo grand"));
  }
  setT(R.nom,st?st.nom:"Silence radio");
  setT(R.meta,st?metaDe(st):"Même le canard s'ennuie.");
  setT(R.etat,(reprendreAuGeste&&st&&etat!=="lecture")?"Clique n'importe où pour reprendre":(joue&&!sonJeu()?"En direct (son coupé)":LIB_ETAT[etat]||""));
  R.etat.className="retat "+etat;
  setC(R.eq,"stop",!joue||!sonJeu());
  if(R.play._a!==actif){ R.play._a=actif; R.play.innerHTML=ico(actif?"pause":"lecture"); R.play.setAttribute("aria-label",actif?"Pause":"Lecture"); }
  if(R.pillBtn._a!==actif){ R.pillBtn._a=actif; R.pillBtn.innerHTML=ico(actif?"pause":"lecture"); }
  setC(R.fav,"on",estFav(st)); R.fav.disabled=!st;
  setA(R.fav,"data-lbl",estFav(st)?"Retirer des favoris":"Ajouter aux favoris");
  R.part.style.display=coop?"":"none";
  R.part.disabled=!st||!/^https:/.test(st?st.url:"");
  /* volume */
  setT(R.volTxt,Math.round(prefs.vol*100)+" %");
  const ic=(!sonJeu()||prefs.vol===0)?"muet":"volume";
  if(R.volIco._i!==ic){ R.volIco._i=ic; R.volIco.innerHTML=ico(ic); }
  setA(R.volIco,"title",sonJeu()?"":"Son du jeu coupé : la radio aussi");
  /* ambiances */
  R.chips.querySelectorAll(".rchip").forEach(b=>{ const on=b.getAttribute("data-k")===humeur; setC(b,"on",on); setA(b,"aria-selected",on?"true":"false"); });
  /* lignes : station en cours, favoris */
  lignes.forEach(n=>{
    const s=n._st, enCours=!!(st&&s&&(s.id===st.id||s.url===st.url));
    setC(n,"on",enCours); setC(n,"joue",enCours&&joue&&sonJeu());
    const f=estFav(s); setC(n._fav,"on",f);
    setA(n._fav,"aria-label",f?"Retirer "+s.nom+" des favoris":"Ajouter "+s.nom+" aux favoris");
  });
}

function ouvrir(){
  construire(); if(!inited) return;
  if(ouvert) return;
  ouvert=true;
  $("radio").classList.add("on");
  const hud=$("hud"); if(hud) hud.classList.add("radio-ouverte");
  if(!vue.length&&!rechercheTxt) choisirHumeur(humeur||"coeur");
  majUI();
}
function fermer(){
  if(!ouvert) return;
  ouvert=false;
  $("radio").classList.remove("on");
  const hud=$("hud"); if(hud) hud.classList.remove("radio-ouverte");
  const a=document.activeElement; if(a&&$("radio").contains(a)) a.blur();
  majUI();
}
function basculer(){ if(ouvert) fermer(); else ouvrir(); }

function init(){
  construire();
  if(prefs.dernier){
    courant=prefs.dernier; etat="pause";
    reprendreAuGeste=!!prefs.enLecture;    /* elle jouait quand on est parti : reprise au premier geste */
  }
  majUI();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();

return {
  ouvrir, fermer, basculer, jouer, pause, arreter, suivante, precedente, auHasard, basculerLecture,
  basculerFav, partager, recu, majSon, choisirHumeur, chercher,
  echap(){ if(ouvert){ fermer(); return true; } return false; },
  get ouvert(){ return ouvert; }, get etat(){ return etat; }, get courant(){ return courant; },
  get liste(){ return liste.slice(); }, get vue(){ return vue.slice(); }, get humeur(){ return humeur; },
  get coeurs(){ return coeurs.slice(); }, get audio(){ return audio; }, get prefs(){ return prefs; },
  HUMEURS:HUMEURS.map(h=>({k:h.k,nom:h.nom})),
  /* pour les tests : réglages internes */
  _test:{ normaliser, urlJouable, trier }
};
})();
