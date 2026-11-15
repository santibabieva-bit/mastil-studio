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
export function submitRep(ladder, clean) {
  const l = { ...ladder, runs: ladder.runs + 1 };
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
