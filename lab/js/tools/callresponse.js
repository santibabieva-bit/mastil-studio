/**
 * Pregunta y respuesta: sobre una base, la app toca una frase animada de dos
 * compases (la «pregunta») y tú respondes otros dos que cierren en una nota
 * del acorde. Es la conversación del blues y del jazz convertida en ejercicio.
 */

import {
  ROOT_CHOICES, TUNINGS, mod, parseRoot, pcName, prettyNote,
} from '../core/music.js';
import { CHORD_TYPES, chordSymbol } from '../core/chords.js';
import { chordTones, jamPreset, scalePcs } from '../core/jam.js';
import { callPhrase, judgeResponse, placeSequence } from '../core/motion.js';
import { placeMidi } from '../core/exlib.js';
import { startNoteListener } from '../audio/notelisten.js';
import { COLORS, createAnimBoard, createPlayer, noteName } from '../ui/animboard.js';
import {
  button, clear, h, segmented, select, slider,
} from '../ui/dom.js';
import { header } from './common.js';

const VAMPS = [
  { id: 'dorian', scale: 'dorian' },
  { id: 'minorblues', scale: 'pentatonicMinor' },
  { id: 'blues12', scale: 'blues' },
  { id: 'funk2', scale: 'dorian' },
  { id: 'pop4', scale: 'pentatonicMajor' },
  { id: 'mixo', scale: 'mixolydian' },
];
const ROLE_COLOR = { root: COLORS.root, third: COLORS.third, fifth: COLORS.fifth, seventh: COLORS.seventh };

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    vamp: ctx.storage.get('duel-vamp', 'dorian'),
    root: ctx.storage.get('duel-root', 'A'),
    bpm: ctx.storage.get('duel-bpm', 80),
    input: ctx.storage.get('duel-input', 'mic'),
  };
  const board = createAnimBoard({ tuning, from: 0, to: 15, title: 'Pregunta y respuesta' });
  board.el.classList.add('is-clickable');
  const player = createPlayer(board, engine);
  const chordEl = h('div', { class: 'anim-chord' }, '');
  const phase = h('div', { class: 'anim-caption' }, 'Pulsa «Empezar»: la guitarra pregunta dos compases y tú respondes otros dos.');
  const result = h('div', { class: 'stack' });
  const histEl = h('p', { class: 'hint' }, '');
  const st = { running: false, round: 0, call: [], played: [], armed: false, timers: [], chord: null, scale: [] };
  let stopListen = null;

  const later = (t, fn) => engine.at(t, () => { if (st.running) fn(); });
  ctx.onCleanup(() => { stop(); stopListen?.(); });

  function vamp() { return VAMPS.find((v) => v.id === cfg.vamp) ?? VAMPS[0]; }

  function chordFor(round) {
    const preset = jamPreset(cfg.vamp);
    const rootPc = parseRoot(cfg.root)?.pc ?? 9;
    const c = preset.chords[(round * 2) % preset.chords.length];
    return { rootPc: mod(rootPc + c.s, 12), typeId: c.t };
  }

  function drawTargets() {
    // Durante la respuesta: notas del acorde de fondo como meta y la escala muy tenue.
    const tones = new Map(chordTones(st.chord.rootPc, st.chord.typeId).map((t) => [t.pc, t]));
    const items = [];
    for (let s = 0; s < 6; s += 1) {
      for (let f = 0; f <= 15; f += 1) {
        const pc = mod(tuning[s] + f, 12);
        const t = tones.get(pc);
        if (t) items.push({ key: `${s}-${f}`, s, f, label: t.label, fill: ROLE_COLOR[t.role] ?? COLORS.note, alpha: 0.35, scale: 0.75 });
        else if (st.scale.includes(pc)) items.push({ key: `${s}-${f}`, s, f, label: '', fill: COLORS.ghost, alpha: 0.4, scale: 0.4 });
      }
    }
    board.dots(items);
  }

  function addPlayed(midi, spot = null) {
    if (!st.armed) return;
    st.played.push(midi);
    const prev = st.lastSpot ?? { s: 2 };
    const p = spot ?? placeMidi(tuning, midi, prev.s, 15);
    if (!p) return;
    st.lastSpot = p;
    const isChord = chordTones(st.chord.rootPc, st.chord.typeId).some((t) => t.pc === mod(midi, 12));
    board.pulse(p.s, p.f, isChord ? COLORS.ok : COLORS.accent);
    board.dots([...currentPlayedDots(), { key: `r-${st.played.length}`, s: p.s, f: p.f, label: noteName(midi), fill: isChord ? COLORS.ok : COLORS.accent }], 'trail');
    st.playedDots.push({ key: `r-${st.played.length}`, s: p.s, f: p.f, label: noteName(midi), fill: isChord ? COLORS.ok : COLORS.accent });
  }
  const currentPlayedDots = () => st.playedDots ?? [];

  async function ensureInput() {
    if (cfg.input === 'click' || stopListen) return true;
    try {
      stopListen = await startNoteListener(engine, { source: cfg.input, onNote: (m) => addPlayed(m), isArmed: () => st.armed });
      return true;
    } catch (e) {
      phase.textContent = cfg.input === 'mic' ? 'No he podido usar el micrófono: elige «Clic».' : e.message;
      return false;
    }
  }

  async function round() {
    if (!st.running) return;
    st.chord = chordFor(st.round);
    st.scale = scalePcs(st.chord.rootPc, vamp().scale);
    const tones = chordTones(st.chord.rootPc, st.chord.typeId).map((t) => t.pc);
    const raw = callPhrase({ pcs: st.scale, chordPcs: tones, length: st.round % 2 ? 5 : 6 });
    const placed = placeSequence(raw.map((n) => n.midi), { tuning, strategy: 'position', maxFret: 15 });
    st.call = raw.map((n, i) => ({ notes: [{ ...placed[i] }], d: n.d, midi: n.midi }));
    st.played = [];
    st.playedDots = [];
    st.lastSpot = placed[placed.length - 1];
    clear(result);
    board.clear('trail');
    const spb = 60 / cfg.bpm;
    const t0 = engine.time + 0.25;
    const sym = chordSymbol(prettyNote(pcName(st.chord.rootPc, 'sharp')), st.chord.typeId);
    chordEl.textContent = sym;
    // Base: 4 compases (2 de pregunta y 2 de respuesta) + cuenta.
    const count = 4;
    for (let b = 0; b < count; b += 1) engine.click(t0 + b * spb, { accent: b === 0, sound: 'wood', vol: 0.8 });
    const start = t0 + count * spb;
    const chordMidis = CHORD_TYPES[st.chord.typeId].intervals.map((iv) => 52 + mod(st.chord.rootPc - 4, 12) + iv);
    for (let bar = 0; bar < 4; bar += 1) {
      const tb = start + bar * 4 * spb;
      engine.pad(chordMidis, tb, 4 * spb, 0.4);
      engine.bass(36 + mod(st.chord.rootPc, 12), tb, spb * 1.5, 0.7);
      engine.bass(36 + mod(st.chord.rootPc + 7, 12), tb + 2 * spb, spb * 1.5, 0.6);
      for (let b = 0; b < 4; b += 1) engine.click(tb + b * spb, { accent: b === 0, sound: 'click', vol: 0.3 });
    }
    later(t0, () => { phase.textContent = '🎸 Escucha la pregunta…'; board.dots([]); });
    player.load(st.call, { next: true, trail: 8, hand: true, arrows: true, labels: 'name' });
    let t = start;
    st.call.forEach((stp, i) => {
      const n = stp.notes[0];
      engine.pluck(n.midi, t, { dur: stp.d * spb * 1.2, vel: 0.85 });
      later(t, () => player.render(i));
      t += stp.d * spb;
    });
    const answerAt = start + 8 * spb;
    later(answerAt - 0.05, () => {
      st.armed = true;
      board.clearArrows();
      board.hand(null);
      drawTargets();
      phase.textContent = '🎤 ¡Tu respuesta! Dos compases. Acaba en una nota del acorde (las de color).';
    });
    const endAt = answerAt + 8 * spb + 0.3;
    later(endAt, () => { st.armed = false; judge(); });
  }

  function judge() {
    const r = judgeResponse(st.played, { chordPcs: chordTones(st.chord.rootPc, st.chord.typeId).map((t) => t.pc), call: st.call.map((c) => ({ midi: c.midi })) });
    const hist = ctx.storage.get('duel-history', []);
    hist.push({ date: new Date().toISOString().slice(0, 10), score: r.score, notes: r.notes.length });
    ctx.storage.set('duel-history', hist.slice(-60));
    ctx.logSeconds(Math.round((16 + 4) * 60 / cfg.bpm));
    clear(result);
    result.append(
      h('p', { class: `feedback ${r.ok ? 'ok' : 'bad'}` }, `${r.ok ? '✓ ¡Buena respuesta!' : 'Casi.'} ${r.score}/100 · ${r.notes.length} nota${r.notes.length === 1 ? "" : "s"}${r.notes.length ? ` (${r.notes.map((m) => noteName(m)).join(' ')})` : ''}${r.endsOnChord ? ' · cierra en el acorde' : ''}.`),
      r.why.length ? h('ul', { class: 'hint', style: 'margin:0' }, ...r.why.map((w) => h('li', {}, w))) : null,
    );
    drawHist();
    st.round += 1;
    if (st.running) {
      phase.textContent = 'Siguiente pregunta…';
      setTimeout(() => round(), 1800);
    }
  }

  function drawHist() {
    const hist = ctx.storage.get('duel-history', []).slice(-10);
    if (!hist.length) { histEl.textContent = ''; return; }
    const avg = Math.round(hist.reduce((a, x) => a + x.score, 0) / hist.length);
    histEl.textContent = `Media de tus últimas ${hist.length} respuestas: ${avg}/100.`;
  }

  async function startDuel() {
    if (st.running) { stop(); return; }
    await engine.ensure();
    if (!(await ensureInput())) return;
    st.running = true;
    st.round = 0;
    startBtn.textContent = '■ Parar';
    engine.notePlaying('duel', true);
    round();
  }

  function stop() {
    st.running = false;
    st.armed = false;
    engine.clearQueue();
    engine.notePlaying('duel', false);
    startBtn.textContent = '▶ Empezar';
    phase.textContent = 'Parado.';
  }

  board.onClick((hit) => {
    if (cfg.input !== 'click' || !st.armed) return;
    const midi = tuning[hit.s] + hit.f;
    engine.pluck(midi, engine.time + 0.01, { dur: 0.9 });
    addPlayed(midi, hit);
  });

  const startBtn = button('▶ Empezar', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: startDuel });
  drawHist();

  root.append(
    header('Tocar y escribir', 'Pregunta y respuesta', 'La guitarra «pregunta» con una frase de dos compases que queda abierta; tú «respondes» con otros dos que la cierren en una nota del acorde. Así se aprende a improvisar como se habla: escuchando y contestando.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' }, chordEl, board.el, phase, result, h('div', { class: 'row', style: 'justify-content:center' }, startBtn), histEl),
      h('section', { class: 'panel stack' },
        h('div', { class: 'field' }, h('label', {}, 'Base'), select(VAMPS.map((v) => ({ value: v.id, label: jamPreset(v.id).label })), cfg.vamp, (v) => { cfg.vamp = v; ctx.storage.set('duel-vamp', v); })),
        h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; ctx.storage.set('duel-root', v); })),
        slider({ min: 50, max: 140, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; ctx.storage.set('duel-bpm', v); } }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Respondes con'), segmented([{ value: 'mic', label: 'Micrófono' }, { value: 'midi', label: 'MIDI' }, { value: 'click', label: 'Clic' }], cfg.input, (v) => { cfg.input = v; ctx.storage.set('duel-input', v); stopListen?.(); stopListen = null; })),
        h('p', { class: 'hint' }, 'Ideas para responder: repite el ritmo de la pregunta con otras notas, contesta en la octava de arriba o resuelve la última nota medio tono hacia la 3.ª del acorde.'),
      ),
    ),
  );
}

export default {
  id: 'callresponse',
  title: 'Pregunta y respuesta',
  group: 'play',
  icon: '💬',
  summary: 'La guitarra pregunta con una frase animada y tú respondes dos compases que cierren en el acorde.',
  isNew: true,
  mount,
};
