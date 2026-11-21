/* ===================================================================
   SIMULATION : moteur de jeu, indépendant de l'affichage.
   Aucun accès au DOM, à l'audio ni au réseau ici : tout ce qui doit se
   voir ou s'entendre passe par la file d'effets S.fx (voir CONTRACT.md).
   Seul point d'entrée des actions : cmd(nom, args, joueurId).
   L'équilibrage vit en jours de jeu (tests : node tests/sim-bot.js).
   =================================================================== */
"use strict";

/* ---------- RNG ----------
   La sim tire ses nombres d'un mulberry32 dont l'état vit dans S.rng :
   une partie est rejouable à graine égale et l'hôte seul fait avancer le
   hasard. Le visuel (world.js, ui.js) utilise vrnd/vri/vpick (Math.random). */
function _alea(){
  if(!S || typeof S.rng!=="number") return Math.random();
  let t=(S.rng=(S.rng+0x6D2B79F5)>>>0);
  t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
}
const rnd=(a,b)=>a+_alea()*(b-a);
const ri=(a,b)=>Math.floor(rnd(a,b+1));
const pick=a=>a[Math.floor(_alea()*a.length)];
function vrnd(a,b){ return a+Math.random()*(b-a); }
function vri(a,b){ return Math.floor(vrnd(a,b+1)); }
function vpick(a){ return a[Math.floor(Math.random()*a.length)]; }

/* ---------- utilitaires ---------- */
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const eur=n=>(n<0?"-":"")+Math.abs(Math.round(n)).toLocaleString("fr-FR")+" €";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const stars=n=>"★".repeat(n)+"<span style='color:#3a3a46'>"+"★".repeat(10-n)+"</span>";
let UID=1; const uid=()=>UID++;

/* ---------- données ---------- */
const TYPES=[
 {id:"logo",    nom:"Logo",                  crea:3,tech:2,charge:34, vpp:1.35,
  pitchs:["Il faut que ça « pop ».","Minimaliste, mais avec beaucoup de choses dedans.","Un logo simple qui raconte toute l'histoire de la boîte depuis 1887."]},
 {id:"affiche", nom:"Affiche",               crea:4,tech:2,charge:30, vpp:1.10,
  pitchs:["Façon Saul Bass, mais en plus coloré.","Bauhaus, mais chaleureux.","Toutes les infos en gros. Le reste aussi en gros."]},
 {id:"illu",    nom:"Illustration",          crea:5,tech:2,charge:44, vpp:1.00,
  pitchs:["Un style unique, comme ce qu'on a vu en ligne hier soir.","Un monolithe noir dans un champ de tournesols. Pourquoi pas.","Plus de licornes. Non, moins. Non, plus."]},
 {id:"retouche",nom:"Retouche photo",        crea:2,tech:4,charge:24, vpp:0.80,
  pitchs:["Enlever les reflets, les rides et le cousin Gérard.","« Juste un petit détourage » sur 300 photos.","Remplacer le ciel gris par un ciel « plus vacances »."]},
 {id:"edition", nom:"Édition / mise en page",crea:3,tech:3,charge:56, vpp:0.88,
  pitchs:["Catalogue de 120 pages, textes en retard, impression lundi.","Justifié, sans césure, sans lézardes. Bonne chance.","Lorem ipsum en attendant les vrais textes (qui ne viendront jamais)."]},
 {id:"packaging",nom:"Packaging",            crea:4,tech:4,charge:70, vpp:1.00,
  pitchs:["Une boîte qui se démarque en rayon, mais pas trop.","Le gabarit de découpe est fourni... en JPEG.","Doit tenir dans la main et dans le budget."]},
 {id:"ui",      nom:"Site web / UI",         crea:3,tech:5,charge:82, vpp:0.95,
  pitchs:["Le bouton doit être plus « cliquable ».","Pas besoin de page 404, le client dit qu'il n'y aura pas d'erreur.","Responsive, accessible, et en mode sombre « comme tout le monde »."]},
 {id:"motion",  nom:"Motion design",         crea:4,tech:5,charge:78, vpp:1.05,
  pitchs:["Un générique façon années 60, en 15 secondes chrono.","Il faut que le logo « vole un peu ».","De l'effet « waouh » sur une vidéo de six secondes."]},
 {id:"identite",nom:"Identité de marque",    crea:5,tech:4,charge:104,vpp:1.15,
  pitchs:["Une identité intemporelle, livrable vendredi.","Inspirée de la grille suisse, mais fun.","Le client a déjà choisi sa couleur : « toutes »."]},
 {id:"charte",  nom:"Brand book complet",    crea:5,tech:5,charge:132,vpp:1.10,
  pitchs:["80 pages que personne ne lira (sauf toi).","Toutes les déclinaisons, du stylo au dirigeable.","Un chapitre entier sur la zone de protection du logo."]},
];
/* ppt = euros par point de charge : c'est la vraie courbe de progression */
const TIERS=[
 {nom:"Particulier",         rep:0,   ppt:11,  exig:44, dlm:1.35},
 {nom:"Commerce local",      rep:16,  ppt:18,  exig:51, dlm:1.20},
 {nom:"Startup",             rep:42,  ppt:28,  exig:58, dlm:1.05},
 {nom:"PME",                 rep:88,  ppt:42,  exig:65, dlm:0.98},
 {nom:"Agence",              rep:155, ppt:62,  exig:70, dlm:0.92},
 {nom:"Marque nationale",    rep:250, ppt:92,  exig:76, dlm:0.86},
 {nom:"Groupe international",rep:380, ppt:135, exig:81, dlm:0.80},
];
const CL_A=["Atelier","Maison","Studio","Café","Cabinet","Brasserie","Fromagerie","Librairie","Boulangerie","Galerie","Ferme","Épicerie","Domaine","Clinique","Garage","École","Théâtre","Cave"];
const CL_B=["Nova","Kova","Orme","Lumen","Merci","Bloom","Sillon","Pivoine","Cobalt","Renard","Sept","Verso","Halo","Basalte","Oria","Pampa","Vertige","Nimbus","Sables","Tandem","Ozone","Chorus","Bézier","Kerning","Sérif","Vecteur"];
const CL_C=["Labs","& Fils","Studio","Group","Collectif","Industries","Paris","Nord","Union","& Co","Digital","Global","France","International","Ventures"];
/* noms de clients clins d'œil (tous fictifs) */
const CL_PUN=["Kerning & Fils","Pixel Parfait","Bauhaus Burger","Helvète Fondue","Lorem Ipsum Immobilier","Café 404",
 "Garamond Garage","Sérif Saloon","Nuancier & Pastis","Comique Sans Traiteur","Papyrus Voyages","Gradient Gourmand",
 "La Grille Suisse","Didot Dentaire","Calque sur Calque","Canard en Plastique SARL","Boulangerie Bézier","Rosebud Luges",
 "Flux Capaciteur Énergie","Brasserie Sauvegarde Rapide","Agence Game Over","Le Gâteau Est Un Mensonge","Lapin Blanc Conseil",
 "Pilule Rouge Pharma","Plomberie Moustache & Frère","Taxi Travis","Vaisseau Nostromo Fret","Monolithe Immobilier",
 "Ctrl+Z Assurances","Make It Pop Glaces","Vingt-Quatre Images Seconde","Hôtel Grille Basse","Points de Suspension & Co"];
const PRENOMS=["Léa","Hugo","Nina","Sacha","Camille","Yanis","Maëlle","Théo","Jade","Enzo","Zoé","Noah","Lila","Adam","Inès","Milo","Anaïs","Rayan","Chloé","Basile","Salomé","Ilan","Louna","Gaspard","Ambre","Naïm","Elsa","Tom","Roxane","Marius","Nour","Aaron","Massimo","Paula","Saul","Milton","Adrian","April"];
const NOMS=["Bertin","Kessler","Nguyen","Marchand","Oliveira","Dubois","Ferrand","Sow","Lombard","Petit","Rossi","Benali","Chevalier","Vasseur","Klein","Moreno","Bouchard","Lemoine","Dacosta","Aubert","Vigneron","Salmon","Tanguy","Ozturk","Garamond","Didot","Bodoni"];
/* rares : hommages aux grands noms du graphisme, en initiales */
const HOMMAGES=[["Paul","R."],["Massimo","V."],["Paula","S."],["Saul","B."],["Milton","G."],["Josef","M.-B."],["Adrian","F."],["April","G."],["Neville","B."],["Herb","L."],["Wim","C."],["Otl","A."],["Susan","K."],["Margaret","C."]];
const ARCH=[
 {nom:"Directeur artistique",  b:{crea:3,tech:0,vit:0},mul:1.55},
 {nom:"Graphiste généraliste", b:{crea:1,tech:1,vit:1},mul:1.00},
 {nom:"Typographe",            b:{crea:2,tech:1,vit:0},mul:1.20},
 {nom:"Motion designer",       b:{crea:1,tech:3,vit:0},mul:1.40},
 {nom:"Illustrateur",          b:{crea:3,tech:0,vit:1},mul:1.25},
 {nom:"UI designer",           b:{crea:1,tech:2,vit:1},mul:1.30},
 {nom:"Exécutant PAO",         b:{crea:0,tech:2,vit:3},mul:0.85},
 {nom:"Alternant",             b:{crea:0,tech:0,vit:1},mul:0.35},
];
/* Améliorations. Forme commune : {nom, icon, desc[5], cout[5], eff[5], ...effets}.
   eff[n] = texte court de l'effet au niveau n, pour un affichage générique.
   deco:true = ligne purement cosmétique (aucune ici). */
const UPS={
 bureau:{nom:"Bureau",icon:"▦",
   desc:["Coin du salon, une plante morte.","Petit local, deux fenêtres.","Plateau en open space.","Loft avec mur de références.","Étage entier, verrière, néons."],
   cap:[2,3,5,7,10], loyer:[90,260,600,1150,2100], cout:[0,3200,11000,30000,78000],
   eff:["Capacité 2 · loyer 90 €/sem","Capacité 3 · loyer 260 €/sem","Capacité 5 · loyer 600 €/sem","Capacité 7 · loyer 1 150 €/sem","Capacité 10 · loyer 2 100 €/sem"]},
 materiel:{nom:"Matériel",icon:"⌨",
   desc:["Portable qui chauffe.","Tour montée maison.","Station de travail calibrée.","Grosse carte graphique et tablette pro.","Ferme de rendu maison."],
   mul:[1,1.16,1.34,1.56,1.82], cout:[0,1400,5200,16000,44000],
   eff:["Vitesse ×1,00","Vitesse ×1,16","Vitesse ×1,34","Vitesse ×1,56","Vitesse ×1,82"]},
 logiciel:{nom:"Licences",icon:"◧",
   desc:["Freeware et versions d'essai.","Suite de logiciels abordable.","Suite créative complète.","Suite complète et plugins premium.","Tout, IA comprise, et une fonderie maison."],
   q:[0,4,8,13,19], sem:[0,55,150,330,690], cout:[0,900,3600,12000,34000],
   eff:["Qualité +0","Qualité +4 · 55 €/sem","Qualité +8 · 150 €/sem","Qualité +13 · 330 €/sem","Qualité +19 · 690 €/sem"]},
 cafe:{nom:"Confort",icon:"◉",
   desc:["Café soluble.","Cafetière filtre.","Machine à grains.","Machine, canapé et plantes.","Barista, sieste, salle de sport."],
   reg:[17,22,28,35,45], cout:[0,600,2400,8000,22000],
   eff:["Récupération 17/j","Récupération 22/j","Récupération 28/j","Récupération 35/j","Récupération 45/j"]},
 marketing:{nom:"Visibilité",icon:"◈",
   desc:["Bouche-à-oreille.","Portfolio en ligne à jour.","Réseaux actifs et newsletter.","Presse spécialisée.","Studio culte, on te supplie."],
   flux:[1.0,1.45,1.95,2.6,3.4], tb:[0,0,1,1,2], cout:[0,800,3400,11500,32000],
   eff:["Flux de briefs ×1,00","Flux de briefs ×1,45","Flux ×1,95 · gros clients","Flux ×2,60 · gros clients","Flux ×3,40 · très gros clients"]},
 /* puits d'argent de fin de partie : réputation et briefs légendaires */
 prestige:{nom:"Prestige",icon:"✦",
   desc:["Pas encore de vitrine.","Salle d'expo au rez-de-chaussée.","Prix de design encadrés au mur.","Agence à New York.","Rétrospective au musée."],
   repMul:[1,1.06,1.12,1.2,1.3], repJour:[0,0.05,0.1,0.16,0.24], leg:[1,1.4,1.8,2.4,3], sem:[0,120,300,650,1200],
   cout:[0,24000,65000,150000,320000],
   eff:["Aucun effet","Réputation +6 % · +0,05/j · 120 €/sem","Réputation +12 % · +0,1/j · 300 €/sem","Réputation +20 % · +0,16/j · 650 €/sem","Réputation +30 % · +0,24/j · 1 200 €/sem"]},
};
const effetUp=(k,n)=>{const u=UPS[k]; if(!u)return ""; n=n===undefined?S.up[k]:n; return (u.eff&&u.eff[n])||"";};

/* Évènements aléatoires (un jour sur cinq environ).
   k : proj (f(p) sur un projet en cours) | rep (v) | cash (v × montant plafonné)
       | moral (v pour toute l'équipe) | energie (v) | brief (nouveau brief bien payé) */
const EVENTS=[
 {t:"Le client veut voir « le logo plus gros ».",k:"proj",f:p=>{p.qBonus-=4;p.charge*=1.06},c:"y"},
 {t:"Le client a envoyé son logo en JPEG 200×90 copié depuis un traitement de texte.",k:"proj",f:p=>{p.charge*=1.08},c:"y"},
 {t:"Nuit blanche : coup de génie sur un projet.",k:"proj",f:p=>{p.qBonus+=9},c:"g"},
 {t:"Disque dur mort, sauvegarde d'avant-hier.",k:"proj",f:p=>{p.avance*=0.78},c:"r"},
 {t:"Le client change de nom de marque en cours de route.",k:"proj",f:p=>{p.avance*=0.85;p.deadline+=2},c:"r"},
 {t:"« On peut le faire en Comic Sans ? » Une heure de négociation.",k:"proj",f:p=>{p.charge*=1.05;p.qBonus-=2},c:"y"},
 {t:"Le stagiaire a supprimé final_FINAL_v3_def.psd. Ctrl+Z ne marche pas dans la vraie vie.",k:"proj",f:p=>{p.avance*=0.82},c:"r"},
 {t:"Le PC a planté juste avant la sauvegarde.",k:"proj",f:p=>{p.avance*=0.92},c:"r"},
 {t:"Coupure du Wi-Fi : l'équipe redécouvre le crayon. Les croquis sont meilleurs.",k:"proj",f:p=>{p.qBonus+=4;p.avance*=0.96},c:"y"},
 {t:"« Il me faut ça pour hier. » La deadline avance d'un jour.",k:"proj",f:p=>{p.deadline=Math.max(S.jour+1,p.deadline-1)},c:"r"},
 {t:"Le client veut « quelque chose de plus pop, mais sobre ».",k:"proj",f:p=>{p.charge*=1.07},c:"y"},
 {t:"Brief façon Kubrick : tout doit être parfaitement symétrique.",k:"proj",f:p=>{p.charge*=1.06;p.qBonus+=4},c:"y"},
 {t:"Le client adore la palette pastel « très Wes Anderson ». Validé du premier coup.",k:"proj",f:p=>{p.qBonus+=5},c:"g"},
 {t:"Expliquer le problème au canard en plastique du bureau a tout débloqué.",k:"proj",f:p=>{p.qBonus+=3;p.charge*=0.95},c:"g"},
 {t:"« C'est validé ! » Puis tout est remis en question le lendemain.",k:"proj",f:p=>{p.avance*=0.9},c:"y"},
 {t:"Article dans une revue de design : le studio est cité.",k:"rep",v:6,c:"g"},
 {t:"Un ancien client te recommande.",k:"rep",v:4,c:"g"},
 {t:"Concours d'affiche remporté par le studio.",k:"rep",v:9,c:"g"},
 {t:"Ton portfolio passe en une d'un site d'inspiration.",k:"rep",v:7,c:"g"},
 {t:"Le Pantone de l'année tombe pile sur ta dernière identité. Visionnaire.",k:"rep",v:5,c:"g"},
 {t:"Un client reprend ton affiche... en Papyrus. Et il te crédite.",k:"rep",v:-3,c:"y"},
 {t:"Litige sur une police non licenciée.",k:"cash",v:-1,c:"r"},
 {t:"Régularisation URSSAF.",k:"cash",v:-1,c:"r"},
 {t:"Le lorem ipsum est parti à l'impression. Réimpression à tes frais.",k:"cash",v:-0.8,c:"r"},
 {t:"Un client propose de te payer « en visibilité ». La facture attendra.",k:"cash",v:-0.6,c:"y"},
 {t:"Vente de presets sur ta boutique en ligne.",k:"cash",v:1,c:"g"},
 {t:"Chèque d'un vieux client enfin encaissé.",k:"cash",v:1,c:"g"},
 {t:"Ton tuto « 42 astuces de crénage » devient viral.",k:"cash",v:1.2,c:"g"},
 {t:"L'équipe se prend une soirée. Moral en hausse.",k:"moral",v:9,c:"g"},
 {t:"Réunion de trois heures qui aurait pu être un mail.",k:"moral",v:-7,c:"y"},
 {t:"Un concurrent débauche du monde : ambiance tendue.",k:"moral",v:-9,c:"r"},
 {t:"Quelqu'un a tapé ↑↑↓↓←→←→BA sur un clavier du studio. Rien ne s'est débloqué, mais tout le monde rigole.",k:"moral",v:6,c:"g"},
 {t:"Débat houleux : Helvetica ou Arial ? Deux camps, zéro vainqueur.",k:"moral",v:-4,c:"y"},
 {t:"Soirée ciné au studio : marathon de génériques des années 60.",k:"moral",v:7,c:"g"},
 {t:"Machine à café en panne. Lundi éternel.",k:"energie",v:-15,c:"r"},
 {t:"Quelqu'un a ramené des viennoiseries. Le bureau sent le croissant.",k:"energie",v:12,c:"g"},
 {t:"Un client en costume « va te faire une offre que tu ne pourras pas refuser ». Nouveau brief bien payé.",k:"brief",c:"g"},
];
/* briefs légendaires : clients parodiques, rares, très bien payés */
const LEGENDES=[
 {id:"budapeste",client:"Grand Hôtel Budapeste",type:"identite",pitch:"Palette pastel, symétrie absolue, et un groom dans chaque coin."},
 {id:"monolithe",client:"Monolithe Noir & Associés",type:"logo",pitch:"Un logo qui donne envie d'évoluer. Musique de Strauss fournie."},
 {id:"overlook",client:"Hôtel Overlook",type:"affiche",pitch:"Affiche de réouverture. Moquette à motifs obligatoire. Évitez la chambre 237."},
 {id:"arrakis",client:"Épices d'Arrakis",type:"packaging",pitch:"Un emballage étanche au sable. L'épice doit couler."},
 {id:"lebowski",client:"Bowling Le Duc",type:"identite",pitch:"Une identité qui tient la pièce ensemble, comme un bon tapis."},
 {id:"corleone",client:"Huiles Corleone & Fils",type:"charte",pitch:"Une offre que tu ne peux pas refuser.",insistant:true},
 {id:"skynette",client:"Skynette Systèmes",type:"ui",pitch:"Une interface qui ne deviendra pas consciente. Promis."},
 {id:"nostromo",client:"Compagnie Nostromo",type:"motion",pitch:"Un générique spatial. Dans l'espace, personne ne t'entend réclamer une facture."},
 {id:"guide42",client:"Le Guide Galactique",type:"edition",pitch:"Couverture en grosses lettres amicales : PAS DE PANIQUE. Réponse : 42."},
];
const JALONS=[
 {id:"j1",  nom:"Hello World",        test:()=>S.livres>=1,   txt:"Premier projet livré.",             rep:2, cash:0},
 {id:"j5",  nom:"High Five",          test:()=>S.livres>=5,   txt:"Cinq projets au compteur.",         rep:4, cash:400},
 {id:"j20", nom:"Vingt sur vingt",    test:()=>S.livres>=20,  txt:"Vingt projets livrés.",             rep:8, cash:2500},
 {id:"j50", nom:"Machine à pixels",   test:()=>S.livres>=50,  txt:"Cinquante projets. Une machine.",   rep:15,cash:9000},
 {id:"e4",  nom:"Quatuor",            test:()=>S.equipe.length>=4,txt:"Une vraie équipe de quatre.",   rep:5, cash:0},
 {id:"q90", nom:"Anthologie",         test:()=>S.meilleure>=90,txt:"Une pièce notée 90+.",             rep:10,cash:1500},
 {id:"q98", nom:"Pixel perfect",      test:()=>S.meilleure>=98,txt:"Une pièce notée 98+. On l'encadre.",rep:6, cash:3000},
 {id:"ca50",nom:"Premier coffre",     test:()=>S.ca>=50000,   txt:"50 000 € de chiffre d'affaires.",   rep:6, cash:0},
 {id:"ca250",nom:"Licorne de quartier",test:()=>S.ca>=250000, txt:"250 000 € de chiffre d'affaires.",  rep:14,cash:0},
 {id:"max", nom:"Tout équipé",        test:()=>S.up.bureau>=4&&S.up.logiciel>=4,txt:"Studio entièrement équipé.",rep:12,cash:0},
 {id:"leg", nom:"Légende vivante",    test:()=>S.legendes.length>=1,txt:"Un brief légendaire livré.",  rep:5, cash:0},
 {id:"nyc", nom:"Big Apple",          test:()=>S.up.prestige>=3,txt:"Une agence à New York.",          rep:6, cash:0},
];
const nbJalons=()=>JALONS.filter(j=>S.jalons[j.id]).length;
const OEUVRES=["Bleu Klein n°","Étude en Helvetica n°","Grille suisse n°","Variation Bauhaus n°","Composition en Didot n°",
 "Crénage parfait n°","Hommage aux années 60 n°","Rouge Pantone n°","Lorem ipsum n°","Nombre d'or n°","Noir monolithe n°","Bézier sauvage n°"];

/* ---------- réglages ---------- */
const SEUIL_FAILLITE=-6000;            /* trésorerie sous laquelle le studio dépose le bilan */
const COUT_RELANCE=400;                /* relancer l'annonce de recrutement */
const AUG_DELAI=7;                     /* jours entre deux augmentations d'une même personne */
const OUBLI_JOURS=12;                  /* sans livraison au-delà, la réputation s'érode */
const REVISION_MARGE=4;                /* révision si qualité < exigence - marge */
const VICTOIRE={rep:525,ca:720000};
const STAGNATION={debut:180,semaines:8};  /* fondateur seul sous le niveau PME : la partie finit par s'arrêter */
const KEY="studio-online-v1";
const KEY_ANCIENNE="studio-tycoon-3d-v1";

/* ---------- état ---------- */
let S=null;
let dirty=true;                       /* l'interface doit être reconstruite */
let worldDirty=true;                  /* la scène 3D doit être reconstruite */
let _worldRevVu=-1;                   /* côté client : dernière révision 3D appliquée */
const markUI=()=>{dirty=true};
const markWorld=()=>{worldDirty=true;dirty=true;if(S)S.worldRev=(S.worldRev||0)+1;};

const tierIdx=()=>{let i=0;TIERS.forEach((t,k)=>{if(S.rep>=t.rep)i=k});return i};
const capacite=()=>UPS.bureau.cap[S.up.bureau];
const loyer=()=>UPS.bureau.loyer[S.up.bureau];
const licences=()=>UPS.logiciel.sem[S.up.logiciel];
const entretien=()=>UPS.prestige.sem[S.up.prestige||0];
const masseSal=()=>S.equipe.reduce((a,d)=>a+d.salaire,0);
const chargesSem=()=>loyer()+licences()+entretien()+masseSal();
const libre=d=>!d.proj&&d.repos<=0&&d.form<=0;
const estFondateur=d=>!!(d&&(d.fondateur||d.prenom==="Toi"));
const nomComplet=d=>(d.prenom+" "+d.nom).trim();
const avColor=d=>"hsl("+d.hue+" 62% 62%)";
const fit=(d,p)=>(d.crea*p.type.crea+d.tech*p.type.tech)/(p.type.crea+p.type.tech);
const qualite=p=>p.qPts>0?cl(p.qSum/p.qPts+p.qBonus,0,100):0;
const projetFini=p=>p.avance>=p.charge-1e-6;
/* fraction de la journée écoulée, 0 = minuit : pilote le cycle jour/nuit */
const heure=()=>S.jour-Math.floor(S.jour);
const coutFormation=(d,stat)=>Math.round(550*Math.pow(1.52,d[stat]-1));

/* ---------- effets (file S.fx) ---------- */
function fx(t,data,to){
  if(!S)return;
  if(!S.fx)S.fx=[];
  const e=Object.assign({id:++S.fxId,t:t},data||{});
  if(to)e.to=to;
  S.fx.push(e);
  if(S.fx.length>60)S.fx.splice(0,S.fx.length-60);
}
function notifier(titre,txt,c,to){ fx("toast",{titre:titre,txt:txt,c:c||""},to); }
function sonner(f,dur,type,to){ fx("bip",{f:f,dur:dur||.12,type:type||"sine"},to); }
function log(txt,c){
  S.journal.unshift({j:Math.floor(S.jour),t:txt,c:c||"m"});
  if(S.journal.length>90)S.journal.pop();
  fx("log",{txt:txt,c:c||"m"});
  dirty=true;
}
/* nom du joueur entre parenthèses, seulement s'il y a plusieurs joueurs */
function qui(jid){
  if(!S.joueurs||Object.keys(S.joueurs).length<2)return "";
  const j=S.joueurs[jid]; return j?" ("+j.nom+")":"";
}

/* ---------- création ---------- */
function nouveauDesigner(niv,hero){
  const a=hero?{nom:"Fondateur",b:{crea:2,tech:2,vit:1},mul:0}:pick(ARCH);
  const base=1.9+niv*0.85;
  let prenom=hero?"Toi":pick(PRENOMS), nom=hero?"":pick(NOMS);
  if(!hero&&_alea()<0.08){ const h=pick(HOMMAGES); prenom=h[0]; nom=h[1]; }
  const d={
    id:uid(), prenom:prenom, nom:nom, role:a.nom, fondateur:!!hero,
    crea:cl(Math.round(base+a.b.crea+rnd(-.6,1.4)),1,10),
    tech:cl(Math.round(base+a.b.tech+rnd(-.6,1.4)),1,10),
    vit :cl(Math.round(base+a.b.vit +rnd(-.6,1.4)),1,10),
    energie:100, moral:72, salaire:0, hue:ri(0,359),
    proj:null, repos:0, form:0, _form:null, augJ:-99,
    /* apparence 3D, tirée à la création pour rester stable */
    look:{peau:pick(["#e8c4a2","#c98f63","#8d5a3b","#f2d7bd","#5f3a26","#d8a878"]),
          cheveux:pick(["#1c1a19","#3a2a1c","#6b4423","#c9a227","#8a2b2b","#2f4f6f","#d94f8a","#e8e8ea"]),
          haut:"hsl("+ri(0,359)+" 56% 42%)", bas:pick(["#2a2f3a","#37312c","#22262e","#3a2f3a"]),
          taille:rnd(.92,1.08)},
    poste:-1                          /* index du bureau attribué dans la scène */
  };
  if(hero){d.crea=4;d.tech=4;d.vit=4;d.moral=85;}
  const pw=d.crea+d.tech+d.vit;
  d.salaire=Math.round((60+pw*pw*1.55)*a.mul/10)*10;
  d.prime=Math.round(d.salaire*rnd(1.4,2.6)/10)*10;
  return d;
}
const nomStudio=()=>pick(["Atelier "+pick(CL_B),pick(CL_B)+" Studio","Studio "+pick(CL_B),pick(CL_B)+" & "+pick(CL_B)]);

function etatVide(){
  return {
    version:1, rng:1, fxId:0, fx:[], worldRev:0,
    nom:"Studio", jour:1.36, argent:2200, rep:0, auto:false,
    session:{vitesse:1, pause:false, cran:1},
    joueurs:{hote:{nom:"Hôte",couleur:"#f2c14e"}},
    fini:0, finRaison:"", victoireVue:false, faillites:0, seuilFaillite:SEUIL_FAILLITE, stagnation:0,
    briefs:[], projets:[], equipe:[], candidats:[], journal:[], palmares:[], jalons:{}, legendes:[],
    up:{bureau:0,materiel:0,logiciel:0,cafe:0,marketing:0,prestige:0},
    livres:0, rates:0, revisions:0, ca:0, charges:0, meilleure:0,
    tProchainBrief:1.2, derniereLivraison:1, oubli:false
  };
}
/* compatibilité : S.vitesse / S.pause redirigés vers S.session (non sérialisés) */
function lierS(){
  if(!S)return;
  ["vitesse","pause"].forEach(k=>{
    if(Object.prototype.hasOwnProperty.call(S,k)&&!Object.getOwnPropertyDescriptor(S,k).get){
      if(S.session&&S.session[k]===undefined)S.session[k]=S[k];
      delete S[k];
    }
    Object.defineProperty(S,k,{configurable:true,enumerable:false,
      get(){return S.session[k];}, set(v){S.session[k]=v;}});
  });
}

function newGame(seed,joueurs){
  const ancien=S;
  UID=1;
  S=etatVide();
  S.rng=(typeof seed==="number"&&isFinite(seed))?(seed>>>0):((Date.now()^Math.floor(Math.random()*4294967296))>>>0);
  if(ancien){ S.fxId=ancien.fxId||0; if(ancien.joueurs)S.joueurs=ancien.joueurs; if(ancien.session)S.session.vitesse=ancien.session.vitesse||1; }
  if(joueurs)S.joueurs=joueurs;
  S.nom=nomStudio();
  lierS();
  S.equipe.push(nouveauDesigner(0,true));
  for(let i=0;i<3;i++) genererBrief();
  refreshCandidats();
  attribuerPostes();
  log("Bienvenue chez "+S.nom+". Prends un brief, fais du beau, encaisse.","a");
  markWorld();
  return S;
}

/* ---------- postes de travail ---------- */
/* chaque membre occupe un bureau ; on comble les trous à chaque changement d'effectif */
function attribuerPostes(){
  const pris=new Set();
  S.equipe.forEach(d=>{ if(d.poste>=0 && d.poste<capacite() && !pris.has(d.poste)) pris.add(d.poste); else d.poste=-1; });
  S.equipe.forEach(d=>{
    if(d.poste>=0)return;
    for(let i=0;i<capacite();i++) if(!pris.has(i)){ d.poste=i; pris.add(i); break; }
  });
  markWorld();
}

/* ---------- génération ---------- */
const meilleurFit=type=>S.equipe.reduce((m,d)=>Math.max(m,(d.crea*type.crea+d.tech*type.tech)/(type.crea+type.tech)),0);
const briefAtteignable=b=>b.diff<=meilleurFit(b.type)+0.5;
function nomClient(){
  if(_alea()<0.22) return pick(CL_PUN);
  return pick(CL_A)+" "+pick(CL_B)+(_alea()<.35?" "+pick(CL_C):"");
}
function genererBrief(opts){
  opts=opts||{};
  if(S.briefs.length>=9)return null;
  const ti=tierIdx();
  /* brief légendaire : rare, à partir du niveau Startup, un seul à la fois */
  if(!opts.normal && ti>=2){
    const restantes=LEGENDES.filter(l=>!S.legendes.includes(l.id)
      && !S.briefs.some(b=>b.leg===l.id) && !S.projets.some(p=>p.leg===l.id));
    const enCours=S.briefs.some(b=>b.leg)||S.projets.some(p=>p.leg);
    if(restantes.length && !enCours && _alea()<0.035*UPS.prestige.leg[S.up.prestige||0]) return genererLegende(pick(restantes));
  }
  let t=ti; const r=_alea();
  if(r<0.24) t=Math.max(0,ti-1);
  else if(r>0.86) t=Math.min(TIERS.length-1,ti+1+UPS.marketing.tb[S.up.marketing]);
  const tier=TIERS[t];
  const type=pick(TYPES.filter(x=>t>=2||x.charge<=(t===0?60:95)));
  let diff=cl(Math.round(rnd(1.5,4)+t*0.9),1,10);
  /* jamais de cul-de-sac : au moins un brief à la portée de la meilleure personne */
  if(!S.briefs.some(briefAtteignable) && diff>meilleurFit(type)+0.5)
    diff=cl(Math.round(meilleurFit(type)-rnd(0,1)),1,10);
  const charge=Math.round(type.charge*rnd(.85,1.2)*(1+diff*0.05)*(1+t*0.5));
  let budget=Math.round(charge*tier.ppt*type.vpp*(0.85+diff*0.035)*rnd(.88,1.14)/10)*10;
  if(opts.bonus) budget=Math.round(budget*opts.bonus/10)*10;
  const jours=Math.max(3,Math.round((charge/(7*(1+t*0.7))+ri(2,6))*tier.dlm));
  const b={
    id:uid(), client:nomClient(), tier:t, type:type, diff:diff, charge:charge, budget:budget,
    jours:jours, exp:S.jour+ri(3,7), pitch:pick(type.pitchs)
  };
  S.briefs.push(b);
  dirty=true;
  return b;
}
/* si plus aucun brief n'est à la portée de l'équipe (départ, briefs pris), on en ajoute un */
function assurerBriefAtteignable(){
  if(!S.briefs.length||S.briefs.some(briefAtteignable))return;
  if(S.briefs.length>=9)S.briefs.shift();
  const b=genererBrief({normal:true});
  if(b&&!briefAtteignable(b)){ b.diff=cl(Math.round(meilleurFit(b.type)-rnd(0,1)),1,10); }
}
function genererLegende(l){
  const type=TYPES.find(x=>x.id===l.type)||TYPES[0];
  const t=tierIdx(), tier=TIERS[t];
  /* défi exigeant mais jouable : à la portée de la meilleure personne, gros volume */
  const diff=cl(Math.round(meilleurFit(type)-rnd(0,0.8)),1,10);
  const charge=Math.round(type.charge*rnd(1.0,1.2)*(1+diff*0.05)*(1+t*0.5));
  const budget=Math.round(charge*tier.ppt*type.vpp*2.6/10)*10;
  const jours=Math.max(5,Math.round((charge/(7*(1+t*0.7))+ri(4,7))*tier.dlm*1.3));
  const b={id:uid(), client:l.client, tier:t, type:type, diff:diff, charge:charge, budget:budget,
    jours:jours, exp:S.jour+ri(6,9), pitch:l.pitch, leg:l.id, insistant:!!l.insistant};
  S.briefs.push(b);
  log("Brief légendaire : "+l.client+" frappe à la porte. « "+l.pitch+" »","a");
  notifier("Brief légendaire",l.client+" : "+type.nom+", "+eur(budget),"g");
  sonner(990,.22,"triangle");
  dirty=true;
  return b;
}
function refreshCandidats(){
  S.candidats=[];
  const n=2+(S.up.marketing>=2?1:0);
  for(let i=0;i<n;i++) S.candidats.push(nouveauDesigner(cl(tierIdx()*0.9+rnd(-.7,1.1),0,6)));
  dirty=true;
}

/* ---------- actions du joueur ----------
   Chaque action renvoie {ok:true} ou {ok:false, titre, msg}. cmd() se charge
   du toast ciblé en cas de refus. */
const OK={ok:true};
const non=(titre,msg)=>({ok:false,titre:titre,msg:msg});
const trouverP=id=>S.projets.find(x=>x.id===id);
const trouverD=id=>S.equipe.find(x=>x.id===id);

function accepter(id,jid){
  const i=S.briefs.findIndex(b=>b.id===id); if(i<0)return non("Brief","Ce brief n'est plus disponible.");
  if(S.projets.length>=capacite())return non("Bureau saturé","Ton bureau ne gère que "+capacite()+" projets en parallèle.");
  const b=S.briefs.splice(i,1)[0];
  S.projets.push({
    id:b.id, client:b.client, tier:b.tier, type:b.type, diff:b.diff,
    charge:b.charge, avance:0, budget:b.budget, deadline:S.jour+b.jours,
    qSum:0, qPts:0, qBonus:0, equipe:[], revisions:0, sup:false, pitch:b.pitch||"", leg:b.leg||null
  });
  sonner(660,.09,"triangle");
  log("Contrat signé : "+b.type.nom+" pour "+b.client+" ("+eur(b.budget)+")"+qui(jid)+".","a");
  dirty=true; return OK;
}
function refuser(id){
  const b=S.briefs.find(x=>x.id===id); if(!b)return non("Brief","Ce brief n'est plus disponible.");
  if(b.insistant&&!b.insiste){ b.insiste=true; dirty=true;
    return non("Vraiment ?","« C'est une offre qu'on ne peut pas refuser. » Refuse encore si tu es sûr de toi."); }
  S.briefs=S.briefs.filter(x=>x.id!==id); dirty=true; return OK;
}
function affecter(pid,did){
  const p=trouverP(pid), d=trouverD(did);
  if(!p)return non("Affectation","Ce projet n'existe plus.");
  if(!d)return non("Affectation","Cette personne ne fait plus partie du studio.");
  if(projetFini(p))return non("Affectation","Ce projet est terminé : il n'y a plus qu'à le livrer.");
  if(d.proj===pid)return non("Affectation",nomComplet(d)+" est déjà sur ce projet.");
  if(d.repos>0)return non("Affectation",nomComplet(d)+" est en arrêt.");
  if(d.form>0)return non("Affectation",nomComplet(d)+" est en formation.");
  if(p.equipe.length>=4)return non("Trop de monde","Quatre personnes au maximum, au-delà c'est de la réunion.");
  if(d.proj)retirer(d.proj,did);
  d.proj=pid; p.equipe.push(did); sonner(520,.07); markWorld(); return OK;
}
function retirer(pid,did){
  const p=trouverP(pid), d=trouverD(did);
  if(!p||!d||d.proj!==pid)return non("Affectation","Cette personne n'est pas sur ce projet.");
  p.equipe=p.equipe.filter(x=>x!==did);
  d.proj=null; markWorld(); return OK;
}
function toggleSup(pid){
  const p=trouverP(pid); if(!p)return non("Projet","Ce projet n'existe plus.");
  p.sup=!p.sup; dirty=true; return OK;
}
function livrer(pid,jid){
  const p=trouverP(pid); if(!p)return non("Livraison","Ce projet n'existe plus.");
  if(!projetFini(p))return non("Livraison","Pas encore fini : avancement "+Math.floor(p.avance/p.charge*100)+" %.");
  const q=Math.round(qualite(p)), tier=TIERS[p.tier];
  const retard=Math.max(0,S.jour-p.deadline);
  if(q<tier.exig-REVISION_MARGE && p.revisions<2 && retard<3){
    p.revisions++; S.revisions++; p.charge*=1.28;
    p.deadline+=Math.max(2,Math.round(p.charge*0.03)); p.qBonus+=3;
    log("« Ce n'est pas tout à fait ça. » "+p.client+" demande une révision ("+p.revisions+"/2).","y");
    notifier("Révision demandée",p.client+" renvoie le projet. Charge +28 %.","y");
    sonner(220,.2,"square"); dirty=true; return OK;
  }
  let mult=cl(q/75,0.42,1.55);
  if(retard>0) mult*=Math.max(0.25,1-retard*0.11);
  else if(S.jour<p.deadline-2) mult*=1.06;
  mult*=(1-p.revisions*0.09);
  const gain=Math.round(p.budget*mult);
  let rep=cl((q-tier.exig)/4.5+p.tier*1.6+Math.sqrt(p.charge)/5,-7,22)-retard*1.1;
  if(q>=90)rep+=3;
  const reussi=q>=tier.exig;
  if(p.leg&&reussi){ rep+=10; if(!S.legendes.includes(p.leg))S.legendes.push(p.leg); }
  if(rep>0) rep*=UPS.prestige.repMul[S.up.prestige||0];
  S.argent+=gain; S.ca+=gain; S.rep=Math.max(0,S.rep+rep); S.livres++;
  S.derniereLivraison=S.jour; S.oubli=false;
  if(q>S.meilleure)S.meilleure=q;
  if(q>=82||(p.leg&&reussi)) S.palmares.push({t:p.type.nom,c:p.client,q:q,j:Math.floor(S.jour),m:gain,
    n:"« "+pick(OEUVRES)+ri(1,99)+" »",leg:!!p.leg});
  S.palmares.sort((a,b)=>b.q-a.q); if(S.palmares.length>12)S.palmares.length=12;
  p.equipe.forEach(id=>{const d=trouverD(id);
    if(d){d.proj=null; d.moral=cl(d.moral+(reussi?7:-6),0,100);}});
  S.projets=S.projets.filter(x=>x.id!==pid);
  log("Livré : "+p.type.nom+" / "+p.client+", qualité "+q+"/100, "+eur(gain)
      +(rep>=0?" (+":" (")+rep.toFixed(1)+" rép.)"+qui(jid), reussi?"g":"y");
  if(p.leg&&reussi){
    log("Légendaire ! "+p.client+" entre au palmarès du studio.","a");
    notifier("Livraison légendaire",p.client+" · qualité "+q+" · "+eur(gain),"g");
  } else
    notifier(q>=85?"Livraison remarquée":reussi?"Client satisfait":"Client mitigé",
          p.type.nom+" · qualité "+q+" · "+eur(gain), q>=85?"g":reussi?"":"y");
  sonner(reussi?880:330,.18,"triangle");
  fx("celebrer",{ok:reussi});
  jalons(); markWorld(); return OK;
}
function abandonner(pid,jid){
  const p=trouverP(pid); if(!p)return non("Projet","Ce projet n'existe plus.");
  p.equipe.forEach(id=>{const d=trouverD(id);if(d)d.proj=null});
  S.projets=S.projets.filter(x=>x.id!==pid);
  S.rep=Math.max(0,S.rep-4); S.argent-=Math.round(p.budget*0.12); S.rates++;
  log("Contrat abandonné : "+p.client+". Réputation et dédit encaissés"+qui(jid)+".","r");
  markWorld(); return OK;
}
function embaucher(id,jid){
  const c=S.candidats.find(x=>x.id===id); if(!c)return non("Recrutement","Cette candidature n'est plus disponible.");
  if(S.equipe.length>=capacite())return non("Bureau plein","Agrandis le bureau pour dépasser "+capacite()+" personnes.");
  if(S.argent<c.prime)return non("Trop cher","Il manque "+eur(c.prime-S.argent)+" pour la prime d'embauche.");
  S.argent-=c.prime;
  S.equipe.push(c); S.candidats=S.candidats.filter(x=>x.id!==id);
  attribuerPostes();
  log(nomComplet(c)+" rejoint le studio ("+c.role+", "+eur(c.salaire)+"/sem)"+qui(jid)+".","a");
  notifier("Recrutement",nomComplet(c)+" · "+c.role,"g"); sonner(700,.12,"triangle");
  return OK;
}
function licencier(id,jid){
  const d=trouverD(id); if(!d)return non("Équipe","Cette personne ne fait plus partie du studio.");
  if(estFondateur(d))return non("Équipe","On ne se licencie pas soi-même.");
  if(d.proj)retirer(d.proj,id);
  S.argent-=Math.round(d.salaire*1.5);
  S.equipe=S.equipe.filter(x=>x.id!==id);
  S.equipe.forEach(x=>x.moral=cl(x.moral-6,0,100));
  attribuerPostes();
  log(nomComplet(d)+" quitte le studio. Indemnités versées"+qui(jid)+".","r");
  return OK;
}
function augmenter(id,jid){
  const d=trouverD(id); if(!d)return non("Équipe","Cette personne ne fait plus partie du studio.");
  if(estFondateur(d)||d.salaire<=0)return non("Augmentation","Le fondateur se paie en fierté.");
  const attente=Math.ceil(AUG_DELAI-(S.jour-(d.augJ||-99)));
  if(attente>0)return non("Augmentation",nomComplet(d)+" vient d'être augmenté·e. Encore "+attente+" j avant d'en reparler.");
  const c=Math.max(10,Math.round(d.salaire*0.12/10)*10);
  d.salaire+=c; d.moral=cl(d.moral+22,0,100); d.augJ=S.jour;
  log(nomComplet(d)+" est augmenté·e de "+eur(c)+" par semaine"+qui(jid)+".","");
  dirty=true; return OK;
}
function former(id,stat,jid){
  const d=trouverD(id); if(!d)return non("Formation","Cette personne ne fait plus partie du studio.");
  if(!["crea","tech","vit"].includes(stat))return non("Formation","Compétence inconnue.");
  if(d.form>0)return non("Formation",nomComplet(d)+" est déjà en formation.");
  if(d.repos>0)return non("Formation",nomComplet(d)+" est en arrêt, pas en état d'apprendre.");
  if(d[stat]>=10)return non("Formation","Déjà au maximum.");
  const cout=coutFormation(d,stat);
  if(S.argent<cout)return non("Formation","Il manque "+eur(cout-S.argent)+".");
  if(d.proj)retirer(d.proj,id);
  S.argent-=cout; d.form=3; d._form=stat;
  log(nomComplet(d)+" part en formation ("+({crea:"créativité",tech:"technique",vit:"vitesse"})[stat]+"), 3 jours"+qui(jid)+".","");
  markWorld(); return OK;
}
function acheter(k,jid){
  const u=Object.prototype.hasOwnProperty.call(UPS,k)?UPS[k]:null; if(!u)return non("Amélioration","Amélioration inconnue.");
  const n=(S.up[k]||0)+1;
  if(n>=u.cout.length)return non("Amélioration","Niveau maximum atteint.");
  if(S.argent<u.cout[n])return non("Fonds insuffisants","Il manque "+eur(u.cout[n]-S.argent)+".");
  S.argent-=u.cout[n]; S.up[k]=n;
  if(k==="bureau") attribuerPostes();
  { const ds=u.desc[n].replace(/\.$/,""); log("Amélioration : "+u.nom+", "+ds.charAt(0).toLowerCase()+ds.slice(1)+qui(jid)+".","a"); }
  notifier("Studio amélioré",u.nom+" niveau "+(n+1),"g"); sonner(600,.14,"triangle");
  jalons(); markWorld(); return OK;
}
function relance(jid){
  if(S.argent<COUT_RELANCE)return non("Recrutement","Il faut "+eur(COUT_RELANCE)+" pour relancer une annonce.");
  S.argent-=COUT_RELANCE; refreshCandidats();
  log("Annonce de recrutement relancée"+qui(jid)+".","");
  return OK;
}

/* ---------- fin de partie ---------- */
/* raison : "victoire" | "faillite" | "stagnation" */
function declarerFin(gagne,raison){
  S.fini=gagne?2:1;
  S.finRaison=raison||(gagne?"victoire":"faillite");
  if(S.finRaison==="faillite")S.faillites++;
  S.session.pause=true;
  fx("fin",{gagne:!!gagne,raison:S.finRaison});
  sonner(gagne?1040:180,.5,gagne?"triangle":"sawtooth");
  log(gagne?"Le studio entre dans la légende."
    :S.finRaison==="stagnation"?"Seul depuis trop longtemps, sans décoller : le fondateur raccroche et retourne en agence."
    :"Dépôt de bilan. La trésorerie a lâché.",gagne?"a":"r");
}
function continuer(){
  if(!S.fini)return non("Partie","La partie n'est pas terminée.");
  if(S.fini===2){
    S.victoireVue=true;
    log("On continue. Le studio a déjà sa légende, reste à l'entretenir.","a");
  } else if(S.finRaison==="stagnation"){
    S.stagnation=0;
    log("Encore un dernier essai. Recrute ou décroche des clients plus gros.","y");
  } else {
    /* sursis : nouveau seuil plus bas ; il revient à la normale une fois sorti du rouge */
    S.seuilFaillite=Math.min(S.argent,SEUIL_FAILLITE)-6000;
    log("Le banquier accorde un sursis. Nouvelle limite de découvert : "+eur(S.seuilFaillite)+".","y");
  }
  S.fini=0; S.finRaison=""; S.session.pause=false; dirty=true;
  return OK;
}
function verifierFin(){
  if(S.fini)return;
  if(S.argent<S.seuilFaillite){ declarerFin(false); return; }
  if(!S.victoireVue && S.rep>=VICTOIRE.rep && S.ca>=VICTOIRE.ca) declarerFin(true);
}

/* ---------- boucle de simulation (hôte / solo uniquement) ---------- */
function step(dj){
  if(!S)return;
  if(S.fini){
    /* l'écran de fin ne doit jamais disparaître en silence */
    if(!S.fx.some(f=>f.t==="fin")) fx("fin",{gagne:S.fini===2,raison:S.finRaison||(S.fini===2?"victoire":"faillite")});
    return;
  }
  if(!(dj>0))return;
  /* pas bornés : un gros dj (onglet en veille, appel hostile) ne saute jamais
     une échéance de charges et ne peut pas rendre S.jour infini */
  dj=Math.min(dj,30);
  while(dj>1e-9 && !S.fini){
    const d=Math.min(dj,0.5); dj-=d;
    const av=Math.floor(S.jour);
    S.jour+=d;
    travail(d);
    if(Math.floor(S.jour)>av) nouveauJour();
  }
}
function travail(dj){
  const hw=UPS.materiel.mul[S.up.materiel], sw=UPS.logiciel.q[S.up.logiciel];
  const actifs=new Set();
  S.projets.forEach(p=>{
    /* projet terminé : l'équipe ne travaille plus, elle attend la livraison */
    if(!p.equipe.length||projetFini(p))return;
    const nb=p.equipe.length;
    const coord = nb<=1?1 : nb===2?1.04 : nb===3?0.99 : 0.91;
    p.equipe.forEach(id=>{
      const d=trouverD(id); if(!d)return;
      actifs.add(d.id);
      const eF = d.energie>=35?1 : 0.45+d.energie/35*0.55;
      const mF = 0.82+d.moral/100*0.36;
      const pts=(3.4+d.vit*1.9)*hw*eF*mF*coord*(p.sup?1.42:1)*dj;
      const f=fit(d,p);
      let q=58+(f-p.diff)*8.2+sw+(nb>=2?3:0);
      if(d.energie<35)q-=13;
      if(d.moral<35)q-=7;
      q=cl(q,4,100);
      p.avance+=pts; p.qSum+=q*pts; p.qPts+=pts;
      const cout=(7.6-UPS.cafe.reg[S.up.cafe]*0.055)*(p.sup?1.75:1)*dj;
      d.energie=cl(d.energie-cout,0,100);
    });
    if(p.avance>p.charge)p.avance=p.charge;
  });
  if(S.auto) S.projets.slice().forEach(p=>{ if(projetFini(p)&&qualite(p)>=TIERS[p.tier].exig) livrer(p.id); });
  const reg=UPS.cafe.reg[S.up.cafe];
  S.equipe.forEach(d=>{ if(!actifs.has(d.id)) d.energie=cl(d.energie+reg*dj,0,100); });
}
const enTravail=d=>{ if(!d.proj)return false; const p=trouverP(d.proj); return !!p&&!projetFini(p); };
function nouveauJour(){
  const j=Math.floor(S.jour);
  S.equipe.slice().forEach(d=>{
    if(d.repos>0){ d.repos--; if(d.repos===0){ d.energie=Math.max(d.energie,55); log(nomComplet(d)+" est de retour, en forme.",""); markWorld(); } }
    if(d.form>0){ d.form--; if(d.form===0){ if(d._form)d[d._form]=cl(d[d._form]+1,1,10); d._form=null; d.moral=cl(d.moral+8,0,100);
      log(nomComplet(d)+" revient de formation. Compétence améliorée.","g"); markWorld(); } }
    if(d.energie<=2 && enTravail(d)){
      retirer(d.proj,d.id); d.repos=2; d.moral=cl(d.moral-16,0,100);
      log(nomComplet(d)+" est en burn-out. Arrêt de deux jours.","r");
      notifier("Burn-out",nomComplet(d)+" ne tient plus debout.","r");
    }
    const mAvant=d.moral;
    if(d.energie<28)d.moral=cl(d.moral-2.2,0,100);
    else if(!enTravail(d))d.moral=cl(d.moral+1.6,0,100);
    if(mAvant>=26 && d.moral<26 && !estFondateur(d)){
      notifier("Moral en chute",nomComplet(d)+" est à bout. Repos ou augmentation, sinon démission.","r");
      log(nomComplet(d)+" ne va pas bien. Moral au plus bas.","r");
    }
    if(d.moral<16 && !estFondateur(d) && _alea()<0.22){
      log(nomComplet(d)+" démissionne, épuisé·e et sous-payé·e.","r");
      notifier("Démission",nomComplet(d)+" claque la porte.","r");
      if(d.proj)retirer(d.proj,d.id);
      S.equipe=S.equipe.filter(x=>x.id!==d.id);
      attribuerPostes();
    }
  });
  S.projets.slice().forEach(p=>{
    const r=S.jour-p.deadline;
    if(r>0&&r<1){ log("Deadline dépassée : "+p.client+". Chaque jour de retard coûte.","r");
                  notifier("Retard",p.client+" attend toujours sa livraison.","r"); }
    if(r>7){ log(p.client+" rompt le contrat. Le studio perd la face.","r");
             S.rep=Math.max(0,S.rep-5); abandonner(p.id); }
  });
  S.tProchainBrief-=1;
  const flux=UPS.marketing.flux[S.up.marketing];
  while(S.tProchainBrief<=0){ genererBrief(); S.tProchainBrief+=rnd(0.6,1.5)/flux; }
  S.briefs=S.briefs.filter(b=>{
    if(S.jour>b.exp){ log("Brief perdu : "+b.client+" a choisi quelqu'un d'autre.",""); return false; }
    return true;
  });
  /* le prestige entretient la réputation ; l'absence de livraison l'érode */
  S.rep+=UPS.prestige.repJour[S.up.prestige||0];
  if(S.jour-S.derniereLivraison>OUBLI_JOURS && S.rep>0){
    if(!S.oubli){ S.oubli=true; log("Rien livré depuis "+OUBLI_JOURS+" jours : on commence à t'oublier.","y");
      notifier("Silence radio","Sans livraison, la réputation s'érode.","y"); }
    S.rep=Math.max(0,S.rep-0.4-S.rep*0.004);
  }
  if(j%7===0){
    const c=chargesSem(); S.argent-=c; S.charges+=c;
    log("Charges de la semaine : "+eur(c)+" (loyer "+eur(loyer())+", licences "+eur(licences())
      +(entretien()?", prestige "+eur(entretien()):"")+", salaires "+eur(masseSal())+").",S.argent<0?"r":"");
    if(S.argent<0)notifier("Trésorerie négative","Tu es à découvert de "+eur(-S.argent)+".","r");
    refreshCandidats();
    /* fondateur seul qui ne décolle pas : avertissement, puis fin au bout de 8 semaines */
    if(S.jour>=STAGNATION.debut && S.equipe.length<=1 && S.rep<TIERS[3].rep){
      S.stagnation++;
      if(S.stagnation===1||S.stagnation===STAGNATION.semaines-2){
        log("Seul aux commandes et toujours loin des gros clients. Recrute ou vise plus haut, sinon tu finiras par raccrocher.","y");
        notifier("Le fondateur fatigue","Encore "+(STAGNATION.semaines-S.stagnation)+" semaines pour décoller.","y"); }
      if(S.stagnation>=STAGNATION.semaines){ declarerFin(false,"stagnation"); }
    } else S.stagnation=0;
  }
  assurerBriefAtteignable();
  if(_alea()<0.20) evenement();
  if(S.argent>=0 && S.seuilFaillite<SEUIL_FAILLITE) S.seuilFaillite=SEUIL_FAILLITE;
  jalons();
  verifierFin();
  dirty=true;
}
function evenement(){
  const cands=EVENTS.filter(e=>e.k!=="proj"||S.projets.some(p=>!projetFini(p)));
  const e=pick(cands);
  if(e.k==="proj"){ const p=pick(S.projets.filter(p=>!projetFini(p))); e.f(p); if(p.avance>p.charge)p.avance=p.charge; log(e.t+" ("+p.client+")",e.c); }
  else if(e.k==="rep"){ S.rep=Math.max(0,S.rep+e.v); log(e.t+" ("+(e.v>0?"+":"")+e.v+" rép.)",e.c); }
  else if(e.k==="cash"){
    /* montant lié au niveau de clientèle, plafonné : plus d'explosion avec le CA cumulé */
    const base=Math.min(2600,rnd(80,160)*(1+tierIdx()*0.8));
    const m=Math.round(e.v*base); S.argent+=m; log(e.t+" ("+(m>0?"+":"")+eur(m)+")",e.c); }
  else if(e.k==="moral"){ S.equipe.forEach(d=>d.moral=cl(d.moral+e.v,0,100)); log(e.t,e.c); }
  else if(e.k==="energie"){ S.equipe.forEach(d=>d.energie=cl(d.energie+e.v,0,100)); log(e.t,e.c); }
  else if(e.k==="brief"){ if(S.briefs.length>=9)S.briefs.shift(); genererBrief({normal:true,bonus:1.35}); log(e.t,e.c); }
  notifier("Évènement",e.t,e.c);
}
function jalons(){
  JALONS.forEach(j=>{
    if(!S.jalons[j.id] && j.test()){
      S.jalons[j.id]=1; S.rep+=j.rep; S.argent+=j.cash;
      log("Jalon « "+j.nom+" » : "+j.txt+" (+"+j.rep+" rép."+(j.cash?", "+eur(j.cash):"")+")","a");
      notifier("Jalon : "+j.nom,j.txt,"g"); sonner(920,.16,"triangle");
    }
  });
  verifierFin();
}

/* ---------- joueurs ---------- */
function rejoindre(nom,couleur,jid){
  if(!jid)return non("Joueur","Identifiant manquant.");
  nom=String(nom||"Invité").replace(/[\u2013\u2014]/g,"-").replace(/[\u0000-\u001f]/g,"").trim().slice(0,18)||"Invité";
  const neuf=!S.joueurs[jid];
  /* la couleur finit dans des attributs style : seulement #hex ou hsl(...) */
  couleur=String(couleur||"");
  if(!/^#[0-9a-f]{3,8}$/i.test(couleur)&&!/^hsl\(\s*\d{1,3}(\.\d+)?(deg)?[ ,]+\d{1,3}%[ ,]+\d{1,3}%\s*\)$/i.test(couleur))couleur="#7fd1ff";
  S.joueurs[jid]={nom:nom,couleur:couleur};
  if(neuf&&jid!=="hote"){ log(nom+" rejoint le studio.","a"); notifier("Nouveau joueur",nom+" est arrivé·e.","g"); }
  dirty=true; return OK;
}
function partir(jid){
  if(jid==="hote"||!S.joueurs[jid])return non("Joueur","Rien à faire.");
  const nom=S.joueurs[jid].nom; delete S.joueurs[jid];
  log(nom+" a quitté la partie.",""); dirty=true; return OK;
}

/* ---------- point d'entrée unique ---------- */
const _num=v=>(typeof v==="string"&&v.trim()!==""&&!isNaN(+v))?+v:v;
const CMDS={
  accepter:(a,j)=>accepter(_num(a[0]),j),
  refuser:(a)=>refuser(_num(a[0])),
  affecter:(a)=>affecter(_num(a[0]),_num(a[1])),
  retirer:(a)=>retirer(_num(a[0]),_num(a[1])),
  toggleSup:(a)=>toggleSup(_num(a[0])),
  livrer:(a,j)=>livrer(_num(a[0]),j),
  abandonner:(a,j)=>abandonner(_num(a[0]),j),
  embaucher:(a,j)=>embaucher(_num(a[0]),j),
  licencier:(a,j)=>licencier(_num(a[0]),j),
  augmenter:(a,j)=>augmenter(_num(a[0]),j),
  former:(a,j)=>former(_num(a[0]),String(a[1]),j),
  acheter:(a,j)=>acheter(String(a[0]),j),
  relance:(a,j)=>relance(j),
  auto:(a)=>{ S.auto=a[0]===undefined?!S.auto:!!a[0]; return OK; },
  vitesse:(a)=>{
    const n=Math.round(+a[0]);
    if(!(n>=0&&n<=4))return non("Vitesse","Vitesse inconnue.");
    if(n===0){ S.session.pause=true; return OK; }
    S.session.cran=Math.min(n,3); S.session.vitesse=[0,1,2,4,4][n]; S.session.pause=false; return OK;
  },
  pause:(a)=>{ S.session.pause=a[0]===undefined?!S.session.pause:!!a[0]; return OK; },
  continuer:()=>continuer(),
  nouvellePartie:(a,j)=>{
    if(j!=="hote")return non("Nouvelle partie","Seul l'hôte peut relancer une partie.");
    newGame(typeof a[0]==="number"?a[0]:undefined); return OK;
  },
  rejoindre:(a,j)=>rejoindre(a[0],a[1],j),
  partir:(a,j)=>partir(j),
};
const CMDS_FIN=["continuer","nouvellePartie","vitesse","pause","rejoindre","partir","auto"];
function cmd(nom,args,joueurId){
  const jid=joueurId||"hote";
  if(!S)return {ok:false,msg:"Aucune partie en cours."};
  const a=Array.isArray(args)?args:(args===undefined||args===null?[]:[args]);
  const h=(typeof nom==="string"&&Object.prototype.hasOwnProperty.call(CMDS,nom))?CMDS[nom]:null;
  let r;
  if(!h) r=non("Action","Action inconnue : "+(typeof nom==="string"?nom.slice(0,40):typeof nom)+".");
  else if(S.fini&&!CMDS_FIN.includes(nom)) r=non("Partie terminée","Continue ou recommence depuis l'écran de fin.");
  else { try{ r=h(a,jid)||OK; }catch(e){ r=non("Erreur","Action impossible ("+(e&&e.message||e)+")."); } }
  if(!r.ok) notifier(r.titre||"Action refusée",r.msg,"r",jid);
  dirty=true;
  return r.ok?{ok:true}:{ok:false,msg:r.msg};
}

/* ---------- sérialisation ---------- */
/* les types sont envoyés par id puis rebranchés sur TYPES */
const _remplaceur=(k,v)=>(k==="type"&&v&&typeof v==="object"&&v.id)?{id:v.id}:v;
function relierTypes(o){
  const t=x=>TYPES.find(y=>y.id===(x&&x.id||x))||TYPES[0];
  (o.projets||[]).forEach(p=>{p.type=t(p.type)});
  (o.briefs||[]).forEach(b=>{b.type=t(b.type)});
}
function snapshot(){ return JSON.stringify({s:S,u:UID},_remplaceur); }
function appliquerSnapshot(str){
  let o; try{ o=typeof str==="string"?JSON.parse(str):str; }catch(e){ return false; }
  /* un instantané mal formé est ignoré sans toucher à l'état courant */
  if(!o||!o.s||typeof o.s!=="object"||!Array.isArray(o.s.equipe)||!Array.isArray(o.s.projets)
     ||!Array.isArray(o.s.briefs)||!o.s.up||typeof o.s.up!=="object")return false;
  S=o.s; UID=o.u||UID;
  relierTypes(S);
  if(!S.session)S.session={vitesse:1,pause:false,cran:1};
  if(!S.fx)S.fx=[];
  lierS();
  dirty=true;
  if(S.worldRev!==_worldRevVu){ _worldRevVu=S.worldRev; worldDirty=true; }
  return true;
}

/* ---------- sauvegarde (hôte / solo) ---------- */
function sauver(){
  try{ if(S&&typeof localStorage!=="undefined") localStorage.setItem(KEY,snapshot()); return true; }catch(e){ return false; }
}
/* remplit tout champ manquant (anciennes sauvegardes, versions précédentes) */
function completerS(o){
  const v=etatVide();
  Object.keys(v).forEach(k=>{ if(o[k]===undefined||o[k]===null&&v[k]!==null) o[k]=v[k]; });
  Object.keys(v.up).forEach(k=>{ if(typeof o.up[k]!=="number")o.up[k]=0; });
  if(typeof o.session!=="object")o.session=v.session;
  if(o.vitesse!==undefined){ o.session.vitesse=o.vitesse; delete o.vitesse; }
  delete o.pause; delete o.son;
  o.session.pause=true;
  if(typeof o.joueurs!=="object"||!o.joueurs.hote)o.joueurs=Object.assign({},v.joueurs,o.joueurs||{});
  if(typeof o.rng!=="number")o.rng=(Date.now()>>>0);
  if(o.jalons.e3){ o.jalons.e4=1; delete o.jalons.e3; }
  /* ancien drapeau unique finiVu : on le traduit sans bloquer la faillite */
  if(o.finiVu!==undefined){ if(o.finiVu&&o.rep>=VICTOIRE.rep&&o.ca>=VICTOIRE.ca)o.victoireVue=true; delete o.finiVu; }
  if(o.fini!==1&&o.fini!==2)o.fini=0;
  if(o.fini&&!o.finRaison)o.finRaison=o.fini===2?"victoire":"faillite";
  if(o.derniereLivraison===undefined||o.derniereLivraison>o.jour)o.derniereLivraison=o.jour;
  o.equipe.forEach((d,i)=>{
    if(!d.look)d.look={peau:"#e8c4a2",cheveux:"#2a2422",haut:"hsl(200 45% 45%)",bas:"#2a2f3a",taille:1};
    if(d.poste===undefined)d.poste=-1;
    if(d.fondateur===undefined)d.fondateur=d.prenom==="Toi";
    if(d.augJ===undefined)d.augJ=-99;
    ["repos","form","energie","moral","salaire"].forEach(k=>{ if(typeof d[k]!=="number"||!isFinite(d[k]))d[k]=k==="energie"?100:k==="moral"?70:0; });
  });
  o.projets.forEach(p=>{
    ["qSum","qPts","qBonus","revisions","avance"].forEach(k=>{ if(typeof p[k]!=="number")p[k]=0; });
    if(!Array.isArray(p.equipe))p.equipe=[];
    if(p.leg===undefined)p.leg=null;
  });
  o.briefs.forEach(b=>{ if(!b.pitch)b.pitch=""; });
  /* références croisées cohérentes */
  o.equipe.forEach(d=>{ if(d.proj&&!o.projets.some(p=>p.id===d.proj))d.proj=null; });
  o.projets.forEach(p=>{ p.equipe=p.equipe.filter(id=>o.equipe.some(d=>d.id===id&&d.proj===p.id)); });
  return o;
}
function charger(){
  const avant=S, uidAvant=UID;
  try{
    if(typeof localStorage==="undefined")return false;
    let raw=localStorage.getItem(KEY);
    if(!raw)raw=localStorage.getItem(KEY_ANCIENNE);
    if(!raw)return false;
    const o=JSON.parse(raw); if(!o||!o.s||!o.s.equipe||!o.s.equipe.length)return false;
    const fxAvant=S&&S.fxId||0;
    S=completerS(o.s);
    /* le compteur d'effets ne recule jamais : l'UI ignore les id déjà vus */
    S.fxId=Math.max(+S.fxId||0,fxAvant);
    const maxId=Math.max(0,...S.equipe.map(d=>d.id),...S.projets.map(p=>p.id),...S.briefs.map(b=>b.id),...S.candidats.map(c=>c.id));
    UID=Math.max(o.u||1000,maxId+1);
    relierTypes(S);
    S.fx=[];
    lierS();
    attribuerPostes();
    /* un écran de fin non traité ne doit pas figer la partie en silence */
    if(S.fini) fx("fin",{gagne:S.fini===2,raison:S.finRaison||(S.fini===2?"victoire":"faillite")});
    dirty=true; worldDirty=true;
    return true;
  }catch(e){ S=avant; UID=uidAvant; return false; }   /* sauvegarde corrompue : on garde la partie en cours */
}

if(typeof window!=="undefined"){
  window.Sim={cmd:cmd,snapshot:snapshot,appliquerSnapshot:appliquerSnapshot,step:step,newGame:newGame,
    sauver:sauver,charger:charger,vrnd:vrnd,vri:vri,vpick:vpick,effetUp:effetUp,nbJalons:nbJalons,
    get S(){return S;}};
}
