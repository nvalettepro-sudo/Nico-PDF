import { defineConfig } from 'vite';

// Chemins relatifs : l'application fonctionne quel que soit le nom
// du dépôt GitHub Pages (https://<utilisateur>.github.io/<depot>/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    // PDF.js et pdf-lib sont volumineux : c'est normal, on relève le seuil d'alerte.
    chunkSizeWarningLimit: 2000,
  },
});
