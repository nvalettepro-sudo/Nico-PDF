// Retouche du texte existant, par recouvrement :
// 1. un rectangle de la couleur du fond cache l'ancien texte ;
// 2. le nouveau texte est dessiné par-dessus avec la police standard la plus proche.
// LIMITE : l'ancien texte reste dans le fichier, sous le rectangle (il reste copiable et cherchable).
import { StandardFonts, rgb, degrees } from 'pdf-lib';

// ---------- Analyse du texte de la page ----------

/**
 * Regroupe les morceaux de texte de la page en « segments » (portions de ligne).
 * @param {object} page page PDF.js
 * @returns {Promise<Array<object>>}
 */
export async function segmentsDeLaPage(page) {
  const contenu = await page.getTextContent();
  const morceaux = [];
  for (const item of contenu.items) {
    if (!('str' in item) || !item.str.trim() || !item.width) continue;
    const [a, b, c, d, e, f] = item.transform;
    const angle = Math.atan2(b, a);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const taille = Math.hypot(c, d) || item.height || Math.hypot(a, b);
    morceaux.push({
      item,
      angle,
      cos,
      sin,
      taille,
      debut: cos * e + sin * f, // position le long de la ligne
      fin: cos * e + sin * f + item.width,
      base: -sin * e + cos * f, // position de la ligne de base
      style: contenu.styles[item.fontName] ?? {},
    });
  }
  // Tri par ligne (angle, ligne de base), puis de gauche à droite
  morceaux.sort((m1, m2) => (m1.angle - m2.angle) || (m2.base - m1.base) || (m1.debut - m2.debut));

  const segments = [];
  let courant = null;
  for (const m of morceaux) {
    const memeLigne = courant
      && Math.abs(m.angle - courant.angle) < 0.01
      && Math.abs(m.base - courant.base) < courant.taille * 0.3;
    const ecart = courant ? m.debut - courant.fin : 0;
    if (memeLigne && ecart < courant.taille * 0.9 && ecart > -courant.taille * 0.5) {
      const espace = ecart > courant.taille * 0.15 && !courant.texte.endsWith(' ') && !m.item.str.startsWith(' ');
      courant.texte += (espace ? ' ' : '') + m.item.str;
      courant.fin = Math.max(courant.fin, m.fin);
      courant.morceaux.push(m);
      continue;
    }
    courant = {
      texte: m.item.str,
      angle: m.angle,
      cos: m.cos,
      sin: m.sin,
      taille: m.taille,
      debut: m.debut,
      fin: m.fin,
      base: m.base,
      origine: [m.item.transform[4], m.item.transform[5]],
      fontName: m.item.fontName,
      style: m.style,
      morceaux: [m],
    };
    segments.push(courant);
  }
  for (const s of segments) s.texte = s.texte.replace(/\s+$/, '');
  return segments;
}

/** Trouve le segment sous un point (coordonnées PDF). Le dernier dessiné l'emporte. */
export function segmentSousLePoint(segments, px, py) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    const le = s.cos * px + s.sin * py;
    const ld = -s.sin * px + s.cos * py;
    if (le >= s.debut - 2 && le <= s.fin + 2 && ld >= s.base - s.taille * 0.3 && ld <= s.base + s.taille * 1.0) {
      return s;
    }
  }
  return null;
}

/**
 * Rectangle de recouvrement du segment, dans le repère de la ligne :
 * coin bas-gauche (coordonnées PDF), largeur, hauteur et angle.
 */
export function zoneDeRecouvrement(segment) {
  const t = segment.taille;
  const ascent = Math.max(segment.style.ascent ?? 0.9, 0.8);
  const descent = Math.min(segment.style.descent ?? -0.22, -0.15);
  const marge = t * 0.06;
  const bas = descent * t - t * 0.03;
  const haut = ascent * t + t * 0.06;
  const [ox, oy] = segment.origine;
  // Décalage depuis l'origine du premier morceau (le long de la ligne et vers le bas)
  const versDebut = segment.debut - (segment.cos * ox + segment.sin * oy) - marge;
  const x = ox + segment.cos * versDebut - segment.sin * bas;
  const y = oy + segment.sin * versDebut + segment.cos * bas;
  return {
    x,
    y,
    largeur: segment.fin - segment.debut + 2 * marge,
    hauteur: haut - bas,
    angle: segment.angle,
  };
}

/** Les 4 coins d'une zone (repère PDF), pour l'aperçu à l'écran. */
export function coinsZone({ x, y, largeur, hauteur, angle }) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [x, y],
    [x + cos * largeur, y + sin * largeur],
    [x + cos * largeur - sin * hauteur, y + sin * largeur + cos * hauteur],
    [x - sin * hauteur, y + cos * hauteur],
  ];
}

// ---------- Police et couleurs d'origine ----------

/**
 * Devine la police standard la plus proche de la police d'origine.
 * @returns {{ famille: 'Helvetica'|'Times'|'Courier', gras: boolean, italique: boolean, nomOrigine: string }}
 */
export function devinerPolice(pagePdfjs, segment) {
  let objet = null;
  try {
    if (pagePdfjs.commonObjs.has(segment.fontName)) objet = pagePdfjs.commonObjs.get(segment.fontName);
  } catch {
    objet = null;
  }
  // PDF.js ne transmet pas toujours le nom exact de la police : on combine les indices disponibles.
  const nomOrigine = String(
    objet?.cssFontInfo?.fontFamily || objet?.systemFontInfo?.css || objet?.fallbackName || '',
  ).split(',')[0].replace(/["']/g, '').replace(/^[A-Z]{6}\+/, '').trim(); // ex. « ABCDEF+Calibri » -> « Calibri »
  const indice = `${nomOrigine} ${segment.style.fontFamily ?? ''}`.toLowerCase();
  let famille = 'Helvetica';
  if (/courier|mono|consol|typewriter/.test(indice)) famille = 'Courier';
  else if (/times|georgia|garamond|cambria|palatino|minion|book|roman|serif/.test(indice) && !/sans/.test(indice)) famille = 'Times';
  const gras = /bold|black|heavy|semibold|demi|gras/.test(indice) || Boolean(objet?.bold || objet?.black);
  const italique = /italic|oblique|kursiv/.test(indice) || Boolean(objet?.italic);
  return { famille, gras, italique, nomOrigine: nomOrigine || segment.style.fontFamily || 'inconnue' };
}

/**
 * Échantillonne la couleur du fond (autour du texte) et celle du texte, sur l'image affichée de la page.
 * @param {HTMLCanvasElement} canvas image de la page
 * @param {number[][]} coinsEcran coins de la zone en pixels d'affichage
 * @param {number} ratio pixels du canvas par pixel affiché
 * @returns {{ fond: number[], texte: number[] }} couleurs RVB entre 0 et 1
 */
export function echantillonnerCouleurs(canvas, coinsEcran, ratio) {
  const xs = coinsEcran.map((p) => p[0] * ratio);
  const ys = coinsEcran.map((p) => p[1] * ratio);
  const g = Math.max(0, Math.floor(Math.min(...xs)));
  const h = Math.max(0, Math.floor(Math.min(...ys)));
  const d = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
  const b = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
  const m = Math.max(2, Math.round(3 * ratio)); // épaisseur de l'anneau autour du texte
  const x0 = Math.max(0, g - m);
  const y0 = Math.max(0, h - m);
  const l = Math.min(canvas.width, d + m) - x0;
  const ht = Math.min(canvas.height, b + m) - y0;
  if (l <= 0 || ht <= 0) return { fond: [1, 1, 1], texte: [0, 0, 0] };
  const donnees = canvas.getContext('2d').getImageData(x0, y0, l, ht).data;

  // Fond : couleur la plus fréquente dans l'anneau autour du texte
  const groupes = new Map();
  const interieur = [];
  for (let y = 0; y < ht; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4;
      const px = [donnees[i], donnees[i + 1], donnees[i + 2]];
      const dedans = x0 + x >= g && x0 + x < d && y0 + y >= h && y0 + y < b;
      if (dedans) {
        interieur.push(px);
      } else {
        const cle = (px[0] >> 3) * 1024 + (px[1] >> 3) * 32 + (px[2] >> 3);
        const groupe = groupes.get(cle) ?? { n: 0, r: 0, v: 0, b: 0 };
        groupe.n++;
        groupe.r += px[0];
        groupe.v += px[1];
        groupe.b += px[2];
        groupes.set(cle, groupe);
      }
    }
  }
  let principal = null;
  for (const groupe of groupes.values()) if (!principal || groupe.n > principal.n) principal = groupe;
  const fond = principal ? [principal.r / principal.n, principal.v / principal.n, principal.b / principal.n] : [255, 255, 255];

  // Texte : moyenne des pixels les plus éloignés de la couleur du fond
  const distance = (p) => Math.hypot(p[0] - fond[0], p[1] - fond[1], p[2] - fond[2]);
  const tries = interieur.map((p) => [distance(p), p]).sort((a, z) => z[0] - a[0]);
  const retenus = tries.slice(0, Math.max(1, Math.floor(tries.length * 0.08))).filter(([dist]) => dist > 60);
  let texte = [0, 0, 0];
  if (retenus.length) {
    texte = [0, 1, 2].map((k) => retenus.reduce((s, [, p]) => s + p[k], 0) / retenus.length);
  }
  return { fond: fond.map((v) => v / 255), texte: texte.map((v) => v / 255) };
}

// ---------- Écriture dans le PDF (pdf-lib) ----------

const POLICES = {
  Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
  Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
  Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
};

/** Nom pdf-lib de la police standard (avec gras / italique). */
export function policeStandard(famille, gras, italique) {
  const variantes = POLICES[famille] ?? POLICES.Helvetica;
  return StandardFonts[variantes[(gras ? 1 : 0) + (italique ? 2 : 0)]];
}

// Caractères absents des polices standard, remplacés par un équivalent proche
const EQUIVALENTS = {
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
  '‐': '-', '‑': '-', '−': '-', '′': "'", '″': '"', '→': '->', '←': '<-',
  '≤': '<=', '≥': '>=', '≈': '~', ' ': ' ',
};

/**
 * Adapte le texte aux caractères disponibles dans la police standard.
 * @returns {{ texte: string, remplaces: string[] }}
 */
export function adapterTexte(texte, police) {
  const remplaces = new Set();
  let resultat = '';
  for (const caractere of texte.normalize('NFC')) {
    if (caractere === '\n') {
      resultat += caractere;
      continue;
    }
    try {
      police.encodeText(caractere);
      resultat += caractere;
    } catch {
      const equivalent = EQUIVALENTS[caractere];
      if (equivalent !== undefined) {
        resultat += equivalent;
      } else {
        remplaces.add(caractere);
        resultat += '?';
      }
    }
  }
  return { texte: resultat, remplaces: [...remplaces] };
}

/**
 * Isole le contenu existant de la page entre « q » et « Q » (sauvegarde / restauration
 * de l'état graphique) pour que nos ajouts ne soient pas décalés par une transformation laissée ouverte.
 */
function isolerContenuExistant(doc, page) {
  page.node.normalize();
  const debut = doc.context.register(doc.context.flateStream('q\n'));
  const fin = doc.context.register(doc.context.flateStream('\nQ\n'));
  page.node.wrapContentStreams(debut, fin);
}

/**
 * Applique une retouche (ou ajoute une zone de texte) sur une page.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {object} r
 * @param {number} r.page numéro de page (à partir de 1)
 * @param {object|null} r.recouvrement zone à masquer ({x, y, largeur, hauteur, angle}) ou null
 * @param {number[]} r.origine point de départ du texte (ligne de base), coordonnées PDF
 * @param {number} r.angle angle du texte en radians
 * @param {string} r.texte nouveau texte (plusieurs lignes possibles)
 * @param {'Helvetica'|'Times'|'Courier'} r.famille
 * @param {boolean} r.gras
 * @param {boolean} r.italique
 * @param {number} r.taille taille en points
 * @param {number[]} r.couleur couleur du texte (RVB 0 à 1)
 * @param {number[]} r.fond couleur du recouvrement (RVB 0 à 1)
 * @returns {Promise<{ remplaces: string[], fluxRef: import('pdf-lib').PDFRef, zoneTexte: object|null }>}
 *   caractères remplacés, flux de dessin de la retouche (pour la retrouver) et zone du nouveau texte
 */
export async function appliquerRetouche(doc, r) {
  const page = doc.getPage(r.page - 1);
  isolerContenuExistant(doc, page);
  const angleDeg = (r.angle * 180) / Math.PI;

  if (r.recouvrement) {
    const z = r.recouvrement;
    page.drawRectangle({
      x: z.x,
      y: z.y,
      width: z.largeur,
      height: z.hauteur,
      rotate: degrees(angleDeg),
      color: rgb(...r.fond),
      borderWidth: 0,
    });
  }

  const police = await doc.embedFont(policeStandard(r.famille, r.gras, r.italique));
  const { texte, remplaces } = adapterTexte(r.texte, police);
  const interligne = r.taille * 1.2;
  const cos = Math.cos(r.angle);
  const sin = Math.sin(r.angle);
  const lignes = texte.split('\n');
  let largeurMax = 0;
  lignes.forEach((ligne, i) => {
    if (!ligne) return;
    largeurMax = Math.max(largeurMax, police.widthOfTextAtSize(ligne, r.taille));
    page.drawText(ligne, {
      x: r.origine[0] + sin * interligne * i,
      y: r.origine[1] - cos * interligne * i,
      size: r.taille,
      font: police,
      color: rgb(...r.couleur),
      rotate: degrees(angleDeg),
    });
  });

  // Zone occupée par le nouveau texte (repère de la ligne), pour pouvoir le retrouver au clic
  let zoneTexte = null;
  if (largeurMax > 0) {
    const bas = (lignes.length - 1) * interligne + r.taille * 0.25;
    zoneTexte = {
      x: r.origine[0] + sin * bas,
      y: r.origine[1] - cos * bas,
      largeur: largeurMax,
      hauteur: (lignes.length - 1) * interligne + r.taille * 1.2,
      angle: r.angle,
    };
  }
  // Flux de dessin créé par pdf-lib pour cette retouche (propriété interne de PDFPage)
  return { remplaces, fluxRef: page.contentStreamRef, zoneTexte };
}
