// Inventaire des modifications du document : surlignages, commentaires, retouches de texte,
// plus la corbeille qui permet de récupérer un élément supprimé par erreur.
// L'inventaire est relu dans le fichier après chaque modification (y compris annuler / rétablir) :
// il reflète toujours ce que contient réellement le PDF.
import { etat, on, emit } from './state.js';
import { appliquerModification } from './document.js';
import { pdfjsLib } from './pdf/loader.js';
import {
  lireAnnotationsPage, texteSousRects, creerAnnotation, supprimerAnnotation, modifierAnnotation,
} from './pdf/annotations.js';
import { appliquerRetouche, coinsZone } from './pdf/edit-text.js';
import {
  lireRetouches, ecrireRetouches, effacerDessinRetouche, entreeRetouche, zonesRetouche,
} from './pdf/retouches.js';
import { ouvrirAvecPdfLib } from './pdf/pages.js';
import { notifier, signalerErreur } from './ui/dialogues.js';

/** Contenu actuel du document. */
export const inventaire = {
  annotations: [], // voir lireAnnotationsPage
  retouches: [], // retouches mémorisées dans le fichier (voir pdf/retouches.js)
  pret: false,
};

/** Éléments supprimés pendant la session (vidée à l'ouverture d'un autre document). */
export const corbeille = [];

let generation = 0;
const cacheExtraits = new Map(); // signature -> texte couvert

export function initModifications() {
  on('document', ({ nouveau }) => {
    if (nouveau) {
      corbeille.length = 0;
      cacheExtraits.clear();
    }
    relire();
  });
}

/** Signature d'une annotation : sa référence et sa position (pour reconnaître un élément restauré par Ctrl+Z). */
function signature(a) {
  return `${a.ref}|${a.page}|${a.rects.map((r) => r.map((v) => Math.round(v)).join(',')).join(';')}`;
}

/** Relit toutes les annotations du document. */
async function relire() {
  const gen = ++generation;
  const pdf = etat.pdf;
  inventaire.pret = false;
  if (!pdf) {
    inventaire.annotations = [];
    inventaire.retouches = [];
    emit('inventaire');
    return;
  }
  const outils = { dateDepuisPdf: (d) => pdfjsLib.PDFDateString.toDateObject(d) };
  const toutes = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    if (gen !== generation) return;
    const annotations = await lireAnnotationsPage(page, n, outils);
    if (!annotations.length) continue;
    // Texte couvert par chaque annotation (lu dans la page, mis en cache)
    let contenu = null;
    for (const a of annotations) {
      a.pageRef = page.ref ? { num: page.ref.num, gen: page.ref.gen } : null;
      a.signature = signature(a);
      const cleCache = `${a.signature}|${page.ref?.num}`;
      if (!cacheExtraits.has(cleCache)) {
        contenu ??= await page.getTextContent().catch(() => ({ items: [] }));
        cacheExtraits.set(cleCache, texteSousRects(contenu, a.rects));
      }
      a.extrait = cacheExtraits.get(cleCache);
    }
    toutes.push(...annotations);
  }
  if (gen !== generation) return;

  // Retouches de texte mémorisées dans le fichier (lues avec pdf-lib)
  const retouches = [];
  try {
    const doc = await ouvrirAvecPdfLib(etat.octets);
    for (const r of lireRetouches(doc)) {
      const points = zonesRetouche(r).flatMap((z) => coinsZone(z));
      if (!points.length) continue;
      const cadre = [
        Math.min(...points.map((pt) => pt[0])), Math.min(...points.map((pt) => pt[1])),
        Math.max(...points.map((pt) => pt[0])), Math.max(...points.map((pt) => pt[1])),
      ];
      retouches.push({
        brut: r,
        id: r.id,
        page: r.page,
        pageRef: { num: r.pageRef[0], gen: r.pageRef[1] },
        texte: r.texte ?? '',
        texteOrigine: r.texteOrigine ?? '',
        couleur: r.couleur ?? [0, 0, 0],
        fond: r.fond ?? [1, 1, 1],
        cadre,
        rects: [cadre],
      });
    }
  } catch {
    // PDF protégé ou illisible par pdf-lib : pas de retouche à lister
  }
  if (gen !== generation) return;

  // Haut de page d'abord, puis de gauche à droite
  const ordre = (a, b) => (a.page - b.page) || (b.cadre[3] - a.cadre[3]) || (a.cadre[0] - b.cadre[0]);
  inventaire.annotations = toutes.sort(ordre);
  inventaire.retouches = retouches.sort(ordre);
  inventaire.pret = true;

  // Un élément de la corbeille revenu dans le document (Ctrl+Z) n'y a plus sa place
  const presentes = new Set(toutes.map((a) => a.signature));
  const retouchesPresentes = new Set(retouches.map((r) => r.id));
  for (let i = corbeille.length - 1; i >= 0; i--) {
    const { genre, element } = corbeille[i];
    if ((genre === 'annotation' && presentes.has(element.signature))
      || (genre === 'retouche' && retouchesPresentes.has(element.id))) corbeille.splice(i, 1);
  }
  emit('inventaire');
}

/** Annotations d'une page (pour l'affichage et le survol). */
export function annotationsDeLaPage(n) {
  return inventaire.annotations.filter((a) => a.page === n);
}

/** Annotation sous un point (coordonnées PDF), la plus petite l'emporte. */
export function annotationSousLePoint(n, px, py, marge = 1.5) {
  let meilleure = null;
  let surface = Infinity;
  for (const a of annotationsDeLaPage(n)) {
    for (const [x1, y1, x2, y2] of a.rects) {
      if (px >= x1 - marge && px <= x2 + marge && py >= y1 - marge && py <= y2 + marge) {
        const s = (x2 - x1) * (y2 - y1);
        if (s < surface) {
          surface = s;
          meilleure = a;
        }
      }
    }
  }
  return meilleure;
}

/** Retrouve une annotation de l'inventaire par sa référence. */
export function annotationParRef(ref) {
  return inventaire.annotations.find((a) => a.ref === ref) ?? null;
}

// ---------- Actions ----------

/**
 * Crée une annotation.
 * @returns {Promise<string|null>} référence de l'annotation créée
 */
export async function ajouterAnnotation(donnees, message) {
  let ref = null;
  const ok = await appliquerModification((doc) => {
    ref = creerAnnotation(doc, donnees);
  }, { message });
  return ok ? ref : null;
}

/** Change le commentaire ou la couleur d'une annotation. */
export async function modifierUneAnnotation(a, changements, message) {
  return appliquerModification((doc) => modifierAnnotation(doc, a.ref, changements), { message });
}

/** Supprime une annotation et la place dans la corbeille. */
export async function supprimerUneAnnotation(a) {
  const ok = await appliquerModification((doc) => supprimerAnnotation(doc, a.ref), {
    message: 'Élément supprimé (récupérable dans la corbeille).',
  });
  if (ok) {
    corbeille.unshift({ genre: 'annotation', element: a, supprimeLe: new Date() });
    emit('inventaire');
  }
  return ok;
}

/** Retire une retouche de texte (le texte d'origine réapparaît) et la place dans la corbeille. */
export async function supprimerUneRetouche(r) {
  const ok = await appliquerModification((doc) => {
    const liste = lireRetouches(doc);
    const trouvee = liste.find((x) => x.id === r.id);
    if (!trouvee) throw new Error('Cette retouche est introuvable dans le fichier.');
    effacerDessinRetouche(doc, trouvee);
    liste.splice(liste.indexOf(trouvee), 1);
    ecrireRetouches(doc, liste);
  }, {
    message: r.texteOrigine
      ? 'Retouche retirée : le texte d\'origine est revenu (récupérable dans la corbeille).'
      : 'Texte ajouté retiré (récupérable dans la corbeille).',
  });
  if (ok) {
    corbeille.unshift({ genre: 'retouche', element: r, supprimeLe: new Date() });
    emit('inventaire');
  }
  return ok;
}

/** Numéro actuel de la page d'un élément (les pages ont pu être réordonnées depuis). */
async function pageActuelle(element) {
  if (element.pageRef && etat.pdf) {
    try {
      return (await etat.pdf.getPageIndex(element.pageRef)) + 1;
    } catch {
      // page supprimée entre-temps
    }
  }
  return element.page <= etat.nbPages ? element.page : null;
}

/** Remet dans le document un élément de la corbeille. */
export async function restaurer(entree) {
  const index = corbeille.indexOf(entree);
  if (index < 0) return false;
  const page = await pageActuelle(entree.element);
  if (!page) {
    notifier('La page de cet élément n\'existe plus : il ne peut pas être restauré.', 'attention');
    return false;
  }
  let ok = false;
  try {
    if (entree.genre === 'annotation') {
      const a = entree.element;
      ok = await appliquerModification((doc) => {
        creerAnnotation(doc, {
          page, sousType: a.sousType, zone: a.zone, rects: a.rects, couleur: a.couleur, commentaire: a.commentaire,
        });
      }, { message: 'Élément restauré.' });
    } else if (entree.genre === 'retouche') {
      const r = entree.element;
      let remplaces = [];
      ok = await appliquerModification(async (doc) => {
        const {
          id, pageRef, fluxRef, zoneTexte, page: ancienne, ...parametres
        } = r.brut;
        const liste = lireRetouches(doc);
        const resultat = await appliquerRetouche(doc, { ...parametres, page });
        remplaces = resultat.remplaces;
        liste.push(entreeRetouche({
          id, page: doc.getPage(page - 1), fluxRef: resultat.fluxRef, zoneTexte: resultat.zoneTexte, parametres,
        }));
        ecrireRetouches(doc, liste);
      }, { message: 'Retouche restaurée.' });
      if (ok && remplaces.length) notifier(`Caractères remplacés par « ? » : ${remplaces.join(' ')}`, 'attention', 7000);
    }
  } catch (erreur) {
    signalerErreur(erreur, 'Restauration impossible');
  }
  if (ok) {
    const i = corbeille.indexOf(entree);
    if (i >= 0) corbeille.splice(i, 1);
    emit('inventaire');
  }
  return ok;
}

/** Retire définitivement des éléments de la corbeille (tous si `entree` est absent). */
export function viderCorbeille(entree) {
  if (entree) {
    const i = corbeille.indexOf(entree);
    if (i >= 0) corbeille.splice(i, 1);
  } else {
    corbeille.length = 0;
  }
  emit('inventaire');
}
