// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedSet {
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rir: number | null;
  rpe: number | null;
  notes: string;
}

export interface ParsedExercise {
  exerciseName: string;
  series: ParsedSet[];
  generalNotes: string;
}

// ─── Number word maps ─────────────────────────────────────────────────────────

const WORD_TO_NUM: Record<string, number> = {
  cero: 0,
  un: 1,   uno: 1,   una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciséis: 16, dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidós: 22, veintidos: 22,
  veintitrés: 23, veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100, ciento: 100,
};

const ORDINAL_TO_NUM: Record<string, number> = {
  primer: 1, primera: 1, primero: 1,
  segundo: 2, segunda: 2,
  tercer: 3,  tercera: 3,  tercero: 3,
  cuarto: 4,  cuarta: 4,
  quinto: 5,  quinta: 5,
  sexto: 6,   sexta: 6,
  séptimo: 7, séptima: 7, septimo: 7, septima: 7,
  octavo: 8,  octava: 8,
  noveno: 9,  novena: 9,
  décimo: 10, décima: 10, decimo: 10, decima: 10,
};

/** Converts a string (digit or word) to a number, or null if not parseable. */
function resolveNumber(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  if (!isNaN(n)) return n;
  const lower = s.toLowerCase();
  return WORD_TO_NUM[lower] ?? ORDINAL_TO_NUM[lower] ?? null;
}

// ─── Regex building blocks ────────────────────────────────────────────────────

// Ordinal words that indicate a series number
const ORD_WORDS =
  'primer(?:o|a)?|segund[oa]|tercer(?:o|a)?|cuart[oa]|quint[oa]|sext[oa]|'
  + 'séptim[oa]|septim[oa]|octav[oa]|noven[oa]|d[eé]cim[oa]';

// Cardinal words used in "serie uno", "serie dos" patterns
const CARD_WORDS = 'uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez';

// Numeric words used in reps/weight patterns
const NUM_WORDS_PAT =
  '\\d+(?:[.,]\\d+)?'
  + '|diez|once|doce|trece|catorce|quince'
  + '|dieciséis|dieciseis|diecisiete|dieciocho|diecinueve'
  + '|veinte|veintiuno|veintid[oó]s|veintitré?s|veinticuatro|veinticinco'
  + '|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien(?:to)?'
  + '|cuatro|cinco|seis|siete|ocho|nueve';

// ─── Normalization ────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[,;.!¡¿?:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ─── Series boundary detection ────────────────────────────────────────────────
//
// A "boundary" is the start of a series block. Two patterns:
//   A. "[la] <ordinal> [serie]"   → e.g. "primera serie", "la segunda", "tercera"
//   B. "serie <ordinal|cardinal|digit>"  → e.g. "serie uno", "serie 1", "serie dos"
//
// We find all boundary positions and slice the text between them.

function buildBoundaryRegex(): RegExp {
  const patA = `(?:la\\s+)?(?:${ORD_WORDS})\\s*(?:serie\\s*)?`;
  const patB = `\\bserie\\s+(?:${ORD_WORDS}|${CARD_WORDS}|\\d+)\\b`;
  return new RegExp(`${patA}|${patB}`, 'gi');
}

interface Boundary {
  index: number;
}

function findBoundaries(text: string): Boundary[] {
  const re = buildBoundaryRegex();
  const result: Boundary[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    result.push({ index: m.index });
  }
  return result;
}

// ─── Per-serie extraction ─────────────────────────────────────────────────────

function extractSetNumber(chunk: string): number | null {
  // Pattern A first: "[la] <ordinal>" — e.g. "primera", "la segunda"
  // Must take precedence over Pattern B to avoid "primera serie 4" → "serie 4" = 4
  const ord = chunk.match(new RegExp(`(?:la\\s+)?(${ORD_WORDS})`, 'i'));
  if (ord) return resolveNumber(ord[1]);

  // Pattern B: "serie <cardinal/ordinal/digit>" — e.g. "serie uno", "serie 1"
  const serieN = chunk.match(
    new RegExp(`\\bserie\\s+(${ORD_WORDS}|${CARD_WORDS}|\\d+)\\b`, 'i')
  );
  if (serieN) return resolveNumber(serieN[1]);

  return null;
}

function parseSingleSerie(segment: string, fallbackIdx: number): ParsedSet {
  const s = normalize(segment);

  const setNumber = extractSetNumber(s) ?? fallbackIdx;

  // ── Reps ──────────────────────────────────────────────────────────────────
  let reps: number | null = null;

  // Explicit: "N repeticiones / reps / rep"
  const repsExplicit = s.match(
    new RegExp(`(${NUM_WORDS_PAT})\\s*(?:repeticiones?|reps?|rep)\\b`, 'i')
  );
  if (repsExplicit) {
    reps = resolveNumber(repsExplicit[1]);
  } else {
    // Implicit: "N con M kilos" — first number is reps
    const implicit = s.match(/(\d+)\s+(?:con\s+)?(\d+(?:[.,]\d+)?)\s*(?:kilos?|kg)\b/i);
    if (implicit) reps = parseInt(implicit[1], 10);
  }

  // ── Weight ─────────────────────────────────────────────────────────────────
  let weight: number | null = null;
  const weightM = s.match(
    new RegExp(`(?:con\\s+)?(${NUM_WORDS_PAT})\\s*(?:kilos?|kg)\\b`, 'i')
  );
  if (weightM) weight = resolveNumber(weightM[1]);

  // ── RIR ───────────────────────────────────────────────────────────────────
  const rirM = s.match(/\brir\s+(\d+(?:[.,]\d+)?)/i);
  const rir = rirM ? parseFloat(rirM[1].replace(',', '.')) : null;

  // ── RPE ───────────────────────────────────────────────────────────────────
  const rpeM = s.match(/\brpe\s+(\d+(?:[.,]\d+)?)/i);
  const rpe = rpeM ? parseFloat(rpeM[1].replace(',', '.')) : null;

  return { setNumber, reps, weight, rir, rpe, notes: '' };
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parses a voice-dictated workout transcript into a structured exercise record.
 *
 * Handles phrases like:
 *   "Press banca, primera serie 4 repeticiones con 30 kilos, segunda serie 7 reps con 30 kilos"
 *   "Sentadilla goblet hice 3 series la primera 10 con 12 kilos la segunda 12 con 12 kilos"
 *   "Peso muerto serie uno 8 reps con 40 kg serie dos 8 reps con 40 kg"
 */
export function parseVoiceTranscript(rawText: string): ParsedExercise | null {
  if (!rawText || !rawText.trim()) return null;

  const t = normalize(rawText);

  const boundaries = findBoundaries(t);

  // ── Exercise name ──────────────────────────────────────────────────────────
  let exerciseName = '';
  if (boundaries.length > 0) {
    exerciseName = t
      .slice(0, boundaries[0].index)
      // Strip "hice N series" lead-in (common in Spanish)
      .replace(/\s*(?:hice?|realizé|hicimos)\s+\d+\s*series?\s*/gi, ' ')
      .replace(/[,. ]+$/, '')
      .trim();
  } else {
    exerciseName = t;
  }

  // ── Series extraction ──────────────────────────────────────────────────────
  let series: ParsedSet[] = [];

  if (boundaries.length === 0) {
    // No explicit series markers — try to parse a single set from the full text
    const repsM = t.match(
      new RegExp(`(${NUM_WORDS_PAT})\\s*(?:repeticiones?|reps?|rep)\\b`, 'i')
    );
    const weightM = t.match(
      new RegExp(`(?:con\\s+)?(${NUM_WORDS_PAT})\\s*(?:kilos?|kg)\\b`, 'i')
    );
    if (repsM || weightM) {
      series = [{
        setNumber: 1,
        reps:   repsM   ? resolveNumber(repsM[1])   : null,
        weight: weightM ? resolveNumber(weightM[1]) : null,
        rir: null, rpe: null, notes: '',
      }];
      // Trim exercise name to everything before reps/weight
      if (repsM) {
        const idx = t.indexOf(repsM[0]);
        if (idx > 0) exerciseName = t.slice(0, idx).replace(/[,. ]+$/, '').trim();
      }
    }
  } else {
    series = boundaries.map((b, i) => {
      const start = b.index;
      const end = i + 1 < boundaries.length ? boundaries[i + 1].index : t.length;
      return parseSingleSerie(t.slice(start, end), i + 1);
    });
  }

  // ── General notes ──────────────────────────────────────────────────────────
  const NOTE_TRIGGERS = [
    'le costó', 'dolor', 'molestia', 'fatiga',
    'nota:', 'bien ejecutado', 'mal ejecutado',
  ];
  let generalNotes = '';
  const lastBound = boundaries.length > 0
    ? boundaries[boundaries.length - 1].index
    : 0;
  for (const trigger of NOTE_TRIGGERS) {
    const idx = t.lastIndexOf(trigger);
    if (idx > lastBound && idx !== -1) {
      generalNotes = capitalize(t.slice(idx).trim());
      break;
    }
  }

  if (!exerciseName && series.length === 0) return null;

  return {
    exerciseName: capitalize(exerciseName),
    series,
    generalNotes,
  };
}
