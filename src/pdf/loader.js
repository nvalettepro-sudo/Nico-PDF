// Ouverture des PDF avec PDF.js (gestion du mot de passe comprise).
import * as pdfjsLib from 'pdfjs-dist';
// Le « worker » de PDF.js (programme qui décode le PDF en arrière-plan) est embarqué dans le build.
import urlWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = urlWorker;

/** Adresse absolue d'une ressource copiée dans public/pdfjs/ (polices, CMaps…). */
function ressource(chemin) {
  return new URL(`pdfjs/${chemin}`, document.baseURI).href;
}

/**
 * Charge un PDF dans PDF.js.
 * @param {Uint8Array} octets contenu du fichier
 * @param {(incorrect: boolean) => Promise<string|null>} demanderMotDePasse
 * @returns {Promise<{pdf: object, chiffre: boolean}>}
 */
export async function chargerPdf(octets, demanderMotDePasse) {
  const tache = pdfjsLib.getDocument({
    data: octets.slice(), // copie : PDF.js s'approprie le tableau qu'on lui donne
    cMapUrl: ressource('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: ressource('standard_fonts/'),
    wasmUrl: ressource('wasm/'),
    iccUrl: ressource('iccs/'),
    isEvalSupported: false,
  });
  let chiffre = false;
  tache.onPassword = async (repondre, raison) => {
    chiffre = true;
    const incorrect = raison === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
    const motDePasse = await demanderMotDePasse(incorrect);
    if (motDePasse === null) {
      tache.destroy();
      return;
    }
    repondre(motDePasse);
  };
  try {
    const pdf = await tache.promise;
    return { pdf, chiffre };
  } catch (erreur) {
    if (tache.destroyed) throw new Error('Ouverture annulée.');
    if (erreur?.name === 'InvalidPDFException') {
      throw new Error('Ce fichier n\'est pas un PDF valide ou il est endommagé.');
    }
    throw erreur;
  }
}

export { pdfjsLib };
