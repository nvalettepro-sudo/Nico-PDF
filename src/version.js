// Version, liste des fonctions et historique des versions de Nico PDF.
// Affichés dans la fenêtre « À propos » (bouton ⓘ en haut à droite).
//
// RÈGLES DE MISE À JOUR (à appliquer à chaque modification) :
// 1. Augmenter le numéro dans package.json (« version ») :
//    - correctif ou retouche d'apparence      : 1.1.0 -> 1.1.1
//    - fonction ajoutée, modifiée ou retirée  : 1.1.0 -> 1.2.0
//    - nouvelle version du cahier des charges : 1.x  -> 2.0.0
// 2. Ajouter en tête de HISTORIQUE la nouvelle version et ses modifications majeures.
//    Garder seulement les 4 dernières versions.
// 3. Mettre à jour FONCTIONS à chaque ajout, modification ou suppression de fonction.
// Le script scripts/verifier-version.mjs bloque le build si ces règles ne sont pas respectées.
import paquet from '../package.json';

/** Numéro de version (lu dans package.json, source unique). */
export const VERSION = paquet.version;

/** Fonctions disponibles, regroupées par thème. */
export const FONCTIONS = [
  {
    theme: 'Lecture',
    elements: [
      'Ouvrir un PDF : bouton, glisser-déposer ou Ctrl+O',
      'Affichage net sur écran haute densité, pages dessinées à la demande',
      'Miniatures des pages et signets en arborescence',
      'Zoom : boutons, Ctrl+molette, ajuster à la largeur ou à la page',
      'Rotation de l\'affichage (sans modifier le fichier)',
      'Modes défilement continu, page simple et double page',
      'Recherche de texte (Ctrl+F), insensible à la casse et aux accents',
      'Thème sombre et inversion des couleurs des pages',
      'Sélection et copie du texte (Ctrl+C)',
      'Capture d\'une zone de page en image dans le presse-papiers',
      'PDF protégés par mot de passe : lecture seule',
    ],
  },
  {
    theme: 'Pages',
    elements: [
      'Réordonner les pages par glisser-déposer',
      'Supprimer et pivoter des pages (une ou plusieurs)',
      'Insérer les pages d\'un autre PDF',
      'Extraire des pages dans un nouveau PDF',
      'Remplacer des pages par celles d\'un autre PDF',
    ],
  },
  {
    theme: 'Retouche',
    elements: [
      'Modifier un texte existant (par recouvrement)',
      'Ajouter une zone de texte',
      'Police, taille, gras, italique et couleur réglables',
    ],
  },
  {
    theme: 'Fichier',
    elements: [
      'Enregistrer sur le fichier d\'origine (Chrome, Edge) ou télécharger',
      'Enregistrer sous',
      'Annuler / rétablir les 10 dernières modifications (Ctrl+Z, Ctrl+Y)',
    ],
  },
];

/** Les 4 dernières versions, de la plus récente à la plus ancienne. */
export const HISTORIQUE = [
  {
    version: '1.1.0',
    date: '2026-11-14',
    modifications: [
      'Fenêtre « À propos » : liste des fonctions, numéro de version et historique des versions',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-11-14',
    modifications: [
      'Notifications : pastille de couleur à la place de la bordure latérale',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-14',
    modifications: [
      'Lecteur complet : affichage, miniatures, signets, zoom, modes, recherche, thème sombre',
      'Copie du texte et capture de zone',
      'Organisation des pages : réordonner, supprimer, pivoter, insérer, extraire, remplacer',
      'Retouche du texte par recouvrement et ajout de zones de texte',
      'Enregistrer, enregistrer sous, annuler / rétablir',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-14',
    modifications: [
      'Socle technique : Vite, PDF.js, pdf-lib, déploiement GitHub Pages',
    ],
  },
];
