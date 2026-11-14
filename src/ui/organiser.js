// Vue « Organiser les pages » : grille de miniatures pour réordonner (glisser-déposer),
// supprimer, pivoter, insérer, extraire et remplacer des pages.
import { etat, on, peutAnnuler, peutRetablir } from '../state.js';
import { appliquerModification, enregistrerCopie } from '../document.js';
import {
  pivoter, supprimer, reordonner, inserer, extraire, remplacer, lirePlages, ecrirePlages, ouvrirAvecPdfLib,
} from '../pdf/pages.js';
import { choisirFichierClassique, nomAvecSuffixe } from '../pdf/save.js';
import { dessinerMiniature } from './panneau-gauche.js';
import { icone, placerIcones } from './icones.js';
import {
  ouvrirDialogue, confirmer, notifier, signalerErreur, echapper,
} from './dialogues.js';
import { allerPage } from '../pdf/render.js';

const LARGEUR = 150;

let vue;
let grille;
let selection = new Set(); // index des pages sélectionnées (à partir de 0)
let ancre = null; // dernier clic, pour la sélection avec Maj
let observateur = null;
let glisses = null; // pages en cours de déplacement

export function initOrganiser() {
  vue = document.getElementById('organiseur');
  vue.innerHTML = `
    <div class="organiseur-barre">
      <h2>Organiser les pages</h2>
      <span class="compte-selection" id="compte-selection"></span>
      <div class="groupe">
        <button class="btn" data-action="tout" title="Tout sélectionner (Ctrl+A)">Tout sélectionner</button>
      </div>
      <div class="groupe">
        <button class="btn-icone" data-action="gauche" data-icone="rotation-gauche" title="Pivoter de 90° à gauche" data-sel></button>
        <button class="btn-icone" data-action="droite" data-icone="rotation" title="Pivoter de 90° à droite" data-sel></button>
        <button class="btn-icone danger" data-action="supprimer" data-icone="corbeille" title="Supprimer (Suppr)" data-sel></button>
      </div>
      <div class="groupe">
        <button class="btn" data-action="inserer" data-icone="inserer"><span>Insérer un PDF…</span></button>
        <button class="btn" data-action="extraire" data-icone="extraire"><span>Extraire…</span></button>
        <button class="btn" data-action="remplacer" data-icone="remplacer" data-sel><span>Remplacer…</span></button>
      </div>
      <div class="groupe">
        <button class="btn-icone" data-action="annuler" data-icone="annuler" title="Annuler (Ctrl+Z)"></button>
        <button class="btn-icone" data-action="retablir" data-icone="retablir" title="Rétablir (Ctrl+Y)"></button>
      </div>
      <button class="btn principal fin" data-action="fermer">Terminé</button>
    </div>
    <p class="organiseur-aide">Cliquez pour sélectionner (Ctrl + clic : plusieurs, Maj + clic : une suite). Glissez les pages pour changer leur ordre. Double-clic : ouvrir la page.</p>
    <div class="grille-pages" id="grille-pages"></div>`;
  placerIcones(vue);
  grille = vue.querySelector('#grille-pages');

  vue.querySelector('.organiseur-barre').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-action]');
    if (bouton && !bouton.disabled) executer(bouton.dataset.action);
  });

  grille.addEventListener('click', surClic);
  grille.addEventListener('dblclick', (e) => {
    const carte = e.target.closest('.carte-page');
    if (!carte) return;
    fermerOrganiser();
    allerPage(Number(carte.dataset.index) + 1);
  });
  grille.addEventListener('dragstart', surDebutGlisser);
  grille.addEventListener('dragover', surSurvol);
  grille.addEventListener('dragleave', (e) => {
    if (!grille.contains(e.relatedTarget)) effacerIndicateur();
  });
  grille.addEventListener('drop', surDepot);
  grille.addEventListener('dragend', () => {
    glisses = null;
    effacerIndicateur();
    grille.querySelectorAll('.deplacee').forEach((c) => c.classList.remove('deplacee'));
  });

  document.addEventListener('keydown', (e) => {
    if (vue.hidden || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') fermerOrganiser();
    else if (e.key === 'Delete' && selection.size) executer('supprimer');
    else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      executer('tout');
    }
  });

  on('document', () => {
    if (!vue.hidden) construireGrille();
  });
  on('historique', majBoutons);
}

export function ouvrirOrganiser() {
  if (!etat.pdf) return;
  selection = new Set([etat.pageCourante - 1]);
  ancre = etat.pageCourante - 1;
  vue.hidden = false;
  document.body.classList.add('organisation');
  construireGrille();
  grille.querySelector('.carte-page.selectionnee')?.scrollIntoView({ block: 'center' });
}

export function fermerOrganiser() {
  vue.hidden = true;
  document.body.classList.remove('organisation');
  observateur?.disconnect();
  grille.replaceChildren();
}

export function organiserOuvert() {
  return vue && !vue.hidden;
}

// ---------- Grille ----------

function construireGrille() {
  observateur?.disconnect();
  grille.replaceChildren();
  const pdf = etat.pdf;
  // Garde une sélection valide après une modification
  selection = new Set([...selection].filter((i) => i < etat.nbPages));
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < etat.nbPages; i++) {
    const carte = document.createElement('div');
    carte.className = 'carte-page';
    carte.draggable = true;
    carte.dataset.index = String(i);
    carte.dataset.page = String(i + 1);
    carte.innerHTML = `
      <div class="cadre" style="width:${LARGEUR}px"></div>
      <div class="pied-carte">
        <span class="numero">${i + 1}</span>
        <span class="actions-carte">
          <button class="btn-mini" data-carte="gauche" title="Pivoter à gauche">${icone('rotation-gauche')}</button>
          <button class="btn-mini" data-carte="droite" title="Pivoter à droite">${icone('rotation')}</button>
          <button class="btn-mini danger" data-carte="supprimer" title="Supprimer cette page">${icone('corbeille')}</button>
        </span>
      </div>`;
    fragment.append(carte);
  }
  grille.append(fragment);
  observateur = new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      if (!entree.isIntersecting) continue;
      observateur.unobserve(entree.target);
      dessinerMiniature(pdf, entree.target, null, LARGEUR);
    }
  }, { root: grille, rootMargin: '400px 0px' });
  grille.querySelectorAll('.carte-page').forEach((c) => observateur.observe(c));
  majSelection();
}

function majSelection() {
  grille.querySelectorAll('.carte-page').forEach((carte) => {
    carte.classList.toggle('selectionnee', selection.has(Number(carte.dataset.index)));
  });
  const n = selection.size;
  vue.querySelector('#compte-selection').textContent = n
    ? `${n} page${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''} sur ${etat.nbPages}`
    : `${etat.nbPages} page${etat.nbPages > 1 ? 's' : ''}`;
  majBoutons();
}

function majBoutons() {
  if (!vue) return;
  vue.querySelectorAll('[data-sel]').forEach((b) => {
    b.disabled = selection.size === 0;
  });
  vue.querySelector('[data-action="annuler"]').disabled = !peutAnnuler();
  vue.querySelector('[data-action="retablir"]').disabled = !peutRetablir();
}

function surClic(e) {
  const carte = e.target.closest('.carte-page');
  if (!carte) {
    if (e.target === grille) {
      selection.clear();
      majSelection();
    }
    return;
  }
  const index = Number(carte.dataset.index);
  const actionCarte = e.target.closest('[data-carte]')?.dataset.carte;
  if (actionCarte) {
    executer(actionCarte, [index]);
    return;
  }
  if (e.shiftKey && ancre !== null) {
    const [a, b] = [Math.min(ancre, index), Math.max(ancre, index)];
    if (!e.ctrlKey) selection.clear();
    for (let i = a; i <= b; i++) selection.add(i);
  } else if (e.ctrlKey || e.metaKey) {
    if (selection.has(index)) selection.delete(index);
    else selection.add(index);
    ancre = index;
  } else {
    selection = new Set([index]);
    ancre = index;
  }
  majSelection();
}

// ---------- Glisser-déposer ----------

function surDebutGlisser(e) {
  const carte = e.target.closest('.carte-page');
  if (!carte) return;
  const index = Number(carte.dataset.index);
  if (!selection.has(index)) {
    selection = new Set([index]);
    ancre = index;
    majSelection();
  }
  glisses = [...selection].sort((a, b) => a - b);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', glisses.join(','));
  glisses.forEach((i) => grille.querySelector(`.carte-page[data-index="${i}"]`)?.classList.add('deplacee'));
}

/** Position d'insertion (0 à nbPages) selon la position de la souris. */
function positionInsertion(e) {
  const carte = e.target.closest('.carte-page');
  if (!carte) return null;
  const r = carte.getBoundingClientRect();
  const index = Number(carte.dataset.index);
  return e.clientX < r.left + r.width / 2 ? index : index + 1;
}

function surSurvol(e) {
  if (!glisses) return;
  const position = positionInsertion(e);
  if (position === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  effacerIndicateur();
  const cartes = grille.querySelectorAll('.carte-page');
  if (position < cartes.length) cartes[position].classList.add('inserer-avant');
  else cartes[cartes.length - 1].classList.add('inserer-apres');
}

function effacerIndicateur() {
  grille.querySelectorAll('.inserer-avant, .inserer-apres').forEach((c) => c.classList.remove('inserer-avant', 'inserer-apres'));
}

async function surDepot(e) {
  if (!glisses) return;
  e.preventDefault();
  const position = positionInsertion(e);
  const deplaces = glisses;
  glisses = null;
  effacerIndicateur();
  if (position === null) return;
  // Nouvel ordre : les pages restantes, avec les pages déplacées insérées à la position visée
  const restantes = [];
  for (let i = 0; i < etat.nbPages; i++) if (!deplaces.includes(i)) restantes.push(i);
  const decalage = deplaces.filter((i) => i < position).length;
  const cible = position - decalage;
  const ordre = [...restantes.slice(0, cible), ...deplaces, ...restantes.slice(cible)];
  if (ordre.every((ancien, i) => ancien === i)) return; // rien n'a bougé
  const ok = await appliquerModification((doc) => reordonner(doc, ordre), {
    message: `${deplaces.length > 1 ? `${deplaces.length} pages déplacées` : 'Page déplacée'}.`,
  });
  if (ok) {
    selection = new Set(deplaces.map((_, k) => cible + k));
    majSelection();
  }
}

// ---------- Actions ----------

async function executer(action, indices = [...selection].sort((a, b) => a - b)) {
  try {
    switch (action) {
      case 'tout':
        selection = new Set(Array.from({ length: etat.nbPages }, (_, i) => i));
        majSelection();
        break;
      case 'gauche':
      case 'droite':
        if (!indices.length) return;
        await appliquerModification((doc) => pivoter(doc, indices, action === 'droite' ? 90 : -90), {
          message: `${indices.length > 1 ? `${indices.length} pages pivotées` : 'Page pivotée'}.`,
        });
        break;
      case 'supprimer':
        await actionSupprimer(indices);
        break;
      case 'inserer':
        await actionInserer();
        break;
      case 'extraire':
        await actionExtraire();
        break;
      case 'remplacer':
        await actionRemplacer();
        break;
      case 'annuler':
        document.getElementById('btn-annuler').click();
        break;
      case 'retablir':
        document.getElementById('btn-retablir').click();
        break;
      case 'fermer':
        fermerOrganiser();
        break;
      default:
    }
  } catch (erreur) {
    signalerErreur(erreur, 'Action impossible');
  }
}

async function actionSupprimer(indices) {
  if (!indices.length) return;
  if (indices.length >= etat.nbPages) {
    notifier('Impossible de supprimer toutes les pages : il doit en rester au moins une.', 'attention');
    return;
  }
  if (indices.length > 1 && !(await confirmer('Supprimer des pages',
    `Supprimer ${indices.length} pages (${ecrirePlages(indices)}) ? Vous pourrez annuler avec Ctrl+Z.`,
    { libelle: 'Supprimer', danger: true }))) return;
  const ok = await appliquerModification((doc) => supprimer(doc, indices), {
    message: `${indices.length > 1 ? `${indices.length} pages supprimées` : 'Page supprimée'}.`,
  });
  if (ok) {
    selection = new Set([Math.min(indices[0], etat.nbPages - 1)]);
    majSelection();
  }
}

/** Demande un PDF source et renvoie ses octets et son nombre de pages. */
async function choisirSource() {
  const fichier = await choisirFichierClassique('application/pdf,.pdf');
  if (!fichier) return null;
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const doc = await ouvrirAvecPdfLib(octets);
  return { octets, nom: fichier.name, nbPages: doc.getPageCount() };
}

async function actionInserer() {
  const source = await choisirSource();
  if (!source) return;
  const apres = selection.size ? Math.max(...selection) + 1 : etat.nbPages;
  const { valeur, contenu } = await ouvrirDialogue({
    titre: 'Insérer des pages',
    contenu: `
      <p>Fichier : <strong>${echapper(source.nom)}</strong> (${source.nbPages} page${source.nbPages > 1 ? 's' : ''})</p>
      <label class="champ">Pages à insérer
        <input name="plages" value="1-${source.nbPages}" />
        <small>Exemple : 1-3, 5 (toutes par défaut)</small>
      </label>
      <fieldset class="champ">
        <legend>Position</legend>
        <label><input type="radio" name="ou" value="debut" /> Au début du document</label>
        <label><input type="radio" name="ou" value="apres" checked /> Après la page <input name="page" type="number" min="1" max="${etat.nbPages}" value="${Math.min(apres, etat.nbPages)}" class="petit" /></label>
        <label><input type="radio" name="ou" value="fin" /> À la fin du document</label>
      </fieldset>`,
    boutons: [{ libelle: 'Annuler', valeur: null }, { libelle: 'Insérer', valeur: true, principal: true }],
    valider: (c) => {
      try {
        lirePlages(c.querySelector('[name="plages"]').value, source.nbPages);
      } catch (e) {
        return e.message;
      }
      const p = Number(c.querySelector('[name="page"]').value);
      if (c.querySelector('[name="ou"]:checked').value === 'apres' && !(p >= 1 && p <= etat.nbPages)) {
        return `Indiquez une page entre 1 et ${etat.nbPages}.`;
      }
      return null;
    },
  });
  if (!valeur) return;
  const indicesSource = lirePlages(contenu.querySelector('[name="plages"]').value, source.nbPages);
  const ou = contenu.querySelector('[name="ou"]:checked').value;
  const position = ou === 'debut' ? 0 : ou === 'fin' ? etat.nbPages : Number(contenu.querySelector('[name="page"]').value);
  const ok = await appliquerModification((doc) => inserer(doc, source.octets, position, indicesSource), {
    message: `${indicesSource.length} page${indicesSource.length > 1 ? 's insérées' : ' insérée'}.`,
  });
  if (ok) {
    selection = new Set(indicesSource.map((_, k) => position + k));
    majSelection();
    grille.querySelector(`.carte-page[data-index="${position}"]`)?.scrollIntoView({ block: 'center' });
  }
}

async function actionExtraire() {
  const defaut = selection.size ? ecrirePlages([...selection]) : `1-${etat.nbPages}`;
  const { valeur, contenu } = await ouvrirDialogue({
    titre: 'Extraire des pages',
    contenu: `
      <p>Les pages choisies sont copiées dans un <strong>nouveau PDF</strong>. Le document ouvert n'est pas modifié.</p>
      <label class="champ">Pages à extraire
        <input name="plages" value="${defaut}" />
        <small>Exemple : 1-3, 5</small>
      </label>`,
    boutons: [{ libelle: 'Annuler', valeur: null }, { libelle: 'Extraire', valeur: true, principal: true }],
    valider: (c) => {
      try {
        lirePlages(c.querySelector('[name="plages"]').value, etat.nbPages);
        return null;
      } catch (e) {
        return e.message;
      }
    },
  });
  if (!valeur) return;
  const indices = lirePlages(contenu.querySelector('[name="plages"]').value, etat.nbPages);
  const octets = await extraire(etat.octets, indices);
  await enregistrerCopie(octets, nomAvecSuffixe(etat.nomFichier, `pages ${ecrirePlages(indices)}`));
}

async function actionRemplacer() {
  const cibles = [...selection].sort((a, b) => a - b);
  if (!cibles.length) return;
  const source = await choisirSource();
  if (!source) return;
  const fin = Math.min(cibles.length, source.nbPages);
  const { valeur, contenu } = await ouvrirDialogue({
    titre: 'Remplacer des pages',
    contenu: `
      <p>Pages à remplacer : <strong>${ecrirePlages(cibles)}</strong> (${cibles.length} page${cibles.length > 1 ? 's' : ''})</p>
      <p>Fichier source : <strong>${echapper(source.nom)}</strong> (${source.nbPages} page${source.nbPages > 1 ? 's' : ''})</p>
      <label class="champ">Pages du fichier source à utiliser
        <input name="plages" value="${fin > 1 ? `1-${fin}` : '1'}" />
        <small>Il faut ${cibles.length} page${cibles.length > 1 ? 's' : ''}, dans l'ordre de remplacement.</small>
      </label>`,
    boutons: [{ libelle: 'Annuler', valeur: null }, { libelle: 'Remplacer', valeur: true, principal: true }],
    valider: (c) => {
      try {
        const n = lirePlages(c.querySelector('[name="plages"]').value, source.nbPages).length;
        return n === cibles.length ? null : `Vous avez choisi ${n} page(s) ; il en faut ${cibles.length}.`;
      } catch (e) {
        return e.message;
      }
    },
  });
  if (!valeur) return;
  const indicesSource = lirePlages(contenu.querySelector('[name="plages"]').value, source.nbPages);
  await appliquerModification((doc) => remplacer(doc, cibles, source.octets, indicesSource), {
    message: `${cibles.length} page${cibles.length > 1 ? 's remplacées' : ' remplacée'}.`,
  });
}
