# Checklist de tests manuels — Version 1

À dérouler dans **Chrome ou Edge**, avec `npm run dev` (ou sur le site GitHub Pages).
Les fichiers de test sont dans `tests/fixtures/` :

| Fichier | Contenu |
| --- | --- |
| `texte-simple.pdf` | 2 pages de texte (titres, texte rouge, texte sur fond jaune, accents) |
| `signets.pdf` | 12 pages avec signets en arborescence, page 7 en paysage |
| `scan.pdf` | 2 pages scannées (images, aucun texte sélectionnable) |

Cochez chaque ligne quand le résultat attendu est obtenu.

## 1. Ouvrir et afficher

- [ ] Bouton **Ouvrir** → choisir `texte-simple.pdf` → le document s'affiche, net (pas flou).
- [ ] Glisser-déposer `signets.pdf` depuis l'Explorateur Windows → il s'ouvre.
- [ ] **Ctrl+O** ouvre la fenêtre de choix de fichier.
- [ ] Ouvrir un vrai PDF Word de plus de 100 pages → le défilement reste fluide.
- [ ] Glisser un fichier qui n'est pas un PDF (ex. `.docx`) → message « seuls les fichiers PDF sont acceptés ».

## 2. Miniatures et signets

- [ ] Avec `signets.pdf`, l'onglet **Signets** s'ouvre : chapitres 1, 2, 3 et « Dernière page ».
- [ ] La flèche à gauche d'un signet déplie / replie ses sous-signets (« 2.2 Coupes » → « 2.2.1 Coupe AA »).
- [ ] Clic sur « 2.1 Plans (page paysage) » → affiche la page 7.
- [ ] Onglet **Miniatures** : la page courante est encadrée en orange et suit le défilement.
- [ ] Clic sur une miniature → la page correspondante s'affiche.
- [ ] Avec `texte-simple.pdf` : « Ce document ne contient pas de signets ».
- [ ] Le bouton tout à gauche de la barre masque / affiche le panneau.

## 3. Zoom, rotation, modes d'affichage

- [ ] Boutons **−** et **+**, touches **+** / **−** : le zoom change.
- [ ] **Ctrl + molette** : zoom avant / arrière (pas le zoom du navigateur).
- [ ] Liste du zoom : « Largeur » remplit la largeur, « Page entière » montre toute la page.
- [ ] Bouton **rotation** : les pages tournent de 90° à chaque clic ; **Enregistrer** n'est pas marqué (le fichier n'est pas modifié).
- [ ] Mode **Page simple** : une seule page ; flèches ← →, Page préc. / Page suiv. ou molette en bout de page pour changer.
- [ ] Mode **Double page** : deux pages côte à côte.
- [ ] Champ du numéro de page : taper `7` puis Entrée → page 7.

## 4. Recherche

- [ ] **Ctrl+F** ouvre la barre de recherche.
- [ ] Avec `texte-simple.pdf`, chercher `elevation` → **3 résultats** (Élévation, élévation, ELEVATION) surlignés.
- [ ] **Entrée** / flèche bas : résultat suivant ; **Maj+Entrée** / flèche haut : précédent. Le compteur « 2 sur 3 » suit.
- [ ] Chercher `zzzz` → « Aucun résultat ».
- [ ] **Échap** ferme la barre et efface le surlignage.

## 5. Thème sombre

- [ ] Bouton **lune** : interface sombre. Fermer et rouvrir l'onglet → le thème est conservé.
- [ ] Bouton **cercle demi-plein** : couleurs des pages inversées (lecture de nuit). Choix conservé aussi.

## 6. Sélectionner et copier

- [ ] Outil **Texte** : sélectionner une phrase à la souris, **Ctrl+C**, coller dans Word ou le Bloc-notes → texte identique, accents compris.
- [ ] Outil **Capture** : tracer un rectangle sur la page → message « Zone copiée » ; **Ctrl+V** dans Word ou Paint colle l'image.
- [ ] Avec `scan.pdf` : aucun texte sélectionnable (normal, l'OCR arrive en version 3), mais la capture fonctionne.

## 7. Réordonner, supprimer, pivoter

- [ ] Bouton **Pages** : la grille de miniatures s'ouvre.
- [ ] Glisser la page 1 après la page 3 → l'ordre change (repère orange pendant le glisser).
- [ ] Ctrl + clic sur 2 pages, puis **corbeille** → confirmation, puis suppression.
- [ ] Boutons de **rotation** (barre ou survol d'une page) → la page pivote de 90°.
- [ ] **Ctrl+Z** annule, **Ctrl+Y** rétablit (jusqu'à 10 modifications).
- [ ] **Terminé**, puis **Ctrl+S** → le fichier est enregistré.
- [ ] Rouvrir le fichier enregistré dans **Chrome** (glisser dans un onglet) **et** dans un autre lecteur (Edge, Acrobat Reader…) → ordre, rotations et suppressions correctes.

## 8. Insérer, extraire, remplacer

- [ ] **Insérer un PDF…** → choisir `texte-simple.pdf`, position « À la fin » → 2 pages ajoutées.
- [ ] **Extraire…** avec la plage `1-3` → un nouveau PDF de 3 pages est enregistré ; le document ouvert ne change pas.
- [ ] Sélectionner 2 pages, **Remplacer…** → choisir `scan.pdf`, pages `1-2` → les 2 pages sont remplacées.
- [ ] Saisir une plage invalide (`0-99`) → message d'erreur clair, la boîte reste ouverte.

## 9. Retouche du texte

- [ ] Outil **Retouche** : le panneau droit s'ouvre avec l'**avertissement** sur le recouvrement.
- [ ] Survoler le texte → un cadre pointillé montre la portion modifiable.
- [ ] Clic sur « situé à Bordeaux… » → la boîte d'édition affiche le texte, la police (Helvetica), la taille (11).
- [ ] Remplacer « Bordeaux » par « Mérignac » → l'aperçu s'affiche sur la page → **Appliquer** → résultat lisible, accents corrects.
- [ ] Clic sur le texte rouge → la couleur proposée est rouge ; sur le texte du cadre jaune → le fond proposé est jaune.
- [ ] Changer police, taille, gras, italique, couleur → l'aperçu suit.
- [ ] **Ajouter une zone de texte** → clic sur la page → saisir 2 lignes → **Appliquer**.
- [ ] Taper un caractère absent des polices standard (ex. ✓) → message « remplacé par ? ».
- [ ] Enregistrer, rouvrir dans un autre lecteur → les corrections sont à la bonne place.
- [ ] Limite assumée : chercher l'ancien mot (« Bordeaux ») → il est **encore trouvé** (le texte d'origine reste sous le recouvrement).

## 10. Enregistrer

- [ ] Fichier ouvert avec **Ouvrir** ou glissé, puis modifié : un point orange apparaît sur l'icône Enregistrer.
- [ ] **Ctrl+S** : la première fois, Chrome demande l'autorisation de modifier le fichier → accepter → « Enregistré ».
- [ ] **Ctrl+Maj+S** (Enregistrer sous) : choisir un nouveau nom → le nouveau fichier est créé.
- [ ] Fermer l'onglet avec des modifications non enregistrées → le navigateur demande confirmation.

## 11. PDF protégé (aperçu de la version 3)

- [ ] Ouvrir un PDF protégé par mot de passe → la boîte « mot de passe » s'affiche ; un mauvais mot de passe affiche une erreur.
- [ ] Avec le bon mot de passe : le document s'affiche, **Retouche**, **Pages** et **Enregistrer** sont grisés.
