/** Backing Track Creator: batería, bajo, guitarra y sintetizador sobre una progresión editable. */

import { COMMON_KEYS, prettyNote } from '../core/music.js';
import { PROGRESSION_PRESETS, chordChoices, resolveProgression } from '../core/progressions.js';
import { TIME_SIGNATURES, groovesFor } from '../core/rhythm.js';
import { coerce } from '../core/state.js';
import { BackingPlayer } from '../audio/backing.js';
import { PLUCK_TONES } from '../audio/pluck.js';
import { backingToMidi } from '../core/midi.js';
import { saveBlob } from '../ui/export.js';
import { button, clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { drumStyleOptions, header, instrumentBar, playToggle, rootChoices } from './common.js';

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const sess = ctx.session.get();
  const state = {
    root: p.root ?? sess.root,
    mode: p.mode ?? 'minor',
    signature: p.sig ?? '4/4',
    groove: p.groove ?? 'rock',
    bpm: coerce(p.bpm, sess.bpm ?? 90),
    swing: null,
    guitarTone: 'soft', drumStyle: 'auto', drumFill: false,
    drumsOn: true, bassOn: true, guitarOn: true, synthOn: false, clickOn: false, countIn: true,
    chords: null,
    resolved: [],
    vol: { drums: 0.8, bass: 0.8, guitar: 0.8, synth: 0.8 },
  };
  const presetFor = (mode, id) => PROGRESSION_PRESETS[mode].find((x) => x.id === id) ?? PROGRESSION_PRESETS[mode][0];
  state.chords = presetFor(state.mode, p.prog).chords.map((c) => ({ ...c }));
  if (p.chords) {
    try {
      const parsed = JSON.parse(decodeURIComponent(p.chords));
      if (Array.isArray(parsed) && parsed.length) state.chords = parsed;
    } catch { /* ignorar enlace dañado */ }
  }

  const player = new BackingPlayer(engine, 'backing');
  const barsEl = h('div', { class: 'row' });
  const beatDots = h('div', { class: 'beat-lights', style: 'margin:0' });
  const status = h('p', { class: 'hint', style: 'text-align:center;min-height:1.3em' });
  const savedEl = h('div', { class: 'stack' });
  player.transport.onStop = () => {
    play.set(false);
    barsEl.querySelectorAll('.chord-card').forEach((c) => c.classList.remove('is-active'));
    status.textContent = '';
  };
  ctx.onCleanup(() => player.stop());
  const play = playToggle({ startLabel: '▶ Reproducir', onStart: () => start(), onStop: () => player.stop(), size: 'btn-lg' });

  function refresh() {
    state.resolved = resolveProgression(state.root, state.chords);
    for (const [bus, v] of Object.entries(state.vol)) engine.setBusVolume?.(bus, v);
    ctx.setParams({ root: state.root, mode: state.mode, sig: state.signature, groove: state.groove, bpm: state.bpm, chords: encodeURIComponent(JSON.stringify(state.chords)) });
    ctx.session.set({ root: state.root, bpm: state.bpm });
  }

  function drawBars() {
    clear(barsEl);
    const choices = chordChoices(state.root, state.mode);
    state.chords.forEach((chord, i) => {
      const key = `${chord.s}:${chord.t}`;
      const known = choices.some((c) => `${c.s}:${c.t}` === key);
      const options = known ? choices : [{ ...chord, label: `${state.resolved[i]?.symbol ?? '?'}` }, ...choices];
      const sel = select(
        options.map((c) => ({ value: `${c.s}:${c.t}`, label: c.label })),
        key,
        (v) => {
          const [s, t] = v.split(':');
          state.chords[i] = { s: Number(s), t };
          refresh();
          drawBars();
        },
        { 'aria-label': `Compás ${i + 1}` },
      );
      const symbol = state.resolved[i]?.symbol ?? '';
      barsEl.append(h('div', { class: 'chord-card', style: 'cursor:default;min-width:150px;flex:1 1 150px;max-width:190px', dataset: { i } },
        h('div', { class: 'roman' }, `Compás ${i + 1}`),
        h('div', { class: 'big-number', style: 'font-size:1.9rem;margin:4px 0' }, prettyNote(symbol)),
        sel,
        h('button', { type: 'button', class: 'text-button', onclick: () => { if (state.chords.length > 1) { state.chords.splice(i, 1); refresh(); drawBars(); } } }, 'Quitar'),
      ));
    });
    if (state.chords.length < 16) {
      barsEl.append(button('+ Compás', { variant: 'outline', onClick: () => { state.chords.push({ ...state.chords[state.chords.length - 1] }); refresh(); drawBars(); } }));
    }
  }

  function drawBeats() {
    clear(beatDots);
    const sig = TIME_SIGNATURES[state.signature];
    for (let i = 0; i < sig.beats; i += 1) beatDots.append(h('div', { class: 'beat-light', dataset: { level: i === 0 ? 2 : 1 } }, String(i + 1)));
  }

  async function start() {
    refresh();
    await engine.ensure();
    for (const [bus, v] of Object.entries(state.vol)) engine.setBusVolume(bus, v);
    await player.start(state, (info) => {
      beatDots.querySelectorAll('.beat-light').forEach((l, i) => l.classList.toggle('is-on', i === info.beat));
      if (info.countIn) {
        status.textContent = 'Cuenta previa…';
        return;
      }
      status.textContent = `Compás ${info.bar + 1} · ${prettyNote(info.chord.symbol)}`;
      barsEl.querySelectorAll('.chord-card').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.i) === info.chordIndex));
    });
  }

  function loadPreset(id) {
    state.chords = presetFor(state.mode, id).chords.map((c) => ({ ...c }));
    refresh();
    drawBars();
  }

  /* ─── guardado local ─── */
  function drawSaved() {
    clear(savedEl);
    const list = ctx.storage.get('backing-saved', []);
    const nameInput = h('input', { type: 'text', placeholder: 'Nombre de la base', 'aria-label': 'Nombre de la base' });
    savedEl.append(
      h('div', { class: 'row' }, nameInput, button('Guardar', { variant: 'dark', onClick: () => {
        const name = nameInput.value.trim() || `Base ${list.length + 1}`;
        const entry = { name, root: state.root, mode: state.mode, signature: state.signature, groove: state.groove, bpm: state.bpm, chords: state.chords, drumsOn: state.drumsOn, bassOn: state.bassOn, guitarOn: state.guitarOn, synthOn: state.synthOn, drumStyle: state.drumStyle, drumFill: state.drumFill, guitarTone: state.guitarTone };
        ctx.storage.set('backing-saved', [...list.filter((x) => x.name !== name), entry]);
        drawSaved();
        ctx.toast('Base guardada');
      } })),
    );
    for (const entry of list) {
      savedEl.append(h('div', { class: 'row row--between' },
        h('span', {}, `${entry.name} · ${prettyNote(entry.root)} ${entry.mode === 'minor' ? 'menor' : 'mayor'} · ${entry.bpm} bpm`),
        h('div', { class: 'row' },
          button('Cargar', { variant: 'outline', onClick: () => { Object.assign(state, entry, { chords: entry.chords.map((c) => ({ ...c })) }); rebuild(); } }),
          button('Borrar', { variant: 'ghost', onClick: () => { ctx.storage.set('backing-saved', list.filter((x) => x.name !== entry.name)); drawSaved(); } }),
        ),
      ));
    }
    if (!list.length) savedEl.append(h('p', { class: 'hint' }, 'Aquí aparecerán tus bases guardadas.'));
  }

  const controls = h('div', { class: 'stack' });
  function drawControls() {
    clear(controls);
    const grooves = groovesFor(state.signature);
    if (!grooves[state.groove]) state.groove = Object.keys(grooves)[0];
    controls.append(
      h('section', { class: 'panel stack' }, h('h2', {}, 'Tonalidad y estilo'),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(rootChoices().filter((o) => COMMON_KEYS.includes(o.value) || true), state.root, (v) => { state.root = v; refresh(); drawBars(); })),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Modo'), segmented([{ value: 'major', label: 'Mayor' }, { value: 'minor', label: 'Menor' }], state.mode, (v) => { state.mode = v; state.chords = presetFor(v).chords.map((c) => ({ ...c })); rebuild(); })),
        ),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, 'Compás'), select(['4/4', '3/4', '6/8', '12/8'], state.signature, (v) => { player.stop(); state.signature = v; drawControls(); drawBeats(); refresh(); })),
          h('div', { class: 'field' }, h('label', {}, 'Groove'), select(Object.entries(grooves).map(([value, g]) => ({ value, label: g.label })), state.groove, (v) => { state.groove = v; refresh(); })),
        ),
        h('div', { class: 'field' }, h('label', {}, 'Progresión'), select(PROGRESSION_PRESETS[state.mode].map((x) => ({ value: x.id, label: x.label })), presetFor(state.mode, null).id, (v) => loadPreset(v))),
        slider({ min: 40, max: 200, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { state.bpm = v; refresh(); } }),
        slider({ min: 50, max: 72, value: 50, label: 'Swing', format: (v) => (v === 50 ? 'según groove' : `${v}%`), onInput: (v) => { state.swing = v === 50 ? null : v / 100; } }),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Mezcla'),
        ...[['drums', 'Batería'], ['bass', 'Bajo'], ['guitar', 'Guitarra'], ['synth', 'Sintetizador']].map(([bus, label]) => h('div', { class: 'stack' },
          h('span', { class: 'slider-label' }, `Volumen · ${label}`),
          slider({ min: 0, max: 100, value: Math.round(state.vol[bus] * 100), format: (v) => `${v}%`, onInput: (v) => { state.vol[bus] = v / 100; engine.setBusVolume(bus, v / 100); } }),
        )),
        h('div', { class: 'field' }, h('label', {}, 'Estilo de batería'), select(drumStyleOptions(grooves), state.drumStyle, (v) => { state.drumStyle = v; })),
        toggle('Relleno de batería al final de cada vuelta', state.drumFill, (v) => { state.drumFill = v; }),
        toggle('Click en los pulsos', state.clickOn, (v) => { state.clickOn = v; }),
        toggle('Cuenta previa de un compás', state.countIn, (v) => { state.countIn = v; }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Tono de guitarra'), segmented(PLUCK_TONES, state.guitarTone, (v) => { state.guitarTone = v; })),
      ),
    );
  }

  function rebuild() {
    player.stop();
    drawControls();
    drawBeats();
    refresh();
    drawBars();
  }

  const scaleName = () => (state.mode === 'minor' ? 'pentatonicMinor' : 'pentatonicMajor');
  const ytQuery = () => encodeURIComponent(`${prettyNote(state.root)} ${state.mode === 'minor' ? 'minor' : 'major'} backing track ${state.bpm} bpm`);

  root.append(
    header('Tocar y escribir', 'Backing Track Creator', 'Crea una base completa (batería, bajo, guitarra y sintetizador) en cualquier tonalidad y estilo, edita los acordes compás a compás y improvisa encima.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' },
          h('div', { class: 'row', style: 'justify-content:center' }, play.el),
          beatDots,
          status,
          instrumentBar(state),
          barsEl,
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Improvisa encima'),
          h('p', { class: 'hint' }, `Para esta base en ${prettyNote(state.root)} ${state.mode === 'minor' ? 'menor' : 'mayor'} prueba la pentatónica y, después, la escala completa.`),
          h('div', { class: 'row' },
            button('Ver pentatónica en el mástil', { variant: 'accent', onClick: () => ctx.go('navigator', { root: state.root, fam: 'scale', q: scaleName() }) }),
            button('Ver escala completa', { variant: 'outline', onClick: () => ctx.go('navigator', { root: state.root, fam: 'scale', q: state.mode === 'minor' ? 'naturalMinor' : 'major' }) }),
            button('Exportar base a MIDI', { variant: 'outline', onClick: () => {
              refresh();
              const mid = backingToMidi({ resolved: state.resolved, bpm: state.bpm, signature: state.signature, groove: state.groove, swing: state.swing, drums: state.drumsOn, bass: state.bassOn, guitar: state.guitarOn, pad: state.synthOn, repeats: 4, title: 'Base Mástil Lab' });
              saveBlob(new Blob([mid], { type: 'audio/midi' }), `base-${state.root}-${state.groove}-${state.bpm}bpm.mid`, 'MIDI');
            } }),
            h('a', { class: 'btn btn-outline', href: `https://www.youtube.com/results?search_query=${ytQuery()}`, target: '_blank', rel: 'noopener noreferrer' }, 'Buscar bases completas en YouTube ↗'),
          ),
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Mis bases'), savedEl),
      ),
      controls,
    ),
  );
  rebuild();
  drawSaved();
}

export default {
  id: 'backing',
  title: 'Backing Track Creator',
  group: 'play',
  icon: '▦',
  summary: 'Bases con batería, bajo, guitarra y sinte en cualquier tonalidad, groove y progresión.',
  mount,
};
