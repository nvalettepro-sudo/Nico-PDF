import { defineConfig } from 'vite';

// Chemins relatifs : l'application fonctionne quel que soit le nom
// du dépôt GitHub Pages (https://<utilisateur>.github.io/<depot>/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
