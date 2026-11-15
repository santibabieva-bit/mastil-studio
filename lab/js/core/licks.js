/**
 * Licks: frases guardadas como tab (cuerda:traste), transpuestas a las 12
 * tonalidades y comparadas con lo que tocas. Puro.
 */

import { mod } from './music.js';

/** Licks de ejemplo, escritos en La menor (tónica A). `d` es la duración en pulsos. */
export const BUILTIN_LICKS = [
  { id: 'box1-run', name: 'Escalera pentatónica (caja 1)', style: 'Blues-rock', rootPc: 9, notes: [[3, 5], [3, 7], [2, 5], [2, 7], [1, 5], [1, 8], [0, 5], [1, 8]], subdivision: 2 },
  { id: 'bb-lick', name: 'Lick tipo B.B.', style: 'Blues', rootPc: 9, notes: [[0, 8, 2], [0, 5, 1], [1, 8, 1], [1, 5, 2], [2, 5, 2]], subdivision: 2 },
  { id: 'rock-triplet', name: 'Tresillos de rock', style: 'Rock', rootPc: 9, notes: [[2, 7], [1, 5], [0, 5], [2, 7], [1, 5], [0, 5], [2, 7], [1, 5], [0, 5], [1, 8]], subdivision: 3 },
  { id: 'country-hybrid', name: 'Doble parada country', style: 'Country', rootPc: 9, notes: [[1, 5], [2, 7], [1, 5], [2, 5], [3, 7], [3, 5]], subdivision: 2 },
  { id: 'minor-descend', name: 'Descenso menor', style: 'Menor', rootPc: 9, notes: [[0, 8], [0, 5], [1, 8], [1, 5], [2, 7], [2, 5], [3, 7], [3, 5]], subdivision: 2 },
  { id: 'octave-hook', name: 'Gancho de octava', style: 'Pop', rootPc: 9, notes: [[0, 5], [2, 7], [0, 5], [1, 5], [2, 7]], subdivision: 1 },
  { id: 'jazz-arp', name: 'Arpegio menor séptima', style: 'Jazz', rootPc: 9, notes: [[3, 7], [2, 5], [1, 5], [0, 5], [1, 8], [2, 7], [3, 7]], subdivision: 2 },
];

/** Interpreta «1:5 2:7 3:5» (cuerda desde la más aguda = 1) o «e5 B7»; devuelve [[s,f]] o null. */
export function parseLick(text) {
  const out = [];
  for (const token of String(text).trim().split(/[\s,;]+/).filter(Boolean)) {
    const m = token.match(/^([1-6]):(\d{1,2})$/);
    if (!m) return null;
    out.push([Number(m[1]) - 1, Number(m[2])]);
  }
  return out.length ? out : null;
}

export const lickToText = (notes) => notes.map(([s, f]) => `${s + 1}:${f}`).join(' ');

/**
 * Desplaza el lick `semitones` (puede ser negativo). Mantiene todas las
 * notas dentro de [0, maxFret] moviendo el conjunto una octava si hace falta.
 * Devuelve null si no cabe.
 */
export function transposeLick(lick, semitones, { maxFret = 17 } = {}) {
  let shift = mod(semitones, 12);
  const frets = lick.notes.map((n) => n[1]);
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  // Elegimos el desplazamiento equivalente (±12) que mejor entra en el mástil.
  const options = [shift, shift - 12, shift + 12].filter((s) => lo + s >= 0 && hi + s <= maxFret);
  if (!options.length) return null;
  // Preferimos el más cercano a la posición original.
  options.sort((a, b) => Math.abs(a) - Math.abs(b));
  [shift] = options;
  return {
    ...lick,
    rootPc: mod(lick.rootPc + semitones, 12),
    notes: lick.notes.map(([s, f, d]) => (d == null ? [s, f + shift] : [s, f + shift, d])),
    shift,
  };
}

/** Las 12 tonalidades en orden de círculo de quintas empezando en `startPc`. */
export function circleOfFifths(startPc) {
  return Array.from({ length: 12 }, (_, i) => mod(startPc + i * 7, 12));
}

/** Lick en cada tonalidad del círculo: [{ rootPc, lick | null }]. */
export function lickInAllKeys(lick, { order = 'fifths', maxFret = 17 } = {}) {
  const keys = order === 'fifths' ? circleOfFifths(lick.rootPc) : Array.from({ length: 12 }, (_, i) => mod(lick.rootPc + i, 12));
  return keys.map((rootPc) => ({ rootPc, lick: transposeLick(lick, mod(rootPc - lick.rootPc, 12), { maxFret }) }));
}

/**
 * Compara lo que tocaste con el lick: proporción de notas del lick que
 * aparecen, en orden, en la lista de MIDI detectados (tolerante a extras).
 */
export function matchLick(played, expected) {
  if (!expected.length) return { hits: 0, total: 0, ratio: 0 };
  let cursor = 0;
  let hits = 0;
  for (const midi of expected) {
    let found = -1;
    for (let i = cursor; i < played.length; i += 1) {
      if (played[i] === midi) { found = i; break; }
    }
    if (found >= 0) { hits += 1; cursor = found + 1; }
  }
  return { hits, total: expected.length, ratio: hits / expected.length };
}

/** Colapsa una secuencia de MIDI detectados cuadro a cuadro en notas distintas. */
export function collapseNotes(frames, minFrames = 3) {
  const out = [];
  let run = null;
  let count = 0;
  for (const m of frames) {
    if (m != null && m === run) count += 1;
    else {
      if (run != null && count >= minFrames) out.push(run);
      run = m;
      count = 1;
    }
  }
  if (run != null && count >= minFrames) out.push(run);
  return out;
}
