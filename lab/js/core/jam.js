/**
 * Modo Jam: qué escala tocar sobre cada acorde, qué notas mostrar según el
 * enfoque (escala, pentatónica, notas del acorde, tríada, arpegio), qué
 * posición seguir en el mástil y cómo puntuar los «aterrizajes».
 * Todo puro: se prueba en Node.
 */

import { mod, pcName } from './music.js';
import { CHORD_TYPES } from './chords.js';
import { guideTones, SECOND_LABEL } from './guide.js';
import { reharmonizeTwoFiveOne } from './harmony.js';

/** Calidades de escala (ids de FAMILY_DEFS.scale) con su rótulo corto. */
const SCALE_LABELS = {
  major: 'Mayor (jónica)',
  naturalMinor: 'Menor natural (eólica)',
  harmonicMinor: 'Menor armónica',
  melodicMinor: 'Menor melódica',
  dorian: 'Dórica',
  phrygian: 'Frigia',
  lydian: 'Lidia',
  mixolydian: 'Mixolidia',
  locrian: 'Locria',
  pentatonicMajor: 'Pentatónica mayor',
  pentatonicMinor: 'Pentatónica menor',
  blues: 'Blues',
  diminished: 'Disminuida (T-S)',
  augmented: 'Aumentada',
};

export function scaleLabel(id) {
  return SCALE_LABELS[id] ?? id;
}

const MINOR_TYPES = new Set(['m', 'm7', 'm6', 'm9', 'mMaj7']);
const DOMINANT_TYPES = new Set(['7', '9', '7sus4', '7#5']);

/** Grado diatónico (0–6) de un intervalo respecto a la tónica en mayor, o -1. */
const MAJOR_DEGREE_OF = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const MINOR_DEGREE_OF = { 0: 0, 2: 1, 3: 2, 5: 3, 7: 4, 8: 5, 10: 6 };

const MAJOR_MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'naturalMinor', 'locrian'];
const MINOR_MODES = ['naturalMinor', 'locrian', 'major', 'dorian', 'phrygian', 'lydian', 'mixolydian'];

/**
 * Escalas sugeridas sobre un acorde dentro de una tonalidad.
 * Devuelve [{ root, quality, label, why }] de más a menos recomendada.
 * `chord` = { rootPc, typeId }, `key` = { rootPc, mode: 'major'|'minor' }.
 */
export function suggestScales({ key, chord, style = null }) {
  const rel = mod(chord.rootPc - key.rootPc, 12);
  const name = (pc) => pcName(pc, 'sharp');
  const out = [];
  const add = (rootPc, quality, why) => {
    if (out.some((s) => s.rootPc === rootPc && s.quality === quality)) return;
    out.push({ rootPc, root: name(rootPc), quality, label: `${name(rootPc)} ${scaleLabel(quality).toLowerCase()}`, why });
  };
  const isMinorChord = MINOR_TYPES.has(chord.typeId);
  const isDominant = DOMINANT_TYPES.has(chord.typeId);
  const table = key.mode === 'minor' ? MINOR_DEGREE_OF : MAJOR_DEGREE_OF;
  const modes = key.mode === 'minor' ? MINOR_MODES : MAJOR_MODES;
  const degree = table[rel];
  const bluesStyle = style === 'blues';

  if (bluesStyle && isDominant) {
    add(chord.rootPc, 'blues', 'Blues clásico sobre el acorde dominante');
    add(chord.rootPc, 'pentatonicMinor', 'Pentatónica menor sobre el acorde: sonido blues');
    add(chord.rootPc, 'pentatonicMajor', 'Pentatónica mayor: color dulce');
    add(chord.rootPc, 'mixolydian', 'Mixolidia: escala completa del acorde');
    return out;
  }

  // Dominante fuera de la escala diatónica o en menor (V7 de armónica).
  if (key.mode === 'minor' && isDominant && rel === 7) {
    add(key.rootPc, 'harmonicMinor', 'V7 en menor: usa la menor armónica de la tónica');
    add(chord.rootPc, 'mixolydian', 'Mixolidia de la dominante, más abierta');
    add(chord.rootPc, 'blues', 'Blues sobre la dominante');
    return out;
  }

  if (degree != null && !(isDominant && key.mode === 'major' && rel !== 7) && !(isDominant && rel !== 7)) {
    const mode = modes[degree];
    const diatonicMinor = MINOR_TYPES.has(chord.typeId) || chord.typeId === 'dim' || chord.typeId === 'm7b5';
    // El modo de ese grado sólo vale si la calidad del acorde coincide con el modo.
    const modeMinor = ['dorian', 'phrygian', 'naturalMinor'].includes(mode);
    const modeDim = mode === 'locrian';
    const chordDim = chord.typeId === 'm7b5' || chord.typeId === 'dim' || chord.typeId === 'dim7';
    const compatible = modeDim ? chordDim : chordDim ? false : modeMinor ? diatonicMinor : !isMinorChord;
    if (compatible) {
      add(chord.rootPc, mode, `Grado ${degree + 1} de la tonalidad: ${scaleLabel(mode).toLowerCase()}`);
      if (mode === 'naturalMinor' || mode === 'dorian' || mode === 'phrygian') add(chord.rootPc, 'pentatonicMinor', 'Pentatónica menor: la más segura');
      if (mode === 'major' || mode === 'lydian' || mode === 'mixolydian') add(chord.rootPc, 'pentatonicMajor', 'Pentatónica mayor: la más segura');
      if (mode === 'major') add(chord.rootPc, 'lydian', 'Lidia: color más brillante (♯4)');
      if (mode === 'naturalMinor') add(chord.rootPc, 'dorian', 'Dórica: sonido menor más abierto (6ª mayor)');
      if (mode === 'locrian') add(chord.rootPc, 'locrian', 'Semidisminuido: locria');
      if (out.length) return out;
    }
  }

  // Por tipo de acorde.
  switch (chord.typeId) {
    case 'maj': case '6': case 'maj7': case 'maj9': case 'add9':
      add(chord.rootPc, 'major', 'Mayor sobre el acorde');
      add(chord.rootPc, 'lydian', 'Lidia: color brillante');
      add(chord.rootPc, 'pentatonicMajor', 'Pentatónica mayor');
      break;
    case 'm': case 'm7': case 'm9': case 'm6':
      add(chord.rootPc, 'dorian', 'Dórica: la elección más versátil sobre menor');
      add(chord.rootPc, 'naturalMinor', 'Menor natural');
      add(chord.rootPc, 'pentatonicMinor', 'Pentatónica menor');
      break;
    case 'mMaj7':
      add(chord.rootPc, 'melodicMinor', 'Menor melódica sobre m(maj7)');
      add(chord.rootPc, 'harmonicMinor', 'Menor armónica');
      break;
    case '7': case '9': case '7sus4':
      add(chord.rootPc, 'mixolydian', 'Mixolidia sobre dominante');
      add(chord.rootPc, 'pentatonicMajor', 'Pentatónica mayor');
      add(chord.rootPc, 'blues', 'Blues');
      break;
    case '7#5': case 'aug':
      add(chord.rootPc, 'augmented', 'Aumentada sobre el acorde');
      add(chord.rootPc, 'mixolydian', 'Mixolidia como alternativa');
      break;
    case 'm7b5':
      add(chord.rootPc, 'locrian', 'Locria sobre el semidisminuido');
      add(chord.rootPc, 'naturalMinor', 'Menor natural (más segura)');
      break;
    case 'dim': case 'dim7':
      add(chord.rootPc, 'diminished', 'Disminuida (tono-semitono)');
      break;
    case 'sus2': case 'sus4': case '5':
      add(chord.rootPc, key.mode === 'minor' ? 'pentatonicMinor' : 'pentatonicMajor', 'Pentatónica de la tonalidad');
      add(chord.rootPc, 'mixolydian', 'Mixolidia');
      break;
    default:
      add(key.rootPc, key.mode === 'minor' ? 'naturalMinor' : 'major', 'Escala de la tonalidad');
  }
  return out;
}

/** Rol de una nota de acorde según su intervalo. */
export function intervalRole(interval) {
  const i = mod(interval, 12);
  if (i === 0) return 'root';
  if ([2, 3, 4, 5].includes(i)) return 'third';
  if ([6, 7, 8].includes(i)) return 'fifth';
  if ([9, 10, 11].includes(i)) return 'seventh';
  return null;
}

const CHORD_LABELS = { 0: '1', 2: '9', 3: '3m', 4: '3M', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '7m', 11: '7M' };

/** Notas del acorde con rol y etiqueta: [{ pc, interval, role, label }]. */
export function chordTones(rootPc, typeId) {
  const type = CHORD_TYPES[typeId];
  const intervals = type ? type.intervals : [0, 4, 7];
  return intervals.map((interval) => ({
    pc: mod(rootPc + interval, 12),
    interval,
    role: intervalRole(interval),
    label: CHORD_LABELS[interval] ?? String(interval),
  }));
}

export const FOCUS_MODES = [
  { id: 'scale', label: 'Escala completa' },
  { id: 'pentatonic', label: 'Pentatónica' },
  { id: 'chord', label: 'Notas del acorde' },
  { id: 'triad', label: 'Tríada' },
  { id: 'arpeggio', label: 'Arpegio' },
  { id: 'guide', label: 'Voces guía (3.ª y 7.ª)' },
];

/** Intervalos de la escala (para construir sin depender del DOM). */
const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  augmented: [0, 3, 4, 7, 8, 11],
};

export function scalePcs(rootPc, quality) {
  return (SCALE_INTERVALS[quality] ?? SCALE_INTERVALS.major).map((i) => mod(rootPc + i, 12));
}

/** Pentatónica asociada a una escala sugerida. */
export function pentatonicFor(suggestion, chord) {
  const minor = ['naturalMinor', 'dorian', 'phrygian', 'locrian', 'harmonicMinor', 'blues', 'pentatonicMinor'].includes(suggestion.quality)
    || MINOR_TYPES.has(chord.typeId);
  return { rootPc: suggestion.rootPc, quality: minor ? 'pentatonicMinor' : 'pentatonicMajor' };
}

/**
 * Notas que hay que dibujar para (acorde, escala, enfoque).
 * Devuelve { pcs: Map<pc, {role,label}>, context: Set<pc> }: `pcs` son las
 * notas destacadas y `context` las de la escala que quedan atenuadas.
 */
export function focusNotes({ chord, suggestion, focus = 'scale' }) {
  const tones = chordTones(chord.rootPc, chord.typeId);
  const toneMap = new Map(tones.map((t) => [t.pc, t]));
  const scale = scalePcs(suggestion.rootPc, suggestion.quality);
  const context = new Set(scale);
  const main = new Map();
  const labelFor = (pc) => {
    const t = toneMap.get(pc);
    if (t) return { role: t.role, label: t.label };
    return { role: null, label: degreeInScale(pc, suggestion) };
  };
  if (focus === 'guide') {
    // Sólo la 3.ª y la 7.ª destacadas; el resto de la escala queda como contexto.
    const g = guideTones(chord.rootPc, chord.typeId);
    if (g.third != null) main.set(g.third, { role: 'third', label: '3.ª' });
    if (g.seventh != null) main.set(g.seventh, { role: 'seventh', label: SECOND_LABEL[g.second] });
    if (!main.size) main.set(chord.rootPc, { role: 'root', label: '1' });
  } else if (focus === 'chord' || focus === 'arpeggio') {
    for (const t of tones) main.set(t.pc, { role: t.role, label: t.label });
  } else if (focus === 'triad') {
    for (const t of tones.filter((x) => x.interval <= 8 || x.role !== 'seventh').slice(0, 3)) main.set(t.pc, { role: t.role, label: t.label });
  } else if (focus === 'pentatonic') {
    const pent = pentatonicFor(suggestion, chord);
    for (const pc of scalePcs(pent.rootPc, pent.quality)) main.set(pc, labelFor(pc));
  } else {
    for (const pc of scale) main.set(pc, labelFor(pc));
    // Las notas del acorde que no estén en la escala también se muestran.
    for (const t of tones) if (!main.has(t.pc)) main.set(t.pc, { role: t.role, label: t.label });
  }
  return { pcs: main, context, tones };
}

function degreeInScale(pc, suggestion) {
  const interval = mod(pc - suggestion.rootPc, 12);
  const labels = { 0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7' };
  return labels[interval];
}

/** Notas (s, f) sobre el mástil para un conjunto de pcs dentro de [from, to]. */
export function boardPositions({ tuning, pcs, from = 0, to = 15 }) {
  const out = [];
  for (let s = 0; s < tuning.length; s += 1) {
    for (let f = from; f <= to; f += 1) {
      const pc = mod(tuning[s] + f, 12);
      if (pcs.has(pc)) out.push({ s, f, pc, midi: tuning[s] + f });
    }
  }
  return out;
}

/**
 * Ventana de posición que sigue al acorde: centra 6 trastes alrededor de la
 * tónica más cercana a `prevCenter` (en las cuerdas graves).
 * Devuelve { from, to, center }.
 */
export function followWindow({ tuning, rootPc, prevCenter = 5, width = 6, maxFret = 15 }) {
  const candidates = [];
  const low = tuning.length - 1;
  for (const s of [low, low - 1, low - 2]) {
    if (s < 0) continue;
    for (let f = 0; f <= maxFret; f += 1) {
      if (mod(tuning[s] + f, 12) === rootPc) candidates.push(f);
    }
  }
  if (!candidates.length) return { from: 0, to: Math.min(maxFret, width - 1), center: prevCenter };
  const center = candidates.reduce((best, f) => (Math.abs(f - prevCenter) < Math.abs(best - prevCenter) ? f : best), candidates[0]);
  let from = Math.max(0, center - 2);
  let to = from + width - 1;
  if (to > maxFret) { to = maxFret; from = Math.max(0, to - width + 1); }
  return { from, to, center };
}

/** Sugiere un rol de aterrizaje aleatorio para el siguiente acorde. */
export function pickLandingTarget(chord, rng = Math.random, roles = ['root', 'third', 'fifth']) {
  const tones = chordTones(chord.rootPc, chord.typeId);
  const available = tones.filter((t) => roles.includes(t.role));
  const pool = available.length ? available : tones;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Puntuación de aterrizajes: llama a `startChange` en cada cambio de acorde
 * (con su pc objetivo y el instante) y a `hear` con las notas detectadas.
 * Un aterrizaje cuenta si se oye el pc objetivo dentro de `windowMs`.
 */
export class LandingScorer {
  constructor({ windowMs = 900 } = {}) {
    this.windowMs = windowMs;
    this.current = null;
    this.hits = 0;
    this.misses = 0;
    this.log = [];
  }

  startChange(targetPc, label, atMs) {
    this.finish();
    this.current = { targetPc, label, start: atMs, ok: false };
  }

  hear(pc, atMs) {
    const c = this.current;
    if (!c || c.ok) return false;
    if (atMs < c.start || atMs - c.start > this.windowMs) return false;
    if (pc === c.targetPc) {
      c.ok = true;
      return true;
    }
    return false;
  }

  finish() {
    if (!this.current) return;
    if (this.current.ok) this.hits += 1;
    else this.misses += 1;
    this.log.push({ label: this.current.label, ok: this.current.ok });
    this.current = null;
  }

  get total() {
    return this.hits + this.misses;
  }

  get percent() {
    return this.total ? Math.round((this.hits / this.total) * 100) : 0;
  }
}

/**
 * Plantillas de progresión para el modo Jam: cada una trae el estilo
 * sugerido (para bases y para el criterio de escalas) y la tonalidad modal.
 */
export const JAM_PRESETS = [
  { id: 'blues12', label: 'Blues de 12 compases (7ª dominantes)', mode: 'major', style: 'blues', groove: 'shuffle', chords: [[0, '7'], [0, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']] },
  { id: 'minorblues', label: 'Blues menor de 12 compases', mode: 'minor', style: 'blues', groove: 'shuffle', chords: [[0, 'm7'], [0, 'm7'], [0, 'm7'], [0, 'm7'], [5, 'm7'], [5, 'm7'], [0, 'm7'], [0, 'm7'], [8, 'maj7'], [7, '7'], [0, 'm7'], [7, '7']] },
  { id: 'twofiveone', label: 'II – V – I (jazz)', mode: 'major', style: 'jazz', groove: 'latin', chords: [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']] },
  { id: 'minortwofive', label: 'iiø – V7 – i (jazz menor)', mode: 'minor', style: 'jazz', groove: 'latin', chords: [[2, 'm7b5'], [7, '7'], [0, 'm7'], [0, 'm7']] },
  { id: 'pop4', label: 'I – V – vi – IV (pop)', mode: 'major', style: 'pop', groove: 'pop', chords: [[0, 'maj'], [7, 'maj'], [9, 'm'], [5, 'maj']] },
  { id: 'fifties', label: 'I – vi – IV – V (años 50)', mode: 'major', style: 'pop', groove: 'ballad', chords: [[0, 'maj'], [9, 'm'], [5, 'maj'], [7, 'maj']] },
  { id: 'andalusian', label: 'i – ♭VII – ♭VI – V (andaluza)', mode: 'minor', style: 'rock', groove: 'rock', chords: [[0, 'm'], [10, 'maj'], [8, 'maj'], [7, 'maj']] },
  { id: 'epic', label: 'i – ♭VI – ♭III – ♭VII (rock épico)', mode: 'minor', style: 'rock', groove: 'rock', chords: [[0, 'm'], [8, 'maj'], [3, 'maj'], [10, 'maj']] },
  { id: 'funk2', label: 'Funk en un acorde (i7 – IV7)', mode: 'minor', style: 'funk', groove: 'funk', chords: [[0, 'm7'], [0, 'm7'], [5, '7'], [0, 'm7']] },
  { id: 'dorian', label: 'Vamp dórico (i7 – IV7)', mode: 'minor', style: 'funk', groove: 'funk', chords: [[0, 'm7'], [0, 'm7'], [0, 'm7'], [5, '7']] },
  { id: 'mixo', label: 'Mixolidio rock (I – ♭VII – IV)', mode: 'major', style: 'rock', groove: 'rock', chords: [[0, 'maj'], [10, 'maj'], [5, 'maj'], [0, 'maj']] },
  { id: 'country', label: 'Country (I – IV – I – V)', mode: 'major', style: 'country', groove: 'country', chords: [[0, 'maj'], [5, 'maj'], [0, 'maj'], [7, '7']] },
  { id: 'reggae', label: 'Reggae (I – IV – V – IV)', mode: 'major', style: 'reggae', groove: 'reggae', chords: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']] },
  { id: 'bossa', label: 'Bossa (Imaj7 – ii7 – V7 – Imaj7)', mode: 'major', style: 'jazz', groove: 'bossa', chords: [[0, 'maj7'], [2, 'm7'], [7, '7'], [0, 'maj7']] },
  ...reharmonizeTwoFiveOne(0).slice(1).map((v) => ({
    id: `reh-${v.id}`,
    label: `Reharmonizar: ${v.label}`,
    mode: 'major',
    style: 'jazz',
    groove: 'latin',
    why: v.why,
    chords: v.chords.map((c) => [c.rootPc, c.typeId]),
  })),
].map((p) => ({ ...p, chords: p.chords.map(([s, t]) => ({ s, t })) }));

export function jamPreset(id) {
  return JAM_PRESETS.find((p) => p.id === id) ?? JAM_PRESETS[0];
}
