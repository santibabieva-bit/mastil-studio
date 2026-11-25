/**
 * Triad Lab: tríadas y cuatríadas por juegos de cuerdas e inversiones, tríada
 * sobre la escala, arpegios por posición con dedos, conducción de voces,
 * superposición de acordes y lámina imprimible de las cinco formas CAGED.
 */

import { TUNINGS, pcName, prettyNote } from '../core/music.js';
import { CHORD_TYPES } from '../core/chords.js';
import { resolveProgression } from '../core/progressions.js';
import { JAM_PRESETS, chordTones } from '../core/jam.js';
import {
  INVERSION_LABELS, arpeggioPositions, overlayChords, parentScale, positionLabel, stringSetLabel, stringSets, voiceLeadPath, voicingsByInversion,
} from '../core/triads.js';
import { buildDiagram } from '../../../src/diagram.js';
import { createLiveBoard } from '../ui/liveboard.js';
import { saveBlob, slug, svgToPngBlob } from '../ui/export.js';
import { button, clear, h, segmented, select, toggle } from '../ui/dom.js';
import { header, rootChoices } from './common.js';

const STD = TUNINGS.standard.midi;
const TYPE_CHOICES = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', 'maj7', 'm7', '7', 'm7b5', 'dim7', 'mMaj7']
  .map((id) => ({ value: id, label: CHORD_TYPES[id].name }));
const VIEWS = [
  { value: 'inv', label: 'Inversiones' },
  { value: 'scale', label: 'Sobre la escala' },
  { value: 'arp', label: 'Arpegios' },
  { value: 'lead', label: 'Conducción de voces' },
  { value: 'overlay', label: 'Superponer' },
  { value: 'caged', label: 'Lámina CAGED' },
];
const TO_TRIAD = { maj7: 'maj', m7: 'm', 7: 'maj', m7b5: 'dim', dim7: 'dim', mMaj7: 'm', 6: 'maj', m6: 'm', 9: 'maj', maj9: 'maj', m9: 'm', add9: 'maj', '7sus4': 'sus4', '7#5': 'aug' };

function noteSet(voicing, tones, tuning = STD) {
  return voicing.notes.map((n) => {
    const t = tones.find((x) => x.pc === n.pc);
    return { s: n.s, f: n.f, label: t?.label ?? '', role: t?.role ?? null, kind: 'note' };
  });
}

function miniBoardOpts(voicing, tones, title) {
  const frets = voicing.notes.map((n) => n.f).filter((f) => f > 0);
  const lo = frets.length ? Math.max(1, Math.min(...frets) - 1) : 1;
  const hi = Math.max(lo + 4, frets.length ? Math.max(...frets) + 1 : 4);
  const from = lo <= 1 ? 0 : lo;
  return { tuning: STD, from, to: hi, notes: noteSet(voicing, tones), width: 420, stringNames: false, title };
}

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const sess = ctx.session.get();
  const state = {
    root: p.root ?? sess.root ?? 'C',
    type: CHORD_TYPES[p.q] ? p.q : 'maj',
    view: p.view ?? 'inv',
    setIndex: Number(p.set ?? 0),
    prog: p.prog ?? 'twofiveone',
    useSevenths: p.sev !== '0',
    otherRoot: p.or ?? 'F',
    otherType: p.ot ?? 'maj',
    caged: p.cg ?? 'major',
    posIndex: 0,
  };
  const out = h('div', { class: 'stack' });
  // Mástiles persistentes por vista: al cambiar de acorde o de juego de cuerdas
  // el mismo diagrama se transforma (las notas se deslizan) en vez de redibujarse.
  const keep = new Map();
  let cardSeq = 0;
  function live(id, opts, attrs = { class: 'fretboard-wrap', style: 'overflow-x:auto' }) {
    let el = keep.get(id);
    if (!el) { el = h('div', attrs); createLiveBoard(el); keep.set(id, el); }
    el.__live.render(opts);
    return el;
  }
  const rootPc = () => resolveProgression(state.root, [{ s: 0, t: 'maj' }])[0].rootPc;
  const notes = () => (CHORD_TYPES[state.type].intervals.length);

  function refresh() {
    ctx.setParams({ root: state.root, q: state.type, view: state.view, set: state.setIndex, prog: state.prog, sev: state.useSevenths ? 1 : 0, or: state.otherRoot, ot: state.otherType });
    ctx.session.set({ root: state.root });
  }

  async function sound(midis, vel = 0.8) {
    await engine.ensure();
    engine.strum(midis, engine.time + 0.02, { down: true, vel, dur: 1.8 });
  }
  const voicingMidis = (v) => [...v.notes].map((n) => STD[n.s] + n.f).sort((a, b) => a - b);

  function legend() {
    return h('p', { class: 'hint' }, 'Colores: rojo fundamental · verde 3.ª · naranja 5.ª · azul 7.ª. Pulsa un diagrama para oírlo.');
  }

  function voicingCard(v, tones, title, extra = null) {
    const card = h('button', { type: 'button', class: 'voicing-card', title: 'Oír este voicing' },
      live(`card-${state.view}-${cardSeq++}`, miniBoardOpts(v, tones, title), {}),
      h('div', { class: 'hint' }, title),
      extra,
    );
    card.addEventListener('click', () => sound(voicingMidis(v)));
    return card;
  }

  /* ─── vistas ─── */
  function viewInversions(box) {
    const sets = stringSets(STD, notes());
    if (state.setIndex >= sets.length) state.setIndex = 0;
    const set = sets[state.setIndex];
    const tones = chordTones(rootPc(), state.type);
    const by = voicingsByInversion({ tuning: STD, rootPc: rootPc(), typeId: state.type, set });
    box.append(
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Juego de cuerdas'),
        segmented(sets.map((s, i) => ({ value: i, label: stringSetLabel(s) })), state.setIndex, (v) => { state.setIndex = Number(v); refresh(); draw(); })),
      legend(),
    );
    for (const [inv, list] of Object.entries(by)) {
      const cards = list.slice(0, 6).map((v) => voicingCard(v, tones, `${INVERSION_LABELS[inv]} · trastes ${v.low || 0}–${v.high}`));
      box.append(h('section', { class: 'panel stack' }, h('h2', {}, INVERSION_LABELS[inv]), cards.length ? h('div', { class: 'row' }, cards) : h('p', { class: 'hint' }, 'Sin voicing cómodo en este juego de cuerdas.')));
    }
  }

  function viewScale(box) {
    const parent = parentScale(rootPc(), state.type);
    const tones = chordTones(rootPc(), state.type);
    const boardNotes = [];
    for (let s = 0; s < STD.length; s += 1) {
      for (let f = 0; f <= 15; f += 1) {
        const pc = (STD[s] + f) % 12;
        const tone = tones.find((t) => t.pc === pc);
        if (tone) boardNotes.push({ s, f, label: tone.label, role: tone.role, kind: 'note' });
        else if (parent.pcs.has(pc)) boardNotes.push({ s, f, label: '', kind: 'ghost' });
      }
    }
    box.append(
      h('p', { class: 'hint' }, `El acorde ${prettyNote(pcName(rootPc(), 'sharp'))} ${CHORD_TYPES[state.type].name} sobre su escala madre (${prettyNote(pcName(rootPc(), 'sharp'))} ${parent.quality}): las notas llenas son el acorde y los círculos huecos, el resto de la escala.`),
      live('scale', { tuning: STD, from: 0, to: 15, notes: boardNotes, width: 1200, title: 'Acorde sobre la escala' }),
      legend(),
    );
  }

  function viewArp(box) {
    const positions = arpeggioPositions({ tuning: STD, rootPc: rootPc(), typeId: state.type });
    if (!positions.length) { box.append(h('p', { class: 'hint' }, 'No hay posiciones para este acorde.')); return; }
    if (state.posIndex >= positions.length) state.posIndex = 0;
    const pos = positions[state.posIndex];
    const tones = chordTones(rootPc(), state.type);
    const boardNotes = pos.notes.map((n) => ({ s: n.s, f: n.f, label: n.finger ? String(n.finger) : '0', role: n.role, kind: 'note' }));
    box.append(
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Posición'),
        segmented(positions.map((q, i) => ({ value: i, label: `${i + 1}`, title: positionLabel(q, rootPc(), STD) })), state.posIndex, (v) => { state.posIndex = Number(v); draw(); })),
      h('p', { class: 'hint' }, `${positionLabel(pos, rootPc(), STD)} · trastes ${pos.from}–${pos.to}. Los números dentro de las notas son los dedos (1 índice … 4 meñique; 0 = al aire).`),
      live('arp', { tuning: STD, from: Math.max(0, pos.from - 1), to: Math.min(15, pos.to + 1), notes: boardNotes, width: 1000, title: 'Arpegio por posición' }),
      h('div', { class: 'row' }, button('▶ Oír el arpegio', { variant: 'accent', onClick: async () => {
        await engine.ensure();
        const sorted = [...pos.notes].sort((a, b) => a.midi - b.midi);
        sorted.forEach((n, i) => engine.pluck(n.midi, engine.time + 0.05 + i * 0.28, { vel: 0.8, dur: 1.2 }));
      } }), button('▶ Subir y bajar', { variant: 'outline', onClick: async () => {
        await engine.ensure();
        const sorted = [...pos.notes].sort((a, b) => a.midi - b.midi);
        const path = [...sorted, ...sorted.slice(0, -1).reverse()];
        path.forEach((n, i) => engine.pluck(n.midi, engine.time + 0.05 + i * 0.22, { vel: 0.8, dur: 1 }));
      } })),
      legend(),
      h('p', { class: 'hint' }, `Notas: ${tones.map((t) => `${t.label} = ${prettyNote(pcName(t.pc, 'sharp'))}`).join(' · ')}`),
    );
  }

  function viewLead(box) {
    const preset = JAM_PRESETS.find((x) => x.id === state.prog) ?? JAM_PRESETS[0];
    const resolved = resolveProgression(state.root, preset.chords);
    const chords = resolved.map((c) => ({
      rootPc: c.rootPc,
      typeId: state.useSevenths ? c.typeId : (TO_TRIAD[c.typeId] ?? c.typeId),
      symbol: c.symbol,
    })).filter((c) => CHORD_TYPES[c.typeId].intervals.length <= 4);
    // Elimina repetidos consecutivos para ver el movimiento real.
    const unique = chords.filter((c, i) => i === 0 || c.rootPc !== chords[i - 1].rootPc || c.typeId !== chords[i - 1].typeId);
    const path = voiceLeadPath({ tuning: STD, chords: unique, set: null });
    box.append(
      h('div', { class: 'field' }, h('label', {}, 'Progresión'), select(JAM_PRESETS.map((x) => ({ value: x.id, label: x.label })), state.prog, (v) => { state.prog = v; refresh(); draw(); })),
      toggle('Usar acordes de séptima (si no, tríadas)', state.useSevenths, (v) => { state.useSevenths = v; refresh(); draw(); }),
      h('p', { class: 'hint' }, 'El programa elige, para cada acorde, el voicing que mueve lo mínimo desde el anterior: es el camino con menos desplazamientos de la mano. El número es cuánto se mueven las notas (en semitonos).'),
    );
    if (!path.length) { box.append(h('p', { class: 'hint' }, 'No encontré un camino cómodo para esta progresión.')); return; }
    const total = path.reduce((s, x) => s + x.move, 0);
    box.append(h('div', { class: 'row' }, path.map((step) => voicingCard(step.voicing, chordTones(step.chord.rootPc, step.chord.typeId), prettyNote(step.chord.symbol), h('div', { class: 'hint' }, step.move ? `movimiento ${step.move}` : 'inicio')))));
    box.append(
      h('p', { class: 'hint' }, `Movimiento total: ${Math.round(total * 10) / 10}.`),
      h('div', { class: 'row' }, button('▶ Oír el recorrido', { variant: 'accent', onClick: async () => {
        await engine.ensure();
        path.forEach((step, i) => engine.strum(voicingMidis(step.voicing), engine.time + 0.05 + i * 1.2, { down: true, vel: 0.8, dur: 1.4 }));
      } })),
      legend(),
    );
  }

  function viewOverlay(box) {
    const a = { rootPc: rootPc(), typeId: state.type };
    const otherPc = resolveProgression(state.otherRoot, [{ s: 0, t: 'maj' }])[0].rootPc;
    const b = { rootPc: otherPc, typeId: state.otherType };
    const o = overlayChords(a, b);
    const boardNotes = [];
    for (let s = 0; s < STD.length; s += 1) {
      for (let f = 0; f <= 15; f += 1) {
        const pc = (STD[s] + f) % 12;
        const ta = o.tonesA.find((t) => t.pc === pc);
        const tb = o.tonesB.find((t) => t.pc === pc);
        if (ta && tb) boardNotes.push({ s, f, label: ta.label, role: ta.role, kind: 'select' });
        else if (ta) boardNotes.push({ s, f, label: ta.label, role: ta.role, kind: 'note' });
        else if (tb) boardNotes.push({ s, f, label: tb.label, kind: 'hidden' });
      }
    }
    box.append(
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', {}, 'Segundo acorde: tónica'), select(rootChoices(), state.otherRoot, (v) => { state.otherRoot = v; refresh(); draw(); })),
        h('div', { class: 'field' }, h('label', {}, 'Calidad'), select(TYPE_CHOICES, state.otherType, (v) => { state.otherType = v; refresh(); draw(); })),
      ),
      h('p', { class: 'hint' }, `Acorde 1 (negro, con colores): ${prettyNote(pcName(a.rootPc, 'sharp'))} ${CHORD_TYPES[a.typeId].name}. Acorde 2 (naranja, hueco): ${prettyNote(pcName(b.rootPc, 'sharp'))} ${CHORD_TYPES[b.typeId].name}. Las notas compartidas se rellenan en naranja: ${o.shared.length ? o.shared.map((pc) => prettyNote(pcName(pc, 'sharp'))).join(', ') : 'ninguna'}.`),
      live('overlay', { tuning: STD, from: 0, to: 15, notes: boardNotes, width: 1200, title: 'Dos acordes superpuestos' }),
      h('p', { class: 'hint' }, 'Útil para ver cómo una tríada «vive» dentro de un acorde de séptima (por ejemplo, F sobre Dm7) o qué notas conectan dos acordes.'),
    );
  }

  function viewCaged(box) {
    const sheet = h('div', { class: 'caged-sheet' });
    const svgs = [];
    for (const shapeId of ['C', 'A', 'G', 'E', 'D']) {
      try {
        const { svg } = buildDiagram({ root: state.root, family: 'scale', quality: state.caged, shapeId, includeOpen: true, labelMode: 'degree', colorRoles: true });
        svgs.push({ shapeId, svg });
        sheet.append(h('figure', { class: 'caged-fig' }, h('figcaption', {}, `Forma ${shapeId}`), h('div', { html: svg })));
      } catch (error) {
        sheet.append(h('p', { class: 'hint' }, `Forma ${shapeId}: ${error.message}`));
      }
    }
    box.append(
      h('div', { class: 'row no-print' },
        select([{ value: 'major', label: 'Escala mayor' }, { value: 'naturalMinor', label: 'Menor natural' }, { value: 'pentatonicMajor', label: 'Pentatónica mayor' }, { value: 'pentatonicMinor', label: 'Pentatónica menor' }, { value: 'mixolydian', label: 'Mixolidia' }, { value: 'dorian', label: 'Dórica' }],
          state.caged, (v) => { state.caged = v; draw(); }),
        button('Imprimir / PDF', { variant: 'dark', onClick: () => window.print() }),
        button('Descargar SVG', { variant: 'outline', onClick: async () => {
          const tall = svgs.map((x, i) => `<g transform="translate(0 ${i * 580})">${x.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`).join('');
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1520 ${svgs.length * 580}">${tall}</svg>`;
          await saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `caged-${slug(state.root)}-${state.caged}.svg`, 'SVG');
        } }),
        button('Descargar PNG', { variant: 'outline', onClick: async () => {
          const tall = svgs.map((x, i) => `<g transform="translate(0 ${i * 580})">${x.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`).join('');
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1520 ${svgs.length * 580}" width="1520" height="${svgs.length * 580}">${tall}</svg>`;
          await saveBlob(await svgToPngBlob(svg, 1), `caged-${slug(state.root)}-${state.caged}.png`, 'PNG');
        } }),
      ),
      h('p', { class: 'hint no-print' }, 'Las cinco formas CAGED de la escala elegida, una por mástil, con grados y colores por función. Generadas con el motor de las plantillas.'),
      sheet,
    );
  }

  const RENDER = { inv: viewInversions, scale: viewScale, arp: viewArp, lead: viewLead, overlay: viewOverlay, caged: viewCaged };

  function draw() {
    cardSeq = 0;
    clear(out);
    refresh();
    const box = h('div', { class: 'stack' });
    out.append(box);
    RENDER[state.view](box);
  }

  const chordTitle = h('p', { class: 'hint' });
  const head = h('section', { class: 'panel stack no-print' },
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(rootChoices(), state.root, (v) => { state.root = v; draw(); })),
      h('div', { class: 'field' }, h('label', {}, 'Acorde'), select(TYPE_CHOICES, state.type, (v) => { state.type = v; state.setIndex = 0; state.posIndex = 0; draw(); })),
    ),
    h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Qué quieres estudiar'), segmented(VIEWS, state.view, (v) => { state.view = v; state.posIndex = 0; draw(); })),
    chordTitle,
  );

  root.append(
    header('Aprender el mástil', 'Triad Lab', 'Tríadas y cuatríadas por juegos de cuerdas e inversiones, sobre la escala, en arpegios con dedos, con conducción de voces entre acordes y una lámina CAGED lista para imprimir.'),
    head,
    out,
  );
  draw();
}

export default {
  id: 'triads',
  title: 'Triad Lab',
  group: 'neck',
  icon: '△',
  summary: 'Inversiones por juegos de cuerdas, arpegios con dedos, conducción de voces y lámina CAGED imprimible.',
  isNew: true,
  mount,
};
