# STUDIO : Graphic Design Tycoon (3D, solo ou coop)

Tu diriges un petit studio de design graphique, vu en 3D. Tu acceptes des briefs, tu affectes ton équipe, tu livres, tu encaisses, tu agrandis le studio. Seul, ou à plusieurs dans le même bureau.

## Jouer en solo

1. Télécharge le dossier du jeu (ou le zip, puis décompresse-le).
2. Double-clique sur `index.html`. Le jeu s'ouvre dans ton navigateur.
3. Dans le menu, choisis ton nom et ta couleur, puis **Jouer en solo**.

Pas besoin d'internet pour le solo : le moteur 3D est inclus dans le dossier. La partie se sauvegarde toute seule dans ce navigateur (et avec `Ctrl+S`).

## Jouer à plusieurs (coop, jusqu'à 4)

Tout le monde gère **le même studio** : chacun peut accepter des briefs, affecter, recruter, améliorer. Un joueur est l'**hôte** : c'est son navigateur qui fait tourner la partie (et qui la sauvegarde). La vitesse et la pause sont communes.

### 1. Mettre le jeu en ligne (une seule fois)

Le plus simple, gratuit : **GitHub Pages**.

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Clique sur **New repository**, donne-lui un nom (par exemple `studio`), coche **Public**, puis **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file** (ou **Add file > Upload files**). Ouvre le dossier du jeu sur ton ordinateur, sélectionne les fichiers `index.html`, `three.min.js`, `sim.js`, `world.js`, `ui.js`, `net.js`, `radio.js` et `main.js` (le `README.md` aussi si tu veux), glisse-les dans la page, attends que la barre de chargement finisse, puis clique sur **Commit changes** en bas.
   - N'envoie **pas** le dossier `tests` : il ne sert pas au jeu (et son sous-dossier `node_modules` contient des milliers de fichiers que GitHub refusera).
   - `index.html` doit être à la racine du dépôt (pas dans un sous-dossier), sinon la page reste blanche.
4. Va dans **Settings > Pages**. Dans **Build and deployment**, choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
5. Attends une minute ou deux : l'adresse du jeu apparaît en haut de cette page, du genre `https://ton-pseudo.github.io/studio/`.

Autres hébergeurs qui marchent aussi (n'importe quel hébergement de fichiers statiques convient) :
- **Netlify Drop** ([app.netlify.com/drop](https://app.netlify.com/drop)) : glisse le dossier du jeu dans la page, c'est en ligne.
- **itch.io** : crée un projet de type HTML, envoie un zip du dossier (avec `index.html` à la racine) et coche « jouable dans le navigateur ».

### 2. Lancer une partie

1. L'hôte ouvre l'adresse `https://...` du jeu et clique sur **Créer une partie**.
2. Un **code** de 5 caractères s'affiche. L'hôte l'envoie à ses amis, ou bien clique sur **Copier le lien** et envoie le lien (il ouvre le jeu avec le code déjà rempli).
3. Chaque ami ouvre le jeu, choisit son nom et sa couleur, tape le code et clique sur **Rejoindre**.
4. L'hôte doit garder son onglet ouvert pendant toute la partie. S'il le ferme, les autres reviennent au menu.

Astuce : si tu ouvres le jeu depuis le fichier `index.html` (sans l'avoir mis en ligne), le multijoueur fonctionne quand même, mais le lien d'invitation ne marchera pas chez tes amis. Dans ce cas, partage seulement le code : chacun ouvre sa propre copie du jeu.

### Ce qu'il faut savoir sur le réseau

- Le multijoueur a besoin d'**internet**.
- La mise en relation passe par le serveur public et gratuit de **PeerJS** ; ensuite, les navigateurs se parlent **directement** (pair à pair, WebRTC). Aucun serveur de jeu à installer.
- Certains réseaux stricts (réseau d'entreprise, d'école, certaines connexions 4G/5G partagées) bloquent les connexions pair à pair. Si la connexion n'aboutit pas, essaie depuis un autre réseau (par exemple une box à la maison).
- Si la bibliothèque réseau ne peut pas se charger (hors ligne), les boutons multijoueur sont désactivés, mais le solo marche normalement.

## Commandes

| Action | Touche / souris |
| --- | --- |
| Tableau de bord (briefs, production, équipe) | `E` |
| Fermer une fenêtre ou une fiche | `Échap` |
| Pause | `Espace` |
| Vitesse normale, ×2, ×4 | `1`, `2`, `3` |
| Changer de vue | `V` |
| Radio du studio (ouvrir / fermer) | `R` |
| Sauvegarder | `Ctrl+S` |
| Faire marcher ton avatar | clic sur le sol, ou `ZQSD` / `WASD` / flèches |
| Pivoter, zoomer, décaler la caméra | glisser, molette, clic droit |
| Ouvrir la fiche d'un collaborateur | clic sur le personnage |

## Radio

Le bouton radio en haut à droite (ou `R`) ouvre la **Radio du studio** : des ambiances (lofi, jazz, synthwave, funk & soul, électro chill, ambient, hip-hop, rock indé, radios françaises), une sélection de **coups de cœur**, une recherche libre, des favoris, le volume, « Au hasard ». Le bouton son du jeu coupe aussi la radio. En coop, chacun écoute ce qu'il veut ; **Partager au studio** propose ta station aux autres, qui choisissent de l'écouter ou non.

- Les stations viennent de [Radio Browser](https://www.radio-browser.info), une base de données communautaire et gratuite. Les flux appartiennent à leurs diffuseurs.
- Il faut internet. Rien n'est demandé tant que le panneau n'est pas ouvert, et les listes sont gardées un jour dans le navigateur.
- Sur la version en ligne (https), seules les stations diffusées en https sont proposées : le navigateur bloque les autres.
- Une station muette est sautée toute seule au bout de quelques secondes.

## Pour les curieux

- `sim.js` : la simulation (équilibrage en jours de jeu).
- `world.js` : le bureau en 3D (three.js).
- `ui.js` : l'interface.
- `net.js` : le multijoueur (PeerJS).
- `radio.js` : la radio du studio (Radio Browser).
- `main.js` : la boucle, la caméra, l'avatar.
- `tests/ui.test.js` : test automatique sans navigateur (`npm i` dans `tests`, puis `node tests/ui.test.js`).
- `tests/e2e-multi.js` : test multijoueur avec de vrais navigateurs (Edge) et le vrai serveur PeerJS (`node tests/e2e-multi.js`, demande internet).
- `tests/e2e-radio.js` : test de la radio dans de vrais navigateurs (ambiances, lecture, stations muettes, favoris, partage en coop ; demande internet).
