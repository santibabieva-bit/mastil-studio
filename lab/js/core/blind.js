/** Mástil a ciegas: preguntas «toca esta nota en esta cuerda» y su comprobación. Puro. */

import { mod } from './music.js';

/** Elige una cuerda y un traste al azar. */
export function blindQuestion({ tuning, rng = Math.random, strings = null, maxFret = 12, minFret = 0 } = {}) {
  const pool = strings ?? tuning.map((_, i) => i);
  const s = pool[Math.floor(rng() * pool.length)];
  const f = minFret + Math.floor(rng() * (maxFret - minFret + 1));
  const midi = tuning[s] + f;
  return { s, f, midi, pc: mod(midi, 12) };
}

/** 'exact' si coincide la altura, 'octave' si sólo la nota, 'wrong' en otro caso. */
export function checkBlind(playedMidi, question) {
  if (playedMidi === question.midi) return 'exact';
  if (mod(playedMidi, 12) === question.pc) return 'octave';
  return 'wrong';
}

/** Resumen de una ronda: [{ ok, ms }] → { ok, total, avgMs }. */
export function summarize(results) {
  const ok = results.filter((r) => r.ok);
  return {
    ok: ok.length,
    total: results.length,
    avgMs: ok.length ? Math.round(ok.reduce((a, r) => a + r.ms, 0) / ok.length) : 0,
  };
}
