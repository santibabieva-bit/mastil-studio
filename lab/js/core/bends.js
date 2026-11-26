/**
 * Bends: una nota con `bend` es una lista de alturas en semitonos sobre la
 * nota pisada, repartidas a lo largo de la nota.
 *   [0, 2]      bend de un tono
 *   [0, 1]      bend de medio tono
 *   [0, 2, 0]   bend y release
 *   [2, 0]      pre-bend y release
 *   [2]         pre-bend (la nota ya suena estirada)
 * La misma curva mueve la cuerda en el dibujo, sube la afinación del sonido y
 * se escribe en la tablatura de alphaTab. Puro.
 */

/** Tipos de bend para menús y para el creador de tabs. */
export const BEND_KINDS = [
  { id: 'half', label: '½ tono', points: [0, 1] },
  { id: 'full', label: '1 tono', points: [0, 2] },
  { id: 'onehalf', label: '1½ tonos', points: [0, 3] },
  { id: 'release', label: 'Bend y release', points: [0, 2, 0] },
  { id: 'prerelease', label: 'Pre-bend y release', points: [2, 0] },
];

/** Normaliza: número → [0, n]; lista vacía o falsa → null. */
export function bendPoints(bend) {
  if (bend == null || bend === false) return null;
  if (typeof bend === 'number') return bend ? [0, bend] : null;
  if (bend === true) return [0, 2];
  if (!Array.isArray(bend) || !bend.length) return null;
  return bend.length === 1 ? [bend[0], bend[0]] : bend.map(Number);
}

/**
 * Fotogramas clave [{ t, v }] con t en 0..1 de la duración de la nota.
 * El dedo empuja rápido (cerca de un tercio de la nota) y aguanta arriba; en
 * un bend y release sube, aguanta y baja antes de que acabe la nota.
 */
export function bendKeyframes(bend) {
  const p = bendPoints(bend);
  if (!p) return [];
  if (p.length === 2) {
    const [a, b] = p;
    if (a === b) return [{ t: 0, v: a }, { t: 1, v: a }];
    return [{ t: 0, v: a }, { t: 0.08, v: a }, { t: 0.4, v: b }, { t: 1, v: b }];
  }
  // Varios tramos: cada uno con su subida y su meseta.
  const seg = 1 / (p.length - 1);
  const out = [{ t: 0, v: p[0] }];
  for (let k = 1; k < p.length; k += 1) {
    const t0 = (k - 1) * seg;
    out.push({ t: t0 + seg * 0.15, v: p[k - 1] }, { t: t0 + seg * 0.6, v: p[k] });
  }
  out.push({ t: 1, v: p[p.length - 1] });
  return out;
}

/** Altura (semitonos) en el instante t ∈ [0, 1], con la subida suavizada. */
export function bendAt(bend, t) {
  const keys = bendKeyframes(bend);
  if (!keys.length) return 0;
  if (t <= keys[0].t) return keys[0].v;
  for (let k = 1; k < keys.length; k += 1) {
    const a = keys[k - 1];
    const b = keys[k];
    if (t <= b.t) {
      const x = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      const ease = x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
      return a.v + (b.v - a.v) * ease;
    }
  }
  return keys[keys.length - 1].v;
}

/** «½», «1», «1½», «full»… como se escribe encima de la flecha del bend. */
export function bendAmountLabel(semis) {
  const tones = Math.round(semis) / 2;
  if (!tones) return '';
  const whole = Math.floor(tones);
  const half = tones - whole ? '½' : '';
  return whole ? `${whole}${half}` : half;
}

/** Texto corto para la nota: «b 1», «b½ r», «pb 1 r»… */
export function bendLabel(bend) {
  const p = bendPoints(bend);
  if (!p) return '';
  const top = Math.max(...p);
  const pre = p[0] > 0;
  const release = p.length > 1 && p[p.length - 1] < top;
  return `${pre ? 'pre-bend' : 'bend'} ${bendAmountLabel(top)}${release ? ' y release' : ''}`;
}

/** Altura final que suena (para comparar con lo que tocas). */
export const bendTarget = (bend) => { const p = bendPoints(bend); return p ? p[p.length - 1] : 0; };

/** Efecto de alphaTex: «b (0 4)», en cuartos de tono. */
export function bendTex(bend) {
  const p = bendPoints(bend);
  if (!p) return null;
  return `b (${p.map((v) => Math.round(v * 2)).join(' ')})`;
}

/** Sufijo de una celda de tab («b», «br», «b½», «b3», «pbr»…) → puntos. */
export function bendFromTech(text) {
  const m = String(text ?? '').match(/(p?)b(½|1½|3|1)?(r?)/);
  if (!m) return null;
  const amount = m[2] === '½' ? 1 : m[2] === '1½' || m[2] === '3' ? 3 : 2;
  if (m[1]) return m[3] ? [amount, 0] : [amount];
  return m[3] ? [0, amount, 0] : [0, amount];
}
