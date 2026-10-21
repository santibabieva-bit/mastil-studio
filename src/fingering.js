/**
 * Build an ergonomic scale fingering: one group of two or three consecutive
 * scale notes per string, chained low E -> high E without skipping degrees.
 *
 * A group may span at most four frets. Three-note groups are scored heavily
 * against whole-tone + whole-tone (2+2); 2+1 and 1+2 are preferred.
 */

import { OPEN_MIDI, STRINGS } from './caged.js';
import { mod } from './theory.js';

const MAX_GROUP_SPAN = 4;
const MIN_GROUP_NOTES = 2;
const MAX_GROUP_NOTES = 3;

function buildScaleIndex(notePcs) {
  const pitchSet = new Set(notePcs.map((pc) => mod(pc, 12)));
  const midis = [];
  for (let midi = 0; midi <= 127; midi += 1) {
    if (pitchSet.has(mod(midi, 12))) midis.push(midi);
  }
  return new Map(midis.map((midi, index) => [midi, index]));
}

function groupPenalty(group, shape) {
  const frets = group.notes.map((note) => note.fret);
  const span = Math.max(...frets) - Math.min(...frets);
  let penalty = span > MAX_GROUP_SPAN ? 1000 : 0;

  if (group.notes.length === 3) {
    const a = frets[1] - frets[0];
    const b = frets[2] - frets[1];
    if (a === 2 && b === 2) penalty += 80;
    else if (a === 1 && b === 1) penalty += 30;
    else if (a === 3 || b === 3) penalty += 15;
  }

  // Prefer three notes per string, but allow two when they avoid a bad pattern
  // or a note outside the CAGED window.
  if (group.notes.length === 2) penalty += 3;
  if (group.notes.length === 1) penalty += 30;

  for (const fret of frets) {
    if (fret < shape.window.start) penalty += (shape.window.start - fret) * 4;
    if (fret > shape.window.end) penalty += (fret - shape.window.end) * 4;
  }

  return penalty;
}

function groupsForString(
  string,
  scaleIndex,
  pitchSet,
  shape,
  startPadding = 0,
  endPadding = 0,
) {
  const minFret = Math.max(0, shape.window.start - startPadding);
  const maxFret = Math.min(15, shape.window.end + endPadding);
  const notes = [];
  for (let fret = minFret; fret <= maxFret; fret += 1) {
    const midi = OPEN_MIDI[string.index] + fret;
    if (!pitchSet.has(mod(midi, 12))) continue;
    notes.push({
      stringIndex: string.index,
      fret,
      midi,
      pc: mod(midi, 12),
      scaleIndex: scaleIndex.get(midi),
    });
  }

  const groups = [];
  for (let start = 0; start < notes.length; start += 1) {
    for (let length = MIN_GROUP_NOTES; length <= MAX_GROUP_NOTES; length += 1) {
      const slice = notes.slice(start, start + length);
      if (slice.length !== length) continue;
      const span = slice[length - 1].fret - slice[0].fret;
      if (span > MAX_GROUP_SPAN) continue;
      // Consecutive entries on one string are consecutive scale degrees.
      if (!slice.every((note, index) => (
        index === 0 || note.scaleIndex === slice[index - 1].scaleIndex + 1
      ))) continue;
      groups.push({
        id: `${string.index}:${start}:${length}`,
        stringIndex: string.index,
        notes: slice,
        firstIndex: slice[0].scaleIndex,
        lastIndex: slice[length - 1].scaleIndex,
      });
    }
  }
  return groups;
}

/**
 * @returns {{notes: object[], groups: object[], score: number} | null}
 */
function buildScaleFingeringWithPadding({
  shape,
  notePcs,
  padding = 0,
  startPadding = padding,
  endPadding = padding,
  anchor = true,
}) {
  if (!shape) return null;
  const pitchSet = new Set(notePcs.map((pc) => mod(pc, 12)));
  const scaleIndex = buildScaleIndex(notePcs);
  const lowToHigh = [...STRINGS].reverse(); // string 6 first
  const groupsByString = lowToHigh.map((string) =>
    groupsForString(string, scaleIndex, pitchSet, shape, startPadding, endPadding),
  );

  if (groupsByString.some((groups) => groups.length === 0)) return null;

  // Anchor the position on the lowest scale note of the shape window. This
  // keeps open-position shapes open (A major A shape starts on E0 and keeps
  // A0/D0) instead of drifting upward just to avoid a 2+2 group.
  const lowStringNotes = [];
  for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
    if (pitchSet.has(mod(STRINGS[5].openPc + fret, 12))) {
      lowStringNotes.push(fret);
    }
  }
  const firstFret = lowStringNotes.length ? lowStringNotes[0] : null;
  const startGroups = !anchor || firstFret === null
    ? groupsByString[0]
    : groupsByString[0].filter((group) => group.notes[0].fret === firstFret);

  if (!startGroups.length) return null;

  let states = startGroups.map((group) => ({
    group,
    path: [group],
    score: groupPenalty(group, shape),
  }));

  for (let layer = 1; layer < groupsByString.length; layer += 1) {
    const next = new Map();
    for (const state of states) {
      for (const group of groupsByString[layer]) {
        const connects = group.firstIndex === state.group.lastIndex + 1
          || group.firstIndex === state.group.lastIndex;
        if (!connects) continue;

        const transitionPenalty = group.firstIndex === state.group.lastIndex ? 3 : 0;
        const score = state.score + groupPenalty(group, shape) + transitionPenalty;
        const current = next.get(group.id);
        if (!current || score < current.score) {
          next.set(group.id, {
            group,
            score,
            path: [...state.path, group],
          });
        }
      }
    }
    if (next.size === 0) return null;
    states = [...next.values()];
  }

  // End on the highest scale note available on the first string inside the
  // shape window. For A major A shape this is G♯ on the 4th fret.
  const highStringNotes = [];
  for (let fret = shape.window.start; fret <= shape.window.end; fret += 1) {
    if (pitchSet.has(mod(STRINGS[0].openPc + fret, 12))) {
      highStringNotes.push(fret);
    }
  }
  if (anchor && highStringNotes.length) {
    const lastFret = highStringNotes[highStringNotes.length - 1];
    const anchored = states.filter((state) =>
      state.group.notes.some((note) => note.fret === lastFret),
    );
    if (anchored.length) states = anchored;
  }

  states.sort((a, b) => a.score - b.score);
  const best = states[0];
  return {
    groups: best.path,
    score: best.score,
    notes: best.path.flatMap((group) => group.notes.map((note) => ({
      stringIndex: note.stringIndex,
      fret: note.fret,
      pc: note.pc,
    }))),
  };
}

export function buildScaleFingering({ shape, notePcs }) {
  // The upper A position is clipped at fret 15; never expand it backward into
  // the G position. Only allow a little forward padding if needed.
  if (shape?.id === 'A' && shape.window.start >= 12) {
    return buildScaleFingeringWithPadding({
      shape,
      notePcs,
      startPadding: 0,
      endPadding: 0,
    })
      ?? buildScaleFingeringWithPadding({
        shape,
        notePcs,
        startPadding: 0,
        endPadding: 1,
      })
      ?? buildScaleFingeringWithPadding({
        shape,
        notePcs,
        startPadding: 0,
        endPadding: 2,
      });
  }

  return buildScaleFingeringWithPadding({ shape, notePcs, padding: 0 })
    ?? buildScaleFingeringWithPadding({ shape, notePcs, padding: 1 })
    ?? buildScaleFingeringWithPadding({ shape, notePcs, padding: 2 })
    ?? buildScaleFingeringWithPadding({ shape, notePcs, padding: 0, anchor: false })
    ?? buildScaleFingeringWithPadding({ shape, notePcs, padding: 1, anchor: false });
}
