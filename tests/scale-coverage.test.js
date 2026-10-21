import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAGED_ORDER,
  OPEN_MIDI,
  STRINGS,
  completeScaleWindow,
  getCagedShape,
} from '../src/caged.js';
import { FAMILY_DEFS, mod } from '../src/theory.js';

function scalePitchClasses(rootPc, quality) {
  return quality.intervals.map((interval) => mod(rootPc + interval, 12));
}

function scaleSteps(pitchClasses) {
  return new Set(
    pitchClasses.map((pc, index) =>
      mod(pitchClasses[(index + 1) % pitchClasses.length] - pc, 12),
    ),
  );
}

function windowMidis(shape, pitchClasses) {
  const pitchSet = new Set(pitchClasses);
  const midis = [];
  for (const string of STRINGS) {
    for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
      if (pitchSet.has(mod(string.openPc + fret, 12))) {
        midis.push(OPEN_MIDI[string.index] + fret);
      }
    }
  }
  return midis.sort((a, b) => a - b);
}

test('every completed scale window is continuous note-to-note', () => {
  const scaleQualities = Object.values(FAMILY_DEFS.scale.qualities);

  for (let rootPc = 0; rootPc < 12; rootPc += 1) {
    for (const quality of scaleQualities) {
      const pitchClasses = scalePitchClasses(rootPc, quality);
      const steps = scaleSteps(pitchClasses);
      const pitchSet = new Set(pitchClasses);

      for (const shapeId of CAGED_ORDER) {
        const base = getCagedShape(shapeId, rootPc, quality.id);
        // Partial positions clipped by the 15-fret board are shown as maps.
        if (base.clipped) continue;
        const shape = completeScaleWindow(base, pitchClasses);
        const label = `${shapeId}/${quality.id}/pc${rootPc}`;

        assert.ok(
          shape.window.end - shape.window.start + 1 <= 6,
          `${label}: window too wide`,
        );

        for (const string of STRINGS) {
          let count = 0;
          for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
            if (pitchSet.has(mod(string.openPc + fret, 12))) count += 1;
          }
          assert.ok(count >= 2, `${label}: string ${string.index} has ${count} notes`);
        }

        const midis = windowMidis(shape, pitchClasses);
        for (let index = 1; index < midis.length; index += 1) {
          const interval = midis[index] - midis[index - 1];
          if (interval === 0) continue;
          assert.ok(
            steps.has(interval),
            `${label}: gap of ${interval} semitones between ${midis[index - 1]} and ${midis[index]}`,
          );
        }
      }
    }
  }
});
