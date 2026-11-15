/**
 * Posiciones («escaleras» de notas) y secuencias de ejercicio.
 * Una «escalera» es una lista de notas {s, f, midi} ordenada por altura.
 */

import { mod } from './music.js';

/** Notas por cuerda recomendadas según el tamaño de la colección. */
export function defaultPerString(collection) {
  const n = collection.notes.length;
  if (collection.family.id !== 'scale') return n <= 3 ? 2 : 2;
  return n >= 6 ? 3 : 2;
}

/**
 * Escalera tipo «N notas por cuerda». `position` (0..n-1) elige la nota de
 * arranque en la cuerda grave. Las cuerdas se recorren de grave a aguda.
 */
export function ladderPerString({ tuning, collection, position = 0, perString = null, maxFret = 24 }) {
  const per = perString ?? defaultPerString(collection);
  const strings = tuning.length;
  const lowStringIndex = strings - 1;
  const lowOpen = tuning[lowStringIndex];
  // Candidatas de arranque: notas de la colección entre el aire y el traste 11.
  const starts = [];
  for (let f = 0; f < 12; f += 1) {
    if (collection.noteByPc.has(mod(lowOpen + f, 12))) starts.push(lowOpen + f);
  }
  const startMidi = starts[position % starts.length];
  // Escalera ascendente a partir de ahí.
  const pitches = [];
  for (let m = startMidi; m < startMidi + 60; m += 1) {
    if (collection.noteByPc.has(mod(m, 12))) pitches.push(m);
  }
  const ladder = [];
  let cursor = 0;
  for (let s = lowStringIndex; s >= 0; s -= 1) {
    for (let i = 0; i < per; i += 1) {
      const midi = pitches[cursor];
      cursor += 1;
      if (midi == null) break;
      const f = midi - tuning[s];
      if (f < 0 || f > maxFret) {
        return { ladder: ladder.length >= 5 ? ladder : [], start: startMidi, partial: true };
      }
      ladder.push({ s, f, midi });
    }
  }
  return { ladder, start: startMidi, partial: false };
}

/** Escalera «caja»: todas las notas de la ventana de trastes, por altura. */
export function ladderBox({ tuning, collection, startFret = 4, span = 5, maxFret = 24 }) {
  const end = Math.min(maxFret, startFret + span - 1);
  const items = [];
  for (let s = tuning.length - 1; s >= 0; s -= 1) {
    for (let f = Math.max(0, startFret); f <= end; f += 1) {
      const midi = tuning[s] + f;
      if (collection.noteByPc.has(mod(midi, 12))) items.push({ s, f, midi });
    }
  }
  items.sort((a, b) => a.midi - b.midi || b.s - a.s);
  // Misma altura en dos cuerdas: nos quedamos con la de la cuerda más grave
  // salvo que sea la única que cae dentro de la ventana.
  const ladder = [];
  for (const item of items) {
    const last = ladder[ladder.length - 1];
    if (last && last.midi === item.midi) continue;
    ladder.push(item);
  }
  return { ladder, start: ladder[0]?.midi ?? 0, partial: false };
}

/** Escalera de una sola cuerda (ejercicios de horizontal). */
export function ladderSingleString({ tuning, collection, stringIndex = 0, maxFret = 12 }) {
  const ladder = [];
  for (let f = 0; f <= maxFret; f += 1) {
    const midi = tuning[stringIndex] + f;
    if (collection.noteByPc.has(mod(midi, 12))) ladder.push({ s: stringIndex, f, midi });
  }
  return { ladder, start: ladder[0]?.midi ?? 0, partial: false };
}

/* ───────────── Patrones de secuencia ───────────── */

/** Cada patrón devuelve, para una escalera de n notas, la lista de índices. */
export const PATTERNS = {
  straight: {
    label: 'Escala recta',
    build: (n) => range(0, n),
  },
  thirds: {
    label: 'Terceras (1-3, 2-4…)',
    build: (n) => flat(range(0, n - 2).map((i) => [i, i + 2])),
  },
  fourths: {
    label: 'Cuartas (1-4, 2-5…)',
    build: (n) => flat(range(0, n - 3).map((i) => [i, i + 3])),
  },
  triplets: {
    label: 'Grupos de 3 (1-2-3, 2-3-4…)',
    build: (n) => flat(range(0, n - 2).map((i) => [i, i + 1, i + 2])),
  },
  quads: {
    label: 'Grupos de 4 (1-2-3-4, 2-3-4-5…)',
    build: (n) => flat(range(0, n - 3).map((i) => [i, i + 1, i + 2, i + 3])),
  },
  loop3: {
    label: 'Vuelta (1-2-3-1, 2-3-4-2…)',
    build: (n) => flat(range(0, n - 2).map((i) => [i, i + 1, i + 2, i])),
  },
  zigzag: {
    label: 'Zigzag (1-3-2-4, 2-4-3-5…)',
    build: (n) => flat(range(0, n - 3).map((i) => [i, i + 2, i + 1, i + 3])),
  },
  pairs: {
    label: 'Parejas (1-2, 2-3…)',
    build: (n) => flat(range(0, n - 1).map((i) => [i, i + 1])),
  },
  ladder: {
    label: 'Escalera (3-2-1, 4-3-2…)',
    build: (n) => flat(range(0, n - 2).map((i) => [i + 2, i + 1, i])),
  },
  skip5: {
    label: 'Saltos de 5ª (1-5, 2-6…)',
    build: (n) => flat(range(0, n - 4).map((i) => [i, i + 4])),
  },
};

function range(from, to) {
  const out = [];
  for (let i = from; i < to; i += 1) out.push(i);
  return out;
}

function flat(lists) {
  return lists.flat();
}

/**
 * Convierte patrón + dirección en una lista de notas {s,f,midi}.
 * `direction`: 'up' | 'down' | 'updown'.
 */
export function buildSequence(ladder, patternId = 'straight', direction = 'up') {
  const pattern = PATTERNS[patternId] ?? PATTERNS.straight;
  if (ladder.length < 2) return [];
  const forward = pattern.build(ladder.length).filter((i) => i >= 0 && i < ladder.length);
  const mapUp = (indices) => indices.map((i) => ({ ...ladder[i] }));
  if (direction === 'up') return mapUp(forward);
  const reversed = [...ladder].reverse();
  const backIndices = pattern.build(reversed.length).filter((i) => i >= 0 && i < reversed.length);
  const down = backIndices.map((i) => ({ ...reversed[i] }));
  if (direction === 'down') return down;
  // Ida y vuelta: evitamos repetir la nota de giro.
  const up = mapUp(forward);
  if (down.length && up.length && down[0].midi === up[up.length - 1].midi) down.shift();
  return [...up, ...down];
}

/** Arpegio «sweep» simplificado: acorde apilado por cuerdas, ida y vuelta. */
export function sweepSequence({ tuning, collection, startFret = 5, span = 5 }) {
  const { ladder } = ladderBox({ tuning, collection, startFret, span });
  // Una nota por cuerda, de grave a aguda, la más grave de la ventana.
  const bestPerString = new Map();
  for (const note of ladder) {
    if (!bestPerString.has(note.s)) bestPerString.set(note.s, note);
  }
  const up = [...bestPerString.values()].sort((a, b) => b.s - a.s);
  return [...up, ...[...up].reverse().slice(1)];
}

/** Texto de tab ASCII a partir de una secuencia. */
export function sequenceToAscii(sequence, stringCount = 6, perLine = 16) {
  const names = ['e', 'B', 'G', 'D', 'A', 'E', 'B', 'F'];
  const labels = stringCount === 6 ? names : Array.from({ length: stringCount }, (_, i) => String(i + 1));
  const lines = [];
  for (let start = 0; start < sequence.length; start += perLine) {
    const chunk = sequence.slice(start, start + perLine);
    for (let s = 0; s < stringCount; s += 1) {
      let row = `${(labels[s] ?? '').padEnd(2)}|`;
      for (const note of chunk) {
        const cell = note.s === s ? String(note.f) : '';
        row += cell.padEnd(3, '-');
      }
      lines.push(`${row}|`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/** Fila de tab alineada columna a columna (usada por la UI y los tests). */
export function tabRows(sequence, stringCount = 6) {
  return Array.from({ length: stringCount }, (_, s) => sequence.map((n) => (n.s === s ? String(n.f) : null)));
}

/** Índice de la posición «N por cuerda» que arranca en la tónica (cuerda grave). */
export function rootPosition(tuning, collection) {
  const lowOpen = tuning[tuning.length - 1];
  let index = 0;
  for (let f = 0; f < 12; f += 1) {
    const pc = mod(lowOpen + f, 12);
    if (collection.noteByPc.has(pc)) {
      if (pc === collection.root.pc) return index;
      index += 1;
    }
  }
  return 0;
}

/** Nombre corto para la posición k: nota de arranque y grado. */
export function positionLabel(tuning, collection, position) {
  const lowOpen = tuning[tuning.length - 1];
  const starts = [];
  for (let f = 0; f < 12; f += 1) {
    const pc = mod(lowOpen + f, 12);
    if (collection.noteByPc.has(pc)) starts.push({ pc, f });
  }
  const start = starts[position % starts.length];
  const note = collection.noteByPc.get(start.pc);
  return { note, fret: start.f, count: starts.length };
}
