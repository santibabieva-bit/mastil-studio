/**
 * Rutina de práctica guiada: reparte el tiempo entre bloques (calentamiento,
 * técnica, tríadas, teoría, jam, oído) dando más peso a lo que has
 * practicado menos y a tus puntos débiles. Puro y reproducible con `rng`.
 */

import { pick } from './music.js';

const BASE = [
  { id: 'warmup', weight: 0.1, tools: ['metronome', 'exercises'] },
  { id: 'technique', weight: 0.25, tools: ['exercises'] },
  { id: 'triads', weight: 0.15, tools: ['triads'] },
  { id: 'theory', weight: 0.15, tools: ['quiz'] },
  { id: 'jam', weight: 0.25, tools: ['jam', 'backing'] },
  { id: 'ear', weight: 0.1, tools: ['ear'] },
];

const SCALES = [['scale', 'pentatonicMinor'], ['scale', 'major'], ['scale', 'dorian'], ['scale', 'mixolydian'], ['arpeggio', 'major7'], ['arpeggio', 'dominant7'], ['arpeggio', 'minor7']];
const JAMS = ['blues12', 'twofiveone', 'pop4', 'andalusian', 'funk2', 'minorblues'];
const TRIAD_TYPES = ['maj', 'm', 'maj7', 'm7', '7'];

/** Minutos acumulados por herramienta → factor de equilibrio (menos practicado = más peso). */
function balance(totals, tools) {
  const spent = tools.reduce((s, t) => s + (totals[t] ?? 0), 0);
  return 1 / (1 + spent / 120);
}

/**
 * @param {object} o
 * @param {number} o.minutes tiempo total disponible (10–120)
 * @param {Array<{key:string,rate:number}>} [o.weak] puntos débiles del quiz
 * @param {object} [o.totals] minutos por herramienta
 */
export function buildRoutine({ minutes = 30, root = 'A', weak = [], totals = {}, due = 0, rng = Math.random }) {
  const total = Math.max(10, Math.min(120, Math.round(minutes)));
  const weights = BASE.map((b) => {
    let w = b.weight * (0.6 + 0.8 * balance(totals, b.tools));
    if (b.id === 'theory' && (weak.length || due > 0)) w *= 1.5;
    return { ...b, w };
  });
  const sum = weights.reduce((s, b) => s + b.w, 0);
  let blocks = weights.map((b) => ({ ...b, min: Math.max(0, Math.round((b.w / sum) * total)) }));
  // Los bloques de menos de 3 minutos se funden con el mayor.
  const small = blocks.filter((b) => b.min < 3);
  const keep = blocks.filter((b) => b.min >= 3);
  const bonus = small.reduce((s, b) => s + b.min, 0);
  if (keep.length) keep.sort((a, b) => b.min - a.min)[0].min += bonus;
  blocks = BASE.map((b) => keep.find((k) => k.id === b.id)).filter(Boolean);
  // Ajusta el redondeo para que sume exactamente `total`.
  let diff = total - blocks.reduce((s, b) => s + b.min, 0);
  let i = 0;
  while (diff !== 0 && blocks.length) {
    const b = blocks[i % blocks.length];
    if (diff > 0) { b.min += 1; diff -= 1; } else if (b.min > 3) { b.min -= 1; diff += 1; }
    i += 1;
    if (i > 500) break;
  }
  const [famA, qualA] = pick(SCALES, rng);
  const jamId = pick(JAMS, rng);
  const triadType = pick(TRIAD_TYPES, rng);
  const out = blocks.map((b) => {
    switch (b.id) {
      case 'warmup':
        return { id: b.id, minutes: b.min, tool: 'metronome', title: 'Calentamiento', params: { bpm: 70 }, why: 'Manos sueltas: notas lentas y limpias con el metrónomo.' };
      case 'technique':
        return { id: b.id, minutes: b.min, tool: 'exercises', title: 'Escalas y arpegios', params: { root, fam: famA, q: qualA }, why: 'Una secuencia en una posición; sube el tempo solo cuando salga limpia.' };
      case 'triads':
        return { id: b.id, minutes: b.min, tool: 'triads', title: 'Tríadas e inversiones', params: { root, q: triadType, view: 'inv' }, why: 'Toca cada inversión en un juego de cuerdas y nómbrala en voz alta.' };
      case 'theory':
        return { id: b.id, minutes: b.min, tool: 'quiz', title: 'Teoría y mástil', params: {}, why: due > 0 ? `Tienes ${due} tarjetas por repasar hoy.` : weak.length ? 'Repasa tus puntos débiles.' : 'Notas del mástil e intervalos.' };
      case 'jam':
        return { id: b.id, minutes: b.min, tool: 'jam', title: 'Jam sobre una base', params: { prog: jamId, root, focus: 'chord' }, why: 'Primero solo notas del acorde; luego la escala completa.' };
      default:
        return { id: b.id, minutes: b.min, tool: 'ear', title: 'Oído', params: {}, why: 'Intervalos y acordes de oído.' };
    }
  });
  return { total, blocks: out };
}
