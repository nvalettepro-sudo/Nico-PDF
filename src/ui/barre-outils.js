// Barre d'outils du haut et raccourcis clavier.
import {
  etat, on, emit, peutAnnuler, peutRetablir,
} from '../state.js';
import {
  ouvrir, enregistrer, enregistrerSous, annuler, retablir,
} from '../document.js';
import {
  allerPage, zoomer, definirZoom, definirModeZoom, tournerVue, definirModeAffichage,
} from '../pdf/render.js';
import { ouvrirRecherche } from './recherche.js';
import { ouvrirOrganiser, organiserOuvert } from './organiser.js';
import { afficherAPropos } from './a-propos.js';

const $ = (id) => document.getElementById(id);

export function initBarreOutils() {
  $('btn-ouvrir').addEventListener('click', () => ouvrir());
  $('btn-ouvrir-accueil').addEventListener('click', () => ouvrir());
  $('btn-enregistrer').addEventListener('click', enregistrer);
  $('btn-enregistrer-sous').addEventListener('click', enregistrerSous);
  $('btn-annuler').addEventListener('click', annuler);
  $('btn-retablir').addEventListener('click', retablir);

  // Navigation
  $('btn-page-prec').addEventListener('click', () => pagePrecedente());
  $('btn-page-suiv').addEventListener('click', () => pageSuivante());
  const champPage = $('champ-page');
  champPage.addEventListener('focus', () => champPage.select());
  champPage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(champPage.value, 10);
      if (Number.isFinite(n)) allerPage(n);
      else champPage.value = String(etat.pageCourante);
      champPage.blur();
    } else if (e.key === 'Escape') {
      champPage.value = String(etat.pageCourante);
      champPage.blur();
    }
  });
  champPage.addEventListener('blur', () => {
    champPage.value = etat.pdf ? String(etat.pageCourante) : '–';
  });

  // Zoom et affichage
  $('btn-zoom-plus').addEventListener('click', () => zoomer(1.2));
  $('btn-zoom-moins').addEventListener('click', () => zoomer(1 / 1.2));
  $('choix-zoom').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'largeur' || v === 'page') definirModeZoom(v);
    else if (v !== 'libre') definirZoom(Number(v));
    e.target.blur();
  });
  $('btn-rotation-vue').addEventListener('click', () => tournerVue(90));
  $('choix-mode').addEventListener('change', (e) => {
    definirModeAffichage(e.target.value);
    e.target.blur();
  });

  // Outils
  document.querySelectorAll('[data-outil]').forEach((bouton) => {
    bouton.addEventListener('click', () => choisirOutil(etat.outil === bouton.dataset.outil ? 'selection' : bouton.dataset.outil));
  });
  $('btn-organiser').addEventListener('click', ouvrirOrganiser);
  $('btn-a-propos').addEventListener('click', afficherAPropos);

  // Mises à jour de l'affichage
  on('page', (n) => {
    if (document.activeElement !== champPage) champPage.value = String(n);
  });
  on('zoom', majZoom);
  on('document', majEtatBoutons);
  on('modifie', majEtatBoutons);
  on('historique', majEtatBoutons);

  document.addEventListener('keydown', raccourcis);
  majEtatBoutons();
}

/** Change d'outil : sélection de texte, capture de zone ou retouche. */
export function choisirOutil(outil) {
  if (outil === 'retouche' && etat.lectureSeule) return;
  etat.outil = outil;
  document.querySelectorAll('[data-outil]').forEach((b) => {
    const actif = b.dataset.outil === outil;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-pressed', String(actif));
  });
  const visionneuse = $('visionneuse');
  visionneuse.classList.toggle('outil-capture', outil === 'capture');
  visionneuse.classList.toggle('outil-retouche', outil === 'retouche');
  emit('outil', outil);
}

function majZoom() {
  const choix = $('choix-zoom');
  const libre = choix.querySelector('option[value="libre"]');
  if (etat.modeZoom === 'largeur' || etat.modeZoom === 'page') {
    choix.value = etat.modeZoom;
    // Affiche le pourcentage réel à côté du mode
    choix.querySelector(`option[value="${etat.modeZoom}"]`).textContent = `${etat.modeZoom === 'largeur' ? 'Largeur' : 'Page entière'} (${Math.round(etat.zoom * 100)} %)`;
  } else {
    const preset = [...choix.options].find((o) => Number(o.value) === Math.round(etat.zoom * 100) / 100);
    if (preset) {
      choix.value = preset.value;
    } else {
      libre.textContent = `${Math.round(etat.zoom * 100)} %`;
      choix.value = 'libre';
    }
    choix.querySelector('option[value="largeur"]').textContent = 'Largeur';
    choix.querySelector('option[value="page"]').textContent = 'Page entière';
  }
}

function majEtatBoutons() {
  const ouvert = Boolean(etat.pdf);
  document.querySelectorAll('[data-doc]').forEach((el) => {
    el.disabled = !ouvert || (el.hasAttribute('data-modif') && etat.lectureSeule && el.id !== 'btn-enregistrer');
  });
  $('btn-enregistrer').disabled = !ouvert || etat.lectureSeule;
  $('btn-enregistrer').classList.toggle('a-enregistrer', etat.modifie);
  $('btn-annuler').disabled = !ouvert || !peutAnnuler();
  $('btn-retablir').disabled = !ouvert || !peutRetablir();
  $('total-pages').textContent = ouvert ? `/ ${etat.nbPages}` : '/ –';
  $('champ-page').value = ouvert ? String(etat.pageCourante) : '–';
  $('accueil').hidden = ouvert;
  $('choix-mode').value = etat.modeAffichage;
  document.body.classList.toggle('lecture-seule', etat.lectureSeule);
  if (etat.lectureSeule && etat.outil === 'retouche') choisirOutil('selection');
}

function pagePrecedente() {
  const pas = etat.modeAffichage === 'double' ? 2 : 1;
  allerPage(etat.pageCourante - pas, { versLeBas: false });
}

function pageSuivante() {
  const pas = etat.modeAffichage === 'double' ? 2 : 1;
  allerPage(etat.pageCourante + pas);
}

/** Raccourcis clavier globaux. */
function raccourcis(e) {
  if (document.querySelector('dialog[open]')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const cle = e.key.toLowerCase();
  const dansChamp = e.target.closest?.('input, textarea, select, [contenteditable="true"]');

  if (ctrl && cle === 'o') {
    e.preventDefault();
    ouvrir();
  } else if (ctrl && cle === 's') {
    e.preventDefault();
    if (e.shiftKey) enregistrerSous();
    else enregistrer();
  } else if (ctrl && cle === 'f') {
    if (!etat.pdf) return;
    e.preventDefault();
    ouvrirRecherche();
  } else if (ctrl && !dansChamp && ((cle === 'z' && !e.shiftKey))) {
    e.preventDefault();
    annuler();
  } else if (ctrl && !dansChamp && (cle === 'y' || (cle === 'z' && e.shiftKey))) {
    e.preventDefault();
    retablir();
  } else if (ctrl && (e.key === '+' || e.key === '=' || e.key === '-')) {
    // Remplace le zoom du navigateur par celui du document
    if (!etat.pdf) return;
    e.preventDefault();
    zoomer(e.key === '-' ? 1 / 1.2 : 1.2);
  } else if (!ctrl && !dansChamp && etat.pdf && !organiserOuvert()) {
    if (e.key === '+' || e.key === '=') zoomer(1.2);
    else if (e.key === '-') zoomer(1 / 1.2);
    else if (e.key === 'PageDown' && etat.modeAffichage === 'simple') {
      e.preventDefault();
      pageSuivante();
    } else if (e.key === 'PageUp' && etat.modeAffichage === 'simple') {
      e.preventDefault();
      pagePrecedente();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && etat.modeAffichage !== 'continu') {
      e.preventDefault();
      if (e.key === 'ArrowRight') pageSuivante();
      else pagePrecedente();
    } else if (e.key === 'Home' && !e.shiftKey) {
      e.preventDefault();
      allerPage(1);
    } else if (e.key === 'End' && !e.shiftKey) {
      e.preventDefault();
      allerPage(etat.nbPages);
    } else if (e.key === 'Escape' && etat.outil !== 'selection') {
      choisirOutil('selection');
    }
  }
}
