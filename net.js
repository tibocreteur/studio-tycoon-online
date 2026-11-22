/* ===================================================================
   RÉSEAU : coop à plusieurs dans le même studio (PeerJS, pair à pair).
   L'hôte fait tourner la simulation ; les clients envoient des commandes
   et reçoivent des instantanés. En solo, tout reste local.

   Protocole (objets envoyés par DataConnection, sérialisation PeerJS) :
     client -> hôte : hello{nom,couleur,v} · cmd{nom,args,rid} · pos{x,z,cap,mode}
                      ping{t} · pong{t} · radio{nom,url,favicon}
     hôte -> client : bienvenue{id,code} · snap{s,p?} · av{l:[{id,nom,couleur,x,z,cap,mode,ping}]}
                      res{rid,ok,msg} · info{titre,txt,c} · plein{} · bye{} · ping{t} · pong{t}
                      radio{de,nom,url,favicon}
   radio = « Partager au studio » (radio.js) : purement cosmétique, hors de S. L'hôte
   nettoie (https seulement, longueurs bornées, cadence limitée) puis relaie aux autres ;
   le destinataire voit un toast avec « Écouter aussi », jamais de lecture automatique.
   snap.s = snapshot() de la sim (chaîne JSON). Débit : un instantané complet pèse
   10 à 20 Ko, dont la moitié de journal et de file d'effets. Les envois réguliers
   sont donc PARTIELS (p:1) : S.journal n'y figure que s'il a changé, S.fx ne
   contient que les effets nouveaux. Le client recolle les morceaux avant
   appliquerSnapshot (journal précédent, fx fusionnés), le contrat de la sim est
   inchangé. Un nouveau venu reçoit d'abord un instantané complet.
   Chien de garde : un pair muet depuis SILENCE_MAX ms est considéré parti.
   =================================================================== */
"use strict";

var Net = window.Net = (function(){

const ALPHA="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   /* sans I, O, 0, 1 */
const PREFIXE="studio-";
const MAX_JOUEURS=4;
const PERIODE_SNAP=200, PERIODE_SNAP_MIN=50, PERIODE_AV=100, PERIODE_PING=2000, PERIODE_POS=100;
const SILENCE_MAX=15000, HELLO_MAX=10000;   /* au-delà : pair considéré comme parti */
const RADIO_MIN_MS=4000;                    /* un partage de radio toutes les 4 s au plus, par joueur */
const COMMANDES=["accepter","refuser","affecter","retirer","toggleSup","livrer","abandonner","embaucher",
  "licencier","augmenter","former","acheter","relance","auto","vitesse","pause","continuer","nouvellePartie"];

let mode="menu";            /* menu | connexion | solo | hote | client */
let monId="hote";
let profil={nom:"Joueur",couleur:"#e5a136"};
let peer=null, code=null, connHote=null;
const invites=new Map();    /* hôte : peerId -> {conn,nom,couleur,ping,pos,hello} */
let avDistants=[];          /* client : dernière liste d'avatars reçue de l'hôte */
let maPos=null;
let tSnap=0, tDernierSnap=0, tAv=0, tPing=0, tPos=0, tJoueurs=0, snapDu=false;
let pingHote=null, dernierPosEnvoye="";
let attente=[];             /* messages reçus avant que la sim soit prête */
let rid=1, essais=0, minuteur=null, rappels=null;
let jourHote=null;          /* client : dernier jour reçu, pour lisser la lumière */
let vuHote=0;               /* client : dernier message reçu de l'hôte (performance.now) */
let cleJournal="", fxEnvoye=-1;   /* hôte : ce qui a déjà été diffusé (instantanés partiels) */
let tDernierTick=0;

/* ---------- utilitaires ---------- */
const dispo=()=>typeof window.Peer==="function";
const etatLib=()=>dispo()?"ok":(window.__peerEtat==="ko"?"ko":"attente");
function genCode(){ let s=""; for(let i=0;i<5;i++) s+=ALPHA[Math.floor(Math.random()*ALPHA.length)]; return s; }
function nettoieNom(n){
  n=String(n==null?"":n).replace(/[\u0000-\u001f<>]/g,"").replace(/[\u2013\u2014]/g,"-").trim().slice(0,16);
  return n||"Invité";
}
function nettoieCouleur(c){ return /^#[0-9a-f]{6}$/i.test(String(c))?String(c):"#7da383"; }
function nombre(v,b){ v=+v; return isFinite(v)?Math.max(-b,Math.min(b,v)):0; }
/* partage de radio : nom propre, adresses https uniquement, longueurs bornées */
function urlHttps(u,max){
  if(typeof u!=="string"||!u||u.length>max||/[\s"'<>\\]/.test(u)) return "";
  let p; try{ p=new URL(u); }catch(e){ return ""; }
  if(p.protocol!=="https:"||!p.hostname||p.username||p.password) return "";
  return p.href.length<=max?p.href:"";
}
function nettoieRadio(d){
  if(!d||typeof d!=="object") return null;
  const nom=String(typeof d.nom==="string"?d.nom:"").replace(/[\u0000-\u001f\u007f<>]/g,"").replace(/[\u2013\u2014]/g,"-").trim().slice(0,80);
  const url=urlHttps(d.url,500);
  if(!nom||!url) return null;
  return {nom:nom,url:url,favicon:urlHttps(d.favicon,400)};
}
function radioRecu(m){ if(window.Radio&&Radio.recu) try{ Radio.recu(m); }catch(e){ console.error(e); } }
function envoyer(conn,msg){ try{ if(conn&&conn.open) conn.send(msg); }catch(e){} }
function diffuser(msg){ invites.forEach(j=>{ if(j.hello) envoyer(j.conn,msg); }); }
function toast(t,x,c){ if(window.UI&&UI.toast) UI.toast(t,x,c); }
function messageErreur(e){
  const t=e&&e.type;
  if(t==="peer-unavailable") return "Partie introuvable. Vérifie le code (l'hôte doit avoir la partie ouverte).";
  if(t==="network"||t==="server-error"||t==="socket-error"||t==="socket-closed")
    return "Impossible de joindre le serveur de mise en relation. Vérifie ta connexion internet.";
  if(t==="browser-incompatible") return "Ce navigateur ne gère pas le pair à pair (WebRTC).";
  if(t==="unavailable-id") return "Ce code est déjà pris.";
  return "Erreur réseau"+(t?" ("+t+")":"")+".";
}

/* S.joueurs est tenu par la sim (cmd rejoindre / partir) ; l'hôte vérifie
   régulièrement qu'il correspond aux connexions réelles (état rechargé, etc.) */
function cmdSim(nom,args,jid){
  if(typeof cmd!=="function"||!S) return {ok:false};
  try{ return cmd(nom,args,jid)||{ok:true}; }catch(e){ console.error(e); return {ok:false}; }
}
function assureJoueurs(){
  if(!S||(mode!=="hote"&&mode!=="solo")) return;
  const J=S.joueurs||{};
  const voulu={hote:{nom:profil.nom,couleur:profil.couleur}};
  if(mode==="hote") invites.forEach((j,id)=>{ if(j.hello) voulu[id]={nom:j.nom,couleur:j.couleur}; });
  Object.keys(J).forEach(id=>{ if(!voulu[id]&&id!=="hote") cmdSim("partir",[],id); });
  Object.keys(voulu).forEach(id=>{
    const a=J[id], b=voulu[id];
    if(!a||a.nom!==b.nom||a.couleur!==b.couleur) cmdSim("rejoindre",[b.nom,b.couleur],id);
  });
}

function nettoyer(){
  clearTimeout(minuteur); minuteur=null;
  /* on détache d'abord : une fermeture synchrone ne doit pas rappeler perteHote/depart */
  const vieux=[...invites.values()], ch=connHote, pr=peer;
  invites.clear(); connHote=null; peer=null;
  vieux.forEach(j=>{ try{ j.conn.close(); }catch(e){} });
  if(ch){ try{ ch.close(); }catch(e){} }
  if(pr){ try{ pr.destroy(); }catch(e){} }
  code=null; avDistants=[]; pingHote=null; jourHote=null; attente=[];
  snapDu=false; tSnap=tAv=tPing=tPos=0; dernierPosEnvoye="";
  cleJournal=""; fxEnvoye=-1; vuHote=0;
}

/* =====================================================================
   SOLO
   ===================================================================== */
function solo(p){
  nettoyer();
  if(p) profil={nom:nettoieNom(p.nom),couleur:nettoieCouleur(p.couleur)};
  mode="solo"; monId="hote";
  assureJoueurs();
}

/* =====================================================================
   HÔTE
   ===================================================================== */
function heberger(p,cb){
  cb=cb||{};
  if(!dispo()){ cb.erreur&&cb.erreur("Module réseau indisponible."); return; }
  nettoyer();
  if(p) profil={nom:nettoieNom(p.nom),couleur:nettoieCouleur(p.couleur)};
  mode="connexion"; monId="hote"; essais=0; rappels=cb;
  ouvrirHote();
}
function ouvrirHote(){
  code=genCode();
  let pr;
  try{ pr=new window.Peer(PREFIXE+code,{debug:0}); }
  catch(e){ mode="menu"; rappels.erreur&&rappels.erreur("Impossible de créer la partie."); return; }
  peer=pr;
  clearTimeout(minuteur);
  minuteur=setTimeout(()=>{
    if(mode==="connexion"&&peer===pr){ nettoyer(); mode="menu";
      rappels.erreur&&rappels.erreur("Le serveur de mise en relation ne répond pas. Réessaie dans un instant."); }
  },15000);
  pr.on("open",()=>{
    if(peer!==pr) return;
    clearTimeout(minuteur);
    mode="hote"; monId="hote";
    assureJoueurs();
    rappels.ok&&rappels.ok(code);
  });
  pr.on("connection",accueillir);
  pr.on("disconnected",()=>{
    /* le lien avec le serveur de relation a sauté : les parties en cours continuent, on se réinscrit */
    if(peer===pr && mode==="hote" && !pr.destroyed){ try{ pr.reconnect(); }catch(e){} }
  });
  pr.on("error",e=>{
    if(peer!==pr) return;
    if(e&&e.type==="unavailable-id" && mode==="connexion" && essais<5){
      essais++; try{ pr.destroy(); }catch(x){} peer=null; ouvrirHote(); return;
    }
    if(mode==="connexion"){ clearTimeout(minuteur); nettoyer(); mode="menu"; rappels.erreur&&rappels.erreur(messageErreur(e)); return; }
    /* en jeu : une erreur ponctuelle (un invité injoignable) n'arrête pas la partie */
    if(e&&e.type!=="peer-unavailable") console.warn("PeerJS",e);
  });
}

function accueillir(c){
  if(mode!=="hote"){ try{ c.close(); }catch(e){} return; }
  const id=c.peer;
  let nb=0; invites.forEach(j=>{ if(j.conn.open||j.hello) nb++; });
  if(nb>=MAX_JOUEURS-1){
    c.on("open",()=>{ envoyer(c,{type:"plein"}); setTimeout(()=>{ try{ c.close(); }catch(e){} },600); });
    return;
  }
  const meta=c.metadata||{};
  const j={conn:c,nom:nettoieNom(meta.nom),couleur:nettoieCouleur(meta.couleur),ping:null,pos:null,hello:false,vu:performance.now()};
  invites.set(id,j);
  c.on("data",d=>recuHote(id,d));
  c.on("close",()=>depart(id,c));
  c.on("error",()=>depart(id,c));
}

function recuHote(id,d){
  if(!d||typeof d!=="object") return;
  const j=invites.get(id); if(!j) return;
  j.vu=performance.now();
  switch(d.type){
    case "hello":{
      const nouveau=!j.hello;
      j.nom=nettoieNom(d.nom); j.couleur=nettoieCouleur(d.couleur); j.hello=true;
      assureJoueurs();
      envoyer(j.conn,{type:"bienvenue",id:id,code:code});
      envoyerSnap(j.conn);
      if(nouveau) snapDu=true;   /* l'arrivée est annoncée par la sim (journal + toast) */
      break;
    }
    case "cmd":{
      if(typeof d.nom!=="string"||COMMANDES.indexOf(d.nom)<0) return;
      const args=Array.isArray(d.args)?d.args.slice(0,4):[];
      let r={ok:false,msg:"Simulation indisponible."};
      try{ if(typeof cmd==="function") r=cmd(d.nom,args,id)||{ok:true}; }
      catch(e){ r={ok:false,msg:"Commande impossible."}; console.error(e); }
      /* rid renvoyé tel quel seulement s'il est numérique : pas d'écho d'un objet arbitraire */
      envoyer(j.conn,{type:"res",rid:(typeof d.rid==="number"&&isFinite(d.rid))?d.rid:0,ok:!!r.ok,msg:String(r.msg||"").slice(0,200)});
      snapDu=true;
      break;
    }
    case "pos":
      j.pos={x:nombre(d.x,200),z:nombre(d.z,200),cap:nombre(d.cap,100),mode:d.mode==="marche"?"marche":"idle"};
      break;
    case "ping": envoyer(j.conn,{type:"pong",t:d.t}); break;
    case "pong": if(typeof d.t==="number") j.ping=Math.max(0,Math.round(performance.now()-d.t)); break;
    case "radio":{
      if(!j.hello) return;
      const now=performance.now();
      if(j.tRadio&&now-j.tRadio<RADIO_MIN_MS) return;
      const r=nettoieRadio(d); if(!r) return;
      j.tRadio=now;
      const m={type:"radio",de:j.nom,nom:r.nom,url:r.url,favicon:r.favicon};
      invites.forEach((k,kid)=>{ if(k.hello&&kid!==id) envoyer(k.conn,m); });
      radioRecu(m);
      break;
    }
  }
}

function depart(id,c){
  const j=invites.get(id);
  if(!j||(c&&j.conn!==c)) return;
  invites.delete(id);
  if(mode==="hote") cmdSim("partir",[],id);
  snapDu=true;
  if(j.hello&&mode==="hote"){
    toast("Coop",j.nom+" a quitté le studio.","y");
    diffuser({type:"info",titre:"Coop",txt:j.nom+" a quitté le studio.",c:"y"});
  }
}

/* conn fourni : instantané complet pour ce seul invité (arrivée).
   Sinon : diffusion partielle (journal seulement s'il a changé, fx nouveaux seulement). */
function envoyerSnap(conn){
  if(typeof snapshot!=="function"||!S) return;
  let s;
  if(conn){
    try{ s=snapshot(); }catch(e){ console.error(e); return; }
    envoyer(conn,{type:"snap",s:s});
    return;
  }
  const J=S.journal, F=S.fx;
  const j0=Array.isArray(J)&&J[0];
  const cle=(Array.isArray(J)?J.length:0)+"|"+(j0?j0.j+"|"+j0.t:"");
  const memeJournal=cle===cleJournal;
  const maxFx=Array.isArray(F)?F.reduce((m,f)=>f&&f.id>m?f.id:m,0):0;
  /* nouvelle partie (compteur d'effets revenu en arrière) : on renvoie tout */
  const partiel=fxEnvoye>=0&&maxFx>=fxEnvoye;
  try{
    if(partiel){
      if(memeJournal) S.journal=undefined;          /* JSON.stringify omet la clé */
      S.fx=F.filter(f=>f&&f.id>fxEnvoye);
    }
    s=snapshot();
  }catch(e){ console.error(e); return; }
  finally{ S.journal=J; S.fx=F; }
  cleJournal=cle; fxEnvoye=maxFx;
  diffuser(partiel?{type:"snap",s:s,p:1}:{type:"snap",s:s});
}

/* =====================================================================
   CLIENT
   ===================================================================== */
function rejoindre(cd,p,cb){
  cb=cb||{};
  if(!dispo()){ cb.erreur&&cb.erreur("Module réseau indisponible."); return; }
  nettoyer();
  if(p) profil={nom:nettoieNom(p.nom),couleur:nettoieCouleur(p.couleur)};
  cd=String(cd||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);
  if(cd.length<4){ cb.erreur&&cb.erreur("Code incomplet."); return; }
  mode="connexion"; rappels=cb; code=cd;
  let pr;
  try{ pr=new window.Peer({debug:0}); }
  catch(e){ mode="menu"; cb.erreur&&cb.erreur("Impossible d'ouvrir la connexion."); return; }
  peer=pr;
  let premier=true;
  minuteur=setTimeout(()=>{
    if(mode==="connexion"&&peer===pr){ nettoyer(); mode="menu";
      cb.erreur&&cb.erreur("Pas de réponse de l'hôte. Vérifie le code, ou le réseau bloque peut-être le pair à pair."); }
  },15000);
  pr.on("open",id=>{
    if(peer!==pr) return;
    monId=id;
    const c=pr.connect(PREFIXE+cd,{reliable:true,metadata:{nom:profil.nom,couleur:profil.couleur}});
    connHote=c;
    c.on("open",()=>envoyer(c,{type:"hello",nom:profil.nom,couleur:profil.couleur,v:1}));
    c.on("data",d=>{
      if(d&&d.type==="snap"&&premier&&mode==="connexion"){
        premier=false; clearTimeout(minuteur); mode="client";
        recuClient(d);
        cb.ok&&cb.ok(cd);
        return;
      }
      recuClient(d);
    });
    c.on("close",()=>{ if(connHote===c) perteHote(); });
    c.on("error",()=>{ if(connHote===c) perteHote(); });
  });
  pr.on("disconnected",()=>{ if(peer===pr&&mode==="client"&&!pr.destroyed){ try{ pr.reconnect(); }catch(e){} } });
  pr.on("error",e=>{
    if(peer!==pr) return;
    if(mode==="connexion"){ clearTimeout(minuteur); nettoyer(); mode="menu"; cb.erreur&&cb.erreur(messageErreur(e)); return; }
    if(mode==="client"&&e&&(e.type==="peer-unavailable")) perteHote();
  });
}

function recuClient(d){
  if(!d||typeof d!=="object") return;
  vuHote=performance.now();
  /* la sim n'est pas encore là (scripts en cours) : on garde pour plus tard */
  if(d.type==="snap"&&(typeof appliquerSnapshot!=="function")){ attente.push(d); return; }
  switch(d.type){
    case "bienvenue": if(typeof d.id==="string") monId=d.id; break;
    case "snap":{
      const estime=(S&&jourHote!==null)?S.jour:null;
      const avant=S;
      let o;
      try{ o=typeof d.s==="string"?JSON.parse(d.s):d.s; }catch(e){ console.error("Instantané illisible",e); return; }
      if(!o||typeof o!=="object"||!o.s||typeof o.s!=="object") return;
      if(d.p){
        /* instantané partiel : on recolle le journal et la file d'effets déjà reçus */
        if(!Array.isArray(o.s.journal)) o.s.journal=(avant&&Array.isArray(avant.journal))?avant.journal:[];
        const neufs=Array.isArray(o.s.fx)?o.s.fx:[];
        const vus=new Set(neufs.map(f=>f&&f.id));
        const anciens=(avant&&Array.isArray(avant.fx))?avant.fx.filter(f=>f&&!vus.has(f.id)):[];
        o.s.fx=anciens.concat(neufs).slice(-60);
      }
      try{ if(appliquerSnapshot(o)===false) return; }catch(e){ console.error("Instantané illisible",e); return; }
      if(!S) return;
      jourHote=S.jour;
      /* lissage : jamais de retour en arrière visible. Un léger retard se rattrape dans
         interpoler ; une petite avance est gardée (le client ralentit) ; un gros écart
         (nouvelle partie, reprise) recale directement. */
      const arret=typeof window.multVitesse==="function"&&!window.multVitesse();
      if(estime!==null&&!arret){                      /* temps arrêté : valeur exacte de l'hôte */
        const ecart=estime-jourHote;
        if((ecart>=0&&ecart<0.5)||(ecart<0&&ecart>-0.12)) S.jour=estime;
      }
      break;
    }
    case "av": if(Array.isArray(d.l)) avDistants=d.l.filter(a=>a&&typeof a.id==="string").slice(0,MAX_JOUEURS); break;
    case "info": toast(String(d.titre||"Coop"),String(d.txt||""),d.c||""); break;
    case "radio":{ const r=nettoieRadio(d); if(r) radioRecu({de:nettoieNom(d.de),nom:r.nom,url:r.url,favicon:r.favicon}); break; }
    case "ping": envoyer(connHote,{type:"pong",t:d.t}); break;
    case "pong": if(typeof d.t==="number") pingHote=Math.max(0,Math.round(performance.now()-d.t)); break;
    case "plein":
      if(mode==="connexion"&&rappels&&rappels.erreur){ const r=rappels; nettoyer(); mode="menu"; r.erreur("Partie complète ("+MAX_JOUEURS+" joueurs au maximum)."); }
      break;
    case "bye": perteHote("L'hôte a fermé la partie."); break;
    case "res": break;   /* les refus arrivent aussi en toast ciblé via S.fx */
  }
}

function perteHote(raison){
  if(mode!=="client"&&mode!=="connexion") return;
  const etait=mode;
  nettoyer(); mode="menu";
  if(etait==="connexion"){ rappels&&rappels.erreur&&rappels.erreur(raison||"Connexion perdue."); return; }
  if(window.UI&&UI.hoteDeconnecte) UI.hoteDeconnecte(raison);
}

/* le client fait avancer son horloge entre deux instantanés (lumière fluide) */
function interpoler(dj,dtms){
  if(mode!=="client"||!S||jourHote===null) return;
  jourHote+=dj;
  const k=Math.min(1,(dtms||16)/350);
  let j=S.jour+dj;
  const ecart=jourHote-j;
  if(ecart>0.15||ecart<-0.5) j=jourHote;          /* gros écart : recalage net */
  else if(ecart>0) j+=ecart*k;                    /* en retard : on accélère un peu */
  else j=Math.max(S.jour,j+ecart*k);              /* en avance : on ralentit, sans reculer */
  S.jour=j;
}

/* =====================================================================
   API COMMUNE
   ===================================================================== */
function action(nom){
  const args=Array.prototype.slice.call(arguments,1);
  if(mode==="solo"||mode==="hote"){
    if(typeof cmd!=="function") return {ok:false,msg:"Simulation indisponible."};
    let r;
    try{ r=cmd(nom,args,monId)||{ok:true}; }catch(e){ console.error(e); r={ok:false,msg:"Commande impossible."}; }
    if(mode==="hote") snapDu=true;
    if(typeof dirty!=="undefined") dirty=true;
    return r;
  }
  if(mode==="client"){
    if(!connHote||!connHote.open) return {ok:false,msg:"Pas connecté à l'hôte."};
    envoyer(connHote,{type:"cmd",nom:nom,args:args,rid:rid++});
    return {ok:true,attente:true};
  }
  return {ok:false,msg:"Aucune partie en cours."};
}

function tick(dtms){
  const now=performance.now();
  tDernierTick=now;
  surveiller(now);
  if(attente.length&&typeof appliquerSnapshot==="function"){ const a=attente; attente=[]; a.forEach(recuClient); }
  if(mode==="hote"){
    let actifs=0; invites.forEach(j=>{ if(j.hello) actifs++; });
    tJoueurs+=dtms; if(tJoueurs>1000){ tJoueurs=0; assureJoueurs(); }
    if(!actifs){ snapDu=false; return; }
    tSnap+=dtms; tAv+=dtms; tPing+=dtms;
    if((snapDu&&now-tDernierSnap>=PERIODE_SNAP_MIN)||tSnap>=PERIODE_SNAP){
      tSnap=0; snapDu=false; tDernierSnap=now; envoyerSnap(null);
    }
    if(tAv>=PERIODE_AV){ tAv=0; diffuser({type:"av",l:listeAvatars(true)}); }
    if(tPing>=PERIODE_PING){ tPing=0; diffuser({type:"ping",t:now}); }
  }else if(mode==="client"){
    tPos+=dtms; tPing+=dtms;
    if(tPos>=PERIODE_POS&&maPos){
      const s=maPos.x.toFixed(2)+","+maPos.z.toFixed(2)+","+maPos.cap.toFixed(2)+","+maPos.mode;
      if(s!==dernierPosEnvoye||tPos>1000){ dernierPosEnvoye=s; tPos=0; envoyer(connHote,{type:"pos",x:maPos.x,z:maPos.z,cap:maPos.cap,mode:maPos.mode}); }
    }
    if(tPing>=PERIODE_PING){ tPing=0; envoyer(connHote,{type:"ping",t:now}); }
  }
}

/* chien de garde : une connexion WebRTC coupée brutalement (onglet tué, wifi perdu)
   peut mettre 30 s ou plus à se signaler. On se fie aussi au silence applicatif :
   l'hôte pingue toutes les 2 s, et le client reçoit ~5 instantanés par seconde. */
function surveiller(now){
  if(mode==="hote"){
    const morts=[];
    invites.forEach((j,id)=>{ if(now-j.vu>SILENCE_MAX||(!j.hello&&now-j.vu>HELLO_MAX)) morts.push([id,j]); });
    morts.forEach(([id,j])=>{ try{ j.conn.close(); }catch(e){} depart(id,j.conn); });
  }else if(mode==="client"&&vuHote&&now-vuHote>SILENCE_MAX){
    perteHote("L'hôte ne répond plus.");
  }
}
/* onglet de l'hôte masqué (autre onglet, fenêtre réduite ou recouverte) : le navigateur
   suspend requestAnimationFrame, donc la boucle de main.js. On fait alors avancer la
   simulation et le réseau ici, au rythme des minuteurs (environ 1 fois par seconde). */
let tSecours=0;
setInterval(()=>{
  const now=performance.now();
  if(mode!=="hote"&&mode!=="client"){ tSecours=now; return; }
  /* la boucle normale tourne (onglet visible) : rien à faire */
  if(!(document.hidden||now-tDernierTick>2000)){ tSecours=now; return; }
  const dtms=Math.min(1500,now-(tSecours||now)); tSecours=now;
  if(mode==="hote"&&S&&typeof step==="function"){
    const mult=typeof window.multVitesse==="function"?window.multVitesse():0;
    const jms=typeof JOUR_MS!=="undefined"?JOUR_MS:7500;
    let reste=dtms*mult/jms, n=0;
    try{ while(reste>0&&n<40){ const d=Math.min(reste,0.25); step(d); reste-=d; n++; } }catch(e){ console.error(e); }
  }
  tick(dtms);
},500);

/* « Partager au studio » : envoie la station écoutée aux autres joueurs */
let tRadioEnvoi=0;
function partagerRadio(st){
  if(mode!=="hote"&&mode!=="client") return {ok:false,msg:"Le partage marche en coop seulement."};
  const r=nettoieRadio(st);
  if(!r) return {ok:false,msg:"Cette station ne peut pas être partagée (flux https uniquement)."};
  const now=performance.now();
  if(tRadioEnvoi&&now-tRadioEnvoi<RADIO_MIN_MS) return {ok:false,msg:"Doucement sur le bouton, DJ."};
  tRadioEnvoi=now;
  if(mode==="hote") diffuser({type:"radio",de:profil.nom,nom:r.nom,url:r.url,favicon:r.favicon});
  else{
    if(!connHote||!connHote.open) return {ok:false,msg:"Pas connecté à l'hôte."};
    envoyer(connHote,{type:"radio",nom:r.nom,url:r.url,favicon:r.favicon});
  }
  return {ok:true};
}

function majPos(p){ if(p) maPos={x:+p.x||0,z:+p.z||0,cap:+p.cap||0,mode:p.mode==="marche"?"marche":"idle"}; }

/* liste pour World.majAvatars (et pour la diffusion par l'hôte) */
function listeAvatars(pourDiffusion){
  const out=[];
  const moi=maPos?{id:monId,nom:profil.nom,couleur:profil.couleur,x:maPos.x,z:maPos.z,cap:maPos.cap,mode:maPos.mode,ping:0}:null;
  if(mode==="solo"){ if(moi) out.push(moi); return out; }
  if(mode==="hote"){
    if(moi) out.push(moi);
    invites.forEach((j,id)=>{ if(j.hello&&j.pos) out.push({id:id,nom:j.nom,couleur:j.couleur,x:j.pos.x,z:j.pos.z,cap:j.pos.cap,mode:j.pos.mode,ping:j.ping}); });
    return out;
  }
  if(mode==="client"){
    if(moi) out.push(moi);
    avDistants.forEach(a=>{ if(a.id!==monId) out.push({id:a.id,nom:nettoieNom(a.nom),couleur:nettoieCouleur(a.couleur),
      x:+a.x||0,z:+a.z||0,cap:+a.cap||0,mode:a.mode==="marche"?"marche":"idle"}); });
  }
  return pourDiffusion?out:out;
}
function avatars(){ return listeAvatars(false); }

/* pour la liste des joueurs à l'écran */
function joueurs(){
  if(mode==="hote"){
    const l=[{id:"hote",nom:profil.nom,couleur:profil.couleur,moi:true,hote:true,ping:0}];
    invites.forEach((j,id)=>{ if(j.hello) l.push({id:id,nom:j.nom,couleur:j.couleur,moi:false,hote:false,ping:j.ping}); });
    return l;
  }
  if(mode==="client"){
    const l=[];
    const vus={};
    avDistants.forEach(a=>{ vus[a.id]=1; l.push({id:a.id,nom:nettoieNom(a.nom),couleur:nettoieCouleur(a.couleur),
      moi:a.id===monId,hote:a.id==="hote",ping:a.id===monId?pingHote:(a.id==="hote"?pingHote:a.ping)}); });
    if(S&&S.joueurs) Object.keys(S.joueurs).forEach(id=>{ if(!vus[id]){ const j=S.joueurs[id]||{};
      l.push({id:id,nom:nettoieNom(j.nom),couleur:nettoieCouleur(j.couleur),moi:id===monId,hote:id==="hote",ping:id==="hote"?pingHote:null}); } });
    if(!l.some(x=>x.moi)) l.push({id:monId,nom:profil.nom,couleur:profil.couleur,moi:true,hote:false,ping:pingHote});
    l.sort((a,b)=>(b.hote-a.hote));
    return l;
  }
  return [{id:monId,nom:profil.nom,couleur:profil.couleur,moi:true,hote:true,ping:0}];
}

function quitter(){
  const m=mode;
  mode="menu";              /* d'abord : les fermetures qui suivent ne déclenchent pas « hôte perdu » */
  if(m==="hote"){
    diffuser({type:"bye"});
    /* on laisse le temps au « bye » de partir, sans toucher à une éventuelle nouvelle partie */
    const vieux=[...invites.values()], pr=peer;
    invites.clear(); peer=null;
    setTimeout(()=>{ vieux.forEach(j=>{ try{ j.conn.close(); }catch(e){} }); if(pr){ try{ pr.destroy(); }catch(e){} } },200);
  }
  nettoyer();
  monId="hote";
}

function lien(){
  if(!code) return "";
  const base=String(location.href).split("#")[0].split("?")[0];
  return base+"?rejoindre="+code;
}

return {
  dispo, etatLib, solo, heberger, rejoindre, quitter, action, tick, interpoler, majPos, avatars, joueurs, lien, partagerRadio, nettoieRadio,
  autorite:()=>mode==="solo"||mode==="hote",
  estFichier:()=>location.protocol==="file:",
  get mode(){return mode}, get monId(){return monId}, get code(){return code},
  get profil(){return profil}, get pingHote(){return pingHote},
  get nbInvites(){ let n=0; invites.forEach(j=>{ if(j.hello) n++; }); return n; },
  MAX_JOUEURS, COMMANDES
};
})();
