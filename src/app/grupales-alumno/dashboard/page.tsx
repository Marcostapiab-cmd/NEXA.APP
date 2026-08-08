'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ShoppingBag, Calendar, LogOut, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { MESES_CORTO } from '@/lib/format';

interface Alumno { id: string; nombre: string; apellido: string; email: string }

interface Compra {
  id: string;
  clases_totales: number;
  clases_restantes: number;
  clases_usadas: number;
  fecha_expira: string;
  estado_pago: string;
  grupales_packs: { nombre: string }[] | null;
}

interface Reserva {
  id: string;
  fecha: string;
  hora: string;
  nombre_clase: string;
  estado: string;
}

function formatFecha(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

function formatExpira(iso: string) {
  const d   = new Date(iso);
  const now = new Date();
  const dias = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (dias <= 0) return 'Vencido';
  if (dias === 1) return '1 día restante';
  return `${dias} días restantes`;
}

function estadoIcon(estado: string) {
  if (estado === 'reservada')  return <Clock       size={13} style={{ color: 'var(--nexa-warning)' }} />;
  if (estado === 'asistida')   return <CheckCircle2 size={13} style={{ color: 'var(--nexa-success)' }} />;
  return <XCircle size={13} style={{ color: 'var(--nexa-muted)' }} />;
}

export default function DashboardPage() {
  const router = useRouter();
  const [alumno,   setAlumno]   = useState<Alumno | null>(null);
  const [compras,  setCompras]  = useState<Compra[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading,  setLoading]  = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/grupales-alumno/login'); return; }

    const [{ data: al }, { data: comp }, { data: res }] = await Promise.all([
      supabase.from('grupales_alumnos').select('id, nombre, apellido, email').eq('user_id', user.id).single(),
      supabase.from('grupales_compras')
        .select('id, clases_totales, clases_restantes, clases_usadas, fecha_expira, estado_pago, grupales_packs(nombre)')
        .eq('estado_pago', 'pagado')
        .order('fecha_expira', { ascending: true }),
      supabase.from('grupales_reservas')
        .select('id, fecha, hora, nombre_clase, estado')
        .order('fecha', { ascending: true })
        .order('hora',  { ascending: true })
        .limit(20),
    ]);

    setAlumno(al);
    setCompras((comp ?? []) as Compra[]);
    setReservas((res ?? []) as Reserva[]);
    setLoading(false);
  }, [router]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push('/grupales-alumno/login');
  }

  // Compra activa: no vencida y con clases restantes
  const now = new Date();
  const compraActiva = compras.find(c =>
    c.clases_restantes > 0 && new Date(c.fecha_expira) > now
  );

  const totalRestantes = compras
    .filter(c => new Date(c.fecha_expira) > now)
    .reduce((a, c) => a + c.clases_restantes, 0);

  const proximasReservas = reservas.filter(r => r.estado === 'reservada' && new Date(r.fecha + 'T23:59:59') >= now);
  const historial        = reservas.filter(r => r.estado !== 'reservada' || new Date(r.fecha + 'T23:59:59') < now);

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--nexa-surface)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
        style={{ background: 'var(--nexa-bg)', borderBottom: '1px solid var(--nexa-border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'var(--nexa-text)' }}>
            <span className="text-[11px] font-black" style={{ color: '#fff' }}>N</span>
          </div>
          <div>
            <p className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>
              {loading ? '…' : alumno ? `${alumno.nombre} ${alumno.apellido}` : 'NEXA'}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--nexa-muted)' }}>Portal clases grupales</p>
          </div>
        </div>
        <button onClick={cerrarSesion} title="Cerrar sesión"
          className="rounded-lg p-2" style={{ color: 'var(--nexa-muted)' }}>
          <LogOut size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">

        {/* Saldo de clases */}
        <div className="overflow-hidden rounded-2xl"
          style={{ background: 'var(--nexa-text)', color: '#fff' }}>
          <div className="px-5 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-60">Tu saldo</p>
            {loading ? (
              <div className="mt-2 h-10 w-24 animate-pulse rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }} />
            ) : (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[52px] font-black leading-none">{totalRestantes}</span>
                  <span className="text-[18px] font-semibold opacity-70">
                    {totalRestantes === 1 ? 'clase' : 'clases'}
                  </span>
                </div>
                {compraActiva ? (
                  <p className="mt-1 text-[12px] opacity-60">
                    {formatExpira(compraActiva.fecha_expira)} · {compraActiva.grupales_packs?.[0]?.nombre ?? 'Pack activo'}
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] opacity-60">Sin pack activo</p>
                )}
              </>
            )}
          </div>

          {/* Barra de uso */}
          {!loading && compraActiva && (
            <div className="px-5 pb-5">
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
                <div className="h-full rounded-full" style={{
                  background: '#fff',
                  width: `${Math.round((compraActiva.clases_usadas / compraActiva.clases_totales) * 100)}%`,
                }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] opacity-50">
                <span>{compraActiva.clases_usadas} usadas</span>
                <span>{compraActiva.clases_totales} en total</span>
              </div>
            </div>
          )}
        </div>

        {/* Acciones principales */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/grupales-alumno/comprar"
            className="flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'var(--nexa-card-alt)' }}>
              <ShoppingBag size={20} style={{ color: 'var(--nexa-text)' }} />
            </div>
            <div>
              <p className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>Comprar pack</p>
              <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>8, 12 o 20 clases</p>
            </div>
          </Link>

          <Link href={totalRestantes > 0 ? '/grupales-alumno/reservar' : '/grupales-alumno/comprar'}
            className="flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'var(--nexa-card-alt)' }}>
              <Calendar size={20} style={{ color: 'var(--nexa-text)' }} />
            </div>
            <div>
              <p className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>Reservar clase</p>
              <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                {totalRestantes > 0 ? 'Ver horario disponible' : 'Compra un pack primero'}
              </p>
            </div>
          </Link>
        </div>

        {/* Próximas reservas */}
        {!loading && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--nexa-border)' }}>
              <p className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>Próximas clases</p>
              <Link href="/grupales-alumno/reservar" className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: 'var(--nexa-muted)' }}>
                Reservar <ChevronRight size={12} />
              </Link>
            </div>
            {proximasReservas.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Sin clases próximas</p>
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
                {proximasReservas.slice(0, 5).map(r => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-center"
                      style={{ background: 'var(--nexa-card-alt)' }}>
                      <span className="text-[14px] font-black" style={{ color: 'var(--nexa-text)' }}>
                        {new Date(r.fecha + 'T12:00:00').getDate()}
                      </span>
                      <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>
                        {MESES[new Date(r.fecha + 'T12:00:00').getMonth()]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text)' }}>{r.nombre_clase}</p>
                      <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>{r.hora}</p>
                    </div>
                    {estadoIcon(r.estado)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Historial */}
        {!loading && historial.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--nexa-border)' }}>
              <p className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>Historial</p>
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
              {historial.slice(0, 8).map(r => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text-sub)' }}>{r.nombre_clase}</p>
                    <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>{formatFecha(r.fecha)} · {r.hora}</p>
                  </div>
                  {estadoIcon(r.estado)}
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
