// Cycle de vie du document : ouverture, modifications (avec historique), enregistrement.
// Principe : PDF.js affiche ; chaque modification est faite par pdf-lib sur une copie
// en mémoire, puis le résultat est rechargé dans PDF.js.
import {
  etat, emit, memoriserAvantModification, reculer, avancer, viderHistorique,
} from './state.js';
import { chargerPdf } from './pdf/loader.js';
import { afficherDocument, viderVisionneuse } from './pdf/render.js';
import { ouvrirAvecPdfLib } from './pdf/pages.js';
import { lireRetouches } from './pdf/retouches.js';
import { creerVersionDefinitive } from './pdf/definitif.js';
import {
  choisirPdf, ecrireSurFichier, enregistrerSous as demanderEmplacement, telecharger, estAnnulation, nomAvecSuffixe,
} from './pdf/save.js';
import {
  demanderMotDePasse, notifier, signalerErreur, confirmer, informer, ouvrirDialogue, echapper,
} from './ui/dialogues.js';

let operationEnCours = false;

/** Ouvre un PDF : depuis le sélecteur de fichier, ou à partir d'un fichier déjà lu. */
export async function ouvrir(fichier = null) {
  if (etat.modifie && !(await confirmer('Modifications non enregistrées',
    'Le document actuel contient des modifications non enregistrées. Ouvrir un autre fichier les fera perdre.',
    { libelle: 'Ouvrir quand même', danger: true }))) return;
  try {
    fichier ??= await choisirPdf();
    if (!fichier) return;
    document.body.classList.add('chargement');
    const { pdf, chiffre } = await chargerPdf(fichier.octets, demanderMotDePasse);
    etat.pdf?.loadingTask.destroy();
    etat.pdf = pdf;
    etat.octets = fichier.octets;
    etat.nomFichier = fichier.nom;
    etat.poignee = fichier.poignee;
    etat.nbPages = pdf.numPages;
    etat.modifie = false;
    etat.lectureSeule = chiffre;
    etat.rotationVue = 0;
    viderHistorique();
    document.title = `${fichier.nom} — Nico PDF`;
    await afficherDocument(pdf, { page: 1 });
    emit('document', { nouveau: true });
    if (chiffre) {
      notifier('PDF protégé : ouvert en lecture seule, les outils de modification sont désactivés.', 'attention', 6000);
    }
  } catch (erreur) {
    if (!estAnnulation(erreur) && erreur?.message !== 'Ouverture annulée.') signalerErreur(erreur, 'Impossible d\'ouvrir le fichier');
  } finally {
    document.body.classList.remove('chargement');
  }
}

/** Recharge les octets donnés dans PDF.js, en gardant la page et le zoom. */
async function recharger(octets, { page } = {}) {
  const { pdf } = await chargerPdf(octets, demanderMotDePasse);
  const ancien = etat.pdf;
  etat.pdf = pdf;
  etat.octets = octets;
  etat.nbPages = pdf.numPages;
  await afficherDocument(pdf, { page: page ?? etat.pageCourante, conserverPosition: page === undefined });
  ancien?.loadingTask.destroy();
  emit('document', { nouveau: false });
}

/**
 * Applique une modification avec pdf-lib, l'ajoute à l'historique et recharge l'affichage.
 * @param {(doc: import('pdf-lib').PDFDocument) => Promise<any>|any} modification
 * @param {{ message?: string, page?: number }} options page : page à afficher après
 * @returns {Promise<boolean>} true si la modification a réussi
 */
export async function appliquerModification(modification, { message, page } = {}) {
  if (!etat.pdf) return false;
  if (etat.lectureSeule) {
    await informer('Lecture seule', 'Ce PDF est protégé : il ne peut pas être modifié.');
    return false;
  }
  if (operationEnCours) return false;
  operationEnCours = true;
  document.body.classList.add('chargement');
  try {
    const doc = await ouvrirAvecPdfLib(etat.octets);
    const resultat = await modification(doc);
    if (resultat === false) return false; // la modification a été abandonnée
    const nouveaux = await doc.save();
    memoriserAvantModification(etat.octets);
    etat.modifie = true;
    await recharger(nouveaux, { page });
    emit('modifie');
    if (message) notifier(message, 'succes');
    return true;
  } catch (erreur) {
    if (erreur?.chiffre) {
      etat.lectureSeule = true;
      emit('modifie');
    }
    signalerErreur(erreur, 'Modification impossible');
    return false;
  } finally {
    operationEnCours = false;
    document.body.classList.remove('chargement');
  }
}

export async function annuler() {
  if (operationEnCours || !etat.pdf) return;
  const precedent = reculer(etat.octets);
  if (!precedent) return;
  operationEnCours = true;
  try {
    etat.modifie = true;
    await recharger(precedent);
    emit('modifie');
    notifier('Modification annulée.');
  } catch (erreur) {
    signalerErreur(erreur, 'Annulation impossible');
  } finally {
    operationEnCours = false;
  }
}

export async function retablir() {
  if (operationEnCours || !etat.pdf) return;
  const suivant = avancer(etat.octets);
  if (!suivant) return;
  operationEnCours = true;
  try {
    etat.modifie = true;
    await recharger(suivant);
    emit('modifie');
    notifier('Modification rétablie.');
  } catch (erreur) {
    signalerErreur(erreur, 'Rétablissement impossible');
  } finally {
    operationEnCours = false;
  }
}

/** Enregistrer : sur le fichier d'origine si possible, sinon « Enregistrer sous ». */
export async function enregistrer() {
  if (!etat.pdf) return;
  if (etat.lectureSeule) {
    await informer('Lecture seule', 'Ce PDF est protégé : utilisez plutôt « Enregistrer sous » pour en garder une copie identique.');
    return;
  }
  if (!etat.poignee) return enregistrerSous();
  try {
    const ok = await ecrireSurFichier(etat.poignee, etat.octets);
    if (!ok) return enregistrerSous();
    etat.modifie = false;
    emit('modifie');
    notifier(`Enregistré : ${etat.nomFichier}`, 'succes');
  } catch (erreur) {
    if (estAnnulation(erreur)) return;
    signalerErreur(erreur, 'Enregistrement impossible');
  }
}

/** Enregistrer sous : choix d'un emplacement (Chrome / Edge) ou téléchargement. */
export async function enregistrerSous() {
  if (!etat.pdf) return;
  try {
    const resultat = await demanderEmplacement(etat.octets, etat.nomFichier || 'document.pdf');
    if (!resultat) return;
    if (resultat.poignee) {
      etat.poignee = resultat.poignee;
      etat.nomFichier = resultat.nom;
      document.title = `${resultat.nom} — Nico PDF`;
      notifier(`Enregistré : ${resultat.nom}`, 'succes');
    } else {
      notifier(`Téléchargement de « ${resultat.nom} » lancé.`, 'succes');
    }
    etat.modifie = false;
    emit('modifie');
  } catch (erreur) {
    signalerErreur(erreur, 'Enregistrement impossible');
  }
}

/**
 * Enregistrer en version définitive : les retouches sont figées et l'ancien texte
 * caché sous les recouvrements est réellement retiré. Le document ouvert (modifiable) ne change pas.
 */
export async function enregistrerDefinitif() {
  if (!etat.pdf) return;
  if (etat.lectureSeule) {
    await informer('Lecture seule', 'Ce PDF est protégé : il ne peut pas être modifié.');
    return;
  }
  try {
    const nbRetouches = lireRetouches(await ouvrirAvecPdfLib(etat.octets)).length;
    if (!nbRetouches) {
      await informer('Aucune retouche à figer',
        'Ce document ne contient pas de retouche faite avec Nico PDF (version 1.2 ou plus récente). '
        + 'La version définitive sert à figer les retouches et à retirer l\'ancien texte. '
        + 'Pour une simple copie, utilisez « Enregistrer sous ».');
      return;
    }
    if (!(await confirmer('Enregistrer en version définitive',
      `Le fichier définitif ne contiendra plus l'ancien texte caché sous ${nbRetouches > 1 ? `les ${nbRetouches} retouches` : 'la retouche'}. `
      + 'Les retouches ne pourront plus être modifiées dans ce fichier.<br><br>'
      + 'Votre fichier modifiable actuel est conservé tel quel.',
      { libelle: 'Créer la version définitive' }))) return;

    document.body.classList.add('chargement');
    const resultat = await creerVersionDefinitive(etat.octets);
    document.body.classList.remove('chargement');

    if (resultat.restes.length) {
      const details = resultat.restes
        .map((r) => `<li>page ${r.page} : « ${echapper(r.texte.slice(0, 80))} »</li>`).join('');
      const raisons = resultat.explications.length
        ? `<p class="discret">Cause probable : ${echapper(resultat.explications.join(' ; '))}.</p>` : '';
      const { valeur } = await ouvrirDialogue({
        titre: 'Ancien texte encore présent',
        contenu: `<p class="alerte">Une partie du texte d'origine n'a pas pu être retirée :</p><ul>${details}</ul>${raisons}
          <p>Ce texte reste caché sous le recouvrement, mais il peut encore être copié ou trouvé par une recherche.</p>`,
        boutons: [
          { libelle: 'Annuler', valeur: false },
          { libelle: 'Enregistrer quand même', valeur: true, principal: true, danger: true },
        ],
      });
      if (!valeur) return;
    }
    await enregistrerCopie(resultat.octets, nomAvecSuffixe(etat.nomFichier, 'définitif'));
    if (!resultat.restes.length) {
      notifier(`Version définitive : ${resultat.nbRetouches} retouche${resultat.nbRetouches > 1 ? 's figées' : ' figée'}, ancien texte retiré et vérifié.`, 'succes', 6000);
    }
  } catch (erreur) {
    signalerErreur(erreur, 'Version définitive impossible');
  } finally {
    document.body.classList.remove('chargement');
  }
}

/** Enregistre un autre fichier (extrait, export…) sans changer le document ouvert. */
export async function enregistrerCopie(octets, nom) {
  try {
    const resultat = await demanderEmplacement(octets, nom);
    if (resultat) notifier(`Fichier créé : ${resultat.nom}`, 'succes');
  } catch (erreur) {
    signalerErreur(erreur, 'Enregistrement impossible');
    telecharger(octets, nom);
  }
}

export function fermerDocument() {
  etat.pdf?.loadingTask.destroy();
  Object.assign(etat, { pdf: null, octets: null, nomFichier: '', poignee: null, nbPages: 0, modifie: false });
  viderVisionneuse();
  viderHistorique();
}
