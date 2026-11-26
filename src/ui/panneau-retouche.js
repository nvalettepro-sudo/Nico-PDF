// Panneau droit de l'outil « Retouche » : modifier un texte existant ou ajouter une zone de texte.
import { etat, on } from '../state.js';
import { appliquerModification } from '../document.js';
import {
  positionDansPage, pagePdfjs, viewportPage, canvasPage, divPage,
} from '../pdf/render.js';
import {
  segmentsDeLaPage, segmentSousLePoint, zoneDeRecouvrement, coinsZone, devinerPolice,
  echantillonnerCouleurs, appliquerRetouche,
} from '../pdf/edit-text.js';
import { placerIcones } from './icones.js';
import { notifier } from './dialogues.js';

const CSS_POLICES = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
};

let panneau;
let visionneuse;
let cacheSegments = new Map(); // page -> Promise<segments>
let edition = null; // retouche en cours : { page, segment, origine, angle, recouvrement }
let modePlacement = false;
let survol = null;
let avertissementMontre = false;

export function initRetouche(element) {
  visionneuse = element;
  panneau = document.getElementById('panneau-droit');

  on('outil', (outil) => {
    if (outil === 'retouche') ouvrirPanneau();
    else if (panneau.querySelector('#formulaire-retouche')) fermerPanneau();
  });
  on('document', () => {
    cacheSegments = new Map();
    if (edition) annulerEdition();
  });
  on('page-rendue', (n) => {
    if (edition?.page === n) majApercu();
  });
  on('zoom', () => setTimeout(majApercu, 0));

  visionneuse.addEventListener('pointermove', surSurvol);
  visionneuse.addEventListener('pointerleave', effacerSurvol);
  visionneuse.addEventListener('click', surClic);
  document.addEventListener('keydown', (e) => {
    if (etat.outil !== 'retouche' || e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (modePlacement) basculerPlacement(false);
    else if (edition) annulerEdition();
  });
}

// ---------- Panneau ----------

function ouvrirPanneau() {
  panneau.hidden = false;
  panneau.innerHTML = `
    <div class="retouche">
      <h2>Retouche du texte</h2>
      <div class="avertissement" data-icone="attention">
        <div><strong>Retouche par recouvrement.</strong> Le texte d'origine est caché sous un rectangle
        mais <strong>reste dans le fichier</strong> : il peut encore être copié ou trouvé par une recherche.
        Ne l'utilisez pas pour masquer une information sensible.</div>
      </div>
      <p class="consigne" id="consigne-retouche">Cliquez sur un texte de la page pour le modifier.</p>
      <button class="btn" id="btn-placer-texte" data-icone="texte"><span>Ajouter une zone de texte</span></button>
      <form id="formulaire-retouche" hidden>
        <p class="original" id="texte-original"></p>
        <label class="champ">Nouveau texte
          <textarea name="texte" rows="3" spellcheck="true"></textarea>
        </label>
        <div class="ligne">
          <label class="champ">Police
            <select name="famille">
              <option value="Helvetica">Helvetica (Arial)</option>
              <option value="Times">Times</option>
              <option value="Courier">Courier</option>
            </select>
          </label>
          <label class="champ" style="max-width:86px">Taille
            <input name="taille" type="number" min="2" max="300" step="0.5" />
          </label>
        </div>
        <div class="ligne">
          <div class="styles" role="group" aria-label="Style">
            <label title="Gras"><input type="checkbox" name="gras" /><span><strong>G</strong></span></label>
            <label title="Italique"><input type="checkbox" name="italique" /><span><em>I</em></span></label>
          </div>
          <label class="champ">Texte
            <input name="couleur" type="color" />
          </label>
          <label class="champ" id="champ-fond">Fond
            <input name="fond" type="color" />
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="btn-annuler-retouche">Annuler</button>
          <button type="submit" class="btn principal">Appliquer</button>
        </div>
      </form>
    </div>`;
  placerIcones(panneau);
  panneau.querySelector('#btn-placer-texte').addEventListener('click', () => basculerPlacement(!modePlacement));
  const formulaire = panneau.querySelector('#formulaire-retouche');
  formulaire.addEventListener('input', majApercu);
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    appliquer();
  });
  panneau.querySelector('#btn-annuler-retouche').addEventListener('click', annulerEdition);
  if (!avertissementMontre) {
    avertissementMontre = true;
    notifier('Retouche : l\'ancien texte reste présent dans le fichier, sous le recouvrement.', 'attention', 6000);
  }
}

function fermerPanneau() {
  annulerEdition();
  basculerPlacement(false);
  effacerSurvol();
  panneau.hidden = true;
  panneau.replaceChildren();
}

function basculerPlacement(actif) {
  modePlacement = actif;
  visionneuse.classList.toggle('placer-texte', actif);
  const bouton = panneau.querySelector('#btn-placer-texte');
  bouton?.classList.toggle('actif', actif);
  const consigne = panneau.querySelector('#consigne-retouche');
  if (consigne) {
    consigne.textContent = actif
      ? 'Cliquez sur la page à l\'endroit où commencer le nouveau texte (Échap pour annuler).'
      : 'Cliquez sur un texte de la page pour le modifier.';
  }
}

// ---------- Survol et clic sur la page ----------

function segmentsPage(n) {
  if (!cacheSegments.has(n)) cacheSegments.set(n, segmentsDeLaPage(pagePdfjs(n)));
  return cacheSegments.get(n);
}

async function surSurvol(e) {
  if (etat.outil !== 'retouche' || modePlacement) return;
  const pos = positionDansPage(e);
  if (!pos) return effacerSurvol();
  const segment = segmentSousLePoint(await segmentsPage(pos.n), pos.px, pos.py);
  if (segment === survol?.segment) return;
  effacerSurvol();
  if (!segment || (edition?.segment === segment)) return;
  const cadre = document.createElement('div');
  cadre.className = 'segment-survol';
  placerSurEcran(cadre, pos.n, coinsZone(zoneDeRecouvrement(segment)));
  pos.div.querySelector('.calque-outil').append(cadre);
  survol = { segment, cadre };
}

function effacerSurvol() {
  survol?.cadre.remove();
  survol = null;
}

async function surClic(e) {
  if (etat.outil !== 'retouche') return;
  const pos = positionDansPage(e);
  if (!pos) return;
  if (modePlacement) {
    basculerPlacement(false);
    commencerNouveauTexte(pos);
    return;
  }
  const segment = segmentSousLePoint(await segmentsPage(pos.n), pos.px, pos.py);
  if (!segment) {
    if (!edition) notifier('Aucun texte ici. Cliquez sur un mot, ou utilisez « Ajouter une zone de texte ».', 'info', 2500);
    return;
  }
  effacerSurvol();
  commencerRetouche(pos.n, segment);
}

/** Prépare la retouche d'un texte existant : police, taille et couleurs d'origine. */
function commencerRetouche(n, segment) {
  const recouvrement = zoneDeRecouvrement(segment);
  const police = devinerPolice(pagePdfjs(n), segment);
  let couleurs = { fond: [1, 1, 1], texte: [0, 0, 0] };
  const canvas = canvasPage(n);
  const div = divPage(n);
  if (canvas && div) {
    const coins = coinsZone(recouvrement).map(([x, y]) => viewportPage(n).convertToViewportPoint(x, y));
    couleurs = echantillonnerCouleurs(canvas, coins, canvas.width / div.clientWidth);
  }
  edition = {
    page: n,
    segment,
    origine: segment.origine,
    angle: segment.angle,
    recouvrement,
  };
  remplirFormulaire({
    texte: segment.texte,
    famille: police.famille,
    gras: police.gras,
    italique: police.italique,
    taille: Math.round(segment.taille * 10) / 10,
    couleur: couleurs.texte,
    fond: couleurs.fond,
    original: `Texte d'origine : « ${segment.texte} » — police ${police.nomOrigine}`,
  });
}

/** Prépare l'ajout d'une nouvelle zone de texte à l'endroit cliqué. */
function commencerNouveauTexte(pos) {
  const rotationPage = pagePdfjs(pos.n).rotate || 0;
  edition = {
    page: pos.n,
    segment: null,
    origine: [pos.px, pos.py],
    // Texte droit à l'écran, même si la page est tournée dans le fichier
    angle: (rotationPage * Math.PI) / 180,
    recouvrement: null,
  };
  remplirFormulaire({
    texte: '',
    famille: 'Helvetica',
    gras: false,
    italique: false,
    taille: 12,
    couleur: [0, 0, 0],
    fond: [1, 1, 1],
    original: 'Nouvelle zone de texte',
  });
}

function remplirFormulaire(v) {
  const f = panneau.querySelector('#formulaire-retouche');
  if (!f) return;
  f.hidden = false;
  f.texte.value = v.texte;
  f.famille.value = v.famille;
  f.gras.checked = v.gras;
  f.italique.checked = v.italique;
  f.taille.value = String(v.taille);
  f.couleur.value = versHex(v.couleur);
  f.fond.value = versHex(v.fond);
  panneau.querySelector('#champ-fond').hidden = !edition.recouvrement;
  panneau.querySelector('#texte-original').textContent = v.original;
  majApercu();
  f.texte.focus();
  f.texte.select();
}

function lireFormulaire() {
  const f = panneau.querySelector('#formulaire-retouche');
  return {
    texte: f.texte.value,
    famille: f.famille.value,
    gras: f.gras.checked,
    italique: f.italique.checked,
    taille: Math.min(300, Math.max(2, Number(f.taille.value) || 12)),
    couleur: depuisHex(f.couleur.value),
    fond: depuisHex(f.fond.value),
  };
}

function annulerEdition() {
  edition = null;
  document.querySelectorAll('.apercu-retouche').forEach((el) => el.remove());
  const f = panneau?.querySelector('#formulaire-retouche');
  if (f) f.hidden = true;
}

async function appliquer() {
  if (!edition) return;
  const v = lireFormulaire();
  if (!v.texte.trim() && !edition.recouvrement) {
    notifier('Saisissez un texte à ajouter.', 'attention');
    return;
  }
  const { page, origine, angle, recouvrement } = edition;
  let remplaces = [];
  const ok = await appliquerModification(async (doc) => {
    remplaces = await appliquerRetouche(doc, {
      page, origine, angle, recouvrement, ...v,
    });
  }, { message: recouvrement ? 'Texte retouché.' : 'Zone de texte ajoutée.' });
  if (ok) {
    annulerEdition();
    if (remplaces.length) {
      notifier(`Caractères absents de la police remplacés par « ? » : ${remplaces.join(' ')}`, 'attention', 7000);
    }
  }
}

// ---------- Aperçu sur la page ----------

/** Place un élément sur la boîte englobante (à l'écran) d'une zone donnée en coordonnées PDF. */
function placerSurEcran(element, n, coins) {
  const vue = viewportPage(n);
  const points = coins.map(([x, y]) => vue.convertToViewportPoint(x, y));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  element.style.left = `${Math.min(...xs)}px`;
  element.style.top = `${Math.min(...ys)}px`;
  element.style.width = `${Math.max(...xs) - Math.min(...xs)}px`;
  element.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;
}

function majApercu() {
  document.querySelectorAll('.apercu-retouche').forEach((el) => el.remove());
  if (!edition || !panneau.querySelector('#formulaire-retouche')) return;
  const div = divPage(edition.page);
  const vue = viewportPage(edition.page);
  if (!div || !vue) return;
  const v = lireFormulaire();
  const apercu = document.createElement('div');
  apercu.className = 'apercu-retouche';
  // Angle du texte à l'écran (rotation de la page et de la vue comprises)
  const angleEcran = ((((edition.angle * 180) / Math.PI - vue.rotation) % 360) + 360) % 360;
  const droit = Math.abs(angleEcran) < 0.5 || Math.abs(angleEcran - 360) < 0.5;
  const zoom = vue.scale;
  const [ox, oy] = vue.convertToViewportPoint(...edition.origine);

  if (edition.recouvrement) {
    placerSurEcran(apercu, edition.page, coinsZone(edition.recouvrement));
    apercu.style.background = versHex(v.fond);
  } else {
    apercu.style.left = `${ox}px`;
    apercu.style.top = `${oy - v.taille * zoom}px`;
    apercu.style.width = '2px';
    apercu.style.height = `${v.taille * zoom * 1.2}px`;
  }
  if (droit && v.texte) {
    const texte = document.createElement('div');
    texte.className = 'texte';
    texte.textContent = v.texte;
    Object.assign(texte.style, {
      fontFamily: CSS_POLICES[v.famille],
      fontSize: `${v.taille * zoom}px`,
      fontWeight: v.gras ? '700' : '400',
      fontStyle: v.italique ? 'italic' : 'normal',
      color: versHex(v.couleur),
    });
    // Position de la ligne de base, relative à l'aperçu
    const gauche = parseFloat(apercu.style.left);
    const haut = parseFloat(apercu.style.top);
    texte.style.left = `${ox - gauche}px`;
    // Avec une hauteur de ligne de 1,2, la ligne de base est à environ 0,95 × la taille depuis le haut
    texte.style.top = `${oy - haut - v.taille * zoom * 0.95}px`;
    apercu.append(texte);
  }
  div.querySelector('.calque-outil').append(apercu);
}

// ---------- Couleurs ----------

function versHex(rvb) {
  return `#${rvb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function depuisHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
}

