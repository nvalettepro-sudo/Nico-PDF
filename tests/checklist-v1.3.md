# Checklist de tests manuels — Version 1.3.0

À dérouler dans **Chrome ou Edge** avec un de vos PDF (compte rendu Word, plan Archicad…).

## Police d'origine

- [ ] Outil **Retouche**, clic sur un mot : la liste « Police » affiche **« Police d'origine : <nom> (identique) »**.
- [ ] Le nom affiché correspond à la police du document (ex. Calibri, Arial, Garamond).
- [ ] Corriger une ou deux lettres d'un mot, **Appliquer** : les lettres ajoutées ont exactement le même dessin que le reste du mot.
- [ ] Taper une lettre jamais utilisée dans le document (ex. une majuscule rare, « Œ », « @ ») : un message orange liste les lettres absentes et **Appliquer** est refusé.
- [ ] Choisir alors une police proche dans la liste : le message disparaît, **Appliquer** fonctionne.
- [ ] Gras et italique sont grisés avec la police d'origine (ce sont ceux de la police elle-même).
- [ ] L'aperçu pendant la saisie est approximatif ; le rendu exact apparaît après **Appliquer** (Ctrl+Z possible).

## Suite du parcours

- [ ] **Ctrl+S**, rouvrir, cliquer la retouche : la police d'origine est toujours sélectionnée.
- [ ] **Enregistrer en version définitive** : l'ancien texte est retiré, le nouveau garde la police d'origine.
- [ ] Ouvrir le fichier définitif dans Acrobat Reader ou Edge : rendu identique.
