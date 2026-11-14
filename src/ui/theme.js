// Thème clair / sombre et inversion des couleurs des pages. Les choix sont mémorisés.
import { changerIcone } from './icones.js';

const CLE_THEME = 'nicopdf.theme';
const CLE_INVERSION = 'nicopdf.inverser';

function lire(cle) {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // stockage indisponible (navigation privée) : le choix ne sera pas mémorisé
  }
}

function themeActuel() {
  const choisi = document.documentElement.dataset.theme;
  if (choisi) return choisi;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair';
}

export function initTheme() {
  const boutonTheme = document.getElementById('btn-theme');
  const boutonInverser = document.getElementById('btn-inverser');

  const majBoutons = () => {
    const sombre = themeActuel() === 'sombre';
    changerIcone(boutonTheme, sombre ? 'soleil' : 'lune');
    boutonTheme.title = sombre ? 'Passer au thème clair' : 'Passer au thème sombre';
    const inverse = document.documentElement.classList.contains('pages-inversees');
    boutonInverser.classList.toggle('actif', inverse);
    boutonInverser.setAttribute('aria-pressed', String(inverse));
  };

  if (lire(CLE_INVERSION) === '1') document.documentElement.classList.add('pages-inversees');

  boutonTheme.addEventListener('click', () => {
    const nouveau = themeActuel() === 'sombre' ? 'clair' : 'sombre';
    document.documentElement.dataset.theme = nouveau;
    ecrire(CLE_THEME, nouveau);
    majBoutons();
  });

  boutonInverser.addEventListener('click', () => {
    const actif = document.documentElement.classList.toggle('pages-inversees');
    ecrire(CLE_INVERSION, actif ? '1' : '0');
    majBoutons();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', majBoutons);
  majBoutons();
}
