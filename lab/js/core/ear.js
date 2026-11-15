/**
 * Entrenador de oído: preguntas de intervalos y calidades de acorde.
 * Devuelve las notas MIDI a reproducir; el audio lo pone la UI.
 */

import { INTERVAL_NAMES, pick, shuffle } from './music.js';

export const EAR_INTERVAL_SETS = {
  basic: { label: 'Básicos (3ª, 4ª, 5ª, 8ª)', semis: [3, 4, 5, 7, 12] },
  common: { label: 'Comunes (2ª a 7ª)', semis: [2, 3, 4, 5, 7, 9, 10, 11] },
  all: { label: 'Todos (1–12 semitonos)', semis: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
};

export const EAR_CHORD_SETS = {
  triads: {
    label: 'Tríadas (mayor, menor)',
    types: [
      { id: 'maj', label: 'Mayor', intervals: [0, 4, 7] },
      { id: 'min', label: 'Menor', intervals: [0, 3, 7] },
    ],
  },
  triadsAll: {
    label: 'Tríadas (+ dim, aug)',
    types: [
      { id: 'maj', label: 'Mayor', intervals: [0, 4, 7] },
      { id: 'min', label: 'Menor', intervals: [0, 3, 7] },
      { id: 'dim', label: 'Disminuido', intervals: [0, 3, 6] },
      { id: 'aug', label: 'Aumentado', intervals: [0, 4, 8] },
    ],
  },
  sevenths: {
    label: 'Séptimas',
    types: [
      { id: 'maj7', label: 'Mayor 7', intervals: [0, 4, 7, 11] },
      { id: 'm7', label: 'Menor 7', intervals: [0, 3, 7, 10] },
      { id: 'dom7', label: 'Dominante 7', intervals: [0, 4, 7, 10] },
      { id: 'm7b5', label: 'Semidisminuido', intervals: [0, 3, 6, 10] },
    ],
  },
};

/**
 * @param {object} cfg
 * @param {'interval'|'chord'} cfg.mode
 * @param {string} cfg.set clave de EAR_INTERVAL_SETS / EAR_CHORD_SETS
 * @param {'up'|'down'|'both'|'harmonic'} cfg.direction (intervalos)
 * @param {boolean} cfg.inversions (acordes: baja una nota una octava)
 */
export function earQuestion({ mode = 'interval', set = 'basic', direction = 'up', inversions = false, startNote = null, rng = Math.random } = {}) {
  const base = startNote ?? 52 + Math.floor(rng() * 14);
  if (mode === 'interval') {
    const pool = (EAR_INTERVAL_SETS[set] ?? EAR_INTERVAL_SETS.basic).semis;
    const semis = pick(pool, rng);
    const dir = direction === 'both' ? (rng() < 0.5 ? 'up' : 'down') : direction;
    const second = dir === 'down' ? base - semis : base + semis;
    return {
      mode,
      midis: [base, second],
      harmonic: dir === 'harmonic',
      answer: semis,
      options: shuffle(pool, rng).map((v) => ({ value: v, label: INTERVAL_NAMES[v].name })),
      label: `${INTERVAL_NAMES[semis].name} (${dir === 'down' ? 'descendente' : dir === 'harmonic' ? 'armónico' : 'ascendente'})`,
      direction: dir,
    };
  }
  const types = (EAR_CHORD_SETS[set] ?? EAR_CHORD_SETS.triads).types;
  const type = pick(types, rng);
  let midis = type.intervals.map((i) => base - 5 + i);
  let inversion = 0;
  if (inversions) {
    inversion = Math.floor(rng() * midis.length);
    for (let i = 0; i < inversion; i += 1) midis = [...midis.slice(1), midis[0] + 12];
  }
  return {
    mode,
    midis,
    harmonic: true,
    answer: type.id,
    options: types.map((t) => ({ value: t.id, label: t.label })),
    label: `${type.label}${inversion ? ` (inversión ${inversion})` : ''}`,
    inversion,
  };
}

export function earScore(history) {
  const total = history.length;
  const right = history.filter(Boolean).length;
  return { total, right, rate: total ? right / total : 0 };
}
