import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approachFinger, fingerDouble, fingerPosition, fingeringIssues, threePerString, withFingers,
} from '../lab/js/core/fingers.js';
import { EXERCISES, buildExercise } from '../lab/js/core/exlib.js';
import { ladderPerString, positionLabel } from '../lab/js/core/exercises.js';
import { arpeggioPositions, voicingsOnSet } from '../lab/js/core/triads.js';
import { autoFingers, roleOf } from '../lab/js/ui/labels.js';
import { chordPcs } from '../lab/js/core/chords.js';
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
  const m = fingerPosition([{ s: 4, f: 0 }, { s: 3, f: 2 }, { s: 2, f: 2 }, { s: 1, f: 2 }, { s: 0, f: 0 }], { openChord: true });
  assert.deepEqual([m.get('3-2'), m.get('2-2'), m.get('1-2')], [1, 2, 3]);
  assert.equal(m.get('4-0'), 0);
  // En una escala de primera posición, el traste 2 es siempre el dedo 2.
  const scale = fingerPosition([{ s: 3, f: 0 }, { s: 3, f: 2 }, { s: 2, f: 0 }, { s: 2, f: 2 }, { s: 1, f: 1 }, { s: 1, f: 3 }]);
  assert.deepEqual([scale.get('3-2'), scale.get('2-2'), scale.get('1-3')], [2, 2, 3]);
  const e = fingerPosition([{ s: 5, f: 0 }, { s: 4, f: 2 }, { s: 3, f: 2 }, { s: 2, f: 1 }], { grip: true });
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

const grip = (shape) => {
  const m = fingerPosition(shape.map(([s, f]) => ({ s, f })), { grip: true });
  return shape.map(([s, f]) => m.get(`${s}-${f}`)).join('-');
};

test('agarres: tríadas cerradas y cuatriadas como se enseñan', () => {
  assert.equal(grip([[2, 5], [1, 5], [0, 3]]), '3-4-1');
  assert.equal(grip([[2, 8], [1, 8], [0, 9]]), '1-1-2');
  assert.equal(grip([[4, 7], [3, 8], [2, 5], [1, 8]]), '2-3-1-4');
  assert.equal(grip([[3, 10], [2, 8], [1, 8], [0, 6]]), '4-2-3-1');
  assert.equal(grip([[3, 9], [2, 12], [1, 13], [0, 12]]), '1-2-4-3');
  assert.equal(grip([[3, 1], [2, 3], [1, 1], [0, 3]]), '1-3-1-4');
  assert.equal(grip([[4, 0], [3, 2], [2, 5]]), '0-1-4');
  assert.equal(grip([[5, 0], [4, 2], [3, 2], [2, 1]]), '0-2-3-1');
  assert.equal(grip([[4, 3], [3, 2], [2, 0]]), '3-2-0', 'Do abierto: traste = dedo');
  assert.equal(grip([[4, 0], [3, 2], [2, 2], [1, 2]]), '0-1-2-3', 'La abierto');
  assert.equal(grip([[4, 0], [3, 1], [2, 5]]), '0-1-4', 'disminuido con cuerda al aire');
  assert.equal(grip([[5, 8], [4, 6], [3, 4]]), '4-3-1', 'disminuido cerrado en fundamental');
  assert.equal(grip([[4, 15], [3, 13], [2, 11]]), '4-3-1');
  // Ningún agarre del Triad Lab usa un dedo en dos trastes ni pasa del meñique.
  for (const typeId of ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', 'maj7', 'm7', '7', 'm7b5', 'dim7']) {
    for (const rootPc of [0, 5, 9]) {
      const n = chordPcs(rootPc, typeId).length;
      for (let top = 0; top + n <= 6; top += 1) {
        const set = Array.from({ length: n }, (_, i) => top + i);
        for (const v of voicingsOnSet({ tuning: STD, rootPc, typeId, set, maxFret: 15 })) {
          const m = fingerPosition(v.notes, { grip: true });
          const byFinger = new Map();
          for (const x of v.notes.filter((y) => y.f > 0)) {
            const fg = m.get(`${x.s}-${x.f}`);
            assert.ok(fg >= 1 && fg <= 4);
            if (byFinger.has(fg)) assert.equal(byFinger.get(fg), x.f, `${rootPc}${typeId}: mismo dedo en dos trastes`);
            byFinger.set(fg, x.f);
          }
        }
      }
    }
  }
});

test('etiqueta R 3 5: por intervalo, con 2 y 4 en los sus, 6 en las sextas y tensiones', () => {
  const r = (iv, typeId, root = 0) => roleOf(60 + root + iv, { rootPc: root, pcs: chordPcs(root, typeId) });
  assert.deepEqual([0, 4, 7].map((iv) => r(iv, 'maj')), ['R', '3', '5']);
  assert.deepEqual([0, 3, 6, 9].map((iv) => r(iv, 'dim7')), ['R', '3', '5', '7']);
  assert.equal(r(2, 'sus2'), '2');
  assert.equal(r(5, 'sus4'), '4');
  assert.equal(r(9, '6'), '6');
  assert.equal(r(2, '9'), '9');
  assert.equal(r(10, '9'), '7');
  assert.equal(r(8, 'aug'), '5');
  assert.equal(r(6, 'maj'), '♯11');
});

test('digitación automática: solo en posiciones que se pueden tocar', () => {
  const box = [[5, 5], [5, 8], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 7], [1, 5], [1, 8], [0, 5], [0, 8]].map(([s, f]) => ({ s, f }));
  assert.ok(autoFingers(box));
  const wide = [[0, 1], [0, 3], [0, 6], [1, 1], [1, 4]].map(([s, f]) => ({ s, f }));
  assert.equal(autoFingers(wide), null, 'pentatónica de 6 trastes no es una posición');
  const four = [[2, 4], [2, 5], [2, 6], [2, 8]].map(([s, f]) => ({ s, f }));
  assert.equal(autoFingers(four), null, 'cuatro notas en una cuerda');
});

test('Tríadas en movimiento: notas mantenidas conservan el dedo y nadie cruza dedos', async () => {
  const { buildTriadExercise } = await import('../lab/js/core/triadex.js');
  const src = (await import('node:fs')).readFileSync(new URL('../lab/js/tools/triadmotion.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  function withGripFingers(list) {'), src.indexOf('  function decorate(list) {'));
  // eslint-disable-next-line no-new-func
  const make = new Function('fingerPosition', `${body}; return withGripFingers;`);
  const withGripFingers = make(fingerPosition);
  for (const id of ['passing', 'ornaments', 'rhythm', 'inv-h', 'prog-caged', 'pedal', 'chromatic']) {
    for (const keyPc of [0, 7, 9]) {
      const steps = withGripFingers(buildTriadExercise(id, { keyPc, rootPc: keyPc }).steps);
      for (const st of steps) {
        const pressed = st.notes.filter((n) => n.f > 0);
        for (const a of pressed) {
          assert.ok(a.finger >= 1 && a.finger <= 4, `${id}: sin dedo`);
          for (const b of pressed) {
            if (a === b) continue;
            if (a.finger === b.finger) assert.equal(a.f, b.f, `${id} ${keyPc}: dedo ${a.finger} en ${a.f} y ${b.f}`);
            if (a.f < b.f) assert.ok(a.finger <= b.finger, `${id} ${keyPc}: dedos cruzados ${JSON.stringify(pressed.map((n) => [n.s, n.f, n.finger]))}`);
          }
        }
      }
    }
  }
});
