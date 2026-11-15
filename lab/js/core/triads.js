/**
 * Tríadas y cuatríadas por juegos de cuerdas e inversiones, conducción de
 * voces entre acordes (mínimo movimiento) y arpegios por posición con
 * digitación recomendada. Puro: se prueba en Node.
 */

import { mod } from './music.js';
import { CHORD_TYPES, chordPcs, stringSetVoicings } from './chords.js';
import { chordTones, scalePcs } from './jam.js';

export const INVERSION_LABELS = ['Fundamental', '1.ª inversión', '2.ª inversión', '3.ª inversión'];

/** Juegos de cuerdas adyacentes (índices con 0 = aguda) para n notas. */
export function stringSets(tuning, n = 3) {
  const out = [];
  for (let top = 0; top + n <= tuning.length; top += 1) out.push(Array.from({ length: n }, (_, i) => top + i));
  return out;
}

export function stringSetLabel(set) {
  return `${set[0] + 1}-${set[set.length - 1] + 1}`;
}

/** Todos los voicings (cada cuerda una nota distinta) del acorde en un juego de cuerdas. */
export function voicingsOnSet({ tuning, rootPc, typeId, set, inversion = null, maxFret = 15, maxSpan = 4 }) {
  const pcs = chordPcs(rootPc, typeId);
  const all = stringSetVoicings({ tuning, pcs, rootPc, maxFret, maxSpan });
  // Un voicing con cuerdas al aire sólo es práctico si el resto queda cerca de la cejilla.
  return all.filter((v) => v.strings[0] === set[0]
    && (inversion == null || v.inversion === inversion)
    && !(v.notes.some((n) => n.f === 0) && v.high > 5));
}

/** Voicings agrupados por inversión: { 0: [...], 1: [...], 2: [...] }. */
export function voicingsByInversion({ tuning, rootPc, typeId, set, maxFret = 15, maxSpan = 4 }) {
  const out = {};
  const n = CHORD_TYPES[typeId].intervals.length;
  for (let i = 0; i < n; i += 1) out[i] = voicingsOnSet({ tuning, rootPc, typeId, set, inversion: i, maxFret, maxSpan });
  return out;
}

const voicingMidis = (tuning, v) => v.notes.map((n) => tuning[n.s] + n.f).sort((a, b) => a - b);

/** Movimiento total entre dos voicings: suma de distancias entre notas ordenadas por altura. */
export function movementBetween(tuning, a, b) {
  const ma = voicingMidis(tuning, a);
  const mb = voicingMidis(tuning, b);
  const n = Math.min(ma.length, mb.length);
  let total = 0;
  for (let i = 0; i < n; i += 1) total += Math.abs(ma[i] - mb[i]);
  // Penaliza ligeramente el salto de traste medio (la mano se desplaza).
  const center = (v) => v.notes.reduce((s, x) => s + x.f, 0) / v.notes.length;
  return total + Math.abs(center(a) - center(b)) * 0.2;
}

/**
 * Elige un voicing por acorde minimizando el movimiento total (Viterbi).
 * `chords`: [{ rootPc, typeId }]. `set` fija el juego de cuerdas; si es
 * null, se permiten los juegos cuyo número de cuerdas coincide.
 * Devuelve [{ chord, voicing, move }] (move = movimiento desde el anterior).
 */
export function voiceLeadPath({ tuning, chords, set = null, maxFret = 15, maxSpan = 4 }) {
  const layers = chords.map((chord) => {
    const n = CHORD_TYPES[chord.typeId].intervals.length;
    const sets = set ? [set] : stringSets(tuning, n);
    const candidates = [];
    for (const s of sets) {
      if (s.length !== n) continue;
      candidates.push(...voicingsOnSet({ tuning, rootPc: chord.rootPc, typeId: chord.typeId, set: s, maxFret, maxSpan }));
    }
    return candidates;
  });
  if (layers.some((l) => !l.length)) return [];
  const best = layers.map((layer) => layer.map(() => ({ cost: Infinity, prev: -1 })));
  layers[0].forEach((_, i) => { best[0][i] = { cost: layers[0][i].low * 0.05, prev: -1 }; });
  for (let l = 1; l < layers.length; l += 1) {
    layers[l].forEach((cand, i) => {
      layers[l - 1].forEach((prev, j) => {
        const cost = best[l - 1][j].cost + movementBetween(tuning, prev, cand);
        if (cost < best[l][i].cost) best[l][i] = { cost, prev: j };
      });
    });
  }
  let idx = best[layers.length - 1].reduce((bi, x, i, arr) => (x.cost < arr[bi].cost ? i : bi), 0);
  const path = [];
  for (let l = layers.length - 1; l >= 0; l -= 1) {
    path[l] = idx;
    idx = best[l][idx].prev;
  }
  return path.map((i, l) => ({
    chord: chords[l],
    voicing: layers[l][i],
    move: l === 0 ? 0 : Math.round(movementBetween(tuning, layers[l - 1][path[l - 1]], layers[l][i]) * 10) / 10,
  }));
}

/** Escala madre sugerida para una tríada/acorde. */
export function parentScale(rootPc, typeId) {
  const map = {
    maj: 'major', maj7: 'major', 6: 'major', add9: 'major', maj9: 'major',
    m: 'naturalMinor', m7: 'dorian', m6: 'dorian', m9: 'dorian', mMaj7: 'melodicMinor',
    7: 'mixolydian', 9: 'mixolydian', '7sus4': 'mixolydian', sus4: 'mixolydian', sus2: 'major', 5: 'major',
    dim: 'locrian', m7b5: 'locrian', dim7: 'diminished', aug: 'augmented', '7#5': 'augmented',
  };
  const quality = map[typeId] ?? 'major';
  return { rootPc, quality, pcs: new Set(scalePcs(rootPc, quality)) };
}

/**
 * Superposición de dos acordes: devuelve { shared, onlyA, onlyB } de pcs y
 * una etiqueta de rol para cada nota (para colorear).
 */
export function overlayChords(a, b) {
  const ta = chordTones(a.rootPc, a.typeId);
  const tb = chordTones(b.rootPc, b.typeId);
  const pa = new Set(ta.map((t) => t.pc));
  const pb = new Set(tb.map((t) => t.pc));
  return {
    shared: [...pa].filter((pc) => pb.has(pc)),
    onlyA: [...pa].filter((pc) => !pb.has(pc)),
    onlyB: [...pb].filter((pc) => !pa.has(pc)),
    tonesA: ta,
    tonesB: tb,
  };
}

/**
 * Posiciones de un arpegio/acorde: ventanas de `width` trastes alrededor de
 * cada tónica en las cuerdas graves. Cada nota lleva el dedo recomendado
 * (1 = índice… 4 = meñique, un dedo por traste de la ventana).
 */
export function arpeggioPositions({ tuning, rootPc, typeId, width = 5, maxFret = 15 }) {
  const pcs = chordPcs(rootPc, typeId);
  const tones = chordTones(rootPc, typeId);
  const labelOf = new Map(tones.map((t) => [t.pc, t]));
  const seen = new Set();
  const positions = [];
  for (let from = 0; from + width - 1 <= maxFret + 0; from += 1) {
    const to = from + width - 1;
    const notes = [];
    for (let s = 0; s < tuning.length; s += 1) {
      for (let f = from; f <= to; f += 1) {
        const pc = mod(tuning[s] + f, 12);
        if (!pcs.includes(pc)) continue;
        const tone = labelOf.get(pc);
        notes.push({ s, f, pc, midi: tuning[s] + f, finger: f === 0 ? 0 : Math.min(4, f - from + 1), role: tone.role, label: tone.label });
      }
    }
    const strings = new Set(notes.map((n) => n.s));
    if (strings.size < tuning.length) continue;
    const key = notes.map((n) => `${n.s}-${n.f}`).join('|');
    if (seen.has(key)) continue;
    // Ventanas sin tónica no son posiciones útiles para estudiar.
    if (!notes.some((n) => n.pc === rootPc)) continue;
    seen.add(key);
    positions.push({ from, to, notes });
  }
  // Quita ventanas contenidas en otra (conserva la más centrada).
  return positions.filter((p, i) => !positions.some((q, j) => j !== i && q.notes.length > p.notes.length
    && p.notes.every((n) => q.notes.some((m) => m.s === n.s && m.f === n.f)) && q.from <= p.from + 1));
}

/** Nombre CAGED aproximado de una posición según la cuerda de la tónica grave. */
export function positionLabel(position, rootPc, tuning) {
  const low = tuning.length - 1;
  for (const s of [low, low - 1, low - 2]) {
    const n = position.notes.find((x) => x.s === s && x.pc === rootPc);
    if (n) return `Tónica en cuerda ${tuning.length - s}, traste ${n.f}`;
  }
  return `Trastes ${position.from}–${position.to}`;
}
