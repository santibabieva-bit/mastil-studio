import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRootVoicing,
  OPEN_MIDI,
  STRING_SETS,
} from '../src/voicings.js';
import { getQuality, mod } from '../src/theory.js';

test('A maj7 root-position drop voicings', () => {
  const drop2Root6 = buildRootVoicing({
    rootPc: 9,
    qualityId: 'major7',
    drop: 'drop2',
    rootString: 6,
  });
  assert.deepEqual(drop2Root6.frets, [5, 7, 6, 6]);
  assert.deepEqual(drop2Root6.stringSet, [5, 4, 3, 2]);

  const drop2Root5 = buildRootVoicing({
    rootPc: 9,
    qualityId: 'major7',
    drop: 'drop2',
    rootString: 5,
  });
  assert.deepEqual(drop2Root5.frets, [0, 2, 1, 2]);
  assert.deepEqual(drop2Root5.stringSet, [4, 3, 2, 1]);

  const drop3Root6 = buildRootVoicing({
    rootPc: 9,
    qualityId: 'major7',
    drop: 'drop3',
    rootString: 6,
  });
  assert.deepEqual(drop3Root6.frets, [5, 6, 6, 5]);
  assert.deepEqual(drop3Root6.stringSet, [5, 3, 2, 1]);

  const drop3Root5 = buildRootVoicing({
    rootPc: 9,
    qualityId: 'major7',
    drop: 'drop3',
    rootString: 5,
  });
  assert.deepEqual(drop3Root5.frets, [0, 1, 2, 0]);
  assert.deepEqual(drop3Root5.stringSet, [4, 2, 1, 0]);
});

test('open strings do not count toward the fretting-hand span', () => {
  const voicing = buildRootVoicing({
    rootPc: 4, // E
    qualityId: 'halfDiminished7',
    drop: 'drop3',
    rootString: 6,
  });

  assert.ok(voicing.frets.includes(0));
  assert.ok(Math.max(...voicing.frets) > 5);
  assert.ok(voicing.span <= 5);
});

test('every root/quality/drop/root-string combination produces a playable four-note voicing', () => {
  const qualities = [
    'major7',
    'minor7',
    'dominant7',
    'halfDiminished7',
    'diminished7',
    'minorMajor7',
  ];

  for (const drop of ['drop2', 'drop3']) {
    for (const rootString of [6, 5]) {
      for (const qualityId of qualities) {
        const quality = getQuality('cuatriad', qualityId);
        const chordPcs = new Set(
          quality.intervals.map((interval) => interval % 12),
        );

        for (let rootPc = 0; rootPc < 12; rootPc += 1) {
          const voicing = buildRootVoicing({
            rootPc,
            qualityId,
            drop,
            rootString,
          });

          assert.ok(voicing, `${qualityId}/${drop}/${rootString}/pc${rootPc}`);
          assert.equal(voicing.notes.length, 4);
          assert.equal(voicing.activeStrings.filter(Boolean).length, 4);
          assert.deepEqual(voicing.stringSet, STRING_SETS[rootString][drop]);
          assert.ok(voicing.span <= 5);
          assert.equal(voicing.notes[0].pc, mod(rootPc, 12));
          assert.equal(voicing.notes[0].isRoot, true);

          const midis = voicing.notes.map(
            (note) => OPEN_MIDI[note.stringIndex] + note.fret,
          );
          assert.ok(midis.every((midi, index) => index === 0 || midi > midis[index - 1]));

          for (const note of voicing.notes) {
            const relative = mod(note.pc - rootPc, 12);
            assert.ok(chordPcs.has(relative), `${qualityId}: ${relative}`);
            assert.ok(note.fret >= 0 && note.fret <= 15);
          }
        }
      }
    }
  }
});
