import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bendAt, bendFromTech, bendKeyframes, bendLabel, bendPoints, bendTarget, bendTex,
} from '../lab/js/core/bends.js';
import {
  BUILTIN_LICKS, lickTargets, lickToText, parseLick, transposeLick,
} from '../lab/js/core/licks.js';
import { beatsToAlphaTex, lickToBeats } from '../lab/js/core/alphatex.js';
import { TUNINGS } from '../lab/js/core/music.js';

const tuning = TUNINGS.standard.midi;

test('bend points normalise numbers, single pre-bends and empties', () => {
  assert.deepEqual(bendPoints(2), [0, 2]);
  assert.deepEqual(bendPoints([2]), [2, 2]);
  assert.equal(bendPoints(null), null);
  assert.equal(bendPoints([]), null);
});

test('bend curve rises, holds and releases', () => {
  assert.equal(bendAt([0, 2], 0), 0);
  assert.equal(bendAt([0, 2], 0.5), 2);
  assert.equal(bendAt([0, 2], 1), 2);
  const mid = bendAt([0, 2], 0.24);
  assert.ok(mid > 0 && mid < 2);
  assert.equal(bendAt([0, 2, 0], 0.4), 2);
  assert.equal(bendAt([0, 2, 0], 1), 0);
  assert.equal(bendAt([2, 0], 0), 2);
  assert.equal(bendAt([2, 0], 1), 0);
  for (const b of [[0, 2], [0, 2, 0], [2, 0], [0, 1]]) {
    const ks = bendKeyframes(b);
    assert.equal(ks[0].t, 0);
    assert.equal(ks[ks.length - 1].t, 1);
    ks.slice(1).forEach((k, i) => assert.ok(k.t >= ks[i].t));
  }
});

test('bend labels, targets and alphaTex', () => {
  assert.equal(bendLabel([0, 2]), 'bend 1');
  assert.equal(bendLabel([0, 1]), 'bend ½');
  assert.equal(bendLabel([0, 3]), 'bend 1½');
  assert.equal(bendLabel([0, 2, 0]), 'bend 1 y release');
  assert.equal(bendLabel([2, 0]), 'pre-bend 1 y release');
  assert.equal(bendTarget([0, 2, 0]), 0);
  assert.equal(bendTarget([0, 3]), 3);
  assert.equal(bendTex([0, 2]), 'b (0 4)');
  assert.equal(bendTex([0, 2, 0]), 'b (0 4 0)');
  assert.equal(bendTex([2, 0]), 'b (4 0)');
  assert.deepEqual(bendFromTech('br'), [0, 2, 0]);
});

test('lick text round-trips bends and vibrato', () => {
  const notes = parseLick('2:8b 1:5 3:7br~ 3:5b½ 2:10b3 2:8pbr');
  assert.deepEqual(notes[0], [1, 8, 1, { bend: [0, 2] }]);
  assert.deepEqual(notes[2][3], { bend: [0, 2, 0], vib: true });
  assert.deepEqual(notes[3][3].bend, [0, 1]);
  assert.deepEqual(notes[5][3].bend, [2, 0]);
  assert.equal(lickToText(notes), '2:8b 1:5 3:7br~ 3:5b½ 2:10b3 2:8pbr');
  assert.equal(parseLick('2:8q'), null);
});

test('transposing keeps bends; targets include the bent pitch', () => {
  const lick = BUILTIN_LICKS.find((l) => l.id === 'bb-lick');
  const up = transposeLick(lick, 2);
  assert.deepEqual(up.notes[0][3], { bend: [0, 2] });
  assert.equal(up.notes[0][1], lick.notes[0][1] + 2);
  // B.B.: el bend del 8 en la 2.ª cuerda (Sol) llega a La, la tónica.
  assert.equal(lickTargets(lick, tuning)[0] % 12, 9);
});

test('built-in bend licks land on notes of A minor blues', () => {
  const blues = new Set([9, 0, 2, 3, 4, 7]); // A C D E♭ E G (+ C♯ del medio tono)
  for (const lick of BUILTIN_LICKS.filter((l) => l.notes.some((n) => n[3]?.bend))) {
    for (const [i, midi] of lickTargets(lick, tuning).entries()) {
      const pc = midi % 12;
      assert.ok(blues.has(pc) || (pc === 1 && lick.id === 'half-step'), `${lick.id} nota ${i}: ${pc}`);
    }
  }
});

test('lick beats write the bend curve in alphaTex', () => {
  const lick = BUILTIN_LICKS.find((l) => l.id === 'bend-release');
  const tex = beatsToAlphaTex(lickToBeats(lick), { title: 'x', tuning });
  assert.match(tex, /b \(0 4 0\)/);
});
