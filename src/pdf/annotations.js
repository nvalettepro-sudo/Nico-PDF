// Annotations de texte : surligner, souligner, barrer, surligner une zone, commenter.
// Elles sont enregistrées comme des annotations PDF standard (Highlight, Underline, StrikeOut),
// lisibles par Acrobat, Edge, Chrome, Aperçu… Le contenu de la page n'est jamais touché :
// supprimer une annotation ne laisse aucune trace.
//
// Écriture : pdf-lib (fonctions qui reçoivent `doc`, appelées via appliquerModification).
// Lecture : PDF.js (getAnnotations), pour remplir la palette « Modifications ».
import {
  PDFName, PDFString, PDFHexString, PDFRef, PDFDict, PDFArray, PDFStream, PDFNumber,
} from 'pdf-lib';

/** Types gérés, avec leur nom dans le PDF. */
export const TYPES = {
  surligner: { sousType: 'Highlight', libelle: 'Surligné' },
  souligner: { sousType: 'Underline', libelle: 'Souligné' },
  barrer: { sousType: 'StrikeOut', libelle: 'Barré' },
  zone: { sousType: 'Highlight', libelle: 'Zone surlignée' },
};

/** Sous-types PDF reconnus à la lecture (y compris ceux créés par d'autres logiciels). */
const SOUS_TYPES_LUS = {
  Highlight: 'Surligné',
  Underline: 'Souligné',
  StrikeOut: 'Barré',
  Squiggly: 'Souligné (vague)',
};

/** Couleurs proposées (RVB entre 0 et 1). */
export const COULEURS = [
  { nom: 'Jaune', rvb: [1, 0.85, 0.1] },
  { nom: 'Vert', rvb: [0.4, 0.85, 0.3] },
  { nom: 'Bleu', rvb: [0.3, 0.68, 1] },
  { nom: 'Rose', rvb: [1, 0.42, 0.7] },
  { nom: 'Orange', rvb: [1, 0.58, 0.15] },
  { nom: 'Rouge', rvb: [0.88, 0.12, 0.12] },
];

const OPACITE_SURLIGNAGE = 0.6;
const AUTEUR = 'Nico PDF';

// ---------- Identifiants ----------

/** « 12R » ou « 12R3 » (format de PDF.js) -> référence pdf-lib. */
export function refDepuisTexte(texte) {
  const m = /^(\d+)R(\d+)?$/.exec(texte ?? '');
  return m ? PDFRef.of(Number(m[1]), Number(m[2] ?? 0)) : null;
}

/** Référence pdf-lib -> « 12R » ou « 12R3 » (format de PDF.js). */
export function texteDepuisRef(ref) {
  return ref.generationNumber ? `${ref.objectNumber}R${ref.generationNumber}` : `${ref.objectNumber}R`;
}

/** Nouvel identifiant unique pour une annotation (champ NM du PDF). */
function nouvelIdentifiant() {
  const aleatoire = crypto.getRandomValues(new Uint32Array(2));
  return `nicopdf-${Date.now().toString(36)}-${aleatoire[0].toString(36)}${aleatoire[1].toString(36)}`;
}

/** Intention propre à Nico PDF pour reconnaître une « zone » surlignée (ignorée des autres lecteurs). */
const INTENTION_ZONE = 'NicoZone';

// ---------- Écriture (pdf-lib) ----------

const f = (n) => Number(n.toFixed(3));

/** Rectangle englobant de plusieurs rectangles [x1, y1, x2, y2], avec une petite marge. */
function englobant(rects, marge = 1) {
  const x1 = Math.min(...rects.map((r) => r[0])) - marge;
  const y1 = Math.min(...rects.map((r) => r[1])) - marge;
  const x2 = Math.max(...rects.map((r) => r[2])) + marge;
  const y2 = Math.max(...rects.map((r) => r[3])) + marge;
  return [x1, y1, x2, y2].map(f);
}

/** Dessin de l'annotation (« apparence »), pour qu'elle s'affiche à l'identique partout. */
function creerApparence(contexte, sousType, rects, couleur, cadre) {
  const [r, v, b] = couleur.map(f);
  let operations;
  let ressources = {};
  if (sousType === 'Highlight') {
    ressources = { ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply', ca: OPACITE_SURLIGNAGE, CA: OPACITE_SURLIGNAGE } } };
    operations = ['/GS0 gs', `${r} ${v} ${b} rg`];
    for (const [x1, y1, x2, y2] of rects) {
      operations.push(`${f(x1)} ${f(y1)} ${f(x2 - x1)} ${f(y2 - y1)} re f`);
    }
  } else {
    // Souligner : trait en bas de chaque ligne ; barrer : trait au milieu.
    operations = [`${r} ${v} ${b} RG`];
    for (const [x1, y1, x2, y2] of rects) {
      const h = y2 - y1;
      const y = sousType === 'StrikeOut' ? y1 + h * 0.4 : y1 + h * 0.1;
      operations.push(`${f(Math.max(0.6, h * 0.07))} w`, `${f(x1)} ${f(y)} m ${f(x2)} ${f(y)} l S`);
    }
  }
  const flux = contexte.flateStream(operations.join('\n'), {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: cadre,
    Resources: ressources,
  });
  return contexte.register(flux);
}

/**
 * Ajoute une annotation sur une page.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {object} a
 * @param {number} a.page numéro de page (à partir de 1)
 * @param {'surligner'|'souligner'|'barrer'|'zone'} [a.type]
 * @param {string} [a.sousType] sous-type PDF (prioritaire sur `type`, pour restaurer une annotation)
 * @param {number[][]} a.rects rectangles [x1, y1, x2, y2] en coordonnées PDF (une ligne de texte chacun)
 * @param {number[]} a.couleur RVB entre 0 et 1
 * @param {string} [a.commentaire]
 * @returns {string} référence de l'annotation créée, au format PDF.js (« 12R »)
 */
export function creerAnnotation(doc, a) {
  const page = doc.getPage(a.page - 1);
  const contexte = doc.context;
  const sousType = a.sousType ?? TYPES[a.type]?.sousType ?? 'Highlight';
  const rects = a.rects.map((r) => [
    Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3]),
  ]);
  const cadre = englobant(rects);
  const maintenant = PDFString.fromDate(new Date());
  // Ordre des coins attendu par les lecteurs : haut-gauche, haut-droite, bas-gauche, bas-droite
  const quadPoints = rects.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1].map(f));

  const dict = contexte.obj({
    Type: 'Annot',
    Subtype: sousType,
    Rect: cadre,
    QuadPoints: quadPoints,
    C: a.couleur.map(f),
    CA: sousType === 'Highlight' ? OPACITE_SURLIGNAGE : 1,
    F: 4, // imprimable
    P: page.ref,
    AP: { N: creerApparence(contexte, sousType, rects, a.couleur, cadre) },
  });
  dict.set(PDFName.of('NM'), PDFString.of(nouvelIdentifiant()));
  if (a.type === 'zone' || a.zone) dict.set(PDFName.of('IT'), PDFName.of(INTENTION_ZONE));
  dict.set(PDFName.of('T'), PDFHexString.fromText(AUTEUR));
  dict.set(PDFName.of('M'), maintenant);
  dict.set(PDFName.of('CreationDate'), maintenant);
  if (a.commentaire?.trim()) dict.set(PDFName.of('Contents'), PDFHexString.fromText(a.commentaire.trim()));
  const ref = contexte.register(dict);
  page.node.addAnnot(ref);
  return texteDepuisRef(ref);
}

/** Retrouve une annotation par sa référence. Renvoie { page, annots, index, dict } ou null. */
function trouverAnnotation(doc, refTexte) {
  const cible = refDepuisTexte(refTexte);
  if (!cible) return null;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const brut = annots.get(i);
      if (brut instanceof PDFRef && brut.objectNumber === cible.objectNumber
        && brut.generationNumber === cible.generationNumber) {
        return { page, annots, index: i, dict: doc.context.lookup(brut, PDFDict), ref: brut };
      }
    }
  }
  return null;
}

/** Supprime du fichier les objets d'une apparence (pour ne rien laisser de caché). */
function effacerApparence(contexte, ap) {
  if (!(ap instanceof PDFDict)) return;
  for (const cle of ['N', 'R', 'D']) {
    const brut = ap.get(PDFName.of(cle));
    const valeur = brut instanceof PDFRef ? contexte.lookup(brut) : brut;
    if (valeur instanceof PDFDict && !(valeur instanceof PDFStream)) {
      // Apparences par état : un sous-dictionnaire de flux
      for (const [, sous] of valeur.entries()) if (sous instanceof PDFRef) contexte.delete(sous);
    }
    if (brut instanceof PDFRef) contexte.delete(brut);
  }
}

/**
 * Supprime une annotation (et sa bulle éventuelle) du fichier.
 * @param {string} refTexte référence au format PDF.js (« 12R »)
 */
export function supprimerAnnotation(doc, refTexte) {
  const trouve = trouverAnnotation(doc, refTexte);
  if (!trouve) throw new Error('Cette annotation est introuvable dans le fichier.');
  const { annots, index, dict, ref } = trouve;
  const contexte = doc.context;
  annots.remove(index);
  // Bulle de commentaire associée (créée par Acrobat, par exemple)
  const popup = dict.get(PDFName.of('Popup'));
  if (popup instanceof PDFRef) {
    for (let i = annots.size() - 1; i >= 0; i--) {
      const brut = annots.get(i);
      if (brut instanceof PDFRef && brut.objectNumber === popup.objectNumber) annots.remove(i);
    }
    contexte.delete(popup);
  }
  effacerApparence(contexte, dict.lookupMaybe(PDFName.of('AP'), PDFDict));
  contexte.delete(ref);
}

/** Lit les rectangles d'une annotation à partir de ses QuadPoints (ou de son Rect). */
function rectsDeLAnnotation(dict) {
  const quads = dict.lookupMaybe(PDFName.of('QuadPoints'), PDFArray);
  const nombres = (tableau) => tableau.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
  if (quads && quads.size() >= 8 && quads.size() % 8 === 0) {
    const q = nombres(quads);
    const rects = [];
    for (let i = 0; i < q.length; i += 8) {
      const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]];
      const ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
      rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    return rects;
  }
  const rect = dict.lookupMaybe(PDFName.of('Rect'), PDFArray);
  return rect ? [nombres(rect)] : [];
}

/**
 * Modifie le commentaire et / ou la couleur d'une annotation.
 * @param {string} refTexte référence au format PDF.js
 * @param {{ commentaire?: string, couleur?: number[] }} changements
 */
export function modifierAnnotation(doc, refTexte, { commentaire, couleur } = {}) {
  const trouve = trouverAnnotation(doc, refTexte);
  if (!trouve) throw new Error('Cette annotation est introuvable dans le fichier.');
  const { dict } = trouve;
  const contexte = doc.context;
  if (commentaire !== undefined) {
    if (commentaire.trim()) dict.set(PDFName.of('Contents'), PDFHexString.fromText(commentaire.trim()));
    else dict.delete(PDFName.of('Contents'));
  }
  if (couleur) {
    dict.set(PDFName.of('C'), contexte.obj(couleur.map(f)));
    const sousType = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText().replace(/^\//, '');
    const rects = rectsDeLAnnotation(dict);
    if (rects.length && ['Highlight', 'Underline', 'StrikeOut'].includes(sousType)) {
      effacerApparence(contexte, dict.lookupMaybe(PDFName.of('AP'), PDFDict));
      const cadre = englobant(rects);
      dict.set(PDFName.of('Rect'), contexte.obj(cadre));
      dict.set(PDFName.of('AP'), contexte.obj({ N: creerApparence(contexte, sousType, rects, couleur, cadre) }));
    }
  }
  dict.set(PDFName.of('M'), PDFString.fromDate(new Date()));
}

// ---------- Lecture (PDF.js) ----------

/** Rectangles [x1, y1, x2, y2] à partir des quadPoints de PDF.js (déjà normalisés). */
function rectsDepuisQuadPoints(quadPoints, rect) {
  if (!quadPoints?.length) return rect ? [[...rect]] : [];
  const rects = [];
  for (let i = 0; i + 7 < quadPoints.length; i += 8) {
    const xs = [quadPoints[i], quadPoints[i + 2], quadPoints[i + 4], quadPoints[i + 6]];
    const ys = [quadPoints[i + 1], quadPoints[i + 3], quadPoints[i + 5], quadPoints[i + 7]];
    rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return rects;
}

/**
 * Lit les annotations de texte d'une page PDF.js.
 * @returns {Promise<Array<object>>} { ref, page, sousType, zone, libelle, rects, cadre, couleur, commentaire, auteur, date }
 */
export async function lireAnnotationsPage(pagePdfjs, n, outils) {
  let brutes = [];
  try {
    brutes = await pagePdfjs.getAnnotations({ intent: 'display' });
  } catch (erreur) {
    console.warn(`Annotations de la page ${n}`, erreur);
    return [];
  }
  const resultat = [];
  for (const a of brutes) {
    if (!SOUS_TYPES_LUS[a.subtype] || !a.id) continue;
    const rects = rectsDepuisQuadPoints(a.quadPoints, a.rect);
    if (!rects.length) continue;
    const couleur = a.color ? Array.from(a.color, (c) => c / 255) : [1, 0.85, 0.1];
    let date = null;
    try {
      date = outils.dateDepuisPdf(a.modificationDate || a.creationDate);
    } catch {
      date = null;
    }
    const zone = a.it === INTENTION_ZONE;
    resultat.push({
      ref: a.id,
      page: n,
      sousType: a.subtype,
      zone,
      libelle: zone ? 'Zone surlignée' : SOUS_TYPES_LUS[a.subtype],
      rects,
      cadre: englobant(rects, 0),
      couleur,
      commentaire: (a.contentsObj?.str ?? '').trim(),
      auteur: a.titleObj?.str ?? '',
      date,
    });
  }
  return resultat;
}

/**
 * Retrouve le texte couvert par des rectangles, à partir du texte de la page (PDF.js).
 * Pour un texte horizontal, la découpe se fait au caractère près (approximation : largeur moyenne).
 */
export function texteSousRects(contenuTexte, rects) {
  const morceaux = [];
  for (const [rx1, ry1, rx2, ry2] of rects) {
    const ligne = [];
    for (const item of contenuTexte.items) {
      if (!('str' in item) || !item.str) continue;
      const [a, b, c, d, e, fy] = item.transform;
      const taille = Math.hypot(c, d) || item.height || 10;
      const horizontal = Math.abs(b) < 1e-3 && a > 0;
      if (horizontal) {
        const yc = fy + taille * 0.3;
        if (yc < ry1 || yc > ry2) continue;
        const pas = item.width / item.str.length;
        let texte = '';
        for (let i = 0; i < item.str.length; i++) {
          const xc = e + pas * (i + 0.5);
          if (xc >= rx1 && xc <= rx2) texte += item.str[i];
        }
        if (texte) ligne.push({ x: e, texte });
      } else {
        // Texte tourné : on garde le morceau entier si son centre est dans le rectangle
        const angle = Math.atan2(b, a);
        const xc = e + Math.cos(angle) * item.width / 2;
        const yc = fy + Math.sin(angle) * item.width / 2;
        if (xc >= rx1 && xc <= rx2 && yc >= ry1 && yc <= ry2) ligne.push({ x: e, texte: item.str });
      }
    }
    ligne.sort((m1, m2) => m1.x - m2.x);
    const texte = ligne.map((m) => m.texte).join('').replace(/\s+/g, ' ').trim();
    if (texte) morceaux.push(texte);
  }
  return morceaux.join(' ');
}
