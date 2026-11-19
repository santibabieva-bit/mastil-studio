/**
 * Mapa de calor del mástil: aciertos, fallos y velocidad por cada punto
 * (cuerda, traste), con repetición espaciada para decidir qué practicar. Puro.
 *
 * Un «mapa» es { "s:f": { ok, miss, ms, box, due, last } }.
 */

import { dueWeight, reviewCard } from './srs.js';
import { mod } from './music.js';

export const STANDARD_MIDI = [64, 59, 55, 50, 45, 40];
export const FAST_MS = 2500;
export const SLOW_MS = 6000;

const key = (s, f) => `${s}:${f}`;
export const parseKey = (k) => { const [s, f] = k.split(':').map(Number); return { s, f }; };

/** Registra una respuesta en un punto. ms es opcional (tiempo de respuesta). */
export function recordSpot(map, s, f, ok, ms = null, now = Date.now()) {
  const k = key(s, f);
  const prev = map?.[k];
  const card = reviewCard(prev, ok, now);
  const msAvg = ok && ms != null && ms > 0
    ? (prev?.ms ? Math.round(prev.ms * 0.6 + ms * 0.4) : Math.round(ms))
    : (prev?.ms ?? null);
  return {
    ...(map ?? {}),
    [k]: {
      ok: (prev?.ok ?? 0) + (ok ? 1 : 0),
      miss: (prev?.miss ?? 0) + (ok ? 0 : 1),
      ms: msAvg,
      box: card.box,
      due: card.due,
      last: card.last,
    },
  };
}

/** Dominio de un punto, de 0 a 1; null si no hay datos. Mezcla precisión y velocidad. */
export function mastery(cell) {
  if (!cell) return null;
  const n = cell.ok + cell.miss;
  if (!n) return null;
  const acc = cell.ok / n;
  const sp = cell.ms == null ? 1
    : cell.ms <= FAST_MS ? 1
      : cell.ms >= SLOW_MS ? 0.5
        : 1 - 0.5 * ((cell.ms - FAST_MS) / (SLOW_MS - FAST_MS));
  // Con pocos intentos no nos fiamos: se tira hacia 0,5.
  const conf = Math.min(1, n / 4);
  return acc * sp * conf + 0.5 * (1 - conf);
}

/** Cuadrícula completa para pintar: [{ s, f, pc, mastery, seen }]. */
export function mapGrid(map, { strings = [0, 1, 2, 3, 4, 5], maxFret = 12 } = {}) {
  const cells = [];
  for (const s of strings) {
    for (let f = 0; f <= maxFret; f += 1) {
      const c = map?.[key(s, f)];
      cells.push({ s, f, pc: mod(STANDARD_MIDI[s] + f, 12), mastery: mastery(c), seen: c ? c.ok + c.miss : 0, ms: c?.ms ?? null });
    }
  }
  return cells;
}

/** Los puntos más flojos con al menos un intento (o fallo), peores primero. */
export function weakestSpots(map, count = 8) {
  return Object.entries(map ?? {})
    .map(([k, c]) => ({ ...parseKey(k), mastery: mastery(c), miss: c.miss, ms: c.ms }))
    .filter((x) => x.mastery != null && x.mastery < 0.85)
    .sort((a, b) => a.mastery - b.mastery || b.miss - a.miss)
    .slice(0, count);
}

/** Dominio medio por cuerda (solo cuerdas con datos) y % del mástil visto. */
export function stringSummary(map, { maxFret = 12 } = {}) {
  return [0, 1, 2, 3, 4, 5].map((s) => {
    let sum = 0;
    let seen = 0;
    for (let f = 0; f <= maxFret; f += 1) {
      const m = mastery(map?.[key(s, f)]);
      if (m != null) { sum += m; seen += 1; }
    }
    return { s, seen, total: maxFret + 1, avg: seen ? sum / seen : null };
  });
}

export function coverage(map, { maxFret = 12 } = {}) {
  const all = mapGrid(map, { maxFret });
  const seen = all.filter((c) => c.mastery != null);
  const solid = seen.filter((c) => c.mastery >= 0.85);
  return { total: all.length, seen: seen.length, solid: solid.length, pct: solid.length / all.length };
}

/**
 * Elige puntos para practicar, priorizando los vencidos, los nuevos y los
 * flojos. Sin repetir y sin cuerdas/trastes fuera del rango.
 */
export function pickSpots(map, { count = 10, strings = [0, 1, 2, 3, 4, 5], maxFret = 12, rng = Math.random, now = Date.now() } = {}) {
  const pool = [];
  for (const s of strings) {
    for (let f = 0; f <= maxFret; f += 1) {
      const c = map?.[key(s, f)];
      const m = mastery(c);
      const w = dueWeight(c, now) * (m == null ? 1 : 1 + (1 - m) * 2);
      pool.push({ s, f, w });
    }
  }
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((a, p) => a + p.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i += 1) { r -= pool[i].w; if (r <= 0) break; }
    const [p] = pool.splice(i, 1);
    out.push({ s: p.s, f: p.f, pc: mod(STANDARD_MIDI[p.s] + p.f, 12) });
  }
  return out;
}

/** Color de una celda: gris sin datos, rojo→verde según dominio. */
export function heatColor(m) {
  if (m == null) return null;
  const hue = Math.round(m * 120); // 0 rojo … 120 verde
  return `hsl(${hue} 62% 58%)`;
}
