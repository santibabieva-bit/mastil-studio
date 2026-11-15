/**
 * Progresiones de acordes: presets, generador aleatorio por complejidad y
 * resolución a acordes concretos en una tonalidad.
 */

import { mod, parseRoot, pcName, pick } from './music.js';
import { CHORD_TYPES, chordSymbol, diatonicChords } from './chords.js';

/** Presets: cada acorde es { s: semitonos desde la tónica, t: tipo }. */
export const PROGRESSION_PRESETS = {
  major: [
    { id: 'pop', label: 'I – V – vi – IV (pop)', chords: [c(0, 'maj'), c(7, 'maj'), c(9, 'm'), c(5, 'maj')] },
    { id: 'rock', label: 'I – IV – V – IV (rock)', chords: [c(0, 'maj'), c(5, 'maj'), c(7, 'maj'), c(5, 'maj')] },
    { id: 'fifties', label: 'I – vi – IV – V (50s)', chords: [c(0, 'maj'), c(9, 'm'), c(5, 'maj'), c(7, 'maj')] },
    { id: 'twofive', label: 'ii – V – I (jazz)', chords: [c(2, 'm7'), c(7, '7'), c(0, 'maj7'), c(0, 'maj7')] },
    { id: 'turnaround', label: 'I – vi – ii – V', chords: [c(0, 'maj7'), c(9, 'm7'), c(2, 'm7'), c(7, '7')] },
    { id: 'axis', label: 'vi – IV – I – V', chords: [c(9, 'm'), c(5, 'maj'), c(0, 'maj'), c(7, 'maj')] },
    { id: 'canon', label: 'Canon (I V vi iii IV I IV V)', chords: [c(0, 'maj'), c(7, 'maj'), c(9, 'm'), c(4, 'm'), c(5, 'maj'), c(0, 'maj'), c(5, 'maj'), c(7, 'maj')] },
    { id: 'blues12', label: 'Blues de 12 compases', chords: [c(0, '7'), c(0, '7'), c(0, '7'), c(0, '7'), c(5, '7'), c(5, '7'), c(0, '7'), c(0, '7'), c(7, '7'), c(5, '7'), c(0, '7'), c(7, '7')] },
    { id: 'mixo', label: 'I – ♭VII – IV (mixolidio)', chords: [c(0, 'maj'), c(10, 'maj'), c(5, 'maj'), c(0, 'maj')] },
  ],
  minor: [
    { id: 'andalusian', label: 'i – ♭VII – ♭VI – V (andaluza)', chords: [c(0, 'm'), c(10, 'maj'), c(8, 'maj'), c(7, 'maj')] },
    { id: 'epic', label: 'i – ♭VI – ♭III – ♭VII', chords: [c(0, 'm'), c(8, 'maj'), c(3, 'maj'), c(10, 'maj')] },
    { id: 'minorblues', label: 'Blues menor de 12 compases', chords: [c(0, 'm7'), c(0, 'm7'), c(0, 'm7'), c(0, 'm7'), c(5, 'm7'), c(5, 'm7'), c(0, 'm7'), c(0, 'm7'), c(8, 'maj7'), c(7, '7'), c(0, 'm7'), c(7, '7')] },
    { id: 'rock-minor', label: 'i – iv – v – i', chords: [c(0, 'm'), c(5, 'm'), c(7, 'm'), c(0, 'm')] },
    { id: 'jazzminor', label: 'iiø – V7 – i', chords: [c(2, 'm7b5'), c(7, '7'), c(0, 'm'), c(0, 'm')] },
    { id: 'minor-pop', label: 'i – iv – ♭VII – ♭III', chords: [c(0, 'm'), c(5, 'm'), c(10, 'maj'), c(3, 'maj')] },
  ],
};

function c(s, t) {
  return { s, t };
}

/** Resuelve un acorde relativo a una tonalidad → símbolo y notas. */
export function resolveChord(keyRootName, chord, prefer = null) {
  const root = parseRoot(keyRootName);
  const rootPc = mod(root.pc + chord.s, 12);
  const pref = prefer ?? root.prefer;
  const name = pcName(rootPc, pref);
  return {
    rootPc,
    rootName: name,
    typeId: chord.t,
    symbol: chordSymbol(name, chord.t),
    interval: chord.s,
  };
}

export function resolveProgression(keyRootName, chords) {
  return chords.map((chord) => resolveChord(keyRootName, chord));
}

/** Opciones de acorde para el editor: diatónicos + dominantes secundarias comunes. */
export function chordChoices(keyRootName, mode = 'major') {
  const quality = mode === 'minor' ? 'naturalMinor' : 'major';
  const choices = [];
  const seen = new Set();
  const add = (chord, label) => {
    const key = `${chord.s}:${chord.t}`;
    if (seen.has(key)) return;
    seen.add(key);
    choices.push({ ...chord, label });
  };
  for (const withSeventh of [false, true]) {
    for (const d of diatonicChords(keyRootName, quality, withSeventh)) {
      const s = mod(d.rootPc - parseRoot(keyRootName).pc, 12);
      add({ s, t: d.typeId }, `${d.roman}  ·  ${resolveChord(keyRootName, { s, t: d.typeId }).symbol}`);
    }
  }
  for (const [s, label] of [[0, 'I7'], [5, 'IV7'], [7, 'V7']]) {
    add({ s, t: '7' }, `${label}  ·  ${resolveChord(keyRootName, { s, t: '7' }).symbol}`);
  }
  if (mode === 'minor') {
    add({ s: 7, t: 'maj' }, `V  ·  ${resolveChord(keyRootName, { s: 7, t: 'maj' }).symbol}`);
  }
  return choices;
}

/**
 * Progresión aleatoria. `complexity` 1–5:
 * 1 tríadas I IV V · 2 + vi/ii · 3 + séptimas · 4 + extensiones · 5 + acordes
 * prestados/fuera de la tonalidad (si `outside`).
 */
export function randomProgression({ mode = 'major', complexity = 2, length = 4, outside = false, rng = Math.random }) {
  const major = mode === 'major';
  const pools = {
    1: major ? [c(0, 'maj'), c(5, 'maj'), c(7, 'maj')] : [c(0, 'm'), c(5, 'm'), c(7, 'm'), c(8, 'maj'), c(10, 'maj')],
    2: major
      ? [c(0, 'maj'), c(5, 'maj'), c(7, 'maj'), c(9, 'm'), c(2, 'm'), c(4, 'm')]
      : [c(0, 'm'), c(5, 'm'), c(7, 'm'), c(8, 'maj'), c(10, 'maj'), c(3, 'maj')],
    3: major
      ? [c(0, 'maj7'), c(5, 'maj7'), c(7, '7'), c(9, 'm7'), c(2, 'm7'), c(4, 'm7')]
      : [c(0, 'm7'), c(5, 'm7'), c(7, '7'), c(8, 'maj7'), c(10, '7'), c(3, 'maj7')],
    4: major
      ? [c(0, 'maj9'), c(5, 'maj7'), c(7, '9'), c(9, 'm9'), c(2, 'm9'), c(4, 'm7'), c(11, 'm7b5'), c(7, '7sus4')]
      : [c(0, 'm9'), c(5, 'm7'), c(7, '7'), c(8, 'maj7'), c(10, '9'), c(3, 'maj7'), c(2, 'm7b5')],
    5: major
      ? [c(0, 'maj9'), c(5, 'maj7'), c(7, '9'), c(9, 'm9'), c(2, 'm9'), c(4, '7'), c(10, 'maj7'), c(5, 'm6'), c(1, 'dim7')]
      : [c(0, 'm9'), c(5, 'm7'), c(7, '7'), c(8, 'maj7'), c(10, '9'), c(1, 'maj7'), c(5, '9'), c(11, 'dim7')],
  };
  const pool = [...(pools[Math.min(5, Math.max(1, complexity))] ?? pools[2])];
  if (outside && complexity >= 3) {
    pool.push(c(6, '7'), c(1, 'maj7'), c(3, 'maj7'), c(8, 'maj7'));
  }
  const tonic = major ? c(0, complexity >= 3 ? 'maj7' : 'maj') : c(0, complexity >= 3 ? 'm7' : 'm');
  const chords = [tonic];
  while (chords.length < length) {
    let next = pick(pool, rng);
    const prev = chords[chords.length - 1];
    if (next.s === prev.s && next.t === prev.t) next = pick(pool, rng);
    chords.push(next);
  }
  return chords;
}

export function chordLabel(keyRootName, chord) {
  return resolveChord(keyRootName, chord).symbol;
}

export function allChordTypeIds() {
  return Object.keys(CHORD_TYPES);
}
