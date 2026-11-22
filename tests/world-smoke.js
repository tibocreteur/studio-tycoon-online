/* Test headless de world.js : three.js r128 + sim.js réels, rendu WebGL simulé.
   Lancer : node tests/world-smoke.js */
"use strict";
const fs=require("fs"), path=require("path"), vm=require("vm");
const racine=path.join(__dirname,"..");

/* contexte 2D factice : toutes les méthodes existent et ne font rien */
function ctx2d(){
  const grad={addColorStop(){}};
  const base={measureText:t=>({width:String(t).length*7}),createLinearGradient:()=>grad,
    createRadialGradient:()=>grad,getImageData:()=>({data:new Uint8ClampedArray(4)}),setLineDash(){}};
  return new Proxy(base,{get:(o,k)=>k in o?o[k]:(typeof k==="string"?function(){}:undefined),set:(o,k,v)=>{o[k]=v;return true;}});
}
const document={createElement:t=>({tagName:t,width:0,height:0,style:{},getContext:()=>ctx2d(),addEventListener(){}}),
  getElementById:()=>null,querySelectorAll:()=>[]};
const ctx={console,document,devicePixelRatio:2,performance:{now:()=>Date.now()},setTimeout,clearTimeout,Math,Date};
ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
const charger=f=>vm.runInContext(fs.readFileSync(path.join(racine,f),"utf8"),ctx,{filename:f});
charger("three.min.js");
/* renderer sans WebGL */
vm.runInContext(`THREE.WebGLRenderer=function(){ this.domElement={clientWidth:1600,clientHeight:900,style:{},
  getBoundingClientRect(){return {left:0,top:0,width:1600,height:900}}};
  this.shadowMap={}; this.info={render:{calls:0,triangles:0}}; this.pr=1; };
  THREE.WebGLRenderer.prototype.setPixelRatio=function(p){this.pr=p}; THREE.WebGLRenderer.prototype.setSize=function(){};
  THREE.WebGLRenderer.prototype.render=function(){};`,ctx);
charger("sim.js");
charger("world.js");

const r=(code)=>vm.runInContext(code,ctx);
let erreurs=0;
const ok=(cond,msg)=>{ if(!cond){ erreurs++; console.log("ÉCHEC : "+msg); } else console.log("ok : "+msg); };

ok(r("typeof window.World==='object' && World===window.World"),"World visible sur window");
r(`World.init({clientWidth:1600,clientHeight:900,appendChild(){}}); newGame(1,{hote:{nom:"Hôte",couleur:"#ff7a5c"}});`);
ok(r("World.renderer.pr")<=1.5,"pixelRatio plafonné ("+r("World.renderer.pr").toFixed(2)+")");

function compter(){
  return r(`(()=>{ let dessins=0, ombres=0, invis=0;
    World.rendu();
    World.scene.traverseVisible(o=>{
      if(o.isMesh||o.isPoints||o.isSprite){
        if(o.isInstancedMesh&&o.count===0) return;
        dessins++; if(o.castShadow&&o.isMesh) ombres++;
      }
    });
    return {dessins,ombres}; })()`);
}
function nanDansScene(){
  return r(`(()=>{ let n=0; World.scene.traverse(o=>{ const p=o.position; if(!isFinite(p.x+p.y+p.z)) n++; }); return n; })()`);
}
function boucle(n,dt){ r(`for(let i=0;i<${n};i++){ step(${dt}/7.5); World.update(${dt},${dt}); }`); }

for(let niv=0;niv<5;niv++){
  r(`S.up.bureau=${niv}; S.up.materiel=${niv}; S.up.logiciel=${Math.min(4,niv+1)}; S.up.cafe=${niv}; S.up.prestige=${niv};
     while(S.equipe.length<UPS.bureau.cap[${niv}]) S.equipe.push(nouveauDesigner(${niv},false));
     attribuerPostes();
     /* quelques projets en cours */
     S.equipe.forEach((d,i)=>{ if(i%2===0&&!d.proj){ const t=TYPES[i%TYPES.length];
       const p={id:9000+i+${niv}*100,type:t,client:"Test",avance:10*i,charge:t.charge,qSum:60,qPts:1,qBonus:0,equipe:[d.id],deadline:S.jour+9};
       S.projets.push(p); d.proj=p.id; } else if(i%3===1){ d.energie=40; } });
     for(let k=0;k<${niv*4};k++) S.palmares.push({t:"Logo",c:"X",q:85+k,j:1,m:100});
     World.construire();`);
  boucle(120,1/60);
  const c=compter();
  ok(nanDansScene()===0,"niveau "+niv+" : aucune position NaN");
  console.log("   niveau "+niv+" ("+r("World.nomSalle")+") : ~"+c.dessins+" dessins + "+c.ombres+" dans la passe d'ombre, "+r("S.equipe.length")+" designers, "+r("World.infos().ecrans")+" écrans");
  ok(c.dessins+c.ombres<250,"niveau "+niv+" sous 250 appels (rendu + ombres)");
}

/* pas de reconstruction inutile */
const avant=r(`World.scene.children.length+":"+(()=>{let s=0;World.scene.traverse(o=>{if(o.isMesh)s+=o.id});return s})()`);
r("World.construire(); World.construire(); markWorld && markWorld(); World.construire();");
const apres=r(`World.scene.children.length+":"+(()=>{let s=0;World.scene.traverse(o=>{if(o.isMesh)s+=o.id});return s})()`);
ok(avant===apres,"construire() sans changement ne reconstruit rien");

/* une amélioration entre deux niveaux de bureau apparaît */
const nbAvant=r("(()=>{let n=0;World.scene.traverse(o=>{if(o.isMesh)n++});return n})()");
r("S.up.logiciel=2; World.construire();");
const nbApres=r("(()=>{let n=0;World.scene.traverse(o=>{if(o.isMesh)n++});return n})()");
ok(nbAvant!==nbApres,"changement de licences : les postes sont refaits ("+nbAvant+" -> "+nbApres+" maillages)");

/* licenciement : le personnage est retiré */
const n0=r("World.infos().persos");
r("S.equipe.pop(); World.construire();");
ok(r("World.infos().persos")===n0-1,"licenciement : personnage retiré");

/* avatars */
r(`World.idAvatarLocal="hote";
   World.majAvatars([{id:"hote",nom:"Tibo",couleur:"#ff7a5c",x:1,z:1,cap:0,mode:"idle"},{id:"p2",nom:"Amie",couleur:"hsl(200 60% 50%)",x:-2,z:0,mode:"marche"}]);`);
boucle(30,1/60);
ok(r("World.infos().avatars")===2,"deux avatars créés");
r(`World.majAvatars([{id:"hote",nom:"Tibo",couleur:"#ff7a5c",x:2,z:1,cap:1,mode:"marche"}]);`);
boucle(10,1/60);
ok(r("World.infos().avatars")===1,"avatar parti : supprimé");
const b=r("JSON.stringify(World.bornes())"); console.log("   bornes "+b);
const s=r(`(()=>{ const c=World.camera; c.position.set(14,12,14); c.lookAt(0,0,0); c.updateMatrixWorld(); return JSON.stringify(World.solA(800,450)); })()`);
ok(s!=="null","solA au centre de l'écran -> "+s);
ok(r("World.solA(-5000,-5000)")===null,"solA hors pièce -> null");
const v=r("World.viser(0,0)"); console.log("   viser(0,0) -> "+v);
r("World.surligner(S.equipe[0].id); World.surligner(null); World.celebrer(); World.celebrer({ok:false});");
boucle(240,1/30);
ok(r("World.infos().persos")===r("S.equipe.length"),"personnages alignés sur l'équipe");
ok(typeof r("World.lumiere")==="number","lumière lissée disponible");
/* nouvelle partie : retour au petit bureau */
r("newGame(2); World.construire();"); boucle(20,1/60);
ok(r("World.dimensions().nom")==="Coin du salon","nouvelle partie : retour au coin du salon");
const c0=compter(); console.log("   niveau 0 après nouvelle partie : ~"+c0.dessins+" dessins");

/* radio du studio : poste rétro au niveau 0, platine ensuite, notes quand ça joue */
ok(r("World.etatMusique.poste")===true,"niveau 0 : poste de radio présent");
r("World.musique(true)"); boucle(90,1/60);
console.log("   musique : "+r("JSON.stringify(World.etatMusique)"));
ok(r("World.etatMusique.on&&World.etatMusique.notes&&World.etatMusique.vitesse>1"),"World.musique(true) : notes visibles, ça tourne");
ok(nanDansScene()===0,"musique : aucune position NaN");
r("S.up.bureau=2; World.construire(); World.musique(true)"); boucle(90,1/60);
const rot0=r("World.etatMusique.rotation"); boucle(30,1/60);
ok(r("World.etatMusique.platine")&&r("World.etatMusique.rotation")!==rot0,"niveau 2 : la platine tourne pendant la musique");
r("World.musique(false)"); boucle(240,1/60);
const rot1=r("World.etatMusique.rotation"); boucle(30,1/60);
ok(!r("World.etatMusique.notes")&&r("World.etatMusique.rotation")===rot1,"World.musique(false) : platine arrêtée, notes parties");
console.log(erreurs?("\n"+erreurs+" échec(s)"):"\nTout est bon.");
process.exit(erreurs?1:0);
