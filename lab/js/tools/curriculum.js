/**
 * Ruta de aprendizaje: cinco niveles con puertas medibles. Convierte las
 * herramientas sueltas del Lab en un camino con el siguiente objetivo claro.
 */

import { curriculumStatus } from '../core/curriculum.js';
import { daysPracticed } from '../core/practice.js';
import { button, clear, h } from '../ui/dom.js';
import { header } from './common.js';

/** Reúne todo lo que la app sabe de ti en el formato del currículo. */
export function collectProgress(ctx) {
  const practice = ctx.practice.state;
  return {
    speed: ctx.storage.get('speed-history', {}),
    quiz: ctx.storage.get('quiz-stats', null),
    timing: ctx.storage.get('timing-history', []),
    pitch: ctx.storage.get('pitch-history', []),
    jam: ctx.storage.get('jam-scores', []),
    earplay: ctx.storage.get('earplay-history', []),
    blind: ctx.storage.get('blind-best', null),
    neckmap: ctx.storage.get('neck-map', {}),
    practiceDays: Object.keys(practice?.days ?? {}).length ? daysPracticed(practice) : 0,
    songs: ctx.storage.get('repertoire', []),
    manual: ctx.storage.get('curriculum-manual', {}),
  };
}

function mount(root, ctx) {
  const body = h('div', { class: 'stack' });

  function toggleManual(id) {
    const m = ctx.storage.get('curriculum-manual', {});
    m[id] = !m[id];
    ctx.storage.set('curriculum-manual', m);
    render();
  }

  function compRow(c) {
    return h('div', { class: 'stack', style: 'padding:8px 0;border-top:1px solid var(--line,#e5dfd2)' },
      h('div', { class: 'row row--between' },
        h('strong', {}, `${c.done ? '✅' : '⬜'} ${c.label}`),
        h('span', { class: 'row' },
          c.criterion.type === 'manual' ? button(c.done ? '↺ Desmarcar' : '✓ Me sale', { variant: 'ghost', onClick: () => toggleManual(c.id) }) : null,
          button('Practicar', { variant: c.done ? 'ghost' : 'outline', onClick: () => ctx.go(c.tool, c.params) }),
        ),
      ),
      h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(c.value * 100)}%` })),
      h('p', { class: 'hint', style: 'margin:0' }, `${c.text} — ${c.how}`),
    );
  }

  function render() {
    clear(body);
    const st = curriculumStatus(collectProgress(ctx));
    body.append(
      h('section', { class: 'panel stack' },
        h('h2', {}, `Estás en: ${st.current.title}`),
        h('p', { class: 'hint' }, st.current.goal),
        h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(st.overall * 100)}%` })),
        h('p', { class: 'hint' }, `Ruta completa: ${Math.round(st.overall * 100)} %`),
        st.next
          ? h('div', { class: 'row' },
            h('p', { class: 'feedback ok', style: 'margin:0' }, `Siguiente objetivo: ${st.next.label}. ${st.next.text}`),
            button('Empezar ahora', { variant: 'accent', onClick: () => ctx.go(st.next.tool, st.next.params) }),
            button('Rutina de hoy', { variant: 'outline', onClick: () => ctx.go('routine', { path: 1 }) }),
          )
          : h('p', { class: 'feedback ok' }, '¡Has completado toda la ruta!'),
      ),
    );
    for (const lv of st.levels) {
      body.append(h('section', { class: 'panel stack', style: lv.unlocked ? '' : 'opacity:.55' },
        h('div', { class: 'row row--between' },
          h('h2', { style: 'margin:0' }, lv.title),
          h('span', { class: 'pill' }, lv.unlocked ? `${lv.done}/${lv.competencies.length}` : '🔒 Se abre con el nivel anterior'),
        ),
        h('p', { class: 'hint' }, lv.goal),
        ...lv.competencies.map(compRow),
      ));
    }
  }

  root.append(
    header('Practicar', 'Ruta de aprendizaje', 'Cinco niveles con puertas medibles: de conocer el mástil a improvisar con voces guía. La app lee lo que has practicado y te dice qué toca ahora. Una puerta se abre cuando tienes todas las competencias del nivel menos una.'),
    body,
    h('p', { class: 'hint' }, 'Los criterios medidos por micrófono o MIDI no se han probado con todas las guitarras: en las competencias manuales puedes confirmar tú mismo que te salen con soltura.'),
  );
  render();
}

export default {
  id: 'curriculum',
  title: 'Ruta de aprendizaje',
  group: 'practice',
  icon: '🧭',
  summary: 'Cinco niveles con puertas medibles y el siguiente objetivo, según lo que ya has practicado.',
  isNew: true,
  mount,
};
