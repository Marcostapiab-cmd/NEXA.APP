'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Calendar, Dumbbell, ChevronRight, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { getAlumnos } from '@/lib/alumnos';
import type { Sesion } from '@/lib/sesiones';
import { getSesionesDB } from '@/lib/sesiones-supabase';
import { getRutinasDB, type RutinaDB } from '@/lib/rutinas-supabase';
import type { Plan, Reserva } from '@/lib/planes';
import { getPlanEstado, getClasesRestantes, getDiasRestantes, ESTADO_CONFIG, RESERVA_LABEL } from '@/lib/planes';
import { getAllPlanesDB, getReservasFechaDB } from '@/lib/planes-supabase';

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

function routineHasSessionToday(r: RutinaDB): boolean {
  const sessions = r.sessions as Record<string, { exercises?: unknown[] }>;
  if (sessions && sessions[TODAY]) {
    return (sessions[TODAY].exercises?.length ?? 0) > 0;
  }
  return false;
}

function getTodayBlockName(r: RutinaDB): string | null {
  const sessions = r.sessions as Record<string, { name?: string }>;
  return sessions?.[TODAY]?.name ?? null;
}

function getTodayEjCount(r: RutinaDB): number {
  const sessions = r.sessions as Record<string, { exercises?: unknown[] }>;
  return sessions?.[TODAY]?.exercises?.length ?? 0;
}

function isRoutineActive(r: RutinaDB): boolean {
  return !!r.start_date && !!r.end_date && r.start_date <= TODAY && TODAY <= r.end_date;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [alumnos,     setAlumnos]     = useState<Alumno[]>([]);
  const [routines,    setRoutines]    = useState<RutinaDB[]>([]);
  const [sesiones,    setSesiones]    = useState<Sesion[]>([]);
  const [planes,      setPlanes]      = useState<Plan[]>([]);
  const [reservasHoy, setReservasHoy] = useState<Reserva[]>([]);
  const [staleData,   setStaleData]   = useState(false);

  useEffect(() => {
    // Alumnos
    getAlumnos().then(setAlumnos).catch(() => {
      try { const a = localStorage.getItem('nexa_alumnos'); if (a) { setAlumnos(JSON.parse(a)); setStaleData(true); } } catch {}
    });
    // Rutinas
    getRutinasDB().then(setRoutines).catch(() => {
      try {
        const r = localStorage.getItem('nexa_routines');
        if (r) {
          const parsed = JSON.parse(r);
          setRoutines(parsed.map((x: Record<string, unknown>) => ({
            id:         String(x.id ?? ''),
            nombre:     String(x.name ?? x.nombre ?? ''),
            alumno_ids: (Array.isArray(x.alumnoIds) ? x.alumnoIds : x.alumnoId ? [x.alumnoId] : []) as string[],
            start_date: String(x.startDate ?? x.start_date ?? ''),
            end_date:   String(x.endDate   ?? x.end_date   ?? ''),
            sessions:   (x.sessions ?? {}) as Record<string, unknown>,
            blocks:     (Array.isArray(x.blocks) ? x.blocks : []) as unknown[],
          })));
          setStaleData(true);
        }
      } catch {}
    });
    // Sesiones
    getSesionesDB().then(setSesiones).catch(() => {
      try { const s = localStorage.getItem('nexa_sesiones'); if (s) { setSesiones(JSON.parse(s)); setStaleData(true); } } catch {}
    });
    // Planes (todos)
    getAllPlanesDB().then(setPlanes).catch(() => {});
    // Reservas de hoy
    getReservasFechaDB(TODAY).then(setReservasHoy).catch(() => {});
  }, []);

  const alumnoMap  = Object.fromEntries(alumnos.map(a => [a.id, a]));
  const weekDates  = getWeekDates();

  /* ── Derived ── */

  const activeRoutines   = routines.filter(isRoutineActive);
  const sesionesEsSemana = sesiones.filter(s => weekDates.includes(s.fecha));
  const recentSesiones   = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);

  // Alumnos con sesión de rutina hoy
  const alumnosHoy = alumnos.filter(a => {
    const r = activeRoutines.find(r => (r.alumno_ids ?? []).includes(a.id));
    return r && routineHasSessionToday(r);
  });

  // Planes que necesitan atención: vencido, sin_clases, por_vencer
  const planesRenovar = planes
    .map(p => ({ plan: p, estado: getPlanEstado(p) }))
    .filter(({ estado }) => estado !== 'activo')
    .sort((a, b) => {
      const order = { vencido: 0, sin_clases: 1, por_vencer: 2, activo: 3 };
      return order[a.estado] - order[b.estado];
    });

  // Reservas de hoy que están pendientes o confirmadas
  const reservasPendientesHoy = reservasHoy.filter(
    r => r.estado === 'pendiente' || r.estado === 'confirmada'
  );

  const displayDate = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const stats = [
    { label: 'Alumnos',        value: alumnos.length,          Icon: Users,      href: '/alumnos',    accent: false },
    { label: 'Rutinas activas', value: activeRoutines.length,  Icon: Calendar,   href: '/rutinas',    accent: false },
    { label: 'Esta semana',    value: sesionesEsSemana.length,  Icon: TrendingUp, href: '/weightroom', accent: false },
    { label: 'Entrenan hoy',   value: alumnosHoy.length,       Icon: Dumbbell,   href: '/weightroom', accent: true  },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">

      {/* ── Banner datos en caché ── */}
      {staleData && (
        <div
          className="mb-5 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[12px]"
          style={{ background: 'rgba(196,120,58,0.08)', border: '1px solid rgba(196,120,58,0.25)' }}
        >
          <AlertTriangle size={13} strokeWidth={2} style={{ color: '#C4783A', flexShrink: 0 }} />
          <span style={{ color: '#C4783A' }}>
            Datos en caché — sin conexión al servidor. Algunos números pueden estar desactualizados.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{ color: '#C4783A', border: '1px solid rgba(196,120,58,0.4)' }}
          >
            <RefreshCw size={11} strokeWidth={2.5} />
            Reintentar
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#9B9B9B]">
          {displayDate}
        </p>
        <h1 className="text-[20px] font-bold tracking-tight text-[#121212]">
          {getGreeting()}, Coach
        </h1>
      </div>

      {/* ── Stats ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, Icon, href, accent }) => (
          <Link key={label} href={href}
            className="group flex flex-col gap-3 rounded-xl border border-[#E8E8E8] bg-[#F5F5F5] p-4 transition-all hover:border-[#D8D8D8] hover:bg-[#F0F0F0]">
            <Icon size={14} strokeWidth={1.75}
              className={`transition-colors ${accent ? 'text-[#121212]' : 'text-[#CACACA] group-hover:text-[#9B9B9B]'}`} />
            <div>
              <p className="text-[22px] font-black tracking-tight text-[#121212]">{value}</p>
              <p className="mt-0.5 text-[11px] text-[#9B9B9B]">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_288px]">

        {/* Left column */}
        <div className="space-y-4">

          {/* Alerta: planes que necesitan renovación */}
          {planesRenovar.length > 0 && (
            <div className="rounded-xl border border-[#B44040]/20 bg-[#FAEAEA] p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <AlertTriangle size={13} className="text-[#B44040]" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#B44040]">
                  {planesRenovar.length} plan{planesRenovar.length !== 1 ? 'es' : ''} requieren atención
                </p>
              </div>
              <div className="space-y-1.5">
                {planesRenovar.map(({ plan, estado }) => {
                  const cfg       = ESTADO_CONFIG[estado];
                  const alumno    = alumnoMap[plan.alumnoId];
                  const restantes = getClasesRestantes(plan);
                  const dias      = getDiasRestantes(plan);
                  return (
                    <Link key={plan.id} href={`/alumnos/${plan.alumnoId}`}
                      className="flex items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2 transition hover:bg-[#EBEBEB]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[#121212]">
                          {alumno ? `${alumno.nombre} ${alumno.apellido ?? ''}`.trim() : 'Alumno'}
                        </p>
                        <p className="truncate text-[11px] text-[#888888]">{plan.nombre}</p>
                      </div>
                      <div className="ml-3 flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-[#AAAAAA]">
                          {estado === 'vencido'    ? `venció hace ${Math.abs(dias)}d` :
                           estado === 'sin_clases' ? '0 clases restantes' :
                           `${restantes} clase${restantes !== 1 ? 's' : ''} · ${dias}d`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agenda de hoy */}
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="flex items-center justify-between border-b border-[#EBEBEB] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]">
                Agenda de hoy
              </p>
              <Link href="/weightroom"
                className="text-[11px] text-[#AAAAAA] transition hover:text-[#6E6E6E]">
                Weightroom →
              </Link>
            </div>

            {alumnosHoy.length === 0 && reservasPendientesHoy.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[13px] text-[#AAAAAA]">Sin sesiones programadas para hoy.</p>
                <Link href="/rutinas"
                  className="mt-2 inline-block text-[12px] text-[#9B9B9B] transition hover:text-[#6E6E6E]">
                  Ir al Calendario →
                </Link>
              </div>
            ) : (
              <div className="p-2">
                {/* Rutinas de hoy */}
                {alumnosHoy.map(a => {
                  const r = activeRoutines.find(r => (r.alumno_ids ?? []).includes(a.id))!;
                  const bloque = getTodayBlockName(r);
                  const count  = getTodayEjCount(r);
                  return (
                    <Link key={a.id} href={`/alumnos/${a.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[#EBEBEB]">
                      {a.foto
                        ? <img src={a.foto} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EBEBEB] text-[13px] font-bold text-[#9B9B9B]">
                            {a.nombre[0]?.toUpperCase()}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#121212]">{a.nombre} {a.apellido}</p>
                        <p className="text-[11px] text-[#9B9B9B]">
                          {bloque ?? r.nombre}{count > 0 && ` · ${count} ejercicios`}
                        </p>
                      </div>
                      <ChevronRight size={13} className="shrink-0 text-[#D8D8D8]" />
                    </Link>
                  );
                })}

                {/* Reservas de hoy */}
                {reservasPendientesHoy.map(r => {
                  const a = alumnoMap[r.alumnoId];
                  const lbl = RESERVA_LABEL[r.estado];
                  return (
                    <Link key={r.id} href={`/alumnos/${r.alumnoId}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[#EBEBEB]">
                      {a?.foto
                        ? <img src={a.foto} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EBEBEB] text-[13px] font-bold text-[#9B9B9B]">
                            {a?.nombre[0]?.toUpperCase() ?? '?'}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#121212]">
                          {a ? `${a.nombre} ${a.apellido ?? ''}`.trim() : 'Alumno'}
                        </p>
                        <p className="text-[11px] text-[#9B9B9B]">
                          {r.descripcion ?? 'Clase reservada'}
                          {r.hora && ` · ${r.hora}`}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold shrink-0" style={{ color: lbl.color }}>
                        {lbl.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Últimas sesiones registradas */}
          {recentSesiones.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
              <div className="border-b border-[#EBEBEB] px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]">
                  Últimas sesiones registradas
                </p>
              </div>
              <div className="p-2">
                {recentSesiones.map(s => {
                  const a = alumnoMap[s.alumnoId];
                  return (
                    <Link key={s.id} href={`/alumnos/${s.alumnoId}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[#EBEBEB]">
                      {a?.foto
                        ? <img src={a.foto} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EBEBEB] text-[12px] font-bold text-[#9B9B9B]">
                            {a?.nombre[0]?.toUpperCase() ?? '?'}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#2A2A2A]">
                          <span className="font-medium">{a?.nombre ?? 'Alumno'}</span>
                          <span className="text-[#9B9B9B]"> · {s.bloqueNombre}</span>
                        </p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          {s.ejercicios.length} ejercicios · {s.fecha === TODAY ? 'Hoy' : s.fecha}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {sesiones.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#D8D8D8] py-10 text-center">
              <p className="text-[13px] text-[#AAAAAA]">Sin sesiones registradas aún.</p>
              <Link href="/weightroom"
                className="mt-2 inline-block text-[12px] text-[#9B9B9B] transition hover:text-[#6E6E6E]">
                Ir al Weightroom →
              </Link>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Quién debe renovar el plan */}
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="flex items-center justify-between border-b border-[#EBEBEB] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]">
                Renovaciones pendientes
              </p>
              <RefreshCw size={12} className="text-[#D8D8D8]" />
            </div>
            {planesRenovar.length === 0 ? (
              <div className="px-5 py-5 text-center">
                <p className="text-[13px] text-[#AAAAAA]">Todos los planes al día.</p>
              </div>
            ) : (
              <div className="p-2">
                {planesRenovar.map(({ plan, estado }) => {
                  const cfg    = ESTADO_CONFIG[estado];
                  const alumno = alumnoMap[plan.alumnoId];
                  return (
                    <Link key={plan.id} href={`/alumnos/${plan.alumnoId}`}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition hover:bg-[#EBEBEB]">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#EBEBEB] text-[11px] font-bold text-[#9B9B9B]">
                        {alumno?.nombre[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[12px] font-medium text-[#121212]">
                          {alumno ? `${alumno.nombre} ${alumno.apellido ?? ''}`.trim() : 'Alumno'}
                        </p>
                        <p className="text-[10px]" style={{ color: cfg.color }}>{cfg.label}</p>
                      </div>
                      <ChevronRight size={12} className="shrink-0 text-[#D8D8D8]" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Alumnos */}
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="flex items-center justify-between border-b border-[#EBEBEB] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]">Alumnos</p>
              <Link href="/alumnos" className="text-[11px] text-[#AAAAAA] transition hover:text-[#6E6E6E]">
                Ver todos →
              </Link>
            </div>
            {alumnos.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-[13px] text-[#AAAAAA]">Sin alumnos aún.</p>
                <Link href="/alumnos" className="mt-1.5 inline-block text-[12px] text-[#121212]">Agregar →</Link>
              </div>
            ) : (
              <div className="p-2">
                {alumnos.slice(0, 8).map(a => {
                  const tieneRutina = activeRoutines.some(r => (r.alumno_ids ?? []).includes(a.id));
                  return (
                    <Link key={a.id} href={`/alumnos/${a.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-[#EBEBEB]">
                      {a.foto
                        ? <img src={a.foto} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                        : <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#EBEBEB] text-[11px] font-bold text-[#9B9B9B]">
                            {a.nombre[0]?.toUpperCase()}
                          </div>
                      }
                      <span className="flex-1 truncate text-[13px] text-[#3E3E3E]">
                        {a.nombre} {a.apellido}
                      </span>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tieneRutina ? 'bg-[#4A8A5A]' : 'bg-[#D8D8D8]'}`} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Acceso rápido */}
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="border-b border-[#EBEBEB] px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]">Acceso rápido</p>
            </div>
            <div className="p-2">
              {[
                { href: '/weightroom', label: 'Abrir Weightroom' },
                { href: '/rutinas',    label: 'Ver Calendario' },
                { href: '/alumnos',    label: 'Mis Alumnos' },
                { href: '/biblioteca', label: 'Ejercicios' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] text-[#9B9B9B] transition hover:bg-[#EBEBEB] hover:text-[#121212]">
                  {label}
                  <ChevronRight size={12} className="text-[#DCDCDC]" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
