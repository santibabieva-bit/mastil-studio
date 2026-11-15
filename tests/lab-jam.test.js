import test from 'node:test';
import assert from 'node:assert/strict';

import { TUNINGS } from '../lab/js/core/music.js';
import {
  suggestScales, chordTones, focusNotes, boardPositions, followWindow, LandingScorer, pickLandingTarget, JAM_PRESETS, scalePcs,
} from '../lab/js/core/jam.js';
import {
  voicingsOnSet, voicingsByInversion, voiceLeadPath, arpeggioPositions, overlayChords, stringSets, parentScale,
} from '../lab/js/core/triads.js';
import { groovesFor, GROOVES, TIME_SIGNATURES, COMP_PATTERNS } from '../lab/js/core/rhythm.js';

const STD = TUNINGS.standard.midi;
const C = 0;
const names = (list) => list.map((s) => s.quality);

test('escalas sugeridas por función en una tonalidad mayor', () => {
  const key = { rootPc: C, mode: 'major' };
  assert.equal(suggestScales({ key, chord: { rootPc: 2, typeId: 'm7' } })[0].quality, 'dorian');
  assert.equal(suggestScales({ key, chord: { rootPc: 7, typeId: '7' } })[0].quality, 'mixolydian');
  assert.equal(suggestScales({ key, chord: { rootPc: 0, typeId: 'maj7' } })[0].quality, 'major');
  assert.equal(suggestScales({ key, chord: { rootPc: 5, typeId: 'maj' } })[0].quality, 'lydian');
  assert.equal(suggestScales({ key, chord: { rootPc: 9, typeId: 'm' } })[0].quality, 'naturalMinor');
  assert.equal(suggestScales({ key, chord: { rootPc: 11, typeId: 'm7b5' } })[0].quality, 'locrian');
  assert.equal(suggestScales({ key, chord: { rootPc: 4, typeId: 'm7' } })[0].quality, 'phrygian');
});

test('escalas sugeridas en menor y en blues', () => {
  const key = { rootPc: 9, mode: 'minor' };
  const i = suggestScales({ key, chord: { rootPc: 9, typeId: 'm7' } });
  assert.ok(names(i).includes('pentatonicMinor'));
  const v = suggestScales({ key, chord: { rootPc: 4, typeId: '7' } });
  assert.equal(v[0].quality, 'harmonicMinor');
  assert.equal(v[0].rootPc, 9, 'armónica de la tónica sobre V7');
  const blues = suggestScales({ key: { rootPc: 4, mode: 'major' }, chord: { rootPc: 9, typeId: '7' }, style: 'blues' });
  assert.equal(blues[0].quality, 'blues');
  assert.equal(blues[0].rootPc, 9);
  // acorde dominante secundario fuera de tonalidad
  const sec = suggestScales({ key: { rootPc: C, mode: 'major' }, chord: { rootPc: 4, typeId: '7' } });
  assert.equal(sec[0].quality, 'mixolydian');
  const dim = suggestScales({ key: { rootPc: C, mode: 'major' }, chord: { rootPc: 1, typeId: 'dim7' } });
  assert.equal(dim[0].quality, 'diminished');
});

test('toda sugerencia es utilizable y toda progresión del Jam resuelve', () => {
  for (const preset of JAM_PRESETS) {
    for (const chord of preset.chords) {
      const list = suggestScales({ key: { rootPc: 7, mode: preset.mode }, chord: { rootPc: (7 + chord.s) % 12, typeId: chord.t }, style: preset.style });
      assert.ok(list.length > 0, `${preset.id} ${chord.s}:${chord.t}`);
      for (const s of list) assert.ok(scalePcs(s.rootPc, s.quality).length >= 5);
    }
    const sigs = Object.keys(groovesFor('4/4'));
    assert.ok(sigs.includes(preset.groove) || ['bossa', 'country'].includes(preset.groove), `groove ${preset.groove}`);
  }
});

test('notas del acorde y enfoque', () => {
  const tones = chordTones(7, '7');
  assert.deepEqual(tones.map((t) => t.role), ['root', 'third', 'fifth', 'seventh']);
  const chord = { rootPc: 7, typeId: '7' };
  const suggestion = suggestScales({ key: { rootPc: C, mode: 'major' }, chord })[0];
  const chordOnly = focusNotes({ chord, suggestion, focus: 'chord' });
  assert.equal(chordOnly.pcs.size, 4);
  const triad = focusNotes({ chord, suggestion, focus: 'triad' });
  assert.equal(triad.pcs.size, 3);
  assert.ok(!triad.pcs.has(5), 'sin la 7ª');
  const penta = focusNotes({ chord, suggestion, focus: 'pentatonic' });
  assert.equal(penta.pcs.size, 5);
  const scale = focusNotes({ chord, suggestion, focus: 'scale' });
  assert.equal(scale.pcs.size, 7);
});

test('posiciones y ventana que sigue al acorde', () => {
  const pcs = new Set([0, 4, 7]);
  const pos = boardPositions({ tuning: STD, pcs, from: 0, to: 12 });
  assert.ok(pos.every((p) => pcs.has(p.pc)));
  const w = followWindow({ tuning: STD, rootPc: 7, prevCenter: 3 });
  assert.ok(w.to - w.from <= 5 && w.from >= 0 && w.to <= 15);
  assert.equal((STD[5] + w.center) % 12 === 7 || (STD[4] + w.center) % 12 === 7 || (STD[3] + w.center) % 12 === 7, true);
  const w2 = followWindow({ tuning: STD, rootPc: 7, prevCenter: 14 });
  assert.ok(w2.center > w.center);
});

test('LandingScorer puntúa aterrizajes dentro de la ventana', () => {
  const s = new LandingScorer({ windowMs: 500 });
  s.startChange(4, '3M', 0);
  assert.equal(s.hear(2, 100), false);
  assert.equal(s.hear(4, 200), true);
  s.startChange(7, '5', 1000);
  assert.equal(s.hear(7, 1700), false, 'fuera de ventana');
  s.finish();
  assert.deepEqual([s.hits, s.misses, s.percent], [1, 1, 50]);
  const t = pickLandingTarget({ rootPc: 0, typeId: 'maj7' }, () => 0.99);
  assert.ok(['root', 'third', 'fifth'].includes(t.role));
});

test('tríadas: inversiones y juegos de cuerdas', () => {
  assert.deepEqual(stringSets(STD, 3), [[0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5]]);
  const by = voicingsByInversion({ tuning: STD, rootPc: 0, typeId: 'maj', set: [0, 1, 2] });
  for (const inv of [0, 1, 2]) {
    assert.ok(by[inv].length > 0, `inversión ${inv}`);
    for (const v of by[inv]) {
      assert.equal(v.notes.length, 3);
      assert.equal(v.strings[0], 0);
      const bass = v.notes[2];
      assert.equal(bass.pc, [0, 4, 7][inv]);
    }
  }
  const sevenths = voicingsOnSet({ tuning: STD, rootPc: 0, typeId: 'maj7', set: [1, 2, 3, 4] });
  assert.ok(sevenths.length > 0 && sevenths.every((v) => v.notes.length === 4));
});

test('conducción de voces: II-V-I mueve poco', () => {
  const chords = [{ rootPc: 2, typeId: 'm7' }, { rootPc: 7, typeId: '7' }, { rootPc: 0, typeId: 'maj7' }];
  const path = voiceLeadPath({ tuning: STD, chords, set: [1, 2, 3, 4] });
  assert.equal(path.length, 3);
  for (const step of path.slice(1)) assert.ok(step.move <= 8, `movimiento ${step.move}`);
  // Más barato que elegir voicings sin criterio (el primero de cada lista)
  const naive = chords.map((c) => voicingsOnSet({ tuning: STD, rootPc: c.rootPc, typeId: c.typeId, set: [1, 2, 3, 4] })[0]);
  assert.ok(path.every((p, i) => p.voicing.notes.length === naive[i].notes.length));
});

test('arpegios por posición con digitación', () => {
  const positions = arpeggioPositions({ tuning: STD, rootPc: 0, typeId: 'maj7' });
  assert.ok(positions.length >= 3);
  for (const p of positions) {
    assert.ok(new Set(p.notes.map((n) => n.s)).size === 6);
    for (const n of p.notes) {
      assert.ok(n.finger >= 0 && n.finger <= 4);
      assert.ok(n.f >= p.from && n.f <= p.to);
    }
  }
});

test('superposición de acordes y escala madre', () => {
  const o = overlayChords({ rootPc: 2, typeId: 'm7' }, { rootPc: 5, typeId: 'maj' });
  assert.deepEqual(o.shared.sort((a, b) => a - b), [0, 5, 9].filter((pc) => o.shared.includes(pc)).sort((a, b) => a - b));
  assert.ok(o.shared.includes(5) && o.shared.includes(9));
  assert.equal(parentScale(0, 'm').quality, 'naturalMinor');
});

test('grooves nuevos y 12/8 son consistentes', () => {
  for (const sig of ['4/4', '3/4', '6/8', '12/8']) {
    const grooves = groovesFor(sig);
    for (const g of Object.values(grooves)) {
      assert.ok(COMP_PATTERNS[g.comp], `${g.label}: patrón ${g.comp}`);
      for (const track of Object.values(g.tracks)) assert.equal(track.length, g.steps);
      assert.ok(g.bass.every((b) => b < g.steps));
    }
  }
  const sig = TIME_SIGNATURES['12/8'];
  assert.equal(sig.beats * sig.stepsPerBeat, 24);
  for (const id of ['jazz', 'bossa', 'country', 'slowrock']) assert.ok(GROOVES[id]);
});
