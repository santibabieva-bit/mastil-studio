/** Reproduce un modelo de tablatura (técnicas incluidas) sobre un Transport. */

import { Transport } from './transport.js';
import { TUNINGS } from '../core/music.js';
import { tabEvents, tabLength } from '../core/tab.js';

export function tabTuning(tab) {
  if (Array.isArray(tab.tuning) && tab.tuning.length === tab.strings) return tab.tuning;
  if (tab.strings === 4) return TUNINGS.bass4.midi;
  if (tab.strings === 5) return TUNINGS.bass5.midi;
  if (tab.strings === 7) return TUNINGS.seven.midi;
  if (tab.strings === 6) return TUNINGS.standard.midi;
  return TUNINGS.standard.midi.slice(0, tab.strings);
}

export class TabPlayer {
  constructor(engine, tool = 'tab') {
    this.engine = engine;
    this.transport = new Transport(engine, tool);
  }

  get running() {
    return this.transport.running;
  }

  set onStop(fn) {
    this.transport.onStop = fn;
  }

  stop() {
    this.transport.stop();
  }

  /**
   * @param {object} tab
   * @param {object} o { bpm: () => number, loop, countIn, onColumn(col), from }
   */
  async start(tab, { bpm, loop = false, countIn = false, onColumn = null, from = 0, tone = 'clean' } = {}) {
    const e = this.engine;
    await e.ensure();
    const events = tabEvents(tab);
    const tuning = tabTuning(tab);
    const length = tabLength(tab);
    const perBeat = tab.subdivision ?? 2;
    const countSteps = countIn ? perBeat * 4 : 0;
    const stepSec = () => 60 / bpm() / perBeat;
    await this.transport.start({
      stepSeconds: stepSec,
      startStep: 0,
      tick: (step, time) => {
        if (step < countSteps) {
          if (step % perBeat === 0) e.click(time, { accent: step === 0, sound: 'wood' });
          return true;
        }
        const s = step - countSteps;
        if (!loop && s >= length - from) {
          e.at(time + stepSec() * 2, () => this.transport.stop());
          return false;
        }
        const col = (from + s) % length;
        const dur = stepSec();
        for (const note of events[col].notes) {
          if (note.mute) {
            e.pluck(tuning[note.s] + 12, time, { mute: true, vel: 0.35, dur: 0.05, tone });
            continue;
          }
          const midi = tuning[note.s] + note.fret;
          e.pluck(midi, time, {
            dur: dur * (note.link ? 1.1 : 2.2),
            vel: note.accent ? 1 : 0.78,
            legato: note.legato,
            bend: note.bend ? 2 : 0,
            vibrato: note.vibrato,
            harmonic: note.harmonic,
            tone,
          });
        }
        if (perBeat > 0 && s % perBeat === 0 && countIn !== 'none') {
          // Pulso suave para orientarse (se puede silenciar con el volumen de «click»).
          e.click(time, { accent: false, sound: 'hat', vol: 0.35 });
        }
        if (onColumn) e.at(time, () => onColumn(col));
        return true;
      },
    });
  }
}
