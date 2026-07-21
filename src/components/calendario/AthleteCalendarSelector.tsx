'use client';

import { useState } from 'react';
import { Search, X, Check, ChevronRight, Calendar } from 'lucide-react';
import { getMuscleGroups, MUSCLE_HEX, type Alumno, type Routine } from './types';

interface Props {
  alumnos: Alumno[];
  routines: Routine[];
  selectedAlumnoId: string | null;
  onSelect: (alumno: Alumno, routine: Routine | null) => void;
  onClose: () => void;
}

export default function AthleteCalendarSelector({ alumnos, routines, selectedAlumnoId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');

  const filtered = alumnos.filter(a =>
    `${a.nombre} ${a.apellido ?? ''} ${a.email ?? ''}`.toLowerCase().includes(query.toLowerCase())
  );

  function getAlumnoRoutines(alumnoId: string): Routine[] {
    return routines.filter(r => (r.alumnoIds ?? []).includes(alumnoId));
  }

  function handleSelect(alumno: Alumno) {
    const alumnoRoutines = getAlumnoRoutines(alumno.id);
    onSelect(alumno, alumnoRoutines[0] ?? null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#C8C8C8] bg-[#EBEBEB] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#C8C8C8] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">Seleccionar calendario</p>
            <p className="mt-0.5 text-xs text-[#777777]">{alumnos.length} alumno{alumnos.length !== 1 ? 's' : ''} registrados</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#C8C8C8] p-2 text-[#777777] transition hover:border-[#888888] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-[#DEDEDE] p-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888888]" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar alumno..."
              className="w-full rounded-xl border border-[#C8C8C8] bg-[#F8F8F8] py-2.5 pl-10 pr-4 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#888888]"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-[#DEDEDE]">
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[#777777]">
                {alumnos.length === 0
                  ? 'Aún no hay alumnos registrados'
                  : 'Sin resultados para tu búsqueda'}
              </p>
            </div>
          ) : (
            filtered.map(alumno => {
              const alumnoRoutines = getAlumnoRoutines(alumno.id);
              const activeRoutine  = alumnoRoutines[0];
              const isSelected     = alumno.id === selectedAlumnoId;
              const sessionCount   = activeRoutine ? Object.keys(activeRoutine.sessions ?? {}).length : 0;
              const muscles        = activeRoutine
                ? [...new Set(Object.values(activeRoutine.sessions).flatMap(s => getMuscleGroups(s.exercises)))]
                : [];

              return (
                <button
                  key={alumno.id}
                  onClick={() => handleSelect(alumno)}
                  className={`flex w-full items-center gap-3 px-5 py-4 text-left transition ${
                    isSelected ? 'bg-black/[0.03]' : 'hover:bg-[#E4E4E4]'
                  }`}
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E4E4E4] text-sm font-bold text-[#5E5E5E]">
                    {alumno.foto
                      ? <img src={alumno.foto} alt="" className="h-10 w-10 rounded-xl object-cover" />
                      : alumno.nombre[0]?.toUpperCase() ?? '?'
                    }
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#121212]">
                        {alumno.nombre}{alumno.apellido ? ' ' + alumno.apellido : ''}
                      </p>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#121212] opacity-60" />}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {activeRoutine ? (
                        <>
                          <Calendar className="h-3 w-3 shrink-0 text-[#888888]" />
                          <span className="truncate text-[11px] text-[#777777]">{activeRoutine.name}</span>
                          {sessionCount > 0 && (
                            <span className="shrink-0 text-[10px] text-[#9B9B9B]">· {sessionCount}d</span>
                          )}
                          {muscles.slice(0, 4).map(m => (
                            <span key={m} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: MUSCLE_HEX[m] ?? '#777777' }} />
                          ))}
                        </>
                      ) : (
                        <span className="text-[11px] text-[#9B9B9B]">Sin programa asignado</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-[#D8D8D8]" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#DEDEDE] px-5 py-3">
          <button onClick={onClose} className="text-xs text-[#888888] transition hover:text-[#5E5E5E]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
