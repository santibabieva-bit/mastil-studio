/**
 * Mástil «vivo»: recibe los mismos datos que renderFretboard, pero en vez de
 * redibujar el SVG entero anima el cambio. Las notas que aparecen se funden,
 * las que cambian de color o función se transforman y, con `morph`, las notas
 * de cada cuerda se deslizan a su nuevo traste (cambiar de tónica, de modo o
 * de acorde se ve como un movimiento). Un aro sigue a la nota que suena.
 */

import { COLORS, createAnimBoard } from './animboard.js';
import { ROLE_COLORS } from './fretboard.js';
import { autoFingers, labelFor } from './labels.js';

const SELECT = '#df812f';
const GHOST = '#cfc6b2';

/** Traduce una nota de renderFretboard al estilo de un punto animado. */
export function dotStyle(n) {
  const kind = n.kind ?? 'note';
  let fill = '#12120f';
  let stroke = '#6a6558';
  let strokeWidth = 1.4;
  let text = '#fff';
  let alpha = n.dim ? 0.28 : 1;
  if (kind === 'ghost') {
    fill = '#fffdf8'; stroke = GHOST; text = '#a59d8a'; alpha = n.dim ? 0.45 : 0.9;
  } else if (kind === 'hidden') {
    fill = '#fffdf8'; stroke = SELECT; strokeWidth = 2.4; text = SELECT;
  } else if (kind === 'select') {
    fill = SELECT; stroke = '#8a4a10'; strokeWidth = 2;
  }
  if (n.role === 'root') { stroke = ROLE_COLORS.root; strokeWidth = 3.2; } else if (n.role && ROLE_COLORS[n.role] && kind !== 'ghost') { stroke = ROLE_COLORS[n.role]; strokeWidth = 2.6; }
  if (n.alpha != null) alpha = n.alpha;
  const zoned = Array.isArray(n.colors) && n.colors.length > 0;
  if (zoned) { fill = n.colors[0]; stroke = n.ring ?? '#fffdf8'; strokeWidth = n.ring ? 3 : 1.2; }
  return {
    s: n.s, f: n.f, label: n.label ?? '', fill, stroke, strokeWidth, text, alpha,
    colors: zoned && n.colors.length > 1 ? n.colors : null,
    halo: n.role === 'root' ? ROLE_COLORS.root : null,
  };
}

/**
 * Claves para que las notas se deslicen: por cuerda y orden en la cuerda
 * (la 2.ª nota de la 3.ª cuerda sigue siendo «la 2.ª» aunque cambie de traste).
 */
export function morphKeys(notes) {
  const rank = new Map();
  return [...notes]
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.s - b.n.s || a.n.f - b.n.f)
    .map(({ n, i }) => {
      const group = `${n.kind ?? 'note'}:${n.s}`;
      const k = rank.get(group) ?? 0;
      rank.set(group, k + 1);
      return { i, key: `${group}#${k}` };
    })
    .sort((a, b) => a.i - b.i)
    .map((x) => x.key);
}

export function createLiveBoard(container, { morph = true } = {}) {
  let board = null;
  let sig = '';
  let cursorOn = new Map();

  const api = {
    get board() { return board; },
    /** Igual que renderFretboard(o), pero animado. Devuelve el tablero. */
    render(o) {
      const { notes = [], title, labels: _labels, ...geo } = o;
      const key = JSON.stringify([geo.tuning, geo.from ?? 0, geo.to ?? 15, !!geo.lefty, geo.stringNames !== false, geo.width ?? 1200, geo.gap ?? null]);
      if (!board || key !== sig || !container.contains(board.el)) {
        board = createAnimBoard({ ...geo, title: title ?? 'Mástil de guitarra' });
        container.replaceChildren(board.el);
        sig = key;
        cursorOn = new Map();
      }
      board.setTitle(title);
      let visible = notes.filter((n) => n.s >= 0 && n.s < geo.tuning.length);
      // Etiqueta común (R 3 5, grado, nota, dedo o nada): o.labels = { mode, tonicPc, chord, fingers }.
      if (o.labels?.mode) {
        const L = o.labels;
        const active = visible.filter((n) => (n.kind ?? 'note') !== 'ghost' && !n.dim);
        const fingers = L.mode === 'finger' ? (L.fingers ?? autoFingers(active)) : null;
        visible = visible.map((n) => ((n.kind ?? 'note') === 'ghost' ? n : { ...n, label: labelFor(n, L.mode, { tuning: geo.tuning, tonicPc: L.tonicPc, chord: L.chord, fingers }) }));
      }
      const keys = morph ? morphKeys(visible) : visible.map((n) => `${n.s}-${n.f}`);
      // Los fantasmas debajo, los seleccionados encima (como en el dibujo fijo).
      const order = { ghost: 0, note: 1, hidden: 1, select: 2 };
      const items = visible.map((n, i) => ({ ...dotStyle(n), key: n.key ?? keys[i], o: order[n.kind ?? 'note'] ?? 1 }));
      items.sort((a, b) => a.o - b.o);
      board.dots(items);
      return board;
    },
    /** Aro que marca la nota que suena (s = null lo quita todo). */
    cursor(s, f, on = true) {
      if (!board) return;
      if (s == null) cursorOn.clear();
      else if (on) cursorOn.set(`${s}-${f}`, { s, f });
      else cursorOn.delete(`${s}-${f}`);
      board.dots([...cursorOn.values()].map((p, j) => ({
        key: `cur-${j}`, s: p.s, f: p.f, label: '', fill: 'none', stroke: COLORS.accent, strokeWidth: 4, scale: 1.35, alpha: 0.95,
      })), 'fx');
    },
  };
  container.__live = api;
  container.classList.add('is-live');
  return api;
}
