/**
 * Análisis de bends y vibrato a partir de una pista de altura
 * [{ t, freq | null }]. Puro.
 */

export const centsBetween = (freq, target) => 1200 * Math.log2(freq / target);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Evalúa un bend. `startFreq` es la nota de partida y `targetFreq` la de destino.
 * Devuelve { reached, timeToTarget, finalCents, peakCents, overshoot, stability, verdict }.
 */
export function analyzeBend(track, { startFreq, targetFreq }) {
  const voiced = track.filter((p) => p.freq);
  if (voiced.length < 4) return { reached: false, verdict: 'No he detectado una nota sostenida.' };
  const t0 = voiced[0].t;
  const cents = voiced.map((p) => ({ t: p.t - t0, c: centsBetween(p.freq, targetFreq) }));
  const startC = centsBetween(startFreq, targetFreq);
  // Primer instante en que estás a ±25 cents del objetivo.
  const hit = cents.find((p) => Math.abs(p.c) <= 25);
  const tail = cents.slice(-Math.max(3, Math.floor(cents.length / 4)));
  const finalCents = median(tail.map((p) => p.c));
  const peak = cents.reduce((m, p) => (Math.abs(p.c) < Math.abs(m) ? m : p.c), 0);
  const settled = tail.map((p) => p.c);
  const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
  const stability = Math.sqrt(settled.reduce((a, b) => a + (b - mean) ** 2, 0) / settled.length);
  const overshoot = Math.max(0, Math.max(...cents.map((p) => p.c)));
  const reached = Boolean(hit) && Math.abs(finalCents) <= 30;
  let verdict;
  if (!hit) {
    if (finalCents < 0) verdict = `Te has quedado corto: ${Math.round(-finalCents)} cents por debajo.`;
    else if (finalCents > 30) verdict = `Te pasas ${Math.round(finalCents)} cents.`;
    else verdict = 'No llegas a la nota de destino.';
  }
  else if (Math.abs(finalCents) <= 15 && stability < 12) verdict = 'Bend afinado y estable.';
  else if (finalCents > 30) verdict = `Te pasas ${Math.round(finalCents)} cents.`;
  else if (finalCents < -30) verdict = `Te quedas corto ${Math.round(-finalCents)} cents.`;
  else if (stability >= 12) verdict = 'Llegas, pero la nota tiembla: sostén con la presión constante.';
  else verdict = 'Casi: pequeño ajuste de afinación.';
  return {
    reached, timeToTarget: hit ? hit.t : null, finalCents: Math.round(finalCents), peakCents: Math.round(peak), overshoot: Math.round(overshoot), stability: Math.round(stability), startCents: Math.round(startC), verdict,
  };
}

/**
 * Analiza un vibrato: velocidad (Hz), amplitud (cents, pico-valle / 2) y
 * regularidad. Detrae la tendencia con una media móvil y cuenta cruces por cero.
 */
export function analyzeVibrato(track) {
  const voiced = track.filter((p) => p.freq);
  if (voiced.length < 8) return { ok: false, verdict: 'No he oído una nota sostenida.' };
  const base = median(voiced.map((p) => p.freq));
  const t = voiced.map((p) => p.t);
  const c = voiced.map((p) => centsBetween(p.freq, base));
  // Detrae la deriva con una media móvil de ~0,4 s.
  const span = Math.max(3, Math.round(voiced.length * 0.4 / Math.max(0.2, t[t.length - 1] - t[0]) * 1));
  const half = Math.min(Math.floor(span / 2), Math.floor(voiced.length / 3));
  const detr = c.map((v, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(c.length, i + half + 1);
    let sum = 0;
    for (let k = lo; k < hi; k += 1) sum += c[k];
    return v - sum / (hi - lo);
  });
  // Cruces por cero ascendentes con una pequeña histéresis.
  const crossings = [];
  const eps = 2;
  let state = detr[0] > 0 ? 1 : -1;
  for (let i = 1; i < detr.length; i += 1) {
    if (state < 0 && detr[i] > eps) {
      crossings.push(t[i]);
      state = 1;
    } else if (state > 0 && detr[i] < -eps) state = -1;
  }
  if (crossings.length < 3) return { ok: false, verdict: 'No detecto oscilación: prueba un vibrato más marcado.' };
  const periods = crossings.slice(1).map((x, i) => x - crossings[i]);
  const period = median(periods);
  const rate = 1 / period;
  const mad = median(periods.map((p) => Math.abs(p - period)));
  const regularity = Math.max(0, Math.min(100, Math.round(100 - (mad / period) * 250)));
  const amp = median(detr.map(Math.abs)) * 1.4142; // amplitud pico de una senoide
  const width = Math.round(amp);
  let verdict;
  if (rate < 4) verdict = 'Vibrato muy lento: sube la velocidad hacia 5-7 Hz.';
  else if (rate > 8.5) verdict = 'Vibrato muy rápido y nervioso: relaja y amplía el movimiento.';
  else if (width < 15) verdict = 'Vibrato correcto en velocidad pero muy corto: amplía el movimiento.';
  else if (width > 90) verdict = 'Amplitud muy grande: se acerca a un bend. Acórtalo.';
  else if (regularity < 60) verdict = 'Buena velocidad y amplitud, pero irregular. Busca un ritmo constante.';
  else verdict = 'Vibrato controlado y regular.';
  return { ok: true, rate: Math.round(rate * 10) / 10, width, regularity, verdict };
}

/** Bend típicos: semitonos y nombre. */
export const BEND_TARGETS = [
  { id: 'half', label: 'Medio tono (1 traste)', semitones: 1 },
  { id: 'whole', label: 'Tono entero', semitones: 2 },
  { id: 'wholehalf', label: 'Tono y medio', semitones: 3 },
  { id: 'prebend', label: 'Pre-bend de un tono', semitones: 2, prebend: true },
];

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Nota 0-100 de un bend: precisión final y estabilidad. */
export function bendScore(a) {
  if (a.finalCents == null) return 0;
  const base = 100 - Math.abs(a.finalCents) * 1.6 - (a.stability ?? 0) * 1.2;
  return clamp100(a.reached ? base : Math.min(base, 45));
}

/** Nota 0-100 de un vibrato: velocidad ideal 5-7,5 Hz, amplitud 20-70 cents, regularidad. */
export function vibratoScore(v) {
  if (!v.ok) return 0;
  const rateErr = v.rate < 5 ? 5 - v.rate : v.rate > 7.5 ? v.rate - 7.5 : 0;
  const widthErr = v.width < 20 ? 20 - v.width : v.width > 70 ? v.width - 70 : 0;
  return clamp100(100 - rateErr * 14 - widthErr * 1.1 - (100 - v.regularity) * 0.5);
}
