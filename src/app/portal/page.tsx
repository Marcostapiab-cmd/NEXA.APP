'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Calendar, Dumbbell, CreditCard, LogOut, ChevronRight, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface AtletaPortal {
  id: string;
  nombre: string;
  apellido: string;
  email?: string;
  foto?: string;
}

interface Reserva {
  id: string;
  fecha: string;
  hora?: string;
  estado: string;
  descripcion?: string;
}

interface Plan {
  id: string;
  nombre: string;
  totalClases?: number;
  usedClases?: number;
  startDate?: string;
  endDate?: string;
}

interface Pago {
  id: string;
  monto: number;
  estado: string;
  descripcion?: string;
  checkoutUrl?: string;
  createdAt: string;
}

const ESTADO_RESERVA: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',   color: '#d97706' },
  asistio:    { label: 'Asistió',     color: '#16a34a' },
  ausente:    { label: 'No asistió',  color: '#dc2626' },
  reagendada: { label: 'Reagendada',  color: '#6b7280' },
};

export default function PortalPage() {
  const router = useRouter();
  const [atleta,   setAtleta]   = useState<AtletaPortal | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [pagos,    setPagos]    = useState<Pago[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/portal/login'); return; }

      // Buscar atleta vinculado a este user
      const { data: atletaData } = await supabase
        .from('atletas')
        .select('id, nombre, apellido, email, foto')
        .eq('user_id', user.id)
        .single();

      if (!atletaData) { router.push('/portal/sin-cuenta'); return; }
      setAtleta(atletaData as AtletaPortal);

      const aid = (atletaData as AtletaPortal).id;

      // Próximas reservas (últimas 10 ordenadas por fecha desc)
      const { data: resData } = await supabase
        .from('reservas')
        .select('id, fecha, hora, estado, descripcion')
        .eq('alumno_id', aid)
        .order('fecha', { ascending: false })
        .limit(10);
      setReservas((resData ?? []) as Reserva[]);

      // Planes activos
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: planesData } = await supabase
        .from('planes')
        .select('id, nombre, total_clases, used_clases, start_date, end_date')
        .eq('alumno_id', aid)
        .gte('end_date', hoy)
        .order('end_date', { ascending: true });
      setPlanes((planesData ?? []).map((p: Record<string, unknown>) => ({
        id:          String(p.id),
        nombre:      String(p.nombre ?? ''),
        totalClases: p.total_clases ? Number(p.total_clases) : undefined,
        usedClases:  p.used_clases  ? Number(p.used_clases)  : undefined,
        startDate:   p.start_date ? String(p.start_date) : undefined,
        endDate:     p.end_date   ? String(p.end_date)   : undefined,
      })));

      // Pagos pendientes
      const { data: pagosData } = await supabase
        .from('pagos')
        .select('id, monto, estado, descripcion, checkout_url, created_at')
        .eq('alumno_id', aid)
        .order('created_at', { ascending: false })
        .limit(5);
      setPagos((pagosData ?? []).map((p: Record<string, unknown>) => ({
        id:          String(p.id),
        monto:       Number(p.monto),
        estado:      String(p.estado),
        descripcion: p.descripcion ? String(p.descripcion) : undefined,
        checkoutUrl: p.checkout_url ? String(p.checkout_url) : undefined,
        createdAt:   String(p.created_at),
      })));

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/portal/login');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  if (!atleta) return null;

  const proximasReservas = reservas.filter(r => r.fecha >= new Date().toISOString().slice(0, 10)).slice(0, 3);
  const pagosPendientes  = pagos.filter(p => p.estado === 'pendiente');
  const planActivo       = planes[0];

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Header */}
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            {atleta.foto
              ? <img src={atleta.foto} alt="" className="h-10 w-10 rounded-full object-cover" />
              : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#121212] text-sm font-black text-white">
                  {atleta.nombre[0]?.toUpperCase()}
                </div>
            }
            <div>
              <p className="font-bold text-[#121212]">Hola, {atleta.nombre} 👋</p>
              <p className="text-xs text-[#5E5E5E]">NEXA Training Studio</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] transition hover:text-[#121212]">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">

        {/* Alerta pagos pendientes */}
        {pagosPendientes.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800">
                  {pagosPendientes.length === 1 ? 'Tienes un pago pendiente' : `Tienes ${pagosPendientes.length} pagos pendientes`}
                </p>
                {pagosPendientes.map(p => (
                  <div key={p.id} className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-amber-700">{p.descripcion} — ${p.monto.toLocaleString('es-CL')} CLP</span>
                    {p.checkoutUrl && (
                      <a href={p.checkoutUrl} target="_blank" rel="noreferrer"
                        className="ml-3 shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700">
                        Pagar ahora
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Plan activo */}
        {planActivo && (
          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-[#5E5E5E]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Plan activo</p>
            </div>
            <p className="font-bold text-[#121212]">{planActivo.nombre}</p>
            {planActivo.totalClases && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-[#5E5E5E]">
                  <span>{planActivo.usedClases ?? 0} clases usadas</span>
                  <span>{planActivo.totalClases} total</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#EBEBEB]">
                  <div
                    className="h-full rounded-full bg-[#121212] transition-all"
                    style={{ width: `${Math.min(100, ((planActivo.usedClases ?? 0) / planActivo.totalClases) * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#5E5E5E]">
                  {planActivo.totalClases - (planActivo.usedClases ?? 0)} clases disponibles
                  {planActivo.endDate && ` · Vence ${new Date(planActivo.endDate).toLocaleDateString('es-CL')}`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Próximas clases */}
        <div className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#5E5E5E]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Mis clases</p>
            </div>
          </div>
          {proximasReservas.length === 0 ? (
            <p className="text-sm text-[#9B9B9B]">Sin clases próximas programadas.</p>
          ) : (
            <div className="space-y-2">
              {proximasReservas.map(r => {
                const est = ESTADO_RESERVA[r.estado] ?? { label: r.estado, color: '#5E5E5E' };
                return (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-[#EBEBEB] bg-[#F8F8F8] px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#121212]">
                        {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      {r.hora && <p className="text-xs text-[#5E5E5E]">{r.hora}</p>}
                    </div>
                    <span className="text-xs font-bold" style={{ color: est.color }}>{est.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accesos rápidos */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/portal/rutinas"
            className="flex items-center justify-between rounded-2xl border border-[#D8D8D8] bg-white p-4 transition hover:border-[#121212]">
            <div>
              <Dumbbell className="mb-2 h-5 w-5 text-[#121212]" />
              <p className="font-bold text-[#121212]">Mis rutinas</p>
              <p className="text-xs text-[#5E5E5E]">Ver ejercicios</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#9B9B9B]" />
          </Link>

          <Link href="/portal/pagos"
            className="flex items-center justify-between rounded-2xl border border-[#D8D8D8] bg-white p-4 transition hover:border-[#121212]">
            <div>
              <CreditCard className="mb-2 h-5 w-5 text-[#121212]" />
              <p className="font-bold text-[#121212]">Mis pagos</p>
              <p className="text-xs text-[#5E5E5E]">Historial</p>
            </div>
            {pagosPendientes.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-white">
                {pagosPendientes.length}
              </span>
            )}
            {pagosPendientes.length === 0 && <ChevronRight className="h-4 w-4 text-[#9B9B9B]" />}
          </Link>
        </div>

        {/* Historial reciente */}
        {reservas.filter(r => r.fecha < new Date().toISOString().slice(0, 10)).length > 0 && (
          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Historial reciente</p>
            <div className="space-y-2">
              {reservas.filter(r => r.fecha < new Date().toISOString().slice(0, 10)).slice(0, 5).map(r => {
                const asistio = r.estado === 'asistio';
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    {asistio
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      : <Clock className="h-4 w-4 shrink-0 text-[#CACACA]" />
                    }
                    <span className="text-sm text-[#5E5E5E]">
                      {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                      {r.hora && ` · ${r.hora}`}
                    </span>
                    <span className="ml-auto text-xs" style={{ color: asistio ? '#16a34a' : '#9B9B9B' }}>
                      {asistio ? 'Asistió' : ESTADO_RESERVA[r.estado]?.label ?? r.estado}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
