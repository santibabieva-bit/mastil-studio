/**
 * Ejercicios de tríadas en movimiento: cada ejercicio se convierte en una
 * lista de pasos (los mismos del diapasón animado) con su acorde, inversión y
 * juego de cuerdas. Puro: se prueba en Node.
 *
 * Paso de acorde: { kind: 'chord', notes: [{ s, f, midi, role, voice }], d,
 *   chord: { rootPc, typeId, name, roman? }, inv, set }
 * Paso de nota suelta: { kind: 'pass' | 'arp' | 'melody', notes: [nota], d }
 */

import { mod, pcName } from './music.js';
import { CHORD_TYPES, chordPcs, stringSetVoicings } from './chords.js';
import {
  bassLine, borrowedRun, chromaticLine, dailyScale, handStill, improvBacking, ornaments, pedalTop, rhythmGroove,
  secondaryRun, songTriads, susResolve, upperStructures,
} from './triadmore.js';
import { cagedShapes } from './exlib.js';
import {
  INVERSION_LABELS, movementBetween, stringSetLabel, stringSets, voicingsOnSet,
} from './triads.js';

export const STD = [64, 59, 55, 50, 45, 40];
export const MAX_FRET = 15;
export const QUALITIES = ['maj', 'm', 'dim', 'aug'];
export const QUALITY_LABEL = { maj: 'mayor', m: 'menor', dim: 'disminuida', aug: 'aumentada' };
/** Juegos de cuerdas de tres: 0 = 1-2-3 (agudas) … 3 = 4-5-6 (graves). */
export const SETS = stringSets(STD, 3);
export const setName = (i) => SETS[i].map((s) => s + 1).join('');

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DIATONIC_TYPES = ['maj', 'm', 'm', 'maj', 'maj', 'm', 'dim'];
const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]);

export const PROGRESSIONS = [
  { id: 'I-IV-V', label: 'I – IV – V – I', degrees: [0, 3, 4, 0] },
  { id: 'I-V', label: 'I – V', degrees: [0, 4] },
  { id: 'I-IV', label: 'I – IV', degrees: [0, 3] },
  { id: 'I-IV-vi', label: 'I – IV – vi', degrees: [0, 3, 5] },
  { id: 'I-V-vi-IV', label: 'I – V – vi – IV (pop)', degrees: [0, 4, 5, 3] },
  { id: 'I-vi-IV-V', label: 'I – vi – IV – V (años 50)', degrees: [0, 5, 3, 4] },
  { id: 'vi-IV-I-V', label: 'vi – IV – I – V', degrees: [5, 3, 0, 4] },
  { id: 'ii-V-I', label: 'ii – V – I', degrees: [1, 4, 0, 0] },
  { id: 'I-iii-IV-V', label: 'I – iii – IV – V', degrees: [0, 2, 3, 4] },
  { id: 'blues', label: 'Blues de 12 compases (I – IV – V)', degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4] },
];

export const spell = (pc, keyPc = 0) => pcName(mod(pc, 12), FLAT_KEYS.has(mod(keyPc, 12)) ? 'flat' : 'sharp');

export function chordName(rootPc, typeId, keyPc = rootPc) {
  return `${spell(rootPc, keyPc)}${CHORD_TYPES[typeId].symbol}`;
}

/** Las siete tríadas de la tonalidad mayor. */
export function diatonic(keyPc) {
  return MAJOR.map((iv, k) => {
    const rootPc = mod(keyPc + iv, 12);
    return { rootPc, typeId: DIATONIC_TYPES[k], roman: ROMAN[k], degree: k, name: chordName(rootPc, DIATONIC_TYPES[k], keyPc) };
  });
}

export const keyPcs = (keyPc) => MAJOR.map((iv) => mod(keyPc + iv, 12));

/** Función de cada nota en el acorde: root / third / fifth. */
export function roleOf(midi, rootPc) {
  const iv = mod(midi - rootPc, 12);
  if (iv === 0) return 'root';
  if (iv === 3 || iv === 4) return 'third';
  if (iv === 6 || iv === 7 || iv === 8) return 'fifth';
  return 'other';
}
export const ROLE_LABEL = { root: 'R', third: '3', fifth: '5', other: '·' };

const DEGREE_NAMES = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];

/**
 * Grado de una nota en la escala mayor de la tonalidad (1–7, con ♭/♯ si no
 * pertenece). La 5.ª de un acorde aumentado se escribe ♯5 y la de uno
 * disminuido ♭5 (cuando no caen en la escala).
 */
export function scaleDegree(midi, keyPc, chord = null) {
  const iv = mod(midi - keyPc, 12);
  if (chord && roleOf(midi, chord.rootPc) === 'fifth' && !MAJOR.includes(iv)) {
    if (chord.typeId === 'aug') return `♯${DEGREE_NAMES[mod(iv - 1, 12)]}`;
    if (chord.typeId === 'dim') return `♭${DEGREE_NAMES[mod(iv + 1, 12)]}`;
  }
  return DEGREE_NAMES[iv];
}

export const avgFret = (v) => v.notes.reduce((a, n) => a + n.f, 0) / v.notes.length;

/** Notas del voicing ordenadas de grave a agudo, con altura, función y voz (0 = grave). */
export function voicingNotes(v, rootPc, tuning = STD) {
  return [...v.notes]
    .sort((a, b) => b.s - a.s)
    .map((n, voice) => {
      const midi = tuning[n.s] + n.f;
      return { s: n.s, f: n.f, midi, role: roleOf(midi, rootPc), voice };
    });
}

export function chordStep(v, chord, d = 2, extra = {}) {
  return {
    kind: 'chord',
    notes: voicingNotes(v, chord.rootPc),
    d,
    chord: { ...chord, name: chord.name ?? chordName(chord.rootPc, chord.typeId) },
    inv: v.inversion,
    set: SETS.findIndex((s) => s[0] === v.strings[0]),
    ...extra,
  };
}

const note = (s, f, extra = {}) => ({ s, f, midi: STD[s] + f, ...extra });

export function candidates(chord, setIdx, { win = null, inversion = null, open = false } = {}) {
  // Acordes «libres» (chord.pcs): cualquier grupo de tres notas, con la inversión según el bajo.
  let list = chord.pcs
    ? stringSetVoicings({ tuning: STD, pcs: chord.pcs, rootPc: chord.rootPc, maxFret: MAX_FRET, maxSpan: 4 })
      .filter((v) => v.strings[0] === SETS[setIdx][0] && (inversion == null || v.inversion === inversion) && !(v.notes.some((n) => n.f === 0) && v.high > 5))
    : voicingsOnSet({ tuning: STD, rootPc: chord.rootPc, typeId: chord.typeId, set: SETS[setIdx], inversion, maxFret: MAX_FRET });
  if (win) list = list.filter((v) => v.notes.every((n) => n.f >= win.from - 1 && n.f <= win.to + 1) && v.notes.some((n) => n.f >= win.from && n.f <= win.to));
  if (open) return list;
  // Formas móviles (sin cuerdas al aire), salvo que no quede otra.
  const movable = list.filter((v) => v.notes.every((n) => n.f > 0));
  return movable.length ? movable : list;
}

/**
 * Conducción de voces por mínimo movimiento (Viterbi) sobre los candidatos
 * de cada acorde. `startCost(v)` permite orientar el primer acorde.
 */
export function leadPath(chords, candFor, { startCost = (v) => avgFret(v) * 0.05 } = {}) {
  const layers = chords.map((c, i) => candFor(c, i));
  if (!layers.length || layers.some((l) => !l.length)) return null;
  const best = layers.map((l) => l.map(() => ({ cost: Infinity, prev: -1 })));
  layers[0].forEach((v, i) => { best[0][i] = { cost: startCost(v), prev: -1 }; });
  for (let l = 1; l < layers.length; l += 1) {
    layers[l].forEach((cand, i) => {
      layers[l - 1].forEach((prev, j) => {
        const cost = best[l - 1][j].cost + movementBetween(STD, prev, cand);
        if (cost < best[l][i].cost) best[l][i] = { cost, prev: j };
      });
    });
  }
  const last = best[layers.length - 1];
  let idx = last.reduce((bi, x, i) => (x.cost < last[bi].cost ? i : bi), 0);
  const out = [];
  for (let l = layers.length - 1; l >= 0; l -= 1) {
    out[l] = layers[l][idx];
    idx = best[l][idx].prev;
  }
  return out;
}

/** Cadena de inversiones subiendo por el mástil en un juego de cuerdas: F → 1.ª → 2.ª → F… */
export function inversionLadder(chord, setIdx, { maxFret = MAX_FRET, startInv = null } = {}) {
  const all = candidates(chord, setIdx).filter((v) => v.high <= maxFret);
  if (!all.length) return [];
  const sorted = all.sort((a, b) => avgFret(a) - avgFret(b));
  let cur = startInv == null ? sorted[0] : (sorted.find((v) => v.inversion === startInv) ?? sorted[0]);
  const out = [cur];
  const n = CHORD_TYPES[chord.typeId].intervals.length;
  for (;;) {
    const want = (cur.inversion + 1) % n;
    const next = sorted.find((v) => v.inversion === want && avgFret(v) > avgFret(cur) + 0.5);
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/** Ventanas CAGED de una tónica (solo la primera aparición de cada forma que quepa). */
export function cagedWindows(rootPc, maxFret = MAX_FRET) {
  const all = cagedShapes({ tuning: STD, collection: { root: { pc: rootPc } }, maxFret });
  const seen = new Set();
  const out = [];
  for (const z of all) {
    if (seen.has(z.id) || z.to > maxFret) continue;
    seen.add(z.id);
    out.push({ id: z.id, from: Math.max(0, z.from), to: z.to, center: (Math.max(0, z.from) + z.to) / 2 });
  }
  return out.sort((a, b) => a.from - b.from);
}

const nearest = (list, center) => list.reduce((best, v) => (!best || Math.abs(avgFret(v) - center) < Math.abs(avgFret(best) - center) ? v : best), null);
export const there = (list) => [...list, ...list.slice(0, -1).reverse()];
export const setsOf = (set) => (set === 'all' || set == null ? [3, 2, 1, 0] : [Number(set)]);
const qualitiesOf = (q) => (q === 'all' ? QUALITIES : [q ?? 'maj']);

/* ───────────── los ejercicios ───────────── */

function invHorizontal(p) {
  const steps = [];
  for (const typeId of qualitiesOf(p.quality)) {
    const chord = { rootPc: p.rootPc, typeId, name: chordName(p.rootPc, typeId) };
    for (const si of setsOf(p.set)) {
      const ladder = inversionLadder(chord, si);
      for (const v of there(ladder)) steps.push(chordStep(v, chord, p.beats));
    }
  }
  return steps;
}

function invVertical(p) {
  const steps = [];
  for (const typeId of qualitiesOf(p.quality)) {
    const chord = { rootPc: p.rootPc, typeId, name: chordName(p.rootPc, typeId) };
    const wins = cagedWindows(p.rootPc).filter((w) => p.shape === 'all' || w.id === p.shape);
    for (const win of wins) {
      const col = [];
      for (const si of [3, 2, 1, 0]) {
        const v = nearest(candidates(chord, si, { win }), win.center);
        if (v) col.push(v);
      }
      for (const v of there(col)) steps.push(chordStep(v, chord, p.beats, { shape: win }));
    }
  }
  return steps;
}

function qualityMorph(p) {
  const seq = ['maj', 'm', 'dim', 'm', 'maj', 'aug', 'maj'];
  const chords = seq.map((typeId) => ({ rootPc: p.rootPc, typeId, name: chordName(p.rootPc, typeId) }));
  const steps = [];
  for (const si of setsOf(p.set)) {
    for (let inv = 0; inv < 3; inv += 1) {
      if (p.inversion !== 'all' && p.inversion != null && Number(p.inversion) !== inv) continue;
      const path = leadPath(chords, (c, i) => candidates(c, si, i === 0 ? { inversion: inv } : {}), {
        startCost: (v) => Math.abs(avgFret(v) - 6) * 0.1,
      });
      if (path) path.forEach((v, i) => steps.push(chordStep(v, chords[i], p.beats)));
    }
  }
  return steps;
}

function scaleHorizontal(p) {
  const chords = diatonic(p.keyPc);
  const steps = [];
  for (const si of setsOf(p.set)) {
    const inv = p.inversion === 'all' || p.inversion == null ? 0 : Number(p.inversion);
    const line = [];
    let prevAvg = -1;
    for (const c of [...chords, chords[0]]) {
      const list = candidates(c, si, { inversion: inv }).sort((a, b) => avgFret(a) - avgFret(b));
      // Si no cabe más arriba, se baja una octava y se sigue subiendo.
      const v = list.find((x) => avgFret(x) > prevAvg + 0.5) ?? list[0];
      if (!v) break;
      line.push([v, c]);
      prevAvg = avgFret(v);
    }
    for (const [v, c] of there(line)) steps.push(chordStep(v, c, p.beats));
  }
  return steps;
}

export function scaleVertical(p) {
  const chords = diatonic(p.keyPc);
  const steps = [];
  const wins = cagedWindows(p.keyPc).filter((w) => p.shape === 'all' || w.id === p.shape);
  for (const win of wins) {
    chords.forEach((c, k) => {
      // En serpiente: un acorde sube de cuerdas y el siguiente baja.
      const order = k % 2 === 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
      for (const si of order) {
        const v = nearest(candidates(c, si, { win }), win.center);
        if (v) steps.push(chordStep(v, c, p.beats, { shape: win }));
      }
    });
  }
  return steps;
}

export function progressionChords(p) {
  const prog = PROGRESSIONS.find((x) => x.id === p.progression) ?? PROGRESSIONS[0];
  const dia = diatonic(p.keyPc);
  // El blues usa I, IV y V mayores (ya lo son en la tonalidad mayor).
  return prog.degrees.map((k) => dia[k]);
}

function progCaged(p) {
  const chords = progressionChords(p);
  const loop = [...chords, ...chords];
  const steps = [];
  const wins = cagedWindows(p.keyPc).filter((w) => p.shape === 'all' || w.id === p.shape);
  for (const win of wins) {
    const sets = setsOf(p.set);
    const path = leadPath(loop, (c) => sets.flatMap((si) => candidates(c, si, { win })), {
      startCost: (v) => Math.abs(avgFret(v) - win.center) * 0.3,
    });
    if (path) path.forEach((v, i) => steps.push(chordStep(v, loop[i], p.beats, { shape: win })));
  }
  return steps;
}

function progSets(p) {
  const chords = progressionChords(p);
  const steps = [];
  for (const si of setsOf(p.set === 'all' || p.set == null ? 'all' : p.set)) {
    const path = leadPath(chords, (c) => candidates(c, si), { startCost: (v) => Math.abs(avgFret(v) - 6) * 0.15 });
    if (path) path.forEach((v, i) => steps.push(chordStep(v, chords[i], p.beats)));
  }
  return steps;
}

/** Notas de la escala en la cuerda s estrictamente entre los trastes a y b. */
export function passingFrets(s, a, b, pcs) {
  const out = [];
  const dir = b > a ? 1 : -1;
  for (let f = a + dir; f !== b; f += dir) if (f >= 0 && pcs.includes(mod(STD[s] + f, 12))) out.push(f);
  return out;
}

function passingTones(p) {
  const dia = diatonic(p.keyPc);
  const chord = dia[p.degree ?? 0];
  const pcs = keyPcs(p.keyPc);
  const steps = [];
  for (const si of setsOf(p.set)) {
    const ladder = inversionLadder(chord, si);
    const line = there(ladder);
    line.forEach((v, i) => {
      const cs = chordStep(v, chord, 1);
      steps.push(cs);
      const nextV = line[i + 1];
      if (!nextV) return;
      const top = SETS[si][0];
      const a = v.notes.find((n) => n.s === top).f;
      const b = nextV.notes.find((n) => n.s === top).f;
      const fills = passingFrets(top, a, b, pcs);
      // Las dos voces graves siguen pisadas (no vuelven a sonar); la aguda camina por la escala.
      const held = cs.notes.slice(0, 2).map((n) => ({ ...n, held: true }));
      for (const f of fills) steps.push({ kind: 'pass', notes: [...held, note(top, f, { role: 'pass', voice: 2 })], d: 0.5, chord: cs.chord });
    });
  }
  return steps;
}

const CYCLE = Array.from({ length: 12 }, (_, i) => mod(i * 5, 12));

function cycleFourths(p) {
  const typeId = p.quality === 'all' ? 'maj' : (p.quality ?? 'maj');
  const chords = CYCLE.map((iv) => {
    const rootPc = mod(p.keyPc + iv, 12);
    return { rootPc, typeId, name: chordName(rootPc, typeId, rootPc) };
  });
  const steps = [];
  for (const si of setsOf(p.set === 'all' ? 1 : p.set)) {
    const path = leadPath(chords, (c) => candidates(c, si).filter((v) => v.high <= 12), { startCost: (v) => Math.abs(avgFret(v) - 5) * 0.2 });
    if (path) path.forEach((v, i) => steps.push(chordStep(v, chords[i], p.beats)));
  }
  return steps;
}

/** Melodía de ejemplo (grados de la escala; 7 = tónica una octava arriba). */
export const MELODY = [0, 2, 4, 5, 4, 2, 3, 1, 6, 7, 4, 2, 1, 0];

function melodyHarmony(p) {
  const dia = diatonic(p.keyPc);
  const pref = [0, 3, 4, 5, 1, 2];
  // Melodía arriba (2.ª o 1.ª cuerda): la tónica más grave a partir del traste 1 de la 2.ª.
  let base = STD[1] + 1;
  while (mod(base, 12) !== p.keyPc) base += 1;
  const midis = MELODY.map((d) => base + MAJOR[d % 7] + (d >= 7 ? 12 : 0));
  const steps = [];
  let prev = null;
  for (const m of midis) {
    let pick = null;
    for (const k of pref) {
      const c = dia[k];
      if (!chordPcs(c.rootPc, c.typeId).includes(mod(m, 12))) continue;
      const opts = [0, 1].flatMap((si) => candidates(c, si, { open: true }).filter((v) => {
        const top = v.notes.find((n) => n.s === SETS[si][0]);
        return STD[top.s] + top.f === m;
      }));
      if (!opts.length) continue;
      const mov = opts.filter((v) => v.notes.every((n) => n.f > 0));
      if (mov.length) opts.splice(0, opts.length, ...mov);
      const v = prev ? opts.reduce((a, b) => (movementBetween(STD, prev, a) <= movementBetween(STD, prev, b) ? a : b)) : opts[0];
      pick = [v, c];
      break;
    }
    if (!pick) continue;
    prev = pick[0];
    steps.push(chordStep(pick[0], pick[1], p.beats, { melody: m }));
  }
  return steps;
}

/** Tríada abierta: la voz del medio sube una octava. Busca dónde tocarla cerca de la cerrada. */
export function spreadVoicing(v, rootPc) {
  const [a, b, c] = voicingNotes(v, rootPc).map((n) => n.midi);
  const target = [a, c, b + 12];
  const center = avgFret(v);
  let best = null;
  for (let s0 = 5; s0 >= 2; s0 -= 1) {
    for (let s1 = s0 - 1; s1 >= 1; s1 -= 1) {
      for (let s2 = s1 - 1; s2 >= 0 && s0 - s2 <= 4; s2 -= 1) {
        const fr = [target[0] - STD[s0], target[1] - STD[s1], target[2] - STD[s2]];
        if (fr.some((f) => f < 1 || f > 17)) continue;
        const fretted = fr.filter((f) => f > 0);
        if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 4) continue;
        const cost = Math.abs(fr.reduce((x, y) => x + y, 0) / 3 - center) + (s0 - s2 - 2) * 0.5;
        if (!best || cost < best.cost) best = { cost, strings: [s2, s1, s0], frets: [fr[2], fr[1], fr[0]] };
      }
    }
  }
  if (!best) return null;
  const notes = best.strings.map((s, i) => ({ s, f: best.frets[i] }));
  return { strings: best.strings, notes, inversion: v.inversion, low: Math.min(...best.frets), high: Math.max(...best.frets), spread: true };
}

function spreadTriads(p) {
  const typeId = p.quality === 'all' ? 'maj' : (p.quality ?? 'maj');
  const chord = { rootPc: p.rootPc, typeId, name: chordName(p.rootPc, typeId) };
  const steps = [];
  for (const si of setsOf(p.set === 'all' ? 1 : p.set)) {
    for (const v of inversionLadder(chord, si)) {
      const sp = spreadVoicing(v, p.rootPc);
      steps.push(chordStep(v, chord, p.beats, { label: 'cerrada' }));
      if (sp) steps.push({ ...chordStep(sp, chord, p.beats, { label: 'abierta' }), set: -1 });
    }
  }
  return steps;
}

function triadPairs(p) {
  const dia = diatonic(p.keyPc);
  const IV = dia[3];
  const V = dia[4];
  const vi = dia[5];
  const si = p.set === 'all' || p.set == null ? 0 : Number(p.set);
  const ladder = inversionLadder(IV, si).filter((v) => v.high <= 13);
  const padMidis = chordPcs(vi.rootPc, 'm').map((pc) => 48 + mod(pc - 0, 12));
  const steps = [];
  let first = true;
  const arp = (v, chord, up) => {
    const ns = voicingNotes(v, chord.rootPc);
    const ordered = up ? ns : [...ns].reverse();
    ordered.forEach((n, k) => {
      const st = { kind: 'arp', notes: [n], d: 1 / 3, chord };
      if (k === 0 && first) { st.pad = padMidis; st.padBeats = 4; }
      first = false;
      steps.push(st);
    });
  };
  for (const v of ladder) {
    const w = leadPath([V], (c) => candidates(c, si), { startCost: (x) => movementBetween(STD, v, x) })?.[0];
    arp(v, IV, true);
    if (w) arp(w, V, false);
    first = true;
  }
  return steps;
}

function linearTwoStrings(p) {
  const typeId = p.quality === 'all' ? 'maj' : (p.quality ?? 'maj');
  const chord = { rootPc: p.rootPc, typeId, name: chordName(p.rootPc, typeId) };
  const si = p.set === 'all' || p.set == null ? 0 : Number(p.set);
  const [hi, lo] = [SETS[si][0], SETS[si][1]];
  const pcs = chordPcs(p.rootPc, typeId);
  const pos = [];
  for (const s of [lo, hi]) for (let f = 0; f <= MAX_FRET; f += 1) if (pcs.includes(mod(STD[s] + f, 12))) pos.push({ s, f, midi: STD[s] + f });
  // Sube alternando dos notas por cuerda: siempre la siguiente altura que deje la mano avanzar.
  const line = [];
  let cur = pos.filter((x) => x.s === lo).sort((a, b) => a.midi - b.midi)[0];
  while (cur) {
    line.push(cur);
    const c = cur;
    cur = pos.filter((x) => x.midi > c.midi && x.f >= c.f - 1).sort((a, b) => a.midi - b.midi || b.s - a.s)[0];
  }
  return there(line).map((n) => ({ kind: 'arp', notes: [{ ...n, role: roleOf(n.midi, p.rootPc) }], d: 0.5, chord }));
}

/* ───────────── catálogo ───────────── */

export const TRIAD_EXERCISES = [
  { id: 'inv-h', family: 'shapes', title: 'Inversiones en horizontal', run: invHorizontal, params: ['root', 'quality', 'set'], defaults: { quality: 'all', set: 0 },
    desc: 'Recorre el mástil en un grupo de cuerdas: fundamental → 1.ª → 2.ª → fundamental una octava arriba, y vuelta. Con «las cuatro» pasa por mayor, menor, disminuida y aumentada.',
    tip: 'Di en voz alta qué nota está arriba (R, 3 o 5) en cada forma: así las inversiones dejan de ser dibujos.' },
  { id: 'inv-v', family: 'shapes', title: 'Inversiones en vertical (por zona)', run: invVertical, params: ['root', 'quality', 'shape'], defaults: { quality: 'maj', shape: 'all' },
    desc: 'El mismo acorde por los cuatro grupos de cuerdas (456 → 123) sin salir de una zona del mástil. Lo que dibujas es la forma CAGED.',
    tip: 'Mantén la mano quieta: si tienes que estirarte, busca otra inversión más cerca.' },
  { id: 'quality', family: 'shapes', title: 'Mayor → menor → disminuida → aumentada', run: qualityMorph, params: ['root', 'set', 'inversion'], defaults: { set: 1, inversion: 'all' },
    desc: 'Cambia la calidad moviendo una sola nota: la 3.ª baja para menor, la 5.ª baja para disminuida, la 5.ª sube para aumentada.',
    tip: 'Mira la flecha: solo se mueve una voz, un traste. Escucha cómo cambia el color del acorde.' },
  { id: 'scale-h', family: 'key', title: 'Escala armonizada en horizontal', run: scaleHorizontal, params: ['key', 'set', 'inversion'], defaults: { set: 0, inversion: 0 },
    desc: 'I – ii – iii – IV – V – vi – vii° – I en un grupo de cuerdas con la misma inversión, subiendo por el mástil.',
    tip: 'Fíjate en el patrón mayor-menor-menor-mayor-mayor-menor-disminuido: es el mismo en cualquier tonalidad.' },
  { id: 'scale-v', family: 'key', title: 'Escala armonizada en cada posición CAGED', run: scaleVertical, params: ['key', 'shape'], defaults: { shape: 'E' },
    desc: 'Dentro de una posición CAGED, cada acorde de la tonalidad en los cuatro grupos de cuerdas, en serpiente (uno sube, el siguiente baja).',
    tip: 'La zona sombreada es tu posición: todas las tríadas de la tonalidad viven ahí dentro.' },
  { id: 'prog-caged', family: 'key', title: 'Progresiones en una posición CAGED', run: progCaged, params: ['key', 'progression', 'shape', 'set'], defaults: { progression: 'I-IV-V', shape: 'E', set: 'all' },
    desc: 'La progresión elegida dos veces sin salir de la posición, con la conducción de voces más corta. Las flechas enseñan qué voz se mueve; la nota común late.',
    tip: 'Busca la nota común entre acordes y déjala pisada: el cambio será más rápido y sonará más ligado.' },
  { id: 'prog-sets', family: 'key', title: 'Una progresión en cuatro sitios', run: progSets, params: ['key', 'progression', 'set'], defaults: { progression: 'I-V-vi-IV', set: 'all' },
    desc: 'La misma progresión en 456, 345, 234 y 123, cada vez con el mínimo movimiento.',
    tip: 'Graba una pasada en cada grupo de cuerdas y compáralas: el carácter cambia aunque los acordes sean los mismos.' },
  { id: 'passing', family: 'voice', title: 'Inversiones unidas con notas de paso', run: passingTones, params: ['key', 'degree', 'set'], defaults: { degree: 0, set: 0 },
    desc: 'Las inversiones de un acorde de la tonalidad, subiendo y bajando, unidas por las notas de la escala en la voz aguda. Es el lenguaje del soul y el R&B.',
    tip: 'Toca el acorde con púa o dedos y las notas de paso ligadas (hammer-on / pull-off).' },
  { id: 'cycle4', family: 'melodic', title: 'Ciclo de cuartas', run: cycleFourths, params: ['key', 'quality', 'set'], defaults: { quality: 'maj', set: 1 },
    desc: 'Las doce tonalidades por cuartas (C, F, B♭, E♭…) en un grupo de cuerdas, eligiendo siempre la inversión más cercana.',
    tip: 'Un acorde cada dos pulsos a 60 bpm. Si lo dominas, prueba con menores.' },
  { id: 'melody', family: 'melodic', title: 'Nota aguda = melodía', run: melodyHarmony, params: ['key'], defaults: {},
    desc: 'Una melodía en la 1.ª cuerda armonizada con tríadas de la tonalidad cuya nota más aguda es la nota de la melodía. Es la base del chord melody.',
    tip: 'Haz sonar la nota aguda un poco más fuerte que las otras dos: la melodía tiene que oírse por encima.' },
  { id: 'spread', family: 'melodic', title: 'Tríadas cerradas y abiertas', run: spreadTriads, params: ['root', 'quality', 'set'], defaults: { quality: 'maj', set: 1 },
    desc: 'Cada inversión cerrada seguida de su versión abierta (la voz del medio sube una octava). Suenan más amplias, como un piano o una sección de cuerdas.',
    tip: 'En las abiertas salta una cuerda: apágala con la yema del dedo que tienes al lado o toca con dedos.' },
  { id: 'pairs', family: 'melodic', title: 'Pares de tríadas (IV y V)', run: triadPairs, params: ['key', 'set'], defaults: { set: 0 },
    desc: 'Las tríadas de IV y V arpegiadas en tresillos, alternando, sobre el acorde de vi. Seis notas que suenan modernas para improvisar.',
    tip: 'Primero lento y en bucle; luego improvisa solo con esas seis notas sobre la base.' },
  { id: 'linear', family: 'melodic', title: 'Tríada en dos cuerdas', run: linearTwoStrings, params: ['root', 'quality', 'set'], defaults: { quality: 'maj', set: 0 },
    desc: 'El arpegio del acorde a lo largo de las dos cuerdas agudas del grupo, de la cejuela al traste 15 y vuelta.',
    tip: 'Une las posiciones del mástil en horizontal: es la manera de dejar de tocar siempre «en la caja».' },
  { id: 'daily', family: 'key', title: 'Una tonalidad al día', run: dailyScale, params: [], defaults: {},
    desc: 'Cada día una tonalidad del círculo de quintas: sus siete tríadas en las cinco posiciones CAGED, en serpiente. En doce días has recorrido todas.',
    tip: 'Antes de pulsar reproducir, di en voz alta los siete acordes de la tonalidad de hoy.' },
  { id: 'pedal', family: 'voice', title: 'Nota pedal arriba', run: pedalTop, params: ['key', 'pedal', 'set'], defaults: { pedal: 0, set: 0 },
    desc: 'La nota aguda se queda quieta y por debajo cambian los acordes de la tonalidad que la contienen (en Do, con el Do arriba: C → F → Am → F → C).',
    tip: 'Deja el dedo de la nota aguda clavado: solo se mueven los de abajo.' },
  { id: 'chromatic', family: 'voice', title: 'Línea cromática interior', run: chromaticLine, params: ['key', 'set'], defaults: { set: 1 },
    desc: 'Una voz se mueve por semitonos y las otras dos se quedan: C → C+ → C6 → C7 → F y el «line cliché» Am → Am(maj7) → Am7 → Am6.',
    tip: 'Sigue con los ojos la flecha: es siempre la misma voz, un traste cada vez. Cántala.' },
  { id: 'hand', family: 'voice', title: 'Progresión sin mover la mano', run: handStill, params: ['key', 'progression', 'set'], defaults: { progression: 'I-V-vi-IV', set: 'all' },
    desc: 'La progresión entera dentro de cuatro trastes, cambiando de grupo de cuerdas en lugar de desplazar la mano. La zona azul es tu mano.',
    tip: 'Si tu mano sale de la zona azul, has elegido otra inversión: vuelve a la del dibujo.' },
  { id: 'bassline', family: 'voice', title: 'Bajo descendente con inversiones', run: bassLine, params: ['key', 'set'], defaults: { set: 2 },
    desc: 'I – V/7 – vi – I/5 – IV – I/3 – ii – V – I: las inversiones hacen que el bajo baje por la escala, como en tantas baladas.',
    tip: 'Toca un poco más fuerte la nota grave: es la melodía del bajo.' },
  { id: 'upper', family: 'harmony', title: 'Tríadas sobre un bajo', run: upperStructures, params: ['key', 'set'], defaults: { set: 0 },
    desc: 'Con el bajo fijo en la tónica, cada tríada de arriba crea otro acorde: II sobre I es lidio, ♭VII sobre I es 9sus4, VI sobre I es un dominante tenso…',
    tip: 'Escucha cada una sobre el bajo antes de pasar a la siguiente. Son los colores del jazz y el neo-soul con solo tres notas.' },
  { id: 'borrowed', family: 'harmony', title: 'Préstamo modal', run: borrowedRun, params: ['key', 'set'], defaults: { set: 1 },
    desc: 'Progresiones con acordes del modo menor: I – ♭VI – ♭VII – I, I – iv – I, IV – iv – I, I – ♭III – IV – I y I – ♭VII – IV – I.',
    tip: 'Fíjate en qué nota baja un semitono respecto al acorde de la tonalidad: es la que trae el color menor.' },
  { id: 'secondary', family: 'harmony', title: 'Dominantes secundarios', run: secondaryRun, params: ['key', 'set'], defaults: { set: 1 },
    desc: 'I – VI – ii – V – I, I – III – vi – IV – V, I – II – V – I y I – VII – iii – IV – I: el acorde de fuera es el V del siguiente.',
    tip: 'La 3.ª del dominante secundario es la sensible del acorde al que va: síguela con la flecha.' },
  { id: 'sus', family: 'harmony', title: 'Suspender y resolver', run: susResolve, params: ['key', 'set'], defaults: { set: 0 },
    desc: 'X → Xsus4 → X → Xsus2 → X en I, IV, V y vi: la 3.ª sube a la 4.ª o baja a la 2.ª y vuelve.',
    tip: 'Prueba a hacerlo con hammer-on y pull-off, sin volver a atacar las otras dos notas.' },
  { id: 'song', family: 'harmony', title: 'Las tríadas de tu canción', run: songTriads, params: ['song', 'set'], defaults: { set: 1, song: 'C G Am F | C G F F' },
    desc: 'Escribe un cifrado (C G/B Am7 F…) y la app lo convierte en tríadas con la conducción de voces más corta en el grupo de cuerdas que elijas.',
    tip: 'Los acordes con 7.ª o 9.ª se reducen a su tríada: es como se tocan en una segunda guitarra.' },
  { id: 'rhythm', family: 'style', title: 'Ritmos con tríadas', run: rhythmGroove, params: ['key', 'groove', 'progression'], defaults: { groove: 'reggae', progression: 'I-V-vi-IV' },
    desc: 'La misma progresión con cuatro ritmos: reggae en el contratiempo, funk de semicorcheas en las cuerdas agudas, Motown en el 2 y el 4, y country con bajo alterno.',
    tip: 'Apaga el acorde levantando un poco la mano izquierda justo después de cada golpe: el silencio es parte del ritmo.' },
  { id: 'ornaments', family: 'style', title: 'Tríadas con adornos', run: ornaments, params: ['key', 'progression', 'set'], defaults: { progression: 'I-IV-V', set: 0 },
    desc: 'Cada acorde con tres adornos clásicos del soul y el country: entrada deslizando desde un traste abajo, pull-off desde la sus4 a la 3.ª y la 6.ª añadida.',
    tip: 'Los adornos se tocan con la mano izquierda: ataca una vez y deja que los ligados suenen solos.' },
  { id: 'improv', family: 'game', title: 'Improvisa con las notas del acorde', run: improvBacking, params: ['key', 'progression'], defaults: { progression: 'I-V-vi-IV' },
    desc: 'Suena la base y el mástil enseña las notas de cada acorde. Toca con el micrófono o MIDI: puntúa cuántas notas caen en el acorde.',
    tip: 'Empieza solo con R, 3 y 5; luego activa las notas de paso y une los acordes por la escala.' },
  { id: 'tempo', family: 'game', title: 'Reacción a tempo', interactive: 'tempo', params: ['set'], defaults: { set: 'all' },
    desc: 'Un acorde, una inversión y un grupo de cuerdas por compás, con metrónomo. Marca las tres notas antes de que acabe el compás: si aciertas tres seguidas, el tempo sube.',
    tip: 'No busques la nota: piensa en la forma. Es la prueba de que la tienes automatizada.' },
  { id: 'twelve', family: 'game', title: 'Las 12 formas en 60 segundos', interactive: 'twelve', params: ['quality'], defaults: { quality: 'maj' },
    desc: 'Un acorde al azar: encuentra sus 12 formas (3 inversiones × 4 grupos de cuerdas) en un minuto. Se guarda tu récord.',
    tip: 'Hazlo por orden: las tres inversiones de un grupo y luego el siguiente. Así no te dejas ninguna.' },
  { id: 'dictation', family: 'game', title: 'Dictado de progresiones', interactive: 'dictation', params: ['key'], defaults: {},
    desc: 'Suenan cuatro acordes de la tonalidad (el primero es I). Escribe los otros tres en números romanos; al comprobar, la progresión se anima en el mástil.',
    tip: 'Fíjate en el bajo: si baja un tono desde la tónica suele ser vi o V; si sube una 4.ª, IV.' },
  { id: 'drill', family: 'game', title: 'Prueba de reacción', interactive: 'drill', params: ['set'], defaults: { set: 'all' },
    desc: 'La app pide un acorde, una inversión y un grupo de cuerdas; tú marcas las tres notas en el mástil. Lo que te cuesta vuelve antes.',
    tip: 'Antes de pulsar, piensa qué nota va arriba. El cronómetro premia la respuesta segura.' },
  { id: 'ear', family: 'game', title: 'Oído: calidad y nota aguda', interactive: 'ear', params: [], defaults: {},
    desc: 'Suena una tríada: di si es mayor, menor, disminuida o aumentada, y qué hay arriba (R, 3 o 5).',
    tip: 'Canta la nota aguda: es la que más se oye y la que dirige la melodía.' },
];

export const TRIAD_FAMILIES = [
  { id: 'shapes', label: 'Formas e inversiones' },
  { id: 'key', label: 'En la tonalidad' },
  { id: 'voice', label: 'Conducción de voces' },
  { id: 'harmony', label: 'Armonía' },
  { id: 'melodic', label: 'Melodía y movimiento' },
  { id: 'style', label: 'Ritmo y estilo' },
  { id: 'game', label: 'Velocidad, oído e improvisación' },
];

export const triadExercise = (id) => TRIAD_EXERCISES.find((x) => x.id === id) ?? TRIAD_EXERCISES[0];

/** Genera los pasos de un ejercicio con los parámetros (con valores por defecto). */
export function buildTriadExercise(id, params = {}) {
  const ex = triadExercise(id);
  if (!ex.run) return { ex, steps: [] };
  const p = {
    keyPc: 0, rootPc: 0, quality: 'maj', set: 0, inversion: 0, shape: 'E', progression: 'I-IV-V', degree: 0, beats: 2,
    ...ex.defaults,
    ...Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
  };
  return { ex, steps: assignVoices(ex.run(p)), params: p };
}

/**
 * Empareja las voces de dos acordes por el menor movimiento: las notas que
 * no cambian de sitio son la misma voz, y el resto va a la nota más cercana
 * en altura (aunque cambie de cuerda). Devuelve perm: voz k de `a` → nota perm[k] de `b`.
 */
export function matchVoices(a, b) {
  const n = a.length;
  if (n !== b.length || n > 4) return a.map((_, i) => i);
  const perms = [];
  const walk = (used, acc) => {
    if (acc.length === n) { perms.push(acc); return; }
    for (let i = 0; i < n; i += 1) if (!used.has(i)) walk(new Set([...used, i]), [...acc, i]);
  };
  walk(new Set(), []);
  const cost = (x, y) => (x.s === y.s && x.f === y.f ? 0 : 0.5 + Math.abs(x.midi - y.midi) + Math.abs(x.s - y.s) * 0.01);
  let best = perms[0];
  let bestCost = Infinity;
  for (const p of perms) {
    const c = p.reduce((t, j, k) => t + cost(a[k], b[j]), 0);
    if (c < bestCost) { bestCost = c; best = p; }
  }
  return best;
}

/**
 * Numera las voces a lo largo del ejercicio para que cada una siga a la nota
 * a la que realmente se mueve (lo usan las flechas y el deslizamiento).
 */
export function assignVoices(steps) {
  let last = null;
  return steps.map((st) => {
    if (st.kind === 'chord') {
      const notes = st.notes.map((n, i) => ({ ...n, voice: i }));
      if (last && last.notes.length === notes.length) {
        const perm = matchVoices(last.notes, notes);
        perm.forEach((j, k) => { notes[j].voice = last.notes[k].voice; });
      }
      const out = { ...st, notes };
      last = out;
      return out;
    }
    if ((st.kind === 'pass' || st.kind === 'rest' || st.kind === 'orn') && last) {
      return {
        ...st,
        notes: st.notes.map((n) => {
          const same = last.notes.find((m) => m.s === n.s && (n.held ? m.f === n.f : true));
          return { ...n, voice: same?.voice ?? n.voice };
        }),
      };
    }
    return st;
  });
}

/** Voces que cambian entre dos pasos de acorde: [{ from, to, semis }] y notas comunes. */
export function voiceMoves(a, b) {
  if (!a || !b || a.notes.length !== b.notes.length) return { moves: [], common: [] };
  const moves = [];
  const common = [];
  a.notes.forEach((n, i) => {
    const m = b.notes.find((x) => x.voice === n.voice) ?? b.notes[i];
    if (n.s === m.s && n.f === m.f) common.push(m);
    else moves.push({ from: n, to: m, semis: m.midi - n.midi });
  });
  return { moves, common };
}

/* ───────────── partitura (alphaTex) ───────────── */

const TICKS_PER_BEAT = 48;
const NOTE_VALUES = [[192, 1], [96, 2], [48, 4], [24, 8], [12, 16]];

/**
 * Pasos → beats de alphaTex (blanca, negra, corchea, tresillo…), partiendo
 * con ligadura lo que cruza la barra de compás. Devuelve también el índice
 * del primer beat de cada paso para sincronizar el cursor de la partitura.
 */
export function stepsToBeats(steps, { barBeats = 4 } = {}) {
  const barTicks = barBeats * TICKS_PER_BEAT;
  const beats = [];
  const firstBeat = [];
  let pos = 0;
  let prevChord = null;
  for (const st of steps) {
    firstBeat.push(beats.length);
    const notes = st.notes.filter((n) => !n.held).map((n) => ({ s: n.s, f: n.f }));
    // Ligados y slides: la marca va en la nota de origen (la del beat anterior, misma cuerda).
    for (const n of st.notes.filter((x) => !x.held && x.art)) {
      const prev = beats[beats.length - 1]?.notes.find((m) => m.s === n.s);
      if (prev) prev.tech = [...(prev.tech ?? []), n.art === 'S' ? '/' : 'h'];
    }
    const name = st.kind === 'chord' ? st.chord?.name : null;
    const chord = name && name !== prevChord ? name : null;
    if (name) prevChord = name;
    const d = st.d ?? 1;
    // Tresillos de corchea: un tercio de pulso.
    if (Math.abs(d * 3 - Math.round(d * 3)) < 1e-6 && Math.round(d * 3) % 3 !== 0 && Math.abs(d - 0.5) > 1e-6 && d < 1) {
      beats.push({ notes: notes.map((n) => ({ ...n, tech: [] })), dur: 8, tuplet: true, chord });
      pos = (pos + 16) % barTicks;
      continue;
    }
    let left = Math.round(d * TICKS_PER_BEAT);
    let first = true;
    while (left > 0) {
      const room = barTicks - pos;
      let chunk = Math.min(left, room);
      const [t, dur] = NOTE_VALUES.find(([tk]) => tk <= chunk) ?? [12, 16];
      chunk = t;
      beats.push({ notes: notes.map((n) => ({ ...n, tie: !first, tech: [] })), dur, chord: first ? chord : null });
      first = false;
      left -= chunk;
      pos = (pos + chunk) % barTicks;
    }
  }
  return { beats, firstBeat };
}

/** Descripción corta de un paso de acorde: «Cm · 1.ª inversión · cuerdas 234». */
export function describeStep(st) {
  if (st.kind === 'improv') return `Improvisa sobre ${st.chord.name}: busca R, 3 y 5`;
  if (st.kind !== 'chord') return `${st.chord?.name ?? ''}${st.label ? ` · ${st.label}` : ''}`;
  const strings = st.notes.map((n) => n.s + 1).sort((x, y) => x - y).join('');
  return `${st.chord.roman ? `${st.chord.roman} · ` : ''}${st.chord.name} · ${INVERSION_LABELS[st.inv] ?? ''} · cuerdas ${strings}${st.label ? ` · ${st.label}` : ''}`;
}

/* ───────────── retos ───────────── */

/** Pregunta para la prueba de reacción, con peso por repaso espaciado. */
export function drillQuestion({ rng = Math.random, set = 'all', stats = {} } = {}) {
  const pool = [];
  for (const si of setsOf(set)) {
    for (const typeId of QUALITIES) {
      for (let inv = 0; inv < 3; inv += 1) {
        const k = `${si}:${typeId}:${inv}`;
        const st = stats[k];
        const w = !st ? 2 : 1 + (st.miss * 2) / (st.ok + st.miss + 1) + Math.min(2, (st.ms ?? 4000) / 4000);
        pool.push({ k, si, typeId, inv, w });
      }
    }
  }
  let r = rng() * pool.reduce((a, x) => a + x.w, 0);
  let q = pool[pool.length - 1];
  for (const x of pool) { r -= x.w; if (r <= 0) { q = x; break; } }
  const rootPc = Math.floor(rng() * 12);
  const chord = { rootPc, typeId: q.typeId, name: chordName(rootPc, q.typeId) };
  const answers = candidates(chord, q.si, { inversion: q.inv });
  return { key: q.k, chord, set: q.si, inv: q.inv, answers };
}

/** ¿Las posiciones marcadas forman alguna de las respuestas válidas? */
export function checkDrill(marks, q) {
  const key = (n) => `${n.s}-${n.f}`;
  const got = new Set(marks.map(key));
  const match = q.answers.find((v) => v.notes.length === got.size && v.notes.every((n) => got.has(key(n))));
  if (match) return { ok: true, voicing: match };
  // Pista: qué pasa con lo marcado.
  const pcs = chordPcs(q.chord.rootPc, q.chord.typeId);
  const wrongNotes = marks.filter((n) => !pcs.includes(mod(STD[n.s] + n.f, 12)));
  const wrongStrings = marks.filter((n) => !SETS[q.set].includes(n.s));
  let why = '';
  if (wrongStrings.length) why = `Hay notas fuera de las cuerdas ${setName(q.set)}.`;
  else if (wrongNotes.length) why = 'Alguna nota no pertenece al acorde.';
  else why = `Son las notas del acorde, pero no en ${INVERSION_LABELS[q.inv].toLowerCase()}: mira cuál queda en el bajo.`;
  const best = q.answers.reduce((a, v) => (!a || Math.abs(avgFret(v) - (marks[0]?.f ?? 5)) < Math.abs(avgFret(a) - (marks[0]?.f ?? 5)) ? v : a), null);
  return { ok: false, why, voicing: best };
}

export function recordDrill(stats, key, ok, ms) {
  const prev = stats?.[key] ?? { ok: 0, miss: 0, ms: null };
  return {
    ...(stats ?? {}),
    [key]: {
      ok: prev.ok + (ok ? 1 : 0),
      miss: prev.miss + (ok ? 0 : 1),
      ms: ok ? (prev.ms ? Math.round(prev.ms * 0.6 + ms * 0.4) : Math.round(ms)) : prev.ms,
    },
  };
}

/** Pregunta de oído: tríada cerrada aleatoria en un grupo de cuerdas. */
export function earQuestion(rng = Math.random) {
  const typeId = QUALITIES[Math.floor(rng() * 4)];
  const rootPc = Math.floor(rng() * 12);
  const si = Math.floor(rng() * 4);
  const chord = { rootPc, typeId, name: chordName(rootPc, typeId) };
  const list = candidates(chord, si).filter((v) => v.high <= 12);
  const v = list[Math.floor(rng() * list.length)] ?? candidates(chord, 0)[0];
  const step = chordStep(v, chord, 2);
  const top = step.notes[step.notes.length - 1];
  return { step, typeId, top: top.role };
}

export { INVERSION_LABELS, stringSetLabel };
