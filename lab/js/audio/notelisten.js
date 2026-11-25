/**
 * Escucha notas sueltas desde el micrófono o una guitarra MIDI y avisa una vez
 * por nota (una nota sostenida no se cuenta dos veces).
 */

import { detectPitch } from '../core/pitch.js';
import { listenMidi } from './midiin.js';
import { openMic } from './mic.js';

/**
 * @param {object} engine AudioEngine
 * @param {{ source: 'mic'|'midi', onNote: (midi:number)=>void, isArmed?: ()=>boolean }} o
 * @returns {Promise<() => void>} función para dejar de escuchar
 */
export async function startNoteListener(engine, { source, onNote, isArmed = () => true }) {
  if (source === 'midi') {
    return listenMidi({ onNote: (midi, on) => { if (on && isArmed()) onNote(midi); } });
  }
  const mic = await openMic(engine, { fftSize: 2048 });
  const buf = new Float32Array(2048);
  let streakMidi = null;
  let streak = 0;
  let last = null;
  let silent = true;
  const timer = setInterval(() => {
    mic.analyser.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 70, maxFreq: 1400, threshold: 0.012 });
    if (!f) { streakMidi = null; streak = 0; silent = true; return; }
    const m = Math.round(69 + 12 * Math.log2(f / 440));
    if (m === streakMidi) streak += 1;
    else { streakMidi = m; streak = 1; }
    if (streak >= 4 && (m !== last || silent)) {
      last = m;
      silent = false;
      if (isArmed()) onNote(m);
    }
  }, 30);
  return () => { clearInterval(timer); mic.close(); };
}
