/**
 * Currículo: cinco niveles con «puertas» medibles. Cada competencia tiene un
 * criterio que se evalúa con lo que la app ya sabe de ti (quiz, velocidad,
 * timing, aterrizajes del Jam, oído-mástil, repertorio…). Los criterios que
 * la app no puede medir con fiabilidad (p. ej. por micrófono sin probar) se
 * pueden confirmar a mano. Puro.
 *
 * `progress` = {
 *   speed: { [drillId]: { best } }, quiz: { total, byKey }, timing: [{score}], pitch: [{score}],
 *   jam: [{hits,total,level?}], earplay: [{ok,firstTry,total,level}], blind: {ok,avgMs}|null,
 *   neckmap: { "s:f": {ok,miss,ms,...} }, practiceDays: number, songs: [...], manual: { [competencyId]: true }
 * }
 */

import { coverage } from './heatmap.js';

const pct = (x) => Math.round(x * 100);

/** Suma aciertos/fallos de las claves del quiz que empiezan por `prefix` (o de todo con `*`). */
function quizRate(quiz, prefix) {
  if (!quiz) return { answers: 0, rate: 0 };
  if (prefix === '*') {
    const n = (quiz.total?.right ?? 0) + (quiz.total?.wrong ?? 0);
    return { answers: n, rate: n ? quiz.total.right / n : 0 };
  }
  let right = 0;
  let wrong = 0;
  for (const [key, v] of Object.entries(quiz.byKey ?? {})) {
    if (key.startsWith(prefix)) { right += v.right; wrong += v.wrong; }
  }
  const n = right + wrong;
  return { answers: n, rate: n ? right / n : 0 };
}

const EVALUATORS = {
  quiz({ prefix, minAnswers, minRate }, p) {
    const { answers, rate } = quizRate(p.quiz, prefix);
    const value = Math.min(1, (answers / minAnswers + Math.min(1, rate / minRate)) / 2);
    return { done: answers >= minAnswers && rate >= minRate, value, text: `${answers}/${minAnswers} respuestas · ${pct(rate)} % (objetivo ${pct(minRate)} %)` };
  },
  speed({ min }, p) {
    const best = Math.max(0, ...Object.values(p.speed ?? {}).map((e) => e.best ?? 0));
    return { done: best >= min, value: Math.min(1, best / min), text: `Tu récord limpio: ${best || '–'} bpm (objetivo ${min})` };
  },
  timing({ min }, p) {
    const list = (p.timing ?? []).slice(-5).map((x) => x.score);
    const avg = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
    return { done: list.length >= 3 && avg >= min, value: Math.min(1, avg / min), text: list.length ? `Pulso medio ${Math.round(avg)}/100 (objetivo ${min})` : 'Aún sin sesiones en el Timing Lab' };
  },
  jam({ level, minTotal, minRate }, p) {
    // Una sesión cuenta para este nivel o uno superior.
    const order = ['root', 'chord', 'third', 'seventh', 'guide', 'tension'];
    const idx = order.indexOf(level);
    const list = (p.jam ?? []).filter((s) => order.indexOf(s.level ?? 'chord') >= idx);
    const hits = list.reduce((a, s) => a + s.hits, 0);
    const total = list.reduce((a, s) => a + s.total, 0);
    const rate = total ? hits / total : 0;
    return { done: total >= minTotal && rate >= minRate, value: Math.min(1, (total / minTotal + Math.min(1, rate / minRate)) / 2), text: `${hits}/${total} aterrizajes · ${pct(rate)} % (objetivo ${pct(minRate)} % en ${minTotal})` };
  },
  ear({ level, minRuns, minRate }, p) {
    const list = (p.earplay ?? []).filter((h) => h.level >= level).slice(-10);
    const good = list.filter((h) => h.ok && h.firstTry >= Math.ceil(h.total * 0.6)).length;
    const rate = list.length ? good / list.length : 0;
    return { done: list.length >= minRuns && rate >= minRate, value: Math.min(1, (list.length / minRuns + Math.min(1, rate / minRate)) / 2), text: `${good}/${list.length} melodías de nivel ${level}+ (objetivo ${pct(minRate)} % en ${minRuns})` };
  },
  blind({ minOk }, p) {
    const ok = p.blind?.ok ?? 0;
    return { done: ok >= minOk, value: Math.min(1, ok / minOk), text: `Mejor ronda a ciegas: ${ok}/10 (objetivo ${minOk})` };
  },
  neck({ minPct }, p) {
    const cov = coverage(p.neckmap ?? {});
    return { done: cov.pct >= minPct, value: Math.min(1, cov.pct / minPct), text: `${cov.solid}/${cov.total} puntos del mástil dominados (${pct(cov.pct)} %, objetivo ${pct(minPct)} %)` };
  },
  days({ min }, p) {
    const d = p.practiceDays ?? 0;
    return { done: d >= min, value: Math.min(1, d / min), text: `${d}/${min} días practicados` };
  },
  songs({ status, min }, p) {
    const order = { learning: 0, tempo: 1, memorized: 2 };
    const n = (p.songs ?? []).filter((s) => order[s.status] >= order[status]).length;
    return { done: n >= min, value: Math.min(1, n / min), text: `${n}/${min} canciones «${status === 'tempo' ? 'a tempo' : status === 'memorized' ? 'de memoria' : 'aprendiendo'}»` };
  },
  manual(_c, p, comp) {
    const on = !!p.manual?.[comp.id];
    return { done: on, value: on ? 1 : 0, text: on ? 'Confirmado por ti' : 'Confírmalo cuando te salga con soltura' };
  },
};

export const CURRICULUM = [
  {
    id: 1,
    title: 'Nivel 1 · Fundamentos',
    goal: 'Conocer el mástil, tocar con pulso y crear el hábito.',
    competencies: [
      { id: 'l1-board', label: 'Notas del mástil', tool: 'quiz', params: {}, criterion: { type: 'quiz', prefix: 'fretNote', minAnswers: 30, minRate: 0.8 }, how: 'Theory Trainer · «Notas del mástil» hasta el 80 %.' },
      { id: 'l1-blind', label: 'Mástil a ciegas', tool: 'blind', params: {}, criterion: { type: 'blind', minOk: 7 }, how: 'Una ronda de 7 aciertos sobre 10.' },
      { id: 'l1-pulse', label: 'Pulso estable', tool: 'timing', params: {}, criterion: { type: 'timing', min: 60 }, how: 'Timing Lab: puntuación media ≥ 60.' },
      { id: 'l1-habit', label: 'Hábito: 7 días', tool: 'routine', params: {}, criterion: { type: 'days', min: 7 }, how: 'Practica 7 días distintos.' },
      { id: 'l1-pent', label: 'Pentatónica a 80 bpm', tool: 'drills', params: {}, criterion: { type: 'speed', min: 80 }, how: 'Cualquier drill limpio a 80 bpm en la escalera.' },
    ],
  },
  {
    id: 2,
    title: 'Nivel 2 · Vocabulario',
    goal: 'Intervalos y acordes de memoria, aterrizar en el acorde y oír melodías sencillas.',
    competencies: [
      { id: 'l2-int', label: 'Intervalos', tool: 'quiz', params: {}, criterion: { type: 'quiz', prefix: 'interval', minAnswers: 30, minRate: 0.75 }, how: 'Theory Trainer · intervalos al 75 %.' },
      { id: 'l2-keys', label: 'Acordes de la tonalidad', tool: 'quiz', params: {}, criterion: { type: 'quiz', prefix: 'chordInKey', minAnswers: 20, minRate: 0.75 }, how: 'Acordes y números romanos al 75 %.' },
      { id: 'l2-land', label: 'Aterrizar en el acorde', tool: 'jam', params: { prog: 'blues12', focus: 'chord', challenge: 'chord' }, criterion: { type: 'jam', level: 'chord', minTotal: 16, minRate: 0.7 }, how: 'Jam Studio · reto nivel 2 con ≥ 70 % en 16 cambios.' },
      { id: 'l2-ear', label: 'Toca lo que oyes (nivel 1)', tool: 'earplay', params: { level: 1 }, criterion: { type: 'ear', level: 1, minRuns: 5, minRate: 0.7 }, how: '5 melodías cortas con ≥ 70 % a la primera.' },
      { id: 'l2-map', label: 'Mástil dominado: 50 %', tool: 'neckmap', params: {}, criterion: { type: 'neck', minPct: 0.5 }, how: 'Mapa de mi mástil: la mitad de los puntos (trastes 0–12) en verde, es decir, acertados y rápidos.' },
      { id: 'l2-speed', label: 'Velocidad 100 bpm', tool: 'drills', params: {}, criterion: { type: 'speed', min: 100 }, how: 'Escalera de velocidad limpia a 100 bpm.' },
    ],
  },
  {
    id: 3,
    title: 'Nivel 3 · Armonía',
    goal: 'La 3.ª como brújula, la armonía funcional y oído melódico.',
    competencies: [
      { id: 'l3-third', label: 'Aterrizar en la 3.ª', tool: 'jam', params: { prog: 'twofiveone', focus: 'guide', challenge: 'third' }, criterion: { type: 'jam', level: 'third', minTotal: 16, minRate: 0.7 }, how: 'Jam · reto nivel 3 (la 3.ª) con ≥ 70 %.' },
      { id: 'l3-func', label: 'Armonía funcional', tool: 'quiz', params: { topic: 'function' }, criterion: { type: 'quiz', prefix: 'function', minAnswers: 20, minRate: 0.7 }, how: 'Theory Trainer · «Armonía funcional» al 70 %.' },
      { id: 'l3-ear', label: 'Toca lo que oyes (nivel 2)', tool: 'earplay', params: { level: 2 }, criterion: { type: 'ear', level: 2, minRuns: 5, minRate: 0.7 }, how: 'Melodías de 4 notas con ≥ 70 % a la primera.' },
      { id: 'l3-pulse', label: 'Pulso sólido', tool: 'timing', params: {}, criterion: { type: 'timing', min: 75 }, how: 'Timing Lab: puntuación media ≥ 75.' },
      { id: 'l3-approach', label: 'Aproximaciones cromáticas', tool: 'exlib', params: { ex: 'appr-below' }, criterion: { type: 'manual' }, how: 'Toca «Cromática desde abajo» limpia a 80 bpm.' },
    ],
  },
  {
    id: 4,
    title: 'Nivel 4 · Fraseo',
    goal: 'Voces guía, enclosures y primeras canciones de memoria.',
    competencies: [
      { id: 'l4-sev', label: 'Aterrizar en la 7.ª', tool: 'jam', params: { prog: 'twofiveone', focus: 'guide', challenge: 'seventh' }, criterion: { type: 'jam', level: 'seventh', minTotal: 16, minRate: 0.7 }, how: 'Jam · reto nivel 4 (la 7.ª) con ≥ 70 %.' },
      { id: 'l4-guide', label: 'Línea de voces guía', tool: 'jam', params: { prog: 'twofiveone', focus: 'guide', challenge: 'guide' }, criterion: { type: 'jam', level: 'guide', minTotal: 16, minRate: 0.7 }, how: 'Jam · reto nivel 5 (voces guía) con ≥ 70 %.' },
      { id: 'l4-encl', label: 'Enclosures', tool: 'exlib', params: { ex: 'appr-enclosure' }, criterion: { type: 'manual' }, how: 'Enclosure sobre el arpegio a 90 bpm, limpio.' },
      { id: 'l4-ear', label: 'Toca lo que oyes (nivel 3)', tool: 'earplay', params: { level: 3 }, criterion: { type: 'ear', level: 3, minRuns: 5, minRate: 0.7 }, how: 'Melodías de 5 notas en escala mayor.' },
      { id: 'l4-songs', label: 'Repertorio: 2 canciones a tempo', tool: 'repertoire', params: {}, criterion: { type: 'songs', status: 'tempo', min: 2 }, how: 'Lleva dos canciones a su tempo objetivo.' },
      { id: 'l4-map', label: 'Mástil dominado: 85 %', tool: 'neckmap', params: {}, criterion: { type: 'neck', minPct: 0.85 }, how: 'Mapa de mi mástil: casi todo el mástil en verde.' },
      { id: 'l4-speed', label: 'Velocidad 120 bpm', tool: 'drills', params: {}, criterion: { type: 'speed', min: 120 }, how: 'Escalera limpia a 120 bpm.' },
    ],
  },
  {
    id: 5,
    title: 'Nivel 5 · Dominio',
    goal: 'Tensiones, oído fino y repertorio propio.',
    competencies: [
      { id: 'l5-tension', label: 'Aterrizar en tensiones', tool: 'jam', params: { prog: 'twofiveone', focus: 'guide', challenge: 'tension' }, criterion: { type: 'jam', level: 'tension', minTotal: 16, minRate: 0.7 }, how: 'Jam · reto nivel 6 (9, 13, ♯11).' },
      { id: 'l5-ear', label: 'Toca lo que oyes (nivel 4)', tool: 'earplay', params: { level: 4 }, criterion: { type: 'ear', level: 4, minRuns: 5, minRate: 0.7 }, how: 'Melodías de 6 notas con saltos.' },
      { id: 'l5-func', label: 'Armonía funcional avanzada', tool: 'quiz', params: { topic: 'function' }, criterion: { type: 'quiz', prefix: 'function', minAnswers: 60, minRate: 0.85 }, how: 'Armonía funcional al 85 % en 60 respuestas.' },
      { id: 'l5-songs', label: 'Repertorio: 3 canciones de memoria', tool: 'repertoire', params: {}, criterion: { type: 'songs', status: 'memorized', min: 3 }, how: 'Tres canciones de memoria con repaso espaciado.' },
      { id: 'l5-speed', label: 'Velocidad 140 bpm', tool: 'drills', params: {}, criterion: { type: 'speed', min: 140 }, how: 'Escalera limpia a 140 bpm.' },
    ],
  },
];

export function evaluateCompetency(comp, progress) {
  const fn = EVALUATORS[comp.criterion.type];
  return { ...comp, ...fn(comp.criterion, progress, comp) };
}

/**
 * Estado completo: niveles con sus competencias evaluadas, el nivel actual
 * (primero sin completar) y el siguiente objetivo.
 * @returns {{ levels, current, next, overall }}
 */
export function curriculumStatus(progress) {
  const levels = CURRICULUM.map((lv) => {
    const comps = lv.competencies.map((c) => evaluateCompetency(c, progress));
    const done = comps.filter((c) => c.done).length;
    return { ...lv, competencies: comps, done, complete: done === comps.length, value: done / comps.length };
  });
  // Una puerta se abre al tener al menos 4/5 (o todas, si hay menos de 5) de la anterior.
  levels.forEach((lv, i) => {
    const prev = levels[i - 1];
    lv.unlocked = !prev || prev.done >= Math.max(1, prev.competencies.length - 1);
  });
  const current = levels.find((lv) => !lv.complete) ?? levels[levels.length - 1];
  const open = levels.filter((lv) => lv.unlocked && !lv.complete);
  const currentLevel = open[0] ?? current;
  // Objetivo: la competencia sin cumplir más avanzada en valor (la más cerca de lograrse).
  const pending = currentLevel.competencies.filter((c) => !c.done).sort((a, b) => b.value - a.value);
  const next = pending[0] ?? null;
  const overall = levels.reduce((s, lv) => s + lv.done, 0) / levels.reduce((s, lv) => s + lv.competencies.length, 0);
  return { levels, current: currentLevel, next, overall };
}

/** Los dos o tres objetivos que trabajar hoy (intercalados): el más cercano y uno de otro eje. */
export function todayObjectives(progress, count = 3) {
  const { current } = curriculumStatus(progress);
  const pending = current.competencies.filter((c) => !c.done).sort((a, b) => b.value - a.value);
  // Primero uno por herramienta (práctica intercalada); luego se completa con el resto.
  const out = [];
  const tools = new Set();
  for (const c of pending) {
    if (out.length >= count) break;
    if (!tools.has(c.tool)) { tools.add(c.tool); out.push(c); }
  }
  for (const c of pending) {
    if (out.length >= count) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
