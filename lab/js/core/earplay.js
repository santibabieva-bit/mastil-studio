/**
 * «Toca lo que oyes»: la app suena una melodía corta de una escala y tú la
 * encuentras en el mástil de oído. Une oído relativo y mano izquierda.
 * Puro: la UI pone el audio y la escucha (micrófono o MIDI).
 */

import { createNoteCollection, mod, pick } from './music.js';

/**
 * Niveles: longitud, saltos permitidos (en grados) y escala.
 * 1 = 3 notas por grados conjuntos · 4 = 6 notas con saltos de 3.ª/4.ª.
 */
export const EARPLAY_LEVELS = [
  { id: 1, label: 'Nivel 1 · 3 notas, grados conjuntos', length: 3, maxLeap: 1, quality: 'pentatonicMinor' },
  { id: 2, label: 'Nivel 2 · 4 notas, pentatónica', length: 4, maxLeap: 2, quality: 'pentatonicMinor' },
  { id: 3, label: 'Nivel 3 · 5 notas, escala mayor', length: 5, maxLeap: 2, quality: 'major' },
  { id: 4, label: 'Nivel 4 · 6 notas, con saltos', length: 6, maxLeap: 3, quality: 'major' },
];

export function earplayLevel(id) {
  return EARPLAY_LEVELS.find((l) => l.id === Number(id)) ?? EARPLAY_LEVELS[0];
}

/**
 * Genera una melodía dentro de la escala, entre `lowMidi` y `lowMidi + 13`.
 * La referencia es la tónica (se toca antes de la melodía).
 * @returns {{ root, quality, refMidi, notes: Array<{midi, pc, degree}>, level }}
 */
export function melodyQuestion({ root = 'A', level = 1, rng = Math.random, lowMidi = 57 } = {}) {
  const lv = earplayLevel(level);
  const col = createNoteCollection(root, 'scale', lv.quality);
  const pcs = col.notes.map((n) => n.pc);
  const pitches = [];
  for (let m = lowMidi; m <= lowMidi + 13; m += 1) if (pcs.includes(mod(m, 12))) pitches.push(m);
  const rootIdx = pitches.findIndex((m) => mod(m, 12) === col.root.pc);
  let idx = rootIdx;
  const notes = [];
  let guard = 0;
  while (notes.length < lv.length && guard < 400) {
    guard += 1;
    let step = Math.floor(rng() * (2 * lv.maxLeap + 1)) - lv.maxLeap;
    if (step === 0) step = rng() < 0.5 ? 1 : -1;
    const next = idx + step;
    if (next < 0 || next >= pitches.length) continue;
    if (notes.length && pitches[next] === notes[notes.length - 1].midi) continue;
    idx = next;
    notes.push({ midi: pitches[idx], pc: mod(pitches[idx], 12), degree: pcs.indexOf(mod(pitches[idx], 12)) + 1 });
  }
  return { root, quality: lv.quality, refMidi: pitches[rootIdx], notes, level: lv.id };
}

/**
 * Comprobador secuencial: recibe cada nota tocada y avanza si es la esperada.
 * `strictOctave` exige la misma octava; si no, vale la misma nota.
 */
export class MelodyMatcher {
  constructor(expected, { strictOctave = false, maxErrors = 6 } = {}) {
    this.expected = expected;
    this.strictOctave = strictOctave;
    this.maxErrors = maxErrors;
    this.index = 0;
    this.errors = 0;
    this.errorsByNote = expected.map(() => 0);
    this.results = expected.map(() => null);
  }

  get done() { return this.index >= this.expected.length; }

  get failed() { return this.errors >= this.maxErrors && !this.done; }

  /** @returns {'ok'|'octave'|'wrong'|'ignored'} */
  hear(midi) {
    if (this.done || this.failed) return 'ignored';
    const want = this.expected[this.index];
    const exact = midi === want.midi;
    const samePc = mod(midi, 12) === want.pc;
    if (exact || (samePc && !this.strictOctave)) {
      this.results[this.index] = this.errorsByNote[this.index] === 0 ? 'first' : 'retry';
      this.index += 1;
      return exact ? 'ok' : 'octave';
    }
    this.errors += 1;
    this.errorsByNote[this.index] += 1;
    return 'wrong';
  }

  /** Resultado: { ok, firstTry, total, errors } */
  summary() {
    const firstTry = this.results.filter((r) => r === 'first').length;
    return { ok: this.done, firstTry, total: this.expected.length, errors: this.errors };
  }
}

/** Los grados de la melodía, p. ej. «1 – 2 – 4 – 3». */
export function describeMelody(q) {
  return q.notes.map((n) => n.degree).join(' – ');
}

/** Tasa de acierto de las últimas 10 rondas de un nivel (acierto = completada con ≥60 % a la primera). */
export function earplayRate(history, level) {
  const list = history.filter((h) => h.level === level).slice(-10);
  if (!list.length) return { runs: 0, rate: 0 };
  const good = list.filter((h) => h.ok && h.firstTry >= Math.ceil(h.total * 0.6)).length;
  return { runs: list.length, rate: good / list.length };
}

/** «Oyes una nota de referencia y un intervalo: tócalo.» */
export function intervalTouchQuestion({ rng = Math.random, lowMidi = 52, semis = null } = {}) {
  const choices = [2, 3, 4, 5, 7, 9, 12];
  const s = semis ?? pick(choices, rng);
  const refMidi = lowMidi + Math.floor(rng() * 12);
  return { refMidi, semis: s, targetMidi: refMidi + s, direction: 'up' };
}
