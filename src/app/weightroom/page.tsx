'use client';

import { useState, useEffect } from 'react';
import { X, Save, Plus, Minus, CheckSquare } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { saveSesion, getMaxPeso, type Sesion, type SesionEjercicio, type SesionSerie } from '@/lib/sesiones';
import { calc1RM } from '@/lib/mevmrv';

interface Exercise { id: string; name: string; muscle: string; series: number; reps: string; weight: string; rest: string; }
interface DayBlock  { id: string; name: string; exercises: Exercise[]; }
interface CalSession { name: string; exercises: Exercise[]; }
interface Routine   {
  id: string; name: string;
  sessions?: Record<string, CalSession>;
  blocks?: DayBlock[]; exercises?: Exercise[];
  selectedDays?: number[]; dayToBlock?: Record<number,string>; weekOverrides?: Record<string,string>;
  weeks?: number;
  startDate: string; endDate: string; alumnoIds: string[];
}

function todayDayIdx() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function getWeekIdx(start: string) {
  if (!start) return 0;
  const s = new Date(start + 'T12:00:00');
  const n = new Date(); n.setHours(12,0,0,0);
  return Math.max(0, Math.floor((n.getTime() - s.getTime()) / 86400000 / 7));
}
function getActiveBlock(r: Routine): DayBlock | null {
  const today = new Date().toISOString().slice(0, 10);
  if (!r.startDate || !r.endDate) return null;
  if (today < r.startDate || today > r.endDate) return null;
  // New calendar format
  if (r.sessions) {
    const sess = r.sessions[today];
    if (!sess || !sess.exercises.length) return null;
    return { id: today, name: sess.name || today, exercises: sess.exercises };
  }
  // Legacy block format
  const d = todayDayIdx();
  if (!r.selectedDays?.includes(d)) return null;
  const w = getWeekIdx(r.startDate);
  const ov = r.weekOverrides?.[`${w}-${d}`];
  const blockId = ov !== undefined ? (ov === '__rest__' ? null : ov) : (r.dayToBlock?.[d] ?? null);
  if (!blockId) return null;
  if (r.blocks?.length) return r.blocks.find(b => b.id === blockId) ?? null;
  if (r.exercises?.length) return { id: 'legacy', name: r.name, exercises: r.exercises };
  return null;
}

// ─── Session modal ────────────────────────────────────────────────────────────

interface SessionModalProps {
  alumno: Alumno; routine: Routine; block: DayBlock;
  onClose: () => void; onSaved: () => void;
}

function SessionModal({ alumno, routine, block, onClose, onSaved }: SessionModalProps) {
  const IC = 'w-full rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-white placeholder-[#444444] outline-none focus:border-white';

  const [notas, setNotas] = useState('');
  const [ejercicios, setEjercicios] = useState<SesionEjercicio[]>(
    block.exercises.map(ex => ({
      nombre: ex.name, grupo: ex.muscle,
      series: Array.from({ length: ex.series }, () => ({
        reps: ex.reps.replace(/[^0-9]/g, '') || '10',
        peso: ex.weight || '',
        completada: false,
      })),
    }))
  );

  function toggleSerie(ejIdx: number, sIdx: number) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: ej.series.map((s, j) => j !== sIdx ? s : { ...s, completada: !s.completada })
    }));
  }
  function setSerie(ejIdx: number, sIdx: number, field: 'reps'|'peso', val: string) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: ej.series.map((s, j) => j !== sIdx ? s : { ...s, [field]: val })
    }));
  }
  function addSerie(ejIdx: number) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: [...ej.series, { reps: ej.series[ej.series.length-1]?.reps || '10', peso: ej.series[ej.series.length-1]?.peso || '', completada: false }]
    }));
  }
  function removeSerie(ejIdx: number, sIdx: number) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: ej.series.filter((_, j) => j !== sIdx)
    }));
  }

  function handleSave() {
    const sesion: Sesion = {
      id: crypto.randomUUID(),
      alumnoId: alumno.id,
      fecha: new Date().toISOString().slice(0,10),
      rutinaId: routine.id,
      rutinaNombre: routine.name,
      bloqueNombre: block.name,
      notas,
      ejercicios,
    };
    saveSesion(sesion);
    onSaved();
    onClose();
  }

  const completadas = ejercicios.reduce((sum, ej) => sum + ej.series.filter(s => s.completada).length, 0);
  const totales     = ejercicios.reduce((sum, ej) => sum + ej.series.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-8">
      <div className="w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
          <div>
            <p className="font-semibold text-white">{alumno.nombre} · {block.name}</p>
            <p className="text-xs text-[#888888]">{completadas}/{totales} series completadas</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#888888] hover:bg-[#2a2a2a] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {ejercicios.map((ej, ejIdx) => {
            const prevMax = getMaxPeso(alumno.id, ej.nombre);
            const maxPesoHoy = Math.max(...ej.series.filter(s=>s.completada).map(s=>parseFloat(s.peso)||0));
            const repsNum = parseInt(ej.series[0]?.reps);
            const rm = maxPesoHoy && repsNum ? calc1RM(maxPesoHoy, repsNum) : null;

            return (
              <div key={ejIdx} className="rounded-lg border border-[#2a2a2a] bg-[#111111] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{ej.nombre}</p>
                    <div className="flex gap-2 text-xs text-[#888888]">
                      {prevMax && <span>Mejor: {prevMax} kg</span>}
                      {rm && <span>1RM ~{rm} kg</span>}
                    </div>
                  </div>
                  <span className="text-xs text-[#888888]">{ej.grupo}</span>
                </div>
                <div className="space-y-1.5">
                  {ej.series.map((serie, sIdx) => (
                    <div key={sIdx} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-xs text-[#888888]">{sIdx+1}</span>
                      <input value={serie.reps} onChange={e=>setSerie(ejIdx,sIdx,'reps',e.target.value)}
                        className={IC + ' w-14'} placeholder="reps" />
                      <input value={serie.peso} onChange={e=>setSerie(ejIdx,sIdx,'peso',e.target.value)}
                        className={IC + ' w-16'} placeholder="kg" />
                      <span className="text-xs text-[#888888]">kg</span>
                      <button onClick={() => toggleSerie(ejIdx, sIdx)}
                        className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition ${
                          serie.completada
                            ? 'border-white bg-white text-black'
                            : 'border-[#2a2a2a] text-[#888888] hover:border-[#444444]'
                        }`}>
                        {serie.completada ? '✓' : 'OK'}
                      </button>
                      {ej.series.length > 1 && (
                        <button onClick={() => removeSerie(ejIdx, sIdx)}
                          className="text-[#333333] hover:text-red-500">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => addSerie(ejIdx)}
                  className="mt-2 flex items-center gap-1 text-xs text-[#888888] hover:text-white">
                  <Plus className="h-3 w-3" /> Serie
                </button>
              </div>
            );
          })}

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">Notas de sesión</label>
            <textarea value={notas} onChange={e=>setNotas(e.target.value)} rows={2}
              placeholder="Observaciones, cómo se sintió el atleta..."
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm text-white placeholder-[#444444] outline-none focus:border-white resize-none" />
          </div>

          <button onClick={handleSave}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-[#e0e0e0]">
            <Save className="h-4 w-4" /> Guardar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Athlete card ─────────────────────────────────────────────────────────────

function AlumnoCard({ alumno, routine, block, onLog }: {
  alumno: Alumno; routine: Routine | null; block: DayBlock | null;
  onLog: () => void;
}) {
  return (
    <div className="flex min-w-[320px] flex-1 flex-col rounded-xl border border-[#2a2a2a] bg-[#111111]">
      <div className="flex items-center gap-4 border-b border-[#2a2a2a] px-6 py-5">
        {alumno.foto
          ? <img src={alumno.foto} alt="" className="h-14 w-14 rounded-lg object-cover" />
          : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#2a2a2a] text-2xl font-bold text-[#888888]">
              {alumno.nombre[0]?.toUpperCase()}
            </div>}
        <div className="flex-1">
          <p className="text-2xl font-bold tracking-tight text-white">{alumno.nombre} {alumno.apellido}</p>
          {block && <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">{block.name}</p>}
        </div>
        {block && routine && (
          <button onClick={onLog}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#888888] transition hover:border-white hover:text-white">
            <CheckSquare className="h-3.5 w-3.5" /> Registrar
          </button>
        )}
      </div>
      <div className="flex-1 p-5">
        {!block ? (
          <p className="py-8 text-center text-base text-[#888888]">Sin entrenamiento hoy</p>
        ) : block.exercises.length === 0 ? (
          <p className="py-8 text-center text-base text-[#888888]">Bloque sin ejercicios</p>
        ) : (
          <div className="space-y-2">
            {block.exercises.map((ex, i) => (
              <div key={ex.id} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-[#888888]">{String(i+1).padStart(2,'0')}</span>
                    <span className="text-xl font-bold text-white">{ex.name}</span>
                  </div>
                  <span className="mt-0.5 shrink-0 rounded-md border border-[#2a2a2a] px-2 py-0.5 text-xs text-[#888888]">{ex.muscle}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { val: String(ex.series), label: 'series' },
                    { val: ex.reps,           label: 'reps' },
                    ...(ex.weight ? [{ val: ex.weight, label: 'peso' }]     : []),
                    ...(ex.rest   ? [{ val: ex.rest,   label: 'descanso' }] : []),
                  ].map(({ val, label }) => (
                    <div key={label} className="flex min-w-[60px] flex-col items-center rounded-lg border border-[#2a2a2a] bg-[#111111] px-4 py-2.5">
                      <span className="text-2xl font-black leading-none text-white">{val}</span>
                      <span className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeightroomPage() {
  const [alumnos, setAlumnos]   = useState<Alumno[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sessionFor, setSessionFor] = useState<{ alumno: Alumno; routine: Routine; block: DayBlock } | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    try { const a = localStorage.getItem('nexa_alumnos');  if (a) setAlumnos(JSON.parse(a));  } catch {}
    try { const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r)); } catch {}
  }, []);

  function toggle(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function getRoutineAndBlock(alumnoId: string): { routine: Routine; block: DayBlock } | null {
    for (const r of routines) {
      if (!(r.alumnoIds ?? []).includes(alumnoId)) continue;
      const b = getActiveBlock(r);
      if (b) return { routine: r, block: b };
    }
    return null;
  }

  const visibles = alumnos.filter(a => selected.has(a.id));

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col bg-[#0a0a0a]">
      {/* Selector bar */}
      <div className="border-b border-[#2a2a2a] bg-[#111111] px-5 py-4">
        <div className="mx-auto flex max-w-full flex-wrap items-center gap-3">
          <span className="shrink-0 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">En sala:</span>
          {alumnos.length === 0
            ? <span className="text-sm text-[#888888]">Sin alumnos — agrégalos en /alumnos primero.</span>
            : alumnos.map(a => {
                const on = selected.has(a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      on ? 'border-white bg-white text-black' : 'border-[#2a2a2a] bg-transparent text-[#888888] hover:border-[#444444] hover:text-white'
                    }`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md text-xs font-bold ${on ? 'bg-black/10' : 'bg-[#2a2a2a]'}`}>
                      {a.nombre[0]?.toUpperCase()}
                    </span>
                    {a.nombre} {a.apellido}
                  </button>
                );
              })}
          {savedCount > 0 && (
            <span className="ml-auto text-xs text-[#888888]">{savedCount} sesión{savedCount !== 1 ? 'es' : ''} registrada{savedCount !== 1 ? 's' : ''} hoy</span>
          )}
        </div>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-x-auto px-5 py-6">
        {visibles.length === 0
          ? <div className="flex h-full min-h-[400px] items-center justify-center">
              <p className="text-base text-[#888888]">Selecciona un alumno para ver su entrenamiento de hoy</p>
            </div>
          : <div className="flex gap-4" style={{ minWidth: `${visibles.length * 340}px` }}>
              {visibles.map(a => {
                const res = getRoutineAndBlock(a.id);
                return (
                  <AlumnoCard key={a.id} alumno={a}
                    routine={res?.routine ?? null}
                    block={res?.block ?? null}
                    onLog={() => res && setSessionFor({ alumno: a, routine: res.routine, block: res.block })}
                  />
                );
              })}
            </div>}
      </div>

      {sessionFor && (
        <SessionModal
          alumno={sessionFor.alumno}
          routine={sessionFor.routine}
          block={sessionFor.block}
          onClose={() => setSessionFor(null)}
          onSaved={() => setSavedCount(c => c + 1)}
        />
      )}
    </div>
  );
}
