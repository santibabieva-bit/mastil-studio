import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESSIONS, SETS, STD, TRIAD_EXERCISES, buildTriadExercise, cagedWindows, checkDrill, diatonic, drillQuestion,
  earQuestion, inversionLadder, keyPcs, passingFrets, recordDrill, spreadVoicing, voiceMoves,
} from '../lab/js/core/triadex.js';
import { chordPcs } from '../lab/js/core/chords.js';
import { makeRng, mod } from '../lab/js/core/music.js';
import { morphKeys, dotStyle } from '../lab/js/ui/liveboard.js';

const chordSteps = (steps) => steps.filter((s) => s.kind === 'chord');
const pcsOk = (st) => {
  const want = new Set(chordPcs(st.chord.rootPc, st.chord.typeId));
  return st.notes.every((n) => want.has(mod(n.midi, 12))) && new Set(st.notes.map((n) => mod(n.midi, 12))).size === 3;
};

test('hay al menos 15 ejercicios y todos los no interactivos generan acordes correctos', () => {
  assert.ok(TRIAD_EXERCISES.length >= 15);
  for (const ex of TRIAD_EXERCISES) {
    if (ex.interactive) continue;
    for (const keyPc of [0, 7, 10]) {
      const { steps } = buildTriadExercise(ex.id, { keyPc, rootPc: keyPc });
      assert.ok(steps.length > 0, `${ex.id} en ${keyPc}`);
      for (const st of steps) {
        for (const n of st.notes) {
          assert.equal(STD[n.s] + n.f, n.midi, `${ex.id}: altura`);
          assert.ok(n.f >= 0 && n.f <= 17, `${ex.id}: traste ${n.f}`);
        }
        if (st.kind === 'chord') assert.ok(pcsOk(st), `${ex.id}: notas del acorde ${st.chord.name}`);
      }
    }
  }
});

test('inversiones en horizontal: F → 1.ª → 2.ª subiendo, en el mismo grupo de cuerdas', () => {
  for (let si = 0; si < 4; si += 1) {
    const ladder = inversionLadder({ rootPc: 0, typeId: 'maj' }, si);
    assert.ok(ladder.length >= 3, `grupo ${si}`);
    for (let i = 1; i < ladder.length; i += 1) {
      assert.equal(ladder[i].inversion, (ladder[i - 1].inversion + 1) % 3);
      assert.equal(ladder[i].strings[0], SETS[si][0]);
    }
  }
  const { steps } = buildTriadExercise('inv-h', { rootPc: 0, quality: 'all', set: 'all' });
  const types = new Set(steps.map((s) => s.chord.typeId));
  assert.deepEqual([...types].sort(), ['aug', 'dim', 'm', 'maj']);
  assert.deepEqual([...new Set(steps.map((s) => s.set))].sort(), [0, 1, 2, 3]);
});

test('inversiones en vertical: cada forma CAGED queda dentro de su ventana', () => {
  const { steps } = buildTriadExercise('inv-v', { rootPc: 9, quality: 'maj', shape: 'all' });
  assert.ok(steps.length >= 10);
  for (const st of steps) {
    for (const n of st.notes) assert.ok(n.f >= st.shape.from - 1 && n.f <= st.shape.to + 1, `${st.shape.id}: ${n.f}`);
  }
  assert.equal(cagedWindows(0).length, 5);
});

test('cambio de calidad: entre acordes solo se mueve una voz, un semitono', () => {
  const steps = chordSteps(buildTriadExercise('quality', { rootPc: 2, set: 1, inversion: 0 }).steps);
  assert.equal(steps.length, 7);
  for (let i = 1; i < steps.length; i += 1) {
    const { moves } = voiceMoves(steps[i - 1], steps[i]);
    assert.equal(moves.length, 1, `${steps[i - 1].chord.name} → ${steps[i].chord.name}`);
    assert.equal(Math.abs(moves[0].semis), 1);
  }
});

test('escala armonizada: siete acordes de la tonalidad con sus calidades', () => {
  assert.deepEqual(diatonic(7).map((c) => c.name), ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F♯dim']);
  const h = chordSteps(buildTriadExercise('scale-h', { keyPc: 0, set: 0, inversion: 0 }).steps);
  const up = h.slice(0, 8);
  assert.deepEqual(up.map((s) => s.chord.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'I']);
  assert.ok(up.every((s) => s.inv === 0));
  const v = chordSteps(buildTriadExercise('scale-v', { keyPc: 0, shape: 'E' }).steps);
  assert.equal(new Set(v.map((s) => s.chord.roman)).size, 7);
});

test('progresiones en posición CAGED: mínimo movimiento y dentro de la zona', () => {
  for (const prog of PROGRESSIONS) {
    const steps = chordSteps(buildTriadExercise('prog-caged', { keyPc: 0, progression: prog.id, shape: 'A', set: 'all' }).steps);
    assert.equal(steps.length, prog.degrees.length * 2, prog.id);
    for (let i = 1; i < steps.length; i += 1) {
      const a = steps[i - 1].notes.map((n) => n.midi);
      const b = steps[i].notes.map((n) => n.midi);
      const move = a.reduce((t, m, k) => t + Math.abs(m - b[k]), 0);
      assert.ok(move <= 12, `${prog.id}: salto de ${move} semitonos`);
    }
  }
  const sets = chordSteps(buildTriadExercise('prog-sets', { keyPc: 0, progression: 'I-V-vi-IV', set: 'all' }).steps);
  assert.equal(sets.length, 16);
  assert.deepEqual([...new Set(sets.map((s) => s.set))], [3, 2, 1, 0]);
});

test('notas de paso: de la escala, en la voz aguda, con las graves pisadas', () => {
  assert.deepEqual(passingFrets(0, 3, 8, keyPcs(0)), [5, 7]);
  const { steps } = buildTriadExercise('passing', { keyPc: 0, set: 0 });
  const pass = steps.filter((s) => s.kind === 'pass');
  assert.ok(pass.length >= 3);
  for (const st of pass) {
    const top = st.notes.find((n) => !n.held);
    assert.ok(keyPcs(0).includes(mod(top.midi, 12)));
    assert.equal(st.notes.filter((n) => n.held).length, 2);
  }
});

test('ciclo de cuartas, melodía arriba y tríadas abiertas', () => {
  const cyc = chordSteps(buildTriadExercise('cycle4', { keyPc: 0, set: 1 }).steps);
  assert.equal(cyc.length, 12);
  cyc.forEach((s, i) => { if (i) assert.equal(mod(s.chord.rootPc - cyc[i - 1].chord.rootPc, 12), 5); });
  const mel = chordSteps(buildTriadExercise('melody', { keyPc: 0 }).steps);
  assert.ok(mel.length >= 10);
  for (const s of mel) assert.equal(Math.max(...s.notes.map((n) => n.midi)), s.melody, 'la nota aguda es la melodía');
  const closed = inversionLadder({ rootPc: 0, typeId: 'maj' }, 1)[0];
  const sp = spreadVoicing(closed, 0);
  assert.ok(sp);
  const midis = sp.notes.map((n) => STD[n.s] + n.f).sort((a, b) => a - b);
  assert.ok(midis[2] - midis[0] > 12, 'abarca más de una octava');
});

test('pares de tríadas y arpegio en dos cuerdas', () => {
  const pairs = buildTriadExercise('pairs', { keyPc: 0, set: 0 }).steps;
  assert.ok(pairs.length >= 6);
  assert.deepEqual([...new Set(pairs.map((s) => s.chord.name))], ['F', 'G']);
  assert.ok(pairs[0].pad);
  const lin = buildTriadExercise('linear', { rootPc: 0, quality: 'm', set: 0 }).steps;
  const up = lin.slice(0, Math.ceil(lin.length / 2));
  for (let i = 1; i < up.length; i += 1) assert.ok(up[i].notes[0].midi > up[i - 1].notes[0].midi);
  assert.ok(lin.every((s) => [0, 1].includes(s.notes[0].s)));
});

test('retos: la prueba de reacción reconoce la forma y el oído da calidad y nota aguda', () => {
  const rng = makeRng(3);
  for (let k = 0; k < 20; k += 1) {
    const q = drillQuestion({ rng });
    assert.ok(q.answers.length > 0, `${q.chord.name} ${q.inv} ${q.set}`);
    const good = q.answers[0].notes.map((n) => ({ s: n.s, f: n.f }));
    assert.equal(checkDrill(good, q).ok, true);
    const bad = checkDrill(good.slice(0, 2).concat({ s: 5, f: 0 }), q);
    assert.equal(bad.ok, false);
    assert.ok(bad.why);
  }
  const stats = recordDrill(recordDrill({}, '0:maj:0', true, 2000), '0:maj:0', false, 9000);
  assert.deepEqual(stats['0:maj:0'], { ok: 1, miss: 1, ms: 2000 });
  const e = earQuestion(makeRng(5));
  assert.ok(['root', 'third', 'fifth'].includes(e.top));
});

test('mástil vivo: claves por cuerda para deslizar y estilos iguales al dibujo fijo', () => {
  const keys = morphKeys([{ s: 0, f: 5 }, { s: 0, f: 3 }, { s: 1, f: 2, kind: 'ghost' }]);
  assert.deepEqual(keys, ['note:0#1', 'note:0#0', 'ghost:1#0']);
  assert.equal(dotStyle({ s: 0, f: 1, role: 'root' }).halo, '#d84a3e');
  assert.equal(dotStyle({ s: 0, f: 1, kind: 'select' }).fill, '#df812f');
  assert.deepEqual(dotStyle({ s: 0, f: 1, colors: ['#111', '#222'] }).colors, ['#111', '#222']);
});
