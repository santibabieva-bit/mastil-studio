/**
 * Biblioteca de ejercicios técnicos. Cada drill se construye como una lista
 * de eventos { s, f, pick, art, finger } (s = 0 es la cuerda más aguda):
 *   pick:  'D' púa abajo · 'U' púa arriba · 'p' 'i' 'm' 'a' dedos de la mano derecha · null sin púa
 *   art:   'H' hammer-on · 'P' pull-off · 'T' tapping · 'M' silenciado · null normal
 *   finger: 1-4 dedo de la mano izquierda (0 = al aire)
 * Puro: se prueba en Node.
 */

import { mod } from './music.js';
import { chordPcs } from './chords.js';
import { arpeggioPositions } from './triads.js';

export const DRILL_GROUPS = [
  { id: 'picking', label: 'Púa' },
  { id: 'legato', label: 'Legato' },
  { id: 'hands', label: 'Manos' },
  { id: 'advanced', label: 'Avanzado' },
];

/** Traste más bajo (>= min) de la cuerda `s` que da la clase de altura `pc`. */
export function fretFor(tuning, s, pc, min = 0) {
  for (let f = min; f < min + 12; f += 1) if (mod(tuning[s] + f, 12) === pc) return f;
  return min;
}

/** Asigna dirección de púa. `mode`: 'alternate' | 'economy'. */
export function assignPicking(events, mode = 'alternate', start = 'D') {
  let dir = start;
  let prevString = null;
  return events.map((ev) => {
    if (ev.art === 'H' || ev.art === 'P' || ev.art === 'T' || ev.pick === 'skip') return { ...ev, pick: null };
    if (prevString !== null) {
      if (mode === 'economy' && ev.s !== prevString) {
        // Cambio de cuerda: si el movimiento va en la dirección del golpe anterior, se mantiene.
        const down = ev.s > prevString;
        const sameWay = (dir === 'D' && down) || (dir === 'U' && !down);
        if (sameWay) { prevString = ev.s; return { ...ev, pick: dir }; }
      }
      dir = dir === 'D' ? 'U' : 'D';
    }
    prevString = ev.s;
    return { ...ev, pick: dir };
  });
}

/** Las 24 permutaciones de los dedos 1-2-3-4. */
export function permutations24() {
  const out = [];
  const rec = (rest, acc) => {
    if (!rest.length) { out.push(acc); return; }
    rest.forEach((x, i) => rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  };
  rec([1, 2, 3, 4], []);
  return out;
}

/** Cromático 1-2-3-4 en un orden de dedos dado, subiendo por las cuerdas. */
export function independenceEvents({ perm, startFret = 5, strings = [5, 4, 3, 2, 1, 0], ascending = true }) {
  const list = ascending ? strings : [...strings].reverse();
  return list.flatMap((s) => perm.map((finger) => ({ s, f: startFret + finger - 1, finger })));
}

const E = (s, f, extra = {}) => ({ s, f, ...extra });

const DRILLS = [
  {
    id: 'alt-chromatic',
    group: 'picking',
    title: 'Púa alterna: cromático 1-2-3-4',
    desc: 'Cuatro trastes seguidos por cuerda, abajo-arriba sin parar, subiendo por las seis cuerdas.',
    tip: 'La muñeca mueve la púa, no el brazo. Toca cada nota al ritmo del clic, sin acelerar.',
    tempo: [60, 140],
    build: ({ startFret = 5 }) => independenceEvents({ perm: [1, 2, 3, 4], startFret }).map((e) => ({ ...e })),
    picking: 'alternate',
  },
  {
    id: 'string-crossing',
    group: 'picking',
    title: 'Cruce de cuerdas con púa alterna',
    desc: 'Dos notas en una cuerda y dos en la vecina, siempre en alternada. Cuesta mantener el abajo-arriba al cambiar de cuerda.',
    tip: 'Mira que la púa «sobrevuele» la cuerda siguiente antes de atacarla; el recorrido es mínimo.',
    tempo: [60, 130],
    build: ({ startFret = 5 }) => [5, 4, 3, 2, 1].flatMap((s) => [
      E(s, startFret, { finger: 1 }), E(s, startFret + 2, { finger: 3 }),
      E(s - 1, startFret, { finger: 1 }), E(s - 1, startFret + 2, { finger: 3 }),
    ].filter((e) => e.s >= 0)),
    picking: 'alternate',
  },
  {
    id: 'economy',
    group: 'picking',
    title: 'Economy picking: tres notas por cuerda',
    desc: 'Una escala de tres notas por cuerda: cuando cambias de cuerda en la dirección del golpe, repites esa dirección.',
    tip: 'Es más eficiente que alternar a ciegas en pasajes con muchos cambios de cuerda.',
    tempo: [60, 140],
    build: ({ tuning, root = 9 }) => {
      const base = fretFor(tuning, 5, root, 3);
      // Escala menor natural, tres notas por cuerda, ascendente.
      const shape = [[0, 2, 3], [0, 2, 3], [0, 2], [0, 2, 3], [0, 1, 3], [0, 2, 3]];
      return shape.flatMap((offsets, i) => {
        const s = 5 - i;
        const shift = i >= 4 ? -1 : 0;
        return offsets.map((o) => E(s, base + o + shift));
      });
    },
    picking: 'economy',
  },
  {
    id: 'sweep',
    group: 'picking',
    title: 'Sweep de arpegio (una nota por cuerda)',
    desc: 'Un barrido continuo, todo hacia abajo en la subida y todo hacia arriba en la bajada, sobre las notas del arpegio.',
    tip: 'Silencia con la mano izquierda cada nota antes de pasar a la siguiente para que no suenen juntas.',
    tempo: [50, 120],
    build: ({ tuning, root = 9, quality = 'm' }) => {
      const pcs = chordPcs(root, quality);
      const positions = arpeggioPositions({ tuning, rootPc: root, typeId: quality, width: 5, maxFret: 15 });
      const pos = positions.find((p) => p.from >= 3) ?? positions[0];
      if (!pos) return [];
      const perString = new Map();
      for (const n of pos.notes) {
        if (!pcs.includes(n.pc)) continue;
        const cur = perString.get(n.s);
        if (!cur || n.f < cur.f) perString.set(n.s, n);
      }
      const up = [...perString.values()].sort((a, b) => b.s - a.s);
      return [...up.map((n) => ({ ...E(n.s, n.f, { finger: n.finger }), pick: 'D' })), ...[...up].reverse().slice(1).map((n) => ({ ...E(n.s, n.f, { finger: n.finger }), pick: 'U' }))];
    },
    picking: 'keep',
  },
  {
    id: 'legato',
    group: 'legato',
    title: 'Legato: hammer-ons y pull-offs',
    desc: 'Pica sólo la primera nota; el resto sale con la mano izquierda, subiendo (H) y bajando (P) por los cuatro dedos.',
    tip: 'Martillea con la yema, cerca del traste, y al soltar «pellizca» ligeramente hacia abajo para que suene.',
    tempo: [50, 130],
    build: ({ startFret = 5 }) => [5, 4, 3, 2, 1, 0].flatMap((s) => [
      E(s, startFret, { finger: 1 }),
      E(s, startFret + 1, { art: 'H', finger: 2 }),
      E(s, startFret + 2, { art: 'H', finger: 3 }),
      E(s, startFret + 3, { art: 'H', finger: 4 }),
      E(s, startFret + 2, { art: 'P', finger: 3 }),
      E(s, startFret + 1, { art: 'P', finger: 2 }),
    ]),
    picking: 'alternate',
  },
  {
    id: 'trill',
    group: 'legato',
    title: 'Trino rápido 1-2 y 1-3',
    desc: 'Alterna dos notas lo más rápido posible usando sólo la mano izquierda.',
    tip: 'Mantén la mano relajada: la tensión es lo que te frena. Empieza lento.',
    tempo: [60, 160],
    build: ({ startFret = 7 }) => [3, 2, 1].flatMap((s) => [
      E(s, startFret, { finger: 1 }),
      ...Array.from({ length: 7 }, (_, i) => E(s, i % 2 === 0 ? startFret + 1 : startFret, { art: i % 2 === 0 ? 'H' : 'P', finger: i % 2 === 0 ? 2 : 1 })),
    ]),
    picking: 'alternate',
  },
  {
    id: 'skipping',
    group: 'picking',
    title: 'Saltos de cuerda',
    desc: 'Notas separadas por una cuerda intermedia: el golpe de púa tiene que «saltar» sin tocarla.',
    tip: 'Es el mejor ejercicio para limpiar la precisión de la mano derecha.',
    tempo: [60, 130],
    build: ({ startFret = 5 }) => [5, 4, 3, 2].flatMap((s) => [
      E(s, startFret, { finger: 1 }), E(s - 2 >= 0 ? s - 2 : s, startFret + 2, { finger: 3 }),
      E(s, startFret + 1, { finger: 2 }), E(s - 2 >= 0 ? s - 2 : s, startFret + 3, { finger: 4 }),
    ]).filter((e) => e.s >= 0),
    picking: 'alternate',
  },
  {
    id: 'independence',
    group: 'hands',
    title: 'Independencia de dedos (24 permutaciones)',
    desc: 'Todas las ordenaciones de 1-2-3-4. Cambia de permutación con el selector.',
    tip: 'Si una permutación te bloquea, trabájala sola a mitad de tempo. Son las que más desarrollan la mano.',
    tempo: [50, 120],
    variants: 24,
    build: ({ startFret = 5, variant = 0 }) => independenceEvents({ perm: permutations24()[variant % 24], startFret, strings: [5, 4, 3, 2, 1, 0] }),
    picking: 'alternate',
  },
  {
    id: 'hybrid',
    group: 'hands',
    title: 'Hybrid picking: púa + dedos',
    desc: 'La púa toca el bajo y los dedos medio y anular tocan las cuerdas agudas: p-m-a-m.',
    tip: 'Mantén la púa entre pulgar e índice y usa m y a como dedos libres.',
    tempo: [50, 120],
    build: ({ tuning, root = 9 }) => {
      const low = fretFor(tuning, 4, root, 0);
      return Array.from({ length: 4 }, () => [
        E(4, low, { pick: 'p' }),
        E(2, low + 2, { pick: 'm' }),
        E(1, low + 2, { pick: 'a' }),
        E(2, low + 2, { pick: 'm' }),
      ]).flat();
    },
    picking: 'keep',
  },
  {
    id: 'tapping',
    group: 'advanced',
    title: 'Tapping: arpegio de tres notas',
    desc: 'Tap con la derecha, pull-off a la nota media y a la grave, y vuelta con hammer-ons.',
    tip: 'Golpea con la yema, de forma firme y perpendicular. Silencia las cuerdas vecinas con la palma.',
    tempo: [50, 110],
    build: ({ tuning, root = 9, quality = 'm' }) => {
      const third = quality === 'm' ? 3 : 4;
      let low = fretFor(tuning, 0, root, 3);
      if (low + 12 > 17) low -= 12;
      if (low < 0) low = fretFor(tuning, 0, root, 0);
      const tone = [low, low + third, low + 7];
      const top = tone[2] + (tone[2] < 8 ? 12 : 0);
      void top;
      return Array.from({ length: 4 }, () => [
        E(0, tone[2], { art: 'T', pick: null }),
        E(0, tone[1], { art: 'P', finger: 3 }),
        E(0, tone[0], { art: 'P', finger: 1 }),
        E(0, tone[1], { art: 'H', finger: 3 }),
      ]).flat();
    },
    picking: 'keep',
  },
  {
    id: 'muting',
    group: 'hands',
    title: 'Palm muting con acentos',
    desc: 'Corcheas silenciadas con la palma en la cuerda grave, acentuando el pulso con una nota abierta.',
    tip: 'La palma se apoya junto al puente: justo lo suficiente para apagar sin dejar sin sonido.',
    tempo: [70, 180],
    build: () => Array.from({ length: 4 }, () => [
      E(5, 0, { art: null, pick: 'D' }),
      E(5, 0, { art: 'M', pick: 'U' }),
      E(5, 0, { art: 'M', pick: 'D' }),
      E(5, 0, { art: 'M', pick: 'U' }),
    ]).flat(),
    picking: 'keep',
  },
];

export const DRILL_LIST = DRILLS;

export function drillById(id) {
  return DRILLS.find((d) => d.id === id) ?? DRILLS[0];
}

/** Construye un drill: devuelve { drill, events }. */
export function buildDrill(id, { tuning, root = 9, startFret = 5, variant = 0, quality = 'm' }) {
  const drill = drillById(id);
  let events = drill.build({ tuning, root, startFret, variant, quality });
  if (drill.picking === 'alternate' || drill.picking === 'economy') events = assignPicking(events, drill.picking);
  return { drill, events };
}

/** MIDI de cada evento. */
export function eventMidi(tuning, ev) {
  return tuning[ev.s] + ev.f;
}
