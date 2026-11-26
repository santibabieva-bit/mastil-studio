import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESSIONS, SETS, STD, TRIAD_EXERCISES, buildTriadExercise, cagedWindows, checkDrill, diatonic, drillQuestion,
  earQuestion, inversionLadder, keyPcs, matchVoices, passingFrets, scaleDegree, recordDrill, spreadVoicing, stepsToBeats, voiceMoves,
} from '../lab/js/core/triadex.js';
import { chordPcs } from '../lab/js/core/chords.js';
import { makeRng, mod } from '../lab/js/core/music.js';
import { morphKeys, dotStyle } from '../lab/js/ui/liveboard.js';
import { beatsToAlphaTex } from '../lab/js/core/alphatex.js';
import {
  BASS_LINE, GROOVES, allForms, chromaticChords, dailyKey, dictationQuestion, judgeImprovNote, matchForm, parseSong, planDay, planDayIndex,
} from '../lab/js/core/triadmore.js';

const chordSteps = (steps) => steps.filter((s) => s.kind === 'chord');
const pcsOk = (st) => {
  const want = new Set(st.chord.pcs ?? chordPcs(st.chord.rootPc, st.chord.typeId));
  return st.notes.every((n) => want.has(mod(n.midi, 12))) && new Set(st.notes.map((n) => mod(n.midi, 12))).size === 3;
};

test('hay al menos 15 ejercicios y todos los no interactivos generan acordes correctos', () => {
  assert.ok(TRIAD_EXERCISES.length >= 31);
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

test('flechas: cada voz va a la nota a la que de verdad se mueve, aunque cambie de cuerda', () => {
  const nt = (s, f) => ({ s, f, midi: STD[s] + f });
  // Do en 2.ª inversión (6-5-4) → Do fundamental (5-4-3): Do y Mi no se mueven, el Sol sube a la 3.ª cuerda.
  const a = [nt(5, 3), nt(4, 3), nt(3, 2)];
  const b = [nt(4, 3), nt(3, 2), nt(2, 0)];
  assert.deepEqual(matchVoices(a, b), [2, 0, 1]);
  const steps = buildTriadExercise('inv-v', { rootPc: 0, quality: 'maj', shape: 'C' }).steps;
  for (let i = 1; i < steps.length; i += 1) {
    const { moves, common } = voiceMoves(steps[i - 1], steps[i]);
    assert.equal(moves.length + common.length, 3);
    for (const m of moves) {
      // El origen de la flecha es una nota del acorde anterior.
      assert.ok(steps[i - 1].notes.some((n) => n.s === m.from.s && n.f === m.from.f));
      assert.ok(steps[i].notes.some((n) => n.s === m.to.s && n.f === m.to.f));
    }
    // Ninguna voz salta más que la alternativa de emparejar por orden de cuerdas.
    const total = moves.reduce((t, m) => t + Math.abs(m.semis), 0);
    const byOrder = steps[i - 1].notes.reduce((t, n, k) => t + Math.abs(n.midi - steps[i].notes[k].midi), 0);
    assert.ok(total <= byOrder);
  }
});

test('partitura: los pasos se convierten en figuras con ligaduras en la barra y nombre de acorde', () => {
  const steps = buildTriadExercise('passing', { keyPc: 0, set: 0 }).steps;
  const { beats, firstBeat } = stepsToBeats(steps);
  assert.equal(firstBeat.length, steps.length);
  assert.equal(beats[0].chord, 'C');
  const ticks = { 1: 192, 2: 96, 4: 48, 8: 24, 16: 12 };
  const total = beats.reduce((t, b) => t + (b.tuplet ? 16 : ticks[b.dur]), 0);
  assert.equal(total, steps.reduce((t, s) => t + s.d, 0) * 48);
  // Los pasos de notas de paso solo escriben la nota que suena (no las sostenidas).
  const pass = steps.findIndex((s) => s.kind === 'pass');
  assert.equal(beats[firstBeat[pass]].notes.length, 1);
  const tex = beatsToAlphaTex(beats, { duration: 4 });
  assert.match(tex, /ch "C"/);
  // Una blanca que empieza en el 4.º tiempo se parte en dos negras ligadas.
  const tied = stepsToBeats([{ notes: [{ s: 0, f: 1 }], d: 3 }, { notes: [{ s: 0, f: 3 }], d: 2 }]).beats;
  assert.deepEqual(tied.map((b) => b.dur), [2, 4, 4, 4]);
  assert.equal(tied[3].notes[0].tie, true);
  const pairs = stepsToBeats(buildTriadExercise('pairs', { keyPc: 0 }).steps).beats;
  assert.ok(pairs.every((b) => b.tuplet && b.dur === 8));
});

test('grado en la escala: las notas de cada tríada según la tonalidad', () => {
  // Re menor en Do mayor: 2, 4, 6. Si disminuido: 7, 2, 4.
  assert.deepEqual([62, 65, 69].map((m) => scaleDegree(m, 0)), ['2', '4', '6']);
  assert.deepEqual([71, 74, 77].map((m) => scaleDegree(m, 0, { rootPc: 11, typeId: 'dim' })), ['7', '2', '4']);
  // En Sol mayor, el Fa♯ es el 7.
  assert.equal(scaleDegree(66, 7), '7');
  // Do aumentado: Sol♯ es ♯5; Do disminuido: Sol♭ es ♭5; Do menor: Mi♭ es ♭3.
  assert.equal(scaleDegree(68, 0, { rootPc: 0, typeId: 'aug' }), '♯5');
  assert.equal(scaleDegree(66, 0, { rootPc: 0, typeId: 'dim' }), '♭5');
  assert.equal(scaleDegree(63, 0, { rootPc: 0, typeId: 'm' }), '♭3');
});

test('nota pedal: la nota aguda no se mueve en ningún acorde', () => {
  for (const pedal of [0, 4, 6]) {
    const steps = buildTriadExercise('pedal', { keyPc: 7, pedal, set: 0 }).steps;
    assert.ok(steps.length >= 5);
    const tops = new Set(steps.map((s) => Math.max(...s.notes.map((n) => n.midi))));
    assert.equal(tops.size, 1, `pedal ${pedal}`);
  }
});

test('línea cromática: entre acordes solo una voz se mueve, un semitono', () => {
  const { major, minor } = chromaticChords(0);
  assert.deepEqual(major.map((c) => c.name), ['C', 'C+', 'C6', 'C7 (sin 5.ª)', 'F']);
  assert.deepEqual(minor.map((c) => c.name).slice(0, 4), ['Am', 'Am(maj7)', 'Am7', 'Am6']);
  const steps = buildTriadExercise('chromatic', { keyPc: 0, set: 1 }).steps;
  for (let i = 1; i < 4; i += 1) {
    const { moves } = voiceMoves(steps[i - 1], steps[i]);
    assert.equal(moves.length, 1);
    assert.equal(Math.abs(moves[0].semis), 1);
  }
});

test('mano quieta: toda la progresión cabe en cuatro trastes', () => {
  const steps = buildTriadExercise('hand', { keyPc: 2, progression: 'I-vi-IV-V', set: 'all' }).steps;
  assert.equal(steps.length, 8);
  const frets = steps.flatMap((s) => s.notes.map((n) => n.f));
  assert.ok(Math.max(...frets) - Math.min(...frets) <= 3);
});

test('bajo descendente: la nota grave baja por la escala hasta el ii', () => {
  const steps = buildTriadExercise('bassline', { keyPc: 0, set: 2 }).steps;
  assert.equal(steps.length, BASS_LINE.length);
  const bass = steps.map((s) => Math.min(...s.notes.map((n) => n.midi)));
  for (let i = 1; i < 7; i += 1) assert.ok(bass[i] < bass[i - 1], `paso ${i}`);
  assert.deepEqual(steps.slice(0, 4).map((s) => s.chord.name), ['C', 'G/B', 'Am', 'C/G']);
});

test('armonía: estructuras superiores con bajo, préstamo y dominantes con nombres correctos', () => {
  const up = buildTriadExercise('upper', { keyPc: 0, set: 0 }).steps;
  assert.ok(up.every((s) => s.bass === 36));
  assert.ok(up.some((s) => s.chord.name === 'B♭/C') && up.some((s) => s.chord.name === 'E♭/C'));
  const bor = buildTriadExercise('borrowed', { keyPc: 0, set: 1 }).steps;
  assert.ok(bor.some((s) => s.chord.name === 'A♭' && s.chord.outside));
  const sec = buildTriadExercise('secondary', { keyPc: 0, set: 1 }).steps;
  assert.ok(sec.some((s) => s.chord.roman === 'V/ii' && s.chord.name === 'A'));
  const sus = buildTriadExercise('sus', { keyPc: 0, set: 0 }).steps;
  assert.equal(sus[1].chord.name, 'Csus4');
  assert.equal(voiceMoves(sus[0], sus[1]).moves.length, 1);
});

test('ritmos: cada compás dura 4 pulsos y los silencios no suenan ni se escriben', () => {
  for (const g of Object.keys(GROOVES)) {
    const steps = buildTriadExercise('rhythm', { keyPc: 0, groove: g, progression: 'I-V-vi-IV' }).steps;
    assert.equal(steps.reduce((a, s) => a + s.d, 0), 32, g);
    const { beats } = stepsToBeats(steps);
    const rests = steps.filter((s) => s.kind === 'rest');
    if (rests.length) assert.ok(beats.some((b) => !b.notes.length));
  }
});

test('adornos: slide, hammer-on desde la sus4 y 6.ª; la tab marca ligados y slides', () => {
  const steps = buildTriadExercise('ornaments', { keyPc: 0, progression: 'I-IV-V', set: 0 }).steps;
  assert.equal(steps.reduce((a, s) => a + s.d, 0) % 4, 0);
  assert.ok(steps.some((s) => s.notes.some((n) => n.art === 'H')));
  const { beats } = stepsToBeats(steps);
  assert.ok(beats.some((b) => b.notes.some((n) => n.tech?.includes('/'))));
  assert.ok(beats.some((b) => b.notes.some((n) => n.tech?.includes('h'))));
  assert.match(beatsToAlphaTex(beats, { duration: 4 }), /\{h\}|\{sl\}/);
});

test('canción, tonalidad del día, dictado, 12 formas e improvisación', () => {
  assert.deepEqual(parseSong('C G/B Am7 | Fmaj7 xx G7').map((c) => c.name), ['C', 'G', 'Am', 'F', 'G']);
  const song = buildTriadExercise('song', { song: 'D A Bm G', set: 1 }).steps;
  assert.equal(song.length, 4);
  const k = dailyKey(new Date(2026, 10, 26));
  assert.notEqual(dailyKey(new Date(2026, 10, 27)), k);
  const d = dictationQuestion(0, makeRng(4));
  assert.equal(d.steps.length, 4);
  assert.equal(d.degrees[0], 0);
  const forms = allForms({ rootPc: 0, typeId: 'maj' });
  assert.equal(forms.length, 12);
  assert.ok(forms.every((f) => f.answers.length > 0));
  const marks = forms[5].answers[0].notes.map((n) => ({ s: n.s, f: n.f }));
  assert.equal(matchForm(marks, forms), 5);
  assert.equal(matchForm(marks, forms, new Set([5])), -1);
  assert.equal(judgeImprovNote(64, { rootPc: 0, typeId: 'maj' }, 0), 'chord');
  assert.equal(judgeImprovNote(62, { rootPc: 0, typeId: 'maj' }, 0), 'scale');
  assert.equal(judgeImprovNote(61, { rootPc: 0, typeId: 'maj' }, 0), 'out');
});

test('plan intensivo: 28 días, cinco bloques de 20–25 minutos, ejercicios que existen', () => {
  const ids = new Set(TRIAD_EXERCISES.map((x) => x.id));
  const used = new Set();
  for (let d = 0; d < 28; d += 1) {
    const day = planDay(d);
    assert.equal(day.week, Math.floor(d / 7) + 1);
    assert.equal(day.blocks.length, 5);
    const mins = day.blocks.reduce((a, b) => a + b.minutes, 0);
    assert.ok(mins >= 20 && mins <= 26, `día ${d}: ${mins} min`);
    for (const b of day.blocks) { assert.ok(ids.has(b.ex), b.ex); used.add(b.ex); }
  }
  assert.ok(used.size >= 25, `${used.size} ejercicios usados`);
  assert.equal(planDayIndex('2026-11-20', new Date(2026, 10, 26)), 6);
});
