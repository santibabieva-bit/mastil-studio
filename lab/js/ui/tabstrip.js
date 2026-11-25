/**
 * Tablatura en tira que sigue al diapasón animado: una columna por paso
 * (ancho según su duración), el nombre del acorde encima cuando cambia y la
 * columna que suena resaltada. Pulsar una columna salta a ese paso.
 */

import { h } from './dom.js';

const LETTERS = ['e', 'B', 'G', 'D', 'A', 'E'];

export function createTabStrip({ strings = 6, onSeek = null } = {}) {
  const scroller = h('div', { class: 'tabstrip', role: 'list', 'aria-label': 'Tablatura' });
  const names = h('div', { class: 'tabstrip-names', 'aria-hidden': 'true' },
    h('span', {}, ''), ...LETTERS.slice(0, strings).map((l) => h('span', {}, l)));
  const el = h('div', { class: 'tabstrip-wrap' }, names, scroller);
  let cols = [];
  let current = -1;

  return {
    el,
    load(steps, { header = null } = {}) {
      scroller.replaceChildren();
      cols = [];
      current = -1;
      let prevName = null;
      let t = 0;
      steps.forEach((st, i) => {
        const name = header ? header(st, i) : (st.chord?.name ?? '');
        const show = name && name !== prevName ? name : '';
        prevName = name || prevName;
        const byString = new Map(st.notes.filter((n) => !n.held).map((n) => [n.s, n]));
        const beat = Math.abs(t - Math.round(t)) < 1e-6 && Math.round(t) % 4 === 0 && i > 0;
        const col = h('button', {
          type: 'button',
          class: `tabstrip-col${beat ? ' is-bar' : ''}${st.notes.filter((n) => !n.held).length > 1 ? ' is-chord' : ''}`,
          role: 'listitem',
          style: `min-width:${Math.max(26, Math.round((st.d ?? 1) * 30))}px`,
          title: name || '',
        },
        h('span', { class: 'tabstrip-head' }, show),
        ...Array.from({ length: strings }, (_, s) => {
          const n = byString.get(s);
          return h('span', { class: `tabstrip-cell${n?.role ? ` role-${n.role}` : ''}` }, n ? String(n.f) : '');
        }));
        col.addEventListener('click', () => onSeek?.(i));
        scroller.append(col);
        cols.push(col);
        t += st.d ?? 1;
      });
    },
    highlight(i) {
      if (current >= 0) cols[current]?.classList.remove('is-now');
      current = i;
      const col = cols[i];
      if (!col) return;
      col.classList.add('is-now');
      const left = col.offsetLeft - scroller.clientWidth / 2 + col.offsetWidth / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    },
  };
}
