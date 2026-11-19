/**
 * Voces guía y aterrizaje graduado. La 3.ª y la 7.ª definen la calidad de un
 * acorde; seguirlas de acorde en acorde (la 7.ª baja un semitono hasta la 3.ª
 * del siguiente en un ii-V-I) es el atajo que usan los improvisadores para
 * que la línea «cuente» la armonía. Puro.
 */

import { mod } from './music.js';
import { CHORD_TYPES } from './chords.js';

/** Calidades que no tienen 3.ª definida. */
const NO_THIRD = new Set(['5', 'sus2', 'sus4', '7sus4']);

/**
 * 3.ª y 7.ª de un acorde (pc y rol). Si el acorde no tiene 7.ª (tríada),
 * la 6.ª (acordes de sexta) o la 5.ª hacen de segunda voz guía.
 * @returns {{ third: number|null, seventh: number|null, second: 'seventh'|'sixth'|'fifth' }}
 */
export function guideTones(rootPc, typeId) {
  const type = CHORD_TYPES[typeId] ?? CHORD_TYPES.maj;
  const iv = type.intervals;
  const third = NO_THIRD.has(typeId) ? null : (iv.find((i) => i === 3 || i === 4) ?? null);
  const seventh = iv.find((i) => i === 10 || i === 11 || (typeId === 'dim7' && i === 9)) ?? null;
  const sixth = iv.includes(9) && seventh == null ? 9 : null;
  let secondInterval = seventh;
  let second = 'seventh';
  if (secondInterval == null && sixth != null) { secondInterval = sixth; second = 'sixth'; }
  if (secondInterval == null) {
    const fifth = iv.find((i) => i === 6 || i === 7 || i === 8) ?? null;
    secondInterval = fifth;
    second = 'fifth';
  }
  return {
    third: third == null ? null : mod(rootPc + third, 12),
    thirdInterval: third,
    seventh: secondInterval == null ? null : mod(rootPc + secondInterval, 12),
    seventhInterval: secondInterval,
    second,
  };
}

/** Distancia más corta entre dos pitch classes, en semitonos (0–6). */
export function pcDistance(a, b) {
  const d = mod(a - b, 12);
  return Math.min(d, 12 - d);
}

/** Etiqueta legible del rol de la segunda voz guía. */
export const SECOND_LABEL = { seventh: '7.ª', sixth: '6.ª', fifth: '5.ª' };

/**
 * Línea de voces guía para una progresión: en cada acorde elige la 3.ª o la
 * 7.ª que quede más cerca (por semitonos) de la voz anterior. El primer
 * acorde arranca en la 3.ª (o en `start: 'seventh'`).
 * @param {Array<{rootPc:number,typeId:string}>} chords
 * @returns {Array<{ chordIndex, pc, role:'third'|'seventh', label, motion:number|null, resolves:boolean }>}
 */
export function guideLine(chords, { start = 'third' } = {}) {
  const out = [];
  let prev = null;
  chords.forEach((chord, i) => {
    const g = guideTones(chord.rootPc, chord.typeId);
    const options = [];
    if (g.third != null) options.push({ role: 'third', pc: g.third, label: '3.ª' });
    if (g.seventh != null) options.push({ role: 'seventh', pc: g.seventh, label: SECOND_LABEL[g.second] });
    if (!options.length) options.push({ role: 'third', pc: chord.rootPc, label: 'tónica' });
    let pick;
    if (prev == null) pick = options.find((o) => o.role === start) ?? options[0];
    else {
      pick = [...options].sort((a, b) => pcDistance(a.pc, prev.pc) - pcDistance(b.pc, prev.pc)
        || (a.role === 'third' ? -1 : 1))[0];
    }
    const motion = prev == null ? null : pcDistance(pick.pc, prev.pc);
    out.push({
      chordIndex: i,
      pc: pick.pc,
      role: pick.role,
      label: pick.label,
      motion,
      // 7.ª → 3.ª (o la voz que sea) por semitono/tono: la resolución clásica.
      resolves: prev != null && prev.role === 'seventh' && pick.role === 'third' && motion <= 2,
    });
    prev = pick;
  });
  return out;
}

/** Notas de tensión (9, 13…) disponibles sobre un acorde, sin chocar con su calidad. */
export function tensionTones(rootPc, typeId) {
  const type = CHORD_TYPES[typeId] ?? CHORD_TYPES.maj;
  const have = new Set(type.intervals.map((i) => mod(i, 12)));
  const out = [];
  const add = (interval, label) => { if (!have.has(interval)) out.push({ pc: mod(rootPc + interval, 12), interval, label }); };
  switch (typeId) {
    case 'maj': case 'maj7': case 'maj9': case '6':
      add(2, '9'); add(9, '13'); add(6, '♯11'); break;
    case 'm': case 'm7': case 'm9': case 'm6':
      add(2, '9'); add(5, '11'); break;
    case '7': case '9':
      add(2, '9'); add(9, '13'); break;
    case 'm7b5':
      add(5, '11'); break;
    default:
      add(2, '9');
  }
  return out;
}

/**
 * Niveles del reto de aterrizaje, de menos a más exigente.
 *  - `kinds`: qué notas valen como objetivo.
 */
export const LANDING_LEVELS = [
  { id: 'root', label: '1 · Tónica', kinds: ['root'], hint: 'Aterriza en la tónica del acorde: el reposo más fácil.' },
  { id: 'chord', label: '2 · Tónica, 3.ª o 5.ª', kinds: ['root', 'third', 'fifth'], hint: 'Cualquier nota de la tríada.' },
  { id: 'third', label: '3 · La 3.ª', kinds: ['third'], hint: 'La 3.ª dice si el acorde es mayor o menor: la nota más informativa.' },
  { id: 'seventh', label: '4 · La 7.ª', kinds: ['seventh'], hint: 'La 7.ª da el color del acorde (maj7, m7, dominante).' },
  { id: 'guide', label: '5 · Voces guía (3.ª/7.ª que se mueven poco)', kinds: ['guide'], hint: 'Elige la 3.ª o la 7.ª más cercana a la nota anterior: la 7.ª baja a la 3.ª.' },
  { id: 'tension', label: '6 · Tensiones (9, 13, ♯11)', kinds: ['tension'], hint: 'Aterriza en una extensión: suena a jazz, pero resuelve bien dentro de la escala.' },
];

export function landingLevel(id) {
  return LANDING_LEVELS.find((l) => l.id === id) ?? LANDING_LEVELS[1];
}

const ROLE_LABEL = { root: 'tónica', third: '3.ª', fifth: '5.ª', seventh: '7.ª' };

/**
 * Objetivo de aterrizaje para un acorde según el nivel.
 * `prev` = objetivo anterior ({ pc }) para elegir voces guía por cercanía.
 * @returns {{ pc:number, role:string, label:string }}
 */
export function landingTarget({ chord, level = 'chord', prev = null, rng = Math.random }) {
  const lv = landingLevel(level);
  const g = guideTones(chord.rootPc, chord.typeId);
  const type = CHORD_TYPES[chord.typeId] ?? CHORD_TYPES.maj;
  const tonesByRole = {
    root: { pc: mod(chord.rootPc, 12), role: 'root', label: ROLE_LABEL.root },
    third: g.third == null ? null : { pc: g.third, role: 'third', label: ROLE_LABEL.third },
    fifth: (() => {
      const f = type.intervals.find((i) => i === 6 || i === 7 || i === 8);
      return f == null ? null : { pc: mod(chord.rootPc + f, 12), role: 'fifth', label: ROLE_LABEL.fifth };
    })(),
    seventh: g.seventh == null ? null : { pc: g.seventh, role: 'seventh', label: SECOND_LABEL[g.second] },
  };
  const fallback = tonesByRole.root;
  if (lv.kinds[0] === 'guide') {
    const options = [tonesByRole.third, tonesByRole.seventh].filter(Boolean);
    if (!options.length) return fallback;
    if (!prev) return options[Math.floor(rng() * options.length)];
    return [...options].sort((a, b) => pcDistance(a.pc, prev.pc) - pcDistance(b.pc, prev.pc))[0];
  }
  if (lv.kinds[0] === 'tension') {
    const t = tensionTones(chord.rootPc, chord.typeId);
    if (!t.length) return fallback;
    const pickT = t[Math.floor(rng() * t.length)];
    return { pc: pickT.pc, role: 'tension', label: pickT.label };
  }
  const pool = lv.kinds.map((k) => tonesByRole[k]).filter(Boolean);
  if (!pool.length) return fallback;
  return pool[Math.floor(rng() * pool.length)];
}

/** Sugiere subir de nivel tras un reto: ≥80 % con al menos 8 aterrizajes. */
export function suggestLevel(currentId, { hits, total }) {
  const i = LANDING_LEVELS.findIndex((l) => l.id === currentId);
  if (total >= 8 && hits / total >= 0.8 && i < LANDING_LEVELS.length - 1) {
    return { next: LANDING_LEVELS[i + 1].id, text: `Subes bien: prueba el nivel «${LANDING_LEVELS[i + 1].label}».` };
  }
  if (total >= 8 && hits / total < 0.4 && i > 0) {
    return { next: LANDING_LEVELS[i - 1].id, text: `Aún cuesta: afianza el nivel «${LANDING_LEVELS[i - 1].label}» antes de seguir.` };
  }
  return null;
}
