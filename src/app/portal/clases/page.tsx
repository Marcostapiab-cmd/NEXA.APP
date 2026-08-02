'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, CheckCircle2, Clock, XCircle, RefreshCw, Calendar } from 'lucide-react';
import Link from 'next/link';

interface Reserva {
  id: string;
  fecha: string;
  hora?: string;
  estado: string;
  descripcion?: string;
}

const ESTADO: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pendiente:        { label: 'Pendiente',  icon: Clock,        color: '#d97706', bg: '#fffbeb' },
  confirmada:       { label: 'Confirmada', icon: CheckCircle2, color: '#2563eb', bg: '#eff6ff' },
  presente:         { label: 'Asistió',    icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
  no_show:          { label: 'No asistió', icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  cancelada_tarde:  { label: 'Cancelada',  icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  cancelada_tiempo: { label: 'Cancelada',  icon: XCircle,      color: '#9B9B9B', bg: '#f9fafb' },
  cancelada_nexa:   { label: 'Cancelada',  icon: XCircle,      color: '#9B9B9B', bg: '#f9fafb' },
  reagendada:       { label: 'Reagendada', icon: RefreshCw,    color: '#6b7280', bg: '#f9fafb' },
};

function agruparPorMes(reservas: Reserva[]): Record<string, Reserva[]> {
  const grupos: Record<string, Reserva[]> = {};
  for (const r of reservas) {
    const key = r.fecha.slice(0, 7); // YYYY-MM
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(r);
  }
  return grupos;
}

function nombreMes(yyyymm: string) {
  const [y, m] = yyyymm.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}

export default function PortalClasesPage() {
  const router  = useRouter();
  const [reservas,  setReservas]  = useState<Reserva[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filtro,    setFiltro]    = useState<'todas' | 'proximas' | 'historial'>('proximas');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/portal/login'); return; }

      const { data: atletaData } = await supabase
        .from('atletas').select('id').eq('user_id', user.id).single();
      if (!atletaData) { router.push('/portal/sin-cuenta'); return; }

      const { data } = await supabase
        .from('reservas')
        .select('id, fecha, hora, estado, descripcion')
        .eq('alumno_id', (atletaData as { id: string }).id)
        .order('fecha', { ascending: false })
        .limit(100);

      setReservas((data ?? []) as Reserva[]);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);

  const filtradas = reservas.filter(r => {
    if (filtro === 'proximas')  return r.fecha >= hoy;
    if (filtro === 'historial') return r.fecha < hoy;
    return true;
  });

  // Próximas van en orden ascendente, historial en descendente
  const ordenadas = filtro === 'proximas'
    ? [...filtradas].sort((a, b) => a.fecha.localeCompare(b.fecha))
    : filtradas;

  const grupos = agruparPorMes(ordenadas);
  const meses  = Object.keys(grupos).sort((a, b) =>
    filtro === 'proximas' ? a.localeCompare(b) : b.localeCompare(a)
  );

  const totalProximas  = reservas.filter(r => r.fecha >= hoy).length;
  const totalAsistidas = reservas.filter(r => ['presente','asistio'].includes(r.estado)).length;

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Mis clases</h1>
            <p className="text-xs text-[#5E5E5E]">Agenda y historial</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-4 text-center">
            <p className="text-2xl font-black text-[#121212]">{totalProximas}</p>
            <p className="mt-0.5 text-xs text-[#5E5E5E]">Próximas clases</p>
          </div>
          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-4 text-center">
            <p className="text-2xl font-black text-[#121212]">{totalAsistidas}</p>
            <p className="mt-0.5 text-xs text-[#5E5E5E]">Clases completadas</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-5 flex gap-2">
          {(['proximas', 'historial', 'todas'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={filtro === f
                ? { background: '#121212', color: '#fff' }
                : { background: '#fff', color: '#5E5E5E', border: '1px solid #D8D8D8' }
              }
            >
              {f === 'proximas' ? 'Próximas' : f === 'historial' ? 'Historial' : 'Todas'}
            </button>
          ))}
        </div>

        {/* Lista agrupada por mes */}
        {meses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D8D8] bg-white py-16 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
            <p className="font-semibold text-[#5E5E5E]">Sin clases</p>
            <p className="mt-1 text-sm text-[#9B9B9B]">
              {filtro === 'proximas' ? 'No tienes clases programadas.' : 'Sin historial aún.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {meses.map(mes => (
              <div key={mes}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9B9B9B]">
                  {nombreMes(mes)}
                </p>
                <div className="space-y-2">
                  {grupos[mes].map(r => {
                    const cfg = ESTADO[r.estado] ?? ESTADO.pendiente;
                    const Icn = cfg.icon;
                    const esHoy = r.fecha === hoy;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-4 rounded-2xl border bg-white px-4 py-3.5"
                        style={{ borderColor: esHoy ? '#121212' : '#D8D8D8' }}
                      >
                        {/* Fecha */}
                        <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-1"
                          style={{ background: esHoy ? '#121212' : '#F5F5F5' }}>
                          <span className="text-[10px] font-bold uppercase"
                            style={{ color: esHoy ? '#fff' : '#9B9B9B' }}>
                            {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { month: 'short' })}
                          </span>
                          <span className="text-xl font-black leading-none"
                            style={{ color: esHoy ? '#fff' : '#121212' }}>
                            {new Date(r.fecha + 'T12:00:00').getDate()}
                          </span>
                          <span className="text-[10px]"
                            style={{ color: esHoy ? '#ccc' : '#9B9B9B' }}>
                            {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short' })}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                          {r.hora && (
                            <p className="text-xs text-[#5E5E5E]">{r.hora}</p>
                          )}
                          <p className="font-semibold text-[#121212]">
                            {r.descripcion || 'Clase'}
                          </p>
                          {esHoy && (
                            <span className="mt-0.5 inline-block rounded-full bg-[#121212] px-2 py-0.5 text-[10px] font-bold text-white">
                              Hoy
                            </span>
                          )}
                        </div>

                        {/* Estado */}
                        <div className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ color: cfg.color, background: cfg.bg }}>
                          <Icn className="h-3 w-3" />
                          {cfg.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
