/**
 * Jam Studio: una base que suena y un mástil que sigue los acordes.
 * Sugiere qué escala tocar sobre cada acorde, ilumina las notas del acorde
 * (1-3-5-7), avisa del siguiente cambio y propone retos de aterrizaje que
 * puntúa con el micrófono o con un instrumento MIDI.
 */

import { TUNINGS, freqToMidi, mod, pcName, prettyNote } from '../core/music.js';
import { resolveProgression } from '../core/progressions.js';
import { TIME_SIGNATURES, groovesFor } from '../core/rhythm.js';
import { coerce } from '../core/state.js';
import { detectPitch } from '../core/pitch.js';
import {
  FOCUS_MODES, JAM_PRESETS, LandingScorer, boardPositions, focusNotes, followWindow, jamPreset, pickLandingTarget, suggestScales,
} from '../core/jam.js';
import { BackingPlayer } from '../audio/backing.js';
import { PLUCK_TONES } from '../audio/pluck.js';
import { renderFretboard } from '../ui/fretboard.js';
import { backingToMidi } from '../core/midi.js';
import { saveBlob } from '../ui/export.js';
import { button, clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { drumStyleOptions, header, instrumentBar, playToggle, rootChoices } from './common.js';

const STD = TUNINGS.standard.midi;
const KEY_MODES = [{ value: 'major', label: 'Mayor' }, { value: 'minor', label: 'Menor' }];
const ROLE_NAMES = { root: 'fundamental', third: '3.ª', fifth: '5.ª', seventh: '7.ª' };

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const sess = ctx.session.get();
  const first = jamPreset(p.prog ?? 'blues12');
  const state = {
    root: p.root ?? sess.root,
    preset: first.id,
    mode: p.mode ?? first.mode,
    style: first.style,
    signature: p.sig ?? '4/4',
    groove: p.groove ?? first.groove,
    bpm: coerce(p.bpm, sess.bpm ?? 90),
    swing: null,
    focus: p.focus ?? 'scale',
    follow: coerce(p.follow, true),
    chords: first.chords.map((c) => ({ ...c })),
    resolved: [],
    picks: [],
    guitarTone: 'soft', drumStyle: 'auto', drumFill: false,
    drumsOn: true, bassOn: true, guitarOn: true, synthOn: false, clickOn: false, countIn: true,
    vol: { drums: 0.75, bass: 0.8, guitar: 0.7, synth: 0.7 },
    ramp: { on: false, step: 4, max: 140 },
    mute: { on: false, play: 3, silent: 1 },
    loop: { on: false, from: 1, to: 4 },
    challenge: { on: false, source: 'mic', roles: ['root', 'third', 'fifth'] },
  };
  if (p.chords) {
    try {
      const parsed = JSON.parse(decodeURIComponent(p.chords));
      if (Array.isArray(parsed) && parsed.length) state.chords = parsed;
    } catch { /* ignorar enlace dañado */ }
  }
  let viewIndex = 0;
  let playingIndex = -1;
  let windowCenter = 5;
  let lap = 0;
  let nextTarget = null;
  let scorer = new LandingScorer();
  let lastScoreText = '';
  let micStop = null;
  let midiStop = null;
  const player = new BackingPlayer(engine, 'jam');

  const boardEl = h('div', { class: 'fretboard-wrap', style: 'overflow-x:auto' });
  const nowEl = h('div', { class: 'jam-now' });
  const nextEl = h('div', { class: 'jam-next' });
  const scaleEl = h('div', { class: 'stack' });
  const barsEl = h('div', { class: 'row' });
  const beatDots = h('div', { class: 'beat-lights', style: 'margin:0' });
  const status = h('p', { class: 'hint', style: 'text-align:center;min-height:1.3em' });
  const scoreEl = h('div', { class: 'stack' });
  const heardEl = h('p', { class: 'hint', style: 'min-height:1.3em' });

  /* ─── datos derivados ─── */
  const keyInfo = () => ({ rootPc: resolveProgression(state.root, [{ s: 0, t: 'maj' }])[0].rootPc, mode: state.mode });
  function suggestionsFor(i) {
    const c = state.resolved[i];
    return suggestScales({ key: keyInfo(), chord: { rootPc: c.rootPc, typeId: c.typeId }, style: state.style });
  }
  function currentSuggestion(i) {
    const list = suggestionsFor(i);
    return list[Math.min(state.picks[i] ?? 0, list.length - 1)];
  }
  const activeChords = () => {
    if (!state.loop.on) return { resolved: state.resolved, offset: 0 };
    const from = Math.max(0, Math.min(state.loop.from, state.loop.to) - 1);
    const to = Math.min(state.resolved.length - 1, Math.max(state.loop.from, state.loop.to) - 1);
    return { resolved: state.resolved.slice(from, to + 1), offset: from };
  };

  function refresh() {
    state.resolved = resolveProgression(state.root, state.chords);
    for (const [bus, v] of Object.entries(state.vol)) engine.setBusVolume?.(bus, v);
    if (state.mute.on) state.muteCycle = { play: state.mute.play, silent: state.mute.silent };
    else state.muteCycle = null;
    state.loopResolved = activeChords().resolved;
    ctx.setParams({
      root: state.root, mode: state.mode, sig: state.signature, groove: state.groove, bpm: state.bpm, focus: state.focus, follow: state.follow ? 1 : 0, prog: state.preset,
      chords: encodeURIComponent(JSON.stringify(state.chords)),
    });
    ctx.session.set({ root: state.root, bpm: state.bpm });
  }

  /* ─── mástil ─── */
  function drawBoard(i) {
    if (!state.resolved[i]) return;
    const chord = state.resolved[i];
    const suggestion = currentSuggestion(i);
    const { pcs, context, tones } = focusNotes({ chord: { rootPc: chord.rootPc, typeId: chord.typeId }, suggestion, focus: state.focus });
    const maxFret = 15;
    let win = { from: 0, to: maxFret };
    if (state.follow) {
      win = followWindow({ tuning: STD, rootPc: chord.rootPc, prevCenter: windowCenter, width: 6, maxFret });
      windowCenter = win.center;
    }
    const notes = [];
    for (const pos of boardPositions({ tuning: STD, pcs: new Set([...pcs.keys(), ...context]), from: 0, to: maxFret })) {
      const main = pcs.get(pos.pc);
      const inWin = pos.f >= win.from && pos.f <= win.to;
      if (main) {
        notes.push({ s: pos.s, f: pos.f, label: main.label, role: main.role, kind: 'note', dim: !inWin });
      } else {
        notes.push({ s: pos.s, f: pos.f, label: '', kind: 'ghost', dim: !inWin });
      }
    }
    boardEl.innerHTML = renderFretboard({ tuning: STD, from: 0, to: maxFret, notes, width: 1200, title: `${prettyNote(chord.symbol)} · ${suggestion.label}` });
    if (state.follow) {
      const hint = h('p', { class: 'hint', style: 'text-align:center;margin:4px 0 0' }, `Posición sugerida: trastes ${win.from}–${win.to} (las notas fuera de esa zona quedan atenuadas).`);
      boardEl.append(hint);
    }
    nowEl.replaceChildren(
      h('div', { class: 'kicker' }, playingIndex >= 0 ? 'Suena ahora' : 'Vista previa'),
      h('div', { class: 'big-number', style: 'font-size:2.4rem;line-height:1' }, prettyNote(chord.symbol)),
      h('p', { class: 'hint', style: 'margin:4px 0 0' }, `Toca: ${suggestion.label}`),
      h('p', { class: 'hint', style: 'margin:2px 0 0' }, suggestion.why),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, tones.map((t) => `${t.label} = ${pcName(t.pc, 'sharp')}`).join(' · ')),
    );
    const nextI = (i + 1) % state.resolved.length;
    drawNext(nextI);
  }

  function drawNext(nextI, urgent = false) {
    const c = state.resolved[nextI];
    if (!c) return;
    const sugg = currentSuggestion(nextI);
    nextEl.className = `jam-next ${urgent ? 'is-urgent' : ''}`;
    nextEl.replaceChildren(...[
      h('div', { class: 'kicker' }, urgent ? '¡Cambio ahora!' : 'Siguiente'),
      h('div', { class: 'big-number', style: 'font-size:1.6rem;line-height:1' }, prettyNote(c.symbol)),
      h('p', { class: 'hint', style: 'margin:2px 0 0' }, sugg.label),
      nextTarget && state.challenge.on ? h('p', { class: 'hint', style: 'margin:4px 0 0;font-weight:800;color:var(--orange-dark)' }, `Reto: aterriza en la ${nextTarget.label} (${prettyNote(pcName(nextTarget.pc, 'sharp'))})`) : null,
    ].filter(Boolean));
  }

  /* ─── barras de acordes ─── */
  function drawBars() {
    clear(barsEl);
    state.resolved.forEach((chord, i) => {
      const list = suggestionsFor(i);
      const sel = select(list.map((s, k) => ({ value: k, label: s.label })), Math.min(state.picks[i] ?? 0, list.length - 1), (v) => {
        state.picks[i] = Number(v);
        viewIndex = i;
        drawBoard(i);
      }, { 'aria-label': `Escala para el compás ${i + 1}` });
      const card = h('div', { class: `chord-card ${i === viewIndex ? 'is-view' : ''}`, style: 'min-width:130px;flex:1 1 130px;max-width:170px', dataset: { i }, tabindex: 0, role: 'button' },
        h('div', { class: 'roman' }, `Compás ${i + 1}`),
        h('div', { class: 'big-number', style: 'font-size:1.6rem;margin:2px 0' }, prettyNote(chord.symbol)),
        sel,
      );
      card.addEventListener('click', (e) => {
        if (e.target.closest('select')) return;
        viewIndex = i;
        windowCenter = 5;
        drawBoard(i);
        barsEl.querySelectorAll('.chord-card').forEach((c) => c.classList.toggle('is-view', Number(c.dataset.i) === i));
      });
      barsEl.append(card);
    });
  }

  function drawBeats() {
    clear(beatDots);
    const sig = TIME_SIGNATURES[state.signature];
    for (let i = 0; i < sig.beats; i += 1) beatDots.append(h('div', { class: 'beat-light', dataset: { level: i === 0 ? 2 : 1 } }, String(i + 1)));
  }

  /* ─── reproducción ─── */
  player.transport.onStop = () => {
    play.set(false);
    playingIndex = -1;
    barsEl.querySelectorAll('.chord-card').forEach((c) => c.classList.remove('is-active'));
    status.textContent = '';
    stopListening();
    if (scorer.current) scorer.finish();
    finishScore();
    drawBoard(viewIndex);
  };
  ctx.onCleanup(() => { player.stop(); stopListening(); });
  const play = playToggle({ startLabel: '▶ Empezar a tocar', onStart: () => start(), onStop: () => player.stop(), size: 'btn-lg' });

  async function start() {
    refresh();
    lap = 0;
    windowCenter = 5;
    scorer = new LandingScorer();
    await engine.ensure();
    for (const [bus, v] of Object.entries(state.vol)) engine.setBusVolume(bus, v);
    state.resolved = resolveProgression(state.root, state.chords);
    const { resolved: loopChords, offset } = activeChords();
    state.loopResolved = loopChords;
    // El reproductor lee `settings` en cada paso: un proxy lo mantiene enlazado al estado.
    const settings = new Proxy(state, { get: (target, key) => (key === 'resolved' ? target.loopResolved : target[key]) });
    if (state.challenge.on) await startListening();
    nextTarget = null;
    let lastIdx = -1;
    await player.start(settings, (info) => {
      beatDots.querySelectorAll('.beat-light').forEach((l, i) => l.classList.toggle('is-on', i === info.beat));
      if (info.countIn) {
        status.textContent = 'Cuenta previa…';
        return;
      }
      const real = info.chordIndex + offset;
      const n = loopChords.length;
      if (info.bar > 0 && info.bar % n === 0 && info.beat === 0 && info.chordIndex === 0 && lastIdx !== 0) {
        lap += 1;
        if (state.ramp.on) {
          state.bpm = Math.min(state.ramp.max, state.bpm + state.ramp.step);
          tempoSlider.setValue(state.bpm);
          status.textContent = `Vuelta ${lap + 1} · ${state.bpm} bpm`;
        }
      }
      status.textContent = `Compás ${info.bar + 1} · ${prettyNote(info.chord.symbol)}${state.ramp.on ? ` · ${state.bpm} bpm` : ''}`;
      const sig = TIME_SIGNATURES[state.signature];
      if (info.chordIndex !== lastIdx) {
        lastIdx = info.chordIndex;
        playingIndex = real;
        viewIndex = real;
        barsEl.querySelectorAll('.chord-card').forEach((c) => {
          c.classList.toggle('is-active', Number(c.dataset.i) === real);
          c.classList.toggle('is-view', Number(c.dataset.i) === real);
        });
        drawBoard(real);
        if (state.challenge.on) landingForCurrent(real, loopChords, offset);
      }
      if (info.beat === sig.beats - 1) drawNext((info.chordIndex + 1) % n + offset, true);
    });
  }

  /* ─── retos de aterrizaje ─── */
  function landingForCurrent(real, loopChords, offset) {
    const c = state.resolved[real];
    const target = nextTarget && nextTarget.chordIndex === real ? nextTarget : { ...pickLandingTarget({ rootPc: c.rootPc, typeId: c.typeId }, Math.random, state.challenge.roles), chordIndex: real };
    scorer.startChange(target.pc, ROLE_NAMES[target.role] ?? target.label, performance.now());
    updateScoreText();
    const nextReal = (loopChords.findIndex((x) => x === state.resolved[real]) + 1) % loopChords.length + offset;
    const nc = state.resolved[nextReal];
    nextTarget = { ...pickLandingTarget({ rootPc: nc.rootPc, typeId: nc.typeId }, Math.random, state.challenge.roles), chordIndex: nextReal };
    nextTarget.label = ROLE_NAMES[nextTarget.role] ?? nextTarget.label;
  }

  function updateScoreText() {
    lastScoreText = `${scorer.hits}/${scorer.total} aterrizajes · ${scorer.percent} %`;
    scoreEl.querySelector('.jam-score')?.replaceChildren(lastScoreText);
  }

  function onHeardPc(pc, label) {
    heardEl.textContent = `Oigo: ${prettyNote(pcName(pc, 'sharp'))}${label ?? ''}`;
    if (scorer.hear(pc, performance.now())) {
      heardEl.textContent += ' ✓ ¡aterrizaje!';
      updateScoreText();
    }
  }

  async function startListening() {
    stopListening();
    if (state.challenge.source === 'midi') {
      if (!navigator.requestMIDIAccess) { ctx.toast('Tu navegador no soporta MIDI; usa el micrófono'); return; }
      try {
        const access = await navigator.requestMIDIAccess();
        const handlers = [];
        const listener = (e) => {
          const [status0, note, vel] = e.data;
          if ((status0 & 0xf0) === 0x90 && vel > 0) onHeardPc(mod(note, 12), '');
        };
        access.inputs.forEach((input) => { input.addEventListener('midimessage', listener); handlers.push(input); });
        midiStop = () => handlers.forEach((i) => i.removeEventListener('midimessage', listener));
        if (!handlers.length) ctx.toast('No he encontrado ningún dispositivo MIDI');
      } catch { ctx.toast('No se pudo abrir el acceso MIDI'); }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const source = engine.ctx.createMediaStreamSource(stream);
      const analyser = engine.ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      const buf = new Float32Array(4096);
      let raf = 0;
      let last = -1;
      let stable = 0;
      const loop = () => {
        analyser.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 70, maxFreq: 1200 });
        if (freq) {
          const pc = mod(Math.round(freqToMidi(freq)), 12);
          stable = pc === last ? stable + 1 : 1;
          last = pc;
          if (stable >= 2) onHeardPc(pc, '');
        } else { stable = 0; last = -1; }
        raf = requestAnimationFrame(loop);
      };
      loop();
      micStop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); source.disconnect(); };
    } catch {
      ctx.toast('No he podido acceder al micrófono: revisa los permisos');
    }
  }

  function stopListening() {
    micStop?.();
    midiStop?.();
    micStop = null;
    midiStop = null;
  }

  function finishScore() {
    if (!state.challenge.on || scorer.total < 3) return;
    const list = ctx.storage.get('jam-scores', []);
    list.unshift({ date: new Date().toISOString().slice(0, 10), key: `${prettyNote(state.root)} ${state.mode === 'minor' ? 'menor' : 'mayor'}`, preset: jamPreset(state.preset).label, hits: scorer.hits, total: scorer.total, bpm: state.bpm });
    ctx.storage.set('jam-scores', list.slice(0, 30));
    drawScores();
    ctx.toast(`Reto terminado: ${scorer.hits}/${scorer.total} (${scorer.percent} %)`);
  }

  function drawScores() {
    const list = ctx.storage.get('jam-scores', []);
    clear(scoreEl);
    scoreEl.append(
      h('p', { class: 'jam-score', style: 'font-weight:800' }, lastScoreText || 'Activa el reto para puntuar tus aterrizajes.'),
      heardEl,
      ...list.slice(0, 5).map((s) => h('div', { class: 'row row--between hint' }, h('span', {}, `${s.date} · ${s.key} · ${s.preset}`), h('strong', {}, `${s.hits}/${s.total} (${Math.round((s.hits / s.total) * 100)} %)`))),
    );
  }

  /* ─── controles ─── */
  let tempoSlider;
  const controls = h('div', { class: 'stack' });
  function loadPreset(id) {
    const preset = jamPreset(id);
    state.preset = preset.id;
    state.mode = preset.mode;
    state.style = preset.style;
    state.chords = preset.chords.map((c) => ({ ...c }));
    state.picks = [];
    const grooves = groovesFor(state.signature);
    state.groove = grooves[preset.groove] ? preset.groove : Object.keys(grooves)[0];
    viewIndex = 0;
    rebuild();
  }

  function drawControls() {
    clear(controls);
    const grooves = groovesFor(state.signature);
    if (!grooves[state.groove]) state.groove = Object.keys(grooves)[0];
    tempoSlider = slider({ min: 40, max: 220, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { state.bpm = v; ctx.session.set({ bpm: v }); } });
    controls.append(
      h('section', { class: 'panel stack' }, h('h2', {}, 'Base'),
        h('div', { class: 'field' }, h('label', {}, 'Progresión'), select(JAM_PRESETS.map((x) => ({ value: x.id, label: x.label })), state.preset, (v) => { player.stop(); loadPreset(v); })),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(rootChoices(), state.root, (v) => { state.root = v; refresh(); drawBars(); drawBoard(viewIndex); })),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Modo'), segmented(KEY_MODES, state.mode, (v) => { state.mode = v; refresh(); drawBars(); drawBoard(viewIndex); })),
        ),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, 'Compás'), select(['4/4', '3/4', '6/8', '12/8'], state.signature, (v) => { player.stop(); state.signature = v; drawControls(); drawBeats(); refresh(); })),
          h('div', { class: 'field' }, h('label', {}, 'Estilo'), select(Object.entries(grooves).map(([value, g]) => ({ value, label: g.label })), state.groove, (v) => { state.groove = v; refresh(); })),
        ),
        tempoSlider,
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Qué ver en el mástil'),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Enfoque'), select(FOCUS_MODES.map((f) => ({ value: f.id, label: f.label })), state.focus, (v) => { state.focus = v; refresh(); drawBoard(viewIndex); })),
        toggle('Seguir la posición del acorde (ventana de 6 trastes)', state.follow, (v) => { state.follow = v; refresh(); drawBoard(viewIndex); }),
        h('p', { class: 'hint' }, 'Colores: rojo fundamental · verde 3.ª · naranja 5.ª · azul 7.ª. Los círculos huecos son el resto de la escala sugerida.'),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Práctica'),
        toggle('Subir el tempo en cada vuelta', state.ramp.on, (v) => { state.ramp.on = v; }),
        slider({ min: 1, max: 12, value: state.ramp.step, label: 'Cada vuelta', format: (v) => `+${v} bpm`, onInput: (v) => { state.ramp.step = v; } }),
        slider({ min: 60, max: 240, value: state.ramp.max, label: 'Hasta', format: (v) => `${v} bpm`, onInput: (v) => { state.ramp.max = v; } }),
        toggle('Compases sin acompañamiento (solo clic)', state.mute.on, (v) => { state.mute.on = v; refresh(); }),
        slider({ min: 1, max: 6, value: state.mute.play, label: 'Suenan', format: (v) => `${v} comp.`, onInput: (v) => { state.mute.play = v; refresh(); } }),
        slider({ min: 1, max: 4, value: state.mute.silent, label: 'En silencio', format: (v) => `${v} comp.`, onInput: (v) => { state.mute.silent = v; refresh(); } }),
        toggle('Repetir solo una sección', state.loop.on, (v) => { state.loop.on = v; refresh(); }),
        slider({ min: 1, max: Math.max(1, state.chords.length), value: Math.min(state.loop.from, state.chords.length), label: 'Desde compás', format: (v) => v, onInput: (v) => { state.loop.from = v; refresh(); } }),
        slider({ min: 1, max: Math.max(1, state.chords.length), value: Math.min(state.loop.to, state.chords.length), label: 'Hasta compás', format: (v) => v, onInput: (v) => { state.loop.to = v; refresh(); } }),
        toggle('Cuenta previa de un compás', state.countIn, (v) => { state.countIn = v; }),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Reto de aterrizaje'),
        toggle('Activar reto (aterriza en una nota del acorde en cada cambio)', state.challenge.on, (v) => { state.challenge.on = v; }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Cómo te oigo'), segmented([{ value: 'mic', label: 'Micrófono' }, { value: 'midi', label: 'MIDI' }], state.challenge.source, (v) => { state.challenge.source = v; })),
        h('p', { class: 'hint' }, 'Te avisa un compás antes de qué nota buscar (fundamental, 3.ª o 5.ª del acorde que viene). El audio se analiza solo en tu navegador.'),
        scoreEl,
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Mezcla'),
        ...[['drums', 'Batería'], ['bass', 'Bajo'], ['guitar', 'Guitarra'], ['synth', 'Sintetizador']].map(([bus, label]) => h('div', { class: 'stack' },
          h('span', { class: 'slider-label' }, `Volumen · ${label}`),
          slider({ min: 0, max: 100, value: Math.round(state.vol[bus] * 100), format: (v) => `${v}%`, onInput: (v) => { state.vol[bus] = v / 100; engine.setBusVolume(bus, v / 100); } }),
        )),
        h('div', { class: 'field' }, h('label', {}, 'Estilo de batería'), select(drumStyleOptions(grooves), state.drumStyle, (v) => { state.drumStyle = v; })),
        toggle('Relleno de batería al final de cada vuelta', state.drumFill, (v) => { state.drumFill = v; }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Tono de guitarra'), segmented(PLUCK_TONES, state.guitarTone, (v) => { state.guitarTone = v; })),
      ),
    );
    drawScores();
  }

  function rebuild() {
    player.stop();
    refresh();
    drawControls();
    drawBeats();
    drawBars();
    drawBoard(Math.min(viewIndex, state.resolved.length - 1));
  }

  root.append(
    header('Tocar y escribir', 'Jam Studio', 'Elige una progresión, pulsa tocar y mira cómo el mástil sigue los acordes: qué escala usar en cada uno, dónde están sus notas clave y qué viene después.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' },
          h('div', { class: 'row', style: 'justify-content:center' }, play.el),
          beatDots,
          status,
          instrumentBar(state),
          h('div', { class: 'grid-2', style: 'align-items:stretch' }, nowEl, nextEl),
          boardEl,
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Acordes y escalas'), h('p', { class: 'hint' }, 'Pulsa un compás para verlo en el mástil y cambia la escala sugerida si quieres otro color.'), barsEl),
        h('section', { class: 'panel row' },
          button('Ver esta tonalidad en el Navigator', { variant: 'outline', onClick: () => { const s = currentSuggestion(viewIndex); ctx.go('navigator', { root: s.root, fam: 'scale', q: s.quality }); } }),
          button('Exportar base a MIDI', { variant: 'outline', onClick: () => {
            refresh();
            const mid = backingToMidi({ resolved: state.resolved, bpm: state.bpm, signature: state.signature, groove: state.groove, swing: state.swing, drums: state.drumsOn, bass: state.bassOn, guitar: state.guitarOn, pad: state.synthOn, repeats: 4, title: 'Jam Mástil Lab' });
            saveBlob(new Blob([mid], { type: 'audio/midi' }), `jam-${state.preset}-${state.root}.mid`, 'MIDI');
          } }),
          button('Tríadas de este acorde', { variant: 'outline', onClick: () => { const c = state.resolved[viewIndex]; ctx.go('triads', { root: c.rootName, q: c.typeId }); } }),
        ),
      ),
      controls,
    ),
  );
  rebuild();
}

export default {
  id: 'jam',
  title: 'Jam Studio',
  group: 'play',
  icon: '✦',
  summary: 'Base en vivo con mástil que sigue los acordes, escalas sugeridas, retos de aterrizaje y tempo progresivo.',
  isNew: true,
  mount,
};

