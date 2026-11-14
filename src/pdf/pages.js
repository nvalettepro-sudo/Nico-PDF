// Organisation des pages avec pdf-lib : pivoter, supprimer, réordonner, insérer, extraire, remplacer.
// Les fonctions qui reçoivent `doc` modifient un document pdf-lib déjà ouvert
// (voir appliquerModification dans main.js, qui gère l'historique et le rechargement).
// Les numéros de pages sont des index qui commencent à 0.
import { PDFDocument, degrees } from 'pdf-lib';

/** Ouvre un PDF avec pdf-lib, avec un message clair si le fichier est chiffré. */
export async function ouvrirAvecPdfLib(octets) {
  try {
    return await PDFDocument.load(octets, { updateMetadata: false });
  } catch (erreur) {
    if (erreur?.constructor?.name === 'EncryptedPDFError' || /encrypted/i.test(erreur?.message)) {
      const e = new Error('Ce PDF est protégé (chiffré) : il ne peut pas être modifié.');
      e.chiffre = true;
      throw e;
    }
    throw erreur;
  }
}

/** Pivote des pages de +90 ou -90 degrés (modifie le fichier). */
export function pivoter(doc, indices, delta) {
  for (const i of indices) {
    const page = doc.getPage(i);
    const angle = (((page.getRotation().angle + delta) % 360) + 360) % 360;
    page.setRotation(degrees(angle));
  }
}

/** Supprime des pages. Il doit rester au moins une page. */
export function supprimer(doc, indices) {
  const uniques = [...new Set(indices)].sort((a, b) => b - a);
  if (uniques.length >= doc.getPageCount()) {
    throw new Error('Impossible de supprimer toutes les pages : il doit en rester au moins une.');
  }
  for (const i of uniques) doc.removePage(i);
}

/**
 * Réordonne les pages.
 * @param {number[]} ordre nouvel ordre, exprimé avec les anciens index (ex. [2, 0, 1])
 */
export function reordonner(doc, ordre) {
  const pages = doc.getPages();
  if (ordre.length !== pages.length || new Set(ordre).size !== pages.length) {
    throw new Error('Ordre de pages invalide.');
  }
  // On déplace les pages une à une, sans jamais vider le document.
  const actuel = [...pages];
  ordre.forEach((ancienIndex, cible) => {
    const page = pages[ancienIndex];
    const position = actuel.indexOf(page);
    if (position === cible) return;
    doc.removePage(position);
    actuel.splice(position, 1);
    doc.insertPage(cible, page);
    actuel.splice(cible, 0, page);
  });
}

/**
 * Insère les pages d'un autre PDF.
 * @param {number} position index où insérer (0 = au début, nbPages = à la fin)
 * @param {number[]|null} indicesSource pages du PDF source (null = toutes)
 */
export async function inserer(doc, octetsSource, position, indicesSource = null) {
  const source = await ouvrirAvecPdfLib(octetsSource);
  const indices = indicesSource ?? source.getPageIndices();
  const copies = await doc.copyPages(source, indices);
  copies.forEach((page, k) => doc.insertPage(position + k, page));
  return copies.length;
}

/** Crée un nouveau PDF contenant seulement certaines pages. */
export async function extraire(octets, indices) {
  const source = await ouvrirAvecPdfLib(octets);
  const nouveau = await PDFDocument.create();
  const copies = await nouveau.copyPages(source, indices);
  copies.forEach((page) => nouveau.addPage(page));
  return nouveau.save();
}

/**
 * Remplace des pages par celles d'un autre PDF (même nombre de pages des deux côtés).
 * @param {number[]} cibles pages à remplacer dans le document
 * @param {number[]} indicesSource pages du PDF source
 */
export async function remplacer(doc, cibles, octetsSource, indicesSource) {
  if (cibles.length !== indicesSource.length) {
    throw new Error(`Il faut autant de pages des deux côtés : ${cibles.length} à remplacer, ${indicesSource.length} fournie(s).`);
  }
  const source = await ouvrirAvecPdfLib(octetsSource);
  const copies = await doc.copyPages(source, indicesSource);
  const triees = cibles.map((c, k) => [c, copies[k]]).sort((a, b) => a[0] - b[0]);
  for (const [cible, copie] of triees) {
    // On insère d'abord, puis on retire l'ancienne page : le document n'est jamais vide.
    doc.insertPage(cible, copie);
    doc.removePage(cible + 1);
  }
}

/**
 * Lit une liste de pages saisie par l'utilisateur (« 1-3, 5, 8- »).
 * @returns {number[]} index (à partir de 0), dans l'ordre saisi, sans doublon
 */
export function lirePlages(texte, nbPages) {
  const resultat = [];
  const morceaux = texte.split(/[,;]/).map((m) => m.trim()).filter(Boolean);
  if (!morceaux.length) throw new Error('Indiquez au moins une page (exemple : 1-3, 5).');
  for (const morceau of morceaux) {
    const plage = morceau.match(/^(\d*)\s*-\s*(\d*)$/);
    let debut;
    let fin;
    if (plage) {
      debut = plage[1] ? Number(plage[1]) : 1;
      fin = plage[2] ? Number(plage[2]) : nbPages;
    } else if (/^\d+$/.test(morceau)) {
      debut = fin = Number(morceau);
    } else {
      throw new Error(`« ${morceau} » n'est pas compris (exemple attendu : 1-3, 5).`);
    }
    if (debut < 1 || fin > nbPages || debut > fin) {
      throw new Error(`La plage « ${morceau} » sort du document (pages 1 à ${nbPages}).`);
    }
    for (let p = debut; p <= fin; p++) if (!resultat.includes(p - 1)) resultat.push(p - 1);
  }
  return resultat;
}

/** Écrit une liste d'index sous forme lisible (« 1-3, 5 »). */
export function ecrirePlages(indices) {
  const tries = [...new Set(indices)].sort((a, b) => a - b).map((i) => i + 1);
  const morceaux = [];
  for (let k = 0; k < tries.length; k++) {
    const debut = tries[k];
    while (tries[k + 1] === tries[k] + 1) k++;
    morceaux.push(debut === tries[k] ? `${debut}` : `${debut}-${tries[k]}`);
  }
  return morceaux.join(', ');
}
