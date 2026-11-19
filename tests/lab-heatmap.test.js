import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverage, heatColor, mapGrid, mastery, pickSpots, recordSpot, stringSummary, weakestSpots,
} from '../lab/js/core/heatmap.js';

const DAY = 86400000;
const T0 = 1_700_000_000_000;

test('recordSpot acumula aciertos, fallos y tiempo medio', () => {
  let m = recordSpot({}, 2, 5, true, 2000, T0);
  m = recordSpot(m, 2, 5, true, 4000, T0);
  m = recordSpot(m, 2, 5, false, null, T0);
  const c = m['2:5'];
  assert.equal(c.ok, 2);
  assert.equal(c.miss, 1);
  assert.equal(c.ms, 2800);
  assert.equal(c.box, 0);
});

test('mastery: sin datos es null; fallar baja, acertar rápido sube', () => {
  assert.equal(mastery(undefined), null);
  const good = recordSpot(recordSpot(recordSpot(recordSpot({}, 0, 0, true, 1500, T0), 0, 0, true, 1500, T0), 0, 0, true, 1500, T0), 0, 0, true, 1500, T0)['0:0'];
  const bad = recordSpot(recordSpot(recordSpot(recordSpot({}, 0, 0, false, null, T0), 0, 0, false, null, T0), 0, 0, false, null, T0), 0, 0, true, 1500, T0)['0:0'];
  const slow = recordSpot(recordSpot(recordSpot(recordSpot({}, 0, 0, true, 9000, T0), 0, 0, true, 9000, T0), 0, 0, true, 9000, T0), 0, 0, true, 9000, T0)['0:0'];
  assert.ok(mastery(good) > 0.95);
  assert.ok(mastery(bad) < 0.4);
  assert.ok(mastery(slow) < mastery(good));
  assert.ok(mastery(slow) >= 0.5);
});

test('mapGrid devuelve 6×(maxFret+1) celdas con la nota correcta', () => {
  const g = mapGrid({}, { maxFret: 12 });
  assert.equal(g.length, 6 * 13);
  const c = g.find((x) => x.s === 5 && x.f === 5); // 6ª cuerda traste 5 = La
  assert.equal(c.pc, 9);
  assert.equal(c.mastery, null);
});

test('weakestSpots ordena por dominio y omite lo dominado', () => {
  let m = {};
  for (let i = 0; i < 4; i += 1) m = recordSpot(m, 0, 1, true, 1500, T0);
  for (let i = 0; i < 4; i += 1) m = recordSpot(m, 3, 7, false, null, T0);
  m = recordSpot(m, 1, 2, false, null, T0);
  const w = weakestSpots(m, 5);
  assert.equal(w[0].s, 3);
  assert.ok(!w.some((x) => x.s === 0 && x.f === 1));
});

test('coverage y stringSummary reflejan lo practicado', () => {
  let m = {};
  for (let f = 0; f <= 12; f += 1) for (let i = 0; i < 4; i += 1) m = recordSpot(m, 0, f, true, 1500, T0);
  const cov = coverage(m);
  assert.equal(cov.seen, 13);
  assert.equal(cov.solid, 13);
  const s = stringSummary(m);
  assert.ok(s[0].avg > 0.95);
  assert.equal(s[1].avg, null);
});

test('pickSpots: sin repetir, dentro de rango y prefiere lo flojo/vencido', () => {
  let m = {};
  for (let s = 0; s < 6; s += 1) {
    for (let f = 0; f <= 12; f += 1) for (let i = 0; i < 4; i += 1) m = recordSpot(m, s, f, true, 1500, T0);
  }
  // Un punto débil y vencido.
  m = recordSpot(m, 4, 8, false, null, T0);
  let hits = 0;
  for (let r = 0; r < 200; r += 1) {
    const picks = pickSpots(m, { count: 10, maxFret: 12, now: T0 + 3 * DAY });
    assert.equal(picks.length, 10);
    assert.equal(new Set(picks.map((p) => `${p.s}:${p.f}`)).size, 10);
    assert.ok(picks.every((p) => p.f >= 0 && p.f <= 12));
    if (picks.some((p) => p.s === 4 && p.f === 8)) hits += 1;
  }
  // Con 78 puntos al azar saldría ~13 %; con el peso debe salir mucho más.
  assert.ok(hits > 100, `salió ${hits}/200`);
});

test('heatColor: null sin datos, rojo→verde', () => {
  assert.equal(heatColor(null), null);
  assert.match(heatColor(0), /hsl\(0 /);
  assert.match(heatColor(1), /hsl\(120 /);
});
