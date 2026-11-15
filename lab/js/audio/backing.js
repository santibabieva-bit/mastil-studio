/**
 * Reproductor de acompañamiento: batería + bajo + guitarra + sintetizador
 * sobre una progresión. Lo usan el Backing Track Creator y el EQ Trainer.
 */

import { Transport } from './transport.js';
import { mod } from '../core/music.js';
import { CHORD_TYPES, bestShape, chordPcs, shapeMidis } from '../core/chords.js';
import {
  COMP_PATTERNS, DRUM_TRACKS, TIME_SIGNATURES, groovesFor, isBarAudible, swingOffset,
} from '../core/rhythm.js';

/** Nota de bajo en el registro E1–D♯2. */
export function bassMidi(rootPc, octaveUp = 0) {
  return 28 + mod(rootPc - 4, 12) + octaveUp * 12;
}

/** Voicing de pad (registro medio). */
export function padMidis(rootPc, typeId) {
  return chordPcs(rootPc, typeId).map((pc) => 55 + mod(pc - 55, 12));
}

/** Notas de guitarra (forma real de la mano) para un acorde. */
export function guitarMidis(rootPc, typeId) {
  return shapeMidis(bestShape(rootPc, typeId).frets);
}

/** Línea de bajo de «walking» para dominante/menor: raíz, 3ª, 5ª, 6ª. */
export function walkingBass(rootPc, typeId, beat) {
  const minor = ['m', 'm7', 'm7b5', 'dim', 'm9', 'm6'].includes(typeId);
  const intervals = [0, minor ? 3 : 4, 7, 9];
  return bassMidi(rootPc) + intervals[beat % 4];
}

export class BackingPlayer {
  constructor(engine, tool = 'backing') {
    this.engine = engine;
    this.transport = new Transport(engine, tool);
    this.settings = null;
    this.onStep = null;
  }

  get running() {
    return this.transport.running;
  }

  /** Duración en segundos de un paso con el tempo y compás actuales. */
  stepSeconds() {
    const s = this.settings;
    const sig = TIME_SIGNATURES[s.signature] ?? TIME_SIGNATURES['4/4'];
    return 60 / s.bpm / sig.stepsPerBeat;
  }

  async start(settings, onStep = null) {
    this.settings = settings;
    this.onStep = onStep;
    const player = this;
    await this.transport.start({
      stepSeconds: () => player.stepSeconds(),
      tick: (step, time) => player.tick(step, time),
    });
  }

  stop() {
    this.transport.stop();
  }

  tick(step, time) {
    const s = this.settings;
    const sig = TIME_SIGNATURES[s.signature] ?? TIME_SIGNATURES['4/4'];
    const grooves = groovesFor(s.signature);
    const groove = grooves[s.groove] ?? Object.values(grooves)[0];
    const stepsPerBar = groove.steps;
    const bar = Math.floor(step / stepsPerBar);
    const barStep = step % stepsPerBar;
    const countIn = s.countIn ? 1 : 0;
    const e = this.engine;
    const sec = this.stepSeconds();

    // Cuenta previa: sólo clic.
    if (bar < countIn) {
      if (barStep % sig.stepsPerBeat === 0) {
        e.click(time, { accent: barStep === 0, sound: 'wood', vol: 1 });
        e.at(time, () => this.onStep?.({ countIn: true, beat: barStep / sig.stepsPerBeat, bar }));
      }
      return true;
    }

    const chords = s.resolved;
    if (!chords?.length) return true;
    const musicalBar = bar - countIn;
    const chordIndex = musicalBar % chords.length;
    const chord = chords[chordIndex];
    const swing = s.swing ?? groove.swing ?? 0;
    const delay = swingOffset(barStep, swing) * sec;
    const t = time + delay;
    // Compases sin acompañamiento: sólo queda el clic.
    const audible = !s.muteCycle || isBarAudible({ play: s.muteCycle.play, silent: s.muteCycle.silent, bar: musicalBar });
    if (!audible) {
      if (barStep % sig.stepsPerBeat === 0) {
        e.click(t, { accent: barStep === 0, sound: 'wood', vol: 0.9 });
        e.at(time, () => this.onStep?.({ countIn: false, beat: barStep / sig.stepsPerBeat, bar: musicalBar, chordIndex, chord }));
      }
      return true;
    }

    if (s.drumsOn !== false) {
      for (const track of DRUM_TRACKS) {
        if (groove.tracks[track.id]?.[barStep]) {
          const accent = barStep % sig.stepsPerBeat === 0 ? 1 : 0.78;
          e.drum(track.id, t, accent * (s.drumVel ?? 1));
        }
      }
    }

    if (s.bassOn !== false) {
      const idx = groove.bass.indexOf(barStep);
      if (idx >= 0) {
        const nextStep = groove.bass[idx + 1] ?? stepsPerBar + groove.bass[0];
        const dur = Math.max(0.12, (nextStep - barStep) * sec * 0.88);
        let midi = bassMidi(chord.rootPc);
        if (groove.walking) {
          midi = walkingBass(chord.rootPc, chord.typeId, Math.floor(barStep / sig.stepsPerBeat));
        } else if (idx % 4 === 2) {
          midi = bassMidi(chord.rootPc) + 7; // quinta ocasional
        } else if (idx % 4 === 3) {
          midi = bassMidi(chord.rootPc, 1);
        }
        e.bass(midi, t, dur, barStep === 0 ? 1 : 0.8);
      }
    }

    if (s.guitarOn !== false) {
      const comp = COMP_PATTERNS[groove.comp] ?? COMP_PATTERNS.basic;
      const hit = comp.hits.find(([st]) => st === barStep);
      if (hit) {
        const midis = guitarMidis(chord.rootPc, chord.typeId);
        const down = barStep % sig.stepsPerBeat === 0;
        if (comp.arpeggio) {
          midis.forEach((m, i) => e.pluck(m, t + i * sec * 0.5, { vel: 0.55 * hit[1], dur: 1.2, tone: s.guitarTone ?? 'clean' }));
        } else {
          e.strum(midis, t, { down, vel: 0.62 * hit[1], dur: sec * 3, tone: s.guitarTone ?? 'clean', spread: down ? 0.016 : 0.012 });
        }
      }
    }

    if (s.synthOn && barStep === 0) {
      e.pad(padMidis(chord.rootPc, chord.typeId), t, sec * stepsPerBar * 0.98, 0.8);
    }

    if (s.clickOn && barStep % sig.stepsPerBeat === 0) {
      e.click(t, { accent: barStep === 0, sound: 'hat', vol: 0.8 });
    }

    if (barStep % sig.stepsPerBeat === 0) {
      const beat = barStep / sig.stepsPerBeat;
      e.at(time, () => this.onStep?.({ countIn: false, beat, bar: musicalBar, chordIndex, chord }));
    }
    return true;
  }
}

export function chordTypeLabel(typeId) {
  return CHORD_TYPES[typeId]?.name ?? typeId;
}
