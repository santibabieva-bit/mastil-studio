/**
 * Movimiento en el mástil: la lógica pura detrás del diapasón animado.
 * Posición de la mano, digitaciones alternativas, cruces de púa, rutas por la
 * escala, formas de intervalo, transformación de modos, mapa de tensiones,
 * pregunta-respuesta, cuantizado de frases dibujadas y variaciones.
 *
 * Un «paso» es { notes: [{ s, f, midi, finger?, pick?, art? }], d } donde d es
 * la duración en pulsos. Un paso con notes vacío es un silencio.
 */

import { mod, pcName } from './music.js';
import { CHORD_TYPES } from './chords.js';
import { scalePcs } from './jam.js';

export const STANDARD = [64, 59, 55, 50, 45, 40];

/* ───────────── pasos ───────────── */

/** Normaliza notas sueltas ([s,f,d] o {s,f}) a pasos. */
export function toSteps(list, tuning = STANDARD, d = 1) {
  return list.map((n) => {
    if (Array.isArray(n)) return { notes: [{ s: n[0], f: n[1], midi: tuning[n[0]] + n[1] }], d: n[2] ?? d };
    if (n.notes) return { d, ...n, notes: n.notes.map((x) => ({ ...x, midi: x.midi ?? tuning[x.s] + x.f })) };
    return { notes: [{ ...n, midi: n.midi ?? tuning[n.s] + n.f }], d: n.d ?? d };
  });
}

/** Instante (en pulsos) en que empieza cada paso. */
export function stepTimes(steps) {
  let t = 0;
  return steps.map((st) => { const at = t; t += st.d ?? 1; return at; });
}

export const totalBeats = (steps) => steps.reduce((a, st) => a + (st.d ?? 1), 0);

/* ───────────── mano izquierda ───────────── */

/**
 * Ventana de la mano (4 trastes) en cada paso. Solo se mueve cuando una nota
 * cae fuera; si la nota trae dedo, la ventana se coloca para ese dedo.
 * @returns [{ from, to, shift }]
 */
export function handPositions(steps, span = 4) {
  // Se agrupan los pasos en tramos que caben en una ventana de `span` trastes,
  // mirando hacia delante: la ventana de cada tramo la fija su traste más bajo
  // (o el dedo que traiga una nota), no la primera nota que suena.
  const frettedOf = (st) => st.notes.filter((n) => n.f > 0);
  const out = new Array(steps.length);
  let i = 0;
  let prevFrom = null;
  while (i < steps.length) {
    let lo = Infinity;
    let hi = -Infinity;
    let anchor = null;
    let j = i;
    for (; j < steps.length; j += 1) {
      const fr = frettedOf(steps[j]);
      if (!fr.length) continue;
      const nlo = Math.min(lo, ...fr.map((n) => n.f));
      const nhi = Math.max(hi, ...fr.map((n) => n.f));
      if (nhi - nlo > span - 1 && lo !== Infinity) break;
      lo = nlo;
      hi = nhi;
      anchor ??= fr.find((n) => n.finger >= 1 && n.finger <= 4) ?? null;
    }
    let from = lo === Infinity ? (prevFrom ?? 1) : lo;
    if (anchor) {
      const want = anchor.f - (anchor.finger - 1);
      if (want <= lo && want + span - 1 >= hi) from = want;
    }
    from = Math.max(1, from);
    for (let k = i; k < Math.max(j, i + 1); k += 1) out[k] = { from, to: from + span - 1, shift: k === i && prevFrom != null && from !== prevFrom };
    prevFrom = from;
    i = Math.max(j, i + 1);
  }
  return out;
}

/** Dedo para una nota dentro de una ventana (0 = al aire). */
export function fingerFor(f, win) {
  if (f === 0) return 0;
  return Math.max(1, Math.min(4, f - win.from + 1));
}

/**
 * Los cuatro dedos sobre el mástil en un paso: el que pisa y los que quedan
 * preparados (cerca de su traste, sin apretar). Para la «mano fantasma».
 */
export function fingerLayout(step, win) {
  const pressed = new Map();
  for (const n of step.notes) {
    if (n.f === 0) continue;
    const finger = n.finger >= 1 && n.finger <= 4 ? n.finger : fingerFor(n.f, win);
    pressed.set(finger, { s: n.s, f: n.f });
  }
  const ref = step.notes.find((n) => n.f > 0) ?? step.notes[0] ?? { s: 2 };
  return [1, 2, 3, 4].map((finger) => {
    const p = pressed.get(finger);
    if (p) return { finger, s: p.s, f: p.f, down: true };
    return { finger, s: ref.s, f: win.from + finger - 1, down: false };
  });
}

/** Recorrido de la mano (trastes) y cambios de cuerda de una secuencia. */
export function travel(steps) {
  const hands = handPositions(steps);
  let frets = 0;
  let strings = 0;
  let shifts = 0;
  for (let i = 1; i < steps.length; i += 1) {
    frets += Math.abs(hands[i].from - hands[i - 1].from);
    if (hands[i].shift) shifts += 1;
    const a = steps[i - 1].notes[0];
    const b = steps[i].notes[0];
    if (a && b) strings += Math.abs(a.s - b.s);
  }
  return { frets, strings, shifts };
}

/**
 * Coloca una secuencia de alturas en el mástil con una estrategia:
 *  - 'position': la mano se mueve lo menos posible (cruza cuerdas);
 *  - 'string': se queda en la misma cuerda y desliza (horizontal);
 *  - 'region': como 'position' pero cerca del traste `center`.
 * Programación dinámica sobre las posiciones posibles de cada nota.
 */
export function placeSequence(midis, { tuning = STANDARD, strategy = 'position', center = 5, maxFret = 17 } = {}) {
  const cands = midis.map((m) => {
    const list = [];
    for (let s = 0; s < tuning.length; s += 1) {
      const f = m - tuning[s];
      if (f >= 0 && f <= maxFret) list.push({ s, f, midi: m });
    }
    return list;
  });
  if (cands.some((c) => !c.length)) return null;
  // Coste de una nota respecto a la ventana de la mano centrada en `c` (trastes c-1 … c+2).
  const outside = (f, c) => (f === 0 ? 0.5 : Math.max(0, c - 1 - f, f - (c + 2)));
  const solve = (c) => {
    const startCost = (x) => (strategy === 'string' ? Math.abs(x.f - center) * 0.1 : outside(x.f, c) * 3);
    const move = (a, b) => {
      const df = Math.abs(a.f - b.f);
      const ds = Math.abs(a.s - b.s);
      if (strategy === 'string') return ds * 3 + df * 0.4;
      return outside(b.f, c) * 3 + ds * 0.3 + df * 0.2;
    };
    const best = cands.map((layer) => layer.map(() => ({ cost: Infinity, prev: -1 })));
    cands[0].forEach((x, i) => { best[0][i] = { cost: startCost(x), prev: -1 }; });
    for (let l = 1; l < cands.length; l += 1) {
      cands[l].forEach((x, i) => {
        cands[l - 1].forEach((p, j) => {
          const cost = best[l - 1][j].cost + move(p, x);
          if (cost < best[l][i].cost) best[l][i] = { cost, prev: j };
        });
      });
    }
    const last = best[best.length - 1];
    let idx = last.reduce((bi, x, i) => (x.cost < last[bi].cost ? i : bi), 0);
    const cost = last[idx].cost;
    const out = [];
    for (let l = cands.length - 1; l >= 0; l -= 1) {
      out[l] = cands[l][idx];
      idx = best[l][idx].prev;
    }
    return { out, cost };
  };
  if (strategy !== 'position') return solve(center).out;
  // Por posición: busca la ventana de la mano en la que la frase cabe mejor.
  let bestRun = null;
  for (let c = 1; c <= maxFret - 2; c += 1) {
    const run = solve(c);
    run.cost += Math.abs(c - center) * 0.1;
    if (!bestRun || run.cost < bestRun.cost - 1e-9) bestRun = run;
  }
  return bestRun.out;
}

/** Dos digitaciones de la misma frase para compararlas (por posición y por cuerda). */
export function compareFingerings(steps, tuning = STANDARD) {
  const midis = steps.map((st) => st.notes[0]?.midi).filter((m) => m != null);
  const ds = steps.filter((st) => st.notes.length).map((st) => st.d ?? 1);
  const fretted = steps.flatMap((st) => st.notes).filter((n) => n.f > 0);
  const center = fretted.length ? Math.round(fretted.reduce((a, n) => a + n.f, 0) / fretted.length) : 5;
  const build = (strategy) => {
    const placed = placeSequence(midis, { tuning, strategy, center });
    if (!placed) return null;
    const out = placed.map((p, i) => ({ notes: [{ ...p }], d: ds[i] }));
    const hands = handPositions(out);
    out.forEach((st, i) => { st.notes[0].finger = fingerFor(st.notes[0].f, hands[i]); });
    return { strategy, steps: out, travel: travel(out) };
  };
  return [build('position'), build('string')].filter(Boolean);
}

/* ───────────── púa ───────────── */

/**
 * Tipo de cruce de cuerda entre dos notas con púa: 'inside' (la púa queda
 * entre las dos cuerdas) u 'outside' (tiene que saltar por fuera). null si no
 * hay cambio de cuerda o falta la dirección.
 * Cuerda 0 = aguda. Una púa hacia abajo termina del lado de la cuerda más aguda.
 */
export function crossingType(prev, cur) {
  if (!prev || !cur || prev.s === cur.s || !prev.pick) return null;
  const towardTreble = cur.s < prev.s;
  if (prev.pick === 'D') return towardTreble ? 'inside' : 'outside';
  return towardTreble ? 'outside' : 'inside';
}

/** Púa alterna estricta para pasos de una nota si no la traen. */
export function withPicking(steps, start = 'D') {
  let dir = start;
  return steps.map((st) => {
    if (!st.notes.length) return st;
    const notes = st.notes.map((n) => ({ ...n, pick: n.pick ?? (n.art === 'H' || n.art === 'P' ? null : dir) }));
    if (notes[0].pick) dir = notes[0].pick === 'D' ? 'U' : 'D';
    return { ...st, notes };
  });
}

/* ───────────── revelado progresivo ───────────── */

/**
 * Qué notas se ven en la ronda `round` (0 = todas) de `rounds`: en cada ronda
 * se ocultan más, empezando por las del medio; en la última, ninguna visible.
 */
export function revealMask(n, round, rounds = 4) {
  if (round <= 0) return Array(n).fill(true);
  if (round >= rounds - 1) return Array(n).fill(false);
  // Orden de ocultación: primero las interiores, la primera y la última al final.
  const order = [];
  for (let i = 1; i < n - 1; i += 2) order.push(i);
  for (let i = 2; i < n - 1; i += 2) order.push(i);
  order.push(n - 1, 0);
  const hide = Math.round((n * round) / (rounds - 1));
  const hidden = new Set(order.slice(0, hide));
  return Array.from({ length: n }, (_, i) => !hidden.has(i));
}

/* ───────────── ruta por la escala (laberinto) ───────────── */

/** Notas de la escala en el mástil, con su altura. */
export function scaleNodes(pcs, { tuning = STANDARD, maxFret = 12 } = {}) {
  const set = new Set(pcs.map((p) => mod(p, 12)));
  const out = [];
  for (let s = 0; s < tuning.length; s += 1) {
    for (let f = 0; f <= maxFret; f += 1) if (set.has(mod(tuning[s] + f, 12))) out.push({ s, f, midi: tuning[s] + f });
  }
  return out;
}

/** ¿Se puede ir de a a b en un paso? Grado vecino de la escala, cuerda igual o contigua, hasta 4 trastes. */
export function isScaleStep(a, b, pcs) {
  if (Math.abs(a.s - b.s) > 1 || Math.abs(a.f - b.f) > 4) return false;
  const set = new Set(pcs.map((p) => mod(p, 12)));
  const dir = Math.sign(b.midi - a.midi);
  if (!dir) return false;
  let m = a.midi + dir;
  while (!set.has(mod(m, 12))) m += dir;
  return m === b.midi;
}

/** Ruta más corta (en notas) entre dos posiciones moviéndose por grados de la escala. */
export function shortestScalePath(start, end, pcs, { tuning = STANDARD, maxFret = 12 } = {}) {
  const nodes = scaleNodes(pcs, { tuning, maxFret });
  const key = (n) => `${n.s}:${n.f}`;
  const byKey = new Map(nodes.map((n) => [key(n), n]));
  const a = byKey.get(key(start));
  const b = byKey.get(key(end));
  if (!a || !b) return null;
  const prev = new Map([[key(a), null]]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift();
    if (key(cur) === key(b)) break;
    // Vecinos ordenados por distancia en trastes: entre rutas igual de cortas, la más compacta.
    const next = nodes.filter((n) => !prev.has(key(n)) && isScaleStep(cur, n, pcs))
      .sort((x, y) => Math.abs(x.f - cur.f) - Math.abs(y.f - cur.f));
    for (const n of next) { prev.set(key(n), cur); queue.push(n); }
  }
  if (!prev.has(key(b))) return null;
  const path = [];
  for (let n = b; n; n = prev.get(key(n))) path.unshift(n);
  return path;
}

/** Comprueba una ruta del usuario: { ok, valid, length, best, why }. */
export function checkScalePath(path, start, end, pcs, opts = {}) {
  const best = shortestScalePath(start, end, pcs, opts);
  const same = (x, y) => x && y && x.s === y.s && x.f === y.f;
  if (!path.length || !same(path[0], start)) return { ok: false, valid: false, why: 'La ruta tiene que empezar en el punto de salida.', best };
  for (let i = 1; i < path.length; i += 1) {
    if (!isScaleStep(path[i - 1], path[i], pcs)) return { ok: false, valid: false, at: i, why: `El paso ${i} no va al grado vecino de la escala (o salta demasiado).`, best };
  }
  if (!same(path[path.length - 1], end)) return { ok: false, valid: true, why: 'Aún no has llegado a la meta.', best };
  const optimal = best ? best.length : path.length;
  return { ok: true, valid: true, length: path.length, best, optimal, perfect: path.length <= optimal, why: path.length <= optimal ? '¡Ruta óptima!' : `Llegaste en ${path.length} notas; se puede en ${optimal}.` };
}

/* ───────────── intervalos como formas ───────────── */

/**
 * Dónde cae un intervalo desde una nota en la cuerda `s`: en la misma cuerda
 * y en las dos cuerdas más agudas. `crossesB` marca el ajuste de la cuerda de Si.
 */
export function intervalTargets(s, f, semis, { tuning = STANDARD, maxFret = 15 } = {}) {
  const out = [];
  const from = tuning[s] + f;
  for (const t of [s, s - 1, s - 2]) {
    if (t < 0) continue;
    const tf = from + semis - tuning[t];
    if (tf < 0 || tf > maxFret || Math.abs(tf - f) > 5) continue;
    const crossesB = (s >= 2 && t <= 1) && t !== s;
    out.push({ s: t, f: tf, df: tf - f, crossesB });
  }
  return out;
}

/** Todas las parejas (tónica → intervalo) de un pc en el mástil. */
export function intervalMap(rootPc, semis, { tuning = STANDARD, maxFret = 12 } = {}) {
  const out = [];
  for (let s = 0; s < tuning.length; s += 1) {
    for (let f = 0; f <= maxFret; f += 1) {
      if (mod(tuning[s] + f, 12) !== mod(rootPc, 12)) continue;
      for (const t of intervalTargets(s, f, semis, { tuning, maxFret })) out.push({ from: { s, f }, to: { s: t.s, f: t.f }, df: t.df, crossesB: t.crossesB, same: t.s === s });
    }
  }
  return out;
}

/* ───────────── modos que se transforman ───────────── */

/** Modos de la escala mayor del más brillante al más oscuro. */
export const BRIGHTNESS = ['lydian', 'major', 'mixolydian', 'dorian', 'naturalMinor', 'phrygian', 'locrian'];
export const MODE_LABEL = {
  lydian: 'Lidio', major: 'Jónico (mayor)', mixolydian: 'Mixolidio', dorian: 'Dórico', naturalMinor: 'Eólico (menor)', phrygian: 'Frigio', locrian: 'Locrio',
};
const DEGREE_NAMES = ['1', '2', '3', '4', '5', '6', '7'];
const ALTER = { '-1': '♭', 0: '', 1: '♯' };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Etiqueta del grado (♭3, ♯4…) respecto a la escala mayor. */
export function degreeName(degree, interval) {
  const d = interval - MAJOR[degree];
  return `${ALTER[d] ?? ''}${DEGREE_NAMES[degree]}`;
}

/** Diferencias grado a grado entre dos modos: [{ degree, from, to, delta, name }]. */
export function modeMorph(fromQ, toQ) {
  const a = scalePcs(0, fromQ);
  const b = scalePcs(0, toQ);
  const out = [];
  for (let i = 0; i < 7; i += 1) if (a[i] !== b[i]) out.push({ degree: i, from: a[i], to: b[i], delta: b[i] - a[i], name: degreeName(i, b[i]) });
  return out;
}

/**
 * Notas de un modo en el mástil con una clave estable por grado y octava, para
 * que al cambiar de modo la misma nota se deslice en lugar de desaparecer.
 */
export function modeBoard(rootPc, quality, { tuning = STANDARD, maxFret = 12 } = {}) {
  const ivs = scalePcs(0, quality);
  const out = [];
  for (let s = 0; s < tuning.length; s += 1) {
    for (let f = 0; f <= maxFret; f += 1) {
      const midi = tuning[s] + f;
      const rel = mod(midi - rootPc, 12);
      const degree = ivs.indexOf(rel);
      if (degree < 0) continue;
      const octave = Math.floor((midi - rootPc - ivs[degree]) / 12);
      out.push({ s, f, midi, degree, name: degreeName(degree, ivs[degree]), key: `${s}:${octave}:${degree}` });
    }
  }
  return out;
}

/* ───────────── mapa de tensión ───────────── */

const TENSION_LABEL = { 1: '♭9', 2: '9', 3: '♯9', 5: '11', 6: '♯11', 8: '♭13', 9: '13', 10: '♭7', 11: '7' };

/**
 * Clasifica las notas de una escala sobre un acorde:
 * 'chord' (reposo), 'tension' (color disponible) o 'avoid' (choca: p. ej. la 4.ª
 * sobre un acorde mayor o ♭9 sobre un acorde que no es dominante).
 */
export function tensionMap(chord, pcs) {
  const type = CHORD_TYPES[chord.typeId] ?? CHORD_TYPES.maj;
  const ivs = new Set(type.intervals.map((i) => mod(i, 12)));
  const major3 = ivs.has(4);
  const minor3 = ivs.has(3) && !major3;
  const dominant = major3 && ivs.has(10);
  return [...new Set(pcs.map((p) => mod(p, 12)))].map((pc) => {
    const iv = mod(pc - chord.rootPc, 12);
    let kind = 'tension';
    let why = 'Color disponible: suena a tensión que resuelve bien.';
    if (ivs.has(iv)) { kind = 'chord'; why = 'Nota del acorde: reposo seguro.'; } else if (major3 && iv === 5) { kind = 'avoid'; why = 'La 4.ª choca con la 3.ª mayor (semitono por encima): úsala de paso.'; } else if (iv === 1 && !dominant) { kind = 'avoid'; why = 'El ♭9 choca con la tónica fuera de un dominante.'; } else if (minor3 && iv === 8) { kind = 'avoid'; why = 'La ♭6 choca con la 5.ª del acorde menor: de paso, no de reposo.'; } else if (dominant && [1, 3, 8].includes(iv)) { why = 'Tensión alterada del dominante: mucha fuerza hacia la resolución.'; }
    return { pc, interval: iv, kind, why, label: ivs.has(iv) ? chordToneLabel(iv) : TENSION_LABEL[iv] ?? String(iv) };
  });
}

function chordToneLabel(iv) {
  return { 0: 'T', 3: '♭3', 4: '3', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7', 2: '9', 5: '11' }[iv] ?? String(iv);
}

/* ───────────── pregunta y respuesta ───────────── */

/**
 * Frase «pregunta» de 2 compases: por grados de la escala alrededor de una
 * caja, que termina en una nota que NO es del acorde (deja la pregunta abierta).
 */
export function callPhrase({ pcs, chordPcs, low = 57, high = 76, length = 6, rng = Math.random }) {
  const pool = [];
  for (let m = low; m <= high; m += 1) if (pcs.includes(mod(m, 12))) pool.push(m);
  let i = Math.floor(rng() * pool.length);
  const notes = [];
  for (let k = 0; k < length; k += 1) {
    notes.push(pool[i]);
    const step = rng() < 0.75 ? 1 : 2;
    const dir = (i <= 1 ? 1 : i >= pool.length - 2 ? -1 : (rng() < 0.5 ? -1 : 1));
    i = Math.max(0, Math.min(pool.length - 1, i + dir * step));
  }
  // Última nota fuera del acorde, por grado conjunto.
  const last = notes[notes.length - 1];
  if (chordPcs.includes(mod(last, 12))) {
    const alt = pool.find((m) => Math.abs(m - last) <= 2 && m !== last && !chordPcs.includes(mod(m, 12)));
    if (alt) notes[notes.length - 1] = alt;
  }
  // Ritmo: 2 compases de 4 pulsos, la última nota larga.
  const rhythm = length >= 6 ? [1, 0.5, 0.5, 1, 1, 4] : [1, 1, 1, 1, 4];
  return notes.map((midi, k) => ({ midi, d: rhythm[k] ?? 1 }));
}

/**
 * Evalúa una respuesta: { ok, score, notes, endsOnChord, why[] }.
 * Pide al menos 3 notas, acabar en nota del acorde y no copiar la pregunta.
 */
export function judgeResponse(played, { chordPcs, call = [] }) {
  const notes = played.filter((m) => m != null);
  const why = [];
  let score = 0;
  if (notes.length >= 3) score += 35; else why.push('Responde con al menos 3 notas.');
  const endsOnChord = notes.length > 0 && chordPcs.includes(mod(notes[notes.length - 1], 12));
  if (endsOnChord) score += 40; else why.push('Termina en una nota del acorde para cerrar la frase.');
  const copy = call.length && notes.length === call.length && notes.every((m, i) => m === call[i].midi);
  if (!copy && notes.length) score += 15; else if (copy) why.push('Es una copia exacta: varía algo de la pregunta.');
  const range = notes.length ? Math.max(...notes) - Math.min(...notes) : 0;
  if (range >= 3 && range <= 14) score += 10; else if (notes.length) why.push(range < 3 ? 'Mueve un poco más la melodía.' : 'Saltos muy grandes: busca una frase cantable.');
  return { ok: score >= 75, score, notes, endsOnChord, why };
}

/* ───────────── dibujar frases ───────────── */

/**
 * Cuantiza una frase dibujada [{ s, f, t }] (t en ms) a duraciones en pulsos.
 * La última nota dura un pulso.
 */
export function quantizePhrase(points, { bpm = 90, sub = 2 } = {}) {
  const beatMs = 60000 / bpm;
  return points.map((p, i) => {
    const next = points[i + 1];
    const raw = next ? (next.t - p.t) / beatMs : 1;
    const d = Math.max(1 / sub, Math.min(4, Math.round(raw * sub) / sub));
    return { s: p.s, f: p.f, d };
  });
}

/* ───────────── variaciones ───────────── */

function diatonicShift(midi, pcs, steps) {
  const set = new Set(pcs.map((p) => mod(p, 12)));
  let m = midi;
  const dir = Math.sign(steps);
  if (!set.has(mod(m, 12))) return midi + steps; // nota cromática: desplazamiento cromático
  for (let k = 0; k < Math.abs(steps); k += 1) {
    m += dir;
    while (!set.has(mod(m, 12))) m += dir;
  }
  return m;
}

/**
 * Variaciones de una frase (pasos de una nota). `pcs` = escala de referencia.
 * Devuelve [{ id, label, why, steps }].
 */
export function phraseVariations(steps, { pcs, tuning = STANDARD } = {}) {
  const notes = steps.filter((st) => st.notes.length).map((st) => ({ midi: st.notes[0].midi, d: st.d ?? 1, s: st.notes[0].s, f: st.notes[0].f }));
  if (!notes.length) return [];
  const scale = pcs?.length ? pcs : [...new Set(notes.map((n) => mod(n.midi, 12)))];
  const avgFret = notes.reduce((a, n) => a + n.f, 0) / notes.length;
  const place = (list, strategy = 'position', center = avgFret) => {
    const placed = placeSequence(list.map((n) => n.midi), { tuning, strategy, center });
    return placed ? placed.map((p, i) => ({ notes: [{ ...p }], d: list[i].d })) : null;
  };
  const out = [];
  const add = (id, label, why, st) => { if (st) out.push({ id, label, why, steps: st }); };

  add('retro', 'Retrógrada', 'La misma frase al revés: mismas notas, otro dibujo melódico.',
    place([...notes].reverse().map((n, i) => ({ midi: n.midi, d: notes[i].d }))));

  const first = notes[0].midi;
  add('inversion', 'Inversión', 'Cada salto hacia arriba pasa a ser hacia abajo (dentro de la escala).',
    place(notes.map((n) => {
      const set = new Set(scale.map((p) => mod(p, 12)));
      let dist = 0;
      const dir = Math.sign(n.midi - first);
      for (let m = first; m !== n.midi; m += dir) if (set.has(mod(m + dir, 12))) dist += 1;
      return { midi: diatonicShift(first, scale, -dir * dist), d: n.d };
    })));

  add('sequence', 'Secuencia (un grado arriba)', 'La frase desplazada un grado de la escala: así se desarrollan los motivos.',
    place(notes.map((n) => ({ midi: diatonicShift(n.midi, scale, 1), d: n.d }))));

  const approached = [];
  notes.forEach((n, i) => {
    if (i % 2 === 1 || n.d >= 1) {
      const half = Math.min(0.5, n.d / 2);
      approached.push({ midi: n.midi - 1, d: half });
      approached.push({ midi: n.midi, d: n.d - half });
    } else approached.push(n);
  });
  add('approach', 'Con aproximaciones cromáticas', 'Un semitono por debajo antes de las notas largas: el sonido bebop.', place(approached.filter((n) => n.d > 0)));

  const otherCenter = avgFret >= 7 ? Math.max(1, avgFret - 5) : avgFret + 5;
  const elsewhere = placeSequence(notes.map((n) => n.midi), { tuning, strategy: 'region', center: otherCenter });
  if (elsewhere && elsewhere.some((p, i) => p.s !== notes[i].s || p.f !== notes[i].f)) {
    add('position', 'Otra posición', 'Las mismas alturas en otra zona del mástil: conecta posiciones.', elsewhere.map((p, i) => ({ notes: [{ ...p }], d: notes[i].d })));
  }

  const displaced = notes.map((n) => ({ notes: [{ s: n.s, f: n.f, midi: n.midi }], d: n.d }));
  if (displaced.length) add('displace', 'Desplazamiento rítmico', 'Empieza medio pulso tarde: la frase cae en otros acentos.', [{ notes: [], d: 0.5 }, ...displaced]);

  return out;
}

/* ───────────── utilidades de juego ───────────── */

/** Todas las posiciones de una nota (pc) en el mástil. */
export function positionsOf(pc, { tuning = STANDARD, maxFret = 12 } = {}) {
  const out = [];
  for (let s = 0; s < tuning.length; s += 1) for (let f = 0; f <= maxFret; f += 1) if (mod(tuning[s] + f, 12) === mod(pc, 12)) out.push({ s, f });
  return out;
}

/** Velocidad de caída de la lluvia (s por nota) según aciertos seguidos. */
export function rainSpeed(level) {
  return Math.max(2.2, 7 - level * 0.45);
}

export const noteLabel = (pc) => pcName(pc, 'sharp');
