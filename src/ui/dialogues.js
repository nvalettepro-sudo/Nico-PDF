// Boîtes de dialogue et notifications.
import { icone, placerIcones } from './icones.js';

/**
 * Ouvre une boîte de dialogue.
 * @param {object} options
 * @param {string} options.titre
 * @param {string|HTMLElement} options.contenu HTML ou élément
 * @param {Array<{libelle: string, valeur: any, principal?: boolean, danger?: boolean}>} options.boutons
 * @param {(contenu: HTMLElement, valeur: any) => (string|null|Promise<string|null>)} [options.valider]
 *   renvoie un message d'erreur pour garder la boîte ouverte, ou null pour la fermer
 * @param {string} [options.classe] classe CSS supplémentaire
 * @returns {Promise<{valeur: any, contenu: HTMLElement}>} valeur = null si fermée sans choix
 */
export function ouvrirDialogue({ titre, contenu, boutons = [{ libelle: 'OK', valeur: true, principal: true }], valider, classe = '' }) {
  return new Promise((resolve) => {
    const dialogue = document.createElement('dialog');
    dialogue.className = `dialogue ${classe}`;
    dialogue.innerHTML = `
      <form method="dialog">
        <header><h2></h2><button type="button" class="btn-icone fermer" title="Fermer">${icone('fermer')}</button></header>
        <div class="corps"></div>
        <p class="erreur" hidden></p>
        <footer></footer>
      </form>`;
    dialogue.querySelector('h2').textContent = titre;
    const corps = dialogue.querySelector('.corps');
    if (typeof contenu === 'string') corps.innerHTML = contenu;
    else corps.append(contenu);
    placerIcones(corps);
    const pied = dialogue.querySelector('footer');
    const erreur = dialogue.querySelector('.erreur');
    let resultat = null;

    boutons.forEach((b, i) => {
      const bouton = document.createElement('button');
      bouton.type = b.principal ? 'submit' : 'button';
      bouton.className = `btn${b.principal ? ' principal' : ''}${b.danger ? ' danger' : ''}`;
      bouton.textContent = b.libelle;
      bouton.dataset.index = String(i);
      bouton.addEventListener('click', async (e) => {
        e.preventDefault();
        if (valider && b.valeur !== null && b.valeur !== false) {
          const message = await valider(corps, b.valeur);
          if (message) {
            erreur.textContent = message;
            erreur.hidden = false;
            return;
          }
        }
        resultat = b.valeur;
        dialogue.close();
      });
      pied.append(bouton);
    });

    dialogue.querySelector('.fermer').addEventListener('click', () => dialogue.close());
    // Entrée dans un champ = bouton principal
    dialogue.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      pied.querySelector('button[type="submit"]')?.click();
    });
    dialogue.addEventListener('close', () => {
      dialogue.remove();
      resolve({ valeur: resultat, contenu: corps });
    });
    document.body.append(dialogue);
    dialogue.showModal();
    corps.querySelector('input, select, textarea')?.focus();
  });
}

/** Demande une confirmation. Renvoie true si l'utilisateur accepte. */
export async function confirmer(titre, message, { libelle = 'Continuer', danger = false } = {}) {
  const { valeur } = await ouvrirDialogue({
    titre,
    contenu: `<p>${message}</p>`,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      { libelle, valeur: true, principal: true, danger },
    ],
  });
  return valeur === true;
}

/** Affiche un message d'information. */
export async function informer(titre, message) {
  await ouvrirDialogue({ titre, contenu: `<p>${message}</p>` });
}

/** Demande le mot de passe d'un PDF protégé. Renvoie null si l'utilisateur annule. */
export async function demanderMotDePasse(incorrect) {
  const { valeur, contenu } = await ouvrirDialogue({
    titre: 'PDF protégé par mot de passe',
    contenu: `
      ${incorrect ? '<p class="alerte">Mot de passe incorrect, réessayez.</p>' : ''}
      <label class="champ">Mot de passe
        <input type="password" name="mdp" autocomplete="off" />
      </label>
      <p class="discret">Un PDF protégé s'ouvre en lecture seule : les outils de modification sont désactivés.</p>`,
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Ouvrir', valeur: true, principal: true },
    ],
  });
  return valeur ? contenu.querySelector('[name="mdp"]').value : null;
}

// ---------- Notifications ----------

/**
 * Affiche une notification temporaire en bas de l'écran.
 * @param {string} message
 * @param {'info'|'succes'|'erreur'|'attention'} type
 */
export function notifier(message, type = 'info', duree = 4000) {
  const zone = document.getElementById('notifications');
  const note = document.createElement('div');
  note.className = `notification ${type}`;
  note.textContent = message;
  zone.append(note);
  setTimeout(() => {
    note.classList.add('sortie');
    setTimeout(() => note.remove(), 300);
  }, type === 'erreur' ? Math.max(duree, 7000) : duree);
}

/** Affiche une erreur de façon lisible (et le détail technique dans la console). */
export function signalerErreur(erreur, contexte = 'Une erreur est survenue') {
  console.error(contexte, erreur);
  notifier(`${contexte} : ${erreur?.message ?? erreur}`, 'erreur');
}

/** Échappe un texte pour l'insérer dans du HTML. */
export function echapper(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
