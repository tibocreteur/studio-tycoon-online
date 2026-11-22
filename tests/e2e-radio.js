/* Test de bout en bout de la radio du studio, dans de vrais Edge headless (processus séparés).
   Lancer : node tests/e2e-radio.js            (solo + coop, demande internet : Radio Browser, flux, PeerJS)
            node tests/e2e-radio.js solo       (sans la partie coop)
   Ne touche pas au panneau navigateur intégré. */
"use strict";
const fs=require("fs"), path=require("path"), http=require("http"), os=require("os");
const puppeteer=require("puppeteer-core");

const RACINE=path.join(__dirname,"..");
const EDGE=process.env.EDGE||"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SOLO_SEUL=process.argv.includes("solo");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let echecs=0, oks=0;
const ok=(c,m,d)=>{ if(!c){ echecs++; console.log("  KO  "+m+(d!==undefined?"  ("+JSON.stringify(d).slice(0,300)+")":"")); } else { oks++; console.log("  ok  "+m); } };
async function jusqua(fn,ms,pas){ const t0=Date.now(); while(Date.now()-t0<(ms||10000)){ try{ if(await fn()) return true; }catch(e){} await sleep(pas||200); } return false; }

/* ---------- serveur statique 127.0.0.1 ---------- */
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

const navs=[];
async function lancer(nom){
  /* chemin long réel : un profil sous un chemin court 8.3 (UTILIS~1) fait échouer le lancement */
  for(let essai=0;;essai++){
    const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),"studio-radio-"+nom+"-")));
    try{
      const b=await puppeteer.launch({executablePath:EDGE,headless:"new",timeout:120000,protocolTimeout:120000,userDataDir:dir,
        args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--no-first-run","--no-default-browser-check",
          "--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows","--window-size=1400,850"]});
      navs.push(b);
      return b;
    }catch(e){ console.log("    (lancement de "+nom+" raté : "+String(e.message).slice(0,100)+", nouvel essai)"); if(essai>=3) throw e; await sleep(3000); }
  }
}
function journaliser(page,j){
  page.on("console",m=>{ if(m.type()==="error") j.console.push(m.text()); });
  page.on("pageerror",e=>j.page.push(String(e&&e.message||e)));
  page.on("dialog",d=>{ j.page.push("DIALOGUE "+d.message()); d.dismiss().catch(()=>{}); });
  page.on("request",r=>{ if(/radio-browser\.info/.test(r.url())) j.api.push(r.url()); });
}
async function charger(page,url){
  await page.goto(url,{waitUntil:"load",timeout:90000});
  await page.waitForFunction(()=>{ const b=document.getElementById("boot"); return b&&b.style.display==="none"&&window.Radio&&window.UI; },{timeout:90000});
}
const ev=(page,f,...a)=>page.evaluate(f,...a);
const etatR=page=>ev(page,()=>({etat:Radio.etat,ouvert:Radio.ouvert,courant:Radio.courant&&Radio.courant.nom,humeur:Radio.humeur,vue:Radio.vue.length,
  t:Radio.audio.currentTime,rs:Radio.audio.readyState,muted:Radio.audio.muted,vol:Radio.audio.volume,monde:World.etatMusique}));
/* panneau réellement visible (transition CSS finie ; le rendu logiciel peut être lent) */
const visible=page=>jusqua(()=>ev(page,()=>{ const c=getComputedStyle(document.getElementById("radio")); return c.visibility==="visible"&&+c.opacity>.95; }),8000);
const toasts=page=>ev(page,()=>[...document.querySelectorAll("#toasts .toast")].map(t=>t.textContent));
/* texte visible : ni tiret cadratin ni demi-cadratin */
const tirets=page=>ev(page,()=>{ const t=(document.getElementById("radio").innerText||"")+(document.getElementById("radioPill").innerText||"")+(document.getElementById("toasts").innerText||"");
  return /[\u2013\u2014]/.test(t)?t.match(/.{0,30}[\u2013\u2014].{0,30}/g):null; });

/* ===================================================================== */
async function solo(base){
  console.log("\n=== Solo : "+base);
  const b=await lancer("solo");
  const page=await b.newPage();
  await page.setViewport({width:1400,height:850});
  const j={console:[],page:[],api:[]};
  journaliser(page,j);
  await charger(page,base);
  await ev(page,()=>localStorage.clear());
  await charger(page,base);
  ok(j.api.length===0,"aucune requête Radio Browser avant l'ouverture du panneau",j.api);
  ok(await ev(page,()=>!!document.getElementById("tRadio")&&document.getElementById("tRadio").querySelector("svg")!==null),"bouton radio dans le bandeau");

  await page.click("#mSolo"); await sleep(400);
  await ev(page,()=>Net.action("pause",true));

  /* --- R ouvre le panneau, coups de cœur immédiats --- */
  await page.keyboard.press("r"); await sleep(300);
  let e=await etatR(page);
  ok(e.ouvert,"R ouvre le panneau radio");
  ok(e.humeur==="coeur"&&e.vue>=6,"coups de cœur affichés tout de suite ("+e.vue+")",e);
  const okCoeurs=await jusqua(async()=>(await ev(page,()=>Radio.coeurs.length))>=6&&j.api.some(u=>/byuuid/.test(u)),15000);
  ok(okCoeurs,"coups de cœur rafraîchis par l'API (byuuid)",j.api.slice(0,4));
  const coeurs=await ev(page,()=>Radio.coeurs.map(s=>({nom:s.nom,url:s.url,fav:!!s.favicon})));
  console.log("     coups de cœur : "+coeurs.map(c=>c.nom).join(", "));
  ok(coeurs.every(c=>/^https:\/\//.test(c.url)),"coups de cœur tous en https");

  /* --- chaque ambiance liste des stations --- */
  const humeurs=await ev(page,()=>Radio.HUMEURS.map(h=>h.k).filter(k=>k!=="coeur"&&k!=="favs"));
  const bilan={};
  for(const k of humeurs){
    await ev(page,k=>document.querySelector('.rchip[data-k="'+k+'"]').click(),k);
    await jusqua(()=>ev(page,k=>Radio.humeur===k&&(Radio.vue.length>0||document.querySelector("#radio .rvide.on")!==null)&&!document.querySelector("#radio .rliste.attente"),k),20000);
    const r=await ev(page,()=>({n:Radio.vue.length,dom:document.querySelectorAll("#radio .rliste .rst").length,
      urls:Radio.vue.every(s=>/^https?:\/\//.test(s.url)&&!/\.m3u8?$|\.pls$/i.test(s.url)),
      noms:new Set(Radio.vue.map(s=>s.nom.toLowerCase())).size===Radio.vue.length,
      exemples:Radio.vue.slice(0,3).map(s=>s.nom+" ("+s.bitrate+")")}));
    bilan[k]=r.n;
    console.log("     "+k+" : "+r.n+" stations, ex. "+r.exemples.join(" | "));
    ok(r.dom===r.n&&r.urls&&r.noms,k+" : liste cohérente (DOM, flux, sans doublon)",r);
  }
  const garnies=Object.values(bilan).filter(n=>n>=5).length;
  ok(garnies>=humeurs.length-1,"les ambiances trouvent des stations ("+garnies+"/"+humeurs.length+" avec 5 ou plus)",bilan);
  const nApi=j.api.length;
  await ev(page,()=>document.querySelector('.rchip[data-k="jazz"]').click()); await sleep(600);
  ok(j.api.length===nApi,"ambiance déjà vue : servie par le cache, pas de requête");
  ok(j.api.length<=30,"volume de requêtes modeste ("+j.api.length+")");

  /* --- lecture d'un coup de cœur --- */
  await ev(page,()=>document.querySelector('.rchip[data-k="coeur"]').click()); await sleep(300);
  /* stations de test : Radio Nova et FIP (SomaFM refuse les navigateurs headless, 403) */
  const iGs=await ev(page,()=>Radio.vue.findIndex(s=>/Radio Nova/.test(s.nom)));
  ok(iGs>=0,"Radio Nova dans les coups de cœur");
  await ev(page,i=>document.querySelectorAll("#radio .rliste .rst")[i].click(),Math.max(0,iGs));
  const lance=await jusqua(()=>ev(page,()=>Radio.etat==="lecture"),25000);
  e=await etatR(page);
  ok(lance,"la station joue (état « lecture »)",e);
  const t0=e.t;
  await jusqua(async()=>(await etatR(page)).t>t0+1.5,12000);
  e=await etatR(page);
  ok(e.rs>=2,"audio readyState >= 2 ("+e.rs+")");
  ok(e.t>t0+1,"currentTime avance ("+t0.toFixed(2)+" -> "+e.t.toFixed(2)+" s)");
  ok(e.monde.on&&e.monde.vitesse>.5,"World.musique activé : la scène bat la mesure",e.monde);
  ok(await ev(page,()=>document.querySelector("#radio .rst.on.joue")!==null&&!document.querySelector("#radio .rnow .eq").classList.contains("stop")),"ligne en cours + égaliseur animé");
  ok(await ev(page,()=>document.querySelector("#tRadio").classList.contains("joue")),"témoin de lecture sur le bouton du bandeau");
  await page.screenshot({path:path.join(__dirname,"screens","radio-01-panneau.png")}).catch(()=>{});

  /* --- R referme, pastille « en cours » --- */
  await page.keyboard.press("r"); await sleep(400);
  e=await etatR(page);
  ok(!e.ouvert&&await ev(page,()=>document.getElementById("radioPill").classList.contains("on")),"R referme ; pastille « en cours » visible");
  await page.screenshot({path:path.join(__dirname,"screens","radio-02-pastille.png")}).catch(()=>{});

  /* --- bouton son du jeu : coupe aussi la radio, les sons du jeu restent gérés par UI --- */
  await page.click("#tSon"); await sleep(700);
  e=await etatR(page);
  ok(e.muted&&!e.monde.on,"son du jeu coupé : radio muette, scène calme",e);
  await page.click("#tSon"); await sleep(700);
  e=await etatR(page);
  ok(!e.muted&&e.monde.on,"son rétabli : la radio revient");
  ok(await ev(page,()=>UI.prefs.son===true&&typeof UI.bip==="function"),"sons du jeu toujours actifs");

  /* --- bascule en saisie : R ignoré dans le champ de recherche --- */
  await page.keyboard.press("r"); await sleep(300);
  ok((await etatR(page)).ouvert,"R rouvre le panneau");
  await visible(page);
  await ev(page,()=>document.querySelector("#radio .rcherche input").focus());
  await page.keyboard.type("jazz r");
  await sleep(200);
  ok((await etatR(page)).ouvert,"taper « r » dans la recherche ne ferme pas le panneau");
  const trouve=await jusqua(()=>ev(page,()=>Radio.humeur===""&&Radio.vue.length>0),15000);
  ok(trouve,"recherche libre : des stations trouvées ("+(await ev(page,()=>Radio.vue.length))+")");
  await ev(page,()=>document.activeElement&&document.activeElement.blur());

  /* --- bascule de station en échec : on passe à la suivante --- */
  await ev(page,()=>{ const gs=Radio.coeurs.find(s=>/Radio Nova/.test(s.nom));
    Radio.jouer({id:"bidon",nom:"Radio Bidon",url:"https://127.0.0.1:9/flux-qui-n-existe-pas.mp3",tags:[],pays:"",codec:"MP3",bitrate:128},
      [{id:"bidon",nom:"Radio Bidon",url:"https://127.0.0.1:9/flux-qui-n-existe-pas.mp3",tags:[],pays:"",codec:"MP3",bitrate:128},gs],0); });
  const bascule=await jusqua(async()=>{ const s=await etatR(page); return s.courant&&/Radio Nova/.test(s.courant)&&s.etat==="lecture"; },30000);
  const ts=await toasts(page);
  ok(ts.some(t=>/Station muette, on passe à la suivante/.test(t)),"toast « Station muette, on passe à la suivante »",ts);
  ok(bascule,"flux mort : bascule automatique vers la station suivante, qui joue",await etatR(page));

  /* --- tout en échec : silence radio, pas de boucle infinie --- */
  await ev(page,()=>Radio.jouer({id:"b1",nom:"Mort Un",url:"https://127.0.0.1:9/a.mp3"},[{id:"b1",nom:"Mort Un",url:"https://127.0.0.1:9/a.mp3"},{id:"b2",nom:"Mort Deux",url:"https://127.0.0.1:9/b.mp3"}],0));
  ok(await jusqua(()=>ev(page,()=>Radio.etat==="erreur"),25000),"toutes les stations muettes : arrêt propre (état erreur)");

  /* --- favoris + volume + dernière station, persistants --- */
  await ev(page,()=>{ const gs=Radio.coeurs.find(s=>/Radio Nova/.test(s.nom)); Radio.jouer(gs,Radio.coeurs); });
  await jusqua(()=>ev(page,()=>Radio.etat==="lecture"),25000);
  await visible(page);
  await page.click('#radio [data-radio="fav"]'); await sleep(200);
  ok(await ev(page,()=>Radio.prefs.favs.length===1&&document.querySelector('#radio [data-radio="fav"]').classList.contains("on")),"étoile : station en favori");
  await ev(page,()=>{ const v=document.querySelector("#radio .rvol input"); v.value="37"; v.dispatchEvent(new Event("input",{bubbles:true})); v.dispatchEvent(new Event("change",{bubbles:true})); });
  ok(Math.abs((await etatR(page)).vol-.37)<.01,"curseur de volume appliqué");
  await charger(page,base);
  const apres=await ev(page,()=>({favs:Radio.prefs.favs.map(f=>f.nom),vol:Radio.prefs.vol,dernier:Radio.courant&&Radio.courant.nom,etat:Radio.etat,
    lu:document.querySelector("#radio .rvol input").value}));
  ok(apres.favs.length===1&&/Radio Nova/.test(apres.favs[0]),"favori conservé après rechargement",apres);
  ok(Math.abs(apres.vol-.37)<.01&&apres.lu==="37","volume conservé après rechargement",apres);
  ok(apres.dernier&&/Radio Nova/.test(apres.dernier)&&apres.etat==="pause","dernière station retenue, sans lecture automatique au chargement",apres);
  await page.click("#mSolo"); await sleep(500);
  await page.mouse.click(700,500); await sleep(300);
  ok(await jusqua(()=>ev(page,()=>Radio.etat==="lecture"||Radio.etat==="chargement"),5000),"reprise au premier geste en partie");
  await ev(page,()=>{ Radio.ouvrir(); document.querySelector('.rchip[data-k="favs"]').click(); });
  await sleep(300);
  ok(await ev(page,()=>Radio.vue.length===1&&document.querySelectorAll("#radio .rliste .rst .rfav.on").length===1),"onglet Favoris : la station étoilée");
  await ev(page,()=>Radio.pause());

  /* --- Au hasard, Échap --- */
  await ev(page,()=>document.querySelector('.rchip[data-k="coeur"]').click()); await sleep(200);
  await visible(page);
  await page.click('#radio [data-radio="hasard"]'); await sleep(300);
  ok(await ev(page,()=>Radio.etat==="chargement"||Radio.etat==="lecture"),"Au hasard lance une station");
  await ev(page,()=>Radio.pause());
  await page.keyboard.press("Escape"); await sleep(250);
  ok(!(await etatR(page)).ouvert,"Échap referme le panneau");

  /* --- filtres de l'API (unitaires, dans la page) --- */
  const f=await ev(page,()=>{ const n=Radio._test.normaliser;
    const base={stationuuid:"x",name:"Test FM",url_resolved:"https://exemple.org/flux.mp3",codec:"MP3",bitrate:128,lastcheckok:1,tags:"jazz,funk",countrycode:"FR",favicon:"http://exemple.org/f.png"};
    return {ok:!!n(base),httpFav:n(base).favicon==="",m3u8:n(Object.assign({},base,{url_resolved:"https://exemple.org/l.m3u8"})),codec:n(Object.assign({},base,{codec:"UNKNOWN"})),
      casse:n(Object.assign({},base,{lastcheckok:0})),js:n(Object.assign({},base,{url_resolved:"javascript:alert(1)"})),
      html:n(Object.assign({},base,{name:"<img src=x onerror=alert(1)>Radio"})).nom}; });
  ok(f.ok&&f.httpFav&&f.m3u8===null&&f.codec===null&&f.casse===null&&f.js===null&&!/[<>]/.test(f.html),"filtres : m3u8, codec inconnu, flux cassé, javascript:, HTML nettoyé",f);
  const inj=await ev(page,()=>{ Radio.recu({de:"<b>Pirate</b>",nom:"<img src=x onerror=window.__pwn=1>Station",url:"https://exemple.org/x.mp3",favicon:"javascript:alert(1)"});
    return {pwn:!!window.__pwn,img:document.querySelectorAll("#toasts img").length}; });
  ok(!inj.pwn&&inj.img===0,"données reçues affichées en texte, jamais en HTML");
  ok((await tirets(page))===null,"aucun tiret long dans les textes de la radio");

  const durs=j.console.filter(s=>!/Failed to load resource|net::ERR_|ERR_CONNECTION_REFUSED|favicon/i.test(s));
  console.log("     erreurs console (dont ressources tierces ignorées) : "+j.console.length+(j.console.length?" | "+j.console.slice(0,4).join(" | "):""));
  ok(j.page.length===0,"aucune exception de page",j.page.slice(0,4));
  ok(durs.length===0,"aucune erreur console (hors ressources tierces)",durs.slice(0,4));
  await b.close();
}

/* ===================================================================== */
async function coop(base){
  console.log("\n=== Coop (PeerJS public) : "+base);
  const bH=await lancer("hote"), bC=await lancer("client");
  const H=await bH.newPage(), C=await bC.newPage();
  const jH={console:[],page:[],api:[]}, jC={console:[],page:[],api:[]};
  journaliser(H,jH); journaliser(C,jC);
  await H.setViewport({width:1200,height:760}); await C.setViewport({width:1200,height:760});
  await charger(H,base); await charger(C,base);
  for(const p of [H,C]) await ev(p,()=>{ World.rendu=function(){}; });   /* rendu logiciel coûteux : la logique tourne quand même */
  const libs=await jusqua(async()=>(await ev(H,()=>Net.etatLib()))==="ok"&&(await ev(C,()=>Net.etatLib()))==="ok",30000);
  if(!libs){ ok(false,"PeerJS indisponible (internet ?) : coop non testée"); await bH.close(); await bC.close(); return; }
  await ev(H,()=>{ const i=document.getElementById("mNom"); i.value="Hôtesse"; i.dispatchEvent(new Event("change")); document.getElementById("mHeberger").click(); });
  ok(await jusqua(()=>ev(H,()=>Net.mode==="hote"),30000),"partie créée");
  const code=await ev(H,()=>Net.code);
  await ev(H,()=>UI.fermerModal());
  await ev(C,c=>{ const i=document.getElementById("mNom"); i.value="Client"; i.dispatchEvent(new Event("change"));
    const m=document.getElementById("mCode"); m.value=c; m.dispatchEvent(new Event("input")); document.getElementById("mRejoindre").click(); },code);
  ok(await jusqua(()=>ev(C,()=>Net.mode==="client"),40000),"client connecté");
  await sleep(800);

  /* l'hôte met une station et la partage */
  await ev(H,()=>{ Radio.ouvrir(); const gs=Radio.coeurs.find(s=>/Radio Nova/.test(s.nom)); Radio.jouer(gs,Radio.coeurs); });
  await sleep(500);
  ok(await ev(H,()=>{ const b=document.querySelector('#radio [data-radio="partager"]'); return b&&b.style.display!=="none"&&!b.disabled; }),"bouton « Partager au studio » visible en coop");
  await ev(H,()=>document.querySelector('#radio [data-radio="partager"]').click());
  const recuC=await jusqua(async()=>(await toasts(C)).some(t=>/Hôtesse met Radio Nova/.test(t)&&/Écouter aussi/.test(t)),15000);
  ok(recuC,"le client reçoit « Hôtesse met Radio Nova » avec « Écouter aussi »",await toasts(C));
  ok(await ev(C,()=>Radio.etat!=="lecture"&&Radio.etat!=="chargement"),"pas de lecture automatique chez le client");
  await ev(C,()=>{ const b=[...document.querySelectorAll("#toasts .tact")].find(x=>/Écouter aussi/.test(x.textContent)); if(b) b.click(); });
  ok(await jusqua(()=>ev(C,()=>(Radio.etat==="lecture"||Radio.etat==="chargement")&&/Radio Nova/.test(Radio.courant.nom)),15000),"« Écouter aussi » lance la station chez le client");

  /* le client partage vers l'hôte (relayé et nettoyé par l'hôte) */
  await ev(C,()=>{ Radio.ouvrir(); const s=Radio.coeurs.find(s=>/^FIP$/.test(s.nom)); Radio.jouer(s,Radio.coeurs); });
  await sleep(400);
  await ev(C,()=>document.querySelector('#radio [data-radio="partager"]').click());
  ok(await jusqua(async()=>(await toasts(H)).some(t=>/Client met FIP/.test(t)),15000),"l'hôte reçoit le partage du client",await toasts(H));
  const anti=await ev(C,()=>Net.partagerRadio({nom:"Spam",url:"https://exemple.org/x.mp3"}));
  ok(anti&&anti.ok===false,"partages en rafale limités",anti);
  const net=await ev(H,()=>({http:Net.nettoieRadio({nom:"x",url:"http://exemple.org/a.mp3"}),js:Net.nettoieRadio({nom:"x",url:"javascript:alert(1)"}),
    long:Net.nettoieRadio({nom:"x",url:"https://exemple.org/"+"a".repeat(600)}),vide:Net.nettoieRadio({nom:"",url:"https://exemple.org/a.mp3"}),
    nom:Net.nettoieRadio({nom:"<b>"+"N".repeat(200),url:"https://exemple.org/a.mp3",favicon:"http://x/y.png"})}));
  ok(net.http===null&&net.js===null&&net.long===null&&net.vide===null&&net.nom&&net.nom.nom.length<=80&&!/[<>]/.test(net.nom.nom)&&net.nom.favicon==="",
    "l'hôte valide les messages radio (https seulement, longueurs bornées)",net);
  ok(await ev(H,()=>{ const o=JSON.parse(snapshot()); return !JSON.stringify(o).includes("Radio Nova")&&!("radio" in o.s); }),"la radio n'entre pas dans l'instantané de la sim");

  for(const p of [H,C]) await ev(p,()=>Radio.arreter());
  for(const [n,jj] of [["hôte",jH],["client",jC]]){
    const durs=jj.console.filter(s=>!/Failed to load resource|net::ERR_|favicon|PeerJS|WebRTC|ICE/i.test(s));
    ok(jj.page.length===0&&durs.length===0,n+" : ni exception ni erreur console",{page:jj.page.slice(0,3),console:durs.slice(0,3)});
  }
  await bH.close(); await bC.close();
}

(async()=>{
  const garde=setTimeout(async()=>{ console.log("KO  délai global dépassé"); for(const b of navs){ try{ await b.close(); }catch(e){} } process.exit(2); },12*60*1000);
  fs.mkdirSync(path.join(__dirname,"screens"),{recursive:true});
  const srv=await serveur();
  const base="http://127.0.0.1:"+srv.address().port+"/index.html";
  try{
    try{ await solo(base); }catch(e){ ok(false,"exception solo : "+(e&&e.stack||e)); }
    if(!SOLO_SEUL){ try{ await coop(base); }catch(e){ ok(false,"exception coop : "+(e&&e.stack||e)); } }
  }finally{
    for(const b of navs){ try{ await b.close(); }catch(e){} }
    srv.close(); clearTimeout(garde);
  }
  console.log("\n"+oks+" ok, "+echecs+" KO");
  console.log(echecs?"ÉCHEC":"TOUT EST VERT");
  process.exit(echecs?1:0);
})();
