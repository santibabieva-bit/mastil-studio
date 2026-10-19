import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/parser.js';

test('the canonical example parses to A major scale', () => {
  const parsed = parseQuery('Escala A');
  assert.equal(parsed.family, 'scale');
  assert.equal(parsed.quality, 'major');
  assert.equal(parsed.root.pc, 9);
  assert.equal(parsed.root.name, 'A');
});

test('Spanish solfège and words are accepted', () => {
  const parsed = parseQuery('Escala mayor de La');
  assert.equal(parsed.family, 'scale');
  assert.equal(parsed.quality, 'major');
  assert.equal(parsed.root.name, 'A');

  const flat = parseQuery('Escala Sib mayor');
  assert.equal(flat.root.name, 'B♭');
  assert.equal(flat.quality, 'major');
});

test('compact chord symbols work without a family word', () => {
  const minor = parseQuery('C#m');
  assert.equal(minor.root.pc, 1);
  assert.equal(minor.family, 'triad');
  assert.equal(minor.quality, 'minor');

  const dominant = parseQuery('G7');
  assert.equal(dominant.root.pc, 7);
  assert.equal(dominant.family, 'arpeggio');
  assert.equal(dominant.quality, 'dominant7');
});

test('explicit families and qualities override the compact suffix defaults', () => {
  const triad = parseQuery('Triada C#m');
  assert.equal(triad.family, 'triad');
  assert.equal(triad.quality, 'minor');
  assert.equal(triad.root.pc, 1);

  const arpeggio = parseQuery('Arpegio G7');
  assert.equal(arpeggio.family, 'arpeggio');
  assert.equal(arpeggio.quality, 'dominant7');

  const scale = parseQuery('Escala F#m');
  assert.equal(scale.family, 'scale');
  assert.equal(scale.quality, 'naturalMinor');
  assert.equal(scale.root.pc, 6);
});

test('harmonic and melodic minor names are recognized', () => {
  assert.equal(parseQuery('Escala A menor armónica').quality, 'harmonicMinor');
  assert.equal(parseQuery('Escala A menor melódica').quality, 'melodicMinor');
});

test('Spanish chord suffix after solfège is recognized', () => {
  const parsed = parseQuery('Triada Do#m');
  assert.equal(parsed.root.pc, 1);
  assert.equal(parsed.family, 'triad');
  assert.equal(parsed.quality, 'minor');
});

test('written Spanish accidentals are recognized', () => {
  const flat = parseQuery('Escala La bemol mayor');
  assert.equal(flat.root.name, 'A♭');
  assert.equal(flat.quality, 'major');

  const sharp = parseQuery('Triada Fa sostenido menor');
  assert.equal(sharp.root.name, 'F♯');
  assert.equal(sharp.quality, 'minor');
});

test('cuatríadas and drop voicings are parsed', () => {
  const major = parseQuery('Cuatríada A');
  assert.equal(major.family, 'cuatriad');
  assert.equal(major.quality, 'major7');

  const minor = parseQuery('Cuatríada Am7');
  assert.equal(minor.family, 'cuatriad');
  assert.equal(minor.quality, 'minor7');

  const half = parseQuery('Cuatríada A semidisminuido');
  assert.equal(half.family, 'cuatriad');
  assert.equal(half.quality, 'halfDiminished7');

  const accented = parseQuery('cuatríada C');
  assert.equal(accented.family, 'cuatriad');
  assert.equal(accented.root.name, 'C');
});

test('pentatonic, blues and modal names select the right scale', () => {
  assert.equal(parseQuery('Escala A pentatónica menor').quality, 'pentatonicMinor');
  assert.equal(parseQuery('Escala A pentatónica mayor').quality, 'pentatonicMajor');
  assert.equal(parseQuery('Escala A blues').quality, 'blues');
  assert.equal(parseQuery('Escala A dórica').quality, 'dorian');
  assert.equal(parseQuery('Escala A frigia').quality, 'phrygian');
  assert.equal(parseQuery('Escala A lidia').quality, 'lydian');
  assert.equal(parseQuery('Escala A mixolidia').quality, 'mixolydian');
  assert.equal(parseQuery('Escala A locria').quality, 'locrian');
});

test('major seventh symbols become major-7 arpeggios', () => {
  const parsed = parseQuery('Cmaj7');
  assert.equal(parsed.root.pc, 0);
  assert.equal(parsed.family, 'arpeggio');
  assert.equal(parsed.quality, 'major7');
});

test('a query without a note produces a helpful error', () => {
  assert.throws(() => parseQuery('Quiero una escala'), /No encontré una nota/);
  assert.throws(() => parseQuery('   '), /Escribí una consulta/);
});
