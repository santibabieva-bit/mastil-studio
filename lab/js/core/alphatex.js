/**
 * Puente con alphaTab (https://alphatab.net): convierte tabs y ejercicios del
 * Lab a alphaTex (texto que alphaTab sabe pintar y reproducir) y, al revés,
 * convierte una partitura de alphaTab (alphaTex o Guitar Pro) en una tab del Lab.
 *
 * «Beat» intermedio: { notes: [{ s, f, mute, tech: [], finger }], dur, rest }
 *   s = 0 es la cuerda más aguda (igual que en el resto del Lab).
 *   dur: 4 negra · 8 corchea · 16 semicorchea · 32 fusa (por defecto la general).
 */

import { bendTex } from './bends.js';
import { TUNINGS } from './music.js';
import { createTab, parseCell, tabLength } from './tab.js';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function texNoteName(midi) {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export const INSTRUMENTS = {
  clean: { id: 27, label: 'Eléctrica limpia' },
  acoustic: { id: 25, label: 'Acústica (acero)' },
  nylon: { id: 24, label: 'Clásica (nylon)' },
  overdrive: { id: 29, label: 'Eléctrica saturada' },
  distortion: { id: 30, label: 'Eléctrica distorsión' },
  bass: { id: 33, label: 'Bajo eléctrico' },
};

/** Afinación por defecto según el número de cuerdas de una tab. */
export function tabTuningOf(tab) {
  if (Array.isArray(tab.tuning) && tab.tuning.length === tab.strings) return tab.tuning;
  if (tab.strings === 4) return TUNINGS.bass4.midi;
  if (tab.strings === 5) return TUNINGS.bass5.midi;
  if (tab.strings === 7) return TUNINGS.seven.midi;
  if (tab.strings === 6) return TUNINGS.standard.midi;
  return TUNINGS.standard.midi.slice(0, tab.strings);
}

const TICKS = { 1: 192, 2: 96, 4: 48, 8: 24, 16: 12, 32: 6, 64: 3 };

export function beatTicks(dur, tuplet = false, dot = false) {
  const t = TICKS[dur] ?? 24;
  return (tuplet ? (t * 2) / 3 : t) * (dot ? 1.5 : 1);
}

/** «Notas por pulso» (1, 2, 3, 4) → figura de alphaTex. */
export function durationForSub(sub) {
  return { 1: { duration: 4, tuplet: false }, 2: { duration: 8, tuplet: false }, 3: { duration: 8, tuplet: true }, 4: { duration: 16, tuplet: false } }[sub]
    ?? { duration: 8, tuplet: false };
}

function quote(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const RIGHT_FINGER = { p: 1, i: 2, m: 3, a: 4 };

/** Efectos de una nota (sin llaves). */
function noteEffectList(note, { showFingers }) {
  const fx = [];
  if (note.tie) fx.push('t');
  const curve = bendTex(note.bend);
  if (curve) fx.push(curve);
  for (const tech of note.tech ?? []) {
    if (curve && (tech === 'b' || tech === 'r')) continue;
    if (tech === 'h' || tech === 'p') fx.push('h');
    else if (tech === '/' || tech === '\\') fx.push('sl');
    else if (tech === 'b') fx.push('b (0 4)');
    else if (tech === 'r') fx.push('b (4 0)');
    else if (tech === '~') fx.push('v');
    else if (tech === '*') fx.push('nh');
    else if (tech === '>') fx.push('ac');
    else if (tech === 'pm') fx.push('pm');
    else if (tech === 'tap') fx.push('tt');
  }
  if (showFingers && note.finger >= 1 && note.finger <= 4) fx.push(`lf ${note.finger}`);
  if (showFingers && RIGHT_FINGER[note.rightFinger]) fx.push(`rf ${RIGHT_FINGER[note.rightFinger]}`);
  return fx;
}

function braces(list) {
  return list.length ? `{${list.join(' ')}}` : '';
}

function noteToken(note, opts, beatFx = []) {
  const str = note.s + 1;
  const fx = braces([...noteEffectList(note, opts), ...beatFx]);
  return note.mute ? `x.${str}${fx}` : `${note.f}.${str}${fx}`;
}

/**
 * @param {Array} beats
 * @param {object} o
 * @param {string} [o.title]
 * @param {string} [o.subtitle]
 * @param {number} [o.tempo]
 * @param {number[]} [o.tuning] MIDI, 0 = cuerda aguda
 * @param {number} [o.instrument] id GM
 * @param {number} [o.duration] duración por defecto (4, 8, 16, 32)
 * @param {boolean} [o.tuplet] agrupa cada tres notas como tresillo
 * @param {[number, number]} [o.timeSig]
 * @param {boolean} [o.showFingers] dedos de la mano izquierda/derecha
 * @param {boolean} [o.showPicking] flechas de púa (beat.pick = 'D' | 'U')
 * @param {boolean} [o.padLastBar] completa el último compás con silencios
 */
export function beatsToAlphaTex(beats, o = {}) {
  const {
    title = 'Ejercicio', subtitle = '', tempo = 90, tuning = TUNINGS.standard.midi, instrument = INSTRUMENTS.clean.id,
    duration = 8, tuplet = false, timeSig = [4, 4], showFingers = false, showPicking = true, padLastBar = true, words = '',
  } = o;
  const header = [
    `\\title ${quote(title)}`,
    subtitle ? `\\subtitle ${quote(subtitle)}` : null,
    words ? `\\words ${quote(words)}` : null,
    `\\tempo ${Math.round(tempo)}`,
    `\\instrument ${instrument}`,
    `\\tuning ${tuning.map(texNoteName).join(' ')}`,
  ].filter(Boolean);

  const barTicks = timeSig[0] * (192 / timeSig[1]);
  const out = [];
  let acc = 0;
  let current = null;

  const emit = (beat) => {
    const dur = beat.dur ?? duration;
    const isTuplet = Boolean(beat.tuplet ?? tuplet);
    const ticks = beatTicks(dur, isTuplet, beat.dot);
    const prefix = dur !== current ? `:${dur} ` : '';
    current = dur;
    const beatFx = [];
    if (beat.chord) beatFx.push(`ch ${quote(beat.chord)}`);
    if (isTuplet) beatFx.push('tu 3');
    if (beat.dot) beatFx.push('d');
    if (showPicking && beat.pick === 'D') beatFx.push('sd');
    else if (showPicking && beat.pick === 'U') beatFx.push('su');
    let token;
    if (beat.rest || !beat.notes?.length) token = `r${braces(beatFx)}`;
    else if (beat.notes.length === 1) token = noteToken(beat.notes[0], { showFingers }, beatFx);
    else token = `(${beat.notes.map((n) => noteToken(n, { showFingers })).join(' ')})${braces(beatFx)}`;
    out.push(`${prefix}${token}`);
    acc += ticks;
    if (acc >= barTicks - 0.01) {
      out.push('|');
      acc = 0;
    }
  };

  beats.forEach(emit);
  // Completa el último compás con silencios.
  if (padLastBar && acc > 0.01) {
    // Silencios lo más largos posible que respeten la cuadrícula del compás
    // (por ejemplo 1 semicorchea + 1 corchea + 1 negra + 1 blanca, no 15 semicorcheas).
    let pos = Math.round(acc);
    let left = Math.round(barTicks) - pos;
    const rests = [];
    while (left > 0) {
      const d = [1, 2, 4, 8, 16, 32].find((n) => {
        const t = beatTicks(n);
        return t <= left && pos % t === 0;
      });
      if (!d) break;
      rests.push(d);
      pos += beatTicks(d);
      left -= beatTicks(d);
    }
    if (rests.length) {
      for (const d of rests) out.push(`:${d} r`);
      out.push('|');
    }
  }
  const body = out.join(' ').replace(/\s*\|\s*$/, '').trim();
  return `${header.join('\n')}\n.\n\\ts ${timeSig[0]} ${timeSig[1]}\n${body}\n`;
}

/**
 * Eventos de drill { s, f, pick, art, finger } → beats.
 * art: H hammer-on · P pull-off · T tapping · M silenciado con la palma.
 * Los ligados marcan la nota de origen (la anterior).
 */
export function eventsToBeats(events) {
  const beats = events.map((ev) => {
    const tech = [];
    if (ev.art === 'T') tech.push('tap');
    if (ev.art === 'M') tech.push('pm');
    const note = { s: ev.s, f: ev.f, tech, finger: ev.finger, rightFinger: RIGHT_FINGER[ev.pick] ? ev.pick : undefined };
    return { notes: [note], pick: ev.pick === 'D' || ev.pick === 'U' ? ev.pick : undefined };
  });
  events.forEach((ev, i) => {
    if ((ev.art === 'H' || ev.art === 'P') && i > 0) {
      const prev = beats[i - 1].notes[0];
      if (!prev.tech.includes('h')) prev.tech.push('h');
    }
  });
  return beats;
}

/** Lick [[cuerda, traste, pasos]] → beats con su duración relativa. */
export function lickToBeats(lick) {
  const sub = lick.subdivision ?? 2;
  const unit = { 1: 4, 2: 8, 4: 16 }[sub] ?? 8;
  return lick.notes.map(([s, f, steps = 1, fx = null]) => {
    const table = { 1: [unit, false], 2: [unit / 2, false], 3: [unit / 2, true], 4: [unit / 4, false], 6: [unit / 4, true], 8: [unit / 8, false] };
    const [dur, dot] = table[steps] ?? [unit, false];
    return { notes: [{ s, f, tech: fx?.vib ? ['~'] : [], bend: fx?.bend ?? null }], dur: Math.max(1, dur), dot };
  });
}

/** Tab del Lab → beats. */
export function tabToBeats(tab) {
  const length = tabLength(tab);
  const dur = { 1: 4, 2: 8, 4: 16 }[tab.subdivision ?? 2] ?? 8;
  const beats = [];
  for (let c = 0; c < length; c += 1) {
    const notes = [];
    for (let s = 0; s < tab.strings; s += 1) {
      const parsed = parseCell(tab.cells[s][c]);
      if (!parsed) continue;
      const tech = [...parsed.tech];
      if (tech.includes('p')) { /* alphaTex usa «h» para ambos ligados */ }
      notes.push({ s, f: parsed.fret ?? 0, mute: parsed.mute, tech });
    }
    beats.push({ notes, rest: notes.length === 0, dur });
  }
  return beats;
}

/** Compás de una tab: columnas por compás → numerador sobre negras. */
export function tabTimeSig(tab) {
  const per = tab.subdivision ?? 2;
  const cols = tab.barCols ?? per * 4;
  if (cols % per === 0 && cols / per >= 1 && cols / per <= 12) return [cols / per, 4];
  return [4, 4];
}

export function tabToAlphaTex(tab, o = {}) {
  const sig = tabTimeSig(tab);
  return beatsToAlphaTex(tabToBeats(tab), {
    title: tab.title ?? 'Tab',
    tempo: tab.tempo ?? 100,
    tuning: tabTuningOf(tab),
    instrument: tab.strings <= 5 && tab.strings >= 4 ? INSTRUMENTS.bass.id : INSTRUMENTS.clean.id,
    timeSig: sig,
    duration: { 1: 4, 2: 8, 4: 16 }[tab.subdivision ?? 2] ?? 8,
    ...o,
  });
}

/**
 * Partitura de alphaTab (objeto `Score`) → tab del Lab.
 * Sólo usa propiedades simples, así se puede probar con objetos de juguete.
 * Cuerda de alphaTab: 1 = la más grave.
 */
export function scoreToTab(score, { trackIndex = 0, title = null } = {}) {
  const track = score?.tracks?.[trackIndex];
  const staff = track?.staves?.[0];
  if (!staff) return null;
  const strings = staff.tuning?.length ?? track.tuning?.length ?? 6;
  const beats = [];
  for (const bar of staff.bars ?? []) {
    const voice = bar.voices?.[0];
    for (const beat of voice?.beats ?? []) beats.push(beat);
  }
  if (!beats.length) return null;
  const ticks = (b) => b.playbackDuration ?? b.displayDuration ?? 480;
  const minTicks = Math.min(...beats.map(ticks));
  const subdivision = minTicks <= 240 ? 4 : minTicks <= 480 ? 2 : 1;
  const unit = 960 / subdivision;

  const columns = [];
  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i];
    const span = Math.max(1, Math.round(ticks(beat) / unit));
    const cells = Array.from({ length: strings }, () => '');
    if (!beat.isRest && beat.notes?.length) {
      for (const note of beat.notes) {
        const s = strings - note.string;
        if (s < 0 || s >= strings) continue;
        let text = note.isDead ? 'x' : String(note.fret ?? 0);
        if (note.isTieDestination) continue;
        if (note.isHammerPullOrigin) {
          const nextNote = nextOnString(beats, i, note.string);
          text += nextNote && nextNote.fret < (note.fret ?? 0) ? 'p' : 'h';
        } else if (note.slideOutType && note.slideOutType !== 0) {
          const nextNote = nextOnString(beats, i, note.string);
          text += nextNote && nextNote.fret < (note.fret ?? 0) ? '\\' : '/';
        }
        if (note.bendPoints?.length) text += 'b';
        if (note.vibrato && note.vibrato !== 0) text += '~';
        if (note.harmonicType && note.harmonicType !== 0) text += '*';
        cells[s] = text.slice(0, 6);
      }
    }
    columns.push(cells);
    for (let k = 1; k < span; k += 1) columns.push(Array.from({ length: strings }, () => ''));
  }
  const tab = createTab({ strings, cols: Math.max(1, columns.length), title: title ?? score.title ?? 'Importada', tempo: Math.round(score.tempo ?? 100) });
  tab.subdivision = subdivision;
  columns.forEach((col, c) => col.forEach((text, s) => { tab.cells[s][c] = text; }));
  const tuning = staff.tuning ?? track.tuning;
  if (Array.isArray(tuning) && tuning.length === strings) tab.tuning = [...tuning];
  return tab;
}

function nextOnString(beats, from, string) {
  for (let i = from + 1; i < beats.length; i += 1) {
    const n = beats[i].notes?.find((x) => x.string === string);
    if (n) return n;
  }
  return null;
}
