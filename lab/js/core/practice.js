/**
 * Registro de práctica: minutos por día, rachas, vista de semanas e hitos.
 * Estado puro: { days: { 'YYYY-MM-DD': { minutes, tools: {id: min}, note } }, goal }.
 */

export function emptyPractice() {
  return { days: {}, goal: 15 };
}

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(key, days) {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function addMinutes(state, key, minutes, tool = 'manual') {
  const day = state.days[key] ?? { minutes: 0, tools: {}, note: '' };
  const next = {
    ...state,
    days: {
      ...state.days,
      [key]: {
        ...day,
        minutes: Math.round((day.minutes + minutes) * 100) / 100,
        tools: { ...day.tools, [tool]: Math.round(((day.tools[tool] ?? 0) + minutes) * 100) / 100 },
      },
    },
  };
  return next;
}

export function setNote(state, key, note) {
  const day = state.days[key] ?? { minutes: 0, tools: {}, note: '' };
  return { ...state, days: { ...state.days, [key]: { ...day, note } } };
}

export function minutesOn(state, key) {
  return state.days[key]?.minutes ?? 0;
}

/** Un día cuenta para la racha si practicaste al menos 1 minuto. */
export function didPractice(state, key) {
  return minutesOn(state, key) >= 1;
}

/** Racha actual: si hoy aún no practicaste, cuenta desde ayer. */
export function currentStreak(state, today = dateKey()) {
  let cursor = didPractice(state, today) ? today : shiftKey(today, -1);
  let count = 0;
  while (didPractice(state, cursor)) {
    count += 1;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

export function longestStreak(state) {
  const keys = Object.keys(state.days).filter((k) => didPractice(state, k)).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    run = prev && shiftKey(prev, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

/** Rejilla de `weeks` semanas (columnas) terminando esta semana (lunes→domingo). */
export function weekGrid(state, today = dateKey(), weeks = 16) {
  const date = parseKey(today);
  const dow = (date.getDay() + 6) % 7; // lunes = 0
  const monday = shiftKey(today, -dow);
  const start = shiftKey(monday, -(weeks - 1) * 7);
  const columns = [];
  for (let w = 0; w < weeks; w += 1) {
    const col = [];
    for (let d = 0; d < 7; d += 1) {
      const key = shiftKey(start, w * 7 + d);
      col.push({ key, minutes: minutesOn(state, key), future: key > today });
    }
    columns.push(col);
  }
  return columns;
}

export function totalMinutes(state) {
  return Object.values(state.days).reduce((sum, d) => sum + d.minutes, 0);
}

export function totalsByTool(state) {
  const out = {};
  for (const day of Object.values(state.days)) {
    for (const [tool, min] of Object.entries(day.tools ?? {})) out[tool] = (out[tool] ?? 0) + min;
  }
  return out;
}

export const MILESTONES = [
  { id: 'first', label: 'Primera sesión', test: (s) => totalMinutes(s) >= 1 },
  { id: 'hour', label: '1 hora acumulada', test: (s) => totalMinutes(s) >= 60 },
  { id: 'ten', label: '10 horas acumuladas', test: (s) => totalMinutes(s) >= 600 },
  { id: 'fifty', label: '50 horas acumuladas', test: (s) => totalMinutes(s) >= 3000 },
  { id: 'hundred', label: '100 horas acumuladas', test: (s) => totalMinutes(s) >= 6000 },
  { id: 'streak3', label: 'Racha de 3 días', test: (s) => longestStreak(s) >= 3 },
  { id: 'streak7', label: 'Racha de 7 días', test: (s) => longestStreak(s) >= 7 },
  { id: 'streak30', label: 'Racha de 30 días', test: (s) => longestStreak(s) >= 30 },
  { id: 'days10', label: '10 días practicados', test: (s) => daysPracticed(s) >= 10 },
  { id: 'days50', label: '50 días practicados', test: (s) => daysPracticed(s) >= 50 },
  { id: 'jammer', label: 'Jammer: 30 min en Jam Studio', test: (s) => (totalsByTool(s).jam ?? 0) >= 30 },
  { id: 'theory', label: 'Teórico: 30 min de Theory Trainer', test: (s) => (totalsByTool(s).quiz ?? 0) >= 30 },
  { id: 'ear', label: 'Oído fino: 30 min de entrenamiento', test: (s) => (totalsByTool(s).ear ?? 0) >= 30 },
  { id: 'weekly', label: 'Meta semanal cumplida', test: (s) => weeksGoalMet(s) >= 1 },
  { id: 'weekly4', label: '4 semanas con meta cumplida', test: (s) => weeksGoalMet(s) >= 4 },
];

export function daysPracticed(state) {
  return Object.keys(state.days).filter((k) => didPractice(state, k)).length;
}

/** Lunes de la semana a la que pertenece la fecha dada. */
export function weekStartKey(key = dateKey()) {
  const date = parseKey(key);
  const offset = (date.getDay() + 6) % 7;
  return shiftKey(key, -offset);
}

export function weeklyGoal(state) {
  return state.weeklyGoal ?? Math.round((state.goal ?? 15) * 5);
}

export function weekMinutes(state, today = dateKey()) {
  const start = weekStartKey(today);
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += minutesOn(state, shiftKey(start, i));
  return total;
}

/** Semanas completas (lunes–domingo) en las que se alcanzó la meta semanal. */
export function weeksGoalMet(state) {
  const goal = weeklyGoal(state);
  const weeks = new Set(Object.keys(state.days).map((k) => weekStartKey(k)));
  let met = 0;
  for (const start of weeks) {
    let total = 0;
    for (let i = 0; i < 7; i += 1) total += minutesOn(state, shiftKey(start, i));
    if (total >= goal) met += 1;
  }
  return met;
}

export function achieved(state) {
  return MILESTONES.filter((m) => m.test(state));
}

/** Intensidad 0–4 para colorear la rejilla según la meta diaria. */
export function intensity(minutes, goal) {
  if (minutes < 1) return 0;
  const ratio = minutes / Math.max(1, goal);
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  if (ratio < 1.5) return 3;
  return 4;
}

export function formatMinutes(min) {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
