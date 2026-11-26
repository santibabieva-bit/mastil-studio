/**
 * Etiquetas comunes de los diagramas del diapasón: qué se escribe dentro del
 * círculo de cada nota. Las mismas cinco opciones en todas las herramientas:
 *   R 3 5          función en el acorde (solo si hay un acorde de referencia)
 *   Grado (escala) intervalo desde la tónica de la escala o tonalidad
 *   Notas          nombre de la nota
 *   Digitación     dedo de la mano izquierda (solo si hay una posición digitada)
 *   Nada
 * La elección se recuerda para todo el Lab.
 */

import { midiName, mod, prettyNote } from '../core/music.js';
import { fingerPosition, fingeringIssues } from '../core/fingers.js';
import { h, segmented } from './dom.js';

export const LABEL_MODES = [
  { value: 'role', label: 'R 3 5', title: 'Función de la nota en el acorde: tónica, 3.ª, 5.ª, 7.ª o tensión' },
  { value: 'degree', label: 'Grado (escala)', title: 'Grado de la nota en la escala o tonalidad' },
  { value: 'name', label: 'Notas', title: 'Nombre de la nota' },
  { value: 'finger', label: 'Digitación', title: 'Dedo de la mano izquierda (1 índice … 4 meñique, 0 al aire)' },
  { value: 'none', label: 'Nada', title: 'Solo los puntos' },
];
export const ALL_MODES = LABEL_MODES.map((m) => m.value);

const KEY = 'lab:board-labels';
const EVENT = 'lab:labels';

export function getLabelMode(fallback = 'name') {
  try { return localStorage.getItem(KEY) ?? fallback; } catch { return fallback; }
}

export function setLabelMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* sin almacenamiento */ }
  globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: mode }));
}

/** El modo guardado si esta herramienta lo admite; si no, el primero disponible. */
export function effectiveMode(available = ALL_MODES, fallback = null) {
  const m = getLabelMode();
  if (available.includes(m)) return m;
  if (fallback && available.includes(fallback)) return fallback;
  return available.includes('name') ? 'name' : available[0];
}

/** Avisa cuando otra herramienta (u otro selector) cambia la etiqueta. */
export function onLabelMode(cb, ctx = null) {
  const handler = (e) => cb(e.detail);
  globalThis.addEventListener?.(EVENT, handler);
  ctx?.onCleanup?.(() => globalThis.removeEventListener?.(EVENT, handler));
}

const DEGREES = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
const TENSIONS = { 1: '♭9', 2: '9', 3: '♯9', 5: '11', 6: '♯11', 8: '♭13', 9: '13' };
const CHORD_TONE = ['R', '3', '5', '7'];

/** Grado de una altura respecto a una tónica (1, ♭3, ♯4…). */
export const degreeOf = (midi, tonicPc) => DEGREES[mod(midi - tonicPc, 12)];

/**
 * Función en el acorde, por intervalo desde la fundamental: R, 3, 5, 7 para
 * las notas del acorde (la 3.ª menor o mayor es «3», la 5.ª disminuida o
 * aumentada del acorde es «5», la 7.ª menor o mayor es «7»), 2 y 4 en los sus,
 * 6 en los acordes de sexta y 9, 11, 13 (con alteraciones) para las tensiones.
 * chord: { rootPc, pcs? }
 */
export function roleOf(midi, chord) {
  const iv = mod(midi - chord.rootPc, 12);
  const has = new Set((chord.pcs ?? []).map((pc) => mod(pc - chord.rootPc, 12)));
  const inChord = has.has(iv);
  const third = has.has(3) || has.has(4);
  const fifth = has.has(7);
  const seventh = has.has(10) || has.has(11);
  if (iv === 0) return 'R';
  if (iv === 3 || iv === 4) return (inChord && iv === 3 && has.has(4)) ? '♯9' : '3';
  if (iv === 7) return '5';
  if (iv === 10 || iv === 11) return '7';
  if (iv === 6) return inChord && !fifth ? '5' : '♯11';
  if (iv === 8) return inChord && !fifth ? '5' : '♭13';
  if (iv === 9) return inChord && has.has(3) && has.has(6) && !seventh ? '7' : inChord && !seventh ? '6' : '13';
  if (iv === 2) return inChord && !third ? '2' : '9';
  if (iv === 5) return inChord && !third ? '4' : '11';
  if (iv === 1) return '♭9';
  return '·';
}

/**
 * Dedos de las notas visibles si forman una posición (como mucho cinco
 * trastes, o una escala de tres notas por cuerda). Devuelve Map «s-f» → dedo
 * o null si no tiene sentido digitar (mástil entero).
 */
export function autoFingers(notes, { grip = false } = {}) {
  const fretted = notes.filter((n) => n.f > 0);
  if (!fretted.length) return null;
  const plain = notes.map(({ s, f }) => ({ s, f }));
  if (grip) return fingerPosition(plain, { grip: true });
  const span = Math.max(...fretted.map((n) => n.f)) - Math.min(...fretted.map((n) => n.f));
  const perString = new Map();
  for (const n of fretted) perString.set(n.s, (perString.get(n.s) ?? 0) + 1);
  const counts = [...perString.values()];
  if (counts.some((c) => c > 3)) return null;
  // Una posición: cuatro o cinco trastes, o una escala de tres notas por cuerda de verdad.
  const nps = counts.filter((c) => c === 3).length >= 3 && span <= 7;
  if (span > 4 && !nps) return null;
  const map = fingerPosition(plain);
  const issues = fingeringIssues(plain.map((n) => ({ ...n, finger: map.get(`${n.s}-${n.f}`) })));
  return issues.length ? null : map;
}

/**
 * Texto dentro del círculo.
 * n: { s, f, midi?, finger?, name? }   c: { tuning, tonicPc?, chord?, fingers?: Map }
 */
export function labelFor(n, mode, c = {}) {
  const midi = n.midi ?? (c.tuning ? c.tuning[n.s] + n.f : null);
  if (mode === 'none' || midi == null) return '';
  if (mode === 'name') return n.name ?? prettyNote(midiName(midi)).replace(/-?\d+$/, '');
  if (mode === 'degree') return c.tonicPc == null ? '' : degreeOf(midi, c.tonicPc);
  if (mode === 'role') return c.chord ? roleOf(midi, c.chord) : '';
  if (mode === 'finger') {
    const f = n.finger ?? c.fingers?.get(`${n.s}-${n.f}`);
    return f == null ? '' : String(f);
  }
  return '';
}

/** Qué modos admite una herramienta según el contexto que tenga. */
export function availableModes({ chord = false, degree = true, finger = false } = {}) {
  return ALL_MODES.filter((m) => (m !== 'role' || chord) && (m !== 'degree' || degree) && (m !== 'finger' || finger));
}

/**
 * Selector común «Etiquetas». `available()` dice qué modos tienen sentido
 * ahora; al cambiar se guarda para todo el Lab y se llama a onChange.
 */
export function labelPicker({ available = () => ALL_MODES, onChange, ctx = null, label = 'Etiquetas' }) {
  const wrap = h('div', { class: 'field label-picker' });
  const draw = () => {
    const modes = available();
    const current = effectiveMode(modes);
    const seg = segmented(LABEL_MODES.filter((m) => modes.includes(m.value)), current, (v) => {
      setLabelMode(v);
      onChange?.(v);
    });
    wrap.replaceChildren(h('span', { class: 'legend' }, label), seg);
  };
  draw();
  onLabelMode(() => draw(), ctx);
  return { el: wrap, refresh: draw, mode: () => effectiveMode(available()) };
}
