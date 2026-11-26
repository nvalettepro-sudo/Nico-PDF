# Checklist de tests manuels — Surlignage, commentaires et palette « Modifs »

À dérouler dans **Chrome ou Edge**, avec `tests/fixtures/texte-simple.pdf` (et `scan.pdf` pour les zones).
Cochez chaque ligne quand le résultat attendu est obtenu.

## 1. Surligner du texte

- [ ] Bouton **Surligner** (barre du haut) → le panneau de droite s'ouvre : 4 types, 6 couleurs.
- [ ] Type **Surligner**, couleur jaune : sélectionner une partie de ligne → elle est surlignée dès que la souris est relâchée.
- [ ] Sélection sur **plusieurs lignes** → un surlignage par ligne, sans déborder dans les marges.
- [ ] Type **Souligner**, couleur rouge → trait sous le texte. Type **Barrer** → trait au milieu.
- [ ] Le type et la couleur choisis sont retrouvés après un rechargement de la page.
- [ ] **Ctrl+Z** retire le dernier surlignage, **Ctrl+Y** le remet.

## 2. Surligner une zone

- [ ] Type **Zone**, ouvrir `scan.pdf` → tracer un rectangle → la zone est surlignée (transparente : le scan reste lisible).
- [ ] Un simple clic (sans tracer) sur une zone existante la sélectionne.

## 3. Commentaires

- [ ] Juste après un surlignage, le champ **Commentaire** du panneau est prêt : taper un texte → **Enregistrer** (ou Ctrl+Entrée).
- [ ] Une petite bulle de couleur apparaît au coin du surlignage commenté.
- [ ] Avec n'importe quel outil, passer la souris sur le surlignage → la bulle affiche le commentaire, l'auteur et la date.
- [ ] Outil **Surligner** : clic sur un surlignage existant → il est encadré, son commentaire est modifiable.
- [ ] Changer sa couleur avec les petites pastilles sous le commentaire.
- [ ] Vider le commentaire puis **Enregistrer** → le commentaire disparaît, le surlignage reste.
- [ ] Touche **Suppr** sur un élément sélectionné → il est supprimé.

## 4. Palette « Modifs » (panneau gauche)

- [ ] Onglet **Modifs** : le panneau s'élargit ; le nombre d'éléments est affiché sur l'onglet.
- [ ] Sections **Surlignages** (sans commentaire) et **Surlignages commentés** : texte surligné, commentaire, page, type, date.
- [ ] Clic sur une ligne → la vue va sur l'élément, qui clignote (aussi depuis une autre page).
- [ ] Crayon → fenêtre de modification du commentaire.
- [ ] Poubelle → l'élément disparaît de la page et passe dans la **Corbeille**.
- [ ] Corbeille → **Restaurer** : l'élément revient à sa place, avec son commentaire.
- [ ] Supprimer puis **Ctrl+Z** → l'élément revient et quitte la corbeille.
- [ ] **Vider** la corbeille → demande de confirmation, puis corbeille vide.
- [ ] Les titres de section se replient / se déplient.
- [ ] Ouvrir un autre PDF → la corbeille est vidée.

## 5. Fichier enregistré

- [ ] Enregistrer, fermer, rouvrir → surlignages et commentaires sont toujours là et listés.
- [ ] Ouvrir le fichier dans **Acrobat Reader** ou **Edge** → surlignages visibles, commentaires lisibles.
- [ ] Un PDF commenté dans Acrobat → ses surlignages apparaissent dans la palette et peuvent être supprimés.
- [ ] Un élément supprimé puis enregistré n'est plus dans le fichier (commentaire introuvable dans Acrobat).
- [ ] PDF protégé (lecture seule) : bouton **Surligner** grisé, palette consultable sans poubelles.
