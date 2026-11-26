import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approachFinger, fingerDouble, fingerPosition, fingeringIssues, threePerString, withFingers,
} from '../lab/js/core/fingers.js';
import { EXERCISES, buildExercise } from '../lab/js/core/exlib.js';
import { ladderPerString, positionLabel } from '../lab/js/core/exercises.js';
import { arpeggioPositions } from '../lab/js/core/triads.js';
import { buildDrill } from '../lab/js/core/drills.js';
import { handPositions, toSteps } from '../lab/js/core/motion.js';
import { TUNINGS, createNoteCollection } from '../lab/js/core/music.js';

const STD = TUNINGS.standard.midi;
const ROOTS = ['A', 'C', 'E', 'F', 'Bb'];
const fingers = (notes) => notes.map((n) => `${n.s + 1}:${n.f}/${n.finger}`).join(' ');

test('3 notas por cuerda: tono-tono 1-2-4, tono-semitono 1-3-4, semitono-tono 1-2-4', () => {
  assert.deepEqual(threePerString([5, 7, 9]), [1, 2, 4]);
  assert.deepEqual(threePerString([5, 7, 8]), [1, 3, 4]);
  assert.deepEqual(threePerString([4, 5, 7]), [1, 2, 4]);
});

test('posición de cuatro trastes: un dedo por traste; caja 1 de la pentatónica de La', () => {
  const box = [[5, 5], [5, 8], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 7], [1, 5], [1, 8], [0, 5], [0, 8]].map(([s, f]) => ({ s, f }));
  const m = fingerPosition(box);
  assert.deepEqual([5, 4, 3, 2, 1, 0].map((s) => box.filter((n) => n.s === s).map((n) => m.get(`${s}-${n.f}`)).join('-')), ['1-4', '1-3', '1-3', '1-3', '1-4', '1-4']);
});

test('cinco trastes con uno libre: se reparten sin estirar (6, 9, 10 → 1, 3, 4)', () => {
  const m = fingerPosition([{ s: 2, f: 6 }, { s: 2, f: 9 }, { s: 1, f: 10 }, { s: 0, f: 9 }, { s: 3, f: 7 }]);
  assert.equal(m.get('2-6'), 1);
  assert.equal(m.get('2-9'), 3);
  assert.equal(m.get('1-10'), 4);
});

test('posición abierta: traste = dedo, y la forma de La en el traste 2 va con 1-2-3', () => {
  const m = fingerPosition([{ s: 4, f: 0 }, { s: 3, f: 2 }, { s: 2, f: 2 }, { s: 1, f: 2 }, { s: 0, f: 0 }]);
  assert.deepEqual([m.get('3-2'), m.get('2-2'), m.get('1-2')], [1, 2, 3]);
  assert.equal(m.get('4-0'), 0);
  const e = fingerPosition([{ s: 5, f: 0 }, { s: 4, f: 2 }, { s: 3, f: 2 }, { s: 2, f: 1 }]);
  assert.deepEqual([e.get('2-1'), e.get('4-2'), e.get('3-2')], [1, 2, 3]);
});

test('todas las posiciones de escala, pentatónica y blues: sin dedos imposibles ni estiramientos de más', () => {
  for (const root of ROOTS) {
    for (const quality of ['major', 'naturalMinor', 'dorian', 'pentatonicMinor', 'pentatonicMajor', 'blues', 'harmonicMinor']) {
      const col = createNoteCollection(root, 'scale', quality);
      const count = positionLabel(STD, col, 0).count;
      for (let p = 0; p < count; p += 1) {
        const ladder = withFingers(ladderPerString({ tuning: STD, collection: col, position: p, maxFret: 17 }).ladder);
        assert.deepEqual(fingeringIssues(ladder), [], `${root} ${quality} posición ${p + 1}: ${fingers(ladder)}`);
      }
    }
  }
});

test('blues: es la caja pentatónica más la ♭5, cinco posiciones, dentro de una mano', () => {
  for (const root of ROOTS) {
    const col = createNoteCollection(root, 'scale', 'blues');
    assert.equal(positionLabel(STD, col, 0).count, 5);
    for (let p = 0; p < 5; p += 1) {
      const { ladder } = ladderPerString({ tuning: STD, collection: col, position: p, maxFret: 17 });
      const fretted = ladder.filter((n) => n.f > 0).map((n) => n.f);
      assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 4, `${root} blues posición ${p + 1}: ${fretted}`);
      assert.ok(ladder.every((n, i) => i === 0 || n.midi > ladder[i - 1].midi));
    }
  }
  // Caja 1 de La blues: 5.ª cuerda 5-6-7 (1-2-3) y 3.ª cuerda 5-7-8 (1-3-4).
  const r = buildExercise('pent-up', { tuning: STD, root: 'A', pent: 'blues', position: 0, direction: 'up' });
  const box = r.beats.flatMap((b) => b.notes).filter((n) => n.f >= 5);
  const str = (s) => [...new Set(box.filter((n) => n.s === s).map((n) => `${n.f}/${n.finger}`))].join(' ');
  if (str(4) === '5/1 6/2 7/3') assert.equal(str(2), '5/1 7/3 8/4');
});

test('cada ejercicio de la biblioteca con posición sale sin dedos imposibles', () => {
  for (const ex of EXERCISES.filter((e) => e.needsPosition && !e.chromatic)) {
    for (const root of ['A', 'F']) {
      for (const position of [0, 2, 4]) {
        const r = buildExercise(ex.id, { tuning: STD, root, position, pent: 'blues', quality: 'major', direction: 'up' });
        const notes = r.beats.flatMap((b) => b.notes);
        assert.deepEqual(fingeringIssues(notes), [], `${ex.id} ${root} posición ${position + 1}`);
      }
    }
  }
});

test('dobles cuerdas: pares estándar (misma altura 2-3, sextas 2-1 y 3-1, octavas 1-3)', () => {
  assert.deepEqual(fingerDouble({ s: 2, f: 7 }, { s: 1, f: 7 }), [2, 3]);
  assert.deepEqual(fingerDouble({ s: 5, f: 5 }, { s: 3, f: 4 }), [2, 1]);
  assert.deepEqual(fingerDouble({ s: 5, f: 5 }, { s: 3, f: 3 }), [3, 1]);
  assert.deepEqual(fingerDouble({ s: 4, f: 5 }, { s: 2, f: 7 }), [1, 3]);
  for (const id of ['dbl-3', 'dbl-6', 'dbl-8', 'caged-3', 'caged-6']) {
    const r = buildExercise(id, { tuning: STD, root: 'A', direction: 'up' });
    for (const b of r.beats.filter((x) => x.notes.length === 2)) {
      const [a, c] = b.notes;
      if (a.f > 0 && c.f > 0 && a.f !== c.f) assert.notEqual(a.finger, c.finger, `${id}: ${fingers(b.notes)}`);
    }
  }
});

test('aproximaciones: la nota cromática usa el dedo vecino del objetivo', () => {
  assert.equal(approachFinger({ s: 2, f: 6 }, { s: 2, f: 7, finger: 3 }), 2);
  assert.equal(approachFinger({ s: 2, f: 8 }, { s: 2, f: 7, finger: 3 }), 4);
});

test('arpegios: las cinco formas CAGED, sin dedos imposibles, en todos los acordes', () => {
  for (const rootPc of [9, 0, 4, 5]) {
    for (const typeId of ['maj', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim7']) {
      const pos = arpeggioPositions({ tuning: STD, rootPc, typeId, maxFret: 17 });
      assert.ok(pos.length >= 4 && pos.length <= 5, `${rootPc}${typeId}: ${pos.length} posiciones`);
      for (const p of pos) {
        assert.deepEqual(fingeringIssues(p.notes), [], `${rootPc}${typeId} forma ${p.id}: ${fingers(p.notes)}`);
        const fr = p.notes.filter((n) => n.f > 0).map((n) => n.f);
        assert.ok(Math.max(...fr) - Math.min(...fr) <= 4);
      }
    }
  }
});

test('drills: economy en menor natural a 3 por cuerda y sweep en forma de cejilla', () => {
  const eco = buildDrill('economy', { tuning: STD, root: 9 }).events;
  assert.equal(fingers(eco.slice(0, 6)), '6:5/1 6:7/3 6:8/4 5:5/1 5:7/3 5:8/4');
  const sw = buildDrill('sweep', { tuning: STD, root: 9, quality: 'm' }).events;
  assert.equal(sw.slice(0, 6).map((e) => e.f).join('-'), '5-7-7-5-5-5');
});

test('mano animada: la ventana mira hacia delante (la caja 1 bajando empieza con el meñique)', () => {
  const steps = toSteps([[0, 8], [0, 5], [1, 8], [1, 5]]);
  const w = handPositions(steps);
  assert.equal(w[0].from, 5);
  assert.ok(w.every((x) => !x.shift));
});

test('cajas de cinco trastes: los tonos nunca con dedos contiguos (Mi menor caja 3: índice estirado)', () => {
  const box = [[5, 5], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [2, 4], [2, 7], [1, 5], [1, 8], [0, 5], [0, 7]].map(([s, f]) => ({ s, f }));
  const m = fingerPosition(box);
  const str = (s) => box.filter((n) => n.s === s).map((n) => m.get(`${s}-${n.f}`)).join('-');
  assert.deepEqual([5, 4, 3, 2, 1, 0].map(str), ['1-3', '1-3', '1-3', '1-4', '1-4', '1-3']);
  for (const root of ROOTS) {
    for (const quality of ['pentatonicMinor', 'pentatonicMajor', 'blues']) {
      const col = createNoteCollection(root, 'scale', quality);
      for (let p = 0; p < 5; p += 1) {
        const ladder = withFingers(ladderPerString({ tuning: STD, collection: col, position: p, maxFret: 17 }).ladder);
        const byS = new Map();
        for (const n of ladder.filter((x) => x.f > 0)) byS.set(n.s, [...(byS.get(n.s) ?? []), n]);
        for (const list of byS.values()) {
          for (let i = 1; i < list.length; i += 1) {
            if (list[i].f - list[i - 1].f >= 2) assert.ok(list[i].finger - list[i - 1].finger >= 2, `${root} ${quality} posición ${p + 1}: ${fingers(list)}`);
          }
        }
      }
    }
  }
});
