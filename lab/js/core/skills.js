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
export function skillRadar({ timing = [], pitch = [], quiz = null, speed = {}, practice = null }) {
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
  const raw = { timing: t, pitch: p, theory, speed: speedScore, consistency };
  return SKILL_AXES.map((axis) => ({ ...axis, value: raw[axis.id] == null ? null : clamp(raw[axis.id]) }));
}

/** El eje más flojo (los que no se han medido cuentan como más urgentes). */
export function nextFocus(radar) {
  const unmeasured = radar.find((a) => a.value == null);
  if (unmeasured) return { ...unmeasured, reason: 'Aún no hay datos' };
  const weakest = [...radar].sort((a, b) => a.value - b.value)[0];
  return { ...weakest, reason: `Tu eje más bajo (${weakest.value}/100)` };
}
