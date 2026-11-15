/**
 * Detección de altura por autocorrelación normalizada (tipo MPM simplificado).
 * Pura: recibe un Float32Array y la frecuencia de muestreo.
 */

import { freqToMidi, midiToFreq, pcName, mod } from './music.js';

export function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/**
 * @returns {number|null} frecuencia en Hz o null si no hay señal clara.
 */
export function detectPitch(buffer, sampleRate, { minFreq = 50, maxFreq = 1200, threshold = 0.012 } = {}) {
  const size = buffer.length;
  if (rms(buffer) < threshold) return null;

  // Quitamos el componente continuo: sin esto la autocorrelación nunca cruza cero.
  let mean = 0;
  for (let i = 0; i < size; i += 1) mean += buffer[i];
  mean /= size;
  const x = new Float32Array(size);
  for (let i = 0; i < size; i += 1) x[i] = buffer[i] - mean;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(size - 2, Math.floor(sampleRate / minFreq));
  const nsdf = new Float32Array(maxLag + 2);

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let acf = 0;
    let norm = 0;
    for (let i = 0; i < size - lag; i += 1) {
      acf += x[i] * x[i + lag];
      norm += x[i] * x[i] + x[i + lag] * x[i + lag];
    }
    nsdf[lag] = norm > 0 ? (2 * acf) / norm : 0;
  }

  // Máximos locales; el primero que alcanza el 90 % del mayor evita saltos de octava.
  const peaks = [];
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > 0.2) {
      peaks.push({ lag, value: nsdf[lag] });
    }
  }
  if (!peaks.length) return null;
  const highest = Math.max(...peaks.map((p) => p.value));
  if (highest < 0.5) return null;
  const chosen = peaks.find((p) => p.value >= highest * 0.9);

  // Interpolación parabólica.
  const l = chosen.lag;
  const a = nsdf[l - 1];
  const b = nsdf[l];
  const c = nsdf[l + 1] ?? b;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const period = l + shift;
  return sampleRate / period;
}

/** Nota más cercana y desviación en cents. */
export function nearestNote(freq, prefer = 'sharp') {
  const midiFloat = freqToMidi(freq);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  return {
    midi,
    cents,
    name: pcName(mod(midi, 12), prefer),
    octave: Math.floor(midi / 12) - 1,
    freq,
    target: midiToFreq(midi),
  };
}

/** Cuerda más cercana de una afinación (lista de MIDI). */
export function nearestString(freq, tuning) {
  const midi = freqToMidi(freq);
  let best = 0;
  let bestDiff = Infinity;
  tuning.forEach((m, i) => {
    const diff = Math.abs(midi - m);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  const cents = Math.round((midi - tuning[best]) * 100);
  return { index: best, cents, targetMidi: tuning[best] };
}
