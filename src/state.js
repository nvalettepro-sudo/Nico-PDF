// État global de l'application : document ouvert, page courante, zoom, historique.
// Les modules communiquent par de petits « événements » (on / emit) plutôt
// que de s'appeler directement, ce qui permet d'ajouter des outils sans refonte.

export const etat = {
  octets: null, // contenu du PDF courant (Uint8Array), modifications comprises
  pdf: null, // document PDF.js chargé
  nomFichier: '',
  poignee: null, // accès au fichier d'origine (Chrome / Edge), pour « Enregistrer »
  nbPages: 0,
  pageCourante: 1,
  zoom: 1,
  modeZoom: 'largeur', // 'libre' | 'largeur' | 'page'
  rotationVue: 0, // rotation de l'affichage seulement (0, 90, 180, 270)
  modeAffichage: 'continu', // 'continu' | 'simple' | 'double'
  outil: 'selection', // 'selection' | 'capture' | 'surlignage' | 'retouche'
  modifie: false, // modifications non enregistrées
  lectureSeule: false, // PDF chiffré : aucune modification possible
};

// ---------- Événements ----------
const ecouteurs = new Map();

/** Abonne une fonction à un événement. Renvoie une fonction de désabonnement. */
export function on(evenement, fonction) {
  if (!ecouteurs.has(evenement)) ecouteurs.set(evenement, new Set());
  ecouteurs.get(evenement).add(fonction);
  return () => ecouteurs.get(evenement).delete(fonction);
}

/** Prévient tous les abonnés d'un événement. */
export function emit(evenement, donnees) {
  for (const fonction of ecouteurs.get(evenement) ?? []) {
    try {
      fonction(donnees);
    } catch (erreur) {
      console.error(`Erreur dans l'écouteur « ${evenement} »`, erreur);
    }
  }
}

// ---------- Historique (annuler / rétablir) ----------
// On garde les 10 derniers états complets du fichier.
const MAX_HISTORIQUE = 10;
const pileAnnuler = [];
const pileRetablir = [];

/** Mémorise l'état du fichier avant une modification. */
export function memoriserAvantModification(octets) {
  pileAnnuler.push(octets);
  if (pileAnnuler.length > MAX_HISTORIQUE) pileAnnuler.shift();
  pileRetablir.length = 0;
  emit('historique');
}

/** Renvoie l'état précédent (ou null) et mémorise l'état actuel pour « Rétablir ». */
export function reculer(octetsActuels) {
  if (!pileAnnuler.length) return null;
  pileRetablir.push(octetsActuels);
  const precedent = pileAnnuler.pop();
  emit('historique');
  return precedent;
}

/** Renvoie l'état suivant (ou null) et mémorise l'état actuel pour « Annuler ». */
export function avancer(octetsActuels) {
  if (!pileRetablir.length) return null;
  pileAnnuler.push(octetsActuels);
  const suivant = pileRetablir.pop();
  emit('historique');
  return suivant;
}

export function peutAnnuler() {
  return pileAnnuler.length > 0;
}

export function peutRetablir() {
  return pileRetablir.length > 0;
}

export function viderHistorique() {
  pileAnnuler.length = 0;
  pileRetablir.length = 0;
  emit('historique');
}
