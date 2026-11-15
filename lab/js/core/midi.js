/**
 * Exportación a MIDI estándar (SMF formato 1) y a MusicXML.
 * Puro: devuelve Uint8Array / string. El navegador sólo lo descarga.
 */

import { tabEvents, tabLength } from './tab.js';
import { TUNINGS } from './music.js';
import { TIME_SIGNATURES, COMP_PATTERNS, DRUM_TRACKS, groovesFor, swingOffset } from './rhythm.js';
import { bestShape, shapeMidis } from './chords.js';

const PPQ = 480;

function vlq(value) {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n) { return [(n >> 8) & 255, n & 255]; }
const text = (s) => [...new TextEncoder().encode(s)];

function chunk(type, data) {
  return [...text(type), ...u32(data.length), ...data];
}

/**
 * @param {object} o
 * @param {number} o.bpm
 * @param {string} [o.title]
 * @param {number[]} [o.timeSig] [numerador, denominador]
 * @param {Array<{name:string, channel:number, program?:number, notes:Array<{tick:number,dur:number,midi:number,vel?:number}>}>} o.tracks
 */
export function writeMidi({ bpm = 100, title = 'Mástil Lab', timeSig = [4, 4], tracks }) {
  const micros = Math.round(60000000 / Math.max(20, bpm));
  const denomPow = Math.log2(timeSig[1]);
  const head = [
    0, 0xff, 0x03, ...vlq(text(title).length), ...text(title),
    0, 0xff, 0x51, 3, (micros >> 16) & 255, (micros >> 8) & 255, micros & 255,
    0, 0xff, 0x58, 4, timeSig[0], denomPow, 24, 8,
    0, 0xff, 0x2f, 0,
  ];
  const chunks = [chunk('MTrk', head)];
  for (const track of tracks) {
    const events = [];
    for (const n of track.notes) {
      const vel = Math.max(1, Math.min(127, Math.round(n.vel ?? 90)));
      events.push({ tick: Math.round(n.tick), order: 1, bytes: [0x90 | track.channel, n.midi & 127, vel] });
      events.push({ tick: Math.round(n.tick + Math.max(1, n.dur)), order: 0, bytes: [0x80 | track.channel, n.midi & 127, 0] });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const data = [0, 0xff, 0x03, ...vlq(text(track.name).length), ...text(track.name)];
    if (track.channel !== 9 && track.program != null) data.push(0, 0xc0 | track.channel, track.program & 127);
    let last = 0;
    for (const e of events) {
      data.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    data.push(0, 0xff, 0x2f, 0);
    chunks.push(chunk('MTrk', data));
  }
  const header = chunk('MThd', [...u16(1), ...u16(chunks.length), ...u16(PPQ)]);
  return Uint8Array.from([...header, ...chunks.flat()]);
}

/** Afinación de una tab (igual que el reproductor). */
export function tuningOfTab(tab) {
  if (Array.isArray(tab.tuning) && tab.tuning.length === tab.strings) return tab.tuning;
  if (tab.strings === 4) return TUNINGS.bass4.midi;
  if (tab.strings === 5) return TUNINGS.bass5.midi;
  if (tab.strings === 7) return TUNINGS.seven.midi;
  if (tab.strings === 6) return TUNINGS.standard.midi;
  return TUNINGS.standard.midi.slice(0, tab.strings);
}

/** Notas de una tab: cada columna dura hasta la siguiente nota de esa cuerda. */
export function tabToNotes(tab) {
  const tuning = tuningOfTab(tab);
  const perBeat = tab.subdivision ?? 2;
  const colTicks = PPQ / perBeat;
  const events = tabEvents(tab);
  const length = tabLength(tab);
  const notes = [];
  for (let s = 0; s < tab.strings; s += 1) {
    const hits = [];
    for (const ev of events) {
      const n = ev.notes.find((x) => x.s === s);
      if (n && !n.mute) hits.push({ col: ev.col, midi: tuning[s] + n.fret + (n.harmonic ? 12 : 0), accent: n.accent });
    }
    hits.forEach((hit, i) => {
      const nextCol = hits[i + 1]?.col ?? length;
      notes.push({ tick: hit.col * colTicks, dur: Math.max(colTicks * 0.9, (nextCol - hit.col) * colTicks * 0.95), midi: hit.midi, vel: hit.accent ? 112 : 92 });
    });
  }
  return notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
}

export function tabToMidi(tab) {
  const bass = tab.strings === 4 || tab.strings === 5;
  return writeMidi({
    bpm: tab.tempo ?? 100,
    title: tab.title,
    tracks: [{ name: tab.title || 'Tab', channel: 0, program: bass ? 33 : 25, notes: tabToNotes(tab) }],
  });
}

const GM_DRUMS = { kick: 36, snare: 38, hat: 42, openhat: 46, tom: 45 };

/**
 * Base completa (batería, bajo, guitarra, pad) para `bars` compases.
 * `resolved`: [{ rootPc, typeId }] por compás; se repite en bucle.
 */
export function backingToMidi({ resolved, bpm = 90, signature = '4/4', groove = 'rock', repeats = 2, swing = null, guitar = true, bass = true, drums = true, pad = false, title = 'Base' }) {
  const sig = TIME_SIGNATURES[signature] ?? TIME_SIGNATURES['4/4'];
  const g = groovesFor(signature)[groove] ?? Object.values(groovesFor(signature))[0];
  const ticksPerStep = PPQ / sig.stepsPerBeat;
  const barTicks = g.steps * ticksPerStep;
  const totalBars = resolved.length * repeats;
  const sw = swing ?? g.swing ?? 0;
  const bassNotes = [];
  const guitarNotes = [];
  const drumNotes = [];
  const padNotes = [];
  for (let bar = 0; bar < totalBars; bar += 1) {
    const chord = resolved[bar % resolved.length];
    const base = bar * barTicks;
    for (let step = 0; step < g.steps; step += 1) {
      const t = base + (step + swingOffset(step, sw)) * ticksPerStep;
      for (const track of DRUM_TRACKS) {
        if (g.tracks[track.id]?.[step]) drumNotes.push({ tick: t, dur: ticksPerStep / 2, midi: GM_DRUMS[track.id], vel: step % sig.stepsPerBeat === 0 ? 105 : 80 });
      }
      const bi = g.bass.indexOf(step);
      if (bi >= 0) {
        const next = g.bass[bi + 1] ?? g.steps + g.bass[0];
        let midi = 28 + (((chord.rootPc - 4) % 12) + 12) % 12;
        if (g.walking) midi += [0, chord.typeId.startsWith('m') && chord.typeId !== 'maj7' ? 3 : 4, 7, 9][Math.floor(step / sig.stepsPerBeat) % 4];
        else if (bi % 4 === 2) midi += 7;
        bassNotes.push({ tick: t, dur: (next - step) * ticksPerStep * 0.88, midi, vel: step === 0 ? 100 : 86 });
      }
      const comp = COMP_PATTERNS[g.comp] ?? COMP_PATTERNS.basic;
      const hit = comp.hits.find(([st]) => st === step);
      if (hit) {
        const midis = shapeMidis(bestShape(chord.rootPc, chord.typeId).frets);
        midis.forEach((m, i) => guitarNotes.push({ tick: t + i * 12, dur: ticksPerStep * 3, midi: m, vel: 70 * hit[1] + 20 }));
      }
    }
    if (pad) {
      const midis = shapeMidis(bestShape(chord.rootPc, chord.typeId).frets).map((m) => m + 0);
      midis.forEach((m) => padNotes.push({ tick: base, dur: barTicks * 0.98, midi: m, vel: 60 }));
    }
  }
  const tracks = [];
  if (drums) tracks.push({ name: 'Batería', channel: 9, notes: drumNotes });
  if (bass) tracks.push({ name: 'Bajo', channel: 1, program: 33, notes: bassNotes });
  if (guitar) tracks.push({ name: 'Guitarra', channel: 2, program: 25, notes: guitarNotes });
  if (pad) tracks.push({ name: 'Pad', channel: 3, program: 89, notes: padNotes });
  return writeMidi({ bpm, title, timeSig: [sig.id === '12/8' ? 12 : sig.id === '6/8' ? 6 : sig.beats, sig.id === '12/8' || sig.id === '6/8' ? 8 : 4], tracks });
}

/* ───────────── MusicXML (tablatura) ───────────── */

const STEP_NAMES = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

const xmlEscape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Tab → MusicXML 3.1 con cuerdas y trastes (técnica «tablature»). */
export function tabToMusicXML(tab) {
  const tuning = tuningOfTab(tab);
  const perBeat = tab.subdivision ?? 2;
  const divisions = perBeat; // una columna = 1 división
  const beatsPerBar = 4;
  const colsPerBar = perBeat * beatsPerBar;
  const events = tabEvents(tab);
  const length = tabLength(tab);
  const bars = Math.ceil(length / colsPerBar);
  const type = { 1: 'quarter', 2: 'eighth', 4: '16th' }[perBeat] ?? 'eighth';
  const tuningXml = [...tuning].reverse().map((m, i) => `<staff-tuning line="${i + 1}"><tuning-step>${STEP_NAMES[m % 12]}</tuning-step>${ALTER[m % 12] ? '<tuning-alter>1</tuning-alter>' : ''}<tuning-octave>${Math.floor(m / 12) - 1}</tuning-octave></staff-tuning>`).join('');
  const measures = [];
  for (let b = 0; b < bars; b += 1) {
    const parts = [];
    if (b === 0) {
      parts.push(`<attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>${beatsPerBar}</beats><beat-type>4</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>${tab.strings}</staff-lines>${tuningXml}</staff-details></attributes>`);
      parts.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tab.tempo ?? 100}</per-minute></metronome></direction-type><sound tempo="${tab.tempo ?? 100}"/></direction>`);
    }
    for (let c = b * colsPerBar; c < (b + 1) * colsPerBar; c += 1) {
      const notes = (events[c]?.notes ?? []).filter((n) => !n.mute);
      if (!notes.length) {
        parts.push(`<note><rest/><duration>1</duration><type>${type}</type></note>`);
        continue;
      }
      notes.forEach((n, i) => {
        const midi = tuning[n.s] + n.fret;
        const xmlString = tab.strings - n.s; // 1 = cuerda más grave en MusicXML
        parts.push(
          `<note>${i > 0 ? '<chord/>' : ''}<pitch><step>${STEP_NAMES[midi % 12]}</step>${ALTER[midi % 12] ? '<alter>1</alter>' : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch><duration>1</duration><type>${type}</type><notations><technical><string>${xmlString}</string><fret>${n.fret}</fret></technical></notations></note>`,
        );
      });
    }
    measures.push(`<measure number="${b + 1}">${parts.join('')}</measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><work><work-title>${xmlEscape(tab.title ?? 'Tab')}</work-title></work><part-list><score-part id="P1"><part-name>${tab.strings === 4 || tab.strings === 5 ? 'Bajo' : 'Guitarra'}</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>
`;
}
