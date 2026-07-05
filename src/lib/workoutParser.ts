// workoutParser.ts — Lógica de parsing de rutinas escritas en texto plano.
// Sin dependencias de React ni de localStorage; funciones puras y testeables.

import type { EjBiblioteca } from './ejercicios';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PrescriptionType = 'REPS' | 'TIME' | 'DISTANCE' | 'CALORIES';

export interface ParsedPrescription {
  sets: number;
  reps: string | null;      // "12" | "10-12" | null
  duration: string | null;  // "30s" | "60s" | null
  distance: string | null;  // "400m" | "1km" | null
  prescriptionType: PrescriptionType;
}

export interface ExerciseMatch {
  exercise: EjBiblioteca;
  confidence: number;       // 0.0 – 1.0
  method: 'exact' | 'nospace' | 'contains' | 'words' | 'fuzzy';
}

export interface ParsedLine {
  originalText: string;
  exerciseName: string;
  prescription: ParsedPrescription;
  matches: ExerciseMatch[];
  selectedMatch: ExerciseMatch | null;
  needsReview: boolean;     // confidence < 0.9
}

export interface ParseResult {
  parsedLines: ParsedLine[];
  warnings: string[];
}

// ── Normalization ──────────────────────────────────────────────────────────────

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')   // solo alfanuméricos
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Alias system (localStorage) ────────────────────────────────────────────────

const ALIAS_KEY = 'nexa_workout_aliases';

export function getAliases(): Record<string, string> {
  try {
    const s = localStorage.getItem(ALIAS_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

export function saveAlias(inputName: string, exerciseId: string): void {
  try {
    const all = getAliases();
    all[normalizeExerciseName(inputName)] = exerciseId;
    localStorage.setItem(ALIAS_KEY, JSON.stringify(all));
  } catch {}
}

// ── Fuzzy matching ─────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1]
        ? row[j - 1]
        : 1 + Math.min(row[j - 1], row[j], prev);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

export function findExerciseMatches(query: string, library: EjBiblioteca[]): ExerciseMatch[] {
  const normQ  = normalizeExerciseName(query);
  if (!normQ) return [];
  const qNoSp  = normQ.replace(/\s/g, '');
  const qWords = normQ.split(' ').filter(w => w.length > 2);

  const scored: Array<ExerciseMatch & { _s: number }> = [];

  for (const ex of library) {
    const normN  = normalizeExerciseName(ex.nombre);
    const nNoSp  = normN.replace(/\s/g, '');
    const nWords = normN.split(' ').filter(w => w.length > 2);

    let confidence = 0;
    let method: ExerciseMatch['method'] = 'fuzzy';

    if (normQ === normN) {
      confidence = 1.0; method = 'exact';
    } else if (qNoSp === nNoSp && qNoSp.length > 3) {
      confidence = 0.95; method = 'nospace';
    } else if (normN.includes(normQ) && normQ.length >= 4) {
      confidence = 0.70 + 0.20 * (normQ.length / normN.length);
      method = 'contains';
    } else if (normQ.includes(normN) && normN.length >= 4) {
      confidence = 0.70 + 0.20 * (normN.length / normQ.length);
      method = 'contains';
    } else if (qWords.length > 0 && nWords.length > 0) {
      const matchCount = qWords.filter(qw =>
        nWords.some(nw => nw === qw || (nw.length > 4 && (nw.startsWith(qw) || qw.startsWith(nw))))
      ).length;
      const wordScore = matchCount / Math.max(qWords.length, nWords.length);
      if (wordScore > 0) {
        confidence = 0.40 + 0.45 * wordScore;
        method = 'words';
      } else {
        const maxLen = Math.max(normQ.length, normN.length);
        if (maxLen <= 28) {
          const sim = 1 - levenshtein(normQ, normN) / maxLen;
          if (sim > 0.55) { confidence = sim * 0.55; method = 'fuzzy'; }
        }
      }
    }

    if (confidence > 0.30) scored.push({ exercise: ex, confidence, method, _s: confidence });
  }

  return scored
    .sort((a, b) => b._s - a._s)
    .slice(0, 6)
    .map(({ _s: _, ...rest }) => rest);
}

// ── Prescription parser ────────────────────────────────────────────────────────

function buildPrescription(setsStr: string, amountStr: string, unitStr?: string): ParsedPrescription {
  const sets   = Math.max(1, parseInt(setsStr, 10) || 1);
  const unit   = (unitStr ?? '').trim().toLowerCase();
  const amount = amountStr.replace('–', '-').replace(',', '.');

  if (/^(s|seg|segs?|segundo|segundos)$/.test(unit))
    return { sets, reps: null, duration: `${amount}s`, distance: null, prescriptionType: 'TIME' };

  if (/^(min|mins?|minuto|minutos)$/.test(unit)) {
    const secs = Math.round(parseFloat(amount) * 60);
    return { sets, reps: null, duration: `${secs}s`, distance: null, prescriptionType: 'TIME' };
  }

  if (/^(m|metro|metros)$/.test(unit))
    return { sets, reps: null, duration: null, distance: `${amount}m`, prescriptionType: 'DISTANCE' };

  if (/^km$/.test(unit))
    return { sets, reps: null, duration: null, distance: `${amount}km`, prescriptionType: 'DISTANCE' };

  if (/^(cal|caloria|calorias|calor[ií]as?)$/.test(unit))
    return { sets, reps: amount, duration: null, distance: null, prescriptionType: 'CALORIES' };

  // Default: REPS
  return { sets, reps: amount, duration: null, distance: null, prescriptionType: 'REPS' };
}

// Unidad opcional al final de línea
const UNIT_PAT = '(rep(?:s|eticiones?)?|seg(?:undos?)?|s(?:eg)?|min(?:utos?)?|m(?:etros?)?|km|cal(?:or[ií]as?)?)?';
// Cantidad: número simple o rango (10-12)
const AMT_PAT  = '(\\d+(?:[.,]\\d+)?(?:[-–]\\d+)?)';

// Pattern 1: "Ejercicio NxM [unidad]"  — e.g., "Back Squat 3x12", "Plank 3x30s"
const PAT1 = new RegExp(`^(.*?)\\s+(\\d+)\\s*[xX×]\\s*${AMT_PAT}\\s*${UNIT_PAT}\\s*$`, 'i');
// Pattern 2: "Ejercicio N series de M [unidad]"
const PAT2 = new RegExp(`^(.*?)\\s+(\\d+)\\s+(?:series?|sets?)\\s+(?:de\\s+|of\\s+)?${AMT_PAT}\\s*${UNIT_PAT}\\s*$`, 'i');

export function extractPrescription(
  line: string,
): { prescription: ParsedPrescription; exerciseName: string } | null {
  const m1 = line.match(PAT1);
  if (m1 && m1[1].trim()) {
    return { exerciseName: m1[1].trim(), prescription: buildPrescription(m1[2], m1[3], m1[4]) };
  }

  const m2 = line.match(PAT2);
  if (m2 && m2[1].trim()) {
    return { exerciseName: m2[1].trim(), prescription: buildPrescription(m2[2], m2[3], m2[4]) };
  }

  return null;
}

/** Convierte una prescripción en el string que va en Exercise.reps */
export function prescriptionToDisplay(p: ParsedPrescription): string {
  if (p.prescriptionType === 'TIME'     && p.duration) return p.duration;
  if (p.prescriptionType === 'DISTANCE' && p.distance) return p.distance;
  return p.reps ?? '10';
}

// ── Main parse function ────────────────────────────────────────────────────────

export function parseWorkoutText(
  text: string,
  library: EjBiblioteca[],
  aliases: Record<string, string> = {},
): ParseResult {
  const lines    = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !/^[#/]/.test(l));
  const warnings: string[]    = [];
  const parsedLines: ParsedLine[] = [];

  for (const line of lines) {
    const extracted = extractPrescription(line);
    if (!extracted) {
      warnings.push(`No interpretado: "${line}"`);
      continue;
    }

    const { exerciseName, prescription } = extracted;
    const normName = normalizeExerciseName(exerciseName);
    let matches    = findExerciseMatches(exerciseName, library);

    // Alias tiene precedencia: si el coach ya confirmó este nombre antes, usarlo directamente
    const aliasId = aliases[normName];
    if (aliasId) {
      const aliasEx = library.find(e => e.id === aliasId);
      if (aliasEx) {
        matches = [
          { exercise: aliasEx, confidence: 0.99, method: 'exact' },
          ...matches.filter(m => m.exercise.id !== aliasId),
        ];
      }
    }

    const top        = matches[0] ?? null;
    const confidence = top?.confidence ?? 0;

    parsedLines.push({
      originalText: line,
      exerciseName,
      prescription,
      matches,
      selectedMatch: top,
      needsReview: confidence < 0.90,
    });
  }

  return { parsedLines, warnings };
}
