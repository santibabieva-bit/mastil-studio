import { createNoteCollection } from './theory.js';
import { completeScaleWindow, getAllCagedShapes } from './caged.js';
import { createLayout, renderFretboardSvg } from './svg.js';
import { buildRootVoicing } from './voicings.js';
import { buildScaleFingering } from './fingering.js';

/**
 * Build every piece needed by the preview and the export buttons.
 */
export function buildDiagram({
  root,
  family = 'scale',
  quality,
  shapeId = 'all',
  includeOpen = true,
  visual = {},
  activeStrings = [true, true, true, true, true, true],
  showCagedOverlay = false,
  maxFret = 15,
  labelMode = 'name',
  colorRoles = true,
  voicing = { drop: 'drop2', rootString: 6 },
}) {
  const collection = createNoteCollection(root, family, quality);

  if (collection.family.id === 'cuatriad') {
    const layout = createLayout(maxFret, visual);
    const builtVoicing = buildRootVoicing({
      rootPc: collection.root.pc,
      qualityId: collection.quality.id,
      drop: voicing.drop,
      rootString: voicing.rootString,
      maxFret: layout.maxFret,
    });
    const activeStrings = builtVoicing?.activeStrings
      ?? [false, false, false, false, false, false];
    const svg = renderFretboardSvg({
      collection,
      shape: null,
      shapes: [],
      includeOpen: true,
      visual,
      activeStrings,
      showCagedOverlay: false,
      labelMode,
      colorRoles,
      notePositions: builtVoicing?.notes ?? [],
      headerBadge: builtVoicing?.label?.toUpperCase() ?? 'SIN VOICING',
      maxFret: layout.maxFret,
    });

    return {
      collection,
      shape: null,
      shapes: [],
      svg,
      includeOpen: true,
      visual,
      activeStrings,
      showCagedOverlay: false,
      maxFret: layout.maxFret,
      width: layout.width,
      height: layout.height,
      labelMode,
      colorRoles,
      voicing: builtVoicing,
    };
  }

  const notePcs = collection.notes.map((note) => note.pc);
  let shapes = getAllCagedShapes(collection.root.pc, collection.cagedQuality);

  if (collection.family.id === 'scale') {
    shapes = shapes.map((candidate) =>
      completeScaleWindow(candidate, notePcs, { maxFret }),
    );
  }

  const shape = shapeId === 'all'
    ? null
    : shapes.find((candidate) => candidate.id === shapeId) ?? null;
  const fingering = shape && collection.family.id === 'scale'
    ? buildScaleFingering({ shape, notePcs })
    : null;
  const layout = createLayout(maxFret, visual);

  const svg = renderFretboardSvg({
    collection,
    shape,
    shapes,
    includeOpen,
    visual,
    activeStrings,
    showCagedOverlay,
    maxFret: layout.maxFret,
    labelMode,
    colorRoles,
    highlightPositions: fingering?.notes ?? null,
  });

  return {
    collection,
    shape,
    shapes,
    fingering,
    svg,
    includeOpen,
    visual,
    activeStrings,
    showCagedOverlay,
    maxFret: layout.maxFret,
    width: layout.width,
    height: layout.height,
    labelMode,
    colorRoles,
  };
}
