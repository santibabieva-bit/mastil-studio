/**
 * Acordes: tipos, símbolos, detección, tonalidades, acordes diatónicos,
 * formas de guitarra (abiertas y móviles), voicings por juegos de cuerdas,
 * cejilla y transposición.
 */

import {
  createNoteCollection,
  mod,
  parseRoot,
  pcName,
  prettyNote,
} from './music.js';

export const CHORD_TYPES = {
  maj: { id: 'maj', symbol: '', name: 'mayor', intervals: [0, 4, 7] },
  m: { id: 'm', symbol: 'm', name: 'menor', intervals: [0, 3, 7] },
  dim: { id: 'dim', symbol: 'dim', name: 'disminuido', intervals: [0, 3, 6] },
  aug: { id: 'aug', symbol: 'aug', name: 'aumentado', intervals: [0, 4, 8] },
  sus2: { id: 'sus2', symbol: 'sus2', name: 'sus2', intervals: [0, 2, 7] },
  sus4: { id: 'sus4', symbol: 'sus4', name: 'sus4', intervals: [0, 5, 7] },
  5: { id: '5', symbol: '5', name: 'power chord', intervals: [0, 7] },
  6: { id: '6', symbol: '6', name: 'sexta', intervals: [0, 4, 7, 9] },
  m6: { id: 'm6', symbol: 'm6', name: 'menor sexta', intervals: [0, 3, 7, 9] },
  7: { id: '7', symbol: '7', name: 'dominante 7', intervals: [0, 4, 7, 10] },
  maj7: { id: 'maj7', symbol: 'maj7', name: 'mayor 7', intervals: [0, 4, 7, 11] },
  m7: { id: 'm7', symbol: 'm7', name: 'menor 7', intervals: [0, 3, 7, 10] },
  m7b5: { id: 'm7b5', symbol: 'm7♭5', name: 'semidisminuido', intervals: [0, 3, 6, 10] },
  dim7: { id: 'dim7', symbol: 'dim7', name: 'disminuido 7', intervals: [0, 3, 6, 9] },
  mMaj7: { id: 'mMaj7', symbol: 'm(maj7)', name: 'menor mayor 7', intervals: [0, 3, 7, 11] },
  '7sus4': { id: '7sus4', symbol: '7sus4', name: '7sus4', intervals: [0, 5, 7, 10] },
  add9: { id: 'add9', symbol: 'add9', name: 'add9', intervals: [0, 2, 4, 7] },
  9: { id: '9', symbol: '9', name: 'dominante 9', intervals: [0, 2, 4, 7, 10] },
  maj9: { id: 'maj9', symbol: 'maj9', name: 'mayor 9', intervals: [0, 2, 4, 7, 11] },
  m9: { id: 'm9', symbol: 'm9', name: 'menor 9', intervals: [0, 2, 3, 7, 10] },
  '7#5': { id: '7#5', symbol: '7♯5', name: 'dominante 7♯5', intervals: [0, 4, 8, 10] },
};

const SUFFIX_ALIASES = {
  '': 'maj', maj: 'maj', M: 'maj', mayor: 'maj',
  m: 'm', min: 'm', '-': 'm', menor: 'm',
  dim: 'dim', '°': 'dim', o: 'dim',
  aug: 'aug', '+': 'aug',
  sus2: 'sus2', sus4: 'sus4', sus: 'sus4',
  5: '5',
  6: '6', m6: 'm6', min6: 'm6',
  7: '7', dom7: '7',
  maj7: 'maj7', M7: 'maj7', '△': 'maj7', Δ: 'maj7', '△7': 'maj7', Δ7: 'maj7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  m7b5: 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'min7b5': 'm7b5',
  dim7: 'dim7', '°7': 'dim7', o7: 'dim7',
  mMaj7: 'mMaj7', 'm(maj7)': 'mMaj7', mM7: 'mMaj7', 'm△7': 'mMaj7',
  '7sus4': '7sus4', '7sus': '7sus4',
  add9: 'add9', 2: 'add9',
  9: '9', maj9: 'maj9', M9: 'maj9', m9: 'm9',
  '7#5': '7#5', '7+': '7#5', aug7: '7#5',
};

function normSuffix(raw) {
  return raw.replaceAll('♭', 'b').replaceAll('♯', '#').replaceAll(/\s+/g, '');
}

export function chordSymbol(rootName, typeId, bassName = null) {
  const type = CHORD_TYPES[typeId];
  const base = `${prettyNote(rootName)}${type?.symbol ?? ''}`;
  return bassName ? `${base}/${prettyNote(bassName)}` : base;
}

/**
 * Interpreta «F#m7b5», «Sol», «Bb/D», «Am», «C7»… Devuelve null si no entiende.
 */
export function parseChordSymbol(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  const [main, bassText] = text.split('/');
  const match = main.match(/^(do|re|mi|fa|sol|la|si|[A-Ga-g])([#b♯♭]{0,2})(.*)$/i);
  if (!match) return null;
  let rootToken = match[1];
  // «Bb», «Eb»: la «b» ya cae en el grupo de alteraciones salvo ambigüedad con «Sib».
  let root;
  try {
    root = parseRoot(`${rootToken}${match[2]}`);
  } catch {
    return null;
  }
  const rawSuffix = normSuffix(match[3]);
  const typeId = SUFFIX_ALIASES[rawSuffix] ?? SUFFIX_ALIASES[rawSuffix.toLowerCase()];
  if (!typeId) return null;
  let bass = null;
  if (bassText) {
    try {
      bass = parseRoot(bassText);
    } catch {
      bass = null;
    }
  }
  return {
    root,
    rootPc: root.pc,
    rootName: root.name,
    typeId,
    type: CHORD_TYPES[typeId],
    bassPc: bass ? bass.pc : null,
    bassName: bass ? bass.name : null,
    symbol: chordSymbol(root.name, typeId, bass?.name ?? null),
  };
}

export function chordPcs(rootPc, typeId) {
  return CHORD_TYPES[typeId].intervals.map((i) => mod(rootPc + i, 12));
}

/** Nombres de las notas de un acorde con ortografía por intervalo. */
export function chordNoteNames(rootName, typeId) {
  const collection = createNoteCollection(rootName, 'triad', 'major');
  const root = collection.root;
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const letterOffset = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6 };
  const naturals = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return CHORD_TYPES[typeId].intervals.map((interval) => {
    const letter = letters[(letters.indexOf(root.letter) + (letterOffset[interval] ?? 0)) % 7];
    const pc = mod(root.pc + interval, 12);
    let diff = mod(pc - naturals[letter], 12);
    if (diff > 6) diff -= 12;
    if (Math.abs(diff) > 2) return pcName(pc, root.prefer);
    return `${letter}${diff === 0 ? '' : diff > 0 ? '♯'.repeat(diff) : '♭'.repeat(-diff)}`;
  });
}

/**
 * Detecta posibles acordes a partir de clases de altura. `bassPc` es la nota
 * más grave (para inversiones). Devuelve candidatos ordenados.
 */
export function detectChords(pcs, bassPc = null, prefer = 'sharp') {
  const set = [...new Set(pcs.map((p) => mod(p, 12)))];
  if (set.length < 2) return [];
  const found = [];
  for (const rootPc of set) {
    const intervals = new Set(set.map((p) => mod(p - rootPc, 12)));
    for (const type of Object.values(CHORD_TYPES)) {
      if (type.intervals.length !== intervals.size) continue;
      if (!type.intervals.every((i) => intervals.has(i))) continue;
      const rootName = pcName(rootPc, prefer);
      const slash = bassPc != null && bassPc !== rootPc;
      found.push({
        rootPc,
        rootName,
        typeId: type.id,
        bassPc: slash ? bassPc : null,
        symbol: chordSymbol(rootName, type.id, slash ? pcName(bassPc, prefer) : null),
        name: `${rootName} ${type.name}${slash ? ` (bajo ${pcName(bassPc, prefer)})` : ''}`,
        score:
          (slash ? 20 : 0)
          + (bassPc != null && bassPc === rootPc ? -10 : 0)
          + (type.id === '5' ? 6 : 0)
          + (['sus2', 'sus4', 'add9', '6', 'm6', '7sus4'].includes(type.id) ? 3 : 0)
          + (type.id === 'dim7' ? 4 : 0)
          + type.intervals.length * 0.1,
      });
    }
  }
  found.sort((a, b) => a.score - b.score);
  return found;
}

/* ───────────── Acordes diatónicos y numerales romanos ───────────── */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];

function classify(third, fifth, seventh) {
  const t = `${third},${fifth}`;
  if (seventh == null) {
    if (t === '4,7') return 'maj';
    if (t === '3,7') return 'm';
    if (t === '3,6') return 'dim';
    if (t === '4,8') return 'aug';
    return null;
  }
  const q = `${third},${fifth},${seventh}`;
  const table = {
    '4,7,11': 'maj7', '4,7,10': '7', '3,7,10': 'm7', '3,6,10': 'm7b5',
    '3,6,9': 'dim7', '3,7,11': 'mMaj7', '4,8,11': 'maj7', '4,8,10': '7#5',
  };
  return table[q] ?? null;
}

function romanFor(degreeIndex, interval, typeId) {
  const diff = interval - MAJOR_DEGREES[degreeIndex];
  const acc = diff < 0 ? '♭'.repeat(-diff) : diff > 0 ? '♯'.repeat(diff) : '';
  const minorish = ['m', 'dim', 'm7', 'm7b5', 'dim7', 'mMaj7', 'm6'].includes(typeId);
  const base = minorish ? ROMAN[degreeIndex].toLowerCase() : ROMAN[degreeIndex];
  const suffix = {
    dim: '°', aug: '+', maj7: 'maj7', 7: '7', m7: '7', m7b5: 'ø7', dim7: '°7', mMaj7: 'maj7', '7#5': '+7',
  }[typeId] ?? '';
  return `${acc}${base}${suffix}`;
}

/**
 * Acordes diatónicos de cualquier escala de 7 notas.
 * `seventh` apila cuatríadas en lugar de tríadas.
 */
export function diatonicChords(rootName, qualityId = 'major', seventh = false) {
  const collection = createNoteCollection(rootName, 'scale', qualityId);
  if (collection.notes.length !== 7) return [];
  const pcs = collection.notes.map((n) => n.pc);
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const rootPc = pcs[i];
    const third = mod(pcs[(i + 2) % 7] - rootPc, 12);
    const fifth = mod(pcs[(i + 4) % 7] - rootPc, 12);
    const sev = seventh ? mod(pcs[(i + 6) % 7] - rootPc, 12) : null;
    const typeId = classify(third, fifth, sev);
    if (!typeId) continue;
    const note = collection.notes[i];
    out.push({
      degree: i + 1,
      rootPc,
      rootName: note.name,
      typeId,
      symbol: chordSymbol(note.name, typeId),
      roman: romanFor(i, collection.notes[i].interval, typeId),
      interval: collection.notes[i].interval,
      notes: chordNoteNames(note.name, typeId),
    });
  }
  return out;
}

/** Puntúa tonalidades candidatas a partir de una lista de símbolos de acorde. */
export function findKeys(symbols) {
  const chords = symbols.map(parseChordSymbol).filter(Boolean);
  if (!chords.length) return [];
  const results = [];
  const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  for (const rootName of roots) {
    for (const mode of [{ id: 'major', label: 'mayor' }, { id: 'naturalMinor', label: 'menor' }]) {
      const triads = diatonicChords(rootName, mode.id, false);
      const sevenths = diatonicChords(rootName, mode.id, true);
      // En menor aceptamos también la dominante armónica (V mayor / V7).
      const extras = [];
      if (mode.id === 'naturalMinor') {
        const root = parseRoot(rootName);
        const vPc = mod(root.pc + 7, 12);
        extras.push({ rootPc: vPc, typeId: 'maj' }, { rootPc: vPc, typeId: '7' });
      }
      let hits = 0;
      const detail = chords.map((chord) => {
        const inKey =
          triads.some((t) => t.rootPc === chord.rootPc && sameFamily(t.typeId, chord.typeId))
          || sevenths.some((t) => t.rootPc === chord.rootPc && t.typeId === chord.typeId)
          || extras.some((e) => e.rootPc === chord.rootPc && sameFamily(e.typeId, chord.typeId));
        if (inKey) hits += 1;
        return { symbol: chord.symbol, inKey };
      });
      const tonic = triads[0];
      let score = hits / chords.length;
      if (chords[0].rootPc === tonic.rootPc) score += 0.08;
      if (chords[chords.length - 1].rootPc === tonic.rootPc) score += 0.12;
      if (hits === chords.length) score += 0.2;
      results.push({
        rootName,
        mode: mode.id,
        label: `${prettyNote(rootName)} ${mode.label}`,
        score,
        hits,
        total: chords.length,
        detail,
        chords: triads,
      });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function sameFamily(diatonicType, chordType) {
  const group = (t) => {
    if (['maj', 'maj7', '6', 'add9', 'maj9', 'sus2', 'sus4', '5'].includes(t)) return 'maj';
    if (['m', 'm7', 'm6', 'm9', 'mMaj7'].includes(t)) return 'm';
    if (['dim', 'dim7', 'm7b5'].includes(t)) return 'dim';
    if (['7', '9', '7sus4'].includes(t)) return '7';
    if (['aug', '7#5'].includes(t)) return 'aug';
    return t;
  };
  return group(diatonicType) === group(chordType);
}

/* ───────────── Transposición y cejilla ───────────── */

export function transposeSymbol(symbol, semitones, prefer = 'sharp') {
  const chord = parseChordSymbol(symbol);
  if (!chord) return symbol;
  const rootName = pcName(mod(chord.rootPc + semitones, 12), prefer);
  const bassName = chord.bassPc != null ? pcName(mod(chord.bassPc + semitones, 12), prefer) : null;
  return chordSymbol(rootName, chord.typeId, bassName);
}

/** Preferencia sostenido/bemol razonable para una tonalidad destino. */
export function preferForKey(rootName) {
  const flatKeys = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm']);
  return flatKeys.has(rootName) || /b$/.test(rootName) ? 'flat' : 'sharp';
}

const EASY_OPEN = new Set([
  'C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm', 'E7', 'A7', 'D7', 'G7', 'C7', 'B7',
  'Cmaj7', 'Amaj7', 'Dmaj7', 'Fmaj7', 'Gmaj7', 'Em7', 'Am7', 'Dm7', 'Asus2', 'Asus4',
  'Dsus2', 'Dsus4', 'Esus4', 'Cadd9', 'Gadd9', 'Aadd9', 'Dadd9', 'A7sus4', 'E5', 'A5', 'D5',
]);

function openKey(chord) {
  const sym = { maj: '', m: 'm', 7: '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', '7sus4': '7sus4', 5: '5' }[chord.typeId];
  if (sym == null) return null;
  const root = pcName(chord.rootPc, 'sharp');
  return `${root}${sym}`;
}

/** Ordena posiciones de cejilla por facilidad de las formas resultantes. */
export function capoOptions(symbols, { maxCapo = 9 } = {}) {
  const chords = symbols.map(parseChordSymbol).filter(Boolean);
  const out = [];
  for (let capo = 0; capo <= maxCapo; capo += 1) {
    const shapes = chords.map((chord) => {
      const rootName = pcName(mod(chord.rootPc - capo, 12), 'sharp');
      const bassName = chord.bassPc != null ? pcName(mod(chord.bassPc - capo, 12), 'sharp') : null;
      const symbol = chordSymbol(rootName, chord.typeId, bassName);
      const key = openKey({ rootPc: mod(chord.rootPc - capo, 12), typeId: chord.typeId });
      return { symbol, easy: key != null && EASY_OPEN.has(key) };
    });
    const easy = shapes.filter((s) => s.easy).length;
    out.push({ capo, shapes, easy, total: shapes.length, score: easy * 10 - capo });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/* ───────────── Formas de guitarra ───────────── */

/**
 * Formas en notación «grave→aguda» (6ª→1ª). -1 = cuerda silenciada.
 * `open` = acordes abiertos exactos; `movable` = plantillas relativas a la
 * posición de la cejilla (el traste de la fundamental).
 */
const OPEN_SHAPES = {
  C: [-1, 3, 2, 0, 1, 0], A: [-1, 0, 2, 2, 2, 0], G: [3, 2, 0, 0, 0, 3],
  E: [0, 2, 2, 1, 0, 0], D: [-1, -1, 0, 2, 3, 2],
  Am: [-1, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0], Dm: [-1, -1, 0, 2, 3, 1],
  E7: [0, 2, 0, 1, 0, 0], A7: [-1, 0, 2, 0, 2, 0], D7: [-1, -1, 0, 2, 1, 2],
  G7: [3, 2, 0, 0, 0, 1], C7: [-1, 3, 2, 3, 1, 0], B7: [-1, 2, 1, 2, 0, 2],
  Cmaj7: [-1, 3, 2, 0, 0, 0], Amaj7: [-1, 0, 2, 1, 2, 0], Dmaj7: [-1, -1, 0, 2, 2, 2],
  Fmaj7: [-1, -1, 3, 2, 1, 0], Gmaj7: [3, 2, 0, 0, 0, 2],
  Em7: [0, 2, 0, 0, 0, 0], Am7: [-1, 0, 2, 0, 1, 0], Dm7: [-1, -1, 0, 2, 1, 1],
  Asus2: [-1, 0, 2, 2, 0, 0], Asus4: [-1, 0, 2, 2, 3, 0], Dsus2: [-1, -1, 0, 2, 3, 0],
  Dsus4: [-1, -1, 0, 2, 3, 3], Esus4: [0, 2, 2, 2, 0, 0], Cadd9: [-1, 3, 2, 0, 3, 0],
  Gadd9: [3, 0, 0, 2, 0, 3], A7sus4: [-1, 0, 2, 0, 3, 0],
};

const MOVABLE = {
  // raíz en 6ª cuerda (forma de E)
  E: {
    maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
    maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0], 5: [0, 2, 2, -1, -1, -1],
    '7sus4': [0, 2, 0, 2, 0, 0], m6: [0, 2, 2, 0, 2, 0], 6: [0, 2, 2, 1, 2, 0],
    dim: [0, 1, 2, 0, -1, -1], m7b5: [0, -1, 0, 0, -1, -1], mMaj7: [0, 2, 1, 0, 0, 0],
    add9: [0, 2, 4, 1, 0, 0], 9: [0, 2, 0, 1, 0, 2],
  },
  // raíz en 5ª cuerda (forma de A)
  A: {
    maj: [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], 7: [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0],
    maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0],
    5: [-1, 0, 2, 2, -1, -1], dim: [-1, 0, 1, 2, 1, -1], m7b5: [-1, 0, 1, 0, 1, -1],
    dim7: [-1, 0, 1, -1, 1, -1], 6: [-1, 0, 2, 2, 2, 2], m6: [-1, 0, 2, 2, 1, 2],
    add9: [-1, 0, 2, 4, 2, 0], 9: [-1, 0, 2, 0, 2, 3], '7sus4': [-1, 0, 2, 0, 3, 0],
    aug: [-1, 0, 3, 2, 2, -1], mMaj7: [-1, 0, 2, 1, 1, 0], '7#5': [-1, 0, 3, 0, 2, 1],
  },
  // raíz en 4ª cuerda (forma de D)
  D: {
    maj: [-1, -1, 0, 2, 3, 2], m: [-1, -1, 0, 2, 3, 1], 7: [-1, -1, 0, 2, 1, 2],
    maj7: [-1, -1, 0, 2, 2, 2], m7: [-1, -1, 0, 2, 1, 1], dim: [-1, -1, 0, 1, 3, 1],
    sus4: [-1, -1, 0, 2, 3, 3], sus2: [-1, -1, 0, 2, 3, 0], m7b5: [-1, -1, 0, 1, 1, 1],
  },
};

const ROOT_STRING_INDEX = { E: 5, A: 4, D: 3 }; // índices con 0 = 1ª cuerda
const ROOT_STRING_MIDI = { E: 40, A: 45, D: 50 };

/**
 * Todas las formas para un acorde en afinación estándar. Cada una:
 * { frets: [6ª..1ª], base, label, kind }
 */
export function chordShapes(rootPc, typeId) {
  const shapes = [];
  const seen = new Set();
  const push = (shape) => {
    const key = shape.frets.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    shapes.push(shape);
  };

  const key = openKey({ rootPc, typeId });
  if (key && OPEN_SHAPES[key]) {
    push({ frets: OPEN_SHAPES[key], kind: 'open', label: 'Acorde abierto' });
  }
  for (const [family, label] of [['E', 'Forma de E'], ['A', 'Forma de A'], ['D', 'Forma de D']]) {
    const template = MOVABLE[family][typeId];
    if (!template) continue;
    const rootFretBase = mod(rootPc - ROOT_STRING_MIDI[family], 12);
    for (const shift of rootFretBase === 0 ? [0, 12] : [rootFretBase, rootFretBase + 12]) {
      const frets = template.map((f) => (f < 0 ? -1 : f + shift));
      const max = Math.max(...frets);
      if (max > 15) continue;
      push({
        frets,
        kind: 'movable',
        label: `${label}${shift === 0 ? '' : ` · traste ${shift}`}`,
        rootString: ROOT_STRING_INDEX[family],
      });
    }
  }
  shapes.sort((a, b) => shapeHeight(a.frets) - shapeHeight(b.frets));
  return shapes;
}

function shapeHeight(frets) {
  const played = frets.filter((f) => f > 0);
  return played.length ? Math.max(...played) : 0;
}

/** La mejor forma para tocar el acorde (sonido de acompañamiento). */
export function bestShape(rootPc, typeId) {
  const shapes = chordShapes(rootPc, typeId);
  if (shapes.length) return shapes[0];
  // último recurso: power chord en 6ª o 5ª cuerda
  const fret = mod(rootPc - 40, 12);
  return { frets: [fret, fret + 2, fret + 2, -1, -1, -1], kind: 'fallback', label: 'Aproximación' };
}

/** Notas MIDI de una forma (afinación estándar, 6ª→1ª). */
export function shapeMidis(frets, tuningLowToHigh = [40, 45, 50, 55, 59, 64]) {
  const out = [];
  frets.forEach((fret, i) => {
    if (fret >= 0) out.push(tuningLowToHigh[i] + fret);
  });
  return out;
}

/**
 * Voicings de acorde por juegos de cuerdas adyacentes: cada cuerda toca una
 * nota distinta del acorde, extensión ≤ `maxSpan` trastes.
 * `tuning` en orden 0 = aguda. Devuelve voicings con inversión.
 */
export function stringSetVoicings({ tuning, pcs, rootPc, maxFret = 15, maxSpan = 4 }) {
  const n = pcs.length;
  const results = [];
  for (let top = 0; top + n <= tuning.length; top += 1) {
    const strings = Array.from({ length: n }, (_, i) => top + i);
    const options = strings.map((s) => {
      const list = [];
      for (let f = 0; f <= maxFret; f += 1) {
        const pc = mod(tuning[s] + f, 12);
        if (pcs.includes(pc)) list.push({ s, f, pc });
      }
      return list;
    });
    const walk = (index, chosen) => {
      if (index === n) {
        const pcsUsed = new Set(chosen.map((c) => c.pc));
        if (pcsUsed.size !== n) return;
        const fretted = chosen.filter((c) => c.f > 0).map((c) => c.f);
        const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
        if (span > maxSpan) return;
        const bassNote = chosen[chosen.length - 1];
        const inversion = pcs.indexOf(bassNote.pc);
        results.push({
          strings,
          notes: chosen.map((c) => ({ ...c })),
          inversion,
          bassPc: bassNote.pc,
          low: fretted.length ? Math.min(...fretted) : 0,
          high: fretted.length ? Math.max(...fretted) : 0,
        });
        return;
      }
      for (const option of options[index]) walk(index + 1, [...chosen, option]);
    };
    walk(0, []);
  }
  results.sort((a, b) => a.low - b.low || b.strings[0] - a.strings[0]);
  return results;
}
