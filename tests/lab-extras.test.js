import test from 'node:test';
import assert from 'node:assert/strict';

import { writeMidi, tabToMidi, tabToNotes, backingToMidi, tabToMusicXML } from '../lab/js/core/midi.js';
import { createTab, setCell } from '../lab/js/core/tab.js';
import { reviewCard, isDue, dueWeight, dueCount, INTERVAL_DAYS } from '../lab/js/core/srs.js';
import { buildRoutine } from '../lab/js/core/routine.js';
import { makeQuestion, recordAnswer, emptyStats } from '../lab/js/core/quiz.js';
import {
  emptyPractice, addMinutes, weekMinutes, weeklyGoal, weeksGoalMet, weekStartKey, achieved, daysPracticed,
} from '../lab/js/core/practice.js';
import { resolveProgression } from '../lab/js/core/progressions.js';

const text = (bytes, from, len) => String.fromCharCode(...bytes.slice(from, from + len));

test('MIDI: cabecera y pistas válidas', () => {
  const bytes = writeMidi({ bpm: 120, tracks: [{ name: 'A', channel: 0, program: 25, notes: [{ tick: 0, dur: 480, midi: 60 }, { tick: 480, dur: 480, midi: 64 }] }] });
  assert.equal(text(bytes, 0, 4), 'MThd');
  assert.equal((bytes[10] << 8) | bytes[11], 2, 'dos pistas: tempo + notas');
  assert.equal((bytes[12] << 8) | bytes[13], 480);
  const tracks = [];
  let i = 14;
  while (i < bytes.length) {
    assert.equal(text(bytes, i, 4), 'MTrk');
    const len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7];
    tracks.push(bytes.slice(i + 8, i + 8 + len));
    i += 8 + len;
  }
  assert.equal(i, bytes.length);
  assert.equal(tracks.length, 2);
  for (const t of tracks) assert.deepEqual([...t.slice(-3)], [0xff, 0x2f, 0]);
  // tempo 120 bpm = 500000 µs = 0x07A120
  const tempoAt = tracks[0].findIndex((b, k) => b === 0xff && tracks[0][k + 1] === 0x51);
  assert.deepEqual([...tracks[0].slice(tempoAt + 3, tempoAt + 6)], [0x07, 0xa1, 0x20]);
});

test('Tab → MIDI y MusicXML', () => {
  let tab = createTab({ cols: 4, title: 'Prueba & <riff>' });
  tab = setCell(tab, 5, 0, '5');
  tab = setCell(tab, 4, 1, '7');
  tab = setCell(tab, 0, 2, '12');
  const notes = tabToNotes(tab);
  assert.deepEqual(notes.map((n) => n.midi), [45, 52, 76]);
  assert.equal(notes[1].tick, 240, 'corchea = 240 ticks');
  const mid = tabToMidi(tab);
  assert.equal(text(mid, 0, 4), 'MThd');
  const xml = tabToMusicXML(tab);
  assert.ok(xml.includes('<fret>12</fret>') && xml.includes('<string>1</string>'));
  assert.ok(xml.includes('&amp;') && xml.includes('&lt;riff&gt;'), 'escapa el título');
  assert.equal((xml.match(/<measure /g) ?? []).length, 1);
  assert.ok(xml.includes('<sign>TAB</sign>'));
});

test('Base → MIDI con batería en el canal 10', () => {
  const resolved = resolveProgression('A', [{ s: 0, t: 'm' }, { s: 5, t: 'm' }]);
  for (const [sig, groove] of [['4/4', 'rock'], ['4/4', 'jazz'], ['3/4', 'waltz'], ['6/8', 'six8'], ['12/8', 'blues128']]) {
    const mid = backingToMidi({ resolved, bpm: 100, signature: sig, groove, repeats: 2 });
    assert.equal(text(mid, 0, 4), 'MThd');
    assert.ok(mid.length > 200, `${sig} ${groove}`);
    assert.ok(mid.includes(0x99), 'evento de nota en canal 10');
  }
});

test('repetición espaciada: cajas y prioridad', () => {
  const t0 = 1_000_000_000_000;
  let card = reviewCard(null, true, t0);
  assert.equal(card.box, 1);
  assert.equal(card.due, t0 + INTERVAL_DAYS[1] * 86400000);
  card = reviewCard(card, true, t0);
  card = reviewCard(card, true, t0);
  assert.equal(card.box, 3);
  assert.equal(reviewCard(card, false, t0).box, 0, 'fallar reinicia');
  assert.equal(isDue(card, t0), false);
  assert.equal(isDue(card, t0 + 5 * 86400000), true);
  assert.ok(dueWeight(null, t0) > dueWeight(card, t0));
  assert.ok(dueWeight(card, t0 + 20 * 86400000) > 1);
  assert.equal(dueCount({ a: card, b: reviewCard(null, false, t0 - 86400000 * 2) }, t0), 1);
});

test('quiz: registra tarjetas y prioriza lo vencido', () => {
  let stats = emptyStats();
  const q = makeQuestion({ topics: ['interval'], level: 'beginner', rng: () => 0.2 });
  stats = recordAnswer(stats, q, true, 5000);
  assert.ok(stats.srs[q.statKey]);
  const q2 = makeQuestion({ topics: ['interval', 'fretNote'], level: 'beginner', srs: stats.srs, now: 5000 + 100 * 86400000 });
  assert.ok(q2.statKey);
});

test('rutina: suma exacta, bloques ≥ 3 min y énfasis en teoría con fallos', () => {
  for (const minutes of [10, 15, 30, 45, 60, 90]) {
    const r = buildRoutine({ minutes, rng: () => 0.4 });
    assert.equal(r.blocks.reduce((s, b) => s + b.minutes, 0), minutes, `${minutes} min`);
    assert.ok(r.blocks.every((b) => b.minutes >= 3));
  }
  const base = buildRoutine({ minutes: 60, rng: () => 0.4 }).blocks.find((b) => b.id === 'theory').minutes;
  const weak = buildRoutine({ minutes: 60, weak: [{ key: 'x', rate: 0.2 }], due: 12, rng: () => 0.4 }).blocks.find((b) => b.id === 'theory');
  assert.ok(weak.minutes >= base);
  assert.ok(weak.why.includes('12'));
  const balanced = buildRoutine({ minutes: 60, totals: { jam: 600, backing: 600 }, rng: () => 0.4 }).blocks.find((b) => b.id === 'jam').minutes;
  const none = buildRoutine({ minutes: 60, rng: () => 0.4 }).blocks.find((b) => b.id === 'jam').minutes;
  assert.ok(balanced <= none, 'lo muy practicado pesa menos');
});

test('metas semanales y logros', () => {
  let s = emptyPractice();
  assert.equal(weekStartKey('2026-11-15'), '2026-11-09', 'el domingo pertenece a la semana del lunes anterior');
  s = addMinutes(s, '2026-11-10', 40, 'jam');
  s = addMinutes(s, '2026-11-12', 40, 'quiz');
  assert.equal(weekMinutes(s, '2026-11-14'), 80);
  assert.equal(weeklyGoal(s), 75);
  assert.equal(weeksGoalMet(s), 1);
  assert.equal(daysPracticed(s), 2);
  s = { ...s, weeklyGoal: 200 };
  assert.equal(weeksGoalMet(s), 0);
  const ids = achieved({ ...s, weeklyGoal: 60 }).map((a) => a.id);
  assert.ok(ids.includes('weekly') && ids.includes('jammer') && ids.includes('theory'));
});

test('precache.json está al día con los archivos del Lab (ejecuta npm run precache)', async () => {
  const { readFile } = await import('node:fs/promises');
  const { precacheList } = await import('../scripts/precache.mjs');
  const saved = JSON.parse(await readFile(new URL('../lab/precache.json', import.meta.url), 'utf8'));
  assert.deepEqual(saved, precacheList());
});

test('todas las herramientas se registran con id único y grupo válido', async () => {
  const { TOOLS, GROUPS } = await import('../lab/js/tools/index.js').catch(() => ({ TOOLS: null }));
  if (!TOOLS) return; // los módulos de herramientas necesitan el DOM
  const ids = TOOLS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TOOLS) assert.ok(GROUPS.some((g) => g.id === t.group));
});

test('BackingPlayer.tick recorre todos los grooves y compases sin errores', async () => {
  const { BackingPlayer } = await import('../lab/js/audio/backing.js');
  const { resolveProgression } = await import('../lab/js/core/progressions.js');
  const { groovesFor } = await import('../lab/js/core/rhythm.js');
  const calls = [];
  const engine = new Proxy({ at: (t, fn) => fn() }, { get: (target, key) => target[key] ?? ((...args) => calls.push([key, args])) });
  const resolved = resolveProgression('C', [{ s: 2, t: 'm7' }, { s: 7, t: '7' }, { s: 0, t: 'maj7' }]);
  for (const sig of ['4/4', '3/4', '6/8', '12/8']) {
    for (const groove of Object.keys(groovesFor(sig))) {
      const player = new BackingPlayer(engine);
      const beats = [];
      player.settings = { signature: sig, groove, bpm: 100, resolved, countIn: true, drumsOn: true, bassOn: true, guitarOn: true, synthOn: true, muteCycle: { play: 1, silent: 1 } };
      player.onStep = (info) => beats.push(info);
      for (let step = 0; step < 24 * 9; step += 1) player.tick(step, step * 0.1);
      assert.ok(beats.some((b) => b.chord), `${sig} ${groove}`);
    }
  }
  assert.ok(calls.some(([k]) => k === 'drum') && calls.some(([k]) => k === 'bass'));
});

test('batería: estilo propio, relleno al final de la vuelta y crash; instrumentos apagables', async () => {
  const { BackingPlayer } = await import('../lab/js/audio/backing.js');
  const { resolveProgression } = await import('../lab/js/core/progressions.js');
  const resolved = resolveProgression('A', [{ s: 0, t: 'm' }, { s: 5, t: '' }]);
  const run = (extra, bars = 6) => {
    const calls = [];
    const engine = new Proxy({ at: (t, fn) => fn() }, { get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])) });
    const player = new BackingPlayer(engine);
    player.settings = { signature: '4/4', groove: 'rock', bpm: 100, resolved, countIn: false, drumsOn: true, bassOn: true, guitarOn: true, synthOn: false, ...extra };
    for (let step = 0; step < 16 * bars; step += 1) player.tick(step, step * 0.1);
    return calls;
  };
  const base = run({});
  assert.ok(!base.some((c) => c[0] === 'drum' && c[1] === 'crash'));
  const fill = run({ drumFill: true });
  assert.ok(fill.some((c) => c[0] === 'drum' && c[1] === 'crash'), 'crash al empezar la vuelta');
  assert.ok(fill.filter((c) => c[0] === 'drum' && c[1] === 'tom').length > base.filter((c) => c[0] === 'drum' && c[1] === 'tom').length, 'relleno con toms');
  const funk = run({ drumStyle: 'funk' }).filter((c) => c[0] === 'drum').length;
  assert.notEqual(funk, base.filter((c) => c[0] === 'drum').length, 'otro estilo de batería, otro patrón');
  assert.ok(run({ drumsOn: false }).every((c) => c[0] !== 'drum'));
  assert.ok(run({ bassOn: false }).every((c) => c[0] !== 'bass'));
  assert.ok(run({ guitarOn: false }).every((c) => c[0] !== 'strum' && c[0] !== 'pluck'));
});

test('tono de guitarra: «suave» tiene menos agudos que «limpio» y «brillante», sin cambiar la afinación', async () => {
  const { synthPluck, PLUCK_TONES } = await import('../lab/js/audio/pluck.js');
  assert.deepEqual(PLUCK_TONES.map((t) => t.value), ['soft', 'clean', 'warm', 'bright']);
  // energía de la señal diferenciada = brillo (más agudos → más cambio muestra a muestra)
  const brightness = (tone) => {
    const x = synthPluck(44100, 64, tone).slice(0, 8000);
    let diff = 0;
    let total = 0;
    for (let i = 1; i < x.length; i += 1) { diff += (x[i] - x[i - 1]) ** 2; total += x[i] ** 2; }
    return diff / total;
  };
  assert.ok(brightness('soft') < brightness('clean'));
  assert.ok(brightness('clean') < brightness('bright'));
});
