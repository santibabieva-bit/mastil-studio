import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagram } from '../src/diagram.js';
import {
  CANVAS,
  computeVisualGeometry,
  fretCenterX,
  fretLineX,
  fretMetrics,
} from '../src/svg.js';

test('all-positions SVG is standalone and omits the CAGED overlay by default', () => {
  const diagram = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'all',
  });
  const { svg, collection } = diagram;

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<title id="dsh-title">Escala mayor de A<\/title>/);
  assert.match(svg, /CAGED · TODAS/);
  assert.doesNotMatch(svg, /A · 11–15/);
  assert.doesNotMatch(svg, /C · 9–12/);
  assert.doesNotMatch(svg, /<path class="shape-hull"/);
  assert.match(svg, /class="note is-root"/);
  assert.match(svg, />15<\/text>/);
  assert.ok(collection.notes.length === 7);
  assert.ok(!svg.includes('@import'));
  assert.ok(!svg.includes('href="http'));
});

test('the CAGED overlay is optional and includes rail tags when enabled', () => {
  const { svg } = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'all',
    showCagedOverlay: true,
  });

  assert.match(svg, /A · 11–15/);
  assert.match(svg, /C · 9–12/);
  assert.match(svg, /Posiciones CAGED/);
});

test('selected E form adds a hull, a tag and dims the context when enabled', () => {
  const { svg } = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'E',
    showCagedOverlay: true,
  });

  assert.match(svg, /CAGED · FORMA E/);
  assert.match(svg, /FORMA E/);
  assert.match(svg, /class="shape-hull"/);
  assert.match(svg, /class="note is-context"/);
});

test('selected E form can keep the position dimming without the orange overlay', () => {
  const { svg } = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'E',
    showCagedOverlay: false,
  });

  assert.match(svg, /CAGED · FORMA E/);
  assert.doesNotMatch(svg, /class="shape-tag"/);
  assert.doesNotMatch(svg, /<path class="shape-hull"/);
  assert.match(svg, /class="note is-context"/);
});

test('hiding open strings removes open-note circles but keeps the 15 frets', () => {
  const withOpen = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    includeOpen: true,
  }).svg;
  const withoutOpen = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    includeOpen: false,
  }).svg;

  const { openNoteX } = computeVisualGeometry();
  assert.match(withOpen, new RegExp(`translate\\(${openNoteX} ${CANVAS.stringTop}\\)`));
  assert.doesNotMatch(withoutOpen, new RegExp(`translate\\(${openNoteX} ${CANVAS.stringTop}\\)`));
  assert.match(withoutOpen, />15<\/text>/);
});

test('a triad produces exactly three pitch-class pills worth of notes', () => {
  const { collection, svg } = buildDiagram({
    root: 'C#',
    family: 'triad',
    quality: 'minor',
  });
  assert.equal(collection.notes.length, 3);
  assert.match(svg, /C♯/);
  assert.match(svg, /G♯/);
});

test('neck is 20% taller than the compact version', () => {
  assert.equal(CANVAS.board.bottom - CANVAS.board.top, 228);
  assert.equal(CANVAS.width, 1520);
  assert.equal(CANVAS.height, 578);
});

test('real fret spacing narrows toward the body', () => {
  const metrics = fretMetrics(15);
  assert.equal(metrics.length, 15);

  for (let index = 1; index < metrics.length; index += 1) {
    assert.ok(
      metrics[index].width < metrics[index - 1].width,
      `fret ${index + 1} should be narrower than fret ${index}`,
    );
  }

  assert.ok(metrics[0].width > metrics[14].width * 2);
  assert.ok(Math.abs(fretLineX(15) - CANVAS.fretboardRight) < 0.01);
});

test('open-string dots sit almost against the capo at every circle size', () => {
  const capoLeft = CANVAS.nutX - CANVAS.capoWidth / 2;

  for (const circleScale of [0.5, 1, 2]) {
    const { openNoteX, noteRadius } = computeVisualGeometry({ circleScale });
    const gap = capoLeft - (openNoteX + noteRadius);
    assert.ok(gap >= 0 && gap <= 3, `unexpected gap at ${circleScale}: ${gap}`);
    assert.equal(gap, 1.5);
  }
});

test('fret markers are flat and the 12th fret has two of them', () => {
  const { svg } = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
  });

  assert.match(svg, /class="fret-marker" cx="[^"]+" cy="[^"]+" r="9.6"/);
  assert.equal((svg.match(/class="fret-marker fret-marker--double"/g) ?? []).length, 2);
  assert.equal((svg.match(/r="9.2"/g) ?? []).length, 2);
  // Flat inlay: one solid clay tone, no gradient, no volume shading.
  assert.match(svg, /\.fret-marker \{[^}]*fill: #bda57f/);
  assert.match(svg, /\.fret-marker \{[^}]*stroke: none/);
  assert.match(svg, /\.fret-marker \{[^}]*opacity: 0\.38/);
  assert.doesNotMatch(svg, /inlay-clay/);
  assert.doesNotMatch(svg, /\.fret-marker--double \{/);
});

test('every note gets a second ring: red for tonics and discreet for the rest', () => {
  const { svg } = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
  });

  const noteGroups = (svg.match(/<g class="note[^"]*" transform=/g) ?? []).length;
  const halos = (svg.match(/class="(?:root-halo|note-halo)"/g) ?? []).length;
  assert.ok(noteGroups > 0);
  assert.equal(halos, noteGroups);

  assert.match(svg, /class="note-halo" r="17\.4"/);
  assert.match(svg, /class="root-halo" r="18\.2"/);
  assert.match(svg, /\.note-halo \{[^}]*stroke-width: 1\.2[^}]*opacity: 0\.32/);
  assert.match(svg, /\.root-halo \{[^}]*stroke-width: 2[^}]*opacity: 0\.2/);
  assert.match(svg, /class="legend-halo"/);
});

test('the outer note ring grows with the circle scale', () => {
  const large = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    visual: { circleScale: 2 },
  }).svg;

  assert.match(large, /class="note-disc" r="28"/);
  assert.match(large, /class="note-halo" r="34\.8"/);
  assert.match(large, /class="root-halo" r="36\.4"/);
});

test('header lines stay separated at 200% type scale', () => {
  const diagram = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'all',
    visual: { typeScale: 2 },
  });

  const titleY = Number(
    diagram.svg.match(/class="title"[^>]* y="([^"]+)"/)?.[1],
  );
  const titleSize = Number(
    diagram.svg.match(/class="title"[^>]* font-size="([^"]+)"/)?.[1],
  );
  const subtitleY = Number(
    diagram.svg.match(/class="subtitle"[^>]* y="([^"]+)"/)?.[1],
  );

  assert.ok(titleY > 111);
  assert.ok(subtitleY < 174);
  assert.ok(subtitleY - titleY >= titleSize * 0.55);
});

test('circle, note-text and type scales are independent in the SVG output', () => {
  const normal = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    visual: { circleScale: 1, noteTextScale: 1, typeScale: 1 },
  }).svg;

  const large = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    visual: { circleScale: 2, noteTextScale: 1.5, typeScale: 2 },
  }).svg;

  assert.match(normal, /class="note-disc" r="14"/);
  assert.match(large, /class="note-disc" r="28"/);
  assert.match(normal, /\.fret-number \{[^}]*font-size: 16px/);
  assert.match(large, /\.fret-number \{[^}]*font-size: 32px/);
  assert.match(normal, /font-size="14"/);
  assert.match(large, /font-size="21"/);
});

test('visual scales clamp to the 50–200% range', () => {
  const small = computeVisualGeometry({
    circleScale: 0.1,
    noteTextScale: 0.1,
    typeScale: 0.1,
  });
  const large = computeVisualGeometry({
    circleScale: 3,
    noteTextScale: 3,
    typeScale: 3,
  });

  assert.deepEqual(
    [small.circleScale, small.noteTextScale, small.typeScale],
    [0.5, 0.5, 0.5],
  );
  assert.deepEqual(
    [large.circleScale, large.noteTextScale, large.typeScale],
    [2, 2, 2],
  );
  assert.equal(small.noteRadius, 7);
  assert.equal(large.noteRadius, 28);
});

test('sharp and flat note names use the same font size', () => {
  const { svg } = buildDiagram({
    root: 'Bb',
    family: 'scale',
    quality: 'major',
  });

  const sizes = [...svg.matchAll(/class="note-label"[^>]*font-size="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(sizes.length > 0);
  assert.equal(new Set(sizes).size, 1);
});

test('inactive strings have no notes and a dimmed line', () => {
  const { svg } = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    activeStrings: [true, false, true, true, true, true],
  });

  assert.match(svg, /class="string string--inactive" x1="100" y1="265.5"/);
  // No note circle on the 2nd string (y=265.5).
  assert.doesNotMatch(svg, /translate\([^ ]+ 265\.5\)/);
});

test('A minor pentatonic C shape marks the linking C on B/13', () => {
  const diagram = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'pentatonicMinor',
    shapeId: 'C',
  });

  assert.deepEqual(diagram.shape.window, { start: 9, end: 13 });

  const groups = [...diagram.svg.matchAll(
    /<g class="([^"]*)" transform="translate\(([^ ]+) 265\.5\)">([\s\S]*?)<\/g>/g,
  )];
  const cGroup = groups.find((group) => {
    const x = Number(group[2]);
    return Math.abs(x - fretCenterX(13)) < 0.01 && group[3].includes('>C</text>');
  });

  assert.ok(cGroup, 'expected a C on the B string at fret 13');
  assert.doesNotMatch(cGroup[1], /is-context/);
});

test('degree labels replace note names when requested', () => {
  const scale = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'naturalMinor',
    labelMode: 'degree',
  }).svg;
  assert.match(scale, />♭3<\/text>/);
  assert.match(scale, />♭7<\/text>/);

  const chord = buildDiagram({
    root: 'G',
    family: 'arpeggio',
    quality: 'dominant7',
    labelMode: 'degree',
  }).svg;
  assert.match(chord, />3M<\/text>/);
  assert.match(chord, />7m<\/text>/);
});

test('chord-tone role colors can be enabled or disabled', () => {
  const colored = buildDiagram({
    root: 'A',
    family: 'triad',
    quality: 'major',
    colorRoles: true,
  }).svg;
  const plain = buildDiagram({
    root: 'A',
    family: 'triad',
    quality: 'major',
    colorRoles: false,
  }).svg;

  assert.match(colored, /class="note role-third"/);
  assert.match(colored, /class="note role-fifth"/);
  assert.doesNotMatch(plain, /class="note[^"]*role-/);
});

test('A major A-shape includes C-sharp and F-sharp', () => {
  const diagram = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'major',
    shapeId: 'A',
    labelMode: 'name',
    colorRoles: false,
  });

  assert.deepEqual(diagram.shape.window, { start: 11, end: 15 });
  const labels = [...diagram.svg.matchAll(/class="note-label"[^>]*>([^<]+)<\/text>/g)]
    .map((match) => match[1]);
  assert.ok(labels.includes('C♯'));
  assert.ok(labels.includes('F♯'));
  assert.ok(!labels.includes('C'));
  assert.ok(!labels.includes('F'));

  const fret4X = fretCenterX(4);
  const dStringY = CANVAS.stringTop + 3 * CANVAS.stringGap;
  const d4 = [...diagram.svg.matchAll(
    /<g class="note[^"]*" transform="translate\(([^)]+)\)">([\s\S]*?)<\/g>/g,
  )].find(
    ([, position, body]) =>
      position === `${fret4X} ${dStringY}` && body.includes('F♯'),
  );
  assert.ok(d4, 'F♯ should be present on the D string at fret 4');
});

test('root-position drop-2 cuatríada renders exactly four notes on four strings', () => {
  const diagram = buildDiagram({
    root: 'A',
    family: 'cuatriad',
    quality: 'major7',
    voicing: { drop: 'drop2', rootString: 6 },
  });

  assert.equal(diagram.collection.notes.length, 4);
  assert.deepEqual(diagram.voicing.frets, [5, 7, 6, 6]);
  assert.deepEqual(diagram.voicing.stringSet, [5, 4, 3, 2]);
  assert.equal(diagram.activeStrings.filter(Boolean).length, 4);
  assert.match(diagram.svg, /CUATRÍADA/);
  assert.match(diagram.svg, /DROP 2 · RAÍZ 6ª/);
  assert.equal((diagram.svg.match(/<g class="note[^"]*" transform=/g) ?? []).length, 4);
  assert.doesNotMatch(diagram.svg, /<path class="shape-hull"/);
});

test('new scale families render with correct pitch counts', () => {
  const pentatonic = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'pentatonicMinor',
  });
  const blues = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'blues',
  });
  const dorian = buildDiagram({
    root: 'A',
    family: 'scale',
    quality: 'dorian',
  });

  assert.equal(pentatonic.collection.notes.length, 5);
  assert.equal(blues.collection.notes.length, 6);
  assert.equal(dorian.collection.notes.length, 7);
  assert.match(pentatonic.collection.title, /pentatónica menor/);
});
