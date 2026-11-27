// Mini-barre qui apparaît au-dessus du texte sélectionné en mode Texte :
// surligner (6 couleurs), souligner, barrer, surligner + commenter, copier,
// et case « Surlignage continu » pour enchaîner les surlignages sans repasser par la barre.
import { etat, on } from '../state.js';
import { COULEURS } from '../pdf/annotations.js';
import { attendreAnnotation } from '../modifications.js';
import {
  reglages, memoriserReglages, plagesDeLaSelection, surlignerPlages, activerContinu, versCss,
} from './outil-surlignage.js';
import { commenter } from './palette-modifications.js';
import { icone } from './icones.js';
import { notifier } from './dialogues.js';

let barre = null;
let visionneuse;
let plages = []; // sélection mémorisée au moment où la barre s'affiche

export function initBarreSelection(element) {
  visionneuse = element;
  document.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || e.altKey || etat.outil !== 'selection' || !etat.pdf || etat.lectureSeule) return;
    if (barre?.contains(e.target)) return;
    setTimeout(montrerSiSelection, 0);
  });
  // La barre disparaît dès que la sélection est perdue, au défilement, ou au changement d'outil
  document.addEventListener('selectionchange', () => {
    if (barre && !barre.hidden && window.getSelection()?.isCollapsed) cacher();
  });
  document.addEventListener('pointerdown', (e) => {
    if (barre && !barre.hidden && !barre.contains(e.target)) cacher();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && barre && !barre.hidden) cacher();
  });
  visionneuse.addEventListener('scroll', cacher, { passive: true });
  on('outil', cacher);
  on('document', cacher);
  on('zoom', cacher);
}

/** Affiche la barre si du texte de la page est sélectionné. */
function montrerSiSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
  const plage = selection.getRangeAt(0);
  const depart = plage.commonAncestorContainer;
  const element = depart.nodeType === Node.TEXT_NODE ? depart.parentElement : depart;
  if (!visionneuse.contains(element)) return;
  const dansLesPages = element.closest('.textLayer') || element.querySelector?.('.textLayer') || element.closest('.zone-pages');
  if (!dansLesPages) return;
  plages = plagesDeLaSelection(selection);
  construire();
  placer(plage.getBoundingClientRect());
}

function construire() {
  if (!barre) {
    barre = document.createElement('div');
    barre.className = 'barre-selection';
    barre.setAttribute('role', 'toolbar');
    barre.setAttribute('aria-label', 'Surligner la sélection');
    // Garder la sélection : un clic dans la barre ne doit pas la défaire
    barre.addEventListener('mousedown', (e) => {
      if (!e.target.closest('input')) e.preventDefault();
    });
    barre.addEventListener('click', surClic);
    document.body.append(barre);
  }
  const couleur = COULEURS[reglages.couleur];
  barre.innerHTML = `
    <div class="groupe-couleurs">
      ${COULEURS.map((c, i) => `
        <button type="button" class="pastille-couleur${i === reglages.couleur ? ' actif' : ''}" data-couleur="${i}"
          title="Surligner en ${c.nom.toLowerCase()}" aria-label="Surligner en ${c.nom.toLowerCase()}"
          style="--couleur: ${versCss(c.rvb)}"></button>`).join('')}
    </div>
    <span class="separateur"></span>
    <button type="button" class="btn-icone petit lettre" data-action="souligner" title="Souligner (${couleur.nom.toLowerCase()})"><u>S</u></button>
    <button type="button" class="btn-icone petit lettre" data-action="barrer" title="Barrer (${couleur.nom.toLowerCase()})"><s>B</s></button>
    <button type="button" class="btn-icone petit" data-action="commenter" title="Surligner et commenter">${icone('bulle')}</button>
    <button type="button" class="btn-icone petit" data-action="copier" title="Copier le texte (Ctrl+C)">${icone('copier')}</button>
    <span class="separateur"></span>
    <label class="case-continu" title="Chaque sélection sera surlignée automatiquement (Échap pour arrêter)">
      <input type="checkbox" data-action="continu" /> Surlignage continu
    </label>`;
  barre.hidden = false;
}

/** Place la barre au-dessus de la sélection (ou dessous s'il n'y a pas la place). */
function placer(r) {
  const l = barre.offsetWidth;
  const h = barre.offsetHeight;
  let x = r.left + r.width / 2 - l / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - l - 8));
  let y = r.top - h - 10;
  if (y < 60) y = r.bottom + 10;
  barre.style.left = `${x}px`;
  barre.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
}

function cacher() {
  if (barre) barre.hidden = true;
}

async function surClic(e) {
  const cible = e.target.closest('[data-couleur], [data-action]');
  if (!cible) return;
  const action = cible.dataset.action ?? 'surligner';
  if (cible.dataset.couleur !== undefined) {
    reglages.couleur = Number(cible.dataset.couleur);
    memoriserReglages();
  }
  if (action === 'copier') {
    await copier();
    return;
  }
  const aSurligner = plages;
  cacher();
  window.getSelection()?.removeAllRanges();
  if (action === 'continu') {
    // Surligne la sélection en cours, puis enchaîne en surlignage continu
    await surlignerPlages(aSurligner, { type: 'surligner', couleur: reglages.couleur, choisirApres: false });
    activerContinu(reglages.couleur, 'surligner');
    notifier('Surlignage continu : chaque sélection est surlignée. Échap pour arrêter.', 'info', 5000);
    return;
  }
  const type = action === 'commenter' ? 'surligner' : action;
  const ref = await surlignerPlages(aSurligner, { type, couleur: reglages.couleur });
  if (action === 'commenter' && ref) {
    const a = await attendreAnnotation(ref);
    if (a) await commenter(a);
  }
}

async function copier() {
  const texte = plages.map((p) => p.toString()).join(' ').trim();
  try {
    await navigator.clipboard.writeText(texte);
  } catch {
    document.execCommand('copy');
  }
  cacher();
  notifier('Texte copié.', 'succes', 1800);
}
