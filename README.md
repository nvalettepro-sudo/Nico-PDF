# Nico PDF

**Le site est ici : <https://nvalettepro-sudo.github.io/Nico-PDF/>**

Lecteur et retoucheur de PDF qui s'ouvre dans le navigateur (Chrome ou Edge).
Usage personnel. **Les PDF ne quittent jamais l'ordinateur** : aucun serveur, aucun suivi.

**Version actuelle : voir la fenêtre ⓘ À propos** (numéro de version, liste des fonctions, historique des 4 dernières versions).
Ces informations sont tenues à jour dans `src/version.js` (règles dans `CLAUDE.md`).

## Fonctions de la version 1

| Fonction | Où la trouver |
| --- | --- |
| Ouvrir (bouton, glisser-déposer, Ctrl+O) | Barre du haut |
| Miniatures et signets | Panneau gauche |
| Zoom, ajuster largeur / page, rotation de la vue, page simple / double / continu | Barre du haut |
| Recherche (insensible aux accents et à la casse) | Loupe ou Ctrl+F |
| Thème sombre, inversion des couleurs des pages | Boutons lune et cercle |
| Sélection et copie du texte, capture de zone en image | Outils **Texte** et **Capture** |
| Réordonner, supprimer, pivoter, insérer, extraire, remplacer des pages | Bouton **Pages** |
| Modifier un texte existant, ajouter une zone de texte | Outil **Retouche** |
| Annuler / rétablir (10 étapes) | Ctrl+Z / Ctrl+Y |
| Enregistrer / Enregistrer sous | Ctrl+S / Ctrl+Maj+S |

Les limites (retouche par recouvrement, polices, PDF protégés…) sont détaillées dans l'application : bouton **ⓘ À propos**.

## Installer (une seule fois)

1. Installer **Node.js** version 22 ou plus : <https://nodejs.org> (bouton « LTS »).
2. Télécharger le projet (bouton vert **Code → Download ZIP** sur GitHub), puis le décompresser.
3. Dans le dossier du projet : clic droit → **Ouvrir dans le Terminal**.
4. Taper :

```bash
npm install
```

## Lancer

```bash
npm run dev
```

Puis ouvrir dans Chrome ou Edge l'adresse affichée (en général `http://localhost:5173`).
Pour arrêter : **Ctrl+C** dans le terminal.

## Fabriquer la version finale

```bash
npm run build
```

Le résultat est dans le dossier `dist/`.

## Déployer sur GitHub Pages

Le déploiement est **automatique** : chaque envoi sur la branche `main` publie le site
(fichier `.github/workflows/deploy.yml`).

Réglages faits une seule fois sur GitHub (déjà en place) :
1. **Settings → Pages → Source** : « GitHub Actions ».
2. **Settings → Environments → github-pages** : branche `main` autorisée.

Adresse du site : <https://nvalettepro-sudo.github.io/Nico-PDF/>

Une fois la page chargée, l'application fonctionne sans Internet tant que l'onglet reste ouvert.

## Tester

- Fichiers de test : `tests/fixtures/` (texte simple, document avec signets, scan).
- Checklist de tests manuels : [`tests/checklist-v1.md`](tests/checklist-v1.md).
- Pour recréer les fichiers de test : `npm run creer-fixtures` (nécessite Playwright pour le scan).

## Organisation du code

```
index.html               page de l'application
src/main.js              démarrage
src/state.js             état partagé (document, page, zoom) + historique annuler / rétablir
src/document.js          ouverture, modifications, enregistrement
src/pdf/loader.js        ouverture avec PDF.js (mot de passe)
src/pdf/render.js        affichage des pages visibles + calque de texte
src/pdf/search.js        recherche
src/pdf/pages.js         organisation des pages (pdf-lib)
src/pdf/edit-text.js     retouche du texte (pdf-lib)
src/pdf/save.js          fichiers : ouvrir, enregistrer, télécharger
src/ui/                  barre d'outils, panneaux, boîtes de dialogue, thème…
src/styles/              apparence
scripts/                 copie des ressources PDF.js, création des PDF de test
```

Principe : **PDF.js affiche** le document ; chaque modification est faite par **pdf-lib** sur une copie
en mémoire, puis le résultat est rechargé dans PDF.js.

## Bibliothèques

| Besoin | Bibliothèque |
| --- | --- |
| Build | Vite (JavaScript, sans framework) |
| Affichage, texte, recherche | pdfjs-dist (PDF.js de Mozilla) |
| Modification des pages et du texte | pdf-lib |
| Archives ZIP (version 2) | fflate |
| OCR (version 3) | tesseract.js, chargé à la demande |

Tout est installé par npm et inclus dans le build : aucune bibliothèque n'est chargée depuis Internet.
Les polices et tables de caractères de PDF.js sont copiées dans `public/pdfjs/` à chaque `npm run dev` / `npm run build`.
