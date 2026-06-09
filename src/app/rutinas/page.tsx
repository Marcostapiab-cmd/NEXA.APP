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
interface CalSession {
  name: string;
  exercises: Exercise[];
}
interface Routine {
  id: string; name: string;
  startDate: string; endDate: string;
  alumnoIds: string[];
  sessions: Record<string, CalSession>; // YYYY-MM-DD → session
}
interface Plantilla { id: string; nombre: string; exercises: Exercise[]; creadaEn: string; }

// ─── Migration from old block-based format ───────────────────────────────────

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

const IC = 'w-full rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-2.5 text-sm text-white placeholder-[#444444] outline-none transition focus:border-white';
const LC = 'mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-[#888888]';
const SL = 'text-xs font-medium uppercase tracking-[0.1em] text-[#888888]';

// ─── Biblioteca modal ─────────────────────────────────────────────────────────

function BibliotecaModal({ onAdd, onClose }: { onAdd: (e: EjBiblioteca) => void; onClose: () => void; }) {
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');
  const filtered = BIBLIOTECA_EJERCICIOS.filter(e =>
    (!q     || e.nombre.toLowerCase().includes(q.toLowerCase())) &&
    (!grupo || e.grupo === grupo)
  );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-10">
      <div className="w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
          <p className="text-sm font-semibold text-white">Biblioteca de ejercicios</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#888888] hover:bg-[#2a2a2a] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#444444]" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar ejercicio..."
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#111111] py-2.5 pl-9 pr-3 text-sm text-white placeholder-[#444444] outline-none focus:border-white" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setGrupo('')}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${!grupo ? 'border-white bg-white text-black' : 'border-[#2a2a2a] text-[#888888] hover:text-white'}`}>Todos</button>
            {GRUPOS_MUSCULARES.map(g => (
              <button key={g} onClick={() => setGrupo(g === grupo ? '' : g)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${grupo === g ? 'border-white bg-white text-black' : 'border-[#2a2a2a] text-[#888888] hover:text-white'}`}>{g}</button>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto space-y-0.5 pr-1">
            {filtered.length === 0
              ? <p className="py-6 text-center text-sm text-[#888888]">Sin resultados</p>
              : filtered.map(ej => (
                <button key={ej.id} onClick={() => { onAdd(ej); onClose(); }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-[#111111]">
                  <div>
                    <p className="text-sm font-medium text-white">{ej.nombre}</p>
                    <p className="text-xs text-[#888888]">{ej.grupo}{ej.series ? ` · ${ej.series}×${ej.reps}` : ''}</p>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-[#444444]" />
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
  const DOW_LONG = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const dayName = DOW_LONG[srcDate.getDay()];
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

  function toggle(d: string) { setSelected(p => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; }); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Copiar entrenamiento</p>
            <p className="text-xs text-[#888888]">{session.exercises.length} ejercicios · {fmt(sourceDate)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#888888] hover:bg-[#2a2a2a] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">
          {candidates.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#888888]">
              {!routine.startDate || !routine.endDate
                ? 'Define una fecha de inicio y fin del programa primero.'
                : `No hay más ${dayName.toLowerCase()}s dentro del período.`}
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className={SL}>Copiar a los {dayName.toLowerCase()}s</p>
                <button onClick={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates))}
                  className="text-xs text-[#888888] hover:text-white">
                  {selected.size === candidates.length ? 'Ninguno' : 'Todos'}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {candidates.map(d => {
                  const has = routine.sessions[d];
                  const chk = selected.has(d);
                  return (
                    <button key={d} onClick={() => toggle(d)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${chk ? 'border-white/20 bg-white/5 text-white' : 'border-[#2a2a2a] text-[#888888] hover:border-[#333333]'}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${chk ? 'border-white bg-white text-black' : 'border-[#444444]'}`}>
                        {chk && '✓'}
                      </span>
                      <span className="flex-1">{fmt(d)}</span>
                      {has && <span className="text-[10px] text-[#555555]">{has.exercises.length} ej.</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => { onCopy([...selected]); onClose(); }} disabled={selected.size === 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-[#e0e0e0] disabled:opacity-40">
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
      className="rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={LC}>Ejercicio *</label>
          <input required autoFocus value={f.name} onChange={e => set('name', e.target.value)} placeholder="Press de banca" className={IC} />
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
          <label className={LC}>Reps</label>
          <input value={f.reps} onChange={e => set('reps', e.target.value)} placeholder="10 ó 8-12" className={IC} />
        </div>
        <div>
          <label className={LC}>Peso</label>
          <input value={f.weight} onChange={e => set('weight', e.target.value)} placeholder="60 kg" className={IC} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e0e0e0]">Agregar</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-[#444444] px-4 py-2 text-xs font-medium text-white hover:border-white">Cancelar</button>
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
  const DOW = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const label = `${DOW[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()].toLowerCase()}`;

  const ensure = (): CalSession => session ?? { name: '', exercises: [] };
  const exs = ensure().exercises;

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
    <div className="rounded-xl border border-white/10 bg-[#111111]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#2a2a2a] px-4 py-3">
        <span className="text-sm font-semibold capitalize text-white flex-1">{label}</span>
        {exs.length > 0 && (
          <>
            <button onClick={onCopy}
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-xs text-[#888888] hover:border-[#444444] hover:text-white transition">
              <Copy className="h-3 w-3" /> Copiar día
            </button>
            <button onClick={onClear}
              className="rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-xs text-[#888888] hover:border-red-800 hover:text-red-400 transition">
              Limpiar
            </button>
          </>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Session name */}
        <input value={session?.name ?? ''} onChange={e => onUpdate({ ...ensure(), name: e.target.value })}
          placeholder="Nombre del día (ej: Piernas · Empuje · Full Body)"
          className="w-full bg-transparent text-sm text-white placeholder-[#333333] outline-none" />

        {/* Exercise table */}
        {exs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['','#','Ejercicio','Grupo','Series','Reps','Peso','1RM est.',''].map((h, i) => (
                    <th key={i} className="pb-2 pr-3 text-left text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exs.map((ex, idx) => {
                  const rm = (() => { const p = parsePeso(ex.weight), r = parseReps(ex.reps); return p && r ? calc1RM(p, r) : null; })();
                  return (
                    <tr key={ex.id} draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab border-b border-[#2a2a2a]/40 last:border-0">
                      <td className="py-2.5 pr-1 text-[#333333]"><GripVertical className="h-3.5 w-3.5" /></td>
                      <td className="py-2.5 pr-3 text-xs font-mono text-[#555555]">{idx + 1}</td>
                      <td className="py-2.5 pr-3 font-medium text-white">{ex.name}</td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-0.5 text-xs text-[#888888]">{ex.muscle}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-[#888888]">{ex.series}</td>
                      <td className="py-2.5 pr-3 text-[#888888]">{ex.reps}</td>
                      <td className="py-2.5 pr-3 text-[#888888]">{ex.weight || '—'}</td>
                      <td className="py-2.5 pr-3">
                        {rm ? <span className="text-xs font-semibold text-white">{rm} kg</span>
                             : <span className="text-xs text-[#333333]">—</span>}
                      </td>
                      <td className="py-2.5">
                        <button onClick={() => delEx(ex.id)} className="rounded p-1 text-[#333333] hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add row */}
        {showForm
          ? <ExerciseForm onAdd={addEx} onCancel={() => setShowForm(false)} />
          : (
            <div className="flex gap-2">
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#2a2a2a] px-3 py-2 text-xs text-[#888888] hover:border-[#444444] hover:text-white transition">
                <Plus className="h-3.5 w-3.5" /> Agregar ejercicio
              </button>
              <button onClick={() => setShowLib(true)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#2a2a2a] px-3 py-2 text-xs text-[#888888] hover:border-[#444444] hover:text-white transition">
                <BookOpen className="h-3.5 w-3.5" /> Buscar en biblioteca
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
    const s = new Date(startDate + 'T12:00:00');
    const e = new Date(endDate   + 'T12:00:00');
    return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000 / 7));
  })();

  const totalByMuscle = MUSCLES.reduce<Record<string,number>>((acc, m) => {
    acc[m] = allExs.filter(e => e.muscle === m).reduce((s, e) => s + e.series, 0);
    return acc;
  }, {});

  const active = MUSCLES.filter(m => totalByMuscle[m] > 0);
  if (!active.length) return null;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] p-4">
      <p className={`mb-4 ${SL}`}>Volumen semanal promedio — series/semana</p>
      <div className="space-y-3">
        {active.map(m => {
          const rango = MEV_MRV[m];
          const total = totalByMuscle[m];
          const weekly = Math.round((total / numWeeks) * 10) / 10;
          if (!rango) return (
            <div key={m} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-[#888888]">{m}</span>
              <span className="text-sm font-bold text-white">{weekly}</span>
            </div>
          );
          const estado  = getEstado(weekly, rango);
          const barColor = estado === 'optimo' ? 'bg-white' : estado === 'alto' ? 'bg-red-500' : 'bg-[#555555]';
          const txtColor = estado === 'optimo' ? 'text-white' : estado === 'alto' ? 'text-red-400' : 'text-[#888888]';
          const pct = Math.min(100, (weekly / rango.mrv) * 100);
          return (
            <div key={m} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-[#888888]">{m}</span>
              <div className="relative flex-1 overflow-hidden rounded-full bg-[#2a2a2a]" style={{ height: 6 }}>
                <div className="absolute top-0 bottom-0 w-px bg-[#444444]"
                  style={{ left: `${(rango.mev / rango.mrv) * 100}%` }} />
                <div className="absolute top-0 bottom-0 bg-white/10"
                  style={{ left: `${(rango.optimo[0] / rango.mrv) * 100}%`, width: `${((rango.optimo[1] - rango.optimo[0]) / rango.mrv) * 100}%` }} />
                <div className={`absolute left-0 top-0 bottom-0 rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <span className={`w-12 shrink-0 text-right text-xs font-bold ${txtColor}`}>{weekly}/{rango.mrv}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[#555555]">
        MEV (mínimo) · zona blanca = óptimo · MRV (máximo) · promedio {numWeeks} sem.
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
    <div className="overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#111111]">
      <div className="flex items-center justify-between px-4 py-3">
        <span className={SL}>Plantillas de día</span>
        <div className="flex gap-2">
          {exercises.length > 0 && (
            <button onClick={guardar}
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-xs text-[#888888] hover:border-[#444444] hover:text-white transition">
              <Save className="h-3 w-3" /> Guardar
            </button>
          )}
          <button onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-xs text-[#888888] hover:border-[#444444] hover:text-white transition">
            <FolderOpen className="h-3 w-3" /> Cargar
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#2a2a2a] p-3">
          {plantillas.length === 0
            ? <p className="py-4 text-center text-xs text-[#888888]">Sin plantillas guardadas</p>
            : <div className="space-y-1.5">
                {plantillas.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{p.nombre}</p>
                      <p className="text-xs text-[#888888]">{p.exercises.length} ejercicios · {p.creadaEn}</p>
                    </div>
                    <button onClick={() => cargar(p)} className="rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#888888] hover:border-white hover:text-white">Cargar</button>
                    <button onClick={() => del(p.id)} className="p-1 text-[#333333] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
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
<h1>${routine.name}</h1>
<p class="meta">${dates.length} días · ${routine.startDate || ''} ${routine.endDate ? '→ ' + routine.endDate : ''}</p>
${dates.map(d => {
  const s = routine.sessions[d];
  const label = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<p class="day">${label}${s.name ? ' — ' + s.name : ''}</p>
${s.exercises.length === 0 ? '<p>Sin ejercicios</p>' : `<table><thead><tr><th>#</th><th>Ejercicio</th><th>Grupo</th><th>Series</th><th>Reps</th><th>Peso</th></tr></thead><tbody>${s.exercises.map((ex, i) => `<tr><td>${i+1}</td><td>${ex.name}</td><td>${ex.muscle}</td><td>${ex.series}</td><td>${ex.reps}</td><td>${ex.weight||'—'}</td></tr>`).join('')}</tbody></table>`}`;
}).join('')}
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ─── RoutineCalendarEditor ────────────────────────────────────────────────────

function RoutineCalendarEditor({ routine, alumnos, onUpdate }: {
  routine: Routine; alumnos: Alumno[]; onUpdate: (r: Routine) => void;
}) {
  const today = new Date();
  const todayStr = toDateStr(today);
  const initDate = routine.startDate ? new Date(routine.startDate + 'T12:00:00') : today;
  const [viewYear, setViewYear]       = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth]     = useState(initDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [copyDate, setCopyDate]       = useState<string | null>(null);
  const [showVol, setShowVol]         = useState(false);

  const grid = buildMonthGrid(viewYear, viewMonth);

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }

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

  return (
    <div className="border-t border-[#2a2a2a] px-5 pb-6 pt-5">
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-6">

        {/* ── Left: calendar + dates ── */}
        <div className="space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Inicio</label>
              <input type="date" value={routine.startDate}
                onChange={e => patch({ startDate: e.target.value })}
                className={IC + ' text-xs'} />
            </div>
            <div>
              <label className={LC}>Fin</label>
              <input type="date" value={routine.endDate}
                onChange={e => patch({ endDate: e.target.value })}
                className={IC + ' text-xs'} />
            </div>
          </div>

          {/* Calendar */}
          <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111111]">
            {/* Month nav */}
            <div className="flex items-center justify-between border-b border-[#2a2a2a] px-3 py-2.5">
              <button onClick={prevMonth} className="rounded-lg p-1.5 text-[#888888] hover:bg-[#2a2a2a] hover:text-white">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-white">{MONTHS_ES[viewMonth]} {viewYear}</span>
              <button onClick={nextMonth} className="rounded-lg p-1.5 text-[#888888] hover:bg-[#2a2a2a] hover:text-white">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* DOW headers */}
            <div className="grid grid-cols-7 border-b border-[#2a2a2a]">
              {DOW_LABEL.map(d => (
                <div key={d} className="py-2 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-[#555555]">{d}</div>
              ))}
            </div>

            {/* Grid */}
            {grid.map((week, wi) => (
              <div key={wi} className={`grid grid-cols-7 ${wi < grid.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}>
                {week.map((date, di) => {
                  const ds = toDateStr(date);
                  const isThisMonth = date.getMonth() === viewMonth;
                  const isToday     = ds === todayStr;
                  const isSel       = ds === selectedDate;
                  const inRange     = isInRange(ds);
                  const sess        = routine.sessions[ds];

                  return (
                    <button key={di} onClick={() => setSelectedDate(isSel ? null : ds)}
                      className={`relative flex min-h-[52px] flex-col items-start p-1.5 text-left transition
                        ${di < 6 ? 'border-r border-[#2a2a2a]' : ''}
                        ${isSel ? 'bg-white/8' : 'hover:bg-[#1a1a1a]'}
                        ${!isThisMonth || (!inRange && isThisMonth) ? 'opacity-25' : ''}
                      `}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold
                        ${isToday ? 'bg-white text-black' : isSel ? 'bg-white/15 text-white' : 'text-[#888888]'}
                      `}>
                        {date.getDate()}
                      </span>
                      {sess && sess.exercises.length > 0 && (
                        <div className="mt-0.5 w-full">
                          <div className="w-full truncate rounded bg-white/10 px-1 py-0.5 text-[9px] font-medium leading-tight text-white">
                            {sess.name || `${sess.exercises.length} ej.`}
                          </div>
                        </div>
                      )}
                      {isSel && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Calendar summary */}
          <div className="flex items-center justify-between text-xs text-[#888888]">
            <span>{sessionCount} días planificados</span>
            {sessionCount > 0 && (
              <button onClick={() => exportToPDF(routine)}
                className="flex items-center gap-1.5 hover:text-white transition">
                <Download className="h-3 w-3" /> Exportar PDF
              </button>
            )}
          </div>

          {/* Alumno assignment */}
          {alumnos.length > 0 && (
            <div>
              <p className={`mb-2 ${SL}`}>Alumnos</p>
              <div className="flex flex-wrap gap-1.5">
                {alumnos.map(a => {
                  const sel = (routine.alumnoIds ?? []).includes(a.id);
                  return (
                    <button key={a.id} onClick={() => toggleAlumno(a.id)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${sel ? 'border-white bg-white text-black' : 'border-[#2a2a2a] text-[#888888] hover:border-[#444444] hover:text-white'}`}>
                      <span className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${sel ? 'bg-black/10' : 'bg-[#2a2a2a]'}`}>
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

        {/* ── Right: day editor ── */}
        <div className="mt-4 space-y-4 lg:mt-0">
          {selectedDate ? (
            <>
              <DayEditor
                dateStr={selectedDate}
                session={routine.sessions[selectedDate]}
                routine={routine}
                onUpdate={s => setSession(selectedDate, s)}
                onCopy={() => setCopyDate(selectedDate)}
                onClear={() => { setSession(selectedDate, null); }}
              />
              <PlantillaPanel
                exercises={routine.sessions[selectedDate]?.exercises ?? []}
                onLoad={exercises => {
                  const s = routine.sessions[selectedDate] ?? { name: '', exercises: [] };
                  setSession(selectedDate, { ...s, exercises });
                }}
              />
            </>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] lg:h-64">
              <p className="text-sm text-[#888888]">Selecciona un día en el calendario para editar el entrenamiento</p>
            </div>
          )}

          {/* Volume toggle */}
          {sessionCount > 0 && (
            <div>
              <button onClick={() => setShowVol(!showVol)}
                className="flex items-center gap-2 text-xs text-[#888888] hover:text-white transition mb-2">
                {showVol ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Volumen semanal (MEV / MRV)
              </button>
              {showVol && <VolumeCounter sessions={routine.sessions} startDate={routine.startDate} endDate={routine.endDate} />}
            </div>
          )}
        </div>
      </div>

      {/* Copy modal */}
      {copyDate && routine.sessions[copyDate] && (
        <CopyModal
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RutinasPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [alumnos, setAlumnos]   = useState<Alumno[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem('nexa_routines'); if (s) setRoutines(JSON.parse(s).map(migrateToCalendar)); } catch {}
    try { const s = localStorage.getItem('nexa_alumnos');  if (s) setAlumnos(JSON.parse(s)); } catch {}
  }, []);

  function save(next: Routine[]) {
    setRoutines(next);
    localStorage.setItem('nexa_routines', JSON.stringify(next));
  }

  function createRoutine() {
    const r: Routine = { id: crypto.randomUUID(), name: 'Nueva rutina', startDate: '', endDate: '', alumnoIds: [], sessions: {} };
    const next = [r, ...routines];
    save(next);
    setExpanded(r.id);
  }

  function deleteRoutine(id: string) {
    if (!confirm('¿Eliminar esta rutina?')) return;
    save(routines.filter(r => r.id !== id));
  }

  function updateRoutine(r: Routine) {
    save(routines.map(x => x.id === r.id ? r : x));
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Rutinas</h1>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
            {routines.length} programa{routines.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={createRoutine}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#e0e0e0]">
          <Plus className="h-4 w-4" /> Nueva rutina
        </button>
      </div>

      {routines.length === 0 && (
        <div className="rounded-lg border border-dashed border-[#2a2a2a] py-20 text-center">
          <p className="text-sm text-[#888888]">Sin rutinas. Crea la primera.</p>
        </div>
      )}

      <div className="space-y-3">
        {routines.map(routine => {
          const isOpen = expanded === routine.id;
          const sessionCount = Object.keys(routine.sessions).length;
          return (
            <div key={routine.id} className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]">
              <div className="flex items-center gap-3 px-5 py-4">
                <input value={routine.name}
                  onChange={e => updateRoutine({ ...routine, name: e.target.value })}
                  className="flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder-[#444444]"
                  placeholder="Nombre de la rutina" />
                {sessionCount > 0 && (
                  <span className="hidden shrink-0 text-xs text-[#888888] sm:block">{sessionCount} días</span>
                )}
                {routine.startDate && routine.endDate && (
                  <span className="hidden shrink-0 text-xs text-[#555555] sm:block">
                    {routine.startDate} → {routine.endDate}
                  </span>
                )}
                <button onClick={() => setExpanded(isOpen ? null : routine.id)}
                  className="rounded-md p-1.5 text-[#888888] transition hover:bg-[#2a2a2a] hover:text-white">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button onClick={() => deleteRoutine(routine.id)}
                  className="rounded-md p-1.5 text-[#444444] transition hover:bg-red-950/40 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {isOpen && (
                <RoutineCalendarEditor
                  routine={routine}
                  alumnos={alumnos}
                  onUpdate={updateRoutine}
                />
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
