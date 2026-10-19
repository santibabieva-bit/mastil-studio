/**
 * Music theory primitives for Mástil Studio.
 * Everything in this module is deterministic and DOM-free so it can be tested in Node.
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const LETTER_PC = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const SOLFEGE = {
  do: 'C',
  re: 'D',
  mi: 'E',
  fa: 'F',
  sol: 'G',
  la: 'A',
  si: 'B',
};

const ACCIDENTAL_SYMBOLS = {
  '-2': '♭♭',
  '-1': '♭',
  0: '',
  1: '♯',
  2: '♯♯',
};

const ACCIDENTAL_VALUES = {
  '': 0,
  '#': 1,
  b: -1,
  '##': 2,
  bb: -2,
  '♯': 1,
  '♭': -1,
  '♯♯': 2,
  '♭♭': -2,
};

export const ROOT_OPTIONS = [
  { value: 'C', pc: 0, label: 'C' },
  { value: 'C#', pc: 1, label: 'C♯' },
  { value: 'Db', pc: 1, label: 'D♭' },
  { value: 'D', pc: 2, label: 'D' },
  { value: 'D#', pc: 3, label: 'D♯' },
  { value: 'Eb', pc: 3, label: 'E♭' },
  { value: 'E', pc: 4, label: 'E' },
  { value: 'F', pc: 5, label: 'F' },
  { value: 'F#', pc: 6, label: 'F♯' },
  { value: 'Gb', pc: 6, label: 'G♭' },
  { value: 'G', pc: 7, label: 'G' },
  { value: 'G#', pc: 8, label: 'G♯' },
  { value: 'Ab', pc: 8, label: 'A♭' },
  { value: 'A', pc: 9, label: 'A' },
  { value: 'A#', pc: 10, label: 'A♯' },
  { value: 'Bb', pc: 10, label: 'B♭' },
  { value: 'B', pc: 11, label: 'B' },
];

function stripAccents(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeAccidentals(value) {
  return String(value)
    .replaceAll('♯', '#')
    .replaceAll('♭', 'b')
    .replaceAll('−', '-');
}

export function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function noteSymbol(letter, accidental) {
  return `${letter}${ACCIDENTAL_SYMBOLS[String(accidental)] ?? ''}`;
}

export function prettyNote(name) {
  return normalizeAccidentals(name)
    .replaceAll('#', '♯')
    .replaceAll('b', '♭');
}

/**
 * Parse a note name in English or Spanish solfège.
 * Accepts ASCII (#/b) and Unicode (♯/♭) accidentals.
 */
export function parseRoot(input) {
  const cleaned = normalizeAccidentals(stripAccents(String(input ?? '').trim()))
    .replaceAll(/\s+/g, '')
    .replace(/^([a-g])/, (_, letter) => letter.toUpperCase());

  const match = cleaned.match(/^(do|re|mi|fa|sol|la|si|[A-G])((?:#|b){0,2})$/i);
  if (!match) {
    throw new Error(`No reconozco la nota «${input}». Probá con A, C#, Bb o La.`);
  }

  let token = match[1];
  if (/^(do|re|mi|fa|sol|la|si)$/i.test(token)) {
    token = SOLFEGE[token.toLowerCase()];
  } else {
    token = token.toUpperCase();
  }

  const accidental = ACCIDENTAL_VALUES[match[2]] ?? 0;
  const pc = mod(LETTER_PC[token] + accidental, 12);

  // Natural F is the one natural root whose key signature is flat (F major
  // has B♭). This preference is only used as an enharmonic fallback for
  // symmetric scales; chord tones still spell by degree.
  const prefer = accidental < 0
    ? 'flat'
    : accidental === 0 && token === 'F'
      ? 'flat'
      : 'sharp';

  return {
    pc,
    letter: token,
    accidental,
    name: noteSymbol(token, accidental),
    input: String(input),
    prefer,
  };
}

export function rootOptionValue(root) {
  const match = ROOT_OPTIONS.find(
    (option) => option.pc === root.pc && parseRoot(option.value).letter === root.letter,
  );
  return match?.value ?? root.name;
}

export function chromaticName(pc, prefer = 'sharp') {
  const names = prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return prettyNote(names[mod(pc, 12)]);
}

/**
 * Spell a pitch class using a required letter. This is what keeps A major as
 * A B C# D E F# G# instead of A B Db D E Gb Ab.
 */
export function spellPitchWithLetter(pc, letter, fallbackPrefer = 'sharp') {
  const natural = LETTER_PC[letter];
  let diff = mod(pc - natural, 12);
  if (diff > 6) diff -= 12;

  if (Math.abs(diff) > 2) {
    const chromatic = chromaticName(pc, fallbackPrefer);
    return {
      name: chromatic,
      accidental: 0,
      letter: chromatic[0],
      fallback: true,
    };
  }

  return {
    name: noteSymbol(letter, diff),
    accidental: diff,
    letter,
    fallback: false,
  };
}

function spellByDegree(root, pc, degreeOffset) {
  const rootIndex = LETTERS.indexOf(root.letter);
  const letter = LETTERS[mod(rootIndex + degreeOffset, 7)];
  return spellPitchWithLetter(pc, letter, root.prefer);
}

const CHORD_LETTER_OFFSETS = {
  0: 0,
  3: 2,
  4: 2,
  6: 4,
  7: 4,
  8: 4,
  9: 6,
  10: 6,
  11: 6,
};

function spellChord(root, intervals) {
  return intervals.map((interval) => {
    const offset = CHORD_LETTER_OFFSETS[interval] ?? 0;
    const spelled = spellByDegree(root, mod(root.pc + interval, 12), offset);
    return {
      pc: mod(root.pc + interval, 12),
      interval,
      degreeOffset: offset,
      ...spelled,
    };
  });
}

function spellScale(root, intervals, sequentialLetters, letterOffsets) {
  if (sequentialLetters && intervals.length === 7) {
    return intervals.map((interval, index) => {
      const spelled = spellByDegree(root, mod(root.pc + interval, 12), index);
      return {
        pc: mod(root.pc + interval, 12),
        interval,
        degree: index + 1,
        ...spelled,
      };
    });
  }

  if (letterOffsets?.length === intervals.length) {
    return intervals.map((interval, index) => {
      const spelled = spellByDegree(
        root,
        mod(root.pc + interval, 12),
        letterOffsets[index],
      );
      return {
        pc: mod(root.pc + interval, 12),
        interval,
        degree: null,
        ...spelled,
      };
    });
  }

  // Symmetric / non-heptatonic collections do not map cleanly onto seven
  // letters. Use a consistent enharmonic spelling and keep the pitch classes
  // exact rather than forcing double accidentals into tiny note circles.
  return intervals.map((interval, index) => {
    const pc = mod(root.pc + interval, 12);
    if (pc === root.pc) {
      return {
        pc,
        interval,
        degree: null,
        name: root.name,
        accidental: root.accidental,
        letter: root.letter,
        fallback: false,
      };
    }
    const name = chromaticName(pc, root.prefer);
    return {
      pc,
      interval,
      degree: null,
      name,
      accidental: 0,
      letter: name[0],
      fallback: true,
      index,
    };
  });
}

export const FAMILY_DEFS = {
  scale: {
    id: 'scale',
    label: 'Escala',
    defaultQuality: 'major',
    qualities: {
      major: {
        id: 'major',
        label: 'Mayor',
        fullLabel: 'Mayor',
        short: 'maj',
        intervals: [0, 2, 4, 5, 7, 9, 11],
        sequentialLetters: true,
        cagedQuality: 'major',
      },
      naturalMinor: {
        id: 'naturalMinor',
        label: 'Menor natural',
        fullLabel: 'Menor natural',
        short: 'm',
        intervals: [0, 2, 3, 5, 7, 8, 10],
        sequentialLetters: true,
        cagedQuality: 'minor',
      },
      harmonicMinor: {
        id: 'harmonicMinor',
        label: 'Menor armónica',
        fullLabel: 'Menor armónica',
        short: 'mHarm',
        intervals: [0, 2, 3, 5, 7, 8, 11],
        sequentialLetters: true,
        cagedQuality: 'minor',
      },
      melodicMinor: {
        id: 'melodicMinor',
        label: 'Menor melódica',
        fullLabel: 'Menor melódica',
        short: 'mMel',
        intervals: [0, 2, 3, 5, 7, 9, 11],
        sequentialLetters: true,
        cagedQuality: 'minor',
      },
      augmented: {
        id: 'augmented',
        label: 'Aumentada',
        fullLabel: 'Aumentada',
        short: 'aug',
        intervals: [0, 3, 4, 7, 8, 11],
        sequentialLetters: false,
        cagedQuality: 'augmented',
      },
      diminished: {
        id: 'diminished',
        label: 'Disminuida',
        fullLabel: 'Disminuida (tono–semitono)',
        short: 'dim',
        intervals: [0, 2, 3, 5, 6, 8, 9, 11],
        sequentialLetters: false,
        cagedQuality: 'diminished',
      },
      pentatonicMajor: {
        id: 'pentatonicMajor',
        label: 'Pentatónica mayor',
        fullLabel: 'Pentatónica mayor',
        short: 'pentMaj',
        intervals: [0, 2, 4, 7, 9],
        sequentialLetters: false,
        letterOffsets: [0, 1, 2, 4, 5],
        cagedQuality: 'major',
      },
      pentatonicMinor: {
        id: 'pentatonicMinor',
        label: 'Pentatónica menor',
        fullLabel: 'Pentatónica menor',
        short: 'pentMin',
        intervals: [0, 3, 5, 7, 10],
        sequentialLetters: false,
        letterOffsets: [0, 2, 3, 4, 6],
        cagedQuality: 'minor',
      },
      blues: {
        id: 'blues',
        label: 'Blues',
        fullLabel: 'Blues',
        short: 'blues',
        intervals: [0, 3, 5, 6, 7, 10],
        sequentialLetters: false,
        letterOffsets: [0, 2, 3, 4, 4, 6],
        cagedQuality: 'minor',
      },
      dorian: {
        id: 'dorian',
        label: 'Dórica',
        fullLabel: 'Dórica',
        short: 'dor',
        intervals: [0, 2, 3, 5, 7, 9, 10],
        sequentialLetters: true,
        cagedQuality: 'minor',
      },
      phrygian: {
        id: 'phrygian',
        label: 'Frigia',
        fullLabel: 'Frigia',
        short: 'phr',
        intervals: [0, 1, 3, 5, 7, 8, 10],
        sequentialLetters: true,
        cagedQuality: 'minor',
      },
      lydian: {
        id: 'lydian',
        label: 'Lidia',
        fullLabel: 'Lidia',
        short: 'lyd',
        intervals: [0, 2, 4, 6, 7, 9, 11],
        sequentialLetters: true,
        cagedQuality: 'major',
      },
      mixolydian: {
        id: 'mixolydian',
        label: 'Mixolidia',
        fullLabel: 'Mixolidia',
        short: 'mix',
        intervals: [0, 2, 4, 5, 7, 9, 10],
        sequentialLetters: true,
        cagedQuality: 'major',
      },
      locrian: {
        id: 'locrian',
        label: 'Locria',
        fullLabel: 'Locria',
        short: 'loc',
        intervals: [0, 1, 3, 5, 6, 8, 10],
        sequentialLetters: true,
        cagedQuality: 'minor',
      },
    },
  },
  triad: {
    id: 'triad',
    label: 'Triada',
    defaultQuality: 'major',
    qualities: {
      major: {
        id: 'major',
        label: 'Mayor',
        fullLabel: 'Mayor',
        short: 'maj',
        intervals: [0, 4, 7],
        sequentialLetters: false,
        cagedQuality: 'major',
      },
      minor: {
        id: 'minor',
        label: 'Menor',
        fullLabel: 'Menor',
        short: 'm',
        intervals: [0, 3, 7],
        sequentialLetters: false,
        cagedQuality: 'minor',
      },
      augmented: {
        id: 'augmented',
        label: 'Aumentada',
        fullLabel: 'Aumentada',
        short: 'aug',
        intervals: [0, 4, 8],
        sequentialLetters: false,
        cagedQuality: 'augmented',
      },
      diminished: {
        id: 'diminished',
        label: 'Disminuida',
        fullLabel: 'Disminuida',
        short: 'dim',
        intervals: [0, 3, 6],
        sequentialLetters: false,
        cagedQuality: 'diminished',
      },
    },
  },
  cuatriad: {
    id: 'cuatriad',
    label: 'Cuatríada',
    defaultQuality: 'major7',
    qualities: {
      major7: {
        id: 'major7',
        label: 'Mayor 7',
        fullLabel: 'Mayor séptima',
        short: 'maj7',
        intervals: [0, 4, 7, 11],
        sequentialLetters: false,
        cagedQuality: 'major',
      },
      minor7: {
        id: 'minor7',
        label: 'Menor 7',
        fullLabel: 'Menor séptima',
        short: 'm7',
        intervals: [0, 3, 7, 10],
        sequentialLetters: false,
        cagedQuality: 'minor',
      },
      dominant7: {
        id: 'dominant7',
        label: 'Dominante 7',
        fullLabel: 'Dominante 7',
        short: '7',
        intervals: [0, 4, 7, 10],
        sequentialLetters: false,
        cagedQuality: 'major',
      },
      halfDiminished7: {
        id: 'halfDiminished7',
        label: 'Semidisminuida 7',
        fullLabel: 'Semidisminuida (m7♭5)',
        short: 'm7♭5',
        intervals: [0, 3, 6, 10],
        sequentialLetters: false,
        cagedQuality: 'diminished',
      },
      diminished7: {
        id: 'diminished7',
        label: 'Disminuido 7',
        fullLabel: 'Séptima disminuida',
        short: 'dim7',
        intervals: [0, 3, 6, 9],
        sequentialLetters: false,
        cagedQuality: 'diminished',
      },
      minorMajor7: {
        id: 'minorMajor7',
        label: 'Menor mayor 7',
        fullLabel: 'Menor con séptima mayor',
        short: 'mMaj7',
        intervals: [0, 3, 7, 11],
        sequentialLetters: false,
        cagedQuality: 'minor',
      },
    },
  },
  arpeggio: {
    id: 'arpeggio',
    label: 'Arpegio',
    defaultQuality: 'major7',
    qualities: {
      major7: {
        id: 'major7',
        label: 'Mayor 7',
        fullLabel: 'Mayor séptima',
        short: 'maj7',
        intervals: [0, 4, 7, 11],
        sequentialLetters: false,
        cagedQuality: 'major',
      },
      minor7: {
        id: 'minor7',
        label: 'Menor 7',
        fullLabel: 'Menor séptima',
        short: 'm7',
        intervals: [0, 3, 7, 10],
        sequentialLetters: false,
        cagedQuality: 'minor',
      },
      dominant7: {
        id: 'dominant7',
        label: 'Dominante 7',
        fullLabel: 'Séptima dominante',
        short: '7',
        intervals: [0, 4, 7, 10],
        sequentialLetters: false,
        cagedQuality: 'major',
      },
      augmented7: {
        id: 'augmented7',
        label: 'Aumentado 7',
        fullLabel: 'Séptima aumentada',
        short: '7#5',
        intervals: [0, 4, 8, 10],
        sequentialLetters: false,
        cagedQuality: 'augmented',
      },
      diminished7: {
        id: 'diminished7',
        label: 'Disminuido 7',
        fullLabel: 'Séptima disminuida',
        short: 'dim7',
        intervals: [0, 3, 6, 9],
        sequentialLetters: false,
        cagedQuality: 'diminished',
      },
    },
  },
};

export const TRIAD_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  augmented: [0, 4, 8],
  diminished: [0, 3, 6],
};

export function getFamily(familyId) {
  return FAMILY_DEFS[familyId] ?? FAMILY_DEFS.scale;
}

export function getQuality(familyId, qualityId) {
  const family = getFamily(familyId);
  return family.qualities[qualityId] ?? family.qualities[family.defaultQuality];
}

export function qualityOptions(familyId) {
  const family = getFamily(familyId);
  return Object.values(family.qualities).map(({ id, label }) => ({ id, label }));
}

export function resolveQuality(familyId, qualityId) {
  const family = getFamily(familyId);
  if (family.qualities[qualityId]) return qualityId;
  return family.defaultQuality;
}

/**
 * Build a fully spelled, fretboard-ready note collection.
 */
export function createNoteCollection(rootInput, familyId, qualityId) {
  const root = typeof rootInput === 'string' ? parseRoot(rootInput) : rootInput;
  const family = getFamily(familyId);
  const quality = getQuality(family.id, qualityId);
  const notes =
    family.id === 'scale'
      ? spellScale(
        root,
        quality.intervals,
        quality.sequentialLetters,
        quality.letterOffsets,
      )
      : spellChord(root, quality.intervals);

  const noteByPc = new Map();
  for (const note of notes) {
    note.isRoot = note.pc === root.pc;
    if (!noteByPc.has(note.pc)) noteByPc.set(note.pc, note);
  }

  const title = buildTitle(root, family, quality);

  return {
    root,
    family,
    quality,
    notes,
    noteByPc,
    title,
    subtitle: notes.map((note) => note.name).join(' · '),
    cagedTriad: TRIAD_INTERVALS[quality.cagedQuality] ?? TRIAD_INTERVALS.major,
    cagedQuality: quality.cagedQuality,
  };
}

export function buildTitle(root, family, quality) {
  const rootName = root.name;
  if (family.id === 'scale') {
    return `Escala ${quality.fullLabel.toLowerCase()} de ${rootName}`;
  }
  if (family.id === 'triad') {
    return `Triada ${quality.fullLabel.toLowerCase()} de ${rootName}`;
  }
  if (family.id === 'cuatriad') {
    return `Cuatríada ${quality.fullLabel.toLowerCase()} de ${rootName}`;
  }
  return `Arpegio ${quality.fullLabel.toLowerCase()} de ${rootName}`;
}

export function notePcList(notes) {
  return notes.map((note) => note.pc);
}

export function formatPc(pc, prefer = 'sharp') {
  return chromaticName(pc, prefer);
}
