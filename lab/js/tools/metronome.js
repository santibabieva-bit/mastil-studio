/** Metrónomo + caja de ritmos: acentos, subdivisiones, swing, entrenadores y temporizador. */

import {
  DRUM_TRACKS, GROOVES, GROOVES_12, SUBDIVISIONS, bpmFromTaps, clampBpm, isBarAudible, speedAtBar, swingOffset,
} from '../core/rhythm.js';
import { coerce } from '../core/state.js';
import { Transport } from '../audio/transport.js';
import { button, clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { header, playToggle, tempoName } from './common.js';

const SOUNDS = [
  { value: 'click', label: 'Clic' },
  { value: 'wood', label: 'Madera' },
  { value: 'beep', label: 'Pitido' },
  { value: 'cowbell', label: 'Cencerro' },
  { value: 'hat', label: 'Hi-hat' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const state = {
    tab: p.tab ?? 'metro',
    bpm: clampBpm(coerce(p.bpm, ctx.session.get().bpm ?? 100)),
    beats: coerce(p.beats, 4),
    accents: [2, 1, 1, 1],
    sub: p.sub ?? 'none',
    swing: coerce(p.swing, 0.5),
    sound: p.sound ?? 'click',
    vol: 0.9,
    speedOn: false, speedTarget: 140, speedStep: 5, speedEvery: 4,
    ivOn: false, ivPlay: 2, ivSilent: 1,
    rndOn: false, rndPct: 30,
    timerOn: false, timerMin: 5,
  };
  const saved = ctx.storage.get('metro-accents', null);
  if (saved && saved.length === state.beats) state.accents = saved;

  const stage = h('div');
  const transport = new Transport(engine, 'metronome');
  ctx.onCleanup(() => {
    transport.stop();
    drumTransport.stop();
  });
  const drumTransport = new Transport(engine, 'drums');

  /* ═══════════ METRÓNOMO ═══════════ */
  const bpmOut = h('div', { class: 'big-number', 'aria-live': 'off' }, String(state.bpm));
  const nameOut = h('div', { class: 'tempo-name' }, tempoName(state.bpm));
  const lights = h('div', { class: 'beat-lights', role: 'group', 'aria-label': 'Acentos por pulso (clic para cambiar)' });
  const barOut = h('div', { class: 'hint', style: 'text-align:center;min-height:1.2em' });
  const metroPlay = playToggle({ startLabel: '▶ Empezar', stopLabel: '■ Parar', onStart: () => startMetro(), onStop: () => transport.stop(), size: 'btn-lg' });
  transport.onStop = () => {
    metroPlay.set(false);
    lights.querySelectorAll('.beat-light').forEach((l) => l.classList.remove('is-on'));
  };

  let bpmSlider;
  function setBpm(value, { fromTrainer = false } = {}) {
    state.bpm = clampBpm(value);
    bpmOut.textContent = String(state.bpm);
    nameOut.textContent = tempoName(state.bpm);
    if (bpmSlider) bpmSlider.setValue(state.bpm);
    if (!fromTrainer) {
      ctx.session.set({ bpm: state.bpm });
      ctx.setParams({ bpm: state.bpm });
    }
  }

  function drawLights() {
    clear(lights);
    if (state.accents.length !== state.beats) {
      state.accents = Array.from({ length: state.beats }, (_, i) => (i === 0 ? 2 : 1));
    }
    state.accents.forEach((level, i) => {
      const light = h('button', { type: 'button', class: 'beat-light', dataset: { level, i }, title: 'Acento fuerte / normal / silencio', 'aria-label': `Pulso ${i + 1}` }, String(i + 1));
      light.addEventListener('click', () => {
        state.accents[i] = (state.accents[i] + 2) % 3; // 2→1→0→2
        light.dataset.level = String(state.accents[i]);
        ctx.storage.set('metro-accents', state.accents);
      });
      lights.append(light);
    });
  }

  async function startMetro() {
    await engine.ensure();
    const perBeat = SUBDIVISIONS[state.sub].perBeat;
    const stepsPerBar = perBeat * state.beats;
    let t0 = null;
    let lastBar = -1;
    let barBpm = state.bpm;
    const startBpm = state.bpm;
    await transport.start({
      stepSeconds: (step) => {
        const beat = 60 / barBpm / perBeat;
        void step;
        return beat;
      },
      tick: (step, time) => {
        if (t0 === null) t0 = time;
        const bar = Math.floor(step / stepsPerBar);
        if (bar !== lastBar) {
          lastBar = bar;
          if (state.speedOn) {
            barBpm = speedAtBar({ start: startBpm, target: state.speedTarget, step: state.speedStep, every: state.speedEvery, bar });
          } else barBpm = state.bpm;
          const shown = barBpm;
          engine.at(time, () => {
            if (state.speedOn) setBpm(shown, { fromTrainer: true });
            barOut.textContent = `Compás ${bar + 1}${state.speedOn ? ` · ${shown} bpm` : ''}`;
          });
        } else if (!state.speedOn) {
          barBpm = state.bpm;
        }
        if (state.timerOn && time - t0 >= state.timerMin * 60) {
          engine.at(time, () => {
            transport.stop();
            ctx.toast('⏱ Tiempo cumplido');
          });
          return false;
        }
        const within = step % perBeat;
        const beat = Math.floor(step / perBeat) % state.beats;
        let audible = isBarAudible({ play: state.ivPlay, silent: state.ivOn ? state.ivSilent : 0, bar });
        // Pulsos aleatorios en silencio: nunca el primero de cada compás cuando el modo es «medio».
        if (audible && state.rndOn && within === 0 && !(beat === 0 && step < stepsPerBar) && Math.random() * 100 < state.rndPct) audible = false;
        let t = time;
        if (state.sub === 'eighth' && within === 1) t += (state.swing - 0.5) * (60 / barBpm);
        if (audible) {
          const level = state.accents[beat];
          if (within === 0 && level > 0) engine.click(t, { accent: level === 2, sound: state.sound, vol: state.vol });
          else if (within > 0) engine.click(t, { accent: false, sound: state.sound, vol: state.vol * 0.45 });
        }
        if (within === 0) {
          engine.at(time, () => {
            lights.querySelectorAll('.beat-light').forEach((l, i) => l.classList.toggle('is-on', i === beat));
          });
        }
        return true;
      },
    });
  }

  // Tap tempo
  const taps = [];
  const backbeatBtn = button('Sólo 2 y 4', { variant: 'outline', title: 'Silencia los pulsos 1 y 3: cuenta tú el resto (estilo jazz/blues)', onClick: () => {
    state.accents = Array.from({ length: state.beats }, (_, i) => (i % 2 === 1 ? 2 : 0));
    ctx.storage.set('metro-accents', state.accents);
    drawLights();
  } });
  const tapBtn = button('Tap tempo', { variant: 'outline', onClick: () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2500) taps.length = 0;
    taps.push(now);
    const bpm = bpmFromTaps(taps);
    if (bpm) setBpm(bpm);
  } });

  bpmSlider = slider({ min: 20, max: 320, value: state.bpm, label: 'Tempo', format: (v) => `${v}`, onInput: (v) => setBpm(v) });

  function renderMetro() {
    clear(stage);
    drawLights();
    const adj = (delta) => button(delta > 0 ? `+${delta}` : `${delta}`, { variant: 'outline', onClick: () => setBpm(state.bpm + delta), attrs: { 'aria-label': `${delta > 0 ? 'Subir' : 'Bajar'} ${Math.abs(delta)} bpm` } });
    stage.append(
      h('div', { class: 'tool-grid tool-grid--rev' },
        h('section', { class: 'panel stack' },
          h('div', { class: 'bpm-display' }, bpmOut, h('div', { class: 'tempo-name' }, 'BPM'), nameOut),
          h('div', { class: 'row', style: 'justify-content:center' }, adj(-10), adj(-1), adj(1), adj(10)),
          bpmSlider,
          lights,
          barOut,
          h('div', { class: 'row', style: 'justify-content:center' }, metroPlay.el, tapBtn, backbeatBtn),
          h('p', { class: 'hint', style: 'text-align:center' }, 'Pulsa los círculos para cambiar el acento (fuerte → normal → silencio). Barra espaciadora: empezar/parar.'),
        ),
        h('div', { class: 'stack' },
          h('section', { class: 'panel stack' }, h('h2', {}, 'Compás y sonido'),
            h('div', { class: 'field' }, h('label', {}, 'Pulsos por compás'), select(Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}` })), state.beats, (v) => { state.beats = Number(v); drawLights(); ctx.setParams({ beats: v }); })),
            h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Subdivisión'), segmented(Object.values(SUBDIVISIONS).map((s) => ({ value: s.id, label: s.label })), state.sub, (v) => { state.sub = v; ctx.setParams({ sub: v }); if (transport.running) { transport.stop(); startRestart(); } })),
            slider({ min: 50, max: 75, value: Math.round(state.swing * 100), label: 'Swing', format: (v) => `${v}%`, onInput: (v) => { state.swing = v / 100; } }),
            h('div', { class: 'field' }, h('label', {}, 'Sonido'), select(SOUNDS, state.sound, (v) => { state.sound = v; ctx.setParams({ sound: v }); })),
            slider({ min: 10, max: 100, value: Math.round(state.vol * 100), label: 'Volumen', format: (v) => `${v}%`, onInput: (v) => { state.vol = v / 100; } }),
          ),
          h('section', { class: 'panel stack' }, h('h2', {}, 'Entrenadores'),
            toggle('Velocidad: subir tempo cada pocos compases', state.speedOn, (v) => { state.speedOn = v; renderTrainers(); }),
            trainerSpeed,
            toggle('Compases en silencio (¿mantienes el tempo?)', state.ivOn, (v) => { state.ivOn = v; renderTrainers(); }),
            trainerInterval,
            toggle('Pulsos aleatorios en silencio (pulso interno)', state.rndOn, (v) => { state.rndOn = v; renderTrainers(); }),
            trainerRandom,
            toggle('Temporizador de práctica', state.timerOn, (v) => { state.timerOn = v; renderTrainers(); }),
            trainerTimer,
          ),
        ),
      ),
    );
    renderTrainers();
  }

  const trainerSpeed = h('div', { class: 'stack' });
  const trainerInterval = h('div', { class: 'stack' });
  const trainerTimer = h('div', { class: 'stack' });
  const trainerRandom = h('div', { class: 'stack' });
  function renderTrainers() {
    clear(trainerSpeed);
    clear(trainerInterval);
    clear(trainerTimer);
    clear(trainerRandom);
    trainerRandom.hidden = !state.rndOn;
    trainerSpeed.hidden = !state.speedOn;
    trainerInterval.hidden = !state.ivOn;
    trainerTimer.hidden = !state.timerOn;
    trainerSpeed.append(
      slider({ min: 40, max: 320, value: state.speedTarget, label: 'Hasta', format: (v) => `${v} bpm`, onInput: (v) => { state.speedTarget = v; } }),
      slider({ min: 1, max: 20, value: state.speedStep, label: 'Subir', format: (v) => `+${v}`, onInput: (v) => { state.speedStep = v; } }),
      slider({ min: 1, max: 16, value: state.speedEvery, label: 'Cada', format: (v) => `${v} comp.`, onInput: (v) => { state.speedEvery = v; } }),
    );
    trainerInterval.append(
      slider({ min: 1, max: 8, value: state.ivPlay, label: 'Suena', format: (v) => `${v} comp.`, onInput: (v) => { state.ivPlay = v; } }),
      slider({ min: 1, max: 8, value: state.ivSilent, label: 'Silencio', format: (v) => `${v} comp.`, onInput: (v) => { state.ivSilent = v; } }),
    );
    trainerRandom.append(
      slider({ min: 10, max: 70, value: state.rndPct, label: 'Pulsos que se apagan', format: (v) => `${v} %`, onInput: (v) => { state.rndPct = v; } }),
      h('p', { class: 'hint' }, 'El primer compás suena entero; después caen pulsos al azar y tú tienes que seguir marcándolos por dentro.'),
    );
    trainerTimer.append(slider({ min: 1, max: 60, value: state.timerMin, label: 'Minutos', format: (v) => `${v} min`, onInput: (v) => { state.timerMin = v; } }));
  }
  async function startRestart() {
    metroPlay.set(true);
    await startMetro();
  }

  /* ═══════════ CAJA DE RITMOS ═══════════ */
  const drum = {
    grid: ctx.storage.get('drum-grid', '16'),
    swing: 0.5,
    pattern: ctx.storage.get('drum-pattern', null),
    preset: 'rock',
    volume: 0.9,
  };
  function gridSteps() { return drum.grid === '16' ? 16 : 12; }
  function perBeat() { return drum.grid === '12t' ? 3 : 4; }
  function loadPreset(id) {
    const source = drum.grid === '16' ? GROOVES : GROOVES_12;
    const groove = source[id] ?? Object.values(source)[0];
    drum.pattern = {};
    for (const t of DRUM_TRACKS) drum.pattern[t.id] = [...(groove.tracks[t.id] ?? new Array(gridSteps()).fill(0))];
    drum.swing = groove.swing ? groove.swing : 0.5;
    drum.preset = id;
  }
  if (!drum.pattern || drum.pattern.kick?.length !== gridSteps()) loadPreset('rock');

  const drumCells = new Map();
  const drumStage = h('div');
  const drumPlay = playToggle({ startLabel: '▶ Reproducir', stopLabel: '■ Parar', onStart: () => startDrums(), onStop: () => drumTransport.stop(), size: 'btn-lg' });
  drumTransport.onStop = () => {
    drumPlay.set(false);
    for (const cells of drumCells.values()) cells.forEach((c) => c.classList.remove('is-now'));
  };

  function renderDrums() {
    clear(drumStage);
    drumCells.clear();
    const steps = gridSteps();
    const grid = h('div', { class: 'seq-grid' });
    grid.style.setProperty('--cols', steps);
    const per = perBeat();
    DRUM_TRACKS.forEach((track) => {
      const row = h('div', { class: 'seq-row' });
      row.style.gridTemplateColumns = `110px repeat(${steps}, minmax(28px, 1fr))`;
      row.append(h('div', { class: 'seq-label' }, track.label));
      const cells = [];
      for (let i = 0; i < steps; i += 1) {
        const on = drum.pattern[track.id][i] ? 1 : 0;
        const cell = h('button', { type: 'button', class: `seq-cell ${on ? 'is-on' : ''} ${i % per === 0 ? 'is-beat' : ''}`, 'aria-pressed': String(Boolean(on)), 'aria-label': `${track.label} paso ${i + 1}` });
        cell.addEventListener('click', async () => {
          drum.pattern[track.id][i] = drum.pattern[track.id][i] ? 0 : 1;
          cell.classList.toggle('is-on', Boolean(drum.pattern[track.id][i]));
          cell.setAttribute('aria-pressed', String(Boolean(drum.pattern[track.id][i])));
          ctx.storage.set('drum-pattern', drum.pattern);
          if (drum.pattern[track.id][i]) {
            await engine.ensure();
            engine.drum(track.id, engine.time + 0.01, 0.9);
          }
        });
        cells.push(cell);
        row.append(cell);
      }
      drumCells.set(track.id, cells);
      grid.append(row);
    });
    const presetSource = drum.grid === '16' ? GROOVES : GROOVES_12;
    drumStage.append(
      h('section', { class: 'panel stack' },
        h('div', { class: 'row row--between' },
          h('h2', { style: 'margin:0' }, 'Caja de ritmos'),
          h('div', { class: 'row' },
            select(Object.entries(presetSource).map(([value, g]) => ({ value, label: g.label })), drum.preset in presetSource ? drum.preset : Object.keys(presetSource)[0], (v) => { loadPreset(v); ctx.storage.set('drum-pattern', drum.pattern); renderDrums(); }, { 'aria-label': 'Groove predefinido', style: 'min-width:170px' }),
            segmented([{ value: '16', label: '16 pasos' }, { value: '12', label: '3/4' }, { value: '12t', label: 'Tresillos' }], drum.grid, (v) => { drum.grid = v; ctx.storage.set('drum-grid', v); loadPreset(v === '16' ? 'rock' : 'waltz'); renderDrums(); }),
          ),
        ),
        h('div', { style: 'overflow-x:auto' }, grid),
        h('div', { class: 'row' },
          drumPlay.el,
          button('Vaciar', { variant: 'outline', onClick: () => { for (const t of DRUM_TRACKS) drum.pattern[t.id] = new Array(steps).fill(0); ctx.storage.set('drum-pattern', drum.pattern); renderDrums(); } }),
        ),
        slider({ min: 20, max: 300, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => setBpm(v) }),
        slider({ min: 50, max: 75, value: Math.round(drum.swing * 100), label: 'Swing', format: (v) => `${v}%`, onInput: (v) => { drum.swing = v / 100; } }),
        slider({ min: 10, max: 100, value: Math.round(drum.volume * 100), label: 'Volumen', format: (v) => `${v}%`, onInput: (v) => { drum.volume = v / 100; engine.setBusVolume('drums', drum.volume); } }),
      ),
    );
  }

  async function startDrums() {
    await engine.ensure();
    engine.setBusVolume('drums', drum.volume);
    const steps = gridSteps();
    const per = perBeat();
    await drumTransport.start({
      stepSeconds: () => 60 / state.bpm / per,
      tick: (step, time) => {
        const i = step % steps;
        const sec = 60 / state.bpm / per;
        const t = time + (per === 4 ? swingOffset(i, drum.swing) * sec : 0);
        for (const track of DRUM_TRACKS) {
          if (drum.pattern[track.id][i]) engine.drum(track.id, t, i % per === 0 ? 1 : 0.8);
        }
        engine.at(time, () => {
          for (const cells of drumCells.values()) cells.forEach((c, k) => c.classList.toggle('is-now', k === i));
        });
        return true;
      },
    });
  }

  /* ═══════════ Montaje ═══════════ */
  function showTab() {
    clear(stage);
    if (state.tab === 'metro') {
      renderMetro();
    } else {
      renderDrums();
      stage.append(drumStage);
    }
    ctx.setParams({ tab: state.tab });
  }
  const tabs = segmented([{ value: 'metro', label: 'Metrónomo' }, { value: 'drums', label: 'Caja de ritmos' }], state.tab, (v) => {
    transport.stop();
    drumTransport.stop();
    state.tab = v;
    showTab();
  });

  const onKey = (e) => {
    if (e.code !== 'Space' || e.target.closest?.('input,select,textarea,button')) return;
    e.preventDefault();
    if (state.tab === 'metro') metroPlay.el.click();
    else drumPlay.el.click();
  };
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));

  root.append(header('Practicar', 'Metrónomo y caja de ritmos', 'Acentos por pulso, subdivisiones, swing, entrenador de velocidad, compases en silencio y temporizador. Además, una caja de ritmos para improvisar o practicar con un groove.'), h('div', { class: 'row' }, tabs), stage);
  showTab();
}

export default {
  id: 'metronome',
  title: 'Metrónomo y caja de ritmos',
  group: 'practice',
  icon: '◔',
  summary: 'Acentos, subdivisiones, swing, entrenador de velocidad, silencios y caja de ritmos.',
  mount,
};
