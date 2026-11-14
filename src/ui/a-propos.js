// Page « À propos » : ce que fait l'application et ses limites, dites franchement.
import { ouvrirDialogue } from './dialogues.js';
import { accesFichiersDisponible } from '../pdf/save.js';
import { VERSION, FONCTIONS, HISTORIQUE } from '../version.js';

/** Date au format français : « 14 novembre 2026 ». */
function dateFr(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function afficherAPropos() {
  return ouvrirDialogue({
    titre: `À propos de Nico PDF — v${VERSION}`,
    classe: 'large',
    contenu: `
      <p><strong>Nico PDF</strong> lit et retouche vos PDF directement dans le navigateur.
      <strong>Vos fichiers ne quittent jamais votre ordinateur</strong> : aucun envoi vers un serveur, aucun outil de suivi.</p>
      <p class="version-actuelle">Version <strong>${VERSION}</strong></p>

      <h3>Fonctions</h3>
      <div class="fonctions">
        ${FONCTIONS.map((g) => `
          <div>
            <h4>${g.theme}</h4>
            <ul>${g.elements.map((e) => `<li>${e}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>

      <h3>Raccourcis clavier</h3>
      <table class="raccourcis">
        <tr><td><kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Ouvrir un PDF</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Enregistrer (<kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd> : enregistrer sous)</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>F</kbd></td><td>Rechercher</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Annuler / rétablir (10 dernières modifications)</td></tr>
        <tr><td><kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd>+molette</td><td>Zoom</td></tr>
        <tr><td><kbd>Page préc.</kbd> / <kbd>Page suiv.</kbd></td><td>Page précédente / suivante</td></tr>
      </table>

      <h3>Limites à connaître</h3>
      <ul class="limites">
        <li><strong>Retouche du texte par recouvrement</strong> : l'ancien texte est caché sous un rectangle,
          mais il <strong>reste dans le fichier</strong> (il peut encore être copié ou trouvé par une recherche).
          N'utilisez pas cet outil pour masquer une information sensible : il n'y a pas de caviardage.</li>
        <li><strong>Polices</strong> : le nouveau texte utilise Helvetica, Times ou Courier, la police la plus proche
          de l'original. Le rendu peut légèrement différer.</li>
        <li><strong>PDF protégés par mot de passe</strong> : lecture seule.</li>
        <li><strong>Enregistrer sur le fichier d'origine</strong> : possible dans Chrome et Edge uniquement ;
          ailleurs, le fichier est téléchargé.
          ${accesFichiersDisponible ? '<em>(disponible dans ce navigateur)</em>' : '<em>(non disponible dans ce navigateur)</em>'}</li>
        <li><strong>Hors périmètre</strong> : annotations, formulaires, caviardage, comparaison de versions.</li>
      </ul>

      <h3>Historique des versions</h3>
      <ol class="historique">
        ${HISTORIQUE.map((v) => `
          <li>
            <div class="entete-version"><strong>${v.version}</strong><span>${dateFr(v.date)}</span></div>
            <ul>${v.modifications.map((m) => `<li>${m}</li>`).join('')}</ul>
          </li>`).join('')}
      </ol>
      <p class="discret">Affichage par PDF.js (Mozilla), modifications par pdf-lib.</p>`,
  });
}
