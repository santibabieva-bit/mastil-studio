/** Tab Creator: escribe tablatura con técnicas, escúchala y expórtala. */

import {
  TAB_LABELS, TECHNIQUES, asciiToTab, clearTab, cloneTab, createTab, deleteColumn, ensureColumns, insertColumns,
  sanitizeCell, tabFromJson, tabLength, tabToAscii, tabToJson,
} from '../core/tab.js';
import { coerce } from '../core/state.js';
import { TabPlayer } from '../audio/tabplayer.js';
import { button, clear, copyText, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { saveBlob, slug } from '../ui/export.js';
import { tabToMidi, tabToMusicXML } from '../core/midi.js';
import { tabToAlphaTex } from '../core/alphatex.js';
import { createScore, scoreToolbar } from '../ui/score.js';
import { header, playToggle } from './common.js';

const SUBS = [
  { value: 1, label: 'Negras' },
  { value: 2, label: 'Corcheas' },
  { value: 4, label: 'Semicorcheas' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  let tab = null;
  if (ctx.params.handoff) {
    const raw = ctx.storage.get('tab-handoff', null);
    if (raw) tab = tabFromJson(raw);
  }
  if (!tab) {
    const raw = ctx.storage.get('tab-current', null);
    tab = raw ? tabFromJson(raw) : null;
  }
  if (!tab) tab = createTab({ cols: 24 });
  const view = { barEvery: tab.barCols ?? (tab.subdivision ?? 2) * 4, loop: false, countIn: true, mode: 'edit' };
  const history = { undo: [], redo: [], last: 0 };
  let focused = { s: 0, c: 0 };

  const editor = h('div', { class: 'tab-editor' });
  const preview = h('pre', { class: 'tab-view', 'aria-label': 'Vista previa en texto' });
  const savedList = h('div', { class: 'stack' });
  const player = new TabPlayer(engine, 'tab');
  player.onStop = () => {
    play.set(false);
    editor.querySelectorAll('.is-now').forEach((el) => el.classList.remove('is-now'));
  };
  ctx.onCleanup(() => player.stop());
  const play = playToggle({ startLabel: '▶ Reproducir', onStart: () => startPlay(0), onStop: () => player.stop(), size: 'btn-lg' });

  /* Vista «Partitura»: la misma tab pintada y reproducible con alphaTab. */
  const scoreWrap = h('div', { class: 'stack', hidden: true });
  let score = null;
  let scoreTimer = 0;
  const ensureScore = () => {
    if (score) return score;
    const stage = h('div');
    score = createScore(stage, { onPlaying: (on) => engine.notePlaying('tab-score', on) });
    scoreWrap.append(scoreToolbar(score, { layout: true }), stage);
    return score;
  };
  const renderScore = () => ensureScore().load(tabToAlphaTex(tab));

  /* Vista previa en vivo (sólo tablatura) debajo del editor. */
  const liveWrap = h('div', { class: 'stack' });
  const liveStage = h('div');
  const live = createScore(liveStage, { stave: 'tab', scroll: false });
  liveWrap.append(h('h2', { style: 'margin:0' }, 'Vista previa (alphaTab)'), scoreToolbar(live, { playback: false, stave: true }), liveStage);
  const renderLive = () => live.load(tabToAlphaTex(tab));

  const scheduleScore = () => {
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(() => {
      if (view.mode === 'score') renderScore();
      if (view.mode === 'edit') renderLive();
    }, 500);
  };
  ctx.onCleanup(() => {
    clearTimeout(scoreTimer);
    score?.destroy();
    live.destroy();
  });

  const persist = () => {
    ctx.storage.set('tab-current', tabToJson(tab));
    if (view.mode === 'score' || view.mode === 'edit') scheduleScore();
  };

  function commit(next, { coalesce = false } = {}) {
    const now = performance.now();
    if (!coalesce || now - history.last > 600) {
      history.undo.push(tab);
      if (history.undo.length > 100) history.undo.shift();
      history.redo = [];
    }
    history.last = now;
    tab = next;
    persist();
    if (view.mode === 'text') drawPreview();
  }

  const cellEl = (s, c) => editor.querySelector(`[data-s="${s}"][data-c="${c}"]`);
  const focusCell = (s, c) => {
    const el = cellEl(Math.max(0, Math.min(tab.strings - 1, s)), Math.max(0, Math.min(tabLength(tab) - 1, c)));
    if (el) {
      el.focus();
      el.select();
    }
  };

  function drawEditor() {
    clear(editor);
    const cols = tabLength(tab);
    const grid = h('div', { class: 'tab-grid' });
    grid.style.gridTemplateColumns = `34px repeat(${cols}, 38px)`;
    grid.append(h('div', { class: 'tab-colhead' }));
    for (let c = 0; c < cols; c += 1) {
      const beat = c % (tab.subdivision ?? 2) === 0;
      grid.append(h('div', { class: `tab-colhead ${beat ? 'is-beat' : ''}`, title: `Columna ${c + 1}` }, beat ? String(Math.floor(c / (tab.subdivision ?? 2)) + 1) : '·'));
    }
    for (let s = 0; s < tab.strings; s += 1) {
      grid.append(h('div', { class: 'tab-label' }, tab.strings === 6 ? TAB_LABELS[s] : String(s + 1)));
      for (let c = 0; c < cols; c += 1) {
        const input = h('input', {
          type: 'text', class: `tab-cell ${c % view.barEvery === 0 && c > 0 ? 'tab-barline' : ''}`, maxlength: 6, value: tab.cells[s][c],
          dataset: { s, c }, autocomplete: 'off', spellcheck: 'false', 'aria-label': `Cuerda ${s + 1}, columna ${c + 1}`, inputmode: 'text',
        });
        input.addEventListener('focus', () => { focused = { s, c }; });
        input.addEventListener('input', () => {
          const clean = sanitizeCell(input.value);
          if (clean !== input.value) input.value = clean;
          const next = cloneTab(tab);
          next.cells[s][c] = clean;
          commit(next, { coalesce: true });
        });
        input.addEventListener('keydown', (e) => {
          const key = e.key;
          if (key === 'ArrowRight' && (input.selectionStart === input.value.length || e.ctrlKey)) { e.preventDefault(); focusCell(s, c + 1); }
          else if (key === 'ArrowLeft' && (input.selectionStart === 0 || e.ctrlKey)) { e.preventDefault(); focusCell(s, c - 1); }
          else if (key === 'ArrowDown') { e.preventDefault(); focusCell(s + 1, c); }
          else if (key === 'ArrowUp') { e.preventDefault(); focusCell(s - 1, c); }
          else if (key === 'Enter') { e.preventDefault(); focusCell(s, c + 1); }
          else if (key === 'Backspace' && input.value === '') { e.preventDefault(); focusCell(s, c - 1); }
          else if (key === ' ') { e.preventDefault(); focusCell(s, c + 1); }
          else if (key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
          else if (key === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); redo(); }
        });
        grid.append(input);
      }
    }
    editor.append(grid);
  }

  function drawPreview() {
    preview.textContent = tabToAscii(tab, Math.max(8, view.barEvery * 3));
  }

  function rebuild() {
    drawEditor();
    drawPreview();
    meta.textContent = `${tab.strings} cuerdas · ${tabLength(tab)} columnas`;
  }

  function undo() {
    const prev = history.undo.pop();
    if (!prev) return;
    history.redo.push(tab);
    tab = prev;
    persist();
    rebuild();
  }
  function redo() {
    const next = history.redo.pop();
    if (!next) return;
    history.undo.push(tab);
    tab = next;
    persist();
    rebuild();
  }

  function startPlay(from) {
    return player.start(tab, {
      bpm: () => tab.tempo,
      loop: view.loop,
      countIn: view.countIn,
      from,
      onColumn: (col) => {
        editor.querySelectorAll('.is-now').forEach((el) => el.classList.remove('is-now'));
        editor.querySelectorAll(`[data-c="${col}"]`).forEach((el) => el.classList.add('is-now'));
        const el = cellEl(0, col);
        if (el && editor.scrollWidth > editor.clientWidth) {
          const x = el.offsetLeft;
          if (x < editor.scrollLeft + 40 || x > editor.scrollLeft + editor.clientWidth - 80) editor.scrollLeft = Math.max(0, x - 120);
        }
      },
    });
  }

  /* ─── barra de herramientas ─── */
  const titleInput = h('input', { type: 'text', value: tab.title, 'aria-label': 'Título', style: 'max-width:260px' });
  titleInput.addEventListener('input', () => { tab = { ...tab, title: titleInput.value }; persist(); });
  const meta = h('span', { class: 'hint' });

  function appendTech(ch) {
    const el = cellEl(focused.s, focused.c);
    if (!el) return;
    const base = el.value;
    if (ch === 'x') el.value = 'x';
    else if (/^\d/.test(base) || base === 'x') el.value = sanitizeCell(base + ch);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  const techBar = h('div', { class: 'row' }, ...Object.values(TECHNIQUES).map((t) => h('button', {
    type: 'button', class: 'btn btn-outline btn-sm', title: t.label, onclick: () => appendTech(t.id),
  }, t.id)), h('button', { type: 'button', class: 'btn btn-outline btn-sm', title: 'Nota apagada (x)', onclick: () => appendTech('x') }, 'x'));

  function drawSaved() {
    clear(savedList);
    const list = ctx.storage.get('tab-saved', []);
    for (const entry of list) {
      savedList.append(h('div', { class: 'row row--between' },
        h('span', {}, entry.title),
        h('div', { class: 'row' },
          button('Abrir', { variant: 'outline', onClick: () => { const t = tabFromJson(entry.json); if (t) { commit(t); titleInput.value = t.title; rebuild(); } } }),
          button('Borrar', { variant: 'ghost', onClick: () => { ctx.storage.set('tab-saved', list.filter((x) => x.title !== entry.title)); drawSaved(); } }),
        ),
      ));
    }
    if (!list.length) savedList.append(h('p', { class: 'hint' }, 'Aquí aparecerán tus tabs guardadas.'));
  }

  const importArea = h('textarea', { rows: 6, placeholder: 'Pega aquí una tablatura en texto (líneas e|---5---|)…', 'aria-label': 'Importar tab' });

  const showMode = (v) => {
    view.mode = v;
    editor.hidden = v !== 'edit';
    preview.hidden = v !== 'text';
    scoreWrap.hidden = v !== 'score';
    liveWrap.hidden = v !== 'edit';
    if (v === 'edit') renderLive();
    if (v === 'text') drawPreview();
    if (v === 'score') {
      player.stop();
      renderScore();
    }
  };
  const modeSeg = segmented([{ value: 'edit', label: 'Editor' }, { value: 'text', label: 'Texto' }, { value: 'score', label: 'Partitura' }], view.mode, showMode);

  root.append(
    header('Tocar y escribir', 'Tab Creator', 'Escribe tablatura escribiendo números en la rejilla. La separación entre columnas marca el ritmo; añade ligados, slides, bends, vibrato y armónicos, escúchala y exporta a texto o PDF.'),
    h('section', { class: 'panel stack' },
      h('div', { class: 'row row--between' },
        h('div', { class: 'row' }, titleInput, modeSeg, meta),
        h('div', { class: 'row no-print' },
          button('↶ Deshacer', { variant: 'outline', onClick: undo }),
          button('↷ Rehacer', { variant: 'outline', onClick: redo }),
        ),
      ),
      h('div', { class: 'row no-print' }, h('span', { class: 'hint' }, 'Técnicas:'), techBar, h('span', { class: 'hint' }, 'Teclas: flechas para moverte, Enter/espacio avanza.')),
      editor,
      preview,
      liveWrap,
      scoreWrap,
    ),
    h('div', { class: 'grid-2', style: 'align-items:start' },
      h('section', { class: 'panel stack no-print' }, h('h2', {}, 'Reproducción'),
        h('div', { class: 'row' }, play.el, button('Desde el cursor', { variant: 'outline', onClick: async () => { player.stop(); play.set(true); await startPlay(focused.c); } })),
        slider({ min: 40, max: 220, value: tab.tempo, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { tab = { ...tab, tempo: v }; persist(); } }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Columna = '), segmented(SUBS, tab.subdivision ?? 2, (v) => { tab = { ...tab, subdivision: Number(v) }; persist(); rebuild(); })),
        toggle('Bucle', view.loop, (v) => { view.loop = v; }),
        toggle('Cuenta previa', view.countIn, (v) => { view.countIn = v; }),
      ),
      h('section', { class: 'panel stack no-print' }, h('h2', {}, 'Estructura'),
        h('div', { class: 'field' }, h('label', {}, 'Cuerdas'), select([4, 5, 6, 7].map((n) => ({ value: n, label: `${n} cuerdas` })), tab.strings, (v) => {
          const n = Number(v);
          const next = createTab({ strings: n, cols: tabLength(tab), title: tab.title, tempo: tab.tempo });
          next.subdivision = tab.subdivision;
          for (let s = 0; s < Math.min(n, tab.strings); s += 1) next.cells[s] = [...tab.cells[s]];
          commit(next);
          rebuild();
        })),
        h('div', { class: 'field' }, h('label', {}, 'Compás cada'), select([4, 6, 8, 12, 16].map((n) => ({ value: n, label: `${n} columnas` })), view.barEvery, (v) => { view.barEvery = Number(v); tab = { ...tab, barCols: Number(v) }; persist(); rebuild(); })),
        h('div', { class: 'row' },
          button('+ 8 columnas', { variant: 'outline', onClick: () => { commit(ensureColumns(tab, tabLength(tab) + 8)); rebuild(); } }),
          button('Insertar columna', { variant: 'outline', onClick: () => { commit(insertColumns(tab, focused.c)); rebuild(); focusCell(focused.s, focused.c); } }),
          button('Borrar columna', { variant: 'outline', onClick: () => { commit(deleteColumn(tab, focused.c)); rebuild(); } }),
          button('Vaciar', { variant: 'ghost', onClick: () => { commit(clearTab(tab)); rebuild(); } }),
        ),
      ),
    ),
    h('div', { class: 'grid-2 no-print', style: 'align-items:start' },
      h('section', { class: 'panel stack' }, h('h2', {}, 'Exportar'),
        h('div', { class: 'row' },
          button('Copiar texto', { variant: 'outline', onClick: async () => ctx.toast((await copyText(tabToAscii(tab, 32))) ? 'Tab copiada' : 'No se pudo copiar') }),
          button('Guardar .txt', { variant: 'outline', onClick: () => saveBlob(new Blob([`${tab.title}\n\n${tabToAscii(tab, 32)}\n`], { type: 'text/plain' }), `${slug(tab.title)}.txt`, 'Tablatura') }),
          button('Exportar MIDI', { variant: 'outline', onClick: () => saveBlob(new Blob([tabToMidi(tab)], { type: 'audio/midi' }), `${slug(tab.title)}.mid`, 'MIDI') }),
          button('Editar como alphaTex', { variant: 'outline', onClick: () => { ctx.storage.set('score-handoff', tabToAlphaTex(tab)); ctx.go('score', { handoff: 1 }); } }),
          button('Exportar MusicXML', { variant: 'outline', onClick: () => saveBlob(new Blob([tabToMusicXML(tab)], { type: 'application/vnd.recordare.musicxml+xml' }), `${slug(tab.title)}.musicxml`, 'MusicXML') }),
          button('Imprimir / PDF', { variant: 'dark', onClick: () => { modeSeg.setValue(view.mode === 'score' ? 'score' : 'text'); if (view.mode !== 'score') showMode('text'); setTimeout(() => window.print(), 50); } }),
        ),
        h('div', { class: 'row' },
          button('Guardar en mi biblioteca', { variant: 'accent', onClick: () => {
            const list = ctx.storage.get('tab-saved', []);
            ctx.storage.set('tab-saved', [...list.filter((x) => x.title !== tab.title), { title: tab.title, json: tabToJson(tab) }]);
            drawSaved();
            ctx.toast('Tab guardada');
          } }),
          button('Nueva tab', { variant: 'ghost', onClick: () => { commit(createTab({ cols: 24 })); titleInput.value = tab.title; rebuild(); } }),
        ),
        h('h2', { style: 'margin-top:8px' }, 'Mi biblioteca'),
        savedList,
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Importar tab en texto'), importArea,
        button('Importar', { variant: 'outline', onClick: () => {
          const parsed = asciiToTab(importArea.value, { title: 'Importada' });
          if (!parsed) { ctx.toast('No he podido leer esa tab'); return; }
          parsed.tempo = tab.tempo;
          commit(parsed);
          titleInput.value = parsed.title;
          rebuild();
          ctx.toast('Tab importada');
        } }),
      ),
    ),
  );
  preview.hidden = true;
  rebuild();
  renderLive();
  drawSaved();
  void coerce;
}

export default {
  id: 'tab',
  title: 'Tab Creator',
  group: 'play',
  icon: '✎',
  summary: 'Escribe tablatura con técnicas, escúchala, expórtala a texto/PDF y guarda tu biblioteca.',
  mount,
};
