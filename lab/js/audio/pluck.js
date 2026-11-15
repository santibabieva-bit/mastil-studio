/**
 * Síntesis Karplus-Strong de una cuerda pulsada. Pura (sin WebAudio) para
 * poder probar la afinación en Node.
 */

import { midiToFreq } from '../core/music.js';

const PROFILES = {
  clean: { lp: 0.55, decay: 0.9985 },
  warm: { lp: 0.3, decay: 0.9988 },
  bright: { lp: 0.85, decay: 0.998 },
};

/** @returns {Float32Array} muestras normalizadas a ±0,9 */
export function synthPluck(sampleRate, midi, tone = 'clean') {
  const freq = midiToFreq(midi);
  const seconds = freq < 200 ? 4 : freq < 500 ? 3 : 2;
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);

  const period = sampleRate / freq;
  const base = Math.max(2, Math.floor(period - 0.5));
  const frac = Math.max(0, Math.min(1, period - 0.5 - base));
  const profile = PROFILES[tone] ?? PROFILES.clean;
  const decay = Math.max(0.985, profile.decay - freq * 0.0000085);

  // Excitación: ruido filtrado paso bajo en las primeras base+2 muestras.
  const warm = base + 2;
  let seed = (midi * 2654435761) >>> 0;
  let lp = 0;
  for (let i = 0; i < warm && i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 4294967296) * 2 - 1;
    lp += profile.lp * (white - lp);
    out[i] = lp * 1.8;
  }
  // y[n] = decay · ½ (u[n] + u[n-1]),  u[n] = (1-frac)·y[n-N] + frac·y[n-N-1]
  let prevU = (1 - frac) * out[1] + frac * out[0];
  for (let n = warm; n < length; n += 1) {
    const u = (1 - frac) * out[n - base] + frac * out[n - base - 1];
    out[n] = decay * 0.5 * (u + prevU);
    prevU = u;
  }
  let peak = 0;
  for (let n = 0; n < length; n += 1) {
    const a = Math.abs(out[n]);
    if (a > peak) peak = a;
  }
  const gain = peak > 0 ? 0.9 / peak : 1;
  for (let n = 0; n < length; n += 1) out[n] *= gain;
  return out;
}
