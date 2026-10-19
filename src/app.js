import {
  ROOT_OPTIONS,
  getFamily,
  getQuality,
  parseRoot,
  qualityOptions,
  resolveQuality,
  rootOptionValue,
} from './theory.js';
import { parseQuery } from './parser.js';
import { buildDiagram } from './diagram.js';

const DEFAULT_STATE = {
  rootValue: 'A',
  family: 'scale',
  quality: 'major',
  shapeId: 'all',
  includeOpen: true,
  showCagedOverlay: false,
  colorRoles: true,
  labelMode: 'name',
  circleScale: 1,
  noteTextScale: 1,
  typeScale: 1.1,
  activeStrings: [true, true, true, true, true, true],
  voicingDrop: 'drop2',
  voicingRootString: 6,
};

const state = { ...DEFAULT_STATE };
let currentDiagram = null;

const elements = {
  queryForm: document.querySelector('#query-form'),
  query: document.querySelector('#query'),
  feedback: document.querySelector('#feedback'),
  root: document.querySelector('#root'),
  quality: document.querySelector('#quality'),
  familyGroup: document.querySelector('#family-group'),
  labelModeGroup: document.querySelector('#label-mode-group'),
  shapeField: document.querySelector('#shape-field'),
  shapeGroup: document.querySelector('#shape-group'),
  voicingField: document.querySelector('#voicing-field'),
  dropGroup: document.querySelector('#drop-group'),
  rootStringGroup: document.querySelector('#root-string-group'),
  voicingHint: document.querySelector('#voicing-hint'),
  stringsField: document.querySelector('#strings-field'),
  cagedToggleRow: document.querySelector('#caged-toggle-row'),
  includeOpenRow: document.querySelector('#include-open-row'),
  includeOpen: document.querySelector('#include-open'),
  showCaged: document.querySelector('#show-caged'),
  colorRoles: document.querySelector('#color-roles'),
  previewSize: document.querySelector('#preview-size'),
  stringGroup: document.querySelector('#string-group'),
  circleScale: document.querySelector('#circle-scale'),
  circleScaleValue: document.querySelector('#circle-scale-value'),
  noteTextScale: document.querySelector('#note-text-scale'),
  noteTextScaleValue: document.querySelector('#note-text-scale-value'),
  typeScale: document.querySelector('#type-scale'),
  typeScaleValue: document.querySelector('#type-scale-value'),
  cagedLegend: document.querySelector('#caged-legend'),
  cagedFootnote: document.querySelector('#caged-footnote'),
  reset: document.querySelector('#reset'),
  canvas: document.querySelector('#canvas'),
  summaryTitle: document.querySelector('#summary-title'),
  notePills: document.querySelector('#note-pills'),
  summaryPosition: document.querySelector('#summary-position'),
  summaryCount: document.querySelector('#summary-count'),
  shapeHint: document.querySelector('#shape-hint'),
  downloadSvg: document.querySelector('#download-svg'),
  downloadPng: document.querySelector('#download-png'),
};

function populateRoots() {
  const sharpGroup = document.createElement('optgroup');
  sharpGroup.label = 'Sostenidos';
  const flatGroup = document.createElement('optgroup');
  flatGroup.label = 'Bemoles';

  for (const option of ROOT_OPTIONS) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    if (option.value.includes('b')) {
      flatGroup.append(element);
    } else {
      sharpGroup.append(element);
    }
  }

  elements.root.append(sharpGroup, flatGroup);
}

function syncQualityOptions() {
  const options = qualityOptions(state.family);
  elements.quality.replaceChildren();

  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.label;
    elements.quality.append(element);
  }

  state.quality = resolveQuality(state.family, state.quality);
  elements.quality.value = state.quality;
}

function syncRange(input, output, value, formatter = (current) => `${Math.round(current * 100)}%`) {
  input.value = value;
  output.value = formatter(value);
  const min = Number(input.min);
  const max = Number(input.max);
  const fill = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-fill', `${fill}%`);
}

function syncControls() {
  elements.root.value = state.rootValue;
  syncQualityOptions();

  syncRange(elements.circleScale, elements.circleScaleValue, state.circleScale);
  syncRange(elements.noteTextScale, elements.noteTextScaleValue, state.noteTextScale);
  syncRange(elements.typeScale, elements.typeScaleValue, state.typeScale);

  const isCuatriad = state.family === 'cuatriad';

  elements.showCaged.checked = state.showCagedOverlay;
  elements.colorRoles.checked = state.colorRoles;
  elements.cagedLegend.hidden = isCuatriad || !state.showCagedOverlay;
  elements.cagedFootnote.textContent = isCuatriad
    ? 'Cuatríada en fundamental sobre cuatro cuerdas.'
    : state.showCagedOverlay
      ? 'La tónica va con borde rojo; la forma CAGED, con un contorno naranja.'
      : 'La tónica va con borde rojo. El resaltado CAGED naranja está desactivado.';

  for (const button of elements.stringGroup.querySelectorAll('[data-string]')) {
    const index = Number(button.dataset.string);
    const active = state.activeStrings[index] !== false;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  for (const button of elements.familyGroup.querySelectorAll('[data-family]')) {
    const active = button.dataset.family === state.family;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  for (const button of elements.labelModeGroup.querySelectorAll('[data-label-mode]')) {
    const active = button.dataset.labelMode === state.labelMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  elements.shapeField.hidden = isCuatriad;
  elements.voicingField.hidden = !isCuatriad;
  elements.stringsField.hidden = isCuatriad;
  elements.cagedToggleRow.hidden = isCuatriad;
  elements.includeOpenRow.hidden = isCuatriad;

  for (const button of elements.dropGroup.querySelectorAll('[data-drop]')) {
    const active = button.dataset.drop === state.voicingDrop;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  for (const button of elements.rootStringGroup.querySelectorAll('[data-root-string]')) {
    const active = Number(button.dataset.rootString) === state.voicingRootString;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  for (const button of elements.shapeGroup.querySelectorAll('[data-shape]')) {
    const active = button.dataset.shape === state.shapeId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  elements.includeOpen.checked = state.includeOpen;
}

function setFeedback(message, type = '') {
  elements.feedback.textContent = message;
  elements.feedback.classList.remove('is-error', 'is-ok');
  if (type) elements.feedback.classList.add(`is-${type}`);
}

function shapeSummary(shape) {
  if (!shape) return 'Todas las formas';
  return `Forma ${shape.id} · ${shape.window.start}–${shape.window.end}`;
}

/**
 * Keep the query bar in sync when the user changes a control by hand.
 */
function canonicalQuery() {
  const root = parseRoot(state.rootValue).name;
  const quality = getQuality(state.family, state.quality);

  if (state.family === 'scale') {
    if (state.quality === 'major') return `Escala ${root}`;
    if (state.quality === 'naturalMinor') return `Escala ${root} menor`;
    return `Escala ${root} ${quality.label.toLowerCase()}`;
  }

  if (state.family === 'triad') {
    if (state.quality === 'major') return `Triada ${root}`;
    return `Triada ${root} ${quality.label.toLowerCase()}`;
  }

  if (state.family === 'cuatriad') {
    return `Cuatríada ${root} ${quality.label.toLowerCase()}`;
  }

  return `Arpegio ${root} ${quality.label.toLowerCase()}`;
}

function renderNotePills(collection) {
  elements.notePills.replaceChildren();

  for (const note of collection.notes) {
    const pill = document.createElement('span');
    pill.className = 'note-pill';
    if (note.isRoot) pill.classList.add('is-root');
    pill.textContent = note.name;
    pill.title = note.isRoot ? `${note.name} · tónica` : note.name;
    elements.notePills.append(pill);
  }
}

function updateShapeHint(shape) {
  if (!shape) {
    elements.shapeHint.textContent = state.showCagedOverlay
      ? 'Las cinco formas CAGED sobre el mástil completo, con todas las tónicas en rojo.'
      : 'Mástil completo. El resaltado naranja CAGED está desactivado.';
    elements.summaryPosition.textContent = 'Todas las formas';
    return;
  }

  elements.shapeHint.textContent = state.showCagedOverlay
    ? `Forma ${shape.id} · trastes ${shape.window.start}–${shape.window.end} · ${shape.hint.toLowerCase()}.`
    : `Forma ${shape.id} · trastes ${shape.window.start}–${shape.window.end} · contexto atenuado, sin naranja.`;
  elements.summaryPosition.textContent = shapeSummary(shape);
}

function render({ announce = false } = {}) {
  let root;
  try {
    root = parseRoot(state.rootValue);
  } catch (error) {
    setFeedback(error.message, 'error');
    return;
  }

  const diagram = buildDiagram({
    root,
    family: state.family,
    quality: state.quality,
    shapeId: state.shapeId,
    includeOpen: state.includeOpen,
    showCagedOverlay: state.showCagedOverlay,
    labelMode: state.labelMode,
    colorRoles: state.colorRoles,
    activeStrings: state.activeStrings,
    voicing: {
      drop: state.voicingDrop,
      rootString: state.voicingRootString,
    },
    visual: {
      circleScale: state.circleScale,
      noteTextScale: state.noteTextScale,
      typeScale: state.typeScale,
    },
  });

  currentDiagram = diagram;
  elements.canvas.innerHTML = diagram.svg;
  elements.summaryTitle.textContent = diagram.collection.title;
  elements.summaryCount.textContent = `${diagram.collection.notes.length} notas`;
  elements.previewSize.textContent = `${diagram.width} × ${diagram.height}`;
  renderNotePills(diagram.collection);

  let positionText;
  if (diagram.collection.family.id === 'cuatriad') {
    if (diagram.voicing) {
      positionText = diagram.voicing.label;
      elements.summaryPosition.textContent = `${diagram.voicing.label} · trastes ${Math.min(...diagram.voicing.frets)}–${Math.max(...diagram.voicing.frets)}`;
      const spanLabel = diagram.voicing.span === 1 ? '1 traste' : `${diagram.voicing.span} trastes`;
      elements.voicingHint.textContent =
        `Fundamental en ${diagram.voicing.rootString}ª cuerda · ${spanLabel} de extensión.`;
    } else {
      positionText = 'sin voicing disponible';
      elements.summaryPosition.textContent = 'Sin voicing';
      elements.voicingHint.textContent =
        'No hay un voicing disponible para esta combinación en 15 trastes.';
    }
  } else {
    updateShapeHint(diagram.shape);
    positionText = diagram.shape ? `forma ${diagram.shape.id}` : 'todas las formas';
  }

  document.title = `${diagram.collection.title} · Mástil Studio`;

  if (announce) {
    setFeedback(
      `Listo: ${diagram.collection.title} · ${diagram.collection.notes.length} notas · ${positionText}.`,
      diagram.voicing === null && diagram.collection.family.id === 'cuatriad' ? 'error' : 'ok',
    );
  } else {
    setFeedback(`${diagram.collection.title} · ${positionText}.`, 'ok');
  }
}

function applyQuery(rawQuery) {
  let parsed;
  try {
    parsed = parseQuery(rawQuery);
  } catch (error) {
    setFeedback(error.message, 'error');
    return;
  }

  state.rootValue = rootOptionValue(parsed.root);
  state.family = parsed.family;
  state.quality = parsed.quality;
  state.shapeId = 'all';
  syncControls();
  render({ announce: true });
}

function setFamily(familyId) {
  state.family = familyId;
  state.quality = resolveQuality(familyId, state.quality);
  syncQualityOptions();
  syncControls();
  render();
  elements.query.value = canonicalQuery();
}

function filenameStem() {
  if (!currentDiagram) return 'plantilla-diapason';

  const root = currentDiagram.collection.root.name
    .replaceAll('♯', 's')
    .replaceAll('♭', 'b')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const family = currentDiagram.collection.family.label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const quality = currentDiagram.collection.quality.fullLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const shape = currentDiagram.shape ? `-caged-${currentDiagram.shape.id.toLowerCase()}` : '';

  return `${family}-${quality}-${root}${shape}`
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function canUseSavePicker() {
  return typeof window.showSaveFilePicker === 'function';
}

async function chooseSaveHandle({ filename, description, mimeType, extension, id }) {
  return window.showSaveFilePicker({
    suggestedName: filename,
    id,
    types: [{
      description,
      accept: { [mimeType]: [extension] },
    }],
  });
}

async function writeToHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function downloadSvg() {
  if (!currentDiagram) return;

  const filename = `${filenameStem()}.svg`;
  const blob = new Blob([currentDiagram.svg], {
    type: 'image/svg+xml;charset=utf-8',
  });

  if (!canUseSavePicker()) {
    downloadBlob(blob, filename);
    setFeedback(
      'SVG descargado en la carpeta de descargas del navegador. Para elegir carpeta, usá Chrome o Edge.',
      'ok',
    );
    return;
  }

  let handle;
  try {
    handle = await chooseSaveHandle({
      filename,
      description: 'Plantilla SVG',
      mimeType: 'image/svg+xml',
      extension: '.svg',
      id: 'mastil-svg',
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      setFeedback('Guardado cancelado.', '');
      return;
    }
    downloadBlob(blob, filename);
    setFeedback(
      'No se pudo abrir el selector de Windows; se descargó en la carpeta de descargas.',
      'error',
    );
    return;
  }

  try {
    await writeToHandle(handle, blob);
    setFeedback(`SVG guardado como ${handle.name}.`, 'ok');
  } catch {
    setFeedback('No se pudo escribir el SVG en la ubicación elegida.', 'error');
  }
}

async function downloadPng() {
  if (!currentDiagram) return;

  const filename = `${filenameStem()}.png`;
  const button = elements.downloadPng;
  const original = button.innerHTML;
  let handle = null;

  // The file picker must be opened while the click still counts as a user
  // gesture, before the async image/Canvas generation starts.
  if (canUseSavePicker()) {
    try {
      handle = await chooseSaveHandle({
        filename,
        description: 'Imagen PNG',
        mimeType: 'image/png',
        extension: '.png',
        id: 'mastil-png',
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        setFeedback('Guardado cancelado.', '');
        return;
      }
      handle = null;
    }
  }

  button.disabled = true;
  button.textContent = 'Generando…';

  try {
    const scale = 2;
    const width = currentDiagram.width || 1520;
    const height = currentDiagram.height || 760;
    const svgBlob = new Blob([currentDiagram.svg], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.decoding = 'async';

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f6f1e6';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(url);

    const pngBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    if (!pngBlob) throw new Error('No se pudo serializar el PNG.');

    if (handle) {
      await writeToHandle(handle, pngBlob);
      setFeedback(
        `PNG 2× guardado como ${handle.name} (${canvas.width} × ${canvas.height} px).`,
        'ok',
      );
    } else {
      downloadBlob(pngBlob, filename);
      setFeedback(
        `PNG 2× descargado (${canvas.width} × ${canvas.height} px) en la carpeta de descargas.`,
        'ok',
      );
    }
  } catch {
    setFeedback('No se pudo generar el PNG. El SVG sigue disponible.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function reset() {
  Object.assign(state, DEFAULT_STATE);
  elements.query.value = 'Escala A';
  syncControls();
  render({ announce: true });
}

function bindEvents() {
  elements.queryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyQuery(elements.query.value);
  });

  for (const chip of document.querySelectorAll('[data-query]')) {
    chip.addEventListener('click', () => {
      elements.query.value = chip.dataset.query;
      applyQuery(chip.dataset.query);
    });
  }

  elements.root.addEventListener('change', () => {
    state.rootValue = elements.root.value;
    render();
    elements.query.value = canonicalQuery();
  });

  elements.quality.addEventListener('change', () => {
    state.quality = elements.quality.value;
    render();
    elements.query.value = canonicalQuery();
  });

  elements.familyGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-family]');
    if (!button) return;
    setFamily(button.dataset.family);
  });

  elements.dropGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-drop]');
    if (!button) return;
    state.voicingDrop = button.dataset.drop;
    syncControls();
    render();
  });

  elements.rootStringGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-root-string]');
    if (!button) return;
    state.voicingRootString = Number(button.dataset.rootString);
    syncControls();
    render();
  });

  elements.shapeGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-shape]');
    if (!button) return;
    state.shapeId = button.dataset.shape;
    syncControls();
    render();
  });

  elements.includeOpen.addEventListener('change', () => {
    state.includeOpen = elements.includeOpen.checked;
    render();
  });

  elements.labelModeGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-label-mode]');
    if (!button) return;
    state.labelMode = button.dataset.labelMode;
    syncControls();
    render();
  });

  elements.showCaged.addEventListener('change', () => {
    state.showCagedOverlay = elements.showCaged.checked;
    syncControls();
    render();
  });

  elements.colorRoles.addEventListener('change', () => {
    state.colorRoles = elements.colorRoles.checked;
    render();
  });

  elements.stringGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-string]');
    if (!button) return;
    const index = Number(button.dataset.string);
    state.activeStrings = state.activeStrings.map((active, current) =>
      current === index ? !active : active,
    );
    syncControls();
    render();
  });

  elements.circleScale.addEventListener('input', () => {
    state.circleScale = Number(elements.circleScale.value);
    syncRange(elements.circleScale, elements.circleScaleValue, state.circleScale);
    render();
  });

  elements.noteTextScale.addEventListener('input', () => {
    state.noteTextScale = Number(elements.noteTextScale.value);
    syncRange(elements.noteTextScale, elements.noteTextScaleValue, state.noteTextScale);
    render();
  });

  elements.typeScale.addEventListener('input', () => {
    state.typeScale = Number(elements.typeScale.value);
    syncRange(elements.typeScale, elements.typeScaleValue, state.typeScale);
    render();
  });

  elements.reset.addEventListener('click', reset);
  elements.downloadSvg.addEventListener('click', downloadSvg);
  elements.downloadPng.addEventListener('click', downloadPng);
}

function init() {
  populateRoots();
  syncControls();
  bindEvents();
  render();
  setFeedback('Prueba lista: escala mayor de A en todas las formas CAGED.', 'ok');
}

init();
