// Vérifie avant chaque build que le numéro de version et l'historique sont cohérents.
// Règles : la version de package.json est la première de l'historique,
// l'historique contient au plus 4 versions, chacune avec au moins une modification.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const source = readFileSync(join(racine, 'src', 'version.js'), 'utf8');
const historique = [...source.matchAll(/version: '([^']+)'/g)].map((m) => m[1]);

const erreurs = [];
if (historique[0] !== version) {
  erreurs.push(`la version ${version} (package.json) doit être la première de HISTORIQUE dans src/version.js (actuellement ${historique[0]}).`);
}
if (historique.length > 4) {
  erreurs.push(`HISTORIQUE contient ${historique.length} versions : n'en garder que 4.`);
}
if (new Set(historique).size !== historique.length) {
  erreurs.push('HISTORIQUE contient deux fois la même version.');
}
if (/modifications: \[\s*\]/.test(source)) {
  erreurs.push('chaque version de HISTORIQUE doit lister au moins une modification.');
}
if (erreurs.length) {
  console.error(`Vérification de la version : ${erreurs.join('\n  ')}`);
  process.exit(1);
}
console.log(`Version ${version} : historique à jour (${historique.length} versions).`);
