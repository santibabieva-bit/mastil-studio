/**
 * Núcleo musical del Lab: afinaciones, notas sobre el mástil, etiquetas,
 * intervalos y utilidades de frecuencia. Sin DOM: se prueba en Node.
 *
 * Convención de cuerdas (igual que el Studio): índice 0 = cuerda más aguda
 * (arriba en pantalla), último índice = cuerda más grave.
 */

import {
  FAMILY_DEFS,
  createNoteCollection,
  chromaticName,
  mod,
  parseRoot,
  prettyNote,
} from '../../../src/theory.js';

export { FAMILY_DEFS, createNoteCollection, chromaticName, mod, parseRoot, prettyNote };

export const TUNINGS = {
  standard: { id: 'standard', label: 'Estándar (E A D G B E)', midi: [64, 59, 55, 50, 45, 40] },
  halfDown: { id: 'halfDown', label: 'Medio tono abajo (E♭)', midi: [63, 58, 54, 49, 44, 39] },
  fullDown: { id: 'fullDown', label: 'Un tono abajo (D)', midi: [62, 57, 53, 48, 43, 38] },
  dropD: { id: 'dropD', label: 'Drop D (D A D G B E)', midi: [64, 59, 55, 50, 45, 38] },
  dropC: { id: 'dropC', label: 'Drop C (C G C F A D)', midi: [62, 57, 53, 48, 43, 36] },
  dadgad: { id: 'dadgad', label: 'DADGAD', midi: [62, 57, 55, 50, 45, 38] },
  openG: { id: 'openG', label: 'Open G (D G D G B D)', midi: [62, 59, 55, 50, 43, 38] },
  openD: { id: 'openD', label: 'Open D (D A D F♯ A D)', midi: [62, 57, 54, 50, 45, 38] },
  openE: { id: 'openE', label: 'Open E (E B E G♯ B E)', midi: [64, 59, 56, 52, 47, 40] },
  openC: { id: 'openC', label: 'Open C (C G C G C E)', midi: [64, 60, 55, 48, 43, 36] },
  seven: { id: 'seven', label: '7 cuerdas (B E A D G B E)', midi: [64, 59, 55, 50, 45, 40, 35] },
  bass4: { id: 'bass4', label: 'Bajo 4 cuerdas (E A D G)', midi: [43, 38, 33, 28] },
  bass5: { id: 'bass5', label: 'Bajo 5 cuerdas (B E A D G)', midi: [43, 38, 33, 28, 23] },
  ukulele: { id: 'ukulele', label: 'Ukelele (A E C G)', midi: [69, 64, 60, 67] },
};

export function getTuning(id) {
  return TUNINGS[id] ?? TUNINGS.standard;
}

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Nombre pitch-class, con preferencia sostenido/bemol. */
export function pcName(pc, prefer = 'sharp') {
  return chromaticName(pc, prefer);
}

export function midiName(midi, prefer = 'sharp') {
  return `${pcName(mod(midi, 12), prefer)}${Math.floor(midi / 12) - 1}`;
}

const SOLFEGE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const SOLFEGE_FLAT = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

export function solfege(pc, prefer = 'sharp') {
  return (prefer === 'flat' ? SOLFEGE_FLAT : SOLFEGE_NAMES)[mod(pc, 12)];
}

export function pcAt(tuning, stringIndex, fret) {
  return mod(tuning[stringIndex] + fret, 12);
}

export function midiAt(tuning, stringIndex, fret) {
  return tuning[stringIndex] + fret;
}

/** Nombre de la nota usando la ortografía de la colección si existe. */
export function spelledName(pc, collection, prefer = 'sharp') {
  const hit = collection?.noteByPc?.get(pc);
  if (hit) return hit.name;
  return pcName(pc, collection?.root?.prefer ?? prefer);
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

const CHORD_DEGREE = {
  0: '1', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '11', 6: '♭5', 7: '5', 8: '♯5', 9: '♭♭7', 10: '♭7', 11: '7',
};
const SCALE_DEGREE = {
  0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7',
};

/** Etiqueta de grado para una nota de la colección. */
export function degreeLabel(note, collection) {
  const interval = mod(note.interval ?? 0, 12);
  if (collection.family.id !== 'scale') return CHORD_DEGREE[interval] ?? String(interval);
  const index = collection.notes.indexOf(note);
  if (collection.quality.sequentialLetters && collection.notes.length === 7 && index >= 0) {
    const diff = interval - MAJOR_STEPS[index];
    return `${diff < 0 ? '♭' : diff > 0 ? '♯' : ''}${index + 1}`;
  }
  return SCALE_DEGREE[interval] ?? String(interval);
}

export const INTERVAL_NAMES = [
  { semis: 0, short: 'U', name: 'Unísono' },
  { semis: 1, short: '2m', name: 'Segunda menor' },
  { semis: 2, short: '2M', name: 'Segunda mayor' },
  { semis: 3, short: '3m', name: 'Tercera menor' },
  { semis: 4, short: '3M', name: 'Tercera mayor' },
  { semis: 5, short: '4J', name: 'Cuarta justa' },
  { semis: 6, short: 'TT', name: 'Tritono' },
  { semis: 7, short: '5J', name: 'Quinta justa' },
  { semis: 8, short: '6m', name: 'Sexta menor' },
  { semis: 9, short: '6M', name: 'Sexta mayor' },
  { semis: 10, short: '7m', name: 'Séptima menor' },
  { semis: 11, short: '7M', name: 'Séptima mayor' },
  { semis: 12, short: '8J', name: 'Octava' },
];

export function intervalInfo(semis) {
  return INTERVAL_NAMES[Math.min(12, Math.max(0, semis))];
}

/**
 * Todas las notas de la colección en el rango de trastes dado.
 * Devuelve objetos { s, f, midi, pc, note, name, isRoot, degree }.
 */
export function collectBoardNotes({ tuning, collection, fromFret = 0, toFret = 15, strings = null }) {
  const out = [];
  for (let s = 0; s < tuning.length; s += 1) {
    if (strings && strings[s] === false) continue;
    for (let f = fromFret; f <= toFret; f += 1) {
      const midi = tuning[s] + f;
      const note = collection.noteByPc.get(mod(midi, 12));
      if (!note) continue;
      out.push({
        s,
        f,
        midi,
        pc: note.pc,
        note,
        name: note.name,
        isRoot: note.pc === collection.root.pc,
        degree: degreeLabel(note, collection),
      });
    }
  }
  return out;
}

/** Notas de la colección ordenadas por altura (ascendente) dentro de [lo, hi]. */
export function collectionMidis(collection, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m += 1) {
    if (collection.noteByPc.has(mod(m, 12))) out.push(m);
  }
  return out;
}

/** Clave de tonalidad: cuántas alteraciones. */
export function keySignature(rootName, mode = 'major') {
  const root = parseRoot(rootName);
  const collection = createNoteCollection(root, 'scale', mode === 'minor' ? 'naturalMinor' : 'major');
  let sharps = 0;
  let flats = 0;
  for (const n of collection.notes) {
    if (n.accidental > 0) sharps += n.accidental;
    if (n.accidental < 0) flats += -n.accidental;
  }
  return { sharps, flats, collection };
}

/** Utilidades de aleatoriedad inyectables. */
export function makeRng(seed = null) {
  if (seed == null) return Math.random;
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const ROOT_CHOICES = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

/** Las 12 tonalidades «razonables» (una ortografía por altura). */
export const COMMON_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
