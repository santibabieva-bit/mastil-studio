/**
 * Ritmo: generador de ritmos aleatorios, patrones de rasgueo, grooves de
 * batería y utilidades de metrónomo. Todo puro.
 */

import { pick } from './music.js';

export const TIME_SIGNATURES = {
  '4/4': { id: '4/4', beats: 4, stepsPerBeat: 4, label: '4/4', groups: [4, 4, 4, 4] },
  '3/4': { id: '3/4', beats: 3, stepsPerBeat: 4, label: '3/4', groups: [4, 4, 4] },
  '2/4': { id: '2/4', beats: 2, stepsPerBeat: 4, label: '2/4', groups: [4, 4] },
  '5/4': { id: '5/4', beats: 5, stepsPerBeat: 4, label: '5/4', groups: [4, 4, 4, 4, 4] },
  '6/8': { id: '6/8', beats: 2, stepsPerBeat: 6, label: '6/8', groups: [6, 6] },
  '12/8': { id: '12/8', beats: 4, stepsPerBeat: 6, label: '12/8', groups: [6, 6, 6, 6], backingOnly: true },
};

/* ───────────── Rhythm trainer ───────────── */

// Patrones de un pulso (4 semicorcheas): 1 = ataque.
const BEAT_PATTERNS = {
  easy: [[1, 0, 0, 0], [1, 0, 1, 0], [1, 0, 0, 0], [1, 0, 1, 0]],
  medium: [[1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 0], [1, 0, 0, 1], [0, 0, 1, 0]],
  hard: [[1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1], [0, 0, 1, 1], [1, 1, 0, 0]],
};

const BEAT_PATTERNS_6_8 = {
  easy: [[1, 0, 0, 0, 0, 0], [1, 0, 0, 1, 0, 0], [1, 0, 1, 0, 1, 0]],
  medium: [[1, 0, 0, 1, 0, 0], [1, 0, 1, 0, 1, 0], [1, 1, 1, 1, 1, 1], [1, 0, 0, 1, 0, 1]],
  hard: [[1, 1, 1, 1, 1, 1], [1, 0, 1, 1, 0, 1], [0, 1, 1, 0, 1, 0], [1, 1, 0, 1, 0, 0]],
};

export const RHYTHM_LEVELS = {
  easy: { id: 'easy', label: 'Fácil' },
  medium: { id: 'medium', label: 'Medio' },
  hard: { id: 'hard', label: 'Difícil' },
};

/**
 * Genera `bars` compases. Cada compás: { steps: [0|1...], length }.
 * `rests`: permite pulsos vacíos.
 */
export function generateRhythm({ signature = '4/4', bars = 2, level = 'easy', rests = false, rng = Math.random } = {}) {
  const sig = TIME_SIGNATURES[signature] ?? TIME_SIGNATURES['4/4'];
  const table = sig.id === '6/8' ? BEAT_PATTERNS_6_8 : BEAT_PATTERNS;
  const patterns = table[level] ?? table.easy;
  const out = [];
  for (let b = 0; b < bars; b += 1) {
    let steps = [];
    for (let beat = 0; beat < sig.beats; beat += 1) {
      let beatPattern = pick(patterns, rng);
      if (rests && rng() < 0.22 && !(b === 0 && beat === 0)) beatPattern = beatPattern.map(() => 0);
      steps = steps.concat(beatPattern);
    }
    // Garantiza que el primer pulso del primer compás suena.
    if (b === 0 && !steps[0]) steps[0] = 1;
    out.push({ steps, length: steps.length });
  }
  return { signature: sig.id, bars: out };
}

/** Duraciones (en pasos) de cada ataque: hasta el siguiente ataque o el fin. */
export function rhythmEvents(rhythm) {
  const events = [];
  let offset = 0;
  const all = [];
  for (const bar of rhythm.bars) {
    bar.steps.forEach((on, i) => {
      if (on) all.push(offset + i);
    });
    offset += bar.length;
  }
  all.forEach((start, i) => {
    const next = all[i + 1] ?? offset;
    events.push({ start, dur: next - start });
  });
  return { events, total: offset };
}

/** Texto de conteo: «1 e & a 2 e & a…» */
export function countLabels(signature = '4/4') {
  const sig = TIME_SIGNATURES[signature] ?? TIME_SIGNATURES['4/4'];
  if (sig.id === '6/8') return ['1', 'la', 'li', '2', 'la', 'li'];
  const base = ['', 'e', '&', 'a'];
  const out = [];
  for (let beat = 1; beat <= sig.beats; beat += 1) {
    base.forEach((b, i) => out.push(i === 0 ? String(beat) : b));
  }
  return out;
}

/* ───────────── Rasgueo (strum) ───────────── */

/** Estados de un paso: 0 silencio, 1 rasgueo, 2 acento, 3 apagado (muted). */
export const STRUM_STATES = ['rest', 'strum', 'accent', 'mute'];

export function cycleStep(state) {
  return (state + 1) % 4;
}

/**
 * Presets en rejilla de 8 (corcheas) o 16 pasos. Cada paso: [estado].
 * La dirección sale de la posición: pasos pares = abajo, impares = arriba.
 */
export const STRUM_PRESETS = {
  basic: { label: 'Básico (↓ ↓ ↓ ↓)', steps: 8, pattern: [2, 0, 1, 0, 2, 0, 1, 0] },
  folk: { label: 'Folk (↓ ↓↑ ↑↓↑)', steps: 8, pattern: [2, 0, 1, 0, 0, 1, 1, 1] },
  pop: { label: 'Pop (↓ ↓↑ ↑↓↑)', steps: 8, pattern: [2, 0, 1, 1, 0, 1, 1, 1] },
  country: { label: 'Country (bajo + ↓↑)', steps: 8, pattern: [2, 0, 1, 1, 2, 0, 1, 1] },
  ballad: { label: 'Balada', steps: 8, pattern: [2, 0, 0, 1, 1, 0, 1, 1] },
  reggae: { label: 'Reggae (contratiempos)', steps: 8, pattern: [0, 0, 1, 0, 0, 0, 1, 0] },
  muted: { label: 'Con apagados', steps: 8, pattern: [2, 3, 1, 3, 2, 3, 1, 3] },
  funk: { label: 'Funk 16avos', steps: 16, pattern: [2, 3, 1, 3, 3, 1, 3, 1, 2, 3, 1, 3, 3, 1, 3, 1] },
  rock16: { label: 'Rock 16avos', steps: 16, pattern: [2, 0, 1, 0, 2, 0, 1, 1, 2, 0, 1, 0, 2, 0, 1, 1] },
};

export function isDownStrum(index, steps) {
  const perBeat = steps === 8 ? 2 : 4;
  return index % 2 === 0 || (steps === 16 && index % perBeat === 0);
}

/** Convierte un patrón en texto visual «↓ · ↓↑ ·». */
export function strumToText(pattern, steps = pattern.length) {
  return pattern
    .map((s, i) => {
      if (s === 0) return '·';
      if (s === 3) return '✕';
      return isDownStrum(i, steps) ? '↓' : '↑';
    })
    .join(' ');
}

/* ───────────── Batería ───────────── */

export const DRUM_TRACKS = [
  { id: 'kick', label: 'Bombo' },
  { id: 'snare', label: 'Caja' },
  { id: 'hat', label: 'Hi-hat' },
  { id: 'openhat', label: 'Hi-hat abierto' },
  { id: 'tom', label: 'Tom' },
];

function grid(len, on) {
  const out = new Array(len).fill(0);
  for (const i of on) out[i] = 1;
  return out;
}

/** Grooves en 16 pasos (4/4); 12 pasos (3/4 y 6/8 en semicorcheas por pulso). */
export const GROOVES = {
  rock: {
    label: 'Rock',
    swing: 0,
    steps: 16,
    tracks: {
      kick: grid(16, [0, 8, 10]),
      snare: grid(16, [4, 12]),
      hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
      openhat: grid(16, [15]),
      tom: grid(16, []),
    },
    bass: [0, 8], // pasos con bajo raíz
    comp: 'pop',
  },
  pop: {
    label: 'Pop',
    swing: 0,
    steps: 16,
    tracks: {
      kick: grid(16, [0, 6, 8, 11]),
      snare: grid(16, [4, 12]),
      hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
      openhat: grid(16, []),
      tom: grid(16, []),
    },
    bass: [0, 6, 8, 11],
    comp: 'pop',
  },
  funk: {
    label: 'Funk',
    swing: 0,
    steps: 16,
    tracks: {
      kick: grid(16, [0, 3, 6, 10]),
      snare: grid(16, [4, 12, 15]),
      hat: grid(16, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      openhat: grid(16, []),
      tom: grid(16, []),
    },
    bass: [0, 3, 6, 10, 14],
    comp: 'funk',
  },
  shuffle: {
    label: 'Shuffle / Blues',
    swing: 0.66,
    steps: 16,
    tracks: {
      kick: grid(16, [0, 8]),
      snare: grid(16, [4, 12]),
      hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
      openhat: grid(16, []),
      tom: grid(16, []),
    },
    bass: [0, 2, 4, 6, 8, 10, 12, 14],
    comp: 'shuffle',
    walking: true,
  },
  ballad: {
    label: 'Balada',
    swing: 0,
    steps: 16,
    tracks: {
      kick: grid(16, [0, 10]),
      snare: grid(16, [8]),
      hat: grid(16, [0, 4, 8, 12]),
      openhat: grid(16, []),
      tom: grid(16, []),
    },
    bass: [0, 8],
    comp: 'ballad',
  },
  reggae: {
    label: 'Reggae',
    swing: 0,
    steps: 16,
    tracks: {
      kick: grid(16, [8]),
      snare: grid(16, [8]),
      hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
      openhat: grid(16, []),
      tom: grid(16, []),
    },
    bass: [6, 8, 14],
    comp: 'reggae',
  },
  latin: {
    label: 'Latin / Bossa',
    swing: 0,
    steps: 16,
    tracks: {
      kick: grid(16, [0, 6, 8, 14]),
      snare: grid(16, [3, 6, 10, 12]),
      hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
      openhat: grid(16, []),
      tom: grid(16, []),
    },
    bass: [0, 6, 8, 14],
    comp: 'basic',
  },
};

// Grooves añadidos: jazz, bossa nova, country y rock lento.
GROOVES.jazz = {
  label: 'Jazz swing',
  swing: 0.66,
  steps: 16,
  tracks: {
    kick: grid(16, [0]),
    snare: grid(16, [14]),
    hat: grid(16, [4, 12]),
    openhat: grid(16, []),
    tom: grid(16, []),
  },
  bass: [0, 4, 8, 12],
  comp: 'jazz',
  walking: true,
};
GROOVES.bossa = {
  label: 'Bossa nova',
  swing: 0,
  steps: 16,
  tracks: {
    kick: grid(16, [0, 6, 8, 14]),
    snare: grid(16, [3, 6, 10, 12]),
    hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
    openhat: grid(16, []),
    tom: grid(16, []),
  },
  bass: [0, 6, 8, 14],
  comp: 'bossa',
};
GROOVES.country = {
  label: 'Country (tren)',
  swing: 0,
  steps: 16,
  tracks: {
    kick: grid(16, [0, 8]),
    snare: grid(16, [2, 4, 6, 10, 12, 14]),
    hat: grid(16, [0, 4, 8, 12]),
    openhat: grid(16, []),
    tom: grid(16, []),
  },
  bass: [0, 8],
  comp: 'country',
};
GROOVES.slowrock = {
  label: 'Rock lento',
  swing: 0,
  steps: 16,
  tracks: {
    kick: grid(16, [0, 10]),
    snare: grid(16, [4, 12]),
    hat: grid(16, [0, 2, 4, 6, 8, 10, 12, 14]),
    openhat: grid(16, []),
    tom: grid(16, []),
  },
  bass: [0, 4, 8, 12],
  comp: 'ballad',
};

/** 12/8 (24 pasos): cuatro pulsos ternarios. */
export const GROOVES_24 = {
  blues128: {
    label: 'Blues lento 12/8',
    swing: 0,
    steps: 24,
    tracks: {
      kick: grid(24, [0, 12]),
      snare: grid(24, [6, 18]),
      hat: grid(24, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]),
      openhat: grid(24, []),
      tom: grid(24, []),
    },
    bass: [0, 6, 12, 18],
    comp: 'twelve8',
  },
  soul128: {
    label: 'Balada soul 12/8',
    swing: 0,
    steps: 24,
    tracks: {
      kick: grid(24, [0, 14]),
      snare: grid(24, [6, 18]),
      hat: grid(24, [0, 4, 8, 12, 16, 20]),
      openhat: grid(24, []),
      tom: grid(24, []),
    },
    bass: [0, 12],
    comp: 'twelve8',
  },
};

/** Grooves para 3/4 y 6/8 (12 pasos). */
export const GROOVES_12 = {
  waltz: {
    label: 'Vals',
    swing: 0,
    steps: 12,
    tracks: {
      kick: grid(12, [0]),
      snare: grid(12, [4, 8]),
      hat: grid(12, [0, 2, 4, 6, 8, 10]),
      openhat: grid(12, []),
      tom: grid(12, []),
    },
    bass: [0],
    comp: 'waltz',
  },
  six8: {
    label: '6/8',
    swing: 0,
    steps: 12,
    tracks: {
      kick: grid(12, [0, 6]),
      snare: grid(12, [6]),
      hat: grid(12, [0, 2, 4, 6, 8, 10]),
      openhat: grid(12, []),
      tom: grid(12, []),
    },
    bass: [0, 6],
    comp: 'six8',
  },
};

/** Patrones de acompañamiento de guitarra por groove (paso → fuerza). */
export const COMP_PATTERNS = {
  basic: { steps: 16, hits: [[0, 1], [8, 0.8]] },
  pop: { steps: 16, hits: [[0, 1], [4, 0.7], [6, 0.7], [8, 0.9], [12, 0.7], [14, 0.7]] },
  funk: { steps: 16, hits: [[2, 0.7], [3, 0.5], [6, 0.8], [7, 0.5], [10, 0.7], [11, 0.5], [14, 0.8]] },
  shuffle: { steps: 16, hits: [[0, 1], [4, 0.8], [8, 0.9], [12, 0.8]] },
  ballad: { steps: 16, hits: [[0, 0.9], [4, 0.6], [8, 0.7], [12, 0.6]], arpeggio: true },
  reggae: { steps: 16, hits: [[4, 0.8], [12, 0.8]] },
  waltz: { steps: 12, hits: [[0, 1], [4, 0.7], [8, 0.7]] },
  six8: { steps: 12, hits: [[0, 1], [3, 0.6], [6, 0.8], [9, 0.6]] },
  twelve8: { steps: 24, hits: [[0, 1], [3, 0.55], [6, 0.8], [9, 0.55], [12, 0.9], [15, 0.55], [18, 0.8], [21, 0.55]], arpeggio: true },
  jazz: { steps: 16, hits: [[0, 0.8], [6, 0.6], [10, 0.7]] },
  bossa: { steps: 16, hits: [[0, 0.8], [3, 0.6], [6, 0.7], [10, 0.7], [12, 0.6]] },
  country: { steps: 16, hits: [[2, 0.7], [4, 0.9], [6, 0.7], [10, 0.7], [12, 0.9], [14, 0.7]] },
};

export function groovesFor(signature) {
  if (signature === '4/4') return GROOVES;
  if (signature === '12/8') return GROOVES_24;
  return GROOVES_12;
}

/**
 * Retraso por swing, en pasos de semicorchea (4 pasos = 1 pulso). La segunda
 * corchea de cada pulso (paso % 4 === 2) se mueve de 0,5 a `swing` del pulso.
 * `swing` 0,5 = recto; 0,66 = tresillo.
 */
export function swingOffset(stepIndex, swing) {
  if (!swing || swing <= 0.5 || stepIndex % 4 !== 2) return 0;
  return (swing - 0.5) * 4;
}

/* ───────────── Metrónomo ───────────── */

export const SUBDIVISIONS = {
  none: { id: 'none', label: 'Negras', perBeat: 1 },
  eighth: { id: 'eighth', label: 'Corcheas', perBeat: 2 },
  triplet: { id: 'triplet', label: 'Tresillos', perBeat: 3 },
  sixteenth: { id: 'sixteenth', label: 'Semicorcheas', perBeat: 4 },
};

export function clampBpm(bpm) {
  return Math.max(20, Math.min(320, Math.round(Number(bpm) || 100)));
}

/** Tap tempo: BPM a partir de una lista de marcas de tiempo en ms. */
export function bpmFromTaps(times) {
  const recent = times.slice(-6);
  if (recent.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < recent.length; i += 1) gaps.push(recent[i] - recent[i - 1]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avg < 150 || avg > 3000) return null;
  return clampBpm(60000 / avg);
}

/**
 * Entrenador de velocidad: a partir del compás `bar` (0-based) devuelve el
 * BPM. Sube `step` cada `every` compases hasta `target`.
 */
export function speedAtBar({ start, target, step, every, bar }) {
  const increments = Math.floor(bar / Math.max(1, every));
  const direction = target >= start ? 1 : -1;
  const value = start + direction * step * increments;
  return direction > 0 ? Math.min(target, value) : Math.max(target, value);
}

/** Entrenador de intervalos: ¿suena el compás `bar`? */
export function isBarAudible({ play, silent, bar }) {
  if (!silent) return true;
  const cycle = play + silent;
  return bar % cycle < play;
}
