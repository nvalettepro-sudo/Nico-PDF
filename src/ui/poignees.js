// Poignées pour ajuster un surlignage sélectionné :
// - surlignage de texte : une poignée au début, une à la fin ; on les tire lettre par lettre ;
// - zone : une poignée à chaque coin.
// Aperçu pendant le déplacement ; le fichier est modifié une seule fois, au relâchement (Ctrl+Z possible).
import { etat, on } from '../state.js';
import { divPage, viewportPage, rectangleVersEcran } from '../pdf/render.js';
import { modifierUneAnnotation } from '../modifications.js';
import {
  rectsDesPlages, fusionnerParLigne, versPdf, versCss, signalerRedimension,
} from './outil-surlignage.js';
import { notifier } from './dialogues.js';

let visionneuse;
let courante = null; // annotation dont les poignées sont affichées
let glisse = null; // déplacement en cours

export function initPoignees(element) {
  visionneuse = element;
  on('annotation-choisie', (a) => {
    courante = a && !etat.lectureSeule ? a : null;
    if (!glisse) dessiner();
  });
  on('rotation-vue', dessiner);
  on('outil', () => setTimeout(dessiner, 0));
}

/** Rectangles de l'annotation en pixels de la page, dans l'ordre de lecture. */
function rectsEcran(a) {
  const vue = viewportPage(a.page);
  if (!vue) return [];
  return a.rects
    .map((r) => {
      const [g, h, d, b] = rectangleVersEcran(vue, r);
      return {
        g, h, d, b,
      };
    })
    .sort((r1, r2) => ((Math.abs(r1.h - r2.h) > Math.min(r1.b - r1.h, r2.b - r2.h) / 2) ? r1.h - r2.h : r1.g - r2.g));
}

function effacer() {
  document.querySelectorAll('.poignee, .apercu-redimension').forEach((el) => el.remove());
}

/** Place un élément en pourcentages de la page (il suit le zoom sans être redessiné). */
function placer(element, vue, { g, h, d = g, b = h }) {
  element.style.left = `${(g / vue.width) * 100}%`;
  element.style.top = `${(h / vue.height) * 100}%`;
  element.style.width = `${((d - g) / vue.width) * 100}%`;
  element.style.height = `${((b - h) / vue.height) * 100}%`;
}

function dessiner() {
  effacer();
  const a = courante;
  if (!a || !['surlignage', 'selection'].includes(etat.outil)) return;
  const calque = divPage(a.page)?.querySelector('.calque-outil');
  const vue = viewportPage(a.page);
  const rects = rectsEcran(a);
  if (!calque || !vue || !rects.length) return;
  const creer = (classe, titre, zone, donnees) => {
    const p = document.createElement('div');
    p.className = `poignee ${classe}`;
    p.title = titre;
    p.style.setProperty('--couleur', versCss(a.couleur));
    Object.assign(p.dataset, donnees);
    placer(p, vue, zone);
    p.addEventListener('pointerdown', commencer);
    calque.append(p);
  };
  if (a.zone) {
    const { g, h, d, b } = rects[0];
    creer('coin', 'Tirer pour redimensionner la zone', { g, h }, { coin: 'hg' });
    creer('coin', 'Tirer pour redimensionner la zone', { g: d, h }, { coin: 'hd' });
    creer('coin', 'Tirer pour redimensionner la zone', { g, h: b }, { coin: 'bg' });
    creer('coin', 'Tirer pour redimensionner la zone', { g: d, h: b }, { coin: 'bd' });
    return;
  }
  const premier = rects[0];
  const dernier = rects[rects.length - 1];
  creer('debut', 'Tirer pour ajuster le début', { g: premier.g, h: premier.h, b: premier.b }, { bout: 'debut' });
  creer('fin', 'Tirer pour ajuster la fin', { g: dernier.d, h: dernier.h, b: dernier.b }, { bout: 'fin' });
}

// ---------- Position du curseur dans le texte ----------

/** Position (nœud de texte, décalage) sous un point de l'écran, si c'est du texte de la page n. */
function positionTexte(x, y, n) {
  let noeud;
  let decalage;
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    noeud = p?.offsetNode;
    decalage = p?.offset;
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    noeud = r?.startContainer;
    decalage = r?.startOffset;
  }
  if (!noeud || noeud.nodeType !== Node.TEXT_NODE) return null;
  const page = noeud.parentElement?.closest('.textLayer')?.closest('.page');
  if (!page || Number(page.dataset.page) !== n) return null;
  return { noeud, decalage };
}

/** Plage de texte entre deux positions, dans le bon ordre. */
function plageEntre(p1, p2) {
  const plage = document.createRange();
  plage.setStart(p1.noeud, p1.decalage);
  plage.collapse(true);
  if (plage.comparePoint(p2.noeud, p2.decalage) >= 0) {
    plage.setEnd(p2.noeud, p2.decalage);
  } else {
    plage.setStart(p2.noeud, p2.decalage);
    plage.setEnd(p1.noeud, p1.decalage);
  }
  return plage;
}

// ---------- Déplacement ----------

function commencer(e) {
  if (e.button !== 0 || !courante) return;
  e.preventDefault();
  e.stopPropagation();
  const a = courante;
  const div = divPage(a.page);
  const boite = div.getBoundingClientRect();
  const rects = rectsEcran(a);
  const poignee = e.currentTarget;
  glisse = {
    a, div, poignee, rects: null,
  };
  if (a.zone) {
    const { g, h, d, b } = rects[0];
    const coin = poignee.dataset.coin;
    // Coin opposé : il reste fixe
    glisse.fixe = { x: coin.includes('g') ? d : g, y: coin.startsWith('h') ? b : h };
  } else {
    // Bout opposé : on retrouve la lettre sous lui
    const ref = poignee.dataset.bout === 'debut' ? rects[rects.length - 1] : rects[0];
    const x = poignee.dataset.bout === 'debut' ? ref.d - 1.5 : ref.g + 1.5;
    visionneuse.classList.add('redimension');
    glisse.fixe = positionTexte(boite.left + x, boite.top + (ref.h + ref.b) / 2, a.page);
    if (!glisse.fixe) {
      visionneuse.classList.remove('redimension');
      glisse = null;
      notifier('Le texte sous ce surlignage n\'est pas accessible : impossible de l\'ajuster ici.', 'attention');
      return;
    }
  }
  visionneuse.classList.add('redimension');
  poignee.classList.add('active');
  signalerRedimension(true);
  window.addEventListener('pointermove', deplacer);
  window.addEventListener('pointerup', terminer, { once: true });
  window.addEventListener('pointercancel', annuler, { once: true });
}

function deplacer(e) {
  if (!glisse) return;
  const { a, div } = glisse;
  const boite = div.getBoundingClientRect();
  let rects = null;
  if (a.zone) {
    const x = Math.min(Math.max(0, e.clientX - boite.left), boite.width);
    const y = Math.min(Math.max(0, e.clientY - boite.top), boite.height);
    const { fixe } = glisse;
    rects = [{
      g: Math.min(fixe.x, x), d: Math.max(fixe.x, x), h: Math.min(fixe.y, y), b: Math.max(fixe.y, y),
    }];
    if (rects[0].d - rects[0].g < 4 || rects[0].b - rects[0].h < 4) return;
  } else {
    const mobile = positionTexte(e.clientX, e.clientY, a.page);
    if (!mobile) return; // entre deux lignes : on garde le dernier aperçu
    const brut = rectsDesPlages([plageEntre(glisse.fixe, mobile)]).get(a.page) ?? [];
    if (!brut.length) return;
    rects = fusionnerParLigne(brut);
  }
  glisse.rects = rects;
  apercu(a, rects);
}

function apercu(a, rects) {
  document.querySelectorAll('.apercu-redimension').forEach((el) => el.remove());
  const calque = divPage(a.page)?.querySelector('.calque-outil');
  const vue = viewportPage(a.page);
  if (!calque || !vue) return;
  for (const r of rects) {
    const el = document.createElement('div');
    el.className = `apercu-redimension${a.sousType === 'Highlight' ? '' : ' trait'}`;
    el.style.setProperty('--couleur', versCss(a.couleur));
    placer(el, vue, r);
    calque.append(el);
  }
}

function nettoyer() {
  window.removeEventListener('pointermove', deplacer);
  visionneuse.classList.remove('redimension');
  glisse?.poignee.classList.remove('active');
  signalerRedimension(false);
}

async function terminer() {
  const g = glisse;
  nettoyer();
  glisse = null;
  if (!g?.rects?.length) {
    dessiner();
    return;
  }
  const pdfRects = g.rects.map((r) => versPdf(g.a.page, r));
  const ok = await modifierUneAnnotation(g.a, { rects: pdfRects }, g.a.zone ? 'Zone ajustée.' : 'Surlignage ajusté.');
  if (!ok) dessiner();
}

function annuler() {
  nettoyer();
  glisse = null;
  dessiner();
}
