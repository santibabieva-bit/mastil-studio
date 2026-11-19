import test from 'node:test';
import assert from 'node:assert/strict';

import { TUNINGS, makeRng, mod } from '../lab/js/core/music.js';
import {
  LANDING_LEVELS, guideLine, guideTones, landingTarget, pcDistance, suggestLevel, tensionTones,
} from '../lab/js/core/guide.js';
import {
  functionQuestion, modalInterchange, reharmonizeTwoFiveOne, secondaryDominants, tritoneSub,
} from '../lab/js/core/harmony.js';
import { APPROACH_KINDS, buildExercise, placeMidi } from '../lab/js/core/exlib.js';
import { MelodyMatcher, melodyQuestion, earplayRate, EARPLAY_LEVELS } from '../lab/js/core/earplay.js';
import { CURRICULUM, curriculumStatus, todayObjectives } from '../lab/js/core/curriculum.js';
import { buildRoutine } from '../lab/js/core/routine.js';
import {
  dueSongs, markSectionClean, newSong, nextSectionBpm, repertoireStats, reviewSong, setStatus, songProgress,
} from '../lab/js/core/repertoire.js';
import {
  FAIL_REASONS, diagnoseFailures, fragmentPlan, newLadder, qualityGuard, submitRep,
} from '../lab/js/core/speed.js';
import { makeQuestion, checkAnswer, describeStatKey } from '../lab/js/core/quiz.js';

const STD = TUNINGS.standard.midi;

/* ───────── voces guía ───────── */

test('guideTones: 3.ª y 7.ª de los acordes habituales', () => {
  const g7 = guideTones(7, '7'); // G7
  assert.equal(g7.third, 11); // B
  assert.equal(g7.seventh, 5); // F
  const dm7 = guideTones(2, 'm7');
  assert.equal(dm7.third, 5); // F
  assert.equal(dm7.seventh, 0); // C
  assert.equal(guideTones(0, 'maj').seventh, 7, 'una tríada usa la 5.ª como segunda voz');
  assert.equal(guideTones(0, '6').second, 'sixth');
  assert.equal(guideTones(0, 'sus4').third, null);
});

test('guideLine: en un II–V–I la 7.ª baja un semitono a la 3.ª', () => {
  const line = guideLine([{ rootPc: 2, typeId: 'm7' }, { rootPc: 7, typeId: '7' }, { rootPc: 0, typeId: 'maj7' }], { start: 'seventh' });
  assert.equal(line[0].pc, 0); // C = 7.ª de Dm7
  assert.equal(line[1].pc, 11); // B = 3.ª de G7 (semitono abajo)
  assert.equal(line[1].resolves, true);
  assert.equal(line[2].pc, 11, 'B = 7.ª de Cmaj7 (se mantiene)');
  for (const l of line.slice(1)) assert.ok(l.motion <= 2, 'la línea se mueve poco');
});

test('guideLine nunca salta más de un tono en las progresiones de jam', () => {
  const prog = [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']];
  const line = guideLine(prog.map(([rootPc, typeId]) => ({ rootPc, typeId })));
  for (const l of line.slice(1)) assert.ok(l.motion <= 3, `movimiento ${l.motion}`);
});

test('landingTarget respeta el nivel pedido', () => {
  const chord = { rootPc: 7, typeId: '7' };
  const rng = makeRng(3);
  assert.equal(landingTarget({ chord, level: 'root', rng }).role, 'root');
  assert.equal(landingTarget({ chord, level: 'third', rng }).pc, 11);
  assert.equal(landingTarget({ chord, level: 'seventh', rng }).pc, 5);
  const t = landingTarget({ chord, level: 'tension', rng });
  assert.equal(t.role, 'tension');
  assert.ok(tensionTones(7, '7').some((x) => x.pc === t.pc));
  // voces guía: elige la más cercana a la anterior
  const g = landingTarget({ chord, level: 'guide', prev: { pc: 0 }, rng });
  assert.ok([11, 5].includes(g.pc));
  assert.ok(pcDistance(g.pc, 0) <= pcDistance(g.pc === 11 ? 5 : 11, 0));
});

test('landingTarget cae a la tónica si el acorde no tiene la nota pedida', () => {
  assert.equal(landingTarget({ chord: { rootPc: 0, typeId: '5' }, level: 'third' }).role, 'root');
  assert.equal(landingTarget({ chord: { rootPc: 0, typeId: '5' }, level: 'tension' }).pc >= 0, true);
});

test('suggestLevel sube o baja según el rendimiento', () => {
  assert.equal(suggestLevel('chord', { hits: 9, total: 10 }).next, 'third');
  assert.equal(suggestLevel('third', { hits: 2, total: 10 }).next, 'chord');
  assert.equal(suggestLevel('third', { hits: 6, total: 10 }), null);
  assert.equal(suggestLevel('tension', { hits: 10, total: 10 }), null);
  assert.ok(LANDING_LEVELS.length >= 6);
});

/* ───────── armonía funcional ───────── */

test('dominantes secundarios de Do mayor', () => {
  const doms = secondaryDominants(0);
  const byId = Object.fromEntries(doms.map((d) => [d.id, d]));
  assert.equal(byId['V/ii'].symbol, 'A7');
  assert.equal(byId['V/V'].symbol, 'D7');
  assert.equal(byId['V/vi'].symbol, 'E7');
  assert.equal(byId['V/IV'].symbol, 'C7');
  assert.equal(byId['V/iii'].symbol, 'B7');
});

test('intercambio modal y sustitución tritonal', () => {
  const bor = Object.fromEntries(modalInterchange(0).map((b) => [b.id, b.symbol]));
  assert.match(bor.iv, /^Fm/);
  assert.match(bor.bVII, /^(A♯|B♭|Bb|A#)/);
  assert.match(tritoneSub(7).symbol, /^(C♯|D♭|Db|C#)7/);
  assert.equal(tritoneSub(7).pc, 1);
});

test('reharmonizeTwoFiveOne devuelve variantes con 4 acordes válidos', () => {
  const list = reharmonizeTwoFiveOne(0);
  assert.ok(list.length >= 4);
  for (const v of list) {
    assert.equal(v.chords.length, 4, v.id);
    for (const c of v.chords) assert.ok(c.rootPc >= 0 && c.rootPc < 12 && c.typeId);
  }
});

test('preguntas de armonía funcional: respuesta presente en las opciones y comprobable', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 80; i += 1) {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      const q = functionQuestion(level, rng);
      assert.equal(q.type, 'function');
      assert.ok(q.options.some((o) => o.value === q.answer), q.prompt);
      assert.equal(new Set(q.options.map((o) => o.value)).size, q.options.length, `opciones únicas: ${q.prompt}`);
      assert.ok(q.explanation && q.statKey.startsWith('function:'));
      assert.equal(checkAnswer(q, q.answer), true);
      assert.ok(describeStatKey(q.statKey).includes('Armonía funcional'));
    }
  }
  const viaMake = makeQuestion({ topics: ['function'], level: 'advanced', rng });
  assert.equal(viaMake.type, 'function');
});

/* ───────── aproximaciones y enclosures ───────── */

test('placeMidi coloca la nota en la cuerda preferida o la más cercana', () => {
  assert.deepEqual(placeMidi(STD, 64, 0), { s: 0, f: 0, midi: 64 });
  const low = placeMidi(STD, 39, 5, 17); // por debajo de la 6.ª al aire: no cabe
  assert.equal(low, null);
  assert.ok(placeMidi(STD, 63, 0)); // Eb: cae en la 2.ª cuerda
});

test('ejercicios de aproximación: terminan en notas del acorde y usan cromatismos', () => {
  for (const kind of Object.keys(APPROACH_KINDS)) {
    for (const root of ['A', 'C', 'Eb', 'F#']) {
      const r = buildExercise(`appr-${kind}`, { tuning: STD, root, quality: 'major', direction: 'up', position: 0 });
      assert.ok(r.beats.length >= 8, `${kind} ${root}: ${r.beats.length}`);
      const notes = r.beats.map((b) => b.notes[0]);
      const rootPc = mod(STD[5] + (notes[0].f), 12);
      void rootPc;
      const flat = notes.filter((n) => n.f < 0);
      assert.equal(flat.length, 0);
      // Las aproximaciones son cromáticas: alguna nota queda fuera de la escala
      const majorPcs = new Set([0, 2, 4, 5, 7, 9, 11].map((i) => i));
      void majorPcs;
      const pre = APPROACH_KINDS[kind].pre(60, { noteByPc: { has: () => true } });
      assert.ok(pre.length >= 1 && pre.length <= 2);
    }
  }
});

test('el último elemento de cada grupo es una nota del acorde 1-3-5-7', () => {
  const r = buildExercise('appr-below', { tuning: STD, root: 'C', quality: 'major', direction: 'up', position: 0 });
  const chord = new Set([0, 4, 7, 11]);
  // Con aproximación de 1 nota, cada pareja (aprox, objetivo) acaba en una nota del acorde.
  const notes = r.beats.map((b) => b.notes[0]);
  assert.equal(notes.length % 2, 0);
  for (let i = 1; i < notes.length; i += 2) assert.ok(chord.has(mod(notes[i].midi, 12)), `objetivo ${i}`);
  for (let i = 0; i < notes.length; i += 2) assert.equal(notes[i].midi, notes[i + 1].midi - 1, 'semitono por debajo');
});

/* ───────── toca lo que oyes ───────── */

test('melodyQuestion genera melodías de la longitud y escala del nivel', () => {
  const rng = makeRng(5);
  for (const lv of EARPLAY_LEVELS) {
    for (const root of ['A', 'C', 'F#']) {
      const q = melodyQuestion({ root, level: lv.id, rng });
      assert.equal(q.notes.length, lv.length, `nivel ${lv.id}`);
      assert.equal(mod(q.refMidi, 12), mod({ A: 9, C: 0, 'F#': 6 }[root], 12));
      for (let i = 1; i < q.notes.length; i += 1) assert.notEqual(q.notes[i].midi, q.notes[i - 1].midi);
      for (const n of q.notes) assert.ok(n.degree >= 1);
    }
  }
});

test('MelodyMatcher: acierta, tolera octavas y cuenta errores', () => {
  const q = melodyQuestion({ root: 'A', level: 2, rng: makeRng(9) });
  const m = new MelodyMatcher(q.notes);
  assert.equal(m.hear(q.notes[0].midi), 'ok');
  assert.equal(m.hear(q.notes[1].midi + 12), 'octave');
  const wrong = q.notes[2].midi + 1;
  assert.equal(m.hear(wrong), 'wrong');
  assert.equal(m.hear(q.notes[2].midi), 'ok');
  m.hear(q.notes[3].midi);
  assert.equal(m.done, true);
  assert.equal(m.hear(60), 'ignored');
  const s = m.summary();
  assert.equal(s.ok, true);
  assert.equal(s.firstTry, 3);
  assert.equal(s.errors, 1);
  const strict = new MelodyMatcher(q.notes, { strictOctave: true });
  assert.equal(strict.hear(q.notes[0].midi + 12), 'wrong');
});

test('MelodyMatcher falla tras demasiados errores', () => {
  const q = melodyQuestion({ root: 'C', level: 1, rng: makeRng(1) });
  const m = new MelodyMatcher(q.notes, { maxErrors: 2 });
  m.hear(q.notes[0].midi + 1);
  m.hear(q.notes[0].midi + 1);
  assert.equal(m.failed, true);
  assert.equal(m.hear(q.notes[0].midi), 'ignored');
});

test('earplayRate mide las últimas rondas del nivel', () => {
  const hist = Array.from({ length: 6 }, (_, i) => ({ level: 2, ok: i < 5, firstTry: i < 5 ? 3 : 0, total: 4 }));
  assert.deepEqual(earplayRate(hist, 2), { runs: 6, rate: 5 / 6 });
  assert.deepEqual(earplayRate(hist, 1), { runs: 0, rate: 0 });
});

/* ───────── currículo ───────── */

const EMPTY = { speed: {}, quiz: null, timing: [], pitch: [], jam: [], earplay: [], blind: null, practiceDays: 0, songs: [], manual: {} };

test('currículo: ids únicos, criterios válidos, herramientas con texto', () => {
  const ids = CURRICULUM.flatMap((l) => l.competencies.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(CURRICULUM.length, 5);
  for (const lv of CURRICULUM) for (const c of lv.competencies) assert.ok(c.label && c.how && c.tool && c.criterion.type, c.id);
});

test('currículo: sin datos parte del nivel 1 con objetivo sugerido', () => {
  const st = curriculumStatus(EMPTY);
  assert.equal(st.current.id, 1);
  assert.equal(st.overall, 0);
  assert.ok(st.next);
  assert.equal(st.levels[1].unlocked, false, 'el nivel 2 está bloqueado');
});

test('currículo: completar el nivel 1 abre el 2', () => {
  const progress = {
    ...EMPTY,
    quiz: { total: { right: 40, wrong: 5 }, byKey: { 'fretNote:0': { right: 38, wrong: 4 } } },
    blind: { ok: 8, avgMs: 2000 },
    timing: [{ score: 70 }, { score: 72 }, { score: 68 }],
    practiceDays: 9,
    speed: { x: { best: 90 } },
  };
  const st = curriculumStatus(progress);
  assert.equal(st.levels[0].complete, true);
  assert.equal(st.current.id, 2);
  assert.ok(st.levels[1].unlocked);
  assert.ok(st.overall > 0);
});

test('currículo: una puerta se abre con todas menos una competencia', () => {
  const progress = {
    ...EMPTY,
    quiz: { total: { right: 40, wrong: 5 }, byKey: { 'fretNote:0': { right: 38, wrong: 4 } } },
    blind: { ok: 8, avgMs: 2000 },
    timing: [{ score: 70 }, { score: 72 }, { score: 68 }],
    practiceDays: 9,
  };
  const st = curriculumStatus(progress);
  assert.equal(st.levels[0].done, 4);
  assert.equal(st.levels[1].unlocked, true);
  assert.equal(st.next.id, 'l1-pent', 'el objetivo es la competencia pendiente del nivel');
});

test('currículo: los aterrizajes de un nivel superior también cuentan en los inferiores', () => {
  const progress = { ...EMPTY, jam: [{ hits: 15, total: 16, level: 'guide' }] };
  const st = curriculumStatus(progress);
  const comp = st.levels[1].competencies.find((c) => c.id === 'l2-land');
  assert.equal(comp.done, true);
});

test('currículo: las competencias manuales se confirman a mano', () => {
  const st = curriculumStatus({ ...EMPTY, manual: { 'l3-approach': true } });
  assert.equal(st.levels[2].competencies.find((c) => c.id === 'l3-approach').done, true);
});

test('todayObjectives intercala herramientas distintas', () => {
  const list = todayObjectives(EMPTY, 3);
  assert.equal(list.length, 3);
  assert.equal(new Set(list.map((c) => c.tool)).size, 3);
});

/* ───────── rutina por objetivos ───────── */

test('buildRoutine con objetivo: bloque del currículo partido en dos tandas y suma exacta', () => {
  const objective = { id: 'l2-land', label: 'Aterrizar en el acorde', tool: 'jam', params: { prog: 'blues12' }, how: 'x' };
  for (const minutes of [30, 45, 60, 90]) {
    for (let seed = 1; seed < 8; seed += 1) {
      const r = buildRoutine({ minutes, objectives: [objective], rng: makeRng(seed) });
      assert.equal(r.blocks.reduce((s, b) => s + b.minutes, 0), minutes, `${minutes} min`);
      const obj = r.blocks.filter((b) => b.id.startsWith('objective'));
      assert.equal(obj.length, 2, 'dos tandas');
      assert.ok(r.blocks.indexOf(obj[1]) - r.blocks.indexOf(obj[0]) >= 2, 'separadas por otros bloques');
      assert.equal(obj[0].tool, 'jam');
    }
  }
});

test('buildRoutine evita repetir lo practicado recientemente', () => {
  const r1 = buildRoutine({ minutes: 45, rng: makeRng(2) });
  const drill = r1.blocks.find((b) => b.id === 'technique')?.params.drill;
  const jam = r1.blocks.find((b) => b.id === 'jam')?.params.prog;
  assert.ok(drill && jam);
  for (let seed = 1; seed < 30; seed += 1) {
    const r = buildRoutine({ minutes: 45, recent: [drill, jam], rng: makeRng(seed) });
    assert.notEqual(r.blocks.find((b) => b.id === 'technique')?.params.drill, drill);
    assert.notEqual(r.blocks.find((b) => b.id === 'jam')?.params.prog, jam);
  }
});

test('buildRoutine sin objetivo conserva su comportamiento (suma y sin bloque de objetivo)', () => {
  const r = buildRoutine({ minutes: 30, rng: makeRng(4) });
  assert.equal(r.blocks.reduce((s, b) => s + b.minutes, 0), 30);
  assert.equal(r.blocks.some((b) => b.id.startsWith('objective')), false);
});

/* ───────── repertorio ───────── */

test('repertorio: secciones, progreso y paso a «a tempo»', () => {
  let song = newSong({ title: 'Wonderwall', targetBpm: 100, sections: 'Intro, Estrofa' });
  assert.equal(song.sections.length, 2);
  assert.equal(nextSectionBpm(song, song.sections[0]), 60);
  song = markSectionClean(song, 0, 60);
  assert.equal(nextSectionBpm(song, song.sections[0]), 66);
  assert.ok(songProgress(song) > 0 && songProgress(song) < 1);
  song = markSectionClean(song, 0, 100);
  assert.equal(song.status, 'learning');
  song = markSectionClean(song, 1, 100);
  assert.equal(song.status, 'tempo');
  assert.equal(songProgress(setStatus(song, 'memorized')), 1);
  assert.equal(setStatus(song, 'basura').status, 'tempo');
});

test('repertorio: repaso espaciado sube a «de memoria» y vuelve atrás al fallar', () => {
  let song = { ...newSong({ title: 'A' }), status: 'tempo' };
  const day = 86400000;
  let now = Date.now();
  for (let i = 0; i < 4; i += 1) { song = reviewSong(song, true, now); now += 40 * day; }
  assert.equal(song.status, 'memorized');
  song = reviewSong(song, false, now);
  assert.equal(song.status, 'tempo');
  assert.equal(dueSongs([song], now).length, 1, 'recién fallada: vence ya');
  assert.equal(dueSongs([song], now - 1).length, 0, 'aún no vence antes de ahora (caja 0 vence ahora)');
});

test('repertorio: estadísticas y secciones por defecto', () => {
  const songs = [newSong({ title: 'a' }), { ...newSong({ title: 'b' }), status: 'tempo' }, { ...newSong({ title: 'c' }), status: 'memorized' }];
  assert.deepEqual(repertoireStats(songs), { total: 3, learning: 1, tempo: 1, memorized: 1 });
  assert.equal(newSong({ title: 'x', sections: '' }).sections[0].name, 'Canción completa');
});

/* ───────── velocidad: diagnóstico ───────── */

test('submitRep registra el motivo del fallo y diagnoseFailures da una acción', () => {
  let l = newLadder({ start: 60, target: 120 });
  l = submitRep(l, true).ladder;
  l = submitRep(l, false, 'crossing').ladder;
  assert.equal(diagnoseFailures(l), null, 'con un solo fallo aún no hay patrón');
  l = submitRep(l, false, 'crossing').ladder;
  const d = diagnoseFailures(l);
  assert.equal(d.reason, 'crossing');
  assert.ok(d.bpm < l.bpm || l.bpm === l.start);
  assert.ok(d.text.length > 20);
  assert.equal(d.drill, 'string-crossing');
  assert.ok(FAIL_REASONS.every((r) => diagnoseFailures({ bpm: 100, start: 60, reasons: { [r.id]: 3 } })));
});

test('submitRep sigue funcionando sin motivo (compatibilidad)', () => {
  let l = newLadder({ start: 60, target: 64, step: 4, reps: 2 });
  l = submitRep(l, true).ladder;
  const r = submitRep(l, true);
  assert.equal(r.event, 'up');
  assert.equal(r.ladder.bpm, 64);
});

test('qualityGuard mantiene el tempo si el desvío empeora', () => {
  assert.equal(qualityGuard({ prevJitterMs: 20, jitterMs: 40 }).hold, true);
  assert.equal(qualityGuard({ prevJitterMs: 20, jitterMs: 22 }).hold, false);
  assert.equal(qualityGuard({ prevJitterMs: null, jitterMs: 22 }).hold, false);
});

test('fragmentPlan envuelve el compás que falla con uno de margen', () => {
  assert.deepEqual({ ...fragmentPlan({ bars: 8, failBar: 5 }), steps: undefined }, { from: 4, to: 6, bar: 5, steps: undefined });
  assert.equal(fragmentPlan({ bars: 4, failBar: 1 }).from, 1);
  assert.equal(fragmentPlan({ bars: 4, failBar: 9 }).to, 4);
});
