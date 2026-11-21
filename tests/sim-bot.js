/* Banc de test headless de sim.js (Node 22, aucun navigateur).
   Usage :
     node tests/sim-bot.js                 tests unitaires + équilibrage résumé
     node tests/sim-bot.js tests           tests unitaires seulement
     node tests/sim-bot.js smart 12        une stratégie, N graines, détail par graine
     node tests/sim-bot.js all 10          toutes les stratégies, résumé
   Stratégies : smart, greedy, passive, overhire, prestige. */
"use strict";
const fs=require("fs"), path=require("path"), vm=require("vm");
const SRC=fs.readFileSync(path.join(__dirname,"..","sim.js"),"utf8");

function charger(stockage){
  const ls=stockage||{};
  const ctx=vm.createContext({console,JSON,Math,Date,Object,Array,Set,Number,String,isFinite,isNaN,
    localStorage:{getItem:k=>(k in ls?ls[k]:null),setItem:(k,v)=>{ls[k]=String(v)},removeItem:k=>{delete ls[k]}}});
  vm.runInContext(SRC,ctx,{filename:"sim.js"});
  const ev=code=>vm.runInContext(code,ctx);
  return {ctx,ev,ls};
}

/* ---------- bot (exécuté DANS le contexte de la sim) ---------- */
function botMain(o){
  const R={rev:0,deliv:0,burn:0,quit:0,late:0,win:null,bankrupt:null,anomalies:[],minCash:1e9,hires:0,lowQ:0,qs:[],
           repAt200:null,caAt200:null,tierAt200:null,leg:0,refus:0,fxMax:0};
  newGame(o.seed);
  const free=()=>S.equipe.filter(libre);
  const C=(n,...a)=>{ const r=cmd(n,a,"hote"); if(!r.ok)R.refus++; return r; };
  function check(){
    const bad=v=>typeof v!=="number"||!isFinite(v);
    if(bad(S.argent)||bad(S.rep)||bad(S.jour)||bad(S.ca))R.anomalies.push("NaN global");
    S.equipe.forEach(d=>{
      if(bad(d.energie)||bad(d.moral)||d.energie<0||d.energie>100||d.moral<0||d.moral>100)R.anomalies.push("membre hors bornes");
      if(d.proj&&!S.projets.find(p=>p.id===d.proj))R.anomalies.push("proj fantome");
      if(d.repos<0||d.form<0)R.anomalies.push("timer negatif");
    });
    S.projets.forEach(p=>{ if(bad(p.avance)||bad(p.charge)||bad(p.qSum))R.anomalies.push("NaN proj");
      if(p.avance>p.charge+1e-6)R.anomalies.push("avance>charge");
      p.equipe.forEach(id=>{const d=S.equipe.find(x=>x.id===id); if(!d)R.anomalies.push("membre fantome"); else if(d.proj!==p.id)R.anomalies.push("incoherence"); });});
    const postes=S.equipe.filter(d=>d.poste>=0).map(d=>d.poste);
    if(postes.length!==new Set(postes).size)R.anomalies.push("poste en double");
    if(S.fx.length>60)R.anomalies.push("fx non borne");
      }
  function deliver(p){ const q=Math.round(qualite(p)), r0=S.revisions; const leg=p.leg;
    C("livrer",p.id);
    if(!S.projets.find(x=>x.id===p.id)){ R.deliv++; R.qs.push(q); if(q<TIERS[p.tier].exig)R.lowQ++; if(leg&&q>=TIERS[p.tier].exig)R.leg++; } }
  const bestFit=b=>Math.max(...S.equipe.map(d=>(d.crea*b.type.crea+d.tech*b.type.tech)/(b.type.crea+b.type.tech)));
  function smart(prest){
    S.projets.slice().forEach(p=>{ if(projetFini(p)) deliver(p); });
    S.equipe.forEach(d=>{ if(d.proj&&d.energie<22) C("retirer",d.proj,d.id); });
    S.projets.forEach(p=>{ const want=(p.deadline-S.jour)<1.5&&!projetFini(p); if(p.sup!==want)C("toggleSup",p.id); });
    const avail=S.equipe.filter(d=>d.form<=0&&d.repos<=0).length;
    const hw=UPS.materiel.mul[S.up.materiel]; const rate=Math.max(...S.equipe.map(d=>(3.4+d.vit*1.9)*hw));
    const busy=S.projets.reduce((a,p)=>a+(p.charge-p.avance),0)/Math.max(1,S.equipe.length*rate*0.8);
    const cand=S.briefs.filter(b=>bestFit(b)>=b.diff-0.3&&(b.charge/(rate*1.3))+busy*0.5<b.jours*0.9)
      .sort((a,b)=>b.budget/b.charge-a.budget/a.charge||b.budget-a.budget);
    for(const b of cand){ if(S.projets.length>=Math.min(capacite(),Math.max(1,avail)))break; C("accepter",b.id); }
    free().filter(d=>d.energie>=70).forEach(d=>{
      const ps=S.projets.filter(p=>p.equipe.length<2&&!projetFini(p)).sort((a,b)=>a.equipe.length-b.equipe.length||(fit(d,b)-b.diff)-(fit(d,a)-a.diff));
      if(ps.length&&fit(d,ps[0])>=ps[0].diff-1.5) C("affecter",ps[0].id,d.id);
    });
    S.equipe.forEach(d=>{ if(d.salaire&&d.moral<30&&S.jour-d.augJ>=7) C("augmenter",d.id); });
    const buf=chargesSem()*4+1500;
    const order=prest?["logiciel","materiel","bureau","cafe","marketing","prestige"]:["logiciel","materiel","bureau","cafe","marketing"];
    for(const k of order){ const n=S.up[k]+1; if(n<UPS[k].cout.length&&S.argent-UPS[k].cout[n]>buf){ if(k==="bureau"&&S.equipe.length<capacite())continue; C("acheter",k); break; } }
    if(S.equipe.length<capacite()){ const c=S.candidats.filter(c=>c.prime+buf+c.salaire*6<S.argent).sort((a,b)=>(b.crea+b.tech+b.vit)/b.salaire-(a.crea+a.tech+a.vit)/a.salaire)[0]; if(c){C("embaucher",c.id);R.hires++;} }
  }
  function greedy(){
    S.projets.slice().forEach(p=>{ if(projetFini(p)) deliver(p); });
    S.briefs.slice().forEach(b=>{ if(S.projets.length<capacite()){ if(C("accepter",b.id).ok===false&&b.insistant)C("accepter",b.id); } });
    free().forEach(d=>{ const p=S.projets.find(p=>p.equipe.length<4&&!projetFini(p)); if(p)C("affecter",p.id,d.id); });
    S.projets.forEach(p=>{ if(!p.sup)C("toggleSup",p.id); });
    if(S.equipe.length<capacite()){ const c=S.candidats.find(c=>c.prime<S.argent); if(c){C("embaucher",c.id);R.hires++;} }
  }
  function passive(){
    S.projets.slice().forEach(p=>{ if(projetFini(p)) deliver(p); });
    if(S.projets.length<1&&S.briefs.length) C("accepter",S.briefs[0].id);
    free().forEach(d=>{ const p=S.projets.find(p=>p.equipe.length<4&&!projetFini(p)); if(p)C("affecter",p.id,d.id); });
  }
  function overhire(){ greedy();
    if(S.equipe.length>=capacite()&&S.up.bureau<4&&S.argent>UPS.bureau.cout[S.up.bureau+1]) C("acheter","bureau");
    S.equipe.forEach(d=>{ if(d.salaire&&d.moral<20&&S.argent>0&&S.jour-d.augJ>=7) C("augmenter",d.id); }); }
  const strat={smart:()=>smart(false),prestige:()=>smart(true),greedy,passive,overhire}[o.strat];
  const _log=log;
  log=function(t,c){ if(/burn-out/.test(t))R.burn++; if(/démissionne/.test(t))R.quit++; if(/rompt le contrat/.test(t))R.late++; if(/^Brief légendaire/.test(t))R.legGen=(R.legGen||0)+1; if(/^Contrat signé/.test(t)&&S.briefs.length>=0&&LEGENDES.some(l=>t.includes(l.client)))R.legAcc=(R.legAcc||0)+1; return _log(t,c); };
  let nextDec=0,lastDeliv=0,lastDelivDay=1;
  while(S.jour<o.maxDay){
    if(S.fini){ if(S.fini===2)R.win=S.jour; else if(S.finRaison==="stagnation")R.stagne=S.jour; else R.bankrupt=S.jour; break; }
    const j0=Math.floor(S.jour); step(o.dt);
    /* juste après le changement de jour, avant que le bot agisse : au moins un brief jouable */
    if(Math.floor(S.jour)>j0&&S.briefs.length&&!S.briefs.some(briefAtteignable))R.anomalies.push("aucun brief atteignable");
    if(S.jour>=nextDec){ strat(); nextDec=S.jour+0.1; check(); }
    if(R.deliv>lastDeliv){lastDeliv=R.deliv;lastDelivDay=S.jour;}
    if(S.jour-lastDelivDay>60){R.anomalies.push("60 j sans livraison"); lastDelivDay=S.jour;}
    R.minCash=Math.min(R.minCash,S.argent);
    if(R.repAt200===null&&S.jour>=200){R.repAt200=Math.round(S.rep);R.caAt200=Math.round(S.ca);R.tierAt200=tierIdx();}
  }
  R.rev=S.revisions;
  R.final={jour:+S.jour.toFixed(1),argent:Math.round(S.argent),rep:Math.round(S.rep),ca:Math.round(S.ca),tier:tierIdx(),
    team:S.equipe.length,up:Object.values(S.up).join(""),livres:S.livres,rates:S.rates};
  R.revRate=R.deliv?+(R.rev/(R.deliv+R.rev)).toFixed(3):0;
  R.avgQ=R.qs.length?Math.round(R.qs.reduce((a,b)=>a+b,0)/R.qs.length):0; delete R.qs;
  R.anomalies=[...new Set(R.anomalies)].slice(0,8);
  return R;
}
function jouer(seed,strat,opts){
  opts=opts||{};
  const {ctx}=charger();
  ctx.__o={seed,strat,dt:opts.dt||0.02,maxDay:opts.maxDay||400};
  return vm.runInContext("("+botMain.toString()+")(__o)",ctx);
}

/* ---------- tests unitaires ---------- */
function tests(){
  let ok=0,ko=0;
  const T=(nom,cond,info)=>{ if(cond){ok++;} else {ko++; console.log("  ECHEC :",nom,info!==undefined?JSON.stringify(info):"");} };
  /* 1. surface : fonctions top-level, aucune API navigateur */
  { const {ev}=charger();
    ["cmd","snapshot","appliquerSnapshot","vrnd","vri","vpick","newGame","step","sauver","charger"].forEach(f=>
      T("fonction "+f,ev("typeof "+f)==="function"));
    T("pas de document/AudioContext/setTimeout",!/\bdocument\.|AudioContext|setTimeout|setInterval/.test(SRC));
    T("window uniquement gardé",SRC.split("window").length-1===SRC.split('typeof window!=="undefined"').length-1+1||/if\(typeof window!=="undefined"\)\{\s*window\.Sim/.test(SRC)); }
  /* 2. aucun tiret long/demi dans le fichier (textes affichés) */
  T("aucun tiret cadratin ou demi-cadratin",!/[\u2013\u2014]/.test(SRC));
  /* 3. déterminisme à graine égale */
  { const a=jouer(42,"smart",{maxDay:60}), b=jouer(42,"smart",{maxDay:60});
    T("déterminisme",JSON.stringify(a.final)===JSON.stringify(b.final),[a.final,b.final]); }
  const {ev,ls}=charger();
  ev("newGame(7)");
  /* 4. cmd : refus et toasts ciblés */
  { const r=ev("cmd('livrer',[999],'bob')");
    T("livrer projet inconnu refusé",r.ok===false&&!!r.msg);
    T("toast ciblé",ev("S.fx[S.fx.length-1].t==='toast'&&S.fx[S.fx.length-1].to==='bob'"));
    T("action inconnue refusée",ev("cmd('pirater',[],'hote').ok")===false); }
  /* 5. livrer seulement si fini ; projet fini ne consomme plus d'énergie */
  { ev("var b=S.briefs[0]; cmd('accepter',[String(b.id)]); var p=S.projets[0]; var f=S.equipe[0]; cmd('affecter',[p.id,f.id]);");
    T("livrer refusé avant la fin",ev("cmd('livrer',[p.id]).ok")===false);
    ev("p.avance=p.charge; var e0=f.energie=50; var q0=p.qPts; step(0.3);");
    T("projet fini : énergie remonte",ev("f.energie>50"),ev("f.energie"));
    T("projet fini : qualité figée",ev("p.qPts===q0"));
    T("affecter refuse un projet fini",ev("cmd('affecter',[p.id,f.id]).ok")===false);
    ev("p.qSum=p.qPts*100;p.qPts=p.qPts||1;p.qSum=p.qPts*100");
    T("livrer un projet fini",ev("cmd('livrer',[p.id]).ok&&!S.projets.includes(p)"));
    T("fx celebrer émis",ev("S.fx.some(x=>x.t==='celebrer')")); }
  /* 6. formation : pas de double paiement */
  { ev("S.argent=1e6; S.equipe.push(nouveauDesigner(1)); var d=S.equipe[S.equipe.length-1]; var a0=S.argent; cmd('former',[d.id,'crea']);");
    T("former payé une fois",ev("cmd('former',[d.id,'tech']).ok")===false&&ev("S.argent===a0-coutFormation({crea:d.crea},'crea')"));
    T("former stat invalide refusé",ev("cmd('former',[S.equipe[0].id,'magie']).ok")===false); }
  /* 7. augmenter : délai */
  { ev("var d2=nouveauDesigner(1); S.equipe.push(d2);");
    T("augmenter ok",ev("cmd('augmenter',[d2.id]).ok")===true);
    T("augmenter spam refusé",ev("cmd('augmenter',[d2.id]).ok")===false);
    T("fondateur non augmentable",ev("cmd('augmenter',[S.equipe[0].id]).ok")===false); }
  /* 8. victoire : continuer ne la redéclenche pas */
  { ev("S.rep=700; S.ca=900000; nouveauJour();");
    T("victoire déclarée",ev("S.fini")===2);
    T("fx fin gagne",ev("S.fx.some(x=>x.t==='fin'&&x.gagne===true)"));
    T("actions bloquées pendant la fin",ev("cmd('acheter',['cafe']).ok")===false);
    ev("cmd('continuer',[]); for(let i=0;i<5;i++){S.jour+=1;nouveauJour();}");
    T("victoire non redéclenchée",ev("S.fini")===0); }
  /* 9. faillite : sursis puis possible à nouveau ; seuil réarmé après retour au positif */
  { ev("S.argent=-7000; S.jour=Math.floor(S.jour)+0.5; nouveauJour();");
    T("faillite",ev("S.fini")===1);
    ev("cmd('continuer',[]); var s1=S.seuilFaillite;");
    T("sursis : seuil plus bas",ev("s1<-7000"));
    ev("S.argent=s1-100; nouveauJour();");
    T("seconde faillite possible",ev("S.fini")===1);
    ev("cmd('continuer',[]); S.argent=500; nouveauJour();");
    T("seuil réarmé",ev("S.seuilFaillite")===-6000);
    T("compteur faillites",ev("S.faillites")===2); }
  /* 10. snapshot / appliquerSnapshot */
  { const snap=ev("snapshot()");
    const c2=charger(); c2.ctx.__snap=snap;
    T("appliquerSnapshot",c2.ev("appliquerSnapshot(__snap)")===true);
    T("types rebranchés",c2.ev("S.briefs.every(b=>TYPES.includes(b.type))"));
    T("session présente",c2.ev("typeof S.session.vitesse")==="number");
    T("alias S.pause",c2.ev("S.pause=true; S.session.pause===true"));
    T("worldDirty posé",c2.ev("worldDirty")===true);
    c2.ev("worldDirty=false; appliquerSnapshot(__snap)");
    T("worldDirty pas reposé sans changement",c2.ev("worldDirty")===false); }
  /* 11. sauvegarde : clé, fin non vue re-signalée, migration */
  { ev("S.rep=0;S.ca=0;S.fini=0;S.argent=100; sauver();");
    T("clé studio-online-v1",!!ls["studio-online-v1"]);
    const o=JSON.parse(ls["studio-online-v1"]); o.s.fini=1; delete o.s.session; delete o.s.legendes; delete o.s.up.prestige; o.s.finiVu=1; o.s.jalons.e3=1;
    const c3=charger({"studio-online-v1":JSON.stringify(o)});
    T("charger migration",c3.ev("charger()")===true);
    T("champs complétés",c3.ev("Array.isArray(S.legendes)&&S.up.prestige===0&&typeof S.session==='object'"));
    T("fin re-signalée au chargement",c3.ev("S.fx.some(x=>x.t==='fin')"));
    T("jalon e3 -> e4",c3.ev("S.jalons.e4===1&&!S.jalons.e3"));
    T("step re-signale la fin",c3.ev("S.fx=[]; step(0.1); S.fx.some(x=>x.t==='fin')"));
    T("continuer débloque",c3.ev("cmd('continuer',[]).ok&&S.fini===0")); }
  /* 12. ancienne sauvegarde 3D */
  { const vieux={s:{nom:"X",jour:30.5,argent:5000,rep:40,vitesse:2,pause:false,son:true,fini:0,finiVu:1,briefs:[],projets:[],
      equipe:[{id:1,prenom:"Toi",nom:"",crea:4,tech:4,vit:4,energie:80,moral:70,salaire:0,proj:null,repos:0,form:0}],
      candidats:[],journal:[],palmares:[],jalons:{j1:1},up:{bureau:1,materiel:0,logiciel:0,cafe:0,marketing:0},livres:3,rates:0,ca:9000,charges:0,meilleure:70,tProchainBrief:0.5,auto:false},u:50};
    const c4=charger({"studio-tycoon-3d-v1":JSON.stringify(vieux)});
    T("charge ancienne sauvegarde 3D",c4.ev("charger()")===true);
    T("faillite toujours possible après finiVu",c4.ev("S.argent=-9000; S.jour=31.5; nouveauJour(); S.fini")===1);
    T("vitesse migrée",c4.ev("S.session.vitesse")===2); }
  /* 13. brief toujours atteignable, même avec une réputation énorme */
  { const c5=charger(); c5.ev("newGame(3); S.rep=500; S.briefs=[]; for(let i=0;i<9;i++)genererBrief();");
    T("brief atteignable à haute réputation",c5.ev("S.briefs.some(briefAtteignable)")); }
  /* 14. évènements : cash plafonné */
  { const c6=charger(); c6.ev("newGame(5); S.rep=600; S.ca=5e6; var a=S.argent; for(let i=0;i<300;i++)evenement(); ");
    T("events cash plafonnés",c6.ev("Math.abs(S.argent-a)<300*2600*1.2")); }
  /* 15. briefs insistants */
  { const c7=charger(); c7.ev("newGame(9); var b=genererLegende(LEGENDES.find(l=>l.insistant));");
    T("offre qu'on ne peut pas refuser (1er refus)",c7.ev("cmd('refuser',[b.id]).ok")===false);
    T("refus au second essai",c7.ev("cmd('refuser',[b.id]).ok")===true); }
  /* 16. vitesse et pause */
  { T("vitesse 3 => x4",ev("cmd('vitesse',[3]); S.session.vitesse")===4);
    T("vitesse 0 => pause",ev("cmd('vitesse',[0]); S.session.pause")===true);
    T("vitesse 9 refusée",ev("cmd('vitesse',[9]).ok")===false);
    T("nouvellePartie refusée aux invités",ev("cmd('nouvellePartie',[],'bob').ok")===false);
    T("rejoindre",ev("cmd('rejoindre',['Bob','#f00'],'bob').ok&&S.joueurs.bob.nom==='Bob'")); }
  /* 17. textes : aucun tiret long dans le journal d'une partie complète */
  { const c8=charger(); c8.ctx.__o={seed:11,strat:"greedy",dt:0.05,maxDay:150};
    c8.ev("("+botMain.toString()+")(__o)");
    T("journal sans tiret long",c8.ev("!S.journal.some(l=>/[\\u2013\\u2014]/.test(l.t))")); }
  console.log("tests : "+ok+" ok, "+ko+" échec(s)");
  return ko===0;
}

/* ---------- équilibrage ---------- */
const med=a=>{ const s=a.slice().sort((x,y)=>x-y); return s.length?s[Math.floor(s.length/2)]:null; };
function resume(strat,n,detail){
  const rows=[];
  for(let s=1;s<=n;s++){
    const R=jouer(s*7919,strat);
    rows.push(R);
    if(detail) console.log(strat,"graine",s,"win",R.win&&Math.round(R.win),"bk",R.bankrupt&&Math.round(R.bankrupt),"stg",R.stagne&&Math.round(R.stagne),"livrés",R.deliv,
      "rév",R.rev,"("+Math.round(R.revRate*100)+"%)","Qmoy",R.avgQ,"burn",R.burn,"dém",R.quit,"ruptures",R.late,"leg",R.leg,
      "cashMin",Math.round(R.minCash),"final",JSON.stringify(R.final),R.anomalies.length?"ANOM "+R.anomalies.join(" | "):"");
  }
  const stg=rows.filter(r=>r.stagne).map(r=>Math.round(r.stagne));
  const wins=rows.filter(r=>r.win).map(r=>Math.round(r.win)), bks=rows.filter(r=>r.bankrupt).map(r=>Math.round(r.bankrupt));
  const rev=rows.reduce((a,r)=>a+r.rev,0), del=rows.reduce((a,r)=>a+r.deliv,0);
  const anomalies=[...new Set(rows.flatMap(r=>r.anomalies))];
  console.log(("["+strat+"]").padEnd(11),"victoires",wins.length+"/"+n,wins.length?"médiane j"+med(wins)+" ("+Math.min(...wins)+"-"+Math.max(...wins)+")":"",
    "| faillites",bks.length+"/"+n,bks.length?"médiane j"+med(bks):"",
    "| stagnation",stg.length+"/"+n,stg.length?"médiane j"+med(stg):"",
    "| révisions",(del?Math.round(rev/(rev+del)*100):0)+"%",
    "| légendaires livrés/acceptés/proposés",rows.reduce((a,r)=>a+r.leg,0)+"/"+rows.reduce((a,r)=>a+(r.legAcc||0),0)+"/"+rows.reduce((a,r)=>a+(r.legGen||0),0),
    "| fin médiane rép",med(rows.map(r=>r.final.rep)),"CA",med(rows.map(r=>r.final.ca)),
    anomalies.length?"| ANOM "+anomalies.join(", "):"");
  return rows;
}

if(require.main===module){
  const a=process.argv[2], n=+(process.argv[3]||8);
  if(!a){ const ok=tests(); ["smart","prestige","greedy","overhire","passive"].forEach(s=>resume(s,8)); process.exitCode=ok?0:1; }
  else if(a==="tests"){ process.exitCode=tests()?0:1; }
  else if(a==="all"){ ["smart","prestige","greedy","overhire","passive"].forEach(s=>resume(s,n)); }
  else resume(a,n,true);
}
module.exports={jouer,tests,resume};
