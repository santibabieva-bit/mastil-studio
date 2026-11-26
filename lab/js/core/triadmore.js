/**
 * Más ejercicios de tríadas: conducción de voces (nota pedal, líneas
 * cromáticas, mano quieta, bajo descendente), armonía (estructuras
 * superiores, préstamo modal, dominantes secundarios, sus), ritmo y adornos,
 * tonalidad del día, canciones, base para improvisar, dictado, reto de las
 * 12 formas y el plan intensivo de 4 semanas. Puro: se prueba en Node.
 */

import { mod, pcName } from './music.js';
import { CHORD_TYPES, chordPcs, parseChordSymbol } from './chords.js';
import { movementBetween } from './triads.js';
import {
  MAJOR, MAX_FRET, QUALITIES, SETS, STD, avgFret, candidates, chordName, chordStep, diatonic, leadPath,
  progressionChords, scaleVertical, setsOf, spell, there,
} from './triadex.js';

const note = (s, f, extra = {}) => ({ s, f, midi: STD[s] + f, ...extra });

/** Nombre con ♭ o ♯ elegido (♭VI, ♭VII y ♭III se escriben con bemol; ♯IV con sostenido). */
const named = (rootPc, typeId, accidental) => `${pcName(mod(rootPc, 12), accidental)}${CHORD_TYPES[typeId].symbol}`;
const accidentalFor = (iv, keyPc) => ([3, 8, 10].includes(iv) ? 'flat' : iv === 6 ? 'sharp' : null) ?? (spell(keyPc, keyPc).includes('♭') || [5].includes(keyPc) ? 'flat' : 'sharp');

/** Acorde «libre» (cualquier grupo de tres notas) con nombre propio. */
const custom = (rootPc, ivs, name, extra = {}) => ({ rootPc: mod(rootPc, 12), pcs: ivs.map((x) => mod(rootPc + x, 12)), name, ...extra });

/* ───────────── conducción de voces ───────────── */

/** Nota aguda fija (pedal) y debajo cambian los acordes de la tonalidad que la contienen. */
export function pedalTop(p) {
  const dia = diatonic(p.keyPc);
  const deg = Number(p.pedal ?? 0);
  const pc = mod(p.keyPc + MAJOR[deg], 12);
  const holders = [dia[deg], ...dia.filter((c, k) => k !== deg && chordPcs(c.rootPc, c.typeId).includes(pc))];
  const seq = there(holders);
  const steps = [];
  for (const si of setsOf(p.set)) {
    const top = SETS[si][0];
    // La nota pedal en la cuerda aguda del grupo: la primera altura donde caben todos los acordes.
    const f0 = mod(pc - STD[top], 12);
    let lists = null;
    for (const f of [f0, f0 + 12].filter((x) => x >= 1 && x <= MAX_FRET).sort((a, b) => Math.abs(a - 7) - Math.abs(b - 7))) {
      const l = seq.map((c) => candidates(c, si, { open: true }).filter((v) => v.notes.some((n) => n.s === top && n.f === f)));
      if (l.every((x) => x.length)) { lists = l; break; }
    }
    if (!lists) continue;
    const path = leadPath(seq, (c, i) => lists[i]);
    if (path) path.forEach((v, i) => steps.push(chordStep(v, seq[i], p.beats, { label: `${spell(pc, p.keyPc)} fija arriba` })));
  }
  return steps;
}

/** Líneas cromáticas interiores: C → C+ → C6 → C7 → F y el «line cliché» Am → Am(maj7) → Am7 → Am6. */
export function chromaticChords(keyPc) {
  const k = keyPc;
  const r = mod(k + 9, 12);
  const I = spell(k, k);
  const vi = spell(r, k);
  return {
    major: [
      custom(k, [0, 4, 7], I, { typeId: 'maj', label: 'punto de partida' }),
      custom(k, [0, 4, 8], `${I}+`, { typeId: 'aug', label: 'la 5.ª sube' }),
      custom(k, [0, 4, 9], `${I}6`, { label: 'sigue subiendo: 6.ª' }),
      custom(k, [0, 4, 10], `${I}7 (sin 5.ª)`, { label: '♭7: pide ir al IV' }),
      custom(k + 5, [0, 4, 7], chordName(k + 5, 'maj', k), { typeId: 'maj', label: 'resuelve en el IV' }),
    ],
    minor: [
      custom(r, [0, 3, 7], `${vi}m`, { typeId: 'm', label: 'punto de partida' }),
      custom(r, [-1, 3, 7], `${vi}m(maj7)`, { label: 'la tónica baja' }),
      custom(r, [-2, 3, 7], `${vi}m7`, { label: 'sigue bajando' }),
      custom(r, [-3, 3, 7], `${vi}m6`, { label: 'y otra vez' }),
      custom(r, [0, 3, 7], `${vi}m`, { typeId: 'm', label: 'vuelta a casa' }),
    ],
  };
}

export function chromaticLine(p) {
  const { major, minor } = chromaticChords(p.keyPc);
  const steps = [];
  for (const si of setsOf(p.set)) {
    for (const seq of [major, minor]) {
      const path = leadPath(seq, (c) => candidates(c, si), { startCost: (v) => Math.abs(avgFret(v) - 7) * 0.1 });
      if (path) path.forEach((v, i) => steps.push(chordStep(v, seq[i], p.beats, { label: seq[i].label })));
    }
  }
  return steps;
}

/** La progresión entera dentro de una ventana de cuatro trastes (la mano no se mueve). */
export function handStill(p) {
  const chords = progressionChords(p);
  const loop = [...chords, ...chords];
  const sets = setsOf(p.set);
  let best = null;
  for (let from = 1; from <= 11; from += 1) {
    const to = from + 3;
    const path = leadPath(loop, (c) => sets.flatMap((si) => candidates(c, si).filter((v) => v.notes.every((n) => n.f >= from && n.f <= to))), { startCost: () => 0 });
    if (!path) continue;
    let move = 0;
    for (let i = 1; i < path.length; i += 1) move += movementBetween(STD, path[i - 1], path[i]);
    const score = move + Math.abs(from + 1.5 - 6) * 0.6;
    if (!best || score < best.score) best = { score, path, from, to };
  }
  if (!best) return [];
  const shape = { id: 'mano', from: best.from, to: best.to, color: '#3b73c9', label: `Mano quieta: trastes ${best.from}–${best.to}` };
  return best.path.map((v, i) => chordStep(v, loop[i], p.beats, { shape }));
}

/** Bajo que desciende por la escala con inversiones: I – V/7 – vi – I/5 – IV – I/3 – ii – V – I. */
export const BASS_LINE = [[0, 0], [4, 6], [5, 5], [0, 4], [3, 3], [0, 2], [1, 1], [4, 4], [0, 0]];

export function bassLine(p) {
  const dia = diatonic(p.keyPc);
  const chords = BASS_LINE.map(([c, b]) => {
    const bassPc = mod(p.keyPc + MAJOR[b], 12);
    const base = dia[c];
    return { ...base, bassPc, name: bassPc === base.rootPc ? base.name : `${base.name}/${spell(bassPc, p.keyPc)}` };
  });
  const steps = [];
  for (const si of setsOf(p.set)) {
    const low = SETS[si][2];
    const path = leadPath(chords, (c) => candidates(c, si).filter((v) => {
      const n = v.notes.find((x) => x.s === low);
      return n && mod(STD[low] + n.f, 12) === c.bassPc;
    }), { startCost: (v) => Math.abs(avgFret(v) - 7) * 0.1 });
    if (!path) continue;
    let prevBass = null;
    path.forEach((v, i) => {
      const bass = STD[low] + v.notes.find((x) => x.s === low).f;
      const label = prevBass == null ? 'el bajo marca la línea' : bass < prevBass ? 'el bajo baja' : 'el bajo sube';
      prevBass = bass;
      steps.push(chordStep(v, chords[i], p.beats, { label }));
    });
  }
  return steps;
}

/* ───────────── armonía ───────────── */

/** Tríadas sobre un bajo (estructuras superiores): [intervalo, tipo, acorde completo, por qué]. */
export const UPPER_STRUCTURES = [
  [0, 'maj', '', 'la tríada sola, para comparar'],
  [7, 'maj', 'maj9 (sin 3.ª)', 'V sobre I: abierto, moderno'],
  [4, 'm', 'maj9', 'iii sobre I: la 7.ª mayor y la 9.ª'],
  [2, 'maj', 'maj7(♯11)', 'II sobre I: el sonido lidio'],
  [10, 'maj', '9sus4', '♭VII sobre I: soul y gospel'],
  [3, 'maj', 'm7', '♭III sobre I: el acorde se vuelve menor'],
  [9, 'maj', '13(♭9)', 'VI sobre I: dominante con tensión'],
  [6, 'maj', '7(♭9 ♯11)', '♯IV sobre I: alterado, muy tenso'],
];

export function upperStructures(p) {
  const k = p.keyPc;
  const chords = UPPER_STRUCTURES.map(([iv, typeId, full, why]) => {
    const rootPc = mod(k + iv, 12);
    const tri = named(rootPc, typeId, accidentalFor(iv, k));
    return { rootPc, typeId, name: iv === 0 ? tri : `${tri}/${spell(k, k)}`, label: iv === 0 ? why : `= ${spell(k, k)}${full} · ${why}` };
  });
  const steps = [];
  for (const si of setsOf(p.set)) {
    const path = leadPath(chords, (c) => candidates(c, si).filter((v) => v.low >= 3), { startCost: (v) => Math.abs(avgFret(v) - 8) * 0.1 });
    if (path) path.forEach((v, i) => steps.push(chordStep(v, chords[i], Math.max(4, p.beats * 2), { label: chords[i].label, bass: 36 + k })));
  }
  return steps;
}

/** Progresiones con acordes de fuera: préstamo del modo menor y dominantes secundarios. */
export const BORROWED = [
  { label: 'I – ♭VI – ♭VII – I', chords: [[0, 'maj', 'I'], [8, 'maj', '♭VI'], [10, 'maj', '♭VII'], [0, 'maj', 'I']] },
  { label: 'I – iv – I', chords: [[0, 'maj', 'I'], [5, 'm', 'iv'], [0, 'maj', 'I']] },
  { label: 'IV – iv – I', chords: [[5, 'maj', 'IV'], [5, 'm', 'iv'], [0, 'maj', 'I']] },
  { label: 'I – ♭III – IV – I', chords: [[0, 'maj', 'I'], [3, 'maj', '♭III'], [5, 'maj', 'IV'], [0, 'maj', 'I']] },
  { label: 'I – ♭VII – IV – I', chords: [[0, 'maj', 'I'], [10, 'maj', '♭VII'], [5, 'maj', 'IV'], [0, 'maj', 'I']] },
];
export const SECONDARY = [
  { label: 'I – VI – ii – V – I', chords: [[0, 'maj', 'I'], [9, 'maj', 'V/ii'], [2, 'm', 'ii'], [7, 'maj', 'V'], [0, 'maj', 'I']] },
  { label: 'I – III – vi – IV – V', chords: [[0, 'maj', 'I'], [4, 'maj', 'V/vi'], [9, 'm', 'vi'], [5, 'maj', 'IV'], [7, 'maj', 'V']] },
  { label: 'I – II – V – I', chords: [[0, 'maj', 'I'], [2, 'maj', 'V/V'], [7, 'maj', 'V'], [0, 'maj', 'I']] },
  { label: 'I – VII – iii – IV – I', chords: [[0, 'maj', 'I'], [11, 'maj', 'V/iii'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [0, 'maj', 'I']] },
];

function outsideRun(list, why) {
  return (p) => {
    const inKey = diatonic(p.keyPc).map((c) => `${c.rootPc}:${c.typeId}`);
    const steps = [];
    const si = setsOf(p.set)[0];
    let prev = null;
    for (const prog of list) {
      const chords = prog.chords.map(([iv, typeId, roman]) => {
        const rootPc = mod(p.keyPc + iv, 12);
        const outside = !inKey.includes(`${rootPc}:${typeId}`);
        return { rootPc, typeId, roman, outside, name: named(rootPc, typeId, accidentalFor(iv, p.keyPc)), label: outside ? why : prog.label };
      });
      const path = leadPath(chords, (c) => candidates(c, si), {
        startCost: (v) => (prev ? movementBetween(STD, prev, v) : Math.abs(avgFret(v) - 6) * 0.1),
      });
      if (!path) continue;
      path.forEach((v, i) => steps.push(chordStep(v, chords[i], p.beats, { label: chords[i].label })));
      prev = path[path.length - 1];
    }
    return steps;
  };
}
// Funciones (no constantes) para que el catálogo de triadex.js pueda usarlas aunque se carguen en ciclo.
export function borrowedRun(p) { return outsideRun(BORROWED, 'prestado del modo menor')(p); }
export function secondaryRun(p) { return outsideRun(SECONDARY, 'dominante secundario: la 3.ª sube un semitono')(p); }

/** Suspender y resolver: X → Xsus4 → X → Xsus2 → X en I, IV, V y vi. */
export function susResolve(p) {
  const dia = diatonic(p.keyPc);
  const chords = [];
  for (const k of [0, 3, 4, 5]) {
    const c = dia[k];
    const sus = (typeId, label) => ({ rootPc: c.rootPc, typeId, roman: c.roman, name: chordName(c.rootPc, typeId, p.keyPc), label });
    chords.push({ ...c, label: 'acorde' }, sus('sus4', 'la 3.ª sube a la 4.ª'), { ...c, label: 'resuelve' }, sus('sus2', 'la 3.ª baja a la 2.ª'), { ...c, label: 'resuelve' });
  }
  const steps = [];
  for (const si of setsOf(p.set)) {
    const path = leadPath(chords, (c) => candidates(c, si), { startCost: (v) => Math.abs(avgFret(v) - 6) * 0.1 });
    if (path) path.forEach((v, i) => steps.push(chordStep(v, chords[i], p.beats / 2, { label: chords[i].label })));
  }
  return steps;
}

/* ───────────── ritmo y estilo ───────────── */

export const GROOVES = {
  reggae: { label: 'Reggae (contratiempos)', pattern: '.x.x.x.x', unit: 0.5, set: 0 },
  funk: { label: 'Funk (semicorcheas)', pattern: 'x.xx.x.xx.x..xx.', unit: 0.25, set: 0 },
  motown: { label: 'Motown (2 y 4)', pattern: '.x.x', unit: 1, set: 0 },
  country: { label: 'Country (bajo y acorde)', pattern: 'BxBx', unit: 1, set: 1 },
};

/** Nota grave (tónica o 5.ª) en las cuerdas 5-6 cerca de la forma. */
function bassNear(v, pc) {
  const center = avgFret(v);
  let best = null;
  for (const s of [4, 5]) {
    for (let f = 0; f <= MAX_FRET; f += 1) {
      if (mod(STD[s] + f, 12) !== pc) continue;
      const d = Math.abs(f - center);
      if (!best || d < best.d) best = { s, f, d };
    }
  }
  return best;
}

export function rhythmGroove(p) {
  const g = GROOVES[p.groove] ?? GROOVES.reggae;
  const chords = progressionChords(p);
  const si = p.set == null || p.set === 'all' ? g.set : Number(p.set);
  const path = leadPath(chords, (c) => candidates(c, si), { startCost: (v) => Math.abs(avgFret(v) - 7) * 0.1 });
  if (!path) return [];
  const steps = [];
  for (let rep = 0; rep < 2; rep += 1) {
    path.forEach((v, i) => {
      const c = chords[i];
      const full = chordStep(v, c, g.unit, { label: g.label });
      let bassIdx = 0;
      for (const ch of g.pattern) {
        if (ch === 'x') steps.push({ ...full, d: g.unit });
        else if (ch === 'B') {
          const pc = bassIdx % 2 === 0 ? c.rootPc : mod(c.rootPc + 7, 12);
          const b = bassNear(v, pc);
          steps.push({ kind: 'arp', notes: [note(b.s, b.f, { role: bassIdx % 2 === 0 ? 'root' : 'fifth' })], d: g.unit, chord: full.chord });
          bassIdx += 1;
        } else steps.push({ kind: 'rest', notes: full.notes.map((n) => ({ ...n, held: true })), d: g.unit, chord: full.chord });
      }
    });
  }
  return steps;
}

/** Adornos: entrada deslizando desde un traste abajo, pull-off desde la sus4 y la 6.ª añadida. */
export function ornaments(p) {
  const chords = progressionChords(p);
  const si = setsOf(p.set)[0];
  const path = leadPath(chords, (c) => candidates(c, si).filter((v) => v.low >= 2), { startCost: (v) => Math.abs(avgFret(v) - 7) * 0.1 });
  if (!path) return [];
  const steps = [];
  path.forEach((v, i) => {
    const c = chords[i];
    const base = chordStep(v, c, 1);
    // 1) Slide: la forma un traste abajo y desliza a su sitio (2 pulsos).
    steps.push({ kind: 'orn', notes: base.notes.map((n) => ({ ...n, f: n.f - 1, midi: n.midi - 1 })), d: 0.5, chord: base.chord, label: 'desde un traste abajo…' });
    steps.push({ ...base, d: 1.5, notes: base.notes.map((n) => ({ ...n, art: 'S' })), label: 'slide al acorde' });
    // 2) Hammer-on desde la sus4 (1 pulso).
    const sus = c.typeId === 'maj' || c.typeId === 'm'
      ? candidates({ rootPc: c.rootPc, typeId: 'sus4' }, si).find((x) => x.notes.filter((n) => !v.notes.some((m) => m.s === n.s && m.f === n.f)).length === 1)
      : null;
    if (sus) {
      const susStep = chordStep(sus, { rootPc: c.rootPc, typeId: 'sus4', name: chordName(c.rootPc, 'sus4', p.keyPc) }, 0.5);
      const moved = new Set(base.notes.filter((n) => !sus.notes.some((m) => m.s === n.s && m.f === n.f)).map((n) => n.s));
      steps.push({ ...susStep, kind: 'orn', label: 'sus4…' });
      steps.push({ ...base, d: 0.5, notes: base.notes.map((n) => (moved.has(n.s) ? { ...n, art: 'P' } : { ...n, held: true })), label: 'pull-off a la 3.ª' });
    } else steps.push({ ...base, d: 1 });
    // 3) La 5.ª sube a la 6.ª y vuelve (1 pulso), si cabe en la mano.
    const fifth = base.notes.find((n) => n.role === 'fifth');
    const frets = base.notes.map((n) => n.f);
    if (fifth && Math.max(...frets, fifth.f + 2) - Math.min(...frets) <= 4) {
      steps.push({ kind: 'orn', notes: base.notes.map((n) => (n === fifth ? { ...n, f: n.f + 2, midi: n.midi + 2, role: 'other', art: 'H' } : { ...n, held: true })), d: 0.5, chord: base.chord, label: '6.ª añadida' });
      steps.push({ ...base, d: 0.5, notes: base.notes.map((n) => (n.s === fifth.s ? { ...n, art: 'P' } : { ...n, held: true })), label: 'vuelve a la 5.ª' });
    } else steps.push({ ...base, d: 1 });
  });
  return steps;
}

/* ───────────── tonalidad del día, canciones e improvisación ───────────── */

const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/** Tonalidad del día: recorre el círculo de quintas, una al día. */
export function dailyKey(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return CIRCLE[mod(day, 12)];
}

export function dailyScale(p) {
  return scaleVertical({ ...p, keyPc: dailyKey(p.date ?? new Date()), shape: 'all' });
}

const TO_TRIAD = {
  maj: 'maj', m: 'm', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4', 5: 'maj', maj7: 'maj', m7: 'm', 7: 'maj', m7b5: 'dim', dim7: 'dim',
  mMaj7: 'm', 6: 'maj', m6: 'm', 9: 'maj', maj9: 'maj', m9: 'm', add9: 'maj', '7sus4': 'sus4', '7#5': 'aug',
};

/** Cifrado → tríadas: «C G/B Am7 F | Dm G7 C». Lo que no se entiende se ignora. */
export function parseSong(text) {
  const out = [];
  for (const tok of String(text ?? '').split(/[\s|,]+/)) {
    if (!tok) continue;
    const c = parseChordSymbol(tok);
    if (!c) continue;
    const typeId = TO_TRIAD[c.typeId] ?? (CHORD_TYPES[c.typeId]?.intervals.includes(3) ? 'm' : 'maj');
    out.push({ rootPc: c.rootPc, typeId, name: chordName(c.rootPc, typeId, c.rootPc), symbol: c.symbol });
  }
  return out;
}

export function songTriads(p) {
  const chords = parseSong(p.song);
  if (!chords.length) return [];
  const steps = [];
  for (const si of setsOf(p.set)) {
    const path = leadPath(chords, (c) => candidates(c, si), { startCost: (v) => Math.abs(avgFret(v) - 6) * 0.1 });
    if (path) path.forEach((v, i) => steps.push(chordStep(v, chords[i], p.beats, { label: chords[i].symbol !== chords[i].name ? `cifrado: ${chords[i].symbol}` : null })));
  }
  return steps;
}

/** Base para improvisar: cada acorde un compás, con pad y bajo; tú tocas. */
export function improvBacking(p) {
  const chords = progressionChords(p);
  const steps = [];
  for (let rep = 0; rep < 4; rep += 1) {
    for (const c of chords) {
      const pcs = chordPcs(c.rootPc, c.typeId);
      steps.push({ kind: 'improv', notes: [], d: 4, chord: c, pad: pcs.map((pc) => 48 + pc), bass: 36 + c.rootPc });
    }
  }
  return steps;
}

/** Juzga una nota tocada sobre el acorde: 'chord', 'scale' (de paso) o 'out'. */
export function judgeImprovNote(midi, chord, keyPc) {
  const pc = mod(midi, 12);
  if (chordPcs(chord.rootPc, chord.typeId).includes(pc)) return 'chord';
  if (MAJOR.map((x) => mod(keyPc + x, 12)).includes(pc)) return 'scale';
  return 'out';
}

/* ───────────── retos ───────────── */

/** Las 12 formas de un acorde: 3 inversiones × 4 grupos de cuerdas, con sus respuestas válidas. */
export function allForms(chord) {
  const out = [];
  for (let si = 0; si < SETS.length; si += 1) {
    for (let inv = 0; inv < 3; inv += 1) out.push({ si, inv, answers: candidates(chord, si, { inversion: inv, open: true }) });
  }
  return out;
}

/** ¿Las tres marcas forman alguna forma aún no encontrada? Devuelve su índice o -1. */
export function matchForm(marks, forms, found = new Set()) {
  const key = (n) => `${n.s}-${n.f}`;
  const got = new Set(marks.map(key));
  return forms.findIndex((fm, i) => !found.has(i) && fm.answers.some((v) => v.notes.length === got.size && v.notes.every((n) => got.has(key(n)))));
}

const DICTATION_POOL = [
  [0, 3, 4, 0], [0, 4, 5, 3], [0, 5, 3, 4], [0, 1, 4, 0], [0, 3, 0, 4], [0, 5, 1, 4],
  [0, 2, 3, 4], [0, 4, 3, 0], [0, 3, 5, 4], [0, 5, 4, 3], [0, 1, 3, 4], [0, 2, 5, 4],
];

/** Dictado: una progresión de 4 acordes de la tonalidad (empieza en I), con su conducción de voces. */
export function dictationQuestion(keyPc, rng = Math.random, set = 1) {
  const degrees = DICTATION_POOL[Math.floor(rng() * DICTATION_POOL.length)];
  const dia = diatonic(keyPc);
  const chords = degrees.map((k) => dia[k]);
  const path = leadPath(chords, (c) => candidates(c, set), { startCost: (v) => Math.abs(avgFret(v) - 6) * 0.1 });
  return { degrees, chords, steps: path.map((v, i) => chordStep(v, chords[i], 2)) };
}

/* ───────────── plan intensivo ───────────── */

const WEEKS = [
  { theme: 'Formas e inversiones', main: ['inv-h', 'inv-v', 'quality', 'linear', 'spread'], apply: ['scale-h', 'cycle4', 'pedal'] },
  { theme: 'La tonalidad en todo el mástil', main: ['scale-h', 'scale-v', 'daily', 'prog-caged', 'prog-sets'], apply: ['hand', 'bassline', 'passing'] },
  { theme: 'Conducción de voces', main: ['pedal', 'chromatic', 'hand', 'bassline', 'passing', 'melody'], apply: ['sus', 'ornaments', 'rhythm'] },
  { theme: 'Armonía, estilo e improvisación', main: ['upper', 'borrowed', 'secondary', 'song', 'pairs'], apply: ['rhythm', 'ornaments', 'improv'] },
];
const PLAN_KEYS = [0, 7, 2, 9, 4, 5, 10, 3, 11, 6, 8, 1];
const GROOVE_IDS = Object.keys(GROOVES);

/**
 * Día del plan (0–27): bloques de calentamiento, foco, aplicación, oído y
 * reto, con la tonalidad, el grupo de cuerdas y la calidad rotando cada día.
 */
export function planDay(day) {
  const d = Math.max(0, Math.min(27, day));
  const week = Math.floor(d / 7);
  const w = WEEKS[week];
  const keyPc = PLAN_KEYS[d % 12];
  const set = d % 4;
  const quality = QUALITIES[d % 4];
  const params = { keyPc, set, quality, groove: GROOVE_IDS[d % GROOVE_IDS.length], progression: ['I-IV-V', 'I-V-vi-IV', 'I-vi-IV-V', 'ii-V-I', 'vi-IV-I-V'][d % 5] };
  const review = d % 7 === 6;
  const blocks = review
    ? [
      { title: 'Repaso: reacción', ex: 'drill', minutes: 5 },
      { title: 'Repaso: las 12 formas', ex: 'twelve', minutes: 4 },
      { title: 'Repaso de la semana', ex: w.main[0], minutes: 6 },
      { title: 'Repaso de la semana', ex: w.main[(week + 2) % w.main.length], minutes: 6 },
      { title: 'Dictado', ex: 'dictation', minutes: 4 },
    ]
    : [
      { title: 'Calentamiento', ex: d % 2 ? 'drill' : 'tempo', minutes: 4 },
      { title: 'Foco del día', ex: w.main[d % w.main.length], minutes: 7 },
      { title: 'Aplicación', ex: w.apply[d % w.apply.length], minutes: 6 },
      { title: 'Oído', ex: d % 2 ? 'ear' : 'dictation', minutes: 4 },
      { title: 'Reto', ex: 'twelve', minutes: 3 },
    ];
  return { day: d, week: week + 1, theme: w.theme, review, params, blocks: blocks.map((b) => ({ ...b, params })) };
}

/** Día actual del plan a partir de la fecha de inicio (AAAA-MM-DD). */
export function planDayIndex(start, today = new Date()) {
  const a = Date.UTC(...start.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((b - a) / 86400000);
}
