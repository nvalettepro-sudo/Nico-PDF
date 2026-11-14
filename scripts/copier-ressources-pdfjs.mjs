// Copie les ressources de PDF.js (polices standard, tables de caractères « CMaps »,
// décodeurs d'images) dans public/pdfjs/ pour qu'elles soient incluses dans le build.
// Aucune ressource n'est donc chargée depuis Internet.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'node_modules', 'pdfjs-dist');
const cible = join(racine, 'public', 'pdfjs');

if (!existsSync(source)) {
  console.error('pdfjs-dist est introuvable : lancez d\'abord « npm install ».');
  process.exit(1);
}
mkdirSync(cible, { recursive: true });
for (const dossier of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(source, dossier), join(cible, dossier), { recursive: true });
}
console.log('Ressources PDF.js copiées dans public/pdfjs/');
