import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAGED_ORDER,
  completeScaleWindow,
  getCagedShape,
} from '../src/caged.js';
import { buildScaleFingering } from '../src/fingering.js';
import { FAMILY_DEFS, mod } from '../src/theory.js';

function buildAllFingerings() {
  const results = [];
  for (let rootPc = 0; rootPc < 12; rootPc += 1) {
    for (const quality of Object.values(FAMILY_DEFS.scale.qualities)) {
      const pcs = quality.intervals.map((interval) => mod(rootPc + interval, 12));
      for (const shapeId of CAGED_ORDER) {
        const shape = completeScaleWindow(
          getCagedShape(shapeId, rootPc, quality.id),
          pcs,
        );
        results.push({
          label: `${shapeId}/${quality.id}/pc${rootPc}`,
          shape,
          fingering: buildScaleFingering({ shape, notePcs: pcs }),
        });
      }
    }
  }
  return results;
}

test('fingerings use 2–3 notes per string, at most 4 frets, without gaps', () => {
  for (const { label, fingering } of buildAllFingerings()) {
    assert.ok(fingering, `${label}: no fingering`);
    assert.equal(fingering.groups.length, 6, `${label}: should cover six strings`);

    let previous = null;
    for (const group of fingering.groups) {
      const frets = group.notes.map((note) => note.fret);
      assert.ok(
        group.notes.length >= 2 && group.notes.length <= 3,
        `${label}: bad group size ${group.notes.length}`,
      );
      assert.ok(
        Math.max(...frets) - Math.min(...frets) <= 4,
        `${label}: group spans more than four frets`,
      );
      if (previous) {
        assert.ok(
          group.firstIndex === previous.lastIndex
            || group.firstIndex === previous.lastIndex + 1,
          `${label}: gap between strings`,
        );
      }
      previous = group;
    }
  }
});

test('A major A shape keeps open A/D and adds G-sharp on the first string', () => {
  const pcs = [9, 11, 1, 2, 4, 6, 8];
  const shape = completeScaleWindow(getCagedShape('A', 9, 'major'), pcs);
  const fingering = buildScaleFingering({ shape, notePcs: pcs });

  assert.ok(fingering);
  assert.deepEqual(shape.window, { start: 0, end: 5 });
  assert.equal(fingering.groups[0].notes[0].fret, 0);

  const positions = new Set(
    fingering.notes.map((note) => `${note.stringIndex}:${note.fret}`),
  );
  assert.ok(positions.has('4:0'), 'A open on the 5th string');
  assert.ok(positions.has('3:0'), 'D open on the 4th string');
  assert.ok(positions.has('2:2'), 'A on the 3rd string, fret 2');
  assert.ok(positions.has('0:4'), 'G♯ on the 1st string, fret 4');
});
