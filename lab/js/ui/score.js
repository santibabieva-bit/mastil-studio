/**
 * Envoltorio de alphaTab: carga perezosa de la copia local (lab/vendor/alphatab),
 * pinta alphaTex / Guitar Pro y ofrece reproducción con cursor, bucle,
 * metrónomo, cuenta previa y velocidad.
 */

import { button, h, segmented, select, toggle } from './dom.js';

const VENDOR = new URL('../../vendor/alphatab/', import.meta.url);
let modulePromise = null;

export function loadAlphaTab() {
  if (!modulePromise) {
    modulePromise = import(new URL('alphaTab.min.mjs', VENDOR).href).catch((error) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

export const STAVES = [
  { value: 'scoretab', label: 'Partitura + tab' },
  { value: 'tab', label: 'Sólo tab' },
  { value: 'score', label: 'Sólo partitura' },
];

const PLAYING = 1;

/**
 * @param {HTMLElement} host contenedor (se crea dentro el área de render)
 * @param {object} o { stave, layout, scale, fingers, onState, onError, onLoaded, onBeat, scroll }
 */
export function createScore(host, o = {}) {
  const wrap = h('div', { class: 'score-scroll' });
  const surface = h('div', { class: 'at-host' });
  wrap.append(surface);
  host.append(wrap);
  const follow = h('div', { class: 'at-follow', hidden: true });
  const marks = h('div', { class: 'at-note-marks' });

  const state = {
    api: null,
    at: null,
    playing: false,
    playerReady: false,
    soundProgress: 0,
    stave: o.stave ?? 'scoretab',
    layout: o.layout ?? 'page',
    scale: o.scale ?? 1,
    fingers: Boolean(o.fingers),
    loop: false,
    metronome: false,
    countIn: false,
    speed: 1,
    destroyed: false,
    lastTex: null,
    score: null,
    error: null,
    beats: [],
    bounds: null,
  };
  const listeners = new Set();
  const emit = () => {
    for (const fn of listeners) fn(state);
    o.onState?.(state);
  };

  const settingsFor = (at) => ({
    core: {
      fontDirectory: new URL('font/', VENDOR).href,
      useWorkers: true,
      // Medidas de cada nota (cabeza y número de tab) para poder resaltarlas.
      includeNoteBounds: true,
    },
    display: {
      layoutMode: state.layout === 'horizontal' ? at.LayoutMode.Horizontal : at.LayoutMode.Page,
      staveProfile: { scoretab: at.StaveProfile.ScoreTab, tab: at.StaveProfile.Tab, score: at.StaveProfile.Score }[state.stave],
      scale: state.scale,
      resources: {
        staffLineColor: '#7f857c',
        barSeparatorColor: '#4d594f',
        mainGlyphColor: '#17231e',
        secondaryGlyphColor: '#4d594f',
        scoreInfoColor: '#17231e',
        barNumberColor: '#b65d18',
      },
    },
    notation: {
      fingeringMode: state.fingers ? at.FingeringMode.SingleNoteEffectBand : at.FingeringMode.ScoreDefault,
    },
    player: {
      enablePlayer: true,
      soundFont: new URL('soundfont/sonivox.sf2', VENDOR).href,
      scrollElement: wrap,
      scrollMode: o.scroll === false ? at.ScrollMode.Off : at.ScrollMode.Continuous,
      enableCursor: o.cursor !== false,
      enableAnimatedBeatCursor: o.cursor !== false,
      enableElementHighlighting: true,
    },
  });

  const ready = loadAlphaTab().then((at) => {
    if (state.destroyed) return null;
    state.at = at;
    const api = new at.AlphaTabApi(surface, settingsFor(at));
    state.api = api;
    api.error.on((error) => {
      state.error = error?.message ?? String(error);
      o.onError?.(state.error, error);
      emit();
    });
    api.scoreLoaded.on((score) => {
      state.score = score;
      state.error = null;
      state.beats = collectBeats(score);
      o.onLoaded?.(score);
      emit();
    });
    api.postRenderFinished.on(() => {
      state.bounds = api.boundsLookup ?? null;
      emit();
    });
    api.playerReady.on(() => {
      state.playerReady = true;
      state.soundProgress = 1;
      emit();
    });
    api.soundFontLoad.on((e) => {
      state.soundProgress = e.total ? e.loaded / e.total : 0;
      emit();
    });
    api.playerStateChanged.on((e) => {
      const playing = e.state === PLAYING;
      if (playing !== state.playing) {
        state.playing = playing;
        o.onPlaying?.(playing);
      }
      emit();
    });
    api.playedBeatChanged?.on((beat) => o.onBeat?.(beat));
    api.metronomeVolume = 0;
    api.countInVolume = 0;
    return api;
  });

  const withApi = async (fn) => {
    const api = await ready;
    if (api && !state.destroyed) return fn(api, state.at);
    return undefined;
  };

  const controller = {
    state,
    ready,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Carga alphaTex. */
    load(tex) {
      state.lastTex = tex;
      state.error = null;
      return withApi((api) => api.tex(tex));
    },
    /** Carga un archivo Guitar Pro / MusicXML (ArrayBuffer). */
    loadFile(buffer) {
      state.lastTex = null;
      return withApi((api) => api.load(new Uint8Array(buffer)));
    },
    playPause: () => withApi((api) => api.playPause()),
    play: () => withApi((api) => api.play()),
    pause: () => withApi((api) => api.pause()),
    stop: () => withApi((api) => api.stop()),
    setLoop(on) {
      state.loop = on;
      return withApi((api) => { api.isLooping = on; });
    },
    setMetronome(on) {
      state.metronome = on;
      return withApi((api) => { api.metronomeVolume = on ? 1 : 0; });
    },
    setCountIn(on) {
      state.countIn = on;
      return withApi((api) => { api.countInVolume = on ? 1 : 0; });
    },
    setSpeed(x) {
      state.speed = x;
      return withApi((api) => { api.playbackSpeed = x; });
    },
    async setZoom(x) {
      state.scale = x;
      await withApi((api) => {
        api.settings.display.scale = x;
        api.updateSettings();
        api.render();
      });
    },
    async setStave(kind) {
      state.stave = kind;
      await withApi((api, at) => {
        api.settings.display.staveProfile = { scoretab: at.StaveProfile.ScoreTab, tab: at.StaveProfile.Tab, score: at.StaveProfile.Score }[kind];
        api.updateSettings();
        api.render();
      });
    },
    async setLayout(kind) {
      state.layout = kind;
      await withApi((api, at) => {
        api.settings.display.layoutMode = kind === 'horizontal' ? at.LayoutMode.Horizontal : at.LayoutMode.Page;
        api.updateSettings();
        api.render();
      });
    },
    async setFingers(on) {
      state.fingers = on;
      await withApi((api, at) => {
        api.settings.notation.fingeringMode = on ? at.FingeringMode.SingleNoteEffectBand : at.FingeringMode.ScoreDefault;
        api.updateSettings();
        api.render();
      });
    },
    /**
     * Mueve un cursor propio hasta el pulso n (0 = primero) sin reproducir: sirve
     * para seguir con la vista un ejercicio que suena con el motor de audio del Lab.
     * Usa sólo la API pública (`renderer.boundsLookup`).
     */
    seekBeat(n) {
      if (state.playing || state.destroyed) return;
      const beat = state.beats[n];
      const found = beat && state.bounds ? state.bounds.findBeat(beat) : null;
      if (!found) return;
      if (!follow.isConnected) surface.append(follow);
      const bar = found.barBounds?.visualBounds ?? found.visualBounds;
      const beatBox = found.visualBounds;
      follow.style.cssText = `left:${beatBox.x}px;top:${bar.y}px;height:${bar.h}px;width:${Math.max(3, Math.min(beatBox.w, 14))}px;`;
      follow.hidden = false;
      const top = bar.y;
      const bottom = bar.y + bar.h;
      if (top < wrap.scrollTop || bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = Math.max(0, top - 24);
      const left = beatBox.x;
      if (left < wrap.scrollLeft || left > wrap.scrollLeft + wrap.clientWidth - 40) wrap.scrollLeft = Math.max(0, left - 80);
    },
    hideFollow() {
      follow.hidden = true;
      marks.replaceChildren();
    },
    /**
     * Resalta las notas del beat n (cabezas en la partitura y números en la
     * tab) sin barra de progreso. Devuelve false si aún no hay maquetación.
     */
    highlightBeat(n) {
      marks.replaceChildren();
      if (state.destroyed) return false;
      const beat = state.beats[n];
      const lookup = state.bounds;
      if (!beat || !lookup) return false;
      const all = lookup.findBeats?.(beat) ?? [lookup.findBeat(beat)].filter(Boolean);
      if (!all.length) return false;
      if (!marks.isConnected) surface.append(marks);
      let first = null;
      for (const b of all) {
        const heads = (b.notes ?? []).map((nb) => nb.noteHeadBounds).filter(Boolean);
        for (const r of heads.length ? heads : [b.visualBounds]) {
          const pad = 3;
          marks.append(h('div', { class: 'at-note-mark', style: `left:${r.x - pad}px;top:${r.y - pad}px;width:${r.w + pad * 2}px;height:${r.h + pad * 2}px` }));
          if (!first || r.y < first.y) first = r;
        }
      }
      const bar = all[0].barBounds?.visualBounds ?? all[0].visualBounds;
      const top = Math.min(bar.y, first?.y ?? bar.y);
      const bottom = Math.max(...all.map((b) => (b.barBounds?.visualBounds ?? b.visualBounds)).map((v) => v.y + v.h));
      if (top < wrap.scrollTop || bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = Math.max(0, top - 24);
      const left = all[0].visualBounds.x;
      if (left < wrap.scrollLeft || left > wrap.scrollLeft + wrap.clientWidth - 40) wrap.scrollLeft = Math.max(0, left - 80);
      return true;
    },
    downloadMidi: () => withApi((api) => api.downloadMidi()),
    destroy() {
      state.destroyed = true;
      listeners.clear();
      try {
        state.api?.stop();
        state.api?.destroy();
      } catch { /* ya destruido */ }
      wrap.remove();
    },
  };
  (globalThis.__labScores ??= []).push(controller); // depuración desde la consola
  return controller;
}

function collectBeats(score) {
  const bars = score?.tracks?.[0]?.staves?.[0]?.bars ?? [];
  const beats = [];
  for (const bar of bars) {
    for (const beat of bar.voices?.[0]?.beats ?? []) beats.push(beat);
  }
  return beats;
}

/**
 * Barra de controles estándar para un controlador de partitura.
 * `playback: false` oculta la reproducción de alphaTab (para vistas cuyo audio
 * lo pone el motor del Lab) y deja sólo zoom y tipo de pentagrama.
 */
export function scoreToolbar(controller, { stave = true, layout = false, zoom = true, playback = true, extra = [] } = {}) {
  const playBtn = button('▶ Reproducir', { variant: 'accent', onClick: () => controller.playPause() });
  playBtn.disabled = true;
  const stopBtn = button('■', { variant: 'outline', title: 'Parar y volver al principio', onClick: () => controller.stop() });
  const status = h('span', { class: 'hint score-status' }, 'Cargando alphaTab…');

  controller.on((st) => {
    playBtn.textContent = st.playing ? '❚❚ Pausa' : '▶ Reproducir';
    playBtn.disabled = !st.playerReady;
    status.textContent = st.error
      ? `⚠ ${st.error}`
      : !st.playerReady
        ? (playback ? `Cargando sonidos… ${Math.round(st.soundProgress * 100)} %` : '')
        : '';
  });

  const speed = select(
    [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5].map((v) => ({ value: v, label: `${Math.round(v * 100)} %` })),
    1,
    (v) => controller.setSpeed(Number(v)),
    { 'aria-label': 'Velocidad', style: 'width:auto;min-width:92px' },
  );
  const zoomSel = select(
    [0.7, 0.85, 1, 1.2, 1.5].map((v) => ({ value: v, label: `Zoom ${Math.round(v * 100)} %` })),
    controller.state.scale,
    (v) => controller.setZoom(Number(v)),
    { 'aria-label': 'Zoom', style: 'width:auto;min-width:110px' },
  );

  return h(
    'div',
    { class: 'stack score-toolbar no-print' },
    h('div', { class: 'row' },
      ...(playback ? [
        playBtn, stopBtn,
        toggle('Bucle', controller.state.loop, (v) => controller.setLoop(v)),
        toggle('Metrónomo', controller.state.metronome, (v) => controller.setMetronome(v)),
        toggle('Cuenta previa', controller.state.countIn, (v) => controller.setCountIn(v)),
        speed,
      ] : []),
      ...(zoom ? [zoomSel] : []),
      ...extra,
    ),
    h('div', { class: 'row' },
      ...(stave ? [segmented(STAVES, controller.state.stave, (v) => controller.setStave(v))] : []),
      ...(layout ? [segmented([{ value: 'page', label: 'Páginas' }, { value: 'horizontal', label: 'Horizontal' }], controller.state.layout, (v) => controller.setLayout(v))] : []),
      status,
    ),
  );
}
