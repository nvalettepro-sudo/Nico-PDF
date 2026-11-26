// Outil « Surligner » : surligner, souligner, barrer du texte ou surligner une zone, puis commenter.
// Gère aussi, quel que soit l'outil actif : les repères des commentaires sur les pages,
// la bulle qui affiche un commentaire au survol, et le clignotement d'un élément retrouvé.
import { etat, on } from '../state.js';
import {
  positionDansPage, viewportPage, divPage, placerEnPourcentage,
} from '../pdf/render.js';
import { COULEURS, TYPES } from '../pdf/annotations.js';
import {
  inventaire, annotationSousLePoint, annotationParRef, ajouterAnnotation, modifierUneAnnotation,
  supprimerUneAnnotation,
} from '../modifications.js';
import { placerIcones, icone } from './icones.js';
import { notifier } from './dialogues.js';

const CLE_REGLAGES = 'nicopdf.surlignage';

let panneau;
let visionneuse;
let reglages = { type: 'surligner', couleur: 0 };
let choisie = null; // annotation sélectionnée (modifiable dans le panneau)
let refAChoisir = null; // annotation tout juste créée, à sélectionner dès qu'elle est relue
let trace = null; // zone en cours de tracé
let bulle = null;
let survolPrevu = false;

export function initSurlignage(element) {
  visionneuse = element;
  panneau = document.getElementById('panneau-droit');
  try {
    Object.assign(reglages, JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? '{}'));
  } catch {
    // réglages par défaut
  }
  if (!TYPES[reglages.type]) reglages.type = 'surligner';
  if (!COULEURS[reglages.couleur]) reglages.couleur = 0;

  on('outil', (outil) => {
    if (outil === 'surlignage') ouvrirPanneau();
    else if (panneau.querySelector('.panneau-surlignage')) fermerPanneau();
    majClasses();
  });
  on('document', ({ nouveau }) => {
    if (nouveau) choisir(null);
  });
  on('inventaire', () => {
    if (refAChoisir) {
      const nouvelle = annotationParRef(refAChoisir);
      if (nouvelle) {
        refAChoisir = null;
        choisir(nouvelle, { focus: true });
      }
    } else if (choisie) {
      choisir(annotationParRef(choisie.ref));
    }
    dessinerReperes();
  });
  on('rotation-vue', dessinerReperes);

  document.addEventListener('pointerup', surFinSelection);
  visionneuse.addEventListener('pointerdown', debutZone);
  visionneuse.addEventListener('pointermove', (e) => {
    if (trace) majZone(e);
    else planifierSurvol(e);
  });
  visionneuse.addEventListener('pointerup', finZone);
  visionneuse.addEventListener('pointercancel', () => {
    trace?.cadre.remove();
    trace = null;
  });
  visionneuse.addEventListener('pointerleave', cacherBulle);
  visionneuse.addEventListener('scroll', cacherBulle, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (etat.outil !== 'surlignage' || !choisie || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      supprimerUneAnnotation(choisie);
    }
  });
}

function memoriserReglages() {
  try {
    localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages));
  } catch {
    // stockage indisponible : sans conséquence
  }
}

function majClasses() {
  visionneuse.classList.toggle('outil-surlignage', etat.outil === 'surlignage');
  visionneuse.classList.toggle('mode-zone', etat.outil === 'surlignage' && reglages.type === 'zone');
}

// ---------- Panneau ----------

function nuancier(nom, actif) {
  return COULEURS.map((c, i) => `
    <button type="button" class="pastille-couleur${i === actif ? ' actif' : ''}" data-${nom}="${i}"
      title="${c.nom}" aria-label="${c.nom}" aria-pressed="${i === actif}"
      style="--couleur: ${versCss(c.rvb)}"></button>`).join('');
}

function ouvrirPanneau() {
  panneau.hidden = false;
  panneau.innerHTML = `
    <div class="retouche panneau-surlignage">
      <h2>Surligner et commenter</h2>
      <div class="choix-type" role="group" aria-label="Type">
        ${Object.entries(TYPES).map(([cle, t]) => `
          <button type="button" class="btn${cle === reglages.type ? ' actif' : ''}" data-type="${cle}"
            aria-pressed="${cle === reglages.type}">${{ surligner: 'Surligner', souligner: 'Souligner', barrer: 'Barrer', zone: 'Zone' }[cle]}</button>`).join('')}
      </div>
      <div class="nuancier" role="group" aria-label="Couleur">${nuancier('couleur', reglages.couleur)}</div>
      <p class="consigne" id="consigne-surlignage"></p>
      <section class="annotation-choisie" id="annotation-choisie" hidden>
        <h3>Élément sélectionné</h3>
        <p class="original" id="description-choisie"></p>
        <label class="champ">Commentaire
          <textarea name="commentaire" rows="4" spellcheck="true" placeholder="Votre commentaire…"></textarea>
        </label>
        <div class="nuancier petit" role="group" aria-label="Changer la couleur">${nuancier('recolorer', -1)}</div>
        <div class="actions">
          <button type="button" class="btn danger" id="btn-supprimer-annotation" data-icone="corbeille"><span>Supprimer</span></button>
          <button type="button" class="btn principal" id="btn-enregistrer-commentaire">Enregistrer</button>
        </div>
      </section>
    </div>`;
  placerIcones(panneau);
  majConsigne();

  panneau.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    reglages.type = b.dataset.type;
    panneau.querySelectorAll('[data-type]').forEach((x) => {
      x.classList.toggle('actif', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    memoriserReglages();
    majClasses();
    majConsigne();
  }));
  panneau.querySelectorAll('[data-couleur]').forEach((b) => b.addEventListener('click', () => {
    reglages.couleur = Number(b.dataset.couleur);
    panneau.querySelectorAll('[data-couleur]').forEach((x) => {
      x.classList.toggle('actif', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    memoriserReglages();
  }));
  panneau.querySelectorAll('[data-recolorer]').forEach((b) => b.addEventListener('click', () => {
    if (choisie) modifierUneAnnotation(choisie, { couleur: COULEURS[Number(b.dataset.recolorer)].rvb }, 'Couleur changée.');
  }));
  const champ = panneau.querySelector('[name="commentaire"]');
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      enregistrerCommentaire();
    }
  });
  panneau.querySelector('#btn-enregistrer-commentaire').addEventListener('click', enregistrerCommentaire);
  panneau.querySelector('#btn-supprimer-annotation').addEventListener('click', () => {
    if (choisie) supprimerUneAnnotation(choisie);
  });
  if (choisie) choisir(choisie);
}

function fermerPanneau() {
  choisir(null);
  trace?.cadre.remove();
  trace = null;
  panneau.hidden = true;
  panneau.replaceChildren();
}

function majConsigne() {
  const consigne = panneau.querySelector('#consigne-surlignage');
  if (!consigne) return;
  consigne.textContent = reglages.type === 'zone'
    ? 'Tracez un rectangle sur la page (utile pour les plans et les scans, sans texte sélectionnable).'
    : 'Sélectionnez du texte sur la page : il est marqué dès que vous relâchez la souris. Cliquez sur un élément existant pour le commenter.';
}

async function enregistrerCommentaire() {
  if (!choisie) return;
  const texte = panneau.querySelector('[name="commentaire"]').value;
  if (texte.trim() === choisie.commentaire) {
    notifier('Commentaire inchangé.');
    return;
  }
  await modifierUneAnnotation(choisie, { commentaire: texte }, texte.trim() ? 'Commentaire enregistré.' : 'Commentaire retiré.');
}

/** Sélectionne une annotation (ou aucune) : panneau et contour sur la page. */
export function choisir(a, { focus = false } = {}) {
  const changement = a?.ref !== choisie?.ref;
  choisie = a;
  const section = panneau?.querySelector('#annotation-choisie');
  if (section) {
    section.hidden = !a;
    if (a) {
      const extrait = a.extrait ? ` · « ${a.extrait.length > 140 ? `${a.extrait.slice(0, 140)}…` : a.extrait} »` : '';
      panneau.querySelector('#description-choisie').textContent = `Page ${a.page} · ${a.libelle}${extrait}`;
      const champ = panneau.querySelector('[name="commentaire"]');
      if (changement || document.activeElement !== champ) champ.value = a.commentaire;
      if (focus) champ.focus();
    }
  }
  dessinerReperes();
}

// ---------- Surligner une sélection de texte ----------

/** Rectangles (en pixels de la page) couverts par la sélection, regroupés par page. */
function rectsDeLaSelection(selection) {
  const parPage = new Map();
  for (let k = 0; k < selection.rangeCount; k++) {
    const plage = selection.getRangeAt(k);
    const racine = plage.commonAncestorContainer;
    const noeuds = [];
    if (racine.nodeType === Node.TEXT_NODE) {
      noeuds.push(racine);
    } else {
      const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (plage.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      while (parcours.nextNode()) noeuds.push(parcours.currentNode);
    }
    for (const noeud of noeuds) {
      const div = noeud.parentElement?.closest('.textLayer')?.closest('.page');
      if (!div || !noeud.textContent.trim()) continue;
      const morceau = document.createRange();
      morceau.selectNodeContents(noeud);
      if (noeud === plage.startContainer) morceau.setStart(noeud, plage.startOffset);
      if (noeud === plage.endContainer) morceau.setEnd(noeud, plage.endOffset);
      if (!morceau.toString().trim()) continue;
      const boite = div.getBoundingClientRect();
      const n = Number(div.dataset.page);
      if (!parPage.has(n)) parPage.set(n, []);
      for (const r of morceau.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        parPage.get(n).push({
          g: r.left - boite.left, h: r.top - boite.top, d: r.right - boite.left, b: r.bottom - boite.top,
        });
      }
    }
  }
  return parPage;
}

/** Regroupe des rectangles (pixels) par ligne et fusionne les morceaux voisins. */
function fusionnerParLigne(rects) {
  const tries = [...rects].sort((r1, r2) => (r1.h + r1.b) / 2 - (r2.h + r2.b) / 2);
  const lignes = [];
  for (const r of tries) {
    const ligne = lignes.find((l) => {
      const recouvrement = Math.min(l.b, r.b) - Math.max(l.h, r.h);
      return recouvrement > 0.5 * Math.min(l.b - l.h, r.b - r.h);
    });
    if (ligne) ligne.membres.push(r);
    else lignes.push({ h: r.h, b: r.b, membres: [r] });
    if (ligne) {
      ligne.h = Math.min(ligne.h, r.h);
      ligne.b = Math.max(ligne.b, r.b);
    }
  }
  const resultat = [];
  for (const ligne of lignes) {
    const membres = ligne.membres.sort((r1, r2) => r1.g - r2.g);
    let courant = null;
    const hauteur = ligne.b - ligne.h;
    for (const r of membres) {
      if (courant && r.g - courant.d < hauteur * 0.8) {
        courant.d = Math.max(courant.d, r.d);
      } else {
        courant = { g: r.g, d: r.d, h: ligne.h, b: ligne.b };
        resultat.push(courant);
      }
    }
  }
  return resultat;
}

/** Pixels de la page -> rectangle PDF [x1, y1, x2, y2]. */
function versPdf(n, { g, h, d, b }) {
  const vue = viewportPage(n);
  const [x1, y1] = vue.convertToPdfPoint(g, h);
  const [x2, y2] = vue.convertToPdfPoint(d, b);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function surFinSelection(e) {
  if (etat.outil !== 'surlignage' || reglages.type === 'zone' || e.button !== 0) return;
  if (document.querySelector('dialog[open]')) return;
  if (!visionneuse.contains(e.target) && !window.getSelection()?.toString()) return;
  // Laisse le navigateur terminer la sélection
  setTimeout(() => traiterSelection(e), 0);
}

async function traiterSelection(e) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    // Simple clic : sélectionne l'élément sous la souris (ou aucun)
    const pos = visionneuse.contains(e.target) ? positionDansPage(e) : null;
    if (pos) choisir(annotationSousLePoint(pos.n, pos.px, pos.py));
    return;
  }
  const parPage = rectsDeLaSelection(selection);
  if (!parPage.size) return;
  selection.removeAllRanges();
  const couleur = COULEURS[reglages.couleur].rvb;
  const pages = [...parPage.entries()].filter(([, rects]) => rects.length);
  let derniere = null;
  for (const [n, rects] of pages) {
    const pdfRects = fusionnerParLigne(rects).map((r) => versPdf(n, r));
    if (!pdfRects.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const ref = await ajouterAnnotation({ page: n, type: reglages.type, rects: pdfRects, couleur }, `${TYPES[reglages.type].libelle}${pages.length > 1 ? ` (page ${n})` : ''}.`);
    if (ref) derniere = ref;
  }
  if (derniere) {
    refAChoisir = derniere;
    if (annotationParRef(derniere)) {
      choisir(annotationParRef(derniere), { focus: true });
      refAChoisir = null;
    }
  }
}

// ---------- Surligner une zone ----------

function debutZone(e) {
  if (etat.outil !== 'surlignage' || reglages.type !== 'zone' || e.button !== 0) return;
  const pos = positionDansPage(e);
  if (!pos) return;
  // Clic sur un élément existant : sélection, pas de nouveau tracé
  const existante = annotationSousLePoint(pos.n, pos.px, pos.py);
  e.preventDefault();
  const cadre = document.createElement('div');
  cadre.className = 'cadre-capture cadre-zone';
  cadre.style.setProperty('--couleur', versCss(COULEURS[reglages.couleur].rvb));
  pos.div.querySelector('.calque-outil').append(cadre);
  trace = {
    n: pos.n, div: pos.div, x0: pos.x, y0: pos.y, cadre, existante,
  };
  placerCadre(pos.x, pos.y);
  visionneuse.setPointerCapture(e.pointerId);
}

function placerCadre(x, y) {
  const { x0, y0, cadre } = trace;
  cadre.style.left = `${Math.min(x0, x)}px`;
  cadre.style.top = `${Math.min(y0, y)}px`;
  cadre.style.width = `${Math.abs(x - x0)}px`;
  cadre.style.height = `${Math.abs(y - y0)}px`;
}

function majZone(e) {
  const r = trace.div.getBoundingClientRect();
  placerCadre(
    Math.min(Math.max(0, e.clientX - r.left), r.width),
    Math.min(Math.max(0, e.clientY - r.top), r.height),
  );
}

async function finZone() {
  if (!trace) return;
  const t = trace;
  trace = null;
  const g = parseFloat(t.cadre.style.left);
  const h = parseFloat(t.cadre.style.top);
  const d = g + parseFloat(t.cadre.style.width);
  const b = h + parseFloat(t.cadre.style.height);
  t.cadre.remove();
  if (d - g < 4 || b - h < 4) {
    choisir(t.existante);
    return;
  }
  const ref = await ajouterAnnotation({
    page: t.n, type: 'zone', rects: [versPdf(t.n, { g, h, d, b })], couleur: COULEURS[reglages.couleur].rvb,
  }, 'Zone surlignée.');
  if (ref) {
    refAChoisir = ref;
    const a = annotationParRef(ref);
    if (a) {
      refAChoisir = null;
      choisir(a, { focus: true });
    }
  }
}

// ---------- Repères des commentaires et élément sélectionné ----------

function dessinerReperes() {
  document.querySelectorAll('.calque-annot .repere-commentaire, .calque-annot .annot-choisie').forEach((el) => el.remove());
  for (const a of inventaire.annotations) {
    const calque = divPage(a.page)?.querySelector('.calque-annot');
    if (!calque) continue;
    if (a.commentaire) {
      const repere = document.createElement('div');
      repere.className = 'repere-commentaire';
      repere.innerHTML = icone('bulle');
      repere.style.setProperty('--couleur', versCss(a.couleur));
      if (placerEnPourcentage(repere, a.page, [a.cadre[2], a.cadre[3], a.cadre[2], a.cadre[3]])) calque.append(repere);
    }
    if (choisie && a.ref === choisie.ref && etat.outil === 'surlignage') {
      for (const r of a.rects) {
        const contour = document.createElement('div');
        contour.className = 'annot-choisie';
        if (placerEnPourcentage(contour, a.page, r)) calque.append(contour);
      }
    }
  }
}

/** Fait clignoter un élément retrouvé (rectangles en coordonnées PDF). */
export function faireClignoter(n, rects) {
  const calque = divPage(n)?.querySelector('.calque-annot');
  if (!calque) return;
  calque.querySelectorAll('.clignote').forEach((el) => el.remove());
  for (const r of rects) {
    const marque = document.createElement('div');
    marque.className = 'clignote';
    if (placerEnPourcentage(marque, n, r)) calque.append(marque);
    setTimeout(() => marque.remove(), 2200);
  }
}

// ---------- Bulle de commentaire au survol ----------

function planifierSurvol(e) {
  if (survolPrevu || e.buttons) return;
  survolPrevu = true;
  const { clientX, clientY, target } = e;
  requestAnimationFrame(() => {
    survolPrevu = false;
    montrerBulle({ clientX, clientY, target });
  });
}

function montrerBulle(e) {
  const pos = positionDansPage(e);
  const a = pos ? annotationSousLePoint(pos.n, pos.px, pos.py) : null;
  if (!a?.commentaire) return cacherBulle();
  if (!bulle) {
    bulle = document.createElement('div');
    bulle.className = 'bulle-commentaire';
    bulle.setAttribute('role', 'tooltip');
    document.body.append(bulle);
  }
  if (bulle.dataset.ref !== a.ref) {
    bulle.dataset.ref = a.ref;
    bulle.replaceChildren();
    const texte = document.createElement('p');
    texte.textContent = a.commentaire;
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = [a.auteur, a.date?.toLocaleDateString('fr-FR')].filter(Boolean).join(' · ');
    bulle.append(texte);
    if (meta.textContent) bulle.append(meta);
    bulle.style.setProperty('--couleur', versCss(a.couleur));
  }
  bulle.hidden = false;
  const marge = 14;
  const l = bulle.offsetWidth;
  const h = bulle.offsetHeight;
  let x = e.clientX + marge;
  let y = e.clientY + marge;
  if (x + l > window.innerWidth - 8) x = e.clientX - l - marge;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - marge;
  bulle.style.left = `${Math.max(8, x)}px`;
  bulle.style.top = `${Math.max(8, y)}px`;
  return undefined;
}

function cacherBulle() {
  if (bulle) {
    bulle.hidden = true;
    delete bulle.dataset.ref;
  }
}

// ---------- Couleurs ----------

export function versCss(rvb) {
  return `rgb(${rvb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)).join(' ')})`;
}
