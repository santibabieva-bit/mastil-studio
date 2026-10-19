/**
 * Root-position drop-2 and drop-3 voicings for seventh chords.
 *
 * For the first version we only build root-position shapes:
 * - Drop 2, root on 6th string: strings 6-5-4-3, voices R-5-7-3.
 * - Drop 2, root on 5th string: strings 5-4-3-2, voices R-5-7-3.
 * - Drop 3, root on 6th string: strings 6-4-3-2, voices R-7-3-5.
 * - Drop 3, root on 5th string: strings 5-3-2-1, voices R-7-3-5.
 */

import { STRINGS } from './caged.js';
import { getQuality, mod } from './theory.js';

const OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // high E to low E

const STRING_SETS = {
  6: {
    drop2: [5, 4, 3, 2],
    drop3: [5, 3, 2, 1],
  },
  5: {
    drop2: [4, 3, 2, 1],
    drop3: [4, 2, 1, 0],
  },
};

const ROLE_ORDER = {
  drop2: ['root', 'fifth', 'seventh', 'third'],
  drop3: ['root', 'seventh', 'third', 'fifth'],
};

const ROLE_INDEX = {
  root: 0,
  third: 1,
  fifth: 2,
  seventh: 3,
};

function candidateFrets(string, targetPc, minMidi, maxFret) {
  const candidates = [];
  for (let fret = 0; fret <= maxFret; fret += 1) {
    const pc = mod(string.openPc + fret, 12);
    if (pc !== targetPc) continue;
    const midi = OPEN_MIDI[string.index] + fret;
    if (midi > minMidi) candidates.push({ fret, midi });
  }
  return candidates;
}

function lexicographicallyLess(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index];
  }
  return false;
}

function cartesian(groups) {
  return groups.reduce(
    (acc, group) => acc.flatMap((prefix) => group.map((item) => [...prefix, item])),
    [[]],
  );
}

/**
 * Build one root-position drop voicing, at the lowest comfortable placement.
 * Returns null when the 15-fret neck cannot fit the selected combination.
 */
export function buildRootVoicing({
  rootPc,
  qualityId,
  drop = 'drop2',
  rootString = 6,
  maxFret = 15,
}) {
  const quality = getQuality('cuatriad', qualityId);
  const intervals = quality.intervals;
  const stringSet = STRING_SETS[rootString]?.[drop];
  const roles = ROLE_ORDER[drop];

  if (!stringSet || !roles) {
    throw new Error(`Voicing no soportado: ${drop}, cuerda ${rootString}`);
  }

  const rootStringIndex = rootString === 6 ? 5 : 4;
  const rootStringData = STRINGS[rootStringIndex];
  const rootFrets = [];
  for (let fret = 0; fret <= maxFret; fret += 1) {
    if (mod(rootStringData.openPc + fret, 12) === mod(rootPc, 12)) {
      rootFrets.push(fret);
    }
  }

  let best = null;

  for (const rootFret of rootFrets) {
    const rootMidi = OPEN_MIDI[rootStringIndex] + rootFret;
    const groups = stringSet.map((stringIndex, voiceIndex) => {
      if (voiceIndex === 0) {
        return [{ fret: rootFret, midi: rootMidi }];
      }
      const role = roles[voiceIndex];
      const interval = intervals[ROLE_INDEX[role]];
      const targetPc = mod(rootPc + interval, 12);
      return candidateFrets(
        STRINGS[stringIndex],
        targetPc,
        rootMidi,
        maxFret,
      );
    });

    if (groups.some((group) => group.length === 0)) continue;

    for (const combination of cartesian(groups)) {
      const midis = combination.map((item) => item.midi);
      if (!midis.every((midi, index) => index === 0 || midi > midis[index - 1])) {
        continue;
      }

      const frets = combination.map((item) => item.fret);
      // Open strings do not require the fretting hand to stretch. Measure the
      // span only across fretted notes (for example 0-7-7-6 is playable).
      const frettedFrets = frets.filter((fret) => fret > 0);
      const span = frettedFrets.length
        ? Math.max(...frettedFrets) - Math.min(...frettedFrets)
        : 0;
      if (span > 5) continue;

      const distance = frets.reduce(
        (total, fret) => total + Math.abs(fret - rootFret),
        0,
      );
      const score = [span, distance, rootFret, Math.max(...frets)];
      if (!best || lexicographicallyLess(score, best.score)) {
        best = {
          drop,
          rootString,
          rootStringIndex,
          rootFret,
          stringSet: [...stringSet],
          frets,
          span,
          score,
          notes: stringSet.map((stringIndex, index) => {
            const fret = frets[index];
            const pc = mod(STRINGS[stringIndex].openPc + fret, 12);
            return {
              stringIndex,
              string: STRINGS[stringIndex],
              fret,
              pc,
              isRoot: index === 0,
            };
          }),
        };
      }
    }
  }

  if (!best) return null;

  return {
    ...best,
    label: `${drop === 'drop2' ? 'Drop 2' : 'Drop 3'} · raíz ${rootString}ª`,
    activeStrings: STRINGS.map((string) =>
      best.stringSet.includes(string.index),
    ),
  };
}

export { OPEN_MIDI, ROLE_ORDER, STRING_SETS };
