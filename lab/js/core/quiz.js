/**
 * Generador de preguntas del Theory Trainer y registro de puntos débiles.
 * Cada pregunta: { id, type, kind, prompt, options?, answer, board?, explanation, statKey }.
 *  - kind 'choice': options [{ label, value }], answer = value
 *  - kind 'fret': el usuario pulsa un traste; answer = { s, f }
 */

import {
  COMMON_KEYS,
  INTERVAL_NAMES,
  createNoteCollection,
  keySignature,
  mod,
  parseRoot,
  pcName,
  pick,
  prettyNote,
  shuffle,
  midiAt,
} from './music.js';
import { diatonicChords } from './chords.js';
import { dueWeight, reviewCard } from './srs.js';
import { functionQuestion } from './harmony.js';

export const LEVELS = {
  beginner: { id: 'beginner', label: 'Principiante', maxFret: 5, accidentals: false, strings: [0, 1, 2, 3, 4, 5], keys: ['C', 'G', 'D', 'A', 'E', 'F'] },
  intermediate: { id: 'intermediate', label: 'Intermedio', maxFret: 12, accidentals: true, strings: [0, 1, 2, 3, 4, 5], keys: COMMON_KEYS },
  advanced: { id: 'advanced', label: 'Avanzado', maxFret: 12, accidentals: true, strings: [0, 1, 2, 3, 4, 5], keys: COMMON_KEYS },
};

export const QUIZ_TOPICS = {
  fretNote: { id: 'fretNote', label: 'Notas del mástil' },
  findNote: { id: 'findNote', label: 'Encontrar la nota' },
  interval: { id: 'interval', label: 'Intervalos' },
  chordInKey: { id: 'chordInKey', label: 'Acordes de la tonalidad' },
  roman: { id: 'roman', label: 'Números romanos' },
  mode: { id: 'mode', label: 'Modos' },
  keySig: { id: 'keySig', label: 'Armaduras' },
  function: { id: 'function', label: 'Armonía funcional' },
};

const STANDARD = [64, 59, 55, 50, 45, 40];

const NOTE_BUTTONS = [
  { pc: 0, label: 'C' }, { pc: 1, label: 'C♯/D♭' }, { pc: 2, label: 'D' },
  { pc: 3, label: 'D♯/E♭' }, { pc: 4, label: 'E' }, { pc: 5, label: 'F' },
  { pc: 6, label: 'F♯/G♭' }, { pc: 7, label: 'G' }, { pc: 8, label: 'G♯/A♭' },
  { pc: 9, label: 'A' }, { pc: 10, label: 'A♯/B♭' }, { pc: 11, label: 'B' },
];

export function noteButtons(level = 'intermediate') {
  const accidentals = LEVELS[level]?.accidentals ?? true;
  return NOTE_BUTTONS.filter((b) => accidentals || !b.label.includes('/')).map((b) => ({ label: b.label, value: b.pc }));
}

const STRING_NAMES = ['1ª (aguda)', '2ª', '3ª', '4ª', '5ª', '6ª (grave)'];
export function stringName(index) {
  return STRING_NAMES[index] ?? `${index + 1}ª`;
}

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

function randomBoardSpot(level, rng) {
  const cfg = LEVELS[level];
  for (let i = 0; i < 50; i += 1) {
    const s = pick(cfg.strings, rng);
    const f = Math.floor(rng() * (cfg.maxFret + 1));
    const pc = mod(STANDARD[s] + f, 12);
    if (!cfg.accidentals && !NATURAL_PCS.has(pc)) continue;
    return { s, f, pc };
  }
  return { s: 0, f: 0, pc: 4 };
}

function fretNote(level, rng) {
  const spot = randomBoardSpot(level, rng);
  const name = pcName(spot.pc, 'sharp');
  return {
    type: 'fretNote',
    kind: 'choice',
    prompt: `¿Qué nota es? Cuerda ${stringName(spot.s)}, traste ${spot.f}.`,
    board: { s: spot.s, f: spot.f },
    options: noteButtons(level),
    answer: spot.pc,
    explanation: `Cuerda ${stringName(spot.s)}, traste ${spot.f} = ${prettyNote(name)}${NATURAL_PCS.has(spot.pc) ? '' : ` (o ${prettyNote(pcName(spot.pc, 'flat'))})`}.`,
    statKey: `fretNote:${spot.s}`,
  };
}

function findNote(level, rng) {
  const cfg = LEVELS[level];
  const s = pick(cfg.strings, rng);
  const choices = [];
  for (let pc = 0; pc < 12; pc += 1) {
    if (!cfg.accidentals && !NATURAL_PCS.has(pc)) continue;
    choices.push(pc);
  }
  const pc = pick(choices, rng);
  // Traste único dentro de 0–11.
  const f = mod(pc - STANDARD[s], 12);
  const label = NATURAL_PCS.has(pc) ? pcName(pc) : `${prettyNote(pcName(pc, 'sharp'))}/${prettyNote(pcName(pc, 'flat'))}`;
  return {
    type: 'findNote',
    kind: 'fret',
    prompt: `Toca ${label} en la cuerda ${stringName(s)} (trastes 0–11).`,
    findString: s,
    answer: { s, f },
    explanation: `${label} está en el traste ${f} de la cuerda ${stringName(s)}.`,
    statKey: `findNote:${s}`,
  };
}

function intervalQuestion(level, rng) {
  const rootName = pick(LEVELS[level].keys, rng);
  const root = parseRoot(rootName);
  const pool = level === 'beginner'
    ? [3, 4, 5, 7, 12]
    : level === 'intermediate'
      ? [2, 3, 4, 5, 7, 8, 9, 10, 11]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const semis = pick(pool, rng);
  const info = INTERVAL_NAMES[semis];
  const targetPc = mod(root.pc + semis, 12);
  if (rng() < 0.5) {
    return {
      type: 'interval',
      kind: 'choice',
      prompt: `¿Qué nota está a una ${info.name.toLowerCase()} (${info.short}) por encima de ${prettyNote(rootName)}?`,
      options: noteButtons(level === 'beginner' ? 'intermediate' : level),
      answer: targetPc,
      explanation: `${info.name} = ${semis} semitonos: ${prettyNote(rootName)} → ${prettyNote(pcName(targetPc, root.prefer))}.`,
      statKey: `interval:${semis}`,
    };
  }
  const options = shuffle([semis, ...shuffle(pool.filter((p) => p !== semis), rng).slice(0, 3)], rng)
    .map((v) => ({ label: INTERVAL_NAMES[v].name, value: v }));
  return {
    type: 'interval',
    kind: 'choice',
    prompt: `¿Qué intervalo hay de ${prettyNote(rootName)} a ${prettyNote(pcName(targetPc, root.prefer))}? (ascendente)`,
    options,
    answer: semis,
    explanation: `${semis} semitonos = ${info.name} (${info.short}).`,
    statKey: `interval:${semis}`,
  };
}

function chordInKey(level, rng) {
  const rootName = pick(LEVELS[level].keys, rng);
  const minor = level !== 'beginner' && rng() < 0.3;
  const seventh = level === 'advanced';
  const chords = diatonicChords(rootName, minor ? 'naturalMinor' : 'major', seventh);
  const target = pick(chords, rng);
  const distractors = shuffle(
    diatonicChords(pick(COMMON_KEYS, rng), 'major', seventh).map((c) => c.symbol)
      .concat(chords.map((c) => c.symbol)),
    rng,
  ).filter((s) => s !== target.symbol);
  const options = shuffle([target.symbol, ...[...new Set(distractors)].slice(0, 3)], rng)
    .map((s) => ({ label: s, value: s }));
  return {
    type: 'chordInKey',
    kind: 'choice',
    prompt: `En ${prettyNote(rootName)} ${minor ? 'menor' : 'mayor'}, ¿qué acorde es el ${target.roman}?`,
    options,
    answer: target.symbol,
    explanation: `${target.roman} en ${prettyNote(rootName)} ${minor ? 'menor' : 'mayor'} = ${target.symbol} (${target.notes.join(' ')}).`,
    statKey: `chordInKey:${target.degree}`,
  };
}

function romanQuestion(level, rng) {
  const rootName = pick(LEVELS[level].keys, rng);
  const seventh = level === 'advanced';
  const chords = diatonicChords(rootName, 'major', seventh);
  const target = pick(chords, rng);
  const options = shuffle([target, ...shuffle(chords.filter((c) => c !== target), rng).slice(0, 3)], rng)
    .map((c) => ({ label: c.roman, value: c.roman }));
  return {
    type: 'roman',
    kind: 'choice',
    prompt: `En ${prettyNote(rootName)} mayor, ¿qué grado es ${target.symbol}?`,
    options,
    answer: target.roman,
    explanation: `${target.symbol} es el ${target.roman} de ${prettyNote(rootName)} mayor.`,
    statKey: `roman:${target.degree}`,
  };
}

const MODES = [
  { id: 'major', label: 'Jónico (mayor)', degree: 0 },
  { id: 'dorian', label: 'Dórico', degree: 1 },
  { id: 'phrygian', label: 'Frigio', degree: 2 },
  { id: 'lydian', label: 'Lidio', degree: 3 },
  { id: 'mixolydian', label: 'Mixolidio', degree: 4 },
  { id: 'naturalMinor', label: 'Eólico (menor natural)', degree: 5 },
  { id: 'locrian', label: 'Locrio', degree: 6 },
];

function modeQuestion(level, rng) {
  const pool = level === 'beginner' ? MODES.filter((m) => ['major', 'naturalMinor', 'dorian', 'mixolydian'].includes(m.id)) : MODES;
  const target = pick(pool, rng);
  if (rng() < 0.5) {
    // «¿Qué modo es X a X sobre las notas de Y mayor?»
    const parentName = pick(LEVELS[level].keys, rng);
    const parent = createNoteCollection(parentName, 'scale', 'major');
    const startNote = parent.notes[target.degree];
    const options = shuffle([target, ...shuffle(pool.filter((m) => m !== target), rng).slice(0, 3)], rng)
      .map((m) => ({ label: m.label, value: m.id }));
    return {
      type: 'mode',
      kind: 'choice',
      prompt: `Tocas las notas de ${prettyNote(parentName)} mayor empezando en ${startNote.name}. ¿Qué modo es?`,
      options,
      answer: target.id,
      explanation: `El ${target.degree + 1}º grado de ${prettyNote(parentName)} mayor genera el modo ${target.label.toLowerCase()}.`,
      statKey: `mode:${target.id}`,
    };
  }
  const col = createNoteCollection('C', 'scale', target.id);
  const formula = col.notes.map((n) => {
    const diff = n.interval - [0, 2, 4, 5, 7, 9, 11][col.notes.indexOf(n)];
    return `${diff < 0 ? '♭' : diff > 0 ? '♯' : ''}${col.notes.indexOf(n) + 1}`;
  }).join(' ');
  const options = shuffle([target, ...shuffle(pool.filter((m) => m !== target), rng).slice(0, 3)], rng)
    .map((m) => ({ label: m.label, value: m.id }));
  return {
    type: 'mode',
    kind: 'choice',
    prompt: `¿Qué modo tiene esta fórmula?  ${formula}`,
    options,
    answer: target.id,
    explanation: `${formula} corresponde al modo ${target.label.toLowerCase()}.`,
    statKey: `mode:${target.id}`,
  };
}

function keySigQuestion(level, rng) {
  const rootName = pick(LEVELS[level].keys, rng);
  const sig = keySignature(rootName, 'major');
  const count = sig.sharps || sig.flats;
  const kind = sig.sharps ? '♯' : sig.flats ? '♭' : '';
  const answer = count ? `${count}${kind}` : '0';
  const choices = new Set([answer]);
  while (choices.size < 4) {
    const n = Math.floor(rng() * 5);
    choices.add(n === 0 ? '0' : `${n}${rng() < 0.5 ? '♯' : '♭'}`);
  }
  return {
    type: 'keySig',
    kind: 'choice',
    prompt: `¿Cuántas alteraciones tiene ${prettyNote(rootName)} mayor?`,
    options: shuffle([...choices], rng).map((v) => ({ label: v === '0' ? 'Ninguna' : v, value: v })),
    answer,
    explanation: `${prettyNote(rootName)} mayor: ${sig.collection.notes.map((n) => n.name).join(' ')}.`,
    statKey: `keySig:${rootName}`,
  };
}

const GENERATORS = {
  fretNote,
  findNote,
  interval: intervalQuestion,
  chordInKey,
  roman: romanQuestion,
  mode: modeQuestion,
  keySig: keySigQuestion,
  function: functionQuestion,
};

let counter = 0;

/** Crea una pregunta. Si hay `weak` (mapa statKey→{wrong,right}) sesga hacia errores. */
export function makeQuestion({ topics, level = 'intermediate', rng = Math.random, weak = null, srs = null, now = Date.now() }) {
  const pool = topics?.length ? topics : Object.keys(GENERATORS);
  let best = null;
  const attempts = srs ? 6 : weak ? 4 : 1;
  for (let i = 0; i < attempts; i += 1) {
    const type = pick(pool, rng);
    const question = GENERATORS[type](level, rng);
    question.id = `q${(counter += 1)}`;
    question.level = level;
    const stat = weak?.[question.statKey];
    let weight = stat ? (stat.wrong + 1) / (stat.right + stat.wrong + 2) : 0.5;
    // Repetición espaciada: lo vencido y lo nuevo pasan por delante de lo recién dominado.
    if (srs) weight = dueWeight(srs[question.statKey], now) + rng() * 0.15;
    if (!best || weight > best.weight) best = { question, weight };
  }
  return best.question;
}

export function checkAnswer(question, given) {
  if (question.kind === 'fret') {
    return given?.s === question.answer.s && given?.f === question.answer.f;
  }
  return String(given) === String(question.answer);
}

/* ───────────── Estadísticas ───────────── */

export function emptyStats() {
  return { total: { right: 0, wrong: 0 }, byKey: {}, sessions: [] };
}

export function recordAnswer(stats, question, correct, now = Date.now()) {
  const next = {
    ...stats,
    total: {
      right: stats.total.right + (correct ? 1 : 0),
      wrong: stats.total.wrong + (correct ? 0 : 1),
    },
    byKey: { ...stats.byKey },
    srs: { ...(stats.srs ?? {}) },
  };
  const key = question.statKey;
  next.srs[key] = reviewCard(next.srs[key], correct, now);
  const prev = next.byKey[key] ?? { right: 0, wrong: 0 };
  next.byKey[key] = {
    right: prev.right + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
  };
  return next;
}

/** Las claves con peor tasa de acierto (mínimo 2 intentos). */
export function weakSpots(stats, limit = 5) {
  return Object.entries(stats.byKey)
    .map(([key, v]) => ({ key, ...v, attempts: v.right + v.wrong, rate: v.right / Math.max(1, v.right + v.wrong) }))
    .filter((x) => x.attempts >= 2 && x.rate < 0.8)
    .sort((a, b) => a.rate - b.rate || b.attempts - a.attempts)
    .slice(0, limit);
}

export function describeStatKey(key) {
  const [type, detail] = key.split(':');
  const topic = QUIZ_TOPICS[type]?.label ?? type;
  if (type === 'fretNote' || type === 'findNote') return `${topic} · cuerda ${stringName(Number(detail))}`;
  if (type === 'interval') return `${topic} · ${INTERVAL_NAMES[Number(detail)]?.name ?? detail}`;
  if (type === 'chordInKey' || type === 'roman') return `${topic} · grado ${detail}`;
  if (type === 'function') {
    const [, kind, id] = key.split(':');
    const names = { secondary: 'dominante secundario', borrowed: 'acorde prestado', target: 'resolución', tritone: 'sustituto tritonal' };
    return `${topic} · ${names[kind] ?? kind}${id ? ` ${id}` : ''}`;
  }
  if (type === 'mode') return `${topic} · ${MODES.find((m) => m.id === detail)?.label ?? detail}`;
  return `${topic} · ${prettyNote(detail)}`;
}

export { midiAt };
