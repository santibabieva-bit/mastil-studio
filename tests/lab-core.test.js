import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TUNINGS, collectBoardNotes, createNoteCollection, degreeLabel, midiToFreq, makeRng, keySignature, pcName,
} from '../lab/js/core/music.js';
import {
  parseChordSymbol, detectChords, diatonicChords, findKeys, transposeSymbol, capoOptions,
  chordShapes, bestShape, shapeMidis, stringSetVoicings, chordPcs, chordNoteNames,
} from '../lab/js/core/chords.js';
import { ladderPerString, ladderBox, buildSequence, PATTERNS, sequenceToAscii } from '../lab/js/core/exercises.js';
import {
  generateRhythm, rhythmEvents, speedAtBar, isBarAudible, bpmFromTaps, swingOffset, cycleStep, STRUM_PRESETS,
} from '../lab/js/core/rhythm.js';
import { randomProgression, resolveProgression, PROGRESSION_PRESETS, chordChoices } from '../lab/js/core/progressions.js';
import { makeQuestion, checkAnswer, recordAnswer, emptyStats, weakSpots, LEVELS, QUIZ_TOPICS } from '../lab/js/core/quiz.js';
import { earQuestion } from '../lab/js/core/ear.js';
import {
  emptyPractice, addMinutes, currentStreak, longestStreak, weekGrid, achieved, dateKey,
} from '../lab/js/core/practice.js';
import {
  createTab, setCell, tabEvents, tabToAscii, asciiToTab, parseCell, tabFromSequence,
} from '../lab/js/core/tab.js';
import { detectPitch, nearestNote, nearestString } from '../lab/js/core/pitch.js';
import { parseHash, buildHash, createStorage } from '../lab/js/core/state.js';

const STD = TUNINGS.standard.midi;

test('colección y etiquetas de grado', () => {
  const c = createNoteCollection('A', 'scale', 'major');
  const notes = collectBoardNotes({ tuning: STD, collection: c, fromFret: 0, toFret: 12 });
  assert.ok(notes.length > 30);
  const root = notes.find((n) => n.isRoot && n.s === 5 && n.f === 5);
  assert.ok(root, 'A en cuerda 6 traste 5');
  assert.equal(root.degree, '1');
  const lydian = createNoteCollection('C', 'scale', 'lydian');
  const f = lydian.notes.find((n) => n.name === 'F♯');
  assert.equal(degreeLabel(f, lydian), '♯4');
  const dim = createNoteCollection('C', 'arpeggio', 'dominant7');
  assert.equal(degreeLabel(dim.notes[3], dim), '♭7');
});

test('frecuencias y armaduras', () => {
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
  assert.deepEqual([keySignature('D').sharps, keySignature('F').flats], [2, 1]);
  assert.equal(pcName(1, 'flat'), 'D♭');
});

test('símbolos de acorde', () => {
  const m = parseChordSymbol('F#m7b5');
  assert.equal(m.rootPc, 6);
  assert.equal(m.typeId, 'm7b5');
  assert.equal(parseChordSymbol('Sol').rootPc, 7);
  assert.equal(parseChordSymbol('Bb/D').bassPc, 2);
  assert.equal(parseChordSymbol('Cmaj7').typeId, 'maj7');
  assert.equal(parseChordSymbol('Am').typeId, 'm');
  assert.equal(parseChordSymbol('zzz'), null);
  assert.equal(transposeSymbol('C', 2), 'D');
  assert.equal(transposeSymbol('Am7', 3, 'flat'), 'Cm7');
});

test('detección de acordes', () => {
  const am = detectChords([9, 0, 4], 9);
  assert.equal(am[0].symbol, 'Am');
  const c6 = detectChords([0, 4, 7], 4);
  assert.equal(c6[0].symbol, 'C/E');
  assert.ok(detectChords([0, 4, 7, 10], 0).some((c) => c.symbol === 'C7'));
});

test('acordes diatónicos y tonalidad', () => {
  const c = diatonicChords('C', 'major');
  assert.deepEqual(c.map((x) => x.symbol), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  assert.deepEqual(c.map((x) => x.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  const s = diatonicChords('C', 'major', true);
  assert.equal(s[0].symbol, 'Cmaj7');
  assert.equal(s[4].symbol, 'G7');
  assert.equal(s[6].symbol, 'Bm7♭5');
  const d = diatonicChords('A', 'dorian');
  assert.equal(d[3].roman, 'IV');
  const keys = findKeys(['C', 'Am', 'F', 'G']);
  assert.equal(keys[0].rootName, 'C');
  assert.equal(findKeys(['Em', 'C', 'G', 'D'])[0].total, 4);
  const jazz = findKeys(['Dm7', 'G7', 'Cmaj7']);
  assert.equal(jazz[0].rootName, 'C');
});

test('formas y voicings', () => {
  const cShapes = chordShapes(0, 'maj');
  assert.deepEqual(cShapes[0].frets, [-1, 3, 2, 0, 1, 0]);
  const f = chordShapes(5, 'maj');
  assert.ok(f.some((s) => s.frets.join() === '1,3,3,2,1,1'));
  const best = bestShape(9, 'm');
  assert.deepEqual(shapeMidis(best.frets), [45, 52, 57, 60, 64]);
  const pcs = chordPcs(0, 'maj');
  const voicings = stringSetVoicings({ tuning: STD, pcs, rootPc: 0 });
  assert.ok(voicings.length > 10);
  assert.ok(voicings.every((v) => v.notes.length === 3 && new Set(v.notes.map((n) => n.pc)).size === 3));
  assert.deepEqual(chordNoteNames('Bb', 'maj'), ['B♭', 'D', 'F']);
});

test('cejilla', () => {
  const opts = capoOptions(['Bb', 'Gm', 'Eb', 'F']);
  const best = opts[0];
  assert.equal(best.capo, 3);
  assert.deepEqual(best.shapes.map((s) => s.symbol), ['G', 'Em', 'C', 'D']);
});

test('escaleras 3NPS y secuencias', () => {
  const c = createNoteCollection('A', 'scale', 'major');
  for (let p = 0; p < 7; p += 1) {
    const { ladder } = ladderPerString({ tuning: STD, collection: c, position: p });
    assert.equal(ladder.length, 18, `posición ${p}`);
    assert.ok(ladder.every((n, i) => i === 0 || n.midi > ladder[i - 1].midi));
    assert.ok(ladder.every((n) => n.f >= 0 && n.f <= 24));
  }
  const pent = createNoteCollection('A', 'scale', 'pentatonicMinor');
  assert.equal(ladderPerString({ tuning: STD, collection: pent }).ladder.length, 12);
  const box = ladderBox({ tuning: STD, collection: c, startFret: 4, span: 5 }).ladder;
  assert.ok(box.length >= 10);
  const lad = ladderPerString({ tuning: STD, collection: c }).ladder;
  for (const id of Object.keys(PATTERNS)) {
    for (const dir of ['up', 'down', 'updown']) {
      const seq = buildSequence(lad, id, dir);
      assert.ok(seq.length > 4, `${id}/${dir}`);
    }
  }
  const seq = buildSequence(lad, 'straight', 'updown');
  assert.equal(seq.length, lad.length * 2 - 1);
  assert.match(sequenceToAscii(seq.slice(0, 4)), /E \|\d/);
});

test('ritmo, rasgueo y metrónomo', () => {
  const rng = makeRng(7);
  const r = generateRhythm({ signature: '4/4', bars: 2, level: 'hard', rests: true, rng });
  assert.equal(r.bars.length, 2);
  assert.equal(r.bars[0].steps.length, 16);
  assert.equal(r.bars[0].steps[0], 1);
  const { events, total } = rhythmEvents(r);
  assert.equal(total, 32);
  assert.ok(events.every((e) => e.dur >= 1));
  assert.equal(generateRhythm({ signature: '6/8', bars: 1 }).bars[0].steps.length, 12);
  assert.equal(speedAtBar({ start: 80, target: 100, step: 5, every: 2, bar: 5 }), 90);
  assert.equal(speedAtBar({ start: 80, target: 100, step: 5, every: 1, bar: 40 }), 100);
  assert.equal(isBarAudible({ play: 2, silent: 1, bar: 2 }), false);
  assert.equal(isBarAudible({ play: 2, silent: 1, bar: 3 }), true);
  assert.equal(bpmFromTaps([0, 500, 1000, 1500]), 120);
  assert.equal(swingOffset(2, 0.66) > 0.6, true);
  assert.equal(swingOffset(1, 0.66), 0);
  assert.equal(cycleStep(3), 0);
  assert.ok(Object.values(STRUM_PRESETS).every((p) => p.pattern.length === p.steps));
});

test('progresiones', () => {
  const pop = PROGRESSION_PRESETS.major[0];
  assert.deepEqual(resolveProgression('G', pop.chords).map((c) => c.symbol), ['G', 'D', 'Em', 'C']);
  const blues = resolveProgression('A', PROGRESSION_PRESETS.major.find((p) => p.id === 'blues12').chords);
  assert.equal(blues.length, 12);
  assert.equal(blues[4].symbol, 'D7');
  for (let level = 1; level <= 5; level += 1) {
    const prog = randomProgression({ mode: 'major', complexity: level, length: 4, outside: true, rng: makeRng(level) });
    assert.equal(prog.length, 4);
  }
  assert.ok(chordChoices('C', 'major').length >= 14);
});

test('quiz', () => {
  const rng = makeRng(42);
  for (const level of Object.keys(LEVELS)) {
    for (const topic of Object.keys(QUIZ_TOPICS)) {
      for (let i = 0; i < 25; i += 1) {
        const q = makeQuestion({ topics: [topic], level, rng });
        assert.ok(q.prompt && q.statKey, `${topic}/${level}`);
        if (q.kind === 'choice') {
          assert.ok(q.options.length >= 3);
          assert.ok(q.options.some((o) => String(o.value) === String(q.answer)), `${topic}: respuesta en opciones (${q.prompt})`);
          assert.ok(checkAnswer(q, q.answer));
        } else {
          assert.ok(checkAnswer(q, q.answer));
          assert.ok(q.answer.f >= 0 && q.answer.f <= 11);
        }
      }
    }
  }
  let stats = emptyStats();
  const q = makeQuestion({ topics: ['interval'], rng });
  stats = recordAnswer(stats, q, false);
  stats = recordAnswer(stats, q, false);
  assert.equal(weakSpots(stats).length, 1);
});

test('oído', () => {
  const rng = makeRng(3);
  const q = earQuestion({ mode: 'interval', set: 'basic', direction: 'up', rng });
  assert.equal(q.midis[1] - q.midis[0], q.answer);
  const c = earQuestion({ mode: 'chord', set: 'sevenths', inversions: true, rng });
  assert.ok(c.midis.length === 4);
  assert.ok(c.options.some((o) => o.value === c.answer));
});

test('registro de práctica', () => {
  let s = emptyPractice();
  s = addMinutes(s, '2026-11-10', 20, 'metro');
  s = addMinutes(s, '2026-11-11', 5);
  s = addMinutes(s, '2026-11-12', 30);
  s = addMinutes(s, '2026-11-14', 10);
  assert.equal(currentStreak(s, '2026-11-12'), 3);
  assert.equal(currentStreak(s, '2026-11-13'), 3);
  assert.equal(currentStreak(s, '2026-11-15'), 1);
  assert.equal(longestStreak(s), 3);
  const grid = weekGrid(s, '2026-11-15', 4);
  assert.equal(grid.length, 4);
  assert.equal(grid[3].length, 7);
  assert.ok(achieved(s).some((m) => m.id === 'streak3'));
  assert.match(dateKey(new Date(2026, 0, 5)), /^2026-01-05$/);
});

test('tab: celdas, ASCII e importación', () => {
  let tab = createTab({ cols: 4 });
  tab = setCell(tab, 0, 0, '5h7');
  tab = setCell(tab, 0, 1, '7');
  tab = setCell(tab, 2, 2, '12~');
  assert.equal(parseCell('5h').link, true);
  assert.equal(parseCell('12~').vibrato, true);
  assert.equal(parseCell('x').mute, true);
  assert.equal(parseCell('abc'), null);
  const ev = tabEvents(tab);
  assert.equal(ev[1].notes[0].legato, false); // 5h7 no es «5h» puro
  tab = setCell(tab, 0, 0, '5h');
  assert.equal(tabEvents(tab)[1].notes[0].legato, true);
  const ascii = tabToAscii(tab);
  assert.match(ascii, /^e \|5h-7-/);
  const back = asciiToTab(ascii);
  assert.equal(back.strings, 6);
  assert.equal(back.cells[0][0], '5h');
  assert.equal(back.cells[2].find((c) => c), '12~');
  const t2 = tabFromSequence([{ s: 5, f: 5 }, { s: 5, f: 7 }]);
  assert.equal(t2.cells[5][1], '7');
});

test('detección de altura', () => {
  const sr = 44100;
  for (const f of [82.41, 110, 196, 329.63, 440]) {
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i += 1) {
      buf[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr) + 0.25 * Math.sin((4 * Math.PI * f * i) / sr);
    }
    const got = detectPitch(buf, sr);
    assert.ok(got && Math.abs(got - f) / f < 0.01, `${f} → ${got}`);
  }
  assert.equal(detectPitch(new Float32Array(2048), sr), null);
  const n = nearestNote(440 * 2 ** (10 / 1200));
  assert.equal(n.name, 'A');
  assert.equal(n.cents, 10);
  const str = nearestString(110.5, STD);
  assert.equal(str.index, 4);
});

test('estado en URL y almacenamiento', () => {
  assert.deepEqual(parseHash('#/navigator?root=A&q=minor'), { tool: 'navigator', params: { root: 'A', q: 'minor' } });
  assert.equal(buildHash('metronome', { bpm: 90, a: '', b: undefined }), '#/metronome?bpm=90');
  const mem = new Map();
  const st = createStorage({
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  });
  st.set('x', { a: 1 });
  assert.deepEqual(st.get('x'), { a: 1 });
  assert.equal(st.get('nada', 5), 5);
});

test('síntesis Karplus-Strong afinada y detectable', async () => {
  const { synthPluck } = await import('../lab/js/audio/pluck.js');
  const { midiToFreq: m2f } = await import('../lab/js/core/music.js');
  for (const midi of [40, 45, 52, 59, 64, 76]) {
    const data = synthPluck(44100, midi);
    const f = detectPitch(data.slice(2000, 6096), 44100, { minFreq: 40, maxFreq: 2000 });
    assert.ok(f, `midi ${midi} detectable`);
    const cents = 1200 * Math.log2(f / m2f(midi));
    assert.ok(Math.abs(cents) < 8, `midi ${midi}: ${cents.toFixed(1)} cents`);
    assert.ok(data.reduce((m, v) => Math.max(m, v), 0) <= 0.91);
  }
});

test('reproductores: voicings de acompañamiento y afinación de tab', async () => {
  const { bassMidi, padMidis, guitarMidis, walkingBass } = await import('../lab/js/audio/backing.js');
  const { tabTuning } = await import('../lab/js/audio/tabplayer.js');
  const { generateRiff, randomChallenge } = await import('../lab/js/core/riff.js');
  assert.equal(bassMidi(9), 33); // A1
  assert.equal(bassMidi(4), 28); // E1
  assert.ok(bassMidi(3) >= 28 && bassMidi(3) < 40);
  assert.deepEqual(padMidis(0, 'maj').map((m) => m % 12).sort((a, b) => a - b), [0, 4, 7]);
  assert.ok(padMidis(0, 'maj7').every((m) => m >= 55 && m < 67));
  assert.deepEqual(guitarMidis(9, 'm'), [45, 52, 57, 60, 64]);
  assert.equal(walkingBass(0, '7', 1), bassMidi(0) + 4);
  assert.equal(tabTuning(createTab({ strings: 4 })).length, 4);
  assert.equal(tabTuning(createTab({ strings: 6 }))[0], 64);

  const col = createNoteCollection('A', 'scale', 'pentatonicMinor');
  for (let i = 0; i < 20; i += 1) {
    const rng = makeRng(i + 1);
    const tab = generateRiff({ tuning: STD, collection: col, length: 16, techniques: ['legato', 'slides', 'bends', 'vibrato'], rng });
    const filled = tab.cells.flat().filter(Boolean);
    assert.ok(filled.length >= 6, `riff ${i}`);
    assert.ok(tab.cells.flat().every((c) => c === '' || parseCell(c)), `celdas válidas riff ${i}: ${tab.cells.flat().filter((c) => c && !parseCell(c))}`);
    // como mucho una nota por columna
    for (let c = 0; c < 16; c += 1) assert.ok(tab.cells.filter((row) => row[c]).length <= 1);
  }
  assert.ok(randomChallenge(makeRng(2)).text.length > 10);
});

test('cada tipo de acorde sugerido tiene forma o se declara sin forma', () => {
  for (const type of ['maj', 'm', '7', 'm7', 'maj7', 'sus4', 'dim']) {
    for (let pc = 0; pc < 12; pc += 1) {
      const shape = bestShape(pc, type);
      assert.ok(shape.frets.length === 6, `${pc} ${type}`);
      const midis = shapeMidis(shape.frets);
      const pcs = new Set(midis.map((m) => m % 12));
      // todas las notas tocadas pertenecen al acorde
      const allowed = new Set(chordPcs(pc, type));
      for (const x of pcs) assert.ok(allowed.has(x), `forma de ${pc} ${type} contiene nota ajena ${x}`);
      assert.ok(midis.length >= 3, `${pc} ${type} tiene al menos 3 notas`);
    }
  }
});
