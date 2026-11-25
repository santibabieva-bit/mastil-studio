/**
 * Tríadas en movimiento: quince ejercicios de tríadas (inversiones en
 * horizontal y vertical, escala armonizada por posición CAGED, progresiones,
 * notas de paso, ciclo de cuartas, chord melody, abiertas, pares, retos de
 * reacción y de oído) con el mástil animado, tablatura que sigue y sonido.
 */

import { ROOT_CHOICES, parseRoot, prettyNote } from '../core/music.js';
import { CAGED_COLORS } from '../core/exlib.js';
import {
  INVERSION_LABELS, PROGRESSIONS, QUALITIES, QUALITY_LABEL, ROLE_LABEL, SETS, TRIAD_EXERCISES, TRIAD_FAMILIES,
  buildTriadExercise, cagedWindows, checkDrill, chordStep, describeStep, diatonic, drillQuestion, earQuestion,
  recordDrill, setName, triadExercise, voiceMoves,
} from '../core/triadex.js';
import { COLORS, createAnimBoard, createPlayer, noteName } from '../ui/animboard.js';
import { createTabStrip } from '../ui/tabstrip.js';
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
    beats: saved.beats ?? 2,
    bpm: saved.bpm ?? 70,
    style: saved.style ?? 'block',
    labels: saved.labels ?? 'role',
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
  const tab = createTabStrip({ onSeek: (i) => { player.stop(); player.show(i, { sound: true }); syncPlay(); } });
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

  /* ───── dibujo por paso ───── */

  function lastChordBefore(i) {
    for (let k = i - 1; k >= 0; k -= 1) if (steps[k].kind === 'chord') return steps[k];
    return null;
  }

  function onStep(i, s) {
    tab.highlight(i);
    if (s.chord) bigName.textContent = prettyNote(s.chord.name);
    caption.textContent = s.kind === 'chord' ? describeStep(s)
      : s.kind === 'pass' ? `Nota de paso: ${noteName(s.notes[s.notes.length - 1].midi)} (de la escala)`
        : `${s.chord?.name ?? ''} · ${noteName(s.notes[0].midi)}`;
    if (s.shape) board.zones([{ from: s.shape.from, to: s.shape.to, color: CAGED_COLORS[s.shape.id], label: `Forma ${s.shape.id}`, alpha: 0.13 }]);
    else board.zones([]);
    board.clearArrows();
    if (st.arrows && s.kind === 'chord' && !st.memory) {
      const prev = lastChordBefore(i);
      const { moves, common } = voiceMoves(prev, s);
      for (const m of moves) {
        if (Math.abs(m.semis) > 0) board.arrow(m.from, m.to, { color: ROLE_COLOR[m.to.role] ?? COLORS.accent, bend: 0.3, width: 2.2, label: `${m.semis > 0 ? '+' : ''}${m.semis}` });
      }
      for (const c of common) board.pulse(c.s, c.f, COLORS.seventh);
    }
  }

  function labelOf(n) {
    if (st.labels === 'role') return n.role === 'pass' ? '' : ROLE_LABEL[n.role] ?? '';
    if (st.labels === 'name') return noteName(n.midi);
    return '';
  }

  function decorate(list) {
    return list.map((s) => {
      const out = { ...s };
      if (s.kind === 'chord') {
        if (st.style === 'strum') { out.strum = s.notes.map((n) => n.midi); out.silent = true; }
        if (st.style === 'arp') out.arp = true;
        if (st.bass) out.bass = 36 + ((s.chord.rootPc - 0 + 12) % 12);
      }
      return out;
    });
  }

  function load() {
    const ex = triadExercise(st.ex);
    player.stop();
    board.clear();
    board.zones([]);
    clear(stage);
    if (ex.interactive) {
      steps = [];
      tab.load([]);
      tab.el.hidden = true;
      transport.hidden = true;
      if (ex.interactive === 'drill') startDrill();
      else startEar();
      return;
    }
    tab.el.hidden = false;
    transport.hidden = false;
    const { steps: raw } = buildTriadExercise(st.ex, {
      keyPc: keyPc(), rootPc: keyPc(), quality: st.quality, set: st.set, inversion: st.inversion, shape: st.shape,
      progression: st.progression, degree: st.degree, beats: st.beats,
    });
    steps = decorate(raw);
    if (!steps.length) {
      caption.textContent = 'No hay formas cómodas con estos ajustes: prueba otro grupo de cuerdas o posición.';
      tab.load([]);
      return;
    }
    tab.load(steps, { header: (s) => (s.chord ? `${s.chord.roman ? `${s.chord.roman} ` : ''}${prettyNote(s.chord.name)}` : '') });
    tab.el.classList.toggle('is-hidden', st.memory);
    player.load(steps, {
      next: st.next && !st.memory,
      keyOf: (n, j, i) => (steps[i].kind === 'pass' || steps[i].kind === 'chord' ? `v-${n.voice ?? j}` : `a-${n.s}-${n.f}`),
      labels: labelOf,
      colorOf: (n) => (n.held ? '#b9ad95' : ROLE_COLOR[n.role] ?? COLORS.accent),
      click: st.click,
      mask: st.memory ? steps.map((_, i) => i === 0) : null,
    });
    player.show(0);
  }

  function reveal() {
    st.memory = false;
    memToggle.querySelector('input').checked = false;
    tab.el.classList.remove('is-hidden');
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
    for (const fam of TRIAD_FAMILIES) {
      listBox.append(h('div', { class: 'kicker', style: 'margin-top:6px' }, fam.label));
      TRIAD_EXERCISES.filter((x) => x.family === fam.id).forEach((x) => {
        const n = TRIAD_EXERCISES.indexOf(x) + 1;
        const b = h('button', { type: 'button', class: `ex-item ${x.id === st.ex ? 'is-active' : ''}`, role: 'option', 'aria-selected': String(x.id === st.ex) }, `${n}. ${x.title}`);
        b.addEventListener('click', () => {
          st.ex = x.id;
          // Cada ejercicio arranca con sus propios valores por defecto.
          Object.assign(st, { quality: null, set: null, inversion: null, shape: null, progression: null, degree: null });
          save();
          ctx.setParams({ ex: x.id });
          refresh();
        });
        listBox.append(b);
      });
    }
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
      if (['inv-h', 'quality', 'scale-h', 'prog-caged', 'prog-sets', 'passing', 'drill'].includes(st.ex)) opts.push({ value: 'all', label: 'Todos los grupos' });
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
    if (ps.has('degree')) {
      const dia = diatonic(keyPc());
      paramBox.append(f('Acorde de la tonalidad', select(dia.map((c, i) => ({ value: String(i), label: `${c.roman} · ${prettyNote(c.name)}` })), String(val('degree')), (v) => set('degree')(Number(v)))));
    }
    if (!ex.interactive && !['pairs', 'linear', 'passing'].includes(st.ex)) {
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
      h('div', { class: 'field' }, h('label', {}, 'Etiquetas'), segmented([{ value: 'role', label: 'R 3 5' }, { value: 'name', label: 'Notas' }, { value: 'none', label: 'Nada' }], st.labels, (v) => { st.labels = v; save(); player.setOptions({ labels: labelOf }); })),
      toggle('Ver la forma siguiente', st.next, (v) => { st.next = v; save(); player.setOptions({ next: v }); }),
      toggle('Flechas de las voces que se mueven', st.arrows, (v) => { st.arrows = v; save(); }),
      toggle('Bajo con la tónica', st.bass, (v) => { st.bass = v; save(); load(); }),
      toggle('Metrónomo', st.click, (v) => { st.click = v; save(); player.setOptions({ click: v }); }),
      toggle('Repetir en bucle', st.loop, (v) => { st.loop = v; save(); }),
      memToggle,
    ));

  function refresh() {
    drawList();
    drawParams();
    load();
    drawInfo();
  }

  drawLegend();
  root.append(
    header('Aprender el mástil', 'Tríadas en movimiento', 'Quince ejercicios para dominar las tríadas: inversiones en horizontal y vertical en los cuatro grupos de cuerdas, la escala armonizada en cada posición CAGED, progresiones con la conducción de voces más corta, notas de paso, ciclo de cuartas, melodía en la voz aguda y retos. Todo se ve, se oye y se escribe en tablatura.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' },
          h('div', { class: 'row row--between' }, bigName, legend),
          board.el,
          caption,
          tab.el,
          transport,
          stage,
        ),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, sideInfo, paramBox),
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
  summary: '15 ejercicios de tríadas animados: inversiones, escala armonizada por CAGED, progresiones, notas de paso y retos, con tab y sonido.',
  isNew: true,
  mount,
};
