// Panneau droit de l'outil « Retouche » : modifier un texte existant, ajouter une zone de texte,
// et rouvrir une retouche déjà faite (corriger, déplacer, supprimer).
import { etat, on } from '../state.js';
import { appliquerModification } from '../document.js';
import { ouvrirAvecPdfLib } from '../pdf/pages.js';
import {
  lireRetouches, ecrireRetouches, effacerDessinRetouche, entreeRetouche, zonesRetouche, fluxDesRetouches,
} from '../pdf/retouches.js';
import { dansZone, policesSousZone } from '../pdf/effacer-texte.js';
import { encodeurPolice } from '../pdf/police-origine.js';
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
let edition = null; // retouche en cours : { id?, page, segment, origine, angle, recouvrement, texteOrigine }
let modePlacement = null; // null | 'nouveau' (nouvelle zone de texte) | 'deplacer' (déplacer le texte en cours)
let docLu = { octets: null, promesse: Promise.resolve(null) }; // document lu par pdf-lib (lecture seule)
let survol = null;
let avertissementMontre = false;

export function initRetouche(element) {
  visionneuse = element;
  panneau = document.getElementById('panneau-droit');

  on('outil', (outil) => {
    if (outil === 'retouche') ouvrirPanneau();
    else if (panneau.querySelector('#formulaire-retouche')) fermerPanneau(); // ne pas fermer le panneau d'un autre outil
  });
  on('document', () => {
    cacheSegments = new Map();
    if (edition) annulerEdition();
    if (etat.outil === 'retouche') majCompteRetouches();
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
    if (modePlacement) basculerPlacement(null);
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
        mais <strong>reste dans le fichier modifiable</strong> : il peut encore être copié ou trouvé par une recherche.
        Pour le retirer réellement, utilisez <strong>« Enregistrer en version définitive »</strong>.</div>
      </div>
      <p class="consigne" id="consigne-retouche">Cliquez sur un texte de la page pour le modifier.</p>
      <p class="consigne" id="compte-retouches"></p>
      <button class="btn" id="btn-placer-texte" data-icone="texte"><span>Ajouter une zone de texte</span></button>
      <form id="formulaire-retouche" hidden>
        <p class="original" id="texte-original"></p>
        <label class="champ">Nouveau texte
          <textarea name="texte" rows="3" spellcheck="true"></textarea>
        </label>
        <div class="ligne">
          <label class="champ">Police
            <select name="famille">
              <option value="Origine" hidden>Police d'origine</option>
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
        <p class="alerte-police" id="alerte-police" hidden></p>
        <div class="actions secondaires">
          <button type="button" class="btn" id="btn-deplacer-texte" title="Cliquez ensuite sur la page à l'endroit voulu">Déplacer le texte</button>
          <button type="button" class="btn danger" id="btn-supprimer-retouche" hidden>Supprimer la retouche</button>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="btn-annuler-retouche">Annuler</button>
          <button type="submit" class="btn principal">Appliquer</button>
        </div>
      </form>
    </div>`;
  placerIcones(panneau);
  panneau.querySelector('#btn-placer-texte').addEventListener('click', () => basculerPlacement(modePlacement === 'nouveau' ? null : 'nouveau'));
  panneau.querySelector('#btn-deplacer-texte').addEventListener('click', () => basculerPlacement(modePlacement === 'deplacer' ? null : 'deplacer'));
  panneau.querySelector('#btn-supprimer-retouche').addEventListener('click', supprimerRetouche);
  const formulaire = panneau.querySelector('#formulaire-retouche');
  formulaire.addEventListener('input', () => {
    verifierPoliceOrigine();
    majApercu();
  });
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    appliquer();
  });
  panneau.querySelector('#btn-annuler-retouche').addEventListener('click', annulerEdition);
  majCompteRetouches();
  if (!avertissementMontre) {
    avertissementMontre = true;
    notifier('Retouche : l\'ancien texte reste présent dans le fichier, sous le recouvrement.', 'attention', 6000);
  }
}

function fermerPanneau() {
  annulerEdition();
  basculerPlacement(null);
  effacerSurvol();
  panneau.hidden = true;
  panneau.replaceChildren();
}

function basculerPlacement(mode) {
  modePlacement = mode;
  visionneuse.classList.toggle('placer-texte', Boolean(mode));
  panneau.querySelector('#btn-placer-texte')?.classList.toggle('actif', mode === 'nouveau');
  panneau.querySelector('#btn-deplacer-texte')?.classList.toggle('actif', mode === 'deplacer');
  const consigne = panneau.querySelector('#consigne-retouche');
  if (consigne) {
    consigne.textContent = {
      nouveau: 'Cliquez sur la page à l\'endroit où commencer le nouveau texte (Échap pour annuler).',
      deplacer: 'Cliquez sur la page à l\'endroit où placer le début du texte (Échap pour annuler).',
    }[mode] ?? 'Cliquez sur un texte de la page pour le modifier, ou sur une retouche pour la reprendre.';
  }
}

// ---------- Retouches mémorisées dans le fichier ----------

/** Document ouvert, lu par pdf-lib une fois par version du fichier (lecture seule, jamais enregistré). */
function documentLu() {
  if (docLu.octets !== etat.octets) {
    docLu = {
      octets: etat.octets,
      promesse: etat.octets ? ouvrirAvecPdfLib(etat.octets).catch(() => null) : Promise.resolve(null),
    };
  }
  return docLu.promesse;
}

/** Retouches mémorisées dans le fichier ouvert. */
async function retouchesDuDocument() {
  const doc = await documentLu();
  return doc ? lireRetouches(doc) : [];
}

/**
 * Analyse la police réellement utilisée sous une zone de la page n.
 * @returns {Promise<{ nomBase: string, origine: object|null, encodeur: object|null }>}
 */
async function analyserPolice(n, zone) {
  try {
    const doc = await documentLu();
    if (!doc) return { nomBase: '', origine: null, encodeur: null };
    const polices = policesSousZone(doc, doc.getPage(n - 1), zone, fluxDesRetouches(lireRetouches(doc)));
    const principale = polices[0];
    if (!principale) return { nomBase: '', origine: null, encodeur: null };
    const encodeur = principale.ref ? encodeurPolice(doc.context, principale.ref) : null;
    return {
      nomBase: principale.nomBase,
      origine: encodeur ? { ref: principale.ref, th: principale.th, nom: encodeur.nom } : null,
      encodeur,
    };
  } catch (erreur) {
    console.warn('Analyse de la police impossible', erreur);
    return { nomBase: '', origine: null, encodeur: null };
  }
}

/** Encodeur de la police d'origine d'une retouche mémorisée. */
async function encodeurDeRetouche(policeOrigine) {
  const doc = await documentLu();
  return doc && policeOrigine ? encodeurPolice(doc.context, policeOrigine.ref) : null;
}

/** Retouche (la plus récente) sous un point de la page n. */
async function retoucheSousLePoint(n, px, py) {
  const liste = await retouchesDuDocument();
  for (let i = liste.length - 1; i >= 0; i--) {
    const r = liste[i];
    if (r.page === n && zonesRetouche(r).some((z) => dansZone(z, px, py))) return r;
  }
  return null;
}

async function majCompteRetouches() {
  const liste = await retouchesDuDocument();
  const zone = panneau.querySelector('#compte-retouches');
  if (!zone) return;
  zone.textContent = liste.length
    ? `${liste.length} retouche${liste.length > 1 ? 's modifiables' : ' modifiable'} dans ce document (cadre orange au survol).`
    : '';
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
  // Une retouche existante passe avant le texte d'origine
  const retouche = await retoucheSousLePoint(pos.n, pos.px, pos.py);
  const cible = retouche ?? segmentSousLePoint(await segmentsPage(pos.n), pos.px, pos.py);
  if (cible && cible === survol?.cible) return;
  effacerSurvol();
  if (!cible || (retouche && edition?.id === retouche.id) || (!retouche && edition?.segment === cible)) return;
  const cadre = document.createElement('div');
  cadre.className = retouche ? 'segment-survol retouche-existante' : 'segment-survol';
  const zones = retouche ? zonesRetouche(retouche) : [zoneDeRecouvrement(cible)];
  placerSurEcran(cadre, pos.n, zones.flatMap(coinsZone));
  if (retouche) cadre.title = 'Retouche : cliquez pour la corriger, la déplacer ou la supprimer';
  pos.div.querySelector('.calque-outil').append(cadre);
  survol = { cible, cadre };
}

function effacerSurvol() {
  survol?.cadre.remove();
  survol = null;
}

async function surClic(e) {
  if (etat.outil !== 'retouche') return;
  const pos = positionDansPage(e);
  if (!pos) return;
  if (modePlacement === 'nouveau') {
    basculerPlacement(null);
    commencerNouveauTexte(pos);
    return;
  }
  if (modePlacement === 'deplacer') {
    basculerPlacement(null);
    if (edition && pos.n === edition.page) {
      edition.origine = [pos.px, pos.py];
      majApercu();
    } else if (edition) {
      notifier('Le texte ne peut être déplacé que sur sa propre page.', 'attention');
    }
    return;
  }
  const retouche = await retoucheSousLePoint(pos.n, pos.px, pos.py);
  if (retouche) {
    effacerSurvol();
    reprendreRetouche(retouche);
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
async function commencerRetouche(n, segment) {
  const recouvrement = zoneDeRecouvrement(segment);
  const analyse = await analyserPolice(n, recouvrement);
  const police = devinerPolice(pagePdfjs(n), segment, analyse.nomBase);
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
    texteOrigine: segment.texte,
    policeOrigine: analyse.origine,
    encodeur: analyse.encodeur,
    familleProche: police.famille,
  };
  remplirFormulaire({
    texte: segment.texte,
    famille: analyse.origine ? 'Origine' : police.famille,
    gras: police.gras,
    italique: police.italique,
    taille: Math.round(segment.taille * 10) / 10,
    couleur: couleurs.texte,
    fond: couleurs.fond,
    original: `Texte d'origine : « ${segment.texte} » — police ${police.nomOrigine}`,
  });
}

/** Rouvre une retouche mémorisée dans le fichier, avec ses réglages. */
async function reprendreRetouche(r) {
  edition = {
    id: r.id,
    page: r.page,
    segment: null,
    origine: r.origine,
    angle: r.angle,
    recouvrement: r.recouvrement,
    texteOrigine: r.texteOrigine,
    policeOrigine: r.policeOrigine ?? null,
    encodeur: await encodeurDeRetouche(r.policeOrigine),
    familleProche: r.familleProche ?? 'Helvetica',
  };
  remplirFormulaire({
    texte: r.texte,
    famille: r.famille,
    gras: r.gras,
    italique: r.italique,
    taille: r.taille,
    couleur: r.couleur,
    fond: r.fond,
    original: r.texteOrigine ? `Retouche existante — texte d'origine : « ${r.texteOrigine} »` : 'Zone de texte existante',
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
    policeOrigine: null,
    encodeur: null,
    familleProche: 'Helvetica',
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
  const optionOrigine = f.famille.querySelector('option[value="Origine"]');
  optionOrigine.hidden = !edition.policeOrigine;
  optionOrigine.textContent = edition.policeOrigine
    ? `Police d'origine : ${edition.policeOrigine.nom} (identique)` : 'Police d\'origine';
  f.famille.value = v.famille === 'Origine' && !edition.policeOrigine ? edition.familleProche : v.famille;
  f.gras.checked = v.gras;
  f.italique.checked = v.italique;
  f.taille.value = String(v.taille);
  f.couleur.value = versHex(v.couleur);
  f.fond.value = versHex(v.fond);
  panneau.querySelector('#champ-fond').hidden = !edition.recouvrement;
  panneau.querySelector('#btn-supprimer-retouche').hidden = !edition.id;
  panneau.querySelector('#texte-original').textContent = v.original;
  verifierPoliceOrigine();
  majApercu();
  f.texte.focus();
  f.texte.select();
}

/** Vérifie que les lettres tapées existent dans la police d'origine ; met à jour le message. */
function verifierPoliceOrigine() {
  const f = panneau.querySelector('#formulaire-retouche');
  const alerte = panneau.querySelector('#alerte-police');
  if (!f || !alerte) return true;
  const origine = f.famille.value === 'Origine';
  f.gras.disabled = origine;
  f.italique.disabled = origine;
  f.gras.closest('.styles').title = origine ? 'Gras et italique : ceux de la police d\'origine' : '';
  if (!origine || !edition?.encodeur) {
    alerte.hidden = true;
    return true;
  }
  const manquants = [...new Set(f.texte.value.split('\n').flatMap((l) => edition.encodeur.encoder(l).manquants))];
  alerte.hidden = !manquants.length;
  alerte.textContent = manquants.length
    ? `Lettres absentes de la police d'origine (le PDF n'intègre que les lettres déjà utilisées) : ${manquants.join(' ')}. `
      + `Modifiez le texte ou choisissez une police proche (suggestion : ${edition.familleProche}).`
    : '';
  return !manquants.length;
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
  if (modePlacement === 'deplacer') basculerPlacement(null);
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
  if (!verifierPoliceOrigine()) {
    notifier('Certaines lettres n\'existent pas dans la police d\'origine : choisissez une police proche.', 'attention');
    return;
  }
  const {
    id, page, origine, angle, recouvrement, texteOrigine, familleProche,
  } = edition;
  const policeOrigine = v.famille === 'Origine' ? edition.policeOrigine : null;
  let remplaces = [];
  const ok = await appliquerModification(async (doc) => {
    const liste = lireRetouches(doc);
    // Retouche existante : on retire l'ancien dessin au lieu d'empiler un nouveau recouvrement
    const ancienne = id ? liste.find((r) => r.id === id) : null;
    if (ancienne) {
      effacerDessinRetouche(doc, ancienne);
      liste.splice(liste.indexOf(ancienne), 1);
    }
    if (!v.texte.trim() && !recouvrement) return false;
    const resultat = await appliquerRetouche(doc, {
      page, origine, angle, recouvrement, policeOrigine, ...v,
    });
    remplaces = resultat.remplaces;
    liste.push(entreeRetouche({
      id: ancienne?.id,
      page: doc.getPage(page - 1),
      fluxRef: resultat.fluxRef,
      zoneTexte: resultat.zoneTexte,
      parametres: {
        recouvrement, origine, angle, texteOrigine, policeOrigine, familleProche, ...v,
      },
    }));
    ecrireRetouches(doc, liste);
    return true;
  }, { message: id ? 'Retouche modifiée.' : (recouvrement ? 'Texte retouché.' : 'Zone de texte ajoutée.') });
  if (ok) {
    annulerEdition();
    if (remplaces.length) {
      notifier(`Caractères absents de la police remplacés par « ? » : ${remplaces.join(' ')}`, 'attention', 7000);
    }
  }
}

/** Supprime la retouche en cours : le texte d'origine réapparaît. */
async function supprimerRetouche() {
  if (!edition?.id) return;
  const { id } = edition;
  const ok = await appliquerModification((doc) => {
    const liste = lireRetouches(doc);
    const r = liste.find((x) => x.id === id);
    if (!r) return false;
    effacerDessinRetouche(doc, r);
    liste.splice(liste.indexOf(r), 1);
    ecrireRetouches(doc, liste);
    return true;
  }, { message: 'Retouche supprimée : le texte d\'origine est de nouveau visible.' });
  if (ok) annulerEdition();
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
      fontFamily: CSS_POLICES[v.famille === 'Origine' ? edition.familleProche : v.famille],
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

