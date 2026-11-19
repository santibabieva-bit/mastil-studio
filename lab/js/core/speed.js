/**
 * Escalera de velocidad (sube el tempo sólo con repeticiones limpias) e
 * historial de récords por ejercicio. Puro.
 */

export function newLadder({ start = 60, target = 120, step = 4, reps = 3 } = {}) {
  return {
    start, target, step, reps, bpm: start, streak: 0, fails: 0, done: false, plateau: false, runs: 0,
  };
}

/**
 * Registra una repetición. Devuelve { ladder, event } con event ∈
 * 'up' | 'hold' | 'retry' | 'drop' | 'done'.
 */
export function submitRep(ladder, clean, reason = null) {
  const l = { ...ladder, runs: ladder.runs + 1, reasons: { ...(ladder.reasons ?? {}) } };
  if (!clean && reason) l.reasons[reason] = (l.reasons[reason] ?? 0) + 1;
  if (l.done) return { ladder: l, event: 'done' };
  if (clean) {
    l.streak += 1;
    l.fails = 0;
    if (l.streak >= l.reps) {
      if (l.bpm >= l.target) {
        l.done = true;
        return { ladder: l, event: 'done' };
      }
      l.bpm = Math.min(l.target, l.bpm + l.step);
      l.streak = 0;
      l.plateau = false;
      return { ladder: l, event: 'up' };
    }
    return { ladder: l, event: 'hold' };
  }
  l.streak = 0;
  l.fails += 1;
  if (l.fails >= 3) {
    // Estancado: vuelve atrás un 10 % y reconstruye.
    l.bpm = Math.max(l.start, Math.round(l.bpm * 0.9));
    l.fails = 0;
    l.plateau = true;
    return { ladder: l, event: 'drop' };
  }
  return { ladder: l, event: 'retry' };
}

/** Práctica en ráfagas: lento y limpio, un destello rápido, de nuevo lento. */
export function burstPlan({ bpm, step = 8, rounds = 3 }) {
  const slow = Math.max(30, Math.round(bpm * 0.7));
  const plan = [];
  for (let i = 0; i < rounds; i += 1) {
    plan.push({ bpm: slow, bars: 2, label: 'Lento y limpio' });
    plan.push({ bpm: bpm + step, bars: 1, label: 'Ráfaga rápida' });
  }
  plan.push({ bpm, bars: 2, label: 'Vuelve a tu tempo' });
  return plan;
}

/* ─── Historial ─── */

export function emptyHistory() {
  return {};
}

/**
 * Anota un tempo limpio. `history[id] = { best, bestDate, days: { fecha: maxBpm } }`.
 * Devuelve { history, isRecord }.
 */
export function recordClean(history, id, bpm, date) {
  const prev = history[id] ?? { best: 0, bestDate: null, days: {} };
  const isRecord = bpm > prev.best;
  const days = { ...prev.days, [date]: Math.max(prev.days[date] ?? 0, bpm) };
  return {
    isRecord,
    history: {
      ...history,
      [id]: { best: Math.max(prev.best, bpm), bestDate: isRecord ? date : prev.bestDate, days },
    },
  };
}

/** Serie [{date, bpm}] ordenada, con el máximo acumulado. */
export function bestSeries(history, id) {
  const entry = history[id];
  if (!entry) return [];
  let running = 0;
  return Object.keys(entry.days).sort().map((date) => {
    running = Math.max(running, entry.days[date]);
    return { date, bpm: entry.days[date], best: running };
  });
}

/** Récords ordenados de mayor a menor. */
export function topRecords(history, limit = 5) {
  return Object.entries(history)
    .map(([id, e]) => ({ id, best: e.best, date: e.bestDate }))
    .sort((a, b) => b.best - a.best)
    .slice(0, limit);
}

/** ¿Estancado? Sin mejorar su récord en `days` días con práctica reciente. */
export function isPlateau(history, id, today, days = 14) {
  const entry = history[id];
  if (!entry || !entry.bestDate) return false;
  const gap = (Date.parse(`${today}T00:00:00`) - Date.parse(`${entry.bestDate}T00:00:00`)) / 86400000;
  const practicedRecently = Object.keys(entry.days).some((d) => (Date.parse(`${today}T00:00:00`) - Date.parse(`${d}T00:00:00`)) / 86400000 <= 7);
  return gap >= days && practicedRecently;
}

/* ─── Diagnóstico de fallos ─── */

/** Motivos por los que se marca «fallé» en la escalera. */
export const FAIL_REASONS = [
  { id: 'fingering', label: 'Digitación (mano izquierda)' },
  { id: 'crossing', label: 'Cambio de cuerda' },
  { id: 'picking', label: 'Mano derecha / púa' },
  { id: 'tempo', label: 'Demasiado rápido' },
  { id: 'tension', label: 'Tensión o cansancio' },
];

const ADVICE = {
  fingering: { text: 'El fallo está en la mano izquierda: baja un 15 % y toca solo la mano izquierda (sin púa, con legato) hasta que cada dedo caiga justo tras el traste.', slow: 0.85, drill: 'legato' },
  crossing: { text: 'Los saltos de cuerda son el cuello de botella: practica solo el compás del cruce en bucle y luego únelo con el resto.', slow: 0.9, drill: 'string-crossing' },
  picking: { text: 'La púa va por delante de tu control: usa púa alterna estricta a un tempo inferior y exagera el movimiento mínimo de la muñeca.', slow: 0.85, drill: 'alt-chromatic' },
  tempo: { text: 'Simplemente vas demasiado rápido: baja un 10 % y sube de 2 en 2 bpm; la velocidad sale de la limpieza, no de forzar.', slow: 0.9, drill: null },
  tension: { text: 'Para y suelta la mano: descansa 2 minutos y baja un 20 %. La tensión acumulada bloquea más que cualquier tempo.', slow: 0.8, drill: null },
};

/**
 * Diagnóstico de un ladder con `reasons`: devuelve el motivo dominante y qué hacer.
 * @returns {null | { reason, label, count, bpm, text, drill }}
 */
export function diagnoseFailures(ladder) {
  const reasons = Object.entries(ladder.reasons ?? {}).sort((a, b) => b[1] - a[1]);
  if (!reasons.length || reasons[0][1] < 2) return null;
  const [reason, count] = reasons[0];
  const adv = ADVICE[reason];
  if (!adv) return null;
  return {
    reason,
    label: FAIL_REASONS.find((r) => r.id === reason)?.label ?? reason,
    count,
    bpm: Math.max(ladder.start ?? 30, Math.round(ladder.bpm * adv.slow)),
    text: adv.text,
    drill: adv.drill,
  };
}

/**
 * Si el desvío medido (ms) empeora al subir de tempo, la calidad se está
 * degradando: sugiere mantener el tempo en lugar de subir.
 */
export function qualityGuard({ prevJitterMs, jitterMs }) {
  if (prevJitterMs == null || jitterMs == null) return { hold: false };
  const worse = jitterMs > prevJitterMs * 1.35 && jitterMs - prevJitterMs > 6;
  return worse ? { hold: true, text: `Tu desvío pasó de ${Math.round(prevJitterMs)} a ${Math.round(jitterMs)} ms: la calidad cae al subir. Quédate en este tempo.` } : { hold: false };
}

/**
 * Plan de fragmentos: parte un pasaje de `bars` compases y marca el compás
 * donde fallas para repetirlo en bucle con compás de margen a cada lado.
 */
export function fragmentPlan({ bars, failBar }) {
  const bar = Math.max(1, Math.min(bars, failBar));
  const from = Math.max(1, bar - 1);
  const to = Math.min(bars, bar + 1);
  return { from, to, bar, steps: [`Bucle de los compases ${from}–${to} al 80 % del tempo`, `Sube de 4 en 4 bpm con 3 repeticiones limpias`, `Une el pasaje completo (compases 1–${bars})`] };
}

/**
 * Calidad al subir de tempo, desde el historial del Timing Lab: compara la
 * dispersión (sd, ms) de esta sesión con la última sesión anterior a un
 * tempo menor y con el mismo subdivisión.
 * @returns {{hold:boolean, text?:string}}
 */
export function guardFromTiming(list, { bpm, sub, sd }) {
  const prev = [...(list ?? [])].reverse().find((x) => x.sub === sub && x.bpm < bpm && x.bpm >= bpm * 0.6);
  return qualityGuard({ prevJitterMs: prev?.sd ?? null, jitterMs: sd });
}

/** Número de compases (4 pulsos) de un ejercicio con `steps` notas y `perBeat` notas por pulso. */
export function barCount(steps, perBeat) {
  return Math.max(1, Math.ceil(steps / (perBeat * 4)));
}
