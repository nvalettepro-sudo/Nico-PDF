// Mémoire des retouches, enregistrée DANS le PDF (enregistrement « modifiable »).
// Chaque retouche est dessinée dans son propre flux de contenu ; la liste ci-dessous
// (au format JSON, dans un objet du fichier) permet de la retrouver plus tard pour la
// corriger, la déplacer ou la supprimer sans empiler les recouvrements.
// Les autres lecteurs PDF ignorent simplement cette information.
import { PDFName, PDFRef, PDFArray } from 'pdf-lib';
import { decoderFlux } from './effacer-texte.js';

const CLE = PDFName.of('NicoPDFRetouches');

const versRef = ([numero, generation]) => PDFRef.of(numero, generation);
const depuisRef = (ref) => [ref.objectNumber, ref.generationNumber];

/**
 * Lit les retouches mémorisées dans le document.
 * Les retouches dont la page ou le flux a disparu (page supprimée…) sont ignorées.
 * @returns {Array<object>} retouches, avec `page` (numéro à partir de 1)
 */
export function lireRetouches(doc) {
  const flux = doc.catalog.lookup(CLE);
  if (!flux) return [];
  let liste;
  try {
    liste = JSON.parse(new TextDecoder().decode(decoderFlux(flux)));
  } catch {
    return [];
  }
  if (!Array.isArray(liste)) return [];
  const pages = doc.getPages();
  return liste.map((r) => {
    const index = pages.findIndex((p) => p.ref === versRef(r.pageRef));
    if (index < 0) return null;
    const contenus = pages[index].node.Contents();
    const present = contenus instanceof PDFArray && contenus.indexOf(versRef(r.fluxRef)) !== undefined;
    return present ? { ...r, page: index + 1 } : null;
  }).filter(Boolean);
}

/** Enregistre la liste des retouches dans le document (ou la retire si elle est vide). */
export function ecrireRetouches(doc, liste) {
  if (!liste.length) {
    doc.catalog.delete(CLE);
    return;
  }
  const propre = liste.map(({ page, ...reste }) => reste);
  const octets = new TextEncoder().encode(JSON.stringify(propre));
  doc.catalog.set(CLE, doc.context.register(doc.context.flateStream(octets)));
}

/** Retire de sa page le dessin d'une retouche. */
export function effacerDessinRetouche(doc, retouche) {
  const contenus = doc.getPage(retouche.page - 1).node.Contents();
  if (!(contenus instanceof PDFArray)) return;
  const index = contenus.indexOf(versRef(retouche.fluxRef));
  if (index !== undefined) contenus.remove(index);
}

/** Références (flux de dessin) de toutes les retouches : à protéger lors de l'effacement. */
export function fluxDesRetouches(liste) {
  return new Set(liste.map((r) => versRef(r.fluxRef)));
}

/** Crée l'entrée mémorisée d'une retouche. */
export function entreeRetouche({ id, page, fluxRef, parametres, zoneTexte }) {
  return {
    id: id ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    pageRef: depuisRef(page.ref),
    fluxRef: depuisRef(fluxRef),
    zoneTexte,
    ...parametres,
  };
}

/** Zones occupées par une retouche (recouvrement et texte), pour la retrouver au clic. */
export function zonesRetouche(r) {
  return [r.recouvrement, r.zoneTexte].filter(Boolean);
}
