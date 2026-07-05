'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildMonthGrid, toDateStr, getMuscleGroups,
  MONTHS_ES, DOW_LABEL, MUSCLE_HEX,
  type Routine, type Alumno,
} from './types';

interface Props {
  routine: Routine | null;
  selectedAlumno: Alumno | null;
  selectedDate: string;
  todayStr: string;
  onSelectDate: (ds: string) => void;
  onOpenSelector: () => void;
}

export default function CalendarSidebar({
  routine, selectedAlumno, selectedDate, todayStr, onSelectDate, onOpenSelector,
}: Props) {
  const initDate = routine?.startDate
    ? new Date(routine.startDate + 'T12:00:00')
    : new Date();
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const grid = buildMonthGrid(viewYear, viewMonth);
  const today = new Date();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }

  const isInRange = (ds: string) => {
    if (!routine?.startDate || !routine?.endDate) return true;
    return ds >= routine.startDate && ds <= routine.endDate;
  };

  const sessions = routine?.sessions ?? {};
  const sessionCount = Object.keys(sessions).filter(d => d.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`)).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Athlete / calendar selector */}
      <button
        onClick={onOpenSelector}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-3.5 text-left transition hover:border-[#444444] hover:bg-[#111111]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1a1a1a] text-sm font-bold text-white">
          {selectedAlumno?.foto
            ? <img src={selectedAlumno.foto} alt="" className="h-9 w-9 rounded-xl object-cover" />
            : (selectedAlumno?.nombre[0]?.toUpperCase() ?? '?')
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {selectedAlumno
              ? `${selectedAlumno.nombre}${selectedAlumno.apellido ? ' ' + selectedAlumno.apellido : ''}`
              : 'Seleccionar calendario'
            }
          </p>
          <p className="truncate text-[11px] text-[#444444]">
            {routine ? routine.name : 'Sin programa activo'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#333333]" />
      </button>

      {/* Mini calendar */}
      <div className="overflow-hidden rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d]">
        {/* Month nav */}
        <div className="flex items-center gap-1 border-b border-[#1e1e1e] px-2 py-2">
          <button onClick={prevMonth} className="rounded-lg p-1.5 text-[#444444] transition hover:bg-[#1a1a1a] hover:text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2">
            <span className="text-sm font-bold text-white">{MONTHS_ES[viewMonth]} {viewYear}</span>
            {!isCurrentMonth && (
              <button onClick={goToday}
                className="rounded-full border border-[#222222] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#444444] transition hover:text-[#888888]">
                Hoy
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="rounded-lg p-1.5 text-[#444444] transition hover:bg-[#1a1a1a] hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* DOW headers */}
        <div className="grid grid-cols-7 border-b border-[#1a1a1a]">
          {DOW_LABEL.map(d => (
            <div key={d} className="py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-[#333333]">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        {grid.map((week, wi) => (
          <div key={wi} className={`grid grid-cols-7 ${wi < grid.length - 1 ? 'border-b border-[#1a1a1a]' : ''}`}>
            {week.map((date, di) => {
              const ds        = toDateStr(date);
              const isThisM   = date.getMonth() === viewMonth;
              const isToday   = ds === todayStr;
              const isSel     = ds === selectedDate;
              const inRange   = isInRange(ds);
              const sess      = sessions[ds];
              const primary   = sess ? getMuscleGroups(sess.exercises)[0] : null;
              const chipColor = primary ? (MUSCLE_HEX[primary] ?? '#ffffff') : '#ffffff';

              return (
                <button
                  key={di}
                  onClick={() => onSelectDate(ds)}
                  className={`group relative flex min-h-[48px] flex-col items-start p-1 text-left transition-colors
                    ${di < 6 ? 'border-r border-[#1a1a1a]' : ''}
                    ${isSel ? 'bg-white/[0.04]' : 'hover:bg-[#141414]'}
                    ${!isThisM || !inRange ? 'opacity-20' : ''}
                  `}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition
                    ${isToday ? 'bg-white text-black'
                    : isSel   ? 'bg-white/20 text-white'
                    : 'text-[#666666] group-hover:text-white'}
                  `}>
                    {date.getDate()}
                  </span>
                  {sess && sess.exercises.length > 0 && (
                    <div className="mt-0.5 w-full overflow-hidden">
                      <div className="truncate rounded-sm py-px pl-1 pr-1 text-[8px] font-semibold leading-tight text-white"
                        style={{ backgroundColor: chipColor + '20', borderLeft: `2px solid ${chipColor}` }}>
                        {sess.name || `${sess.exercises.length}ej`}
                      </div>
                    </div>
                  )}
                  {isSel && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Month stats */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex gap-1">
          {[...new Set(Object.values(sessions).flatMap(s => getMuscleGroups(s.exercises)))].slice(0, 6).map(m => (
            <span key={m} className="h-2 w-2 rounded-full" style={{ backgroundColor: MUSCLE_HEX[m] ?? '#555555' }} />
          ))}
        </div>
        {sessionCount > 0 && (
          <span className="text-xs text-[#444444]">{sessionCount} entrenam. este mes</span>
        )}
      </div>
    </div>
  );
}
