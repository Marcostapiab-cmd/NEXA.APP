'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Routine {
  id: string; name: string; exercises: { id: string }[];
  startDate: string; endDate: string;
}

const DAYS   = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function isBetween(date: Date, start: string, end: string) {
  if (!start || !end) return false;
  const d = date.getTime();
  return d >= new Date(start + 'T00:00:00').getTime() && d <= new Date(end + 'T23:59:59').getTime();
}

function isLastWeek(date: Date, end: string) {
  if (!end) return false;
  const endDate = new Date(end + 'T12:00:00');
  const diff = (endDate.getTime() - date.getTime()) / 86400000;
  return diff >= 0 && diff <= 6;
}

export default function CalendarioPage() {
  const [routines, setRoutines]     = useState<Routine[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem('nexa_routines'); if (s) setRoutines(JSON.parse(s)); } catch {}
  }, []);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();

  function routinesForDay(day: Date) {
    return routines
      .filter((r) => isBetween(day, r.startDate, r.endDate))
      .map((r) => ({ routine: r, isLast: isLastWeek(day, r.endDate) }));
  }

  const selectedRoutines = selectedDay ? routinesForDay(selectedDay) : [];

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-white">Calendario</h1>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
          Vista mensual de rutinas programadas
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Calendar grid */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
            <h2 className="text-sm font-semibold text-white">
              {MONTHS[month]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="rounded-md p-1.5 text-[#888888] transition hover:bg-[#2a2a2a] hover:text-white">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentDate(new Date())}
                className="rounded-md px-3 py-1 text-xs font-medium text-[#888888] transition hover:bg-[#2a2a2a] hover:text-white">
                Hoy
              </button>
              <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="rounded-md p-1.5 text-[#888888] transition hover:bg-[#2a2a2a] hover:text-white">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map((d) => (
                <div key={d} className="py-1 text-center text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = new Date(year, month, i + 1);
                const rr  = routinesForDay(day);
                const isToday    = day.toDateString() === new Date().toDateString();
                const isSelected = selectedDay?.toDateString() === day.toDateString();
                const hasWarn    = rr.some((r) => r.isLast);

                return (
                  <button key={i} onClick={() => setSelectedDay(day)}
                    className={`relative flex min-h-[48px] flex-col items-center rounded-lg p-1.5 text-sm transition ${
                      isSelected
                        ? 'bg-white text-black'
                        : isToday
                        ? 'bg-[#2a2a2a] font-semibold text-white'
                        : 'text-[#888888] hover:bg-[#2a2a2a] hover:text-white'
                    }`}>
                    <span className="font-medium">{i + 1}</span>
                    {rr.length > 0 && (
                      <div className="mt-0.5 flex gap-0.5">
                        {rr.slice(0, 2).map(({ isLast, routine }) => (
                          <span key={routine.id}
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? 'bg-black/40' : isLast ? 'bg-[#888888]' : 'bg-white'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    {hasWarn && !isSelected && (
                      <span className="absolute -right-0.5 -top-0.5 text-[9px]">⚠</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
            {selectedDay ? (
              <>
                <p className="text-sm font-semibold text-white capitalize">
                  {selectedDay.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <p className="mt-0.5 text-xs text-[#888888]">{selectedDay.getFullYear()}</p>

                {selectedRoutines.length === 0 ? (
                  <p className="mt-4 text-sm text-[#888888]">Sin rutinas este día.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {selectedRoutines.map(({ routine, isLast }) => (
                      <div key={routine.id}
                        className={`rounded-lg border p-3 ${
                          isLast ? 'border-[#444444] bg-[#111111]' : 'border-[#2a2a2a] bg-[#111111]'
                        }`}>
                        <p className="text-sm font-semibold text-white">{routine.name}</p>
                        <p className="text-xs text-[#888888]">
                          {routine.exercises.length} ejercicio{routine.exercises.length !== 1 ? 's' : ''}
                        </p>
                        {isLast && (
                          <p className="mt-1.5 text-xs text-[#888888]">⚠ Última semana</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[#888888]">Selecciona un día para ver las rutinas.</p>
            )}
          </div>

          {/* Legend */}
          <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">Leyenda</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#888888]">
                <span className="h-2 w-2 rounded-full bg-white" /> Rutina activa
              </div>
              <div className="flex items-center gap-2 text-xs text-[#888888]">
                <span className="h-2 w-2 rounded-full bg-[#888888]" /> Última semana
              </div>
            </div>
          </div>

          {/* Scheduled routines */}
          {routines.filter((r) => r.startDate && r.endDate).length > 0 && (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">Programadas</p>
              <div className="space-y-3">
                {routines.filter((r) => r.startDate && r.endDate).map((r) => (
                  <div key={r.id}>
                    <p className="text-sm font-medium text-white">{r.name}</p>
                    <p className="text-xs text-[#888888]">{r.startDate} → {r.endDate}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
