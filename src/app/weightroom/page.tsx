'use client';

import { useState, useEffect } from 'react';
import { X, Save, Plus, Minus, CheckSquare, Mic, Trophy, CalendarDays, ArrowLeft } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { saveSesion, getMaxPeso, type Sesion, type SesionEjercicio, type SesionSerie } from '@/lib/sesiones';
import { calc1RM } from '@/lib/mevmrv';
import { getVideoUrlForExercise } from '@/lib/ejercicios';
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

const MUSCLE_HEX: Record<string, string> = {
  Pecho:   '#D4AF37', Espalda: '#8b5cf6', Piernas: '#3b82f6',
  Glúteos: '#14b8a6', Hombros: '#06b6d4', Bíceps:  '#22c55e',
  Tríceps: '#10b981', Core:    '#ec4899', Cardio:  '#ef4444',
};

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
        className="mb-3 flex items-center gap-2 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-2.5 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/10">
        <span>▶</span> Ver video de referencia
      </a>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[#1e1e1e]">
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
            className="flex w-full items-center justify-center py-2 text-[10px] font-bold text-[#333333] transition hover:text-white">
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
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#D4AF37]">
              <span>▶</span> Ver video de referencia
            </div>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Session modal ────────────────────────────────────────────────────────────

interface SessionModalProps {
  alumno: Alumno; routine: Routine; block: DayBlock;
  fechaPlaneada?: string;
  fechaReal?: string;
  onClose: () => void; onSaved: () => void;
}

function SessionModal({ alumno, routine, block, fechaPlaneada, fechaReal: fechaRealProp, onClose, onSaved }: SessionModalProps) {
  const IC = 'w-full rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2 text-[15px] text-[#f4f4f5] placeholder-[#2a2a2a] outline-none focus:border-[#333333] tabular-nums font-medium';

  const today = new Date().toISOString().slice(0, 10);
  const [fechaReal, setFechaReal] = useState(fechaRealProp ?? today);
  const [notas, setNotas]         = useState('');
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

  function handleVoiceConfirm(parsed: ParsedExercise) {
    const nameNorm = parsed.exerciseName.toLowerCase().trim();
    let ejIdx = ejercicios.findIndex(ej => ej.nombre.toLowerCase().trim() === nameNorm);
    if (ejIdx === -1) {
      const words = nameNorm.split(/\s+/).filter(w => w.length > 3);
      ejIdx = ejercicios.findIndex(ej => {
        const ejNorm = ej.nombre.toLowerCase();
        return words.some(w => ejNorm.includes(w));
      });
    }
    if (ejIdx >= 0 && parsed.series.length > 0) {
      setEjercicios(prev => prev.map((ej, i) => {
        if (i !== ejIdx) return ej;
        return {
          ...ej,
          series: parsed.series.map(s => ({
            reps: String(s.reps ?? ''), peso: String(s.weight ?? ''), completada: true,
          })),
        };
      }));
    } else if (parsed.exerciseName && parsed.series.length > 0) {
      setEjercicios(prev => [...prev, {
        nombre: parsed.exerciseName, grupo: '',
        series: parsed.series.map(s => ({
          reps: String(s.reps ?? ''), peso: String(s.weight ?? ''), completada: true,
        })),
      }]);
    }
    if (parsed.generalNotes) setNotas(n => n ? `${n}\n${parsed.generalNotes}` : parsed.generalNotes);
  }

  function handleSave() {
    const sesion: Sesion = {
      id: crypto.randomUUID(),
      alumnoId: alumno.id,
      fecha: fechaReal,
      ...(fechaPlaneada && fechaPlaneada !== fechaReal ? { fechaPlaneada } : {}),
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

  const completadas = ejercicios.reduce((s, ej) => s + ej.series.filter(sr => sr.completada).length, 0);
  const totales     = ejercicios.reduce((s, ej) => s + ej.series.length, 0);
  const isRescheduled = fechaPlaneada && fechaPlaneada !== fechaReal;
  const pctDone = totales > 0 ? Math.round((completadas / totales) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-3 pt-6 backdrop-blur-sm sm:p-4 sm:pt-8">
      <div className="w-full max-w-lg rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] shadow-2xl">

        {/* ── Header ── */}
        <div className="border-b border-[#111111] px-5 pb-0 pt-4">
          <div className="flex items-start justify-between gap-3 pb-3.5">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[#f4f4f5]">
                {alumno.nombre}
                <span className="mx-1.5 text-[#1e1e1e]">·</span>
                <span className="text-[#555555]">{block.name}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-[#3d3d3d]">
                  {completadas} / {totales} series
                </span>
                {isRescheduled && (
                  <span className="rounded-full border border-[#78350f]/30 bg-[#451a03]/20 px-2 py-0.5 text-[10px] text-[#fbbf24]/70">
                    Reagendada de {new Date(fechaPlaneada! + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose}
              className="shrink-0 rounded-xl border border-[#1a1a1a] p-2 text-[#3a3a3a] transition hover:border-[#252525] hover:text-[#888888]">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#111111]">
            <div
              className="h-full rounded-full bg-[#22c55e] transition-all duration-300"
              style={{ width: `${pctDone}%` }}
            />
          </div>
        </div>

        {/* ── Fecha real ── */}
        <div className="flex items-center gap-3 border-b border-[#1e1e1e] px-5 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#2a2a2a]">Fecha</span>
          <input type="date" value={fechaReal} onChange={e => setFechaReal(e.target.value)}
            className="rounded-xl border border-[#1e1e1e] bg-[#111111] px-3 py-1.5 text-xs text-white outline-none focus:border-[#333333]" />
          {isRescheduled && fechaReal !== fechaRealProp && (
            <button onClick={() => setFechaReal(fechaRealProp ?? today)}
              className="text-[10px] text-[#333333] transition hover:text-white">
              Restaurar
            </button>
          )}
        </div>

        {/* ── Voice recorder ── */}
        <div className="border-b border-[#1e1e1e] px-4 py-3">
          <VoiceWorkoutLogger
            onConfirm={handleVoiceConfirm}
            trigger={
              <button type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-[#1e1e1e] px-4 py-3 text-left transition hover:border-[#D4AF37]/20 hover:bg-[#D4AF37]/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10">
                  <Mic className="h-4 w-4 text-[#D4AF37]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#777777]">Registrar con voz</p>
                  <p className="truncate text-[10px] text-[#2e2e2e]">
                    "Press banca, primera serie 8 reps con 40 kilos..."
                  </p>
                </div>
              </button>
            }
          />
        </div>

        {/* ── Exercise list ── */}
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="space-y-2.5 p-4">
            {ejercicios.map((ej, ejIdx) => {
              const planEx  = block.exercises[ejIdx];
              const videoUrl = getVideoUrlForExercise(planEx?.exerciseLibraryId, ej.nombre);
              const prevMax = getMaxPeso(alumno.id, ej.nombre);
              const maxHoy  = Math.max(...ej.series.filter(s => s.completada).map(s => parseFloat(s.peso) || 0));
              const repsNum = parseInt(ej.series[0]?.reps);
              const rm      = maxHoy && repsNum ? calc1RM(maxHoy, repsNum) : null;
              const allDone = ej.series.length > 0 && ej.series.every(s => s.completada);

              return (
                <div key={ejIdx}
                  className={`rounded-xl border p-4 transition-colors ${
                    allDone ? 'border-emerald-900/25 bg-emerald-950/10' : 'border-[#1a1a1a] bg-[#111111]'
                  }`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`truncate font-bold ${allDone ? 'text-emerald-400' : 'text-white'}`}>{ej.nombre}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#444444]">
                        {prevMax ? (
                          <span className="flex items-center gap-1">
                            <Trophy className="h-3 w-3 text-[#D4AF37]" /> {prevMax} kg
                          </span>
                        ) : null}
                        {rm ? <span>1RM ~{rm} kg</span> : null}
                        {planEx?.notes && (
                          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[#555555]">{planEx.notes}</span>
                        )}
                      </div>
                    </div>
                    {ej.grupo && (
                      <span className="shrink-0 rounded-lg border border-[#1e1e1e] px-2 py-0.5 text-[10px] text-[#333333]">
                        {ej.grupo}
                      </span>
                    )}
                  </div>

                  <ExerciseVideo url={videoUrl} />

                  <div className="space-y-2">
                    {ej.series.map((serie, sIdx) => (
                      <div key={sIdx}
                        className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${
                          serie.completada ? 'bg-[#052e16]/20' : 'bg-[#0a0a0a]'
                        }`}>
                        <span className={`w-6 shrink-0 text-center text-[11px] font-bold ${
                          serie.completada ? 'text-[#22c55e]/40' : 'text-[#222222]'
                        }`}>{sIdx + 1}</span>
                        <div className="flex flex-1 items-center gap-1.5">
                          <input
                            value={serie.reps}
                            onChange={e => setSerie(ejIdx, sIdx, 'reps', e.target.value)}
                            className={IC}
                            placeholder="reps"
                            inputMode="numeric"
                          />
                          <span className="shrink-0 text-[11px] text-[#1e1e1e]">×</span>
                          <input
                            value={serie.peso}
                            onChange={e => setSerie(ejIdx, sIdx, 'peso', e.target.value)}
                            className={IC}
                            placeholder="kg"
                            inputMode="decimal"
                          />
                        </div>
                        <button onClick={() => toggleSerie(ejIdx, sIdx)}
                          className={`min-w-[44px] shrink-0 rounded-xl border py-2 text-[13px] font-bold transition ${
                            serie.completada
                              ? 'border-[#14532d]/40 bg-[#052e16]/30 text-[#22c55e]'
                              : 'border-[#1a1a1a] text-[#2a2a2a] hover:border-[#252525] hover:text-[#555555]'
                          }`}>
                          {serie.completada ? '✓' : '·'}
                        </button>
                        {ej.series.length > 1 && (
                          <button onClick={() => removeSerie(ejIdx, sIdx)}
                            className="shrink-0 rounded-lg p-1.5 text-[#1a1a1a] transition hover:text-[#ef4444]">
                            <Minus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button onClick={() => addSerie(ejIdx)}
                    className="mt-2 flex items-center gap-1 text-[11px] text-[#2a2a2a] transition hover:text-[#D4AF37]">
                    <Plus className="h-3 w-3" /> Serie
                  </button>
                </div>
              );
            })}

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-[#2a2a2a]">
                Notas de sesión
              </label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Observaciones, cómo se sintió el atleta..."
                className="w-full resize-none rounded-xl border border-[#1e1e1e] bg-[#111111] px-3 py-2.5 text-sm text-white placeholder-[#2a2a2a] outline-none focus:border-[#2a2a2a]" />
            </div>

            <button onClick={handleSave}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-3 text-sm font-bold text-black transition hover:brightness-110">
              <Save className="h-4 w-4" /> Guardar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Athlete card ─────────────────────────────────────────────────────────────

function AlumnoCard({ alumno, routine, block, onLog, onCalendarLoad }: {
  alumno: Alumno; routine: Routine | null; block: DayBlock | null;
  onLog: () => void; onCalendarLoad: () => void;
}) {
  const initials = `${alumno.nombre?.[0] ?? ''}${alumno.apellido?.[0] ?? ''}`.toUpperCase();
  const hasCalendar = routine && Object.keys(routine.sessions ?? {}).some(
    d => (routine.sessions?.[d]?.exercises?.length ?? 0) > 0
  );

  return (
    <div className="flex min-w-[340px] flex-1 flex-col rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d]">

      {/* Card header */}
      <div className="flex items-center gap-4 border-b border-[#1a1a1a] px-6 py-5">
        {alumno.foto
          ? <img src={alumno.foto} alt="" className="h-12 w-12 rounded-xl object-cover" />
          : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-lg font-black text-[#D4AF37]">
              {initials}
            </div>
          )}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black tracking-tight text-white">
            {alumno.nombre} {alumno.apellido}
          </p>
          {block ? (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#444444]">{block.name}</p>
          ) : (
            <p className="mt-0.5 text-[10px] text-[#2a2a2a]">Sin sesión hoy</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {block && routine && (
            <button onClick={onLog}
              className="flex items-center gap-1.5 rounded-xl border border-[#1e1e1e] px-3 py-2 text-xs font-semibold text-[#444444] transition hover:border-[#D4AF37]/25 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]">
              <CheckSquare className="h-3.5 w-3.5" /> Registrar
            </button>
          )}
          {hasCalendar && (
            <button onClick={onCalendarLoad}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                !block
                  ? 'border-[#D4AF37]/30 bg-[#D4AF37]/5 text-[#D4AF37] hover:bg-[#D4AF37]/10'
                  : 'border-[#1a1a1a] text-[#333333] hover:border-[#1e1e1e] hover:text-[#666666]'
              }`}>
              <CalendarDays className="h-3.5 w-3.5" />
              Calendario
            </button>
          )}
        </div>
      </div>

      {/* Exercise preview */}
      <div className="flex-1 p-5">
        {!block ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111111]">
              <CalendarDays className="h-5 w-5 text-[#1e1e1e]" />
            </div>
            {hasCalendar ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-[#333333]">Sin sesión para hoy</p>
                <button onClick={onCalendarLoad}
                  className="flex items-center gap-1.5 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3.5 py-2 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/10">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ver calendario
                </button>
              </div>
            ) : (
              <p className="text-sm text-[#333333]">Sin rutina asignada</p>
            )}
          </div>
        ) : block.exercises.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#333333]">Bloque sin ejercicios</p>
        ) : (
          <div className="space-y-2.5">
            {block.exercises.map((ex, i) => {
              const mColor = MUSCLE_HEX[ex.muscle] ?? '#666666';
              return (
                <div key={ex.id}
                  className="relative overflow-hidden rounded-xl border border-[#1a1a1a] bg-[#111111] px-5 py-4">
                  <div className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: mColor, opacity: 0.8 }} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-xs font-bold text-[#1e1e1e]">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-lg font-bold text-white">{ex.name}</span>
                    </div>
                    <span className="mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase"
                      style={{ color: mColor, backgroundColor: mColor + '18' }}>
                      {ex.muscle}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { val: String(ex.series), label: 'series' },
                      { val: ex.reps,           label: 'reps'   },
                      ...(ex.weight ? [{ val: ex.weight, label: 'peso' }]    : []),
                      ...(ex.rest   ? [{ val: ex.rest,   label: 'descanso' }] : []),
                    ].map(({ val, label }) => (
                      <div key={label}
                        className="flex min-w-[56px] flex-col items-center rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3.5 py-2.5">
                        <span className="text-xl font-black leading-none text-white tabular-nums">{val}</span>
                        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#333333]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
  const [sessionFor,  setSessionFor]  = useState<{
    alumno: Alumno; routine: Routine; block: DayBlock;
    fechaPlaneada?: string; fechaReal?: string;
  } | null>(null);
  const [calPickerFor, setCalPickerFor] = useState<Alumno | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    try { const a = localStorage.getItem('nexa_alumnos');  if (a) setAlumnos(JSON.parse(a));  } catch {}
    try { const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r)); } catch {}
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

  function getRoutineAndBlock(alumnoId: string): { routine: Routine; block: DayBlock } | null {
    const r = getAlumnoRoutine(alumnoId);
    if (!r) return null;
    const b = getActiveBlock(r);
    if (!b) return null;
    return { routine: r, block: b };
  }

  const visibles = alumnos.filter(a => selected.has(a.id));
  const today    = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex min-h-screen flex-col bg-[#080808]">

      {/* ── Selector bar ── */}
      <div className="border-b border-[#111111] bg-[#080808] px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#222222]">
            En sala
          </span>
          <span className="text-[#1e1e1e]">·</span>

          {alumnos.length === 0 ? (
            <span className="text-[13px] text-[#2e2e2e]">
              Sin alumnos —{' '}
              <a href="/alumnos" className="text-[#D4AF37] hover:underline">agregar</a>
            </span>
          ) : (
            alumnos.map(a => {
              const on = selected.has(a.id);
              return (
                <button key={a.id} onClick={() => toggle(a.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-all ${
                    on
                      ? 'border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#D4AF37]'
                      : 'border-[#141414] text-[#3a3a3a] hover:border-[#1e1e1e] hover:text-[#666666]'
                  }`}>
                  {a.foto
                    ? <img src={a.foto} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
                    : <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${
                        on ? 'bg-[#D4AF37]/15 text-[#D4AF37]' : 'bg-[#111111] text-[#2a2a2a]'
                      }`}>
                        {a.nombre[0]?.toUpperCase()}
                      </span>
                  }
                  {a.nombre}
                </button>
              );
            })
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[11px] capitalize text-[#222222] sm:block">{today}</span>
            {savedCount > 0 && (
              <span className="rounded-full border border-[#14532d]/40 bg-[#052e16]/30 px-3 py-1 text-[11px] font-semibold text-[#4ade80]">
                {savedCount} guardada{savedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Cards area ── */}
      <div className="flex-1 overflow-x-auto px-4 py-5 sm:px-6">
        {visibles.length === 0 ? (
          <div className="flex h-full min-h-[480px] flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#111111] bg-[#0d0d0d]">
              <CheckSquare className="h-6 w-6 text-[#1e1e1e]" />
            </div>
            <p className="text-[13px] text-[#2a2a2a]">Selecciona un atleta arriba para ver su entrenamiento</p>
          </div>
        ) : (
          <div className="flex gap-4" style={{ minWidth: `${visibles.length * 356}px` }}>
            {visibles.map(a => {
              const res = getRoutineAndBlock(a.id);
              const routine = getAlumnoRoutine(a.id);
              return (
                <AlumnoCard
                  key={a.id}
                  alumno={a}
                  routine={routine}
                  block={res?.block ?? null}
                  onLog={() => res && setSessionFor({
                    alumno: a, routine: res.routine, block: res.block,
                    fechaReal: new Date().toISOString().slice(0, 10),
                  })}
                  onCalendarLoad={() => setCalPickerFor(a)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Calendar modal ── */}
      {calPickerFor && (() => {
        const routine = getAlumnoRoutine(calPickerFor.id);
        if (!routine) return null;
        return (
          <WeightroomCalendarModal
            alumno={calPickerFor}
            routine={routine}
            onLoad={(block, fecha) => {
              setSessionFor({ alumno: calPickerFor, routine, block, fechaPlaneada: fecha, fechaReal: fecha });
              setCalPickerFor(null);
            }}
            onClose={() => setCalPickerFor(null)}
          />
        );
      })()}

      {/* ── Session modal ── */}
      {sessionFor && (
        <SessionModal
          alumno={sessionFor.alumno}
          routine={sessionFor.routine}
          block={sessionFor.block}
          fechaPlaneada={sessionFor.fechaPlaneada}
          fechaReal={sessionFor.fechaReal}
          onClose={() => setSessionFor(null)}
          onSaved={() => setSavedCount(c => c + 1)}
        />
      )}
    </div>
  );
}
