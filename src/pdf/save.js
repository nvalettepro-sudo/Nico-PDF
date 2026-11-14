// Ouverture et enregistrement des fichiers.
// Dans Chrome et Edge, l'API « File System Access » permet d'enregistrer directement
// sur le fichier d'origine. Ailleurs, on propose un téléchargement.

export const accesFichiersDisponible = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

const TYPES_PDF = [{ description: 'Documents PDF', accept: { 'application/pdf': ['.pdf'] } }];

/** L'utilisateur a fermé la fenêtre de choix de fichier : ce n'est pas une erreur. */
export function estAnnulation(erreur) {
  return erreur?.name === 'AbortError';
}

/**
 * Demande un fichier PDF à l'utilisateur.
 * @returns {Promise<{octets: Uint8Array, nom: string, poignee: object|null}|null>}
 */
export async function choisirPdf() {
  if (accesFichiersDisponible) {
    try {
      const [poignee] = await window.showOpenFilePicker({ types: TYPES_PDF, multiple: false });
      const fichier = await poignee.getFile();
      return { octets: new Uint8Array(await fichier.arrayBuffer()), nom: fichier.name, poignee };
    } catch (erreur) {
      if (estAnnulation(erreur)) return null;
      throw erreur;
    }
  }
  const fichier = await choisirFichierClassique('application/pdf,.pdf');
  if (!fichier) return null;
  return { octets: new Uint8Array(await fichier.arrayBuffer()), nom: fichier.name, poignee: null };
}

/** Sélecteur de fichier classique (sans accès en écriture). */
export function choisirFichierClassique(accept) {
  return new Promise((resolve) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = accept;
    champ.addEventListener('change', () => resolve(champ.files[0] ?? null));
    champ.addEventListener('cancel', () => resolve(null));
    champ.click();
  });
}

/** Lit un fichier déposé par glisser-déposer, avec son accès en écriture si possible. */
export async function lireDepot(transfert) {
  const element = [...transfert.items].find((i) => i.kind === 'file');
  if (!element) return null;
  let poignee = null;
  if (element.getAsFileSystemHandle) {
    try {
      const h = await element.getAsFileSystemHandle();
      if (h?.kind === 'file') poignee = h;
    } catch {
      poignee = null;
    }
  }
  const fichier = poignee ? await poignee.getFile() : element.getAsFile();
  if (!fichier) return null;
  return { octets: new Uint8Array(await fichier.arrayBuffer()), nom: fichier.name, poignee };
}

/** Écrit sur le fichier d'origine. Renvoie false si ce n'est pas possible. */
export async function ecrireSurFichier(poignee, octets) {
  if (!poignee?.createWritable) return false;
  if (poignee.queryPermission) {
    let permission = await poignee.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') permission = await poignee.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return false;
  }
  const flux = await poignee.createWritable();
  await flux.write(octets);
  await flux.close();
  return true;
}

/**
 * « Enregistrer sous » : demande un emplacement, ou télécharge le fichier.
 * @returns {Promise<{poignee: object|null, nom: string}|null>} null si l'utilisateur annule
 */
export async function enregistrerSous(octets, nomSuggere) {
  if (accesFichiersDisponible) {
    try {
      const poignee = await window.showSaveFilePicker({ suggestedName: nomSuggere, types: TYPES_PDF });
      await ecrireSurFichier(poignee, octets);
      return { poignee, nom: poignee.name };
    } catch (erreur) {
      if (estAnnulation(erreur)) return null;
      throw erreur;
    }
  }
  telecharger(octets, nomSuggere);
  return { poignee: null, nom: nomSuggere };
}

/** Télécharge un fichier (repli universel). */
export function telecharger(octets, nom, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([octets], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ajoute un suffixe avant l'extension : « plan.pdf » -> « plan (extrait).pdf ». */
export function nomAvecSuffixe(nom, suffixe) {
  const base = (nom || 'document.pdf').replace(/\.pdf$/i, '');
  return `${base} (${suffixe}).pdf`;
}
