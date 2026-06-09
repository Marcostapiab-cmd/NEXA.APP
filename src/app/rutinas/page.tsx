'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Trash2, Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  BookOpen, X, Download, Copy, Save, FolderOpen, GripVertical, Users, Search
} from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { BIBLIOTECA_EJERCICIOS, GRUPOS_MUSCULARES, type EjBiblioteca } from '@/lib/ejercicios';
import { MEV_MRV, calc1RM, getEstado, parseReps, parsePeso } from '@/lib/mevmrv';

// ─── Types ──────────────────────────────────────────────────────────────────

type MuscleGroup = 'Piernas'|'Espalda'|'Pecho'|'Hombros'|'Bíceps'|'Tríceps'|'Core'|'Cardio'|'Glúteos';
const MUSCLES: MuscleGroup[] = ['Piernas','Espalda','Pecho','Hombros','Bíceps','Tríceps','Core','Cardio','Glúteos'];

interface Exercise {
  id: string; name: string; muscle: MuscleGroup;
  series: number; reps: string; weight: string; rest: string; youtubeUrl: string;
}
interface CalSession { name: string; exercises: Exercise[]; }
interface Routine {
  id: string; name: string;
  startDate: string; endDate: string;
  alumnoIds: string[];
  sessions: Record<string, CalSession>;
}
interface Plantilla { id: string; nombre: string; exercises: Exercise[]; creadaEn: string; }

// ─── Color system ────────────────────────────────────────────────────────────

const MUSCLE_HEX: Record<string, string> = {
  Piernas:  '#3b82f6',
  Espalda:  '#8b5cf6',
  Pecho:    '#f97316',
  Hombros:  '#eab308',
  Bíceps:   '#22c55e',
  Tríceps:  '#10b981',
  Core:     '#ec4899',
  Glúteos:  '#14b8a6',
  Cardio:   '#ef4444',
};

function getMuscleGroups(exercises: Exercise[]): string[] {
  if (!exercises.length) return [];
  const counts: Record<string, number> = {};
  for (const ex of exercises) counts[ex.muscle] = (counts[ex.muscle] ?? 0) + ex.series;
  return [...new Set(exercises.map(e => e.muscle))].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

// ─── Migration ───────────────────────────────────────────────────────────────

function migrateToCalendar(raw: any): Routine {
  if ('sessions' in raw && !('blocks' in raw)) return raw as Routine;
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
  return { id: raw.id, name: raw.name, startDate: raw.startDate ?? '', endDate, alumnoIds: raw.alumnoIds ?? [], sessions };
}

function computeEndDate(start: string, weeks: number): string {
  if (!start || weeks <= 0) return '';
  const d = new Date(start + 'T12:00:00');
  d.setDate(d.getDate() + weeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Calendar helpers ────────────────────────────────────────────────────────

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW_LABEL = ['L','M','X','J','V','S','D'];
const DOW_LONG  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
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

function sameWeekdayDates(sourceDate: string, startDate: string, endDate: string): string[] {
  if (!startDate || !endDate) return [];
  const src = new Date(sourceDate + 'T12:00:00');
  const srcDow = src.getDay();
  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date(endDate   + 'T12:00:00');
  const cur = new Date(start);
  while (cur.getDay() !== srcDow) cur.setDate(cur.getDate() + 1);
  const results: string[] = [];
  while (cur <= end) {
    const ds = toDateStr(cur);
    if (ds !== sourceDate) results.push(ds);
    cur.setDate(cur.getDate() + 7);
  }
  return results;
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const IC = 'w-full rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-2.5 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#444444]';
const LC = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]';

// ─── Muscle pill component ────────────────────────────────────────────────────

function MusclePill({ muscle, size = 'sm' }: { muscle: string; size?: 'xs' | 'sm' }) {
  const hex = MUSCLE_HEX[muscle] ?? '#888888';
  const cls = size === 'xs'
    ? 'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold'
    : 'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold';
  return (
    <span className={cls} style={{ backgroundColor: hex + '22', color: hex }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
      {muscle}
    </span>
  );
}

// ─── Biblioteca modal ─────────────────────────────────────────────────────────

function BibliotecaModal({ onAdd, onClose }: { onAdd: (e: EjBiblioteca) => void; onClose: () => void; }) {
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');
  const filtered = BIBLIOTECA_EJERCICIOS.filter(e =>
    (!q || e.nombre.toLowerCase().includes(q.toLowerCase())) && (!grupo || e.grupo === grupo)
  );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-4 pt-10 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#2a2a2a] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-white">Biblioteca de ejercicios</p>
            <p className="mt-0.5 text-xs text-[#555555]">{BIBLIOTECA_EJERCICIOS.length} ejercicios disponibles</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#2a2a2a] p-2 text-[#555555] hover:border-[#444444] hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#444444]" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar por nombre..."
              className="w-full rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[#333333] outline-none focus:border-[#444444]" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setGrupo('')}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition ${!grupo ? 'border-white bg-white text-black' : 'border-[#2a2a2a] text-[#555555] hover:text-white'}`}>
              Todos
            </button>
            {GRUPOS_MUSCULARES.map(g => {
              const hex = MUSCLE_HEX[g] ?? '#888888';
              return (
                <button key={g} onClick={() => setGrupo(g === grupo ? '' : g)}
                  className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition"
                  style={grupo === g
                    ? { borderColor: hex, backgroundColor: hex + '22', color: hex }
                    : { borderColor: '#2a2a2a', color: '#555555' }}>
                  {g}
                </button>
              );
            })}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-[#1a1a1a]">
            {filtered.length === 0
              ? <p className="py-8 text-center text-sm text-[#555555]">Sin resultados</p>
              : filtered.map(ej => (
                <button key={ej.id} onClick={() => { onAdd(ej); onClose(); }}
                  className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-[#1a1a1a] transition">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: MUSCLE_HEX[ej.grupo] ?? '#555555' }} />
                    <div>
                      <p className="text-sm font-medium text-white">{ej.nombre}</p>
                      <p className="text-xs text-[#555555]">{ej.grupo}{ej.series ? ` · ${ej.series} × ${ej.reps}` : ''}</p>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-[#333333]" />
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CopyModal ────────────────────────────────────────────────────────────────

function CopyModal({ sourceDate, session, routine, onCopy, onClose }: {
  sourceDate: string; session: CalSession; routine: Routine;
  onCopy: (dates: string[]) => void; onClose: () => void;
}) {
  const candidates = sameWeekdayDates(sourceDate, routine.startDate, routine.endDate);
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates));
  const srcDate = new Date(sourceDate + 'T12:00:00');
  const dayName = DOW_LONG[srcDate.getDay()];
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
  const muscles = getMuscleGroups(session.exercises);
  const primaryColor = MUSCLE_HEX[muscles[0] ?? ''] ?? '#ffffff';
  function toggle(d: string) { setSelected(p => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; }); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#2a2a2a] bg-[#141414] shadow-2xl">
        {/* Header with color accent */}
        <div className="relative overflow-hidden rounded-t-2xl border-b border-[#2a2a2a] px-5 py-4">
          <div className="absolute inset-0 opacity-5" style={{ background: `linear-gradient(135deg, ${primaryColor}, transparent)` }} />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-white">Copiar entrenamiento</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {muscles.map(m => <MusclePill key={m} muscle={m} size="xs" />)}
              </div>
              <p className="mt-1.5 text-xs text-[#555555]">{session.exercises.length} ejercicios · {fmt(sourceDate)}</p>
            </div>
            <button onClick={onClose} className="rounded-xl border border-[#2a2a2a] p-1.5 text-[#555555] hover:text-white transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="p-4">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#555555]">
              {!routine.startDate || !routine.endDate
                ? 'Define fecha de inicio y fin del programa primero.'
                : `No hay más ${dayName.toLowerCase()}s en el período.`}
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]">
                  Copiar a los {dayName.toLowerCase()}s ({candidates.length})
                </p>
                <button onClick={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates))}
                  className="text-xs text-[#555555] hover:text-white transition">
                  {selected.size === candidates.length ? 'Ninguno' : 'Todos'}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {candidates.map(d => {
                  const has = routine.sessions[d];
                  const chk = selected.has(d);
                  const hasGroups = has ? getMuscleGroups(has.exercises) : [];
                  return (
                    <button key={d} onClick={() => toggle(d)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        chk ? 'border-white/15 bg-white/[0.04]' : 'border-[#1e1e1e] hover:border-[#2a2a2a]'
                      }`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-[9px] font-bold border transition ${
                        chk ? 'border-white bg-white text-black' : 'border-[#333333] text-transparent'
                      }`}>✓</span>
                      <span className={`flex-1 text-sm ${chk ? 'text-white' : 'text-[#666666]'}`}>{fmt(d)}</span>
                      {hasGroups.length > 0 && (
                        <div className="flex gap-0.5">
                          {hasGroups.slice(0, 4).map(m => (
                            <span key={m} className="h-2 w-2 rounded-full" style={{ backgroundColor: MUSCLE_HEX[m] + '80' }} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => { onCopy([...selected]); onClose(); }} disabled={selected.size === 0}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-black hover:bg-[#e8e8e8] disabled:opacity-30 transition">
                <Copy className="h-4 w-4" />
                Copiar a {selected.size} fecha{selected.size !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ExerciseForm ─────────────────────────────────────────────────────────────

function ExerciseForm({ onAdd, onCancel }: { onAdd: (e: Omit<Exercise,'id'>) => void; onCancel: () => void; }) {
  const [f, setF] = useState<Omit<Exercise,'id'>>({ name:'', muscle:'Pecho', series:3, reps:'10', weight:'', rest:'90s', youtubeUrl:'' });
  const set = (k: string, v: string|number) => setF(p => ({ ...p, [k]: v }));
  return (
    <form onSubmit={e => { e.preventDefault(); if (f.name.trim()) onAdd(f); }}
      className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#444444]">Nuevo ejercicio</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="col-span-2">
          <label className={LC}>Nombre *</label>
          <input required autoFocus value={f.name} onChange={e => set('name', e.target.value)}
            placeholder="Ej: Press de banca" className={IC} />
        </div>
        <div>
          <label className={LC}>Grupo muscular</label>
          <select value={f.muscle} onChange={e => set('muscle', e.target.value)} className={IC}>
            {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={LC}>Series</label>
          <input type="number" min="1" value={f.series} onChange={e => set('series', parseInt(e.target.value)||1)} className={IC} />
        </div>
        <div>
          <label className={LC}>Repeticiones</label>
          <input value={f.reps} onChange={e => set('reps', e.target.value)} placeholder="10 ó 8–12" className={IC} />
        </div>
        <div>
          <label className={LC}>Peso (kg)</label>
          <input value={f.weight} onChange={e => set('weight', e.target.value)} placeholder="60" className={IC} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black hover:bg-[#e8e8e8] transition">Agregar</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-[#333333] px-4 py-2.5 text-xs font-medium text-[#888888] hover:border-[#555555] hover:text-white transition">Cancelar</button>
      </div>
    </form>
  );
}

// ─── DayEditor ────────────────────────────────────────────────────────────────

function DayEditor({ dateStr, session, routine, onUpdate, onCopy, onClear }: {
  dateStr: string; session: CalSession | undefined; routine: Routine;
  onUpdate: (s: CalSession | null) => void; onCopy: () => void; onClear: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showLib, setShowLib]   = useState(false);
  const dragIdx = useRef<number | null>(null);

  const d = new Date(dateStr + 'T12:00:00');
  const ensure = (): CalSession => session ?? { name: '', exercises: [] };
  const exs = ensure().exercises;
  const muscleGroups = getMuscleGroups(exs);
  const primaryColor = MUSCLE_HEX[muscleGroups[0] ?? ''] ?? '#ffffff';

  function updEx(exercises: Exercise[]) {
    const s = ensure();
    if (!exercises.length && !s.name) onUpdate(null);
    else onUpdate({ ...s, exercises });
  }
  function addEx(ex: Omit<Exercise,'id'>) { updEx([...exs, { ...ex, id: crypto.randomUUID() }]); setShowForm(false); }
  function addLib(ej: EjBiblioteca) {
    updEx([...exs, { id: crypto.randomUUID(), name: ej.nombre, muscle: ej.grupo as MuscleGroup,
      series: ej.series ?? 3, reps: ej.reps ?? '10', weight: '', rest: '90s', youtubeUrl: ej.youtubeUrl ?? '' }]);
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
    <div className="overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#111111]">
      {/* Premium header */}
      <div className="relative overflow-hidden border-b border-[#2a2a2a] px-5 py-4">
        {/* Subtle color wash from primary muscle */}
        {muscleGroups.length > 0 && (
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{ background: `linear-gradient(120deg, ${primaryColor} 0%, transparent 60%)` }} />
        )}
        <div className="relative flex items-start gap-4">
          {/* Big date block */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] px-3 pb-2 pt-2.5 min-w-[52px]">
            <span className="text-3xl font-black leading-none tabular-nums text-white">
              {d.getDate().toString().padStart(2, '0')}
            </span>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[#444444]">
              {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]}
            </span>
          </div>
          {/* Info */}
          <div className="flex-1 pt-0.5">
            <p className="text-base font-bold capitalize text-white">
              {MONTHS_ES[d.getMonth()]} {d.getFullYear()}
            </p>
            {muscleGroups.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {muscleGroups.map(m => <MusclePill key={m} muscle={m} />)}
              </div>
            ) : (
              <p className="mt-1 text-xs text-[#333333]">Sin ejercicios — agrega el primero</p>
            )}
          </div>
          {/* Actions */}
          {exs.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 pt-1">
              <button onClick={onCopy}
                className="flex items-center gap-1.5 rounded-xl border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#888888] hover:border-[#444444] hover:text-white transition">
                <Copy className="h-3 w-3" /> Copiar
              </button>
              <button onClick={onClear}
                className="rounded-xl border border-[#2a2a2a] p-1.5 text-[#555555] hover:border-red-900 hover:text-red-500 transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Session name input */}
        <input value={session?.name ?? ''} onChange={e => onUpdate({ ...ensure(), name: e.target.value })}
          placeholder="Nombre del entrenamiento (ej: Piernas · Empuje · Pull)"
          className="w-full bg-transparent text-sm font-medium text-white placeholder-[#2a2a2a] outline-none" />

        {/* Exercise table */}
        {exs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[#1e1e1e]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
                  {['','#','Ejercicio','Grupo','S','Reps','Peso','1RM',''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[#333333] first:pl-2 last:pr-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {exs.map((ex, idx) => {
                  const rm = (() => { const p = parsePeso(ex.weight), r = parseReps(ex.reps); return p && r ? calc1RM(p, r) : null; })();
                  const hex = MUSCLE_HEX[ex.muscle] ?? '#555555';
                  return (
                    <tr key={ex.id} draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="group cursor-grab hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 pl-2 pr-1 text-[#2a2a2a] group-hover:text-[#444444]">
                        <GripVertical className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-2 py-2.5 text-xs font-mono text-[#333333]">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{ex.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: hex + '22', color: hex }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
                          {ex.muscle}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-medium text-[#888888]">{ex.series}</td>
                      <td className="px-3 py-2.5 text-sm text-[#666666]">{ex.reps}</td>
                      <td className="px-3 py-2.5 text-sm text-[#666666]">{ex.weight ? `${ex.weight} kg` : '—'}</td>
                      <td className="px-3 py-2.5">
                        {rm
                          ? <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs font-bold text-white">{rm} kg</span>
                          : <span className="text-xs text-[#2a2a2a]">—</span>}
                      </td>
                      <td className="pr-2 py-2.5 text-right">
                        <button onClick={() => delEx(ex.id)}
                          className="rounded-lg p-1 text-[#2a2a2a] hover:bg-red-950/40 hover:text-red-500 transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add buttons */}
        {showForm
          ? <ExerciseForm onAdd={addEx} onCancel={() => setShowForm(false)} />
          : (
            <div className="flex gap-2">
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#222222] px-3.5 py-2 text-xs font-medium text-[#444444] hover:border-[#444444] hover:text-[#888888] transition">
                <Plus className="h-3.5 w-3.5" /> Ejercicio manual
              </button>
              <button onClick={() => setShowLib(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#222222] px-3.5 py-2 text-xs font-medium text-[#444444] hover:border-[#444444] hover:text-[#888888] transition">
                <BookOpen className="h-3.5 w-3.5" /> Biblioteca
              </button>
            </div>
          )}
      </div>

      {showLib && <BibliotecaModal onAdd={addLib} onClose={() => setShowLib(false)} />}
    </div>
  );
}

// ─── VolumeCounter ────────────────────────────────────────────────────────────

function VolumeCounter({ sessions, startDate, endDate }: {
  sessions: Record<string, CalSession>; startDate: string; endDate: string;
}) {
  const allExs = Object.values(sessions).flatMap(s => s.exercises);
  const numWeeks = (() => {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate + 'T12:00:00'), e = new Date(endDate + 'T12:00:00');
    return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000 / 7));
  })();
  const totalByMuscle = MUSCLES.reduce<Record<string,number>>((acc, m) => {
    acc[m] = allExs.filter(e => e.muscle === m).reduce((s, e) => s + e.series, 0);
    return acc;
  }, {});
  const active = MUSCLES.filter(m => totalByMuscle[m] > 0);
  if (!active.length) return null;

  return (
    <div className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#444444]">Volumen semanal promedio</p>
        <p className="text-[10px] text-[#333333]">{numWeeks} semana{numWeeks !== 1 ? 's' : ''}</p>
      </div>
      <div className="space-y-3.5">
        {active.map(m => {
          const rango = MEV_MRV[m];
          const weekly = Math.round((totalByMuscle[m] / numWeeks) * 10) / 10;
          const hex = MUSCLE_HEX[m] ?? '#888888';
          if (!rango) return (
            <div key={m} className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
              <span className="w-16 text-xs text-[#555555]">{m}</span>
              <span className="text-sm font-bold text-white">{weekly}</span>
            </div>
          );
          const estado = getEstado(weekly, rango);
          const pct = Math.min(100, (weekly / rango.mrv) * 100);
          const label = estado === 'bajo' ? 'bajo MEV' : estado === 'optimo' ? 'óptimo' : estado === 'alto' ? 'excede MRV' : '';
          const labelColor = estado === 'optimo' ? hex : estado === 'alto' ? '#ef4444' : '#444444';
          return (
            <div key={m} className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
              <span className="w-16 shrink-0 text-xs text-[#555555]">{m}</span>
              <div className="relative flex-1 overflow-hidden rounded-full bg-[#1a1a1a]" style={{ height: 5 }}>
                <div className="absolute top-0 bottom-0 w-px bg-[#333333]"
                  style={{ left: `${(rango.mev / rango.mrv) * 100}%` }} />
                <div className="absolute top-0 bottom-0 opacity-10 rounded-full"
                  style={{ left: `${(rango.optimo[0] / rango.mrv) * 100}%`, width: `${((rango.optimo[1] - rango.optimo[0]) / rango.mrv) * 100}%`, backgroundColor: hex }} />
                <div className="absolute left-0 top-0 bottom-0 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: hex }} />
              </div>
              <span className="w-10 shrink-0 text-right text-xs font-bold text-white">{weekly}</span>
              {label && <span className="hidden text-[10px] sm:block" style={{ color: labelColor }}>{label}</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[10px] text-[#2a2a2a]">
        Línea = MEV · zona coloreada = rango óptimo · max = MRV (Renaissance Periodization)
      </p>
    </div>
  );
}

// ─── PlantillaPanel ───────────────────────────────────────────────────────────

function PlantillaPanel({ exercises, onLoad }: { exercises: Exercise[]; onLoad: (exs: Exercise[]) => void; }) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) try { const s = localStorage.getItem('nexa_plantillas'); if (s) setPlantillas(JSON.parse(s)); } catch {}
  }, [open]);
  function guardar() {
    if (!exercises.length) return;
    const nombre = prompt('Nombre de la plantilla:');
    if (!nombre?.trim()) return;
    const p: Plantilla = { id: crypto.randomUUID(), nombre: nombre.trim(), exercises, creadaEn: new Date().toISOString().slice(0,10) };
    const updated = [p, ...plantillas];
    localStorage.setItem('nexa_plantillas', JSON.stringify(updated));
    setPlantillas(updated);
  }
  function cargar(p: Plantilla) {
    if (!confirm(`¿Cargar "${p.nombre}"?`)) return;
    onLoad(p.exercises.map(e => ({ ...e, id: crypto.randomUUID() })));
    setOpen(false);
  }
  function del(id: string) {
    const updated = plantillas.filter(p => p.id !== id);
    localStorage.setItem('nexa_plantillas', JSON.stringify(updated));
    setPlantillas(updated);
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#333333]">Plantillas de día</p>
        <div className="flex gap-2">
          {exercises.length > 0 && (
            <button onClick={guardar}
              className="flex items-center gap-1.5 rounded-xl border border-[#222222] px-3 py-1.5 text-xs text-[#555555] hover:border-[#333333] hover:text-[#888888] transition">
              <Save className="h-3 w-3" /> Guardar
            </button>
          )}
          <button onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 rounded-xl border border-[#222222] px-3 py-1.5 text-xs text-[#555555] hover:border-[#333333] hover:text-[#888888] transition">
            <FolderOpen className="h-3 w-3" /> Cargar
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#1e1e1e] p-3">
          {plantillas.length === 0
            ? <p className="py-4 text-center text-xs text-[#333333]">Sin plantillas guardadas</p>
            : <div className="space-y-1.5">
                {plantillas.map(p => {
                  const groups = getMuscleGroups(p.exercises);
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111111] px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.nombre}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {groups.slice(0,4).map(m => (
                            <span key={m} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: MUSCLE_HEX[m] ?? '#555555' }} />
                          ))}
                          <span className="text-[10px] text-[#333333]">{p.exercises.length} ej. · {p.creadaEn}</span>
                        </div>
                      </div>
                      <button onClick={() => cargar(p)}
                        className="rounded-xl border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#555555] hover:border-[#444444] hover:text-white transition">
                        Cargar
                      </button>
                      <button onClick={() => del(p.id)} className="p-1 text-[#2a2a2a] hover:text-red-500 transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>}
        </div>
      )}
    </div>
  );
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportToPDF(routine: Routine) {
  const dates = Object.keys(routine.sessions).sort();
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${routine.name}</title>
<style>body{font-family:Arial,sans-serif;padding:2rem;color:#111}h1{font-size:1.5rem;margin-bottom:.5rem}.meta{color:#666;font-size:.85rem;margin-bottom:1.5rem}.day{margin:1.5rem 0 .25rem;font-size:1rem;font-weight:700;border-bottom:2px solid #ddd;padding-bottom:.25rem}table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem}th{text-align:left;padding:.4rem .6rem;background:#f5f5f5;border:1px solid #ddd}td{padding:.4rem .6rem;border:1px solid #ddd}@media print{body{padding:1rem}}</style></head><body>
<h1>${routine.name}</h1><p class="meta">${dates.length} días · ${routine.startDate || ''} ${routine.endDate ? '→ ' + routine.endDate : ''}</p>
${dates.map(d => { const s = routine.sessions[d]; const label = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
return `<p class="day">${label}${s.name ? ' — ' + s.name : ''}</p>${s.exercises.length === 0 ? '<p>Sin ejercicios</p>' : `<table><thead><tr><th>#</th><th>Ejercicio</th><th>Grupo</th><th>Series</th><th>Reps</th><th>Peso</th></tr></thead><tbody>${s.exercises.map((ex, i) => `<tr><td>${i+1}</td><td>${ex.name}</td><td>${ex.muscle}</td><td>${ex.series}</td><td>${ex.reps}</td><td>${ex.weight||'—'}</td></tr>`).join('')}</tbody></table>`}`;
}).join('')}</body></html>`);
  w.document.close(); w.focus(); w.print();
}

// ─── RoutineCalendarEditor ────────────────────────────────────────────────────

function RoutineCalendarEditor({ routine, alumnos, onUpdate }: {
  routine: Routine; alumnos: Alumno[]; onUpdate: (r: Routine) => void;
}) {
  const today = new Date();
  const todayStr = toDateStr(today);
  const initDate = routine.startDate ? new Date(routine.startDate + 'T12:00:00') : today;
  const [viewYear,  setViewYear]      = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth]     = useState(initDate.getMonth());
  const [selDate,   setSelDate]       = useState<string | null>(null);
  const [copyDate,  setCopyDate]      = useState<string | null>(null);
  const [showVol,   setShowVol]       = useState(false);

  const grid = buildMonthGrid(viewYear, viewMonth);
  const isCurrentMonthView = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }
  function goToday()   { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }

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

  function toggleAlumno(id: string) {
    const ids = routine.alumnoIds ?? [];
    patch({ alumnoIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] });
  }

  const isInRange = (ds: string) => {
    if (routine.startDate && ds < routine.startDate) return false;
    if (routine.endDate   && ds > routine.endDate)   return false;
    return true;
  };

  const sessionCount = Object.keys(routine.sessions).length;
  const allMuscles = [...new Set(Object.values(routine.sessions).flatMap(s => s.exercises.map(e => e.muscle)))];

  return (
    <div className="border-t border-[#1e1e1e] px-5 pb-6 pt-5">
      <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-6">

        {/* ── Left col ── */}
        <div className="space-y-4">

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LC}>Inicio</label>
              <input type="date" value={routine.startDate} onChange={e => patch({ startDate: e.target.value })}
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none transition focus:border-[#444444]" />
            </div>
            <div>
              <label className={LC}>Fin</label>
              <input type="date" value={routine.endDate} onChange={e => patch({ endDate: e.target.value })}
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none transition focus:border-[#444444]" />
            </div>
          </div>

          {/* Calendar */}
          <div className="overflow-hidden rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d]">
            {/* Month nav */}
            <div className="flex items-center gap-1 border-b border-[#1e1e1e] px-2 py-2">
              <button onClick={prevMonth} className="rounded-lg p-1.5 text-[#444444] hover:bg-[#1a1a1a] hover:text-white transition">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex flex-1 items-center justify-center gap-2">
                <span className="text-sm font-bold text-white">{MONTHS_ES[viewMonth]} {viewYear}</span>
                {!isCurrentMonthView && (
                  <button onClick={goToday}
                    className="rounded-full border border-[#222222] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#444444] hover:border-[#333333] hover:text-[#888888] transition">
                    Hoy
                  </button>
                )}
              </div>
              <button onClick={nextMonth} className="rounded-lg p-1.5 text-[#444444] hover:bg-[#1a1a1a] hover:text-white transition">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* DOW headers */}
            <div className="grid grid-cols-7 border-b border-[#1a1a1a]">
              {DOW_LABEL.map(d => (
                <div key={d} className="py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-[#333333]">{d}</div>
              ))}
            </div>

            {/* Grid */}
            {grid.map((week, wi) => (
              <div key={wi} className={`grid grid-cols-7 ${wi < grid.length - 1 ? 'border-b border-[#1a1a1a]' : ''}`}>
                {week.map((date, di) => {
                  const ds       = toDateStr(date);
                  const isThisM  = date.getMonth() === viewMonth;
                  const isToday  = ds === todayStr;
                  const isSel    = ds === selDate;
                  const inRange  = isInRange(ds);
                  const sess     = routine.sessions[ds];
                  const primaryM = sess ? getMuscleGroups(sess.exercises)[0] : null;
                  const chipColor = primaryM ? (MUSCLE_HEX[primaryM] ?? '#ffffff') : '#ffffff';

                  return (
                    <button key={di} onClick={() => setSelDate(isSel ? null : ds)}
                      className={`group relative flex min-h-[58px] flex-col items-start p-1.5 text-left transition-colors
                        ${di < 6 ? 'border-r border-[#1a1a1a]' : ''}
                        ${isSel ? 'bg-white/[0.04]' : 'hover:bg-[#141414]'}
                        ${(!isThisM || (!inRange && isThisM)) ? 'opacity-20' : ''}
                      `}>
                      {/* Date number */}
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition
                        ${isToday  ? 'bg-white text-black'
                        : isSel    ? 'bg-white/20 text-white'
                        : 'text-[#666666] group-hover:text-white'}
                      `}>
                        {date.getDate()}
                      </span>
                      {/* Session chip */}
                      {sess && sess.exercises.length > 0 && (
                        <div className="mt-0.5 w-full overflow-hidden">
                          <div className="truncate rounded-sm py-px pl-1.5 pr-1 text-[9px] font-semibold leading-tight text-white"
                            style={{ backgroundColor: chipColor + '20', borderLeft: `2px solid ${chipColor}` }}>
                            {sess.name || `${sess.exercises.length} ej.`}
                          </div>
                        </div>
                      )}
                      {/* Selected underline */}
                      {isSel && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {allMuscles.slice(0, 6).map(m => (
                <span key={m} className="h-2 w-2 rounded-full" style={{ backgroundColor: MUSCLE_HEX[m] ?? '#555555' }} />
              ))}
              {sessionCount > 0 && (
                <span className="ml-1 text-xs text-[#444444]">{sessionCount} días planificados</span>
              )}
            </div>
            {sessionCount > 0 && (
              <button onClick={() => exportToPDF(routine)}
                className="flex items-center gap-1.5 text-xs text-[#333333] hover:text-[#888888] transition">
                <Download className="h-3 w-3" /> PDF
              </button>
            )}
          </div>

          {/* Alumno assignment */}
          {alumnos.length > 0 && (
            <div>
              <p className={`mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#333333]`}>Alumnos asignados</p>
              <div className="flex flex-wrap gap-1.5">
                {alumnos.map(a => {
                  const sel = (routine.alumnoIds ?? []).includes(a.id);
                  return (
                    <button key={a.id} onClick={() => toggleAlumno(a.id)}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
                        sel ? 'border-white bg-white text-black' : 'border-[#222222] text-[#555555] hover:border-[#333333] hover:text-[#888888]'
                      }`}>
                      <span className={`flex h-4 w-4 items-center justify-center rounded-lg text-[10px] font-black ${sel ? 'bg-black/10' : 'bg-[#1a1a1a]'}`}>
                        {a.nombre[0]?.toUpperCase()}
                      </span>
                      {a.nombre}
                    </button>
                  );
                })}
              </div>
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
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#1e1e1e] bg-[#0a0a0a] py-16 text-center lg:py-24">
              <svg viewBox="0 0 40 40" className="h-10 w-10 text-[#1e1e1e]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="8" width="32" height="28" rx="4" />
                <path d="M4 15h32" />
                <path d="M13 4v7M27 4v7" strokeLinecap="round" />
                <rect x="10" y="21" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" stroke="none" />
                <rect x="22" y="21" width="6" height="6" rx="1.5" fill="currentColor" opacity=".25" stroke="none" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-[#333333]">Selecciona un día</p>
                <p className="mt-1 text-xs text-[#222222]">Haz click en cualquier fecha del calendario</p>
              </div>
            </div>
          )}

          {/* Volume toggle */}
          {sessionCount > 0 && (
            <div>
              <button onClick={() => setShowVol(!showVol)}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#333333] hover:text-[#666666] transition">
                {showVol ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Volumen MEV / MRV
              </button>
              {showVol && (
                <div className="mt-2">
                  <VolumeCounter sessions={routine.sessions} startDate={routine.startDate} endDate={routine.endDate} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {copyDate && routine.sessions[copyDate] && (
        <CopyModal sourceDate={copyDate} session={routine.sessions[copyDate]}
          routine={routine} onCopy={handleCopy} onClose={() => setCopyDate(null)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RutinasPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [alumnos, setAlumnos]   = useState<Alumno[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem('nexa_routines'); if (s) setRoutines(JSON.parse(s).map(migrateToCalendar)); } catch {}
    try { const s = localStorage.getItem('nexa_alumnos');  if (s) setAlumnos(JSON.parse(s)); } catch {}
  }, []);

  function save(next: Routine[]) { setRoutines(next); localStorage.setItem('nexa_routines', JSON.stringify(next)); }
  function createRoutine() {
    const r: Routine = { id: crypto.randomUUID(), name: 'Nueva rutina', startDate: '', endDate: '', alumnoIds: [], sessions: {} };
    save([r, ...routines]);
    setExpanded(r.id);
  }
  function deleteRoutine(id: string) {
    if (!confirm('¿Eliminar esta rutina?')) return;
    save(routines.filter(r => r.id !== id));
  }
  function updateRoutine(r: Routine) { save(routines.map(x => x.id === r.id ? r : x)); }

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Rutinas</h1>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#333333]">
            {routines.length} programa{routines.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={createRoutine}
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:bg-[#e8e8e8]">
          <Plus className="h-4 w-4" /> Nueva rutina
        </button>
      </div>

      {routines.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#1e1e1e] py-24 text-center">
          <svg viewBox="0 0 40 40" className="h-10 w-10 text-[#1e1e1e]" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="8" width="32" height="28" rx="4" />
            <path d="M4 15h32M13 4v7M27 4v7" strokeLinecap="round" />
            <path d="M20 22v8M16 26h8" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[#333333]">Sin programas aún</p>
            <p className="mt-1 text-xs text-[#222222]">Crea tu primer programa de entrenamiento</p>
          </div>
          <button onClick={createRoutine}
            className="mt-1 flex items-center gap-2 rounded-xl border border-[#222222] px-4 py-2 text-sm font-medium text-[#555555] hover:border-[#444444] hover:text-white transition">
            <Plus className="h-4 w-4" /> Crear programa
          </button>
        </div>
      )}

      <div className="space-y-2">
        {routines.map(routine => {
          const isOpen = expanded === routine.id;
          const sessionCount = Object.keys(routine.sessions).length;
          const allMuscles = [...new Set(Object.values(routine.sessions).flatMap(s => s.exercises.map(e => e.muscle)))];

          return (
            <div key={routine.id}
              className={`overflow-hidden rounded-2xl border transition-colors ${isOpen ? 'border-[#2a2a2a] bg-[#111111]' : 'border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#2a2a2a]'}`}>
              <div className="flex items-center gap-3 px-5 py-4">
                <input value={routine.name}
                  onChange={e => updateRoutine({ ...routine, name: e.target.value })}
                  className="flex-1 bg-transparent text-base font-bold text-white outline-none placeholder-[#222222]"
                  placeholder="Nombre del programa" />
                {/* Muscle dots preview */}
                {allMuscles.length > 0 && (
                  <div className="hidden items-center gap-1 sm:flex">
                    {allMuscles.slice(0, 7).map(m => (
                      <span key={m} className="h-2 w-2 rounded-full" style={{ backgroundColor: MUSCLE_HEX[m] ?? '#333333' }} />
                    ))}
                    <span className="ml-1 text-xs text-[#333333]">{sessionCount}d</span>
                  </div>
                )}
                {routine.startDate && (
                  <span className="hidden text-xs text-[#2a2a2a] sm:block">
                    {routine.startDate}{routine.endDate ? ` → ${routine.endDate}` : ''}
                  </span>
                )}
                <button onClick={() => setExpanded(isOpen ? null : routine.id)}
                  className="rounded-xl border border-[#222222] p-1.5 text-[#444444] transition hover:border-[#333333] hover:text-white">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button onClick={() => deleteRoutine(routine.id)}
                  className="rounded-xl border border-[#1a1a1a] p-1.5 text-[#333333] transition hover:border-red-950 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {isOpen && (
                <RoutineCalendarEditor routine={routine} alumnos={alumnos} onUpdate={updateRoutine} />
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
