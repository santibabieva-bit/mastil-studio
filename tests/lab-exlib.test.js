import test from 'node:test';
import assert from 'node:assert/strict';

import { TUNINGS, createNoteCollection, mod } from '../lab/js/core/music.js';
import {
  DOUBLE_NAMES, EXERCISES, EX_FAMILIES, buildExercise, doubleStops, permName, stringPairs, assignFingers,
} from '../lab/js/core/exlib.js';
import { PATTERNS } from '../lab/js/core/exercises.js';
import {
  beatsToAlphaTex, scoreToTab, tabToAlphaTex, texNoteName, tabTimeSig, tabToBeats,
} from '../lab/js/core/alphatex.js';
import { createTab, setCell } from '../lab/js/core/tab.js';

const STD = TUNINGS.standard.midi;
const ROOTS = ['A', 'C', 'E', 'F#', 'Bb', 'G'];

test('catálogo: familias, ids únicos y textos', () => {
  const ids = EXERCISES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(EXERCISES.length >= 45, `hay ${EXERCISES.length} ejercicios`);
  for (const f of EX_FAMILIES) assert.ok(EXERCISES.some((e) => e.family === f.id), f.id);
  for (const e of EXERCISES) {
    assert.ok(e.title && e.desc && e.tip, e.id);
    assert.ok(EX_FAMILIES.some((f) => f.id === e.family), `${e.id} familia`);
  }
  assert.equal(Object.keys(PATTERNS).length >= 18, true);
});

test('todos los ejercicios generan notas válidas en varias tonalidades y direcciones', () => {
  for (const ex of EXERCISES) {
    for (const root of ROOTS) {
      for (const direction of ['up', 'down', 'updown']) {
        const r = buildExercise(ex.id, {
          tuning: STD, root, quality: 'major', pent: 'minor', direction, perm: 5, perm3: 2, variant: 1, startFret: 5, string: 1, chord: 'm7',
        });
        assert.ok(r.beats.length >= 4, `${ex.id} ${root} ${direction}: ${r.beats.length} beats; ${r.warnings}`);
        for (const b of r.beats) {
          assert.ok(b.notes.length >= 1 && b.notes.length <= 2);
          for (const n of b.notes) {
            assert.ok(n.f >= 0 && n.f <= 24, `${ex.id} traste ${n.f}`);
            assert.equal(n.midi, STD[n.s] + n.f, `${ex.id} midi`);
            assert.ok(n.finger >= 0 && n.finger <= 4, `${ex.id} dedo ${n.finger}`);
          }
        }
      }
    }
  }
});

test('los ejercicios de escala sólo usan notas de la escala (todas las calidades y posiciones)', () => {
  for (const quality of ['major', 'naturalMinor', 'dorian', 'mixolydian', 'harmonicMinor']) {
    const col = createNoteCollection('D', 'scale', quality);
    for (const ex of EXERCISES.filter((e) => e.needsPosition && e.family !== 'pent')) {
      for (let position = 0; position < 7; position += 1) {
        const r = buildExercise(ex.id, { tuning: STD, root: 'D', quality, position, direction: 'updown', variant: 2 });
        for (const b of r.beats) for (const n of b.notes) assert.ok(col.noteByPc.has(mod(n.midi, 12)), `${ex.id} ${quality} pos ${position}`);
      }
    }
  }
  for (const pent of ['minor', 'major', 'blues']) {
    const q = { minor: 'pentatonicMinor', major: 'pentatonicMajor', blues: 'blues' }[pent];
    const col = createNoteCollection('A', 'scale', q);
    for (const ex of EXERCISES.filter((e) => e.family === 'pent')) {
      const r = buildExercise(ex.id, { tuning: STD, root: 'A', pent });
      assert.ok(r.beats.length > 5, `${ex.id} ${pent}`);
      for (const b of r.beats) for (const n of b.notes) assert.ok(col.noteByPc.has(mod(n.midi, 12)), `${ex.id} ${pent}`);
    }
  }
});

test('permutaciones: cada grupo contiene las mismas cuatro notas', () => {
  for (let p = 0; p < 24; p += 1) {
    const r = buildExercise('perm-scale-4', { tuning: STD, root: 'A', quality: 'major', perm: p, direction: 'up' });
    const mids = r.beats.map((b) => b.notes[0].midi);
    assert.equal(mids.length % 4, 0);
    for (let i = 0; i < mids.length; i += 4) {
      const group = mids.slice(i, i + 4);
      const sorted = [...group].sort((a, b) => a - b);
      assert.equal(new Set(group).size, 4);
      if (i > 0) assert.ok(sorted[0] >= [...mids.slice(i - 4, i)].sort((a, b) => a - b)[0]);
    }
  }
  assert.equal(permName(0), '1-2-3-4');
  assert.equal(permName(23), '4-3-2-1');
  const all = buildExercise('perm-all-24', { tuning: STD, startFret: 5, string: 2 });
  assert.equal(all.beats.length, 96);
  assert.equal(new Set(all.beats.map((b) => b.notes[0].f)).size, 4);
  const three = buildExercise('perm-scale-3', { tuning: STD, root: 'C', quality: 'major', perm3: 0 });
  assert.equal(three.beats.length % 3, 0);
});

test('dobles cuerdas: intervalos reales entre las dos notas', () => {
  const ranges = { 2: [3, 4], 3: [5, 6], 4: [6, 7], 5: [8, 9], 6: [10, 11], 7: [12, 12] };
  for (const root of ROOTS) {
    for (const quality of ['major', 'naturalMinor', 'dorian']) {
      const col = createNoteCollection(root, 'scale', quality);
      for (const k of [2, 3, 4, 5, 6, 7]) {
        for (const pair of stringPairs(6)) {
          const rows = doubleStops({ tuning: STD, collection: col, k, pair, maxFret: 17 });
          assert.ok(rows.length <= 8);
          for (const r of rows) {
            const semis = r.high.midi - r.low.midi;
            assert.ok(semis >= ranges[k][0] && semis <= ranges[k][1], `${root} ${quality} k${k}`);
            assert.ok(col.noteByPc.has(mod(r.low.midi, 12)) && col.noteByPc.has(mod(r.high.midi, 12)));
            assert.equal(r.low.midi, STD[r.low.s] + r.low.f);
            assert.equal(r.high.midi, STD[r.high.s] + r.high.f);
            assert.ok(Math.abs(r.low.f - r.high.f) <= 5);
          }
        }
      }
    }
  }
  // terceras de Do mayor sobre las cuerdas 3 y 2: C-E, D-F, E-G, F-A, G-B, A-C, B-D
  const col = createNoteCollection('C', 'scale', 'major');
  const rows = doubleStops({ tuning: STD, collection: col, k: 2, pair: [2, 1], maxFret: 17 });
  assert.ok(rows.length >= 6);
  assert.ok(Object.keys(DOUBLE_NAMES).length === 6);
  const harmonic = buildExercise('dbl-3', { tuning: STD, root: 'C', quality: 'major', pair: [2, 1], harmonic: true });
  const melodic = buildExercise('dbl-3', { tuning: STD, root: 'C', quality: 'major', pair: [2, 1], harmonic: false });
  assert.ok(harmonic.beats.every((b) => b.notes.length === 2));
  assert.equal(melodic.beats.length, harmonic.beats.length * 2);
});

test('legato: las técnicas encadenan notas de la misma cuerda', () => {
  const r = buildExercise('leg-groups', { tuning: STD, root: 'A', quality: 'major', position: 0 });
  r.beats.forEach((b, i) => {
    const n = b.notes[0];
    if (n.tech.includes('h') || n.tech.includes('p')) assert.equal(r.beats[i + 1]?.notes[0].s, n.s, `legato en ${i}`);
  });
  assert.ok(r.beats.some((b) => b.notes[0].tech.includes('h')));
  assert.ok(r.beats.some((b) => b.notes[0].tech.includes('p')));
});

test('dedos sugeridos', () => {
  const fingered = assignFingers([{ s: 5, f: 5 }, { s: 5, f: 7 }, { s: 5, f: 8 }, { s: 4, f: 0 }]);
  assert.deepEqual(fingered.map((n) => n.finger), [1, 3, 4, 0]);
});

test('otras afinaciones: 7 cuerdas, drop D y bajo', () => {
  for (const id of ['dropD', 'seven', 'bass4', 'dadgad']) {
    const t = TUNINGS[id].midi;
    const r = buildExercise('seq-triplets', { tuning: t, root: 'E', quality: 'naturalMinor', position: 0 });
    assert.ok(r.beats.length > 3, id);
    for (const b of r.beats) for (const n of b.notes) assert.equal(n.midi, t[n.s] + n.f);
  }
});

/* ───────────── alphaTex ───────────── */

test('alphaTex: cabecera, afinación y compases de 4/4', () => {
  assert.equal(texNoteName(64), 'E4');
  assert.equal(texNoteName(54), 'F#3');
  const beats = Array.from({ length: 8 }, (_, i) => ({ notes: [{ s: 5, f: i, tech: [] }] }));
  const tex = beatsToAlphaTex(beats, { title: 'Prueba "x"', tempo: 100, duration: 8 });
  assert.match(tex, /\\title "Prueba \\"x\\""/);
  assert.match(tex, /\\tempo 100/);
  assert.match(tex, /\\tuning E4 B3 G3 D3 A2 E2/);
  assert.match(tex, /\n\.\n\\ts 4 4\n:8 0\.6 1\.6 2\.6 3\.6 4\.6 5\.6 6\.6 7\.6/);
  // 8 corcheas = un compás completo, sin silencios sobrantes ni barra final
  assert.ok(!/\|\s*$/.test(tex.trim()));
  const five = beatsToAlphaTex(beats.slice(0, 5), { duration: 8 });
  assert.equal((five.match(/ r/g) ?? []).length, 3 * 2, 'completa el compás con 6 semicorcheas de silencio');
});

test('alphaTex: acordes, técnicas, dedos y tresillos', () => {
  const beats = [
    { notes: [{ s: 2, f: 5, tech: ['h'], finger: 1 }] },
    { notes: [{ s: 2, f: 7, tech: [], finger: 3 }] },
    { notes: [{ s: 1, f: 5, tech: [] }, { s: 0, f: 7, tech: ['~'] }] },
    { notes: [{ s: 3, f: 0, mute: true, tech: [] }] },
    { notes: [{ s: 4, f: 3, tech: ['b'] }] },
    { rest: true, notes: [] },
  ];
  const withFingers = beatsToAlphaTex(beats, { duration: 8, showFingers: true });
  assert.match(withFingers, /5\.3\{h lf 1\}/);
  assert.match(withFingers, /7\.3\{lf 3\}/);
  assert.match(withFingers, /\(5\.2 7\.1\{v\}\)/);
  assert.match(withFingers, /x\.4/);
  assert.match(withFingers, /3\.5\{b \(0 4\)\}/);
  assert.match(withFingers, / r /);
  const plain = beatsToAlphaTex(beats, { duration: 8 });
  assert.ok(!plain.includes('lf '));
  const trip = beatsToAlphaTex(Array.from({ length: 6 }, () => ({ notes: [{ s: 0, f: 5, tech: [] }] })), { duration: 8, tuplet: true });
  assert.equal((trip.match(/\{tu 3\}/g) ?? []).length, 6);
});

test('alphaTex: tab del Lab → texto y compás desde las columnas', () => {
  let tab = createTab({ cols: 8, title: 'Mi tab', tempo: 80 });
  tab = setCell(tab, 5, 0, '5h');
  tab = setCell(tab, 5, 1, '7');
  tab = setCell(tab, 2, 4, '12~');
  const tex = tabToAlphaTex(tab);
  assert.match(tex, /\\title "Mi tab"/);
  assert.match(tex, /5\.6\{h\} 7\.6 r r 12\.3\{v\} r r r/);
  assert.deepEqual(tabTimeSig({ ...tab, barCols: 6 }), [3, 4]);
  assert.equal(tabToBeats(tab).length, 8);
  const bass = createTab({ strings: 4, cols: 4 });
  assert.match(tabToAlphaTex(bass), /\\tuning G2 D2 A1 E1/);
  assert.match(tabToAlphaTex(bass), /\\instrument 33/);
});

test('alphaTex: partitura de alphaTab → tab del Lab', () => {
  const fake = {
    title: 'Fake',
    tempo: 120,
    tracks: [{
      staves: [{
        tuning: [64, 59, 55, 50, 45, 40],
        bars: [{
          voices: [{
            beats: [
              { playbackDuration: 480, notes: [{ string: 1, fret: 5, isHammerPullOrigin: true }] },
              { playbackDuration: 480, notes: [{ string: 1, fret: 7 }] },
              { playbackDuration: 480, isRest: true, notes: [] },
              { playbackDuration: 480, notes: [{ string: 6, fret: 3, vibrato: 1 }, { string: 5, fret: 3 }] },
            ],
          }],
        }],
      }],
    }],
  };
  const tab = scoreToTab(fake);
  assert.equal(tab.strings, 6);
  assert.equal(tab.subdivision, 2);
  assert.equal(tab.tempo, 120);
  assert.equal(tab.cells[5][0], '5h');
  assert.equal(tab.cells[5][1], '7');
  assert.equal(tab.cells[0][3], '3~');
  assert.equal(tab.cells[1][3], '3');
  assert.equal(scoreToTab({ tracks: [] }), null);
});

/* ───────────── alphaTex para drills, licks y pasos con púa ───────────── */

import { eventsToBeats, lickToBeats, durationForSub } from '../lab/js/core/alphatex.js';
import { DRILL_LIST, buildDrill } from '../lab/js/core/drills.js';
import { BUILTIN_LICKS } from '../lab/js/core/licks.js';

test('alphaTex: eventos de drill con púa, ligados, tap y palm mute', () => {
  const beats = eventsToBeats([
    { s: 2, f: 5, pick: 'D', finger: 1 },
    { s: 2, f: 7, art: 'H', finger: 3 },
    { s: 2, f: 5, art: 'P', finger: 1 },
    { s: 2, f: 5, pick: 'U', finger: 1 },
    { s: 1, f: 12, art: 'T' },
    { s: 5, f: 0, art: 'M', pick: 'D' },
    { s: 1, f: 5, pick: 'm' },
  ]);
  const tex = beatsToAlphaTex(beats, { duration: 16, showFingers: true });
  assert.match(tex, /5\.3\{h lf 1 sd\}/); // origen del hammer-on, con dedo y púa abajo
  assert.match(tex, /7\.3\{h lf 3\}/); // origen del pull-off
  assert.match(tex, /5\.3\{lf 1\} /); // destino del pull-off, sin púa
  assert.match(tex, /5\.3\{lf 1 su\}/);
  assert.match(tex, /12\.2\{tt\}/);
  assert.match(tex, /0\.6\{pm sd\}/);
  assert.match(tex, /5\.2\{rf 3\}/);
  const noPick = beatsToAlphaTex(beats, { duration: 16, showPicking: false });
  assert.ok(!/ s[ud]\}/.test(noPick));
});

test('alphaTex: todos los drills y licks del Lab producen alphaTex bien formado', () => {
  const STD6 = TUNINGS.standard.midi;
  for (const d of DRILL_LIST) {
    for (const sub of [1, 2, 3, 4]) {
      const { events } = buildDrill(d.id, { tuning: STD6, root: 9, startFret: 5, variant: 3, quality: 'm' });
      assert.ok(events.length > 3, d.id);
      const { duration, tuplet } = durationForSub(sub);
      const tex = beatsToAlphaTex(eventsToBeats(events), { title: d.title, duration, tuplet, showFingers: true });
      assert.ok(!/undefined|NaN/.test(tex), `${d.id}: ${tex.slice(0, 200)}`);
      assert.equal((tex.match(/\{[^}]*\}/g) ?? []).every((b) => !b.includes('{}')), true);
      // sin tresillo: todas las notas aparecen
      const notes = tex.split('\n.\n')[1].match(/\d+\.\d/g) ?? [];
      assert.ok(notes.length >= events.length, d.id);
    }
  }
  for (const lick of BUILTIN_LICKS) {
    const beats = lickToBeats(lick);
    assert.equal(beats.length, lick.notes.length);
    const tex = beatsToAlphaTex(beats, { title: lick.name, duration: 8 });
    assert.ok(!/undefined|NaN/.test(tex), lick.id);
  }
});

test('alphaTex: figuras con puntillo cuentan 1,5 veces en el compás', () => {
  const beats = [
    { notes: [{ s: 0, f: 5, tech: [] }], dur: 4, dot: true },
    { notes: [{ s: 0, f: 7, tech: [] }], dur: 8 },
    { notes: [{ s: 0, f: 8, tech: [] }], dur: 4 },
    { notes: [{ s: 0, f: 10, tech: [] }], dur: 4 },
  ];
  const tex = beatsToAlphaTex(beats, { duration: 4 });
  assert.match(tex, /:4 5\.1\{d\} :8 7\.1 :4 8\.1 10\.1/);
  assert.ok(!/ r/.test(tex), 'compás completo: 1,5 + 0,5 + 1 + 1 = 4 negras');
  const l = lickToBeats({ subdivision: 2, notes: [[0, 5, 3], [0, 7, 1]] });
  assert.deepEqual(l.map((b) => [b.dur, b.dot]), [[4, true], [8, false]]);
});

test('CAGED por terceras y sextas: cada forma da dobles cuerdas diatónicas dentro de su ventana', async () => {
  const { buildExercise, cagedShapes } = await import('../lab/js/core/exlib.js');
  const { createNoteCollection } = await import('../lab/js/core/music.js');
  const tuning = [64, 59, 55, 50, 45, 40];
  const collection = createNoteCollection('C', 'scale', 'major');
  const shapes = cagedShapes({ tuning, collection });
  assert.deepEqual(shapes.map((s) => s.id), ['C', 'A', 'G', 'E', 'D']);
  for (const [id, lo, hi] of [['caged-3', 3, 4], ['caged-6', 8, 9]]) {
    for (const shape of shapes) {
      const r = buildExercise(id, { tuning, root: 'C', quality: 'major', shape: shape.id });
      assert.ok(r.beats.length > 0, `${id} ${shape.id}`);
      for (const b of r.beats) {
        const [a, c] = b.notes.map((n) => n.midi).sort((x, y) => x - y);
        assert.ok((c - a) % 12 >= lo % 12 && (c - a) % 12 <= hi % 12, `${id} ${c - a}`);
        assert.ok(b.notes.every((n) => n.f >= Math.max(0, shape.from - 1) && n.f <= shape.to + 2));
        assert.ok(Math.abs(b.notes[0].f - b.notes[b.notes.length - 1].f) <= 5);
        assert.ok(b.notes.every((n) => collection.noteByPc.has(n.midi % 12)));
      }
    }
  }
});
