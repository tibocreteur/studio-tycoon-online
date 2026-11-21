/* Test de bout en bout du multijoueur, avec de VRAIS navigateurs et le VRAI serveur PeerJS public.
   Lance : node tests/e2e-multi.js        (après `npm i` dans tests/, qui installe puppeteer-core)
   Variables : SOAK_S=150 (durée de l'endurance à x4, en secondes), EDGE=chemin de msedge.exe, HEADFUL=1
   - sert le dossier du jeu sur 127.0.0.1 (comme GitHub Pages, en http local) ;
   - ouvre plusieurs Edge headless indépendants (profils séparés = localStorage séparés) ;
   - hôte + clients via le code ET via le lien ?rejoindre=CODE ; commandes, refus, endurance,
     avatars, écran de fin, déconnexions, partie pleine, messages malformés, injection HTML, débit. */
"use strict";
const http=require("http"), fs=require("fs"), path=require("path"), os=require("os");
const puppeteer=require("puppeteer-core");

const RACINE=path.join(__dirname,"..");
const EDGE=process.env.EDGE||"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SOAK_S=+process.env.SOAK_S||150;
const attendre=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0, ko=0; const echecs=[];
function verifie(c,msg,detail){ if(c){ ok++; console.log("  ok  "+msg); } else { ko++; echecs.push(msg); console.log("  KO  "+msg+(detail!==undefined?"  ("+JSON.stringify(detail)+")":"")); } }
async function jusqua(fn,ms,pas){ const t0=Date.now(); while(Date.now()-t0<(ms||10000)){ try{ if(await fn()) return true; }catch(e){} await attendre(pas||150); } return false; }

/* ---------- serveur statique ---------- */
const TYPES={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css",".json":"application/json",".png":"image/png"};
function serveur(){
  return new Promise(res=>{
    const srv=http.createServer((req,rep)=>{
      let p=decodeURIComponent(req.url.split("?")[0]); if(p.endsWith("/")) p+="index.html";
      const f=path.join(RACINE,path.normalize(p).replace(/^([\\/]\.\.)+/,""));
      if(!f.startsWith(RACINE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rep.writeHead(404); rep.end(); return; }
      rep.writeHead(200,{"Content-Type":TYPES[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(rep);
    });
    srv.listen(0,"127.0.0.1",()=>res(srv));
  });
}

/* ---------- navigateurs ---------- */
const navs=[];
async function ouvrir(nom,url){
  let b, essai=0, dir;
  for(;;){ dir=fs.realpathSync.native(fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),"studio-e2e-"+nom+"-")));
    try{ b=await puppeteer.launch({timeout:120000,protocolTimeout:120000,executablePath:EDGE,headless:process.env.HEADFUL?false:"new",userDataDir:dir,
    args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--no-first-run","--no-default-browser-check",
      "--disable-background-timer-throttling","--disable-renderer-backgrounding","--disable-backgrounding-occluded-windows",
      "--window-size=800,500"]}); break; }
    catch(e){ console.log("    (lancement de "+nom+" raté : "+String(e.message).slice(0,120)+", nouvel essai)"); if(++essai>=4) throw e; await attendre(3000); } }
  const page=await b.newPage();
  await page.setViewport({width:800,height:500});
  const n={nom,b,page,dir,erreurs:[],ferme:false};
  page.on("pageerror",e=>n.erreurs.push(String(e&&e.message||e)));
  page.on("console",m=>{ if(m.type()==="error") n.erreurs.push("console: "+m.text()); });
  page.on("dialog",d=>{ n.erreurs.push("DIALOGUE "+d.message()); d.dismiss().catch(()=>{}); });
  for(let k=0;;k++){ try{ await page.goto(url,{waitUntil:"load",timeout:60000}); break; }
    catch(e){ if(k>=3) throw e; console.log("    (navigation "+nom+" : "+String(e.message).slice(0,60)+", nouvel essai)"); await attendre(2000); } }
  const pret=await jusqua(()=>page.evaluate(()=>!!(window.UI&&window.Net&&document.getElementById("boot").style.display==="none")),30000);
  if(!pret) throw new Error(nom+" : le jeu ne démarre pas");
  /* 5 Edge en rendu logiciel saturent le CPU (4 images/s) : on coupe le dessin WebGL,
     la boucle, la sim, le réseau et World.update continuent. LEGER=0 pour garder le rendu. */
  if(process.env.LEGER!=="0") await page.evaluate(()=>{ World.rendu=function(){}; });
  navs.push(n);
  return n;
}
async function fermer(n){ if(n.ferme) return; n.ferme=true; try{ await n.b.close(); }catch(e){} }
const ev=(n,f,...a)=>n.page.evaluate(f,...a);
async function nommer(n,nom,couleurIdx){
  await ev(n,(nom,ci)=>{
    const i=document.getElementById("mNom"); i.value=nom; i.dispatchEvent(new Event("change"));
    const bs=document.querySelectorAll("#mCouleurs button"); if(bs[ci]) bs[ci].click();
  },nom,couleurIdx||0);
}
const etatCle=n=>ev(n,()=>S?{jour:S.jour,argent:Math.round(S.argent),rep:Math.round(S.rep*10)/10,projets:S.projets.length,briefs:S.briefs.length,
  equipe:S.equipe.length,vitesse:S.session.vitesse,pause:!!S.session.pause,fini:S.fini,joueurs:Object.keys(S.joueurs).length}:null);
const toasts=n=>ev(n,()=>[...document.querySelectorAll("#toasts .toast")].map(t=>t.textContent));
const modale=n=>ev(n,()=>{ const m=document.getElementById("modal"); return m.classList.contains("on")?{titre:(m.querySelector("h3")||{}).textContent,btns:[...m.querySelectorAll("[data-mb]")].map(b=>b.textContent)}:null; });
async function cliquerBouton(n,texte){ return ev(n,t=>{ const b=[...document.querySelectorAll("#modal [data-mb]")].find(x=>x.textContent.indexOf(t)>=0); if(b){ b.click(); return true; } return false; },texte); }
async function rejoindreParCode(n,code){
  await ev(n,c=>{ const i=document.getElementById("mCode"); i.value=c; i.dispatchEvent(new Event("input")); document.getElementById("mRejoindre").click(); },code);
}
async function attendreLib(n){ return jusqua(()=>ev(n,()=>Net.etatLib()==="ok"),20000); }

/* =================================================================== */
(async()=>{
  const srv=await serveur();
  const BASE="http://127.0.0.1:"+srv.address().port+"/";
  console.log("Serveur local : "+BASE);
  let H,A,B,C,D,E,t;
  try{
    /* ---------- 1. création, code, rejoindre par lien et par code ---------- */
    console.log("\n1. Création et arrivée des joueurs (vrai broker PeerJS)");
    H=await ouvrir("hote",BASE);
    verifie(await attendreLib(H),"PeerJS 1.5.4 chargé depuis unpkg");
    await nommer(H,"Hana",0);
    await ev(H,()=>document.getElementById("mHeberger").click());
    const hote=await jusqua(()=>ev(H,()=>Net.mode==="hote"),20000);
    verifie(hote,"l'hôte s'inscrit sur le serveur de mise en relation");
    if(!hote){ console.log("  Broker injoignable : utiliser tests/ui.test.js (faux broker)."); throw new Error("broker"); }
    const code=await ev(H,()=>Net.code);
    const lien=await ev(H,()=>Net.lien());
    verifie(/^[A-HJ-NP-Z2-9]{5}$/.test(code),"code à 5 caractères : "+code);
    verifie(lien===BASE+"?rejoindre="+code,"lien d'invitation correct",lien);
    verifie((await modale(H)||{}).titre==="Inviter des amis"||!!(await modale(H)),"fenêtre d'invitation ouverte chez l'hôte",await modale(H));
    await ev(H,()=>{ document.getElementById("modal").classList.contains("on")&&document.querySelector("#modal [data-mb]")&&UI&&0; });
    await ev(H,()=>{ const m=document.getElementById("modal"); m.classList.remove("on"); m.innerHTML=""; });
    await ev(H,()=>{ /* fermeture propre via la croix si présente */ });

    A=await ouvrir("clientA",lien);
    await attendreLib(A);
    verifie(await ev(A,()=>document.getElementById("mCode").value)===code,"le lien ?rejoindre préremplit le code");
    await nommer(A,"Alix",2);
    await ev(A,()=>document.getElementById("mRejoindre").click());
    const tA0=Date.now();
    verifie(await jusqua(()=>ev(A,()=>Net.mode==="client"),25000),"client A connecté via le lien ("+(Date.now()-tA0)+" ms)");

    B=await ouvrir("clientB",BASE);
    await attendreLib(B);
    await nommer(B,"Bo\"&<b>x</b>'",4);       /* injection HTML dans le nom */
    await rejoindreParCode(B,code.toLowerCase());
    verifie(await jusqua(()=>ev(B,()=>Net.mode==="client"),25000),"client B connecté via le champ code (saisi en minuscules)");

    verifie(await jusqua(async()=>(await etatCle(H)).joueurs===3,8000),"S.joueurs contient 3 joueurs chez l'hôte");
    const okPing=await jusqua(async()=>{
      const t=await ev(A,()=>document.getElementById("joueurs").textContent);
      return /Hana/.test(t)&&/Alix/.test(t)&&/Bo/.test(t)&&/\d+ ms/.test(t);
    },10000);
    verifie(okPing,"liste des joueurs chez A : 3 noms + ping en ms",await ev(A,()=>document.getElementById("joueurs").textContent));
    const listeH=await ev(H,()=>({txt:document.getElementById("joueurs").textContent,pts:[...document.querySelectorAll("#joueurs .pt")].map(p=>p.style.background),b:document.querySelectorAll("#joueurs b").length}));
    verifie(/3 \/ 4/.test(listeH.txt)&&listeH.pts.length===3&&new Set(listeH.pts).size===3,"liste chez l'hôte : 3 / 4, 3 pastilles de couleurs différentes",listeH);
    verifie(await jusqua(()=>ev(H,()=>/\d+ ms/.test(document.getElementById("joueurs").textContent)),6000),"ping des invités affiché chez l'hôte");

    /* ---------- 6a. injection HTML dans les noms ---------- */
    console.log("\n6a. Noms piégés");
    for(const n of [H,A,B]){
      const r=await ev(n,()=>({b:document.querySelectorAll("#joueurs b, #toasts b b, #journal b").length,
        nomB:Object.values(S.joueurs).map(j=>j.nom).find(x=>/^Bo/.test(x)),xss:!!window.__xss}));
      verifie(r.b===0&&r.nomB&&r.nomB.indexOf("<")<0&&!r.xss,n.nom+" : nom nettoyé, aucun <b> injecté",r);
    }

    /* ---------- 2. commandes du client ---------- */
    console.log("\n2. Commandes envoyées par un client");
    await ev(H,()=>Net.action("vitesse",1));
    const brief=await ev(A,()=>S.briefs[0]&&S.briefs[0].id);
    const p0=(await etatCle(H)).projets;
    await ev(A,id=>Net.action("accepter",id),brief);
    verifie(await jusqua(async()=>(await etatCle(H)).projets===p0+1&&(await etatCle(A)).projets===p0+1,6000),"accepter (client A) : projet créé chez l'hôte et visible chez A");
    const ids=await ev(H,()=>({p:S.projets[S.projets.length-1].id,d:S.equipe[0].id,cand:S.candidats[0]&&S.candidats[0].id}));
    await ev(B,(p,d)=>Net.action("affecter",p,d),ids.p,ids.d);
    verifie(await jusqua(()=>ev(A,(p,d)=>{ const x=S.projets.find(q=>q.id===p); return x&&x.equipe.indexOf(d)>=0; },ids.p,ids.d),6000),"affecter (client B) : visible chez A");
    verifie(await ev(H,(p,d)=>S.projets.find(q=>q.id===p).equipe.indexOf(d)>=0,ids.p,ids.d),"affecter appliqué chez l'hôte");
    /* refus : livrer un projet pas fini -> toast seulement chez l'émetteur */
    const tH0=(await toasts(H)).length, tB0=(await toasts(B)).length;
    await ev(A,p=>Net.action("livrer",p),ids.p);
    const refuA=await jusqua(async()=>(await toasts(A)).some(t=>/livr|fini|termin|prêt/i.test(t)),5000);
    verifie(refuA,"livrer trop tôt : refus en toast chez A",await toasts(A));
    await attendre(800);
    const tH=await toasts(H), tB=await toasts(B);
    verifie(!tH.some(t=>/livr|fini|termin|prêt/i.test(t))&&!tB.some(t=>/livr|fini|termin|prêt/i.test(t)),"le refus n'apparaît ni chez l'hôte ni chez B",{tH,tB});
    /* refus explicite */
    await ev(B,()=>Net.action("accepter",999999));
    verifie(await jusqua(async()=>(await toasts(B)).length>tB0,4000),"accepter un brief inexistant : toast chez B");
    /* embaucher, acheter */
    const eq0=(await etatCle(H)).equipe, ar0=(await etatCle(H)).argent;
    if(ids.cand!==undefined){
      await ev(A,c=>Net.action("embaucher",c),ids.cand);
      const emb=await jusqua(async()=>(await etatCle(A)).equipe===eq0+1,5000);
      const refus=(await toasts(A)).join(" | ");
      verifie(emb||/argent|tréso|place|bureau|budget|€/i.test(refus),"embaucher (client A) : appliqué ou refus motivé"+(emb?" (appliqué)":" ("+refus+")"));
    }
    await ev(B,()=>Net.action("acheter","cafe"));
    const ach=await jusqua(async()=>(await ev(A,()=>S.up.cafe))>=1,5000);
    verifie(ach||(await toasts(B)).length>tB0+1,"acheter café (client B) : visible chez A"+(ach?"":" (refusé)"));
    /* vitesse / pause */
    await ev(A,()=>Net.action("pause",true));
    verifie(await jusqua(async()=>(await etatCle(H)).pause&&(await etatCle(B)).pause,4000),"pause demandée par A : appliquée chez l'hôte et chez B");
    await ev(B,()=>Net.action("vitesse",3));
    verifie(await jusqua(async()=>{ const h=await etatCle(H), a=await etatCle(A); return h.vitesse===4&&!h.pause&&a.vitesse===4; },4000),"vitesse x4 demandée par B : appliquée partout");
    /* un client ne peut pas relancer une partie */
    const nomStudio=await ev(H,()=>S.nom), jourAv=(await etatCle(H)).jour;
    await ev(A,()=>Net.action("nouvellePartie"));
    await attendre(1200);
    verifie(await ev(H,()=>S.nom)===nomStudio&&(await etatCle(H)).jour>=jourAv,"nouvellePartie depuis un client : refusée");
    verifie((await toasts(A)).some(t=>/hôte/i.test(t)),"refus nouvellePartie : toast chez A",await toasts(A));

    /* ---------- 3. avatars ---------- */
    console.log("\n3. Avatars");
    async function clicSol(n){
      const avant=await ev(n,()=>Jeu.avatar);
      for(const [x,y] of [[400,440],[250,405],[560,405],[400,350],[190,450],[620,450]]){
        await ev(n,()=>{ const m=document.getElementById("modal"); if(m.classList.contains("on")&&!m._sansFermer){ m.classList.remove("on"); m.innerHTML=""; } });
        await n.page.mouse.click(x,y);
        await attendre(900);
        const ap=await ev(n,()=>Jeu.avatar);
        if(Math.hypot(ap.x-avant.x,ap.z-avant.z)>0.3) return {avant,ap};
        await ev(n,()=>{ if(window.UI&&UI.echap) UI.echap(); });
      }
      return null;
    }
    const mvA=await clicSol(A);
    verifie(!!mvA,"clic sur le sol : l'avatar de A se déplace",mvA);
    await attendre(1500);
    const posA=await ev(A,()=>Jeu.avatar), idA=await ev(A,()=>Net.monId);
    const vuH=await ev(H,id=>Net.avatars().find(a=>a.id===id),idA), vuB=await ev(B,id=>Net.avatars().find(a=>a.id===id),idA);
    verifie(vuH&&Math.hypot(vuH.x-posA.x,vuH.z-posA.z)<0.3,"l'hôte voit A à sa position",{posA,vuH});
    verifie(vuB&&Math.hypot(vuB.x-posA.x,vuB.z-posA.z)<0.3,"B voit A à sa position (relais par l'hôte)",{posA,vuB});
    const mvH=await clicSol(H);
    verifie(!!mvH,"clic sur le sol : l'avatar de l'hôte se déplace");
    await attendre(1500);
    const posH=await ev(H,()=>Jeu.avatar), vuA=await ev(A,()=>Net.avatars().find(a=>a.id==="hote"));
    verifie(vuA&&Math.hypot(vuA.x-posH.x,vuA.z-posH.z)<0.3,"A voit l'hôte à sa position",{posH,vuA});
    for(const n of [H,A,B]){
      const r=await ev(n,()=>({n:World.infos().avatars,noms:Net.avatars().map(a=>a.nom),loc:World.idAvatarLocal===Net.monId}));
      verifie(r.n===3&&r.noms.length===3&&r.loc,n.nom+" : 3 avatars rendus, noms "+r.noms.join(", "),r);
    }

    /* ---------- 2b + 7. endurance x4 et débit ---------- */
    console.log("\n2b/7. Endurance x4 ("+SOAK_S+" s), cohérence et débit");
    /* débit mesuré à la source : chaque appel à snapshot() par net.js = un message diffusé */
    await ev(H,()=>{
      window.__mes={n:0,octets:0,max:0,complet:0,t0:performance.now()};
      const orig=snapshot;
      window.snapshot=function(){ const s=orig(); __mes.n++; __mes.octets+=s.length; __mes.max=Math.max(__mes.max,s.length); return s; }; window.__origSnap=orig;
    });
    await ev(B,()=>{
      /* lissage : on échantillonne S.jour à chaque image */
      /* excès = avance de S.jour sur une image, moins ce que le temps réel écoulé justifie */
      window.__jours={recul:0,max:0,exces:0,n:0,prec:S.jour,t:performance.now()};
      (function f(t){ const j=S.jour, d=j-__jours.prec, dt=Math.max(0,(t||performance.now())-__jours.t);
        const attendu=dt*(window.multVitesse?multVitesse():0)/JOUR_MS;
        __jours.n++; if(d<-1e-6&&!S.session.pause) __jours.recul++; if(d>__jours.max) __jours.max=d;
        if(d-attendu>__jours.exces) __jours.exces=d-attendu; __jours.prec=j; __jours.t=t||performance.now(); requestAnimationFrame(f); })();
    });
    await ev(H,()=>{ S.argent+=60000; Net.action("vitesse",3); });   /* éviter une faillite pendant l'endurance */
    /* le client B joue un peu pendant l'endurance */
    const ecarts=[]; let maxJour=0, maxArg=0, incoh=0;
    const t0=Date.now();
    while(Date.now()-t0<SOAK_S*1000){
      await attendre(4000);
      await ev(B,()=>{ const b=S.briefs[0]; if(b&&S.projets.length<3) Net.action("accepter",b.id);
        S.projets.forEach(p=>{ if(p.progres>=1||p.fini||p.pret) Net.action("livrer",p.id); if(!p.equipe.length&&S.equipe[0]) Net.action("affecter",p.id,S.equipe[0].id); }); });
      await attendre(1000);   /* on laisse l'aller-retour des commandes se faire avant de comparer */
      const [h,a,b]=await Promise.all([etatCle(H),etatCle(A),etatCle(B)]);
      const dj=Math.max(Math.abs(h.jour-a.jour),Math.abs(h.jour-b.jour));
      const da=Math.max(Math.abs(h.argent-a.argent),Math.abs(h.argent-b.argent));
      maxJour=Math.max(maxJour,dj); maxArg=Math.max(maxArg,da);
      const pc=h.projets===a.projets&&h.projets===b.projets, rc=Math.abs(h.rep-a.rep)<=1&&Math.abs(h.rep-b.rep)<=1;
      /* les 3 lectures ne sont pas simultanées (3 navigateurs chargés) : à x4, 0,6 jour = ~1 s */
      if(!pc||!rc||dj>0.6) incoh++;
      ecarts.push({j:+h.jour.toFixed(2),dj:+dj.toFixed(3),da,proj:[h.projets,a.projets,b.projets],rep:[h.rep,a.rep,b.rep]});
    }
    console.log("    échantillons :",JSON.stringify(ecarts.slice(-4)));
    verifie(incoh<=Math.max(1,Math.floor(ecarts.length/6)),"état cohérent hôte / A / B sur "+ecarts.length+" échantillons (écart jour max "+maxJour.toFixed(3)+", argent max "+maxArg+" €)",ecarts.filter(e=>e.dj>0.6));
    /* comparaison exacte une fois le temps arrêté */
    await ev(H,()=>Net.action("pause",true));
    await attendre(2000);
    const empreinte=n=>ev(n,()=>JSON.stringify({j:S.jour,a:S.argent,r:S.rep,p:S.projets.map(p=>[p.id,p.equipe,p.travail]),b:S.briefs.map(b=>b.id),e:S.equipe.map(d=>[d.id,Math.round(d.energie)]),u:S.up,l:S.journal.length,j0:S.journal[0]&&S.journal[0].t}));
    const [eh,ea,eb]=await Promise.all([empreinte(H),empreinte(A),empreinte(B)]);
    verifie(eh===ea&&eh===eb,"en pause : état strictement identique chez l'hôte, A et B (journal recollé compris)",eh===ea?[eh.slice(0,200),eb.slice(0,200)]:[eh.slice(0,200),ea.slice(0,200)]);
    const fxOk=await Promise.all([H,A,B].map(n=>ev(n,()=>S.fx.map(f=>f.id).join(","))));
    verifie(fxOk[0]===fxOk[1]&&fxOk[0]===fxOk[2],"file d'effets S.fx identique après fusion des instantanés partiels",fxOk.map(x=>x.slice(-60)));
    await ev(H,()=>Net.action("vitesse",3));
    const mes=await ev(H,()=>{ const dt=(performance.now()-__mes.t0)/1000; return {hz:__mes.n/dt,kbs:__mes.octets/1024/dt,moy:__mes.octets/Math.max(1,__mes.n),max:__mes.max,complet:__origSnap().length}; });
    mes.jours=await ev(B,()=>__jours);
    console.log("    instantanés : "+mes.hz.toFixed(1)+" /s, moyenne "+(mes.moy/1024).toFixed(1)+" Ko (complet : "+(mes.complet/1024).toFixed(1)+" Ko), max "+(mes.max/1024).toFixed(1)+" Ko, débit "+mes.kbs.toFixed(1)+" Ko/s par client");
    console.log("    images/s chez B : "+(mes.jours.n/SOAK_S).toFixed(1));
    verifie(mes.kbs<30,"débit des instantanés < 30 Ko/s par client ("+mes.kbs.toFixed(1)+" Ko/s)");
    verifie(mes.jours.recul===0,"lumière du client : S.jour ne recule jamais ("+mes.jours.n+" images)",mes.jours);
    verifie(mes.jours.exces<0.16,"lumière du client : pas de saut visible (avance max "+mes.jours.max.toFixed(3)+" jour/image, dont "+mes.jours.exces.toFixed(3)+" au-delà du temps réel)",mes.jours);
    const jA=(await etatCle(H)).jour;
    verifie(jA>3,"le temps a avancé pendant l'endurance (jour "+jA.toFixed(1)+")");

    /* ---------- 6b. robustesse : messages malformés, spam, nom géant ---------- */
    console.log("\n6b. Messages malformés et spam (pair pirate)");
    E=await ouvrir("pirate",BASE);
    await attendreLib(E);
    const jH0=(await etatCle(H)).jour;
    const rapport=await ev(E,async code=>{
      const out={ouvert:false,recus:0,types:{}};
      await new Promise(res=>{
        const p=new Peer({debug:0});
        p.on("open",()=>{
          const c=p.connect("studio-"+code,{reliable:true,metadata:{nom:"<script>x</script>".repeat(50),couleur:"red;background:url(x)"}});
          c.on("data",d=>{ out.recus++; const t=d&&d.type; out.types[t]=(out.types[t]||0)+1; if(t==="res"&&d.rid&&typeof d.rid==="object") out.ridObjet=true; });
          c.on("open",()=>{
            out.ouvert=true;
            const mal=[null,0,"texte",[1,2],{},{type:"__proto__"},{type:"constructor"},{type:"cmd"},{type:"cmd",nom:"toString"},
              {type:"cmd",nom:"__proto__",args:[]},{type:"cmd",nom:"accepter",args:"pas un tableau"},{type:"cmd",nom:"former",args:[{toString:"x"},{a:1}]},
              {type:"cmd",nom:"acheter",args:[{valueOf:1}]},{type:"cmd",nom:"rejoindre",args:["pirate","#fff"]},{type:"cmd",nom:"partir",args:[]},
              {type:"pos",x:"NaN",z:1e308,cap:null,mode:"<b>"},{type:"pos"},{type:"pong",t:"x"},{type:"ping"},{type:"snap",s:"{}"},{type:"bye"},{type:"plein"},
              {type:"cmd",nom:"vitesse",args:[1e9]},{type:"cmd",nom:"livrer",args:[{}]},{type:"cmd",nom:"accepter",args:new Array(5000).fill(1),rid:{gros:"x".repeat(200000)}}];
            mal.forEach(m=>{ try{ c.send(m); }catch(e){} });
            c.send({type:"hello",nom:"Z".repeat(100000)+"<img src=x onerror=window.__xss=1>",couleur:"javascript:alert(1)",v:1});
            for(let i=0;i<400;i++) c.send({type:"cmd",nom:i%2?"pause":"vitesse",args:[i%2?false:3],rid:i});
            for(let i=0;i<300;i++) c.send({type:"pos",x:Math.random()*1e6,z:-1e6,cap:i,mode:"marche"});
            setTimeout(()=>{ out.encore=c.open; res(); },6000);
          });
          c.on("error",e=>{ out.err=String(e&&e.type||e); });
        });
        p.on("error",e=>{ out.peerErr=String(e&&e.type||e); res(); });
        window.__pirate=p;
      });
      return out;
    },code);
    console.log("    pirate :",JSON.stringify(rapport));
    verifie(rapport.ouvert,"le pair pirate a pu envoyer ses messages");
    const apres=await etatCle(H);
    const errH=H.erreurs.filter(e=>!/favicon|404/.test(e));
    verifie(apres.jour>jH0,"l'hôte tourne toujours après les messages malformés (jour "+jH0.toFixed(2)+" -> "+apres.jour.toFixed(2)+")");
    verifie(errH.every(e=>/__peerData/.test(e)),"aucune exception côté jeu (seule erreur tolérée : PeerJS interne sur un message null)",errH);
    H.erreurs.length=0;
    verifie(!rapport.ridObjet,"l'hôte ne renvoie pas un rid arbitraire (objet géant) en écho");
    const pir=await ev(H,()=>{ const j=Object.values(S.joueurs).find(x=>/^Z/.test(x.nom)); const av=Net.avatars().find(a=>/^Z/.test(a.nom)); return {nom:j&&j.nom,coul:j&&j.couleur,av}; });
    verifie(pir.nom&&pir.nom.length<=16&&pir.coul==="#7da383","nom géant tronqué (16) et couleur invalide remplacée",pir);
    verifie(!pir.av||(Math.abs(pir.av.x)<=200&&Math.abs(pir.av.z)<=200),"positions aberrantes bornées",pir.av);
    for(const n of [H,A,B]) verifie(!(await ev(n,()=>!!window.__xss)),n.nom+" : aucune exécution de script injecté");
    await fermer(E);
    t=Date.now();
    verifie(await jusqua(async()=>(await etatCle(H)).joueurs===3&&(await ev(H,()=>Net.nbInvites))===2,40000,250),"pirate parti (navigateur tué) : retour à 3 joueurs ("+(Date.now()-t)+" ms)");
    /* l'état des clients honnêtes reste cohérent après le spam */
    await attendre(1500);
    const [h2,a2]=await Promise.all([etatCle(H),etatCle(A)]);
    verifie(Math.abs(h2.jour-a2.jour)<0.25&&h2.projets===a2.projets,"cohérence hôte / A après le spam",{h2,a2});

    /* ---------- 5c. onglet de l'hôte masqué ---------- */
    console.log("\n5c. Onglet de l'hôte en arrière-plan");
    const autre=await H.b.newPage(); await autre.goto("about:blank"); await autre.bringToFront();
    const cache=await jusqua(()=>ev(H,()=>document.hidden),5000);
    console.log("    document.hidden chez l'hôte : "+cache);
    const jc0=(await etatCle(A)).jour; await attendre(8000); const jc1=(await etatCle(A)).jour;
    verifie(jc1-jc0>2,"hôte en arrière-plan : la partie continue chez A (jour "+jc0.toFixed(2)+" -> "+jc1.toFixed(2)+")");
    verifie(await ev(A,()=>Net.mode)==="client","A reste connecté");
    await H.page.bringToFront(); await autre.close();

    /* ---------- 5b. 4e joueur, 5e refusé ---------- */
    console.log("\n5b. Partie pleine");
    C=await ouvrir("clientC",BASE+"?rejoindre="+code);
    await attendreLib(C); await nommer(C,"Cyd",6);
    await ev(C,()=>document.getElementById("mRejoindre").click());
    verifie(await jusqua(()=>ev(C,()=>Net.mode==="client"),25000),"4e joueur (C) accepté");
    verifie(await jusqua(()=>ev(H,()=>/4 \/ 4/.test(document.getElementById("joueurs").textContent)),5000),"liste : 4 / 4");
    D=await ouvrir("clientD",BASE);
    await attendreLib(D); await nommer(D,"Dee",1);
    await rejoindreParCode(D,code);
    const plein=await jusqua(()=>ev(D,()=>Net.mode==="menu"&&/compl/i.test(document.getElementById("mEtat").textContent)),25000);
    verifie(plein,"5e joueur refusé : « Partie complète »",await ev(D,()=>({m:Net.mode,e:document.getElementById("mEtat").textContent})));
    verifie((await etatCle(H)).joueurs===4,"l'hôte garde 4 joueurs");
    await fermer(D);

    /* ---------- 4. écran de fin ---------- */
    console.log("\n4. Écran de fin");
    await ev(H,()=>{ S.argent=S.seuilFaillite-5000; Net.action("vitesse",3); });
    const finH=await jusqua(async()=>((await modale(H))||{}).titre==="Dépôt de bilan",15000);
    verifie(finH,"faillite : écran de fin chez l'hôte");
    const finA=await jusqua(async()=>((await modale(A))||{}).titre==="Dépôt de bilan",8000);
    const mA=await modale(A);
    verifie(finA,"écran de fin aussi chez le client A",mA);
    verifie(finA&&!mA.btns.some(b=>/Nouvelle/.test(b)),"pas de bouton Nouvelle partie chez le client",mA);
    verifie(((await modale(C))||{}).titre==="Dépôt de bilan","écran de fin chez C (arrivé tard)");
    await cliquerBouton(H,"sursis");
    verifie(await jusqua(async()=>!(await etatCle(A)).fini&&!(await modale(A)),8000),"Continuer (hôte) : l'écran de fin se ferme chez A");
    verifie(!(await modale(C)),"et chez C");
    /* nouvelle partie depuis l'hôte */
    await ev(H,()=>{ S.argent=S.seuilFaillite-5000; });
    await jusqua(async()=>((await modale(H))||{}).titre==="Dépôt de bilan",15000);
    await jusqua(async()=>((await modale(A))||{}).titre==="Dépôt de bilan",8000);
    /* le client tente de relancer : refusé */
    const nomAv=await ev(H,()=>S.nom);
    await ev(A,()=>Net.action("nouvellePartie"));
    await attendre(1000);
    verifie(await ev(H,()=>S.nom)===nomAv&&(await etatCle(H)).fini,"un client ne peut pas lancer une nouvelle partie (même en fin)");
    await cliquerBouton(H,"Nouvelle partie");
    const np=await jusqua(async()=>{ const a=await etatCle(A); return !a.fini&&a.jour<2.5&&!(await modale(A)); },10000);
    verifie(np,"Nouvelle partie (hôte) : le client repart au jour 1, écran fermé",await etatCle(A));
    verifie((await ev(A,()=>S.nom))===(await ev(H,()=>S.nom))&&(await etatCle(H)).joueurs===4,"même studio partout, les 4 joueurs restent");

    /* ---------- 5. déconnexions ---------- */
    console.log("\n5. Déconnexions");
    const idB=await ev(B,()=>Net.monId);
    await ev(H,()=>{ window.__toastsVus=[]; const o=UI.toast; UI.toast=function(a,b,c){ __toastsVus.push(a+" "+b); return o.apply(this,arguments); }; });
    await fermer(B); t=Date.now();
    const partiB=await jusqua(async()=>{ const r=await ev(H,id=>!S.joueurs[id]&&Net.nbInvites===2,idB); return r; },40000,250);
    verifie(partiB,"B ferme son navigateur : l'hôte le retire ("+(Date.now()-t)+" ms)");
    verifie(await jusqua(()=>ev(H,()=>__toastsVus.some(x=>/quitté/.test(x))),3000),"toast « a quitté » chez l'hôte");
    verifie(await jusqua(()=>ev(A,()=>World.infos().avatars===3&&Net.joueurs().length===3),5000),"A : l'avatar et la ligne de B disparaissent");
    /* B revient */
    B=await ouvrir("clientB2",BASE+"?rejoindre="+code);
    await attendreLib(B); await nommer(B,"Bo",4);
    await ev(B,()=>document.getElementById("mRejoindre").click());
    verifie(await jusqua(()=>ev(B,()=>Net.mode==="client"),25000),"B peut revenir dans la partie");
    /* l'hôte quitte proprement (menu) puis l'hôte ferme brutalement : on teste le cas brutal */
    await fermer(H); t=Date.now();
    const perte=await jusqua(async()=>{ const m=await modale(A); return m&&m.titre==="Hôte déconnecté"&&(await ev(A,()=>Net.mode))==="menu"; },40000,250);
    verifie(perte,"hôte fermé : « Hôte déconnecté » chez A et retour au menu ("+(Date.now()-t)+" ms)");
    verifie(await jusqua(async()=>((await modale(C))||{}).titre==="Hôte déconnecté",10000),"idem chez C");
    verifie(await ev(A,()=>document.getElementById("menu").classList.contains("on")&&!document.getElementById("joueurs").classList.contains("on")),"menu affiché, liste des joueurs masquée");
    /* A héberge une nouvelle partie, C la rejoint */
    await ev(A,()=>{ const m=document.getElementById("modal"); m.classList.remove("on"); m.innerHTML=""; document.getElementById("mHeberger").click(); });
    verifie(await jusqua(()=>ev(A,()=>Net.mode==="hote"),20000),"l'ancien client A peut héberger");
    const code2=await ev(A,()=>Net.code);
    await ev(A,()=>{ const m=document.getElementById("modal"); m.classList.remove("on"); m.innerHTML=""; });
    await ev(C,()=>{ const m=document.getElementById("modal"); m.classList.remove("on"); m.innerHTML=""; });
    await rejoindreParCode(C,code2);
    verifie(await jusqua(()=>ev(C,()=>Net.mode==="client"),25000),"C rejoint la nouvelle partie de A (re-connexion après perte d'hôte)");
    /* départ propre de l'hôte via le menu : message « a fermé la partie » */
    await ev(A,()=>UI.retourMenu());
    verifie(await jusqua(async()=>{ const m=await modale(C); return m&&m.titre==="Hôte déconnecté"&&/fermé/.test(await ev(C,()=>document.getElementById("modal").textContent)); },10000),"hôte qui revient au menu : C reçoit « L'hôte a fermé la partie »");

    /* erreurs JS */
    for(const n of navs){ const e=n.erreurs.filter(x=>!/favicon|404|WebRTC|ICE|Peer|peerjs|Could not connect|Lost connection|ERR_|AudioContext/.test(x)); verifie(e.length===0,n.nom+" : aucune erreur JS",e.slice(0,5)); }
  }catch(e){
    ko++; echecs.push("exception : "+(e&&e.message||e)); console.log("  KO  exception : ",e);
  }finally{
    for(const n of navs) await fermer(n);
    srv.close();
    for(const n of navs){ try{ fs.rmSync(n.dir,{recursive:true,force:true}); }catch(e){} }
    console.log("\n"+ok+" ok, "+ko+" KO"+(ko?"\n  - "+echecs.join("\n  - "):""));
    process.exit(ko?1:0);
  }
})();
