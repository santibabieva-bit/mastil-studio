/**
 * Modelo del creador de tablaturas. cells[s][c] es texto: «5», «12h», «7~»…
 * s = 0 es la cuerda más aguda (arriba), igual que en el resto del Lab.
 */

export const TECHNIQUES = {
  h: { id: 'h', label: 'Ligado ascendente (h)', link: true },
  p: { id: 'p', label: 'Ligado descendente (p)', link: true },
  '/': { id: '/', label: 'Slide hacia arriba (/)', link: true },
  '\\': { id: '\\', label: 'Slide hacia abajo (\\)', link: true },
  b: { id: 'b', label: 'Bend (b)', bend: 2 },
  r: { id: 'r', label: 'Release (r)' },
  '~': { id: '~', label: 'Vibrato (~)', vibrato: true },
  '*': { id: '*', label: 'Armónico (*)', harmonic: true },
  '>': { id: '>', label: 'Acento (>)', accent: true },
};

export const TAB_LABELS = ['e', 'B', 'G', 'D', 'A', 'E', 'B', 'F♯'];

export function createTab({ strings = 6, cols = 16, title = 'Sin título', tempo = 100 } = {}) {
  return {
    title,
    tempo,
    strings,
    subdivision: 2, // pasos por pulso: 1 negra, 2 corchea, 4 semicorchea
    tuning: null, // null = afinación estándar (MIDI alto→bajo)
    cells: Array.from({ length: strings }, () => Array.from({ length: cols }, () => '')),
  };
}

export function tabLength(tab) {
  return tab.cells[0]?.length ?? 0;
}

export function cloneTab(tab) {
  return { ...tab, cells: tab.cells.map((row) => [...row]) };
}

export function setCell(tab, s, c, value) {
  const next = cloneTab(tab);
  next.cells[s][c] = sanitizeCell(value);
  return next;
}

export function sanitizeCell(value) {
  return String(value ?? '')
    .replace(/[^0-9xh p/\\br~*>()]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 6);
}

export function insertColumns(tab, at, count = 1) {
  const next = cloneTab(tab);
  for (const row of next.cells) row.splice(at, 0, ...Array.from({ length: count }, () => ''));
  return next;
}

export function deleteColumn(tab, at) {
  if (tabLength(tab) <= 1) return tab;
  const next = cloneTab(tab);
  for (const row of next.cells) row.splice(at, 1);
  return next;
}

export function clearTab(tab) {
  const next = cloneTab(tab);
  next.cells = next.cells.map((row) => row.map(() => ''));
  return next;
}

export function ensureColumns(tab, count) {
  if (tabLength(tab) >= count) return tab;
  const next = cloneTab(tab);
  const extra = count - tabLength(tab);
  for (const row of next.cells) row.push(...Array.from({ length: extra }, () => ''));
  return next;
}

/** Interpreta una celda. */
export function parseCell(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^\(?(\d{1,2}|x)\)?([hp/\\br~*>]*)$/i);
  if (!m) return null;
  const mute = m[1].toLowerCase() === 'x';
  const tech = [...m[2]].filter((ch) => TECHNIQUES[ch]);
  return {
    mute,
    fret: mute ? null : Number(m[1]),
    tech,
    link: tech.some((t) => TECHNIQUES[t].link),
    bend: tech.includes('b'),
    vibrato: tech.includes('~'),
    harmonic: tech.includes('*'),
    accent: tech.includes('>'),
  };
}

/**
 * Eventos de reproducción: una lista por columna con las notas que suenan.
 * Marca `legato` en la nota que sigue a un ligado/slide en la misma cuerda.
 */
export function tabEvents(tab) {
  const length = tabLength(tab);
  const events = [];
  const linkPending = new Array(tab.strings).fill(false);
  for (let c = 0; c < length; c += 1) {
    const notes = [];
    for (let s = 0; s < tab.strings; s += 1) {
      const parsed = parseCell(tab.cells[s][c]);
      if (!parsed) continue;
      notes.push({ s, ...parsed, legato: linkPending[s] });
      linkPending[s] = parsed.link;
    }
    events.push({ col: c, notes });
  }
  return events;
}

export function columnWidths(tab) {
  const widths = [];
  for (let c = 0; c < tabLength(tab); c += 1) {
    let w = 1;
    for (let s = 0; s < tab.strings; s += 1) w = Math.max(w, tab.cells[s][c].length);
    widths.push(w);
  }
  return widths;
}

export function tabToAscii(tab, perLine = 24, labels = TAB_LABELS) {
  const widths = columnWidths(tab);
  const blocks = [];
  for (let start = 0; start < tabLength(tab); start += perLine) {
    const end = Math.min(tabLength(tab), start + perLine);
    for (let s = 0; s < tab.strings; s += 1) {
      let line = `${(labels[s] ?? '').padEnd(2)}|`;
      for (let c = start; c < end; c += 1) {
        line += tab.cells[s][c].padEnd(widths[c] + 1, '-');
      }
      blocks.push(`${line}|`);
    }
    blocks.push('');
  }
  return blocks.join('\n').trimEnd();
}

/** Importa una tab ASCII pegada (una o varias líneas de bloque). */
export function asciiToTab(text, { title = 'Importada' } = {}) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => /^[A-Ga-g][#b♯♭]?\s*[|:]/.test(l) || /^\s*[|][-\dhpbrx/\\~*()|\s]+$/.test(l));
  if (lines.length < 4) return null;
  const stringsPerBlock = lines.length % 6 === 0 ? 6 : lines.length % 4 === 0 ? 4 : lines.length % 7 === 0 ? 7 : 6;
  const blocks = [];
  for (let i = 0; i + stringsPerBlock <= lines.length; i += stringsPerBlock) {
    blocks.push(lines.slice(i, i + stringsPerBlock));
  }
  const rows = Array.from({ length: stringsPerBlock }, () => []);
  for (const block of blocks) {
    const stripped = block.map((l) => l.replace(/^[^|:]*[|:]/, '').replaceAll('|', ''));
    const parsed = stripped.map(tokenizeLine);
    const starts = [...new Set(parsed.flatMap((tokens) => tokens.map((t) => t.start)))].sort((a, b) => a - b);
    for (let s = 0; s < stringsPerBlock; s += 1) {
      for (const start of starts) {
        const token = parsed[s].find((t) => t.start === start);
        rows[s].push(token ? token.text : '');
      }
    }
  }
  const tab = createTab({ strings: stringsPerBlock, cols: 1, title });
  tab.cells = rows.map((r) => (r.length ? r : ['']));
  return tab.cells[0].length ? tab : null;
}

function tokenizeLine(line) {
  const tokens = [];
  const re = /(?:\d{1,2}|x)[hp/\\br~*>]*/gi;
  let m;
  while ((m = re.exec(line)) !== null) tokens.push({ start: m.index, text: m[0] });
  return tokens;
}

export function tabToJson(tab) {
  return JSON.stringify(tab);
}

export function tabFromJson(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.cells) || !data.cells.length) return null;
    return { ...createTab({ strings: data.cells.length, cols: 1 }), ...data };
  } catch {
    return null;
  }
}

/** Convierte una secuencia {s,f} (Lab) en tab. `gap` columnas entre notas. */
export function tabFromSequence(sequence, { strings = 6, title = 'Ejercicio', tempo = 100 } = {}) {
  const tab = createTab({ strings, cols: Math.max(1, sequence.length), title, tempo });
  sequence.forEach((note, c) => {
    tab.cells[note.s][c] = String(note.f);
  });
  return tab;
}
