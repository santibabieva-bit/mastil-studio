/**
 * Armonía funcional más allá de los acordes diatónicos: dominantes
 * secundarios, intercambio modal, sustitución tritonal y preguntas de
 * función. Puro.
 */

import { mod, pcName, shuffle, pick } from './music.js';
import { chordSymbol } from './chords.js';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const DIATONIC_QUALITY = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];

/** Nombre de la nota usando bemoles para las tonalidades que los llevan. */
function nameFor(pc, flats) {
  return pcName(pc, flats ? 'flat' : 'sharp');
}
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db
const usesFlats = (rootPc) => FLAT_KEYS.has(mod(rootPc, 12));

/**
 * Dominantes secundarios de una tonalidad mayor: el V7 de cada grado
 * (ii, iii, IV, V, vi) que resuelve al grado una quinta abajo.
 */
export function secondaryDominants(rootPc) {
  const flats = usesFlats(rootPc);
  return [1, 2, 3, 4, 5].map((deg) => {
    const targetPc = mod(rootPc + MAJOR_SCALE[deg], 12);
    const domPc = mod(targetPc + 7, 12);
    const targetRoman = deg === 3 || deg === 4 ? ROMAN[deg] : ROMAN[deg].toLowerCase();
    return {
      id: `V/${targetRoman}`,
      roman: `V7/${targetRoman}`,
      domPc,
      domTypeId: '7',
      symbol: chordSymbol(nameFor(domPc, flats), '7'),
      targetDegree: deg,
      targetPc,
      targetSymbol: chordSymbol(nameFor(targetPc, flats), DIATONIC_QUALITY[deg] === '7' ? '7' : DIATONIC_QUALITY[deg]),
      note: `Dominante del ${targetRoman}: resuelve una quinta abajo (o una cuarta arriba).`,
    };
  });
}

/** Acordes prestados de la menor paralela (intercambio modal). */
export function modalInterchange(rootPc) {
  const flats = true; // casi todos los prestados llevan bemoles
  const spec = [
    { id: 'iv', roman: 'iv', iv: 5, typeId: 'm7', why: 'Subdominante menor: el color «melancólico» típico del pop y el soul.' },
    { id: 'bVII', roman: '♭VII', iv: 10, typeId: '7', why: 'Mixolidio: rock y funk; resuelve al I por cuarta.' },
    { id: 'bVI', roman: '♭VI', iv: 8, typeId: 'maj7', why: 'Cadencia «épica»: ♭VI → ♭VII → I.' },
    { id: 'bIII', roman: '♭III', iv: 3, typeId: 'maj7', why: 'Mediante bemol: abre el color menor sin perder la tónica.' },
    { id: 'iiø', roman: 'iiø', iv: 2, typeId: 'm7b5', why: 'ii semidisminuido: prepara el V7 con cadencia menor.' },
    { id: 'i', roman: 'i', iv: 0, typeId: 'm7', why: 'Tónica menor sobre una tonalidad mayor (efecto «nube»).' },
  ];
  return spec.map((s) => {
    const pc = mod(rootPc + s.iv, 12);
    return { ...s, pc, symbol: chordSymbol(nameFor(pc, flats || usesFlats(rootPc)), s.typeId) };
  });
}

/** Sustituto tritonal de un acorde dominante: otra 7.ª a 6 semitonos. */
export function tritoneSub(domRootPc, flats = usesFlats(domRootPc)) {
  const pc = mod(domRootPc + 6, 12);
  return { pc, typeId: '7', symbol: chordSymbol(nameFor(pc, flats), '7') };
}

/**
 * Convierte un II–V–I en variantes reharmonizadas.
 * Devuelve [{ id, label, chords:[{ rootPc, typeId }], why }].
 */
export function reharmonizeTwoFiveOne(rootPc) {
  const ii = { rootPc: mod(rootPc + 2, 12), typeId: 'm7' };
  const V = { rootPc: mod(rootPc + 7, 12), typeId: '7' };
  const I = { rootPc, typeId: 'maj7' };
  const sub = { rootPc: mod(V.rootPc + 6, 12), typeId: '7' };
  return [
    { id: 'plain', label: 'II–V–I clásico', chords: [ii, V, I, I], why: 'La referencia: oye cómo la 7.ª de ii cae a la 3.ª de V.' },
    { id: 'tritone', label: 'V sustituido (♭II7)', chords: [ii, sub, I, I], why: 'El bajo baja por semitonos (ii → ♭II → I). Comparte 3.ª y 7.ª con el V.' },
    { id: 'secondary', label: 'Con dominante secundario', chords: [{ rootPc: mod(rootPc + 9, 12), typeId: '7' }, ii, V, I], why: 'VI7 → ii → V → I: un dominante secundario abre la cadena de quintas.' },
    { id: 'backdoor', label: 'Puerta trasera (iv → ♭VII → I)', chords: [{ rootPc: mod(rootPc + 5, 12), typeId: 'm7' }, { rootPc: mod(rootPc + 10, 12), typeId: '7' }, I, I], why: 'Resuelve al I desde el lado «menor»: ♭VII7 en lugar de V7.' },
    { id: 'chain', label: 'Cadena de dominantes', chords: [{ rootPc: mod(rootPc + 9, 12), typeId: '7' }, { rootPc: mod(rootPc + 2, 12), typeId: '7' }, V, I], why: 'VI7 → II7 → V7 → I: cada dominante resuelve a la siguiente por quinta.' },
  ];
}

/* ───────────── preguntas de función (Theory Trainer) ───────────── */

const KEY_POOL = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab'];
const KEY_PC = { C: 0, G: 7, D: 2, A: 9, E: 4, F: 5, Bb: 10, Eb: 3, Ab: 8 };

function mk(type, extra) {
  return { type, kind: 'choice', ...extra };
}

/** Pregunta de armonía funcional: 4 tipos. */
export function functionQuestion(level = 'intermediate', rng = Math.random) {
  const keyName = pick(KEY_POOL, rng);
  const rootPc = KEY_PC[keyName];
  const kind = pick(level === 'beginner' ? ['secondary'] : ['secondary', 'borrowed', 'tritone', 'target'], rng);
  const keyLabel = `${keyName} mayor`;
  if (kind === 'secondary') {
    const doms = secondaryDominants(rootPc);
    const t = pick(doms, rng);
    const options = shuffle(doms.map((d) => d.id), rng).slice(0, 4);
    if (!options.includes(t.id)) options[0] = t.id;
    return mk('function', {
      prompt: `En ${keyLabel}: ¿qué función cumple ${t.symbol} antes de ${t.targetSymbol}?`,
      options: shuffle(options, rng).map((v) => ({ label: `V7 de ${v.slice(2)}`, value: v })),
      answer: t.id,
      explanation: `${t.symbol} es el V7 de ${t.targetSymbol}: dominante secundario (${t.roman}). ${t.note}`,
      statKey: `function:secondary:${t.id}`,
    });
  }
  if (kind === 'borrowed') {
    const list = modalInterchange(rootPc);
    const t = pick(list, rng);
    const options = shuffle([t, ...shuffle(list.filter((x) => x !== t), rng).slice(0, 3)], rng);
    return mk('function', {
      prompt: `En ${keyLabel} suena ${t.symbol}, que no es diatónico. ¿Qué es?`,
      options: options.map((o) => ({ label: `${o.roman} prestado de la menor`, value: o.id })),
      answer: t.id,
      explanation: `${t.symbol} es el ${t.roman} tomado de ${keyName} menor (intercambio modal). ${t.why}`,
      statKey: `function:borrowed:${t.id}`,
    });
  }
  if (kind === 'tritone') {
    const dom = secondaryDominants(rootPc)[3]; // V de la tonalidad mayor
    const d = { pc: dom.targetPc, symbol: chordSymbol(nameFor(dom.targetPc, usesFlats(rootPc)), '7') };
    const sub = tritoneSub(d.pc, usesFlats(rootPc));
    const wrong = [mod(d.pc + 1, 12), mod(d.pc + 3, 12), mod(d.pc + 5, 12)].map((pc) => chordSymbol(nameFor(pc, usesFlats(rootPc)), '7'));
    return mk('function', {
      prompt: `¿Cuál es el sustituto tritonal de ${d.symbol} (V7 de ${keyLabel})?`,
      options: shuffle([sub.symbol, ...wrong], rng).map((v) => ({ label: v, value: v })),
      answer: sub.symbol,
      explanation: `El sustituto tritonal está a 6 semitonos: ${d.symbol} → ${sub.symbol}. Comparten la 3.ª y la 7.ª (invertidas).`,
      statKey: 'function:tritone',
    });
  }
  // target: ¿a qué acorde resuelve este dominante secundario?
  const doms = secondaryDominants(rootPc);
  const t = pick(doms, rng);
  const wrong = shuffle(doms.filter((d) => d !== t), rng).slice(0, 3).map((d) => d.targetSymbol);
  return mk('function', {
    prompt: `En ${keyLabel}, ${t.symbol} es un dominante secundario. ¿A qué acorde resuelve?`,
    options: shuffle([t.targetSymbol, ...wrong], rng).map((v) => ({ label: v, value: v })),
    answer: t.targetSymbol,
    explanation: `${t.symbol} resuelve una quinta abajo, a ${t.targetSymbol}.`,
    statKey: `function:target:${t.id}`,
  });
}

/** Ordenación de tipos de acorde para preguntas de «qué acorde falta» (opcional). */
export const ROMAN_NUMERALS = ROMAN;
