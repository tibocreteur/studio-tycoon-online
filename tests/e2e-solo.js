/* Test de bout en bout du solo dans un vrai navigateur headless (Edge + SwiftShader).
   Lancer : node tests/e2e-solo.js            (tout)
            node tests/e2e-solo.js rapide     (1600x900 en http seulement)
   Captures dans tests/screens/. Ne touche pas au panneau navigateur intégré. */
"use strict";
const fs=require("fs"), path=require("path"), http=require("http");
const puppeteer=require("puppeteer-core");

const RACINE=path.join(__dirname,"..");
const ECRANS=path.join(__dirname,"screens");
const EDGE="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const RAPIDE=process.argv.includes("rapide");
fs.mkdirSync(ECRANS,{recursive:true});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let echecs=0;
const ok=(c,m)=>{ if(!c){ echecs++; console.log("ÉCHEC : "+m); } else console.log("ok : "+m); };

/* ---------- petit serveur statique ---------- */
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png",".json":"application/json",".css":"text/css"};
function serveur(){
  return new Promise(res=>{
    const s=http.createServer((req,rep)=>{
      let u=decodeURIComponent(req.url.split("?")[0]); if(u==="/") u="/index.html";
      const f=path.join(RACINE,path.normalize(u));
      if(!f.startsWith(RACINE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rep.writeHead(404); rep.end("404"); return; }
      rep.writeHead(200,{"Content-Type":TYPES[path.extname(f)]||"application/octet-stream"});
      fs.createReadStream(f).pipe(rep);
    });
    s.listen(0,"127.0.0.1",()=>res(s));
  });
}

/* ---------- mesure des pixels d'une capture, dans la page ---------- */
async function analyse(page,buf){
  return page.evaluate(async b64=>{
    const img=new Image(); img.src="data:image/png;base64,"+b64; await img.decode();
    const c=document.createElement("canvas"); c.width=200; c.height=Math.round(200*img.height/img.width);
    const x=c.getContext("2d"); x.drawImage(img,0,0,c.width,c.height);
    const d=x.getImageData(0,0,c.width,c.height).data; const set=new Set(); let s=0,s2=0,n=0;
    for(let i=0;i<d.length;i+=4){ const l=.3*d[i]+.59*d[i+1]+.11*d[i+2]; s+=l; s2+=l*l; n++; set.add((d[i]>>3)<<10|(d[i+1]>>3)<<5|(d[i+2]>>3)); }
    const m=s/n; return {moyenne:Math.round(m),ecart:Math.round(Math.sqrt(s2/n-m*m)),couleurs:set.size};
  },buf.toString("base64"));
}

async function capture(page,nom,opts){
  const f=path.join(ECRANS,nom+".png");
  const buf=await page.screenshot(Object.assign({path:f},opts||{}));
  return buf;
}

/* attendre n images rendues par la boucle du jeu */
const images=(page,n)=>page.evaluate(n=>new Promise(r=>{ let k=0; const f=()=>{ if(++k>=n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }),n||3);

/* clic DOM réel sur un bouton de l'interface. L'interface reconstruit ses cartes
   toutes les 400 ms : on vise l'élément et on clique dans le même tour pour ne pas
   tomber sur un nœud détaché. */
async function cliquer(page,sel,quoi){
  let r="absent";
  for(let essai=0;essai<5;essai++){
    r=await page.evaluate(sel=>{ const e=document.querySelector(sel); if(!e) return "absent";
      const b=e.getBoundingClientRect(); if(!(b.width>0&&b.height>0)) return "invisible"; if(e.disabled) return "désactivé";
      e.click(); return "ok"; },sel);
    if(r==="ok"){ await images(page,3); return true; }
    await sleep(250);
  }
  ok(false,"bouton "+r+" : "+(quoi||sel)); return false;
}
/* un clic sur l'onglet déjà ouvert le referme : ne cliquer que s'il est fermé */
async function onglet(page,id){
  const deja=await page.evaluate(id=>{ const b=document.querySelector('#rail [data-do="onglet"][data-id="'+id+'"]'); return !!(b&&b.classList.contains("on")&&document.getElementById("panneau").classList.contains("on")); },id);
  return deja||cliquer(page,'#rail [data-do="onglet"][data-id="'+id+'"]',"onglet "+id);
}
const etat=page=>page.evaluate(()=>({jour:S.jour,argent:S.argent,rep:S.rep,projets:S.projets.length,briefs:S.briefs?S.briefs.length:-1,
  equipe:S.equipe.length,up:Object.assign({},S.up),fini:S.fini,pause:(S.session||S).pause,vitesse:(S.session||S).vitesse}));
/* avancer la sim depuis la page (hôte/solo) */
const avancer=(page,jours)=>page.evaluate(j=>{ let r=j; while(r>0){ const d=Math.min(.25,r); step(d); r-=d; } dirty=true; },jours);

async function nouvellePage(nav,vp,journal){
  const page=await nav.newPage();
  await page.setViewport(vp);
  page.on("console",m=>{ if(m.type()==="error") journal.console.push(m.text()); if(m.type()==="warning") journal.warn.push(m.text()); });
  page.on("pageerror",e=>journal.page.push(String(e&&e.message||e)));
  page.on("requestfailed",r=>journal.req.push(r.url()+" "+(r.failure()&&r.failure().errorText)));
  page.on("response",r=>{ if(r.status()>=400) journal.req.push(r.url()+" HTTP "+r.status()); });
  return page;
}
async function charger(page,url){
  await page.goto(url,{waitUntil:"load",timeout:90000});
  await page.waitForFunction(()=>{ const b=document.getElementById("boot"); return b&&b.style.display==="none"; },{timeout:90000});
  await images(page,5);
}

/* ===================================================================== */
async function scenarioComplet(nav,url,tag,journal){
  const vp={width:1600,height:900,deviceScaleFactor:1};
  const page=await nouvellePage(nav,vp,journal);
  await charger(page,url);
  await page.evaluate(()=>{ localStorage.clear(); });
  await charger(page,url);           /* partie neuve */

  /* WebGL réel ? */
  const gl=await page.evaluate(()=>{ const r=World.renderer; const c=r.getContext(); return {webgl2:r.capabilities.isWebGL2,vendeur:c.getParameter(c.RENDERER)}; });
  console.log("   WebGL : "+JSON.stringify(gl));
  await sleep(400);
  let b=await capture(page,tag+"-01-menu");
  let a=await analyse(page,b); console.log("   menu pixels "+JSON.stringify(a));
  ok(a.couleurs>200&&a.ecart>10,"le menu a un rendu 3D non vide");

  /* Menu -> Solo */
  await cliquer(page,"#mSolo","Jouer en solo");
  await sleep(300);
  ok(await page.evaluate(()=>Net.mode==="solo"&&!UI.menuOuvert()),"menu fermé, mode solo");
  await page.evaluate(()=>Net.action("pause",true));
  b=await capture(page,tag+"-02-debut");
  a=await analyse(page,b); ok(a.couleurs>200,"rendu de jeu non vide ("+a.couleurs+" couleurs)");

  /* ---- vraie interface : accepter un brief ---- */
  await page.keyboard.press("e"); await images(page,4);
  await onglet(page,"briefs");
  let e0=await etat(page);
  if(!(await page.$('[data-do="accepter"]'))){ await avancer(page,2); await page.evaluate(()=>{dirty=true;}); await images(page,4); }
  const accepte=await cliquer(page,'[data-do="accepter"]',"accepter un brief");
  let e1=await etat(page);
  ok(accepte&&e1.projets===e0.projets+1,"brief accepté par le bouton ("+e0.projets+" -> "+e1.projets+")");
  await capture(page,tag+"-03-tableau-briefs");

  /* affecter */
  await onglet(page,"prod");
  const pid=await page.evaluate(()=>S.projets.length?S.projets[S.projets.length-1].id:null);
  const dejaAffecte=await page.evaluate(id=>{ const p=S.projets.find(x=>x.id===id); return p&&p.equipe.length; },pid);
  if(await page.$('[data-do="affecter"][data-id="'+pid+'"]')){
    await cliquer(page,'[data-do="affecter"][data-id="'+pid+'"]',"ouvrir Affecter");
    await capture(page,tag+"-04-modal-affecter");
    const okAff=await cliquer(page,'#modal [data-do="affecterOk"]',"choisir un designer");
    const nb=await page.evaluate(id=>S.projets.find(x=>x.id===id).equipe.length,pid);
    ok(okAff&&nb>dejaAffecte,"designer affecté par la modale ("+dejaAffecte+" -> "+nb+")");
  }else ok(false,"pas de bouton Affecter pour le projet "+pid);

  /* accélérer par le bouton x4 */
  await cliquer(page,'#temps [data-do="vitesse"][data-id="3"],[data-do="vitesse"][data-id="3"]',"vitesse x4");
  e1=await etat(page); ok(e1.vitesse>=3&&!e1.pause,"vitesse x4 et temps lancé ("+e1.vitesse+")");
  const j0=e1.jour; await sleep(1500); e1=await etat(page);
  ok(e1.jour>j0,"le temps avance en continu (+"+(e1.jour-j0).toFixed(3)+" j en 1,5 s)");
  await page.evaluate(()=>Net.action("pause",true));

  /* avancer jusqu'à la fin du projet puis livrer au bouton */
  for(let k=0;k<60;k++){
    const fini=await page.evaluate(id=>{ const p=S.projets.find(x=>x.id===id); return !p||p.avance>=p.charge; },pid);
    if(fini) break; await avancer(page,0.5);
  }
  await page.evaluate(()=>{dirty=true;}); await images(page,4); await onglet(page,"prod"); await sleep(600);
  const diag=await page.evaluate(id=>{ const p=S.projets.find(x=>x.id===id); const b=document.querySelector('[data-do="livrer"][data-id="'+id+'"]');
    return {existe:!!p,fini:p?projetFini(p):null,avance:p&&p.avance,charge:p&&p.charge,bouton:!!b,desactive:b?b.disabled:null,texte:b?b.textContent:""}; },pid);
  console.log("   livrer diag "+JSON.stringify(diag));
  const livres0=await page.evaluate(()=>S.livres);
  if(await page.$('[data-do="livrer"][data-id="'+pid+'"]')){
    await cliquer(page,'[data-do="livrer"][data-id="'+pid+'"]',"livrer");
    const l1=await page.evaluate(()=>S.livres);
    ok(l1===livres0+1,"projet livré par le bouton ("+livres0+" -> "+l1+")");
  }else{
    const st=await page.evaluate(id=>JSON.stringify(S.projets.find(x=>x.id===id)||"livré auto"),pid);
    ok(false,"bouton Livrer absent ; projet : "+st.slice(0,200));
  }

  /* recruter, acheter, former */
  await page.evaluate(()=>{ S.argent=60000; dirty=true; }); await images(page,3);
  await onglet(page,"recrut");
  const eq0=(await etat(page)).equipe;
  if(await page.$('[data-do="embaucher"]')){ await cliquer(page,'[data-do="embaucher"]',"embaucher"); }
  else ok(false,"aucun bouton embaucher");
  ok((await etat(page)).equipe===eq0+1,"embauche par le bouton");
  await onglet(page,"studio");
  await capture(page,tag+"-05-onglet-studio");
  const up0=(await etat(page)).up;
  await cliquer(page,'[data-do="acheter"][data-id2="materiel"]',"acheter matériel");
  await cliquer(page,'[data-do="acheter"][data-id2="cafe"]',"acheter confort");
  const up1=(await etat(page)).up;
  ok(up1.materiel===up0.materiel+1&&up1.cafe===up0.cafe+1,"améliorations achetées par les boutons");
  await onglet(page,"equipe");
  if(await page.$('[data-do="former"]')){
    await cliquer(page,'[data-do="former"]',"ouvrir Former");
    const fo=await cliquer(page,'#modal [data-do="formerOk"]',"choisir une formation");
    ok(fo&&await page.evaluate(()=>S.equipe.some(d=>d.form>0||d.formation>0||d.repos>0||d.forme)),"formation lancée");
  }else ok(false,"aucun bouton former");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await images(page,3);

  /* ---- niveaux de bureau 0..4 (achats réels via cmd), jour ---- */
  const perf={};
  for(let niv=0;niv<=4;niv++){
    await page.evaluate(n=>{
      const achat=(k,cible)=>{ let g=0; while(S.up[k]<cible&&g++<6){ S.argent=Math.max(S.argent,UPS[k].cout[S.up[k]+1]+20000); const r=cmd("acheter",[k],"hote"); if(!r.ok) throw new Error("achat "+k+" refusé : "+r.msg); } };
      achat("bureau",n);
      ["materiel","logiciel","cafe","marketing"].forEach(k=>achat(k,Math.min(4,n)));
      achat("prestige",n);
      S.argent=Math.max(S.argent,60000);
      /* remplir l'équipe et lancer du travail pour voir des gens assis */
      let g=0; while(S.equipe.length<capacite()&&g++<20){ if(!S.candidats||!S.candidats.length) refreshCandidats(); const c=S.candidats[0]; if(!c) break; cmd("embaucher",[c.id],"hote"); }
      g=0; while(S.briefs.length&&S.projets.length<capacite()&&g++<20) cmd("accepter",[S.briefs[0].id],"hote");
      S.equipe.forEach(d=>{ if(!d.proj&&libre(d)){ const p=S.projets.find(p=>p.equipe.length<2&&p.avance<p.charge); if(p) cmd("affecter",[p.id,d.id],"hote"); } });
      S.jour=Math.floor(S.jour)+0.5; S.session.pause=true; worldDirty=true; dirty=true;
    },niv);
    await page.evaluate(()=>{ for(let i=0;i<6;i++) step(.01); S.session.pause=true; });
    await sleep(900); await images(page,6);
    const inf=await page.evaluate(()=>Object.assign({salle:World.nomSalle,bureau:S.up.bureau,equipe:S.equipe.length},World.infos()));
    b=await capture(page,tag+"-1"+niv+"-bureau"+niv+"-jour");
    a=await analyse(page,b);
    console.log("   bureau "+niv+" "+JSON.stringify(inf)+" pixels "+JSON.stringify(a));
    ok(inf.bureau===niv,"bureau niveau "+niv+" atteint");
    perf[niv]=inf;
  }
  /* temps d'image au niveau 4 */
  const ft=await page.evaluate(()=>new Promise(r=>{ const t=[]; let p=performance.now(); const f=now=>{ t.push(now-p); p=now; if(t.length<90) requestAnimationFrame(f); else { t.shift(); t.sort((a,b)=>a-b); r({median:t[t.length>>1],p90:t[Math.floor(t.length*.9)]}); } }; requestAnimationFrame(f); }));
  console.log("   niveau 4, temps d'image SwiftShader 1600x900 : médiane "+ft.median.toFixed(1)+" ms, p90 "+ft.p90.toFixed(1)+" ms ; appels "+perf[4].appels+", triangles "+perf[4].triangles);
  journal.perf={ft,infos:perf[4]};

  /* nuit */
  await page.evaluate(()=>{ S.jour=Math.floor(S.jour)+0.96; S.session.pause=true; dirty=true; });
  await sleep(1500); await images(page,4);
  b=await capture(page,tag+"-20-bureau4-nuit"); a=await analyse(page,b);
  console.log("   nuit pixels "+JSON.stringify(a));
  ok(await page.evaluate(()=>World.lumiere<.15),"lumière de nuit ("+(await page.evaluate(()=>World.lumiere)).toFixed(2)+")");
  await page.evaluate(()=>{ S.jour=Math.floor(S.jour)+0.79; });
  await sleep(1500); await images(page,4);
  await capture(page,tag+"-21-bureau4-crepuscule");
  await page.evaluate(()=>{ S.jour=Math.floor(S.jour)+1.5; });
  await sleep(1500);

  /* ---- caméra : vues V ---- */
  for(let v=0;v<3;v++){
    await page.keyboard.press("v"); await sleep(1300); await images(page,3);
    await capture(page,tag+"-3"+v+"-vue"+((v+1)%3));
  }
  /* orbite, zoom, décalage */
  const c0=await page.evaluate(()=>World.camera.position.toArray());
  await page.mouse.move(800,500); await page.mouse.down(); await page.mouse.move(950,470,{steps:8}); await page.mouse.up();
  await sleep(700);
  const c1=await page.evaluate(()=>World.camera.position.toArray());
  ok(Math.hypot(c1[0]-c0[0],c1[2]-c0[2])>.5,"orbite à la souris");
  await page.mouse.move(800,500); await page.mouse.wheel({deltaY:-300}); await page.mouse.wheel({deltaY:-300}); await sleep(800);
  const c2=await page.evaluate(()=>World.camera.position.length());
  ok(c2<Math.hypot(...c1),"zoom molette");
  await page.mouse.move(800,500); await page.mouse.down({button:"right"}); await page.mouse.move(700,560,{steps:6}); await page.mouse.up({button:"right"});
  await sleep(700);
  ok(await page.evaluate(()=>{ const c=World.camera; const d=new THREE.Vector3(); c.getWorldDirection(d); return true; }),"décalage clic droit sans erreur");
  await page.mouse.move(800,500); for(let i=0;i<4;i++) await page.mouse.wheel({deltaY:-400}); await sleep(900);
  await capture(page,tag+"-40-gros-plan");

  /* clic sur un personnage => fiche (les personnages bougent : on revise à chaque essai) */
  let sel={sel:null,on:false}, vise=null;
  for(let essai=0;essai<4&&!sel.on;essai++){
    const cible=await page.evaluate(()=>{
      const r=World.renderer.domElement.getBoundingClientRect();
      for(const d of S.equipe){ const p=World.ecranDe(d.id); if(!p||p.z>=1||p.x<250||p.x>1350||p.y<120||p.y>820) continue;
        for(const dy of [24,12,36,0]){ const y=p.y+dy; if(World.viser((p.x-r.left)/r.width*2-1,-((y-r.top)/r.height*2-1))===d.id) return {id:d.id,x:p.x,y}; } }
      return null; });
    if(!cible){ await sleep(400); continue; }
    vise=cible.id;
    await page.mouse.click(cible.x,cible.y); await images(page,5);
    sel=await page.evaluate(()=>({sel:UI.selection,on:document.getElementById("inspect").classList.contains("on")}));
  }
  ok(sel.on&&sel.sel!==null,"clic sur un personnage ouvre sa fiche (visé "+vise+", sélection "+sel.sel+")");
  if(sel.on){ await capture(page,tag+"-41-fiche-perso"); await page.keyboard.press("Escape"); await images(page,3); }

  /* avatar local : clic sur le sol */
  await page.keyboard.press("v"); await page.keyboard.press("v"); await page.keyboard.press("v"); await sleep(1200);
  const solPt=await page.evaluate(()=>{
    const r=World.renderer.domElement.getBoundingClientRect();
    for(let y=.75;y>.3;y-=.04) for(let x=.35;x<.7;x+=.05){ const X=r.left+r.width*x, Y=r.top+r.height*y;
      if(World.viser((X-r.left)/r.width*2-1,-((Y-r.top)/r.height*2-1))!==null) continue;
      const s=World.solA(X,Y); if(s){ const a=Jeu.avatar; if(Math.hypot(s.x-a.x,s.z-a.z)>2) return {X,Y,s}; } }
    return null; });
  if(solPt){
    await page.mouse.click(solPt.X,solPt.Y); await sleep(250);
    const m=await page.evaluate(()=>Jeu.avatar.mode);
    await page.waitForFunction(s=>{ const a=Jeu.avatar; return a.mode==="idle"&&Math.hypot(a.x-s.x,a.z-s.z)<.3; },{timeout:15000},solPt.s).catch(()=>{});
    const av=await page.evaluate(()=>Jeu.avatar);
    ok(m==="marche"&&Math.hypot(av.x-solPt.s.x,av.z-solPt.s.z)<.3,"avatar marche jusqu'au clic ("+m+", reste "+Math.hypot(av.x-solPt.s.x,av.z-solPt.s.z).toFixed(2)+")");
    await capture(page,tag+"-42-avatar");
  }else ok(false,"pas de point de sol trouvé pour l'avatar");

  /* tableau de bord large */
  await page.keyboard.press("e"); await images(page,4);
  await onglet(page,"prod"); await capture(page,tag+"-50-tableau-prod");
  await onglet(page,"equipe"); await capture(page,tag+"-51-tableau-equipe");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await images(page,3);

  /* ---- fin : victoire ---- */
  await page.evaluate(()=>{ S.session.pause=false; S.rep=600; S.ca=900000; step(.05); });
  await page.waitForFunction(()=>document.getElementById("modal").classList.contains("on"),{timeout:10000}).catch(()=>{});
  await sleep(600);
  const fin=await page.evaluate(()=>({fini:S.fini,titre:(document.querySelector("#modal h3")||{}).textContent}));
  ok(fin.fini===2&&/légendaire/i.test(fin.titre||""),"écran de victoire ("+fin.titre+")");
  await capture(page,tag+"-60-victoire");
  /* Continuer */
  await page.evaluate(()=>{ const bs=[...document.querySelectorAll("#modal .f .btn")]; bs.find(b=>/Continuer/.test(b.textContent)).click(); });
  await sleep(500);
  ok(await page.evaluate(()=>!S.fini&&!document.getElementById("modal").classList.contains("on")),"Continuer ferme la fin et reprend");
  await avancer(page,3);
  ok(await page.evaluate(()=>!S.fini),"pas de seconde victoire après Continuer");

  /* ---- faillite ---- */
  await page.evaluate(()=>{ S.argent=-80000; step(.05); });
  await page.waitForFunction(()=>document.getElementById("modal").classList.contains("on"),{timeout:10000}).catch(()=>{});
  await sleep(400);
  const fin2=await page.evaluate(()=>({fini:S.fini,titre:(document.querySelector("#modal h3")||{}).textContent}));
  ok(fin2.fini===1&&/bilan/i.test(fin2.titre||""),"écran de faillite ("+fin2.titre+")");
  await capture(page,tag+"-61-faillite");
  /* Nouvelle partie depuis la fin */
  await page.evaluate(()=>{ const bs=[...document.querySelectorAll("#modal .f .btn")]; bs.find(b=>/Nouvelle partie/.test(b.textContent)).click(); });
  await sleep(1200); await images(page,6);
  const neuf=await page.evaluate(()=>({jour:S.jour,bureau:S.up.bureau,fini:S.fini,eq:S.equipe.length,modal:document.getElementById("modal").classList.contains("on")}));
  ok(neuf.bureau===0&&!neuf.fini&&neuf.jour<3&&!neuf.modal,"nouvelle partie remise à zéro "+JSON.stringify(neuf));
  await capture(page,tag+"-62-nouvelle-partie");

  /* ---- sauvegarde + rechargement ---- */
  await page.evaluate(()=>{ S.argent=12345; S.nom=S.nom; sauver(); });
  const avant=await page.evaluate(()=>({jour:S.jour,argent:S.argent,nom:S.nom}));
  await charger(page,url);
  await cliquer(page,"#mSolo","Jouer en solo après rechargement");
  const apres=await page.evaluate(()=>({jour:S.jour,argent:S.argent,nom:S.nom}));
  ok(Math.abs(apres.argent-avant.argent)<1&&apres.nom===avant.nom,"sauvegarde rechargée ("+avant.argent+" -> "+apres.argent+")");

  /* longue avance sans gel */
  const t0=Date.now();
  await page.evaluate(()=>{ S.session.pause=true; for(let i=0;i<400;i++){ if(!S.fini) step(.25); } });
  ok(Date.now()-t0<20000,"100 jours de sim en "+(Date.now()-t0)+" ms (fin : "+(await page.evaluate(()=>S.fini+" "+S.finRaison+" jour "+Math.floor(S.jour)))+")");
  await images(page,5);
  await page.close();
}

async function scenario4K(nav,url,tag,journal,vp){
  const page=await nouvellePage(nav,vp,journal);
  await charger(page,url);
  await capture(page,tag+"-menu-4k");
  await cliquer(page,"#mSolo","Jouer en solo 4K");
  await page.evaluate(()=>{ S.argent=900000; for(let g=0;g<3&&S.up.bureau<3;g++) cmd("acheter",["bureau"],"hote"); S.jour=Math.floor(S.jour)+.5; S.session.pause=true; });
  await sleep(1500); await images(page,4);
  const pr=await page.evaluate(()=>({pr:World.renderer.getPixelRatio(),w:World.renderer.domElement.width,h:World.renderer.domElement.height}));
  console.log("   4K : "+JSON.stringify(pr));
  ok(pr.pr<=1.5,"pixelRatio plafonné en 4K");
  await page.keyboard.press("e"); await images(page,4);
  const b=await capture(page,tag+"-jeu-4k");
  const a=await analyse(page,b); ok(a.couleurs>200,"rendu 4K non vide");
  const ft=await page.evaluate(()=>new Promise(r=>{ const t=[]; let p=performance.now(); const f=now=>{ t.push(now-p); p=now; if(t.length<30) requestAnimationFrame(f); else { t.shift(); t.sort((a,b)=>a-b); r(t[t.length>>1]); } }; requestAnimationFrame(f); }));
  console.log("   4K temps d'image médian : "+ft.toFixed(1)+" ms");
  journal.perf4k=Object.assign(journal.perf4k||{},{[tag]:{ms:ft,pr:pr.pr,canvas:pr.w+"x"+pr.h}});
  await page.close();
}

(async()=>{
  /* garde-fou : rien ne doit pendre plus de 12 minutes */
  let navG=null;
  const garde=setTimeout(async()=>{ console.log("ÉCHEC : délai global dépassé"); try{ if(navG) await navG.close(); }catch(e){} process.exit(2); },30*60*1000);
  const srv=await serveur();
  const port=srv.address().port;
  const nav=await puppeteer.launch({executablePath:EDGE,headless:"new",protocolTimeout:120000,
    args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl",
          "--no-first-run","--no-default-browser-check","--allow-file-access-from-files","--autoplay-policy=no-user-gesture-required"]});
  navG=nav;
  const cibles=[["http","http://127.0.0.1:"+port+"/index.html"]];
  if(!RAPIDE) cibles.push(["file","file:///"+RACINE.replace(/\\/g,"/")+"/index.html"]);
  const bilan=[];
  try{
    for(const [tag,url] of cibles){
      console.log("\n=== "+tag+" : "+url);
      const journal={console:[],warn:[],page:[],req:[]};
      try{ await scenarioComplet(nav,url,tag,journal); }
      catch(e){ ok(false,"exception scénario "+tag+" : "+(e&&e.stack||e)); }
      /* écran 4K à 150 % (2560x1440 CSS = 3840x2160 physiques) puis viewport 3840x2160 à 1,5 */
      if(!RAPIDE&&tag==="http") for(const vp of [{width:2560,height:1440,deviceScaleFactor:1.5,n:"4k150"},{width:3840,height:2160,deviceScaleFactor:1.5,n:"3840x1.5"}]){
        try{ await scenario4K(nav,url,tag+"-"+vp.n,journal,vp); }catch(e){ ok(false,"exception 4K "+vp.n+" : "+(e&&e.message||e)); } }
      const optionnel=s=>/fonts\.(googleapis|gstatic)|unpkg\.com\/peerjs|peerjs/i.test(s);
      const reqDures=journal.req.filter(s=>!optionnel(s));
      const consDures=journal.console.filter(s=>!optionnel(s)&&!/net::ERR_/.test(s));
      console.log("   erreurs console : "+journal.console.length+(journal.console.length?"\n     "+journal.console.slice(0,8).join("\n     "):""));
      console.log("   avertissements : "+journal.warn.length+(journal.warn.length?"\n     "+[...new Set(journal.warn)].slice(0,6).join("\n     "):""));
      console.log("   requêtes en échec : "+journal.req.length+(journal.req.length?"\n     "+journal.req.slice(0,8).join("\n     "):""));
      ok(journal.page.length===0,tag+" : aucune exception de page"+(journal.page.length?" ("+journal.page.slice(0,4).join(" | ")+")":""));
      ok(consDures.length===0,tag+" : aucune erreur console hors ressources optionnelles");
      ok(reqDures.length===0,tag+" : aucune requête en échec hors ressources optionnelles");
      bilan.push({tag,perf:journal.perf,perf4k:journal.perf4k});
    }
  }finally{
    await nav.close(); srv.close(); clearTimeout(garde);
  }
  console.log("\n"+JSON.stringify(bilan));
  console.log(echecs?"\n"+echecs+" ÉCHEC(S)":"\nTOUT EST VERT");
  process.exit(echecs?1:0);
})();
