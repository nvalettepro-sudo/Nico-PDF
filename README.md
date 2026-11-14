# Nico PDF

Lecteur et retoucheur de PDF qui s'ouvre dans le navigateur (Chrome ou Edge).
Usage personnel. **Les PDF ne quittent jamais l'ordinateur** : aucun serveur, aucun suivi.

> État actuel : **socle technique** (stack installée, build et déploiement prêts).
> La version 1 (lecteur + organisation des pages + retouche du texte) est en préparation.

## Prérequis (une seule fois)

1. Installer **Node.js** version 22 ou plus : <https://nodejs.org> (bouton « LTS »).
2. Ouvrir un terminal (PowerShell) dans le dossier du projet.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm install` | Télécharge les bibliothèques (une fois, puis après chaque mise à jour) |
| `npm run dev` | Lance l'application en local : ouvrir l'adresse affichée (ex. `http://localhost:5173`) |
| `npm run build` | Fabrique la version finale dans le dossier `dist/` |

## Déploiement sur GitHub Pages

Le fichier `.github/workflows/deploy.yml` publie automatiquement le site à chaque envoi sur la branche `main`.

Réglage à faire **une seule fois** sur GitHub :
1. Dépôt → **Settings** → **Pages**.
2. **Source** : choisir **GitHub Actions**.

Le site est ensuite disponible à l'adresse `https://<votre-compte>.github.io/<nom-du-depot>/`.

## Stack

| Besoin | Bibliothèque |
| --- | --- |
| Build | Vite (JavaScript, sans framework) |
| Affichage, texte, recherche | pdfjs-dist (PDF.js de Mozilla) |
| Modification des pages | pdf-lib |
| Archives ZIP (version 2) | fflate |
| OCR (version 3) | tesseract.js, chargé à la demande |

Tout est installé par npm et inclus dans le build : aucune bibliothèque n'est chargée depuis Internet.
