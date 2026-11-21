/* ===================================================================
   MONDE 3D : la salle, les postes, les collaborateurs, la lumière.
   Direction artistique : studio de design douillet, low-poly stylisé.
   Tout est procédural (aucun modèle externe), three.js r128.

   Principes de performance :
   - les pièces statiques sont fusionnées par lots (couleurs par sommet),
     un lot = un appel de dessin ;
   - chaque partie de la scène n'est reconstruite que si sa clé change
     (salle, postes, décor, affiches) ;
   - les écrans ne sont redessinés que si leur contenu change, deux par image.
   =================================================================== */
var World=(function(){
"use strict";

/* ---------- palette unique ---------- */
const PAL={
  creme:"#f3e9d7", cremeFonce:"#e3d3b8", blanc:"#fbf7ef", papier:"#f6f1e7",
  miel:"#c98f52", mielClair:"#e0b47c", mielFonce:"#9c6a3a", noyer:"#6e4a31",
  sauge:"#9cb08a", saugeFonce:"#6d8a60", saugeClair:"#cbd6b6",
  terre:"#c8674a", terreFonce:"#9f4c35", terreClair:"#e3a184",
  moutarde:"#e2aa3c", moutardeClair:"#f2cf72",
  encre:"#2b3550", encreClair:"#45527a", nuitBleu:"#1a2034",
  corail:"#ff7a5c", rose:"#f2a3a0",
  gris1:"#f2efea", gris2:"#d8d4cd", gris3:"#a9a59e", gris4:"#6f6c67", gris5:"#3d3b39",
  anthracite:"#2b2b2f", noir:"#1c1c21",
  feuille:"#5d8f4c", feuilleClair:"#86b661", feuilleFonce:"#3d6838", morte:"#8a6a3a",
  socle:"#5c4130"
};
const VIVES=[PAL.terre,PAL.moutarde,PAL.sauge,PAL.encreClair,PAL.corail,PAL.saugeFonce,PAL.terreClair];

/* ---------- salles, une par niveau de bureau ---------- */
const SALLES=[
  {w:8.5, d:8.5, postes:2,  nom:"Coin du salon",
   mur:"#f1e5cf", lambris:"#dc9b7b", moulure:"#f7efe1", plinthe:"#9f4c35", cadre:"#f7f1e6",
   sol:"lames", bois:["#c8915a","#bb8551","#d39e66","#c08a55"], nf:1, lf:1.3, hf:1.3},
  {w:12,  d:10.5,postes:3,  nom:"Petit local",
   mur:"#dfe3cf", lambris:"#c98f52", moulure:"#f4eedf", plinthe:"#6e4a31", cadre:"#f7f1e6",
   sol:"lames", bois:["#b98154","#a9744a","#c48b5c","#b07b50"], nf:2, lf:1.5, hf:1.45},
  {w:16,  d:12.5,postes:5,  nom:"Open space",
   mur:"#f3eadb", lambris:"#9cb08a", moulure:"#fbf6ec", plinthe:"#6d8a60", cadre:"#fbf7ef",
   sol:"lames", bois:["#dcb886","#d0aa77","#e5c494","#d6b07e"], nf:3, lf:1.7, hf:1.6},
  {w:20,  d:14.5,postes:7,  nom:"Loft",
   mur:"#efe2cc", lambris:"#c8674a", moulure:"#f8eedc", plinthe:"#9f4c35", cadre:"#2b2b2f",
   sol:"damier", bois:["#b07a48","#a26d3f","#c08a55","#b78150"], nf:4, lf:1.9, hf:1.7},
  {w:24,  d:17,  postes:10, nom:"Étage entier",
   mur:"#f2e8d8", lambris:"#33405e", moulure:"#f9f3e8", plinthe:"#2b3550", cadre:"#2b2b2f",
   sol:"larges", bois:["#c79763","#b8895a","#d4a670","#c08f5e"], nf:5, lf:2.1, hf:1.8},
];
const HM=3.2;            /* hauteur des murs */
const EP=.2;             /* épaisseur des murs */
const SEUIL=1.0;         /* hauteur des appuis de fenêtre */

/* ---------- état ---------- */
let scene,camera,renderer,raycaster,ray2,planSol;
let racine,gSalle,gPostes,gDeco,gPersos,gAvatars,gVie;
let soleil,ciel,lampesNuit=[];
let sal=SALLES[0], niveau=0;
let murs=[];
let postes=[];                    /* {x,z,rot,grp,ecrans:[],occupant} */
let ecrans=[];                    /* liste à plat pour la mise à jour échelonnée */
let persos=new Map();             /* id designer -> perso */
let avatars=new Map();            /* id joueur -> avatar */
let confettis=[];
let chat=null, poussiere=null, platine=null;
let ombresDyn=null;
let horloge=0, tCles=0, tEcrans=0, curseurEcran=0;
let survol=null;
let jourLisse=null, nuitLisse=0;
const cles={salle:null,postes:null,deco:null,affiches:null};
const res={matSol:null,matTapis:null,atlasDeco:null,atlasAff:null,neons:[]};
let API=null;

/* ---------- hasard ---------- */
/* visuel non reproductible : celui de sim.js (repli sur Math.random) */
function vr(a,b){ return typeof vrnd==="function"?vrnd(a,b):a+Math.random()*(b-a); }
function vi(a,b){ return typeof vri==="function"?vri(a,b):Math.floor(a+Math.random()*(b-a+1)); }
function vp(arr){ return typeof vpick==="function"?vpick(arr):arr[Math.floor(Math.random()*arr.length)]; }
/* visuel reproductible : un générateur à graine par objet (le décor ne se rebat pas) */
function alea(seed){
  let a=(seed>>>0)||1;
  return function(){
    a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function hashStr(s){ s=String(s); let h=2166136261; for(let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619); return h>>>0; }
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lisse=t=>t*t*(3-2*t);
function angleVers(a,b,k){ let d=b-a; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2; return a+d*k; }

/* ---------- couleurs ----------
   THREE.Color ne lit pas « hsl(210 56% 42%) » (syntaxe sans virgules) : on parse
   nous-mêmes. Les matériaux reçoivent des couleurs converties en linéaire. */
function srgb(c){
  const col=new THREE.Color();
  if(c===undefined||c===null) return col.setHex(0xff00ff);
  if(c.isColor) return col.copy(c);
  if(typeof c==="number") return col.setHex(c);
  const s=String(c).trim();
  const m=s.match(/^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if(m) return col.setHSL((((+m[1])%360)+360)%360/360,+m[2]/100,+m[3]/100);
  if(/^#[0-9a-f]{3,8}$/i.test(s)||/^rgb/i.test(s)) col.setStyle(s); else col.setHex(0xff00ff);
  return col;
}
const _coul=new Map();
function lin(c){                       /* couleur linéaire partagée : ne pas modifier */
  if(c&&c.isColor) return c;
  const k=String(c); let r=_coul.get(k);
  if(!r){ r=srgb(c).convertSRGBToLinear(); _coul.set(k,r); }
  return r;
}
function melange(a,b,t){ return lin(a).clone().lerp(lin(b),t); }
function nuance(c,dl){                 /* éclaircit / assombrit une couleur sRGB */
  const s=srgb(c), h={}; s.getHSL(h); s.setHSL(h.h,h.s,clamp(h.l+dl,0,1));
  return s.convertSRGBToLinear();
}

/* ---------- matériaux partagés ---------- */
const MATS={};
function partage(m){ m.userData.partage=true; return m; }
function initMats(){
  const std=o=>partage(new THREE.MeshStandardMaterial(o));
  const basic=o=>partage(new THREE.MeshBasicMaterial(o));
  MATS.vc=std({vertexColors:true,roughness:.8,metalness:0});
  MATS.brill=std({vertexColors:true,roughness:.34,metalness:.3});
  MATS.survol=std({vertexColors:true,roughness:.75,metalness:0,emissive:lin("#6b4a12")});
  MATS.lueur=basic({vertexColors:true,toneMapped:false});
  MATS.nuit=basic({vertexColors:true,toneMapped:false});
  MATS.vitre=basic({color:lin("#cfe4ee"),toneMapped:false});
  MATS.halo=basic({map:texRadial(),vertexColors:true,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,toneMapped:false});
  MATS.rayons=basic({map:texDegrade(),color:lin("#ffe2b0"),transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,toneMapped:false,opacity:.3});
  MATS.ombre=basic({map:texRadial(),color:0x000000,transparent:true,depthWrite:false,opacity:.32,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  MATS.verre=std({color:lin("#bcd9e6"),transparent:true,opacity:.35,roughness:.08,metalness:.1,depthWrite:false});
}

/* ---------- géométries mises en cache (modèles pour la fusion) ---------- */
const GEO=new Map();
function gc(k,f){ let g=GEO.get(k); if(!g){ g=f(); g.userData.partage=true; GEO.set(k,g); } return g; }
const G={
  box:(w,h,d)=>gc("b"+w+","+h+","+d,()=>new THREE.BoxGeometry(w,h,d)),
  rb:(w,h,d,r,s)=>gc("r"+w+","+h+","+d+","+r+","+(s||2),()=>boiteArrondie(w,h,d,r,s||2)),
  cyl:(rt,rb,h,s,ouvert)=>gc("c"+rt+","+rb+","+h+","+(s||14)+(ouvert?"o":""),
        ()=>new THREE.CylinderGeometry(rt,rb,h,s||14,1,!!ouvert)),
  sph:(r,ws,hs)=>gc("s"+r+","+(ws||14)+","+(hs||10),()=>new THREE.SphereGeometry(r,ws||14,hs||10)),
  calotte:(r,f,ws,hs)=>gc("k"+r+","+f+","+(ws||18),()=>new THREE.SphereGeometry(r,ws||18,hs||10,0,Math.PI*2,0,Math.PI*f)),
  caps:(r,l,s)=>gc("p"+r+","+l+","+(s||12),()=>capsule(r,l,s||12)),
  plan:(w,h)=>gc("q"+w+","+h,()=>new THREE.PlaneGeometry(w,h)),
  cone:(r,h,s)=>gc("n"+r+","+h+","+(s||12),()=>new THREE.ConeGeometry(r,h,s||12)),
  tore:(R,r,arc,rs,ts)=>gc("t"+R+","+r+","+(arc||7)+","+(rs||8)+","+(ts||16),
        ()=>new THREE.TorusGeometry(R,r,rs||8,ts||16,arc||Math.PI*2)),
  tour:(k,pts,s)=>gc("l"+k,()=>new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),s||16)),
  disque:(r,s)=>gc("d"+r+","+(s||24),()=>new THREE.CircleGeometry(r,s||24)),
};
/* boîte arrondie : portage de RoundedBoxGeometry (jsm), absente de r128 */
function boiteArrondie(w,h,d,r,seg){
  seg=seg*2+1; r=Math.min(w/2,h/2,d/2,r);
  const g=new THREE.BoxGeometry(1,1,1,seg,seg,seg);
  const P=g.attributes.position.array, N=g.attributes.normal.array;
  const hs=.5/seg, bx=w/2-r, by=h/2-r, bz=d/2-r, n=new THREE.Vector3();
  for(let i=0;i<P.length;i+=3){
    const x=P[i],y=P[i+1],z=P[i+2], sx=Math.sign(x),sy=Math.sign(y),sz=Math.sign(z);
    n.set(x-sx*hs,y-sy*hs,z-sz*hs).normalize();
    P[i]=bx*sx+n.x*r; P[i+1]=by*sy+n.y*r; P[i+2]=bz*sz+n.z*r;
    N[i]=n.x; N[i+1]=n.y; N[i+2]=n.z;
  }
  g.computeBoundingSphere();
  return g;
}
/* gélule : tour de révolution (CapsuleGeometry n'existe pas en r128) */
function capsule(r,l,s){
  const pts=[], n=6;
  for(let i=0;i<=n;i++){ const a=-Math.PI/2+i/n*Math.PI/2; pts.push(new THREE.Vector2(Math.max(1e-4,r*Math.cos(a)),-l/2+r*Math.sin(a))); }
  for(let i=0;i<=n;i++){ const a=i/n*Math.PI/2; pts.push(new THREE.Vector2(Math.max(1e-4,r*Math.cos(a)),l/2+r*Math.sin(a))); }
  return new THREE.LatheGeometry(pts,s);
}

/* =====================================================================
   CHANTIER : fusion de pièces en lots (un lot = un matériau = un dessin)
   Les couleurs passent en attribut de sommet, déjà linéaires.
   ===================================================================== */
const _m4=new THREE.Matrix4(), _m4b=new THREE.Matrix4(), _n3=new THREE.Matrix3();
const _q=new THREE.Quaternion(), _e=new THREE.Euler(), _v=new THREE.Vector3(), _s=new THREE.Vector3();
const _v2=new THREE.Vector3(), _haut=new THREE.Vector3(0,1,0);
function Chantier(){ this.m=new THREE.Matrix4(); this.pile=[]; this.lots={}; }
Chantier.prototype.push=function(x,y,z,ry,rx,rz,s){
  this.pile.push(this.m.clone());
  _e.set(rx||0,ry||0,rz||0); _q.setFromEuler(_e); _v.set(x||0,y||0,z||0); const k=s||1; _s.set(k,k,k);
  _m4.compose(_v,_q,_s); this.m.multiply(_m4); return this;
};
Chantier.prototype.pop=function(){ this.m=this.pile.pop(); return this; };
Chantier.prototype.lot=function(n){ return this.lots[n]||(this.lots[n]={p:[],n:[],c:[],u:[]}); };
/* add(lot, géométrie, couleur, x,y,z, rot, échelle, uvRect)
   rot : nombre (lacet) ou [rx,ry,rz] ; échelle : nombre ou [sx,sy,sz] ;
   couleur : chaîne, THREE.Color linéaire, ou fonction (x,y,z locaux) -> Color */
Chantier.prototype.add=function(nom,geo,coul,x,y,z,rot,sc,uvr){
  let rx=0,ry=0,rz=0; if(typeof rot==="number")ry=rot; else if(rot){rx=rot[0];ry=rot[1];rz=rot[2];}
  let sx=1,sy=1,sz=1; if(typeof sc==="number"){sx=sy=sz=sc;} else if(sc){sx=sc[0];sy=sc[1];sz=sc[2];}
  if(typeof coul==="string") coul=lin(coul);
  _e.set(rx,ry,rz); _q.setFromEuler(_e); _v.set(x||0,y||0,z||0); _s.set(sx,sy,sz);
  _m4.compose(_v,_q,_s); _m4b.multiplyMatrices(this.m,_m4); _n3.getNormalMatrix(_m4b);
  const L=this.lot(nom), P=geo.attributes.position, N=geo.attributes.normal, U=geo.attributes.uv, I=geo.index;
  const cnt=I?I.count:P.count, fn=typeof coul==="function", me=_m4b.elements, ne=_n3.elements;
  for(let k=0;k<cnt;k++){
    const i=I?I.getX(k):k;
    const px=P.getX(i),py=P.getY(i),pz=P.getZ(i);
    L.p.push(me[0]*px+me[4]*py+me[8]*pz+me[12], me[1]*px+me[5]*py+me[9]*pz+me[13], me[2]*px+me[6]*py+me[10]*pz+me[14]);
    const nx=N.getX(i),ny=N.getY(i),nz=N.getZ(i);
    const ox=ne[0]*nx+ne[3]*ny+ne[6]*nz, oy=ne[1]*nx+ne[4]*ny+ne[7]*nz, oz=ne[2]*nx+ne[5]*ny+ne[8]*nz;
    const l=Math.hypot(ox,oy,oz)||1; L.n.push(ox/l,oy/l,oz/l);
    const c=fn?coul(px,py,pz):coul; L.c.push(c.r,c.g,c.b);
    if(U){ let u=U.getX(i),v=U.getY(i); if(uvr){u=uvr[0]+u*(uvr[2]-uvr[0]); v=uvr[1]+v*(uvr[3]-uvr[1]);} L.u.push(u,v); }
    else L.u.push(0,0);
  }
  return this;
};
/* raccourcis */
Chantier.prototype.bx=function(n,w,h,d,c,x,y,z,rot){ return this.add(n,G.box(w,h,d),c,x,y,z,rot); };
Chantier.prototype.rb=function(n,w,h,d,r,c,x,y,z,rot,seg){ return this.add(n,G.rb(w,h,d,r,seg),c,x,y,z,rot); };
Chantier.prototype.cy=function(n,rt,rb,h,c,x,y,z,rot,seg){ return this.add(n,G.cyl(rt,rb,h,seg),c,x,y,z,rot); };
Chantier.prototype.sp=function(n,r,c,x,y,z,sc,seg){ return this.add(n,G.sph(r,seg||12,seg?Math.max(6,seg-4):9),c,x,y,z,0,sc); };
/* tige entre deux points */
Chantier.prototype.tige=function(n,x1,y1,z1,x2,y2,z2,r,c,seg){
  _v2.set(x2-x1,y2-y1,z2-z1); const l=_v2.length(); _v2.divideScalar(l||1);
  _q.setFromUnitVectors(_haut,_v2); _e.setFromQuaternion(_q);
  return this.add(n,G.cyl(r,r,1,seg||8),c,(x1+x2)/2,(y1+y2)/2,(z1+z2)/2,[_e.x,_e.y,_e.z],[1,l,1]);
};
/* ombre de contact (tache douce au sol) et halo de lumière */
Chantier.prototype.ombre=function(x,z,sx,sz,y){ return this.add("ombre",G.plan(1,1),"#ffffff",x,y||.012,z,[-Math.PI/2,0,0],[sx,sz||sx,1]); };
Chantier.prototype.halo=function(x,y,z,sx,sz,c){ return this.add("halo",G.plan(1,1),c||"#ffc98a",x,y,z,[-Math.PI/2,0,0],[sx,sz||sx,1]); };
/* quadrilatère texturé d'atlas, face +Z locale */
Chantier.prototype.quad=function(n,w,h,x,y,z,rot,uvr,c){ return this.add(n,G.plan(1,1),c||"#ffffff",x,y,z,rot,[w,h,1],uvr); };
Chantier.prototype.geo=function(nom){
  const L=this.lots[nom]; if(!L||!L.p.length) return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(L.p,3));
  g.setAttribute("normal",new THREE.Float32BufferAttribute(L.n,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(L.c,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(L.u,2));
  g.computeBoundingSphere();
  return g;
};
const OMBRE_PORTEE={vc:1,brill:1};
Chantier.prototype.fin=function(parent,opts){
  opts=opts||{}; const out={};
  for(const nom in this.lots){
    const g=this.geo(nom); if(!g) continue;
    const mat=(opts.mats&&opts.mats[nom])||MATS[nom];
    const me=new THREE.Mesh(g,mat);
    me.castShadow=!!OMBRE_PORTEE[nom]&&!opts.sansOmbre;
    me.receiveShadow=!!OMBRE_PORTEE[nom];
    if(nom==="ombre") me.renderOrder=1;
    if(nom==="halo"||nom==="rayons") me.renderOrder=2;
    me.matrixAutoUpdate=false; me.updateMatrix();
    parent.add(me); out[nom]=me;
  }
  return out;
};
/* un seul maillage (pièces de personnage) */
function piece(fn,mat){
  const C=new Chantier(); fn(C);
  const g=C.geo("vc"); const m=new THREE.Mesh(g||new THREE.BufferGeometry(),mat||MATS.vc);
  return m;
}

/* nettoyage : les ressources partagées (cache) sont épargnées */
function libererObjet(o){
  o.traverse(x=>{
    if(x.geometry&&!x.geometry.userData.partage) x.geometry.dispose();
    const ms=x.material?(Array.isArray(x.material)?x.material:[x.material]):[];
    ms.forEach(m=>{ if(m.userData&&m.userData.partage)return; if(m.map&&!m.map.partagee)m.map.dispose(); m.dispose(); });
  });
}
function vider(g){ while(g.children.length){ const c=g.children[g.children.length-1]; g.remove(c); libererObjet(c); } }

/* ---------- textures canvas ---------- */
function toile(w,h){ const c=document.createElement("canvas"); c.width=w; c.height=h; return c; }
function texDe(cv,partagee){
  const t=new THREE.CanvasTexture(cv);
  t.encoding=THREE.sRGBEncoding; t.anisotropy=4;
  if(partagee) t.partagee=true;
  return t;
}
let _texRadial=null,_texDegrade=null;
function texRadial(){
  if(_texRadial) return _texRadial;
  const cv=toile(128,128), c=cv.getContext("2d");
  const g=c.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,"rgba(255,255,255,1)"); g.addColorStop(.45,"rgba(255,255,255,.55)"); g.addColorStop(1,"rgba(255,255,255,0)");
  c.fillStyle=g; c.fillRect(0,0,128,128);
  return (_texRadial=texDe(cv,true));
}
function texDegrade(){
  if(_texDegrade) return _texDegrade;
  const cv=toile(64,128), c=cv.getContext("2d");
  const g=c.createLinearGradient(0,0,0,128);
  g.addColorStop(0,"rgba(255,255,255,0)"); g.addColorStop(.25,"rgba(255,255,255,.7)"); g.addColorStop(1,"rgba(255,255,255,0)");
  c.fillStyle=g; c.fillRect(0,0,64,128);
  /* bords latéraux adoucis */
  const g2=c.createLinearGradient(0,0,64,0);
  g2.addColorStop(0,"rgba(0,0,0,1)"); g2.addColorStop(.15,"rgba(0,0,0,0)"); g2.addColorStop(.85,"rgba(0,0,0,0)"); g2.addColorStop(1,"rgba(0,0,0,1)");
  c.globalCompositeOperation="destination-out"; c.fillStyle=g2; c.fillRect(0,0,64,128);
  return (_texDegrade=texDe(cv,true));
}
/* parquet : lames classiques, lames larges ou damier (point de Hongrie simplifié) */
function texSol(s,graine){
  const N=1024, cv=toile(N,N), c=cv.getContext("2d"), R=alea(graine);
  const base=s.bois;
  const lame=(x,y,w,h,vert)=>{
    const col=srgb(base[Math.floor(R()*base.length)]); const hsl={}; col.getHSL(hsl);
    col.setHSL(hsl.h,hsl.s*(0.9+R()*.2),clamp(hsl.l+(R()-.5)*.06,0,1));
    c.fillStyle="#"+col.getHexString(); c.fillRect(x,y,w,h);
    /* veinage */
    c.strokeStyle="rgba(70,40,20,.10)"; c.lineWidth=1.2;
    for(let k=0;k<4;k++){ c.beginPath();
      if(vert){ const xx=x+w*(.15+R()*.7); c.moveTo(xx,y); c.bezierCurveTo(xx+R()*6-3,y+h*.3,xx+R()*6-3,y+h*.7,xx+R()*4-2,y+h); }
      else    { const yy=y+h*(.15+R()*.7); c.moveTo(x,yy); c.bezierCurveTo(x+w*.3,yy+R()*6-3,x+w*.7,yy+R()*6-3,x+w,yy+R()*4-2); }
      c.stroke(); }
    /* joint */
    c.strokeStyle="rgba(50,28,14,.45)"; c.lineWidth=2; c.strokeRect(x+1,y+1,w-2,h-2);
    /* léger reflet sur un bord */
    c.fillStyle="rgba(255,240,215,.08)"; if(vert) c.fillRect(x+2,y,3,h); else c.fillRect(x,y+2,w,3);
  };
  if(s.sol==="damier"){
    const cell=N/4, n=4;
    for(let i=0;i<4;i++) for(let j=0;j<4;j++){
      const vert=(i+j)%2===0;
      for(let k=0;k<n;k++){
        if(vert) lame(i*cell+k*cell/n,j*cell,cell/n,cell,true);
        else     lame(i*cell,j*cell+k*cell/n,cell,cell/n,false);
      }
    }
  }else{
    const rang=s.sol==="larges"?6:8, hRang=N/rang;
    for(let r=0;r<rang;r++){
      let x=-R()*N*.4;
      while(x<N){ const L=N*(.28+R()*.42); lame(x,r*hRang,L,hRang,false); x+=L; }
    }
  }
  const t=texDe(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
function texTapis(graine){
  const W=512,H=352, cv=toile(W,H), c=cv.getContext("2d"), R=alea(graine);
  c.fillStyle=PAL.creme; c.fillRect(0,0,W,H);
  c.fillStyle=PAL.terre; c.fillRect(14,14,W-28,H-28);
  c.fillStyle=PAL.creme; c.fillRect(30,30,W-60,H-60);
  c.fillStyle=PAL.encre; c.fillRect(42,42,W-84,H-84);
  /* losanges berbères */
  const cols=[PAL.moutarde,PAL.terreClair,PAL.creme,PAL.sauge];
  for(let i=0;i<6;i++) for(let j=0;j<4;j++){
    const x=70+i*(W-140)/5, y=74+j*(H-148)/3, r=20+R()*8;
    c.fillStyle=cols[(i+j)%cols.length];
    c.beginPath(); c.moveTo(x,y-r); c.lineTo(x+r,y); c.lineTo(x,y+r); c.lineTo(x-r,y); c.closePath(); c.fill();
    c.fillStyle=PAL.encre; c.beginPath(); c.moveTo(x,y-r*.4); c.lineTo(x+r*.4,y); c.lineTo(x,y+r*.4); c.lineTo(x-r*.4,y); c.closePath(); c.fill();
  }
  /* franges */
  c.strokeStyle=PAL.cremeFonce; c.lineWidth=2;
  for(let x=16;x<W-14;x+=6){ c.beginPath(); c.moveTo(x,0); c.lineTo(x,12); c.moveTo(x,H-12); c.lineTo(x,H); c.stroke(); }
  return texDe(cv);
}

/* =====================================================================
   INITIALISATION
   ===================================================================== */
function init(el){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xe9dcc8);
  scene.fog=new THREE.Fog(0xe9dcc8,46,110);
  camera=new THREE.PerspectiveCamera(42,(el.clientWidth||1)/(el.clientHeight||1),.1,300);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  taille(el.clientWidth||1,el.clientHeight||1);
  el.appendChild(renderer.domElement);

  raycaster=new THREE.Raycaster(); ray2=new THREE.Vector2();
  planSol=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  initMats();

  racine=new THREE.Group(); scene.add(racine);
  gSalle=new THREE.Group(); gPostes=new THREE.Group(); gDeco=new THREE.Group();
  gPersos=new THREE.Group(); gAvatars=new THREE.Group(); gVie=new THREE.Group();
  [gSalle,gPostes,gDeco,gPersos,gAvatars,gVie].forEach(g=>racine.add(g));

  ciel=new THREE.HemisphereLight(0xfff1dc,0x8a6b4f,.6); scene.add(ciel);
  soleil=new THREE.DirectionalLight(0xfff0d8,1.5);
  soleil.castShadow=true;
  soleil.shadow.mapSize.set(2048,2048);
  soleil.shadow.camera.near=1; soleil.shadow.camera.far=120;
  soleil.shadow.bias=-0.0006; soleil.shadow.normalBias=.025;
  scene.add(soleil); scene.add(soleil.target);
  /* éclairage de nuit : nombre FIXE de lampes (pas de recompilation des shaders) */
  for(let i=0;i<3;i++){
    const L=new THREE.PointLight(0xffc684,0,14,2);
    L.position.set(0,2.4,0); scene.add(L); lampesNuit.push(L);
  }
  /* ombres de contact des acteurs mobiles : un seul dessin */
  ombresDyn=new THREE.InstancedMesh(G.plan(1,1),MATS.ombre,48);
  ombresDyn.count=0; ombresDyn.frustumCulled=false; ombresDyn.renderOrder=1;
  racine.add(ombresDyn);
  return {scene,camera,renderer};
}
/* résolution adaptative : plafonnée à 1,5 et à ~3,7 Mpx (écrans 4K) */
function taille(w,h){
  w=Math.max(1,w|0); h=Math.max(1,h|0);
  const dpr=(typeof devicePixelRatio==="number"?devicePixelRatio:1);
  const pr=clamp(Math.min(dpr,1.5,Math.sqrt(3.7e6/(w*h))),.6,1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(w,h);
  if(camera){ camera.aspect=w/h; camera.updateProjectionMatrix(); }
}

/* =====================================================================
   CONSTRUCTION : chaque partie a sa clé, on ne refait que ce qui change
   ===================================================================== */
function up(k){ return (S&&S.up&&S.up[k])|0; }
function sigPalmares(){
  const p=(S&&S.palmares)||[]; let s=p.length+":";
  for(let i=0;i<Math.min(p.length,16);i++) s+=(p[i].q|0)+(p[i].t||"").charAt(0);
  return s;
}
function construire(){
  if(typeof S==="undefined"||!S||!S.up||!scene) return;
  const niv=clamp(up("bureau"),0,SALLES.length-1);
  const kS=niv+"|"+(up("materiel")>=4?1:0);      /* la baie technique réserve un pan du mur ouest */
  const kP=niv+"|"+clamp(up("materiel"),0,4)+"|"+clamp(up("logiciel"),0,4);
  const kD=niv+"|"+clamp(up("cafe"),0,4)+"|"+clamp(up("materiel"),0,4)+"|"+clamp(up("prestige"),0,4);
  const kA=kS+"|"+clamp(up("prestige"),0,4)+"|"+sigPalmares();
  if(kS!==cles.salle){
    cles.salle=kS; niveau=niv; sal=SALLES[niv];
    batirSalle(); cles.affiches=null;
    if(poussiere){ gVie.remove(poussiere); libererObjet(poussiere); }
    poussiere=creerPoussiere();
    if(chat) replacerChat();
    persos.forEach(c=>{ c.pos.x=clamp(c.pos.x,-sal.w/2+.5,sal.w/2-.5); c.pos.z=clamp(c.pos.z,-sal.d/2+.5,sal.d/2-.5); });
  }
  if(kP!==cles.postes){ cles.postes=kP; batirPostes(); }
  if(kD!==cles.deco){ cles.deco=kD; batirDeco(); }
  if(kA!==cles.affiches){ cles.affiches=kA; batirAffiches(); }
  if(niv>=1&&!chat) chat=creerChat();
  syncPersos();
}

/* ---------- zones réservées le long des murs (coordonnée locale du mur) ----------
   repère local d'un mur : x le long du mur, +z vers l'intérieur de la pièce.
   N : x=monde x ; S : x=-monde x ; W : x=-monde z ; E : x=monde z */
function reserves(cote){
  const w=sal.w,d=sal.d,out=[];
  if(cote==="N") out.push([w/2-2.75,w/2]);                       /* coin café et étagère */
  if(cote==="W"){
    if(niveau>=2) out.push([d/2-3.9,d/2-1.3]);                     /* bibliothèque */
    if(niveau>=1) out.push([-d/2+1.6,-d/2+4.2]);                   /* moodboard */
    if(niveau>=4) out.push([-d/2,-d/2+1.5]);                       /* borne d'arcade */
    if(up("materiel")>=4) out.push([-d/2+2.3,-d/2+3.7]);           /* baie technique */
  }
  if(cote==="S"){ const x=.3*w; out.push([x-.8,x+.8]); }          /* porte */
  if(cote==="E"){
    if(niveau>=3) out.push([-d/2+4.3,-d/2+6.9]);                   /* traceur */
  }
  return out;
}
function soustraire(segs,a,b){
  const nx=[];
  segs.forEach(([s,e])=>{ if(b<=s||a>=e){ nx.push([s,e]); return; } if(a>s)nx.push([s,a]); if(b<e)nx.push([b,e]); });
  return nx;
}
function placerFenetres(len,n,lf,res){
  let segs=[[-len/2+.55,len/2-.55]];
  res.forEach(r=>{ segs=soustraire(segs,r[0],r[1]); });
  const out=[];
  for(let i=0;i<n;i++){
    let bi=-1,bw=0;
    segs.forEach((s,k)=>{ const ww=s[1]-s[0]; if(ww>bw){ bw=ww; bi=k; } });
    if(bi<0||bw<lf+.4) break;
    const s=segs[bi], c=(s[0]+s[1])/2; out.push(c);
    segs.splice(bi,1,[s[0],c-lf/2-.3],[c+lf/2+.3,s[1]]);
  }
  return out.sort((a,b)=>a-b);
}

/* =====================================================================
   LA SALLE : socle de maquette, parquet, murs en coupe
   ===================================================================== */
function batirSalle(){
  vider(gSalle); murs=[];
  const w=sal.w,d=sal.d;
  const tex=texSol(sal,101+niveau*17); tex.repeat.set(w/2.6,d/2.6);
  const sol=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshStandardMaterial({map:tex,roughness:.58,metalness:0}));
  sol.rotation.x=-Math.PI/2; sol.receiveShadow=true; gSalle.add(sol);
  /* socle de maquette : la pièce posée comme un diorama */
  const C=new Chantier();
  C.rb("vc",w+2*EP+.7,.6,d+2*EP+.7,.08,PAL.socle,0,-.31,0,0,3);
  C.bx("vc",w+2*EP+.4,.03,d+2*EP+.4,PAL.mielFonce,0,-.02,0);
  C.fin(gSalle,{sansOmbre:true});
  ["N","W","S","E"].forEach(c=>murs.push(batirMur(c)));
  /* ombres du soleil cadrées sur la pièce */
  const r=Math.max(w,d)*.75, sc=soleil.shadow.camera;
  sc.left=-r; sc.right=r; sc.top=r; sc.bottom=-r; sc.far=160; sc.updateProjectionMatrix();
  /* lampes de nuit : coin salon, centre, côté ouest */
  const pl=[[w/2-1.8,2.3,-d/2+2.8],[0,2.7,0],[-w/2+2.2,2.4,d/4]];
  lampesNuit.forEach((L,i)=>{ L.position.set(pl[i][0],pl[i][1],pl[i][2]); L.distance=Math.max(w,d)*.75; });
}

function batirMur(cote){
  const w=sal.w,d=sal.d, len=(cote==="N"||cote==="S")?w:d;
  const grp=new THREE.Group();
  const P={N:[0,-d/2,0],S:[0,d/2,Math.PI],W:[-w/2,0,Math.PI/2],E:[w/2,0,-Math.PI/2]}[cote];
  grp.position.set(P[0],0,P[1]); grp.rotation.y=P[2];
  gSalle.add(grp);
  const plein=new THREE.Group(); grp.add(plein);
  const res=reserves(cote);
  const nf=cote==="N"?sal.nf:Math.max(1,sal.nf-1);
  const fen=placerFenetres(len,nf,sal.lf,res);

  const C=new Chantier();
  C.bx("vc",len+2*EP,HM,EP,sal.mur,0,HM/2,-EP/2);
  C.bx("vc",len,.95,.03,sal.lambris,0,.475,.015);
  const np=Math.max(2,Math.round(len/1.15)), pc=nuance(sal.lambris,.035);
  for(let i=0;i<np;i++) C.bx("vc",len/np-.2,.52,.02,pc,-len/2+(i+.5)*len/np,.5,.035);
  C.rb("vc",len,.05,.05,.015,sal.moulure,0,.975,.03);
  C.bx("vc",len,.12,.035,sal.plinthe,0,.06,.0175);
  C.bx("vc",len+2*EP,.07,.05,sal.moulure,0,HM-.035,.025);
  C.bx("vc",len+2*EP,.03,EP+.02,PAL.socle,0,HM+.015,-EP/2);
  fen.forEach((x,i)=>fenetre(C,cote,x,i));
  if(cote==="S") porte(C,.3*len);
  C.fin(plein,{sansOmbre:true});

  /* version basse du mur, quand la caméra passe derrière (vue en coupe) */
  const B=new Chantier();
  B.bx("vc",len+2*EP,.5,EP,sal.mur,0,.25,-EP/2);
  B.bx("vc",len,.12,.035,sal.plinthe,0,.06,.0175);
  B.rb("vc",len+2*EP+.02,.05,EP+.06,.015,sal.lambris,0,.525,-EP/2+.02);
  const bas=B.fin(grp,{sansOmbre:true}).vc;
  bas.visible=false;

  const affiches=new THREE.Group(); plein.add(affiches);
  const n={N:[0,1],S:[0,-1],W:[1,0],E:[-1,0]}[cote];
  return {cote,grp,plein,bas,affiches,len,fen,res,nx:n[0],nz:n[1],px:P[0],pz:P[1]};
}
function fenetre(C,cote,x,i){
  const lf=sal.lf,hf=sal.hf,y0=SEUIL,yc=y0+hf/2,f=sal.cadre,t=.07;
  C.bx("vc",lf+2*t,t,.09,f,x,y0+hf+t/2,.045);
  C.bx("vc",t,hf,.09,f,x-lf/2-t/2,yc,.045);
  C.bx("vc",t,hf,.09,f,x+lf/2+t/2,yc,.045);
  C.rb("vc",lf+.34,.05,.18,.015,f,x,y0-.025,.09);
  C.bx("vc",.035,hf,.035,f,x,yc,.03);
  C.bx("vc",lf,.035,.035,f,x,y0+hf*.64,.03);
  C.add("vitre",G.plan(1,1),"#ffffff",x,yc,.006,0,[lf,hf,1]);
  if(cote==="N"||cote==="W")
    C.add("rayons",G.plan(1,1),"#ffffff",x+.3,.02,1.05,[-Math.PI/2,0,0],[lf*1.05,2.0,1]);
  /* petit cactus sur le premier appui de fenêtre */
  if(i===0&&(cote==="N"||cote==="W")&&niveau>=1){
    C.add("vc",G.tour("potmini",[[0,0],[.05,0],[.06,.07],[0,.07]],12),PAL.terre,x-lf/2+.22,y0,.1);
    C.add("vc",G.caps(.028,.06,10),PAL.feuille,x-lf/2+.22,y0+.13,.1);
    C.add("vc",G.caps(.014,.025,8),PAL.feuilleClair,x-lf/2+.25,y0+.14,.1,[0,0,-.9]);
  }
}
function porte(C,x){
  const f=sal.cadre;
  C.bx("vc",1.18,.08,.1,f,x,2.21,.05);
  C.bx("vc",.08,2.17,.1,f,x-.55,1.085,.05);
  C.bx("vc",.08,2.17,.1,f,x+.55,1.085,.05);
  C.bx("vc",1.02,2.15,.05,PAL.miel,x,1.075,.028);
  const pc=nuance(PAL.miel,-.05);
  [[-.22,1.6],[.22,1.6],[-.22,.62],[.22,.62]].forEach(([dx,y])=>C.bx("vc",.36,y>1?.85:.7,.012,pc,x+dx,y,.058));
  C.sp("brill",.035,PAL.moutarde,x+.4,1.05,.08);
  C.bx("vc",1.1,.012,.55,PAL.terreClair,x,.006,.3);              /* paillasson */
}

/* ---------- vue en coupe : un mur entre la caméra et la pièce s'abaisse ---------- */
function majCoupe(){
  if(!camera) return;
  const cp=camera.position;
  for(let i=0;i<murs.length;i++){
    const m=murs[i];
    const dehors=(cp.x-m.px)*m.nx+(cp.z-m.pz)*m.nz<0;
    if(m.plein.visible===dehors){ m.plein.visible=!dehors; m.bas.visible=dehors; }
  }
}

/* =====================================================================
   POSTES DE TRAVAIL
   ===================================================================== */
function placerPostes(n,w,d){
  const out=[];
  const iles=Math.ceil(n/2);
  const colMax=Math.max(1,Math.floor((w-4.4)/3.1));
  const cols=clamp(Math.round(Math.sqrt(iles*(w/d))),1,Math.min(iles,colMax));
  const rows=Math.ceil(iles/cols);
  const ex=clamp((w-5.0)/Math.max(1,cols),3.1,4.8);
  const ez=clamp((d-5.2)/Math.max(1,rows),4.7,6.0);
  const x0=-(cols-1)*ex/2-(niveau>=1?.6:0);
  const z0=-(rows-1)*ez/2+.3;
  let k=0;
  for(let r=0;r<rows&&k<n;r++)
    for(let c=0;c<cols&&k<n;c++){
      const cx=x0+c*ex, cz=z0+r*ez;
      out.push({x:cx,z:cz-1.4,rot:0}); k++;
      if(k<n){ out.push({x:cx,z:cz+1.4,rot:Math.PI}); k++; }
    }
  return out;
}
const PANTONES=[["#f5455c","19-1664"],["#0f4c81","19-4052"],["#ffd400","13-0859"],
  ["#00a170","17-5641"],["#f36f21","16-1546"],["#6b5b95","18-3838"],["#264653","19-4318"],
  ["#e9c46a","14-0952"],["#2a9d8f","17-5330"],["#e76f51","16-1441"]];

function batirPostes(){
  vider(gPostes); postes=[]; ecrans=[]; curseurEcran=0;
  const mat=clamp(up("materiel"),0,4), logi=clamp(up("logiciel"),0,4);
  const pos=placerPostes(sal.postes,sal.w,sal.d);
  const C=new Chantier();
  pos.forEach((p,i)=>{
    const g=new THREE.Group(); g.position.set(p.x,0,p.z); g.rotation.y=p.rot; gPostes.add(g);
    const po={x:p.x,z:p.z,rot:p.rot,grp:g,ecrans:[],occupant:null,idx:i};
    C.push(p.x,0,p.z,p.rot);
    poste(C,po,i,mat,logi);
    C.pop();
    postes.push(po);
  });
  C.fin(gPostes);
}
function ecran(po,o){
  const cv=toile(256,160), ctx=cv.getContext("2d"), tex=texDe(cv);
  tex.minFilter=THREE.LinearFilter; tex.generateMipmaps=false; tex.anisotropy=2;
  const mat=new THREE.MeshBasicMaterial({map:tex,toneMapped:false});
  const sub=new THREE.Group(); sub.position.set(o.x,o.y,o.z); sub.rotation.set(o.rx||0,o.ry||0,0);
  po.grp.add(sub);
  const m=new THREE.Mesh(G.plan(o.w,o.h),mat); m.position.set(0,o.py,o.pz); m.rotation.y=Math.PI; sub.add(m);
  const e={cv,ctx,tex,mat,cle:"",second:!!o.second,poste:po,idx:ecrans.length};
  po.ecrans.push(e); ecrans.push(e);
}
const COUL_TASSE=[PAL.creme,PAL.terre,PAL.moutarde,PAL.sauge,PAL.encre,PAL.blanc,PAL.corail];
const COUL_CHAISE=[PAL.terre,PAL.sauge,PAL.moutarde,PAL.encreClair,PAL.terreClair,PAL.saugeFonce];
function poste(C,po,i,mat,logi){
  const R=alea(7001+i*7919);
  /* bureau : plateau miel, chant plus foncé, pieds fins encre */
  C.rb("vc",1.6,.045,.8,.018,PAL.mielClair,0,.728,.95);
  C.bx("vc",1.54,.03,.74,PAL.miel,0,.695,.95);
  [[-.7,.62],[.7,.62],[-.7,1.28],[.7,1.28]].forEach(([x,z])=>C.cy("brill",.022,.015,.68,PAL.encre,x,.34,z,0,8));
  C.bx("brill",1.36,.025,.025,PAL.encre,0,.2,1.28);
  /* caisson à tiroirs */
  const tc=[PAL.sauge,PAL.terreClair,PAL.creme,PAL.moutardeClair][Math.floor(R()*4)];
  C.rb("vc",.36,.5,.46,.02,tc,.5,.29,1.06);
  for(let k=0;k<3;k++){
    C.bx("vc",.31,.006,.006,nuance(tc,-.14),.5,.2+k*.15,.828);
    C.rb("brill",.08,.014,.014,.006,PAL.gris4,.5,.13+k*.15,.82);
  }
  C.sp("vc",.022,PAL.noir,.36,.022,.88); C.sp("vc",.022,PAL.noir,.64,.022,.88);
  C.sp("vc",.022,PAL.noir,.36,.022,1.24); C.sp("vc",.022,PAL.noir,.64,.022,1.24);
  C.ombre(0,.95,1.95,1.15);

  /* poste informatique selon le matériel */
  if(mat===0){
    /* « portable qui chauffe » */
    C.rb("brill",.36,.018,.25,.008,PAL.gris2,0,.759,.8);
    C.bx("vc",.3,.003,.12,PAL.gris4,0,.769,.79);
    C.push(0,.768,.925,0,.3); C.rb("brill",.36,.24,.012,.008,PAL.gris2,0,.12,0); C.pop();
    ecran(po,{x:0,y:.768,z:.925,rx:.3,w:.32,h:.2,py:.12,pz:-.0068});
  }else{
    const n2=logi>=3?2:1;
    for(let e=0;e<n2;e++){
      const ox=n2===1?0:(e===0?-.34:.34), ry=n2===1?0:(e===0?-.24:.24);
      C.push(ox,0,1.18,ry);
      C.rb("brill",.24,.014,.16,.006,PAL.gris2,0,.757,.02);
      C.rb("brill",.05,.3,.025,.01,PAL.gris2,0,.9,.05);
      C.rb("vc",.64,.41,.026,.012,PAL.noir,0,1.1,0);
      C.rb("vc",.22,.14,.04,.012,PAL.anthracite,0,1.1,.03);
      if(e===0){ const np=Math.floor(R()*3);
        for(let k=0;k<np;k++) C.bx("vc",.06,.06,.003,[PAL.moutardeClair,PAL.rose,PAL.saugeClair][k%3],
          -.29+k*.012,1.24-k*.075,-.017,[0,0,(k-1)*.12]); }
      C.pop();
      ecran(po,{x:ox,y:0,z:1.18,ry:ry,w:.6,h:.375,py:1.1,pz:-.0142,second:e===1});
    }
    C.rb("vc",.42,.018,.14,.006,PAL.gris1,0,.759,.66);
    C.bx("vc",.38,.004,.1,PAL.gris2,0,.769,.66);
    /* tour, plus imposante avec le matériel */
    const th=[0,.38,.44,.5,.58][mat];
    C.rb("vc",.2,th,.42,.02,PAL.anthracite,-.6,th/2+.02,1.02);
    C.bx("vc",.15,th*.82,.005,PAL.gris5,-.6,th/2+.02,.808);
    C.bx("lueur",.014,.014,.004,"#7dffb0",-.55,th-.04,.805);
    if(mat>=3) C.bx("lueur",.008,th*.7,.004,i%2?PAL.corail:"#8fd3ff",-.66,th/2+.02,.805);
    C.ombre(-.6,1.02,.45,.6);
    /* tablette graphique */
    C.rb("vc",.28,.012,.2,.01,PAL.noir,-.32,.757,.7);
    C.bx("vc",.2,.002,.14,PAL.gris5,-.32,.764,.7);
    C.tige("vc",-.14,.769,.63,-.11,.769,.78,.006,PAL.gris1);
  }
  /* souris et tapis */
  C.bx("vc",.24,.004,.2,[PAL.sauge,PAL.terre,PAL.encre,PAL.moutarde][i%4],.3,.752,.7);
  C.sp("vc",.028,PAL.gris1,.3,.765,.7,[1,.55,1.4]);
  /* tasse */
  const tx=.6,tz=.78, tcoul=COUL_TASSE[Math.floor(R()*COUL_TASSE.length)];
  C.add("vc",G.tour("tasse",[[0,0],[.036,0],[.04,.006],[.04,.09],[.034,.09],[.033,.012],[0,.012]],14),tcoul,tx,.75,tz);
  C.add("vc",G.tore(.022,.007),tcoul,tx+.042,.796,tz);
  C.add("vc",G.disque(.034,14),"#4a2c1a",tx,.825,tz,[-Math.PI/2,0,0]);
  /* lampe d'architecte */
  const lc=[PAL.moutarde,PAL.sauge,PAL.corail,PAL.encre,PAL.terre][Math.floor(R()*5)];
  const lx=.68,lz=1.24;
  C.cy("brill",.065,.075,.022,lc,lx,.761,lz,0,16);
  C.tige("brill",lx,.77,lz,lx-.02,1.08,lz+.06,.011,PAL.gris4);
  C.sp("brill",.024,lc,lx-.02,1.08,lz+.06);
  C.tige("brill",lx-.02,1.08,lz+.06,.48,1.13,1.0,.011,PAL.gris4);
  C.cy("vc",.03,.085,.11,lc,.48,1.13,1.0,0,16);
  C.sp("nuit",.03,"#ffd9a0",.48,1.07,1.0);
  C.halo(.4,.757,.92,.8,.65,"#ffb86b");
  /* chaise de bureau */
  const cc=COUL_CHAISE[i%COUL_CHAISE.length];
  C.push(0,0,.06,(R()-.5)*.16);
  for(let k=0;k<5;k++){ const a=k/5*Math.PI*2+.3;
    C.tige("brill",0,.075,0,Math.sin(a)*.26,.05,Math.cos(a)*.26,.017,PAL.gris5,6);
    C.sp("vc",.028,PAL.noir,Math.sin(a)*.26,.028,Math.cos(a)*.26); }
  C.cy("brill",.026,.026,.32,PAL.gris3,0,.24,0,0,10);
  C.rb("vc",.46,.08,.44,.04,cc,0,.44,0,0,3);
  C.bx("brill",.04,.3,.03,PAL.gris4,0,.58,-.22,[-.1,0,0]);
  C.rb("vc",.42,.44,.07,.05,cc,0,.8,-.25,[-.12,0,0],3);
  C.pop();
  C.ombre(0,.06,.8,.8);
  /* affaires personnelles, tirées une fois pour toutes par poste */
  if(R()<.55){
    C.push(-.52,.752,1.1,R()*.8);
    for(let f=0;f<7;f++){ C.push(0,f*.006,0,(f-3)*.17); C.bx("vc",.16,.005,.04,PANTONES[(i+f)%10][0],.07,0,0); C.pop(); }
    C.cy("brill",.008,.008,.05,PAL.gris3,0,.02,0,0,6);
    C.pop();
  }
  const objet=Math.floor(R()*5);
  if(objet===0){ /* succulente */
    C.add("vc",G.tour("potsucc",[[0,0],[.045,0],[.055,.07],[.05,.075],[0,.075]],12),PAL.terreClair,-.68,.75,1.24);
    for(let k=0;k<6;k++){ const a=k/6*Math.PI*2; C.sp("vc",.022,PAL.feuilleClair,-.68+Math.cos(a)*.022,.84,1.24+Math.sin(a)*.022,[.7,1.3,.7]); }
    C.sp("vc",.02,PAL.feuille,-.68,.86,1.24);
  }else if(objet===1){ /* pile de livres */
    for(let b=0;b<3;b++) C.rb("vc",.2-b*.015,.032,.15,.006,[PAL.terre,PAL.encre,PAL.moutarde,PAL.sauge][(i+b)%4],-.64,.768+b*.034,1.2,(R()-.5)*.3);
  }else if(objet===2){ rubik(C,-.66,.75,1.2,R()*1.5,1,R); }
  else if(objet===3){ /* maquette de monolithe, proportions 1:4:9 */
    C.bx("brill",.05,.11,.012,PAL.noir,-.66,.805,1.22,R()*.6); C.bx("vc",.09,.008,.05,PAL.gris2,-.66,.754,1.22);
  }else{ /* cadre photo */
    C.push(-.66,.75,1.2,(R()-.5)*.6); C.rb("vc",.14,.11,.012,.004,PAL.mielFonce,0,.06,0,[-.2,0,0]);
    C.bx("vc",.11,.08,.002,[PAL.saugeClair,PAL.terreClair,PAL.moutardeClair][i%3],0,.06,-.008,[-.2,0,0]); C.pop();
  }
  if(R()<.3) canard(C,-.56,.75,.86,R()*6,1);
  if(R()<.35){ /* casque audio */
    C.push(.74,.75,.74,R()*2);
    C.cy("vc",.045,.045,.03,PAL.noir,-.06,.045,0,[0,0,Math.PI/2]); C.cy("vc",.045,.045,.03,PAL.noir,.06,.045,0,[0,0,Math.PI/2]);
    C.add("vc",G.tore(.06,.01,Math.PI),PAL.gris5,0,.045,0);
    C.pop();
  }
}
/* petits objets de référence, réutilisés ici et là */
function canard(C,x,y,z,ry,s){
  C.push(x,y,z,ry,0,0,s||1);
  C.sp("vc",.045,"#ffd23f",0,.04,0,[1.15,.85,1]);
  C.sp("vc",.03,"#ffd23f",.035,.088,0);
  C.add("vc",G.cone(.013,.032,8),"#f08a1c",.07,.084,0,[0,0,-Math.PI/2]);
  C.sp("vc",.006,PAL.noir,.052,.098,.018,0,6); C.sp("vc",.006,PAL.noir,.052,.098,-.018,0,6);
  C.sp("vc",.02,"#ffd23f",-.048,.062,0,[1,.6,.8]);
  C.pop();
}
const COUL_RUBIK=["#e8463a","#f2c230","#3a7bd5","#41a85f","#f5f5f0","#ff8a2a"];
function rubik(C,x,y,z,ry,s,R){
  C.push(x,y,z,ry,0,0,s||1);
  C.rb("vc",.06,.06,.06,.006,PAL.noir,0,.03,0);
  const st=.016,o=.0305,k0=Math.floor(R()*6);
  let k=k0;
  for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){
    C.bx("vc",st,.002,st,COUL_RUBIK[(k++)%6],a*.019,.03+o,b*.019);
    C.bx("vc",st,st,.002,COUL_RUBIK[(k+=2)%6],a*.019,.03+b*.019,o);
    C.bx("vc",st,st,.002,COUL_RUBIK[(k+=5)%6],a*.019,.03+b*.019,-o);
    C.bx("vc",.002,st,st,COUL_RUBIK[(k+=3)%6],o,.03+a*.019,b*.019);
    C.bx("vc",.002,st,st,COUL_RUBIK[(k+=1)%6],-o,.03+a*.019,b*.019);
  }
  C.pop();
}

/* =====================================================================
   ÉCRANS : interface stylisée de logiciel de création
   Redessinés uniquement si leur contenu change, deux par image au plus.
   ===================================================================== */
function trouverDesigner(id){ const e=S.equipe||[]; for(let i=0;i<e.length;i++) if(e[i].id===id) return e[i]; return null; }
function trouverProjet(id){ const p=S.projets||[]; for(let i=0;i<p.length;i++) if(p[i].id===id) return p[i]; return null; }
function majEcrans(){
  const n=ecrans.length; if(!n||!S) return;
  let faits=0;
  for(let vus=0;vus<n&&faits<2;vus++){
    const e=ecrans[curseurEcran%n]; curseurEcran=(curseurEcran+1)%n;
    const po=e.poste, d=po.occupant!=null?trouverDesigner(po.occupant):null;
    let cle, p=null;
    if(!d||d.form>0) cle="off";
    else{
      p=d.proj?trouverProjet(d.proj):null;
      if(!p) cle=d.repos>0?"veille":"bureau";
      else{
        const prog=clamp((p.avance||0)/(p.charge||1),0,1);
        const q=typeof qualite==="function"?qualite(p):50;
        cle=p.id+"|"+(p.type&&p.type.id)+"|"+Math.round(prog*30)+"|"+Math.round(q/8);
      }
    }
    if(cle!==e.cle){ e.cle=cle; dessinerEcran(e,cle,p); e.tex.needsUpdate=true; faits++; }
  }
}
function rr(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); c.fill(); }
const TH_SOMBRE={fond:"#1e2232",pan:"#272c40",ligne:"#353c56",txt:"#9aa3c2",plan:"#f6f1e8"};
const TH_CLAIR ={fond:"#e6e0d4",pan:"#f6f2ea",ligne:"#d6cebf",txt:"#7c7466",plan:"#ffffff"};
function dessinerEcran(e,cle,p){
  const c=e.ctx, W=256, H=160, R=alea(hashStr(cle)+e.idx*977);
  c.globalAlpha=1; c.globalCompositeOperation="source-over"; c.textAlign="left"; c.textBaseline="alphabetic";
  if(cle==="off"){
    c.fillStyle="#141824"; c.fillRect(0,0,W,H);
    c.fillStyle="#222a3e"; c.beginPath(); c.arc(W/2,H/2,9,0,7); c.fill(); return;
  }
  if(cle==="bureau"||cle==="veille"){
    const g=c.createLinearGradient(0,0,W,H);
    g.addColorStop(0,cle==="veille"?"#2b3550":PAL.terre); g.addColorStop(1,cle==="veille"?"#1a2034":PAL.moutarde);
    c.fillStyle=g; c.fillRect(0,0,W,H);
    c.globalAlpha=.25; c.fillStyle=PAL.creme;
    c.beginPath(); c.arc(W*.72,H*.38,44,0,7); c.fill();
    c.fillStyle=PAL.encre; c.beginPath(); c.arc(W*.3,H*.7,60,0,7); c.fill();
    c.globalAlpha=1;
    c.fillStyle="rgba(255,255,255,.28)"; rr(c,W/2-62,H-22,124,16,6);
    for(let k=0;k<6;k++){ c.fillStyle=VIVES[k%VIVES.length]; rr(c,W/2-56+k*20,H-19,12,10,3); }
    c.fillStyle="rgba(255,255,255,.85)"; c.font="bold 22px sans-serif"; c.textAlign="center";
    c.fillText(cle==="veille"?"zZz":"Bonjour",W/2,H*.45); return;
  }
  const t=p&&p.type?p.type:{id:"logo",nom:"Projet"};
  const prog=clamp((p.avance||0)/(p.charge||1),0,1);
  const q=typeof qualite==="function"?qualite(p):50;
  const th=(e.poste.idx%2)?TH_CLAIR:TH_SOMBRE;
  const pal=[]; const h0=hashStr(String(p.id)+t.id);
  for(let k=0;k<5;k++) pal.push(k<2?PANTONES[(h0+k*3)%10][0]:VIVES[(h0+k)%VIVES.length]);
  c.fillStyle=th.fond; c.fillRect(0,0,W,H);
  c.fillStyle=th.pan; c.fillRect(0,0,W,14);
  ["#ff6b5a","#ffc04a","#5fd07a"].forEach((col,k)=>{ c.fillStyle=col; c.beginPath(); c.arc(8+k*9,7,2.6,0,7); c.fill(); });
  c.fillStyle=th.txt; c.font="bold 7px sans-serif"; c.fillText((t.nom||"").slice(0,24)+(e.second?" : refs":"_v"+(1+Math.floor(prog*4))),40,10);
  if(e.second){ ecranRefs(c,th,pal,R,t,prog,W,H); return; }
  /* outils */
  c.fillStyle=th.pan; c.fillRect(0,14,18,H-14);
  const outil=Math.floor(R()*8);
  for(let k=0;k<8;k++){ c.fillStyle=k===outil?PAL.corail:th.ligne; rr(c,4,20+k*15,10,10,2); }
  /* calques */
  c.fillStyle=th.pan; c.fillRect(W-50,14,50,H-14);
  for(let k=0;k<6;k++){
    c.fillStyle=k===0?"rgba(255,122,92,.25)":th.ligne; c.fillRect(W-46,20+k*15,42,12);
    c.fillStyle=pal[k%pal.length]; c.fillRect(W-44,22+k*15,8,8);
    c.fillStyle=th.txt; c.fillRect(W-33,25+k*15,14+R()*12,2);
  }
  for(let k=0;k<5;k++){ c.fillStyle=pal[k]; c.fillRect(W-46+k*8.4,H-14,7,7); }
  /* plan de travail */
  const ax=26,ay=22,aw=W-50-34,ah=H-22-26;
  c.fillStyle="rgba(0,0,0,.22)"; c.fillRect(ax+2,ay+3,aw,ah);
  c.fillStyle=th.plan; c.fillRect(ax,ay,aw,ah);
  c.save(); c.beginPath(); c.rect(ax,ay,aw,ah); c.clip();
  composer(c,t.id,prog,ax,ay,aw,ah,R,pal);
  c.restore();
  /* barre d'état */
  c.fillStyle=th.pan; c.fillRect(18,H-18,W-68,18);
  c.fillStyle=th.ligne; c.fillRect(24,H-11,W-82,4);
  c.fillStyle=PAL.corail; c.fillRect(24,H-11,(W-82)*prog,4);
  c.fillStyle=q>=70?"#8fd36a":q>=50?"#f2c14e":"#ff6b6b"; c.fillRect(24,H-15,Math.max(2,(W-82)*q/100),2);
}
function composer(c,id,prog,x,y,w,h,R,pal){
  const n=1+Math.floor(prog*6), cx=x+w/2, cy=y+h/2;
  const ink=PAL.encre;
  if(id==="logo"||id==="identite"){
    c.fillStyle=pal[0]; c.beginPath(); c.arc(cx-(id==="identite"?30:0),cy-6,Math.min(w,h)*.22,0,7); c.fill();
    if(n>1){ c.fillStyle=PAL.blanc; c.font="900 "+Math.round(h*.3)+"px sans-serif"; c.textAlign="center";
      c.fillText("ABCDEFGHKMNRS".charAt(Math.floor(R()*13)),cx-(id==="identite"?30:0),cy+h*.06); c.textAlign="left"; }
    if(n>2){ c.fillStyle=ink; c.fillRect(cx-28-(id==="identite"?30:0),cy+h*.25,56*Math.min(1,(n-2)/2),5); }
    if(id==="identite") for(let k=0;k<Math.min(5,n);k++){ c.fillStyle=pal[k]; c.fillRect(cx+12,y+10+k*14,30,10); }
    if(id==="identite"&&n>4){ c.fillStyle=ink; c.font="bold 18px serif"; c.fillText("Aa",cx+48,cy+6); }
  }else if(id==="affiche"){
    c.fillStyle=pal[1]; c.fillRect(x+w*.2,y+6,w*.6,h-12);
    if(n>1){ c.fillStyle=pal[0]; c.beginPath(); c.arc(cx,cy-8,w*.16,0,7); c.fill(); }
    if(n>2){ c.fillStyle=PAL.blanc; c.fillRect(x+w*.26,y+h*.68,w*.48,6); }
    for(let k=0;k<n-3;k++){ c.fillStyle="rgba(255,255,255,.7)"; c.fillRect(x+w*.26,y+h*.78+k*5,w*(.2+R()*.25),2); }
  }else if(id==="illu"){
    c.fillStyle=pal[3]; c.fillRect(x,y,w,h);
    c.fillStyle=PAL.moutardeClair; c.beginPath(); c.arc(x+w*.75,y+h*.3,12,0,7); c.fill();
    for(let k=0;k<Math.min(n,4);k++){ c.fillStyle=pal[(k+1)%5]; c.beginPath(); c.ellipse(x+w*(.2+k*.22),y+h*(.95-k*.04),w*.3,h*.3,0,0,7); c.fill(); }
    if(n>4){ c.fillStyle=PAL.feuilleFonce; for(let k=0;k<5;k++){ c.beginPath(); c.arc(x+12+k*22,y+h*.62,7,0,7); c.fill(); } }
  }else if(id==="retouche"){
    const g=c.createLinearGradient(0,y,0,y+h); g.addColorStop(0,"#9fc7e0"); g.addColorStop(1,"#f2c79a");
    c.fillStyle=g; c.fillRect(x,y,w,h);
    c.fillStyle="#5a6b7c"; c.beginPath(); c.moveTo(x,y+h*.75); c.lineTo(x+w*.3,y+h*.35); c.lineTo(x+w*.55,y+h*.65); c.lineTo(x+w*.75,y+h*.4); c.lineTo(x+w,y+h*.7); c.lineTo(x+w,y+h); c.lineTo(x,y+h); c.fill();
    if(n>2){ c.setLineDash([4,3]); c.strokeStyle="#111"; c.lineWidth=1; c.strokeRect(x+w*.2+R()*10,y+h*.2,w*.4,h*.45); c.setLineDash([]); }
    if(n>4){ c.fillStyle="rgba(255,122,92,.25)"; c.fillRect(x,y,w*prog,h); }
  }else if(id==="edition"||id==="charte"){
    const pages=id==="charte"?6:2, pw=(w-14)/(id==="charte"?3:2), ph=id==="charte"?(h-14)/2:h-10;
    for(let k=0;k<pages;k++){
      const px=x+5+(k%3)*pw+(id==="charte"?0:(k%2)*2), py=y+5+Math.floor(k/3)*(ph+4);
      c.fillStyle="#fbf8f2"; c.fillRect(px,py,pw-3,ph);
      if(k<n){ c.fillStyle=pal[k%5]; c.fillRect(px+4,py+4,pw-11,ph*.35);
        c.fillStyle="#9a958c"; for(let l=0;l<5;l++) c.fillRect(px+4,py+ph*.45+l*5,(pw-11)*(.5+R()*.5),2); }
    }
  }else if(id==="packaging"){
    const s=Math.min(w,h)*.24; c.fillStyle=pal[0];
    c.fillRect(cx-s/2,cy-s*1.5,s,s*3); c.fillRect(cx-s*1.5,cy-s/2,s*3,s);
    c.strokeStyle=ink; c.lineWidth=1; c.setLineDash([3,2]); c.strokeRect(cx-s/2,cy-s/2,s,s); c.setLineDash([]);
    if(n>2){ c.fillStyle=PAL.blanc; c.font="bold 9px sans-serif"; c.textAlign="center"; c.fillText("BIO",cx,cy+3); c.textAlign="left"; }
    if(n>4){ c.fillStyle=pal[2]; c.beginPath(); c.arc(cx,cy-s,s*.3,0,7); c.fill(); }
  }else if(id==="ui"){
    c.fillStyle=ink; c.fillRect(x,y,w,12);
    for(let k=0;k<3;k++){ c.fillStyle=PAL.gris3; c.fillRect(x+w-50+k*15,y+5,10,2); }
    if(n>1){ c.fillStyle=pal[0]; c.fillRect(x+6,y+18,w-12,h*.3); }
    for(let k=0;k<Math.min(3,n-2);k++){ c.fillStyle="#eee8de"; c.fillRect(x+6+k*(w-12)/3,y+h*.62,(w-12)/3-4,h*.3);
      c.fillStyle=pal[(k+1)%5]; c.fillRect(x+9+k*(w-12)/3,y+h*.65,(w-12)/3-10,8); }
    if(n>5){ c.fillStyle=PAL.corail; rr(c,cx-16,y+h*.4,32,9,4); }
  }else{ /* motion */
    c.fillStyle="#22283a"; c.fillRect(x,y,w,h);
    c.fillStyle=pal[0]; const px=x+12+(w-40)*prog;
    c.beginPath(); c.arc(px,cy-10,9,0,7); c.fill();
    c.fillStyle="#30374d"; c.fillRect(x,y+h-24,w,24);
    for(let k=0;k<3;k++){ c.fillStyle="#454e6a"; c.fillRect(x+4,y+h-21+k*7,w-8,4);
      for(let j=0;j<Math.min(n,6);j++){ c.fillStyle=pal[(k+j)%5]; c.fillRect(x+10+j*(w-20)/6+k*3,y+h-21+k*7,4,4); } }
    c.fillStyle=PAL.corail; c.fillRect(x+4+(w-8)*prog,y+h-24,1.5,24);
  }
}
function ecranRefs(c,th,pal,R,t,prog,W,H){
  /* second écran : planche de références, palette, brief */
  c.fillStyle=th.pan; c.fillRect(6,20,W-12,H-26);
  for(let k=0;k<6;k++){
    const x=12+(k%3)*58, y=26+Math.floor(k/3)*50;
    c.fillStyle=pal[(k+1)%5]; c.fillRect(x,y,52,44);
    c.fillStyle="rgba(255,255,255,.35)"; c.beginPath(); c.arc(x+18+R()*16,y+16+R()*10,8+R()*6,0,7); c.fill();
  }
  for(let k=0;k<5;k++){ c.fillStyle=pal[k]; c.fillRect(190,26+k*14,22,11); }
  c.fillStyle=th.txt; for(let l=0;l<6;l++) c.fillRect(190,100+l*7,40*(.4+R()*.6),2);
  c.fillStyle=PAL.corail; c.font="bold 8px sans-serif"; c.fillText("BRIEF",190,96);
}

/* =====================================================================
   ATLAS : toutes les images d'un ensemble dans une seule texture,
   pour dessiner tous les tableaux d'un mur en un seul appel.
   ===================================================================== */
function Atlas(W,H){ this.W=W; this.H=H; this.cv=toile(W,H); this.c=this.cv.getContext("2d"); this.x=2; this.y=2; this.rh=0; this.tex=null; }
Atlas.prototype.place=function(w,h,peindre){
  w=Math.ceil(w); h=Math.ceil(h);
  if(this.x+w+2>this.W){ this.x=2; this.y+=this.rh+4; this.rh=0; }
  if(this.y+h+2>this.H) return null;
  const x=this.x, y=this.y, c=this.c;
  c.save(); c.translate(x,y); c.beginPath(); c.rect(0,0,w,h); c.clip();
  c.globalAlpha=1; c.globalCompositeOperation="source-over"; c.textAlign="left"; c.textBaseline="alphabetic";
  try{ peindre(c,w,h); }catch(err){ /* une image ratée ne doit pas casser la scène */ }
  c.restore();
  this.x+=w+4; this.rh=Math.max(this.rh,h);
  const W=this.W,H=this.H;
  return [(x+.5)/W,1-(y+h-.5)/H,(x+w-.5)/W,1-(y+.5)/H];
};
Atlas.prototype.texture=function(){ if(!this.tex){ this.tex=texDe(this.cv); } return this.tex; };
function ajuster(c,txt,maxW,px,poids,fam){
  let s=px;
  for(let k=0;k<12;k++){ c.font=(poids||"900")+" "+Math.round(s)+"px "+(fam||"Helvetica,Arial,sans-serif");
    const m=c.measureText(txt); if(!m||!m.width||m.width<=maxW) break; s*=.88; }
  return s;
}

/* =====================================================================
   AFFICHES : culture graphique (école suisse, Bauhaus, Pantone, Bézier,
   quadrichromie, trame, riso...) et clins d'œil de bureau.
   ===================================================================== */
const STYLES=["suisse","bauhaus","pantone","bezier","chromatique","cmjn",
              "grille","riso","lettre","trame","constructiviste","blague"];
const BLAGUES=[
  ["PLUS GROS","LE LOGO"],["FAIS-MOI ÇA","POUR DEMAIN"],["TU PEUX ENVOYER","LE PSD ?"],
  ["C'EST","PRESQUE ÇA"],["NON,","PAS COMIC SANS"],["LE FICHIER","EST EN RVB"],
  ["TU L'AS","EN VECTORIEL ?"],["ÇA FAIT PAS","TRÈS PREMIUM"],["FORM FOLLOWS","FUNCTION"],
  ["LESS","IS MORE"],["LA GRILLE","EST REINE"],["ON A UN AUTRE","BUDGET"]
];
const REFS=["helvetica","bauhaus1919","pop","lorem","kerning","comic","ctrls","e404","grilleSuisse","bass"];
const ENCRES=["#e63329","#f5455c","#ff7a5c","#0f4c81","#1c6bd6","#ffd400","#00a170","#c8f24e","#6b5b95","#e2aa3c"];
function peindreAffiche(c,style,seed,w,h){
  const R=alea(seed*7+13), RI=(a,b)=>a+Math.floor(R()*(b-a+1));
  const papier=["#efe9dc","#e9e3d6","#f4efe4","#1d1d22"][RI(0,3)];
  const sombre=papier==="#1d1d22", encre=sombre?"#f2ece0":"#18181d";
  c.fillStyle=papier; c.fillRect(0,0,w,h);
  const c1=ENCRES[RI(0,ENCRES.length-1)], c2=ENCRES[RI(0,ENCRES.length-1)];
  const m=w*.1, F="Helvetica,Arial,sans-serif";
  if(style==="ref") return peindreRef(c,REFS[seed%REFS.length],R,w,h);
  if(style==="suisse"){
    c.save(); c.beginPath(); c.rect(m,m,w-2*m,h*.66); c.clip();
    c.strokeStyle=c1; c.lineWidth=w*.045;
    for(let i=0;i<7;i++){ c.beginPath(); c.arc(m,m+h*.66,(i+1)*w*.115,-Math.PI/2,0); c.stroke(); }
    c.restore();
    c.strokeStyle=encre; c.lineWidth=w*.02; c.beginPath(); c.moveTo(m,h*.72); c.lineTo(w-m,m); c.stroke();
  }else if(style==="bauhaus"){
    const cx=w/2,cy=h*.4,r=w*.3;
    c.fillStyle="#e63329"; c.beginPath(); c.arc(cx-r*.35,cy,r,0,7); c.fill();
    c.fillStyle="#1c6bd6"; c.fillRect(cx-r*.1,cy-r,r*1.1,r*1.1);
    c.fillStyle="#ffd400"; c.beginPath(); c.moveTo(cx,cy-r*.2); c.lineTo(cx+r,cy+r*.9); c.lineTo(cx-r,cy+r*.9); c.closePath(); c.fill();
  }else if(style==="pantone"){
    const cols=3,rows=4,cw=(w-2*m)/cols,ch=(h*.72-m)/rows;
    for(let i=0;i<cols*rows;i++){
      const p=PANTONES[(seed+i)%PANTONES.length], x=m+(i%cols)*cw, y=m+Math.floor(i/cols)*ch;
      c.fillStyle=p[0]; c.fillRect(x,y,cw-w*.014,ch*.74);
      c.fillStyle=encre; c.font="600 "+Math.round(w*.045)+"px "+F; c.fillText(p[1],x,y+ch*.92);
    }
  }else if(style==="bezier"){
    const p0=[m,h*.62],p1=[w*.32,h*.14],p2=[w*.7,h*.72],p3=[w-m,h*.24];
    c.strokeStyle=sombre?"#4a4a58":"#c3c0b8"; c.lineWidth=Math.max(1,w*.006);
    c.beginPath(); c.moveTo(p0[0],p0[1]); c.lineTo(p1[0],p1[1]); c.moveTo(p3[0],p3[1]); c.lineTo(p2[0],p2[1]); c.stroke();
    c.strokeStyle=c1; c.lineWidth=w*.028;
    c.beginPath(); c.moveTo(p0[0],p0[1]); c.bezierCurveTo(p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]); c.stroke();
    [[p0,1],[p3,1],[p1,0],[p2,0]].forEach(([p,plein])=>{ const r=w*.03; c.fillStyle=plein?encre:papier; c.strokeStyle=encre;
      c.lineWidth=Math.max(1,w*.01); c.beginPath(); c.rect(p[0]-r/2,p[1]-r/2,r,r); c.fill(); c.stroke(); });
  }else if(style==="chromatique"){
    const cx=w/2,cy=h*.4,r=w*.33;
    for(let i=0;i<12;i++){ c.fillStyle="hsl("+(i*30)+",78%,54%)"; c.beginPath(); c.moveTo(cx,cy); c.arc(cx,cy,r,i*Math.PI/6,(i+1)*Math.PI/6); c.closePath(); c.fill(); }
    c.fillStyle=papier; c.beginPath(); c.arc(cx,cy,r*.34,0,7); c.fill();
  }else if(style==="cmjn"){
    const cx=w/2,cy=h*.4,r=w*.21;
    c.globalCompositeOperation="multiply";
    [["#00aeef",-1,-.5],["#ec008c",1,-.5],["#fff200",0,.9]].forEach(([col,dx,dy])=>{ c.fillStyle=col; c.beginPath(); c.arc(cx+dx*r*.55,cy+dy*r*.55,r,0,7); c.fill(); });
    c.globalCompositeOperation="source-over";
    c.strokeStyle=encre; c.lineWidth=Math.max(1,w*.008);
    [[m*.55,m*.55],[w-m*.55,m*.55],[m*.55,h-m*.55],[w-m*.55,h-m*.55]].forEach(([x,y])=>{ const r2=w*.035;
      c.beginPath(); c.arc(x,y,r2*.6,0,7); c.stroke(); c.beginPath(); c.moveTo(x-r2,y); c.lineTo(x+r2,y); c.moveTo(x,y-r2); c.lineTo(x,y+r2); c.stroke(); });
  }else if(style==="grille"){
    c.strokeStyle=sombre?"#33333d":"#d5d2ca"; c.lineWidth=1;
    for(let x=m;x<=w-m+1;x+=(w-2*m)/6){ c.beginPath(); c.moveTo(x,m); c.lineTo(x,h-m); c.stroke(); }
    for(let y=m;y<=h-m+1;y+=(h-2*m)/9){ c.beginPath(); c.moveTo(m,y); c.lineTo(w-m,y); c.stroke(); }
    c.fillStyle=c1; c.fillRect(m,m,(w-2*m)/3*2,(h-2*m)/9*2);
    c.fillStyle=encre; for(let i=0;i<7;i++) c.fillRect(m,h*.44+i*h*.045,(w-2*m)*(.35+R()*.62),h*.014);
  }else if(style==="riso"){
    c.globalAlpha=.85; c.globalCompositeOperation="multiply";
    c.fillStyle=c1; c.beginPath(); c.arc(w*.38,h*.36,w*.3,0,7); c.fill();
    c.fillStyle=c2; c.fillRect(w*.34,h*.3,w*.46,h*.4);
    c.globalCompositeOperation="source-over"; c.globalAlpha=1;
  }else if(style==="lettre"){
    c.fillStyle=c1; c.font="900 "+Math.round(h*.6)+"px "+F; c.textAlign="center"; c.textBaseline="middle";
    c.fillText("AGRQ&Ræ@?§".charAt(RI(0,9)),w/2,h*.42); c.textAlign="left"; c.textBaseline="alphabetic";
  }else if(style==="trame"){
    const pas=w*.055;
    for(let y=m;y<h*.76;y+=pas) for(let x=m;x<w-m;x+=pas){ const t=(y-m)/(h*.76-m);
      c.fillStyle=c1; c.beginPath(); c.arc(x,y,pas*.46*(1-t*.9)+.4,0,7); c.fill(); }
  }else if(style==="constructiviste"){
    c.fillStyle=c1; c.save(); c.translate(w*.5,h*.38); c.rotate(-.42); c.fillRect(-w*.46,-h*.09,w*.92,h*.18); c.restore();
    c.fillStyle=encre; c.save(); c.translate(w*.5,h*.38); c.rotate(.3); c.fillRect(-w*.4,-h*.03,w*.8,h*.06); c.restore();
    c.fillStyle=c2; c.beginPath(); c.arc(w*.74,h*.18,w*.13,0,7); c.fill();
  }else{
    const t=BLAGUES[seed%BLAGUES.length];
    c.fillStyle=c1; c.fillRect(0,h*.3,w,h*.3);
    c.fillStyle=sombre?"#16161b":"#fff";
    ajuster(c,t[0],w-2*m,w*.13); c.fillText(t[0],m*.8,h*.415);
    ajuster(c,t[1],w-2*m,w*.13); c.fillText(t[1],m*.8,h*.545);
    return;
  }
  c.fillStyle=encre;
  c.fillRect(m,h*.855,(w-2*m)*.62,Math.max(2,h*.012));
  c.fillRect(m,h*.895,(w-2*m)*.4,Math.max(1,h*.008));
  c.fillRect(m,h*.925,(w-2*m)*.26,Math.max(1,h*.007));
}
/* affiches « références », textes et formes génériques */
function peindreRef(c,id,R,w,h){
  const F="Helvetica,Arial,sans-serif", m=w*.09;
  const fond=(col)=>{ c.fillStyle=col; c.fillRect(0,0,w,h); };
  if(id==="helvetica"){
    fond("#f2ede2"); c.fillStyle="#e63329"; c.fillRect(0,h*.62,w,h*.38);
    c.fillStyle="#18181d"; ajuster(c,"Helvetica",w-2*m,w*.24,"700"); c.fillText("Helvetica",m,h*.45);
    c.fillStyle="#fff"; ajuster(c,"FOREVER",w-2*m,w*.16,"900"); c.fillText("FOREVER",m,h*.82);
    c.fillStyle="#18181d"; c.font="500 "+Math.round(w*.04)+"px "+F; c.fillText("Since 1957. Probably.",m,h*.14);
  }else if(id==="bauhaus1919"){
    fond("#efe6d2");
    c.fillStyle="#1c6bd6"; c.beginPath(); c.arc(w*.68,h*.3,w*.22,0,7); c.fill();
    c.fillStyle="#e63329"; c.fillRect(m,h*.18,w*.36,w*.36);
    c.fillStyle="#ffd400"; c.beginPath(); c.moveTo(w*.2,h*.62); c.lineTo(w*.62,h*.62); c.lineTo(w*.41,h*.4); c.closePath(); c.fill();
    c.fillStyle="#18181d"; ajuster(c,"BAUHAUS",w-2*m,w*.17); c.fillText("BAUHAUS",m,h*.78);
    ajuster(c,"1919",w-2*m,w*.26); c.fillText("1919",m,h*.93);
  }else if(id==="pop"){
    fond("#ffd400");
    c.fillStyle="#ff4fa0";
    for(let k=0;k<16;k++){ const a=k/16*Math.PI*2; c.beginPath(); c.moveTo(w/2,h*.45);
      c.lineTo(w/2+Math.cos(a)*w*.7,h*.45+Math.sin(a)*w*.7); c.lineTo(w/2+Math.cos(a+.2)*w*.7,h*.45+Math.sin(a+.2)*w*.7); c.closePath(); c.fill(); }
    c.fillStyle="#fff"; c.beginPath(); c.arc(w/2,h*.45,w*.33,0,7); c.fill();
    c.fillStyle="#18181d"; c.textAlign="center";
    ajuster(c,"MAKE IT",w*.6,w*.13); c.fillText("MAKE IT",w/2,h*.42);
    c.fillStyle="#e63329"; ajuster(c,"POP!",w*.62,w*.22); c.fillText("POP!",w/2,h*.57); c.textAlign="left";
  }else if(id==="lorem"){
    fond("#1d1d22"); c.fillStyle="#f2ece0";
    ajuster(c,"Lorem",w-2*m,w*.25,"300","Georgia,serif"); c.fillText("Lorem",m,h*.3);
    ajuster(c,"ipsum",w-2*m,w*.25,"italic 300","Georgia,serif"); c.fillText("ipsum",m,h*.48);
    c.fillStyle="#ff7a5c"; ajuster(c,"dolor sit amet",w-2*m,w*.09,"600"); c.fillText("dolor sit amet",m,h*.6);
    c.fillStyle="#5d5d66"; for(let l=0;l<8;l++) c.fillRect(m,h*.68+l*h*.033,(w-2*m)*(.55+R()*.45),h*.012);
  }else if(id==="kerning"){
    fond("#f4efe4"); c.fillStyle="#18181d";
    const L=["K","E","R","N"], s=w*.2;
    c.font="900 "+Math.round(s)+"px "+F;
    L.forEach((l,k)=>c.fillText(l,m+k*(w-2*m)/4+(k===2?w*.05:0),h*.42));
    c.strokeStyle="#ff7a5c"; c.lineWidth=2;
    for(let k=1;k<4;k++){ const x=m+k*(w-2*m)/4-w*.01; c.beginPath(); c.moveTo(x,h*.22); c.lineTo(x,h*.46); c.stroke(); }
    c.fillStyle="#e63329"; ajuster(c,"KERNING",w-2*m,w*.15); c.fillText("KERNING",m,h*.66);
    c.fillStyle="#18181d"; ajuster(c,"MATTERS",w-2*m,w*.15); c.fillText("MATTERS",m,h*.8);
  }else if(id==="comic"){
    fond("#f2ede2"); c.fillStyle="#18181d";
    ajuster(c,"COMIC SANS",w-2*m,w*.14,"700","'Comic Sans MS',cursive"); c.fillText("COMIC SANS",m,h*.3);
    c.font="700 "+Math.round(w*.09)+"px "+F; c.fillText("IS NEVER",m,h*.48); c.fillText("THE ANSWER",m,h*.6);
    c.strokeStyle="#e63329"; c.lineWidth=w*.03; c.beginPath(); c.moveTo(m*.6,h*.32); c.lineTo(w-m*.6,h*.2); c.stroke();
    c.fillStyle="#1c6bd6"; c.fillRect(m,h*.75,w*.2,w*.2);
  }else if(id==="ctrls"){
    fond("#2b3550");
    const k=(x,y,s,t)=>{ c.fillStyle="#1a2034"; rr(c,x+3,y+5,s,s,10); c.fillStyle="#f3e9d7"; rr(c,x,y,s,s,10);
      c.fillStyle="#2b3550"; c.textAlign="center"; c.font="800 "+Math.round(s*.3)+"px "+F; c.fillText(t,x+s/2,y+s*.62); c.textAlign="left"; };
    k(m,h*.25,w*.42,"Ctrl"); k(w*.52,h*.25,w*.38,"S");
    c.fillStyle="#ffd400"; ajuster(c,"SAUVE-TOI.",w-2*m,w*.12); c.fillText("SAUVE-TOI.",m,h*.75);
    c.fillStyle="#f3e9d7"; c.font="500 "+Math.round(w*.045)+"px "+F; c.fillText("(toutes les 5 minutes)",m,h*.84);
  }else if(id==="e404"){
    fond("#e9e3d6"); c.fillStyle="#18181d";
    ajuster(c,"404",w-2*m,w*.42); c.fillText("404",m,h*.45);
    c.fillStyle="#ff7a5c"; c.fillRect(m,h*.52,w-2*m,h*.012);
    c.fillStyle="#18181d"; ajuster(c,"INSPIRATION",w-2*m,w*.11,"800"); c.fillText("INSPIRATION",m,h*.64);
    ajuster(c,"NOT FOUND",w-2*m,w*.11,"800"); c.fillText("NOT FOUND",m,h*.76);
  }else if(id==="grilleSuisse"){
    fond("#f4efe4");
    c.strokeStyle="rgba(230,51,41,.25)"; c.lineWidth=1;
    for(let i=0;i<=8;i++){ const x=m+i*(w-2*m)/8; c.beginPath(); c.moveTo(x,m); c.lineTo(x,h-m); c.stroke(); }
    for(let i=0;i<=12;i++){ const y=m+i*(h-2*m)/12; c.beginPath(); c.moveTo(m,y); c.lineTo(w-m,y); c.stroke(); }
    c.fillStyle="#18181d"; c.fillRect(m,m,(w-2*m)*.75,(h-2*m)/12*3);
    c.fillStyle="#e63329"; c.beginPath(); c.arc(m+(w-2*m)*.62,h*.55,w*.2,0,7); c.fill();
    c.fillStyle="#18181d"; c.font="700 "+Math.round(w*.06)+"px "+F;
    c.fillText("Raster",m,h*.82); c.fillText("Systeme",m,h*.89);
  }else{ /* « bass » : formes découpées, papier orange et noir */
    fond("#f08a24");
    c.fillStyle="#18181d";
    for(let k=0;k<6;k++){ c.save(); c.translate(w*(.15+k*.13),h*.15+R()*h*.1); c.rotate((R()-.5)*.5); c.fillRect(0,0,w*.07,h*(.35+R()*.25)); c.restore(); }
    c.fillStyle="#f4efe4"; c.beginPath(); c.moveTo(w*.3,h*.55); c.lineTo(w*.75,h*.5); c.lineTo(w*.6,h*.68); c.closePath(); c.fill();
    c.fillStyle="#18181d"; ajuster(c,"ANATOMIE",w-2*m,w*.13); c.fillText("ANATOMIE",m,h*.82);
    c.font="700 "+Math.round(w*.07)+"px "+F; c.fillText("d'un brief",m,h*.9);
  }
}
function peindrePresse(c,R,w,h,k){
  const titres=["LE STUDIO QUI MONTE","ILS ONT OSÉ LE KERNING","LA RELÈVE DU GRAPHISME","STUDIO DE L'ANNÉE"];
  c.fillStyle="#f1ead8"; c.fillRect(0,0,w,h);
  c.fillStyle="#18181d"; c.font="900 "+Math.round(w*.11)+"px Georgia,serif"; c.textAlign="center";
  c.fillText("LA GAZETTE",w/2,h*.12); c.textAlign="left";
  c.fillRect(w*.06,h*.15,w*.88,2);
  ajuster(c,titres[k%4],w*.88,w*.1,"800"); c.fillText(titres[k%4],w*.06,h*.26);
  c.fillStyle=VIVES[k%VIVES.length]; c.fillRect(w*.06,h*.31,w*.88,h*.3);
  c.fillStyle="#7a7366"; for(let l=0;l<9;l++) c.fillRect(w*.06+(l%2)*w*.46,h*.66+Math.floor(l/2)*h*.06,w*.4*(.6+R()*.4),h*.018);
}
function peindreNeon(c,w,h,txt,col){
  c.clearRect(0,0,w,h);
  c.font="italic 700 "+Math.round(h*.52)+"px 'Brush Script MT','Segoe Script',cursive"; c.textAlign="center"; c.textBaseline="middle";
  c.shadowColor=col; c.shadowBlur=h*.18; c.strokeStyle=col; c.lineWidth=h*.06;
  c.strokeText(txt,w/2,h*.52); c.shadowBlur=h*.08; c.strokeStyle="#fff6ec"; c.lineWidth=h*.022; c.strokeText(txt,w/2,h*.52);
}

/* ---------- murs décorés : affiches, moodboard, néons, presse ---------- */
const TAILLES_AFF=[[.55,.72],[.7,.95],[.9,1.22],[.86,.62]];
function batirAffiches(){
  murs.forEach(m=>vider(m.affiches));
  res.neons=[];
  const A=new Atlas(2048,2048), PXM=270;
  const matA=new THREE.MeshStandardMaterial({roughness:.88,metalness:0});
  const nAff=[3,5,8,12,16][niveau], prest=clamp(up("prestige"),0,4);
  const palm=(S&&S.palmares)||[];
  let idx=0;
  const chantiers=[];
  ["N","W"].forEach(cote=>{
    const m=murs.find(x=>x.cote===cote); if(!m) return;
    const C=new Chantier(); chantiers.push([C,m]);
    let segs=[[-m.len/2+.45,m.len/2-.45]];
    m.res.forEach(r=>{ segs=soustraire(segs,r[0]-.1,r[1]+.1); });
    m.fen.forEach(x=>{ segs=soustraire(segs,x-sal.lf/2-.32,x+sal.lf/2+.32); });
    /* néon dans le plus grand espace libre */
    if((cote==="N"&&niveau>=3)||(cote==="W"&&niveau>=4)){
      let bi=-1,bw=0; segs.forEach((s,k)=>{ if(s[1]-s[0]>bw){ bw=s[1]-s[0]; bi=k; } });
      if(bi>=0&&bw>=1.9){ const s=segs[bi], cx=(s[0]+s[1])/2;
        neon(m,cx,2.25,cote==="N"?"Open late":"Make it pop",cote==="N"?"#ff6a8a":"#7fe3ff");
        segs=soustraire(segs,cx-1.05,cx+1.05); }
    }
    /* moodboard sur le mur ouest */
    if(cote==="W"&&niveau>=1) moodboard(C,A,-sal.d/2+2.9);
    /* articles de presse encadrés (prestige) */
    if(cote==="W"&&prest>0){
      let mis=0;
      segs=segs.map(s=>s.slice());
      for(const s of segs){
        while(mis<prest&&s[1]-s[0]>.6){
          const x=s[0]+.3, uv=A.place(.42*PXM,.56*PXM,(c,w,h)=>peindrePresse(c,alea(mis+5),w,h,mis));
          C.rb("vc",.48,.62,.03,.008,PAL.noyer,x,1.45+(mis%2)*.7,.016);
          if(uv) C.quad("aff",.42,.56,x,1.45+(mis%2)*.7,.034,0,uv);
          if(mis%2===1||mis===prest-1) s[0]+=.6;
          mis++;
        }
      }
    }
    for(const s of segs){
      let x=s[0]+.12;
      while(idx<nAff){
        const R=alea(4100+idx*131+niveau);
        let t=TAILLES_AFF[Math.floor(R()*TAILLES_AFF.length)];
        const pile=t[0]<.6&&idx+1<nAff;            /* accrochage en colonne de deux petits */
        if(x+t[0]>s[1]-.08){ t=TAILLES_AFF[0]; if(x+t[0]>s[1]-.08) break; }
        const ys=pile?[1.6,2.42]:[1.98];
        ys.forEach(y=>{
          if(idx>=nAff) return;
          const o=palm[idx];
          const style=o?STYLES[(o.q|0)%STYLES.length]:(idx%2===0?"ref":STYLES[(idx*5+niveau)%STYLES.length]);
          const graine=o?((o.q|0)*3+idx):(idx%2===0?Math.floor(idx/2)+niveau*3:idx+niveau*7);
          const tw=pile?t[0]:t[0], th=pile?.7:t[1];
          const uv=A.place(tw*PXM,th*PXM,(c,w,h)=>peindreAffiche(c,style,graine,w,h));
          const cadre=[PAL.noir,PAL.mielFonce,PAL.blanc,PAL.noir][Math.floor(R()*4)];
          C.rb("vc",tw+.07,th+.07,.03,.008,cadre,x+tw/2,y,.016);
          if(uv) C.quad("aff",tw,th,x+tw/2,y,.033,0,uv);
          idx++;
        });
        x+=t[0]+.3;
      }
    }
  });
  matA.map=A.texture(); matA.needsUpdate=true;
  chantiers.forEach(([C,m])=>C.fin(m.affiches,{sansOmbre:true,mats:{aff:matA}}));
}
function neon(m,x,y,txt,col){
  const cv=toile(512,160); peindreNeon(cv.getContext("2d"),512,160,txt,col);
  const t=texDe(cv);
  const mat=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const me=new THREE.Mesh(G.plan(1.9,.6),mat); me.position.set(x,y,.06); m.affiches.add(me);
  const C=new Chantier();
  C.rb("vc",1.8,.5,.02,.03,"#3a3f52",x,y,.03);
  [-.8,.8].forEach(dx=>C.cy("brill",.012,.012,.05,PAL.gris3,x+dx,y+.2,.03,[Math.PI/2,0,0],6));
  C.fin(m.affiches,{sansOmbre:true});
  res.neons.push(mat);
}
function moodboard(C,A,cx){
  const y=1.78;
  C.rb("vc",2.06,1.36,.04,.01,PAL.mielClair,cx,y,.02);
  C.bx("vc",1.94,1.24,.01,"#c79a68",cx,y,.042);
  const R=alea(77+niveau);
  for(let i=0;i<10;i++){
    const px=cx-.75+(i%4)*.5+(R()-.5)*.06, py=y+.38-Math.floor(i/4)*.42+(R()-.5)*.05;
    const uv=A.place(100,76,(c,w,h)=>peindreAffiche(c,STYLES[(i*2+3)%STYLES.length],i+40,w,h));
    const rz=(R()-.5)*.14;
    C.bx("vc",.42,.33,.004,PAL.blanc,px,py,.05,[0,0,rz]);
    if(uv) C.quad("aff",.38,.29,px,py,.053,[0,0,rz],uv);
    C.sp("vc",.012,PAL.terre,px,py+.15,.06,0,6);
  }
  for(let i=0;i<5;i++) C.bx("vc",.15,.15,.004,[PAL.moutardeClair,PAL.rose,PAL.saugeClair,"#9ccbe8"][i%4],cx-.85+i*.42,y-.5,.05,[0,0,(R()-.5)*.2]);
  /* fil rouge entre deux épingles, le classique du tableau d'enquête */
  C.tige("vc",cx-.75,y+.53,.062,cx+.25,y+.11,.062,.004,"#d33a2c",4);
  C.tige("vc",cx+.25,y+.11,.062,cx+.75,y+.53,.062,.004,"#d33a2c",4);
}

/* =====================================================================
   DÉCOR : coin café, plantes, salon, meubles, références
   ===================================================================== */
let matLivres=null;
function batirDeco(){
  vider(gDeco); platine=null;
  const w=sal.w,d=sal.d, cafe=clamp(up("cafe"),0,4), mat=clamp(up("materiel"),0,4), prest=clamp(up("prestige"),0,4);
  const A=new Atlas(1024,1024);
  const matA=new THREE.MeshStandardMaterial({roughness:.85,metalness:0});
  const matAL=new THREE.MeshBasicMaterial({toneMapped:false});
  const C=new Chantier();
  coinCafe(C,A,cafe);
  plantes(C,cafe,mat);
  if(cafe>=3) salon(C);
  meubleNord(C,A);
  if(niveau>=2) bibliotheque(C,A);
  if(niveau>=3) traceur(C,A);
  if(niveau>=4){ arcade(C,A); pingpong(C); }
  if(mat>=4) baie(C);
  if(cafe>=4) detente(C);
  if(prest>0) vitrine(C,prest);
  matA.map=A.texture(); matAL.map=matA.map; matA.needsUpdate=matAL.needsUpdate=true;
  C.fin(gDeco,{mats:{aff:matA,affL:matAL}});
}
function coinCafe(C,A,cafe){
  const x0=sal.w/2-1.6, z0=-sal.d/2+.3;
  const cab=cafe>=2?PAL.encre:PAL.sauge;
  C.push(x0,0,z0);
  C.bx("vc",1.74,.08,.54,PAL.socle,0,.04,0);
  C.rb("vc",1.8,.82,.58,.015,cab,0,.49,0);
  for(let k=0;k<3;k++){ C.bx("vc",.004,.7,.004,nuance(cab,-.1),-.3+k*.6-.3,.49,.292); C.rb("brill",.012,.12,.02,.005,PAL.moutarde,-.5+k*.6,.7,.3); }
  C.rb("vc",1.9,.05,.64,.012,PAL.mielClair,0,.925,.02);
  C.rb("vc",1.5,.04,.24,.01,PAL.mielClair,0,1.74,-.17);
  [-.6,.6].forEach(x=>C.bx("brill",.03,.14,.18,PAL.gris4,x,1.65,-.2));
  /* tasses sur l'étagère, dont la fameuse « 42 » */
  for(let k=0;k<4;k++){
    const col=COUL_TASSE[(k+2)%COUL_TASSE.length];
    C.add("vc",G.tour("tasse",[[0,0],[.036,0],[.04,.006],[.04,.09],[.034,.09],[.033,.012],[0,.012]],14),col,-.55+k*.16,1.76,-.15);
  }
  C.add("vc",G.tour("tasse",[[0,0],[.036,0],[.04,.006],[.04,.09],[.034,.09],[.033,.012],[0,.012]],14),PAL.encre,.2,1.76,-.15,0,1.3);
  const uv=A.place(64,48,(c,w,h)=>{ c.fillStyle=PAL.encre; c.fillRect(0,0,w,h); c.fillStyle=PAL.moutardeClair; c.font="900 34px Helvetica,Arial,sans-serif"; c.textAlign="center"; c.fillText("42",w/2,h*.78); });
  if(uv) C.quad("aff",.06,.045,.2,1.82,-.097,0,uv);
  /* bocaux */
  for(let k=0;k<3;k++){ C.cy("vc",.045,.045,.13,"#efe6d4",.42+k*.11,1.825,-.17,0,12); C.cy("vc",.047,.047,.025,[PAL.terre,PAL.sauge,PAL.moutarde][k],.42+k*.11,1.9,-.17,0,12); }
  lierre(C,.7,1.76,-.15,.7,alea(9));
  /* la machine, selon le niveau de confort */
  const y=.95;
  if(cafe===0){
    C.add("vc",G.tour("bouilloire",[[0,0],[.09,0],[.1,.04],[.09,.18],[.05,.22],[0,.23]],16),PAL.creme,-.45,y,-.05);
    C.add("vc",G.tore(.06,.012,Math.PI),PAL.gris5,-.45,y+.13,-.05,[0,Math.PI/2,0]);
    C.cy("vc",.05,.05,.12,PAL.mielFonce,-.15,y+.06,-.05,0,12); C.cy("vc",.051,.051,.04,PAL.terre,-.15,y+.07,-.05,0,12);
  }else if(cafe===1){
    C.rb("vc",.22,.34,.22,.03,PAL.anthracite,-.45,y+.17,-.08);
    C.cy("brill",.07,.075,.12,"#3b2a20",-.45,y+.07,.03,0,14);
    C.bx("lueur",.02,.012,.004,PAL.corail,-.38,y+.05,.035);
  }else{
    const larg=cafe>=4?.62:.4;
    C.rb("brill",larg,.36,.32,.03,PAL.gris2,-.4,y+.18,-.06);
    C.rb("vc",larg+.02,.03,.3,.01,PAL.gris4,-.4,y+.37,-.06);
    const ng=cafe>=4?2:1;
    for(let k=0;k<ng;k++){ const gx=-.4+(ng===1?0:(k-.5)*.28);
      C.cy("brill",.04,.045,.06,PAL.gris4,gx,y+.22,.11,0,12);
      C.tige("vc",gx,y+.2,.12,gx,y+.2,.24,.012,PAL.noir,6);
      C.cy("vc",.025,.022,.045,PAL.blanc,gx,y+.025,.1,0,10); }
    C.bx("lueur",.05,.012,.004,"#8fd3ff",-.4+larg*.3,y+.3,.1);
    C.cy("vc",.06,.06,.16,PAL.anthracite,.0,y+.08,-.08,0,12);
    C.add("vc",G.cone(.07,.14,12),"#6b4a31",0,y+.23,-.08,[Math.PI,0,0]);
  }
  canard(C,.55,y,.1,-.6,.8);
  if(cafe>=3){ C.cy("vc",.12,.12,.012,PAL.blanc,.3,y+.006,.05,0,16); C.add("vc",G.calotte(.11,.5,14),PAL.terreClair,.3,y+.012,.05); }
  if(cafe>=4){
    /* mini-frigo et tabourets de bar */
    C.rb("vc",.55,.85,.55,.04,PAL.creme,1.24,.43,.02); C.rb("brill",.03,.25,.02,.01,PAL.gris4,1.0,.6,.3);
    [-.45,.35].forEach(x=>{ C.cy("vc",.17,.17,.05,PAL.terre,x,.72,.72,0,16); C.cy("brill",.02,.02,.7,PAL.gris4,x,.36,.72,0,8);
      C.add("brill",G.tore(.13,.01,Math.PI*2,6,16),PAL.gris4,x,.28,.72,[Math.PI/2,0,0]); C.ombre(x,.72,.5); });
  }
  C.pop();
  C.ombre(x0,z0+.12,2.3,1.0);
}
function lierre(C,x,y,z,len,R){
  /* pothos retombant : une chaîne de petites feuilles en zigzag */
  C.add("vc",G.tour("potlierre",[[0,0],[.07,0],[.08,.1],[0,.1]],12),PAL.blanc,x,y,z);
  let px=x,py=y+.08,pz=z;
  for(let k=0;k<Math.round(len/.06);k++){
    px+=(R()-.5)*.03; py-=.055; pz+=.012;
    C.sp("vc",.028,k%2?PAL.feuille:PAL.feuilleClair,px+(k%2?.03:-.03),py,pz+.02,[1,.5,1.2]);
  }
  for(let k=0;k<5;k++) C.sp("vc",.032,PAL.feuilleClair,x+(R()-.5)*.1,y+.12,z+(R()-.5)*.1,[1,.5,1.2]);
}
/* ---------- plantes : monstera, cactus, sansevieria, ficus, et la plante morte ---------- */
function plantes(C,cafe,mat){
  const w=sal.w,d=sal.d;
  const spots=[[-w/2+.55,-d/2+.55]];
  if(mat<4) spots.push([w/2-.55,d/2-.55]);
  if(niveau<4) spots.push([-w/2+.55,d/2-.55]);
  spots.push([w/2-3.15,-d/2+.45]);
  spots.push([w/2-.5,-d/2+4.25]);
  spots.push([w*.12,d/2-.5]);
  if(niveau>=1) spots.push([-w/2+.5,0]);
  spots.push([-w*.18,-d/2+.45]);
  const np=Math.min(spots.length,[1,2,3,5,7][Math.max(cafe,niveau)]);
  for(let i=0;i<np;i++){
    const R=alea(3301+i*97+niveau*13);
    const morte=niveau===0&&i===0;
    plante(C,spots[i][0],spots[i][1],morte?"morte":["monstera","cactus","sansev","ficus"][(i+niveau)%4],R);
  }
}
function plante(C,x,z,esp,R){
  const pc=[PAL.terre,PAL.creme,PAL.sauge,PAL.encre][Math.floor(R()*4)];
  const grand=esp==="monstera"||esp==="ficus";
  const h=grand?.42:.32, r=grand?.22:.17;
  C.push(x,0,z,R()*6);
  C.add("vc",G.tour("pot"+h,[[0,0],[r*.75,0],[r,h*.9],[r*1.05,h],[r*.92,h],[0,h*.94]],18),pc,0,0,0);
  C.add("vc",G.disque(r*.9,16),"#4a3324",0,h*.95,0,[-Math.PI/2,0,0]);
  if(esp==="morte"){
    for(let k=0;k<6;k++){ const a=k/6*Math.PI*2; C.push(0,h,0,a); C.add("vc",G.cone(.03,.5,6),PAL.morte,0,.12,.12,[1.15,0,0],[1,1,.4]); C.pop(); }
    C.tige("vc",0,h,0,.02,h+.3,.01,.012,"#6b5a33");
    C.sp("vc",.04,PAL.morte,.35,.01,.2,[1,.2,1.4]);
  }else if(esp==="cactus"){
    C.add("vc",G.caps(.09,.38,12),PAL.feuille,0,h+.26,0);
    C.add("vc",G.caps(.05,.14,10),PAL.feuilleClair,.12,h+.32,0,[0,0,-.5]);
    C.add("vc",G.caps(.045,.1,10),PAL.feuilleClair,-.11,h+.24,0,[0,0,.6]);
    C.sp("vc",.035,PAL.rose,0,h+.53,0);
  }else if(esp==="sansev"){
    for(let k=0;k<8;k++){ const a=k/8*Math.PI*2+R();
      C.push(Math.cos(a)*.06,h,Math.sin(a)*.06,-a);
      C.add("vc",G.cone(.06,.55+R()*.35,4),(fx,fy)=>fy>.1?lin(PAL.feuilleFonce):lin(PAL.feuille),0,.3,0,[0,0,(R()-.5)*.3],[1,1,.25]);
      C.pop(); }
  }else if(esp==="ficus"){
    C.tige("vc",0,h,0,0,h+.7,0,.025,PAL.noyer);
    for(let k=0;k<9;k++) C.sp("vc",.16+R()*.06,k%2?PAL.feuille:PAL.feuilleFonce,(R()-.5)*.35,h+.75+R()*.35,(R()-.5)*.35,[1,.85,1],10);
  }else{ /* monstera */
    for(let k=0;k<8;k++){
      const a=k/8*Math.PI*2+R()*.5, L=.35+R()*.3, hy=h+.35+R()*.45;
      const lx=Math.cos(a)*L, lz=Math.sin(a)*L;
      C.tige("vc",0,h,0,lx*.85,hy-.03,lz*.85,.01,PAL.feuilleFonce,5);
      C.push(lx,hy,lz,-a+Math.PI/2,.5+R()*.4);
      C.sp("vc",.2,k%2?PAL.feuille:PAL.feuilleClair,0,0,.08,[.85,.12,1.15],10);
      C.bx("vc",.012,.012,.3,PAL.feuilleFonce,0,.02,.06);
      C.pop();
    }
  }
  C.pop();
  C.ombre(x,z,grand?.9:.6);
}
/* ---------- salon : canapé, table basse, lampadaire, tapis ---------- */
const SOFA={dx:-.55,dz:2.9};
function siegeSofa(k){
  const lx=[-.55,0,.55][((k%3)+3)%3];
  return {x:sal.w/2+SOFA.dx-.12, z:-sal.d/2+SOFA.dz+lx, rot:-Math.PI/2};
}
function salon(C){
  const sx=sal.w/2+SOFA.dx, sz=-sal.d/2+SOFA.dz, sc=PAL.terre, sf=nuance(PAL.terre,-.06);
  /* tapis */
  const tap=new THREE.Mesh(G.plan(3.1,2.6),new THREE.MeshStandardMaterial({map:texTapis(11),roughness:1}));
  tap.rotation.x=-Math.PI/2; tap.rotation.z=Math.PI/2; tap.position.set(sx-1.15,.008,sz); tap.receiveShadow=true; gDeco.add(tap);
  C.push(sx,0,sz,-Math.PI/2);
  C.rb("vc",2.1,.3,.86,.06,sf,0,.25,0,0,3);
  [-.5,.5].forEach(x=>C.rb("vc",.98,.17,.7,.07,sc,x,.48,.06,0,3));
  C.rb("vc",2.1,.5,.24,.08,sc,0,.68,-.33,[-.08,0,0],3);
  [-1.02,1.02].forEach(x=>C.rb("vc",.2,.5,.86,.08,sf,x,.5,0,0,3));
  [[-.95,-.35],[.95,-.35],[-.95,.35],[.95,.35]].forEach(([x,z])=>C.cy("vc",.025,.018,.1,PAL.noyer,x,.05,z,0,8));
  C.rb("vc",.36,.34,.12,.06,PAL.moutarde,-.7,.68,-.12,[-.25,0,.15],3);
  C.rb("vc",.32,.3,.12,.06,PAL.creme,.65,.66,-.12,[-.25,0,-.2],3);
  C.rb("vc",.3,.04,.7,.02,PAL.saugeClair,1.02,.77,.05,0);
  /* table basse et ce qui traîne dessus */
  C.cy("vc",.42,.42,.04,PAL.mielClair,0,.4,1.0,0,24);
  C.cy("vc",.36,.36,.02,PAL.miel,0,.37,1.0,0,24);
  for(let k=0;k<3;k++){ const a=k/3*Math.PI*2; C.tige("vc",Math.cos(a)*.25,.37,1.0+Math.sin(a)*.25,Math.cos(a)*.3,0,1.0+Math.sin(a)*.3,.018,PAL.noyer,6); }
  C.rb("vc",.26,.015,.2,.004,PAL.terreClair,-.12,.428,.95,.3);
  C.rb("vc",.24,.012,.18,.004,PAL.encre,-.1,.44,.93,.1);
  console_(C,.12,.42,1.08,-.4);
  C.ombre(0,1.0,1.1,1.1);
  /* lampadaire */
  C.cy("brill",.15,.17,.03,PAL.encre,1.45,.015,-.15,0,16);
  C.tige("brill",1.45,.03,-.15,1.45,1.55,-.15,.014,PAL.encre);
  C.cy("vc",.13,.2,.26,PAL.creme,1.45,1.62,-.15,0,18);
  C.sp("nuit",.06,"#ffd9a0",1.45,1.52,-.15);
  C.halo(1.45,.012,-.15,2.2,2.2,"#ffb86b");
  C.pop();
  C.ombre(sx-.05,sz,1.2,2.4);
}
function console_(C,x,y,z,ry){
  /* console rétro générique et sa manette */
  C.push(x,y,z,ry);
  C.rb("vc",.22,.05,.16,.012,PAL.gris2,0,.025,0); C.bx("vc",.2,.004,.06,PAL.gris4,0,.052,.02);
  C.bx("vc",.05,.012,.004,PAL.terre,-.06,.03,-.081); C.bx("lueur",.01,.006,.004,PAL.corail,.08,.03,-.081);
  C.rb("vc",.13,.025,.06,.012,PAL.gris4,.02,.012,-.2,.3);
  C.tige("vc",0,.02,-.08,.02,.012,-.17,.003,PAL.noir,4);
  C.pop();
}
/* ---------- meuble nord : console et VHS au début, platine vinyle ensuite ---------- */
const VHS=["LE SEIGNEUR DES CALQUES","PANTONE PARK","BLADE RENDER","KERNINGATOR 2","L'ODYSSÉE DU PIXEL",
  "LES DENTS DE LA GRILLE","RETOUR VERS LE PDF","LE PARRAIN DU LOGO","SHINING EN RVB","PSD ET DÉPENDANCES"];
function vhs(C,A,x,y,z,ry,k){
  C.push(x,y,z,ry);
  C.rb("vc",.035,.19,.11,.004,PAL.noir,0,.095,0);
  const uv=A.place(28,150,(c,w,h)=>{ c.fillStyle=VIVES[k%VIVES.length]; c.fillRect(0,0,w,h); c.fillStyle="#fbf7ef"; c.fillRect(3,6,w-6,h-12);
    c.save(); c.translate(w*.68,h-10); c.rotate(-Math.PI/2); c.fillStyle="#18181d"; ajuster(c,VHS[k%VHS.length],h-24,15,"800"); c.fillText(VHS[k%VHS.length],0,0); c.restore(); });
  if(uv) C.quad("aff",.028,.17,.019,.095,0,[0,Math.PI/2,0],uv);
  C.pop();
}
function cassette(C,x,y,z,ry){
  C.push(x,y,z,ry);
  C.rb("vc",.1,.012,.064,.004,PAL.moutarde,0,.006,0);
  C.bx("vc",.07,.002,.03,PAL.blanc,0,.013,0);
  C.cy("vc",.01,.01,.004,PAL.noir,-.018,.014,0,0,8); C.cy("vc",.01,.01,.004,PAL.noir,.018,.014,0,0,8);
  C.pop();
}
function eiffel(C,x,y,z,s){
  C.push(x,y,z,0,0,0,s);
  const b=.06, t=.012, col=PAL.gris4;
  [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a,c])=>{ C.tige("brill",a*b,0,c*b,a*t,.16,c*t,.004,col,4); C.tige("brill",a*t,.16,c*t,0,.3,0,.003,col,4); });
  C.bx("brill",.07,.006,.07,col,0,.06,0); C.bx("brill",.03,.005,.03,col,0,.16,0);
  C.add("brill",G.cone(.005,.04,5),col,0,.32,0);
  C.pop();
}
function monolithe(C,x,y,z,ry,s){ C.push(x,y,z,ry,0,0,s||1); C.bx("vc",.1,.01,.06,PAL.gris2,0,.005,0); C.bx("brill",.02,.18,.08,PAL.noir,0,.1,0); C.pop(); }
function meubleNord(C,A){
  const x0=-sal.w/2+1.45, z0=-sal.d/2+.24;
  C.push(x0,0,z0);
  C.rb("vc",1.0,.58,.44,.02,PAL.noyer,0,.37,0);
  C.bx("vc",.44,.4,.005,nuance(PAL.noyer,.05),-.24,.37,.222); C.bx("vc",.44,.4,.005,nuance(PAL.noyer,.05),.24,.37,.222);
  [[-.44,-.16],[.44,-.16],[-.44,.16],[.44,.16]].forEach(([x,z])=>C.cy("vc",.02,.014,.08,PAL.noyer,x,.04,z,0,6));
  const y=.66;
  if(niveau===0){
    console_(C,-.15,y,.02,.2);
    for(let k=0;k<3;k++) C.rb("vc",.2,.035,.11,.004,PAL.noir,.28,y+.018+k*.036,0,(k-1)*.12);
    cassette(C,.05,y,.12,.5);
  }else{
    C.rb("brill",.48,.07,.36,.015,PAL.mielClair,-.1,y+.035,0);
    platine=piece(P=>{ P.add("vc",G.cyl(.15,.15,.012,28),PAL.noir,0,0,0); P.add("vc",G.cyl(.05,.05,.014,16),PAL.terre,0,0,0);
      P.add("vc",G.tore(.11,.002,Math.PI*2,3,28),PAL.gris5,0,.007,0,[Math.PI/2,0,0]); });
    platine.position.set(x0-.13,y+.077,z0); gDeco.add(platine);
    C.tige("brill",.1,y+.09,.12,-.02,y+.085,-.02,.005,PAL.gris3,5);
    [-.42,.32].forEach(x=>{ C.rb("vc",.17,.3,.2,.02,PAL.encre,x+(x<0?0:.08),y+.15,0);
      C.cy("vc",.05,.05,.01,PAL.gris5,x+(x<0?0:.08),y+.19,.1,[Math.PI/2,0,0],14); C.cy("vc",.025,.025,.01,PAL.gris5,x+(x<0?0:.08),y+.08,.1,[Math.PI/2,0,0],10); });
    if(niveau===1) monolithe(C,.1,y,-.13,.3,1);
    /* bac à vinyles au sol */
    C.push(.85,0,.05);
    C.rb("vc",.36,.32,.36,.01,PAL.mielClair,0,.16,0);
    for(let k=0;k<8;k++) C.bx("vc",.31,.31,.008,"hsl("+((k*47)%360)+" 50% "+(42+k*2)+"%)",0,.3,-.13+k*.034,[-.12,0,0]);
    C.pop(); C.ombre(.85,.05,.55);
  }
  C.pop();
  C.ombre(x0,z0+.05,1.3,.7);
}
/* ---------- bibliothèque (livres instanciés) ---------- */
function bibliotheque(C,A){
  const zc=-sal.d/2+2.6, x0=-sal.w/2+.24;
  C.push(x0,0,zc,Math.PI/2);
  const L=2.2,P=.38,H=2.1,bois=PAL.mielClair;
  C.bx("vc",.04,H,P,bois,-L/2,H/2,0); C.bx("vc",.04,H,P,bois,L/2,H/2,0);
  C.bx("vc",L,H,.02,nuance(sal.lambris,.08),0,H/2,-P/2+.01);
  const ys=[.06,.52,.98,1.44,1.9];
  ys.forEach(y=>C.bx("vc",L,.035,P,bois,0,y,0));
  C.bx("vc",L+.06,.04,P+.03,PAL.miel,0,H,0);
  /* livres : un seul dessin pour toute la bibliothèque */
  const R=alea(555+niveau), mats=[];
  const coulL=[PAL.terre,PAL.encre,PAL.moutarde,PAL.sauge,PAL.creme,PAL.terreFonce,PAL.saugeFonce,PAL.encreClair,"#8a5a7a",PAL.blanc];
  const rangee=(y,a,b)=>{ let x=a;
    while(x<b-.03){ const bw=.025+R()*.03, bh=.22+R()*.17, pench=(R()<.08&&x>a+.1)?.25:0;
      if(x+bw>b) break;
      const m4=new THREE.Matrix4(); _e.set(0,0,pench); _q.setFromEuler(_e); _v.set(x+bw/2,y+.018+bh/2,(R()-.5)*.03); _s.set(bw,bh,.2+R()*.08);
      m4.compose(_v,_q,_s); m4.premultiply(C.m);
      mats.push([m4,coulL[Math.floor(R()*coulL.length)]]); x+=bw+.003; } };
  rangee(ys[0],-L/2+.05,L/2-.05);
  rangee(ys[1],-L/2+.05,.1);
  for(let k=0;k<6;k++) vhs(C,A,.25+k*.13,ys[1]+.018,0,-Math.PI/2,k+niveau);
  rangee(ys[2],-.2,L/2-.05);
  monolithe(C,-.75,ys[2]+.018,0,.3,1.2); eiffel(C,-.42,ys[2]+.018,0,1.1);
  rangee(ys[3],-L/2+.05,-.25);
  rubik(C,.05,ys[3]+.018,.02,.4,1.2,R); cassette(C,.3,ys[3]+.018,.03,.3); console_(C,.65,ys[3]+.018,.02,0);
  lierre(C,.7,H+.02,.02,1.1,R);
  C.pop();
  C.ombre(x0+.2,zc,.7,2.4);
  if(mats.length){
    if(!matLivres) matLivres=partage(new THREE.MeshStandardMaterial({roughness:.85}));
    const im=new THREE.InstancedMesh(G.box(1,1,1),matLivres,mats.length);
    mats.forEach(([m4,c],i)=>{ im.setMatrixAt(i,m4); im.setColorAt(i,lin(c)); });
    im.instanceMatrix.needsUpdate=true; if(im.instanceColor) im.instanceColor.needsUpdate=true;
    im.castShadow=true; im.receiveShadow=true; gDeco.add(im);
  }
}
function traceur(C,A){
  const x0=sal.w/2-.5, z0=-sal.d/2+5.6;
  C.push(x0,0,z0,-Math.PI/2);
  C.rb("vc",2.0,.42,.55,.06,PAL.gris1,0,.95,0,0,3);
  C.rb("vc",2.04,.08,.5,.03,PAL.anthracite,0,1.18,-.02);
  C.bx("vc",1.85,.02,.04,PAL.noir,0,.84,.27);
  [-.85,.85].forEach(x=>{ C.bx("brill",.06,.72,.4,PAL.gris4,x,.38,0); C.bx("brill",.06,.04,.55,PAL.gris4,x,.02,0); });
  C.tige("brill",-.85,.25,0,.85,.25,0,.015,PAL.gris4);
  C.bx("vc",.16,.08,.005,PAL.noir,.75,1.05,.278); C.bx("lueur",.1,.04,.004,"#8fd3ff",.75,1.05,.281);
  const uv=A.place(240,150,(c,w,h)=>peindreAffiche(c,"chromatique",7,w,h));
  if(uv) C.quad("aff",1.4,.88,0,.48,.42,[-1.1,0,0],uv);
  C.pop();
  C.ombre(x0,z0,.9,2.3);
}
function arcade(C,A){
  const x0=-sal.w/2+.8, z0=sal.d/2-.8;
  C.push(x0,0,z0,Math.PI*.75);
  C.rb("vc",.7,1.75,.66,.03,PAL.encre,0,.875,-.05);
  C.bx("vc",.71,.06,.5,PAL.corail,0,1.0,-.05);
  C.bx("vc",.6,.5,.06,PAL.noir,0,1.36,.26,[-.2,0,0]);
  C.rb("vc",.68,.08,.34,.02,PAL.anthracite,0,1.0,.3,[.15,0,0]);
  C.tige("vc",-.12,1.04,.32,-.12,1.12,.32,.01,PAL.noir); C.sp("vc",.03,"#e63329",-.12,1.13,.32);
  [0,1,2].forEach(b=>C.cy("vc",.025,.025,.025,[PAL.moutarde,"#3a7bd5",PAL.sauge][b],.05+b*.08,1.05,.3,[.15,0,0],10));
  C.bx("lueur",.08,.1,.004,PAL.corail,0,.5,.282);
  const ecr=A.place(160,120,(c,w,h)=>{ c.fillStyle="#141830"; c.fillRect(0,0,w,h);
    c.fillStyle="#2a3a6a"; for(let k=0;k<20;k++) c.fillRect((k*37)%w,(k*53)%h*.6,2,2);
    c.fillStyle="#5fd07a"; c.fillRect(0,h-18,w,18); c.fillRect(30,h-46,40,8); c.fillRect(96,h-66,40,8);
    c.fillStyle=PAL.moutarde; c.fillRect(42,h-32,10,14); c.fillStyle=PAL.corail; c.fillRect(110,h-80,8,8);
    c.fillStyle="#fff"; c.font="bold 10px monospace"; c.fillText("SCORE 004200",8,14); });
  if(ecr) C.quad("affL",.5,.38,0,1.37,.295,[-.2,0,0],ecr);
  const marq=A.place(200,60,(c,w,h)=>{ c.fillStyle=PAL.moutarde; c.fillRect(0,0,w,h); c.fillStyle=PAL.encre;
    c.textAlign="center"; ajuster(c,"PIXEL QUEST",w-16,34); c.fillText("PIXEL QUEST",w/2,h*.68); });
  if(marq) C.quad("affL",.6,.18,0,1.66,.285,0,marq);
  C.pop();
  C.ombre(x0,z0,1.0);
}
function pingpong(C){
  const x0=sal.w/2-3.4, z0=sal.d/2-3.2;
  C.push(x0,0,z0,.08);
  C.rb("vc",2.4,.05,1.34,.015,PAL.encre,0,.76,0);
  C.bx("vc",2.38,.003,.02,PAL.blanc,0,.786,.65); C.bx("vc",2.38,.003,.02,PAL.blanc,0,.786,-.65);
  C.bx("vc",.02,.003,1.32,PAL.blanc,1.18,.786,0); C.bx("vc",.02,.003,1.32,PAL.blanc,-1.18,.786,0);
  C.bx("vc",2.38,.003,.01,PAL.blanc,0,.786,0);
  C.bx("vc",.015,.14,1.42,PAL.gris1,0,.85,0);
  [[-1,-.55],[1,-.55],[-1,.55],[1,.55]].forEach(([x,z])=>C.bx("brill",.05,.74,.05,PAL.gris4,x,.37,z));
  [[.7,.3,PAL.corail],[-.6,-.25,PAL.terre]].forEach(([x,z,c])=>{ C.cy("vc",.08,.08,.01,c,x,.79,z,0,16); C.bx("vc",.03,.01,.1,PAL.mielClair,x,.79,z+.12); });
  C.sp("vc",.02,PAL.blanc,.2,.8,.1);
  C.pop();
  C.ombre(x0,z0,2.8,1.7);
}
function baie(C){
  /* contre le mur ouest (toujours plein dans la vue par défaut) : dans le coin
     sud-est, le plus proche de la caméra, elle bouchait le premier plan */
  const x0=-sal.w/2+.42, z0=sal.d/2-3.0;
  C.push(x0,0,z0,Math.PI/2);
  C.rb("vc",.66,1.9,.66,.02,PAL.anthracite,0,.95,0);
  for(let k=0;k<8;k++){
    C.bx("vc",.58,.16,.01,PAL.gris5,0,.3+k*.2,.331);
    for(let j=0;j<4;j++) C.bx("lueur",.018,.018,.004,[ "#7dffb0",PAL.corail,"#8fd3ff","#7dffb0"][(k+j)%4],-.22+j*.05,.3+k*.2,.338);
  }
  C.pop();
  C.ombre(x0,z0,1.0);
}
function detente(C){
  /* pouf de sieste, tapis de yoga et haltères (« salle de sport ») */
  C.sp("vc",.45,PAL.moutarde,sal.w/2-1.65,.26,-sal.d/2+4.6,[1,.55,1],14);
  C.ombre(sal.w/2-1.65,-sal.d/2+4.6,1.1);
  const x=sal.w/2-.6, z=sal.d/2-2.3;
  C.cy("vc",.1,.1,.6,PAL.sauge,x,.1,z,[Math.PI/2,0,0],14);
  [[-.3,.5],[.3,.5]].forEach(([dx,dz])=>{ C.tige("brill",x+dx-.12,.05,z+dz,x+dx+.12,.05,z+dz,.012,PAL.gris4,6);
    C.sp("vc",.05,PAL.noir,x+dx-.12,.05,z+dz); C.sp("vc",.05,PAL.noir,x+dx+.12,.05,z+dz); });
  C.ombre(x,z+.2,.8,1.2);
}
function vitrine(C,prest){
  /* buffet aux trophées, près de l'entrée */
  const x0=-.3*sal.w+1.75, z0=sal.d/2-.26;
  C.push(x0,0,z0,Math.PI);
  C.rb("vc",1.4,.72,.4,.02,PAL.noyer,0,.4,0);
  C.bx("vc",1.34,.004,.004,nuance(PAL.noyer,.08),0,.4,.202);
  [[-.62,-.15],[.62,-.15],[-.62,.15],[.62,.15]].forEach(([x,z])=>C.cy("vc",.02,.014,.06,PAL.noyer,x,.03,z,0,6));
  const y=.76;
  for(let k=0;k<prest*2;k++){
    const x=-.55+k*(1.1/Math.max(1,prest*2-1));
    if(k%3===2){ C.rb("vc",.12,.16,.03,.006,PAL.mielFonce,x,y+.08,0,[-.15,0,0]); C.bx("brill",.08,.05,.005,PAL.moutarde,x,y+.1,.02,[-.15,0,0]); }
    else{
      C.bx("vc",.08,.04,.08,PAL.noir,x,y+.02,0);
      C.add("brill",G.tour("coupe",[[0,0],[.012,0],[.012,.06],[.05,.09],[.055,.15],[.05,.15],[0,.1]],14),PAL.moutarde,x,y+.04,0);
      C.add("brill",G.tore(.025,.005,Math.PI),PAL.moutarde,x+.05,y+.15,0,[0,0,-Math.PI/2]);
    }
  }
  C.pop();
  C.ombre(x0,z0,1.6,.6);
}

/* =====================================================================
   PERSONNAGES : proportions chibi, 8 maillages par personne,
   un matériau partagé (couleurs par sommet), poses lissées.
   ===================================================================== */
const POSE_CLES=["by","cy","tx","ty","hx","hy","hz","agx","agz","adx","adz","jg","jd"];
const CHAUSSURES=[PAL.blanc,PAL.noir,PAL.terre,PAL.encre,PAL.moutarde];
function cheveux(C,st,c){
  const cal=(f,r)=>C.add("vc",G.calotte(r||.247,f||.55,20,10),c,0,.21,0,[-.38,0,0]);
  if(st===5){
    for(let k=0;k<10;k++){ const a=k/10*Math.PI*2; C.sp("vc",.09,c,Math.cos(a)*.17,.34+(k%2)*.04,Math.sin(a)*.15-.03,0,8); }
    C.sp("vc",.13,c,0,.39,-.03,0,10); return;
  }
  if(st===6){ cal(.42,.236); return; }
  cal();
  if(st===0) C.rb("vc",.22,.07,.08,.03,c,.03,.37,.17,[.5,0,-.15]);
  else if(st===1){ C.rb("vc",.08,.24,.26,.035,c,.2,.16,-.02); C.rb("vc",.08,.24,.26,.035,c,-.2,.16,-.02); C.rb("vc",.38,.26,.1,.04,c,0,.17,-.17); }
  else if(st===2) C.sp("vc",.1,c,0,.47,-.08,0,10);
  else if(st===3) C.sp("vc",.11,c,0,.42,.1,[1.3,.7,1.1],10);
  else if(st===4){ C.add("vc",G.caps(.06,.16,10),c,0,.15,-.27,[.35,0,0]); C.sp("vc",.035,PAL.terre,0,.27,-.23,0,8); }
}
function casquette(C,col,chev){
  C.add("vc",G.calotte(.252,.5,20,10),col,0,.21,0,[-.15,0,0]);
  C.rb("vc",.22,.022,.15,.01,nuance(col,-.08),0,.33,.22,[.12,0,0]);
  C.sp("vc",.022,nuance(col,-.1),0,.46,-.03,0,6);
  C.rb("vc",.3,.1,.08,.03,chev,0,.12,-.19);
}
/* look : {peau,haut,bas,cheveux,taille,coiffure?} ; av : {couleur} pour un avatar joueur */
function creerPerso(look,graine,av){
  look=look||{};
  const R=alea(graine);
  const peau=look.peau||"#e8c4a2", haut=av?av.couleur:(look.haut||"hsl(200 45% 45%)");
  const bas=look.bas||"#2a2f3a", chev=look.cheveux||"#2a2422";
  const coiffure=look.coiffure!==undefined?(look.coiffure|0)%7:Math.floor(R()*7);
  const s=1.12*(look.taille||1);
  const lp=lin(peau), lh=lin(haut), lb=lin(bas), lc=lin(chev), sombre=nuance(haut,-.12), joue=melange(peau,"#ff8f80",.45);
  const chaus=av?PAL.blanc:CHAUSSURES[Math.floor(R()*CHAUSSURES.length)];
  const g=new THREE.Group(); g.scale.setScalar(s);
  const corps=new THREE.Group(); g.add(corps);
  const bassin=new THREE.Group(); bassin.position.y=.4; corps.add(bassin);
  const torse=piece(C=>{
    C.add("vc",G.tour("torse",[[0,-.03],[.15,-.03],[.185,.04],[.19,.14],[.18,.24],[.15,.32],[.09,.37],[0,.39]],18),
      (x,y)=>y<.07?lb:lh,0,0,0,0,[1,1,.86]);
    if(av){
      C.add("vc",G.tore(.11,.05,Math.PI,8,14),sombre,0,.37,-.03,[-Math.PI/2-.25,0,0]);
      C.rb("vc",.2,.08,.03,.012,sombre,0,.13,.15,[-.12,0,0]);
      C.tige("vc",.04,.34,.14,.045,.23,.165,.006,PAL.blanc,4); C.tige("vc",-.04,.34,.14,-.045,.23,.165,.006,PAL.blanc,4);
    }else{
      C.add("vc",G.tore(.085,.02,Math.PI*2,6,16),sombre,0,.355,0,[Math.PI/2,0,0]);
    }
  });
  torse.castShadow=true; bassin.add(torse);
  const tete=new THREE.Group(); tete.position.y=.37; torse.add(tete);
  const teteM=piece(C=>{
    C.sp("vc",.23,lp,0,.21,0,[1,.93,.96],20);
    C.sp("vc",.05,lp,.225,.2,0,[.55,1,1],8); C.sp("vc",.05,lp,-.225,.2,0,[.55,1,1],8);
    C.sp("vc",.024,nuance(peau,-.04),0,.18,.218,0,8);
    C.sp("vc",.035,joue,.12,.15,.2,[1,.6,.4],8); C.sp("vc",.035,joue,-.12,.15,.2,[1,.6,.4],8);
    C.rb("vc",.05,.012,.012,.005,"#5a2c25",0,.115,.205);
    if(av) casquette(C,nuance(av.couleur,-.05),lc); else cheveux(C,coiffure,lc);
  });
  teteM.castShadow=true; tete.add(teteM);
  const yeux=piece(C=>{ [-1,1].forEach(sg=>{
    C.sp("vc",.034,PAL.nuitBleu,sg*.085,0,0,[.8,1.25,.5],10);
    C.sp("vc",.011,"#ffffff",sg*.085+.012,.016,.016,0,6); }); });
  yeux.position.set(0,.23,.205); tete.add(yeux);
  const bras=[], jambes=[];
  [1,-1].forEach(sg=>{
    const m=piece(C=>{ C.add("vc",G.caps(.055,.15,10),(x,y)=>y>-.05?lh:lp,0,-.13,0); C.sp("vc",.062,lp,0,-.25,0,0,10); });
    m.position.set(sg*.19,.3,0); torse.add(m); bras.push(m);
  });
  [1,-1].forEach(sg=>{
    const m=piece(C=>{ C.add("vc",G.caps(.075,.2,10),lb,0,-.175,0); C.sp("vc",.085,chaus,0,-.355,.035,[1,.6,1.45],10); });
    m.position.set(sg*.085,0,0); bassin.add(m); jambes.push(m);
  });
  const tasse=piece(C=>{
    const tc=COUL_TASSE[Math.floor(R()*COUL_TASSE.length)];
    C.add("vc",G.tour("tasse",[[0,0],[.036,0],[.04,.006],[.04,.09],[.034,.09],[.033,.012],[0,.012]],14),tc,0,0,0,0,1.6);
    C.add("vc",G.tore(.022,.007),tc,.065,.07,0,0,1.6);
  });
  tasse.position.set(0,-.3,.05); tasse.visible=false; bras[1].add(tasse);
  const pose={}, cible={};
  POSE_CLES.forEach(k=>{ pose[k]=0; cible[k]=0; }); pose.by=.4; pose.agz=.12; pose.adz=-.12;
  return {grp:g,corps,bassin,torse,tete,yeux,bras,jambes,tasse,
    meshes:[torse,teteM,yeux,bras[0],bras[1],jambes[0],jambes[1],tasse],
    pose,cible,t:R()*10,phase:0,cligne:1+R()*3,yeuxT:0,pos:new THREE.Vector3(),cap:0,echelle:s,
    slot:Math.floor(R()*3),angle:R()*Math.PI*2,assis:false,visible:true};
}
function poseCible(c,mode,d,dt){
  const P=c.cible, t=c.t;
  P.by=.4; P.cy=0; P.tx=0; P.ty=0; P.hx=0; P.hy=0; P.hz=0; P.agx=0; P.agz=.12; P.adx=0; P.adz=-.12; P.jg=0; P.jd=0;
  if(mode==="marche"){
    c.phase+=dt*8; const s=Math.sin(c.phase);
    P.jg=s*.6; P.jd=-s*.6; P.agx=-s*.5; P.adx=s*.5; P.cy=Math.abs(Math.cos(c.phase))*.045; P.ty=s*.08; P.tx=.06;
  }else if(mode==="debout"){
    P.agx=.05+Math.sin(t*.8)*.04; P.adx=.05+Math.sin(t*.8+1)*.04;
    P.hy=Math.sin(t*.35)*.45; P.hx=Math.sin(t*.6)*.05; P.cy=Math.sin(t*1.6)*.006;
    if(d&&d.energie<70){ P.adx=-1.25; P.adz=.25; P.hx=.12; }
  }else{
    P.by=(mode==="sofa"?.6:.51)/c.echelle; P.jg=P.jd=-1.45;
    if(mode==="travail"){
      const f=t*(6+((d&&d.vit)||0)*.5);
      P.agx=-1.2+Math.sin(f)*.07; P.adx=-1.2+Math.sin(f+2.1)*.07; P.agz=-.1; P.adz=.1;
      P.tx=.22+Math.sin(t*1.1)*.015; P.hx=-.12+Math.sin(t*.7)*.04; P.hy=Math.sin(t*.31)*.15;
      if(d&&d.energie<30){ P.hx=.32+Math.sin(t*.5)*.06; P.tx=.32; }
      if(d&&d.energie<=6){ P.tx=.55; P.hx=.4; }
    }else if(mode==="sofa"){
      P.tx=-.3; P.agx=-.25; P.adx=-.25; P.agz=.4; P.adz=-.4; P.hx=.25; P.hz=.3; P.jg=-1.25; P.jd=-1.35;
    }else{
      P.tx=-.06; P.agx=-.35; P.adx=-.35; P.agz=.28; P.adz=-.28; P.hy=Math.sin(t*.4)*.35; P.hx=Math.sin(t*.9)*.04;
      const etire=Math.max(0,Math.sin(t*.23)-.93)*14;                 /* on s'étire de temps en temps */
      P.agx-=etire*2.4; P.adx-=etire*2.4; P.tx-=etire*.15;
    }
  }
}
function lisserPose(c,dt){
  const k=1-Math.exp(-dt*10), p=c.pose, P=c.cible;
  for(let i=0;i<POSE_CLES.length;i++){ const n=POSE_CLES[i]; p[n]+=(P[n]-p[n])*k; }
  c.bassin.position.y=p.by; c.corps.position.y=p.cy;
  c.torse.rotation.set(p.tx,p.ty,0);
  c.tete.rotation.set(p.hx,p.hy,p.hz);
  c.bras[0].rotation.set(p.agx,0,p.agz); c.bras[1].rotation.set(p.adx,0,p.adz);
  c.jambes[0].rotation.x=p.jg; c.jambes[1].rotation.x=p.jd;
  c.torse.scale.y=1+Math.sin(c.t*2.2)*.012;                         /* respiration */
}
function clignement(c,dtR,dort){
  c.cligne-=dtR;
  if(c.cligne<=0){ c.yeuxT=.13; c.cligne=2+vr(0,4); }
  if(c.yeuxT>0) c.yeuxT-=dtR;
  c.yeux.scale.y=(dort||c.yeuxT>0)?.12:1;
}

/* garde la liste des personnages alignée sur l'équipe */
function syncPersos(){
  const eq=S.equipe||[], vus=new Set();
  for(let i=0;i<eq.length;i++){
    const d=eq[i]; vus.add(d.id);
    if(!persos.has(d.id)){
      const c=creerPerso(d.look,hashStr("d"+d.id));
      c.did=d.id; c.grp.userData.did=d.id;
      c.pos.set(-.3*sal.w,0,sal.d/2-.6); c.cap=Math.PI;
      gPersos.add(c.grp); persos.set(d.id,c);
    }
  }
  persos.forEach((c,id)=>{ if(!vus.has(id)){ gPersos.remove(c.grp); libererObjet(c.grp); persos.delete(id); if(survol===id) survol=null; } });
  postes.forEach(p=>{ p.occupant=null; });
  for(let i=0;i<eq.length;i++){ const d=eq[i]; if(d.poste>=0&&postes[d.poste]) postes[d.poste].occupant=d.id; }
}
const _dest={x:0,z:0,rot:0,mode:""};
function siege(po,mode){ _dest.x=po.x+Math.sin(po.rot)*.12; _dest.z=po.z+Math.cos(po.rot)*.12; _dest.rot=po.rot; _dest.mode=mode; return _dest; }
function destination(d,c){
  if(d.form>0) return null;                                          /* en formation : absent */
  if(d.repos>0&&up("cafe")>=3){ const s=siegeSofa(c.slot); _dest.x=s.x; _dest.z=s.z; _dest.rot=s.rot; _dest.mode="sofa"; return _dest; }
  const po=d.poste>=0?postes[d.poste]:null;
  if(d.proj&&po) return siege(po,"travail");
  if(d.energie<70||d.repos>0||!po){                                   /* pause café */
    const cx=sal.w/2-1.6, cz=-sal.d/2+.3, a=c.angle;
    _dest.x=cx+Math.cos(a)*.8; _dest.z=cz+1.2+Math.abs(Math.sin(a))*.4;
    _dest.rot=Math.atan2(cx-_dest.x,cz-_dest.z); _dest.mode="debout"; return _dest;
  }
  return siege(po,"assis");
}
function majPersos(dt,dtR){
  const eq=S.equipe||[];
  for(let i=0;i<eq.length;i++){
    const d=eq[i], c=persos.get(d.id); if(!c) continue;
    c.t+=dt;
    const dest=destination(d,c);
    if(!dest){ c.grp.visible=false; c.visible=false; continue; }
    c.grp.visible=true; c.visible=true;
    const dx=dest.x-c.pos.x, dz=dest.z-c.pos.z, dist=Math.hypot(dx,dz);
    let mode=dest.mode, cap=dest.rot;
    if(dist>.08){ const k=Math.min(1,1.7*dt/dist); c.pos.x+=dx*k; c.pos.z+=dz*k; cap=Math.atan2(dx,dz); mode="marche"; }
    else{ c.pos.x=dest.x; c.pos.z=dest.z; }
    c.cap=angleVers(c.cap,cap,1-Math.exp(-dt*(mode==="marche"?10:6)));
    poseCible(c,mode,d,dt); lisserPose(c,dt); clignement(c,dtR,mode==="sofa");
    c.tasse.visible=mode==="debout"&&d.energie<70;
    c.assis=mode!=="marche"&&mode!=="debout";
    c.grp.position.set(c.pos.x,0,c.pos.z); c.grp.rotation.y=c.cap;
  }
}

/* =====================================================================
   AVATARS DES JOUEURS : sweat à capuche et casquette à leur couleur,
   étiquette de nom, anneau au sol pour le joueur local.
   ===================================================================== */
const PEAUX=["#e8c4a2","#c98f63","#8d5a3b","#f2d7bd","#5f3a26","#d8a878"];
const CHEVEUX=["#1c1a19","#3a2a1c","#6b4423","#c9a227","#8a2b2b","#e8e8ea"];
function etiquette(nom,couleur){
  const cv=toile(512,128), c=cv.getContext("2d");
  c.scale(2,2);                                    /* 2x : net en 4K et quand l'étiquette grandit au loin */
  c.fillStyle="rgba(28,28,33,.82)"; rr(c,4,8,248,48,24);
  c.fillStyle="#"+srgb(couleur).getHexString(); c.beginPath(); c.arc(30,32,10,0,7); c.fill();
  c.fillStyle="#fbf7ef"; c.textAlign="left"; c.textBaseline="middle";
  const t=String(nom||"Joueur").slice(0,16); ajuster(c,t,196,26,"700"); c.fillText(t,48,33);
  const tex=texDe(cv); tex.minFilter=THREE.LinearFilter; tex.generateMipmaps=false;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,depthWrite:false,transparent:true,toneMapped:false}));
  sp.scale.set(1.1,.275,1); sp.renderOrder=999; sp.position.y=1.72;
  return sp;
}
function creerAvatar(a){
  const id=String(a.id), h=hashStr("j"+id), R=alea(h);
  const couleur=a.couleur||"#ff7a5c";
  const look={peau:PEAUX[Math.floor(R()*PEAUX.length)],cheveux:CHEVEUX[Math.floor(R()*CHEVEUX.length)],
              bas:PAL.encre,taille:1};
  const p=creerPerso(look,h,{couleur});
  const root=new THREE.Group(); root.add(p.grp);
  const tag=etiquette(a.nom,couleur); root.add(tag);
  const anneau=new THREE.Mesh(new THREE.RingGeometry(.36,.44,40),
    new THREE.MeshBasicMaterial({color:lin(couleur),transparent:true,opacity:.85,depthWrite:false,toneMapped:false}));
  anneau.rotation.x=-Math.PI/2; anneau.position.y=.02; anneau.renderOrder=2; anneau.visible=false; root.add(anneau);
  p.pos.set(+a.x||0,0,+a.z||0);
  gAvatars.add(root);
  return {id,nom:a.nom,couleur,p,root,tag,anneau,cx:p.pos.x,cz:p.pos.z,ccap:null,mode:"idle"};
}
function supprimerAvatar(id){ const av=avatars.get(id); if(!av) return; gAvatars.remove(av.root); libererObjet(av.root); avatars.delete(id); }
function majAvatars(liste){
  if(!gAvatars) return;
  const vus=new Set();
  (liste||[]).forEach(a=>{
    if(!a||a.id===undefined||a.id===null) return;
    const id=String(a.id); vus.add(id);
    let av=avatars.get(id);
    if(av&&(av.couleur!==(a.couleur||"#ff7a5c")||av.nom!==a.nom)){ supprimerAvatar(id); av=null; }
    if(!av){ av=creerAvatar(a); avatars.set(id,av); }
    av.cx=+a.x||0; av.cz=+a.z||0; av.ccap=typeof a.cap==="number"?a.cap:null; av.mode=a.mode||"idle";
  });
  avatars.forEach((av,id)=>{ if(!vus.has(id)) supprimerAvatar(id); });
}
function animerAvatars(dt){
  avatars.forEach(av=>{
    const c=av.p; c.t+=dt;
    const dx=av.cx-c.pos.x, dz=av.cz-c.pos.z, dist=Math.hypot(dx,dz);
    if(dist>6){ c.pos.x=av.cx; c.pos.z=av.cz; }
    else{ const k=1-Math.exp(-dt*9); c.pos.x+=dx*k; c.pos.z+=dz*k; }
    const marche=av.mode==="marche"||dist>.06;
    const cap=av.ccap!==null?av.ccap:(dist>.03?Math.atan2(dx,dz):c.cap);
    c.cap=angleVers(c.cap,cap,1-Math.exp(-dt*10));
    poseCible(c,marche?"marche":"debout",null,dt); lisserPose(c,dt); clignement(c,dt,false);
    av.root.position.set(c.pos.x,0,c.pos.z); c.grp.rotation.y=c.cap;
    const local=API&&API.idAvatarLocal!==null&&API.idAvatarLocal!==undefined&&String(API.idAvatarLocal)===av.id;
    /* l'étiquette garde une taille lisible quand la caméra recule (vue d'ensemble du grand plateau) */
    const kd=clamp(_camPos.copy(camera.position).distanceTo(av.root.position)/15,1,2.4);
    av.tag.scale.set(1.1*kd,.275*kd,1); av.tag.position.y=1.72+.12*(kd-1);
    av.anneau.visible=local;
    if(local){ const s=1+Math.sin(horloge*3)*.06; av.anneau.scale.set(s,s,s); }
  });
}
const _camPos=new THREE.Vector3();
function bornes(){ return {xmin:-sal.w/2+.4,xmax:sal.w/2-.4,zmin:-sal.d/2+.4,zmax:sal.d/2-.4}; }
const _sol=new THREE.Vector3();
function solA(clientX,clientY){
  if(!renderer||!camera) return null;
  const r=renderer.domElement.getBoundingClientRect?renderer.domElement.getBoundingClientRect():{left:0,top:0,width:1,height:1};
  if(!r.width||!r.height) return null;
  ray2.set((clientX-r.left)/r.width*2-1,-((clientY-r.top)/r.height*2-1));
  raycaster.setFromCamera(ray2,camera);
  if(!raycaster.ray.intersectPlane(planSol,_sol)) return null;
  const b=bornes();
  if(_sol.x<b.xmin||_sol.x>b.xmax||_sol.z<b.zmin||_sol.z>b.zmax) return null;
  return {x:_sol.x,z:_sol.z};
}

/* =====================================================================
   LUMIÈRE : soleil et ciel le jour, lampes chaudes la nuit
   ===================================================================== */
function courbeJour(h){
  const LEVER=.24, PLEIN1=.33, PLEIN2=.74, COUCHER=.84;
  if(h<=LEVER||h>=COUCHER) return 0;
  if(h<PLEIN1)  return lisse((h-LEVER)/(PLEIN1-LEVER));
  if(h<=PLEIN2) return 1;
  return lisse(1-(h-PLEIN2)/(COUCHER-PLEIN2));
}
const COUL={
  fondNuit:srgb("#161b2b"), fondJour:srgb("#efe2cc"), fondCrep:srgb("#e2a77a"), fondBrune:srgb("#4a3550"),
  cielJour:lin("#fff1dc").clone(), cielNuit:lin("#6a78a8").clone(),
  solJour:lin("#a8865f").clone(), solNuit:lin("#3b2c2a").clone(),
  vitreJour:lin("#d6ecf5").clone(), vitreNuit:lin("#1f2b48").clone(), vitreCrep:lin("#f3b98a").clone()
};
const _c1=new THREE.Color(), _c2=new THREE.Color(), _c3=new THREE.Color();
function heureJeu(){ if(typeof heure==="function") return heure(); const j=(S&&S.jour)||0; return j-Math.floor(j); }
function majLumiere(dtR){
  const h=heureJeu();
  const ang=(h-.25)*Math.PI*2, elev=Math.sin(ang);
  const cible=courbeJour(h);
  if(jourLisse===null) jourLisse=cible;
  const vit=((S&&S.session)||S||{}).vitesse||1;
  const tau=.12+.06*Math.max(1,vit);
  jourLisse+=(cible-jourLisse)*(1-Math.exp(-(dtR||.016)/tau));
  const J=jourLisse, nuit=clamp(1-J*1.25,0,1);
  nuitLisse=nuit;
  const r=Math.max(sal.w,sal.d)*1.1;
  soleil.position.set(Math.cos(ang-1.1)*r*.9,Math.max(3,elev*r*.9+3),Math.sin(ang-1.1)*r*.5-r*.4);
  soleil.intensity=J*1.65;
  const chaud=1-clamp(Math.abs(elev)*2.4,0,1);
  soleil.color.setHSL(.085-chaud*.03,.4+chaud*.4,.64);
  ciel.color.copy(COUL.cielNuit).lerp(COUL.cielJour,J);
  ciel.groundColor.copy(COUL.solNuit).lerp(COUL.solJour,J);
  ciel.intensity=.5+J*.3+nuit*.22;
  lampesNuit.forEach(L=>{ L.intensity=nuit*.95; });
  /* fond : nuit bleue, coucher orangé, jour crème (le fond n'est pas tone-mappé : en sRGB) */
  _c1.copy(COUL.fondJour).lerp(COUL.fondCrep,chaud*.8);
  /* passage par une teinte de brune (prune) au crépuscule : un mélange direct
     nuit/crème donnait un gris taupe terne */
  _c3.copy(COUL.fondNuit).lerp(COUL.fondBrune,chaud);
  if(J<.5) _c2.copy(COUL.fondNuit).lerp(_c3,J*2);
  else _c2.copy(_c3).lerp(_c1,lisse((J-.5)*2));
  scene.background.copy(_c2);
  scene.fog.color.copy(_c2).convertSRGBToLinear();
  MATS.nuit.color.setScalar(.3+.7*nuit);
  MATS.halo.color.setScalar(nuit*.85);
  MATS.rayons.opacity=J*.26*(elev>0?1:0);
  _c1.copy(COUL.vitreJour).lerp(COUL.vitreCrep,chaud*.6);
  MATS.vitre.color.copy(COUL.vitreNuit).lerp(_c1,J);
  for(let i=0;i<res.neons.length;i++){
    const f=Math.sin(horloge*37+i*3)>.97?.55:1;                       /* petit grésillement */
    res.neons[i].opacity=(.7+.3*nuit)*f;
  }
  return J;
}

/* =====================================================================
   VIE DU STUDIO : le chat, la poussière, les confettis
   ===================================================================== */
const ROBES=[["#3b3833","#f3ede2"],["#c0793f","#f6efe4"],["#8a8580","#f3ede2"],["#2a2a2e","#f3ede2"],["#e7dccb","#c0793f"]];
function creerChat(){
  const R=alea(hashStr((S&&S.nom)||"chat")), robe=ROBES[Math.floor(R()*ROBES.length)];
  const p=robe[0], b=robe[1], rose="#f2a3a0";
  const g=new THREE.Group();
  const corps=piece(C=>{
    C.sp("vc",.14,p,0,.2,0,[.9,.8,1.45],14);
    C.sp("vc",.09,b,0,.18,.12,[.9,.9,.8],10);
    [[.065,.12],[-.065,.12],[.065,-.12],[-.065,-.12]].forEach(([x,z])=>{
      C.add("vc",G.caps(.035,.07,8),p,x,.08,z); C.sp("vc",.038,b,x,.03,z+.01,[1,.6,1.2],8); });
  });
  corps.castShadow=true; g.add(corps);
  const tete=new THREE.Group(); tete.position.set(0,.32,.2); g.add(tete);
  tete.add(piece(C=>{
    C.sp("vc",.12,p,0,0,0,[1.1,.95,1],14);
    [-1,1].forEach(sg=>{
      C.add("vc",G.cone(.045,.09,6),p,sg*.065,.1,-.01,[0,0,-sg*.3]);
      C.add("vc",G.cone(.026,.05,6),rose,sg*.065,.095,.012,[0,0,-sg*.3]);
      C.sp("vc",.028,PAL.nuitBleu,sg*.045,.01,.1,[.9,1.1,.6],8);
      C.sp("vc",.009,"#ffffff",sg*.045+.009,.022,.115,0,6);
      C.tige("vc",sg*.04,-.03,.11,sg*.14,-.01,.12,.002,"#ffffff",3);
    });
    C.sp("vc",.05,b,0,-.035,.085,[1.2,.75,.8],10);
    C.sp("vc",.014,rose,0,-.015,.118,0,6);
  }));
  const queue=new THREE.Group(); queue.position.set(0,.22,-.18); g.add(queue);
  queue.add(piece(C=>{
    for(let k=0;k<8;k++){ const a=k/7; C.sp("vc",.032-a*.008,k>5?b:p,0,Math.sin(a*1.6)*.22,-a*.16-Math.sin(a*3)*.03,0,8); }
  }));
  gVie.add(g);
  const c={grp:g,corps,tete,queue,t:0,etat:"assis",attente:2,pos:new THREE.Vector3(),cible:new THREE.Vector3(),cap:0,visible:true};
  chat=c; replacerChat();
  return c;
}
function replacerChat(){ if(!chat) return; chat.pos.set(sal.w/2-2.2,0,-sal.d/2+2.2); chat.etat="assis"; chat.attente=2; }
function majChat(dt){
  if(!chat) return;
  const c=chat; c.t+=dt;
  c.queue.rotation.y=Math.sin(c.t*1.6)*.35;
  c.queue.rotation.x=c.etat==="dodo"?.9:Math.sin(c.t*.9)*.1;
  c.tete.rotation.y=c.etat==="dodo"?.4:Math.sin(c.t*.5)*.5;
  c.tete.rotation.z=Math.sin(c.t*7)>.985?.15:0;                        /* coup d'oreille */
  if(c.etat==="marche"){
    const dx=c.cible.x-c.pos.x, dz=c.cible.z-c.pos.z, dist=Math.hypot(dx,dz);
    if(dist<.15){ c.etat=vr(0,1)<.3?"dodo":"assis"; c.attente=c.etat==="dodo"?vr(8,20):vr(3,10); }
    else{ const k=Math.min(1,1.1*dt/dist); c.pos.x+=dx*k; c.pos.z+=dz*k; c.cap=angleVers(c.cap,Math.atan2(dx,dz),1-Math.exp(-dt*8)); }
    c.corps.rotation.x=0; c.corps.scale.y=1; c.tete.position.y=.32;
    c.grp.position.set(c.pos.x,Math.abs(Math.sin(c.t*10))*.02,c.pos.z);
  }else{
    c.attente-=dt;
    const dort=c.etat==="dodo";
    c.corps.rotation.x=dort?0:-.25;
    c.corps.scale.y=dort?.72+Math.sin(c.t*1.8)*.02:1;
    c.tete.position.y=dort?.2:.36;
    c.grp.position.set(c.pos.x,0,c.pos.z);
    if(c.attente<=0){ c.etat="marche"; c.cible.set(vr(-sal.w/2+1,sal.w/2-1),0,vr(-sal.d/2+1,sal.d/2-1)); }
  }
  c.grp.rotation.y=c.cap;
}
function creerPoussiere(){
  const n=160, geo=new THREE.BufferGeometry(), pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ pos[i*3]=vr(-sal.w/2,sal.w/2); pos[i*3+1]=vr(.3,HM-.3); pos[i*3+2]=vr(-sal.d/2,sal.d/2); }
  geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.035,color:lin("#fff0d8"),transparent:true,opacity:.3,depthWrite:false}));
  gVie.add(pts); return pts;
}
function majPoussiere(dt){
  if(!poussiere) return;
  const a=poussiere.geometry.attributes.position, arr=a.array;
  for(let i=0;i<a.count;i++){
    arr[i*3+1]+=dt*.05; arr[i*3]+=Math.sin(horloge*.35+i)*dt*.04;
    if(arr[i*3+1]>HM-.2){ arr[i*3+1]=.25; arr[i*3]=vr(-sal.w/2,sal.w/2); arr[i*3+2]=vr(-sal.d/2,sal.d/2); }
  }
  a.needsUpdate=true;
  poussiere.material.opacity=.04+(jourLisse||0)*.28;
}
const CONFETTIS=[PAL.corail,PAL.moutarde,PAL.sauge,PAL.encreClair,PAL.terreClair,"#8fd3ff","#ffffff"];
function celebrer(o){
  if(!scene) return;
  const ok=o===undefined?true:(o&&typeof o==="object"?o.ok!==false:!!o);
  const n=ok?110:30, geo=new THREE.BufferGeometry();
  const pos=new Float32Array(n*3), col=new Float32Array(n*3), vel=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    pos[i*3]=vr(-sal.w*.3,sal.w*.3); pos[i*3+1]=HM-.2; pos[i*3+2]=vr(-sal.d*.3,sal.d*.3);
    const c=lin(ok?vp(CONFETTIS):vp([PAL.gris3,PAL.gris4,PAL.terreFonce]));
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    vel[i*3]=vr(-.6,.6); vel[i*3+1]=vr(-.3,-1.3); vel[i*3+2]=vr(-.6,.6);
  }
  geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  geo.setAttribute("color",new THREE.BufferAttribute(col,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.1,vertexColors:true,transparent:true}));
  racine.add(pts); confettis.push({pts,vel,vie:0});
}
function majConfettis(dt){
  for(let i=confettis.length-1;i>=0;i--){
    const c=confettis[i]; c.vie+=dt;
    const a=c.pts.geometry.attributes.position, arr=a.array, v=c.vel;
    for(let k=0;k<a.count;k++){
      arr[k*3]+=v[k*3]*dt; arr[k*3+1]=Math.max(.02,arr[k*3+1]+v[k*3+1]*dt); arr[k*3+2]+=v[k*3+2]*dt;
      v[k*3+1]-=dt*.5; v[k*3]*=.995; v[k*3+2]*=.995;
    }
    a.needsUpdate=true;
    c.pts.material.opacity=clamp(1-c.vie/3.6,0,1);
    if(c.vie>3.6){ racine.remove(c.pts); c.pts.geometry.dispose(); c.pts.material.dispose(); confettis.splice(i,1); }
  }
}
/* ombres de contact des acteurs mobiles, en un seul dessin instancié */
const _qPlat=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
function ombreA(i,x,z,s){ _v.set(x,.011,z); _s.set(s,s,1); _m4.compose(_v,_qPlat,_s); ombresDyn.setMatrixAt(i,_m4); }
function majOmbresDyn(){
  let n=0; const max=ombresDyn.instanceMatrix.count;
  persos.forEach(c=>{ if(c.visible&&n<max) ombreA(n++,c.pos.x,c.pos.z,c.assis?.5:.68); });
  avatars.forEach(av=>{ if(n<max) ombreA(n++,av.p.pos.x,av.p.pos.z,.7); });
  if(chat&&n<max) ombreA(n++,chat.pos.x,chat.pos.z,.5);
  ombresDyn.count=n; ombresDyn.instanceMatrix.needsUpdate=true;
}

/* =====================================================================
   BOUCLE ET INTERACTION
   ===================================================================== */
function update(dt,dtReel){
  if(!scene||typeof S==="undefined"||!S) return;
  if(dtReel===undefined) dtReel=dt;
  horloge+=dtReel;
  tCles+=dtReel; if(tCles>.35){ tCles=0; construire(); }
  majLumiere(dtReel);
  majPersos(dt,dtReel);
  animerAvatars(dtReel);
  tEcrans+=dtReel; if(tEcrans>.08){ tEcrans=0; majEcrans(); }
  majConfettis(dtReel);
  majChat(dt);
  majPoussiere(dtReel);
  if(platine) platine.rotation.y-=dtReel*3.4;
  majOmbresDyn();
}
function rendu(){ majCoupe(); renderer.render(scene,camera); }
const _cands=[];
function viser(nx,ny){
  _cands.length=0;
  persos.forEach(c=>{ if(c.visible&&c.grp.visible) _cands.push(c.grp); });
  if(!_cands.length) return null;
  ray2.set(nx,ny); raycaster.setFromCamera(ray2,camera);
  const hits=raycaster.intersectObjects(_cands,true);
  if(!hits.length) return null;
  let o=hits[0].object;
  while(o&&o.userData.did===undefined) o=o.parent;
  return o?o.userData.did:null;
}
function surligner(did){
  survol=did;
  persos.forEach(c=>{ const m=c.did===did?MATS.survol:MATS.vc; for(let i=0;i<c.meshes.length;i++) c.meshes[i].material=m; });
}
const _ecr=new THREE.Vector3();
function ecranDe(did){
  const c=persos.get(did); if(!c||!c.visible) return null;
  _ecr.set(c.pos.x,1.5,c.pos.z).project(camera);
  const el=renderer.domElement;
  return {x:(_ecr.x*.5+.5)*el.clientWidth, y:(-_ecr.y*.5+.5)*el.clientHeight, z:_ecr.z};
}
function dimensions(){ return sal; }
function infos(){
  const r=renderer&&renderer.info?renderer.info.render:{};
  return {appels:r.calls,triangles:r.triangles,persos:persos.size,avatars:avatars.size,ecrans:ecrans.length};
}

API={init,construire,update,rendu,taille,viser,surligner,ecranDe,celebrer,dimensions,
  majAvatars,solA,bornes,infos,
  idAvatarLocal:null,
  get camera(){return camera}, get renderer(){return renderer}, get scene(){return scene},
  get nomSalle(){ return SALLES[clamp((typeof S!=="undefined"&&S&&S.up&&S.up.bureau)|0,0,SALLES.length-1)].nom; },
  /* facteur de luminosité lissé, 0 = nuit noire, 1 = plein soleil */
  get lumiere(){return jourLisse}};
return API;
})();
if(typeof window!=="undefined") window.World=World;
