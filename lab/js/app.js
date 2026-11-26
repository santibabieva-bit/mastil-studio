/**
 * Mástil Lab: enrutador por hash, contexto compartido y registro de práctica.
 */

import { engine } from './audio/engine.js';
import { createStorage, parseHash, buildHash } from './core/state.js';
import { addMinutes, currentStreak, dateKey, emptyPractice } from './core/practice.js';
import { GROUPS, TOOLS, TOOL_BY_ID } from './tools/index.js';
import { renderHome } from './tools/home.js';
import { clear, copyText, h, toast } from './ui/dom.js';
import { applyTheme, themeMenu, watchSystemTheme } from './ui/theme.js';

const storage = createStorage();

const DEFAULT_SESSION = { root: 'A', family: 'scale', quality: 'pentatonicMinor', bpm: 90 };

const practice = {
  state: storage.get('practice', emptyPractice()),
  add(tool, minutes) {
    if (!(minutes > 0)) return;
    this.state = addMinutes(this.state, dateKey(), minutes, tool);
    storage.set('practice', this.state);
    updateStreak();
  },
  replace(state) {
    this.state = state;
    storage.set('practice', state);
    updateStreak();
  },
};

const session = {
  data: { ...DEFAULT_SESSION, ...storage.get('session', {}) },
  get() {
    return this.data;
  },
  set(patch) {
    this.data = { ...this.data, ...patch };
    storage.set('session', this.data);
  },
};

/* ─── Registro automático de práctica mientras suena algo ─── */
const playingSince = new Map();
engine.onPlayState((tool, on) => {
  if (on) {
    playingSince.set(tool, performance.now());
  } else if (playingSince.has(tool)) {
    const seconds = (performance.now() - playingSince.get(tool)) / 1000;
    playingSince.delete(tool);
    if (seconds >= 5) practice.add(tool, seconds / 60);
  }
});
window.addEventListener('pagehide', () => {
  for (const [tool, since] of playingSince) {
    const seconds = (performance.now() - since) / 1000;
    if (seconds >= 5) practice.add(tool, seconds / 60);
  }
  playingSince.clear();
});

/* ─── Recordatorio de pausas: cada 20 min de práctica con sonido ─── */
let activeMinutes = 0;
let idleMinutes = 0;
setInterval(() => {
  if (playingSince.size) { activeMinutes += 1; idleMinutes = 0; } else { idleMinutes += 1; if (idleMinutes >= 5) activeMinutes = 0; }
  if (activeMinutes >= 20 && storage.get('break-reminder', true)) {
    activeMinutes = 0;
    toast('Llevas 20 minutos tocando: haz una pausa de 2 min, suelta la guitarra y estira muñecas y dedos.');
  }
}, 60000);

function updateStreak() {
  const chip = document.getElementById('streak-chip');
  const streak = currentStreak(practice.state);
  chip.hidden = streak < 1;
  chip.textContent = `🔥 ${streak} ${streak === 1 ? 'día' : 'días'}`;
}

/* ─── Navegación ─── */
const nav = document.getElementById('nav');
const main = document.getElementById('main');
let current = { id: null, cleanups: [], params: {} };

function buildNav() {
  clear(nav);
  nav.append(
    h('div', { class: 'nav-group' }, h('a', { class: 'nav-link', href: '#/', dataset: { tool: 'home' } }, h('span', { class: 'nav-ico' }, '⌂'), 'Inicio')),
  );
  for (const group of GROUPS) {
    const items = TOOLS.filter((t) => t.group === group.id);
    nav.append(
      h(
        'div',
        { class: 'nav-group' },
        h('h3', {}, group.label),
        items.map((t) => h(
          'a',
          { class: 'nav-link', href: `#/${t.id}`, dataset: { tool: t.id } },
          h('span', { class: 'nav-ico' }, t.icon),
          t.title,
          t.isNew ? h('span', { class: 'nav-new' }, 'NUEVO') : null,
        )),
      ),
    );
  }
}

function setActive(id) {
  nav.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('is-active', a.dataset.tool === id));
}

function runCleanups() {
  for (const fn of current.cleanups.splice(0)) {
    try {
      fn();
    } catch (error) {
      console.error(error);
    }
  }
}

function makeContext(id, params) {
  const state = { params: { ...params } };
  return {
    id,
    engine,
    storage,
    practice,
    session,
    params,
    toast,
    setParams(patch) {
      state.params = { ...state.params, ...patch };
      current.params = state.params;
      history.replaceState(null, '', buildHash(id, state.params));
    },
    getParams() {
      return state.params;
    },
    go(toolId, p = {}) {
      location.hash = buildHash(toolId, p);
    },
    onCleanup(fn) {
      current.cleanups.push(fn);
    },
    logSeconds(seconds) {
      practice.add(id, seconds / 60);
    },
    ensureAudio: () => engine.ensure(),
  };
}

function route() {
  const { tool, params } = parseHash(location.hash);
  const id = tool || 'home';
  runCleanups();
  engine.clearQueue();
  clear(main);
  current.id = id;
  current.params = params;
  setActive(id);
  const ctx = makeContext(id, params);
  try {
    if (id === 'home') {
      document.title = 'Mástil Lab · Estudio de guitarra';
      renderHome(main, ctx);
    } else {
      const def = TOOL_BY_ID[id];
      if (!def) {
        main.append(h('div', { class: 'panel' }, h('h2', {}, 'Herramienta no encontrada'), h('p', {}, 'Vuelve al '), h('a', { href: '#/' }, 'inicio')));
        return;
      }
      document.title = `${def.title} · Mástil Lab`;
      def.mount(main, ctx);
    }
  } catch (error) {
    console.error(error);
    main.append(h('div', { class: 'panel' }, h('h2', {}, 'Algo falló al abrir esta herramienta'), h('pre', { class: 'mono' }, String(error?.stack ?? error))));
  }
  window.scrollTo({ top: 0 });
  main.focus({ preventScroll: true });
}

applyTheme();
watchSystemTheme();
document.getElementById('share-btn').before(themeMenu());

document.getElementById('share-btn').addEventListener('click', async () => {
  const ok = await copyText(location.href);
  toast(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace');
});

// Modo sin conexión: sólo en https o localhost.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* no pasa nada si no se puede */ });
}

buildNav();
updateStreak();
window.addEventListener('hashchange', route);
route();

// Para depuración desde la consola.
window.__lab = { engine, practice, session, storage };
