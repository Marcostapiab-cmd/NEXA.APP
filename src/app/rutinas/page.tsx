'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Trash2, Plus, ChevronLeft, ChevronRight,
  X, Download, Copy, Save, FolderOpen, GripVertical, Search, FileText,
  Users, ArrowLeft, PlayCircle,
} from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { getMergedEjercicios, getEjerciciosPropios, saveEjercicioPropio, type EjBiblioteca } from '@/lib/ejercicios';
import { getRutinasDB, saveRutinaDB, deleteRutinaDB } from '@/lib/rutinas-supabase';
import { getAllPlanesDB } from '@/lib/planes-supabase';
import type { Plan } from '@/lib/planes';
import { getAlumnos } from '@/lib/alumnos';
import QuickCreateModal, { type QuickExercise } from './QuickCreateModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string; name: string;
  series: number; reps: string; weight?: string; rest: string;
  tempo?: string; notes?: string; youtubeUrl?: string;
  exerciseLibraryId?: string;
}
interface CalSession { name: string; exercises: Exercise[]; }
interface Routine {
  id: string; name: string;
  startDate: string; endDate: string;
  alumnoId?: string;
  alumnoIds: string[];
  sessions: Record<string, CalSession>;
}
interface Plantilla { id: string; nombre: string; exercises: Exercise[]; creadaEn: string; }


// ─── Migration ────────────────────────────────────────────────────────────────

function computeEndDate(start: string, weeks: number): string {
  if (!start || weeks <= 0) return '';
  const d = new Date(start + 'T12:00:00');
  d.setDate(d.getDate() + weeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}

function migrateToCalendar(raw: any): Routine {
  if ('sessions' in raw && !(raw.blocks?.length > 0)) {
    return {
      ...raw as Routine,
      alumnoId: raw.alumnoId ?? raw.alumnoIds?.[0],
    };
  }
  const sessions: Record<string, CalSession> = {};
  if (raw.startDate) {
    const blocks: Array<{ id: string; name: string; exercises: Exercise[] }> = raw.blocks ?? [];
    if (!blocks.length && (raw.exercises ?? []).length)
      blocks.push({ id: 'legacy', name: raw.name, exercises: raw.exercises });
    const dayToBlock: Record<number, string> = raw.dayToBlock ?? {};
    const selectedDays: number[] = raw.selectedDays ?? [];
    const weekOverrides: Record<string, string> = raw.weekOverrides ?? {};
    const weeks: number = raw.weeks ?? 4;
    if (selectedDays.length && blocks.length) {
      const start = new Date(raw.startDate + 'T12:00:00');
      const dow = start.getDay() === 0 ? 6 : start.getDay() - 1;
      const mon = new Date(start); mon.setDate(start.getDate() - dow);
      for (let w = 0; w < weeks; w++) {
        for (const d of selectedDays) {
          const date = new Date(mon); date.setDate(mon.getDate() + w * 7 + d);
          if (date < start) continue;
          const ov = weekOverrides[`${w}-${d}`];
          const blockId = ov !== undefined ? (ov === '__rest__' ? null : ov) : (dayToBlock[d] ?? null);
          if (!blockId) continue;
          const block = blocks.find(b => b.id === blockId);
          if (!block) continue;
          sessions[date.toISOString().slice(0, 10)] = { name: block.name, exercises: block.exercises };
        }
      }
    }
  }
  const weeks: number = raw.weeks ?? 4;
  const endDate = raw.endDate ?? (raw.startDate ? computeEndDate(raw.startDate, weeks) : '');
  return {
    id: raw.id, name: raw.name, startDate: raw.startDate ?? '',
    endDate, alumnoId: raw.alumnoIds?.[0], alumnoIds: raw.alumnoIds ?? [], sessions,
  };
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW_LABEL  = ['L','M','X','J','V','S','D'];
const DOW_FULL   = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function buildMonthGrid(year: number, month: number): Date[][] {
  const first    = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const cur = new Date(first); cur.setDate(1 - startDow);
  const rows: Date[][] = [];
  while (rows.length < 6) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    rows.push(week);
    if (rows.length >= 4 && new Date(cur) > lastDay) break;
  }
  return rows;
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const IC = 'w-full rounded-lg border border-[#D8D8D8] bg-[#F0F0F0] px-3 py-2.5 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#9B9B9B]';
const LC = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]';

// ─── Plan status helper ───────────────────────────────────────────────────────

function getAlumnoPlanBadge(alumnoId: string, planes: Plan[]): { label: string; color: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const active = planes.find(p =>
    p.alumnoId === alumnoId && p.endDate >= today && (p.totalClases - p.usedClases) > 0
  );
  if (active) return { label: `${active.totalClases - active.usedClases} clases`, color: '#4A8A5A' };
  if (planes.some(p => p.alumnoId === alumnoId)) return { label: 'Plan vencido', color: '#B44040' };
  return null;
}

// ─── ExerciseSearch ───────────────────────────────────────────────────────────
// Replaces ExerciseForm + BibliotecaModal. Two-step: search → configure.

function ExerciseSearch({ onAdd, onCancel }: {
  onAdd: (e: Omit<Exercise, 'id'>) => void; onCancel: () => void;
}) {
  const [q, setQ]       = useState('');
  const [step, setStep] = useState<'search' | 'config'>('search');
  const [picked, setPicked] = useState<{
    name: string; youtubeUrl: string; exerciseLibraryId?: string;
  } | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [form, setForm] = useState({
    series: 3, reps: '10', rest: '90s', tempo: '', notes: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargamos todos los ejercicios desde la Biblioteca (base + overlays + propios del coach)
  const [allExs, setAllExs] = useState<EjBiblioteca[]>([]);
  useEffect(() => {
    setAllExs([...getMergedEjercicios(), ...getEjerciciosPropios()]);
  }, []);

  const suggestions = q.trim().length >= 2
    ? allExs.filter(e => e.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : [];

  const exactMatch = allExs.some(e => e.nombre.toLowerCase() === q.toLowerCase().trim());
  const canCreate  = q.trim().length >= 2 && !exactMatch;

  function pick(ej: EjBiblioteca) {
    setPicked({ name: ej.nombre, youtubeUrl: ej.videoUrl ?? '', exerciseLibraryId: ej.id });
    setIsCustom(false);
    setStep('config');
  }

  function createNew() {
    setPicked({ name: q.trim(), youtubeUrl: '' });
    setIsCustom(true);
    setStep('config');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    let libraryId = picked.exerciseLibraryId;
    if (isCustom) {
      const newEx: EjBiblioteca = { id: `custom-${Date.now()}`, nombre: picked.name, grupo: '' };
      saveEjercicioPropio(newEx);
      libraryId = newEx.id;
      setAllExs(prev => [...prev, newEx]);
    }
    onAdd({
      name: picked.name,
      series: form.series, reps: form.reps, rest: form.rest,
      tempo: form.tempo, notes: form.notes,
      youtubeUrl: picked.youtubeUrl,
      exerciseLibraryId: libraryId,
    });
  }

  // ── Step 1: Search ──────────────────────────────────────────────────────────
  if (step === 'search') {
    return (
      <div className="rounded-xl border border-[#D8D8D8] bg-[#F5F5F5] p-4">
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">
          Agregar ejercicio
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9B9B9B]" />
          <input ref={inputRef} autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar ejercicio (sentadilla, press banca...)"
            className="w-full rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] py-2.5 pl-10 pr-4 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none focus:border-[#9B9B9B]" />
        </div>

        {(suggestions.length > 0 || canCreate) && (
          <div className="mt-2 overflow-hidden rounded-xl border border-[#E0E0E0]">
            {suggestions.map(ej => (
              <button key={ej.id}
                onClick={() => pick(ej)}
                className="flex w-full items-center gap-3 border-b border-[#EBEBEB] px-3 py-2.5 text-left transition last:border-none hover:bg-[#EBEBEB]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#121212]">{ej.nombre}</p>
                </div>
                {ej.videoUrl
                  ? <span className="shrink-0 text-[9px] font-bold text-[#121212]/60">VIDEO</span>
                  : <Plus className="h-3.5 w-3.5 shrink-0 text-[#9B9B9B]" />}
              </button>
            ))}
            {canCreate && (
              <button onClick={createNew}
                className="flex w-full items-center gap-2 border-t border-[#E0E0E0] px-3 py-2.5 text-left transition hover:bg-[#EBEBEB]">
                <Plus className="h-3.5 w-3.5 text-[#121212]" />
                <span className="text-sm text-[#121212]">Crear "{q.trim()}"</span>
              </button>
            )}
          </div>
        )}

        {q.trim().length >= 2 && suggestions.length === 0 && !canCreate && (
          <p className="mt-2 text-xs text-[#9B9B9B]">Sin resultados para "{q}"</p>
        )}

        <button onClick={onCancel}
          className="mt-3 text-xs text-[#9B9B9B] transition hover:text-[#6E6E6E]">
          Cancelar
        </button>
      </div>
    );
  }

  // ── Step 2: Configure ───────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="rounded-xl border border-[#D8D8D8] bg-[#F5F5F5] p-4">
      <div className="mb-4 flex items-center gap-2.5">
        <p className="flex-1 text-sm font-bold text-[#121212]">{picked?.name}</p>
        {picked?.youtubeUrl && (
          <span className="rounded-md bg-[#121212]/6 px-2 py-0.5 text-[9px] font-bold text-[#121212]">
            Video incluido
          </span>
        )}
        <button type="button" onClick={() => setStep('search')}
          className="text-[10px] text-[#9B9B9B] transition hover:text-[#121212]">
          ← Cambiar
        </button>
      </div>

      <div className="space-y-3">

        {/* Series · Reps · Descanso — el peso se registra en Weightroom */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={LC}>Series</label>
            <input type="number" min="1" value={form.series}
              onChange={e => setForm(f => ({ ...f, series: parseInt(e.target.value) || 1 }))}
              className={IC} />
          </div>
          <div>
            <label className={LC}>Reps</label>
            <input value={form.reps} placeholder="10"
              onChange={e => setForm(f => ({ ...f, reps: e.target.value }))} className={IC} />
          </div>
          <div>
            <label className={LC}>Descanso</label>
            <input value={form.rest} placeholder="90s"
              onChange={e => setForm(f => ({ ...f, rest: e.target.value }))} className={IC} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LC}>Tempo</label>
            <input value={form.tempo} placeholder="3-1-2-1"
              onChange={e => setForm(f => ({ ...f, tempo: e.target.value }))} className={IC} />
          </div>
          <div>
            <label className={LC}>Nota técnica</label>
            <input value={form.notes} placeholder="Agarre neutro..."
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={IC} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="submit"
          className="rounded-xl bg-[#121212] px-5 py-2.5 text-xs font-bold text-white transition hover:brightness-110">
          Agregar ejercicio
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-[#D8D8D8] px-4 py-2.5 text-xs font-medium text-[#777777] transition hover:border-[#9B9B9B] hover:text-[#121212]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── CopyToCalendarModal ──────────────────────────────────────────────────────

function allWeekdayDates(dow: number, rangeStart: string, rangeEnd: string, exclude: string): string[] {
  if (!rangeStart || !rangeEnd) return [];
  const jsDow = (dow + 1) % 7;
  const start = new Date(rangeStart + 'T12:00:00');
  const end   = new Date(rangeEnd   + 'T12:00:00');
  const cur   = new Date(start);
  while (cur.getDay() !== jsDow) cur.setDate(cur.getDate() + 1);
  const result: string[] = [];
  while (cur <= end) {
    const ds = toDateStr(cur);
    if (ds !== exclude) result.push(ds);
    cur.setDate(cur.getDate() + 7);
  }
  return result;
}

function CopyToCalendarModal({ sourceDate, session, routine, onCopy, onClose }: {
  sourceDate: string; session: CalSession; routine: Routine;
  onCopy: (dates: string[]) => void; onClose: () => void;
}) {
  const srcD = new Date(sourceDate + 'T12:00:00');

  const [rangeStart,    setRangeStart]    = useState(routine.startDate ?? '');
  const [rangeEnd,      setRangeEnd]      = useState(routine.endDate   ?? '');
  const [selected,      setSelected]      = useState<Set<string>>(new Set<string>());
  const [viewYear,      setViewYear]      = useState(srcD.getFullYear());
  const [viewMonth,     setViewMonth]     = useState(srcD.getMonth());
  const [conflictMode,  setConflictMode]  = useState<'asking' | null>(null);

  const grid = buildMonthGrid(viewYear, viewMonth);

  function inRange(ds: string) {
    if (!rangeStart || !rangeEnd) return false;
    return ds >= rangeStart && ds <= rangeEnd && ds !== sourceDate;
  }

  function getDayDates(dow: number) { return allWeekdayDates(dow, rangeStart, rangeEnd, sourceDate); }
  function isDayChecked(dow: number) { const d = getDayDates(dow); return d.length > 0 && d.every(x => selected.has(x)); }
  function isDayPartial(dow: number) { const d = getDayDates(dow); return d.some(x => selected.has(x)) && !d.every(x => selected.has(x)); }

  function toggleWeekday(dow: number) {
    const dates  = getDayDates(dow);
    const allOn  = dates.every(d => selected.has(d));
    setSelected(prev => {
      const next = new Set(prev);
      allOn ? dates.forEach(d => next.delete(d)) : dates.forEach(d => next.add(d));
      return next;
    });
  }

  function toggleDate(ds: string) {
    if (!inRange(ds)) return;
    setSelected(prev => { const n = new Set(prev); n.has(ds) ? n.delete(ds) : n.add(ds); return n; });
  }

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }

  const sortedDates    = [...selected].sort();
  const overwriteDates = sortedDates.filter(d => !!routine.sessions[d]);

  function handleCopyClick() {
    if (overwriteDates.length > 0) { setConflictMode('asking'); }
    else { onCopy(sortedDates); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#D8D8D8] bg-[#F5F5F5] shadow-2xl">

        {/* ── Conflict overlay ── */}
        {conflictMode === 'asking' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-sm">
            <div className="mx-6 w-full max-w-sm rounded-2xl border border-[#D8D8D8] bg-[#EBEBEB] p-6">
              <p className="text-sm font-bold text-[#121212]">Conflicto de fechas</p>
              <p className="mt-2 text-xs text-[#777777]">
                {overwriteDates.length} fecha{overwriteDates.length !== 1 ? 's' : ''} ya
                {overwriteDates.length === 1 ? ' tiene' : ' tienen'} rutina asignada.
                ¿Qué deseas hacer?
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => { onCopy(sortedDates.filter(d => !routine.sessions[d])); onClose(); }}
                  className="rounded-xl border border-[#D8D8D8] py-2.5 text-sm font-semibold text-[#5E5E5E] transition hover:border-[#9B9B9B] hover:text-[#121212]">
                  Saltar esas fechas
                </button>
                <button
                  onClick={() => { onCopy(sortedDates); onClose(); }}
                  className="rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:brightness-110">
                  Reemplazar todas
                </button>
                <button
                  onClick={() => setConflictMode(null)}
                  className="py-1.5 text-xs text-[#9B9B9B] transition hover:text-[#121212]">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D8D8D8] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">Copiar rutina</p>
            <p className="mt-0.5 text-[11px] text-[#888888]">
              {srcD.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              {session.name ? ` · ${session.name}` : ''}
              {session.exercises.length > 0 ? ` · ${session.exercises.length} ejercicios` : ''}
            </p>
          </div>
          <button onClick={onClose}
            className="rounded-xl border border-[#D8D8D8] p-2 text-[#888888] transition hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">

          {/* 1. Date range */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9B9B9B]">
              Copiar dentro del rango
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-[#888888]">Desde</label>
                <input type="date" value={rangeStart}
                  onChange={e => { setRangeStart(e.target.value); setSelected(new Set()); }}
                  className="w-full rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] px-3 py-2 text-xs text-[#121212] outline-none focus:border-[#9B9B9B]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[#888888]">Hasta</label>
                <input type="date" value={rangeEnd}
                  onChange={e => { setRangeEnd(e.target.value); setSelected(new Set()); }}
                  className="w-full rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] px-3 py-2 text-xs text-[#121212] outline-none focus:border-[#9B9B9B]" />
              </div>
            </div>
          </div>

          {/* 2. Weekday checkboxes */}
          <div>
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9B9B9B]">
              Días de la semana
            </p>
            {(!rangeStart || !rangeEnd) ? (
              <p className="text-xs text-[#AAAAAA]">Define el rango de fechas para activar esta opción.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {DOW_FULL.map((label, dow) => {
                  const checked = isDayChecked(dow);
                  const partial = isDayPartial(dow);
                  const count   = getDayDates(dow).length;
                  return (
                    <button key={dow} onClick={() => toggleWeekday(dow)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                        checked || partial
                          ? 'border-[#121212]/18 bg-[#121212]/7'
                          : 'border-[#DEDEDE] hover:border-[#C8C8C8]'
                      }`}>
                      <span className="flex shrink-0 items-center justify-center rounded border transition"
                        style={{
                          width: 17, height: 17,
                          borderColor: checked ? '#121212' : partial ? 'rgba(18,18,18,0.5)' : '#D8D8D8',
                          backgroundColor: checked ? '#121212' : partial ? 'rgba(18,18,18,0.15)' : '#F0F0F0',
                        }}>
                        {checked && <span className="text-[8px] font-black leading-none text-white">✓</span>}
                        {partial && !checked && <span className="block h-px w-2 rounded-full bg-[#121212]" />}
                      </span>
                      <div>
                        <p className={`text-xs font-semibold leading-none ${checked || partial ? 'text-[#121212]' : 'text-[#777777]'}`}>
                          {label}
                        </p>
                        {count > 0 && (
                          <p className="mt-0.5 text-[9px] text-[#9B9B9B]">{count} {count === 1 ? 'vez' : 'veces'}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Calendar picker */}
          <div>
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9B9B9B]">
              O selecciona fechas específicas
            </p>
            <div className="overflow-hidden rounded-xl border border-[#E0E0E0]">
              <div className="flex items-center border-b border-[#E0E0E0] bg-[#F8F8F8] px-2 py-1.5">
                <button onClick={prevMonth} className="rounded-lg p-1.5 text-[#888888] transition hover:text-[#121212]">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="flex-1 text-center text-xs font-bold text-[#121212]">
                  {MONTHS_ES[viewMonth]} {viewYear}
                </span>
                <button onClick={nextMonth} className="rounded-lg p-1.5 text-[#888888] transition hover:text-[#121212]">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-7 border-b border-[#EBEBEB] bg-[#F8F8F8]">
                {DOW_LABEL.map(d => (
                  <div key={d} className="py-1.5 text-center text-[9px] font-bold uppercase text-[#AAAAAA]">{d}</div>
                ))}
              </div>
              {grid.map((week, wi) => (
                <div key={wi} className={`grid grid-cols-7 ${wi < grid.length - 1 ? 'border-b border-[#EBEBEB]' : ''}`}>
                  {week.map((date, di) => {
                    const ds          = toDateStr(date);
                    const isThisMonth = date.getMonth() === viewMonth;
                    const isSource    = ds === sourceDate;
                    const canClick    = inRange(ds) && isThisMonth;
                    const isSel       = selected.has(ds);
                    const hasSess     = !!routine.sessions[ds] && !isSource;
                    return (
                      <button key={di} onClick={() => canClick && toggleDate(ds)}
                        disabled={isSource || !canClick}
                        className={`relative flex h-9 w-full flex-col items-center justify-center gap-[2px] transition
                          ${di < 6 ? 'border-r border-[#EBEBEB]' : ''}
                          ${!isThisMonth ? 'pointer-events-none opacity-0' : ''}
                          ${isSource ? 'cursor-default' : canClick ? 'cursor-pointer hover:bg-[#EBEBEB]' : 'cursor-default opacity-20'}
                        `}>
                        {isSource && <div className="absolute inset-0.5 rounded-lg border border-[#121212]/28 bg-[#121212]/6" />}
                        {isSel && !isSource && <div className="absolute inset-0.5 rounded-lg bg-[#121212]/8" />}
                        <span className={`relative z-10 text-[11px] font-semibold ${
                          isSource ? 'text-[#121212]' : isSel ? 'text-[#121212]' : canClick ? 'text-[#777777]' : 'text-[#DEDEDE]'
                        }`}>
                          {date.getDate()}
                        </span>
                        {hasSess && (
                          <div className={`relative z-10 h-[2px] w-3 rounded-full ${isSel ? 'bg-[#121212]/50' : 'bg-[#D4D4D4]'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 4. Selected dates preview */}
          {sortedDates.length > 0 && (
            <div className="rounded-xl border border-[#E0E0E0] bg-[#F8F8F8] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">
                  Días seleccionados — {sortedDates.length} fecha{sortedDates.length !== 1 ? 's' : ''}
                </p>
                <button onClick={() => setSelected(new Set())}
                  className="text-[10px] text-[#9B9B9B] transition hover:text-[#5E5E5E]">
                  Limpiar todo
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedDates.map(ds => {
                  const d = new Date(ds + 'T12:00:00');
                  const isOverwrite = !!routine.sessions[ds];
                  return (
                    <span key={ds}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                        isOverwrite
                          ? 'border border-[#C4783A]/30 bg-[#FFF3E8] text-[#C4783A]'
                          : 'border border-[#E0E0E0] bg-[#EBEBEB] text-[#6E6E6E]'
                      }`}>
                      {DOW_LABEL[(d.getDay() + 6) % 7]} {d.getDate()}/{d.getMonth() + 1}
                      <button onClick={() => toggleDate(ds)}
                        className="ml-0.5 opacity-50 transition hover:opacity-100">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
              {overwriteDates.length > 0 && (
                <p className="text-[10px] text-[#C4783A]">
                  ⚠ {overwriteDates.length} fecha{overwriteDates.length !== 1 ? 's' : ''} ya
                  {overwriteDates.length === 1 ? ' tiene' : ' tienen'} rutina — se te preguntará cómo proceder.
                </p>
              )}
            </div>
          )}

          {/* 5. CTA */}
          <button onClick={handleCopyClick} disabled={sortedDates.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-25">
            <Copy className="h-4 w-4" />
            {sortedDates.length > 0
              ? `Copiar rutina a ${sortedDates.length} día${sortedDates.length !== 1 ? 's' : ''}`
              : 'Selecciona al menos un día'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DayEditor ────────────────────────────────────────────────────────────────

function DayEditor({ dateStr, session, routine, onUpdate, onCopy, onClear }: {
  dateStr: string; session: CalSession | undefined; routine: Routine;
  onUpdate: (s: CalSession | null) => void; onCopy: () => void; onClear: () => void;
}) {
  const [showSearch,      setShowSearch]      = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const d = new Date(dateStr + 'T12:00:00');
  const ensure = (): CalSession => session ?? { name: '', exercises: [] };
  const exs = ensure().exercises;

  function updEx(exercises: Exercise[]) {
    const s = ensure();
    if (!exercises.length && !s.name) onUpdate(null);
    else onUpdate({ ...s, exercises });
  }
  function addEx(ex: Omit<Exercise,'id'>) {
    updEx([...exs, { ...ex, id: crypto.randomUUID() }]);
    setShowSearch(false);
  }
  function addMultipleEx(exercises: QuickExercise[]) {
    updEx([...exs, ...exercises.map(ex => ({ ...ex, id: crypto.randomUUID() }))]);
    setShowQuickCreate(false);
  }
  function delEx(id: string) { updEx(exs.filter(e => e.id !== id)); }

  function handleDragStart(i: number) { dragIdx.current = i; }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) return;
    const arr = [...exs]; const [item] = arr.splice(from, 1); arr.splice(i, 0, item);
    dragIdx.current = i; updEx(arr);
  }
  function handleDragEnd() { dragIdx.current = null; }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D8D8D8] bg-[#F0F0F0]">
      {/* Header */}
      <div className="border-b border-[#D8D8D8] px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#D8D8D8] bg-[#F8F8F8] px-3 pb-2 pt-2.5 min-w-[52px]">
            <span className="text-3xl font-black leading-none tabular-nums text-[#121212]">
              {d.getDate().toString().padStart(2, '0')}
            </span>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[#888888]">
              {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]}
            </span>
          </div>
          <div className="flex-1 pt-0.5">
            <p className="text-base font-bold capitalize text-[#121212]">
              {MONTHS_ES[d.getMonth()]} {d.getFullYear()}
            </p>
            {exs.length === 0 && (
              <p className="mt-1 text-xs text-[#9B9B9B]">Sin ejercicios — agrega el primero</p>
            )}
          </div>
          {exs.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 pt-1">
              <button onClick={onCopy}
                className="flex items-center gap-1.5 rounded-xl border border-[#D8D8D8] px-3 py-1.5 text-xs font-medium text-[#5E5E5E] transition hover:border-[#9B9B9B] hover:text-[#121212]">
                <Copy className="h-3 w-3" /> Copiar
              </button>
              <button onClick={onClear}
                className="rounded-xl border border-[#D8D8D8] p-1.5 text-[#777777] transition hover:border-[#B44040]/30 hover:text-[#B44040]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <input value={session?.name ?? ''}
          onChange={e => onUpdate({ ...ensure(), name: e.target.value })}
          placeholder="Nombre del entrenamiento (ej: Piernas · Empuje)"
          className="w-full bg-transparent text-sm font-medium text-[#121212] placeholder-[#AAAAAA] outline-none" />

        {exs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5]">
                  {['','#','Ejercicio','S × Reps','Descanso',''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B] first:pl-2 last:pr-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E4]">
                {exs.map((ex, idx) => (
                  <tr key={ex.id} draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className="group cursor-grab transition-colors hover:bg-black/[0.02]">
                    <td className="py-2.5 pl-2 pr-1 text-[#AAAAAA] group-hover:text-[#888888]">
                      <GripVertical className="h-3.5 w-3.5" />
                    </td>
                    <td className="px-2 py-2.5 text-xs font-mono text-[#9B9B9B]">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[#121212]">{ex.name}</p>
                        {ex.youtubeUrl && (
                          <a href={ex.youtubeUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Ver video"
                            className="shrink-0 text-[#BBBBBB] transition hover:text-[#121212]">
                            <PlayCircle className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      {(ex.tempo || ex.notes) && (
                        <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-[#9B9B9B]">
                          {[ex.tempo && `Tempo ${ex.tempo}`, ex.notes].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-medium text-[#121212]">
                      {ex.series} <span className="text-[#9B9B9B]">×</span> {ex.reps}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-[#777777]">{ex.rest}</td>
                    <td className="pr-2 py-2.5 text-right">
                      <button onClick={() => delEx(ex.id)}
                        className="rounded-lg p-1 text-[#AAAAAA] transition hover:bg-[#FAEAEA] hover:text-[#B44040]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showSearch
          ? <ExerciseSearch onAdd={addEx} onCancel={() => setShowSearch(false)} />
          : (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowSearch(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#D0D0D0] px-3.5 py-2 text-xs font-medium text-[#888888] transition hover:border-[#9B9B9B] hover:text-[#5E5E5E]">
                <Plus className="h-3.5 w-3.5" /> Agregar ejercicio
              </button>
              <button onClick={() => setShowQuickCreate(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#DEDEDE] px-3.5 py-2 text-xs font-medium text-[#9B9B9B] transition hover:border-[#121212]/22 hover:text-[#121212]">
                <FileText className="h-3.5 w-3.5" /> Crear desde texto
              </button>
            </div>
          )}

        {showQuickCreate && (
          <QuickCreateModal
            onAdd={addMultipleEx}
            onClose={() => setShowQuickCreate(false)}
          />
        )}
      </div>
    </div>
  );
}


// ─── SavePlantillaModal ───────────────────────────────────────────────────────

function SavePlantillaModal({ onSave, onClose }: { onSave: (nombre: string) => void; onClose: () => void; }) {
  const [nombre, setNombre] = useState('');
  function submit() { if (nombre.trim()) { onSave(nombre.trim()); onClose(); } }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#D8D8D8] bg-[#EBEBEB] p-6 shadow-2xl">
        <p className="text-sm font-bold text-[#121212]">Guardar como plantilla</p>
        <p className="mt-1 text-xs text-[#888888]">Elige un nombre para reutilizar estos ejercicios en otros días.</p>
        <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Ej: Piernas A · Empuje pesado..."
          className="mt-4 w-full rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] px-3 py-2.5 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none focus:border-[#9B9B9B]" />
        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={!nombre.trim()}
            className="flex-1 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-30">
            Guardar
          </button>
          <button onClick={onClose}
            className="rounded-xl border border-[#D8D8D8] px-5 py-2.5 text-sm font-medium text-[#777777] transition hover:text-[#121212]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PlantillaPanel ───────────────────────────────────────────────────────────

function PlantillaPanel({ exercises, onLoad }: { exercises: Exercise[]; onLoad: (exs: Exercise[]) => void; }) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [open, setOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  useEffect(() => {
    if (open) try { const s = localStorage.getItem('nexa_plantillas'); if (s) setPlantillas(JSON.parse(s)); } catch {}
  }, [open]);

  function guardar(nombre: string) {
    const p: Plantilla = { id: crypto.randomUUID(), nombre, exercises, creadaEn: new Date().toISOString().slice(0,10) };
    const updated = [p, ...plantillas];
    localStorage.setItem('nexa_plantillas', JSON.stringify(updated));
    setPlantillas(updated);
  }
  function cargar(p: Plantilla) {
    onLoad(p.exercises.map(e => ({ ...e, id: crypto.randomUUID() })));
    setOpen(false);
  }
  function del(id: string) {
    const updated = plantillas.filter(p => p.id !== id);
    localStorage.setItem('nexa_plantillas', JSON.stringify(updated));
    setPlantillas(updated);
  }

  return (
    <>
    {showSaveModal && (
      <SavePlantillaModal onSave={guardar} onClose={() => setShowSaveModal(false)} />
    )}
    <div className="overflow-hidden rounded-2xl border border-[#E0E0E0] bg-[#F5F5F5]">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">Plantillas de día</p>
        <div className="flex gap-2">
          {exercises.length > 0 && (
            <button onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[#DCDCDC] px-3 py-1.5 text-xs text-[#777777] transition hover:border-[#9B9B9B] hover:text-[#5E5E5E]">
              <Save className="h-3 w-3" /> Guardar
            </button>
          )}
          <button onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 rounded-xl border border-[#DCDCDC] px-3 py-1.5 text-xs text-[#777777] transition hover:border-[#9B9B9B] hover:text-[#5E5E5E]">
            <FolderOpen className="h-3 w-3" /> Cargar
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#E0E0E0] p-3">
          {plantillas.length === 0
            ? <p className="py-4 text-center text-xs text-[#9B9B9B]">Sin plantillas guardadas</p>
            : <div className="space-y-1.5">
                {plantillas.map(p => {
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#E0E0E0] bg-[#F0F0F0] px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#121212]">{p.nombre}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] text-[#9B9B9B]">{p.exercises.length} ej. · {p.creadaEn}</span>
                        </div>
                      </div>
                      <button onClick={() => cargar(p)}
                        className="rounded-xl border border-[#D8D8D8] px-2.5 py-1 text-xs text-[#777777] transition hover:border-[#9B9B9B] hover:text-[#121212]">
                        Cargar
                      </button>
                      <button onClick={() => del(p.id)} className="p-1 text-[#AAAAAA] transition hover:text-[#B44040]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>}
        </div>
      )}
    </div>
    </>
  );
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportToPDF(routine: Routine, alumnoName: string) {
  const dates = Object.keys(routine.sessions).sort();
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${routine.name} — ${alumnoName}</title>
<style>body{font-family:Arial,sans-serif;padding:2rem;color:#111}h1{font-size:1.5rem;margin-bottom:.25rem}h2{font-size:.9rem;color:#555;font-weight:normal;margin-bottom:1.5rem}.day{margin:1.5rem 0 .25rem;font-size:1rem;font-weight:700;border-bottom:2px solid #ddd;padding-bottom:.25rem}table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem}th{text-align:left;padding:.4rem .6rem;background:#f5f5f5;border:1px solid #ddd}td{padding:.4rem .6rem;border:1px solid #ddd}@media print{body{padding:1rem}}</style></head><body>
<h1>${alumnoName}</h1><h2>${routine.name || 'Programa de entrenamiento'} · ${dates.length} días · ${routine.startDate || ''} ${routine.endDate ? '→ ' + routine.endDate : ''}</h2>
${dates.map(d => { const s = routine.sessions[d]; const label = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
return `<p class="day">${label}${s.name ? ' — ' + s.name : ''}</p>${s.exercises.length === 0 ? '<p>Sin ejercicios</p>' : `<table><thead><tr><th>#</th><th>Ejercicio</th><th>S</th><th>Reps</th><th>Peso</th><th>Tempo</th><th>Notas</th></tr></thead><tbody>${s.exercises.map((ex, i) => `<tr><td>${i+1}</td><td>${ex.name}</td><td>${ex.series}</td><td>${ex.reps}</td><td>${ex.weight||'—'}</td><td>${ex.tempo||'—'}</td><td>${ex.notes||'—'}</td></tr>`).join('')}</tbody></table>`}`;
}).join('')}</body></html>`);
  w.document.close(); w.focus(); w.print();
}

// ─── RoutineCalendarEditor ────────────────────────────────────────────────────

function RoutineCalendarEditor({ routine, alumno, planes, onUpdate, onBack }: {
  routine: Routine; alumno: Alumno; planes: Plan[];
  onUpdate: (r: Routine) => void; onBack: () => void;
}) {
  const today    = new Date();
  const todayStr = toDateStr(today);
  const initDate = routine.startDate ? new Date(routine.startDate + 'T12:00:00') : today;

  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [selDate,   setSelDate]   = useState<string | null>(null);
  const [copyDate,  setCopyDate]  = useState<string | null>(null);

  const grid = buildMonthGrid(viewYear, viewMonth);
  const isCurrentMonthView = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const plan     = getAlumnoPlanBadge(alumno.id, planes);
  const initials = `${alumno.nombre[0] ?? ''}${(alumno.apellido ?? '')[0] ?? ''}`.toUpperCase();

  function patch(partial: Partial<Routine>) { onUpdate({ ...routine, ...partial }); }

  function setSession(dateStr: string, session: CalSession | null) {
    const sessions = { ...routine.sessions };
    if (session) sessions[dateStr] = session;
    else delete sessions[dateStr];
    patch({ sessions });
  }

  function handleCopy(dates: string[]) {
    if (!copyDate || !routine.sessions[copyDate]) return;
    const src = routine.sessions[copyDate];
    const sessions = { ...routine.sessions };
    for (const d of dates)
      sessions[d] = { name: src.name, exercises: src.exercises.map(e => ({ ...e, id: crypto.randomUUID() })) };
    patch({ sessions });
  }

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }
  function goToday()   { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }

  const isInRange = (ds: string) => {
    if (routine.startDate && ds < routine.startDate) return false;
    if (routine.endDate   && ds > routine.endDate)   return false;
    return true;
  };

  const sessionCount = Object.keys(routine.sessions).length;

  return (
    <div>
      {/* ── Alumno header ── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 rounded-xl border border-[#E0E0E0] px-3 py-2 text-xs text-[#888888] transition hover:border-[#D8D8D8] hover:text-[#121212]">
          <ArrowLeft className="h-3.5 w-3.5" /> Alumnos
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#121212]/6 text-xs font-black text-[#121212]">
            {initials}
          </div>
          <div>
            <p className="text-base font-bold text-[#121212]">
              {alumno.nombre}{alumno.apellido ? ` ${alumno.apellido}` : ''}
            </p>
            {plan && (
              <p className="text-[10px] font-semibold" style={{ color: plan.color }}>{plan.label}</p>
            )}
          </div>
        </div>
        <div className="flex-1">
          <input value={routine.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="Nombre del programa"
            className="w-full bg-transparent text-right text-sm font-medium text-[#888888] outline-none placeholder-[#B0B0B0] transition focus:text-[#121212]" />
        </div>
        {sessionCount > 0 && (
          <button onClick={() => exportToPDF(routine, `${alumno.nombre}${alumno.apellido ? ' ' + alumno.apellido : ''}`)}
            className="flex items-center gap-1.5 rounded-xl border border-[#E0E0E0] px-3 py-2 text-xs text-[#9B9B9B] transition hover:border-[#D8D8D8] hover:text-[#5E5E5E]">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-6">

        {/* ── Left col ── */}
        <div className="space-y-4">

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LC}>Inicio</label>
              <input type="date" value={routine.startDate} onChange={e => patch({ startDate: e.target.value })}
                className="w-full rounded-xl border border-[#D8D8D8] bg-[#F5F5F5] px-3 py-2 text-xs text-[#121212] outline-none transition focus:border-[#9B9B9B]" />
            </div>
            <div>
              <label className={LC}>Fin</label>
              <input type="date" value={routine.endDate} onChange={e => patch({ endDate: e.target.value })}
                className="w-full rounded-xl border border-[#D8D8D8] bg-[#F5F5F5] px-3 py-2 text-xs text-[#121212] outline-none transition focus:border-[#9B9B9B]" />
            </div>
          </div>

          {/* Mini calendar */}
          <div className="overflow-hidden rounded-2xl border border-[#E0E0E0] bg-[#F5F5F5]">
            <div className="flex items-center gap-1 border-b border-[#E0E0E0] px-2 py-2">
              <button onClick={prevMonth} className="rounded-lg p-1.5 text-[#888888] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex flex-1 items-center justify-center gap-2">
                <span className="text-sm font-bold text-[#121212]">{MONTHS_ES[viewMonth]} {viewYear}</span>
                {!isCurrentMonthView && (
                  <button onClick={goToday}
                    className="rounded-full border border-[#DCDCDC] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#888888] transition hover:text-[#5E5E5E]">
                    Hoy
                  </button>
                )}
              </div>
              <button onClick={nextMonth} className="rounded-lg p-1.5 text-[#888888] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 border-b border-[#E4E4E4]">
              {DOW_LABEL.map(d => (
                <div key={d} className="py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">{d}</div>
              ))}
            </div>
            {grid.map((week, wi) => (
              <div key={wi} className={`grid grid-cols-7 ${wi < grid.length - 1 ? 'border-b border-[#E4E4E4]' : ''}`}>
                {week.map((date, di) => {
                  const ds       = toDateStr(date);
                  const isThisM  = date.getMonth() === viewMonth;
                  const isToday  = ds === todayStr;
                  const isSel    = ds === selDate;
                  const inRange  = isInRange(ds);
                  const sess     = routine.sessions[ds];
                  const chipColor = '#121212';
                  return (
                    <button key={di} onClick={() => setSelDate(isSel ? null : ds)}
                      className={`group relative flex min-h-[58px] flex-col items-start p-1.5 text-left transition-colors
                        ${di < 6 ? 'border-r border-[#E4E4E4]' : ''}
                        ${isSel ? 'bg-black/[0.04]' : 'hover:bg-[#EBEBEB]'}
                        ${(!isThisM || (!inRange && isThisM)) ? 'opacity-20' : ''}
                      `}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition
                        ${isToday ? 'bg-[#121212] text-white' : isSel ? 'bg-[#121212]/10 text-[#121212]' : 'text-[#6E6E6E] group-hover:text-[#121212]'}
                      `}>
                        {date.getDate()}
                      </span>
                      {sess && sess.exercises.length > 0 && (
                        <div className="mt-0.5 w-full overflow-hidden">
                          <div className="truncate rounded-sm py-px pl-1.5 pr-1 text-[9px] font-semibold leading-tight text-white"
                            style={{ backgroundColor: chipColor + '20', borderLeft: `2px solid ${chipColor}`, color: chipColor }}>
                            {sess.name || `${sess.exercises.length} ej.`}
                          </div>
                        </div>
                      )}
                      {isSel && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#121212]" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Summary */}
          {sessionCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#888888]">{sessionCount} días planificados</span>
            </div>
          )}
        </div>

        {/* ── Right col ── */}
        <div className="mt-4 space-y-3 lg:mt-0">
          {selDate ? (
            <>
              <DayEditor
                dateStr={selDate}
                session={routine.sessions[selDate]}
                routine={routine}
                onUpdate={s => setSession(selDate, s)}
                onCopy={() => setCopyDate(selDate)}
                onClear={() => setSession(selDate, null)}
              />
              <PlantillaPanel
                exercises={routine.sessions[selDate]?.exercises ?? []}
                onLoad={exercises => {
                  const s = routine.sessions[selDate] ?? { name: '', exercises: [] };
                  setSession(selDate, { ...s, exercises });
                }}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#E0E0E0] bg-[#F8F8F8] py-16 text-center lg:py-24">
              <svg viewBox="0 0 40 40" className="h-10 w-10 text-[#E0E0E0]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="8" width="32" height="28" rx="4" />
                <path d="M4 15h32" /><path d="M13 4v7M27 4v7" strokeLinecap="round" />
                <rect x="10" y="21" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" stroke="none" />
                <rect x="22" y="21" width="6" height="6" rx="1.5" fill="currentColor" opacity=".25" stroke="none" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-[#9B9B9B]">Selecciona un día</p>
                <p className="mt-1 text-xs text-[#B0B0B0]">Haz click en cualquier fecha del calendario para agregar ejercicios</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Copy modal */}
      {copyDate && routine.sessions[copyDate] && (
        <CopyToCalendarModal
          sourceDate={copyDate}
          session={routine.sessions[copyDate]}
          routine={routine}
          onCopy={handleCopy}
          onClose={() => setCopyDate(null)}
        />
      )}
    </div>
  );
}

// ─── AlumnoSelectorScreen ─────────────────────────────────────────────────────

function AlumnoSelectorScreen({ alumnos, routines, planes, onSelect }: {
  alumnos: Alumno[]; routines: Routine[]; planes: Plan[];
  onSelect: (alumno: Alumno) => void;
}) {
  const [q, setQ] = useState('');
  const filtered  = alumnos.filter(a =>
    !q || `${a.nombre} ${a.apellido ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  function sessionCount(alumnoId: string): number {
    const r = routines.find(r => r.alumnoId === alumnoId || r.alumnoIds?.[0] === alumnoId);
    return r ? Object.keys(r.sessions).length : 0;
  }

  function getRoutine(alumnoId: string): Routine | undefined {
    return routines.find(r => r.alumnoId === alumnoId || r.alumnoIds?.[0] === alumnoId);
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#121212]">Calendario</h1>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">
            Selecciona un alumno para ver su programa
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9B9B9B]" />
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="Buscar alumno..."
          className="w-full rounded-2xl border border-[#E0E0E0] bg-[#F5F5F5] py-3.5 pl-11 pr-4 text-sm text-[#121212] placeholder-[#AAAAAA] outline-none transition focus:border-[#D8D8D8]" />
      </div>

      {/* Empty state */}
      {alumnos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E0E0E0] py-20 text-center">
          <Users className="h-10 w-10 text-[#E0E0E0]" />
          <p className="mt-4 text-sm font-semibold text-[#9B9B9B]">Sin alumnos registrados</p>
          <p className="mt-1 text-xs text-[#B0B0B0]">Agrega alumnos primero para crear sus calendarios de entrenamiento</p>
          <a href="/alumnos" className="mt-4 text-xs text-[#121212] transition hover:underline">Ir a Alumnos →</a>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#9B9B9B]">Sin resultados para "{q}"</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(alumno => {
            const plan     = getAlumnoPlanBadge(alumno.id, planes);
            const initials = `${alumno.nombre[0] ?? ''}${(alumno.apellido ?? '')[0] ?? ''}`.toUpperCase();
            const sessions = sessionCount(alumno.id);
            const r        = getRoutine(alumno.id);

            return (
              <button key={alumno.id} onClick={() => onSelect(alumno)}
                className="group flex items-center gap-4 rounded-2xl border border-[#E0E0E0] bg-[#F5F5F5] p-4 text-left transition hover:border-[#D8D8D8] hover:bg-[#F0F0F0]">
                {/* Avatar */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#121212]/6 text-base font-black text-[#121212]">
                  {initials}
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#121212]">
                    {alumno.nombre}{alumno.apellido ? ` ${alumno.apellido}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {plan
                      ? <span className="text-[10px] font-semibold" style={{ color: plan.color }}>{plan.label}</span>
                      : <span className="text-[10px] text-[#AAAAAA]">Sin plan</span>}
                    {sessions > 0 && (
                      <span className="text-[10px] text-[#9B9B9B]">· {sessions} día{sessions !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {r?.startDate && (
                    <p className="mt-0.5 text-[9px] text-[#B0B0B0]">
                      {r.startDate}{r.endDate ? ` → ${r.endDate}` : ''}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#AAAAAA] transition group-hover:text-[#888888]" />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RutinasPage() {
  const [routines, setRoutines]           = useState<Routine[]>([]);
  const [alumnos, setAlumnos]             = useState<Alumno[]>([]);
  const [planes,  setPlanes]              = useState<Plan[]>([]);
  const [selectedAlumno, setSelectedAlumno] = useState<Alumno | null>(null);

  useEffect(() => {
    async function loadData() {
      // Alumnos desde Supabase
      try {
        const dbAlumnos = await getAlumnos();
        if (dbAlumnos.length > 0) {
          setAlumnos(dbAlumnos);
          localStorage.setItem('nexa_alumnos', JSON.stringify(dbAlumnos));
        } else {
          const s = localStorage.getItem('nexa_alumnos');
          if (s) setAlumnos(JSON.parse(s));
        }
      } catch {
        try { const s = localStorage.getItem('nexa_alumnos'); if (s) setAlumnos(JSON.parse(s)); } catch {}
      }
      // Rutinas desde Supabase
      try {
        const dbRutinas = await getRutinasDB();
        if (dbRutinas.length > 0) {
          const mapped = dbRutinas.map(r => migrateToCalendar({
            id: r.id, name: r.nombre,
            alumnoId: r.alumno_ids[0], alumnoIds: r.alumno_ids,
            startDate: r.start_date, endDate: r.end_date,
            sessions: r.sessions, blocks: r.blocks,
          }));
          setRoutines(mapped);
          localStorage.setItem('nexa_routines', JSON.stringify(mapped));
          return;
        }
      } catch {}
      try { const s = localStorage.getItem('nexa_routines'); if (s) setRoutines(JSON.parse(s).map(migrateToCalendar)); } catch {}
    }
    loadData();
    getAllPlanesDB().then(setPlanes).catch(() => {});
  }, []);

  function save(next: Routine[]) {
    setRoutines(next);
    localStorage.setItem('nexa_routines', JSON.stringify(next));
  }

  function syncToSupabase(r: Routine) {
    saveRutinaDB({
      id:         r.id,
      nombre:     r.name,
      alumno_ids: r.alumnoIds ?? (r.alumnoId ? [r.alumnoId] : []),
      start_date: r.startDate ?? '',
      end_date:   r.endDate   ?? '',
      sessions:   (r.sessions ?? {}) as Record<string, unknown>,
      blocks:     [],
    }).catch(() => {});
  }

  function handleSelectAlumno(alumno: Alumno) {
    const existing = routines.find(r => r.alumnoId === alumno.id || r.alumnoIds?.[0] === alumno.id);
    if (!existing) {
      const newRoutine: Routine = {
        id: crypto.randomUUID(),
        name: '',
        startDate: '', endDate: '',
        alumnoId: alumno.id,
        alumnoIds: [alumno.id],
        sessions: {},
      };
      const updated = [newRoutine, ...routines];
      setRoutines(updated);
      localStorage.setItem('nexa_routines', JSON.stringify(updated));
      syncToSupabase(newRoutine);
    }
    setSelectedAlumno(alumno);
  }

  function updateRoutine(r: Routine) {
    save(routines.map(x => x.id === r.id ? r : x));
    syncToSupabase(r);
  }

  const currentRoutine = selectedAlumno
    ? routines.find(r => r.alumnoId === selectedAlumno.id || r.alumnoIds?.[0] === selectedAlumno.id) ?? null
    : null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      {selectedAlumno && currentRoutine
        ? (
          <RoutineCalendarEditor
            routine={currentRoutine}
            alumno={selectedAlumno}
            planes={planes}
            onUpdate={updateRoutine}
            onBack={() => setSelectedAlumno(null)}
          />
        ) : (
          <AlumnoSelectorScreen
            alumnos={alumnos}
            routines={routines}
            planes={planes}
            onSelect={handleSelectAlumno}
          />
        )}
    </main>
  );
}
