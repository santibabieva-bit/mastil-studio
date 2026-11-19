/**
 * Rutina de práctica guiada: reparte el tiempo entre bloques (calentamiento,
 * técnica, tríadas, teoría, jam, oído) dando más peso a lo que has
 * practicado menos y a tus puntos débiles. Puro y reproducible con `rng`.
 */

import { pick } from './music.js';
import { DRILL_LIST } from './drills.js';

const BASE = [
  { id: 'warmup', weight: 0.1, tools: ['metronome', 'exercises'] },
  { id: 'technique', weight: 0.2, tools: ['drills', 'exercises'] },
  { id: 'timing', weight: 0.1, tools: ['timing'] },
  { id: 'pitch', weight: 0.06, tools: ['bendlab'] },
  { id: 'triads', weight: 0.15, tools: ['triads'] },
  { id: 'theory', weight: 0.15, tools: ['quiz'] },
  { id: 'jam', weight: 0.2, tools: ['jam', 'backing'] },
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
/** Elige un elemento evitando los usados recientemente (variación deliberada). */
function pickFresh(list, rng, recent, key = (x) => x) {
  const fresh = list.filter((x) => !recent.includes(key(x)));
  return pick(fresh.length ? fresh : list, rng);
}

/**
 * @param {Array<{id,label,tool,params}>} [o.objectives] objetivos del currículo para hoy (se intercalan)
 * @param {{weak:number,pct:number,worst?:string}} [o.neck] resumen del mapa del mástil (null si no hay datos)
 * @param {string[]} [o.recent] ids de drills/progresiones usados en sesiones recientes
 */
export function buildRoutine({ minutes = 30, root = 'A', weak = [], totals = {}, due = 0, focus = null, objectives = [], recent = [], neck = null, rng = Math.random }) {
  const full = Math.max(10, Math.min(120, Math.round(minutes)));
  // Sesiones largas: 3 minutos finales de estiramiento y vuelta a la calma.
  const cooldown = full >= 30 ? 3 : 0;
  const total = full - cooldown;
  const objective = objectives[0] ?? null;
  // En sesiones largas entra también el segundo objetivo (otra herramienta, para intercalar).
  const objectiveB = full >= 45 && objectives[1] && objectives[1].tool !== objective?.tool ? objectives[1] : null;
  const base = objective
    ? [{ id: 'objective', weight: 0.28, tools: [objective.tool] }, ...(objectiveB ? [{ id: 'objective-b', weight: 0.14, tools: [objectiveB.tool] }] : []), ...BASE]
    : BASE;
  // Hay datos del mapa y aún queda mástil por dominar: bloque de zonas débiles.
  const withNeck = neck && neck.pct < 0.9 ? [...base, { id: 'neckmap', weight: 0.12, tools: ['neckmap'] }] : base;
  const weights = withNeck.map((b) => {
    let w = b.weight * (0.6 + 0.8 * balance(totals, b.tools));
    if (focus && b.id === focus) w *= 1.8;
    if (b.id === 'theory' && (weak.length || due > 0)) w *= 1.5;
    if (b.id === 'neckmap' && neck.weak >= 3) w *= 1.5;
    return { ...b, w };
  });
  const sum = weights.reduce((s, b) => s + b.w, 0);
  let blocks = weights.map((b) => ({ ...b, min: Math.max(0, Math.round((b.w / sum) * total)) }));
  // Los bloques de menos de 3 minutos se funden con el mayor.
  let small = blocks.filter((b) => b.min < 3);
  let keep = blocks.filter((b) => b.min >= 3);
  if (!keep.length) {
    // Sesión muy corta: nos quedamos con los bloques de más peso.
    keep = [...blocks].sort((a, b) => b.w - a.w).slice(0, Math.max(1, Math.floor(total / 4))).map((b) => ({ ...b, min: 3 }));
    small = [];
  }
  const bonus = small.reduce((s, b) => s + b.min, 0);
  if (keep.length) keep.sort((a, b) => b.min - a.min)[0].min += bonus;
  blocks = withNeck.map((b) => keep.find((k) => k.id === b.id)).filter(Boolean);
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
  const jamId = pickFresh(JAMS, rng, recent);
  const triadType = pick(TRIAD_TYPES, rng);
  const drill = pickFresh(DRILL_LIST, rng, recent, (d) => d.id);
  const out = blocks.map((b) => {
    switch (b.id) {
      case 'objective':
        return { id: b.id, minutes: b.min, tool: objective.tool, title: `Objetivo: ${objective.label}`, params: objective.params ?? {}, why: objective.how ?? 'Siguiente puerta de tu currículo.', objective: objective.id };
      case 'objective-b':
        return { id: b.id, minutes: b.min, tool: objectiveB.tool, title: `Objetivo: ${objectiveB.label}`, params: objectiveB.params ?? {}, why: objectiveB.how ?? 'Segundo objetivo de tu currículo.', objective: objectiveB.id };
      case 'neckmap':
        return { id: b.id, minutes: b.min, tool: 'neckmap', title: 'Zonas débiles del mástil', params: {}, why: neck.weak ? `Tienes ${neck.weak} puntos flojos${neck.worst ? ` (el peor: ${neck.worst})` : ''}. Diez notas que insisten justo ahí.` : `Llevas el ${Math.round(neck.pct * 100)} % del mástil dominado: sigue llenándolo.` };
      case 'warmup':
        return { id: b.id, minutes: b.min, tool: 'metronome', title: 'Calentamiento', params: { bpm: 70 }, why: 'Manos sueltas: notas lentas y limpias con el metrónomo. Hombros bajos, muñecas rectas y respira.' };
      case 'technique':
        return { id: b.id, minutes: b.min, tool: 'drills', title: 'Drill técnico', params: { drill: drill.id }, why: `${drill.title}. Sube el tempo sólo con repeticiones limpias (escalera de velocidad).` };
      case 'timing':
        return { id: b.id, minutes: b.min, tool: 'timing', title: 'Medir el pulso', params: {}, why: 'Toca notas sueltas con el clic y mira tu desviación en milisegundos.' };
      case 'pitch':
        return { id: b.id, minutes: b.min, tool: 'bendlab', title: 'Bends y vibrato', params: {}, why: 'Comprueba con el micrófono que tus bends llegan a la nota y tu vibrato es regular.' };
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
  // Práctica intercalada: el objetivo se parte en dos tandas separadas por otros temas.
  const oi = out.findIndex((b) => b.id === 'objective');
  if (oi >= 0 && out[oi].minutes >= 10 && out.length >= 3) {
    const half = Math.floor(out[oi].minutes / 2);
    const first = { ...out[oi], minutes: out[oi].minutes - half, title: `${out[oi].title} (1/2)` };
    const second = { ...out[oi], id: 'objective-2', minutes: half, title: `${out[oi].title} (2/2)`, why: 'Segunda tanda: tras trabajar otros temas, recordarlo cuesta un poco y eso fija lo aprendido.' };
    out.splice(oi, 1, first);
    out.push(second);
  }
  if (cooldown) out.push({ id: 'cooldown', minutes: cooldown, tool: 'metronome', title: 'Vuelta a la calma', params: { bpm: 60 }, why: 'Toca algo lento y relajado y estira muñecas y dedos. Si notas dolor, para: no se toca a través del dolor.' });
  return { total: full, blocks: out };
}
