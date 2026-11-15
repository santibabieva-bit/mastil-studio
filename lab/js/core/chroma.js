/**
 * Transcripción asistida: cromagrama de un tramo de audio (energía por clase
 * de altura) y acorde más probable. Puro.
 */

import { mod, pcName } from './music.js';

const NOTE_COUNT = 12;

/** Goertzel: potencia de una frecuencia en el bloque. */
function goertzel(samples, start, size, sampleRate, freq) {
  const k = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < size; i += 1) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)); // ventana de Hann
    const s0 = samples[start + i] * w + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Cromagrama normalizado (suma 1) de un tramo. Suma las octavas 2–6 (MIDI 36–95).
 * Bloques de 8192 muestras con salto de 4096.
 */
export function chromagram(samples, sampleRate, { from = 0, to = samples.length, block = 8192, hop = 4096 } = {}) {
  const chroma = new Float64Array(NOTE_COUNT);
  for (let start = Math.floor(from); start + block <= to; start += hop) {
    for (let midi = 36; midi < 96; midi += 1) {
      const freq = 440 * 2 ** ((midi - 69) / 12);
      if (freq > sampleRate / 2.2) break;
      chroma[midi % 12] += Math.sqrt(Math.max(0, goertzel(samples, start, block, sampleRate, freq)));
    }
  }
  const total = chroma.reduce((a, b) => a + b, 0);
  return total > 0 ? Array.from(chroma, (v) => v / total) : Array.from(chroma);
}

const TEMPLATES = [
  { id: '', label: '', pcs: [0, 4, 7] },
  { id: 'm', label: 'm', pcs: [0, 3, 7] },
  { id: '7', label: '7', pcs: [0, 4, 7, 10] },
  { id: 'm7', label: 'm7', pcs: [0, 3, 7, 10] },
  { id: 'maj7', label: 'maj7', pcs: [0, 4, 7, 11] },
  { id: 'dim', label: 'dim', pcs: [0, 3, 6] },
  { id: 'sus4', label: 'sus4', pcs: [0, 5, 7] },
];

/** Los mejores `top` acordes para un cromagrama, por similitud de coseno con plantillas. */
export function chordsFromChroma(chroma, { top = 3, prefer = 'sharp' } = {}) {
  const norm = Math.hypot(...chroma) || 1;
  const results = [];
  for (let root = 0; root < NOTE_COUNT; root += 1) {
    for (const t of TEMPLATES) {
      const vec = new Array(NOTE_COUNT).fill(0);
      t.pcs.forEach((i, idx) => { vec[mod(root + i, 12)] = idx === 0 ? 1.1 : 1; });
      const vn = Math.hypot(...vec);
      let dot = 0;
      for (let i = 0; i < NOTE_COUNT; i += 1) dot += chroma[i] * vec[i];
      results.push({ rootPc: root, typeId: t.id, name: `${pcName(root, prefer)}${t.label}`, score: dot / (norm * vn) });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, top);
}

/** Notas dominantes del cromagrama: [{ pc, name, share }] ordenadas. */
export function dominantNotes(chroma, { top = 4, prefer = 'sharp' } = {}) {
  return chroma.map((share, pc) => ({ pc, name: pcName(pc, prefer), share }))
    .sort((a, b) => b.share - a.share)
    .slice(0, top);
}
