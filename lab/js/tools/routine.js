/**
 * Rutina guiada: te arma una sesión de práctica con bloques cronometrados,
 * da más peso a lo que has practicado menos y a tus puntos débiles, y guarda
 * lo que vas completando hoy.
 */

import { ROOT_CHOICES, prettyNote } from '../core/music.js';
import { buildRoutine } from '../core/routine.js';
import { dateKey, totalsByTool } from '../core/practice.js';
import { dueCount } from '../core/srs.js';
import { emptyStats, weakSpots } from '../core/quiz.js';
import { nextFocus, skillRadar } from '../core/skills.js';
import { button, clear, h, segmented, select } from '../ui/dom.js';
import { header } from './common.js';

const TOOL_LABEL = { metronome: 'Metrónomo', exercises: 'Ejercicios', drills: 'Drills', timing: 'Timing Lab', bendlab: 'Bends y vibrato', triads: 'Triad Lab', quiz: 'Theory Trainer', jam: 'Jam Studio', ear: 'Ear Trainer', backing: 'Backing' };

function mount(root, ctx) {
  const today = dateKey();
  const saved = ctx.storage.get('routine-today', null);
  const cfg = {
    minutes: ctx.storage.get('routine-minutes', 30),
    root: ctx.session.get().root ?? 'A',
    plan: saved && saved.date === today ? saved.plan : null,
    done: saved && saved.date === today ? saved.done : [],
  };
  let timer = 0;
  let active = -1;
  let remaining = 0;
  const body = h('div', { class: 'stack' });
  const clock = h('div', { class: 'big-number', style: 'text-align:center;font-size:2.4rem' }, '');
  ctx.onCleanup(() => clearInterval(timer));

  const persist = () => ctx.storage.set('routine-today', { date: today, plan: cfg.plan, done: cfg.done });

  /** Eje más flojo del radar → bloque de la rutina que lo trabaja. */
  function focusBlock() {
    const radar = skillRadar({
      timing: ctx.storage.get('timing-history', []),
      pitch: ctx.storage.get('pitch-history', []),
      quiz: ctx.storage.get('quiz-stats', null),
      speed: ctx.storage.get('speed-history', {}),
      practice: ctx.practice.state,
    });
    const f = nextFocus(radar);
    return { timing: 'timing', pitch: 'pitch', theory: 'theory', speed: 'technique' }[f.id] ?? null;
  }

  function generate() {
    const stats = ctx.storage.get('quiz-stats', null) ?? emptyStats();
    cfg.plan = buildRoutine({
      minutes: cfg.minutes,
      root: cfg.root,
      weak: weakSpots(stats, 5),
      due: dueCount(stats.srs),
      totals: totalsByTool(ctx.practice.state),
      focus: focusBlock(),
    });
    cfg.done = [];
    stopTimer();
    persist();
    render();
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function stopTimer() {
    clearInterval(timer);
    timer = 0;
    active = -1;
    clock.textContent = '';
  }

  function startBlock(i) {
    stopTimer();
    active = i;
    remaining = cfg.plan.blocks[i].minutes * 60;
    clock.textContent = fmt(remaining);
    timer = setInterval(async () => {
      remaining -= 1;
      clock.textContent = fmt(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timer);
        timer = 0;
        try { await ctx.engine.ensure(); ctx.engine.click(ctx.engine.time + 0.02, { accent: true, sound: 'wood', vol: 1 }); } catch { /* sin audio */ }
        markDone(i, true);
        ctx.toast(`Bloque «${cfg.plan.blocks[i].title}» terminado`);
        const next = cfg.plan.blocks.findIndex((_, k) => k > i && !cfg.done.includes(k));
        if (next >= 0) startBlock(next);
        else { active = -1; clock.textContent = '¡Rutina completa!'; }
      }
    }, 1000);
    render();
  }

  function markDone(i, on) {
    cfg.done = on ? [...new Set([...cfg.done, i])] : cfg.done.filter((x) => x !== i);
    persist();
    render();
  }

  function render() {
    clear(body);
    const total = cfg.plan?.total ?? 0;
    body.append(
      h('section', { class: 'panel stack' }, h('h2', {}, 'Tu sesión de hoy'),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Tiempo disponible'),
            segmented([15, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m} min` })), cfg.minutes, (v) => { cfg.minutes = Number(v); ctx.storage.set('routine-minutes', cfg.minutes); })),
          h('div', { class: 'field' }, h('label', {}, 'Tonalidad de trabajo'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; })),
        ),
        h('div', { class: 'row' }, button(cfg.plan ? '↻ Generar otra rutina' : 'Generar rutina', { variant: 'accent', onClick: generate })),
      ),
    );
    if (!cfg.plan) {
      body.append(h('p', { class: 'hint' }, 'La rutina reparte el tiempo entre calentamiento, técnica, tríadas, teoría, jam y oído. Si has fallado cosas en el Theory Trainer o llevas poco tiempo en alguna herramienta, le da más peso.'));
      return;
    }
    const doneMin = cfg.plan.blocks.reduce((s, b, i) => s + (cfg.done.includes(i) ? b.minutes : 0), 0);
    body.append(
      h('div', { class: 'progress' }, h('i', { style: `width:${total ? (doneMin / total) * 100 : 0}%` })),
      h('p', { class: 'hint' }, `${doneMin} de ${total} minutos completados.`),
      clock,
      ...cfg.plan.blocks.map((b, i) => h('section', { class: `panel stack ${active === i ? 'is-running' : ''}`, style: cfg.done.includes(i) ? 'opacity:.6' : '' },
        h('div', { class: 'row row--between' },
          h('h2', { style: 'margin:0' }, `${i + 1}. ${b.title} · ${b.minutes} min`),
          h('span', { class: 'pill' }, TOOL_LABEL[b.tool] ?? b.tool),
        ),
        h('p', { class: 'hint' }, b.why),
        h('div', { class: 'row' },
          button(active === i ? '⏱ En curso' : '▶ Cronometrar', { variant: 'accent', onClick: () => startBlock(i) }),
          button('Abrir herramienta', { variant: 'outline', onClick: () => ctx.go(b.tool, b.params) }),
          button(cfg.done.includes(i) ? '↺ Desmarcar' : '✓ Hecho', { variant: 'ghost', onClick: () => markDone(i, !cfg.done.includes(i)) }),
        ),
      )),
    );
  }

  root.append(
    header('Practicar', 'Rutina guiada', 'Dile cuánto tiempo tienes y te propone una sesión equilibrada, con cada bloque cronometrado y enlazado a la herramienta adecuada.'),
    body,
  );
  render();
}

export default {
  id: 'routine',
  title: 'Rutina guiada',
  group: 'practice',
  icon: '☰',
  summary: 'Sesión de práctica a medida con bloques cronometrados según tus puntos débiles y tu tiempo.',
  isNew: true,
  mount,
};
