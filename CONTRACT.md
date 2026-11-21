# STUDIO Online : contrat d'architecture (pour les agents)

Base : copie de `studio-tycoon-3d` (three.js r128 vendu localement, scripts classiques, doit marcher en `file://` en solo ET sur GitHub Pages en https).
`ref-2d.html` = ancienne version 2D, référence de contenu/UX uniquement (sera supprimée à la fin).

Règles générales
- JAMAIS ouvrir le navigateur intégré / panneau preview (fait crasher la machine). Tests headless en Node 22 uniquement (vm, jsdom installable dans un dossier `tests/` local si besoin).
- Texte en français. Pas de tiret cadratin (—) ni demi-cadratin dans les textes affichés : virgules, deux-points, parenthèses.
- L'équilibrage vit en JOURS de jeu, jamais en secondes. `JOUR_MS` (main.js) ne règle que le rythme réel. Cible : victoire vers le jour 200 en jouant bien, 10-25 % de révisions, faillite possible en cramant l'équipe.
- La sim avance en continu à chaque image (pas par paliers).
- Textures canvas : `encoding = THREE.sRGBEncoding`. Couleurs hex des matériaux : `.convertSRGBToLinear()`.
- Références (« refs ») : clins d'œil culture design / pop / web / jeux vidéo / ciné en TEXTE ou en props génériques (ex. « Peut-on mettre le logo plus gros ? », Comic Sans, Helvetica, Pantone, Bauhaus, Saul Bass, lorem ipsum, 404, « make it pop », un monolithe noir, un canard en plastique, 42...). Pas de reproduction de logos ou de personnages protégés.
- Ne pas toucher aux fichiers possédés par un autre agent.

Propriété des fichiers
- sim.js : agent SIM
- world.js : agent WORLD
- ui.js, main.js, index.html, net.js (nouveau), README.md : agent UI/NET

## Interface sim.js (fournie par SIM, consommée par UI/NET et WORLD)

Globales (inchangées) : `S`, `TIERS`, `UPS`, `JALONS`, `TYPES`, helpers `tierIdx, capacite, chargesSem, libre, fit, qualite, heure, coutFormation, eur, esc, stars, nomComplet, avColor`, flags `dirty`, `worldDirty`.

Nouveau :
- `cmd(nom, args, joueurId)` → `{ok:true}` ou `{ok:false, msg:"raison"}`. SEUL point d'entrée des actions de jeu. Valide tout côté hôte. Noms :
  `accepter(briefId)`, `refuser(briefId)`, `affecter(projId, designerId)`, `retirer(projId, designerId)`, `toggleSup(projId)`, `livrer(projId)`, `abandonner(projId)`, `embaucher(candId)`, `licencier(designerId)`, `augmenter(designerId)`, `former(designerId, stat)`, `acheter(cle)`, `relance()`, `auto(bool)`, `vitesse(n)` (0..3), `pause(bool)`, `continuer()` (après écran de fin), `nouvellePartie()`.
  `args` est un tableau. Les refus reviennent dans `msg` ET poussent un fx toast ciblé `to: joueurId`.
- `S.fx` : file d'effets `[{id, t:'toast'|'bip'|'celebrer'|'fin'|'log', to?:joueurId, ...donnees}]`, `id` croissant (`S.fxId`), gardée bornée (60 derniers). Remplace tout appel DOM / audio / `UI.*` / `World.*` depuis sim.js. sim.js ne touche plus du tout au DOM ni à AudioContext.
  - toast : `{titre, txt, c}` ; bip : `{f, dur, type}` ; celebrer : `{}` ; fin : `{gagne:bool}`.
  - Chaque client lit les fx d'id > dernier vu et filtre `to` (absent = tout le monde).
- `S.joueurs` : `{ [joueurId]: {nom, couleur} }`. L'hôte a l'id `"hote"`, le solo aussi.
- `S.session` : `{vitesse, pause}` (déplacés depuis S ; `son` reste local côté UI, dans localStorage).
- RNG : la sim utilise un RNG à graine stocké dans S (`S.rng`), plus Math.random. Fournir `vrnd(a,b)`, `vri(a,b)`, `vpick(arr)` (Math.random) pour le visuel : world.js DOIT utiliser ceux-là.
- `snapshot()` → string JSON (S + UID). `appliquerSnapshot(str)` côté client (relie `type` par id, met dirty/worldDirty).
- `step(dj)` : uniquement chez l'hôte/solo.
- `sauver()` / `charger()` : hôte/solo uniquement ; clé localStorage `studio-online-v1`.

## Interface world.js (fournie par WORLD, consommée par main.js)

Garder l'objet global `World` (déclaré `var World = ...` ou `window.World = ...` pour être visible via window) avec l'API existante utilisée par main.js, plus :
- `World.majAvatars(liste)` : liste `[{id, nom, couleur, x, z, cap, mode}]` (mode : 'idle'|'marche'), crée/met à jour/supprime (avec dispose) les avatars joueurs, interpolation interne, étiquette de nom au-dessus.
- `World.solA(clientX, clientY)` → `{x, z}` sur le sol (dans la pièce) ou `null`.
- `World.bornes()` → `{xmin, xmax, zmin, zmax}` de la pièce marchable.
- `World.celebrer()` conservé.
- `World.idAvatarLocal` : string, l'avatar portant cet id est rendu avec un anneau au sol.

## Avatars joueurs (UI/NET + main.js)
Chaque joueur a un avatar dans le bureau : clic sur le sol = il marche jusque-là (ZQSD/WASD en option). Position locale gérée par main.js, envoyée au réseau à ~10 Hz, l'hôte rediffuse. Purement cosmétique (pas dans la sim), hors `S`.

## Réseau (net.js, agent UI/NET)
PeerJS 1.5.4 chargé depuis `https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js` (si absent / hors ligne : le solo marche quand même, bouton multi désactivé avec message).
- Hôte : crée une partie, affiche un code court à partager (et un lien `?rejoindre=CODE`). Exécute `cmd`, `step`, envoie `snapshot()` ~6 Hz + positions avatars ~10 Hz.
- Client : envoie `{type:'cmd', nom, args}` ; applique snapshots ; n'appelle jamais `step`. Interpole `S.jour` pour la lumière.
- `Net.action(nom, ...args)` : utilisé par TOUTE l'UI. En solo/hôte → `cmd(nom,args,monId)` directement ; en client → envoi à l'hôte.
- Déconnexion gérée proprement (message, retour solo pour le client avec la dernière copie ? non : retour menu).
