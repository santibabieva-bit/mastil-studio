/**
 * Small natural-language parser for Spanish / English guitar queries.
 * It deliberately errs on the side of being permissive: the UI form remains
 * the source of truth, and the query bar is a shortcut.
 */

import { parseRoot, resolveQuality, getFamily } from './theory.js';

function stripAccents(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalize(value) {
  const text = stripAccents(value)
    .replaceAll('♯', '#')
    .replaceAll('♭', 'b')
    .toLowerCase()
    .trim();

  // Turn "La bemol" / "Do sostenido" into the same tokens as "Lab" / "Do#".
  return text
    .replace(
      /\b(do|re|mi|fa|sol|la|si|[a-g])\s+sostenido\b/g,
      '$1#',
    )
    .replace(
      /\b(do|re|mi|fa|sol|la|si|[a-g])\s+bemol\b/g,
      '$1b',
    );
}

function detectFamily(text) {
  if (/\b(escala|escalas|scale|scales)\b/.test(text)) return 'scale';
  if (/\b(cuatriada|cuatriadas|tetrada|four-note chord)\b/.test(text)) return 'cuatriad';
  if (/\b(triada|triadas|triad|triads|acorde|acordes|chord|chords)\b/.test(text)) return 'triad';
  if (/\b(arpegio|arpegios|arpeggio|arpeggios)\b/.test(text)) return 'arpeggio';
  return null;
}

/**
 * Returns a generic quality bucket, independent of family.
 */
function detectQuality(rawText) {
  const text = normalize(rawText);

  if (/\b(menor\s+armonica|armonica|harmonic\s+minor)\b/.test(text)) {
    return 'harmonicMinor';
  }
  if (/\b(menor\s+melodica|melodica|melodic\s+minor)\b/.test(text)) {
    return 'melodicMinor';
  }
  if (/\b(menor\s+natural|natural\s+minor)\b/.test(text)) {
    return 'minor';
  }
  if (/\b(pentatonica\s+mayor|mayor\s+pentatonica|major\s+pentatonic)\b/.test(text)) {
    return 'pentatonicMajor';
  }
  if (/\b(pentatonica\s+menor|menor\s+pentatonica|minor\s+pentatonic)\b/.test(text)) {
    return 'pentatonicMinor';
  }
  if (/\b(pentatonica|pentatonic)\b/.test(text)) {
    return 'pentatonicMinor';
  }
  if (/\b(blues)\b/.test(text)) {
    return 'blues';
  }
  if (/\b(dorica|dorian)\b/.test(text)) {
    return 'dorian';
  }
  if (/\b(frigia|phrygian)\b/.test(text)) {
    return 'phrygian';
  }
  if (/\b(lidia|lydian)\b/.test(text)) {
    return 'lydian';
  }
  if (/\b(mixolidia|mixolydian)\b/.test(text)) {
    return 'mixolydian';
  }
  if (/\b(locria|locrian)\b/.test(text)) {
    return 'locrian';
  }
  if (/\b(semidisminuid[oa]|m7b5|half\s+diminished)\b/.test(text)) {
    return 'halfDiminished7';
  }
  if (/\b(menor\s+con\s+septima\s+mayor|menor\s+mayor|mmaj7|minmaj7)\b/.test(text)) {
    return 'minorMajor7';
  }
  if (/\b(disminuid[oa]s?|disminuid[oa]s?|diminished|dim7?|°)\b/.test(text)) {
    return /\b(dim7|septima\s+disminuida|septima\s+disminuido)\b/.test(text)
      ? 'diminished7'
      : 'diminished';
  }
  if (/\b(aumentad[oa]s?|augmented|aug7?|\+)\b/.test(text)) {
    return /\b(aug7|septima\s+aumentada)\b/.test(text) ? 'augmented7' : 'augmented';
  }
  if (/\b(septima\s+mayor|mayor\s+septima|major\s+seventh|maj7|ma7|Δ)\b/.test(text)) {
    return 'major7';
  }
  if (/\b(septima\s+menor|menor\s+septima|minor\s+seventh|min7|m7)\b/.test(text)) {
    return 'minor7';
  }
  if (/\b(dominante|dominant|septima|seventh)\b/.test(text)) {
    return 'dominant7';
  }
  if (/\b(menor|minor|min)\b/.test(text) || /\bm\b/.test(text)) {
    return 'minor';
  }
  if (/\b(mayor|major|maj)\b/.test(text)) {
    return 'major';
  }
  return null;
}

function detectSuffixQuality(suffix) {
  if (!suffix) return null;
  const normalized = suffix.toLowerCase();
  if (normalized === 'maj7') return 'major7';
  if (normalized === 'm7b5') return 'halfDiminished7';
  if (normalized === 'mmaj7') return 'minorMajor7';
  if (normalized === 'm7') return 'minor7';
  if (normalized === 'dim7') return 'diminished7';
  if (normalized === 'aug7') return 'augmented7';
  if (normalized === 'dim') return 'diminished';
  if (normalized === 'aug') return 'augmented';
  if (normalized === 'm') return 'minor';
  if (normalized === '7') return 'dominant7';
  return null;
}

function extractRoot(text) {
  // Compact chord symbols such as C#m, G7, F#dim7.
  const compact = text.match(
    /(?:^|\s)([a-g])(#|b)?(maj7|m7b5|mmaj7|m7|dim7|aug7|dim|aug|m|7)(?=\s|$)/,
  );
  if (compact) {
    const token = `${compact[1].toUpperCase()}${compact[2] ?? ''}`;
    try {
      return {
        root: parseRoot(token),
        suffix: compact[3],
        token,
      };
    } catch {
      // Fall through to the more permissive tokenizers.
    }
  }

  // Spanish solfège: Do, Re, Mi, Fa, Sol, La, Si.
  const solfege = text.match(
    /\b(do|re|mi|fa|sol|la|si)(#|b)?(maj7|m7b5|mmaj7|m7|dim7|aug7|dim|aug|m|7)?(?=\s|$)/,
  );
  if (solfege) {
    const token = `${solfege[1]}${solfege[2] ?? ''}`;
    try {
      return {
        root: parseRoot(token),
        suffix: solfege[3] ?? null,
        token,
      };
    } catch {
      // Keep trying.
    }
  }

  // English note letter, standalone: A, C#, Bb.
  const letter = text.match(/\b([a-g])(#|b)?(?=\s|$)/);
  if (letter) {
    const token = `${letter[1].toUpperCase()}${letter[2] ?? ''}`;
    return {
      root: parseRoot(token),
      suffix: null,
      token,
    };
  }

  return null;
}

function mapBucketToQuality(family, bucket) {
  if (!bucket) return null;

  const maps = {
    scale: {
      major: 'major',
      minor: 'naturalMinor',
      harmonicMinor: 'harmonicMinor',
      melodicMinor: 'melodicMinor',
      augmented: 'augmented',
      diminished: 'diminished',
      pentatonicMajor: 'pentatonicMajor',
      pentatonicMinor: 'pentatonicMinor',
      blues: 'blues',
      dorian: 'dorian',
      phrygian: 'phrygian',
      lydian: 'lydian',
      mixolydian: 'mixolydian',
      locrian: 'locrian',
      major7: 'major',
      minor7: 'naturalMinor',
      dominant7: 'major',
      augmented7: 'augmented',
      diminished7: 'diminished',
    },
    cuatriad: {
      major: 'major7',
      major7: 'major7',
      minor: 'minor7',
      minor7: 'minor7',
      dominant7: 'dominant7',
      halfDiminished7: 'halfDiminished7',
      diminished: 'diminished7',
      diminished7: 'diminished7',
      minorMajor7: 'minorMajor7',
      augmented: 'major7',
      augmented7: 'major7',
      harmonicMinor: 'minor7',
      melodicMinor: 'minor7',
    },
    triad: {
      major: 'major',
      minor: 'minor',
      harmonicMinor: 'minor',
      melodicMinor: 'minor',
      augmented: 'augmented',
      diminished: 'diminished',
      pentatonicMajor: 'major',
      pentatonicMinor: 'minor',
      blues: 'minor',
      dorian: 'minor',
      phrygian: 'minor',
      lydian: 'major',
      mixolydian: 'major',
      locrian: 'minor',
      major7: 'major',
      minor7: 'minor',
      dominant7: 'major',
      augmented7: 'augmented',
      diminished7: 'diminished',
    },
    arpeggio: {
      major: 'major7',
      minor: 'minor7',
      harmonicMinor: 'minor7',
      melodicMinor: 'minor7',
      augmented: 'augmented7',
      diminished: 'diminished7',
      pentatonicMajor: 'major7',
      pentatonicMinor: 'minor7',
      blues: 'minor7',
      dorian: 'minor7',
      phrygian: 'minor7',
      lydian: 'major7',
      mixolydian: 'major7',
      locrian: 'minor7',
      major7: 'major7',
      minor7: 'minor7',
      dominant7: 'dominant7',
      augmented7: 'augmented7',
      diminished7: 'diminished7',
    },
  };

  return maps[family]?.[bucket] ?? null;
}

/**
 * Parse a free-text request. Throws if no note can be found.
 *
 * @param {string} query
 * @param {{family?: string, quality?: string}} defaults
 */
export function parseQuery(query, defaults = {}) {
  const raw = String(query ?? '').trim();
  if (!raw) {
    throw new Error('Escribí una consulta, por ejemplo «Escala A».');
  }

  const normalized = normalize(raw);
  const rootMatch = extractRoot(normalized);
  if (!rootMatch) {
    throw new Error(
      'No encontré una nota en la consulta. Probá «Escala A» o «Triada C#m».',
    );
  }

  const explicitFamily = detectFamily(normalized);
  const textQuality = detectQuality(normalized);
  const suffixQuality = detectSuffixQuality(rootMatch.suffix);

  let family = explicitFamily ?? defaults.family ?? null;

  if (!family && rootMatch.suffix) {
    family = ['major7', 'minor7', 'dominant7', 'augmented7', 'diminished7'].includes(
      suffixQuality,
    )
      ? 'arpeggio'
      : 'triad';
  }

  family = family ?? 'scale';

  const bucket = suffixQuality ?? textQuality;
  const mappedQuality = mapBucketToQuality(family, bucket);
  const quality = resolveQuality(family, mappedQuality ?? defaults.quality);

  return {
    root: rootMatch.root,
    family: getFamily(family).id,
    quality,
    familyWasExplicit: Boolean(explicitFamily),
    qualityWasExplicit: Boolean(bucket),
    source: raw,
    suffix: rootMatch.suffix,
  };
}

export { detectFamily, detectQuality };
