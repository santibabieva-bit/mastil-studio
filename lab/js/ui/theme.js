/**
 * Temas: el de la página (claro, oscuro o el del sistema) y el de los
 * diagramas del mástil (clásico, noche, madera, pizarra, alto contraste).
 * Se guardan para todo el Lab y se aplican como atributos en <html>:
 *   data-theme="light|dark"   data-diagram="classic|night|wood|slate|contrast"
 * Los colores viven en lab.css; aquí solo se elige y se dibuja el selector.
 */

export const PAGE_THEMES = [
  { value: 'auto', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

/** Colores de muestra (los de verdad están en lab.css). */
export const DIAGRAM_THEMES = [
  { value: 'auto', label: 'Según la página', swatch: null },
  { value: 'classic', label: 'Clásico', swatch: { paper: '#fffdf8', board: '#faf7f0', fret: '#b9ad95', string: '#6c6657', note: '#12120f', text: '#fff' } },
  { value: 'night', label: 'Noche', swatch: { paper: '#1b1a19', board: '#1b1a19', fret: '#e9e5dd', string: '#d6d1c7', note: '#f4f1ea', text: '#1b1a18' } },
  { value: 'wood', label: 'Madera', swatch: { paper: '#2a1d15', board: '#4b2f20', fret: '#d8d2c4', string: '#e6dccb', note: '#f6efe0', text: '#2b1a10' } },
  { value: 'slate', label: 'Pizarra', swatch: { paper: '#1e2a36', board: '#243241', fret: '#8fa3b8', string: '#c4d1de', note: '#e6edf4', text: '#142029' } },
  { value: 'contrast', label: 'Alto contraste', swatch: { paper: '#fff', board: '#fff', fret: '#000', string: '#333', note: '#000', text: '#fff' } },
];

const PAGE_KEY = 'lab:page-theme';
const DIAGRAM_KEY = 'lab:diagram-theme';

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export const getPageTheme = () => read(PAGE_KEY, 'auto');
export const getDiagramTheme = () => read(DIAGRAM_KEY, 'auto');

const systemDark = () => !!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Tema efectivo: «auto» se resuelve con el sistema (página) o con la página (diagramas). */
export function resolveThemes(page = getPageTheme(), diagram = getDiagramTheme(), dark = systemDark()) {
  const p = page === 'auto' ? (dark ? 'dark' : 'light') : page;
  const d = diagram === 'auto' ? (p === 'dark' ? 'night' : 'classic') : diagram;
  return { page: p, diagram: d };
}

export function applyTheme() {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  const { page, diagram } = resolveThemes();
  root.dataset.theme = page;
  root.dataset.diagram = diagram;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', page === 'dark' ? '#121513' : '#17251f');
}

export function setPageTheme(v) { write(PAGE_KEY, v); applyTheme(); }
export function setDiagramTheme(v) { write(DIAGRAM_KEY, v); applyTheme(); }

/** Sigue al sistema cuando el tema es «Sistema». */
export function watchSystemTheme() {
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
}

/** Mini mástil para la muestra de un tema. */
function swatchSvg(c) {
  if (!c) {
    return '<svg viewBox="0 0 90 44" aria-hidden="true"><rect width="45" height="44" fill="#faf7f0"/><rect x="45" width="45" height="44" fill="#1b1a19"/><text x="45" y="27" text-anchor="middle" font-size="13" font-weight="700" fill="#df812f">A</text></svg>';
  }
  const lines = [10, 20, 30, 40].map((y) => `<line x1="4" x2="86" y1="${y - 3}" y2="${y - 3}" stroke="${c.string}" stroke-width="1"/>`).join('');
  const frets = [4, 30, 58, 86].map((x) => `<line x1="${x}" x2="${x}" y1="7" y2="37" stroke="${c.fret}" stroke-width="1.6"/>`).join('');
  return `<svg viewBox="0 0 90 44" aria-hidden="true"><rect width="90" height="44" fill="${c.paper}"/><rect x="4" y="7" width="82" height="30" fill="${c.board}"/>${lines}${frets}`
    + `<circle cx="44" cy="17" r="6" fill="${c.note}"/><text x="44" y="20" text-anchor="middle" font-size="8" font-weight="700" fill="${c.text}">C</text>`
    + '<circle cx="72" cy="27" r="6" fill="#d84a3e"/><text x="72" y="30" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">R</text></svg>';
}

/** Botón «Tema» con el menú desplegable (página + diagramas). */
export function themeMenu() {
  const menu = document.createElement('details');
  menu.className = 'theme-menu';
  menu.innerHTML = '<summary class="btn btn-outline btn-sm" title="Tema de la página y de los diagramas">🎨 Tema</summary><div class="theme-pop" role="group" aria-label="Tema"></div>';
  const pop = menu.querySelector('.theme-pop');
  const draw = () => {
    const page = getPageTheme();
    const diagram = getDiagramTheme();
    pop.innerHTML = `
      <div class="field"><span class="legend">Página</span>
        <div class="segmented" role="radiogroup">${PAGE_THEMES.map((t) => `<button type="button" role="radio" aria-checked="${t.value === page}" class="${t.value === page ? 'is-active' : ''}" data-page="${t.value}">${t.label}</button>`).join('')}</div>
      </div>
      <div class="field"><span class="legend">Diagramas del mástil</span>
        <div class="theme-swatches">${DIAGRAM_THEMES.map((t) => `<button type="button" class="theme-swatch ${t.value === diagram ? 'is-active' : ''}" aria-pressed="${t.value === diagram}" data-diagram="${t.value}">${swatchSvg(t.swatch)}<span>${t.label}</span></button>`).join('')}</div>
      </div>`;
  };
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.page) setPageTheme(b.dataset.page);
    if (b.dataset.diagram) setDiagramTheme(b.dataset.diagram);
    draw();
  });
  // Se cierra al pulsar fuera.
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  draw();
  return menu;
}
