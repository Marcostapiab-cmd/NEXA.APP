'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, CalendarDays, CheckSquare } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import {
  getSesionPorFecha, getEstadoDia, getEstadoEjercicio,
  type EstadoSesion, type Sesion,
} from '@/lib/sesiones';

interface Exercise { id: string; name: string; muscle: string; series: number; reps: string; weight?: string; rest: string; tempo?: string; notes?: string; exerciseLibraryId?: string; }
interface DayBlock  { id: string; name: string; exercises: Exercise[]; }
interface CalSession { name: string; exercises: Exercise[]; }
interface Routine {
  id: string; name: string;
  sessions?: Record<string, CalSession>;
  startDate: string; endDate: string; alumnoIds: string[];
}

const DOW    = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ESTADO_DOT: Record<EstadoSesion, string> = {
  completado: '#4A8A5A', en_progreso: '#eab308', incompleto: '#B44040', pendiente: '#9B9B9B',
};
const ESTADO_LABEL: Record<EstadoSesion, string> = {
  completado: 'Completado', en_progreso: 'En progreso', incompleto: 'Incompleto', pendiente: 'Pendiente',
};

interface Props {
  alumno: Alumno;
  routine: Routine;
  onLoad: (block: DayBlock, fecha: string) => void;
  onClose: () => void;
}

export default function WeightroomCalendarModal({ alumno, routine, onLoad, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [cursor, setCursor]     = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<string | null>(today);

  const year        = cursor.getFullYear();
  const month       = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset      = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();

  function fechaStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function sessionFor(fecha: string): CalSession | null {
    const s = routine.sessions?.[fecha];
    return s && s.exercises.length > 0 ? s : null;
  }

  const selectedSession: CalSession | null = selected ? sessionFor(selected) : null;
  const selectedSesion: Sesion | null       = selected ? getSesionPorFecha(alumno.id, selected) : null;
  const selectedEstado: EstadoSesion | null = selected ? getEstadoDia(alumno.id, selected, !!selectedSession) : null;

  function handleLoad() {
    if (!selected || !selectedSession) return;
    onLoad({ id: selected, name: selectedSession.name || selected, exercises: selectedSession.exercises }, selected);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#DEDEDE] bg-[#F5F5F5] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#DEDEDE] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">Calendario de entrenamiento</p>
            <p className="mt-0.5 text-xs text-[#888888]">
              {alumno.nombre}{alumno.apellido ? ` ${alumno.apellido}` : ''}
            </p>
          </div>
          <button onClick={onClose}
            className="rounded-xl border border-[#DEDEDE] p-2 text-[#888888] transition hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold capitalize text-[#121212]">{MONTHS[month]} {year}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setCursor(new Date(year, month - 1, 1))}
                className="rounded-lg p-1.5 text-[#777777] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[#777777] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
                Hoy
              </button>
              <button onClick={() => setCursor(new Date(year, month + 1, 1))}
                className="rounded-lg p-1.5 text-[#777777] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7">
            {DOW.map(d => (
              <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-[#9B9B9B]">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day    = i + 1;
              const fecha  = fechaStr(day);
              const sess   = sessionFor(fecha);
              const estado = getEstadoDia(alumno.id, fecha, !!sess);
              const isToday = fecha === today;
              const isSel   = fecha === selected;

              return (
                <button key={day} onClick={() => setSelected(fecha)}
                  className={`relative flex min-h-[40px] flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] transition ${
                    isSel
                      ? 'bg-[#121212]/8 font-bold text-[#121212] ring-1 ring-[#121212]/18'
                      : isToday
                      ? 'bg-[#E4E4E4] font-semibold text-[#121212] ring-1 ring-[#D8D8D8]'
                      : 'text-[#6E6E6E] hover:bg-[#EBEBEB] hover:text-[#121212]'
                  }`}>
                  <span>{day}</span>
                  {estado && (
                    <span className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isSel ? 'rgba(18,18,18,0.35)' : ESTADO_DOT[estado] }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#DEDEDE] pt-3 text-[10px] text-[#888888]">
            {(['completado', 'en_progreso', 'incompleto', 'pendiente'] as EstadoSesion[]).map(e => (
              <span key={e} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ESTADO_DOT[e] }} />
                {ESTADO_LABEL[e]}
              </span>
            ))}
          </div>

          {/* Selected day detail */}
          {selected && (
            <div className="rounded-xl border border-[#DEDEDE] bg-[#F0F0F0] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold capitalize text-[#121212]">
                  {new Date(selected + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                {selectedEstado && (
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ color: ESTADO_DOT[selectedEstado], backgroundColor: ESTADO_DOT[selectedEstado] + '18' }}>
                    {ESTADO_LABEL[selectedEstado]}
                  </span>
                )}
              </div>

              {!selectedSession ? (
                <div className="mt-4 flex flex-col items-center gap-2 py-4 text-center">
                  <CalendarDays className="h-6 w-6 text-[#DEDEDE]" />
                  <p className="text-sm text-[#9B9B9B]">No hay rutina asignada para este día</p>
                </div>
              ) : (
                <>
                  <div className="mt-3 space-y-1.5">
                    {selectedSession.exercises.map(ex => {
                      const sesEj = selectedSesion?.ejercicios.find(e => e.nombre.toLowerCase() === ex.name.toLowerCase());
                      const estadoEj: EstadoSesion = sesEj
                        ? getEstadoEjercicio(sesEj, selectedEstado ?? 'pendiente')
                        : (selectedEstado === 'incompleto' ? 'incompleto' : 'pendiente');
                      return (
                        <div key={ex.id} className="flex items-center gap-2.5 rounded-lg bg-[#F8F8F8] px-3 py-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ESTADO_DOT[estadoEj] }} />
                          <span className="flex-1 truncate text-[13px] text-[#3E3E3E]">{ex.name}</span>
                          <span className="shrink-0 text-[10px] text-[#888888]">{ex.series} × {ex.reps}</span>
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={handleLoad}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:bg-[#3E3E3E]">
                    <CheckSquare className="h-4 w-4" />
                    Cargar rutina de este día
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
