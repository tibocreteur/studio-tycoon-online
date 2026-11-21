# Tests de sim.js

Banc headless, Node 22, aucun navigateur : `sim.js` est chargé dans un contexte `vm` sans DOM.

```
node tests/sim-bot.js            # tests unitaires + équilibrage (8 graines par stratégie)
node tests/sim-bot.js tests      # tests unitaires seuls (code de sortie 1 si échec)
node tests/sim-bot.js smart 16   # une stratégie, détail par graine
node tests/sim-bot.js all 16     # toutes les stratégies, résumé
```

Stratégies (toutes passent par `cmd()`, comme l'UI) :

- `smart` : joueur correct (briefs à sa portée, repos, achats prudents). Référence d'équilibrage.
- `prestige` : idem, achète aussi la ligne Prestige.
- `greedy` : accepte tout, heures sup en permanence.
- `overhire` : greedy + agrandit et embauche dès que possible.
- `passive` : fondateur seul, prend le premier brief venu.

Repères mesurés (16 graines, dt 0,02 j) :

| stratégie | issue |
|---|---|
| smart | 16/16 victoires, médiane j206 (181 à 233), révisions 17 % |
| prestige | 16/16 victoires, médiane j212, prestige niveau 3 à 4 |
| greedy | ni victoire ni faillite à j400, réputation ~88 |
| overhire | 14/16 faillites, médiane j157 |
| passive | 16/16 fin par stagnation, médiane j231 |

Les tests unitaires couvrent : surface de l'API, absence de DOM / tiret long, déterminisme à graine égale,
validations de `cmd`, projet fini qui ne consomme plus, formation non payée deux fois, délai d'augmentation,
victoire non redéclenchée après « continuer », faillite réarmable, snapshot, sauvegarde et migration
(anciennes sauvegardes 3D comprises), brief toujours atteignable, plafond des évènements d'argent.
