// Démarrage de l'application Nico PDF.
import './styles/base.css';
import './styles/visionneuse.css';
import './styles/composants.css';

import { etat, on } from './state.js';
import { ouvrir } from './document.js';
import { initVisionneuse } from './pdf/render.js';
import { lireDepot } from './pdf/save.js';
import { placerIcones } from './ui/icones.js';
import { initTheme } from './ui/theme.js';
import { initPanneauGauche, construirePanneau } from './ui/panneau-gauche.js';
import { initRecherche } from './ui/recherche.js';
import { initCapture } from './ui/capture.js';
import { initOrganiser } from './ui/organiser.js';
import { initBarreOutils } from './ui/barre-outils.js';
import { initRetouche } from './ui/panneau-retouche.js';
import { signalerErreur } from './ui/dialogues.js';

function demarrer() {
  placerIcones();
  const visionneuse = document.getElementById('visionneuse');
  initVisionneuse(visionneuse);
  initTheme();
  initPanneauGauche();
  initRecherche();
  initCapture(visionneuse);
  initOrganiser();
  initRetouche(visionneuse);
  initBarreOutils();

  // Le panneau des miniatures suit le document
  on('document', ({ nouveau }) => construirePanneau(etat.pdf, { garderOnglet: !nouveau }));

  activerGlisserDeposer();

  // Prévient avant de fermer l'onglet si des modifications ne sont pas enregistrées
  window.addEventListener('beforeunload', (e) => {
    if (etat.modifie) e.preventDefault();
  });
}

/** Ouvrir un PDF en le glissant n'importe où dans la fenêtre. */
function activerGlisserDeposer() {
  const voile = document.getElementById('depot');
  let compteur = 0;
  const contientFichier = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!contientFichier(e)) return;
    compteur++;
    voile.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!contientFichier(e)) return;
    compteur = Math.max(0, compteur - 1);
    if (!compteur) voile.hidden = true;
  });
  window.addEventListener('dragover', (e) => {
    if (contientFichier(e)) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    if (!contientFichier(e)) return;
    e.preventDefault();
    compteur = 0;
    voile.hidden = true;
    try {
      const fichier = await lireDepot(e.dataTransfer);
      if (!fichier) return;
      if (!/\.pdf$/i.test(fichier.nom) && !estUnPdf(fichier.octets)) {
        signalerErreur(new Error('seuls les fichiers PDF sont acceptés'), `« ${fichier.nom} » ignoré`);
        return;
      }
      await ouvrir(fichier);
    } catch (erreur) {
      signalerErreur(erreur, 'Impossible de lire le fichier déposé');
    }
  });
}

/** Vérifie la signature « %PDF » au début du fichier. */
function estUnPdf(octets) {
  return String.fromCharCode(...octets.slice(0, 1024)).includes('%PDF');
}

demarrer();
