// Panneau gauche : miniatures des pages, signets (arborescence) et palette « Modifications ».
import { etat, on } from '../state.js';
import { allerPage } from '../pdf/render.js';
import { icone } from './icones.js';

const LARGEUR_MINIATURE = 120;

let listeMiniatures;
let listeSignets;
let observateur = null;
let generation = 0;

export function initPanneauGauche() {
  const panneau = document.getElementById('panneau-gauche');
  listeMiniatures = document.getElementById('liste-miniatures');
  listeSignets = document.getElementById('liste-signets');

  // Onglets
  panneau.querySelectorAll('.onglet').forEach((onglet) => {
    onglet.addEventListener('click', () => choisirOnglet(onglet.dataset.onglet));
  });

  // Afficher / masquer le panneau
  document.getElementById('btn-panneau').addEventListener('click', () => {
    document.body.classList.toggle('sans-panneau');
  });

  listeMiniatures.addEventListener('click', (e) => {
    const vignette = e.target.closest('.miniature');
    if (vignette) allerPage(Number(vignette.dataset.page));
  });

  on('page', surlignerPageCourante);
}

export function choisirOnglet(nom) {
  // La palette des modifications a besoin de plus de place : le panneau s'élargit.
  document.body.classList.toggle('panneau-large', nom === 'modifications');
  document.querySelectorAll('#panneau-gauche .onglet').forEach((o) => {
    const actif = o.dataset.onglet === nom;
    o.classList.toggle('actif', actif);
    o.setAttribute('aria-selected', String(actif));
  });
  document.querySelectorAll('#panneau-gauche .contenu-onglet').forEach((c) => {
    c.hidden = c.dataset.contenu !== nom;
  });
}

/** Reconstruit les miniatures et les signets pour le document ouvert. */
export async function construirePanneau(pdf, { garderOnglet = false } = {}) {
  generation++;
  construireMiniatures(pdf);
  const aDesSignets = await construireSignets(pdf);
  const actuel = document.querySelector('#panneau-gauche .onglet.actif')?.dataset.onglet;
  if (!garderOnglet && actuel !== 'modifications') choisirOnglet(aDesSignets ? 'signets' : 'miniatures');
}

export function viderPanneau() {
  generation++;
  observateur?.disconnect();
  listeMiniatures.replaceChildren();
  listeSignets.replaceChildren();
}

// ---------- Miniatures ----------

function construireMiniatures(pdf) {
  observateur?.disconnect();
  listeMiniatures.replaceChildren();
  const gen = generation;
  const fragment = document.createDocumentFragment();
  for (let n = 1; n <= pdf.numPages; n++) {
    const vignette = document.createElement('button');
    vignette.className = 'miniature';
    vignette.dataset.page = String(n);
    vignette.title = `Page ${n}`;
    vignette.innerHTML = `<div class="cadre"></div><span class="numero">${n}</span>`;
    fragment.append(vignette);
  }
  listeMiniatures.append(fragment);

  // Les miniatures sont dessinées seulement quand elles deviennent visibles.
  observateur = new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      if (!entree.isIntersecting) continue;
      observateur.unobserve(entree.target);
      dessinerMiniature(pdf, entree.target, gen);
    }
  }, { root: listeMiniatures, rootMargin: '300px 0px' });
  listeMiniatures.querySelectorAll('.miniature').forEach((v) => observateur.observe(v));
  surlignerPageCourante(etat.pageCourante);
}

/** Dessine une miniature de page dans un canvas. */
export async function dessinerMiniature(pdf, vignette, gen = generation, largeur = LARGEUR_MINIATURE) {
  try {
    const page = await pdf.getPage(Number(vignette.dataset.page));
    // gen = null : pas de vérification (utilisé par la vue « Organiser les pages »)
    if ((gen !== null && gen !== generation) || !vignette.isConnected) return;
    const base = page.getViewport({ scale: 1 });
    const echelle = largeur / base.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vue = page.getViewport({ scale: echelle * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vue.width);
    canvas.height = Math.floor(vue.height);
    canvas.style.width = `${Math.floor(vue.width / dpr)}px`;
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vue }).promise;
    const cadre = vignette.querySelector('.cadre');
    cadre.replaceChildren(canvas);
    cadre.classList.add('prete');
  } catch (erreur) {
    if (erreur?.name !== 'RenderingCancelledException') console.warn('Miniature', erreur);
  }
}

function surlignerPageCourante(n) {
  const precedente = listeMiniatures.querySelector('.miniature.courante');
  precedente?.classList.remove('courante');
  const vignette = listeMiniatures.querySelector(`.miniature[data-page="${n}"]`);
  if (!vignette) return;
  vignette.classList.add('courante');
  // Garde la miniature courante visible dans le panneau
  const r = vignette.getBoundingClientRect();
  const p = listeMiniatures.getBoundingClientRect();
  if (r.top < p.top || r.bottom > p.bottom) vignette.scrollIntoView({ block: 'nearest' });
}

// ---------- Signets ----------

async function construireSignets(pdf) {
  listeSignets.replaceChildren();
  let plan = null;
  try {
    plan = await pdf.getOutline();
  } catch {
    plan = null;
  }
  if (!plan?.length) {
    listeSignets.innerHTML = '<p class="vide">Ce document ne contient pas de signets.</p>';
    return false;
  }
  listeSignets.append(creerBranche(pdf, plan, 0));
  return true;
}

function creerBranche(pdf, elements, niveau) {
  const liste = document.createElement('ul');
  liste.className = 'arbre';
  liste.setAttribute('role', niveau === 0 ? 'tree' : 'group');
  for (const element of elements) {
    const li = document.createElement('li');
    li.setAttribute('role', 'treeitem');
    const ligne = document.createElement('div');
    ligne.className = 'signet';
    const aEnfants = element.items?.length > 0;
    const bascule = document.createElement('button');
    bascule.className = 'bascule';
    bascule.innerHTML = aEnfants ? icone('droite') : '';
    bascule.disabled = !aEnfants;
    bascule.title = aEnfants ? 'Déplier / replier' : '';
    const lien = document.createElement('button');
    lien.className = 'titre-signet';
    lien.textContent = element.title || '(sans titre)';
    if (element.bold) lien.style.fontWeight = '600';
    if (element.italic) lien.style.fontStyle = 'italic';
    lien.addEventListener('click', () => suivreSignet(pdf, element));
    ligne.append(bascule, lien);
    li.append(ligne);
    if (aEnfants) {
      const enfants = creerBranche(pdf, element.items, niveau + 1);
      // Les premiers niveaux sont dépliés, comme dans Acrobat
      const ouvert = niveau === 0;
      enfants.hidden = !ouvert;
      li.classList.toggle('ouvert', ouvert);
      li.setAttribute('aria-expanded', String(ouvert));
      bascule.addEventListener('click', () => {
        enfants.hidden = !enfants.hidden;
        li.classList.toggle('ouvert', !enfants.hidden);
        li.setAttribute('aria-expanded', String(!enfants.hidden));
      });
      li.append(enfants);
    }
    liste.append(li);
  }
  return liste;
}

/** Va à la page désignée par un signet. */
async function suivreSignet(pdf, element) {
  try {
    let destination = element.dest;
    if (typeof destination === 'string') destination = await pdf.getDestination(destination);
    if (!Array.isArray(destination)) return;
    const cible = destination[0];
    const index = typeof cible === 'number' ? cible : await pdf.getPageIndex(cible);
    allerPage(index + 1);
  } catch (erreur) {
    console.warn('Signet non résolu', erreur);
  }
}
