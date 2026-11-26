// « Enregistrer en version définitive » : fige les retouches et retire réellement
// l'ancien texte qui se trouvait sous chaque recouvrement.
// Le résultat est vérifié : on relit le fichier produit pour s'assurer qu'il ne reste
// plus de texte d'origine dans les zones retouchées.
import { ouvrirAvecPdfLib } from './pages.js';
import { lireRetouches, ecrireRetouches, fluxDesRetouches, effacerDessinRetouche } from './retouches.js';
import { effacerTexteSousZones, dansZone } from './effacer-texte.js';
import { chargerPdf } from './loader.js';
import { rectangleCaracteres } from './search.js';

/**
 * Crée la version définitive d'un PDF.
 * @param {Uint8Array} octets document modifiable (avec ses retouches mémorisées)
 * @returns {Promise<{ octets: Uint8Array, nbRetouches: number, lettres: number,
 *   restes: Array<{page: number, texte: string}>, explications: string[] }>}
 */
export async function creerVersionDefinitive(octets) {
  const doc = await ouvrirAvecPdfLib(octets);
  const retouches = lireRetouches(doc);
  const proteges = fluxDesRetouches(retouches);
  const explications = new Set();
  let lettres = 0;

  // 1. Effacement page par page (seulement les retouches qui recouvrent un texte)
  const parPage = new Map();
  for (const r of retouches) {
    if (!r.recouvrement) continue;
    if (!parPage.has(r.page)) parPage.set(r.page, []);
    parPage.get(r.page).push(r.recouvrement);
  }
  for (const [numero, zones] of parPage) {
    const resultat = effacerTexteSousZones(doc, doc.getPage(numero - 1), zones, proteges);
    lettres += resultat.lettres;
    resultat.policesNonGerees.forEach((p) => explications.add(`police non prise en charge (${p})`));
    if (resultat.blocsIgnores) explications.add('texte placé dans un bloc imbriqué (XObject)');
  }

  // 2. Les retouches deviennent définitives : on retire leur mémoire du fichier
  ecrireRetouches(doc, []);
  const definitif = await doc.save();

  // 3. Vérification : sans les dessins des retouches, les zones ne doivent plus contenir de texte
  for (const r of retouches) effacerDessinRetouche(doc, r);
  const controle = await doc.save();
  const restes = await texteRestantDansZones(controle, parPage);

  return {
    octets: definitif,
    nbRetouches: retouches.length,
    lettres,
    restes,
    explications: restes.length ? [...explications] : [],
  };
}

/** Cherche le texte encore présent dans les zones (avec PDF.js, comme à l'affichage). */
async function texteRestantDansZones(octets, parPage) {
  const restes = [];
  const { pdf } = await chargerPdf(octets, async () => null);
  try {
    for (const [numero, zones] of parPage) {
      const page = await pdf.getPage(numero);
      const contenu = await page.getTextContent();
      let texte = '';
      for (const item of contenu.items) {
        if (!item.str) continue;
        const famille = contenu.styles[item.fontName]?.fontFamily;
        for (let j = 0; j < item.str.length; j++) {
          if (!item.str[j].trim()) {
            if (texte && !texte.endsWith(' ')) texte += ' ';
            continue;
          }
          const [x1, y1, x2, y2] = rectangleCaracteres(item, j, j + 1, famille);
          const cx = (x1 + x2) / 2;
          const cy = y1 + (y2 - y1) * 0.4;
          if (zones.some((z) => dansZone(z, cx, cy))) texte += item.str[j];
        }
        if (item.hasEOL && texte && !texte.endsWith(' ')) texte += ' ';
      }
      texte = texte.trim();
      if (texte) restes.push({ page: numero, texte });
    }
  } finally {
    pdf.loadingTask.destroy();
  }
  return restes;
}
