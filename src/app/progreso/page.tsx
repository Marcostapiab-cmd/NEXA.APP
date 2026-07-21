'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { TrendingUp, Users, Dumbbell, ChevronRight, CheckCircle } from 'lucide-react';
import { getAlumnos } from '@/lib/alumnos';
import type { Alumno } from '@/app/alumnos/page';
import type { Sesion } from '@/lib/sesiones';
import { getSesionesDB } from '@/lib/sesiones-supabase';
import type { Plan, Reserva } from '@/lib/planes';
import { getClasesRestantes } from '@/lib/planes';
import { getAllPlanesDB, getAllReservasDB } from '@/lib/planes-supabase';

const SL = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]';

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end:   sunday.toISOString().slice(0, 10),
  };
}

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ProgresoPage() {
  const [alumnos,  setAlumnos]  = useState<Alumno[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);

  useEffect(() => {
    getAlumnos().then(setAlumnos).catch(() => {
      try { const a = localStorage.getItem('nexa_alumnos'); if (a) setAlumnos(JSON.parse(a)); } catch {}
    });
    getSesionesDB().then(setSesiones).catch(() => {
      try { const s = localStorage.getItem('nexa_sesiones'); if (s) setSesiones(JSON.parse(s)); } catch {}
    });
    getAllPlanesDB().then(setPlanes).catch(() => {});
    getAllReservasDB().then(setReservas).catch(() => {});
  }, []);

  const alumnoMap = useMemo(
    () => Object.fromEntries(alumnos.map(a => [a.id, a])),
    [alumnos]
  );

  const week       = getWeekRange();
  const monthStart = getMonthStart();

  /* ── Stats generales ── */
  const sesionesEsSemana = sesiones.filter(s => s.fecha >= week.start && s.fecha <= week.end);
  const sesionesEsMes    = sesiones.filter(s => s.fecha >= monthStart);

  const totalReservasActivas = reservas.filter(r =>
    r.estado !== 'cancelada_nexa' && r.estado !== 'bloqueada' && r.estado !== 'reagendada'
  ).length;
  const totalPresentes = reservas.filter(r => r.estado === 'presente').length;
  const tasaAsistencia = totalReservasActivas > 0
    ? Math.round((totalPresentes / totalReservasActivas) * 100)
    : null;

  const alumnosConSesionEsMes = new Set(sesionesEsMes.map(s => s.alumnoId)).size;

  /* ── Ranking por alumno ── */
  const rankingAlumnos = alumnos.map(a => {
    const sesAlumno  = sesiones.filter(s => s.alumnoId === a.id);
    const ultimaSes  = sesAlumno.sort((x, y) => y.fecha.localeCompare(x.fecha))[0];
    const planActivo = planes
      .filter(p => p.alumnoId === a.id)
      .sort((x, y) => y.startDate.localeCompare(x.startDate))[0];
    return {
      alumno:        a,
      totalSesiones: sesAlumno.length,
      ultimaFecha:   ultimaSes?.fecha ?? null,
      clasesRestantes: planActivo ? getClasesRestantes(planActivo) : null,
    };
  }).sort((a, b) => b.totalSesiones - a.totalSesiones);

  /* ── Récords por ejercicio ── */
  const recordsMap: Record<string, { peso: number; fecha: string; alumnoId: string }> = {};
  for (const sesion of sesiones) {
    for (const ej of sesion.ejercicios) {
      for (const serie of ej.series) {
        if (!serie.completada) continue;
        const peso = parseFloat(serie.peso);
        if (!peso || isNaN(peso)) continue;
        const prev = recordsMap[ej.nombre];
        if (!prev || peso > prev.peso) {
          recordsMap[ej.nombre] = { peso, fecha: sesion.fecha, alumnoId: sesion.alumnoId };
        }
      }
    }
  }
  const records = Object.entries(recordsMap)
    .map(([nombre, r]) => ({ nombre, ...r }))
    .sort((a, b) => b.peso - a.peso);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">

      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#121212]">Progreso</h1>
        <p className="mt-1 text-sm text-[#5E5E5E]">Resumen general del estudio</p>
      </div>

      {/* ── Stats generales ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Dumbbell,    label: 'Sesiones esta semana', value: sesionesEsSemana.length },
          { icon: TrendingUp,  label: 'Sesiones este mes',    value: sesionesEsMes.length },
          { icon: CheckCircle, label: 'Tasa de asistencia',   value: tasaAsistencia !== null ? `${tasaAsistencia}%` : '—' },
          { icon: Users,       label: 'Activos este mes',     value: alumnosConSesionEsMes },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-[#E8E8E8] bg-[#F5F5F5] p-4">
            <Icon size={14} strokeWidth={1.75} className="text-[#CACACA]" />
            <p className="mt-3 text-[22px] font-black tracking-tight text-[#121212]">{value}</p>
            <p className="mt-0.5 text-[11px] text-[#9B9B9B]">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">

        {/* Columna principal */}
        <div className="space-y-4">

          {/* Ranking por alumno */}
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="border-b border-[#EBEBEB] px-5 py-3.5">
              <p className={SL}>Resumen por alumno</p>
            </div>
            {rankingAlumnos.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#9B9B9B]">Sin datos aún.</p>
            ) : (
              <div className="divide-y divide-[#EBEBEB]">
                {rankingAlumnos.map(({ alumno, totalSesiones, ultimaFecha, clasesRestantes }) => (
                  <Link key={alumno.id} href={`/alumnos/${alumno.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-[#EBEBEB]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E4E4E4] text-[13px] font-bold text-[#9B9B9B]">
                      {alumno.nombre[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#121212]">
                        {alumno.nombre} {alumno.apellido}
                      </p>
                      <p className="text-[11px] text-[#9B9B9B]">
                        {ultimaFecha ? `Última sesión: ${ultimaFecha}` : 'Sin sesiones'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-bold text-[#121212]">{totalSesiones}</p>
                        <p className="text-[10px] text-[#AAAAAA]">sesiones</p>
                      </div>
                      {clasesRestantes !== null && (
                        <div>
                          <p className="text-sm font-bold text-[#121212]">{clasesRestantes}</p>
                          <p className="text-[10px] text-[#AAAAAA]">clases</p>
                        </div>
                      )}
                      <ChevronRight size={13} className="text-[#D8D8D8]" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Récords por ejercicio */}
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="border-b border-[#EBEBEB] px-5 py-3.5">
              <p className={SL}>Récords por ejercicio</p>
            </div>
            {records.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#9B9B9B]">
                Sin sesiones registradas en Weightroom aún.
              </p>
            ) : (
              <div className="divide-y divide-[#EBEBEB]">
                {records.map(({ nombre, peso, fecha, alumnoId }) => {
                  const a = alumnoMap[alumnoId];
                  return (
                    <div key={nombre} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#121212]">{nombre}</p>
                        <p className="text-[11px] text-[#9B9B9B]">
                          {a ? `${a.nombre} · ` : ''}{fecha}
                        </p>
                      </div>
                      <span className="ml-4 shrink-0 text-lg font-black text-[#121212]">
                        {peso} kg
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: asistencia */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
            <div className="border-b border-[#EBEBEB] px-5 py-3.5">
              <p className={SL}>Asistencia general</p>
            </div>
            <div className="space-y-2 p-5">
              {[
                { label: 'Presente',          value: reservas.filter(r => r.estado === 'presente').length,          color: '#22c55e' },
                { label: 'No avisó',           value: reservas.filter(r => r.estado === 'no_show').length,          color: '#ef4444' },
                { label: 'Canceló tarde',      value: reservas.filter(r => r.estado === 'cancelada_tarde').length,  color: '#f97316' },
                { label: 'Canceló a tiempo',   value: reservas.filter(r => r.estado === 'cancelada_tiempo').length, color: '#9B9B9B' },
                { label: 'Cancelada por NEXA', value: reservas.filter(r => r.estado === 'cancelada_nexa').length,   color: '#64748b' },
                { label: 'Pendiente',          value: reservas.filter(r => r.estado === 'pendiente').length,        color: '#888888' },
                { label: 'Confirmada',         value: reservas.filter(r => r.estado === 'confirmada').length,       color: '#3b82f6' },
              ].filter(row => row.value > 0).map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[#5E5E5E]">{label}</span>
                  </div>
                  <span className="font-semibold text-[#121212]">{value}</span>
                </div>
              ))}
              {reservas.length === 0 && (
                <p className="text-sm text-[#9B9B9B]">Sin reservas registradas.</p>
              )}
              {reservas.length > 0 && (
                <div className="mt-3 border-t border-[#EBEBEB] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#5E5E5E]">Total reservas</span>
                    <span className="font-bold text-[#121212]">{reservas.length}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
