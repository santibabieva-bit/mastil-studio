/**
 * Radar de habilidades: reduce todo lo que la app sabe de ti a cinco ejes
 * de 0 a 100 y propone la siguiente tarea. Puro.
 */

import { daysPracticed } from './practice.js';

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export const SKILL_AXES = [
  { id: 'timing', label: 'Pulso', tool: 'timing', hint: 'Mide tu regularidad con el Timing Lab.' },
  { id: 'pitch', label: 'Afinación', tool: 'bendlab', hint: 'Practica bends y vibrato con feedback del micrófono.' },
  { id: 'theory', label: 'Teoría', tool: 'quiz', hint: 'Responde preguntas en el Theory Trainer.' },
  { id: 'speed', label: 'Velocidad', tool: 'drills', hint: 'Sube tu récord en la escalera de velocidad.' },
  { id: 'ear', label: 'Oído', tool: 'earplay', hint: 'Toca de oído melodías cortas en «Toca lo que oyes».' },
  { id: 'improv', label: 'Improvisación', tool: 'jam', hint: 'Sube de nivel en el reto de aterrizaje del Jam Studio.' },
  { id: 'repertoire', label: 'Repertorio', tool: 'repertoire', hint: 'Lleva una canción a su tempo y apréndela de memoria.' },
  { id: 'consistency', label: 'Constancia', tool: 'routine', hint: 'Genera una rutina y practica unos minutos cada día.' },
];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * @param {object} data
 * @param {Array<{score:number}>} data.timing sesiones del Timing Lab (más recientes al final)
 * @param {Array<{score:number}>} data.pitch sesiones de bends/vibrato
 * @param {{total:{right:number,wrong:number}}} data.quiz
 * @param {Record<string,{best:number}>} data.speed historial de velocidad
 * @param {object} data.practice estado de práctica
 */
export function skillRadar({
  timing = [], pitch = [], quiz = null, speed = {}, practice = null, earplay = [], jam = [], songs = [],
}) {
  const recent = (list) => list.slice(-5).map((x) => x.score);
  const t = avg(recent(timing));
  const p = avg(recent(pitch));
  const answers = quiz ? quiz.total.right + quiz.total.wrong : 0;
  const theory = answers >= 10 ? (quiz.total.right / answers) * 100 : null;
  const bests = Object.values(speed).map((e) => e.best).filter(Boolean);
  // 160 bpm de corcheas limpias se toma como nivel alto de referencia.
  const speedScore = bests.length ? (Math.max(...bests) / 160) * 100 : null;
  let consistency = null;
  if (practice) {
    const days = Object.keys(practice.days ?? {}).length ? daysPracticed(practice) : 0;
    consistency = Math.min(100, (days / 30) * 100 * 1.4);
  }
  // Oído: tasa de melodías completadas con ≥ 60 % a la primera, ponderada por nivel.
  const earRuns = earplay.slice(-10);
  const ear = earRuns.length >= 3
    ? (earRuns.filter((r) => r.ok && r.firstTry >= Math.ceil(r.total * 0.6)).length / earRuns.length) * 100 * (0.7 + 0.1 * Math.max(...earRuns.map((r) => r.level)))
    : null;
  // Improvisación: % de aterrizajes en las últimas sesiones, con un bonus por el nivel del reto.
  const jamRuns = jam.slice(0, 5);
  const jamTotal = jamRuns.reduce((a, r) => a + r.total, 0);
  const levelBonus = { root: 0.6, chord: 0.75, third: 0.85, seventh: 0.92, guide: 1, tension: 1 };
  const improv = jamTotal >= 8
    ? (jamRuns.reduce((a, r) => a + r.hits, 0) / jamTotal) * 100 * Math.max(...jamRuns.map((r) => levelBonus[r.level ?? 'chord'] ?? 0.75))
    : null;
  const repertoire = songs.length
    ? (songs.reduce((a, x) => a + (x.status === 'memorized' ? 1 : x.status === 'tempo' ? 0.66 : 0.25 * Math.min(1, x.sections.reduce((m, sec) => m + sec.bpm / x.targetBpm, 0) / Math.max(1, x.sections.length))), 0) / songs.length) * 100
    : null;
  const raw = {
    timing: t, pitch: p, theory, speed: speedScore, ear, improv, repertoire, consistency,
  };
  return SKILL_AXES.map((axis) => ({ ...axis, value: raw[axis.id] == null ? null : clamp(raw[axis.id]) }));
}

/** El eje más flojo (los que no se han medido cuentan como más urgentes). */
export function nextFocus(radar) {
  const unmeasured = radar.find((a) => a.value == null);
  if (unmeasured) return { ...unmeasured, reason: 'Aún no hay datos' };
  const weakest = [...radar].sort((a, b) => a.value - b.value)[0];
  return { ...weakest, reason: `Tu eje más bajo (${weakest.value}/100)` };
}
