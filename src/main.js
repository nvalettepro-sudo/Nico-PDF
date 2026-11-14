// Démarrage de l'application (squelette provisoire, remplacé en version 1).
// Vérifie que PDF.js et son « worker » (programme qui travaille en arrière-plan)
// sont bien embarqués dans le build, sans aucun CDN.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import './styles/base.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

async function verifierStack() {
  const statut = document.getElementById('statut');
  try {
    // Crée un PDF vide avec pdf-lib, puis l'ouvre avec PDF.js.
    const doc = await PDFDocument.create();
    doc.addPage();
    const octets = await doc.save();
    const pdf = await pdfjsLib.getDocument({ data: octets }).promise;
    statut.textContent = `Stack prête : PDF.js ${pdfjsLib.version}, pdf-lib OK (${pdf.numPages} page de test).`;
  } catch (erreur) {
    statut.textContent = `Erreur au démarrage : ${erreur.message}`;
    console.error(erreur);
  }
}

verifierStack();
