/**
 * Biblioteca de ejercicios de digitación y técnica de mano izquierda.
 *
 * Todos los ejercicios son generadores: funcionan en cualquier tonalidad,
 * afinación y posición. Los patrones (permutaciones de dedos, secuencias de
 * escala, intervalos, dobles cuerdas…) son conceptos pedagógicos habituales;
 * las secuencias se construyen aquí desde cero, no copian ningún método.
 *
 * Cada `build()` devuelve { beats, notes, warnings }:
 *   beats: [{ notes: [{ s, f, midi, finger, tech }] }]  (s = 0 cuerda aguda)
 *   notes: posiciones únicas {s, f} para resaltarlas en el mástil
 */

import { createNoteCollection, mod } from './music.js';
import { chordPcs } from './chords.js';
import { arpeggioPositions } from './triads.js';
import { approachFinger, fingerDouble, withFingers } from './fingers.js';
import { independenceEvents, permutations24 } from './drills.js';
import {
  PATTERNS, defaultPerString, intervalPattern, ladderPerString, rootPosition, positionLabel,
} from './exercises.js';

export const EX_FAMILIES = [
  { id: 'perm', label: 'Permutaciones de dedos', blurb: 'Independencia y coordinación: todas las ordenaciones de 1-2-3-4.' },
  { id: 'seq', label: 'Secuencias de escala', blurb: 'Un patrón que se desplaza grado a grado por la escala.' },
  { id: 'pent', label: 'Pentatónica y blues', blurb: 'Cajas pentatónicas con patrones para soltar la mano.' },
  { id: 'intervals', label: 'Intervalos melódicos', blurb: 'Terceras, cuartas, sextas… tocadas nota a nota.' },
  { id: 'double', label: 'Dobles cuerdas', blurb: 'Terceras, sextas y octavas en dos cuerdas a la vez o arpegiadas.' },
  { id: 'arp', label: 'Arpegios', blurb: 'Notas del acorde por posiciones del mástil.' },
  { id: 'legato', label: 'Legato', blurb: 'Hammer-ons y pull-offs: la mano izquierda hace el trabajo.' },
  { id: 'approach', label: 'Aproximaciones y enclosures', blurb: 'Cómo se llega a una nota del acorde: cromatismos y envolventes (fraseo bebop).' },
];

export const DIRECTIONS = [
  { value: 'up', label: '↑ Subir' },
  { value: 'down', label: '↓ Bajar' },
  { value: 'updown', label: '↑↓ Ida y vuelta' },
];

const FINGER_NAME = ['al aire', 'índice', 'corazón', 'anular', 'meñique'];
export const fingerName = (n) => FINGER_NAME[n] ?? String(n);

/* ───────────── utilidades ───────────── */

function range(from, to) {
  const out = [];
  for (let i = from; i < to; i += 1) out.push(i);
  return out;
}

/**
 * Dedos para notas que aún no los traen: todas se tratan como una sola
 * posición (un dedo por traste, estiramiento de un traste como mucho). Las
 * escaleras de escala ya llegan digitadas desde ladderFor.
 */
export function assignFingers(notes) {
  return withFingers(notes.map((n) => ({ ...n })));
}

function uniquePositions(notes) {
  const seen = new Set();
  const out = [];
  for (const n of notes) {
    const key = `${n.s}-${n.f}`;
    if (!seen.has(key)) { seen.add(key); out.push({ s: n.s, f: n.f }); }
  }
  return out;
}

function toBeats(notes) {
  return notes.map((n) => ({ notes: [{ s: n.s, f: n.f, midi: n.midi, finger: n.finger, tech: n.tech ?? [] }] }));
}

function resolveCollection(ex, o) {
  let quality = o.quality ?? 'major';
  if (ex.family === 'pent') quality = o.pent === 'major' ? 'pentatonicMajor' : o.pent === 'blues' ? 'blues' : 'pentatonicMinor';
  if (ex.fixedQuality) quality = ex.fixedQuality;
  return createNoteCollection(o.root ?? 'A', 'scale', quality);
}

function ladderFor(o, collection, positionOverride = null) {
  const pos = positionOverride ?? (o.position == null || o.position < 0 ? rootPosition(o.tuning, collection) : o.position);
  const count = positionLabel(o.tuning, collection, 0).count;
  // Cada posición se digita entera (caja, ventana con estiramiento o 3 notas por cuerda).
  return withFingers(ladderPerString({ tuning: o.tuning, collection, position: pos % count, maxFret: o.maxFret ?? 17 }).ladder);
}

/** Aplica un generador de índices sobre la escalera según la dirección. */
function directed(ladder, indexFn, direction = 'up') {
  const run = (list) => indexFn(list.length).filter((i) => i >= 0 && i < list.length).map((i) => ({ ...list[i] }));
  if (direction === 'up') return run(ladder);
  const down = run([...ladder].reverse());
  if (direction === 'down') return down;
  const up = run(ladder);
  if (up.length && down.length && up[up.length - 1].midi === down[0].midi) down.shift();
  return [...up, ...down];
}

/* ───────────── dobles cuerdas ───────────── */

const INTERVAL_SEMITONES = { 2: [3, 4], 3: [5, 6], 4: [6, 7], 5: [8, 9], 6: [10, 11], 7: [12, 12] };
export const DOUBLE_NAMES = { 2: 'Terceras', 3: 'Cuartas', 4: 'Quintas', 5: 'Sextas', 6: 'Séptimas', 7: 'Octavas' };

/** Pares de cuerdas (más grave, más aguda) adyacentes o saltando una. */
export function stringPairs(stringCount) {
  const out = [];
  for (let low = stringCount - 1; low >= 1; low -= 1) {
    out.push([low, low - 1]);
    if (low - 2 >= 0) out.push([low, low - 2]);
  }
  return out;
}

/** Pares de cuerdas que dan una octava (n + 1 pares) para ese intervalo y escala. */
export function availablePairs({ tuning, collection, k, maxFret = 17 }) {
  return stringPairs(tuning.length).filter((pair) => doubleStops({ tuning, collection, k, pair, maxFret }).length >= collection.notes.length);
}

export function stringPairLabel([low, high]) {
  const gap = low - high - 1;
  return `Cuerdas ${low + 1} y ${high + 1}${gap === 1 ? ' (saltando una)' : gap > 1 ? ` (saltando ${gap})` : ''}`;
}

/**
 * Pares de notas a distancia de `k` grados de la escala sobre un par de cuerdas,
 * subiendo por el mástil desde la primera tónica de la cuerda grave.
 */
export function doubleStops({ tuning, collection, k, pair, maxFret = 17, startFret = 0 }) {
  const [sLow, sHigh] = pair;
  const names = collection.notes;
  const n = names.length;
  const [minSemis, maxSemis] = INTERVAL_SEMITONES[k] ?? [3, 4];
  const rows = [];
  for (let f = 0; f <= maxFret; f += 1) {
    const midiLow = tuning[sLow] + f;
    const pc = mod(midiLow, 12);
    const degree = names.findIndex((x) => x.pc === pc);
    if (degree < 0) continue;
    const target = names[(degree + k) % n];
    let midiHigh = midiLow + 1;
    while (mod(midiHigh, 12) !== target.pc) midiHigh += 1;
    const semis = midiHigh - midiLow;
    if (semis < minSemis || semis > maxSemis) continue;
    const fHigh = midiHigh - tuning[sHigh];
    if (fHigh < 0 || fHigh > maxFret) continue;
    if (Math.abs(fHigh - f) > 5) continue;
    rows.push({ low: { s: sLow, f, midi: midiLow }, high: { s: sHigh, f: fHigh, midi: midiHigh }, degree });
  }
  // Una octava (n + 1 pares) empezando en una tónica: la primera a partir de
  // `startFret` que deje octava completa; si no, la última que quepa.
  const isRoot = (r) => names[r.degree].pc === collection.root.pc;
  const roots = rows.map((r, i) => (isRoot(r) ? i : -1)).filter((i) => i >= 0);
  if (!roots.length) return rows.slice(0, n + 1);
  const fits = roots.filter((i) => rows.length - i >= n + 1);
  const wanted = fits.find((i) => rows[i].low.f >= startFret) ?? fits[fits.length - 1] ?? roots[0];
  return rows.slice(wanted, wanted + n + 1);
}

/* ───────────── CAGED: terceras y sextas por forma ───────────── */

/**
 * Las cinco formas CAGED como ventana de trastes: cuerda de la tónica (0 = la
 * más grave) y cuántos trastes caben por debajo y por encima de esa tónica.
 */
const CAGED_SHAPES = {
  C: { rootString: 1, below: 3, above: 1 },
  A: { rootString: 1, below: 1, above: 3 },
  G: { rootString: 0, below: 3, above: 1 },
  E: { rootString: 0, below: 1, above: 3 },
  D: { rootString: 2, below: 1, above: 3 },
};
export const CAGED_ORDER = ['C', 'A', 'G', 'E', 'D'];

/**
 * Ventanas de las formas CAGED para esa tónica, ordenadas por traste. Cada
 * forma aparece también una octava más arriba (octave = 1) si cabe en el mástil.
 */
export function cagedShapes({ tuning, collection, maxFret = 17 }) {
  const out = [];
  for (const id of CAGED_ORDER) {
    const def = CAGED_SHAPES[id];
    const s = Math.max(0, tuning.length - 1 - def.rootString);
    let r = 0;
    while (mod(tuning[s] + r, 12) !== collection.root.pc) r += 1;
    if (r - def.below < -1) r += 12;
    for (let octave = 0; octave < 2; octave += 1) {
      const root = r + 12 * octave;
      const from = Math.max(0, root - def.below);
      const to = root + def.above;
      if (from <= maxFret) out.push({ id, from, to: Math.min(to, maxFret), rootFret: root, rootString: s, octave });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** Colores de cada zona CAGED (mástil del ejercicio). */
export const CAGED_COLORS = { C: '#3b73c9', A: '#2f8a57', G: '#d9761c', E: '#8a4fb0', D: '#b5456e' };

/**
 * Todas las notas de la escala sobre el mástil, cada una con las zonas CAGED a
 * las que pertenece (las zonas se solapan unos trastes: una nota puede tener 2 o 3).
 */
export function cagedBoard({ tuning, collection, maxFret = 17 }) {
  const shapes = cagedShapes({ tuning, collection, maxFret });
  const notes = [];
  for (let s = 0; s < tuning.length; s += 1) {
    for (let f = 0; f <= maxFret; f += 1) {
      const midi = tuning[s] + f;
      const note = collection.noteByPc.get(mod(midi, 12));
      if (!note) continue;
      const zones = [...new Set(CAGED_ORDER.filter((id) => shapes.some((z) => z.id === id && f >= z.from && f <= z.to)))];
      notes.push({ s, f, midi, name: note.name, zones, isRoot: note.pc === collection.root.pc });
    }
  }
  return { notes, shapes };
}

/** Todos los pares de cuerdas (más grave, más aguda), de cualquier separación. */
export function allStringPairs(stringCount) {
  const out = [];
  for (let low = stringCount - 1; low >= 1; low -= 1) {
    for (let high = low - 1; high >= 0; high -= 1) out.push([low, high]);
  }
  return out;
}

/** Cualquier par de cuerdas sirve: si están lejos, el intervalo se toca una o dos octavas arriba (décimas, treceavas…). */
export function cagedPairs(stringCount) {
  return allStringPairs(stringCount);
}

/**
 * Todas las dobles cuerdas de un intervalo dentro de la ventana [from, to] en un par de cuerdas.
 * El intervalo simple (tercera, sexta…) sube de octava lo que haga falta para alcanzar la cuerda aguda.
 */
export function doubleStopsIn({ tuning, collection, k, pair, from, to }) {
  const [sLow, sHigh] = pair;
  const names = collection.notes;
  const [minSemis] = INTERVAL_SEMITONES[k] ?? [3, 4];
  const rows = [];
  for (let f = from; f <= to; f += 1) {
    const midiLow = tuning[sLow] + f;
    const degree = names.findIndex((x) => x.pc === mod(midiLow, 12));
    if (degree < 0) continue;
    const target = names[(degree + k) % names.length];
    let midiHigh = midiLow + minSemis - 1;
    while (mod(midiHigh, 12) !== target.pc) midiHigh += 1;
    for (let oct = 0; oct < 3; oct += 1, midiHigh += 12) {
      const fHigh = midiHigh - tuning[sHigh];
      // la nota aguda puede asomar un par de trastes fuera de la ventana (estiramiento máximo de 5 trastes)
      if (fHigh < Math.max(0, from - 1) || fHigh > to + 2 || Math.abs(fHigh - f) > 5) continue;
      rows.push({ low: { s: sLow, f, midi: midiLow }, high: { s: sHigh, f: fHigh, midi: midiHigh }, degree });
    }
  }
  return rows;
}

function cagedExercise(k) {
  const name = DOUBLE_NAMES[k];
  const lower = name.toLowerCase();
  return {
    id: `caged-${k + 1}`,
    family: 'double',
    k,
    cagedParams: true,
    title: `CAGED por ${lower}`,
    desc: `Las ${lower} de la escala dentro de cada forma CAGED (C, A, G, E, D), en cualquier par de cuerdas (si están separadas, el intervalo sube de octava). Elige una forma, o encadena las cinco por el mástil.`,
    tip: k === 2
      ? 'Aprende cada forma con sus terceras: cuando las veas como «ventana» sobre el mástil, podrás armonizar cualquier melodía a dos voces sin pensar en acordes.'
      : 'Las sextas van saltando una cuerda: silencia la cuerda del medio con el dedo de la mano izquierda que ya está cerca, o toca con púa y dedos.',
    params: ['cagedShape', 'cagedPair', 'harmonic'],
    build(o, collection) {
      const tuning = o.tuning;
      const maxFret = o.maxFret ?? 17;
      const shapes = cagedShapes({ tuning, collection, maxFret });
      const chosen = o.shape && o.shape !== 'all' ? shapes.filter((x) => x.id === o.shape) : shapes;
      const pairs = cagedPairs(tuning.length);
      const picked = Array.isArray(o.cagedPair) ? pairs.filter((p) => p[0] === o.cagedPair[0] && p[1] === o.cagedPair[1]) : [];
      const wantedPairs = picked.length ? picked : pairs;
      const rows = [];
      // Un barrido ascendente por cada par de cuerdas, recorriendo las zonas elegidas.
      for (const pair of wantedPairs) {
        const seen = new Set();
        const part = [];
        for (const shape of chosen) {
          for (const r of doubleStopsIn({ tuning, collection, k, pair, from: shape.from, to: shape.to })) {
            const key = `${r.low.f}-${r.high.f}`;
            if (seen.has(key)) continue;
            seen.add(key);
            part.push(r);
          }
        }
        part.sort((a, b) => a.low.midi - b.low.midi || a.high.midi - b.high.midi);
        rows.push(...part);
      }
      if (!rows.length) return { notes: [], warnings: ['Esa forma no cabe en el mástil con esta afinación o par de cuerdas.'] };
      const list = o.direction === 'down' ? [...rows].reverse() : o.direction === 'updown' ? [...rows, ...[...rows].reverse().slice(1)] : rows;
      const beatRow = [];
      const beats = list.flatMap((r, i) => {
        const lo = { s: r.low.s, f: r.low.f, midi: r.low.midi, tech: [] };
        const hi = { s: r.high.s, f: r.high.f, midi: r.high.midi, tech: [] };
        if (o.harmonic === false) { beatRow.push(i, i); return [{ notes: [lo] }, { notes: [hi] }]; }
        beatRow.push(i);
        return [{ notes: [lo, hi] }];
      });
      return { beats: assignBeatFingers(beats), notes: list.flatMap((r) => [r.low, r.high]), rows: list, beatRow };
    },
  };
}


/* ───────────── aproximaciones y enclosures ───────────── */

/**
 * Coloca una altura MIDI en el mástil, de preferencia en la cuerda `prefer`
 * (o la más cercana) y dentro de [0, maxFret].
 */
export function placeMidi(tuning, midi, prefer, maxFret = 17) {
  const options = [];
  for (let s = 0; s < tuning.length; s += 1) {
    const f = midi - tuning[s];
    if (f >= 0 && f <= maxFret) options.push({ s, f, midi });
  }
  if (!options.length) return null;
  return options.sort((a, b) => Math.abs(a.s - prefer) - Math.abs(b.s - prefer) || a.f - b.f)[0];
}

/** Siguiente altura de la colección por encima (dir = 1) o por debajo (dir = -1). */
function scaleStep(collection, midi, dir) {
  let m = midi + dir;
  while (!collection.noteByPc.has(mod(m, 12))) m += dir;
  return m;
}

/** Cada aproximación devuelve las alturas MIDI a tocar antes del objetivo. */
export const APPROACH_KINDS = {
  below: {
    label: 'Cromática desde abajo',
    desc: 'Un semitono por debajo de cada nota del acorde y luego la nota. Es el recurso más simple y más usado.',
    tip: 'La nota de paso cae sobre un tiempo débil y la nota del acorde sobre el fuerte: así «tensa y resuelve».',
    pre: (t) => [t - 1],
  },
  above: {
    label: 'Cromática desde arriba',
    desc: 'Un semitono por encima de la nota del acorde y luego la nota.',
    tip: 'Suena algo más «dulce» que desde abajo; úsala cuando la línea ya viene descendiendo.',
    pre: (t) => [t + 1],
  },
  enclosure: {
    label: 'Enclosure (arriba diatónica, abajo cromática)',
    desc: 'Rodea la nota objetivo: primero la nota de escala de arriba, luego el semitono de abajo, y por fin la nota.',
    tip: 'La envolvente clásica del bebop. Dos notas de «aproximación» + una nota del acorde en el tiempo fuerte.',
    pre: (t, c) => [scaleStep(c, t, 1), t - 1],
  },
  enclosureChroma: {
    label: 'Enclosure cromático (semitono arriba y abajo)',
    desc: 'Semitono por encima, semitono por debajo y luego la nota del acorde.',
    tip: 'Tensión máxima en las dos notas de paso. Tócalo seguro, con la nota del acorde claramente en el pulso.',
    pre: (t) => [t + 1, t - 1],
  },
  enclosureLow: {
    label: 'Enclosure inverso (abajo diatónica, arriba cromática)',
    desc: 'La nota de escala de abajo, el semitono de arriba y luego la nota objetivo.',
    tip: 'Versión «espejo» del enclosure: cambia el sentido del giro y tus dedos lo notan.',
    pre: (t, c) => [scaleStep(c, t, -1), t + 1],
  },
};

function approachExercise(kind) {
  const def = APPROACH_KINDS[kind];
  return {
    id: `appr-${kind}`,
    family: 'approach',
    chromatic: true,
    title: def.label,
    desc: `${def.desc} Se aplica a las notas del acorde (1-3-5-7) de la escala elegida, en la posición escogida.`,
    tip: def.tip,
    needsPosition: true,
    build(o, collection) {
      const ladder = ladderFor(o, collection);
      const names = collection.notes;
      const chordPcs = new Set([0, 2, 4, 6].filter((i) => i < names.length).map((i) => names[i].pc));
      // Sólo las notas del acorde, una vez cada altura.
      const seen = new Set();
      let targets = ladder.filter((n) => chordPcs.has(mod(n.midi, 12)) && !seen.has(n.midi) && seen.add(n.midi));
      if (o.direction === 'down') targets = [...targets].reverse();
      else if (o.direction === 'updown') targets = [...targets, ...[...targets].reverse().slice(1)];
      const maxFret = o.maxFret ?? 17;
      const notes = [];
      for (const t of targets) {
        const pre = def.pre(t.midi, collection).map((m) => placeMidi(o.tuning, m, t.s, maxFret));
        // Si no cabe alguna nota de aproximación (p. ej. por debajo de la cuerda grave al aire), se omite ese objetivo.
        if (pre.some((x) => !x)) continue;
        // La nota cromática va con el dedo vecino del que toca el objetivo.
        for (const placed of pre) notes.push({ ...placed, approach: true, finger: approachFinger(placed, t) });
        notes.push({ ...t });
      }
      return { notes };
    },
  };
}

/* ───────────── catálogo ───────────── */

function seqExercise(key, extra = {}) {
  return {
    id: `seq-${key}`,
    family: 'seq',
    title: PATTERNS[key].label,
    desc: `Aplica el patrón «${PATTERNS[key].label}» a la escala elegida, grado a grado, en una posición de N notas por cuerda.`,
    tip: extra.tip ?? 'Empieza lento y con metrónomo; sube de tempo sólo cuando salga limpio tres veces seguidas.',
    needsPosition: true,
    build(o, collection) {
      const ladder = ladderFor(o, collection);
      return { notes: directed(ladder, PATTERNS[key].build, o.direction) };
    },
  };
}

const SEQ_TIPS = {
  straight: 'La base de todo: escala limpia, dedos cerca del mástil y pulso constante.',
  thirds: 'Las terceras entrenan los saltos de cuerda con la mano derecha y el cambio de dedos con la izquierda.',
  triadsIn: 'Cada grupo es una tríada diatónica: oirás cómo cambia la calidad (mayor, menor, disminuida) grado a grado.',
  sevenths: 'Cada grupo es un arpegio de séptima diatónico; sirve también para aprender la armonía de la escala.',
  loop3: 'Vuelve a la primera nota de cada grupo: mejora el control de la dirección de púa.',
};

const PERM_NAMES = permutations24().map((p) => p.join('-'));
export const permName = (i) => PERM_NAMES[i % 24];
export const PERMUTATION_NAMES = PERM_NAMES;

export const EXERCISES = [
  /* ── Permutaciones ── */
  {
    id: 'perm-scale-4',
    family: 'perm',
    title: 'Permutaciones de 4 notas sobre la escala',
    desc: 'Toma cada grupo de cuatro notas consecutivas de la escala y tócalo en el orden que marque la permutación (por ejemplo 1-3-2-4), avanzando un grado cada vez.',
    tip: 'Hay 24 ordenaciones. Si una te bloquea, trabájala sola a mitad de tempo: son las que más independencia dan.',
    needsPosition: true,
    params: ['perm'],
    build(o, collection) {
      const perm = permutations24()[(o.perm ?? 0) % 24];
      const ladder = ladderFor(o, collection);
      const fn = (n) => range(0, n - 3).flatMap((i) => perm.map((p) => i + p - 1));
      return { notes: directed(ladder, fn, o.direction) };
    },
  },
  {
    id: 'perm-scale-3',
    family: 'perm',
    title: 'Permutaciones de 3 notas sobre la escala',
    desc: 'Las seis ordenaciones de tres notas (1-2-3, 1-3-2, 2-1-3…) aplicadas a cada grupo de tres grados consecutivos.',
    tip: 'Es la puerta de entrada a las permutaciones de cuatro: más corto y más fácil de memorizar.',
    needsPosition: true,
    params: ['perm3'],
    build(o, collection) {
      const perms = permutations3();
      const perm = perms[(o.perm3 ?? 0) % perms.length];
      const ladder = ladderFor(o, collection);
      const fn = (n) => range(0, n - 2).flatMap((i) => perm.map((p) => i + p - 1));
      return { notes: directed(ladder, fn, o.direction) };
    },
  },
  {
    id: 'perm-chromatic',
    family: 'perm',
    title: 'Permutaciones cromáticas por las cuerdas',
    desc: 'Los cuatro dedos sobre cuatro trastes seguidos, en el orden elegido, repitiendo en cada cuerda de grave a aguda.',
    tip: 'Un dedo por traste, sin levantar los que no se usen. Controla que no suenen cuerdas vecinas.',
    params: ['perm', 'startFret'],
    noScale: true,
    build(o) {
      const perm = permutations24()[(o.perm ?? 0) % 24];
      const strings = range(0, o.tuning.length).reverse();
      const up = independenceEvents({ perm, startFret: o.startFret ?? 5, strings });
      const down = independenceEvents({ perm, startFret: o.startFret ?? 5, strings, ascending: false });
      const pick = o.direction === 'down' ? down : o.direction === 'updown' ? [...up, ...down] : up;
      return { notes: pick.map((e) => ({ s: e.s, f: e.f, midi: o.tuning[e.s] + e.f, finger: e.finger })) };
    },
  },
  {
    id: 'perm-all-24',
    family: 'perm',
    title: 'Las 24 permutaciones seguidas (una cuerda)',
    desc: 'Un compás por permutación, las 24 en fila sobre la misma cuerda y los mismos cuatro trastes.',
    tip: 'Es un ejercicio de resistencia: 96 notas. Hazlo con calma y descansa la mano cuando haga falta.',
    params: ['startFret', 'string'],
    noScale: true,
    build(o) {
      const s = Math.min(o.tuning.length - 1, o.string ?? 1);
      const base = o.startFret ?? 5;
      const notes = permutations24().flatMap((perm) => perm.map((finger) => ({ s, f: base + finger - 1, midi: o.tuning[s] + base + finger - 1, finger })));
      return { notes };
    },
  },

  /* ── Secuencias de escala ── */
  ...Object.keys(PATTERNS).map((key) => seqExercise(key, { tip: SEQ_TIPS[key] })),

  /* ── Pentatónica y blues ── */
  ...[
    ['pent-up', 'Caja pentatónica: subir y bajar', 'straight', 'updown', 'Toca la caja entera de grave a agudo y vuelve. Es el primer ejercicio de cualquier solista.'],
    ['pent-triplets', 'Pentatónica en grupos de 3', 'triplets', 'up', 'Tres notas por grupo desplazando un grado: sale un fraseo de tresillos muy usado en el blues y el rock.'],
    ['pent-quads', 'Pentatónica en grupos de 4', 'quads', 'up', 'Grupos de cuatro notas; mantén la púa alterna para que el abajo-arriba no se desordene.'],
    ['pent-thirds', 'Pentatónica en terceras', 'thirds', 'up', 'Saltos de una nota: entrena los saltos de cuerda y suena más melódico que la escala recta.'],
    ['pent-loop', 'Pentatónica «con vuelta» (1-2-3-1)', 'loop3', 'up', 'Cada grupo regresa a su primera nota: da mucha precisión a la púa.'],
    ['pent-stepback', 'Pentatónica paso atrás (1-2-3-2)', 'stepback', 'up', 'Un clásico de la improvisación: sube tres notas y vuelve una.'],
  ].map(([id, title, pattern, dir, tip]) => ({
    id,
    family: 'pent',
    title,
    desc: `${title}. Elige menor, mayor o blues y la posición de la caja.`,
    tip,
    needsPosition: true,
    params: ['pent'],
    build(o, collection) {
      const ladder = ladderFor(o, collection);
      return { notes: directed(ladder, PATTERNS[pattern].build, o.direction ?? dir) };
    },
  })),
  {
    id: 'pent-chain',
    family: 'pent',
    title: 'Las cinco cajas encadenadas',
    desc: 'Recorre ascendiendo las cinco posiciones de la pentatónica, una detrás de otra, para unirlas en un solo mapa mental.',
    tip: 'Fíjate en cómo se solapan: la última nota de una caja es la primera de la siguiente. Nómbralas en voz alta.',
    params: ['pent'],
    build(o, collection) {
      const count = positionLabel(o.tuning, collection, 0).count;
      const first = rootPosition(o.tuning, collection);
      const notes = [];
      let prevLow = -1;
      for (let k = 0; k < count; k += 1) {
        // Cada caja con su digitación; si la caja vuelve a la cejuela, se sube una octava.
        let ladder = ladderFor(o, collection, (first + k) % count);
        const low = Math.min(...ladder.map((n) => n.f));
        if (low < prevLow) {
          ladder = ladder.map((n) => ({ ...n, f: n.f + 12, midi: n.midi + 12 }));
          if (ladder.some((n) => n.f > (o.maxFret ?? 17))) break;
          ladder = withFingers(ladder.map(({ finger, ...n }) => n));
        }
        prevLow = Math.min(...ladder.map((n) => n.f));
        notes.push(...ladder);
      }
      return { notes };
    },
  },

  /* ── Intervalos melódicos ── */
  ...[[2, 'Terceras'], [3, 'Cuartas'], [4, 'Quintas'], [5, 'Sextas'], [6, 'Séptimas'], [7, 'Octavas']].map(([k, name]) => ({
    id: `int-${k + 1}`,
    family: 'intervals',
    title: `${name} melódicas (1-${k + 1}, 2-${k + 2}…)`,
    desc: `Sube por la escala tocando cada nota y la que está ${k} grados por encima. Con el selector puedes invertir el orden o hacer un zigzag.`,
    tip: k >= 5 ? 'Los intervalos grandes cruzan varias cuerdas: vigila el recorrido de la púa y la posición de la mano.' : 'Canta mentalmente el intervalo antes de tocarlo: afianza el oído y el mástil a la vez.',
    needsPosition: true,
    params: ['variant'],
    build(o, collection) {
      const ladder = ladderFor(o, collection);
      const variants = ['up', 'back', 'zigzag'];
      return { notes: directed(ladder, intervalPattern(k, variants[(o.variant ?? 0) % 3]), o.direction) };
    },
  })),

  /* ── Dobles cuerdas ── */
  ...[2, 3, 4, 5, 6, 7].map((k) => ({
    id: `dbl-${k + 1}`,
    family: 'double',
    k,
    title: `${DOUBLE_NAMES[k]} en dobles cuerdas`,
    desc: `La escala armonizada en ${DOUBLE_NAMES[k].toLowerCase()}: cada nota con la que está ${k} grados por encima, subiendo una octava sobre dos cuerdas.`,
    tip: k === 2 || k === 5 ? 'Las terceras y sextas son la base de la armonía a dos voces (Beatles, country, soul). Toca con púa y dedos, o con dedos.' : 'Silencia con la mano izquierda las cuerdas que no tocas para que suene limpio.',
    params: ['pair', 'harmonic', 'startFret'],
    build(o, collection) {
      const valid = availablePairs({ tuning: o.tuning, collection, k, maxFret: o.maxFret ?? 17 });
      const wanted = o.pair && valid.some((p) => p[0] === o.pair[0] && p[1] === o.pair[1]) ? o.pair : valid[0];
      if (!wanted) return { notes: [], warnings: ['Ese intervalo no cabe en pares de cuerdas con esta afinación.'] };
      const rows = doubleStops({ tuning: o.tuning, collection, k, pair: wanted, maxFret: o.maxFret ?? 17, startFret: o.startFret ?? 0 });
      const down = o.direction === 'down';
      const list = down ? [...rows].reverse() : o.direction === 'updown' ? [...rows, ...[...rows].reverse().slice(1)] : rows;
      const beats = list.flatMap((r) => {
        const lo = { s: r.low.s, f: r.low.f, midi: r.low.midi, tech: [] };
        const hi = { s: r.high.s, f: r.high.f, midi: r.high.midi, tech: [] };
        return o.harmonic === false ? [{ notes: [lo] }, { notes: [hi] }] : [{ notes: [lo, hi] }];
      });
      const notes = list.flatMap((r) => [r.low, r.high]);
      return { beats: assignBeatFingers(beats), notes };
    },
  })),

  cagedExercise(2),
  cagedExercise(5),

  /* ── Arpegios ── */
  {
    id: 'arp-position',
    family: 'arp',
    title: 'Arpegio por posiciones del mástil',
    desc: 'Las notas del acorde elegido en cada una de las cinco formas CAGED, de grave a aguda y de vuelta, con la digitación estándar de la posición.',
    tip: 'Mira dónde caen la tónica y la tercera: son las notas que definen el acorde. Prueba a cantarlas.',
    params: ['chord', 'arpPos'],
    noScale: true,
    build(o) {
      const rootPc = createNoteCollection(o.root ?? 'A', 'scale', 'major').root.pc;
      const typeId = o.chord ?? 'm7';
      const positions = arpeggioPositions({ tuning: o.tuning, rootPc, typeId, width: 5, maxFret: o.maxFret ?? 15 });
      if (!positions.length) return { notes: [], warnings: ['No hay posiciones para ese acorde con esa afinación.'] };
      const pos = positions[(o.arpPos ?? 0) % positions.length];
      const sorted = [...pos.notes].sort((a, b) => a.midi - b.midi || b.s - a.s)
        .filter((n, i, arr) => i === 0 || arr[i - 1].midi !== n.midi);
      const up = sorted.map((n) => ({ s: n.s, f: n.f, midi: n.midi, finger: n.finger }));
      const down = [...up].reverse().slice(1);
      const pcs = chordPcs(rootPc, typeId);
      void pcs;
      return { notes: o.direction === 'up' ? up : o.direction === 'down' ? [...up].reverse() : [...up, ...down], positions: positions.length };
    },
  },

  /* ── Legato ── */
  {
    id: 'leg-groups',
    family: 'legato',
    title: 'Legato por cuerdas: ida y vuelta en cada grupo',
    desc: 'En cada cuerda, pica sólo la primera nota y sube con hammer-ons; vuelve con pull-offs y pasa a la siguiente cuerda.',
    tip: 'Martillea con la yema cerca del traste. En los pull-offs «pellizca» ligeramente hacia abajo para que la nota suene con fuerza.',
    needsPosition: true,
    build(o, collection) {
      const ladder = ladderFor(o, collection);
      const byString = new Map();
      for (const n of ladder) byString.set(n.s, [...(byString.get(n.s) ?? []), n]);
      const strings = [...byString.keys()].sort((a, b) => (o.direction === 'down' ? a - b : b - a));
      const notes = [];
      for (const s of strings) {
        const g = byString.get(s);
        if (g.length < 2) { notes.push(...g); continue; }
        const up = g.map((n, i) => ({ ...n, tech: i < g.length - 1 ? ['h'] : ['p'] }));
        const back = [...g].reverse().slice(1).map((n, i, arr) => ({ ...n, tech: i < arr.length - 1 ? ['p'] : [] }));
        notes.push(...up, ...back);
      }
      return { notes };
    },
  },
  {
    id: 'leg-chromatic',
    family: 'legato',
    title: 'Legato cromático 1-2-3-4',
    desc: 'Hammer-ons 1-2-3-4 y pull-offs de vuelta en cada cuerda, repetidos de la grave a la aguda.',
    tip: 'Mantén los dedos pegados al traste y relaja el pulgar: la tensión es lo que frena la velocidad.',
    params: ['startFret'],
    noScale: true,
    build(o) {
      const base = o.startFret ?? 5;
      const strings = range(0, o.tuning.length).reverse();
      const notes = strings.flatMap((s) => [
        { f: base, finger: 1, tech: ['h'] }, { f: base + 1, finger: 2, tech: ['h'] }, { f: base + 2, finger: 3, tech: ['h'] },
        { f: base + 3, finger: 4, tech: ['p'] }, { f: base + 2, finger: 3, tech: ['p'] }, { f: base + 1, finger: 2, tech: [] },
      ].map((e) => ({ ...e, s, midi: o.tuning[s] + e.f })));
      return { notes };
    },
  },
  {
    id: 'leg-trill',
    family: 'legato',
    title: 'Trinos 1-2, 1-3 y 1-4',
    desc: 'Alterna dos notas con la mano izquierda lo más rápido posible; luego amplía el salto de dedos.',
    tip: 'Es mejor un trino ligero y relajado que uno fuerte: la velocidad llega con la soltura.',
    params: ['startFret'],
    noScale: true,
    build(o) {
      const base = o.startFret ?? 7;
      const s = Math.min(o.tuning.length - 1, 2);
      const notes = [];
      for (const [a, b] of [[1, 2], [1, 3], [1, 4]]) {
        for (let r = 0; r < 4; r += 1) {
          notes.push({ s, f: base + a - 1, finger: a, tech: ['h'] });
          notes.push({ s, f: base + b - 1, finger: b, tech: ['p'] });
        }
      }
      return { notes: notes.map((n) => ({ ...n, midi: o.tuning[s] + n.f })) };
    },
  },
  ...Object.keys(APPROACH_KINDS).map((k) => approachExercise(k)),
];

function permutations3() {
  const out = [];
  const rec = (rest, acc) => {
    if (!rest.length) { out.push(acc); return; }
    rest.forEach((x, i) => rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  };
  rec([1, 2, 3], []);
  return out;
}

export const PERMUTATION3_NAMES = permutations3().map((p) => p.join('-'));

/**
 * Dobles cuerdas: la mano se coloca para cada par (terceras, sextas,
 * octavas…). Si el par se toca arpegiado, son dos beats seguidos.
 */
function assignBeatFingers(beats) {
  const out = beats.map((b) => ({ ...b, notes: b.notes.map((n) => ({ ...n })) }));
  const setPair = (a, b) => {
    const [low, high] = a.s > b.s ? [a, b] : [b, a];
    const [fl, fh] = fingerDouble(low, high);
    low.finger = fl;
    high.finger = fh;
  };
  for (let i = 0; i < out.length; i += 1) {
    const ns = out[i].notes;
    if (ns.length === 2) setPair(ns[0], ns[1]);
    else if (ns.length === 1 && out[i + 1]?.notes.length === 1) { setPair(ns[0], out[i + 1].notes[0]); i += 1; }
    else ns.forEach((n) => { n.finger = n.f === 0 ? 0 : 1; });
  }
  return out;
}

export function exerciseById(id) {
  return EXERCISES.find((e) => e.id === id) ?? EXERCISES[0];
}

export function exercisesByFamily(familyId) {
  return EXERCISES.filter((e) => e.family === familyId);
}

/**
 * @param {string} id
 * @param {object} o { tuning, root, quality, pent, position, direction, perm, perm3, variant, startFret,
 *                     string, pair, harmonic, chord, arpPos, maxFret }
 */
export function buildExercise(id, o) {
  const ex = exerciseById(id);
  const opts = { direction: 'up', maxFret: 17, ...o };
  const collection = ex.noScale ? createNoteCollection(opts.root ?? 'A', 'scale', 'major') : resolveCollection(ex, opts);
  const result = ex.build(opts, collection);
  let beats = result.beats;
  let notes = result.notes;
  if (!beats) {
    const fingered = assignFingers(notes ?? []);
    beats = toBeats(fingered);
    notes = fingered;
  } else {
    notes = result.notes ?? beats.flatMap((b) => b.notes);
  }
  return {
    exercise: ex,
    collection,
    beats,
    notes: uniquePositions(notes),
    warnings: result.warnings ?? (beats.length ? [] : ['La posición no cabe en el mástil con esta afinación.']),
    noteCount: beats.reduce((n, b) => n + b.notes.length, 0),
    rows: result.rows ?? null,
    beatRow: result.beatRow ?? null,
    positions: result.positions ?? null,
  };
}

/** Los dedos sugeridos de un conjunto de beats, para mostrarlos como texto. */
export function fingeringLine(beats) {
  return beats.map((b) => b.notes.map((n) => n.finger ?? '·').join('+')).join(' ');
}

export { defaultPerString };
