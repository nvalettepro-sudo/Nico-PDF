# Checklist de tests manuels — Version 1.2.0

À dérouler dans **Chrome ou Edge**, avec un de vos PDF (par exemple un compte rendu exporté depuis Word)
ou `tests/fixtures/texte-simple.pdf`.

## 1. Enregistrement modifiable (Ctrl+S)

- [ ] Outil **Retouche** : corriger un mot, **Appliquer**, puis **Ctrl+S**.
- [ ] Fermer l'onglet, rouvrir le site, rouvrir le fichier.
- [ ] Outil **Retouche** : le panneau indique « 1 retouche modifiable dans ce document ».
- [ ] Survoler la correction : un **cadre orange plein** apparaît (le texte d'origine a un cadre pointillé).
- [ ] Cliquer dessus : le formulaire reprend le texte, la police, la taille et les couleurs de la retouche.
- [ ] Modifier le texte, **Appliquer** : la correction est remplacée, pas superposée.
- [ ] **Déplacer le texte** puis cliquer ailleurs sur la page : l'aperçu se déplace ; **Appliquer**.
- [ ] **Supprimer la retouche** : le texte d'origine réapparaît.
- [ ] **Ctrl+Z** annule chacune de ces actions.

## 2. Enregistrer en version définitive

- [ ] Bouton **Enregistrer en version définitive** (icône document avec une coche, à droite d'« Enregistrer sous »).
- [ ] La confirmation explique que l'ancien texte sera retiré et que le fichier modifiable est conservé.
- [ ] Le fichier « … (définitif).pdf » est créé ; message « ancien texte retiré et vérifié ».
- [ ] Ouvrir le fichier définitif (Nico PDF, Acrobat Reader, Edge) : le nouveau texte est à sa place, la page est identique.
- [ ] **Ctrl+F** sur l'ancien mot : **aucun résultat**.
- [ ] Le texte de la page reste **sélectionnable et copiable** (y compris le texte corrigé).
- [ ] Dans le fichier définitif, outil Retouche : « aucune retouche modifiable » (les retouches sont figées).
- [ ] Document sans retouche → message « Aucune retouche à figer ».

## 3. Cas particulier

- [ ] Si un message « Ancien texte encore présent » apparaît : noter la page et la cause indiquée, puis me l'envoyer
      (capture d'écran). Choisir « Annuler » pour ne rien enregistrer.
