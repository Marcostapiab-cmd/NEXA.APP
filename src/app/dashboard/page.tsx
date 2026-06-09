'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Dumbbell, AlertTriangle, Calendar, ChevronRight } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { getSesiones } from '@/lib/sesiones';

interface DayBlock { id: string; name: string; exercises: { id: string }[]; }
interface Routine {
  id: string; name: string; blocks: DayBlock[]; exercises?: unknown[];
  selectedDays: number[]; dayToBlock: Record<number, string>;
  weeks: number; startDate: string; endDate: string; alumnoIds: string[];
}

const DAY_LONG = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function todayIdx(): number { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function isActive(r: Routine): boolean {
  if (!r.startDate || !r.endDate) return false;
  const t = new Date().toISOString().slice(0,10);
  return t >= r.startDate && t <= r.endDate;
}
function daysUntilEnd(endDate: string): number {
  const end = new Date(endDate + 'T12:00:00');
  const now = new Date(); now.setHours(12,0,0,0);
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

const SL = 'text-xs font-medium uppercase tracking-[0.1em] text-[#888888]';

export default function DashboardPage() {
  const [alumnos, setAlumnos]   = useState<Alumno[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sesionesHoy, setSesionesHoy] = useState(0);

  useEffect(() => {
    try { const a = localStorage.getItem('nexa_alumnos');  if (a) setAlumnos(JSON.parse(a));  } catch {}
    try { const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r)); } catch {}
    const hoy = new Date().toISOString().slice(0,10);
    setSesionesHoy(getSesiones().filter(s => s.fecha === hoy).length);
  }, []);

  const hoy = todayIdx();
  const activeRoutines = routines.filter(isActive);

  // Routines expiring soon (≤7 days)
  const expirando = routines.filter(r => {
    if (!isActive(r)) return false;
    const d = daysUntilEnd(r.endDate);
    return d >= 0 && d <= 7;
  });

  // Students training today
  const entrenanHoy = alumnos.filter(a => {
    return activeRoutines.some(r =>
      (r.alumnoIds ?? []).includes(a.id) && r.selectedDays.includes(hoy)
    );
  });

  // Recent sessions (last 5)
  const sesiones = getSesiones().slice(0, 5);
  const alumnoMap = Object.fromEntries(alumnos.map(a => [a.id, a]));

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
          {new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Alumnos',       value: alumnos.length,         icon: <Users className="h-5 w-5" />,       href: '/alumnos' },
          { label: 'Rutinas activas', value: activeRoutines.length, icon: <Dumbbell className="h-5 w-5" />,   href: '/rutinas' },
          { label: 'Entrenan hoy',  value: entrenanHoy.length,     icon: <Calendar className="h-5 w-5" />,    href: '/weightroom' },
          { label: 'Sesiones hoy',  value: sesionesHoy,            icon: <Calendar className="h-5 w-5" />,    href: '/weightroom' },
        ].map(({ label, value, icon, href }) => (
          <Link key={label} href={href}
            className="flex flex-col gap-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 transition hover:border-[#444444]">
            <div className="text-[#888888]">{icon}</div>
            <div>
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-xs text-[#888888]">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-4">

          {/* Expiring programs */}
          {expirando.length > 0 && (
            <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <p className="text-sm font-semibold text-red-400">
                  {expirando.length} programa{expirando.length !== 1 ? 's' : ''} por vencer
                </p>
              </div>
              <div className="space-y-2">
                {expirando.map(r => {
                  const d = daysUntilEnd(r.endDate);
                  const asignados = (r.alumnoIds ?? []).map(id => alumnoMap[id]).filter(Boolean);
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-md border border-red-800/20 bg-[#1a1a1a] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-white">{r.name}</p>
                        {asignados.length > 0 && (
                          <p className="text-xs text-[#888888]">{asignados.map(a => a.nombre).join(', ')}</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold ${d === 0 ? 'text-red-400' : 'text-[#888888]'}`}>
                        {d === 0 ? 'Hoy' : `${d}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's athletes */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Entrenan hoy — {DAY_LONG[hoy]}</p>
              <Link href="/weightroom" className="text-xs text-[#888888] transition hover:text-white">
                Ir al gym →
              </Link>
            </div>
            {entrenanHoy.length === 0 ? (
              <p className="text-sm text-[#888888]">Nadie entrena hoy o no hay rutinas asignadas.</p>
            ) : (
              <div className="space-y-2">
                {entrenanHoy.map(a => {
                  const r = activeRoutines.find(r => (r.alumnoIds ?? []).includes(a.id) && r.selectedDays.includes(hoy));
                  const blockId = r?.dayToBlock?.[hoy];
                  const block = r?.blocks?.find(b => b.id === blockId);
                  return (
                    <Link key={a.id} href={`/alumnos/${a.id}`}
                      className="flex items-center gap-3 rounded-md border border-[#2a2a2a] px-3 py-2.5 transition hover:border-[#444444]">
                      {a.foto
                        ? <img src={a.foto} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2a2a2a] text-sm font-bold text-[#888888]">
                            {a.nombre[0]?.toUpperCase()}
                          </div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{a.nombre} {a.apellido}</p>
                        <p className="text-xs text-[#888888]">{block?.name || r?.name || '—'}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#444444]" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent sessions */}
          {sesiones.length > 0 && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
              <p className={`mb-3 ${SL}`}>Últimas sesiones registradas</p>
              <div className="space-y-2">
                {sesiones.map(s => {
                  const a = alumnoMap[s.alumnoId];
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-md border border-[#2a2a2a] px-3 py-2">
                      {a?.foto
                        ? <img src={a.foto} alt="" className="h-7 w-7 rounded-md object-cover" />
                        : <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2a2a2a] text-xs font-bold text-[#888888]">
                            {a?.nombre[0]?.toUpperCase() || '?'}
                          </div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{a?.nombre || 'Alumno'} · {s.bloqueNombre}</p>
                        <p className="text-xs text-[#888888]">{s.ejercicios.length} ejercicios · {s.fecha}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* All students */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Alumnos</p>
              <Link href="/alumnos" className="text-xs text-[#888888] transition hover:text-white">Ver todos →</Link>
            </div>
            {alumnos.length === 0 ? (
              <p className="text-sm text-[#888888]">Sin alumnos aún.</p>
            ) : (
              <div className="space-y-1.5">
                {alumnos.slice(0, 8).map(a => {
                  const tieneRutinaActiva = activeRoutines.some(r => (r.alumnoIds ?? []).includes(a.id));
                  return (
                    <Link key={a.id} href={`/alumnos/${a.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-[#2a2a2a]">
                      {a.foto
                        ? <img src={a.foto} alt="" className="h-7 w-7 rounded-md object-cover" />
                        : <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2a2a2a] text-xs font-bold text-[#888888]">
                            {a.nombre[0]?.toUpperCase()}
                          </div>}
                      <span className="flex-1 text-sm text-white">{a.nombre} {a.apellido}</span>
                      <span className={`h-2 w-2 rounded-full ${tieneRutinaActiva ? 'bg-white' : 'bg-[#2a2a2a]'}`} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <p className={`mb-3 ${SL}`}>Acceso rápido</p>
            <div className="space-y-1.5">
              {[
                { href: '/rutinas',    label: 'Nueva rutina' },
                { href: '/alumnos',    label: 'Nuevo alumno' },
                { href: '/biblioteca', label: 'Biblioteca de ejercicios' },
                { href: '/weightroom', label: 'Vista del gym' },
                { href: '/calendario', label: 'Calendario' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex items-center justify-between rounded-md border border-[#2a2a2a] px-3 py-2 text-sm text-[#888888] transition hover:border-[#444444] hover:text-white">
                  {label}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
