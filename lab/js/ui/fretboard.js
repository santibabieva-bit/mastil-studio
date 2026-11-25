/**
 * Mástil SVG interactivo del Lab. Usa atributos de presentación (sin CSS
 * externo) para que el SVG exportado se vea igual fuera de la página.
 * Índices de cuerda: 0 = aguda (arriba).
 */

import { midiName } from '../core/music.js';

const COLORS = {
  board: '#faf7f0',
  boardEdge: '#d9cfbc',
  fret: '#b9ad95',
  nut: '#2b2a26',
  string: '#6c6657',
  inlay: '#e4d9c3',
  note: '#12120f',
  root: '#d84a3e',
  third: '#3f8f5a',
  fifth: '#df812f',
  seventh: '#3b73c9',
  ghost: '#cfc6b2',
  select: '#df812f',
  text: '#2b2a26',
};

const SINGLE_INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);

const STRING_LETTERS_STANDARD = ['e', 'B', 'G', 'D', 'A', 'E', 'B', 'F'];

function wirePos(n) {
  return 1 - 2 ** (-n / 12);
}

export const ROLE_COLORS = { root: COLORS.root, third: COLORS.third, fifth: COLORS.fifth, seventh: COLORS.seventh };

/** Círculo repartido en sectores iguales, uno por color. */
function pie(cx, cy, r, colors) {
  const n = colors.length;
  return colors.map((color, i) => {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n;
    const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z" fill="${color}"/>`;
  }).join('');
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * @param {object} o
 * @param {number[]} o.tuning MIDI por cuerda (0 = aguda)
 * @param {number} [o.from] primer traste visible
 * @param {number} [o.to] último traste visible
 * @param {Array} [o.notes] [{ s, f, label, role, kind: 'note'|'ghost'|'hidden'|'select', dim }]
 * @param {boolean} [o.lefty]
 * @param {boolean} [o.stringNames] mostrar nombres de cuerda a la izquierda
 * @param {string} [o.title] título accesible
 */
/**
 * Geometría del mástil (la misma que usa renderFretboard), para dibujar capas
 * encima: centro de cada traste, altura de cada cuerda, radio de las notas…
 */
export function boardGeometry(o) {
  const {
    tuning, from = 0, to = 15, lefty = false, stringNames = true, width = 1200, gap: gapOverride,
  } = o;
  const strings = tuning.length;
  const gap = gapOverride ?? (strings > 6 ? 30 : 34);
  const showOpen = from === 0;
  const gutter = showOpen ? 44 : 0;
  const leftMargin = (stringNames ? 34 : 14) + gutter;
  const rightMargin = 16;
  const top = 26;
  const pad = 18;
  const boardH = (strings - 1) * gap + pad * 2;
  const boardW = width - leftMargin - rightMargin;
  const height = top + boardH + 34;
  const lo = from > 0 ? from - 1 : 0;
  const span = wirePos(to) - wirePos(lo);
  const xWire = (n) => leftMargin + (boardW * (wirePos(n) - wirePos(lo))) / span;
  const mirror = (x) => (lefty ? width - x : x);
  const xCenter = (f) => (f === 0 ? leftMargin - gutter / 2 : (xWire(f - 1) + xWire(f)) / 2);
  const yString = (s) => top + pad + s * gap;
  let minFretW = Infinity;
  for (let f = Math.max(1, from); f <= to; f += 1) minFretW = Math.min(minFretW, xWire(f) - xWire(f - 1));
  const radius = Math.max(7, Math.min(14, gap * 0.4, minFretW * 0.46));
  return {
    strings, gap, showOpen, gutter, leftMargin, boardW, boardH, top, pad, width, height, lo, from, to,
    xWire, mirror, xCenter, yString, radius,
    /** Centro (x, y) de la nota en (s, f), ya reflejado si es zurdo. */
    at: (s, f) => ({ x: mirror(xCenter(f)), y: yString(s) }),
  };
}

export function renderFretboard(o) {
  const {
    tuning, notes = [], lefty = false, stringNames = true,
    title = 'Mástil de guitarra', background = true,
  } = o;
  const g = boardGeometry(o);
  const {
    strings, gap, showOpen, gutter, leftMargin, top, boardH, boardW, width, height, lo, from, to,
    xWire, mirror, xCenter, yString, radius,
  } = g;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}" font-family="Segoe UI, system-ui, Arial, sans-serif">`);
  if (background) parts.push(`<rect width="${width}" height="${height}" fill="#fffdf8" rx="14"/>`);
  parts.push(`<rect x="${lefty ? width - leftMargin - boardW : leftMargin}" y="${top}" width="${boardW}" height="${boardH}" rx="5" fill="${COLORS.board}" stroke="${COLORS.boardEdge}" stroke-width="1.4"/>`);

  // Marcadores
  for (let f = Math.max(1, from); f <= to; f += 1) {
    const cx = mirror(xCenter(f));
    const mid = top + boardH / 2;
    if (SINGLE_INLAYS.has(f)) {
      parts.push(`<circle cx="${cx}" cy="${mid}" r="${Math.min(10, gap * 0.3)}" fill="${COLORS.inlay}" opacity=".7"/>`);
    } else if (DOUBLE_INLAYS.has(f)) {
      const dy = gap * (strings > 4 ? 1.1 : 0.7);
      parts.push(`<circle cx="${cx}" cy="${mid - dy}" r="${Math.min(10, gap * 0.3)}" fill="${COLORS.inlay}" opacity=".7"/>`);
      parts.push(`<circle cx="${cx}" cy="${mid + dy}" r="${Math.min(10, gap * 0.3)}" fill="${COLORS.inlay}" opacity=".7"/>`);
    }
  }

  // Trastes (alambres) y cejilla
  for (let n = lo; n <= to; n += 1) {
    if (n === 0 && showOpen) continue;
    const x = mirror(xWire(n));
    parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + boardH}" stroke="${COLORS.fret}" stroke-width="${n === lo && from > 0 ? 1.2 : 2}"/>`);
  }
  if (showOpen) {
    const x = mirror(xWire(0));
    parts.push(`<line x1="${x}" y1="${top - 1}" x2="${x}" y2="${top + boardH + 1}" stroke="${COLORS.nut}" stroke-width="7" stroke-linecap="butt"/>`);
  }

  // Números de traste
  for (let f = Math.max(1, from); f <= to; f += 1) {
    if (SINGLE_INLAYS.has(f) || DOUBLE_INLAYS.has(f) || f === 1 || f === from) {
      parts.push(`<text x="${mirror(xCenter(f))}" y="${top + boardH + 22}" text-anchor="middle" font-size="13" fill="#8a8272" font-weight="600">${f}</text>`);
    }
  }

  // Cuerdas
  for (let s = 0; s < strings; s += 1) {
    const y = yString(s);
    const thickness = 1 + (s / Math.max(1, strings - 1)) * 2.8;
    const x1 = mirror(showOpen ? xWire(0) : leftMargin);
    const x2 = mirror(leftMargin + boardW);
    parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${COLORS.string}" stroke-width="${thickness.toFixed(2)}" stroke-linecap="round"/>`);
    if (stringNames) {
      const letter = strings === 6 ? STRING_LETTERS_STANDARD[s] : midiName(tuning[s]).replace(/\d+$/, '');
      const lx = lefty ? width - 12 : 14;
      parts.push(`<text x="${lx}" y="${y + 4.5}" text-anchor="middle" font-size="13" fill="#8a8272" font-weight="700">${esc(letter)}</text>`);
    }
  }

  // Zonas de clic
  const hits = [];
  for (let s = 0; s < strings; s += 1) {
    for (let f = from; f <= to; f += 1) {
      const w = f === 0 ? gutter : xWire(f) - xWire(f - 1);
      const x = f === 0 ? leftMargin - gutter : xWire(f - 1);
      hits.push(`<rect data-hit="1" data-s="${s}" data-f="${f}" x="${mirror(lefty ? x + w : x)}" y="${yString(s) - gap / 2}" width="${w}" height="${gap}" fill="transparent" style="cursor:pointer"><title>Cuerda ${s + 1}, traste ${f}</title></rect>`);
    }
  }
  parts.push(`<g>${hits.join('')}</g>`);

  // Notas
  const noteParts = [];
  const order = { ghost: 0, note: 1, hidden: 1, select: 2 };
  const sorted = [...notes].sort((a, b) => (order[a.kind ?? 'note'] ?? 1) - (order[b.kind ?? 'note'] ?? 1));
  for (const n of sorted) {
    if (n.f < from || n.f > to || n.s < 0 || n.s >= strings) continue;
    const cx = mirror(xCenter(n.f));
    const cy = yString(n.s);
    const kind = n.kind ?? 'note';
    const label = n.label == null ? '' : String(n.label);
    let fill = COLORS.note;
    let stroke = '#6a6558';
    let sw = 1.4;
    let textFill = '#fff';
    let opacity = n.dim ? 0.28 : 1;
    if (kind === 'ghost') {
      fill = '#fffdf8';
      stroke = COLORS.ghost;
      textFill = '#a59d8a';
      opacity = n.dim ? 0.45 : 0.9;
    } else if (kind === 'hidden') {
      fill = '#fffdf8';
      stroke = COLORS.select;
      sw = 2.4;
      textFill = COLORS.select;
    } else if (kind === 'select') {
      fill = COLORS.select;
      stroke = '#8a4a10';
      sw = 2;
    }
    if (n.role === 'root') {
      stroke = COLORS.root;
      sw = 3.2;
    } else if (n.role && ROLE_COLORS[n.role] && kind !== 'ghost') {
      stroke = ROLE_COLORS[n.role];
      sw = 2.6;
    }
    if (n.alpha != null) opacity = n.alpha;
    const size = label.length >= 3 ? radius * 0.62 : label.length === 2 ? radius * 0.82 : radius * 0.95;
    // `colors`: relleno por zonas (un sector por color); `ring`: aro de énfasis
    const zoned = Array.isArray(n.colors) && n.colors.length > 0;
    if (zoned) { fill = n.colors[0]; stroke = n.ring ?? '#fffdf8'; sw = n.ring ? 3 : 1.2; }
    const dot = zoned && n.colors.length > 1
      ? pie(cx, cy, radius, n.colors) + `<circle class="note-dot" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`
      : `<circle class="note-dot" cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    noteParts.push(
      `<g data-pos="${n.s}-${n.f}" opacity="${opacity}" pointer-events="none">`
      + (n.role === 'root' ? `<circle cx="${cx}" cy="${cy}" r="${radius + 3.4}" fill="none" stroke="${COLORS.root}" stroke-opacity=".25" stroke-width="2"/>` : '')
      + dot
      + (label ? `<text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle" font-size="${size.toFixed(1)}" font-weight="700" fill="${textFill}">${esc(label)}</text>` : '')
      + '</g>',
    );
  }
  parts.push(`<g>${noteParts.join('')}</g>`);
  parts.push('</svg>');
  return parts.filter(Boolean).join('');
}

/** Devuelve la posición (s, f) bajo un evento, o null. */
export function hitFromEvent(event) {
  const target = event.target.closest?.('[data-hit]');
  if (!target) return null;
  return { s: Number(target.dataset.s), f: Number(target.dataset.f) };
}

/** Resalta/Desmarca una nota mientras suena. */
export function flashNote(container, s, f, ms = 260) {
  const g = container.querySelector(`[data-pos="${s}-${f}"] .note-dot`);
  if (!g) return;
  g.classList.add('is-playing');
  setTimeout(() => g.classList.remove('is-playing'), ms);
}

export function setPlaying(container, s, f, on) {
  const g = container.querySelector(`[data-pos="${s}-${f}"] .note-dot`);
  if (g) g.classList.toggle('is-playing', on);
}

export function clearPlaying(container) {
  container.querySelectorAll('.is-playing').forEach((el) => el.classList.remove('is-playing'));
}
