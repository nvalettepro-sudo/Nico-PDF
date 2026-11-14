// Barre de recherche : Ctrl+F, surlignage, suivant / précédent, nombre de résultats.
import { etat, on } from '../state.js';
import { rechercher, viderCacheRecherche } from '../pdf/search.js';
import { definirSurlignages, montrerZone } from '../pdf/render.js';

let barre;
let champ;
let compte;
let resultats = [];
let actuel = -1;
let derniereRequete = '';
let signal = { annule: false };
let attente = null;

export function initRecherche() {
  barre = document.getElementById('barre-recherche');
  champ = document.getElementById('champ-recherche');
  compte = document.getElementById('compte-recherche');

  champ.addEventListener('input', () => {
    clearTimeout(attente);
    attente = setTimeout(() => lancer(champ.value), 250);
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Si la saisie n'a pas encore été cherchée, on la cherche d'abord
      if (champ.value !== derniereRequete) {
        clearTimeout(attente);
        lancer(champ.value);
      } else {
        deplacer(e.shiftKey ? -1 : 1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fermerRecherche();
    }
  });
  document.getElementById('btn-resultat-suiv').addEventListener('click', () => deplacer(1));
  document.getElementById('btn-resultat-prec').addEventListener('click', () => deplacer(-1));
  document.getElementById('btn-fermer-recherche').addEventListener('click', fermerRecherche);
  document.getElementById('btn-rechercher').addEventListener('click', () => {
    if (barre.hidden) ouvrirRecherche();
    else fermerRecherche();
  });

  // Le document a changé (modification, annulation…) : on relance la recherche en cours
  on('document', ({ nouveau }) => {
    viderCacheRecherche();
    if (nouveau) {
      champ.value = '';
      derniereRequete = '';
      effacer();
    } else if (derniereRequete) {
      lancer(derniereRequete, { garderPosition: true });
    }
  });
}

export function ouvrirRecherche() {
  if (!etat.pdf) return;
  barre.hidden = false;
  document.getElementById('btn-rechercher').classList.add('actif');
  // Préremplit avec le texte sélectionné, comme dans Acrobat
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length < 100 && !selection.includes('\n')) champ.value = selection;
  champ.focus();
  champ.select();
  if (champ.value && champ.value !== derniereRequete) lancer(champ.value);
}

export function fermerRecherche() {
  barre.hidden = true;
  document.getElementById('btn-rechercher').classList.remove('actif');
  signal.annule = true;
  effacer();
  derniereRequete = '';
}

function effacer() {
  resultats = [];
  actuel = -1;
  compte.textContent = '';
  compte.classList.remove('aucun');
  definirSurlignages(new Map());
}

async function lancer(requete, { garderPosition = false } = {}) {
  signal.annule = true;
  signal = { annule: false };
  const monSignal = signal;
  const ancienActuel = actuel;
  derniereRequete = requete;
  if (!requete.trim() || !etat.pdf) {
    effacer();
    return;
  }
  compte.textContent = 'Recherche…';
  compte.classList.remove('aucun');
  const trouves = await rechercher(etat.pdf, requete, {
    signal: monSignal,
    progression: (n) => {
      if (etat.nbPages > 20 && !monSignal.annule) compte.textContent = `Recherche… ${Math.round((n / etat.nbPages) * 100)} %`;
    },
  });
  if (monSignal.annule) return;
  resultats = trouves;
  if (!resultats.length) {
    actuel = -1;
    compte.textContent = 'Aucun résultat';
    compte.classList.add('aucun');
    definirSurlignages(new Map());
    return;
  }
  if (garderPosition && ancienActuel >= 0) {
    actuel = Math.min(ancienActuel, resultats.length - 1);
  } else {
    // Premier résultat à partir de la page courante
    actuel = resultats.findIndex((r) => r.page >= etat.pageCourante);
    if (actuel < 0) actuel = 0;
  }
  afficher(!garderPosition);
}

function deplacer(sens) {
  if (!resultats.length) return;
  actuel = (actuel + sens + resultats.length) % resultats.length;
  afficher(true);
}

function afficher(defiler) {
  compte.textContent = `${actuel + 1} sur ${resultats.length}`;
  const zones = new Map();
  resultats.forEach((r, i) => {
    if (!zones.has(r.page)) zones.set(r.page, []);
    for (const rect of r.rects) zones.get(r.page).push({ rect, actuel: i === actuel });
  });
  definirSurlignages(zones);
  const r = resultats[actuel];
  if (defiler && r?.rects.length) montrerZone(r.page, r.rects[0]);
}
