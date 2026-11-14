// Outil « Capture de zone » : on trace un rectangle sur une page,
// la zone est copiée comme image PNG dans le presse-papiers.
import { etat } from '../state.js';
import { positionDansPage, canvasPage } from '../pdf/render.js';
import { notifier } from './dialogues.js';
import { telecharger } from '../pdf/save.js';

let trace = null; // { n, div, x0, y0, cadre }

export function initCapture(visionneuse) {
  visionneuse.addEventListener('pointerdown', (e) => {
    if (etat.outil !== 'capture' || e.button !== 0) return;
    const pos = positionDansPage(e);
    if (!pos) return;
    e.preventDefault();
    const cadre = document.createElement('div');
    cadre.className = 'cadre-capture';
    pos.div.querySelector('.calque-outil').append(cadre);
    trace = { n: pos.n, div: pos.div, x0: pos.x, y0: pos.y, cadre };
    majCadre(pos.x, pos.y);
    visionneuse.setPointerCapture(e.pointerId);
  });

  visionneuse.addEventListener('pointermove', (e) => {
    if (!trace) return;
    const r = trace.div.getBoundingClientRect();
    majCadre(
      Math.min(Math.max(0, e.clientX - r.left), r.width),
      Math.min(Math.max(0, e.clientY - r.top), r.height),
    );
  });

  const terminer = async () => {
    if (!trace) return;
    const t = trace;
    trace = null;
    const { left, top, width, height } = t.cadre.style;
    const zone = { x: parseFloat(left), y: parseFloat(top), l: parseFloat(width), h: parseFloat(height) };
    setTimeout(() => t.cadre.remove(), 250);
    if (zone.l < 4 || zone.h < 4) return;
    await copierZone(t.n, t.div, zone);
  };
  visionneuse.addEventListener('pointerup', terminer);
  visionneuse.addEventListener('pointercancel', () => {
    trace?.cadre.remove();
    trace = null;
  });
}

function majCadre(x, y) {
  const { x0, y0, cadre } = trace;
  cadre.style.left = `${Math.min(x0, x)}px`;
  cadre.style.top = `${Math.min(y0, y)}px`;
  cadre.style.width = `${Math.abs(x - x0)}px`;
  cadre.style.height = `${Math.abs(y - y0)}px`;
}

/** Découpe la zone dans l'image de la page et la copie en PNG. */
async function copierZone(n, div, zone) {
  const source = canvasPage(n);
  if (!source) {
    notifier('La page n\'est pas encore affichée, réessayez dans un instant.', 'attention');
    return;
  }
  // Rapport entre les pixels du canvas et la taille affichée
  const ratio = source.width / div.clientWidth;
  const sortie = document.createElement('canvas');
  sortie.width = Math.round(zone.l * ratio);
  sortie.height = Math.round(zone.h * ratio);
  sortie.getContext('2d').drawImage(
    source,
    zone.x * ratio, zone.y * ratio, zone.l * ratio, zone.h * ratio,
    0, 0, sortie.width, sortie.height,
  );
  const image = await new Promise((resolve) => sortie.toBlob(resolve, 'image/png'));
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
    notifier(`Zone copiée dans le presse-papiers (${sortie.width} × ${sortie.height} px). Collez-la avec Ctrl+V.`, 'succes');
  } catch (erreur) {
    console.warn('Presse-papiers indisponible', erreur);
    telecharger(image, `capture-page-${n}.png`, 'image/png');
    notifier('Le presse-papiers est indisponible : la capture a été téléchargée en PNG.', 'attention');
  }
}
