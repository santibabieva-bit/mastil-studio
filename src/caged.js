/**
 * CAGED geometry and standard tuning.
 *
 * String indexes are visual: 0 is the high E (top line), 5 is the low E
 * (bottom line). A fret of 0 means the open string.
 */

import { mod, TRIAD_INTERVALS } from './theory.js';

export const STRINGS = [
  { index: 0, number: 1, label: 'e', note: 'E', openPc: 4, thickness: 1.25 },
  { index: 1, number: 2, label: 'B', note: 'B', openPc: 11, thickness: 1.8 },
  { index: 2, number: 3, label: 'G', note: 'G', openPc: 7, thickness: 2.35 },
  { index: 3, number: 4, label: 'D', note: 'D', openPc: 2, thickness: 2.9 },
  { index: 4, number: 5, label: 'A', note: 'A', openPc: 9, thickness: 3.65 },
  { index: 5, number: 6, label: 'E', note: 'E', openPc: 4, thickness: 4.35 },
];

export const OPEN_MIDI = [64, 59, 55, 50, 45, 40];

const MAJOR_TEMPLATES = {
  C: {
    id: 'C',
    anchorString: 4,
    offsets: { 4: 0, 3: -1, 2: -3, 1: -2, 0: -3 },
    window: [-3, 0],
    anchorLabel: '5ª cuerda',
  },
  A: {
    id: 'A',
    anchorString: 4,
    offsets: { 4: 0, 3: 2, 2: 2, 1: 2, 0: 0 },
    // Include fret 4 on the lower strings: F♯ on D/4 and C♯ on A/4 belong
    // to the A-major A-position and were being cut off by a 0–3 window.
    window: [0, 4],
    anchorLabel: '5ª cuerda',
  },
  G: {
    id: 'G',
    anchorString: 5,
    offsets: { 5: 0, 4: -1, 3: -3, 2: -3, 1: -3, 0: 0 },
    window: [-3, 0],
    anchorLabel: '6ª cuerda',
  },
  E: {
    id: 'E',
    anchorString: 5,
    offsets: { 5: 0, 4: 2, 3: 2, 2: 1, 1: 0, 0: 0 },
    // The E major shape extends one fret below the chord grip. For A major
    // this is the 4th-fret row (G#, C#, F#, B, G#) that completes the pattern.
    window: [-1, 2],
    anchorLabel: '6ª cuerda',
  },
  D: {
    id: 'D',
    anchorString: 3,
    offsets: { 3: 0, 2: 2, 1: 3, 0: 2 },
    window: [0, 3],
    anchorLabel: '4ª cuerda',
  },
};

const MINOR_TEMPLATES = {
  C: {
    id: 'C',
    anchorString: 4,
    offsets: { 4: 0, 3: -2, 2: -3, 1: -2, 0: 0 },
    window: [-3, 0],
    anchorLabel: '5ª cuerda',
  },
  A: {
    id: 'A',
    anchorString: 4,
    offsets: { 4: 0, 3: 2, 2: 2, 1: 1, 0: 0 },
    window: [0, 3],
    anchorLabel: '5ª cuerda',
  },
  G: {
    id: 'G',
    anchorString: 5,
    offsets: { 5: 0, 4: -2, 3: -3, 2: 0, 1: 0, 0: 0 },
    window: [-3, 0],
    anchorLabel: '6ª cuerda',
  },
  E: {
    id: 'E',
    anchorString: 5,
    offsets: { 5: 0, 4: 2, 3: 2, 2: 0, 1: 0, 0: 0 },
    window: [0, 3],
    anchorLabel: '6ª cuerda',
  },
  D: {
    id: 'D',
    anchorString: 3,
    offsets: { 3: 0, 2: 2, 1: 3, 0: 1 },
    window: [0, 3],
    anchorLabel: '4ª cuerda',
  },
};

export const CAGED_ORDER = ['C', 'A', 'G', 'E', 'D'];

export const CAGED_META = {
  C: { label: 'C', longLabel: 'Forma C', hint: 'Tónica en 5ª cuerda' },
  A: { label: 'A', longLabel: 'Forma A', hint: 'Tónica en 5ª y 1ª cuerda' },
  G: { label: 'G', longLabel: 'Forma G', hint: 'Tónica en 6ª y 1ª cuerda' },
  E: { label: 'E', longLabel: 'Forma E', hint: 'Tónica en 6ª cuerda' },
  D: { label: 'D', longLabel: 'Forma D', hint: 'Tónica en 4ª cuerda' },
};

function rootFretOnString(rootPc, openPc) {
  return mod(rootPc - openPc, 12);
}

function anchorFret(shapeId, rootPc) {
  if (shapeId === 'C') {
    let fret = rootFretOnString(rootPc, 9);
    if (fret < 3) fret += 12;
    return fret;
  }

  if (shapeId === 'A') {
    return rootFretOnString(rootPc, 9);
  }

  if (shapeId === 'G') {
    let fret = rootFretOnString(rootPc, 4);
    if (fret < 3) fret += 12;
    return fret;
  }

  if (shapeId === 'E') {
    return rootFretOnString(rootPc, 4);
  }

  return rootFretOnString(rootPc, 2);
}

function findNearestFret(baseFret, stringOpenPc, targetPcs) {
  for (let radius = 0; radius <= 3; radius += 1) {
    const candidates = radius === 0 ? [0] : [-radius, radius];
    for (const delta of candidates) {
      const fret = baseFret + delta;
      if (fret < 0 || fret > 15) continue;
      const pc = mod(stringOpenPc + fret, 12);
      if (targetPcs.has(pc)) return fret;
    }
  }
  return null;
}

function snapOffsetsToQuality(offsets, anchor, quality, rootPc, anchorString) {
  if (quality !== 'augmented' && quality !== 'diminished') {
    return { ...offsets };
  }

  const targetPcs = new Set(
    TRIAD_INTERVALS[quality].map((interval) => mod(rootPc + interval, 12)),
  );
  const adjusted = {};

  for (const [stringIndex, offset] of Object.entries(offsets)) {
    const index = Number(stringIndex);
    const string = STRINGS[index];
    if (!string) continue;

    // The anchor string is the root and must stay put. Other strings may have
    // a zero offset too (for example the high E in the A shape); those notes
    // still need to be snapped to the requested quality.
    if (index === anchorString) {
      adjusted[index] = anchor;
      continue;
    }

    const fret = findNearestFret(
      anchor + offset,
      string.openPc,
      targetPcs,
    );

    // If no chord tone is reachable without a giant stretch, mute that string
    // rather than drawing a wrong note.
    if (fret !== null) adjusted[index] = fret;
  }

  return adjusted;
}

export function getCagedShape(shapeId, rootPc, quality = 'major') {
  if (!CAGED_ORDER.includes(shapeId)) {
    throw new Error(`Forma CAGED desconocida: ${shapeId}`);
  }

  const useMinor = quality === 'minor';
  const baseTemplate = (useMinor ? MINOR_TEMPLATES : MAJOR_TEMPLATES)[shapeId];
  const anchor = anchorFret(shapeId, rootPc);
  const offsets = snapOffsetsToQuality(
    baseTemplate.offsets,
    anchor,
    quality,
    rootPc,
    baseTemplate.anchorString,
  );

  const notes = Object.entries(offsets)
    .map(([stringIndex, absoluteOrOffset]) => {
      const index = Number(stringIndex);
      const string = STRINGS[index];
      const fret = quality === 'augmented' || quality === 'diminished'
        ? absoluteOrOffset
        : anchor + absoluteOrOffset;
      return {
        stringIndex: index,
        string,
        fret,
        pc: mod(string.openPc + fret, 12),
        isRoot: mod(string.openPc + fret, 12) === rootPc,
      };
    })
    .filter((note) => note.fret >= 0 && note.fret <= 15)
    .sort((a, b) => a.stringIndex - b.stringIndex);

  let windowStartFret = anchor + baseTemplate.window[0];
  let windowEndFret = anchor + baseTemplate.window[1];

  // At the open E shape there is no fret below zero. Open the position upward
  // instead so the E major (and its modified qualities) pattern still has two
  // or three notes per string.
  if (shapeId === 'E' && quality !== 'minor' && anchor === 0) {
    windowStartFret = 0;
    windowEndFret = 4;
  }

  const windowStart = Math.max(0, windowStartFret);
  const windowEnd = Math.min(15, windowEndFret);

  const mids = notes.map((note) => note.fret);
  const minFret = Math.min(...mids);
  const maxFret = Math.max(...mids);

  return {
    id: shapeId,
    ...CAGED_META[shapeId],
    quality,
    anchor,
    anchorString: baseTemplate.anchorString,
    anchorLabel: baseTemplate.anchorLabel,
    notes,
    window: {
      start: windowStart,
      end: windowEnd,
    },
    fretSpan: [minFret, maxFret],
  };
}

export function getAllCagedShapes(rootPc, quality = 'major') {
  return CAGED_ORDER.map((shapeId) => getCagedShape(shapeId, rootPc, quality));
}

/**
 * Expand a CAGED scale window until:
 * 1. every string has at least two scale notes, and
 * 2. the union of notes across strings is a continuous run of scale degrees.
 *
 * The second rule is the "no huecos" guarantee. For A major, A shape, the
 * window must reach fret 4 to include F♯ on D/4 between E3 (D/2) and G♯3 (G/1).
 * C shape in A minor pentatonic is the other canonical example: the C at B/13
 * completes the position.
 */
export function completeScaleWindow(
  shape,
  notePcs,
  { minPerString = 2, maxFret = 15, maxSpan = 6 } = {},
) {
  const pitchSet = new Set(notePcs.map((pc) => mod(pc, 12)));
  let start = shape.window.start;
  let end = shape.window.end;

  const countForString = (string, from, to) => {
    let count = 0;
    for (let fret = from; fret <= to; fret += 1) {
      if (pitchSet.has(mod(string.openPc + fret, 12))) count += 1;
    }
    return count;
  };

  const counts = () =>
    STRINGS.map((string) => countForString(string, start, end));

  while (counts().some((count) => count < minPerString)) {
    if (end - start + 1 >= maxSpan) break;

    const current = counts();
    const scoreSide = (fret) => {
      let deficientGain = 0;
      let added = 0;
      for (const string of STRINGS) {
        if (!pitchSet.has(mod(string.openPc + fret, 12))) continue;
        added += 1;
        const index = string.index;
        if (current[index] < minPerString) deficientGain += 1;
      }
      return { deficientGain, added };
    };

    const endScore = end < maxFret ? scoreSide(end + 1) : null;
    const startScore = start > 0 ? scoreSide(start - 1) : null;

    const candidates = [
      endScore ? { side: 'end', ...endScore } : null,
      startScore ? { side: 'start', ...startScore } : null,
    ].filter(Boolean);

    if (!candidates.length) break;

    candidates.sort((a, b) => {
      if (b.deficientGain !== a.deficientGain) {
        return b.deficientGain - a.deficientGain;
      }
      if (a.added !== b.added) return a.added - b.added;
      return a.side === 'end' ? -1 : 1;
    });

    if (candidates[0].deficientGain === 0) break;

    if (candidates[0].side === 'end') end += 1;
    else start -= 1;
  }

  // A scale position is only complete if its notes form a continuous run of
  // scale degrees. If two adjacent notes in pitch order skip one or more
  // degrees, extend the window toward the missing note until there are no
  // holes (or the playable span limit is reached).
  const orderedPcs = notePcs.map((pc) => mod(pc, 12));
  const stepSet = new Set(
    orderedPcs.map((pc, index) =>
      mod(orderedPcs[(index + 1) % orderedPcs.length] - pc, 12),
    ),
  );

  const midisInWindow = (from, to) => {
    const midis = [];
    for (const string of STRINGS) {
      for (let fret = from; fret <= to; fret += 1) {
        if (pitchSet.has(mod(string.openPc + fret, 12))) {
          midis.push(OPEN_MIDI[string.index] + fret);
        }
      }
    }
    return midis.sort((a, b) => a - b);
  };

  const gapCount = (from = start, to = end) => {
    const midis = midisInWindow(from, to);
    let gaps = 0;
    for (let index = 1; index < midis.length; index += 1) {
      const interval = midis[index] - midis[index - 1];
      if (interval > 0 && !stepSet.has(interval)) gaps += 1;
    }
    return gaps;
  };

  const addedAt = (fret) =>
    STRINGS.reduce(
      (total, string) =>
        total + (pitchSet.has(mod(string.openPc + fret, 12)) ? 1 : 0),
      0,
    );

  while (gapCount() > 0 && end - start + 1 < maxSpan) {
    const currentGaps = gapCount();
    const candidates = [];

    if (end < maxFret) {
      candidates.push({
        side: 'end',
        gaps: gapCount(start, end + 1),
        added: addedAt(end + 1),
      });
    }
    if (start > 0) {
      candidates.push({
        side: 'start',
        gaps: gapCount(start - 1, end),
        added: addedAt(start - 1),
      });
    }

    if (!candidates.length) break;

    candidates.sort((a, b) => {
      if (a.gaps !== b.gaps) return a.gaps - b.gaps;
      if (a.added !== b.added) return b.added - a.added;
      return a.side === 'end' ? -1 : 1;
    });

    const best = candidates[0];
    if (best.gaps >= currentGaps && best.added === 0) break;

    if (best.side === 'end') end += 1;
    else start -= 1;
  }

  return {
    ...shape,
    window: { start, end },
    windowExtended: start !== shape.window.start || end !== shape.window.end,
  };
}

export function isFretInWindow(fret, window) {
  if (!window) return true;
  return fret >= window.start && fret <= window.end;
}

/**
 * Every note of a pitch-class collection inside frets 0..15, grouped by string.
 */
export function buildFretboard(rootPc, notePcs, options = {}) {
  const {
    includeOpen = true,
    maxFret = 15,
    activeStrings = STRINGS.map(() => true),
  } = options;
  const pitchSet = new Set(notePcs.map((pc) => mod(pc, 12)));
  const startFret = includeOpen ? 0 : 1;

  return STRINGS.map((string) => {
    const active = activeStrings[string.index] !== false;
    const notes = [];

    if (active) {
      for (let fret = startFret; fret <= maxFret; fret += 1) {
        const pc = mod(string.openPc + fret, 12);
        if (!pitchSet.has(pc)) continue;
        notes.push({
          stringIndex: string.index,
          string,
          fret,
          pc,
          isRoot: pc === mod(rootPc, 12),
        });
      }
    }

    return {
      string,
      active,
      notes,
    };
  });
}

/**
 * Pitch-class set for the underlying triad represented by a CAGED form.
 */
export function cagedTriadPcs(rootPc, quality) {
  const intervals = TRIAD_INTERVALS[quality] ?? TRIAD_INTERVALS.major;
  return intervals.map((interval) => mod(rootPc + interval, 12));
}
