// Génère les 3 PDF de test dans tests/fixtures/ :
//   1. texte-simple.pdf   : 2 pages de texte, comme un document Word simple
//   2. signets.pdf        : 12 pages avec des signets en arborescence
//   3. scan.pdf           : 2 pages « scannées » (images, aucun texte sélectionnable)
// Les fichiers sont déjà fournis dans le dépôt ; ce script sert seulement à les recréer.
// Le PDF scanné nécessite Playwright (navigateur automatisé), utilisé pour dessiner l'image.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  PDFDocument, StandardFonts, rgb, PDFName, PDFHexString, PDFNumber, PDFNull,
} from 'pdf-lib';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'tests', 'fixtures');
mkdirSync(dossier, { recursive: true });

const LOREM = [
  'Le présent document décrit le projet de réhabilitation d\'un immeuble de bureaux',
  'situé à Bordeaux. Les façades côté rue sont conservées ; la toiture est reprise',
  'entièrement, avec une isolation par l\'extérieur et des menuiseries à rupture de',
  'pont thermique. Les études BIM sont menées dans Archicad, puis contrôlées dans',
  'Solibri avant chaque échange avec le bureau d\'études structure.',
];

/** Écrit un paragraphe ligne par ligne et renvoie la nouvelle ordonnée. */
function paragraphe(page, police, lignes, x, y, taille = 11) {
  for (const ligne of lignes) {
    page.drawText(ligne, { x, y, size: taille, font: police, color: rgb(0.1, 0.1, 0.1) });
    y -= taille * 1.45;
  }
  return y - taille;
}

// ---------- 1. Texte simple ----------
async function texteSimple() {
  const doc = await PDFDocument.create();
  doc.setTitle('Notice de test — texte simple');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const times = await doc.embedFont(StandardFonts.TimesRoman);

  let page = doc.addPage([595.28, 841.89]); // A4 en points
  let y = 780;
  page.drawText('Notice descriptive — Projet Garonne', { x: 60, y, size: 20, font: gras, color: rgb(0.05, 0.2, 0.45) });
  y -= 40;
  y = paragraphe(page, normal, LOREM, 60, y);
  page.drawText('1. Contexte', { x: 60, y, size: 14, font: gras });
  y -= 24;
  y = paragraphe(page, times, [
    'Le bâtiment, construit en 1972, présente une structure poteaux-poutres en béton',
    'armé. Les planchers sont conservés. Coût prévisionnel : 1 250 000 € HT.',
    'Mots à chercher : Élévation, élévation, ELEVATION (recherche sans accents).',
  ], 60, y, 12);
  page.drawText('Texte en rouge pour tester la couleur de la retouche.', { x: 60, y, size: 12, font: normal, color: rgb(0.8, 0.1, 0.1) });
  y -= 30;
  page.drawRectangle({ x: 55, y: y - 8, width: 300, height: 26, color: rgb(1, 0.95, 0.75) });
  page.drawText('Texte sur fond jaune (retouche).', { x: 60, y, size: 12, font: normal });

  page = doc.addPage([595.28, 841.89]);
  y = 780;
  page.drawText('2. Programme', { x: 60, y, size: 14, font: gras });
  y -= 24;
  y = paragraphe(page, normal, [...LOREM].reverse(), 60, y);
  paragraphe(page, normal, ['Fin du document de test. Accents : à â ç é è ê ë î ï ô ù û ü ÿ œ « » €'], 60, y);
  return doc.save();
}

// ---------- 2. Plusieurs pages avec signets ----------
/** Crée un signet (entrée d'arborescence) et ses enfants, renvoie sa référence. */
function creerSignets(doc, parentRef, entrees, pages) {
  const ctx = doc.context;
  const refs = entrees.map(() => ctx.nextRef());
  entrees.forEach((entree, i) => {
    const dict = ctx.obj({});
    dict.set(PDFName.of('Title'), PDFHexString.fromText(entree.titre));
    dict.set(PDFName.of('Parent'), parentRef);
    const pageRef = pages[entree.page - 1].ref;
    dict.set(PDFName.of('Dest'), ctx.obj([pageRef, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]));
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < entrees.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
    if (entree.enfants?.length) {
      const enfants = creerSignets(doc, refs[i], entree.enfants, pages);
      dict.set(PDFName.of('First'), enfants[0]);
      dict.set(PDFName.of('Last'), enfants[enfants.length - 1]);
      dict.set(PDFName.of('Count'), PDFNumber.of(entree.enfants.length));
    }
    ctx.assign(refs[i], dict);
  });
  return refs;
}

async function signets() {
  const doc = await PDFDocument.create();
  doc.setTitle('Dossier de test — signets');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const couleurs = [rgb(0.85, 0.92, 1), rgb(0.9, 1, 0.88), rgb(1, 0.93, 0.85)];
  const pages = [];
  for (let n = 1; n <= 12; n++) {
    // La page 7 est en paysage pour tester les formats mixtes.
    const page = doc.addPage(n === 7 ? [841.89, 595.28] : [595.28, 841.89]);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 120, width, height: 120, color: couleurs[n % 3] });
    page.drawText(`Page ${n}`, { x: 50, y: height - 80, size: 36, font: gras });
    page.drawText(`Chapitre ${Math.ceil(n / 4)} — section ${((n - 1) % 4) + 1}`, { x: 50, y: height - 160, size: 16, font: normal });
    paragraphe(page, normal, LOREM, 50, height - 200);
    page.drawText(String(n), { x: width / 2 - 5, y: 30, size: 10, font: normal });
    pages.push(page);
  }
  const arbre = [
    { titre: 'Chapitre 1 — Diagnostic', page: 1, enfants: [
      { titre: '1.1 État des lieux', page: 2 },
      { titre: '1.2 Relevés', page: 3 },
      { titre: '1.3 Pathologies', page: 4 },
    ] },
    { titre: 'Chapitre 2 — Projet', page: 5, enfants: [
      { titre: '2.1 Plans (page paysage)', page: 7 },
      { titre: '2.2 Coupes', page: 8, enfants: [{ titre: '2.2.1 Coupe AA', page: 8 }] },
    ] },
    { titre: 'Chapitre 3 — Annexes', page: 9 },
    { titre: 'Dernière page', page: 12 },
  ];
  const racineRef = doc.context.nextRef();
  const premiers = creerSignets(doc, racineRef, arbre, pages);
  doc.context.assign(racineRef, doc.context.obj({
    Type: 'Outlines',
    First: premiers[0],
    Last: premiers[premiers.length - 1],
    Count: PDFNumber.of(arbre.length),
  }));
  doc.catalog.set(PDFName.of('Outlines'), racineRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  return doc.save();
}

// ---------- 3. PDF scanné ----------
async function scan() {
  const require = createRequire(import.meta.url);
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.warn('Playwright absent : scan.pdf non régénéré.');
    return null;
  }
  const navigateur = await playwright.chromium.launch();
  const page = await navigateur.newPage({ viewport: { width: 1240, height: 1754 } });
  const doc = await PDFDocument.create();
  doc.setTitle('Courrier scanné — test OCR');
  const textes = [
    ['Courrier scanné', 'Madame, Monsieur,', 'Nous vous confirmons la réception des plans de la façade Est.',
      'La réunion de synthèse BIM aura lieu jeudi à Bordeaux.', 'Le mot TEST-OCR doit être trouvé après la reconnaissance.',
      'Veuillez agréer nos salutations distinguées.'],
    ['Page 2 du scan', 'Liste des pièces jointes :', '— plan du rez-de-chaussée', '— coupe longitudinale', '— notice de sécurité incendie'],
  ];
  for (const lignes of textes) {
    // Image A4 à 150 dpi, légèrement grisée et inclinée comme un vrai scan.
    await page.setContent(`<body style="margin:0;background:#f3f1ea">
      <div style="padding:140px 120px;font:34px/1.6 Georgia,serif;color:#222;transform:rotate(-0.6deg)">
        <h1 style="font-size:56px">${lignes[0]}</h1>${lignes.slice(1).map((l) => `<p>${l}</p>`).join('')}
      </div></body>`);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    const image = await doc.embedJpg(jpg);
    const p = doc.addPage([595.28, 841.89]);
    p.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  await navigateur.close();
  return doc.save();
}

const fichiers = [
  ['texte-simple.pdf', await texteSimple()],
  ['signets.pdf', await signets()],
  ['scan.pdf', await scan()],
];
for (const [nom, octets] of fichiers) {
  if (!octets) continue;
  writeFileSync(join(dossier, nom), octets);
  console.log(`✓ tests/fixtures/${nom} (${Math.round(octets.length / 1024)} Ko)`);
}
