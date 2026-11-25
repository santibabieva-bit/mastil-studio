/**
 * Estudio de frases: dibuja una frase sobre el mástil (clic o arrastre), la app
 * la cuantiza al pulso y la reproduce animada. Desde ahí, variaciones
 * automáticas (retrógrada, inversión, secuencia, aproximaciones, otra posición,
 * desplazamiento rítmico) para elegir y tocar. Se envía al Tab Creator o a Licks.
 */

import {
  ROOT_CHOICES, TUNINGS, parseRoot, prettyNote,
} from '../core/music.js';
import { scaleLabel, scalePcs } from '../core/jam.js';
import { phraseVariations, quantizePhrase, toSteps } from '../core/motion.js';
import { createTab, tabToJson } from '../core/tab.js';
import { COLORS, createAnimBoard, createPlayer, noteName } from '../ui/animboard.js';
import {
  button, clear, h, select, slider, toggle,
} from '../ui/dom.js';
import { header } from './common.js';

const SCALES = ['pentatonicMinor', 'pentatonicMajor', 'blues', 'major', 'naturalMinor', 'dorian', 'mixolydian'];

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    root: ctx.storage.get('phrase-root', 'A'),
    scale: ctx.storage.get('phrase-scale', 'pentatonicMinor'),
    bpm: ctx.storage.get('phrase-bpm', 90),
    guide: true,
    rhythm: true,
  };
  let points = ctx.storage.get('phrase-points', []);
  const board = createAnimBoard({ tuning, from: 0, to: 15, title: 'Dibuja tu frase' });
  board.el.classList.add('is-drawing', 'is-clickable');
  const player = createPlayer(board, engine, { onEnd: () => draw() });
  const info = h('p', { class: 'anim-caption' }, '');
  const varBox = h('div', { class: 'stack' });
  const extraPlayers = [];
  ctx.onCleanup(() => { player.stop(); extraPlayers.forEach((p) => p.stop()); });

  const pcs = () => scalePcs(parseRoot(cfg.root)?.pc ?? 9, cfg.scale);
  const save = () => ctx.storage.set('phrase-points', points);

  /** Pasos de la frase: con ritmo dibujado (cuantizado) o en corcheas. */
  function steps() {
    const q = cfg.rhythm ? quantizePhrase(points, { bpm: cfg.bpm, sub: 2 }) : points.map((p) => ({ s: p.s, f: p.f, d: 0.5 }));
    return toSteps(q.map((n) => [n.s, n.f, n.d]), tuning);
  }

  function draw() {
    const scale = new Set(pcs());
    const items = [];
    if (cfg.guide) {
      for (let s = 0; s < 6; s += 1) {
        for (let f = 0; f <= 15; f += 1) {
          const pc = (tuning[s] + f) % 12;
          if (scale.has(pc)) items.push({ key: `g-${s}-${f}`, s, f, label: '', fill: pc === (parseRoot(cfg.root)?.pc ?? 9) ? '#e7b3ad' : COLORS.ghost, alpha: 0.5, scale: 0.45 });
        }
      }
    }
    points.forEach((p, i) => items.push({ key: `p-${i}`, s: p.s, f: p.f, label: i + 1, fill: COLORS.accent }));
    board.dots(items);
    board.clearArrows();
    for (let i = 1; i < points.length; i += 1) board.arrow(points[i - 1], points[i], { color: COLORS.accent, bend: 0.18, width: 2 });
    info.textContent = points.length
      ? `${points.length} notas: ${points.map((p) => noteName(tuning[p.s] + p.f)).join(' ')}`
      : 'Pulsa casillas del mástil (o arrastra) para dibujar una frase. El ritmo sale de cuándo pulsas.';
  }

  let lastAdd = 0;
  function add(hit) {
    const now = performance.now();
    // Arrastrando muy deprisa por varias casillas solo cuentan las que se pisan un momento.
    if (now - lastAdd < 60 && points.length) points.pop();
    lastAdd = now;
    points.push({ s: hit.s, f: hit.f, t: now });
    engine.ensure().then(() => engine.pluck(tuning[hit.s] + hit.f, engine.time + 0.01, { dur: 0.8 }));
    save();
    draw();
  }
  board.onDrag({ start: add, move: add });

  async function play() {
    if (!points.length) return;
    player.load(steps(), { next: true, trail: 8, hand: true, arrows: true, labels: 'name' });
    await player.play({ tempo: cfg.bpm, countIn: 4 });
  }

  function toTab(list = steps()) {
    const seq = [];
    for (const st of list) {
      if (!st.notes.length) { seq.push(null); continue; }
      seq.push({ s: st.notes[0].s, f: st.notes[0].f });
      for (let k = 1; k < Math.round((st.d ?? 0.5) * 2); k += 1) seq.push(null);
    }
    // Una columna por corchea: las notas largas dejan columnas vacías detrás.
    const tab = createTab({ strings: 6, cols: Math.max(1, seq.length), title: 'Frase del estudio', tempo: cfg.bpm });
    seq.forEach((n, c) => { if (n) tab.cells[n.s][c] = String(n.f); });
    tab.subdivision = 2;
    ctx.storage.set('tab-handoff', tabToJson(tab));
    ctx.go('tab', { handoff: 1 });
  }

  function toLick(list = steps()) {
    const name = prompt('Nombre del lick', 'Mi frase');
    if (!name) return;
    const notes = list.filter((st) => st.notes.length).map((st) => [st.notes[0].s, st.notes[0].f, Math.max(1, Math.round((st.d ?? 0.5) * 2))]);
    const custom = ctx.storage.get('licks-custom', []);
    custom.push({ id: `custom-${Date.now()}`, name, style: 'Propio', rootPc: parseRoot(cfg.root)?.pc ?? 9, notes, subdivision: 2 });
    ctx.storage.set('licks-custom', custom);
    ctx.toast('Guardado en Licks');
  }

  function variations() {
    clear(varBox);
    extraPlayers.forEach((p) => p.stop());
    extraPlayers.length = 0;
    if (points.length < 3) { varBox.append(h('p', { class: 'hint' }, 'Dibuja al menos 3 notas para generar variaciones.')); return; }
    const list = phraseVariations(steps(), { pcs: pcs(), tuning });
    varBox.append(h('h2', {}, 'Variaciones de tu frase'));
    for (const v of list) {
      const maxF = Math.max(12, ...v.steps.flatMap((s) => s.notes.map((n) => n.f + 1)));
      const b = createAnimBoard({ tuning, from: 0, to: Math.min(17, maxF), title: v.label });
      const p = createPlayer(b, engine);
      p.load(v.steps, { next: true, trail: 8, hand: true, arrows: true });
      p.show(v.steps[0].notes.length ? 0 : 1);
      extraPlayers.push(p);
      varBox.append(h('section', { class: 'panel stack' },
        h('div', { class: 'row row--between' }, h('strong', {}, v.label), h('span', { class: 'hint' }, v.steps.filter((s) => s.notes.length).map((s) => noteName(s.notes[0].midi)).join(' '))),
        h('p', { class: 'hint', style: 'margin:0' }, v.why),
        b.el,
        h('div', { class: 'row' },
          button('▶ Oír y ver', { variant: 'accent', onClick: () => { extraPlayers.forEach((x) => x.stop()); p.play({ tempo: cfg.bpm }); } }),
          button('Usar esta como frase', { variant: 'outline', onClick: () => { let t = performance.now(); points = v.steps.filter((s) => s.notes.length || true).flatMap((s) => { const out = s.notes.length ? [{ s: s.notes[0].s, f: s.notes[0].f, t }] : []; t += (s.d ?? 0.5) * (60000 / cfg.bpm); return out; }); save(); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }),
          button('Al Tab Creator', { variant: 'ghost', onClick: () => toTab(v.steps) }),
        )));
    }
  }

  draw();
  root.append(
    header('Tocar y escribir', 'Estudio de frases', 'Dibuja una frase sobre el mástil y escúchala: el ritmo sale de cuándo pulsas. Después la app te propone variaciones animadas para desarrollar la idea, como hacen los improvisadores con sus motivos.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, board.el, info,
          h('div', { class: 'row', style: 'justify-content:center' },
            button('▶ Reproducir', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: play }),
            button('↶ Deshacer', { variant: 'ghost', onClick: () => { points.pop(); save(); draw(); } }),
            button('Borrar', { variant: 'ghost', onClick: () => { points = []; save(); draw(); clear(varBox); } }),
            button('✨ Variaciones', { variant: 'outline', onClick: variations }),
          ),
          h('div', { class: 'row', style: 'justify-content:center' },
            button('Enviar al Tab Creator', { variant: 'ghost', onClick: () => toTab() }),
            button('Guardar en Licks', { variant: 'ghost', onClick: () => toLick() }),
          ),
        ),
        varBox,
      ),
      h('section', { class: 'panel stack' },
        h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; ctx.storage.set('phrase-root', v); draw(); })),
        h('div', { class: 'field' }, h('label', {}, 'Escala de guía'), select(SCALES.map((q) => ({ value: q, label: scaleLabel(q) })), cfg.scale, (v) => { cfg.scale = v; ctx.storage.set('phrase-scale', v); draw(); })),
        slider({ min: 50, max: 160, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; ctx.storage.set('phrase-bpm', v); } }),
        toggle('Ver la escala de guía', cfg.guide, (v) => { cfg.guide = v; draw(); }),
        toggle('Usar el ritmo con que dibujé', cfg.rhythm, (v) => { cfg.rhythm = v; }),
        h('p', { class: 'hint' }, 'Truco: canta la frase mientras la dibujas; el ritmo de tus clics será el de la frase. Si prefieres notas iguales, desactiva «Usar el ritmo».'),
      ),
    ),
  );
}

export default {
  id: 'phrasestudio',
  title: 'Estudio de frases',
  group: 'play',
  icon: '✍',
  summary: 'Dibuja una frase en el mástil, escúchala animada y genera variaciones; envíala al Tab Creator o a Licks.',
  isNew: true,
  mount,
};
