// Effacement réel du texte d'origine sous les zones retouchées (« version définitive »).
//
// Principe : on lit les instructions de dessin de la page (le « flux de contenu »), on suit
// la position de chaque lettre, et on retire les lettres dont le centre tombe dans une zone.
// Chaque lettre retirée est remplacée par un simple décalage de même largeur : le reste
// de la ligne ne bouge pas. Tout reste vectoriel, le texte conservé reste sélectionnable.
//
// Limites : texte placé dans des blocs imbriqués (« formulaires XObject »), polices à
// encodage rare ou écriture verticale ne sont pas traités. Une vérification après coup
// (voir definitif.js) signale tout texte qui subsisterait.
import {
  PDFName, PDFArray, PDFDict, PDFNumber, PDFRawStream, decodePDFRawStream,
} from 'pdf-lib';
import { Font, Encodings } from '@pdf-lib/standard-fonts';

// ---------- Lecture des flux ----------

/** Contenu décodé (décompressé) d'un flux PDF, sous forme d'octets. */
export function decoderFlux(flux) {
  if (flux instanceof PDFRawStream) return decodePDFRawStream(flux).decode();
  if (typeof flux.getUnencodedContents === 'function') return flux.getUnencodedContents();
  return flux.getContents();
}

export const versLatin1 = (octets) => {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return s;
};
const depuisLatin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

// ---------- Analyse du flux de contenu (découpage en instructions) ----------

const estBlanc = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const estDelimiteur = (c) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d
  || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

/** Lit une chaîne littérale « ( … ) » ; renvoie [octets en latin1, position suivante]. */
function lireChaineLitterale(s, i) {
  let profondeur = 1;
  let resultat = '';
  i++;
  while (i < s.length && profondeur > 0) {
    const c = s[i];
    if (c === '\\') {
      const suivant = s[i + 1];
      const echappements = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (suivant in echappements) {
        resultat += echappements[suivant];
        i += 2;
      } else if (/[0-7]/.test(suivant)) {
        let octal = '';
        i++;
        while (octal.length < 3 && /[0-7]/.test(s[i])) octal += s[i++];
        resultat += String.fromCharCode(parseInt(octal, 8) & 0xff);
      } else if (suivant === '\r' || suivant === '\n') {
        i += 2; // fin de ligne échappée : ignorée
        if (suivant === '\r' && s[i] === '\n') i++;
      } else {
        resultat += suivant ?? '';
        i += 2;
      }
    } else {
      if (c === '(') profondeur++;
      if (c === ')') profondeur--;
      if (profondeur > 0) resultat += c;
      i++;
    }
  }
  return [resultat, i];
}

/** Lit une chaîne hexadécimale « < … > ». */
function lireChaineHexa(s, i) {
  const fin = s.indexOf('>', i);
  const hexa = s.slice(i + 1, fin < 0 ? s.length : fin).replace(/[^0-9a-fA-F]/g, '');
  const complet = hexa.length % 2 ? `${hexa}0` : hexa;
  let resultat = '';
  for (let k = 0; k < complet.length; k += 2) resultat += String.fromCharCode(parseInt(complet.slice(k, k + 2), 16));
  return [resultat, fin < 0 ? s.length : fin + 1];
}

/**
 * Découpe un flux de contenu en instructions { op, operandes, debut, fin }.
 * debut / fin : positions dans la chaîne, pour pouvoir remplacer une instruction.
 */
export function analyserContenu(s) {
  const instructions = [];
  let operandes = [];
  let debut = -1;
  const pile = []; // tableaux et dictionnaires en cours de lecture
  let i = 0;
  const n = s.length;

  const ranger = (valeur) => {
    if (pile.length) pile[pile.length - 1].push(valeur);
    else operandes.push(valeur);
  };

  while (i < n) {
    const c = s.charCodeAt(i);
    if (estBlanc(c)) {
      i++;
      continue;
    }
    if (c === 0x25) { // commentaire
      while (i < n && s[i] !== '\n' && s[i] !== '\r') i++;
      continue;
    }
    const depart = i;
    if (!pile.length && debut < 0) debut = depart;

    if (c === 0x28) {
      const [octets, suite] = lireChaineLitterale(s, i);
      i = suite;
      ranger({ type: 'chaine', octets });
    } else if (c === 0x3c && s[i + 1] === '<') {
      i += 2;
      pile.push([]);
    } else if (c === 0x3e && s[i + 1] === '>') {
      i += 2;
      pile.pop();
      ranger({ type: 'dict' });
    } else if (c === 0x3c) {
      const [octets, suite] = lireChaineHexa(s, i);
      i = suite;
      ranger({ type: 'chaine', octets });
    } else if (c === 0x5b) {
      i++;
      pile.push([]);
    } else if (c === 0x5d) {
      i++;
      const tableau = pile.pop() ?? [];
      ranger(tableau);
    } else if (c === 0x7b || c === 0x7d || c === 0x29 || c === 0x3e) {
      i++; // caractère isolé sans effet ici
    } else if (c === 0x2f) {
      i++;
      const d = i;
      while (i < n && !estBlanc(s.charCodeAt(i)) && !estDelimiteur(s.charCodeAt(i))) i++;
      ranger({ type: 'nom', nom: s.slice(d, i).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) });
    } else {
      const d = i;
      while (i < n && !estBlanc(s.charCodeAt(i)) && !estDelimiteur(s.charCodeAt(i))) i++;
      const mot = s.slice(d, i);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(mot)) {
        ranger(parseFloat(mot));
      } else if (pile.length) {
        ranger({ type: 'mot', mot });
      } else if (mot === 'BI') {
        // Image intégrée : on saute ses données binaires jusqu'à « EI »
        const id = s.slice(i).search(/\sID[\s]/);
        let j = id < 0 ? n : i + id + 4;
        while (j < n) {
          const k = s.indexOf('EI', j);
          if (k < 0) {
            j = n;
            break;
          }
          const avant = s.charCodeAt(k - 1);
          const apres = s.charCodeAt(k + 2);
          if (estBlanc(avant) && (k + 2 >= n || estBlanc(apres) || estDelimiteur(apres))) {
            j = k + 2;
            break;
          }
          j = k + 2;
        }
        i = j;
        instructions.push({ op: 'BI', operandes: [], debut, fin: i });
        operandes = [];
        debut = -1;
      } else {
        instructions.push({ op: mot, operandes, debut, fin: i });
        operandes = [];
        debut = -1;
      }
    }
  }
  return instructions;
}

// ---------- Polices : largeur de chaque caractère ----------

const nombre = (contexte, objet) => {
  const o = contexte.lookup(objet);
  return o instanceof PDFNumber ? o.asNumber() : undefined;
};
const nomPdf = (o) => (o instanceof PDFName ? o.decodeText() : undefined);

const STANDARD = new Set(['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique', 'Helvetica',
  'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Times-Roman', 'Times-Bold', 'Times-Italic',
  'Times-BoldItalic', 'Symbol', 'ZapfDingbats']);

let tableWinAnsi = null;
function codesWinAnsi() {
  if (!tableWinAnsi) {
    tableWinAnsi = [];
    for (const cp of Encodings.WinAnsi.supportedCodePoints) {
      const { code, name } = Encodings.WinAnsi.encodeUnicodeCodePoint(cp);
      tableWinAnsi[code] = name;
    }
  }
  return tableWinAnsi;
}

/**
 * Informations sur une police de la page.
 * @returns {{ gere: boolean, raison?: string, octets: 1|2, largeur: (code: number) => number, espaceMot: boolean }}
 */
export function lirePolice(contexte, dictPolice, nomRessource) {
  if (!(dictPolice instanceof PDFDict)) return { gere: false, raison: `police ${nomRessource} introuvable` };
  const type = nomPdf(dictPolice.lookup(PDFName.of('Subtype')));

  if (type === 'Type0') {
    const encodage = nomPdf(dictPolice.lookup(PDFName.of('Encoding')));
    if (encodage !== 'Identity-H') return { gere: false, raison: `encodage ${encodage ?? 'personnalisé'}` };
    const descendants = dictPolice.lookup(PDFName.of('DescendantFonts'), PDFArray);
    const cid = descendants && contexte.lookup(descendants.get(0));
    if (!(cid instanceof PDFDict)) return { gere: false, raison: 'police composite incomplète' };
    const defaut = nombre(contexte, cid.get(PDFName.of('DW'))) ?? 1000;
    const largeurs = new Map();
    const w = cid.lookup(PDFName.of('W'));
    if (w instanceof PDFArray) {
      const elements = w.asArray().map((e) => contexte.lookup(e));
      for (let k = 0; k < elements.length;) {
        const premier = elements[k] instanceof PDFNumber ? elements[k].asNumber() : 0;
        const suivant = elements[k + 1];
        if (suivant instanceof PDFArray) {
          suivant.asArray().forEach((v, j) => largeurs.set(premier + j, nombre(contexte, v) ?? defaut));
          k += 2;
        } else {
          const dernier = suivant instanceof PDFNumber ? suivant.asNumber() : premier;
          const valeur = nombre(contexte, elements[k + 2]) ?? defaut;
          for (let code = premier; code <= dernier && code - premier < 65536; code++) largeurs.set(code, valeur);
          k += 3;
        }
      }
    }
    return {
      gere: true, octets: 2, largeur: (code) => (largeurs.get(code) ?? defaut) / 1000, espaceMot: false, existe: (code) => largeurs.has(code),
    };
  }

  // Polices simples (1 octet par caractère)
  const premier = nombre(contexte, dictPolice.get(PDFName.of('FirstChar'))) ?? 0;
  const tableau = dictPolice.lookup(PDFName.of('Widths'));
  let echelle = 1 / 1000;
  if (type === 'Type3') {
    const matrice = dictPolice.lookup(PDFName.of('FontMatrix'), PDFArray);
    echelle = matrice ? (nombre(contexte, matrice.get(0)) ?? 0.001) : 0.001;
  }
  const descripteur = dictPolice.lookup(PDFName.of('FontDescriptor'));
  const manquante = descripteur instanceof PDFDict ? (nombre(contexte, descripteur.get(PDFName.of('MissingWidth'))) ?? 0) : 0;

  if (tableau instanceof PDFArray) {
    const valeurs = tableau.asArray().map((v) => nombre(contexte, v) ?? manquante);
    return {
      gere: true,
      octets: 1,
      largeur: (code) => (valeurs[code - premier] ?? manquante) * echelle,
      espaceMot: true,
      existe: (code) => (valeurs[code - premier] ?? 0) > 0,
    };
  }

  // Pas de tableau de largeurs : police standard (Helvetica, Times…), largeurs connues
  const nomBase = (nomPdf(dictPolice.lookup(PDFName.of('BaseFont'))) ?? '').replace(/^[A-Z]{6}\+/, '');
  if (!STANDARD.has(nomBase)) return { gere: false, raison: `largeurs inconnues (${nomBase || 'police sans nom'})` };
  const metriques = Font.load(nomBase);
  const noms = [];
  const encodage = dictPolice.lookup(PDFName.of('Encoding'));
  const nomEncodage = encodage instanceof PDFDict ? nomPdf(encodage.lookup(PDFName.of('BaseEncoding'))) : nomPdf(encodage);
  if (nomEncodage === 'WinAnsiEncoding' || nomEncodage === 'MacRomanEncoding') {
    codesWinAnsi().forEach((nom, code) => { noms[code] = nom; });
  } else {
    for (const m of metriques.CharMetrics) if (m.C >= 0) noms[m.C] = m.N;
  }
  const differences = encodage instanceof PDFDict ? encodage.lookup(PDFName.of('Differences'), PDFArray) : null;
  if (differences) {
    let code = 0;
    for (const e of differences.asArray()) {
      const v = contexte.lookup(e);
      if (v instanceof PDFNumber) code = v.asNumber();
      else if (v instanceof PDFName) noms[code++] = v.decodeText();
    }
  }
  return {
    gere: true,
    octets: 1,
    largeur: (code) => (metriques.getWidthOfGlyph(noms[code] ?? '') ?? 500) / 1000,
    espaceMot: true,
    existe: (code) => Boolean(noms[code]) && metriques.getWidthOfGlyph(noms[code]) !== undefined,
  };
}

// ---------- Géométrie ----------

const multiplier = (m, p) => [
  m[0] * p[0] + m[1] * p[2], m[0] * p[1] + m[1] * p[3],
  m[2] * p[0] + m[3] * p[2], m[2] * p[1] + m[3] * p[3],
  m[4] * p[0] + m[5] * p[2] + p[4], m[4] * p[1] + m[5] * p[3] + p[5],
];
const appliquer = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Le point (coordonnées PDF) est-il dans la zone {x, y, largeur, hauteur, angle} ? */
export function dansZone(zone, px, py) {
  const cos = Math.cos(zone.angle || 0);
  const sin = Math.sin(zone.angle || 0);
  const dx = px - zone.x;
  const dy = py - zone.y;
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  return u >= 0 && u <= zone.largeur && v >= 0 && v <= zone.hauteur;
}

const ecrireNombre = (v) => String(Math.round(v * 1000) / 1000);
const versHexa = (codes, octets) => `<${codes.map((c) => c.toString(16).padStart(octets * 2, '0')).join('')}>`;

// ---------- Parcours des lettres de la page ----------

/**
 * Retire de la page les lettres dont le centre est dans l'une des zones.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {import('pdf-lib').PDFPage} page
 * @param {Array<{x,y,largeur,hauteur,angle}>} zones zones à vider (coordonnées PDF)
 * @param {Set<import('pdf-lib').PDFRef>} fluxProteges flux à ne pas toucher (les retouches elles-mêmes)
 * @returns {{ lettres: number, policesNonGerees: string[], blocsIgnores: number }}
 */
export function effacerTexteSousZones(doc, page, zones, fluxProteges) {
  if (!zones.length) return { lettres: 0, policesNonGerees: [], blocsIgnores: 0 };
  return parcourirTexte(doc, page, {
    fluxProteges,
    decider: (lettre) => zones.some((z) => dansZone(z, lettre.cx, lettre.cy)),
  });
}

/**
 * Polices utilisées par les lettres d'une zone, de la plus fréquente à la moins fréquente.
 * @returns {Array<{ nomRessource: string, ref: number[]|null, nomBase: string, taille: number, th: number, lettres: number }>}
 */
export function policesSousZone(doc, page, zone, fluxProteges = new Set()) {
  const comptes = new Map();
  parcourirTexte(doc, page, {
    fluxProteges,
    decider: (lettre) => {
      if (dansZone(zone, lettre.cx, lettre.cy)) {
        const c = comptes.get(lettre.police) ?? { ...lettre.infosPolice, nomRessource: lettre.police, taille: lettre.taille, th: lettre.th, lettres: 0 };
        c.lettres++;
        comptes.set(lettre.police, c);
      }
      return false; // on ne modifie rien
    },
  });
  return [...comptes.values()].sort((a, b) => b.lettres - a.lettres);
}

/**
 * Parcourt toutes les lettres de la page en suivant leur position.
 * `decider(lettre)` renvoie true pour retirer la lettre (elle est remplacée par un décalage).
 */
function parcourirTexte(doc, page, { fluxProteges = new Set(), decider }) {
  const contexte = doc.context;
  const rapport = { lettres: 0, policesNonGerees: new Set(), blocsIgnores: 0 };
  page.node.normalize();
  const contenus = page.node.Contents();
  if (!(contenus instanceof PDFArray)) return { ...rapport, policesNonGerees: [] };
  const ressources = page.node.Resources();
  const dictPolices = ressources?.lookup(PDFName.of('Font'));
  const dictXObjets = ressources?.lookup(PDFName.of('XObject'));
  const polices = new Map();
  const police = (nom) => {
    if (!polices.has(nom)) {
      const brut = dictPolices instanceof PDFDict ? dictPolices.get(PDFName.of(nom)) : undefined;
      const dict = brut ? contexte.lookup(brut) : undefined;
      const infos = lirePolice(contexte, dict, nom);
      infos.infosPolice = {
        ref: brut && typeof brut.objectNumber === 'number' ? [brut.objectNumber, brut.generationNumber] : null,
        nomBase: dict instanceof PDFDict ? (nomPdf(dict.lookup(PDFName.of('BaseFont'))) ?? '').replace(/^[A-Z]{6}\+/, '') : '',
      };
      polices.set(nom, infos);
    }
    return polices.get(nom);
  };

  // État graphique et état du texte (sauvegardés par q / Q)
  let etatG = { ctm: [1, 0, 0, 1, 0, 0], tc: 0, tw: 0, th: 1, tl: 0, police: null, tfs: 0, ts: 0 };
  const pile = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];

  /** Affiche une chaîne ; renvoie les éléments réécrits (ou null si rien n'est retiré). */
  const montrer = (elements, effacer) => {
    const p = etatG.police ? police(etatG.police) : null;
    const sortie = [];
    let retire = false;
    let enCours = [];
    const viderEnCours = () => {
      if (enCours.length) sortie.push(versHexa(enCours, p.octets));
      enCours = [];
    };
    const ajouterDecalage = (v) => {
      viderEnCours();
      const dernier = sortie[sortie.length - 1];
      if (typeof dernier === 'number') sortie[sortie.length - 1] = dernier + v;
      else sortie.push(v);
    };
    for (const element of elements) {
      if (typeof element === 'number') {
        tm = multiplier([1, 0, 0, 1, (-element / 1000) * etatG.tfs * etatG.th, 0], tm);
        if (p?.gere) ajouterDecalage(element);
        continue;
      }
      if (element?.type !== 'chaine') continue;
      if (!p?.gere) {
        if (p?.raison && effacer) rapport.policesNonGerees.add(p.raison);
        return null; // police inconnue : on ne peut pas suivre la position des lettres
      }
      const octets = element.octets;
      for (let k = 0; k + p.octets <= octets.length; k += p.octets) {
        const code = p.octets === 2 ? (octets.charCodeAt(k) << 8) | octets.charCodeAt(k + 1) : octets.charCodeAt(k);
        const w0 = p.largeur(code);
        const espace = p.espaceMot && p.octets === 1 && code === 32 ? etatG.tw : 0;
        const trm = multiplier([etatG.tfs * etatG.th, 0, 0, etatG.tfs, 0, etatG.ts], multiplier(tm, etatG.ctm));
        const [cx, cy] = appliquer(trm, w0 / 2, 0.3);
        const avance = (w0 * etatG.tfs + etatG.tc + espace) * etatG.th;
        const taille = Math.hypot(trm[2], trm[3]);
        const lettre = {
          cx, cy, code, police: etatG.police, infosPolice: p.infosPolice, taille, th: taille ? Math.hypot(trm[0], trm[1]) / taille : 1,
        };
        if (effacer && etatG.tfs && decider(lettre)) {
          retire = true;
          rapport.lettres++;
          // La lettre est remplacée par un décalage de même largeur
          ajouterDecalage(-((w0 * etatG.tfs + etatG.tc + espace) * 1000) / etatG.tfs);
        } else {
          enCours.push(code);
        }
        tm = multiplier([1, 0, 0, 1, avance, 0], tm);
      }
    }
    viderEnCours();
    return retire ? sortie : null;
  };

  const tableauTJ = (sortie) => `[${sortie.map((e) => (typeof e === 'number' ? ecrireNombre(e) : e)).join(' ')}] TJ`;

  const refs = contenus.asArray();
  refs.forEach((ref, index) => {
    const flux = contexte.lookup(ref);
    if (!flux) return;
    const s = versLatin1(decoderFlux(flux));
    const instructions = analyserContenu(s);
    const remplacements = [];
    const protege = fluxProteges.has(ref);

    for (const { op, operandes: o, debut, fin } of instructions) {
      switch (op) {
        case 'q': pile.push({ ...etatG }); break;
        case 'Q': if (pile.length) etatG = pile.pop(); break;
        case 'cm': if (o.length === 6) etatG.ctm = multiplier(o, etatG.ctm); break;
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
        case 'Tc': etatG.tc = o[0] ?? 0; break;
        case 'Tw': etatG.tw = o[0] ?? 0; break;
        case 'Tz': etatG.th = (o[0] ?? 100) / 100; break;
        case 'TL': etatG.tl = o[0] ?? 0; break;
        case 'Ts': etatG.ts = o[0] ?? 0; break;
        case 'Tf': etatG.police = o[0]?.nom ?? null; etatG.tfs = o[1] ?? 0; break;
        case 'Tm': if (o.length === 6) { tm = [...o]; tlm = [...o]; } break;
        case 'Td': tlm = multiplier([1, 0, 0, 1, o[0] ?? 0, o[1] ?? 0], tlm); tm = [...tlm]; break;
        case 'TD': etatG.tl = -(o[1] ?? 0); tlm = multiplier([1, 0, 0, 1, o[0] ?? 0, o[1] ?? 0], tlm); tm = [...tlm]; break;
        case 'T*': tlm = multiplier([1, 0, 0, 1, 0, -etatG.tl], tlm); tm = [...tlm]; break;
        case 'Tj':
        case 'TJ':
        case "'":
        case '"': {
          let prefixe = '';
          if (op === '"') {
            etatG.tw = o[0] ?? 0;
            etatG.tc = o[1] ?? 0;
            prefixe = `${ecrireNombre(etatG.tw)} Tw ${ecrireNombre(etatG.tc)} Tc `;
          }
          if (op === "'" || op === '"') {
            tlm = multiplier([1, 0, 0, 1, 0, -etatG.tl], tlm);
            tm = [...tlm];
            prefixe += 'T* ';
          }
          const elements = op === 'TJ' ? (Array.isArray(o[0]) ? o[0] : []) : [o[o.length - 1]];
          const sortie = montrer(elements, !protege);
          if (sortie) remplacements.push({ debut, fin, texte: prefixe + tableauTJ(sortie) });
          break;
        }
        case 'Do': {
          const xobjet = dictXObjets instanceof PDFDict && o[0]?.nom ? dictXObjets.lookup(PDFName.of(o[0].nom)) : null;
          if (xobjet && nomPdf(xobjet.dict?.lookup(PDFName.of('Subtype'))) === 'Form') rapport.blocsIgnores++;
          break;
        }
        default:
      }
    }

    if (remplacements.length) {
      let nouveau = '';
      let position = 0;
      for (const r of remplacements) {
        nouveau += `${s.slice(position, r.debut)}${r.texte}`;
        position = r.fin;
      }
      nouveau += s.slice(position);
      // Nouveau flux (l'ancien peut être partagé avec d'autres pages : on ne le modifie pas)
      contenus.set(index, contexte.register(contexte.flateStream(depuisLatin1(nouveau))));
    }
  });

  return { lettres: rapport.lettres, policesNonGerees: [...rapport.policesNonGerees], blocsIgnores: rapport.blocsIgnores };
}
