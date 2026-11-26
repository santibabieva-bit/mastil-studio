/**
 * Digitación de la mano izquierda según los estándares de enseñanza
 * (Leavitt/Berklee, CAGED, 3 notas por cuerda). Puro: se prueba en Node.
 *
 * - Una posición = un conjunto de notas que se toca sin mover la mano.
 * - Un dedo por traste dentro de una ventana de 4 trastes; como mucho un
 *   traste de estiramiento (índice hacia atrás o meñique hacia delante).
 * - Posición abierta: cuerdas al aire = 0, traste 1 = dedo 1, traste 2 = 2…
 * - 3 notas por cuerda: tono-tono 1-2-4, tono-semitono 1-3-4,
 *   semitono-tono 1-2-4.
 * - En una misma cuerda, un traste más agudo nunca lleva un dedo menor o igual.
 */

const key = (n) => `${n.s}-${n.f}`;

/** Dedos de una cuerda con 3 notas (escalas de 3 notas por cuerda). */
export function threePerString(frets) {
  const [a, b, c] = frets;
  const d1 = b - a;
  const d2 = c - b;
  if (d1 === 1 && d2 === 1) return [1, 2, 3];
  if (d1 === 2 && d2 === 1) return [1, 3, 4];
  if (d1 === 1 && d2 === 2) return [1, 2, 4];
  if (d1 === 2 && d2 === 2) return [1, 2, 4];
  // Saltos mayores (escalas exóticas): reparto proporcional dentro de la mano.
  return [1, Math.min(3, 1 + d1), 4];
}

/** Hace que los dedos de una cuerda suban con el traste, sin salir de 1-4. */
function fixString(list, stretched = false) {
  // list: [{ f, finger }] ordenada por traste, solo notas pisadas.
  for (let i = 1; i < list.length; i += 1) if (list[i].finger <= list[i - 1].finger) list[i].finger = list[i - 1].finger + 1;
  if (list.length && list[list.length - 1].finger > 4) {
    list[list.length - 1].finger = 4;
    for (let i = list.length - 2; i >= 0; i -= 1) if (list[i].finger >= list[i + 1].finger) list[i].finger = list[i + 1].finger - 1;
  }
  for (const x of list) x.finger = Math.max(1, Math.min(4, x.finger));
  // La nota estirada fuera de la ventana: una 3.ª menor en la cuerda va con 1-4
  // (índice estirado atrás o meñique estirado delante), un tono con 1-3 o 2-4.
  for (let i = 1; stretched && i < list.length; i += 1) {
    const gap = list[i].f - list[i - 1].f;
    const need = Math.min(3, gap);
    if (list[i].finger - list[i - 1].finger < need) {
      if (list[i - 1].finger - (need - (list[i].finger - list[i - 1].finger)) >= 1 && i === 1) list[i - 1].finger = list[i].finger - need;
      else if (list[i - 1].finger + need <= 4 && i === list.length - 1) list[i].finger = list[i - 1].finger + need;
    }
  }
}

/**
 * Dedos de una posición. notes: [{ s, f }]. Devuelve Map «s-f» → dedo.
 * `mode`: 'auto' (detecta 3 notas por cuerda), 'window' o '3nps'.
 */
export function fingerPosition(notes, { mode = 'auto', grip = false, openChord = false } = {}) {
  const out = new Map();
  const fretted = notes.filter((n) => n.f > 0);
  for (const n of notes) if (n.f === 0) out.set(key(n), 0);
  if (!fretted.length) return out;
  if (grip && new Set(fretted.map((n) => n.s)).size === fretted.length) {
    for (const [k, v] of gripFingers(fretted, notes.some((n) => n.f === 0))) out.set(k, v);
    return out;
  }
  const byString = new Map();
  for (const n of fretted) {
    if (!byString.has(n.s)) byString.set(n.s, new Set());
    byString.get(n.s).add(n.f);
  }
  const strings = [...byString.entries()].map(([s, set]) => [s, [...set].sort((a, b) => a - b)]);
  const threeCount = strings.filter(([, fs]) => fs.length === 3).length;
  // Posición abierta de verdad: cuerdas al aire y todo dentro de los cinco primeros trastes.
  const openPos = notes.some((n) => n.f === 0) && Math.min(...fretted.map((n) => n.f)) <= 4 && Math.max(...fretted.map((n) => n.f)) <= 5;
  // En posición abierta manda la convención de primera posición (traste = dedo).
  const use3 = mode === '3nps' || (mode === 'auto' && !openPos && threeCount >= 3 && strings.every(([, fs]) => fs.length <= 3));
  if (use3) {
    for (const [s, fs] of strings) {
      let fingers;
      if (fs.length === 3) fingers = threePerString(fs);
      else if (fs.length === 2) fingers = [1, Math.min(4, 1 + (fs[1] - fs[0]))];
      else fingers = [1];
      fs.forEach((f, i) => out.set(`${s}-${f}`, fingers[i]));
    }
    return out;
  }
  const frets = fretted.map((n) => n.f);
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  const strFrets = strings.map(([, fs]) => fs);
  // ¿Algún tono entero (o más) de una misma cuerda queda con dedos contiguos?
  const cramped = (fingerOf) => strFrets.some((fs) => fs.some((f, i) => i > 0 && f - fs[i - 1] >= 2 && fingerOf(f) - fingerOf(fs[i - 1]) < 2));
  let fingerOf;
  let stretched = false;
  if (openPos) fingerOf = (f) => f; // posición abierta: traste = dedo
  else if (hi - lo <= 3) fingerOf = (f) => f - lo + 1;
  else {
    // Cinco trastes. Primero, una ventana de 4 con un estiramiento: el índice hacia
    // atrás (preferido, como en Leavitt) o el meñique hacia delante, según qué
    // extremo deje menos notas fuera.
    const outside = (b) => frets.filter((f) => f < b || f > b + 3).length;
    const base = outside(lo) < outside(lo + 1) ? lo : lo + 1;
    fingerOf = (f) => f - base + 1;
    stretched = true;
    // Si queda un traste libre en medio, repartir los cuatro dedos sin estirar
    // (trastes 6, 9 y 10 → 1, 3 y 4) — solo si así ningún tono va con dedos contiguos.
    if (hi - lo === 4) {
      const free = [lo + 3, lo + 2, lo + 1].find((f) => !frets.includes(f));
      if (free != null) {
        const used = [lo, lo + 1, lo + 2, lo + 3, lo + 4].filter((f) => f !== free);
        const map = new Map(used.map((f, i) => [f, i + 1]));
        if (!cramped((f) => map.get(f))) { fingerOf = (f) => map.get(f); stretched = false; }
      }
    }
  }
  for (const [s, fs] of strings) {
    const list = fs.map((f) => ({ f, finger: fingerOf(f) }));
    fixString(list, stretched);
    for (const x of list) out.set(`${s}-${x.f}`, x.finger);
  }
  if (openPos && openChord) openChordFingers(fretted, out);
  return out;
}

/**
 * Agarre de un acorde (una nota por cuerda, todas a la vez).
 * - El traste más bajo con varias cuerdas va en cejilla con el índice
 *   (en posición abierta, con dedos distintos: La = 1-2-3).
 * - Primero se prueba un dedo por traste (Do en 5-5-3 → 3-4-1); si no cabe,
 *   los dedos van seguidos por traste y, dentro del traste, de la cuerda grave
 *   a la aguda (C7 en 7-8-5-8 → 2-3-1-4; Cm7 en 10-8-8-6 → 4-2-3-1).
 */
function gripFingers(fretted, hasOpen) {
  const byFret = new Map();
  for (const n of fretted) {
    if (!byFret.has(n.f)) byFret.set(n.f, []);
    byFret.get(n.f).push(n.s);
  }
  const frets = [...byFret.keys()].sort((a, b) => a - b);
  const lo = frets[0];
  // En posición abierta (cuerdas al aire y todo en los cuatro primeros trastes) el dedo es el traste.
  const firstPos = hasOpen && frets[frets.length - 1] <= 4;
  const natural = (f) => (firstPos ? f : f - lo + 1);
  // Orden: por traste y, dentro del traste, de la cuerda grave a la aguda.
  const order = [];
  frets.forEach((f, k) => {
    const ss = [...byFret.get(f)].sort((a, b) => b - a);
    const barre = k === 0 && ss.length > 1 && !hasOpen;
    ss.forEach((s, i) => order.push({ s, f, barre, i, n: ss.length }));
  });
  const result = (vals) => new Map(order.map((o, k) => [`${o.s}-${o.f}`, vals[k]]));
  // 1) Un dedo por traste (Do en 5-5-3 → 3-4-1; Do abierto x-3-2-0 → 3-2).
  const vals = [];
  let prev = 0;
  for (const o of order) {
    // En primera posición, varias cuerdas en el mismo traste empiezan antes (La = 1-2-3, Mi = 2-3 con el 1 en el traste 1).
    const want = firstPos && o.n > 1 && o.i === 0 ? Math.max(1, natural(o.f) - (o.n - 1)) : natural(o.f);
    const v = o.barre ? 1 : Math.max(prev + 1, want);
    vals.push(v);
    prev = v;
  }
  if (Math.max(...vals) <= 4) return result(vals);
  // 2) No cabe: el más agudo va al meñique y los demás bajan conservando el orden
  //    y, en lo posible, la distancia (C7 7-8-5-8 → 2-3-1-4; dim 8-6-4 → 4-3-1).
  const capped = [...vals];
  capped[capped.length - 1] = 4;
  for (let k = capped.length - 2; k >= 0; k -= 1) {
    if (order[k].barre && order[k + 1].barre) capped[k] = capped[k + 1];
    else capped[k] = Math.min(capped[k], capped[k + 1] - (order[k].f === order[k + 1].f || !order[k + 1].barre ? 1 : 0));
  }
  if (capped.every((v) => v >= 1)) return result(capped);
  // 3) Último recurso: dedos seguidos.
  return result(order.map((o, k) => Math.min(4, k + 1)));
}

/**
 * Posición abierta: varias cuerdas pisadas en el mismo traste (la forma de La
 * en el traste 2) llevan dedos distintos, de la cuerda grave a la aguda, a
 * partir del siguiente dedo libre (La: 1-2-3; Mi: 2-3 con el 1 en el traste 1).
 */
function openChordFingers(fretted, out) {
  const strCount = new Map();
  for (const n of fretted) strCount.set(n.s, (strCount.get(n.s) ?? 0) + 1);
  const byFret = new Map();
  for (const n of fretted) {
    if (strCount.get(n.s) !== 1) continue;
    if (!byFret.has(n.f)) byFret.set(n.f, []);
    byFret.get(n.f).push(n.s);
  }
  for (const [f, ss] of [...byFret.entries()].sort((a, b) => a[0] - b[0])) {
    if (ss.length < 2 || f < 2) continue;
    const lower = fretted.filter((n) => n.f < f).map((n) => out.get(key(n)) ?? 0);
    const start = (lower.length ? Math.max(...lower) : 0) + 1;
    if (start + ss.length - 1 > 4) continue;
    [...ss].sort((a, b) => b - a).forEach((s, i) => out.set(`${s}-${f}`, start + i));
  }
}

/** Devuelve las notas con su dedo (sin pisar los que ya traen). */
export function withFingers(notes, opts) {
  const map = fingerPosition(notes, opts);
  return notes.map((n) => (n.finger != null ? n : { ...n, finger: map.get(key(n)) }));
}

/**
 * Dedos de una doble cuerda (low = cuerda más grave). La mano se coloca para
 * cada par: misma altura → 2-3; aguda por encima → índice abajo; aguda por
 * debajo → índice arriba (sextas: 2-1, 3-1); octavas → 1-3 o 1-4.
 */
export function fingerDouble(low, high) {
  if (low.f === 0 && high.f === 0) return [0, 0];
  if (low.f === 0) return [0, Math.min(4, Math.max(1, high.f))];
  if (high.f === 0) return [Math.min(4, Math.max(1, low.f)), 0];
  const d = high.f - low.f;
  if (d === 0) return [2, 3];
  if (d > 0) return [1, Math.min(4, d + 1)];
  if (d === -1) return [2, 1];
  if (d === -2) return [3, 1];
  return [4, 1];
}

/**
 * Dedo de una nota cromática (aproximación) respecto a su objetivo: el dedo
 * vecino del que toca el objetivo; si no hay vecino (1 desde abajo o 4 desde
 * arriba), el mismo dedo deslizando.
 */
export function approachFinger(note, target) {
  if (note.f === 0) return 0;
  if (target.f === 0) return Math.min(4, Math.max(1, note.f));
  const tf = target.finger ?? 1;
  if (note.s === target.s) {
    const f = tf + (note.f - target.f);
    return Math.max(1, Math.min(4, f));
  }
  return Math.max(1, Math.min(4, tf + (note.f - target.f)));
}

/** Comprueba una posición: problemas de digitación (para pruebas e informes). */
export function fingeringIssues(notes) {
  const issues = [];
  const byString = new Map();
  for (const n of notes) {
    if (n.f === 0) { if (n.finger && n.finger !== 0) issues.push(`cuerda ${n.s + 1}: aire con dedo ${n.finger}`); continue; }
    if (!(n.finger >= 1 && n.finger <= 4)) { issues.push(`cuerda ${n.s + 1} traste ${n.f}: sin dedo`); continue; }
    if (!byString.has(n.s)) byString.set(n.s, new Map());
    byString.get(n.s).set(n.f, n.finger);
  }
  for (const [s, m] of byString) {
    const list = [...m.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i += 1) {
      if (list[i][1] <= list[i - 1][1]) issues.push(`cuerda ${s + 1}: traste ${list[i - 1][0]} dedo ${list[i - 1][1]} y traste ${list[i][0]} dedo ${list[i][1]}`);
    }
    const span = list[list.length - 1][0] - list[0][0];
    const fingerSpan = list[list.length - 1][1] - list[0][1];
    if (span - fingerSpan > 1) issues.push(`cuerda ${s + 1}: estiramiento de ${span - fingerSpan} trastes`);
  }
  return issues;
}
