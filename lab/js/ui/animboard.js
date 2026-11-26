/**
 * Diapasón animado: el SVG del mástil con capas encima (zonas, mano, estela,
 * flechas, notas, dedos, efectos). Las notas tienen clave: si una nota cambia
 * de sitio se desliza, si aparece o se va, se desvanece. Incluye un
 * reproductor que sincroniza la animación con el audio.
 */

import { boardGeometry, hitFromEvent, renderFretboard } from './fretboard.js';
import { midiName, prettyNote } from '../core/music.js';
import {
  crossingType, fingerLayout, handPositions, stepTimes,
} from '../core/motion.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
export const COLORS = {
  root: '#d84a3e', third: '#3f8f5a', fifth: '#df812f', seventh: '#3b73c9', tension: '#8a4fb0', avoid: '#c2412f',
  note: '#2b2a26', accent: '#df812f', ghost: '#cfc6b2', ok: '#2f8a57', bad: '#c2412f', hand: '#3b73c9', finger: '#8a4fb0',
};
const LAYERS = ['zones', 'hand', 'preview', 'trail', 'arrows', 'notes', 'fingers', 'fx'];

const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  return node;
}

export const noteName = (midi) => prettyNote(midiName(midi)).replace(/-?\d+$/, '');

/**
 * @param {object} o { tuning, from, to, title }
 * @returns board API
 */
export function createAnimBoard({ tuning, from = 0, to = 12, title = 'Mástil animado', ...rest }) {
  // rest: lefty, stringNames, width… (los mismos que renderFretboard).
  const geo = boardGeometry({ tuning, from, to, ...rest });
  const wrap = h('div', { class: 'fb-wrap anim-board' });
  wrap.innerHTML = renderFretboard({ tuning, from, to, notes: [], title, ...rest });
  const svg = wrap.querySelector('svg');
  const layer = {};
  for (const name of LAYERS) {
    layer[name] = el('g', { 'data-layer': name, 'pointer-events': 'none' });
    svg.append(layer[name]);
  }
  const keyed = Object.fromEntries(LAYERS.map((n) => [n, new Map()]));
  const r = geo.radius;
  const pos = (s, f) => geo.at(s, Math.max(geo.from, Math.min(geo.to, f)));
  const visible = (f) => f >= geo.from && f <= geo.to;

  function place(node, x, y) {
    node.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Crea o actualiza un punto. item = { key, s, f, label, fill, stroke, text, alpha, scale, dashed } */
  function upsertDot(layerName, item) {
    const map = keyed[layerName];
    const key = item.key ?? `${item.s}-${item.f}`;
    let g = map.get(key);
    const { x, y } = pos(item.s, item.f);
    const rad = r * (item.scale ?? 1);
    if (!g) {
      g = el('g', { class: item.instant ? 'ab-dot' : 'ab-dot is-entering' });
      g.append(el('circle', { r: rad, class: 'ab-halo', fill: 'none' }), el('g', { class: 'ab-pie' }), el('circle', { r: rad, class: 'note-dot' }), el('text', { 'text-anchor': 'middle', 'font-weight': '700' }));
      place(g, x, y);
      layer[layerName].append(g);
      map.set(key, g);
      if (!item.instant) requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('is-entering')));
    } else {
      g.classList.remove('is-leaving');
      place(g, x, y);
    }
    const [halo, pieG, circle, text] = g.children;
    circle.setAttribute('r', rad);
    // Varios colores (zonas CAGED solapadas): un sector por color bajo el aro.
    const pieColors = Array.isArray(item.colors) && item.colors.length > 1 ? item.colors : null;
    pieG.replaceChildren(...(pieColors ? pieColors.map((color, i, arr) => {
      const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / arr.length;
      const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / arr.length;
      const pt = (a) => `${(rad * Math.cos(a)).toFixed(2)} ${(rad * Math.sin(a)).toFixed(2)}`;
      return el('path', { d: `M0 0 L${pt(a0)} A${rad} ${rad} 0 0 1 ${pt(a1)} Z`, fill: color });
    }) : []));
    if (item.halo) {
      halo.setAttribute('r', rad + 3.4);
      halo.setAttribute('stroke', item.halo);
      halo.setAttribute('stroke-opacity', '.25');
      halo.setAttribute('stroke-width', 2);
    } else halo.setAttribute('stroke', 'none');
    circle.setAttribute('fill', pieColors ? 'none' : (item.fill ?? COLORS.note));
    circle.setAttribute('stroke', item.stroke ?? '#fffdf8');
    circle.setAttribute('stroke-width', item.strokeWidth ?? 2);
    circle.setAttribute('stroke-dasharray', item.dashed ? '4 3' : 'none');
    const label = item.label == null ? '' : String(item.label);
    const size = label.length >= 3 ? rad * 0.62 : label.length === 2 ? rad * 0.82 : rad * 0.95;
    text.textContent = label;
    text.setAttribute('font-size', size.toFixed(1));
    text.setAttribute('y', (size * 0.36).toFixed(1));
    text.setAttribute('fill', item.text ?? '#fff');
    g.style.opacity = String(item.alpha ?? 1);
    g.dataset.s = item.s;
    g.dataset.f = item.f;
    g.dataset.pos = `${item.s}-${item.f}`;
    return g;
  }

  function removeKey(layerName, key) {
    const g = keyed[layerName].get(key);
    if (!g) return;
    keyed[layerName].delete(key);
    g.classList.add('is-leaving');
    setTimeout(() => g.remove(), reduceMotion() ? 0 : 320);
  }

  const api = {
    el: wrap,
    svg,
    geo,
    tuning,

    /** Sustituye los puntos de una capa (con transición por clave). */
    dots(list, layerName = 'notes') {
      const keep = new Set();
      for (const item of list) {
        if (!visible(item.f)) continue;
        const key = item.key ?? `${item.s}-${item.f}`;
        keep.add(key);
        upsertDot(layerName, { ...item, key });
      }
      for (const key of [...keyed[layerName].keys()]) if (!keep.has(key)) removeKey(layerName, key);
    },

    clear(layerName = null) {
      for (const name of layerName ? [layerName] : LAYERS) {
        keyed[name].clear();
        layer[name].replaceChildren();
      }
    },

    /** Onda expansiva en una nota (acierto, fallo, golpe de púa…). */
    pulse(s, f, color = COLORS.accent) {
      if (!visible(f)) return;
      const { x, y } = pos(s, f);
      const c = el('circle', { class: 'ab-pulse', r: r * 1.1, fill: 'none', stroke: color, 'stroke-width': 3 });
      place(c, x, y);
      layer.fx.append(c);
      setTimeout(() => c.remove(), 750);
    },

    /** Flecha curva animada de a a b. */
    arrow(a, b, { color = COLORS.accent, key = null, width = 2.6, bend = 0.25, dashed = false, label = null } = {}) {
      if (!visible(a.f) || !visible(b.f)) return null;
      const p = pos(a.s, a.f);
      const q = pos(b.s, b.f);
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      // Punto de control desplazado perpendicularmente: arco suave.
      const cx = mx - (dy / len) * len * bend;
      const cy = my + (dx / len) * len * bend - (Math.abs(dy) < 2 ? 18 : 0);
      // Recorta para no tapar las notas.
      const shrink = (r * 1.05) / len;
      const sx = p.x + dx * shrink;
      const sy = p.y + dy * shrink;
      const ex = q.x - dx * shrink;
      const ey = q.y - dy * shrink;
      const g = el('g', { class: 'ab-arrow' });
      const path = el('path', { d: `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' });
      if (dashed) path.setAttribute('stroke-dasharray', '6 5');
      // Punta de flecha según la tangente final.
      const ang = Math.atan2(ey - cy, ex - cx);
      const ah = 9;
      const head = el('path', {
        d: `M${ex.toFixed(1)} ${ey.toFixed(1)} L${(ex - ah * Math.cos(ang - 0.45)).toFixed(1)} ${(ey - ah * Math.sin(ang - 0.45)).toFixed(1)} L${(ex - ah * Math.cos(ang + 0.45)).toFixed(1)} ${(ey - ah * Math.sin(ang + 0.45)).toFixed(1)} Z`,
        fill: color,
      });
      g.append(path, head);
      if (label) {
        const t = el('text', { x: cx.toFixed(1), y: (cy - 4).toFixed(1), 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: color });
        t.textContent = label;
        g.append(t);
      }
      if (key) { keyed.arrows.get(key)?.remove(); keyed.arrows.set(key, g); }
      layer.arrows.append(g);
      if (!dashed && !reduceMotion()) {
        const L = path.getTotalLength?.() ?? 200;
        path.style.strokeDasharray = `${L}`;
        path.style.strokeDashoffset = `${L}`;
        head.style.opacity = '0';
        requestAnimationFrame(() => {
          path.style.transition = 'stroke-dashoffset .35s ease-out';
          path.style.strokeDashoffset = '0';
          head.style.transition = 'opacity .15s .3s';
          head.style.opacity = '1';
        });
      }
      return g;
    },

    clearArrows() { keyed.arrows.clear(); layer.arrows.replaceChildren(); },

    setTitle(text) { if (text) svg.setAttribute('aria-label', text); },

    /** Recuadro de la mano sobre los trastes win.from … win.to (null lo oculta). */
    hand(win, { label = null } = {}) {
      let rect = layer.hand.querySelector('rect');
      let text = layer.hand.querySelector('text');
      if (!win) { layer.hand.style.opacity = '0'; return; }
      layer.hand.style.opacity = '1';
      if (!rect) {
        rect = el('rect', { class: 'ab-hand', rx: 10, fill: COLORS.hand, 'fill-opacity': 0.09, stroke: COLORS.hand, 'stroke-opacity': 0.55, 'stroke-width': 2, 'stroke-dasharray': '7 5' });
        text = el('text', { 'font-size': 12, 'font-weight': 700, fill: COLORS.hand });
        layer.hand.append(rect, text);
      }
      const lo = Math.max(geo.from, win.from);
      const hi = Math.min(geo.to, win.to);
      const x0 = lo === 0 ? geo.leftMargin - geo.gutter : geo.xWire(lo - 1);
      const x1 = geo.xWire(hi);
      rect.style.transform = `translate(${x0 + 2}px, ${geo.top - 8}px)`;
      rect.setAttribute('width', Math.max(10, x1 - x0 - 4));
      rect.style.width = `${Math.max(10, x1 - x0 - 4)}px`;
      rect.setAttribute('height', geo.boardH + 16);
      text.textContent = label ?? `Trastes ${win.from}–${win.to}`;
      text.style.transform = `translate(${x0 + 6}px, ${geo.top - 12}px)`;
    },

    /** Mano fantasma: cuatro dedos, el que pisa marcado y los demás preparados. */
    fingers(layout) {
      if (!layout) { api.clear('fingers'); return; }
      api.dots(layout.filter((d) => visible(d.f) && d.f > 0).map((d) => ({
        key: `finger-${d.finger}`,
        s: d.s,
        f: d.f,
        label: d.finger,
        scale: d.down ? 0.62 : 0.5,
        fill: d.down ? COLORS.finger : '#fffdf8',
        stroke: COLORS.finger,
        text: d.down ? '#fff' : COLORS.finger,
        alpha: d.down ? 0.95 : 0.55,
        dashed: !d.down,
        offset: true,
      })), 'fingers');
      // Los dedos se dibujan algo por debajo de la nota (como la yema que apoya).
      for (const g of layer.fingers.children) {
        const s = Number(g.dataset.s);
        const f = Number(g.dataset.f);
        const { x, y } = pos(s, f);
        place(g, x - r * 0.95, y + r * 0.75);
      }
    },

    /** Zonas de color (CAGED, ventanas): [{ key, from, to, color, label }] */
    zones(list) {
      layer.zones.replaceChildren();
      for (const z of list) {
        const lo = Math.max(geo.from, z.from);
        const hi = Math.min(geo.to, z.to);
        if (lo > hi) continue;
        const x0 = lo === 0 ? geo.leftMargin - geo.gutter : geo.xWire(lo - 1);
        const x1 = geo.xWire(hi);
        const rect = el('rect', { class: 'ab-zone', x: x0, y: geo.top, width: x1 - x0, height: geo.boardH, fill: z.color, 'fill-opacity': z.alpha ?? 0.12, rx: 4 });
        layer.zones.append(rect);
        if (z.label) {
          const t = el('text', { x: (x0 + x1) / 2, y: geo.top - 8, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: z.color });
          t.textContent = z.label;
          layer.zones.append(t);
        }
      }
    },

    /**
     * Dibuja un bend: la cuerda s se curva en el traste f `semis` semitonos
     * (aprox. visual) y, si se da, la nota objetivo aparece como fantasma.
     */
    bend(s, f, semis, { target = null, color = COLORS.accent, label = null } = {}) {
      let g = layer.fx.querySelector('[data-bend]');
      if (!g) {
        g = el('g', { 'data-bend': '1' });
        g.append(el('path', { fill: 'none', 'stroke-width': 3.2, 'stroke-linecap': 'round' }), el('circle', { r: r * 1.6, fill: 'none', stroke: COLORS.ghost, 'stroke-width': 2.5, 'stroke-dasharray': '5 4' }), el('circle', { r }), el('text', { 'text-anchor': 'middle', 'font-weight': 700, fill: '#fff', 'font-size': r * 0.8 }));
        layer.fx.append(g);
      }
      const [path, ghost, dot, text] = g.children;
      const { x, y } = pos(s, f);
      // Empujar la cuerda «hacia arriba» en la guitarra = hacia las cuerdas graves (abajo en el dibujo).
      const dir = s >= geo.strings - 2 ? -1 : 1;
      const off = (v) => dir * Math.min(geo.gap * 1.6, v * geo.gap * 0.55);
      const xa = geo.xWire(Math.max(geo.lo, f - 3));
      const xb = geo.xWire(Math.min(geo.to, f + 3));
      const by = y + off(semis);
      path.setAttribute('d', `M${xa} ${y} Q${x} ${(y + 2 * (by - y)).toFixed(1)} ${xb} ${y}`);
      path.setAttribute('stroke', color);
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', by);
      dot.setAttribute('fill', color);
      text.setAttribute('x', x);
      text.setAttribute('y', by + r * 0.3);
      text.textContent = label ?? '';
      if (target != null) {
        ghost.style.display = '';
        ghost.setAttribute('cx', x);
        ghost.setAttribute('cy', y + off(target));
        ghost.setAttribute('r', r * 1.15);
      } else ghost.style.display = 'none';
    },

    clearBend() { layer.fx.querySelector('[data-bend]')?.remove(); },

    onClick(cb) {
      wrap.addEventListener('click', (e) => { const hit = hitFromEvent(e); if (hit) cb(hit, e); });
    },

    /** Arrastre sobre el mástil: start(hit), move(hit) al pasar a otra casilla, end(). */
    onDrag({ start, move, end }) {
      let dragging = false;
      let last = null;
      const hitAt = (e) => {
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-hit]');
        return t ? { s: Number(t.dataset.s), f: Number(t.dataset.f) } : null;
      };
      wrap.addEventListener('pointerdown', (e) => {
        const hit = hitAt(e);
        if (!hit) return;
        dragging = true;
        last = hit;
        wrap.setPointerCapture?.(e.pointerId);
        start?.(hit, e);
        e.preventDefault();
      });
      wrap.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const hit = hitAt(e);
        if (hit && (hit.s !== last.s || hit.f !== last.f)) { last = hit; move?.(hit, e); }
      });
      const stop = () => { if (dragging) { dragging = false; end?.(); } };
      wrap.addEventListener('pointerup', stop);
      wrap.addEventListener('pointercancel', stop);
    },
  };
  return api;
}

/* ───────────── púa en cámara lenta ───────────── */

/** Vista de la mano derecha: la púa atraviesa la cuerda hacia abajo o hacia arriba. */
export function createPickView() {
  const box = h('div', { class: 'pick-view', 'aria-live': 'polite' });
  box.innerHTML = `<svg viewBox="0 0 200 90" width="200" height="90" aria-hidden="true">
    <line x1="10" x2="190" y1="34" y2="34" stroke="#6c6657" stroke-width="2"/>
    <line x1="10" x2="190" y1="58" y2="58" stroke="#6c6657" stroke-width="2.6"/>
    <g class="pick"><path d="M100 22 L112 46 L88 46 Z" transform="translate(0,-12)" fill="#df812f" stroke="#8a4a10" stroke-width="1.5"/></g>
  </svg>`;
  const text = h('div', { class: 'pick-text' }, '');
  box.append(text);
  const pick = box.querySelector('.pick');
  return {
    el: box,
    show(dir, crossing = null) {
      pick.classList.remove('pick-down', 'pick-up');
      void pick.getBoundingClientRect();
      if (dir) pick.classList.add(dir === 'D' ? 'pick-down' : 'pick-up');
      text.textContent = dir
        ? `${dir === 'D' ? '↓ Hacia abajo' : '↑ Hacia arriba'}${crossing ? ` · cruce ${crossing === 'inside' ? 'por dentro (la púa queda entre las cuerdas)' : 'por fuera (salta por encima de la cuerda)'}` : ''}`
        : crossing === 'legato' ? 'Ligado: sin púa' : '';
    },
  };
}

/* ───────────── reproductor ───────────── */

/**
 * Reproduce pasos en el diapasón con audio.
 * opts: { next, trail, hand, fingers, arrows, pickView, preview, mask, labels: 'name'|'finger'|'degree'|fn, colorOf }
 */
export function createPlayer(board, engine, { onStep = null, onEnd = null } = {}) {
  let steps = [];
  let opts = {};
  let hands = [];
  let times = [];
  let timer = 0;
  let playing = false;
  let cursor = 0;
  let nextTime = 0;
  let bpm = 80;
  let loop = false;
  let current = -1;

  const labelOf = (n, i) => {
    const l = opts.labels ?? 'name';
    if (typeof l === 'function') return l(n, i);
    if (l === 'finger') return n.finger ?? (n.f === 0 ? '0' : '');
    if (l === 'none') return '';
    return noteName(n.midi ?? board.tuning[n.s] + n.f);
  };

  function render(i) {
    current = i;
    const st = steps[i];
    if (!st) return;
    const masked = (k) => opts.mask && opts.mask[k] === false;
    const items = [];
    // Estela: las últimas notas se apagan poco a poco.
    if (opts.trail) {
      for (let k = Math.max(0, i - (opts.trail === true ? 6 : opts.trail)); k < i; k += 1) {
        if (masked(k)) continue;
        const age = i - k;
        for (const n of steps[k].notes) items.push({ key: `t-${n.s}-${n.f}`, s: n.s, f: n.f, label: labelOf(n, k), fill: '#8a8272', alpha: Math.max(0.15, 0.7 - age * 0.1), scale: 0.85 });
      }
    }
    const here = new Set(st.notes.map((n) => `${n.s}-${n.f}`));
    if (opts.next && steps[i + 1] && !masked(i + 1)) {
      for (const n of steps[i + 1].notes) {
        // Con claves por voz, la forma siguiente no tapa las notas que siguen sonando.
        if (opts.keyOf && here.has(`${n.s}-${n.f}`)) continue;
        items.push({ key: `${opts.keyOf ? 'n' : 't'}-${n.s}-${n.f}`, s: n.s, f: n.f, label: labelOf(n, i + 1), fill: '#fffdf8', stroke: COLORS.accent, text: COLORS.accent, dashed: true, alpha: opts.keyOf ? 0.6 : 0.95 });
      }
    }
    if (!masked(i)) {
      st.notes.forEach((n, j) => {
        const color = opts.colorOf?.(n, i) ?? COLORS.accent;
        // keyOf: la misma voz conserva su punto y se desliza de un acorde al siguiente.
        const key = opts.keyOf?.(n, j, i) ?? `t-${n.s}-${n.f}`;
        items.push({ key, s: n.s, f: n.f, label: labelOf(n, i), fill: color, stroke: '#fffdf8', strokeWidth: 3, scale: 1.12, instant: !opts.keyOf });
      });
    }
    // Una misma posición puede salir en varias capas: gana la última (nota actual).
    const byKey = new Map(items.map((it) => [it.key, it]));
    board.dots([...byKey.values()]);
    if (!masked(i)) for (const n of st.notes.filter((x) => !x.held)) board.pulse(n.s, n.f, opts.colorOf?.(n, i) ?? COLORS.accent);
    if (opts.hand) board.hand(hands[i], { label: hands[i].shift ? `↔ Cambio de posición: trastes ${hands[i].from}–${hands[i].to}` : null });
    else board.hand(null);
    if (opts.fingers && st.notes.length) board.fingers(fingerLayout(st, hands[i]));
    else board.fingers(null);
    if (opts.arrows) {
      board.clearArrows();
      const prev = steps[i - 1]?.notes[0];
      const cur = st.notes[0];
      if (prev && cur && !masked(i) && (prev.s !== cur.s || Math.abs(prev.f - cur.f) > 2 || cur.art)) {
        const art = cur.art === 'H' ? 'h' : cur.art === 'P' ? 'p' : cur.art === 'S' ? 'slide' : null;
        board.arrow(prev, cur, { label: art, color: hands[i]?.shift ? COLORS.hand : COLORS.accent });
      }
    }
    if (opts.preview) {
      // «Película»: la forma del compás siguiente aparece un compás antes.
      const bar = Math.floor(times[i] / 4);
      const nextBar = steps.map((s, k) => ({ s, k })).filter(({ k }) => Math.floor(times[k] / 4) === bar + 1);
      board.dots(nextBar.flatMap(({ s }) => s.notes.map((n) => ({ key: `p-${n.s}-${n.f}`, s: n.s, f: n.f, label: '', fill: COLORS.seventh, alpha: 0.28, scale: 0.7 }))), 'preview');
    } else board.clear('preview');
    if (opts.pickView) {
      const n = st.notes[0];
      if (n) opts.pickView.show(n.pick ?? null, n.pick ? crossingType(steps[i - 1]?.notes[0], n) : (n.art === 'H' || n.art === 'P' ? 'legato' : null));
    }
    onStep?.(i, st);
  }

  function schedule() {
    if (!playing) return;
    const spb = 60 / bpm;
    while (nextTime < engine.time + 0.15) {
      const i = cursor;
      const st = steps[i];
      const t = nextTime;
      if (st.strum && !opts.mute) engine.strum(st.strum, t, { dur: (st.d ?? 1) * spb * 0.95, vel: 0.55 });
      if (st.pad && !opts.mute) engine.pad(st.pad, t, (st.padBeats ?? st.d ?? 1) * spb, 0.3);
      if (st.bass != null && !opts.mute) engine.bass(st.bass, t, (st.d ?? 1) * spb * 0.9, 0.7);
      const sounding = st.silent || opts.mute ? [] : st.notes.filter((n) => !n.held);
      // arp: las notas del acorde se reparten dentro del paso (de grave a aguda).
      const gap = st.arp && sounding.length > 1 ? ((st.d ?? 1) * spb) / sounding.length : 0;
      sounding.forEach((n, k) => {
        const midi = n.midi ?? board.tuning[n.s] + n.f;
        engine.pluck(midi, t + k * gap, { dur: Math.max(0.25, (st.d ?? 1) * spb * 1.3 - k * gap), vel: n.art === 'H' || n.art === 'P' ? 0.6 : (n.vel ?? 0.82), legato: n.art === 'H' || n.art === 'P' || n.art === 'S' });
      });
      if (opts.click) engine.click(t, { accent: Math.abs(times[i] % 4) < 1e-6, sound: 'click', vol: 0.45 });
      engine.at(t, () => render(i));
      nextTime += (st.d ?? 1) * spb;
      cursor += 1;
      if (cursor >= steps.length) {
        if (loop) cursor = 0;
        else {
          const end = nextTime;
          playing = false;
          clearInterval(timer);
          engine.at(end, () => { engine.notePlaying('anim', false); onEnd?.(); });
          return;
        }
      }
    }
  }

  return {
    load(list, o = {}) {
      steps = list;
      opts = o;
      hands = handPositions(steps);
      times = stepTimes(steps);
      current = -1;
      board.clear('notes');
      board.clear('preview');
      board.clearArrows();
      board.fingers(null);
      board.hand(null);
    },
    setOptions(o) { opts = { ...opts, ...o }; if (current >= 0) render(current); },
    get steps() { return steps; },
    get index() { return current; },
    get playing() { return playing; },
    async play({ tempo = 80, from = 0, repeat = false, countIn = 0 } = {}) {
      if (!steps.length) return;
      await engine.ensure();
      this.stop(false);
      bpm = tempo;
      loop = repeat;
      cursor = from;
      nextTime = engine.time + 0.1;
      for (let k = 0; k < countIn; k += 1) { engine.click(nextTime, { accent: k === 0, sound: 'wood', vol: 0.8 }); nextTime += 60 / bpm; }
      playing = true;
      engine.notePlaying('anim', true);
      schedule();
      timer = setInterval(schedule, 25);
    },
    setTempo(t) { bpm = t; },
    stop(clear = true) {
      playing = false;
      clearInterval(timer);
      engine.notePlaying?.('anim', false);
      if (clear) { /* deja la última imagen visible */ }
    },
    /** Muestra un paso sin sonido (o con sonido si `sound`). */
    async show(i, { sound = false } = {}) {
      if (!steps.length) return;
      const k = Math.max(0, Math.min(steps.length - 1, i));
      if (sound) {
        await engine.ensure();
        if (steps[k].strum) engine.strum(steps[k].strum, engine.time + 0.02, { dur: 1.2, vel: 0.55 });
        for (const n of (steps[k].silent ? [] : steps[k].notes.filter((x) => !x.held))) engine.pluck(n.midi ?? board.tuning[n.s] + n.f, engine.time + 0.02, { dur: 0.8 });
      }
      render(k);
    },
    render,
  };
}
