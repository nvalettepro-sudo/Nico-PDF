// Visionneuse : affiche les pages dans la zone centrale.
// Seules les pages visibles (et leurs voisines) sont dessinées, pour tenir sur de gros fichiers.
// Chaque page contient : un canvas (l'image de la page), un calque de texte PDF.js
// (texte invisible mais sélectionnable), un calque de surlignage (recherche),
// un calque d'annotations (repères de commentaires, clignotement) et un calque d'outil (capture, retouche…).
import { pdfjsLib } from './loader.js';
import { etat, emit } from '../state.js';

const MARGE = 16; // espace entre les pages, en pixels
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const PIXELS_MAX = 16_000_000; // taille maximale d'un canvas (mémoire)

let conteneur = null; // zone défilante
let zonePages = null; // conteneur des pages
let divs = []; // div de chaque page (index 0 = page 1)
let tailles = []; // taille de chaque page à 100 % : { l, h, rotation }
let pages = new Map(); // pages PDF.js déjà chargées
let vues = new Map(); // dernier « viewport » (géométrie d'affichage) de chaque page
const rendus = new Map(); // page -> { cle, tache, coucheTexte }
const visibles = new Set();
let observateur = null;
let generation = 0; // change à chaque nouveau document, pour ignorer les rendus périmés
let renduEnCours = false;
let renduDemande = false;
let surlignages = new Map(); // page -> [{ rect, actuel }]

// ---------- Initialisation ----------

export function initVisionneuse(element) {
  conteneur = element;
  zonePages = document.createElement('div');
  zonePages.className = 'zone-pages';
  conteneur.append(zonePages);

  conteneur.addEventListener('scroll', () => detecterPageCourante(), { passive: true });

  // Zoom avec Ctrl + molette
  conteneur.addEventListener('wheel', (e) => {
    if (!etat.pdf) return;
    if (e.ctrlKey) {
      e.preventDefault();
      definirZoom(etat.zoom * Math.exp(-e.deltaY * 0.0025));
      return;
    }
    // Mode page simple : la molette en bout de page passe à la page voisine
    if (etat.modeAffichage === 'simple') {
      const enBas = conteneur.scrollTop + conteneur.clientHeight >= conteneur.scrollHeight - 2;
      const enHaut = conteneur.scrollTop <= 0;
      if (e.deltaY > 0 && enBas && etat.pageCourante < etat.nbPages) {
        e.preventDefault();
        allerPage(etat.pageCourante + 1);
      } else if (e.deltaY < 0 && enHaut && etat.pageCourante > 1) {
        e.preventDefault();
        allerPage(etat.pageCourante - 1, { versLeBas: true });
      }
    }
  }, { passive: false });

  // Recalcule le zoom « ajusté » quand la fenêtre change de taille
  let attente = null;
  new ResizeObserver(() => {
    clearTimeout(attente);
    attente = setTimeout(() => {
      if (etat.pdf && etat.modeZoom !== 'libre') appliquerMiseEnPage();
    }, 120);
  }).observe(conteneur);

  // Sélection de texte plus stable (comme dans la visionneuse de Firefox)
  conteneur.addEventListener('mousedown', (e) => {
    e.target.closest?.('.textLayer')?.classList.add('selecting');
  });
  document.addEventListener('mouseup', () => {
    conteneur.querySelectorAll('.textLayer.selecting').forEach((c) => c.classList.remove('selecting'));
  });
}

// ---------- Document ----------

/** Affiche un document. `page` : page à afficher ; `conserverPosition` : garder le défilement. */
export async function afficherDocument(pdf, { page = 1, conserverPosition = false } = {}) {
  const ancre = conserverPosition ? lireAncre() : null;
  viderVisionneuse();
  const gen = generation;

  // Taille de chaque page (lecture rapide, sans dessin)
  const promesses = [];
  for (let n = 1; n <= pdf.numPages; n++) promesses.push(pdf.getPage(n));
  const liste = await Promise.all(promesses);
  if (gen !== generation) return;
  liste.forEach((p, i) => {
    pages.set(i + 1, p);
    const vue = p.getViewport({ scale: 1, rotation: p.rotate });
    tailles[i] = { l: vue.width, h: vue.height, rotation: p.rotate };
  });

  const fragment = document.createDocumentFragment();
  divs = tailles.map((_, i) => {
    const div = document.createElement('div');
    div.className = 'page';
    div.dataset.page = String(i + 1);
    div.innerHTML = `<div class="textLayer"></div><div class="calque-surlignage"></div><div class="calque-annot"></div><div class="calque-outil"></div>`;
    fragment.append(div);
    return div;
  });
  zonePages.append(fragment);

  observateur = new IntersectionObserver(surVisibilite, { root: conteneur, rootMargin: '150% 0px' });
  divs.forEach((div) => observateur.observe(div));

  etat.pageCourante = Math.min(Math.max(1, ancre?.page ?? page), pdf.numPages);
  appliquerModeAffichage();
  appliquerMiseEnPage({ ancre: ancre ?? { page: etat.pageCourante, fraction: 0 } });
  emit('page', etat.pageCourante);
}

/** Vide entièrement la visionneuse. */
export function viderVisionneuse() {
  generation++;
  observateur?.disconnect();
  for (const { tache } of rendus.values()) tache?.cancel();
  rendus.clear();
  visibles.clear();
  vues.clear();
  pages.clear();
  surlignages.clear();
  divs = [];
  tailles = [];
  zonePages?.replaceChildren();
}

// ---------- Géométrie ----------

/** Taille affichée d'une page pour un zoom donné (en tenant compte de la rotation de la vue). */
function taillePage(n, zoom = etat.zoom) {
  const t = tailles[n - 1];
  if (!t) return { l: 0, h: 0 };
  const tourne = etat.rotationVue % 180 !== 0;
  return {
    l: (tourne ? t.h : t.l) * zoom,
    h: (tourne ? t.l : t.h) * zoom,
  };
}

/** Calcule le zoom pour les modes « ajuster à la largeur » et « ajuster à la page ». */
function zoomAjuste() {
  const ref = taillePage(etat.pageCourante, 1);
  if (!ref.l) return etat.zoom;
  const colonnes = etat.modeAffichage === 'double' ? 2 : 1;
  const largeurDispo = conteneur.clientWidth - 2 * MARGE - (colonnes - 1) * MARGE - 2;
  const hauteurDispo = conteneur.clientHeight - 2 * MARGE;
  const zLargeur = largeurDispo / (ref.l * colonnes);
  if (etat.modeZoom === 'largeur') return zLargeur;
  return Math.min(zLargeur, hauteurDispo / ref.h);
}

/** Position de lecture actuelle : page et fraction de page défilée. */
function lireAncre() {
  const div = divs[etat.pageCourante - 1];
  if (!div || !div.offsetHeight) return { page: etat.pageCourante, fraction: 0 };
  const haut = zonePages.offsetTop + div.offsetTop;
  return {
    page: etat.pageCourante,
    fraction: Math.max(0, (conteneur.scrollTop - haut) / div.offsetHeight),
  };
}

/** Applique le zoom et la rotation à toutes les pages, puis redessine les pages visibles. */
function appliquerMiseEnPage({ ancre = lireAncre() } = {}) {
  if (!divs.length) return;
  if (etat.modeZoom !== 'libre') etat.zoom = zoomAjuste();
  divs.forEach((div, i) => {
    const { l, h } = taillePage(i + 1);
    div.style.width = `${Math.floor(l)}px`;
    div.style.height = `${Math.floor(h)}px`;
  });
  // Restaure la position de lecture
  const div = divs[ancre.page - 1];
  if (div) {
    if (etat.modeAffichage === 'simple') {
      conteneur.scrollTop = ancre.fraction * div.offsetHeight;
    } else {
      conteneur.scrollTop = zonePages.offsetTop + div.offsetTop + ancre.fraction * div.offsetHeight - (ancre.fraction ? 0 : MARGE / 2);
    }
  }
  emit('zoom', etat.zoom);
  planifierRendu();
}

// ---------- Commandes publiques ----------

export function definirZoom(zoom) {
  etat.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  etat.modeZoom = 'libre';
  appliquerMiseEnPage();
}

export function zoomer(facteur) {
  definirZoom(etat.zoom * facteur);
}

export function definirModeZoom(mode) {
  etat.modeZoom = mode;
  appliquerMiseEnPage();
}

export function tournerVue(delta) {
  etat.rotationVue = (etat.rotationVue + delta + 360) % 360;
  appliquerMiseEnPage();
  emit('rotation-vue', etat.rotationVue);
}

export function definirModeAffichage(mode) {
  const ancre = lireAncre();
  etat.modeAffichage = mode;
  appliquerModeAffichage();
  appliquerMiseEnPage({ ancre });
  emit('mode-affichage', mode);
}

function appliquerModeAffichage() {
  zonePages.classList.toggle('mode-double', etat.modeAffichage === 'double');
  zonePages.classList.toggle('mode-simple', etat.modeAffichage === 'simple');
  divs.forEach((div, i) => {
    div.classList.toggle('masquee', etat.modeAffichage === 'simple' && i + 1 !== etat.pageCourante);
  });
}

/** Affiche la page n. */
export function allerPage(n, { versLeBas = false } = {}) {
  if (!divs.length) return;
  n = Math.min(Math.max(1, Math.round(n)), divs.length);
  const div = divs[n - 1];
  if (etat.modeAffichage === 'simple') {
    etat.pageCourante = n;
    appliquerModeAffichage();
    conteneur.scrollTop = versLeBas ? conteneur.scrollHeight : 0;
    planifierRendu();
  } else {
    conteneur.scrollTop = zonePages.offsetTop + div.offsetTop - MARGE / 2;
    etat.pageCourante = n;
  }
  emit('page', n);
}

/** Fait défiler la vue pour montrer un rectangle (coordonnées PDF) de la page n. */
export function montrerZone(n, rectPdf) {
  if (etat.modeAffichage === 'simple' && n !== etat.pageCourante) allerPage(n);
  const div = divs[n - 1];
  const vue = viewportPage(n);
  if (!div || !vue) return allerPage(n);
  const [gauche, haut] = rectangleVersEcran(vue, rectPdf);
  const baseHaut = etat.modeAffichage === 'simple' ? 0 : zonePages.offsetTop + div.offsetTop;
  conteneur.scrollTop = baseHaut + haut - conteneur.clientHeight / 3;
  const baseGauche = zonePages.offsetLeft + div.offsetLeft;
  if (baseGauche + gauche < conteneur.scrollLeft || baseGauche + gauche > conteneur.scrollLeft + conteneur.clientWidth - 40) {
    conteneur.scrollLeft = baseGauche + gauche - 40;
  }
}

// ---------- Page courante ----------

function detecterPageCourante() {
  if (!divs.length || etat.modeAffichage === 'simple') return;
  const boite = conteneur.getBoundingClientRect();
  let meilleure = etat.pageCourante;
  let meilleurScore = -1;
  for (const n of visibles) {
    const r = divs[n - 1].getBoundingClientRect();
    const visible = Math.min(r.bottom, boite.bottom) - Math.max(r.top, boite.top);
    // Favorise la page qui occupe le plus la vue ; à égalité, la plus haute.
    const score = visible / Math.min(r.height, boite.height) - n * 1e-6;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = n;
    }
  }
  if (meilleure !== etat.pageCourante) {
    etat.pageCourante = meilleure;
    emit('page', meilleure);
  }
}

// ---------- Rendu ----------

function surVisibilite(entrees) {
  for (const entree of entrees) {
    const n = Number(entree.target.dataset.page);
    if (entree.isIntersecting) {
      visibles.add(n);
    } else {
      visibles.delete(n);
      libererPage(n);
    }
  }
  planifierRendu();
  detecterPageCourante();
}

function cleRendu() {
  return `${etat.zoom.toFixed(4)}|${etat.rotationVue}|${window.devicePixelRatio || 1}`;
}

/** Dessine, une par une, les pages visibles qui ne sont pas à jour. */
async function planifierRendu() {
  if (renduEnCours) {
    renduDemande = true;
    return;
  }
  renduEnCours = true;
  try {
    do {
      renduDemande = false;
      const cle = cleRendu();
      const aFaire = [...visibles]
        .filter((n) => rendus.get(n)?.cle !== cle && !divs[n - 1]?.classList.contains('masquee'))
        .sort((a, b) => Math.abs(a - etat.pageCourante) - Math.abs(b - etat.pageCourante));
      for (const n of aFaire) {
        if (renduDemande) break; // le zoom a changé entre-temps : on recommence
        await rendrePage(n, cle);
      }
    } while (renduDemande);
  } finally {
    renduEnCours = false;
  }
}

async function rendrePage(n, cle) {
  const gen = generation;
  const page = pages.get(n);
  const div = divs[n - 1];
  if (!page || !div) return;

  const rotation = (page.rotate + etat.rotationVue) % 360;
  const vue = page.getViewport({ scale: etat.zoom, rotation });
  const dpr = window.devicePixelRatio || 1;
  let echelle = dpr;
  if (vue.width * vue.height * dpr * dpr > PIXELS_MAX) {
    echelle = Math.sqrt(PIXELS_MAX / (vue.width * vue.height));
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'canvas-page';
  canvas.width = Math.floor(vue.width * echelle);
  canvas.height = Math.floor(vue.height * echelle);
  const contexte = canvas.getContext('2d', { alpha: false });
  const tache = page.render({
    canvasContext: contexte,
    viewport: vue,
    transform: echelle !== 1 ? [echelle, 0, 0, echelle, 0, 0] : null,
  });
  rendus.get(n)?.tache?.cancel();
  rendus.set(n, { cle, tache });
  try {
    await tache.promise;
  } catch (erreur) {
    if (erreur instanceof pdfjsLib.RenderingCancelledException) return;
    console.error(`Erreur de rendu de la page ${n}`, erreur);
    return;
  }
  if (gen !== generation || rendus.get(n)?.tache !== tache) return;

  div.querySelector('.canvas-page')?.remove();
  div.prepend(canvas);
  vues.set(n, vue);
  rendus.set(n, { cle, tache: null });

  // Calque de texte (sélection, copie)
  const ancienne = div.querySelector('.textLayer');
  const coucheTexte = document.createElement('div');
  coucheTexte.className = 'textLayer';
  ancienne.replaceWith(coucheTexte);
  div.style.setProperty('--total-scale-factor', String(etat.zoom));
  try {
    const calque = new pdfjsLib.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: coucheTexte,
      viewport: vue,
    });
    await calque.render();
    const fin = document.createElement('div');
    fin.className = 'endOfContent';
    coucheTexte.append(fin);
  } catch (erreur) {
    if (erreur?.name !== 'AbortException') console.warn(`Calque de texte page ${n}`, erreur);
  }
  dessinerSurlignages(n);
  emit('page-rendue', n);
}

/** Libère la mémoire d'une page éloignée de la zone visible. */
function libererPage(n) {
  const rendu = rendus.get(n);
  rendu?.tache?.cancel();
  rendus.delete(n);
  const div = divs[n - 1];
  if (!div) return;
  const canvas = div.querySelector('.canvas-page');
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
  }
  div.querySelector('.textLayer')?.replaceChildren();
}

// ---------- Surlignage des résultats de recherche ----------

/**
 * Définit les zones à surligner.
 * @param {Map<number, Array<{rect: number[], actuel: boolean}>>} zones
 */
export function definirSurlignages(zones) {
  const anciennes = [...surlignages.keys()];
  surlignages = zones;
  for (const n of new Set([...anciennes, ...zones.keys()])) dessinerSurlignages(n);
}

function dessinerSurlignages(n) {
  const div = divs[n - 1];
  const calque = div?.querySelector('.calque-surlignage');
  if (!calque) return;
  calque.replaceChildren();
  const zones = surlignages.get(n);
  const vue = viewportPage(n);
  if (!zones?.length || !vue) return;
  for (const { rect, actuel } of zones) {
    const [gauche, haut, droite, bas] = rectangleVersEcran(vue, rect);
    const marque = document.createElement('div');
    marque.className = actuel ? 'surlignage actuel' : 'surlignage';
    marque.style.left = `${gauche}px`;
    marque.style.top = `${haut}px`;
    marque.style.width = `${droite - gauche}px`;
    marque.style.height = `${bas - haut}px`;
    calque.append(marque);
  }
}

// ---------- Accès pour les outils ----------

/**
 * Convertit un rectangle en coordonnées PDF [x1, y1, x2, y2] en pixels à l'écran
 * [gauche, haut, droite, bas], rotation comprise.
 */
export function rectangleVersEcran(vue, [x1, y1, x2, y2]) {
  const [ax, ay] = vue.convertToViewportPoint(x1, y1);
  const [bx, by] = vue.convertToViewportPoint(x2, y2);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/**
 * Place un élément sur un rectangle PDF de la page n, en pourcentages de la page :
 * il reste à sa place quand le zoom change.
 */
export function placerEnPourcentage(element, n, rectPdf) {
  const vue = viewportPage(n);
  if (!vue) return false;
  const [gauche, haut, droite, bas] = rectangleVersEcran(vue, rectPdf);
  element.style.left = `${(gauche / vue.width) * 100}%`;
  element.style.top = `${(haut / vue.height) * 100}%`;
  element.style.width = `${((droite - gauche) / vue.width) * 100}%`;
  element.style.height = `${((bas - haut) / vue.height) * 100}%`;
  return true;
}

/** Géométrie d'affichage de la page n au zoom actuel. */
export function viewportPage(n) {
  const page = pages.get(n);
  if (!page) return null;
  return page.getViewport({ scale: etat.zoom, rotation: (page.rotate + etat.rotationVue) % 360 });
}

export function pagePdfjs(n) {
  return pages.get(n);
}

export function divPage(n) {
  return divs[n - 1];
}

export function canvasPage(n) {
  return divs[n - 1]?.querySelector('.canvas-page');
}

/** Retrouve la page et la position (pixels et coordonnées PDF) sous un événement souris. */
export function positionDansPage(evenement) {
  const div = evenement.target.closest?.('.page');
  if (!div) return null;
  const n = Number(div.dataset.page);
  const r = div.getBoundingClientRect();
  const x = evenement.clientX - r.left;
  const y = evenement.clientY - r.top;
  const vue = viewportPage(n);
  const [px, py] = vue.convertToPdfPoint(x, y);
  return { n, div, x, y, px, py, vue };
}

/** Redessine toutes les pages visibles (après un changement de thème, par exemple). */
export function redessiner() {
  rendus.clear();
  planifierRendu();
}
