// Palette « Modifications » (onglet du panneau gauche) : liste de tout ce qui a été ajouté au document.
// Sections : surlignages, surlignages commentés, retouches de texte, corbeille.
// Clic sur un élément : la vue se place dessus et il clignote. Poubelle : suppression (récupérable).
import { etat, on } from '../state.js';
import { montrerZone } from '../pdf/render.js';
import {
  inventaire, corbeille, supprimerUneAnnotation, modifierUneAnnotation, restaurer, viderCorbeille,
  supprimerUneRetouche,
} from '../modifications.js';
import { faireClignoter, choisir, versCss } from './outil-surlignage.js';
import { icone } from './icones.js';
import { ouvrirDialogue, confirmer, echapper } from './dialogues.js';

let liste;
let compteur;
const replies = new Set(); // sections repliées (mémorisées pendant la session)

export function initPalette() {
  liste = document.getElementById('liste-modifications');
  compteur = document.getElementById('compteur-modifications');
  on('inventaire', dessiner);
  on('modifie', dessiner); // lecture seule : les poubelles disparaissent
  liste.addEventListener('click', surClic);
  dessiner();
}

/** Texte court pour une ligne de la liste. */
function court(texte, max = 90) {
  const t = (texte ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function dateCourte(date) {
  return date ? date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
}

function ligneAnnotation(a, index) {
  const extrait = a.extrait ? `« ${echapper(court(a.extrait))} »` : `<em>${a.zone ? 'Zone sans texte' : 'Texte non lisible'}</em>`;
  const commentaire = a.commentaire ? `<span class="commentaire">${echapper(court(a.commentaire, 160))}</span>` : '';
  const actions = etat.lectureSeule ? '' : `
      <button class="btn-icone petit" data-action="commenter" data-index="${index}" title="${a.commentaire ? 'Modifier le commentaire' : 'Ajouter un commentaire'}">${icone('crayon')}</button>
      <button class="btn-icone petit" data-action="supprimer" data-index="${index}" title="Supprimer (récupérable dans la corbeille)">${icone('corbeille')}</button>`;
  return `
    <li class="modif">
      <button class="modif-corps" data-action="aller" data-index="${index}" title="Afficher dans le document">
        <span class="pastille" style="background:${versCss(a.couleur)}"></span>
        <span class="modif-texte">
          <span class="extrait">${extrait}</span>
          ${commentaire}
          <span class="meta">p. ${a.page} · ${echapper(a.libelle)}${a.date ? ` · ${dateCourte(a.date)}` : ''}</span>
        </span>
      </button>
      <span class="modif-actions">${actions}</span>
    </li>`;
}

/** « avant » → « après » (ou « Texte ajouté »). */
function resumeRetouche(r, max = 60) {
  const apres = `« ${court(r.texte, max)} »`;
  return r.texteOrigine ? `« ${court(r.texteOrigine, max)} » → ${apres}` : `Texte ajouté : ${apres}`;
}

function ligneRetouche(r, index) {
  const actions = etat.lectureSeule ? '' : `
      <button class="btn-icone petit" data-action="retirer" data-index="${index}" title="Retirer la retouche (le texte d'origine revient ; récupérable dans la corbeille)">${icone('corbeille')}</button>`;
  return `
    <li class="modif">
      <button class="modif-corps" data-action="aller-retouche" data-index="${index}" title="Afficher dans le document">
        <span class="pastille carree" style="background:${versCss(r.reglages?.fond ?? [1, 1, 1])}; color:${versCss(r.couleur)}">T</span>
        <span class="modif-texte">
          <span class="extrait">${echapper(resumeRetouche(r))}</span>
          <span class="meta">p. ${r.page} · ${r.texteOrigine ? 'Texte retouché' : 'Texte ajouté'}${r.date ? ` · ${dateCourte(new Date(r.date))}` : ''}</span>
        </span>
      </button>
      <span class="modif-actions">${actions}</span>
    </li>`;
}

function ligneCorbeille(entree, index) {
  const a = entree.element;
  const retouche = entree.genre === 'retouche';
  const libelle = retouche ? (a.texteOrigine ? 'Texte retouché' : 'Texte ajouté') : a.libelle;
  let titre = a.commentaire ? court(a.commentaire, 70) : (a.extrait ? `« ${court(a.extrait, 70)} »` : a.libelle);
  if (retouche) titre = resumeRetouche(a, 30);
  const actions = etat.lectureSeule ? '' : `
      <button class="btn-icone petit" data-action="restaurer" data-index="${index}" title="Restaurer dans le document">${icone('restaurer')}</button>
      <button class="btn-icone petit" data-action="oublier" data-index="${index}" title="Retirer définitivement de la corbeille">${icone('fermer')}</button>`;
  return `
    <li class="modif dans-corbeille">
      <div class="modif-corps">
        <span class="pastille${retouche ? ' carree' : ''}" style="background:${versCss(retouche ? (a.reglages?.fond ?? [1, 1, 1]) : a.couleur)}">${retouche ? 'T' : ''}</span>
        <span class="modif-texte">
          <span class="extrait">${echapper(titre)}</span>
          <span class="meta">p. ${a.page} · ${echapper(libelle)} · supprimé à ${entree.supprimeLe.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </span>
      </div>
      <span class="modif-actions">${actions}</span>
    </li>`;
}

function section(cle, titre, nombre, contenu, vide, extra = '') {
  const replie = replies.has(cle);
  return `
    <section class="groupe-modifs${replie ? ' replie' : ''}" data-section="${cle}">
      <header>
        <button class="titre-section" data-action="replier" data-section="${cle}" aria-expanded="${!replie}">
          ${icone(replie ? 'droite' : 'bas')}<span>${titre}</span><span class="nombre">${nombre}</span>
        </button>
        ${extra}
      </header>
      ${replie ? '' : (nombre ? `<ul>${contenu}</ul>` : `<p class="vide">${vide}</p>`)}
    </section>`;
}

let elementsAffiches = { annotations: [], retouches: [], corbeille: [] };

function dessiner() {
  if (!liste) return;
  const total = inventaire.annotations.length + inventaire.retouches.length;
  compteur.textContent = total ? String(total) : '';
  compteur.hidden = !total;
  if (!etat.pdf) {
    liste.innerHTML = '<p class="vide">Aucun document ouvert.</p>';
    return;
  }
  const surlignages = [];
  const commentaires = [];
  inventaire.annotations.forEach((a) => (a.commentaire ? commentaires : surlignages).push(a));
  const annotations = [...surlignages, ...commentaires];
  const { retouches } = inventaire;
  elementsAffiches = { annotations, retouches: [...retouches], corbeille: [...corbeille] };
  const indice = (a) => annotations.indexOf(a);

  const boutonVider = corbeille.length && !etat.lectureSeule
    ? '<button class="btn-lien" data-action="vider" title="Vider la corbeille">Vider</button>' : '';
  liste.innerHTML = `
    ${inventaire.pret ? '' : '<p class="vide chargement-liste">Lecture du document…</p>'}
    ${section('surlignages', 'Surlignages', surlignages.length, surlignages.map((a) => ligneAnnotation(a, indice(a))).join(''),
    'Aucun surlignage. Outil <strong>Surligner</strong> dans la barre du haut.')}
    ${section('commentaires', 'Surlignages commentés', commentaires.length, commentaires.map((a) => ligneAnnotation(a, indice(a))).join(''),
    'Aucun commentaire. Cliquez sur un surlignage avec l\'outil <strong>Surligner</strong> pour le commenter.')}
    ${section('retouches', 'Retouches de texte', retouches.length, retouches.map(ligneRetouche).join(''),
    'Aucune retouche. Outil <strong>Retouche</strong> dans la barre du haut. (Les retouches faites avant la version 1.3 ne sont pas listées.)')}
    ${section('corbeille', 'Corbeille', corbeille.length, corbeille.map(ligneCorbeille).join(''),
    'Vide. Les éléments supprimés arrivent ici et peuvent être restaurés jusqu\'à la fermeture du document.', boutonVider)}`;
}

async function surClic(e) {
  const bouton = e.target.closest('[data-action]');
  if (!bouton) return;
  const { action } = bouton.dataset;
  const index = Number(bouton.dataset.index);
  if (action === 'replier') {
    const cle = bouton.dataset.section;
    if (replies.has(cle)) replies.delete(cle);
    else replies.add(cle);
    dessiner();
    return;
  }
  if (action === 'vider') {
    if (await confirmer('Vider la corbeille', `Les ${corbeille.length} élément(s) de la corbeille ne pourront plus être restaurés.`, { libelle: 'Vider', danger: true })) viderCorbeille();
    return;
  }
  if (action === 'restaurer' || action === 'oublier') {
    const entree = elementsAffiches.corbeille[index];
    if (!entree) return;
    if (action === 'restaurer') restaurer(entree);
    else viderCorbeille(entree);
    return;
  }
  if (action === 'aller-retouche' || action === 'retirer') {
    const r = elementsAffiches.retouches[index];
    if (!r) return;
    if (action === 'retirer') supprimerUneRetouche(r);
    else allerA(r);
    return;
  }
  const a = elementsAffiches.annotations[index];
  if (!a) return;
  if (action === 'aller') allerA(a);
  else if (action === 'supprimer') supprimerUneAnnotation(a);
  else if (action === 'commenter') commenter(a);
}

/** Place la vue sur un élément et le fait clignoter. */
function allerA(a) {
  montrerZone(a.page, a.cadre);
  // Laisse le temps au défilement (et au mode page simple) de s'appliquer
  requestAnimationFrame(() => faireClignoter(a.page, a.rects));
  if (etat.outil === 'surlignage' && a.ref) choisir(a);
}

async function commenter(a) {
  allerA(a);
  const { valeur, contenu } = await ouvrirDialogue({
    titre: a.commentaire ? 'Modifier le commentaire' : 'Ajouter un commentaire',
    contenu: `
      ${a.extrait ? `<p class="discret">Page ${a.page} · « ${echapper(court(a.extrait, 200))} »</p>` : ''}
      <label class="champ">Commentaire
        <textarea name="commentaire" rows="5" spellcheck="true">${echapper(a.commentaire)}</textarea>
      </label>
      <p class="discret">Laisser vide pour retirer le commentaire (le surlignage reste).</p>`,
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, principal: true },
    ],
  });
  if (!valeur) return;
  const texte = contenu.querySelector('[name="commentaire"]').value;
  if (texte.trim() === a.commentaire) return;
  await modifierUneAnnotation(a, { commentaire: texte }, texte.trim() ? 'Commentaire enregistré.' : 'Commentaire retiré.');
}
