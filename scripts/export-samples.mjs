import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDiagram } from '../src/diagram.js';

const outputDir = join(process.cwd(), 'output');
await mkdir(outputDir, { recursive: true });

const samples = [
  {
    filename: 'escala-a-mayor.svg',
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'all',
  },
  {
    filename: 'escala-a-mayor-forma-a.svg',
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'A',
    showCagedOverlay: true,
    colorRoles: false,
  },
  {
    filename: 'escala-a-mayor-forma-e.svg',
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'E',
    showCagedOverlay: true,
    colorRoles: false,
  },
  {
    filename: 'pentatonica-a-menor-forma-c.svg',
    root: 'A',
    family: 'scale',
    quality: 'pentatonicMinor',
    shapeId: 'C',
    showCagedOverlay: true,
    colorRoles: false,
  },
  {
    filename: 'cuatriada-a-mayor7-drop2.svg',
    root: 'A',
    family: 'cuatriad',
    quality: 'major7',
    voicing: { drop: 'drop2', rootString: 6 },
  },
  {
    filename: 'triada-c-sostenido-menor.svg',
    root: 'C#',
    family: 'triad',
    quality: 'minor',
    shapeId: 'all',
  },
  {
    filename: 'arpegio-g-dominante-7.svg',
    root: 'G',
    family: 'arpeggio',
    quality: 'dominant7',
    shapeId: 'all',
  },
];

for (const sample of samples) {
  const { svg, collection, shape } = buildDiagram(sample);
  await writeFile(join(outputDir, sample.filename), svg, 'utf8');
  const shapeText = shape ? ` · forma ${shape.id}` : '';
  console.log(`${sample.filename} · ${collection.title}${shapeText}`);
}

console.log(`\n${samples.length} SVG generados en ${outputDir}`);
