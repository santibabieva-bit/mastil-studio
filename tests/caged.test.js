import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAGED_ORDER,
  STRINGS,
  buildFretboard,
  completeScaleWindow,
  getCagedShape,
} from '../src/caged.js';
import {
  FAMILY_DEFS,
  TRIAD_INTERVALS,
  createNoteCollection,
  mod,
} from '../src/theory.js';

function fretMap(shape) {
  return Object.fromEntries(shape.notes.map((note) => [note.stringIndex, note.fret]));
}

test('standard tuning is high E to low E from top to bottom', () => {
  assert.deepEqual(
    STRINGS.map((string) => string.note),
    ['E', 'B', 'G', 'D', 'A', 'E'],
  );
  assert.deepEqual(
    STRINGS.map((string) => string.openPc),
    [4, 11, 7, 2, 9, 4],
  );
});

test('E-shape A major lands on the expected frets', () => {
  const shape = getCagedShape('E', 9, 'major');
  assert.equal(shape.anchor, 5);
  assert.deepEqual(shape.window, { start: 4, end: 7 });
  assert.deepEqual(fretMap(shape), { 0: 5, 1: 5, 2: 6, 3: 7, 4: 7, 5: 5 });
  assert.equal(shape.notes.filter((note) => note.isRoot).length, 3);
});

test('the five major shapes around A major are distinct CAGED positions', () => {
  const expected = {
    A: { 0: 0, 1: 2, 2: 2, 3: 2, 4: 0 },
    G: { 0: 5, 1: 2, 2: 2, 3: 2, 4: 4, 5: 5 },
    E: { 0: 5, 1: 5, 2: 6, 3: 7, 4: 7, 5: 5 },
    D: { 0: 9, 1: 10, 2: 9, 3: 7 },
    C: { 0: 9, 1: 10, 2: 9, 3: 11, 4: 12 },
  };

  for (const shapeId of CAGED_ORDER) {
    const shape = getCagedShape(shapeId, 9, 'major');
    assert.deepEqual(fretMap(shape), expected[shapeId], shapeId);
  }
});

test('A major CAGED windows follow the anchored definitions', () => {
  const expected = {
    C: { start: 9, end: 12 },
    A: { start: 0, end: 5 },
    G: { start: 1, end: 5 },
    E: { start: 4, end: 7 },
    D: { start: 6, end: 10 },
  };

  for (const shapeId of CAGED_ORDER) {
    const shape = getCagedShape(shapeId, 9, 'major');
    assert.deepEqual(shape.window, expected[shapeId], `${shapeId} window`);
  }
});

test('A major CAGED positions have 2 to 4 scale notes on every string', () => {
  const collection = createNoteCollection('A', 'scale', 'major');
  const pcs = new Set(collection.notes.map((note) => note.pc));

  for (const shapeId of CAGED_ORDER) {
    const shape = getCagedShape(shapeId, 9, 'major');
    const counts = STRINGS.map((string) => {
      let count = 0;
      for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
        if (pcs.has(mod(string.openPc + fret, 12))) count += 1;
      }
      return count;
    });

    assert.ok(
      counts.every((count) => count >= 2 && count <= 4),
      `${shapeId} should have 2–4 notes per string, got ${counts.join(',')}`,
    );
    assert.ok(
      counts.some((count) => count >= 3),
      `${shapeId} should include at least one three-note string`,
    );
  }
});

test('CAGED C includes the linking C of A minor pentatonic on the B string', () => {
  const collection = createNoteCollection('A', 'scale', 'pentatonicMinor');
  const pcs = collection.notes.map((note) => note.pc);
  const base = getCagedShape('C', 9, 'minor');
  const shape = completeScaleWindow(base, pcs);

  assert.deepEqual(shape.window, { start: 9, end: 13 });
  assert.ok(
    shape.window.start <= 13 && shape.window.end >= 13,
    'the C at fret 13 must be inside the position',
  );

  const bString = STRINGS[1];
  assert.equal(mod(bString.openPc + 13, 12), 0); // C

  for (const string of STRINGS) {
    let count = 0;
    for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
      if (pcs.includes(mod(string.openPc + fret, 12))) count += 1;
    }
    assert.ok(
      count >= 2,
      `string ${string.index} should have at least two scale notes, got ${count}`,
    );
  }
});

test('completed CAGED scale positions always keep at least two notes per string', () => {
  for (const quality of Object.keys(FAMILY_DEFS.scale.qualities)) {
    const collection = createNoteCollection('A', 'scale', quality);
    const pcs = collection.notes.map((note) => note.pc);

    for (const shapeId of CAGED_ORDER) {
      const base = getCagedShape(shapeId, 9, collection.cagedQuality);
      const shape = completeScaleWindow(base, pcs);
      const counts = STRINGS.map((string) => {
        let count = 0;
        for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
          if (pcs.includes(mod(string.openPc + fret, 12))) count += 1;
        }
        return count;
      });

      assert.ok(
        counts.every((count) => count >= 2),
        `${quality}/${shapeId} left a string without its linking scale note: ${counts.join(',')}`,
      );
    }
  }
});

test('A minor shapes place the flat third correctly', () => {
  const eShape = getCagedShape('E', 9, 'minor');
  assert.deepEqual(fretMap(eShape), { 0: 5, 1: 5, 2: 5, 3: 7, 4: 7, 5: 5 });
  assert.equal(eShape.notes.find((note) => note.stringIndex === 2).pc, 0);

  const aShape = getCagedShape('A', 9, 'minor');
  assert.deepEqual(fretMap(aShape), { 0: 0, 1: 1, 2: 2, 3: 2, 4: 0 });
});

test('every shape/quality/root combination stays inside 15 frets and on chord tones', () => {
  const qualities = ['major', 'minor', 'augmented', 'diminished'];

  for (let rootPc = 0; rootPc < 12; rootPc += 1) {
    for (const quality of qualities) {
      const pcs = new Set(
        TRIAD_INTERVALS[quality].map((interval) => (rootPc + interval) % 12),
      );

      for (const shapeId of CAGED_ORDER) {
        const shape = getCagedShape(shapeId, rootPc, quality);
        assert.ok(shape.notes.length >= 4, `${shapeId}/${quality}`);
        assert.equal(
          new Set(shape.notes.map((note) => note.stringIndex)).size,
          shape.notes.length,
          'one note per string',
        );

        for (const note of shape.notes) {
          assert.ok(note.fret >= 0 && note.fret <= 15, `${shapeId}/${quality}: fret ${note.fret}`);
          assert.ok(pcs.has(note.pc), `${shapeId}/${quality}: wrong pitch class`);
        }

        assert.ok(
          shape.notes.some((note) => note.pc === rootPc),
          `${shapeId}/${quality}: missing root`,
        );
      }
    }
  }
});

test('fretboard only contains notes from the requested collection', () => {
  const pcs = [9, 11, 1, 2, 4, 6, 8]; // A major
  const fretboard = buildFretboard(9, pcs, { includeOpen: true, maxFret: 15 });
  const allowed = new Set(pcs);

  assert.equal(fretboard.length, 6);
  const openNotes = fretboard.flatMap((string) =>
    string.notes.filter((note) => note.fret === 0),
  );
  assert.equal(openNotes.length, 5); // G at fret 0 is not in A major.

  for (const string of fretboard) {
    for (const note of string.notes) {
      assert.ok(allowed.has(note.pc));
      assert.ok(note.fret >= 0 && note.fret <= 15);
    }
  }
});

test('hiding open strings removes fret 0 only', () => {
  const pcs = [9, 11, 1, 2, 4, 6, 8];
  const fretboard = buildFretboard(9, pcs, { includeOpen: false, maxFret: 15 });
  assert.ok(fretboard.every((string) => string.notes.every((note) => note.fret >= 1)));
});

test('inactive strings generate no notes', () => {
  const pcs = [9, 11, 1, 2, 4, 6, 8];
  const activeStrings = [true, false, true, true, false, true];
  const fretboard = buildFretboard(9, pcs, {
    includeOpen: true,
    maxFret: 15,
    activeStrings,
  });

  assert.equal(fretboard[1].active, false);
  assert.equal(fretboard[1].notes.length, 0);
  assert.equal(fretboard[4].active, false);
  assert.equal(fretboard[4].notes.length, 0);
  assert.ok(fretboard[0].notes.length > 0);
  assert.ok(fretboard[2].notes.length > 0);
});
