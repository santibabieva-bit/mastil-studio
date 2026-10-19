import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNoteCollection,
  parseRoot,
  rootOptionValue,
} from '../src/theory.js';

function names(collection) {
  return collection.notes.map((note) => note.name);
}

test('parseRoot accepts English, Spanish and accidentals', () => {
  assert.equal(parseRoot('A').pc, 9);
  assert.equal(parseRoot('a').pc, 9);
  assert.equal(parseRoot('C#').pc, 1);
  assert.equal(parseRoot('Db').pc, 1);
  assert.equal(parseRoot('La').pc, 9);
  assert.equal(parseRoot('Sib').pc, 10);
  assert.equal(parseRoot('fa#').pc, 6);
  assert.equal(parseRoot('Do').name, 'C');
});

test('parseRoot rejects nonsense', () => {
  assert.throws(() => parseRoot('H'), /No reconozco/);
  assert.throws(() => parseRoot(''), /No reconozco/);
});

test('A major is spelled with sharps, not enharmonic flats', () => {
  const collection = createNoteCollection('A', 'scale', 'major');
  assert.deepEqual(names(collection), ['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯']);
  assert.equal(collection.title, 'Escala mayor de A');
  assert.equal(collection.subtitle, 'A · B · C♯ · D · E · F♯ · G♯');
});

test('F major and B-flat major use flats where the key requires them', () => {
  assert.deepEqual(names(createNoteCollection('F', 'scale', 'major')), [
    'F',
    'G',
    'A',
    'B♭',
    'C',
    'D',
    'E',
  ]);
  assert.deepEqual(names(createNoteCollection('Bb', 'scale', 'major')), [
    'B♭',
    'C',
    'D',
    'E♭',
    'F',
    'G',
    'A',
  ]);
});

test('minor variants are distinguished', () => {
  assert.deepEqual(names(createNoteCollection('A', 'scale', 'naturalMinor')), [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
  ]);
  assert.deepEqual(names(createNoteCollection('A', 'scale', 'harmonicMinor')), [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G♯',
  ]);
  assert.deepEqual(names(createNoteCollection('A', 'scale', 'melodicMinor')), [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F♯',
    'G♯',
  ]);
});

test('pentatonic, blues and modal scales are spelled correctly', () => {
  assert.deepEqual(names(createNoteCollection('A', 'scale', 'pentatonicMinor')), [
    'A',
    'C',
    'D',
    'E',
    'G',
  ]);
  assert.deepEqual(names(createNoteCollection('A', 'scale', 'pentatonicMajor')), [
    'A',
    'B',
    'C♯',
    'E',
    'F♯',
  ]);
  assert.deepEqual(names(createNoteCollection('A', 'scale', 'blues')), [
    'A',
    'C',
    'D',
    'E♭',
    'E',
    'G',
  ]);
  assert.deepEqual(names(createNoteCollection('D', 'scale', 'dorian')), [
    'D',
    'E',
    'F',
    'G',
    'A',
    'B',
    'C',
  ]);
});

test('triads are spelled by chord degree', () => {
  assert.deepEqual(names(createNoteCollection('C#', 'triad', 'minor')), [
    'C♯',
    'E',
    'G♯',
  ]);
  assert.deepEqual(names(createNoteCollection('C', 'triad', 'augmented')), [
    'C',
    'E',
    'G♯',
  ]);
  assert.deepEqual(names(createNoteCollection('C', 'triad', 'diminished')), [
    'C',
    'E♭',
    'G♭',
  ]);
});

test('F diminished chords and symmetric scales prefer flats', () => {
  assert.deepEqual(names(createNoteCollection('F', 'triad', 'diminished')), [
    'F',
    'A♭',
    'C♭',
  ]);
  assert.deepEqual(names(createNoteCollection('F', 'scale', 'diminished')), [
    'F',
    'G',
    'A♭',
    'B♭',
    'B',
    'D♭',
    'D',
    'E',
  ]);
});

test('arpeggios carry the seventh and keep chord spellings', () => {
  assert.deepEqual(names(createNoteCollection('G', 'arpeggio', 'dominant7')), [
    'G',
    'B',
    'D',
    'F',
  ]);
  assert.deepEqual(names(createNoteCollection('A', 'arpeggio', 'major7')), [
    'A',
    'C♯',
    'E',
    'G♯',
  ]);
  assert.deepEqual(names(createNoteCollection('C', 'arpeggio', 'diminished7')), [
    'C',
    'E♭',
    'G♭',
    'B♭♭',
  ]);
});

test('root notes are marked and every pitch class is unique', () => {
  const collection = createNoteCollection('A', 'scale', 'major');
  const roots = collection.notes.filter((note) => note.isRoot);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].name, 'A');

  const pcs = collection.notes.map((note) => note.pc);
  assert.equal(new Set(pcs).size, pcs.length);
  assert.ok(collection.notes.every((note) => /^[A-G]/.test(note.name)));
});

test('rootOptionValue preserves the chosen enharmonic spelling', () => {
  assert.equal(rootOptionValue(parseRoot('C#')), 'C#');
  assert.equal(rootOptionValue(parseRoot('Db')), 'Db');
  assert.equal(rootOptionValue(parseRoot('Sib')), 'Bb');
});
