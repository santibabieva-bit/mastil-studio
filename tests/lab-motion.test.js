import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD, callPhrase, checkScalePath, compareFingerings, crossingType, fingerLayout, handPositions,
  intervalMap, intervalTargets, isScaleStep, judgeResponse, modeBoard, modeMorph, phraseVariations,
  placeSequence, positionsOf, quantizePhrase, revealMask, shortestScalePath, stepTimes, tensionMap,
  toSteps, totalBeats, travel, withPicking,
} from '../lab/js/core/motion.js';
import { recordDay, recordSpot, snapshot } from '../lab/js/core/heatmap.js';
import { makeRng, mod } from '../lab/js/core/music.js';

const BOX1 = toSteps([[3, 5], [3, 7], [2, 5], [2, 7], [1, 5], [1, 8], [0, 5]]);
const A_MINOR_PENT = [9, 0, 2, 4, 7];

test('toSteps, stepTimes y totalBeats', () => {
  const st = toSteps([[0, 5, 1], [0, 7, 0.5], [1, 5]], STANDARD, 2);
  assert.equal(st[0].notes[0].midi, 69);
  assert.deepEqual(stepTimes(st), [0, 1, 1.5]);
  assert.equal(totalBeats(st), 3.5);
});

test('handPositions: la caja 1 no mueve la mano; un salto sí', () => {
  assert.ok(handPositions(BOX1).every((w) => w.from === 5 && !w.shift));
  const jump = toSteps([[0, 5], [0, 12]]);
  const w = handPositions(jump);
  assert.equal(w[1].shift, true);
  assert.ok(w[1].from <= 12 && w[1].to >= 12);
});

test('fingerLayout: un dedo pisa y los otros tres quedan preparados en la ventana', () => {
  const win = { from: 5, to: 8 };
  const layout = fingerLayout({ notes: [{ s: 1, f: 7 }] }, win);
  assert.equal(layout.length, 4);
  assert.deepEqual(layout.find((d) => d.down), { finger: 3, s: 1, f: 7, down: true });
  assert.deepEqual(layout.filter((d) => !d.down).map((d) => d.f), [5, 6, 8]);
});

test('placeSequence: «por posición» se queda en una ventana, «por cuerda» no cambia casi de cuerda', () => {
  const midis = BOX1.map((s) => s.notes[0].midi);
  const pos = placeSequence(midis, { strategy: 'position', center: 6 });
  const frets = pos.map((p) => p.f);
  assert.ok(Math.max(...frets) - Math.min(...frets) <= 4, `ventana ${frets}`);
  pos.forEach((p, i) => assert.equal(STANDARD[p.s] + p.f, midis[i]));
  const str = placeSequence(midis, { strategy: 'string', center: 6 });
  const changes = str.slice(1).filter((p, i) => p.s !== str[i].s).length;
  assert.ok(changes <= 2, `cambios de cuerda: ${changes}`);
});

test('compareFingerings devuelve dos digitaciones con su recorrido', () => {
  const [pos, str] = compareFingerings(BOX1);
  assert.equal(pos.strategy, 'position');
  assert.equal(str.strategy, 'string');
  assert.ok(pos.travel.frets < str.travel.frets);
  assert.ok(pos.steps.every((s) => s.notes[0].finger >= 1 && s.notes[0].finger <= 4));
  assert.deepEqual(travel(BOX1), { frets: 0, strings: 3, shifts: 0 });
});

test('crossingType y withPicking: púa alterna y cruces por dentro/fuera', () => {
  assert.equal(crossingType({ s: 2, pick: 'D' }, { s: 1 }), 'inside');
  assert.equal(crossingType({ s: 2, pick: 'D' }, { s: 3 }), 'outside');
  assert.equal(crossingType({ s: 2, pick: 'U' }, { s: 1 }), 'outside');
  assert.equal(crossingType({ s: 2, pick: 'U' }, { s: 3 }), 'inside');
  assert.equal(crossingType({ s: 2, pick: 'D' }, { s: 2 }), null);
  const picked = withPicking(BOX1);
  assert.deepEqual(picked.map((s) => s.notes[0].pick).join(''), 'DUDUDUD');
});

test('revealMask: todo visible al principio, nada al final y cada vez menos', () => {
  const n = 9;
  const counts = [0, 1, 2, 3].map((r) => revealMask(n, r, 4).filter(Boolean).length);
  assert.equal(counts[0], n);
  assert.equal(counts[3], 0);
  assert.ok(counts[1] > counts[2]);
  // La primera nota se mantiene visible hasta el final (ancla).
  assert.equal(revealMask(n, 2, 4)[0], true);
});

test('laberinto: pasos de escala, ruta más corta y validación de la ruta del usuario', () => {
  const a = { s: 5, f: 5, midi: 45 };
  const b = { s: 5, f: 8, midi: 48 };
  assert.equal(isScaleStep(a, b, A_MINOR_PENT), true);
  assert.equal(isScaleStep(a, { s: 5, f: 10, midi: 50 }, A_MINOR_PENT), false, 'se salta un grado');
  assert.equal(isScaleStep(a, { s: 3, f: 7, midi: 57 }, A_MINOR_PENT), false, 'dos cuerdas de salto');
  const path = shortestScalePath({ s: 5, f: 5 }, { s: 3, f: 7 }, A_MINOR_PENT);
  assert.ok(path && path.length >= 5);
  for (let i = 1; i < path.length; i += 1) assert.ok(isScaleStep(path[i - 1], path[i], A_MINOR_PENT));
  const ok = checkScalePath(path, path[0], path[path.length - 1], A_MINOR_PENT);
  assert.equal(ok.ok, true);
  assert.equal(ok.perfect, true);
  const bad = checkScalePath([path[0], { s: 0, f: 0, midi: 64 }], path[0], path[path.length - 1], A_MINOR_PENT);
  assert.equal(bad.valid, false);
});

test('intervalos: la 3.ª mayor se corre un traste al cruzar a la cuerda Si', () => {
  const fromG = intervalTargets(2, 5, 4); // C en la 3.ª cuerda
  const toB = fromG.find((t) => t.s === 1);
  assert.equal(toB.f, 5, 'G→B: mismo traste');
  assert.equal(toB.crossesB, true);
  const fromD = intervalTargets(3, 5, 4).find((t) => t.s === 2);
  assert.equal(fromD.f, 4, 'D→G: un traste hacia la cejuela');
  for (const p of intervalMap(9, 7)) assert.equal(mod(STANDARD[p.to.s] + p.to.f - (STANDARD[p.from.s] + p.from.f), 12), 7);
});

test('modos: de jónico a mixolidio solo cambia la 7.ª y las claves son estables', () => {
  const m = modeMorph('major', 'mixolydian');
  assert.deepEqual(m.map((x) => x.name), ['♭7']);
  assert.deepEqual(modeMorph('major', 'lydian').map((x) => x.name), ['♯4']);
  const ion = modeBoard(9, 'major');
  const mix = modeBoard(9, 'mixolydian');
  const keysI = new Set(ion.map((n) => n.key));
  const shared = mix.filter((n) => keysI.has(n.key));
  assert.ok(shared.length / mix.length > 0.9, 'casi todas las notas conservan su clave');
  const seventh = mix.find((n) => n.degree === 6);
  const same = ion.find((n) => n.key === seventh.key);
  if (same) assert.equal(Math.abs((STANDARD[same.s] + same.f) - (STANDARD[seventh.s] + seventh.f)), 1);
});

test('mapa de tensión: 4.ª a evitar sobre acorde mayor, 9 y 13 disponibles', () => {
  const t = tensionMap({ rootPc: 0, typeId: 'maj7' }, [0, 2, 4, 5, 7, 9, 11]);
  const by = Object.fromEntries(t.map((x) => [x.interval, x.kind]));
  assert.equal(by[0], 'chord');
  assert.equal(by[5], 'avoid');
  assert.equal(by[2], 'tension');
  assert.equal(by[9], 'tension');
  const minor = tensionMap({ rootPc: 9, typeId: 'm7' }, [9, 11, 0, 2, 4, 5, 7]);
  assert.equal(minor.find((x) => x.interval === 8).kind, 'avoid');
  assert.equal(minor.find((x) => x.interval === 5).kind, 'tension');
});

test('pregunta-respuesta: la pregunta usa la escala y dura dos compases; la respuesta se juzga', () => {
  const rng = makeRng(7);
  for (let k = 0; k < 20; k += 1) {
    const call = callPhrase({ pcs: A_MINOR_PENT, chordPcs: [9, 0, 4, 7], rng });
    assert.ok(call.length >= 5);
    assert.ok(call.every((n) => A_MINOR_PENT.includes(mod(n.midi, 12))));
    assert.equal(call.reduce((a, n) => a + n.d, 0), 8, 'dos compases');
  }
  assert.equal(judgeResponse([60, 62, 64], { chordPcs: [9, 0, 4] }).ok, true);
  const short = judgeResponse([62], { chordPcs: [9, 0, 4] });
  assert.equal(short.ok, false);
  assert.ok(short.why.length >= 1);
});

test('quantizePhrase redondea al pulso y limita las duraciones', () => {
  const q = quantizePhrase([{ s: 0, f: 5, t: 0 }, { s: 0, f: 7, t: 330 }, { s: 0, f: 8, t: 1000 }, { s: 1, f: 5, t: 9000 }], { bpm: 90, sub: 2 });
  assert.deepEqual(q.map((n) => n.d), [0.5, 1, 4, 1]);
});

test('variaciones: mismas alturas en retrógrada, secuencia en la escala y desplazamiento', () => {
  const vars = phraseVariations(BOX1, { pcs: A_MINOR_PENT });
  const ids = vars.map((v) => v.id);
  for (const id of ['retro', 'inversion', 'sequence', 'approach', 'displace']) assert.ok(ids.includes(id), id);
  const orig = BOX1.map((s) => s.notes[0].midi);
  const retro = vars.find((v) => v.id === 'retro').steps.map((s) => s.notes[0].midi);
  assert.deepEqual(retro, [...orig].reverse());
  const seq = vars.find((v) => v.id === 'sequence').steps.map((s) => s.notes[0].midi);
  assert.ok(seq.every((m) => A_MINOR_PENT.includes(mod(m, 12))));
  assert.ok(seq.every((m, i) => m > orig[i]));
  const disp = vars.find((v) => v.id === 'displace');
  assert.equal(disp.steps[0].notes.length, 0);
  assert.equal(disp.steps[0].d, 0.5);
  for (const v of vars) for (const st of v.steps) for (const n of st.notes) assert.equal(STANDARD[n.s] + n.f, n.midi, `${v.id} coloca bien`);
});

test('positionsOf encuentra todas las apariciones de una nota', () => {
  const a = positionsOf(9, { maxFret: 12 });
  assert.equal(a.length, 7);
  assert.ok(a.every((p) => mod(STANDARD[p.s] + p.f, 12) === 9));
});

test('mapa vivo: una foto por día con el dominio de cada punto', () => {
  let m = {};
  for (let i = 0; i < 4; i += 1) m = recordSpot(m, 0, 5, true, 1500, 1);
  const snap = snapshot(m);
  assert.ok(snap['0:5'] >= 95);
  let days = {};
  for (let d = 1; d <= 5; d += 1) days = recordDay(days, m, `2026-11-0${d}`, 3);
  assert.deepEqual(Object.keys(days).sort(), ['2026-11-03', '2026-11-04', '2026-11-05']);
});
