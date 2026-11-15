/** Vibrato Trainer: una nota sostenida que sube y baja al compás del click. */

import { TUNINGS, midiName, midiToFreq, prettyNote } from '../core/music.js';
import { speedAtBar } from '../core/rhythm.js';
import { coerce } from '../core/state.js';
import { Transport } from '../audio/transport.js';
import { clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { header, playToggle } from './common.js';

const RATES = [
  { value: 1, label: '1 por pulso' },
  { value: 2, label: '2 por pulso' },
  { value: 3, label: 'Tresillos' },
  { value: 4, label: '4 por pulso' },
];

const TONES = [
  { value: 0, label: 'Limpio' },
  { value: 0.45, label: 'Crunch' },
  { value: 0.9, label: 'Lead' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const std = TUNINGS.standard.midi;
  const state = {
    string: coerce(p.s, 1), // índice (0 = 1ª)
    fret: coerce(p.f, 8),
    cents: coerce(p.w, 60),
    rate: coerce(p.r, 2),
    tone: coerce(p.t, 0),
    bpm: coerce(p.bpm, 70),
    builder: false,
    max: 110,
    step: 5,
    every: 4,
    click: true,
  };
  const noteOut = h('div', { class: 'big-number' });
  const curve = h('div');
  const bpmOut = h('p', { class: 'hint', style: 'text-align:center' });
  const transport = new Transport(engine, 'vibrato');
  let sus = null;
  transport.onStop = () => {
    play.set(false);
    if (sus) sus.stop(engine.time);
    sus = null;
    drawCurve(-1);
  };
  ctx.onCleanup(() => {
    transport.stop();
  });
  const play = playToggle({ startLabel: '▶ Empezar', onStart: () => start(), onStop: () => transport.stop(), size: 'btn-lg' });

  const midi = () => std[state.string] + state.fret;

  function drawNote() {
    noteOut.textContent = prettyNote(midiName(midi()));
    ctx.setParams({ s: state.string, f: state.fret, w: state.cents, r: state.rate, t: state.tone, bpm: state.bpm });
  }

  function drawCurve(cursor) {
    const cycles = 4;
    const w = 800;
    const hgt = 110;
    const amp = Math.min(1, state.cents / 200);
    const points = [];
    for (let c = 0; c <= cycles; c += 1) {
      const x = (c / cycles) * w;
      points.push([x, hgt - 12]);
      if (c < cycles) points.push([x + w / cycles / 2, hgt - 12 - amp * (hgt - 28)]);
    }
    const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    let cursorLine = '';
    if (cursor >= 0) {
      const x = ((cursor % (cycles * 2)) / (cycles * 2)) * w;
      cursorLine = `<line x1="${x}" y1="4" x2="${x}" y2="${hgt - 4}" stroke="#df812f" stroke-width="3"/>`;
    }
    curve.innerHTML = `<svg class="curve" viewBox="0 0 800 110" role="img" aria-label="Forma del vibrato"><polyline points="${path}" fill="none" stroke="#17231e" stroke-width="3" stroke-linejoin="round"/>${cursorLine}</svg>`;
  }

  async function start() {
    await engine.ensure();
    const base = midiToFreq(midi());
    const peak = (cents) => base * 2 ** (cents / 1200);
    let cur = state.bpm;
    const barSteps = 4 * state.rate * 2; // 4 pulsos
    const startBpm = state.bpm;
    await transport.start({
      stepSeconds: () => 60 / cur / state.rate / 2,
      tick: (step, time) => {
        if (!sus) sus = engine.sustain(base, time, { type: 'sawtooth', drive: state.tone, vol: 0.2 });
        const half = step % 2;
        const bar = Math.floor(step / barSteps);
        if (step % barSteps === 0) {
          cur = state.builder ? speedAtBar({ start: startBpm, target: state.max, step: state.step, every: state.every, bar }) : cur;
          engine.at(time, () => {
            bpmOut.textContent = `${cur} bpm`;
          });
        }
        const dur = 60 / cur / state.rate / 2;
        if (half === 0) {
          sus.set(base, time);
          sus.ramp(peak(state.cents), time + dur);
        } else {
          sus.set(peak(state.cents), time);
          sus.ramp(base, time + dur);
        }
        if (state.click && step % (state.rate * 2) === 0) engine.click(time, { accent: step % barSteps === 0, sound: 'wood', vol: 0.8 });
        engine.at(time, () => drawCurve(step));
        return true;
      },
    });
  }

  const noteControls = h('div', { class: 'stack' });
  function drawControls() {
    clear(noteControls);
    noteControls.append(
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', {}, 'Cuerda'), select(['1ª (aguda)', '2ª', '3ª', '4ª', '5ª', '6ª'].map((l, i) => ({ value: i, label: l })), state.string, (v) => { state.string = Number(v); drawNote(); })),
        h('div', { class: 'field' }, h('label', {}, 'Traste'), select(Array.from({ length: 23 }, (_, i) => ({ value: i, label: `${i}` })), state.fret, (v) => { state.fret = Number(v); drawNote(); })),
      ),
    );
  }

  root.append(
    header('Practicar', 'Vibrato Trainer', 'Un vibrato controlado se entrena con tempo: la nota sube y baja una vez por click. Ajusta anchura, velocidad y tono, y deja que el entrenador suba el tempo poco a poco.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' },
        h('div', { style: 'text-align:center' }, noteOut, h('div', { class: 'tempo-name' }, 'Nota sostenida')),
        curve,
        bpmOut,
        h('div', { class: 'row', style: 'justify-content:center' }, play.el),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, h('h2', {}, 'Nota'), noteControls),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Vibrato'),
          slider({ min: 15, max: 200, step: 5, value: state.cents, label: 'Anchura', format: (v) => `${v} ¢`, onInput: (v) => { state.cents = v; drawCurve(-1); drawNote(); } }),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Velocidad'), segmented(RATES, state.rate, (v) => { state.rate = Number(v); drawNote(); })),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Tono'), segmented(TONES, state.tone, (v) => { state.tone = Number(v); drawNote(); })),
          slider({ min: 40, max: 160, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { state.bpm = v; drawNote(); } }),
          toggle('Click', state.click, (v) => { state.click = v; }),
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Entrenador de velocidad'),
          toggle('Subir el tempo automáticamente', state.builder, (v) => { state.builder = v; }),
          slider({ min: 60, max: 200, value: state.max, label: 'Hasta', format: (v) => `${v} bpm`, onInput: (v) => { state.max = v; } }),
          slider({ min: 1, max: 15, value: state.step, label: 'Subir', format: (v) => `+${v}`, onInput: (v) => { state.step = v; } }),
          slider({ min: 1, max: 16, value: state.every, label: 'Cada', format: (v) => `${v} comp.`, onInput: (v) => { state.every = v; } }),
        ),
      ),
    ),
  );
  drawControls();
  drawNote();
  drawCurve(-1);
}

export default {
  id: 'vibrato',
  title: 'Vibrato Trainer',
  group: 'practice',
  icon: '∿',
  summary: 'Nota sostenida que sube y baja al compás del click, con entrenador de velocidad.',
  isNew: true,
  mount,
};
