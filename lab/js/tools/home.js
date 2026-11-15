/** Pantalla de inicio: acceso rápido, racha de hoy y todas las herramientas. */

import { dateKey, currentStreak, formatMinutes, minutesOn } from '../core/practice.js';
import { GROUPS, TOOLS } from './index.js';
import { h } from '../ui/dom.js';

export function renderHome(root, ctx) {
  const today = minutesOn(ctx.practice.state, dateKey());
  const goal = ctx.practice.state.goal ?? 15;
  const streak = currentStreak(ctx.practice.state);
  const quick = [
    ['navigator', 'Explorar el mástil', 'Escalas, arpegios y acordes con audio'],
    ['metronome', 'Abrir el metrónomo', 'Click, subdivisiones y entrenador de velocidad'],
    ['quiz', 'Quiz de 2 minutos', 'Notas del mástil, intervalos y acordes'],
    ['jam', 'Jam con el mástil en vivo', 'La base suena y el mástil sigue los acordes'],
    ['routine', 'Rutina guiada', 'Una sesión a medida con bloques cronometrados'],
    ['timing', 'Mide tu pulso', 'El micrófono mide cuánto te desvías del clic'],
    ['drills', 'Drills con escalera de velocidad', 'Sube el tempo sólo con repeticiones limpias'],
  ];

  root.append(
    h(
      'div',
      { class: 'hero' },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'kicker' }, 'Estudio de guitarra'),
        h('h1', {}, 'Todo lo que necesitas para estudiar, en una sola pestaña.'),
        h('p', {}, 'Mástil interactivo, jam sobre acordes con el mástil en vivo, tríadas, drills de técnica con medición de pulso por micrófono, entrenadores de teoría, ritmo y oído, backing tracks, creador de tabs y registro de práctica. Sin cuentas: tu progreso se guarda en este navegador y funciona sin conexión.'),
        h('div', { class: 'row', style: 'margin-top:14px' }, quick.slice(0, 2).map(([id, label]) => h('a', { class: 'btn btn-accent', href: `#/${id}` }, label)), h('a', { class: 'btn btn-outline', href: '../index.html' }, 'Plantillas CAGED (Studio)')),
      ),
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'kicker' }, 'Hoy'),
        h('div', { class: 'stat-grid' },
          h('div', { class: 'stat' }, h('strong', {}, formatMinutes(today)), h('span', {}, 'practicado hoy')),
          h('div', { class: 'stat' }, h('strong', {}, `${streak}`), h('span', {}, streak === 1 ? 'día de racha' : 'días de racha')),
          h('div', { class: 'stat' }, h('strong', {}, `${goal} min`), h('span', {}, 'meta diaria')),
        ),
        h('div', { class: 'progress', style: 'margin-top:12px' }, h('i', { style: `width:${Math.min(100, (today / goal) * 100)}%` })),
        h('p', { class: 'hint', style: 'margin-top:8px' }, 'El tiempo con metrónomo, backing, ejercicios y entrenadores se anota solo.'),
        h('div', { class: 'row', style: 'margin-top:10px' }, h('a', { class: 'btn btn-outline btn-sm', href: '#/log' }, 'Ver registro')),
      ),
    ),
  );

  for (const group of GROUPS) {
    root.append(
      h('h2', { class: 'group-title' }, group.label),
      h(
        'div',
        { class: 'card-grid' },
        TOOLS.filter((t) => t.group === group.id).map((t) => h(
          'a',
          { class: 'tool-card', href: `#/${t.id}` },
          h('span', { class: 'ico' }, t.icon),
          h('strong', {}, t.title, t.isNew ? ' ' : '', t.isNew ? h('span', { class: 'pill', style: 'background:var(--orange);color:#fff;font-size:.62rem' }, 'NUEVO') : null),
          h('span', { class: 'desc' }, t.summary),
        )),
      ),
    );
  }
}
