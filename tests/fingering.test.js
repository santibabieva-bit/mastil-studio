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
    if (!fingering) {
      // The upper A position is clipped at fret 15 and is rendered as a map.
      assert.ok(label.startsWith('A/') && label.endsWith('/pc9'), `${label}: no fingering`);
      continue;
    }
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

test('A major A shape uses the upper octave and stays out of G', () => {
  const pcs = [9, 11, 1, 2, 4, 6, 8];
  const shape = completeScaleWindow(getCagedShape('A', 9, 'major'), pcs);
  const fingering = buildScaleFingering({ shape, notePcs: pcs });

  assert.deepEqual(shape.window, { start: 12, end: 15 });
  // The upper A position is clipped at fret 15; it intentionally falls back
  // to the map instead of expanding backward into the G position.
  assert.equal(fingering, null);
});
