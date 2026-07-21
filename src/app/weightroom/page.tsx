'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Save, Plus, Minus, CheckSquare, Mic, Trophy, CalendarDays, Search, Check, StickyNote, RefreshCw } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { saveSesion, getMaxPeso, type Sesion, type SesionEjercicio, type SesionSerie } from '@/lib/sesiones';
import { calc1RM } from '@/lib/mevmrv';
import { getVideoUrlForExercise, getAllEjercicios, type EjBiblioteca } from '@/lib/ejercicios';
import VoiceWorkoutLogger, { type ParsedExercise } from '@/components/ejercicios/VoiceWorkoutLogger';
import WeightroomCalendarModal from '@/components/weightroom/WeightroomCalendarModal';

interface Exercise { id: string; name: string; muscle: string; series: number; reps: string; weight?: string; rest: string; tempo?: string; notes?: string; exerciseLibraryId?: string; }
interface DayBlock  { id: string; name: string; exercises: Exercise[]; }
interface CalSession { name: string; exercises: Exercise[]; }
interface Routine   {
  id: string; name: string;
  alumnoId?: string;
  sessions?: Record<string, CalSession>;
  blocks?: DayBlock[]; exercises?: Exercise[];
  selectedDays?: number[]; dayToBlock?: Record<number, string>; weekOverrides?: Record<string, string>;
  weeks?: number;
  startDate: string; endDate: string; alumnoIds: string[];
}


function todayDayIdx() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function getWeekIdx(start: string) {
  if (!start) return 0;
  const s = new Date(start + 'T12:00:00');
  const n = new Date(); n.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((n.getTime() - s.getTime()) / 86400000 / 7));
}
function getActiveBlock(r: Routine): DayBlock | null {
  const today = new Date().toISOString().slice(0, 10);
  if (!r.startDate || !r.endDate) return null;
  if (today < r.startDate || today > r.endDate) return null;
  if (r.sessions) {
    const sess = r.sessions[today];
    if (!sess || !sess.exercises.length) return null;
    return { id: today, name: sess.name || today, exercises: sess.exercises };
  }
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

// ─── Video helpers ────────────────────────────────────────────────────────────

function parseVideoEmbed(url: string): {
  type: 'youtube' | 'vimeo' | 'external';
  embedUrl?: string;
  thumbUrl?: string;
  videoId?: string;
} {
  if (!url) return { type: 'external' };
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return {
    type: 'youtube',
    videoId: yt[1],
    embedUrl: `https://www.youtube.com/embed/${yt[1]}?rel=0&autoplay=1`,
    thumbUrl: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`,
  };
  const vi = url.match(/vimeo\.com\/(\d+)/);
  if (vi) return { type: 'vimeo', videoId: vi[1], embedUrl: `https://player.vimeo.com/video/${vi[1]}?autoplay=1` };
  return { type: 'external' };
}

function ExerciseVideo({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  if (!url) return null;
  const embed = parseVideoEmbed(url);

  if (embed.type === 'external') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="mb-3 flex items-center gap-2 rounded-xl border border-[#121212]/18 bg-[#121212]/6 px-3 py-2.5 text-xs font-semibold text-[#121212] transition hover:bg-[#121212]/10">
        <span>▶</span> Ver video de referencia
      </a>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[#D8D8D8]">
      {playing && embed.embedUrl ? (
        <div>
          <div className="relative" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={embed.embedUrl}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <button onClick={() => setPlaying(false)}
            className="flex w-full items-center justify-center py-2 text-[10px] font-bold text-[#9B9B9B] transition hover:text-[#121212]">
            Ocultar
          </button>
        </div>
      ) : (
        <button onClick={() => setPlaying(true)} className="group relative block w-full">
          {embed.thumbUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={embed.thumbUrl}
                alt="Video preview"
                className="h-32 w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition group-hover:bg-black/55">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105">
                  <span className="ml-0.5 text-xl text-black">▶</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#121212]">
              <span>▶</span> Ver video de referencia
            </div>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Athlete card (self-contained with inline recording) ──────────────────────

function AlumnoCard({ alumno, routine, defaultBlock, calTrigger, onCalendarOpen, onSaved }: {
  alumno: Alumno;
  routine: Routine | null;
  defaultBlock: DayBlock | null;
  calTrigger: { block: DayBlock; fecha: string; ts: number } | null;
  onCalendarOpen: () => void;
  onSaved: () => void;
}) {
  const IC = 'w-full rounded-lg border border-[#D8D8D8] bg-[#F8F8F8] px-3 py-2 text-[15px] text-[#121212] placeholder-[#9B9B9B] outline-none focus:border-[#121212] tabular-nums font-medium';
  const today = new Date().toISOString().slice(0, 10);

  const [activeBlock,    setActiveBlock]    = useState<DayBlock | null>(defaultBlock);
  const [isRecording,    setIsRecording]    = useState(false);
  const [fechaReal,      setFechaReal]      = useState(today);
  const [fechaPlaneada,  setFechaPlaneada]  = useState<string | undefined>();
  const [notas,          setNotas]          = useState('');
  const [ejercicios,     setEjercicios]     = useState<SesionEjercicio[]>([]);
  const [notaOpen,       setNotaOpen]       = useState<Set<number>>(new Set());
  const [renameIdx,      setRenameIdx]      = useState<number | null>(null);
  const [renameSearch,   setRenameSearch]   = useState('');
  const [ejLibrary,      setEjLibrary]      = useState<EjBiblioteca[]>([]);
  const lastTsRef = useRef<number>(0);

  useEffect(() => { setEjLibrary(getAllEjercicios()); }, []);

  const initials = `${alumno.nombre?.[0] ?? ''}${alumno.apellido?.[0] ?? ''}`.toUpperCase();
  const hasCalendar = routine && Object.keys(routine.sessions ?? {}).some(
    d => (routine.sessions?.[d]?.exercises?.length ?? 0) > 0
  );

  // Calendar trigger: start recording with loaded block
  useEffect(() => {
    if (calTrigger && calTrigger.ts !== lastTsRef.current) {
      lastTsRef.current = calTrigger.ts;
      setActiveBlock(calTrigger.block);
      setFechaReal(calTrigger.fecha);
      setFechaPlaneada(calTrigger.fecha);
      initRecording(calTrigger.block);
    }
  }, [calTrigger]);

  function initRecording(b: DayBlock) {
    setEjercicios(b.exercises.map(ex => ({
      nombre: ex.name, grupo: '',
      series: Array.from({ length: ex.series }, () => ({
        reps: ex.reps.replace(/[^0-9]/g, '') || '10',
        peso: ex.weight || '',
        completada: false,
      })),
    })));
    setIsRecording(true);
  }

  function startRecording() {
    if (!activeBlock) return;
    initRecording(activeBlock);
  }

  function toggleSerie(ejIdx: number, sIdx: number) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: ej.series.map((s, j) => j !== sIdx ? s : { ...s, completada: !s.completada })
    }));
  }
  function setSerie(ejIdx: number, sIdx: number, field: 'reps' | 'peso', val: string) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: ej.series.map((s, j) => {
        if (j !== sIdx) return s;
        const updated = { ...s, [field]: val };
        if (field === 'peso') updated.completada = val.trim().length > 0;
        return updated;
      }),
    }));
  }
  function addSerie(ejIdx: number) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: [...ej.series, {
        reps: ej.series[ej.series.length - 1]?.reps || '10',
        peso: ej.series[ej.series.length - 1]?.peso || '',
        completada: false,
      }]
    }));
  }
  function removeSerie(ejIdx: number, sIdx: number) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej, series: ej.series.filter((_, j) => j !== sIdx)
    }));
  }

  function toggleNota(ejIdx: number) {
    setNotaOpen(prev => {
      const n = new Set(prev);
      n.has(ejIdx) ? n.delete(ejIdx) : n.add(ejIdx);
      return n;
    });
  }

  function setEjNota(ejIdx: number, nota: string) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : { ...ej, notas: nota }));
  }

  function startRename(ejIdx: number) {
    setRenameSearch('');
    setRenameIdx(ejIdx);
  }

  function selectReplacement(ejIdx: number, newName: string) {
    setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
      ...ej,
      nombre: newName,
      nombreOriginal: ej.nombreOriginal ?? ej.nombre,
    }));
    setRenameIdx(null);
    setRenameSearch('');
  }

  function cancelRename() {
    setRenameIdx(null);
    setRenameSearch('');
  }

  function handleVoiceConfirm(parsed: ParsedExercise) {
    const nameNorm = parsed.exerciseName.toLowerCase().trim();
    let ejIdx = ejercicios.findIndex(ej => ej.nombre.toLowerCase().trim() === nameNorm);
    if (ejIdx === -1) {
      const words = nameNorm.split(/\s+/).filter(w => w.length > 3);
      ejIdx = ejercicios.findIndex(ej => words.some(w => ej.nombre.toLowerCase().includes(w)));
    }
    if (ejIdx >= 0 && parsed.series.length > 0) {
      setEjercicios(prev => prev.map((ej, i) => i !== ejIdx ? ej : {
        ...ej,
        series: parsed.series.map(s => ({ reps: String(s.reps ?? ''), peso: String(s.weight ?? ''), completada: true })),
      }));
    } else if (parsed.exerciseName && parsed.series.length > 0) {
      setEjercicios(prev => [...prev, {
        nombre: parsed.exerciseName, grupo: '',
        series: parsed.series.map(s => ({ reps: String(s.reps ?? ''), peso: String(s.weight ?? ''), completada: true })),
      }]);
    }
    if (parsed.generalNotes) setNotas(n => n ? `${n}\n${parsed.generalNotes}` : parsed.generalNotes);
  }

  function handleSave() {
    if (!routine || !activeBlock) return;
    const sesion: Sesion = {
      id: crypto.randomUUID(),
      alumnoId: alumno.id,
      fecha: fechaReal,
      ...(fechaPlaneada && fechaPlaneada !== fechaReal ? { fechaPlaneada } : {}),
      rutinaId: routine.id,
      rutinaNombre: routine.name,
      bloqueNombre: activeBlock.name,
      notas,
      ejercicios,
    };
    saveSesion(sesion);
    setIsRecording(false);
    setNotas('');
    onSaved();
  }

  const completadas  = ejercicios.reduce((s, ej) => s + ej.series.filter(sr => sr.completada).length, 0);
  const totales      = ejercicios.reduce((s, ej) => s + ej.series.length, 0);
  const pctDone      = totales > 0 ? Math.round((completadas / totales) * 100) : 0;
  const isRescheduled = fechaPlaneada && fechaPlaneada !== fechaReal;

  return (
    <div className="flex h-full flex-col bg-[#F8F8F8]">

      {/* ── Card header ── */}
      <div className="border-b border-[#E0E0E0] px-5 pb-0 pt-4">
        <div className="flex items-center gap-3 pb-3.5">
          {alumno.foto
            ? <img src={alumno.foto} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
            : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#121212]/8 text-base font-black text-[#121212]">{initials}</div>
          }
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black tracking-tight text-[#121212]">
              {alumno.nombre} {alumno.apellido}
            </p>
            <p className="text-[10px] text-[#9B9B9B]">
              {isRecording
                ? `${completadas} / ${totales} series`
                : (activeBlock?.name ?? 'Sin sesión hoy')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!isRecording && activeBlock && routine && (
              <button onClick={startRecording}
                className="flex items-center gap-1.5 rounded-xl border border-[#D8D8D8] px-3 py-1.5 text-xs font-semibold text-[#3E3E3E] transition hover:border-[#121212]/22 hover:bg-[#121212]/8 hover:text-[#121212]">
                <CheckSquare className="h-3.5 w-3.5" /> Registrar
              </button>
            )}
            {!isRecording && hasCalendar && (
              <button onClick={onCalendarOpen}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  !activeBlock
                    ? 'border-[#121212]/22 bg-[#121212]/8 text-[#121212] hover:bg-[#121212]/10'
                    : 'border-[#E0E0E0] text-[#9B9B9B] hover:border-[#D8D8D8] hover:text-[#6E6E6E]'
                }`}>
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
            )}
            {isRecording && (
              <button onClick={() => setIsRecording(false)}
                className="rounded-xl border border-[#E0E0E0] p-1.5 text-[#9B9B9B] transition hover:text-[#121212]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {/* Progress bar (only when recording) */}
        {isRecording && (
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#F0F0F0]">
            <div className="h-full rounded-full bg-[#4A8A5A] transition-all duration-300" style={{ width: `${pctDone}%` }} />
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {isRecording ? (
        /* ── Inline recorder ── */
        <div className="flex-1">
          {/* Fecha */}
          <div className="flex items-center gap-3 border-b border-[#D8D8D8] px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#9B9B9B]">Fecha</span>
            <input type="date" value={fechaReal} onChange={e => setFechaReal(e.target.value)}
              className="rounded-lg border border-[#D8D8D8] bg-[#F8F8F8] px-2.5 py-1 text-xs text-[#121212] outline-none focus:border-[#121212]" />
            {isRescheduled && (
              <span className="text-[9px] text-[#C4783A]/60">
                Reagendada de {new Date(fechaPlaneada! + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>

          {/* Voice recorder */}
          <div className="border-b border-[#D8D8D8] px-4 py-2.5">
            <VoiceWorkoutLogger
              onConfirm={handleVoiceConfirm}
              trigger={
                <button type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl border border-[#D8D8D8] px-3 py-2.5 text-left transition hover:border-[#121212]/18 hover:bg-[#121212]/6">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#121212]/8">
                    <Mic className="h-3.5 w-3.5 text-[#121212]" />
                  </div>
                  <p className="text-xs font-semibold text-[#777777]">Registrar con voz</p>
                </button>
              }
            />
          </div>

          {/* Exercises */}
          <div className="space-y-2.5 p-4">
            {ejercicios.map((ej, ejIdx) => {
              const planEx   = activeBlock?.exercises[ejIdx];
              const videoUrl = getVideoUrlForExercise(planEx?.exerciseLibraryId, ej.nombre);
              const prevMax  = getMaxPeso(alumno.id, ej.nombre);
              const maxHoy   = Math.max(...ej.series.filter(s => s.completada).map(s => parseFloat(s.peso) || 0));
              const repsNum  = parseInt(ej.series[0]?.reps);
              const rm       = maxHoy && repsNum ? calc1RM(maxHoy, repsNum) : null;
              const allDone  = ej.series.length > 0 && ej.series.every(s => s.completada);

              return (
                <div key={ejIdx} className={`rounded-xl border p-4 transition-colors ${allDone ? 'border-[#C8DFC8]/40 bg-[#EBF5EE]' : 'border-[#E0E0E0] bg-[#F0F0F0]'}`}>

                  {/* Header: nombre + acciones */}
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="relative min-w-0 flex-1">
                      {renameIdx === ejIdx ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={renameSearch}
                              onChange={e => setRenameSearch(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') cancelRename(); }}
                              placeholder="Buscar ejercicio..."
                              className="flex-1 rounded-lg border border-[#D8D8D8] bg-[#F8F8F8] px-2.5 py-1.5 text-sm text-[#121212] placeholder-[#BBBBBB] outline-none focus:border-[#121212]"
                            />
                            <button onClick={cancelRename} className="shrink-0 rounded-lg border border-[#E0E0E0] p-1.5 text-[#9B9B9B] transition hover:text-[#121212]">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          {/* Dropdown de ejercicios */}
                          {(() => {
                            const q = renameSearch.toLowerCase();
                            const opts = ejLibrary
                              .filter(e => e.nombre.toLowerCase().includes(q))
                              .slice(0, 8);
                            return opts.length > 0 ? (
                              <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full overflow-hidden rounded-xl border border-[#E8E8E8] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
                                <ul className="max-h-52 overflow-y-auto py-1">
                                  {opts.map(e => (
                                    <li key={e.id}>
                                      <button
                                        onMouseDown={ev => { ev.preventDefault(); selectReplacement(ejIdx, e.nombre); }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[#F5F5F5]"
                                      >
                                        <span className="flex-1 truncate text-[13px] font-medium text-[#121212]">{e.nombre}</span>
                                        {e.grupo && <span className="shrink-0 text-[11px] text-[#9B9B9B]">{e.grupo}</span>}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null;
                          })()}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <p className={`font-bold ${allDone ? 'text-[#4A8A5A]' : 'text-[#121212]'}`}>{ej.nombre}</p>
                          {ej.nombreOriginal && (
                            <span className="text-[10px] text-[#9B9B9B] line-through">{ej.nombreOriginal}</span>
                          )}
                        </div>
                      )}
                      {renameIdx !== ejIdx && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#888888]">
                          {prevMax ? <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-[#121212]" />{prevMax} kg</span> : null}
                          {rm ? <span>1RM ~{rm} kg</span> : null}
                          {planEx?.notes && <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[#777777]">{planEx.notes}</span>}
                        </div>
                      )}
                    </div>

                    {/* Botones: cambiar + nota */}
                    {renameIdx !== ejIdx && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => startRename(ejIdx)}
                          title="Cambiar ejercicio"
                          className="rounded-lg p-1.5 text-[#C4C4C4] transition hover:bg-[#E8E8E8] hover:text-[#3E3E3E]">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleNota(ejIdx)}
                          title="Agregar nota"
                          className={`rounded-lg p-1.5 transition ${notaOpen.has(ejIdx) || ej.notas ? 'text-[#3E3E3E] bg-[#E4E4E4]' : 'text-[#C4C4C4] hover:bg-[#E8E8E8] hover:text-[#3E3E3E]'}`}>
                          <StickyNote className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <ExerciseVideo url={videoUrl} />

                  {/* Series */}
                  <div className="space-y-2">
                    {ej.series.map((serie, sIdx) => (
                      <div key={sIdx} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${serie.completada ? 'bg-[#EBF5EE]' : 'bg-[#F8F8F8]'}`}>
                        <span className={`w-6 shrink-0 text-center text-[11px] font-bold ${serie.completada ? 'text-[#4A8A5A]/40' : 'text-[#D8D8D8]'}`}>{sIdx + 1}</span>
                        <div className="flex flex-1 items-center gap-1.5">
                          <input value={serie.reps} onChange={e => setSerie(ejIdx, sIdx, 'reps', e.target.value)} className={IC} placeholder="reps" inputMode="numeric" />
                          <span className="shrink-0 text-[11px] text-[#D8D8D8]">×</span>
                          <input value={serie.peso} onChange={e => setSerie(ejIdx, sIdx, 'peso', e.target.value)} className={IC} placeholder="kg" inputMode="decimal" />
                        </div>
                        <button onClick={() => toggleSerie(ejIdx, sIdx)}
                          className={`min-w-[44px] shrink-0 rounded-xl border py-2 text-[13px] font-bold transition ${serie.completada ? 'border-[#4A8A5A]/25 bg-[#EBF5EE] text-[#4A8A5A]' : 'border-[#E0E0E0] text-[#9B9B9B] hover:border-[#D8D8D8] hover:text-[#777777]'}`}>
                          {serie.completada ? '✓' : '·'}
                        </button>
                        {ej.series.length > 1 && (
                          <button onClick={() => removeSerie(ejIdx, sIdx)} className="shrink-0 rounded-lg p-1.5 text-[#E0E0E0] transition hover:text-[#B44040]">
                            <Minus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button onClick={() => addSerie(ejIdx)} className="mt-2 flex items-center gap-1 text-[11px] text-[#9B9B9B] transition hover:text-[#121212]">
                    <Plus className="h-3 w-3" /> Serie
                  </button>

                  {/* Nota del ejercicio */}
                  {(notaOpen.has(ejIdx) || ej.notas) && (
                    <div className="mt-3">
                      <textarea
                        value={ej.notas ?? ''}
                        onChange={e => setEjNota(ejIdx, e.target.value)}
                        rows={2}
                        autoFocus={notaOpen.has(ejIdx) && !ej.notas}
                        placeholder="Nota de este ejercicio... (ej: bajé peso por fatiga)"
                        className="w-full resize-none rounded-lg border border-[#D8D8D8] bg-[#F8F8F8] px-3 py-2 text-[12px] text-[#121212] placeholder-[#BBBBBB] outline-none focus:border-[#9B9B9B]"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-[#9B9B9B]">Notas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Observaciones..."
                className="w-full resize-none rounded-xl border border-[#D8D8D8] bg-[#F8F8F8] px-3 py-2.5 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none focus:border-[#121212]" />
            </div>

            <button onClick={handleSave}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] py-3 text-sm font-bold text-white transition hover:brightness-110">
              <Save className="h-4 w-4" /> Guardar sesión
            </button>
          </div>
        </div>
      ) : (
        /* ── Exercise preview ── */
        <div className="p-5">
          {!activeBlock ? (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0F0F0]">
                <CalendarDays className="h-5 w-5 text-[#D8D8D8]" />
              </div>
              {hasCalendar ? (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-[#9B9B9B]">Sin sesión para hoy</p>
                  <button onClick={onCalendarOpen}
                    className="flex items-center gap-1.5 rounded-xl border border-[#121212]/22 bg-[#121212]/8 px-3.5 py-2 text-xs font-semibold text-[#121212] transition hover:bg-[#121212]/10">
                    <CalendarDays className="h-3.5 w-3.5" /> Ver calendario
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#9B9B9B]">Sin rutina asignada</p>
              )}
            </div>
          ) : activeBlock.exercises.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9B9B9B]">Bloque sin ejercicios</p>
          ) : (
            <div className="space-y-2.5">
              {activeBlock.exercises.map((ex, i) => (
                <div key={ex.id} className="relative overflow-hidden rounded-xl border border-[#E0E0E0] bg-[#F0F0F0] px-5 py-4">
                  <div className="absolute left-0 top-0 h-full w-[3px] bg-[#121212]/22" />
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-xs font-bold text-[#D8D8D8]">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-base font-bold text-[#121212]">{ex.name}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { val: String(ex.series), label: 'series' },
                      { val: ex.reps,           label: 'reps'   },
                      ...(ex.rest ? [{ val: ex.rest, label: 'descanso' }] : []),
                    ].map(({ val, label }) => (
                      <div key={label} className="flex min-w-[52px] flex-col items-center rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2">
                        <span className="text-lg font-black leading-none text-[#121212] tabular-nums">{val}</span>
                        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeightroomPage() {
  const [alumnos, setAlumnos]     = useState<Alumno[]>([]);
  const [routines, setRoutines]   = useState<Routine[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [calPickerFor, setCalPickerFor] = useState<Alumno | null>(null);
  const [calTriggers, setCalTriggers]   = useState<Record<string, { block: DayBlock; fecha: string; ts: number } | null>>({});
  const [savedCount, setSavedCount] = useState(0);
  const [searchQ, setSearchQ]   = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const a = localStorage.getItem('nexa_alumnos');  if (a) setAlumnos(JSON.parse(a));  } catch {}
    try { const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r)); } catch {}
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function getAlumnoRoutine(alumnoId: string): Routine | null {
    return routines.find(r =>
      r.alumnoId === alumnoId ||
      (r.alumnoIds ?? []).includes(alumnoId)
    ) ?? null;
  }

  const visibles    = alumnos.filter(a => selected.has(a.id));
  const filtered    = alumnos.filter(a =>
    `${a.nombre} ${a.apellido}`.toLowerCase().includes(searchQ.toLowerCase())
  );
  const todayStr    = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const selectedArr = alumnos.filter(a => selected.has(a.id));

  return (
    <div className="flex flex-col bg-[#F8F8F8]">

      {/* ── Selector bar ── */}
      <div className="border-b border-[#E8E8E8] bg-[#F8F8F8] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">

          {/* Search + dropdown */}
          <div ref={searchRef} className="relative">
            <div className="flex items-center gap-2 rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] px-3 py-2 transition focus-within:border-[#9B9B9B]">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#9B9B9B]" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onFocus={() => setDropOpen(true)}
                placeholder="Buscar atleta..."
                className="w-36 bg-transparent text-[13px] text-[#121212] placeholder-[#BBBBBB] outline-none sm:w-48"
              />
              {searchQ && (
                <button onClick={() => setSearchQ('')} className="shrink-0 text-[#BBBBBB] hover:text-[#9B9B9B]">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Dropdown list */}
            {dropOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-56 overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#FFFFFF] shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                {alumnos.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] text-[#9B9B9B]">
                    Sin alumnos —{' '}
                    <a href="/alumnos" className="text-[#121212] underline">agregar</a>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] text-[#9B9B9B]">Sin resultados</div>
                ) : (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {filtered.map(a => {
                      const on = selected.has(a.id);
                      const initials = `${a.nombre?.[0] ?? ''}${a.apellido?.[0] ?? ''}`.toUpperCase();
                      return (
                        <li key={a.id}>
                          <button
                            onMouseDown={e => { e.preventDefault(); toggle(a.id); }}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#F5F5F5]"
                          >
                            {a.foto
                              ? <img src={a.foto} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                              : <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EBEBEB] text-[11px] font-black text-[#3E3E3E]">
                                  {initials}
                                </div>
                            }
                            <span className={`flex-1 truncate text-[13px] font-medium ${on ? 'text-[#121212]' : 'text-[#3E3E3E]'}`}>
                              {a.nombre} {a.apellido}
                            </span>
                            {on && <Check className="h-3.5 w-3.5 shrink-0 text-[#121212]" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Selected chips */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {selectedArr.map(a => (
              <button key={a.id} onClick={() => toggle(a.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#D8D8D8] bg-[#EBEBEB] px-2.5 py-1 text-[12px] font-medium text-[#121212] transition hover:border-[#9B9B9B]">
                {a.foto
                  ? <img src={a.foto} alt="" className="h-4 w-4 rounded-md object-cover" />
                  : <span className="text-[10px] font-black">{a.nombre[0]?.toUpperCase()}</span>
                }
                {a.nombre}
                <X className="h-2.5 w-2.5 text-[#9B9B9B]" />
              </button>
            ))}
          </div>

          {/* Right: date + saved */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden text-[11px] capitalize text-[#C4C4C4] lg:block">{todayStr}</span>
            {savedCount > 0 && (
              <span className="rounded-full border border-[#4A8A5A]/25 bg-[#EBF5EE] px-3 py-1 text-[11px] font-semibold text-[#4A8A5A]">
                {savedCount} guardada{savedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Cards area ── */}
      <div className="overflow-hidden h-[calc(100vh-57px-64px)] lg:h-[calc(100vh-57px)]">
        {visibles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E8E8E8] bg-[#F0F0F0]">
              <CheckSquare className="h-6 w-6 text-[#D8D8D8]" />
            </div>
            <p className="text-[13px] text-[#9B9B9B]">Selecciona un atleta arriba para ver su entrenamiento</p>
          </div>
        ) : (
          <div
            className="grid h-full"
            style={{ gridTemplateColumns: `repeat(${visibles.length}, 1fr)` }}
          >
            {visibles.map((a, idx) => {
              const routine = getAlumnoRoutine(a.id);
              const defaultBlock = routine ? getActiveBlock(routine) : null;
              return (
                <div
                  key={a.id}
                  className={`h-full overflow-y-auto ${idx < visibles.length - 1 ? 'border-r border-[#E8E8E8]' : ''}`}
                >
                  <AlumnoCard
                    alumno={a}
                    routine={routine}
                    defaultBlock={defaultBlock}
                    calTrigger={calTriggers[a.id] ?? null}
                    onCalendarOpen={() => setCalPickerFor(a)}
                    onSaved={() => setSavedCount(c => c + 1)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Calendar picker modal ── */}
      {calPickerFor && (() => {
        const routine = getAlumnoRoutine(calPickerFor.id);
        if (!routine) return null;
        const alumnoId = calPickerFor.id;
        return (
          <WeightroomCalendarModal
            alumno={calPickerFor}
            routine={routine}
            onLoad={(block, fecha) => {
              setCalTriggers(prev => ({
                ...prev,
                [alumnoId]: { block, fecha, ts: Date.now() },
              }));
              setCalPickerFor(null);
            }}
            onClose={() => setCalPickerFor(null)}
          />
        );
      })()}
    </div>
  );
}
