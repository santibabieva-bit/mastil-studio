import test from 'node:test';
import assert from 'node:assert/strict';

import { TUNINGS } from '../lab/js/core/music.js';
import {
  detectOnsets, gridDeviations, timingStats, timingScore, timingVerdict, calibrationLatency,
} from '../lab/js/core/timing.js';
import {
  newLadder, submitRep, burstPlan, recordClean, bestSeries, topRecords, isPlateau,
} from '../lab/js/core/speed.js';
import {
  DRILL_LIST, buildDrill, assignPicking, permutations24, fretFor, eventMidi,
} from '../lab/js/core/drills.js';
import { analyzeBend, analyzeVibrato, centsBetween } from '../lab/js/core/bend.js';
import {
  BUILTIN_LICKS, parseLick, lickToText, transposeLick, lickInAllKeys, circleOfFifths, matchLick, collapseNotes,
} from '../lab/js/core/licks.js';
import { chromagram, chordsFromChroma } from '../lab/js/core/chroma.js';
import { blindQuestion, checkBlind, summarize } from '../lab/js/core/blind.js';
import { skillRadar, nextFocus } from '../lab/js/core/skills.js';

const STD = TUNINGS.standard.midi;
const SR = 44100;

/** Señal con «notas» (senoide con caída exponencial) en los tiempos indicados. */
function clicks(times, seconds, { freq = 220, decay = 18 } = {}) {
  const x = new Float32Array(Math.floor(seconds * SR));
  // Ruido de fondo muy bajo.
  let seed = 7;
  for (let i = 0; i < x.length; i += 1) { seed = (seed * 16807) % 2147483647; x[i] = ((seed / 2147483647) - 0.5) * 0.002; }
  for (const t of times) {
    const start = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.25 && start + i < x.length; i += 1) {
      x[start + i] += 0.6 * Math.exp(-decay * (i / SR)) * Math.sin(2 * Math.PI * freq * (i / SR));
    }
  }
  return x;
}

/* ───────── timing ───────── */

test('detectOnsets encuentra cada ataque con error menor de 6 ms', () => {
  const truth = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  const onsets = detectOnsets(clicks(truth, 4), SR);
  assert.equal(onsets.length, truth.length);
  onsets.forEach((o, i) => assert.ok(Math.abs(o - truth[i]) < 0.006, `${o} vs ${truth[i]}`));
});

test('detectOnsets ignora el silencio', () => {
  assert.deepEqual(detectOnsets(new Float32Array(SR * 2), SR), []);
});

test('detectOnsets no duplica ataques separados menos que el hueco mínimo', () => {
  const onsets = detectOnsets(clicks([0.5, 0.53], 2), SR, { minGapMs: 70 });
  assert.equal(onsets.length, 1);
});

test('gridDeviations y timingStats miden adelantos y retrasos', () => {
  // 120 bpm: pulso cada 0,5 s. Notas siempre 18 ms tarde.
  const onsets = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1 + i * 0.5 + 0.018);
  const devs = gridDeviations({ onsets, t0: 1, bpm: 120, perBeat: 1, count: 8 });
  assert.equal(devs.length, 8);
  devs.forEach((d) => assert.ok(Math.abs(d.dev - 18) < 1e-6));
  const stats = timingStats(devs, { expected: 8 });
  assert.ok(Math.abs(stats.mean - 18) < 1e-6);
  assert.ok(stats.sd < 1e-6);
  assert.match(stats.tendency, /retrasarte/);
  assert.equal(stats.within20, 1);
  // La latencia compensa el sesgo.
  const comp = gridDeviations({ onsets, t0: 1, bpm: 120, latencyMs: 18, count: 8 });
  assert.ok(comp.every((d) => Math.abs(d.dev) < 1e-6));
  assert.equal(calibrationLatency(devs), 18);
});

test('timingStats detecta aceleración (drift) y puntúa por dispersión', () => {
  const rushing = Array.from({ length: 16 }, (_, i) => -i * 3);
  assert.match(timingStats(rushing).tendency, /acelerando/);
  const tight = timingStats(Array.from({ length: 16 }, (_, i) => (i % 2 ? 3 : -3)));
  const loose = timingStats(Array.from({ length: 16 }, (_, i) => (i % 2 ? 45 : -45)));
  assert.ok(tight.score > loose.score + 40);
  assert.ok(timingScore({ sd: 0, mean: 0, coverage: 1 }) >= 99);
  assert.ok(timingScore({ sd: 50, mean: 20, coverage: 1 }) < 10);
  assert.match(timingVerdict(tight), /metr|sólido/i);
  assert.equal(timingStats([]).n, 0);
});

test('el histograma cubre todas las desviaciones', () => {
  const stats = timingStats([-100, -30, -5, 5, 30, 100]);
  assert.equal(stats.hist.reduce((a, b) => a + b.count, 0), 6);
});

/* ───────── escalera de velocidad ───────── */

test('la escalera sube sólo tras N repeticiones limpias seguidas', () => {
  let l = newLadder({ start: 60, target: 70, step: 5, reps: 3 });
  for (const [clean, event, bpm] of [[true, 'hold', 60], [true, 'hold', 60], [false, 'retry', 60], [true, 'hold', 60], [true, 'hold', 60], [true, 'up', 65]]) {
    const r = submitRep(l, clean);
    l = r.ladder;
    assert.equal(r.event, event);
    assert.equal(l.bpm, bpm);
  }
});

test('tres fallos seguidos bajan el tempo un 10 % (estancamiento)', () => {
  let l = { ...newLadder({ start: 60, target: 200, step: 5, reps: 1 }), bpm: 100 };
  let last;
  for (let i = 0; i < 3; i += 1) { last = submitRep(l, false); l = last.ladder; }
  assert.equal(last.event, 'drop');
  assert.equal(l.bpm, 90);
  assert.equal(l.plateau, true);
});

test('la escalera termina al alcanzar el objetivo y nunca baja del inicio', () => {
  let l = newLadder({ start: 60, target: 60, step: 5, reps: 1 });
  assert.equal(submitRep(l, true).event, 'done');
  l = { ...newLadder({ start: 60, target: 100 }), bpm: 62 };
  for (let i = 0; i < 3; i += 1) l = submitRep(l, false).ladder;
  assert.equal(l.bpm, 60);
});

test('burstPlan alterna lento y rápido y termina en el tempo', () => {
  const plan = burstPlan({ bpm: 100, step: 8, rounds: 2 });
  assert.deepEqual(plan.map((p) => p.bpm), [70, 108, 70, 108, 100]);
});

test('el historial guarda récords, serie y estancamiento', () => {
  let h = {};
  let r = recordClean(h, 'alt', 80, '2026-11-01'); h = r.history; assert.equal(r.isRecord, true);
  r = recordClean(h, 'alt', 70, '2026-11-02'); h = r.history; assert.equal(r.isRecord, false);
  r = recordClean(h, 'alt', 90, '2026-11-03'); h = r.history; assert.equal(r.isRecord, true);
  r = recordClean(h, 'legato', 120, '2026-11-03'); h = r.history;
  assert.deepEqual(bestSeries(h, 'alt').map((p) => p.best), [80, 80, 90]);
  assert.deepEqual(topRecords(h, 1), [{ id: 'legato', best: 120, date: '2026-11-03' }]);
  r = recordClean(h, 'alt', 85, '2026-11-20'); h = r.history;
  assert.equal(isPlateau(h, 'alt', '2026-11-20'), true);
  assert.equal(isPlateau(h, 'legato', '2026-11-04'), false);
});

/* ───────── drills ───────── */

test('hay 24 permutaciones distintas de los dedos', () => {
  const perms = permutations24();
  assert.equal(perms.length, 24);
  assert.equal(new Set(perms.map((p) => p.join(''))).size, 24);
});

test('assignPicking alternado y economy', () => {
  const alt = assignPicking([{ s: 0, f: 1 }, { s: 0, f: 2 }, { s: 1, f: 1 }, { s: 1, f: 2 }], 'alternate');
  assert.deepEqual(alt.map((e) => e.pick), ['D', 'U', 'D', 'U']);
  // Economy: bajando de cuerda (s crece) tras un golpe abajo mantiene «abajo».
  const eco = assignPicking([{ s: 0, f: 1 }, { s: 0, f: 2 }, { s: 0, f: 3 }, { s: 1, f: 1 }], 'economy');
  assert.deepEqual(eco.map((e) => e.pick), ['D', 'U', 'D', 'D']);
  // Las ligadas no llevan púa.
  const leg = assignPicking([{ s: 0, f: 1 }, { s: 0, f: 2, art: 'H' }], 'alternate');
  assert.equal(leg[1].pick, null);
});

test('todos los drills se construyen con notas válidas en el mástil', () => {
  for (const d of DRILL_LIST) {
    const { events } = buildDrill(d.id, { tuning: STD, root: 9, startFret: 5 });
    assert.ok(events.length >= 8, d.id);
    for (const e of events) {
      assert.ok(e.s >= 0 && e.s < 6, `${d.id}: cuerda ${e.s}`);
      assert.ok(e.f >= 0 && e.f <= 19, `${d.id}: traste ${e.f}`);
      assert.ok(Number.isFinite(eventMidi(STD, e)));
    }
  }
});

test('los drills funcionan en otras tonalidades y afinaciones de 7 cuerdas', () => {
  for (const root of [0, 3, 6, 11]) {
    for (const d of DRILL_LIST) {
      const { events } = buildDrill(d.id, { tuning: STD, root });
      assert.ok(events.every((e) => e.f >= 0 && e.f <= 19), `${d.id} raíz ${root}`);
    }
  }
  assert.equal(fretFor(STD, 5, 9, 0), 5);
});

test('independencia: cada variante da una permutación distinta', () => {
  const seen = new Set();
  for (let v = 0; v < 24; v += 1) {
    const { events } = buildDrill('independence', { tuning: STD, variant: v, startFret: 5 });
    seen.add(events.slice(0, 4).map((e) => e.f).join(','));
  }
  assert.equal(seen.size, 24);
});

test('el sweep sube con púa abajo y baja con púa arriba', () => {
  const { events } = buildDrill('sweep', { tuning: STD, root: 9, quality: 'm' });
  assert.ok(events.length >= 5);
  const peak = events.findIndex((e) => e.pick === 'U');
  assert.ok(peak > 1);
  assert.ok(events.slice(0, peak).every((e) => e.pick === 'D'));
});

/* ───────── bends y vibrato ───────── */

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function track(fn, seconds = 2, step = 0.02) {
  const out = [];
  for (let t = 0; t <= seconds; t += step) out.push({ t, freq: fn(t) });
  return out;
}

test('analyzeBend: bend afinado, corto y pasado', () => {
  const target = hz(72);
  const start = hz(70);
  const good = analyzeBend(track((t) => (t < 0.4 ? start * 2 ** ((t / 0.4) * 2 / 12) : target)), { startFreq: start, targetFreq: target });
  assert.equal(good.reached, true);
  assert.ok(Math.abs(good.finalCents) < 10);
  const short = analyzeBend(track((t) => (t < 0.4 ? start * 2 ** ((t / 0.4) * 1 / 12) : start * 2 ** (1 / 12))), { startFreq: start, targetFreq: target });
  assert.equal(short.reached, false);
  assert.match(short.verdict, /corto/);
  const over = analyzeBend(track((t) => start * 2 ** (3 / 12)), { startFreq: start, targetFreq: target });
  assert.match(over.verdict, /pasas/);
  assert.equal(analyzeBend([], { startFreq: start, targetFreq: target }).reached, false);
});

test('analyzeVibrato mide velocidad y amplitud', () => {
  const base = hz(69);
  const v = analyzeVibrato(track((t) => base * 2 ** ((40 * Math.sin(2 * Math.PI * 6 * t)) / 1200), 2, 0.01));
  assert.equal(v.ok, true);
  assert.ok(Math.abs(v.rate - 6) < 0.6, `rate ${v.rate}`);
  assert.ok(Math.abs(v.width - 40) < 12, `width ${v.width}`);
  assert.ok(v.regularity > 70);
  const flat = analyzeVibrato(track(() => base, 2, 0.01));
  assert.equal(flat.ok, false);
  assert.ok(Math.abs(centsBetween(hz(70), hz(69)) - 100) < 1e-6);
});

/* ───────── licks ───────── */

test('parseLick y lickToText son inversos', () => {
  assert.deepEqual(parseLick('1:5 2:7, 3:5'), [[0, 5], [1, 7], [2, 5]]);
  assert.equal(parseLick('hola'), null);
  assert.equal(lickToText([[0, 5], [1, 7]]), '1:5 2:7');
});

test('transposeLick mueve la tónica y mantiene las notas en el mástil', () => {
  const lick = BUILTIN_LICKS[0];
  for (let semis = 0; semis < 12; semis += 1) {
    const t = transposeLick(lick, semis);
    assert.ok(t, `semitonos ${semis}`);
    assert.equal(t.rootPc, (9 + semis) % 12);
    for (const [, f] of t.notes) assert.ok(f >= 0 && f <= 17);
    // Las alturas se desplazan exactamente `shift` semitonos.
    t.notes.forEach(([s, f], i) => assert.equal(STD[s] + f, STD[lick.notes[i][0]] + lick.notes[i][1] + t.shift));
    assert.ok((t.shift - semis) % 12 === 0);
  }
});

test('lickInAllKeys recorre el círculo de quintas', () => {
  assert.deepEqual(circleOfFifths(0).slice(0, 4), [0, 7, 2, 9]);
  const keys = lickInAllKeys(BUILTIN_LICKS[1]);
  assert.equal(keys.length, 12);
  assert.equal(new Set(keys.map((k) => k.rootPc)).size, 12);
  assert.ok(keys.every((k) => k.lick));
});

test('matchLick y collapseNotes', () => {
  assert.deepEqual(matchLick([60, 62, 99, 64], [60, 62, 64]), { hits: 3, total: 3, ratio: 1 });
  assert.equal(matchLick([60, 64], [60, 62, 64]).hits, 2);
  assert.equal(matchLick([], [60]).ratio, 0);
  assert.deepEqual(collapseNotes([60, 60, 60, null, 62, 62, 62, 62, 64], 3), [60, 62]);
});

/* ───────── transcripción asistida ───────── */

function chordSignal(midis, seconds = 1) {
  const x = new Float32Array(SR * seconds);
  for (const m of midis) {
    const f = hz(m);
    for (let i = 0; i < x.length; i += 1) x[i] += 0.2 * Math.sin(2 * Math.PI * f * (i / SR));
  }
  return x;
}

test('chordsFromChroma reconoce un acorde mayor y uno menor', () => {
  const am = chordsFromChroma(chromagram(chordSignal([57, 60, 64, 69]), SR))[0];
  assert.equal(am.name, 'Am');
  const g = chordsFromChroma(chromagram(chordSignal([55, 59, 62, 67]), SR))[0];
  assert.equal(g.name, 'G');
  const e7 = chordsFromChroma(chromagram(chordSignal([52, 56, 59, 62]), SR))[0];
  assert.equal(e7.name, 'E7');
});

/* ───────── a ciegas y radar ───────── */

test('blindQuestion y checkBlind', () => {
  let n = 0;
  const rng = () => [0.0, 0.5][n++ % 2];
  const q = blindQuestion({ tuning: STD, rng, strings: [0, 1, 2], maxFret: 10 });
  assert.equal(q.s, 0);
  assert.equal(q.f, 5);
  assert.equal(q.midi, 69);
  assert.equal(checkBlind(69, q), 'exact');
  assert.equal(checkBlind(57, q), 'octave');
  assert.equal(checkBlind(60, q), 'wrong');
  assert.deepEqual(summarize([{ ok: true, ms: 1000 }, { ok: false, ms: 0 }, { ok: true, ms: 2000 }]), { ok: 2, total: 3, avgMs: 1500 });
});

test('skillRadar sólo puntúa lo medido y nextFocus pide lo que falta', () => {
  const empty = skillRadar({});
  assert.ok(empty.every((a) => a.value == null || a.id === 'consistency'));
  assert.equal(nextFocus(empty).reason, 'Aún no hay datos');
  const full = skillRadar({
    timing: [{ score: 80 }], pitch: [{ score: 60 }], quiz: { total: { right: 90, wrong: 10 } }, speed: { a: { best: 120 } }, practice: null,
  });
  const by = Object.fromEntries(full.map((a) => [a.id, a.value]));
  assert.equal(by.timing, 80);
  assert.equal(by.theory, 90);
  assert.equal(by.speed, 75);
  assert.equal(nextFocus(full.map((a) => ({ ...a, value: a.value ?? 95 }))).id, 'pitch');
});

test('bendScore y vibratoScore premian precisión y regularidad', async () => {
  const { bendScore, vibratoScore } = await import('../lab/js/core/bend.js');
  assert.ok(bendScore({ reached: true, finalCents: 3, stability: 4 }) > 85);
  assert.ok(bendScore({ reached: false, finalCents: -60, stability: 4 }) <= 45);
  assert.equal(bendScore({}), 0);
  assert.ok(vibratoScore({ ok: true, rate: 6, width: 40, regularity: 90 }) > 90);
  assert.ok(vibratoScore({ ok: true, rate: 3, width: 40, regularity: 90 }) < 70);
  assert.equal(vibratoScore({ ok: false }), 0);
});

test('las pistas del EQ existen, pesan poco y están acreditadas (CC0)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const dir = new URL('../lab/assets/eq/', import.meta.url);
  const credits = readFileSync(new URL('CREDITOS.md', dir), 'utf8');
  const files = readdirSync(dir).filter((f) => f.endsWith('.mp3'));
  assert.ok(files.length >= 6);
  assert.match(credits, /CC0/);
  for (const f of files) {
    assert.ok(credits.includes(f), `${f} sin crédito`);
    const size = statSync(new URL(f, dir)).size;
    assert.ok(size > 100000 && size < 4 * 1024 * 1024, `${f}: ${size} bytes`);
    // Cabecera MP3 (ID3 o sincronía de trama).
    const head = readFileSync(new URL(f, dir)).subarray(0, 3);
    assert.ok(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `${f} no parece MP3`);
  }
  const eq = readFileSync(new URL('../lab/js/tools/eq.js', import.meta.url), 'utf8');
  for (const f of files) assert.ok(eq.includes(f), `${f} no está en el EQ Trainer`);
});
