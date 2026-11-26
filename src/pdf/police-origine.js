// Réutilisation de la police d'origine du PDF pour écrire le nouveau texte.
//
// Un PDF contient le dessin des lettres de ses polices (police « intégrée »), mais en général
// seulement des lettres réellement utilisées dans le document (« sous-ensemble »).
// On retrouve, pour chaque lettre tapée, le code correspondant dans la police d'origine grâce
// à sa table de correspondance (ToUnicode). Si une lettre n'existe pas dans la police intégrée,
// on le signale : elle ne peut pas être écrite à l'identique.
import {
  PDFName, PDFDict, PDFRef, PDFOperator, PDFNumber, PDFHexString, rgb, setFillingColor,
} from 'pdf-lib';
import { lirePolice, decoderFlux, versLatin1 } from './effacer-texte.js';
import { Encodings } from '@pdf-lib/standard-fonts';

const nomPdf = (o) => (o instanceof PDFName ? o.decodeText() : undefined);

/** Convertit un nombre hexadécimal UTF-16BE (« 00E9 ») en texte. */
function hexaVersTexte(hexa) {
  const unites = [];
  for (let i = 0; i + 4 <= hexa.length; i += 4) unites.push(parseInt(hexa.slice(i, i + 4), 16));
  if (hexa.length === 2) unites.push(parseInt(hexa, 16));
  return String.fromCharCode(...unites);
}

/** Lit une table ToUnicode : renvoie Map(texte -> code). */
function lireToUnicode(contexte, dictPolice) {
  const table = new Map();
  const flux = dictPolice.lookup(PDFName.of('ToUnicode'));
  if (!flux || flux instanceof PDFName) return table;
  let s;
  try {
    s = versLatin1(decoderFlux(flux));
  } catch {
    return table;
  }
  const ajouter = (texte, code) => {
    if (texte && !table.has(texte)) table.set(texte, code);
  };
  for (const bloc of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      ajouter(hexaVersTexte(m[2]), parseInt(m[1], 16));
    }
  }
  for (const bloc of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const bas = parseInt(m[1], 16);
      const haut = parseInt(m[2], 16);
      if (haut - bas > 65535) continue;
      if (m[3].startsWith('[')) {
        [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((d, k) => ajouter(hexaVersTexte(d[1]), bas + k));
      } else {
        const depart = m[3].slice(1, -1);
        const base = parseInt(depart.slice(-4), 16);
        const prefixe = depart.slice(0, -4);
        for (let code = bas; code <= haut; code++) {
          ajouter(hexaVersTexte(prefixe + (base + code - bas).toString(16).padStart(4, '0')), code);
        }
      }
    }
  }
  return table;
}

/**
 * Prépare l'écriture avec une police du PDF.
 * @returns {null | { nom: string, octets: 1|2, largeur: (code:number)=>number,
 *   encoder: (texte: string) => { codes: Array<number|'espace'>, manquants: string[] } }}
 */
export function encodeurPolice(contexte, ref) {
  const dict = contexte.lookup(ref instanceof PDFRef ? ref : PDFRef.of(ref[0], ref[1]));
  if (!(dict instanceof PDFDict)) return null;
  const infos = lirePolice(contexte, dict, 'origine');
  if (!infos.gere) return null;
  const table = lireToUnicode(contexte, dict);
  // Sans table ToUnicode : police simple en WinAnsi (cas courant des PDF anciens)
  if (!table.size && infos.octets === 1) {
    const encodage = dict.lookup(PDFName.of('Encoding'));
    const nomEncodage = encodage instanceof PDFDict ? nomPdf(encodage.lookup(PDFName.of('BaseEncoding'))) : nomPdf(encodage);
    if (nomEncodage === 'WinAnsiEncoding' || !nomEncodage) {
      for (const cp of Encodings.WinAnsi.supportedCodePoints) {
        table.set(String.fromCodePoint(cp), Encodings.WinAnsi.encodeUnicodeCodePoint(cp).code);
      }
    }
  }
  if (!table.size) return null;
  const nom = (nomPdf(dict.lookup(PDFName.of('BaseFont'))) ?? 'police du document').replace(/^[A-Z]{6}\+/, '');

  const encoder = (texte) => {
    const codes = [];
    const manquants = new Set();
    for (const caractere of texte.normalize('NFC')) {
      const code = table.get(caractere);
      // Police composite : la table ToUnicode ne liste que les lettres intégrées (leur largeur peut être
      // omise quand elle vaut la largeur par défaut). Police simple : la largeur doit être définie.
      if (code !== undefined && (infos.octets === 2 || infos.existe(code))) {
        codes.push(code);
      } else if (caractere === ' ' || caractere === ' ') {
        codes.push('espace'); // espace absente de la police : remplacée par un simple décalage
      } else {
        manquants.add(caractere);
      }
    }
    return { codes, manquants: [...manquants] };
  };
  return { nom, octets: infos.octets, largeur: infos.largeur, encoder };
}

/** Largeur (en points) d'une ligne déjà encodée. */
function largeurLigne(encodeur, codes, taille, th) {
  return codes.reduce((somme, c) => somme + (c === 'espace' ? 0.25 : encodeur.largeur(c)), 0) * taille * th;
}

const nombre = (v) => PDFNumber.of(Math.round(v * 10000) / 10000);

/**
 * Écrit du texte sur la page avec la police d'origine.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {import('pdf-lib').PDFPage} page
 * @param {{ ref: number[], th?: number }} policeOrigine
 * @returns {{ largeurMax: number }} ou lève une erreur si des lettres manquent
 */
export function ecrireAvecPoliceOrigine(doc, page, policeOrigine, {
  texte, origine, angle, taille, couleur, interligne,
}) {
  const encodeur = encodeurPolice(doc.context, policeOrigine.ref);
  if (!encodeur) throw new Error('La police d\'origine ne peut pas être réutilisée pour ce texte.');
  const lignes = texte.split('\n').map((l) => encodeur.encoder(l));
  const manquants = [...new Set(lignes.flatMap((l) => l.manquants))];
  if (manquants.length) {
    throw new Error(`Lettres absentes de la police d'origine : ${manquants.join(' ')}. Choisissez une autre police.`);
  }
  // La police est ajoutée aux ressources de la page sous un nom à nous (elle peut venir d'un bloc imbriqué)
  const ref = PDFRef.of(policeOrigine.ref[0], policeOrigine.ref[1]);
  const cle = page.node.newFontDictionary('NicoOrigine', ref);
  const th = policeOrigine.th || 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const op = (nomOp, ...args) => PDFOperator.of(nomOp, args);
  const operations = [
    op('q'),
    setFillingColor(rgb(...couleur)),
    op('BT'),
    op('Tf', cle, nombre(taille)),
    op('Tz', nombre(th * 100)),
  ];
  let largeurMax = 0;
  lignes.forEach(({ codes }, i) => {
    if (!codes.length) return;
    largeurMax = Math.max(largeurMax, largeurLigne(encodeur, codes, taille, th));
    const x = origine[0] + sin * interligne * i;
    const y = origine[1] - cos * interligne * i;
    operations.push(op('Tm', nombre(cos), nombre(sin), nombre(-sin), nombre(cos), nombre(x), nombre(y)));
    // Les lettres sont écrites en hexadécimal ; une espace absente devient un décalage
    const elements = [];
    let enCours = '';
    for (const c of codes) {
      if (c === 'espace') {
        if (enCours) elements.push(PDFHexString.of(enCours));
        enCours = '';
        elements.push(PDFNumber.of(-250));
      } else {
        enCours += c.toString(16).padStart(encodeur.octets * 2, '0');
      }
    }
    if (enCours) elements.push(PDFHexString.of(enCours));
    operations.push(op('TJ', doc.context.obj(elements)));
  });
  operations.push(op('ET'), op('Q'));
  page.pushOperators(...operations);
  return { largeurMax };
}
