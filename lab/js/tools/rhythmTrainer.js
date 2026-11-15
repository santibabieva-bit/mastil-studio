/** Rhythm Trainer: ritmos aleatorios para tocar con el click, con modo «de memoria» y medición de tus toques. */

import {
  RHYTHM_LEVELS, TIME_SIGNATURES, countLabels, generateRhythm, rhythmEvents,
} from '../core/rhythm.js';
import { coerce } from '../core/state.js';
import { Transport } from '../audio/transport.js';
import { button, clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { header, playToggle } from './common.js';

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const state = {
    signature: p.sig ?? '4/4',
    bars: coerce(p.bars, 2),
    level: p.lvl ?? 'easy',
    rests: coerce(p.rests, false),
    bpm: coerce(p.bpm, 80),
    hidden: coerce(p.hidden, false),
    listen: false,
    revealed: false,
  };
  let rhythm = generateRhythm({ signature: state.signature, bars: state.bars, level: state.level, rests: state.rests });
  let events = [];
  let total = 0;
  const stage = h('div', { class: 'stack' });
  const result = h('div', { class: 'feedback', hidden: true });
  const cellsByStep = [];
  const transport = new Transport(engine, 'rhythm');
  transport.onStop = () => {
    play.set(false);
    listenBtn.textContent = '🔊 Escuchar el ritmo';
    cellsByStep.forEach((c) => c.classList.remove('is-now'));
  };
  ctx.onCleanup(() => transport.stop());
  const play = playToggle({ startLabel: '▶ Tocar con click', onStart: () => start(false), onStop: () => transport.stop(), size: 'btn-lg' });
  const listenBtn = button('🔊 Escuchar el ritmo', { variant: 'outline', onClick: async () => {
    if (transport.running) { transport.stop(); return; }
    play.set(true);
    listenBtn.textContent = '■ Detener';
    await start(true);
  } });

  function newRhythm() {
    transport.stop();
    rhythm = generateRhythm({ signature: state.signature, bars: state.bars, level: state.level, rests: state.rests });
    state.revealed = false;
    result.hidden = true;
    draw();
  }

  function draw() {
    const sig = TIME_SIGNATURES[state.signature];
    ({ events, total } = rhythmEvents(rhythm));
    const labels = countLabels(state.signature);
    clear(stage);
    cellsByStep.length = 0;
    const hide = state.hidden && !state.revealed;
    let offset = 0;
    rhythm.bars.forEach((bar, b) => {
      const perBar = bar.length;
      const wrap = h('div', { class: hide ? 'rhythm-hidden' : '' });
      const countEl = h('div', { class: 'count-row' });
      countEl.style.gridTemplateColumns = `repeat(${perBar}, 1fr)`;
      for (let i = 0; i < perBar; i += 1) countEl.append(h('div', {}, labels[i % labels.length]));
      const row = h('div', { class: 'rhythm-bar' });
      row.style.gridTemplateColumns = `repeat(${perBar}, 1fr)`;
      const tails = new Set();
      for (const e of events) {
        for (let k = 1; k < e.dur; k += 1) tails.add(e.start + k);
      }
      for (let i = 0; i < perBar; i += 1) {
        const abs = offset + i;
        const isOn = bar.steps[i] === 1;
        const cell = h('div', { class: `rhythm-cell ${isOn ? 'on' : tails.has(abs) ? 'tail' : ''} ${i % sig.stepsPerBeat === 0 ? 'is-beat' : ''}` });
        cellsByStep[abs] = cell;
        row.append(cell);
      }
      wrap.append(h('div', { class: 'hint' }, `Compás ${b + 1}`), countEl, row);
      stage.append(wrap);
      offset += perBar;
    });
    if (hide) stage.append(h('p', { class: 'hint' }, 'Modo «de memoria»: el ritmo está oculto. Escúchalo, tócalo y pulsa «Revelar» para comprobarlo.'));
    stage.append(result);
  }

  async function start(listening) {
    await engine.ensure();
    const sig = TIME_SIGNATURES[state.signature];
    const perBeat = sig.stepsPerBeat;
    const barSteps = perBeat * sig.beats;
    const countSteps = barSteps; // un compás de cuenta
    const evStarts = new Set(events.map((e) => e.start));
    const stepSec = () => 60 / state.bpm / perBeat;
    let passTaps = [];
    let loopStart = 0;
    let passIndex = 0;
    const tap = () => {
      if (!transport.running || loopStart === 0) return;
      passTaps.push(engine.time - (engine.ctx.outputLatency ?? 0) - 0.01);
    };
    tapHandler = tap;
    await transport.start({
      stepSeconds: () => stepSec(),
      tick: (step, time) => {
        const sec = stepSec();
        if (step < countSteps) {
          if (step % perBeat === 0) engine.click(time, { accent: step === 0, sound: 'wood' });
          return true;
        }
        const s = (step - countSteps) % total;
        if (s === 0) {
          // Evalúa la pasada anterior y empieza otra.
          if (loopStart !== 0 && !listening) evaluate(passTaps, loopStart, sec);
          loopStart = time;
          passTaps = [];
          passIndex += 1;
        }
        if (s % perBeat === 0) engine.click(time, { accent: s % barSteps === 0, sound: 'click', vol: 0.8 });
        if (evStarts.has(s) && listening) engine.pluck(64, time, { mute: true, vel: 0.8, dur: 0.15 });
        if (evStarts.has(s) && listening) engine.drum('snare', time, 0.5);
        engine.at(time, () => {
          cellsByStep.forEach((c, k) => c.classList.toggle('is-now', k === s));
        });
        void passIndex;
        return true;
      },
    });
  }
  let tapHandler = null;

  function evaluate(taps, loopStart, sec) {
    if (!taps.length) return;
    const loopLen = total * sec;
    let hits = 0;
    let dev = 0;
    for (const e of events) {
      const at = loopStart + e.start * sec;
      let best = Infinity;
      for (const t of taps) {
        const d = t - at;
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
      if (Math.abs(best) <= 0.11) {
        hits += 1;
        dev += best;
      }
    }
    const extra = Math.max(0, taps.length - hits);
    void loopLen;
    engine.at(engine.time, () => {
      result.hidden = false;
      const avg = hits ? Math.round((dev / hits) * 1000) : 0;
      const bias = avg > 8 ? 'algo tarde' : avg < -8 ? 'algo pronto' : 'en el punto';
      result.className = `feedback ${hits === events.length && extra === 0 ? 'ok' : 'bad'}`;
      result.textContent = `Última pasada: ${hits}/${events.length} golpes en su sitio${extra ? ` · ${extra} de más` : ''} · ${bias} (${avg > 0 ? '+' : ''}${avg} ms).`;
    });
  }

  const onKey = (e) => {
    if (e.code !== 'Space' || e.target.closest?.('input,select,textarea')) return;
    e.preventDefault();
    if (tapHandler) tapHandler();
  };
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));

  const tapPad = button('TAP (o barra espaciadora)', { variant: 'dark', onClick: () => { if (tapHandler) tapHandler(); } });

  root.append(
    header('Practicar', 'Rhythm Trainer', 'Te muestro un ritmo aleatorio: tócalo sobre el click (puedes marcarlo con la barra espaciadora para medir tu precisión) y, si quieres, oculta el ritmo y reprodúcelo de memoria.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' },
        stage,
        h('div', { class: 'row' }, play.el, listenBtn, tapPad, button('Revelar', { variant: 'outline', onClick: () => { state.revealed = true; draw(); } }), button('Nuevo ritmo', { variant: 'accent', onClick: newRhythm })),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Ajustes'),
        h('div', { class: 'field' }, h('label', {}, 'Compás'), select(Object.values(TIME_SIGNATURES).filter((s) => !s.backingOnly).map((s) => ({ value: s.id, label: s.label })), state.signature, (v) => { state.signature = v; newRhythm(); })),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Dificultad'), segmented(Object.values(RHYTHM_LEVELS).map((l) => ({ value: l.id, label: l.label })), state.level, (v) => { state.level = v; newRhythm(); })),
        h('div', { class: 'field' }, h('label', {}, 'Compases'), select([1, 2, 3, 4], state.bars, (v) => { state.bars = Number(v); newRhythm(); })),
        slider({ min: 40, max: 160, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { state.bpm = v; ctx.setParams({ bpm: v }); } }),
        toggle('Incluir silencios', state.rests, (v) => { state.rests = v; newRhythm(); }),
        toggle('Ocultar el ritmo (de memoria)', state.hidden, (v) => { state.hidden = v; state.revealed = false; draw(); }),
      ),
    ),
  );
  draw();
}

export default {
  id: 'rhythm',
  title: 'Rhythm Trainer',
  group: 'practice',
  icon: '♩',
  summary: 'Ritmos aleatorios para tocar con el click, de memoria y con medición de tus toques.',
  isNew: true,
  mount,
};
