/**
 * Tríadas en movimiento: más de 30 ejercicios de tríadas (formas, tonalidad,
 * conducción de voces, armonía, melodía, ritmo, velocidad, oído e
 * improvisación) con el mástil animado, partitura de alphaTab y sonido, y un
 * plan intensivo de 4 semanas con el mapa de las 48 formas.
 */

import { ROOT_CHOICES, parseRoot, prettyNote } from '../core/music.js';
import { CAGED_COLORS } from '../core/exlib.js';
import {
  INVERSION_LABELS, PROGRESSIONS, QUALITIES, QUALITY_LABEL, ROLE_LABEL, SETS, TRIAD_EXERCISES, TRIAD_FAMILIES,
  buildTriadExercise, cagedWindows, checkDrill, chordStep, describeStep, diatonic, drillQuestion, earQuestion,
  recordDrill, scaleDegree, setName, stepsToBeats, triadExercise, voiceMoves,
} from '../core/triadex.js';
import { beatsToAlphaTex } from '../core/alphatex.js';
import {
  GROOVES, dailyKey, planDay, planDayIndex,
} from '../core/triadmore.js';
import { mod } from '../core/music.js';
import { createTriadModes, triadHeatmap } from './triadmodes.js';
import { availableModes, labelPicker, roleOf as roleOfChord } from '../ui/labels.js';
import { chordPcs } from '../core/chords.js';
import { fingerPosition } from '../core/fingers.js';
import { COLORS, createAnimBoard, createPlayer, noteName } from '../ui/animboard.js';
import { createScore, scoreToolbar } from '../ui/score.js';
import {
  button, clear, h, segmented, select, slider, toggle,
} from '../ui/dom.js';
import { header } from './common.js';

const TUNING = [64, 59, 55, 50, 45, 40];
const ROLE_COLOR = { root: COLORS.root, third: COLORS.third, fifth: COLORS.fifth, pass: '#8a8272', other: COLORS.note };
const CAGED_IDS = ['C', 'A', 'G', 'E', 'D'];

function mount(root, ctx) {
  const { engine } = ctx;
  const saved = ctx.storage.get('triadmotion', {});
  const st = {
    ex: triadExercise(ctx.params.ex ?? saved.ex ?? 'inv-h').id,
    key: saved.key ?? 'C',
    quality: saved.quality ?? null,
    set: saved.set ?? null,
    inversion: saved.inversion ?? null,
    shape: saved.shape ?? null,
    progression: saved.progression ?? null,
    degree: saved.degree ?? null,
    pedal: saved.pedal ?? null,
    groove: saved.groove ?? null,
    song: saved.song ?? null,
    beats: saved.beats ?? 2,
    bpm: saved.bpm ?? 70,
    style: saved.style ?? 'block',
    next: saved.next ?? true,
    arrows: saved.arrows ?? true,
    bass: saved.bass ?? false,
    click: saved.click ?? true,
    loop: saved.loop ?? false,
    memory: false,
  };
  const save = () => ctx.storage.set('triadmotion', { ...st, memory: undefined });
  const keyPc = () => parseRoot(st.key)?.pc ?? 0;

  const board = createAnimBoard({ tuning: TUNING, from: 0, to: 15, title: 'Tríadas en movimiento' });
  board.el.classList.add('is-clickable');
  // Partitura y tablatura de alphaTab; el sonido lo pone el reproductor animado
  // y el cursor de la partitura sigue al paso que suena.
  const scoreHost = h('div', { class: 'triad-score' });
  // Sin cursor ni barra de progreso: se iluminan las notas que hay que tocar.
  const score = createScore(scoreHost, { stave: 'scoretab', scale: 0.85, cursor: false });
  ctx.onCleanup(() => score.destroy());
  const scoreBox = h('div', { class: 'stack' }, scoreToolbar(score, { playback: false, layout: false }), scoreHost);
  let firstBeat = [];
  let clickHooked = false;
  let hlBeat = null;
  let lastBounds = null;
  score.on((s) => {
    // Tras cada maquetación (carga, zoom, tipo de pentagrama) se recoloca el resaltado.
    if (s.bounds && s.bounds !== lastBounds) {
      lastBounds = s.bounds;
      if (hlBeat != null) score.highlightBeat(hlBeat);
    }
    if (clickHooked || !s.api?.beatMouseDown) return;
    clickHooked = true;
    // Pulsar una nota de la partitura salta a ese paso.
    s.api.beatMouseDown.on((beat) => {
      const b = score.state.beats.indexOf(beat);
      if (b < 0 || !steps.length) return;
      let i = 0;
      while (i + 1 < firstBeat.length && firstBeat[i + 1] <= b) i += 1;
      player.stop();
      syncPlay();
      player.show(i, { sound: true });
    });
  });
  const bigName = h('div', { class: 'big-number anim-chord' }, '');
  const caption = h('p', { class: 'anim-caption' }, '');
  const legend = h('div', { class: 'anim-legend' });
  const stage = h('div', { class: 'stack' });
  const sideInfo = h('div', { class: 'stack' });
  const paramBox = h('div', { class: 'stack' });
  const listBox = h('div', { class: 'ex-list', role: 'listbox' });
  let steps = [];
  let playBtn = null;

  const player = createPlayer(board, engine, {
    onStep: (i, s) => onStep(i, s),
    onEnd: () => { syncPlay(); if (st.memory) reveal(); },
  });
  ctx.onCleanup(() => player.stop());
  const modes = createTriadModes({
    ctx, engine, board, stage, bigName, caption, st, keyPc, TUNING,
    showSteps: (raw, title, o) => useSteps(raw, title, o),
    currentChord: () => (player.playing && steps[player.index]?.kind === 'improv' ? steps[player.index].chord : null),
    redraw: () => { const s = steps[player.index]; if (s?.kind === 'improv') drawImprovMap(s.chord); },
  });
  ctx.onCleanup(() => modes.stop());

  /* ───── dibujo por paso ───── */

  function lastChordBefore(i) {
    for (let k = i - 1; k >= 0; k -= 1) if (steps[k].kind === 'chord') return steps[k];
    return null;
  }

  function onStep(i, s) {
    hlBeat = firstBeat[i] ?? null;
    if (hlBeat != null) score.highlightBeat(hlBeat);
    if (s.chord) bigName.textContent = prettyNote(s.chord.name);
    const sounding = s.notes.filter((n) => !n.held);
    caption.textContent = s.kind === 'chord' ? describeStep(s)
      : s.kind === 'pass' ? `Nota de paso: ${noteName(sounding[sounding.length - 1].midi)} (de la escala)`
        : s.kind === 'rest' || s.kind === 'orn' ? describeStep(s)
          : `${s.chord?.name ?? ''} · ${sounding[0] ? noteName(sounding[0].midi) : ''}`;
    if (s.shape) board.zones([{ from: s.shape.from, to: s.shape.to, color: s.shape.color ?? CAGED_COLORS[s.shape.id], label: s.shape.label ?? `Forma ${s.shape.id}`, alpha: 0.13 }]);
    else board.zones([]);
    board.clearArrows();
    board.dots([], 'trail');
    if (s.kind === 'improv') { caption.textContent = describeStep(s); drawImprovMap(s.chord); return; }
    if (st.arrows && s.kind === 'chord' && !st.memory) {
      const prev = lastChordBefore(i);
      const { moves, common } = voiceMoves(prev, s);
      // Fantasma de dónde estaba cada voz que se mueve: la flecha sale de ahí.
      board.dots(moves.map((m) => ({
        key: `g-${m.from.voice}`, s: m.from.s, f: m.from.f, label: '', fill: '#fffdf8', stroke: ROLE_COLOR[m.from.role] ?? COLORS.accent, dashed: true, alpha: 0.7, scale: 0.8, instant: true,
      })), 'trail');
      for (const m of moves) {
        if (Math.abs(m.semis) > 0) board.arrow(m.from, m.to, { color: ROLE_COLOR[m.to.role] ?? COLORS.accent, bend: 0.3, width: 2.2, label: `${m.semis > 0 ? '+' : ''}${m.semis}` });
      }
      for (const c of common) board.pulse(c.s, c.f, COLORS.seventh);
    }
  }

  const labelPick = labelPicker({ ctx, available: () => availableModes({ chord: true, finger: true }), onChange: () => player.setOptions({ labels: labelOf }) });
  function labelOf(n, i) {
    const mode = labelPick.mode();
    if (mode === 'finger') return n.finger == null ? '' : String(n.finger);
    if (mode === 'none') return '';
    if (mode === 'role') {
      const ch = steps[i]?.chord;
      if (n.role === 'pass' || !ch) return '';
      return roleOfChord(n.midi, { rootPc: ch.rootPc, pcs: ch.pcs ?? (ch.typeId ? chordPcs(ch.rootPc, ch.typeId) : []) });
    }
    // Grado en la escala mayor de la tonalidad elegida (no en la tríada).
    if (mode === 'degree') return scaleDegree(n.midi, keyPc(), steps[i]?.chord);
    if (mode === 'name') return noteName(n.midi);
    return '';
  }

  /**
   * Dedos: cada acorde con su agarre (todas las notas a la vez) y las notas
   * sueltas con el dedo que les toca junto al último acorde.
   */
  function withGripFingers(list) {
    let last = null; // último agarre completo
    let now = new Map(); // lo que pisa ahora cada cuerda: s → { f, finger }
    const grip = (notes) => {
      const m = fingerPosition(notes, { grip: true });
      return notes.map((n) => ({ ...n, finger: m.get(`${n.s}-${n.f}`) }));
    };
    const remember = (notes, reset) => {
      if (reset) now = new Map();
      for (const n of notes) if (n.f > 0 && n.finger != null) now.set(n.s, { s: n.s, f: n.f, finger: n.finger });
    };
    return list.map((s) => {
      if (!s.notes.length) return s;
      const held = s.notes.filter((n) => n.held);
      if (!held.length) {
        if (s.notes.length > 1) {
          // Acorde, silencio con su acorde o adorno completo: su propio agarre.
          const out = { ...s, notes: grip(s.notes) };
          if (s.kind !== 'rest') last = out;
          remember(out.notes, true);
          return out;
        }
        // Nota suelta (arpegio, bajo): el dedo que le toca junto a lo que se pisa.
        const n = s.notes[0];
        const same = now.get(n.s)?.f === n.f ? now.get(n.s) : null;
        const finger = same?.finger ?? moveFinger(n, { notes: [...now.values()] }) ?? grip([n])[0].finger;
        const out = { ...s, notes: [{ ...n, finger }] };
        remember(out.notes, false);
        return out;
      }
      // Notas mantenidas: conservan el dedo con que se pisan; la que se mueve usa un dedo libre.
      const keep = (n) => (now.get(n.s)?.f === n.f ? now.get(n.s).finger : last?.notes.find((x) => x.s === n.s && x.f === n.f)?.finger);
      const heldOut = held.map((n) => ({ ...n, finger: keep(n) }));
      if (heldOut.some((n) => n.finger == null)) {
        const all = grip(s.notes);
        remember(all, true);
        return { ...s, notes: all };
      }
      const moving = s.notes.filter((n) => !n.held).map((n) => ({ ...n, finger: moveFinger(n, { notes: heldOut }) }));
      if (moving.some((n) => n.finger == null)) {
        // No hay dedo libre sin soltar el acorde: se vuelve a digitar todo junto
        // (p. ej. las dos voces de abajo en cejilla y la de arriba camina).
        const all = grip(s.notes);
        remember(all, true);
        return { ...s, notes: all };
      }
      const byKey = new Map([...heldOut, ...moving].map((n) => [`${n.s}-${n.f}-${n.held ? 'h' : 'm'}`, n]));
      const notes = s.notes.map((n) => byKey.get(`${n.s}-${n.f}-${n.held ? 'h' : 'm'}`) ?? n);
      remember(notes, false);
      return { ...s, notes };
    });
  }

  /**
   * Dedo para una nota que se mueve mientras otras siguen pisadas: un dedo por
   * traste respecto a las pisadas, sin usar un dedo ocupado ni cruzarlos; si no
   * hay hueco, el mismo dedo que tenía esa voz (deslizando).
   */
  function moveFinger(n, ref) {
    if (n.f === 0) return 0;
    const pressed = (ref?.notes ?? []).filter((x) => x.f > 0 && !(x.s === n.s));
    const used = new Map(pressed.map((x) => [x.finger, x.f]));
    const prevSame = ref?.notes.find((x) => x.s === n.s && x.f > 0);
    const anchor = pressed.length ? pressed.reduce((a, b) => (a.f <= b.f ? a : b)) : null;
    const ideal = anchor ? anchor.finger + (n.f - anchor.f) : (prevSame ? prevSame.finger + (n.f - prevSame.f) : 1);
    const ok = (fg) => fg >= 1 && fg <= 4 && (!used.has(fg) || used.get(fg) === n.f)
      && pressed.every((x) => (x.f < n.f ? x.finger < fg : x.f > n.f ? x.finger > fg : true));
    for (const fg of [ideal, ideal + 1, ideal - 1, ideal + 2, ideal - 2]) if (ok(fg)) return fg;
    return null;
  }

  function decorate(list) {
    return withGripFingers(list).map((s) => {
      const out = { ...s };
      if (s.kind === 'chord') {
        if (st.style === 'strum') { out.strum = s.notes.map((n) => n.midi); out.silent = true; }
        if (st.style === 'arp') out.arp = true;
        if (st.bass && out.bass == null) out.bass = 36 + ((s.chord.rootPc - 0 + 12) % 12);
      }
      return out;
    });
  }

  function load() {
    const ex = triadExercise(st.ex);
    player.stop();
    // Lo que el reproductor dejó programado no debe pintar sobre el ejercicio nuevo.
    engine.clearQueue?.();
    modes.stop();
    drill = null;
    board.clear();
    board.zones([]);
    clear(stage);
    if (ex.interactive) {
      steps = [];
      scoreBox.hidden = true;
      transport.hidden = true;
      if (ex.interactive === 'drill') startDrill();
      else if (ex.interactive === 'ear') startEar();
      else modes.start(ex.interactive);
      return;
    }
    transport.hidden = false;
    const { steps: raw } = buildTriadExercise(st.ex, {
      keyPc: keyPc(), rootPc: keyPc(), quality: st.quality, set: st.set, inversion: st.inversion, shape: st.shape,
      progression: st.progression, degree: st.degree, beats: st.beats, pedal: st.pedal, groove: st.groove, song: st.song,
    });
    if (st.ex === 'improv') {
      // Sin partitura: suena la base y el mástil enseña las notas de cada acorde.
      steps = raw;
      scoreBox.hidden = true;
      modes.start('improv');
      player.load(steps, { labels: labelOf, click: st.click });
      player.show(0);
      return;
    }
    useSteps(raw, ex.title);
  }

  /** Carga unos pasos en el mástil, la partitura y el reproductor. */
  function useSteps(raw, title, { autoplay = false } = {}) {
    scoreBox.hidden = false;
    steps = decorate(raw);
    if (!steps.length) {
      caption.textContent = 'No hay formas cómodas con estos ajustes: prueba otro grupo de cuerdas o posición.';
      scoreBox.hidden = true;
      return;
    }
    const ex = { title };
    const conv = stepsToBeats(steps);
    firstBeat = conv.firstBeat;
    score.load(beatsToAlphaTex(conv.beats, {
      title: ex.title,
      subtitle: `${prettyNote(st.key)} · ${steps.filter((x) => x.kind === 'chord').length} acordes`,
      tempo: st.bpm,
      duration: 4,
      showPicking: false,
    }));
    scoreHost.classList.toggle('is-hidden', st.memory);
    player.load(steps, {
      next: st.next && !st.memory,
      keyOf: (n, j, i) => (n.voice != null && steps[i].kind !== 'arp' ? `v-${n.voice}` : `a-${n.s}-${n.f}`),
      labels: labelOf,
      colorOf: (n) => (n.held ? '#b9ad95' : ROLE_COLOR[n.role] ?? COLORS.accent),
      click: st.click,
      mask: st.memory ? steps.map((_, i) => i === 0) : null,
    });
    player.show(0);
    if (autoplay) player.play({ tempo: st.bpm, countIn: 0 }).then(syncPlay);
  }

  /** Improvisación: las notas del acorde por todo el mástil (y la escala, si se cuentan las de paso). */
  function drawImprovMap(chord) {
    const tones = new Map([[chord.rootPc, 'root'], [mod(chord.rootPc + (chord.typeId === 'm' || chord.typeId === 'dim' ? 3 : 4), 12), 'third'], [mod(chord.rootPc + (chord.typeId === 'dim' ? 6 : chord.typeId === 'aug' ? 8 : 7), 12), 'fifth']]);
    const scale = new Set(diatonic(keyPc()).map((c) => c.rootPc));
    const items = [];
    for (let s = 0; s < 6; s += 1) {
      for (let f = 0; f <= 15; f += 1) {
        const pc = mod(TUNING[s] + f, 12);
        const role = tones.get(pc);
        if (role) items.push({ key: `im-${s}-${f}`, s, f, label: ROLE_LABEL[role], fill: ROLE_COLOR[role], alpha: 0.9, scale: 0.85 });
        else if (modes.passing() && scale.has(pc)) items.push({ key: `im-${s}-${f}`, s, f, label: '', fill: COLORS.ghost, alpha: 0.6, scale: 0.5 });
      }
    }
    board.dots(items, 'trail');
    bigName.textContent = prettyNote(chord.name);
  }

  function reveal() {
    st.memory = false;
    memToggle.querySelector('input').checked = false;
    scoreHost.classList.remove('is-hidden');
    player.setOptions({ mask: null, next: st.next });
    ctx.toast('Formas reveladas: compara con lo que has tocado.');
  }

  /* ───── transporte ───── */

  function syncPlay() { if (playBtn) playBtn.textContent = player.playing ? '■ Parar' : '▶ Reproducir'; }

  async function togglePlay() {
    if (player.playing) { player.stop(); syncPlay(); return; }
    await player.play({ tempo: st.bpm, from: Math.max(0, player.index >= steps.length - 1 ? 0 : player.index), repeat: st.loop, countIn: 4 });
    ctx.logSeconds?.(Math.round((steps.reduce((a, s) => a + (s.d ?? 1), 0) * 60) / st.bpm));
    syncPlay();
  }

  const stepBy = (d) => { player.stop(); syncPlay(); player.show((player.index < 0 ? 0 : player.index) + d, { sound: true }); };

  playBtn = button('▶ Reproducir', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: togglePlay });
  const memToggle = toggle('Tocar de memoria (oculta las formas)', false, (v) => { st.memory = v; load(); });
  const transport = h('div', { class: 'stack' },
    h('div', { class: 'row', style: 'justify-content:center' },
      button('◀', { variant: 'outline', title: 'Paso anterior', onClick: () => stepBy(-1) }),
      playBtn,
      button('▶|', { variant: 'outline', title: 'Paso siguiente', onClick: () => stepBy(1) }),
    ),
    slider({ min: 40, max: 160, value: st.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { st.bpm = v; player.setTempo(v); save(); } }),
  );

  /* ───── reto: prueba de reacción ───── */

  let drill = null;
  function startDrill() {
    const stats = ctx.storage.get('triad-drill', {});
    const q = drillQuestion({ set: st.set ?? 'all', stats });
    drill = { q, marks: [], at: performance.now(), done: false };
    board.clear();
    const fb = h('div', { class: 'feedback', hidden: true });
    const solid = Object.values(stats).filter((x) => x.ok >= 3 && x.ok / (x.ok + x.miss) >= 0.8).length;
    bigName.textContent = prettyNote(q.chord.name);
    caption.textContent = `${INVERSION_LABELS[q.inv]} · cuerdas ${setName(q.set)} · marca las tres notas en el mástil`;
    board.zones([{ from: 0, to: 15, color: COLORS.seventh, alpha: 0.04 }]);
    stage.append(
      h('div', { class: 'big-number', style: 'text-align:center' }, `${prettyNote(q.chord.name)} · ${INVERSION_LABELS[q.inv]} · cuerdas ${setName(q.set)}`),
      h('p', { class: 'hint', style: 'text-align:center' }, 'Pulsa las tres notas en el mástil (vuelve a pulsar una para quitarla).'),
      fb,
      h('div', { class: 'row', style: 'justify-content:center' }, button('Otra', { variant: 'accent', onClick: startDrill }), button('No lo sé: enséñamelo', { variant: 'ghost', onClick: () => finishDrill(true) })),
      h('p', { class: 'hint', style: 'text-align:center' }, `Dominadas: ${solid} de ${SETS.length * 12} combinaciones (calidad × inversión × grupo).`),
    );
    drill.fb = fb;
  }

  function drawMarks() {
    const sorted = [...drill.marks].sort((a, b) => b.s - a.s);
    board.dots(sorted.map((m, j) => ({ key: `v-${j}`, s: m.s, f: m.f, label: noteName(TUNING[m.s] + m.f), fill: COLORS.note })));
  }

  function finishDrill(gaveUp = false) {
    if (!drill || drill.done) return;
    drill.done = true;
    const ms = performance.now() - drill.at;
    const res = gaveUp ? { ok: false, why: 'Así es la forma:', voicing: checkDrill([], drill.q).voicing } : checkDrill(drill.marks, drill.q);
    ctx.storage.set('triad-drill', recordDrill(ctx.storage.get('triad-drill', {}), drill.q.key, res.ok, ms));
    drill.fb.hidden = false;
    drill.fb.className = `feedback ${res.ok ? 'ok' : 'bad'}`;
    drill.fb.textContent = res.ok ? `✓ ${(ms / 1000).toFixed(1)} s` : `✗ ${res.why}`;
    if (res.voicing) {
      // Las marcas se deslizan hasta la forma correcta (misma clave por voz).
      const step = chordStep(res.voicing, drill.q.chord, 2);
      setTimeout(() => {
        board.dots(step.notes.map((n, j) => ({ key: `v-${j}`, s: n.s, f: n.f, label: ROLE_LABEL[n.role], fill: ROLE_COLOR[n.role] })));
        engine.ensure().then(() => engine.strum(step.notes.map((n) => n.midi), engine.time + 0.02, { vel: 0.6, dur: 1.6 }));
      }, res.ok ? 0 : 450);
    }
  }

  /* ───── reto de oído ───── */

  let ear = null;
  const earScore = { ok: 0, n: 0 };
  function startEar() {
    ear = { q: earQuestion(), quality: null, top: null };
    board.clear();
    bigName.textContent = '?';
    caption.textContent = 'Escucha la tríada: ¿qué calidad tiene y qué nota va arriba?';
    const fb = h('div', { class: 'feedback', hidden: true });
    const pick = (field, value, btn) => {
      if (ear[field] != null && ear.done) return;
      ear[field] = value;
      btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
      if (ear.quality && ear.top) judgeEar(fb);
    };
    const qRow = h('div', { class: 'options' }, QUALITIES.map((q) => {
      const b = h('button', { type: 'button', class: 'option-btn' }, QUALITY_LABEL[q]);
      b.addEventListener('click', () => pick('quality', q, b));
      return b;
    }));
    const tRow = h('div', { class: 'options' }, ['root', 'third', 'fifth'].map((r) => {
      const b = h('button', { type: 'button', class: 'option-btn' }, `Arriba: ${ROLE_LABEL[r]}`);
      b.addEventListener('click', () => pick('top', r, b));
      return b;
    }));
    stage.append(
      h('div', { class: 'row', style: 'justify-content:center' }, button('🔊 Otra vez', { variant: 'outline', onClick: playEar }), button('🔊 Arpegiada', { variant: 'ghost', onClick: () => playEar(true) })),
      qRow, tRow, fb,
      h('div', { class: 'row', style: 'justify-content:center' }, button('Siguiente', { variant: 'accent', onClick: startEar })),
      h('p', { class: 'hint', style: 'text-align:center' }, earScore.n ? `Llevas ${earScore.ok}/${earScore.n}` : 'Consejo: canta la nota más aguda y luego la más grave.'),
    );
    playEar();
  }

  async function playEar(arp = false) {
    await engine.ensure();
    const midis = ear.q.step.notes.map((n) => n.midi);
    if (arp) midis.forEach((m, k) => engine.pluck(m, engine.time + 0.05 + k * 0.4, { dur: 1.4 }));
    else engine.strum(midis, engine.time + 0.02, { vel: 0.6, dur: 2 });
  }

  function judgeEar(fb) {
    ear.done = true;
    const ok = ear.quality === ear.q.typeId && ear.top === ear.q.step.notes[2].role;
    earScore.n += 1;
    if (ok) earScore.ok += 1;
    fb.hidden = false;
    fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
    fb.textContent = `${ok ? '✓' : '✗'} Era ${prettyNote(ear.q.step.chord.name)} (${QUALITY_LABEL[ear.q.typeId]}) con la ${ROLE_LABEL[ear.q.step.notes[2].role]} arriba.`;
    bigName.textContent = prettyNote(ear.q.step.chord.name);
    board.dots(ear.q.step.notes.map((n, j) => ({ key: `v-${j}`, s: n.s, f: n.f, label: ROLE_LABEL[n.role], fill: ROLE_COLOR[n.role] })));
  }

  board.onClick((hit) => {
    if (modes.onClick(hit)) return;
    if (drill && !drill.done && triadExercise(st.ex).interactive === 'drill') {
      const k = drill.marks.findIndex((m) => m.s === hit.s && m.f === hit.f);
      if (k >= 0) drill.marks.splice(k, 1);
      else {
        // Una nota por cuerda: pulsar otra casilla en la misma cuerda la sustituye.
        drill.marks = drill.marks.filter((m) => m.s !== hit.s);
        drill.marks.push(hit);
        engine.ensure().then(() => engine.pluck(TUNING[hit.s] + hit.f, engine.time + 0.01, { dur: 0.7 }));
      }
      drawMarks();
      if (drill.marks.length === 3) setTimeout(() => finishDrill(false), 250);
      return;
    }
    if (!steps.length) return;
    // Clic en una nota de la forma actual: la hace sonar.
    engine.ensure().then(() => engine.pluck(TUNING[hit.s] + hit.f, engine.time + 0.01, { dur: 0.9 }));
  });

  /* ───── lateral: lista, parámetros y opciones ───── */

  function drawList() {
    clear(listBox);
    let n = 0;
    for (const fam of TRIAD_FAMILIES) {
      listBox.append(h('div', { class: 'kicker', style: 'margin-top:6px' }, fam.label));
      TRIAD_EXERCISES.filter((x) => x.family === fam.id).forEach((x) => {
        n += 1;
        const b = h('button', { type: 'button', class: `ex-item ${x.id === st.ex ? 'is-active' : ''}`, role: 'option', 'aria-selected': String(x.id === st.ex) }, `${n}. ${x.title}`);
        b.addEventListener('click', () => {
          st.ex = x.id;
          // Cada ejercicio arranca con sus propios valores por defecto.
          openExercise(x.id);
        });
        listBox.append(b);
      });
    }
  }

  function openExercise(id, params = {}) {
    st.ex = id;
    // Cada ejercicio arranca con sus propios valores por defecto (o los del plan).
    Object.assign(st, { quality: null, set: null, inversion: null, shape: null, progression: null, degree: null, pedal: null, groove: null }, params);
    save();
    ctx.setParams({ ex: id });
    refresh();
  }

  function val(name) {
    const ex = triadExercise(st.ex);
    return st[name] ?? ex.defaults[name] ?? null;
  }

  function drawParams() {
    clear(paramBox);
    const ex = triadExercise(st.ex);
    const set = (name) => (v) => { st[name] = v; save(); load(); drawInfo(); };
    const f = (label, control) => h('div', { class: 'field' }, h('label', {}, label), control);
    const ps = new Set(ex.params);
    if (ps.has('key') || ps.has('root')) {
      paramBox.append(f(ps.has('key') ? 'Tonalidad (mayor)' : 'Acorde (tónica)', select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), st.key, (v) => { st.key = v; save(); load(); drawParams(); })));
    }
    if (ps.has('quality')) {
      const opts = QUALITIES.map((q) => ({ value: q, label: QUALITY_LABEL[q] }));
      if (['inv-h', 'inv-v'].includes(st.ex)) opts.push({ value: 'all', label: 'Las cuatro' });
      paramBox.append(f('Calidad', select(opts, val('quality'), set('quality'))));
    }
    if (ps.has('set')) {
      const opts = SETS.map((_, i) => ({ value: String(i), label: `Cuerdas ${setName(i)}` }));
      if (['inv-h', 'quality', 'scale-h', 'prog-caged', 'prog-sets', 'passing', 'drill', 'tempo', 'hand', 'pedal', 'chromatic', 'bassline', 'sus', 'song'].includes(st.ex)) opts.push({ value: 'all', label: 'Todos los grupos' });
      paramBox.append(f('Grupo de cuerdas', select(opts, String(val('set')), (v) => set('set')(v === 'all' ? 'all' : Number(v)))));
    }
    if (ps.has('inversion')) {
      const opts = INVERSION_LABELS.slice(0, 3).map((l, i) => ({ value: String(i), label: `Empieza en ${l.toLowerCase()}` }));
      if (st.ex === 'quality') opts.push({ value: 'all', label: 'Las tres inversiones' });
      paramBox.append(f('Inversión', select(opts, String(val('inversion')), (v) => set('inversion')(v === 'all' ? 'all' : Number(v)))));
    }
    if (ps.has('shape')) {
      const wins = cagedWindows(keyPc());
      const opts = CAGED_IDS.map((id) => {
        const w = wins.find((x) => x.id === id);
        return { value: id, label: `Forma ${id}${w ? ` (trastes ${w.from}–${w.to})` : ''}` };
      });
      opts.push({ value: 'all', label: 'Las cinco, por el mástil' });
      paramBox.append(f('Posición CAGED', select(opts, val('shape'), set('shape'))));
    }
    if (ps.has('progression')) paramBox.append(f('Progresión', select(PROGRESSIONS.map((p) => ({ value: p.id, label: p.label })), val('progression'), set('progression'))));
    if (ps.has('pedal')) {
      const dia = diatonic(keyPc());
      paramBox.append(f('Nota fija arriba', select(dia.map((c, i) => ({ value: String(i), label: `${i + 1} · ${prettyNote(c.name.replace(/m$|dim$/, ''))}` })), String(val('pedal')), (v) => set('pedal')(Number(v)))));
    }
    if (ps.has('groove')) paramBox.append(f('Ritmo', select(Object.entries(GROOVES).map(([id, g]) => ({ value: id, label: g.label })), val('groove'), set('groove'))));
    if (ps.has('song')) {
      const area = h('textarea', { rows: 3, style: 'width:100%;font-family:inherit', 'aria-label': 'Cifrado' });
      area.value = val('song');
      paramBox.append(f('Cifrado de la canción', area), button('Armonizar con tríadas', { variant: 'accent', onClick: () => set('song')(area.value) }));
    }
    if (st.ex === 'daily') paramBox.append(h('p', { class: 'feedback ok' }, `Tonalidad de hoy: ${prettyNote(diatonic(dailyKey())[0].name)} mayor. Mañana toca la siguiente del círculo de quintas.`));
    if (ps.has('degree')) {
      const dia = diatonic(keyPc());
      paramBox.append(f('Acorde de la tonalidad', select(dia.map((c, i) => ({ value: String(i), label: `${c.roman} · ${prettyNote(c.name)}` })), String(val('degree')), (v) => set('degree')(Number(v)))));
    }
    if (!ex.interactive && !['pairs', 'linear', 'passing', 'rhythm', 'ornaments', 'improv', 'upper'].includes(st.ex)) {
      paramBox.append(f('Pulsos por acorde', segmented([1, 2, 4].map((b) => ({ value: String(b), label: String(b) })), String(st.beats), (v) => { st.beats = Number(v); save(); load(); })));
    }
  }

  function drawInfo() {
    clear(sideInfo);
    const ex = triadExercise(st.ex);
    sideInfo.append(
      h('h2', { style: 'margin:0' }, ex.title),
      h('p', {}, ex.desc),
      h('p', { class: 'hint' }, `💡 ${ex.tip}`),
      steps.length ? h('p', { class: 'hint' }, `${steps.filter((s) => s.kind === 'chord').length} acordes · ${Math.round(steps.reduce((a, s) => a + (s.d ?? 1), 0))} pulsos`) : null,
    );
  }

  function drawLegend() {
    clear(legend);
    legend.append(
      h('span', {}, h('i', { style: `background:${COLORS.root}` }), 'R tónica'),
      h('span', {}, h('i', { style: `background:${COLORS.third}` }), '3 tercera'),
      h('span', {}, h('i', { style: `background:${COLORS.fifth}` }), '5 quinta'),
      h('span', {}, h('i', { style: `background:${COLORS.seventh}` }), 'nota común (late)'),
      h('span', {}, h('i', { style: 'background:#fffdf8;border:2px dashed #df812f' }), 'forma siguiente'),
    );
  }

  const optionsBox = h('details', { class: 'syntax', open: true },
    h('summary', {}, 'Sonido y animación'),
    h('div', { class: 'stack' },
      h('div', { class: 'field' }, h('label', {}, 'Cómo suena el acorde'), segmented([{ value: 'block', label: 'Plaqué' }, { value: 'strum', label: 'Rasgueo' }, { value: 'arp', label: 'Arpegio' }], st.style, (v) => { st.style = v; save(); load(); })),
      labelPick.el,
      toggle('Ver la forma siguiente', st.next, (v) => { st.next = v; save(); player.setOptions({ next: v }); }),
      toggle('Flechas de las voces que se mueven', st.arrows, (v) => { st.arrows = v; save(); }),
      toggle('Bajo con la tónica', st.bass, (v) => { st.bass = v; save(); load(); }),
      toggle('Metrónomo', st.click, (v) => { st.click = v; save(); player.setOptions({ click: v }); }),
      toggle('Repetir en bucle', st.loop, (v) => { st.loop = v; save(); }),
      memToggle,
    ));

  /* ───── plan intensivo de 4 semanas ───── */

  const planBox = h('div', { class: 'stack' });
  const today = () => new Date().toISOString().slice(0, 10);
  function drawPlan() {
    clear(planBox);
    const plan = ctx.storage.get('triad-plan', null);
    planBox.append(h('h2', { style: 'margin:0' }, 'Plan intensivo · 4 semanas'));
    if (!plan) {
      planBox.append(
        h('p', { class: 'hint' }, '20–25 minutos al día durante 28 días: calentamiento de reacción, foco del día, aplicación, oído y un reto. Cada semana tiene un tema (formas, tonalidad, conducción de voces, armonía y estilo) y la tonalidad, el grupo de cuerdas y la calidad cambian cada día.'),
        button('Empezar el plan hoy', { variant: 'accent', onClick: () => { ctx.storage.set('triad-plan', { start: today(), done: {} }); drawPlan(); } }),
      );
    } else {
      const idx = planDayIndex(plan.start);
      if (idx > 27) {
        planBox.append(h('p', { class: 'feedback ok' }, '¡Plan terminado! Repite las semanas que más te costaron o empieza otra vuelta.'));
      } else {
        const day = planDay(idx);
        const doneToday = new Set(plan.done[idx] ?? []);
        const daysDone = Object.values(plan.done).filter((l) => l.length >= day.blocks.length).length;
        planBox.append(
          h('p', { class: 'hint', style: 'margin:0' }, `Semana ${day.week} · día ${idx + 1} de 28 · ${day.theme}${day.review ? ' · repaso' : ''}`),
          h('div', { class: 'progress' }, h('i', { style: `width:${(daysDone / 28) * 100}%` })),
          h('p', { class: 'hint', style: 'margin:0' }, `Hoy: ${prettyNote(diatonic(day.params.keyPc)[0].name)} mayor · cuerdas ${setName(day.params.set)} · ${QUALITY_LABEL[day.params.quality]}`),
          ...day.blocks.map((b, k) => {
            const ex = triadExercise(b.ex);
            const btn = h('button', { type: 'button', class: `ex-item ${doneToday.has(k) ? 'is-done' : ''}` }, `${doneToday.has(k) ? '✓' : `${k + 1}.`} ${b.title}: ${ex.title} · ${b.minutes} min`);
            btn.addEventListener('click', () => {
              const cur = ctx.storage.get('triad-plan', plan);
              const list = new Set(cur.done[idx] ?? []);
              list.add(k);
              ctx.storage.set('triad-plan', { ...cur, done: { ...cur.done, [idx]: [...list] } });
              st.key = pcKeyName(day.params.keyPc);
              openExercise(b.ex, { set: ex.params.includes('set') ? day.params.set : null, quality: ex.params.includes('quality') && b.ex !== 'inv-h' ? day.params.quality : null, groove: ex.params.includes('groove') ? day.params.groove : null, progression: ex.params.includes('progression') ? day.params.progression : null });
              drawPlan();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            return btn;
          }),
        );
      }
      planBox.append(button('Reiniciar el plan', { variant: 'ghost', onClick: () => { if (confirm('¿Empezar el plan de nuevo desde el día 1?')) { ctx.storage.set('triad-plan', { start: today(), done: {} }); drawPlan(); } } }));
    }
    planBox.append(
      h('h2', { style: 'margin:8px 0 0' }, 'Tus 48 formas'),
      h('p', { class: 'hint', style: 'margin:0' }, 'Calidad × inversión × grupo de cuerdas, según la prueba de reacción y la reacción a tempo. Verde: la dominas; rojo: fallas o tardas.'),
      triadHeatmap(ctx.storage.get('triad-drill', {})),
    );
  }
  const pcKeyName = (pc) => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pc];

  function refresh() {
    drawPlan();
    drawList();
    drawParams();
    load();
    drawInfo();
  }

  drawLegend();
  root.append(
    header('Aprender el mástil', 'Tríadas en movimiento', `${TRIAD_EXERCISES.length} ejercicios para dominar las tríadas: formas e inversiones en los cuatro grupos de cuerdas, la tonalidad en cada posición CAGED, conducción de voces, armonía (estructuras superiores, préstamo modal, dominantes secundarios), ritmos y adornos, velocidad, oído e improvisación, con un plan intensivo de 4 semanas. Todo se ve, se oye y se escribe en partitura y tablatura.`),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' },
          h('div', { class: 'row row--between' }, bigName, legend),
          board.el,
          caption,
          transport,
          scoreBox,
          stage,
        ),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, sideInfo, paramBox),
        h('section', { class: 'panel stack' }, planBox),
        h('section', { class: 'panel stack' }, h('h2', { style: 'margin:0' }, 'Ejercicios'), listBox),
        h('section', { class: 'panel stack' }, optionsBox),
      ),
    ),
  );
  refresh();
}

export default {
  id: 'triadmotion',
  title: 'Tríadas en movimiento',
  group: 'neck',
  icon: '🔺',
  summary: '31 ejercicios de tríadas animados (formas, tonalidad, conducción de voces, armonía, ritmo, velocidad, oído e improvisación) y un plan intensivo de 4 semanas.',
  isNew: true,
  mount,
};
