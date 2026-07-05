'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Calendar, Dumbbell, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { getSesiones } from '@/lib/sesiones';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface CalSession { name: string; exercises: { id: string; name: string; muscle: string }[]; }

interface Routine {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  alumnoId?: string;
  alumnoIds: string[];
  /* new format */
  sessions?: Record<string, CalSession>;
  /* old format (backwards compat) */
  selectedDays?: number[];
  dayToBlock?: Record<number, string>;
  blocks?: { id: string; name: string; exercises: { id: string }[] }[];
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const TODAY = new Date().toISOString().slice(0, 10);

function todayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1; // 0=Mon … 6=Sun
}

function getWeekDates(): string[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function daysUntilEnd(endDate: string): number {
  const end = new Date(endDate + 'T12:00:00');
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

function isRoutineActive(r: Routine): boolean {
  return !!r.startDate && !!r.endDate && r.startDate <= TODAY && TODAY <= r.endDate;
}

function routineHasSessionToday(r: Routine): boolean {
  if (r.sessions) {
    return (r.sessions[TODAY]?.exercises?.length ?? 0) > 0;
  }
  return (r.selectedDays ?? []).includes(todayDow());
}

function getTodayBloqueName(r: Routine): string | null {
  if (r.sessions) {
    return r.sessions[TODAY]?.name ?? null;
  }
  const dow = todayDow();
  const blockId = r.dayToBlock?.[dow];
  return r.blocks?.find(b => b.id === blockId)?.name ?? null;
}

function getTodayEjerciciosCount(r: Routine): number {
  if (r.sessions) {
    return r.sessions[TODAY]?.exercises?.length ?? 0;
  }
  const dow = todayDow();
  const blockId = r.dayToBlock?.[dow];
  return r.blocks?.find(b => b.id === blockId)?.exercises.length ?? 0;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [alumnos, setAlumnos]   = useState<Alumno[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);

  useEffect(() => {
    try { const a = localStorage.getItem('nexa_alumnos');  if (a) setAlumnos(JSON.parse(a));  } catch {}
    try { const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r)); } catch {}
  }, []);

  const sesiones     = getSesiones();
  const alumnoMap    = Object.fromEntries(alumnos.map(a => [a.id, a]));
  const weekDates    = getWeekDates();

  /* Derived data */
  const activeRoutines  = routines.filter(isRoutineActive);
  const sesionesHoy     = sesiones.filter(s => s.fecha === TODAY);
  const sesionesEsSemana = sesiones.filter(s => weekDates.includes(s.fecha));
  const recentSesiones  = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);

  function getRoutineFor(alumnoId: string): Routine | undefined {
    return routines.find(r =>
      r.alumnoId === alumnoId || (r.alumnoIds ?? []).includes(alumnoId)
    );
  }

  const alumnosHoy = alumnos.filter(a => {
    const r = getRoutineFor(a.id);
    return r && isRoutineActive(r) && routineHasSessionToday(r);
  });

  const expirandoPronto = routines.filter(r => {
    if (!isRoutineActive(r)) return false;
    const d = daysUntilEnd(r.endDate);
    return d >= 0 && d <= 7;
  });

  const displayDate = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  /* Stat cards */
  const stats = [
    { label: 'Alumnos',       value: alumnos.length,          Icon: Users,       href: '/alumnos',    accent: false },
    { label: 'Rutinas activas', value: activeRoutines.length, Icon: Calendar,    href: '/rutinas',    accent: false },
    { label: 'Esta semana',   value: sesionesEsSemana.length,  Icon: TrendingUp,  href: '/weightroom', accent: false },
    { label: 'Entrenan hoy',  value: alumnosHoy.length,       Icon: Dumbbell,    href: '/weightroom', accent: true  },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="mb-8">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#333333]">
          {displayDate}
        </p>
        <h1 className="text-[20px] font-bold tracking-tight text-[#f4f4f5]">
          {getGreeting()}, Coach
        </h1>
      </div>

      {/* ── Stats row ───────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, Icon, href, accent }) => (
          <Link key={label} href={href}
            className="group flex flex-col gap-3 rounded-xl border border-[#141414] bg-[#0d0d0d] p-4 transition-all hover:border-[#1e1e1e] hover:bg-[#0f0f0f]">
            <Icon
              size={14}
              strokeWidth={1.75}
              className={`transition-colors ${accent ? 'text-[#D4AF37]' : 'text-[#2a2a2a] group-hover:text-[#3d3d3d]'}`}
            />
            <div>
              <p className={`text-[22px] font-black tracking-tight ${accent ? 'text-[#D4AF37]' : 'text-[#f4f4f5]'}`}>
                {value}
              </p>
              <p className="mt-0.5 text-[11px] text-[#333333]">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Main grid ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_288px]">

        {/* Left column */}
        <div className="space-y-4">

          {/* Expiring programs alert */}
          {expirandoPronto.length > 0 && (
            <div className="rounded-xl border border-[#FF4444]/15 bg-[#FF4444]/5 p-4 anim-fade-in">
              <div className="mb-2.5 flex items-center gap-2">
                <AlertTriangle size={13} className="text-[#FF4444]" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#FF4444]">
                  {expirandoPronto.length} programa{expirandoPronto.length !== 1 ? 's' : ''} por vencer
                </p>
              </div>
              <div className="space-y-1.5">
                {expirandoPronto.map(r => {
                  const d = daysUntilEnd(r.endDate);
                  const asignados = (r.alumnoIds ?? []).map(id => alumnoMap[id]).filter(Boolean);
                  return (
                    <div key={r.id}
                      className="flex items-center justify-between rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-2">
                      <div>
                        <p className="text-[13px] font-medium text-[#f4f4f5]">{r.name}</p>
                        {asignados.length > 0 && (
                          <p className="text-[11px] text-[#444444]">
                            {asignados.map(a => a.nombre).join(', ')}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[12px] font-semibold ${d === 0 ? 'text-[#FF4444]' : 'text-[#444444]'}`}>
                        {d === 0 ? 'Hoy' : `${d}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's schedule */}
          <div className="overflow-hidden rounded-xl border border-[#141414] bg-[#0d0d0d]">
            <div className="flex items-center justify-between border-b border-[#111111] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#333333]">
                Agenda de hoy
              </p>
              <Link href="/weightroom"
                className="text-[11px] text-[#2e2e2e] transition hover:text-[#666666]">
                Weightroom →
              </Link>
            </div>

            {alumnosHoy.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[13px] text-[#2e2e2e]">Sin sesiones programadas para hoy.</p>
                <Link href="/rutinas"
                  className="mt-2 inline-block text-[12px] text-[#3a3a3a] transition hover:text-[#666666]">
                  Ir al Calendario →
                </Link>
              </div>
            ) : (
              <div className="p-2">
                {alumnosHoy.map(a => {
                  const r = getRoutineFor(a.id)!;
                  const bloque = getTodayBloqueName(r);
                  const count  = getTodayEjerciciosCount(r);
                  return (
                    <Link key={a.id} href={`/alumnos/${a.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[#111111]">
                      {a.foto
                        ? <img src={a.foto} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#141414] text-[13px] font-bold text-[#3a3a3a]">
                            {a.nombre[0]?.toUpperCase()}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#f4f4f5]">
                          {a.nombre} {a.apellido}
                        </p>
                        <p className="text-[11px] text-[#3a3a3a]">
                          {bloque ?? r.name}
                          {count > 0 && ` · ${count} ejercicios`}
                        </p>
                      </div>
                      <ChevronRight size={13} className="shrink-0 text-[#1e1e1e]" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent sessions */}
          {recentSesiones.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[#141414] bg-[#0d0d0d]">
              <div className="border-b border-[#111111] px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#333333]">
                  Últimas sesiones registradas
                </p>
              </div>
              <div className="p-2">
                {recentSesiones.map(s => {
                  const a = alumnoMap[s.alumnoId];
                  return (
                    <div key={s.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                      {a?.foto
                        ? <img src={a.foto} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#141414] text-[12px] font-bold text-[#3a3a3a]">
                            {a?.nombre[0]?.toUpperCase() || '?'}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#d4d4d4]">
                          <span className="font-medium">{a?.nombre || 'Alumno'}</span>
                          <span className="text-[#3d3d3d]"> · {s.bloqueNombre}</span>
                        </p>
                        <p className="text-[11px] text-[#2e2e2e]">
                          {s.ejercicios.length} ejercicios ·{' '}
                          {s.fecha === TODAY ? 'Hoy' : s.fecha}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty sessions state */}
          {sesionesHoy.length === 0 && recentSesiones.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#141414] py-10 text-center">
              <p className="text-[13px] text-[#2a2a2a]">
                Sin sesiones registradas aún.
              </p>
              <Link href="/weightroom"
                className="mt-2 inline-block text-[12px] text-[#3a3a3a] transition hover:text-[#666666]">
                Ir al Weightroom →
              </Link>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Alumnos list */}
          <div className="overflow-hidden rounded-xl border border-[#141414] bg-[#0d0d0d]">
            <div className="flex items-center justify-between border-b border-[#111111] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#333333]">
                Alumnos
              </p>
              <Link href="/alumnos"
                className="text-[11px] text-[#2e2e2e] transition hover:text-[#666666]">
                Ver todos →
              </Link>
            </div>

            {alumnos.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-[13px] text-[#2e2e2e]">Sin alumnos aún.</p>
                <Link href="/alumnos"
                  className="mt-1.5 inline-block text-[12px] text-[#D4AF37]">
                  Agregar alumno →
                </Link>
              </div>
            ) : (
              <div className="p-2">
                {alumnos.slice(0, 8).map(a => {
                  const tieneRutina = activeRoutines.some(
                    r => r.alumnoId === a.id || (r.alumnoIds ?? []).includes(a.id)
                  );
                  return (
                    <Link key={a.id} href={`/alumnos/${a.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-[#111111]">
                      {a.foto
                        ? <img src={a.foto} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                        : <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#141414] text-[11px] font-bold text-[#3a3a3a]">
                            {a.nombre[0]?.toUpperCase()}
                          </div>
                      }
                      <span className="flex-1 truncate text-[13px] text-[#c4c4c4]">
                        {a.nombre} {a.apellido}
                      </span>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        tieneRutina ? 'bg-[#D4AF37]' : 'bg-[#1e1e1e]'
                      }`} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="overflow-hidden rounded-xl border border-[#141414] bg-[#0d0d0d]">
            <div className="border-b border-[#111111] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#333333]">
                Acceso rápido
              </p>
            </div>
            <div className="p-2">
              {[
                { href: '/weightroom', label: 'Abrir Weightroom' },
                { href: '/rutinas',    label: 'Ver Calendario' },
                { href: '/alumnos',    label: 'Mis Alumnos' },
                { href: '/biblioteca', label: 'Ejercicios' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] text-[#3d3d3d] transition hover:bg-[#111111] hover:text-[#D4AF37]">
                  {label}
                  <ChevronRight size={12} className="text-[#222222]" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
