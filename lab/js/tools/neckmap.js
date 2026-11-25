/**
 * Mapa de mi mástil: mapa de calor por cuerda y traste con lo que fallas o
 * tardas en encontrar, y una práctica que insiste en las zonas flojas.
 */

import {
  STANDARD_MIDI, coverage, heatColor, mapGrid, pickSpots, recordDay, recordSpot, stringSummary, weakestSpots,
} from '../core/heatmap.js';
import { midiName, pcName, prettyNote } from '../core/music.js';
import { stringName } from '../core/quiz.js';
import {
  button, clear, h, slider,
} from '../ui/dom.js';
import { header } from './common.js';

const ROUND = 10;
const NOTE_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Registra un punto en el mapa guardado. Lo usan el Quiz y el Mástil a ciegas. */
export function logSpot(ctx, s, f, ok, ms = null) {
  const map = recordSpot(ctx.storage.get('neck-map', {}), s, f, ok, ms);
  ctx.storage.set('neck-map', map);
  ctx.storage.set('neck-map-days', recordDay(ctx.storage.get('neck-map-days', {}), map, new Date().toISOString().slice(0, 10)));
}

function mount(root, ctx) {
  const cfg = { maxFret: ctx.storage.get('neckmap-fret', 12) };
  const run = { spots: [], i: 0, right: 0, askedAt: 0, locked: false };
  const gridEl = h('div');
  const sideEl = h('div', { class: 'stack' });
  const stage = h('div', { class: 'stack' });

  const getMap = () => ctx.storage.get('neck-map', {});

  function drawGrid() {
    clear(gridEl);
    const cells = mapGrid(getMap(), { maxFret: cfg.maxFret });
    const cols = cfg.maxFret + 1;
    const wrap = h('div', { style: `display:grid;grid-template-columns:34px repeat(${cols},minmax(0,1fr));gap:2px;font-size:11px;overflow-x:auto` });
    wrap.append(h('span', {}));
    for (let f = 0; f < cols; f += 1) wrap.append(h('span', { class: 'hint', style: 'text-align:center' }, String(f)));
    for (let s = 0; s < 6; s += 1) {
      wrap.append(h('span', { class: 'hint', style: 'align-self:center' }, `${s + 1}ª`));
      for (let f = 0; f < cols; f += 1) {
        const c = cells[s * cols + f];
        const col = heatColor(c.mastery);
        const tip = c.seen
          ? `${stringName(s)}, traste ${f}: ${prettyNote(pcName(c.pc, 'sharp'))} · ${Math.round((c.mastery ?? 0) * 100)} % · ${c.seen} intentos${c.ms ? ` · ${(c.ms / 1000).toFixed(1)} s` : ''}`
          : `${stringName(s)}, traste ${f}: sin datos`;
        wrap.append(h('span', {
          title: tip,
          class: 'neck-cell',
          dataset: { k: `${s}:${f}` },
          style: `background:${col ?? 'var(--line,#e5dfd2)'};opacity:${col ? 1 : 0.45};border-radius:4px;min-height:26px;display:flex;align-items:center;justify-content:center;color:#222`,
        }, prettyNote(pcName(c.pc, 'sharp'))));
      }
    }
    gridEl.append(wrap);
  }

  function drawSide() {
    clear(sideEl);
    const map = getMap();
    const cov = coverage(map, { maxFret: cfg.maxFret });
    const weak = weakestSpots(map, 8);
    const strs = stringSummary(map, { maxFret: cfg.maxFret });
    sideEl.append(
      h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${Math.round(cov.pct * 100)} %`), h('div', { class: 'hint' }, 'Mástil dominado')),
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${cov.seen}/${cov.total}`), h('div', { class: 'hint' }, 'Puntos vistos')),
      ),
      h('h2', {}, 'Tus puntos más flojos'),
      weak.length
        ? h('table', { class: 'table' }, h('tbody', {}, weak.map((w) => h('tr', {},
          h('td', {}, `${stringName(w.s)} · traste ${w.f}`),
          h('td', {}, prettyNote(midiName(STANDARD_MIDI[w.s] + w.f)).replace(/\d+$/, '')),
          h('td', {}, `${Math.round(w.mastery * 100)} %`)))))
        : h('p', { class: 'hint' }, 'Aún no hay puntos flojos. Practica abajo, o usa el Theory Trainer y el Mástil a ciegas: todo lo que respondas se apunta aquí.'),
      h('p', { class: 'hint' }, strs.map((x) => `${x.s + 1}ª: ${x.avg == null ? '–' : `${Math.round(x.avg * 100)} %`}`).join(' · ')),
    );
  }

  function start() {
    run.spots = pickSpots(getMap(), { count: ROUND, maxFret: cfg.maxFret });
    run.i = 0;
    run.right = 0;
    ask();
  }

  function ask() {
    clear(stage);
    if (run.i >= run.spots.length) { finish(); return; }
    const sp = run.spots[run.i];
    run.locked = false;
    run.askedAt = performance.now();
    const fb = h('div', { class: 'feedback', hidden: true });
    const opts = h('div', { class: 'options' });
    for (const pc of NOTE_BUTTONS) {
      const b = h('button', { type: 'button', class: 'option-btn', dataset: { value: pc } }, prettyNote(pcName(pc, 'sharp')));
      b.addEventListener('click', () => answer(pc, b, fb));
      opts.append(b);
    }
    stage.append(
      h('div', { class: 'progress' }, h('i', { style: `width:${(run.i / ROUND) * 100}%` })),
      h('div', { class: 'big-number', style: 'text-align:center' }, `Cuerda ${sp.s + 1} · traste ${sp.f}`),
      h('p', { class: 'hint', style: 'text-align:center' }, '¿Qué nota es? Tócala en tu guitarra y confirma con el botón.'),
      opts,
      fb,
    );
  }

  function answer(pc, btn, fb) {
    if (run.locked) return;
    run.locked = true;
    const sp = run.spots[run.i];
    const ok = pc === sp.pc;
    const ms = performance.now() - run.askedAt;
    if (ok) run.right += 1;
    logSpot(ctx, sp.s, sp.f, ok, ms);
    ctx.logSeconds(Math.min(20, Math.round(ms / 1000)));
    stage.querySelectorAll('.option-btn').forEach((b) => {
      b.disabled = true;
      if (Number(b.dataset.value) === sp.pc) b.classList.add('is-right');
    });
    if (!ok) btn.classList.add('is-wrong');
    fb.hidden = false;
    fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
    fb.textContent = ok ? `✓ ${(ms / 1000).toFixed(1)} s` : `✗ Era ${prettyNote(pcName(sp.pc, 'sharp'))}.`;
    drawGrid();
    drawSide();
    setTimeout(() => { run.i += 1; ask(); }, ok ? 700 : 1500);
  }

  function finish() {
    clear(stage);
    stage.append(
      h('p', { class: 'feedback ok' }, `Ronda terminada: ${run.right}/${ROUND}. Los puntos que fallaste o tardaste en encontrar volverán antes.`),
      button('Otra ronda', { variant: 'accent', onClick: start }),
    );
  }

  /** Repaso de la evolución: el mapa se recolorea día a día. */
  let replayTimer = 0;
  function replay() {
    clearInterval(replayTimer);
    const days = ctx.storage.get('neck-map-days', {});
    const dates = Object.keys(days).sort();
    if (!dates.length) { replayDay.textContent = 'Aún no hay días guardados: practica y vuelve mañana.'; return; }
    let i = 0;
    const cells = [...gridEl.querySelectorAll('.neck-cell')];
    const paintDay = () => {
      const snap = days[dates[i]];
      for (const c of cells) {
        const v = snap[c.dataset.k];
        c.style.background = v == null ? 'var(--line,#e5dfd2)' : heatColor(v / 100);
        c.style.opacity = v == null ? '0.45' : '1';
      }
      const solid = Object.values(snap).filter((v) => v >= 85).length;
      replayDay.textContent = `${new Date(`${dates[i]}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${solid} puntos dominados`;
      i += 1;
      if (i >= dates.length) { clearInterval(replayTimer); setTimeout(() => { drawGrid(); replayDay.textContent += ' · hoy'; }, 1200); }
    };
    paintDay();
    replayTimer = setInterval(paintDay, Math.max(350, Math.min(900, 9000 / dates.length)));
  }
  const replayDay = h('div', { class: 'replay-day' }, '');
  ctx.onCleanup(() => clearInterval(replayTimer));

  function reset() {
    if (!confirm('¿Borrar todo el mapa de tu mástil?')) return;
    ctx.storage.set('neck-map', {});
    ctx.storage.set('neck-map-days', {});
    drawGrid();
    drawSide();
  }

  root.append(
    header('Aprender el mástil', 'Mapa de mi mástil', 'Cada nota que respondes en el Theory Trainer, el Mástil a ciegas o aquí se apunta por cuerda y traste. Verde: lo dominas. Rojo: fallas o tardas. Gris: aún no lo has visto. La práctica insiste donde estás más flojo, con repetición espaciada.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' },
        gridEl,
        slider({ min: 5, max: 15, value: cfg.maxFret, label: 'Traste máximo', format: (v) => `${v}`, onInput: (v) => { cfg.maxFret = v; ctx.storage.set('neckmap-fret', v); drawGrid(); drawSide(); } }),
        replayDay,
        stage,
        h('div', { class: 'row' }, button('▶ Ver mi evolución', { variant: 'outline', onClick: replay }), button(`Practicar mis zonas débiles (${ROUND})`, { variant: 'accent', onClick: start }), button('Borrar mapa', { variant: 'ghost', onClick: reset })),
      ),
      h('section', { class: 'panel stack' }, sideEl),
    ),
  );
  drawGrid();
  drawSide();
}

export default {
  id: 'neckmap',
  title: 'Mapa de mi mástil',
  group: 'neck',
  icon: '🗺️',
  summary: 'Mapa de calor de tus aciertos y tiempos por cuerda y traste, con práctica en tus zonas débiles.',
  isNew: true,
  mount,
};
