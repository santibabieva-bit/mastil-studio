/**
 * Self-contained SVG renderer. The output includes its own <style> block,
 * background, title and accessibility metadata, so the downloaded file can be
 * opened or printed on its own.
 */

import {
  buildFretboard,
  STRINGS,
} from './caged.js';
import { chromaticName, mod } from './theory.js';

export const CANVAS = {
  width: 1520,
  height: 540,
  board: {
    left: 100,
    right: 1440,
    top: 210,
    bottom: 400,
  },
  // The open-string dots sit almost against the capo. The exact x is
  // recomputed from the note radius in computeVisualGeometry().
  openNoteX: 198.5,
  nutX: 214,
  fretCount: 15,
  fretboardRight: 1410,
  stringTop: 226,
  stringGap: 32.5,
  noteRadius: 14,
  capoWidth: 13,
  marker: {
    singleRadius: 9.6,
    doubleRadius: 9.2,
    doubleGap: 32.5,
    bassOffset: 1,
  },
  shapeTagY: 190,
  fretNumberY: 434,
  footerLineY: 472,
  footerTextY: 500,
};

const DEFAULT_VISUAL = {
  circleScale: 1,
  noteTextScale: 1,
  typeScale: 1.1,
};

/**
 * Resolve the three independent zoom scales and the dependent open-string
 * position. The open dots stay almost tangent to the capo at every size.
 */
export function computeVisualGeometry(visual = {}) {
  const circleScale = clamp(
    Number(visual.circleScale ?? DEFAULT_VISUAL.circleScale),
    0.5,
    2,
  );
  const noteTextScale = clamp(
    Number(visual.noteTextScale ?? DEFAULT_VISUAL.noteTextScale),
    0.5,
    2,
  );
  const typeScale = clamp(
    Number(visual.typeScale ?? DEFAULT_VISUAL.typeScale),
    0.5,
    2,
  );
  const noteRadius = CANVAS.noteRadius * circleScale;
  const openNoteX =
    CANVAS.nutX - CANVAS.capoWidth / 2 - 1.5 - noteRadius;

  return {
    circleScale,
    noteTextScale,
    typeScale,
    noteRadius,
    openNoteX,
  };
}

export function normalizeMaxFret(maxFret) {
  return clamp(Math.round(Number(maxFret) || CANVAS.fretCount), 12, 24);
}

/**
 * Dynamic canvas layout. A 15-fret neck is still 1520 px wide; 24 frets extend
 * to roughly 1872 px instead of squeezing the last frets.
 */
export function createLayout(maxFret = CANVAS.fretCount, visual = {}) {
  const fretCount = normalizeMaxFret(maxFret);
  const fretboardRight = fretLineX(fretCount);
  const rightMargin = CANVAS.board.right - CANVAS.fretboardRight;
  const boardRight = fretboardRight + rightMargin;
  const canvasWidth = boardRight + (CANVAS.width - CANVAS.board.right);

  return {
    ...computeVisualGeometry(visual),
    maxFret: fretCount,
    width: Number(canvasWidth.toFixed(2)),
    height: CANVAS.height,
    board: {
      ...CANVAS.board,
      right: Number(boardRight.toFixed(2)),
    },
    fretboardRight: Number(fretboardRight.toFixed(2)),
  };
}

const COLORS = {
  paper: '#f6f1e6',
  paperDeep: '#eee6d6',
  ink: '#17231e',
  inkSoft: '#4c574f',
  inkMuted: '#7d857d',
  board: '#e9e1d1',
  boardEdge: '#d2c6b2',
  string: '#2a2924',
  fret: '#a89b87',
  fretStrong: '#857967',
  note: '#141412',
  noteBorder: '#fbf7ef',
  root: '#d84a3e',
  roleThird: '#3f8f5a',
  roleFifth: '#df812f',
  roleSeventh: '#3b78b8',
  orange: '#df812f',
  orangeDeep: '#b65d18',
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// Physical scale factor in px: keep the existing 15-fret geometry and extend
// the neck to the right for higher frets instead of compressing everything.
const BASE_SCALE_PX =
  (CANVAS.fretboardRight - CANVAS.nutX) /
  (1 - 2 ** (-CANVAS.fretCount / 12));

/**
 * Equal-tempered fret positions. Fret 15 sits at the original x coordinate and
 * higher frets extend the neck to the right.
 */
export function fretLineX(fret) {
  if (fret <= 0) return CANVAS.nutX;
  return CANVAS.nutX + (1 - 2 ** (-fret / 12)) * BASE_SCALE_PX;
}

export function fretCenterX(fret, openNoteX = CANVAS.openNoteX) {
  if (fret === 0) return openNoteX;
  return (fretLineX(fret - 1) + fretLineX(fret)) / 2;
}

function fretWindowCenterX(start, end, openNoteX) {
  return (fretCenterX(start, openNoteX) + fretCenterX(end, openNoteX)) / 2;
}

export function fretMetrics(maxFret = CANVAS.fretCount) {
  return Array.from({ length: maxFret }, (_, index) => {
    const fret = index + 1;
    return {
      fret,
      left: fretLineX(fret - 1),
      right: fretLineX(fret),
      center: fretCenterX(fret),
      width: fretLineX(fret) - fretLineX(fret - 1),
    };
  });
}

function stringY(stringIndex) {
  return CANVAS.stringTop + stringIndex * CANVAS.stringGap;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (sorted.length <= 2) return sorted;

  const cross = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function smoothClosedPath(points, tension = 0.18) {
  if (!points.length) return '';
  if (points.length < 3) {
    return points.length === 2
      ? `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
      : '';
  }

  const format = (value) => Number(value.toFixed(2));
  const count = points.length;
  let path = `M ${format(points[0].x)} ${format(points[0].y)}`;

  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${format(cp1x)} ${format(cp1y)}, ${format(cp2x)} ${format(cp2y)}, ${format(p2.x)} ${format(p2.y)}`;
  }

  return `${path} Z`;
}

function shapeHullPath(
  shape,
  { noteRadius, openNoteX, maxFret },
  activeStrings,
) {
  if (!shape || !shape.notes.length) return '';

  const padding = noteRadius + 13;
  const cloud = [];
  const angles = 12;
  for (const note of shape.notes) {
    if (note.fret > maxFret) continue;
    if (activeStrings && activeStrings[note.stringIndex] === false) continue;
    const x = fretCenterX(note.fret, openNoteX);
    const y = stringY(note.stringIndex);
    for (let i = 0; i < angles; i += 1) {
      const angle = (Math.PI * 2 * i) / angles;
      cloud.push({
        x: x + Math.cos(angle) * padding,
        y: y + Math.sin(angle) * padding,
      });
    }
  }

  return smoothClosedPath(convexHull(cloud));
}

const SCALE_DEGREE_LABELS = {
  0: '1',
  1: '♭2',
  2: '2',
  3: '♭3',
  4: '3',
  5: '4',
  6: '♯4',
  7: '5',
  8: '♭6',
  9: '6',
  10: '♭7',
  11: '7',
};

const CHORD_DEGREE_LABELS = {
  0: '1',
  3: '3m',
  4: '3M',
  6: '5d',
  7: '5',
  8: '5a',
  9: '7d',
  10: '7m',
  11: '7M',
};

function degreeLabel(interval, familyId) {
  const labels = familyId === 'scale'
    ? SCALE_DEGREE_LABELS
    : CHORD_DEGREE_LABELS;
  return labels[interval] ?? '';
}

function roleClass(interval, familyId) {
  const isScale = familyId === 'scale';

  if (interval === 3 || interval === 4) return 'role-third';

  if (isScale) {
    if (interval === 7) return 'role-fifth';
    if (interval === 10 || interval === 11) return 'role-seventh';
    return '';
  }

  if (interval === 6 || interval === 7 || interval === 8) return 'role-fifth';
  if (interval === 9 || interval === 10 || interval === 11) return 'role-seventh';
  return '';
}

function noteLabelSize(noteTextScale) {
  return Number((14 * noteTextScale).toFixed(2));
}

function renderNote(note, spelled, options) {
  const {
    shapeWindow,
    noteRadius,
    openNoteX,
    noteTextScale,
    labelMode,
    colorRoles,
    familyId,
  } = options;
  const x = fretCenterX(note.fret, openNoteX);
  const y = stringY(note.stringIndex);
  const degree = spelled ? degreeLabel(spelled.interval, familyId) : '';
  const label = labelMode === 'degree' && degree
    ? degree
    : spelled?.name ?? chromaticName(note.pc);
  const inWindow = !shapeWindow || (
    note.fret >= shapeWindow.start && note.fret <= shapeWindow.end
  );
  const root = note.pc === options.rootPc;
  const role = colorRoles && spelled
    ? roleClass(spelled.interval, familyId)
    : '';

  const classes = ['note'];
  if (root) classes.push('is-root');
  if (role) classes.push(role);
  if (!inWindow) classes.push('is-context');

  return `
    <g class="${classes.join(' ')}" transform="translate(${x} ${y})">
      ${root ? `<circle class="root-halo" r="${formatNumber(noteRadius + 4.2)}" />` : ''}
      <circle class="note-disc" r="${formatNumber(noteRadius)}" />
      <text class="note-label" text-anchor="middle" dominant-baseline="central" font-size="${noteLabelSize(noteTextScale)}">${escapeXml(label)}</text>
    </g>`;
}

function renderFretMarkers(maxFret) {
  const centerY = (stringY(2) + stringY(3)) / 2 + CANVAS.marker.bassOffset;
  const singleRadius = CANVAS.marker.singleRadius;
  const doubleRadius = CANVAS.marker.doubleRadius;
  const doubleGap = CANVAS.marker.doubleGap;

  const singles = [5, 7, 9, 15]
    .filter((fret) => fret <= maxFret)
    .map((fret) => {
      const x = fretCenterX(fret);
      return `<circle class="fret-marker" cx="${x}" cy="${centerY}" r="${singleRadius}" />`;
    });

  const double = maxFret >= 12
    ? [centerY - doubleGap, centerY + doubleGap].map(
      (y) => `<circle class="fret-marker fret-marker--double" cx="${fretCenterX(12)}" cy="${y}" r="${doubleRadius}" />`,
    )
    : [];

  return [...singles, ...double].join('\n');
}

function renderStringLabels(includeOpen, activeStrings) {
  return STRINGS.map((string) => {
    const y = stringY(string.index);
    const active = activeStrings?.[string.index] !== false;
    const opacity = (includeOpen ? 1 : 0.72) * (active ? 1 : 0.3);
    return `
      <g class="string-label" opacity="${formatNumber(opacity)}">
        <text x="${CANVAS.board.left - 28}" y="${y}" text-anchor="middle" dominant-baseline="central">${string.label}</text>
      </g>`;
  }).join('\n');
}

function renderOpenNotes(
  fretboard,
  collection,
  shapeWindow,
  rootPc,
  includeOpen,
  geometry,
  noteOptions,
) {
  if (!includeOpen) return '';

  const notes = [];
  for (const string of fretboard) {
    for (const note of string.notes) {
      if (note.fret !== 0) continue;
      const spelled = collection.noteByPc.get(mod(note.pc, 12));
      notes.push(renderNote(note, spelled, {
        shapeWindow,
        rootPc,
        ...geometry,
        ...noteOptions,
      }));
    }
  }
  return notes.join('\n');
}

function renderFretNotes(
  fretboard,
  collection,
  shapeWindow,
  rootPc,
  geometry,
  noteOptions,
) {
  const notes = [];
  for (const string of fretboard) {
    for (const note of string.notes) {
      if (note.fret === 0) continue;
      const spelled = collection.noteByPc.get(mod(note.pc, 12));
      notes.push(renderNote(note, spelled, {
        shapeWindow,
        rootPc,
        ...geometry,
        ...noteOptions,
      }));
    }
  }
  return notes.join('\n');
}

function titleFontSize(title) {
  if (title.length > 38) return 30;
  if (title.length > 30) return 34;
  return 40;
}

function shapeBadgeText(shape) {
  if (!shape) return 'CAGED · TODAS';
  return `CAGED · FORMA ${shape.id}`;
}

function renderShapeTags(shape, shapes, openNoteX, canvasWidth) {
  const narrow = canvasWidth < 1000;
  if (shape) {
    return `
      <g class="shape-tag" transform="translate(${clamp(fretWindowCenterX(shape.window.start, shape.window.end, openNoteX), narrow ? 70 : 292, canvasWidth - (narrow ? 70 : 172))} ${CANVAS.shapeTagY})">
        <rect x="-52" y="-14" width="104" height="28" rx="14" />
        <text text-anchor="middle" dominant-baseline="central">FORMA ${shape.id}</text>
      </g>`;
  }

  if (!shapes?.length) return '';

  return shapes
    .map((item) => {
      const x = clamp(fretWindowCenterX(item.window.start, item.window.end, openNoteX), narrow ? 50 : 340, canvasWidth - (narrow ? 50 : 190));
      return `
        <g class="shape-tag shape-tag--all" transform="translate(${x} ${CANVAS.shapeTagY})">
          <rect x="-43" y="-13" width="86" height="26" rx="13" />
          <text text-anchor="middle" dominant-baseline="central">${item.id} · ${item.window.start}–${item.window.end}</text>
        </g>`;
    })
    .join('\n');
}

function legendShapeText(shape) {
  return shape ? `Forma CAGED ${shape.id}` : 'Posiciones CAGED';
}

/**
 * Render a complete, standalone SVG document.
 *
 * @param {object} params
 * @param {ReturnType<import('./theory.js').createNoteCollection>} params.collection
 * @param {object|null} params.shape
 * @param {boolean} [params.includeOpen]
 * @param {number} [params.maxFret]
 */
export function renderFretboardSvg({
  collection,
  shape = null,
  shapes = [],
  includeOpen = true,
  maxFret = 15,
  visual = {},
  activeStrings = STRINGS.map(() => true),
  showCagedOverlay = false,
  labelMode = 'name',
  colorRoles = true,
  notePositions = null,
  headerBadge = null,
}) {
  const rootPc = collection.root.pc;
  const noteOptions = {
    labelMode,
    colorRoles,
    familyId: collection.family.id,
  };
  const layout = createLayout(maxFret, visual);
  const narrow = layout.width < 1000;
  const headerX = narrow ? 40 : 64;
  const headerTextX = narrow ? 90 : 114;
  const headerTitleX = narrow ? 41 : 65;
  const footerX = narrow ? 40 : 64;
  const { noteRadius, openNoteX, typeScale, maxFret: fretCount } = layout;
  const fs = (value) => Number((value * typeScale).toFixed(2));
  // Header titles grow a little less than note labels at extreme zooms so
  // they do not collide inside the fixed 174 px header band.
  const headerScale = Math.min(typeScale, 1.4);
  const headerFs = (value) => Number((value * headerScale).toFixed(2));
  const titleSize = titleFontSize(collection.title) * headerScale;
  const subtitleSize = 16 * headerScale;
  const titleY = 111 + Math.max(0, titleSize - 40) * 0.9;
  const subtitleY =
    148
    + Math.max(0, titleSize - 40) * 0.9
    + Math.max(0, subtitleSize - 16) * 0.4;

  const fretboard = notePositions
    ? STRINGS.map((string) => {
      const active = activeStrings?.[string.index] !== false;
      const notes = active
        ? notePositions
          .filter((note) => note.stringIndex === string.index)
          .map((note) => ({
            ...note,
            string,
            isRoot: note.pc === rootPc,
          }))
          .sort((a, b) => a.fret - b.fret)
        : [];
      return { string, active, notes };
    })
    : buildFretboard(rootPc, collection.notes.map((note) => note.pc), {
      includeOpen,
      maxFret: fretCount,
      activeStrings,
    });
  const shapeWindow = shape?.window ?? null;
  const hullPath = showCagedOverlay
    ? shapeHullPath(shape, layout, activeStrings)
    : '';
  const title = collection.title;
  const subtitle = collection.subtitle;
  const familyNoun = collection.family.id === 'cuatriad'
    ? 'cuatríada'
    : collection.family.id === 'scale'
      ? 'escala'
      : collection.family.id === 'triad'
        ? 'triada'
        : 'arpegio';
  const eyebrowText = collection.family.id === 'cuatriad'
    ? 'PLANTILLA DE DIAPASÓN · CUATRÍADA'
    : 'PLANTILLA DE DIAPASÓN · CAGED';
  const description = `${title}. ${subtitle}. Diapasón de ${fretCount} trastes en afinación estándar, con las tónicas marcadas en rojo${shape && showCagedOverlay ? ` y la forma CAGED ${shape.id} resaltada en naranja` : ''}.`;

  const openNotes = renderOpenNotes(
    fretboard,
    collection,
    shapeWindow,
    rootPc,
    includeOpen,
    layout,
    noteOptions,
  );
  const frettedNotes = renderFretNotes(
    fretboard,
    collection,
    shapeWindow,
    rootPc,
    layout,
    noteOptions,
  );
  const shapeNotes = shape?.notes ?? [];

  const markers = renderFretMarkers(fretCount);
  const stringLabels = renderStringLabels(includeOpen, activeStrings);

  const stringLines = STRINGS.map((string) => {
    const y = stringY(string.index);
    const active = activeStrings?.[string.index] !== false;
    return `<line class="string ${active ? '' : 'string--inactive'}" x1="${layout.board.left}" y1="${y}" x2="${layout.board.right}" y2="${y}" stroke-width="${string.thickness}" />`;
  }).join('\n');

  const fretLines = Array.from({ length: fretCount }, (_, index) => {
    const fret = index + 1;
    const x = fretLineX(fret);
    const isTwelfth = fret === 12;
    return `<line class="fret ${isTwelfth ? 'fret-twelfth' : ''}" x1="${x}" y1="${layout.board.top}" x2="${x}" y2="${layout.board.bottom}" />`;
  }).join('\n');

  const fretNumbers = Array.from({ length: fretCount }, (_, index) => {
    const fret = index + 1;
    return `<text class="fret-number" x="${fretCenterX(fret)}" y="${CANVAS.fretNumberY}" text-anchor="middle">${fret}</text>`;
  }).join('\n');

  const shading = Array.from({ length: fretCount }, (_, index) => {
    const fret = index + 1;
    if (fret % 2 === 0) return '';
    const x = fretLineX(fret - 1);
    const width = fretLineX(fret) - x;
    return `<rect class="fret-shade" x="${x}" y="${layout.board.top}" width="${width}" height="${layout.board.bottom - layout.board.top}" />`;
  }).join('');

  const shapeTag = showCagedOverlay
    ? renderShapeTags(shape, shapes, openNoteX, layout.width)
    : '';

  const noteLegendX = narrow ? 40 : 78;
  const rootLegendX = narrow ? 180 : 284;
  const roleLegendXs = narrow ? [300, 355, 410] : [455, 545, 635];
  const roleLegend = colorRoles
    ? `
    <g transform="translate(${roleLegendXs[0]} ${CANVAS.footerTextY})">
      <circle cx="0" cy="0" r="10" fill="${COLORS.note}" stroke="${COLORS.roleThird}" stroke-width="3.2" />
      <text class="legend-text" x="18" y="4">3ª</text>
    </g>
    <g transform="translate(${roleLegendXs[1]} ${CANVAS.footerTextY})">
      <circle cx="0" cy="0" r="10" fill="${COLORS.note}" stroke="${COLORS.roleFifth}" stroke-width="3.2" />
      <text class="legend-text" x="18" y="4">5ª</text>
    </g>
    <g transform="translate(${roleLegendXs[2]} ${CANVAS.footerTextY})">
      <circle cx="0" cy="0" r="10" fill="${COLORS.note}" stroke="${COLORS.roleSeventh}" stroke-width="3.2" />
      <text class="legend-text" x="18" y="4">7ª</text>
    </g>`
    : '';
  const cagedLegendX = narrow ? 455 : colorRoles ? 760 : 455;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="dsh-title dsh-desc">
  <title id="dsh-title">${escapeXml(title)}</title>
  <desc id="dsh-desc">${escapeXml(description)}</desc>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.paper}" />
      <stop offset="0.64" stop-color="${COLORS.paper}" />
      <stop offset="1" stop-color="${COLORS.paperDeep}" />
    </linearGradient>
    <linearGradient id="board" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eee7d9" />
      <stop offset="0.5" stop-color="${COLORS.board}" />
      <stop offset="1" stop-color="#e3d9c7" />
    </linearGradient>
    <linearGradient id="capo" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0f1210" />
      <stop offset="0.34" stop-color="#333630" />
      <stop offset="1" stop-color="#101310" />
    </linearGradient>
    <radialGradient id="inlay-clay" cx="35%" cy="28%" r="74%">
      <stop offset="0" stop-color="#d9c6a7" />
      <stop offset="0.62" stop-color="#bda57f" />
      <stop offset="1" stop-color="#947753" />
    </radialGradient>
    <filter id="board-shadow" x="-10%" y="-20%" width="120%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="#4a3c27" flood-opacity="0.15" />
    </filter>
    <pattern id="paper-grain" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="0.8" fill="${COLORS.ink}" opacity="0.045" />
      <circle cx="15" cy="17" r="0.55" fill="${COLORS.ink}" opacity="0.035" />
    </pattern>
    <style>
      .eyebrow { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(12)}px; font-weight: 700; letter-spacing: 2.5px; fill: ${COLORS.orangeDeep}; }
      .title { font-family: Georgia, "Times New Roman", serif; font-weight: 700; fill: ${COLORS.ink}; letter-spacing: -0.8px; }
      .subtitle { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(16)}px; font-weight: 600; letter-spacing: 1.8px; fill: ${COLORS.inkSoft}; }
      .meta { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(11)}px; font-weight: 700; letter-spacing: 1.8px; fill: ${COLORS.inkMuted}; }
      .meta-strong { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(13)}px; font-weight: 700; letter-spacing: 1.1px; fill: ${COLORS.ink}; }
      .board-base { fill: url(#board); stroke: ${COLORS.boardEdge}; stroke-width: 1.2; filter: url(#board-shadow); }
      .fret-shade { fill: ${COLORS.ink}; opacity: 0.018; }
      .string { stroke: ${COLORS.string}; stroke-linecap: round; opacity: 0.9; }
      .string--inactive { opacity: 0.16; }
      .fret { stroke: ${COLORS.fret}; stroke-width: 1.5; }
      .fret-twelfth { stroke: ${COLORS.fretStrong}; stroke-width: 2.2; }
      .fret-marker { fill: url(#inlay-clay); stroke: #8d7350; stroke-width: 0.9; opacity: 0.24; }
      .fret-marker--double { opacity: 0.2; }
      .fret-number { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(16)}px; font-weight: 600; fill: ${COLORS.inkMuted}; letter-spacing: 0.5px; }
      .string-label text { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(14)}px; font-weight: 700; fill: ${COLORS.inkMuted}; letter-spacing: 0.5px; }
      .capo { fill: url(#capo); }
      .capo-label { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(9)}px; font-weight: 700; letter-spacing: 2px; fill: ${COLORS.inkMuted}; }
      .open-label { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(8.5)}px; font-weight: 700; letter-spacing: 1.6px; fill: ${COLORS.inkMuted}; }
      .note-disc { fill: ${COLORS.note}; stroke: ${COLORS.noteBorder}; stroke-width: 1; }
      .note-label { font-family: "Segoe UI", Arial, sans-serif; font-weight: 800; fill: #fffdf8; letter-spacing: -0.2px; }
      .root-halo { fill: none; stroke: ${COLORS.root}; stroke-width: 2; opacity: 0.2; }
      .is-root .note-disc { stroke: ${COLORS.root}; stroke-width: 3.2; }
      .is-root .note-label { fill: #fff; }
      .role-third .note-disc { stroke: ${COLORS.roleThird}; stroke-width: 2.4; }
      .role-fifth .note-disc { stroke: ${COLORS.roleFifth}; stroke-width: 2.4; }
      .role-seventh .note-disc { stroke: ${COLORS.roleSeventh}; stroke-width: 2.4; }
      .note.is-context { opacity: 0.14; }
      .shape-hull { fill: ${COLORS.orange}; fill-opacity: 0.08; stroke: ${COLORS.orange}; stroke-width: 4.3; stroke-linejoin: round; }
      .shape-tag rect { fill: #fffaf0; stroke: ${COLORS.orange}; stroke-width: 1.5; }
      .shape-tag text { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(10)}px; font-weight: 800; letter-spacing: 1.5px; fill: ${COLORS.orangeDeep}; }
      .shape-tag--all rect { fill-opacity: 0.78; stroke-opacity: 0.72; }
      .shape-tag--all text { font-size: ${fs(9)}px; letter-spacing: 0.9px; fill: ${COLORS.inkSoft}; }
      .legend-text { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fs(12)}px; font-weight: 600; fill: ${COLORS.inkSoft}; }
      .legend-strong { font-weight: 800; fill: ${COLORS.ink}; }
      .footer-mark { font-family: Georgia, "Times New Roman", serif; font-size: ${fs(15)}px; font-weight: 700; fill: ${COLORS.ink}; letter-spacing: 0.2px; }
    </style>
  </defs>

  <rect width="${layout.width}" height="${layout.height}" fill="url(#paper)" />
  <rect width="${layout.width}" height="${layout.height}" fill="url(#paper-grain)" />

  <g class="header">
    <rect x="${headerX}" y="54" width="38" height="3" rx="1.5" fill="${COLORS.orange}" />
    <text class="eyebrow" x="${headerTextX}" y="61" font-size="${headerFs(12)}">${eyebrowText}</text>
    <text class="title" x="${headerX}" y="${titleY}" font-size="${headerFs(titleFontSize(title))}">${escapeXml(title)}</text>
    <text class="subtitle" x="${headerTitleX}" y="${subtitleY}" font-size="${headerFs(16)}">${escapeXml(subtitle)}</text>
    ${
      narrow
        ? `<text class="meta" x="${layout.width - headerX}" y="61" text-anchor="end" font-size="${headerFs(11)}">${fretCount} TRASTES · ESTÁNDAR</text>
    <text class="meta-strong" x="${layout.width - headerX}" y="148" text-anchor="end" font-size="${headerFs(13)}">${escapeXml(headerBadge ?? shapeBadgeText(shape))}</text>`
        : `<text class="meta" x="${layout.width - 64}" y="59" text-anchor="end" font-size="${headerFs(11)}">${fretCount} TRASTES · AFINACIÓN ESTÁNDAR</text>
    <text class="meta-strong" x="${layout.width - 64}" y="88" text-anchor="end" font-size="${headerFs(13)}">${escapeXml(headerBadge ?? shapeBadgeText(shape))}</text>
    <text class="meta" x="${layout.width - 64}" y="114" text-anchor="end" font-size="${headerFs(11)}">E B G D A E · DE AGUDA A GRAVE</text>`
    }
    <line x1="${headerX}" y1="174" x2="${layout.width - headerX}" y2="174" stroke="${COLORS.boardEdge}" stroke-width="1" />
  </g>

  <g class="neck">
    <rect class="board-base" x="${layout.board.left}" y="${layout.board.top}" width="${layout.board.right - layout.board.left}" height="${layout.board.bottom - layout.board.top}" rx="22" />
    ${shading}
    ${markers}
    ${stringLines}
    ${fretLines}
    <rect class="capo" x="${CANVAS.nutX - CANVAS.capoWidth / 2}" y="${layout.board.top - 8}" width="${CANVAS.capoWidth}" height="${layout.board.bottom - layout.board.top + 16}" rx="5.5" />
    <line x1="${layout.board.left + 18}" y1="${layout.board.top}" x2="${layout.board.right - 18}" y2="${layout.board.top}" stroke="${COLORS.boardEdge}" stroke-width="1" opacity="0.65" />
    <line x1="${layout.board.left + 18}" y1="${layout.board.bottom}" x2="${layout.board.right - 18}" y2="${layout.board.bottom}" stroke="${COLORS.boardEdge}" stroke-width="1" opacity="0.65" />
    ${shapeTag}
    ${hullPath ? `<path class="shape-hull" d="${hullPath}" />` : ''}
    ${openNotes}
    ${frettedNotes}
    ${stringLabels}
    <text class="capo-label" x="${CANVAS.nutX}" y="${layout.board.top - 18}" text-anchor="middle">CEJILLA</text>
    <text class="open-label" x="${layout.board.left + (narrow ? 12 : 44)}" y="${layout.board.top - 18}" text-anchor="middle">AL AIRE</text>
  </g>

  <g class="fret-numbers">
    ${fretNumbers}
  </g>

  <g class="footer">
    <line x1="${footerX}" y1="${CANVAS.footerLineY}" x2="${layout.width - footerX}" y2="${CANVAS.footerLineY}" stroke="${COLORS.boardEdge}" stroke-width="1" />
    <g transform="translate(${noteLegendX} ${CANVAS.footerTextY})">
      <circle cx="0" cy="0" r="10" fill="${COLORS.note}" />
      <text class="legend-text" x="19" y="4">${narrow ? 'Nota' : `Nota de la <tspan class="legend-strong">${familyNoun}</tspan>`}</text>
    </g>
    <g transform="translate(${rootLegendX} ${CANVAS.footerTextY})">
      <circle cx="0" cy="0" r="10" fill="${COLORS.note}" stroke="${COLORS.root}" stroke-width="3.4" />
      <text class="legend-text" x="19" y="4"><tspan class="legend-strong">Tónica</tspan>${narrow ? '' : ' resaltada'}</text>
    </g>
    ${roleLegend}
    ${
      showCagedOverlay
        ? `<g transform="translate(${cagedLegendX} ${CANVAS.footerTextY})">
      <rect x="-12" y="-9" width="24" height="18" rx="6" fill="${COLORS.orange}" fill-opacity="0.1" stroke="${COLORS.orange}" stroke-width="2.5" />
      <text class="legend-text" x="24" y="4">${escapeXml(narrow && shape ? `Forma ${shape.id}` : legendShapeText(shape))}</text>
    </g>`
        : ''
    }
    <text class="footer-mark" x="${layout.width - footerX}" y="${CANVAS.footerTextY + 5}" text-anchor="end">MÁSTIL STUDIO</text>
  </g>

  <!-- ${shapeNotes.length} notas definen la forma CAGED seleccionada. -->
</svg>`;
}

export { COLORS, CANVAS as LAYOUT };
