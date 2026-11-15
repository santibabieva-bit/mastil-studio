/**
 * Medición de pulso: detección de ataques en una señal de micrófono y
 * comparación con la rejilla del metrónomo. Puro: se prueba en Node.
 */

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Detecta ataques (inicios de nota). Devuelve tiempos en segundos desde el
 * primer sample.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {{minGapMs?:number, sensitivity?:number, hop?:number, win?:number}} opts
 */
export function detectOnsets(samples, sampleRate, { minGapMs = 70, sensitivity = 1, hop = 128, win = 512 } = {}) {
  const frames = Math.floor((samples.length - win) / hop);
  if (frames < 8) return [];
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    const start = i * hop;
    for (let k = 0; k < win; k += 1) sum += samples[start + k] * samples[start + k];
    env[i] = Math.sqrt(sum / win);
  }
  const db = Array.from(env, (v) => 20 * Math.log10(v + 1e-5));
  const floor = median(Array.from(env));
  const lag = 3;
  const minGap = Math.max(1, Math.round((minGapMs / 1000) * sampleRate / hop));
  const thresholdDb = 7 / sensitivity;
  const absMin = Math.max(0.006, floor * 3) / sensitivity;

  const flux = new Float32Array(frames);
  for (let i = lag; i < frames; i += 1) flux[i] = Math.max(0, db[i] - db[i - lag]);

  const peaks = [];
  for (let i = lag; i < frames - 1; i += 1) {
    if (flux[i] < thresholdDb || env[i] < absMin) continue;
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last && i - last.i < minGap) {
      if (flux[i] > last.flux) { last.i = i; last.flux = flux[i]; }
      continue;
    }
    peaks.push({ i, flux: flux[i] });
  }

  return peaks.map(({ i }) => {
    // Afinamos al primer sample que supera el 25 % del pico local.
    const from = Math.max(0, i * hop - win);
    const to = Math.min(samples.length, i * hop + win * 2);
    let peak = 0;
    for (let k = from; k < to; k += 1) peak = Math.max(peak, Math.abs(samples[k]));
    const limit = peak * 0.25;
    let at = i * hop;
    for (let k = from; k < to; k += 1) {
      if (Math.abs(samples[k]) >= limit) { at = k; break; }
    }
    return at / sampleRate;
  });
}

/**
 * Compara los ataques con la rejilla del metrónomo.
 * `t0`: tiempo (s) del primer pulso evaluado; `count`: notas esperadas.
 * Devuelve [{ t, grid, dev, index }] con `dev` en ms (negativo = adelantado).
 */
export function gridDeviations({ onsets, t0, bpm, perBeat = 1, latencyMs = 0, count = Infinity }) {
  const step = 60 / bpm / perBeat;
  const out = [];
  for (const o of onsets) {
    const adjusted = o - latencyMs / 1000;
    const index = Math.round((adjusted - t0) / step);
    if (index < 0 || index >= count) continue;
    const grid = t0 + index * step;
    out.push({ t: o, grid, index, dev: (adjusted - grid) * 1000 });
  }
  return out;
}

const HIST_EDGES = [-80, -60, -40, -20, -10, 0, 10, 20, 40, 60, 80];

/** Estadísticas de un conjunto de desviaciones en ms. */
export function timingStats(deviations, { expected = null, stepMs = null } = {}) {
  const devs = deviations.map((d) => (typeof d === 'number' ? d : d.dev));
  const n = devs.length;
  const empty = { n: 0, mean: 0, sd: 0, meanAbs: 0, within20: 0, within40: 0, drift: 0, tendency: 'sin datos', coverage: 0, hist: [], score: 0 };
  if (!n) return empty;
  const mean = devs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(devs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const meanAbs = devs.reduce((a, b) => a + Math.abs(b), 0) / n;
  const within20 = devs.filter((d) => Math.abs(d) <= 20).length / n;
  const within40 = devs.filter((d) => Math.abs(d) <= 40).length / n;

  // Pendiente de la desviación en el tiempo (ms por nota): ¿aceleras o arrastras?
  let drift = 0;
  if (n >= 6) {
    const xm = (n - 1) / 2;
    let num = 0;
    let den = 0;
    devs.forEach((d, i) => { num += (i - xm) * (d - mean); den += (i - xm) ** 2; });
    drift = den ? num / den : 0;
  }
  const hist = [];
  for (let i = 0; i < HIST_EDGES.length - 1; i += 1) {
    const lo = HIST_EDGES[i];
    const hi = HIST_EDGES[i + 1];
    const count = devs.filter((d) => (i === 0 ? d < hi : i === HIST_EDGES.length - 2 ? d >= lo : d >= lo && d < hi)).length;
    hist.push({ lo, hi, count });
  }
  let tendency = 'centrado';
  if (mean <= -8) tendency = 'tiendes a adelantarte';
  else if (mean >= 8) tendency = 'tiendes a retrasarte';
  const driftTotal = drift * n;
  if (Math.abs(driftTotal) > 25) tendency += driftTotal < 0 ? ' y vas acelerando' : ' y vas arrastrando';
  const coverage = expected ? Math.min(1, n / expected) : 1;
  return {
    n, mean, sd, meanAbs, within20, within40, drift, tendency, coverage, hist,
    score: timingScore({ sd, mean, coverage }),
    stepMs,
  };
}

/** Nota de 0 a 100: poca dispersión, poco sesgo y notas completas. */
export function timingScore({ sd, mean = 0, coverage = 1 }) {
  const raw = 100 - sd * 2.2 - Math.abs(mean) * 0.6;
  return Math.round(Math.max(0, Math.min(100, raw)) * Math.min(1, coverage * 1.05));
}

/** Frase corta de valoración. */
export function timingVerdict(stats) {
  if (!stats.n) return 'No he oído ataques claros. Acércate al micrófono o sube el volumen de la guitarra.';
  if (stats.coverage < 0.6) return 'Faltan muchas notas por detectar: toca notas sueltas y con ataque claro.';
  if (stats.sd < 8) return 'Pulso de metrónomo: dispersión muy baja.';
  if (stats.sd < 15) return 'Pulso sólido. Pequeñas irregularidades.';
  if (stats.sd < 25) return 'Pulso aceptable, aún irregular. Baja el tempo y busca que cada nota caiga en el clic.';
  return 'Pulso inestable: reduce el tempo hasta que salga con regularidad.';
}

/** Latencia sugerida a partir de una pasada de calibración (mediana). */
export function calibrationLatency(deviations) {
  const devs = deviations.map((d) => (typeof d === 'number' ? d : d.dev));
  return Math.round(median(devs));
}
