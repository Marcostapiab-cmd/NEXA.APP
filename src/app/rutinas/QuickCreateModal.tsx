'use client';

import { useState, useEffect, useRef } from 'react';
import { X, FileText, Search, Trash2, Plus } from 'lucide-react';
import type { EjBiblioteca } from '@/lib/ejercicios';
import { getAllEjercicios, saveEjercicioPropio } from '@/lib/ejercicios';
import {
  parseWorkoutText,
  findExerciseMatches,
  prescriptionToDisplay,
  saveAlias,
  getAliases,
  type ParsedPrescription,
  type ExerciseMatch,
  type PrescriptionType,
} from '@/lib/workoutParser';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RowState {
  id: string;
  originalText: string;
  exerciseName: string;
  sets: number;
  repsStr: string;
  prescriptionType: PrescriptionType;
  selectedExercise: EjBiblioteca | null;
  matches: ExerciseMatch[];
  confidence: number;
  needsReview: boolean;
  showSearch: boolean;
  searchQuery: string;
}

export interface QuickExercise {
  name: string;
  series: number;
  reps: string;
  rest: string;
  youtubeUrl?: string;
  exerciseLibraryId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PLACEHOLDER = `Back Squat 3x12
Lat Pulldown 3x10-12
Dumbbell Lateral Raises 4x15
Plank 3x30 segundos
Running 4x400 metros`;

// ── ConfidenceBadge ────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence, needsReview }: { confidence: number; needsReview: boolean }) {
  if (confidence === 0)
    return (
      <span className="shrink-0 rounded-md bg-red-950/30 px-2 py-0.5 text-[10px] font-bold text-red-400">
        Buscar
      </span>
    );
  if (needsReview)
    return (
      <span className="shrink-0 rounded-md bg-yellow-950/30 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
        ⚠ Revisar
      </span>
    );
  return (
    <span className="shrink-0 rounded-md bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
      ✓ OK
    </span>
  );
}

// ── PreviewRow ─────────────────────────────────────────────────────────────────

function PreviewRow({
  row,
  library,
  onUpdate,
  onDelete,
  onSelect,
}: {
  row: RowState;
  library: EjBiblioteca[];
  onUpdate: (changes: Partial<RowState>) => void;
  onDelete: () => void;
  onSelect: (ex: EjBiblioteca) => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (row.showSearch) searchInputRef.current?.focus();
  }, [row.showSearch]);

  const liveResults =
    row.showSearch && row.searchQuery.trim().length >= 2
      ? findExerciseMatches(row.searchQuery, library).slice(0, 5)
      : [];

  const dotColor =
    row.confidence === 0 ? '#ef4444' : row.needsReview ? '#eab308' : '#22c55e';

  return (
    <div className="border-b border-[#0f0f0f] py-3 last:border-none">
      {/* ── Main row ── */}
      <div className="flex items-start gap-2">
        {/* Status dot */}
        <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />

        {/* Exercise name */}
        <div className="min-w-0 flex-1">
          {row.selectedExercise ? (
            <button
              onClick={() => onUpdate({ showSearch: !row.showSearch, searchQuery: '' })}
              className="text-left text-sm font-semibold text-white transition hover:text-[#D4AF37]"
            >
              {row.selectedExercise.nombre}
            </button>
          ) : (
            <input
              value={row.exerciseName}
              onChange={e => onUpdate({ exerciseName: e.target.value })}
              className="w-full bg-transparent text-sm font-semibold text-red-400 outline-none placeholder-[#444444]"
              placeholder="Nombre del ejercicio"
            />
          )}
          <p className="truncate text-[10px] text-[#2a2a2a]">{row.originalText}</p>
        </div>

        {/* Sets × Reps */}
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            min="1"
            max="20"
            value={row.sets}
            onChange={e => onUpdate({ sets: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-9 rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] py-1 text-center text-sm text-white outline-none focus:border-[#333333] tabular-nums"
          />
          <span className="text-[11px] text-[#2a2a2a]">×</span>
          <input
            value={row.repsStr}
            onChange={e => onUpdate({ repsStr: e.target.value })}
            className="w-14 rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] py-1 text-center text-sm text-white outline-none focus:border-[#333333]"
          />
        </div>

        {/* Badge */}
        <ConfidenceBadge confidence={row.confidence} needsReview={row.needsReview} />

        {/* Delete */}
        <button
          onClick={onDelete}
          className="mt-0.5 shrink-0 rounded-lg p-1 text-[#1e1e1e] transition hover:text-[#ef4444]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Inline suggestions (when needsReview and search is closed) ── */}
      {(row.needsReview || row.confidence === 0) && !row.showSearch && (
        <div className="ml-4 mt-2 space-y-1">
          {row.matches.slice(0, 3).map(m => (
            <button
              key={m.exercise.id}
              onClick={() => onSelect(m.exercise)}
              className="flex w-full items-center gap-2 rounded-lg border border-[#1a1a1a] bg-[#111111] px-3 py-1.5 text-left transition hover:border-[#D4AF37]/20 hover:bg-[#D4AF37]/5"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-[#888888]">
                {m.exercise.nombre}
              </span>
              <span
                className="shrink-0 text-[9px] font-bold tabular-nums"
                style={{ color: m.confidence >= 0.9 ? '#22c55e' : m.confidence >= 0.65 ? '#eab308' : '#888888' }}
              >
                {Math.round(m.confidence * 100)}%
              </span>
            </button>
          ))}
          <button
            onClick={() => onUpdate({ showSearch: true, searchQuery: '' })}
            className="mt-1 flex items-center gap-1.5 text-[11px] text-[#333333] transition hover:text-[#D4AF37]"
          >
            <Search className="h-3 w-3" /> Buscar en biblioteca
          </button>
        </div>
      )}

      {/* ── Mini search ── */}
      {row.showSearch && (
        <div className="ml-4 mt-2 space-y-1.5">
          <input
            ref={searchInputRef}
            value={row.searchQuery}
            onChange={e => onUpdate({ searchQuery: e.target.value })}
            placeholder="Buscar ejercicio en biblioteca..."
            className="w-full rounded-xl border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm text-white placeholder-[#333333] outline-none focus:border-[#444444]"
          />
          {liveResults.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[#1a1a1a]">
              {liveResults.map(m => (
                <button
                  key={m.exercise.id}
                  onClick={() => onSelect(m.exercise)}
                  className="flex w-full items-center gap-2 border-b border-[#0f0f0f] px-3 py-2 text-left transition last:border-none hover:bg-[#141414]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{m.exercise.nombre}</span>
                  <span className="shrink-0 text-[10px] text-[#444444]">{m.exercise.grupo}</span>
                </button>
              ))}
            </div>
          )}
          {row.searchQuery.trim().length >= 2 && liveResults.length === 0 && (
            <p className="text-xs text-[#333333]">Sin resultados</p>
          )}
          <button
            onClick={() => onUpdate({ showSearch: false, searchQuery: '' })}
            className="text-[10px] text-[#333333] transition hover:text-white"
          >
            Cerrar búsqueda
          </button>
        </div>
      )}
    </div>
  );
}

// ── QuickCreateModal ───────────────────────────────────────────────────────────

interface QuickCreateModalProps {
  onAdd: (exercises: QuickExercise[]) => void;
  onClose: () => void;
}

export default function QuickCreateModal({ onAdd, onClose }: QuickCreateModalProps) {
  const [step, setStep]       = useState<'input' | 'preview'>('input');
  const [text, setText]       = useState('');
  const [rows, setRows]       = useState<RowState[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [library, setLibrary] = useState<EjBiblioteca[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLibrary(getAllEjercicios());
    textRef.current?.focus();
  }, []);

  // ── Parse ──────────────────────────────────────────────────────────────────

  function interpret() {
    if (!text.trim()) return;
    const aliases = getAliases();
    const result  = parseWorkoutText(text, library, aliases);

    setRows(
      result.parsedLines.map(line => ({
        id:               crypto.randomUUID(),
        originalText:     line.originalText,
        exerciseName:     line.exerciseName,
        sets:             line.prescription.sets,
        repsStr:          prescriptionToDisplay(line.prescription),
        prescriptionType: line.prescription.prescriptionType,
        selectedExercise: line.selectedMatch?.exercise ?? null,
        matches:          line.matches,
        confidence:       line.selectedMatch?.confidence ?? 0,
        needsReview:      line.needsReview,
        showSearch:       false,
        searchQuery:      '',
      })),
    );
    setWarnings(result.warnings);
    setStep('preview');
  }

  // ── Row helpers ────────────────────────────────────────────────────────────

  function updateRow(id: string, changes: Partial<RowState>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...changes } : r)));
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function selectExercise(rowId: string, ex: EjBiblioteca) {
    updateRow(rowId, {
      selectedExercise: ex,
      exerciseName:     ex.nombre,
      confidence:       1.0,
      needsReview:      false,
      showSearch:       false,
      searchQuery:      '',
    });
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  function confirmAdd() {
    const exercises: QuickExercise[] = [];

    for (const row of rows) {
      // Guardar alias si el coach confirmó una coincidencia no exacta
      if (row.selectedExercise && row.confidence < 0.99) {
        saveAlias(row.exerciseName, row.selectedExercise.id);
      }

      if (row.selectedExercise) {
        exercises.push({
          name:             row.selectedExercise.nombre,
          series:           row.sets,
          reps:             row.repsStr,
          rest:             '90s',
          youtubeUrl:       row.selectedExercise.videoUrl,
          exerciseLibraryId: row.selectedExercise.id,
        });
      } else if (row.exerciseName.trim()) {
        const newEx: EjBiblioteca = {
          id:     `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          nombre: row.exerciseName.trim(),
          grupo:  '',
        };
        saveEjercicioPropio(newEx);
        exercises.push({
          name:             newEx.nombre,
          series:           row.sets,
          reps:             row.repsStr,
          rest:             '90s',
          exerciseLibraryId: newEx.id,
        });
      }
    }

    if (exercises.length > 0) onAdd(exercises);
  }

  const needsReviewCount = rows.filter(r => r.needsReview || r.confidence === 0).length;

  // ── Step 1: Input ──────────────────────────────────────────────────────────

  if (step === 'input') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
        <div className="w-full max-w-xl rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1e1e1e] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-[#D4AF37]" />
              <p className="text-sm font-bold text-white">Crear desde texto</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-[#1e1e1e] p-1.5 text-[#444444] transition hover:border-[#333333] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <p className="text-xs text-[#444444]">
              Escribe cada ejercicio en una línea.{' '}
              <span className="text-[#555555]">Formato: Ejercicio Series×Reps</span>
            </p>

            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) interpret(); }}
              rows={10}
              placeholder={PLACEHOLDER}
              className="w-full resize-none rounded-xl border border-[#1e1e1e] bg-[#111111] px-4 py-3 font-mono text-sm leading-relaxed text-white placeholder-[#2a2a2a] outline-none focus:border-[#2a2a2a]"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={interpret}
                disabled={!text.trim()}
                className="flex-1 rounded-xl bg-[#D4AF37] py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-25"
              >
                Interpretar rutina
              </button>
              <button
                onClick={() => setText('')}
                className="rounded-xl border border-[#1e1e1e] px-3 py-2.5 text-xs font-medium text-[#555555] transition hover:border-[#333333] hover:text-white"
              >
                Limpiar
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-[#1e1e1e] px-3 py-2.5 text-xs font-medium text-[#555555] transition hover:border-[#333333] hover:text-white"
              >
                Cancelar
              </button>
            </div>

            <p className="text-[10px] text-[#222222]">
              ⌘+Enter para interpretar · Soporta: 3x12 · 3 x 10-12 · 3x30s · 3x30 segundos · 4x400 metros · 3 series de 12
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Preview ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-4 pt-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e1e] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-white">
              Vista previa — {rows.length} ejercicio{rows.length !== 1 ? 's' : ''}
            </p>
            {needsReviewCount > 0 && (
              <p className="mt-0.5 text-[11px] text-yellow-500/70">
                {needsReviewCount} ejercicio{needsReviewCount !== 1 ? 's' : ''} {needsReviewCount !== 1 ? 'necesitan' : 'necesita'} revisión
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-[#1e1e1e] p-1.5 text-[#444444] transition hover:border-[#333333] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="border-b border-[#1e1e1e] bg-yellow-950/10 px-5 py-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-700">
              Líneas no interpretadas
            </p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-[#444444]">{w}</p>
            ))}
          </div>
        )}

        {/* Column headers */}
        {rows.length > 0 && (
          <div className="flex items-center gap-2 border-b border-[#0f0f0f] px-5 py-2">
            <div className="ml-3.5 flex-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#2a2a2a]">Ejercicio</div>
            <div className="w-[85px] shrink-0 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-[#2a2a2a]">Series × Reps</div>
            <div className="w-[68px] shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[#2a2a2a]">Estado</div>
            <div className="w-5" />
          </div>
        )}

        {/* Rows */}
        <div className="max-h-[55vh] overflow-y-auto px-5">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#333333]">
              Sin ejercicios interpretados
            </p>
          ) : (
            rows.map(row => (
              <PreviewRow
                key={row.id}
                row={row}
                library={library}
                onUpdate={changes => updateRow(row.id, changes)}
                onDelete={() => deleteRow(row.id)}
                onSelect={ex => selectExercise(row.id, ex)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="space-y-3 border-t border-[#1e1e1e] p-4">
          <div className="flex gap-2">
            <button
              onClick={confirmAdd}
              disabled={rows.length === 0}
              className="flex-1 rounded-xl bg-[#D4AF37] py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-25"
            >
              <span className="flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Agregar {rows.length} ejercicio{rows.length !== 1 ? 's' : ''} a la rutina
              </span>
            </button>
            <button
              onClick={() => setStep('input')}
              className="rounded-xl border border-[#1e1e1e] px-4 py-3 text-sm font-medium text-[#555555] transition hover:border-[#333333] hover:text-white"
            >
              ← Editar texto
            </button>
          </div>
          {needsReviewCount > 0 && (
            <p className="text-center text-[10px] text-[#333333]">
              Puedes agregar igual — los ejercicios con revisión usarán el nombre tal como fue detectado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
