// Recherche de texte dans tout le document, insensible à la casse et aux accents.
// Chaque résultat donne la page et les rectangles à surligner (en coordonnées PDF).

const cache = new Map(); // page -> { items, texte, carte }

/** Supprime les accents et met en minuscules (« Élévation » -> « elevation »). */
export function normaliser(texte) {
  return texte.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Oublie le texte mémorisé (à appeler quand le document change). */
export function viderCacheRecherche() {
  cache.clear();
}

/** Texte de la page, déjà normalisé, avec une « carte » qui relie chaque caractère à son morceau d'origine. */
export async function textePage(pdf, n) {
  if (cache.has(n)) return cache.get(n);
  const page = await pdf.getPage(n);
  const contenu = await page.getTextContent();
  const items = contenu.items.filter((item) => 'str' in item);
  let texte = '';
  const carte = []; // pour chaque caractère du texte : [index du morceau, position dans le morceau]
  const ajouter = (caractere, item, position) => {
    if (/\s/.test(caractere)) {
      if (texte.endsWith(' ') || texte === '') return;
      caractere = ' ';
    }
    texte += caractere;
    carte.push([item, position]);
  };
  items.forEach((item, i) => {
    for (let j = 0; j < item.str.length; j++) {
      for (const c of normaliser(item.str[j])) ajouter(c, i, j);
    }
    if (item.hasEOL) ajouter(' ', -1, -1);
  });
  const resultat = { items, texte, carte, styles: contenu.styles };
  cache.set(n, resultat);
  return resultat;
}

// Mesure approximative de la largeur des caractères, pour placer le surlignage
// au plus près des lettres (la police exacte du PDF n'est pas connue ici).
let contexteMesure = null;
function fractionLargeur(texte, position, famille) {
  if (position <= 0) return 0;
  if (position >= texte.length) return 1;
  contexteMesure ??= new OffscreenCanvas(1, 1).getContext('2d');
  contexteMesure.font = `100px ${famille || 'sans-serif'}`;
  const total = contexteMesure.measureText(texte).width;
  if (!total) return position / texte.length;
  return contexteMesure.measureText(texte.slice(0, position)).width / total;
}

/**
 * Rectangle (coordonnées PDF) couvrant les caractères [debut, fin[ d'un morceau de texte.
 * Gère le texte tourné en suivant la direction de la ligne.
 * @param {string} [famille] famille de police générique (serif, sans-serif, monospace)
 */
export function rectangleCaracteres(item, debut, fin, famille) {
  const [a, b, c, d, e, f] = item.transform;
  const normeU = Math.hypot(a, b) || 1;
  const hauteur = item.height || Math.hypot(c, d) || normeU;
  const ux = a / normeU;
  const uy = b / normeU; // direction de la ligne
  const vx = -uy;
  const vy = ux; // direction « vers le haut » de la ligne
  const s0 = item.width * fractionLargeur(item.str, debut, famille);
  const s1 = item.width * fractionLargeur(item.str, fin, famille);
  const bas = -0.22 * hauteur;
  const haut = 0.9 * hauteur;
  const points = [
    [e + ux * s0 + vx * bas, f + uy * s0 + vy * bas],
    [e + ux * s1 + vx * bas, f + uy * s1 + vy * bas],
    [e + ux * s0 + vx * haut, f + uy * s0 + vy * haut],
    [e + ux * s1 + vx * haut, f + uy * s1 + vy * haut],
  ];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Cherche une expression dans tout le document.
 * @param {object} pdf document PDF.js
 * @param {string} requete texte cherché
 * @param {{ signal?: {annule: boolean}, progression?: (n: number) => void }} options
 * @returns {Promise<Array<{page: number, rects: number[][]}>>}
 */
export async function rechercher(pdf, requete, { signal, progression } = {}) {
  const cherche = normaliser(requete).replace(/\s+/g, ' ').trim();
  const resultats = [];
  if (!cherche) return resultats;
  for (let n = 1; n <= pdf.numPages; n++) {
    if (signal?.annule) return resultats;
    const { items, texte, carte, styles } = await textePage(pdf, n);
    let position = texte.indexOf(cherche);
    while (position !== -1) {
      resultats.push({ page: n, rects: rectanglesCorrespondance(items, styles, carte, position, cherche.length) });
      position = texte.indexOf(cherche, position + cherche.length);
    }
    progression?.(n);
  }
  return resultats;
}

/** Regroupe les caractères trouvés par morceau de texte et calcule un rectangle par morceau. */
function rectanglesCorrespondance(items, styles, carte, debut, longueur) {
  const groupes = new Map(); // index du morceau -> [premier caractère, dernier caractère]
  for (let k = debut; k < debut + longueur; k++) {
    const [i, j] = carte[k];
    if (i < 0) continue;
    const g = groupes.get(i);
    if (g) g[1] = Math.max(g[1], j);
    else groupes.set(i, [j, j]);
  }
  return [...groupes].map(([i, [j0, j1]]) => rectangleCaracteres(items[i], j0, j1 + 1, styles[items[i].fontName]?.fontFamily));
}
