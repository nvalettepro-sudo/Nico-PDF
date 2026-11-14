# Nico PDF — règles du projet

Lecteur et retoucheur de PDF 100 % navigateur (Vite, PDF.js, pdf-lib). Utilisateur unique, architecte, non développeur.
Interface et commentaires en français. Aucun CDN, aucun envoi de fichier, aucun suivi.

## Version, fonctions et historique (OBLIGATOIRE à chaque modification)

Source unique : `src/version.js` (affiché dans la fenêtre « À propos », bouton ⓘ en haut à droite).
Le numéro lui-même est dans `package.json` (`version`).

À **chaque** modification livrée (commit qui change le comportement ou l'apparence) :

1. **Augmenter la version** dans `package.json` :
   - correctif ou retouche d'apparence : `x.y.z` → `x.y.(z+1)`
   - fonction ajoutée, modifiée ou supprimée : `x.y.z` → `x.(y+1).0`
   - nouvelle version du cahier des charges (V2, V3) : `x.y.z` → `(x+1).0.0`
2. **Ajouter une entrée en tête de `HISTORIQUE`** (version, date, modifications majeures en français simple).
   Garder **les 4 dernières versions** seulement : supprimer la plus ancienne.
3. **Mettre à jour `FONCTIONS`** à chaque ajout, modification ou suppression de fonction.
4. Mettre à jour le tableau des fonctions du `README.md` si besoin.

`scripts/verifier-version.mjs` (lancé avant `npm run dev` et `npm run build`) bloque si la version de
`package.json` n'est pas la première de l'historique ou si l'historique dépasse 4 versions.
Il ne vérifie pas le contenu de `FONCTIONS` : c'est à faire à la main, à chaque fois.

## Méthode de travail

- Travailler version par version (cahier des charges V1, V2, V3) ; annoncer le plan (10 lignes max) et attendre le GO.
- Fin de chaque étape : `npm run build` sans erreur, checklist de tests manuels dans `tests/`, README à jour.
- Petits commits, messages en français.
- En cas de blocage : dire ce qui ne marche pas et proposer un repli, ne pas faire semblant.
