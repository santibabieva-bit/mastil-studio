/**
 * Diagrama de acorde vertical (6 cuerdas). `frets` en orden 6ª→1ª, -1 = muda.
 */

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function renderChordBox({ frets, title = '', size = 1, rootStringIndex = null, highlight = null }) {
  const strings = frets.length;
  const fretted = frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const base = maxF > 4 ? minF : 1;
  const rows = 5;
  const gx = 18;
  const gy = 20;
  const left = 26;
  const top = 34;
  const w = left * 2 + gx * (strings - 1);
  const h = top + gy * rows + 18;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="cb-svg" viewBox="0 0 ${w} ${h}" width="${w * size}" height="${h * size}" role="img" aria-label="${esc(title || 'Acorde')}" font-family="Segoe UI, system-ui, Arial, sans-serif">`,
  ];
  if (title) parts.push(`<text x="${w / 2}" y="14" text-anchor="middle" font-size="13" font-weight="700" fill="#17231e">${esc(title)}</text>`);
  // Cejilla o número de traste inicial
  if (base === 1) parts.push(`<rect x="${left - 1}" y="${top - 3}" width="${gx * (strings - 1) + 2}" height="4" fill="#17231e"/>`);
  else parts.push(`<text x="${left - 8}" y="${top + gy * 0.65}" text-anchor="end" font-size="11" fill="#7f857c">${base}</text>`);
  for (let r = 0; r <= rows; r += 1) {
    parts.push(`<line x1="${left}" y1="${top + r * gy}" x2="${left + gx * (strings - 1)}" y2="${top + r * gy}" stroke="#b9ad95" stroke-width="1.2"/>`);
  }
  for (let s = 0; s < strings; s += 1) {
    parts.push(`<line x1="${left + s * gx}" y1="${top}" x2="${left + s * gx}" y2="${top + rows * gy}" stroke="#6c6657" stroke-width="${1 + (strings - 1 - s) * 0.12}"/>`);
  }
  // Cejilla (barre)
  const barreFret = fretted.length ? minF : null;
  if (barreFret && frets.filter((f) => f === barreFret).length >= 3) {
    const idx = frets.map((f, i) => (f === barreFret ? i : -1)).filter((i) => i >= 0);
    const first = idx[0];
    const last = idx[idx.length - 1];
    const y = top + (barreFret - base + 0.5) * gy;
    parts.push(`<rect x="${left + first * gx - 6}" y="${y - 6}" width="${(last - first) * gx + 12}" height="12" rx="6" fill="#17231e"/>`);
  }
  frets.forEach((f, i) => {
    const x = left + i * gx;
    if (f < 0) {
      parts.push(`<text x="${x}" y="${top - 9}" text-anchor="middle" font-size="12" fill="#7f857c">×</text>`);
    } else if (f === 0) {
      parts.push(`<circle cx="${x}" cy="${top - 11}" r="4" fill="none" stroke="#17231e" stroke-width="1.3"/>`);
    } else {
      const y = top + (f - base + 0.5) * gy;
      const isRoot = rootStringIndex === i;
      parts.push(`<circle cx="${x}" cy="${y}" r="6.5" fill="${isRoot ? '#d84a3e' : '#17231e'}"/>`);
    }
  });
  if (highlight) parts.push(`<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="8" fill="none" stroke="#df812f" stroke-width="2"/>`);
  parts.push('</svg>');
  return parts.join('');
}
