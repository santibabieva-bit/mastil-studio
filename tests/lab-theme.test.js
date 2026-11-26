import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIAGRAM_THEMES, PAGE_THEMES, resolveThemes } from '../lab/js/ui/theme.js';

test('auto themes follow the system and the page', () => {
  assert.deepEqual(resolveThemes('auto', 'auto', false), { page: 'light', diagram: 'classic' });
  assert.deepEqual(resolveThemes('auto', 'auto', true), { page: 'dark', diagram: 'night' });
  assert.deepEqual(resolveThemes('light', 'auto', true), { page: 'light', diagram: 'classic' });
  assert.deepEqual(resolveThemes('dark', 'wood', false), { page: 'dark', diagram: 'wood' });
});

test('every theme has its palette in lab.css', () => {
  const css = readFileSync(new URL('../lab/lab.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-theme="dark"\]/);
  for (const t of DIAGRAM_THEMES.filter((d) => d.value !== 'auto' && d.value !== 'classic')) {
    assert.match(css, new RegExp(`:root\\[data-diagram="${t.value}"\\]`), t.value);
  }
  assert.deepEqual(PAGE_THEMES.map((t) => t.value), ['auto', 'light', 'dark']);
});

test('diagram SVGs carry the class the themes repaint', async () => {
  const { renderFretboard } = await import('../lab/js/ui/fretboard.js');
  const svg = renderFretboard({ tuning: [64, 59, 55, 50, 45, 40], from: 0, to: 5, notes: [{ s: 0, f: 3, label: 'G' }] });
  assert.match(svg, /class="fb-svg"/);
  for (const color of ['#faf7f0', '#b9ad95', '#6c6657', '#12120f']) assert.ok(svg.includes(color), color);
});
