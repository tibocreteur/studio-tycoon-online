/* Fuzz de sim.js (Node 22, aucun navigateur).
   Des milliers de commandes, valides ou hostiles (mauvais types, NaN, ids
   inconnus, chaînes, nombres énormes, noms d'actions bidons...), sur de
   longues parties. Après chaque action, on vérifie les invariants :
   nombres finis, énergie et moral bornés, aucune référence orpheline,
   l'argent ne bouge que par les chemins prévus, un refus ne modifie rien.
   Vérifie aussi : déterminisme à graine égale, aucun Math.random dans la
   logique, aller-retour snapshot / appliquerSnapshot et sauver / charger.
   Usage : node tests/fuzz.js [nbParties=24] [actionsParPartie=4000] */
"use strict";
const fs=require("fs"), path=require("path"), vm=require("vm");
const SRC=fs.readFileSync(path.join(__dirname,"..","sim.js"),"utf8");
const NB=+process.argv[2]||12, NACT=+process.argv[3]||5000;

let randomAppels=0;
function charger(stockage){
  const ls=stockage||{};
  /* Math instrumenté : tout appel à Math.random pendant la partie est une faute */
  const M=Object.create(Math);
  M.random=()=>{ randomAppels++; return Math.random(); };
  const ctx=vm.createContext({console,JSON,Math:M,Date,Object,Array,Set,Map,Number,String,isFinite,isNaN,
    localStorage:{getItem:k=>(k in ls?ls[k]:null),setItem:(k,v)=>{ls[k]=String(v)},removeItem:k=>{delete ls[k]}}});
  vm.runInContext(SRC,ctx,{filename:"sim.js"});
  return {ctx,ev:c=>vm.runInContext(c,ctx),ls};
}

/* PRNG du fuzzer, indépendant de la sim */
function mulberry(a){ return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }

const NOMS=["accepter","refuser","affecter","retirer","toggleSup","livrer","abandonner","embaucher","licencier",
  "augmenter","former","acheter","relance","auto","vitesse","pause","continuer","nouvellePartie","rejoindre","partir"];
const BIDONS=["__proto__","constructor","toString","hasOwnProperty","valueOf","",null,undefined,42,{},[],"ACCEPTER","step","newGame","eval"];
const JIDS=["hote","hote","hote","c1","c2","<b>x</b>",undefined,""];

/* une partie de fuzz, entièrement dans le contexte de la sim */
function partie(seed,nact,journaliser,det){
  const {ctx,ev}=charger();
  const R=mulberry(seed*7919+13);
  const ri=(a,b)=>a+Math.floor(R()*(b-a+1));
  const pk=a=>a[Math.floor(R()*a.length)];
  const S=ev("(function(){return S})"), capa=ev("capacite");
  const fautes=[];
  const faute=(m,info)=>{ if(fautes.length<30) fautes.push(m+(info!==undefined?" "+JSON.stringify(info).slice(0,300):"")); };
  ev("newGame("+seed+")");
  const traces=[];

  const ids=()=>{ const s=S(); return {
    b:s.briefs.map(x=>x.id), p:s.projets.map(x=>x.id), d:s.equipe.map(x=>x.id), c:s.candidats.map(x=>x.id) }; };
  function valeurHostile(){
    const I=ids(), tous=[].concat(I.b,I.p,I.d,I.c);
    return pk([()=>pk(tous.length?tous:[1]), ()=>String(pk(tous.length?tous:[1])), ()=>[pk(tous.length?tous:[1])],
      ()=>({id:pk(tous.length?tous:[1])}), ()=>NaN, ()=>Infinity, ()=>-Infinity, ()=>-1, ()=>0, ()=>1e308, ()=>-1e308,
      ()=>ri(-5,100000), ()=>"abc", ()=>"", ()=>" 3 ", ()=>"1e400", ()=>"0x10", ()=>"__proto__", ()=>"constructor",
      ()=>"toString", ()=>null, ()=>undefined, ()=>true, ()=>false, ()=>({}), ()=>[], ()=>"crea", ()=>"vit",
      ()=>pk(["bureau","materiel","logiciel","cafe","marketing","prestige"]), ()=>"<img src=x onerror=alert(1)>",
      ()=>"x".repeat(5000), ()=>"red;background:url(//evil)\"><script>", ()=>2.5, ()=>"3"])();
  }
  /* commande plausible : fait avancer la partie pour atteindre les états profonds */
  function commandeSensee(){
    const s=S(), I=ids();
    const libres=s.equipe.filter(d=>!d.proj&&d.repos<=0&&d.form<=0);
    const r=R();
    if(r<0.12&&I.b.length&&s.projets.length<capa()) return ["accepter",[pk(I.b)]];
    if(r<0.32&&libres.length&&I.p.length) return ["affecter",[pk(I.p),pk(libres).id]];
    if(r<0.45){ const p=s.projets.find(x=>x.avance>=x.charge-1e-6); if(p) return ["livrer",[p.id]]; }
    if(r<0.50&&I.c.length) return ["embaucher",[pk(I.c)]];
    if(r<0.55) return ["acheter",[pk(["bureau","materiel","logiciel","cafe","marketing","prestige"])]];
    if(r<0.58&&I.d.length) return ["former",[pk(I.d),pk(["crea","tech","vit"])]];
    if(r<0.60&&I.d.length) return ["augmenter",[pk(I.d)]];
    if(r<0.62&&I.p.length) return ["toggleSup",[pk(I.p)]];
    if(r<0.64&&s.equipe.some(d=>d.proj)){ const d=pk(s.equipe.filter(d=>d.proj)); return ["retirer",[d.proj,d.id]]; }
    if(r<0.65&&I.d.length) return ["licencier",[pk(I.d)]];
    if(r<0.66&&I.p.length) return ["abandonner",[pk(I.p)]];
    if(r<0.67&&I.b.length) return ["refuser",[pk(I.b)]];
    if(r<0.68) return ["relance",[]];
    if(r<0.70) return ["vitesse",[ri(0,4)]];
    if(r<0.71) return ["auto",[R()<0.5]];
    if(r<0.72) return ["rejoindre",[pk(["Ana","Bob","<i>Zed</i>","Léo"]),pk(["#ff0000","#12ab34","red;x:\"y","hsl(10 50% 50%)"])]];
    if(s.fini) return ["continuer",[]];
    return null;
  }
  function commandeHostile(){
    let nom=R()<0.85?pk(NOMS):pk(BIDONS);
    if(nom==="nouvellePartie"&&R()<0.95) nom=pk(NOMS);   /* garder des parties longues */
    const n=ri(0,4), args=[]; for(let i=0;i<n;i++) args.push(valeurHostile());
    const forme=R();
    return [nom, forme<0.8?args:forme<0.9?(args[0]):pk([null,undefined,"abc",7,{},{0:1,length:1}])];
  }

  /* ---------- invariants ---------- */
  function nombresFinis(o,chemin,vus){
    if(o===null||typeof o!=="object"){ if(typeof o==="number"&&!isFinite(o)) faute("nombre non fini",chemin); return; }
    if(vus.has(o))return; vus.add(o);
    if(chemin.endsWith(".type"))return;    /* référence TYPES */
    for(const k of Object.keys(o)){ if(k==="fx")continue; nombresFinis(o[k],chemin+"."+k,vus); }
  }
  function invariants(ou){
    const s=S();
    nombresFinis(s,"S",new Set());
    const cap=capa();
    if(s.rep<0)faute("rep négative",ou);
    if(!Array.isArray(s.fx)||s.fx.length>60)faute("fx non borné",ou);
    for(let i=1;i<s.fx.length;i++) if(!(s.fx[i].id>s.fx[i-1].id)) { faute("fx non croissants",ou); break; }
    if(s.fx.length&&s.fx[s.fx.length-1].id!==s.fxId)faute("fxId décalé",ou);
    if(s.journal.length>90)faute("journal non borné",ou);
    if(s.briefs.length>9)faute("trop de briefs",[ou,s.briefs.length]);
    if(s.candidats.length>3)faute("trop de candidats",ou);
    if(s.equipe.length>cap)faute("équipe > capacité",ou);
    if(s.palmares.length>12)faute("palmarès non borné",ou);
    if(!s.equipe.some(d=>d.fondateur))faute("fondateur disparu",ou);
    Object.keys(s.up).forEach(k=>{ const v=s.up[k]; if(!Number.isInteger(v)||v<0||v>4)faute("niveau d'amélioration invalide",[ou,k,v]); });
    if(Object.keys(s.up).length!==6)faute("clé d'amélioration parasite",[ou,Object.keys(s.up)]);
    if([1,2,4].indexOf(s.session.vitesse)<0)faute("vitesse invalide",[ou,s.session.vitesse]);
    if(typeof s.session.pause!=="boolean")faute("pause non booléenne",[ou,s.session.pause]);
    if(typeof s.auto!=="boolean")faute("auto non booléen",[ou,s.auto]);
    const tousIds=[].concat(s.briefs,s.projets,s.equipe,s.candidats).map(x=>x.id);
    if(tousIds.some(id=>typeof id!=="number"))faute("id non numérique",ou);
    const idsEq=new Set();
    s.equipe.forEach(d=>{
      if(idsEq.has(d.id))faute("membre en double",ou); idsEq.add(d.id);
      if(!(d.energie>=0&&d.energie<=100))faute("énergie hors bornes",[ou,d.energie]);
      if(!(d.moral>=0&&d.moral<=100))faute("moral hors bornes",[ou,d.moral]);
      ["crea","tech","vit"].forEach(k=>{ if(!Number.isInteger(d[k])||d[k]<1||d[k]>10)faute("compétence hors bornes",[ou,k,d[k]]); });
      if(d.repos<0||d.form<0)faute("minuteur négatif",ou);
      if(d.proj!==null){ const p=s.projets.find(p=>p.id===d.proj);
        if(!p)faute("membre sur projet fantôme",[ou,d.id,d.proj]); else if(p.equipe.indexOf(d.id)<0)faute("membre absent de l'équipe du projet",ou); }
      if(d.form>0&&d.proj)faute("en formation et sur un projet",ou);
      if(d._form!==null&&["crea","tech","vit"].indexOf(d._form)<0)faute("formation invalide",[ou,d._form]);
      if(d.poste<0||d.poste>=cap)faute("poste invalide",[ou,d.poste,cap]);
    });
    const postes=s.equipe.map(d=>d.poste); if(new Set(postes).size!==postes.length)faute("poste en double",ou);
    s.projets.forEach(p=>{
      if(!p.type||!p.type.nom)faute("projet sans type",ou);
      if(p.avance>p.charge+1e-6)faute("avance > charge",ou);
      if(p.equipe.length>4)faute("plus de 4 sur un projet",ou);
      if(new Set(p.equipe).size!==p.equipe.length)faute("membre en double sur un projet",ou);
      p.equipe.forEach(id=>{ const d=s.equipe.find(x=>x.id===id); if(!d)faute("membre fantôme sur projet",[ou,id]); else if(d.proj!==p.id)faute("incohérence projet/membre",ou); });
    });
    s.briefs.forEach(b=>{ if(!b.type||!b.type.nom)faute("brief sans type",ou); });
  }
  /* état sans les parties qu'un refus a le droit de toucher */
  const IGN={fx:1,fxId:1,journal:1,insiste:1};
  const empreinte=()=>JSON.stringify(S(),(k,v)=>IGN[k]?undefined:(k==="type"&&v&&v.id)?v.id:v);

  let joursMax=0, nCmd=0, nRefus=0, nExceptions=0, nFins=0, nNouv=0;
  for(let i=0;i<nact;i++){
    /* le temps passe entre deux actions, parfois avec des pas tordus */
    const pas=R()<0.02?pk([0,-1,NaN,Infinity,1e9,3.7,"0.1",undefined]):R()*0.3;
    const finAvant=S().fini;
    try{ ctx.step(pas); }catch(e){ faute("step a levé",[pas,e.message]); break; }
    if(S().fini&&!finAvant) nFins++;
    invariants("step("+pas+")");
    if(fautes.length)break;
    joursMax=Math.max(joursMax,S().jour);

    const c=R()<0.55?commandeSensee():commandeHostile(); if(!c)continue;
    /* une nouvelle partie sans graine tire sa graine au hasard (normal) : en mode déterminisme on la fixe */
    if(det&&c[0]==="nouvellePartie") c[1]=[seed+i];
    const jid=R()<0.8?"hote":pk(JIDS);
    const s0=S(), a0=s0.argent, ca0=s0.ca, liv0=s0.livres;
    const proj0=c[0]==="livrer"?s0.projets.find(p=>p.id===+(Array.isArray(c[1])?c[1][0]:c[1])):null;
    const budget0=proj0?proj0.budget:0;
    const e0=empreinte();
    let r;
    const rb=randomAppels;
    try{ r=ctx.cmd(c[0],c[1],jid); }catch(e){ faute("cmd a levé",[c[0],String(c[1]),e.message]); break; }
    nCmd++;
    if(c[0]==="nouvellePartie") randomAppels=rb;   /* graine tirée au hasard : seul usage permis */
    if(journaliser) traces.push([c[0],JSON.stringify(c[1]===undefined?null:c[1]),jid,r.ok]);
    if(!r||typeof r.ok!=="boolean")faute("retour de cmd invalide",[c[0],r]);
    if(r.ok===false){ nRefus++;
      if(typeof r.msg!=="string"||!r.msg)faute("refus sans message",[c[0]]);
      if(/Action impossible \(/.test(r.msg)){ nExceptions++; faute("exception attrapée dans cmd",[c[0],String(c[1]),r.msg]); }
      if(empreinte()!==e0) faute("un refus a modifié l'état",[c[0],c[1]===undefined?null:c[1],jid]);
      const dernier=S().fx[S().fx.length-1];
      if(!dernier||dernier.t!=="toast"||dernier.to!==(jid||"hote"))faute("refus sans toast ciblé",[c[0],jid]);
    }
    if(c[0]==="nouvellePartie"&&r.ok){ nNouv++; invariants("nouvellePartie"); continue; }
    const s=S(), da=s.argent-a0;
    if(da>0.0001){
      if(c[0]!=="livrer") faute("argent créé hors livraison",[c[0],c[1],da]);
      else if(da>budget0*1.55*1.06+9000+3000+1) faute("gain de livraison démesuré",[da,budget0]);
    }
    if(s.ca<ca0-1e-6)faute("CA en baisse",[c[0]]);
    if(c[0]==="livrer"&&r.ok&&s.livres>liv0&&da<0)faute("livraison qui coûte",[da]);
    invariants("cmd "+c[0]);
    if(fautes.length)break;
    /* les fins se débloquent de temps en temps pour explorer l'après-victoire et le sursis */
    if(S().fini&&R()<0.3) ctx.cmd("continuer",[],"hote");
  }
  return {fautes,joursMax,nCmd,nRefus,nExceptions,nFins,nNouv,traces,final:ctx.snapshot(),ctx,ev};
}

/* ---------- aller-retours ---------- */
function allerRetours(seed){
  const fautes=[];
  const p=partie(seed,1500,false);
  const src=p.ctx;
  /* snapshot -> appliquerSnapshot -> snapshot identique */
  const snap=src.snapshot();
  const cli=charger();
  if(cli.ctx.appliquerSnapshot(snap)!==true) fautes.push("appliquerSnapshot refuse un instantané valide");
  if(cli.ctx.snapshot()!==snap) fautes.push("snapshot non idempotent après appliquerSnapshot");
  if(cli.ev("S").projets.some(x=>!x.type.pitchs)||cli.ev("S").briefs.some(x=>!x.type.pitchs)) fautes.push("types non rebranchés côté client");
  ["{","null","[]",'{"s":null}','{"s":5}','{"s":{"equipe":5}}','{"s":{"equipe":[],"projets":[],"briefs":[]}}',42,undefined].forEach(bad=>{ let ok;
    try{ ok=cli.ctx.appliquerSnapshot(bad); }catch(e){ ok="exception "+e.message; }
    if(ok!==false) fautes.push("appliquerSnapshot accepte "+JSON.stringify(bad)+" : "+ok); });
  if(cli.ctx.snapshot()!==snap) fautes.push("un instantané invalide a modifié l'état client");
  /* sauver -> charger : même partie (à la pause et à la file d'effets près) */
  const ls={};
  const h=charger(ls); h.ctx.appliquerSnapshot(snap); h.ev("S").session.pause=false;
  if(h.ctx.sauver()!==true) fautes.push("sauver échoue");
  const h2=charger(ls);
  if(h2.ctx.charger()!==true) fautes.push("charger échoue");
  const norm=str=>{ const o=JSON.parse(str); o.s.fx=[]; o.s.fxId=0; o.s.worldRev=0; o.s.session.pause=true; delete o.u; return JSON.stringify(o); };
  if(norm(h2.ctx.snapshot())!==norm(snap)) {
    const A=JSON.parse(norm(snap)).s, B=JSON.parse(norm(h2.ctx.snapshot())).s;
    const diff=Object.keys(A).filter(k=>JSON.stringify(A[k])!==JSON.stringify(B[k]));
    fautes.push("sauver/charger ne restitue pas la partie : "+diff.join(","));
  }
  if(h2.ev("S").session.pause!==true) fautes.push("partie chargée non en pause");
  if(h2.ev("S").fxId<h.ev("S").fxId) fautes.push("fxId recule au chargement");
  /* la partie chargée continue sans faute */
  for(let i=0;i<300;i++){ h2.ctx.step(0.2); if(h2.ev("S").fini) h2.ctx.cmd("continuer",[],"hote"); }
  if(!isFinite(h2.ev("S").argent)) fautes.push("partie chargée corrompue");
  /* sauvegarde corrompue : refusée, la partie en cours reste intacte */
  { const ls2={"studio-online-v1":'{"s":{"equipe":[{"id":1}],"up":"x","projets":7}}'};
    const c=charger(ls2); c.ev("newGame(3)"); const avant=c.ctx.snapshot(); let r;
    try{ r=c.ctx.charger(); }catch(e){ r="exception "+e.message; }
    if(r!==false) fautes.push("sauvegarde corrompue acceptée : "+r);
    if(c.ctx.snapshot()!==avant) fautes.push("sauvegarde corrompue a modifié la partie"); }
  /* sauvegarde prise sur l'écran de fin : rechargée en pause, fin re-signalée */
  { const ls3={}; const c=charger(ls3); c.ev("newGame(4)"); c.ev("S.argent=-50000"); c.ctx.step(1);
    if(!c.ev("S.fini")) fautes.push("faillite non déclarée");
    c.ctx.sauver(); const c2=charger(ls3); c2.ctx.charger();
    if(c2.ev("S.fini")!==1||!c2.ev("S.fx.some(f=>f.t==='fin')")||c2.ev("S.session.pause")!==true) fautes.push("fin perdue au chargement");
    if(c2.ctx.cmd("continuer",[],"hote").ok!==true||c2.ev("S.fini")!==0) fautes.push("continuer impossible après chargement"); }
  return fautes;
}

/* ---------- main ---------- */
const t0=Date.now();
let total=0, ko=0, jours=[], cmds=0, refus=0, fins=0;
for(let s=1;s<=NB;s++){
  randomAppels=0;
  const ts=Date.now();
  const r=partie(s,NACT,false);
  if(process.env.FUZZ_V) console.log("graine "+s+" : "+r.nCmd+" commandes, jour max "+Math.floor(r.joursMax)+", "+(Date.now()-ts)+" ms");
  const rnd=randomAppels;
  total++; cmds+=r.nCmd; refus+=r.nRefus; fins+=r.nFins; jours.push(Math.floor(r.joursMax));
  if(rnd>0) r.fautes.push("Math.random appelé "+rnd+" fois pendant la partie");
  if(r.fautes.length){ ko++; console.log("graine "+s+" :"); r.fautes.slice(0,8).forEach(f=>console.log("   - "+f)); }
}
/* déterminisme : même graine + mêmes commandes = même partie */
let detOk=true;
for(const s of [3,11]){
  const a=partie(s,2500,true,true), b=partie(s,2500,true,true);
  if(a.final!==b.final||JSON.stringify(a.traces)!==JSON.stringify(b.traces)){ detOk=false; console.log("déterminisme rompu, graine "+s); }
}
let arKo=0;
for(const s of [5,9,17]){ const f=allerRetours(s); if(f.length){ arKo++; console.log("aller-retour graine "+s+" :"); f.forEach(x=>console.log("   - "+x)); } }

jours.sort((a,b)=>a-b);
console.log("fuzz : "+total+" parties, "+cmds+" commandes ("+refus+" refus), "+fins+" fins de partie, jours max médian "+jours[jours.length>>1]
  +" | parties en faute "+ko+" | déterminisme "+(detOk?"ok":"KO")+" | aller-retours "+(arKo?"KO":"ok")+" | "+((Date.now()-t0)/1000).toFixed(1)+" s");
process.exit(ko||!detOk||arKo?1:0);
