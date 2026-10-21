'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { clp, DIAS_LARGO, MESES_CORTO, MESES_LARGO } from '@/lib/format';

interface Alumno { id: string; nombre: string; apellido: string; email: string }
type Rel = { nombre: string } | { nombre: string }[] | null;
interface Compra {
  id: string; clases_totales: number; clases_usadas: number; clases_restantes: number;
  fecha_compra: string; fecha_expira: string; estado_pago: string; monto_clp: number;
  planes_grupales: Rel; grupales_packs: Rel;
}
interface Reserva { id: string; fecha: string; hora: string; nombre_clase: string; estado: string }

const nombreRel = (r: Rel) => (Array.isArray(r) ? r[0]?.nombre : r?.nombre);
const fechaCorta = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES_CORTO[d.getMonth()]} ${d.getFullYear()}`; };
const fechaLarga = (f: string) => { const d = new Date(`${f}T12:00:00`); return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`; };

const ESTADO_PAGO: Record<string, { label: string; cls: string }> = {
  pagado:    { label: 'Pagado',    cls: 'nexa-badge-active' },
  pendiente: { label: 'Pendiente', cls: 'nexa-badge-pending' },
  fallido:   { label: 'Rechazado', cls: 'nexa-badge-danger' },
  cancelado: { label: 'Anulado',   cls: 'nexa-badge-danger' },
};

export default function DashboardGrupal() {
  const router = useRouter();
  const [alumno,   setAlumno]   = useState<Alumno | null>(null);
  const [compras,  setCompras]  = useState<Compra[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [estado,   setEstado]   = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [saliendo, setSaliendo] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/grupales-alumno/login'); return; }
    const { data: al, error: e1 } = await supabase.from('grupales_alumnos')
      .select('id, nombre, apellido, email').eq('user_id', user.id).maybeSingle();
    if (e1 || !al) { setEstado('error'); return; }
    const [c, r] = await Promise.all([
      supabase.from('grupales_compras')
        .select('id, clases_totales, clases_usadas, clases_restantes, fecha_compra, fecha_expira, estado_pago, monto_clp, planes_grupales(nombre), grupales_packs(nombre)')
        .eq('alumno_id', (al as Alumno).id).order('creado_en', { ascending: false }),
      supabase.from('grupales_reservas')
        .select('id, fecha, hora, nombre_clase, estado')
        .eq('alumno_id', (al as Alumno).id).order('fecha', { ascending: false }).order('hora', { ascending: false }),
    ]);
    if (c.error || r.error) { setEstado('error'); return; }
    setAlumno(al as Alumno);
    setCompras((c.data ?? []) as unknown as Compra[]);
    setReservas((r.data ?? []) as Reserva[]);
    setEstado('ok');
  }, [router]);

  // Carga inicial (los datos se aplican en el callback, no durante el efecto)
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  async function salir() {
    setSaliendo(true);
    await supabase.auth.signOut();
    router.replace('/grupales-alumno/login');
    router.refresh();
  }

  if (estado === 'cargando') {
    return (
      <div className="nx-container space-y-4" aria-busy="true">
        <div className="nx-skeleton h-10 w-64" />
        <div className="nx-skeleton h-40 w-full" />
        <div className="nx-skeleton h-56 w-full" />
      </div>
    );
  }
  if (estado === 'error' || !alumno) {
    return (
      <div className="nx-container">
        <div className="nx-alert nx-alert-error flex flex-wrap items-center justify-between gap-3" role="alert">
          No pudimos cargar tu cuenta.
          <button type="button" onClick={() => { setEstado('cargando'); cargar(); }} className="nx-btn nx-btn-outline" style={{ minHeight: 40 }}>
            <RefreshCw size={14} aria-hidden /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  const ahora   = new Date();
  const activas = compras.filter(c => c.estado_pago === 'pagado' && new Date(c.fecha_expira) > ahora && c.clases_restantes > 0);
  const saldo   = activas.reduce((a, c) => a + c.clases_restantes, 0);
  const proxVence = activas.map(c => c.fecha_expira).sort()[0];
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const proximas = reservas.filter(r => r.estado === 'reservada' && r.fecha >= hoy).reverse();
  const pasadas  = reservas.filter(r => !(r.estado === 'reservada' && r.fecha >= hoy));

  return (
    <div className="nx-container space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nx-eyebrow mb-2">Mi cuenta</p>
          <h1 className="nx-display text-[32px] sm:text-[40px]" style={{ color: 'var(--nx-white)' }}>Hola, {alumno.nombre}.</h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--nx-muted)' }}>{alumno.email}</p>
        </div>
        <button type="button" onClick={salir} disabled={saliendo} className="nx-btn nx-btn-ghost">
          <LogOut size={16} aria-hidden /> Cerrar sesión
        </button>
      </div>

      <section aria-label="Saldo de clases" className="nx-card grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div>
          <p className="nx-eyebrow mb-3">Clases disponibles</p>
          <p className="nx-display text-[56px] leading-none" style={{ color: 'var(--nx-white)' }}>{saldo}</p>
          <p className="mt-3 text-[14px]" style={{ color: 'var(--nx-muted)' }}>
            {saldo > 0 && proxVence ? `Tu próximo vencimiento es el ${fechaCorta(proxVence)}.` : 'No tienes clases disponibles en este momento.'}
          </p>
        </div>
        {saldo > 0
          ? <Link href="/grupales-alumno/reservar" className="nx-btn nx-btn-primary"><CalendarPlus size={16} aria-hidden /> Reservar clase</Link>
          : <Link href="/planes#grupales" className="nx-btn nx-btn-primary">Comprar plan</Link>}
      </section>

      <section aria-labelledby="proximas-t">
        <h2 id="proximas-t" className="mb-4 text-[18px] font-bold" style={{ color: 'var(--nx-white)' }}>Próximas clases</h2>
        {proximas.length === 0
          ? <p className="nx-alert nx-alert-info">No tienes clases reservadas.</p>
          : (
            <ul className="space-y-2">
              {proximas.map(r => (
                <li key={r.id} className="nx-card flex items-center gap-4 px-4 py-3">
                  <span className="w-14 shrink-0 text-[17px] font-bold tabular-nums" style={{ color: 'var(--nx-white)' }}>{r.hora}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold" style={{ color: 'var(--nx-white)' }}>{r.nombre_clase}</span>
                    <span className="text-[13px]" style={{ color: 'var(--nx-muted)' }}>{fechaLarga(r.fecha)}</span>
                  </span>
                  <span className="nexa-badge-active shrink-0">Reservada</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-labelledby="compras-t">
        <h2 id="compras-t" className="mb-4 text-[18px] font-bold" style={{ color: 'var(--nx-white)' }}>Mis planes</h2>
        {compras.length === 0
          ? <p className="nx-alert nx-alert-info">Aún no has comprado planes. <Link href="/planes#grupales" className="underline">Ver planes</Link></p>
          : (
            <ul className="space-y-2">
              {compras.map(c => {
                const vencido = c.estado_pago === 'pagado' && new Date(c.fecha_expira) <= ahora;
                const st = vencido ? { label: 'Vencido', cls: 'nexa-badge-pending' } : ESTADO_PAGO[c.estado_pago] ?? ESTADO_PAGO.pendiente;
                return (
                  <li key={c.id} className="nx-card flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold" style={{ color: 'var(--nx-white)' }}>
                        {nombreRel(c.planes_grupales) ?? nombreRel(c.grupales_packs) ?? 'Pack de clases'}
                      </p>
                      <p className="mt-0.5 text-[13px]" style={{ color: 'var(--nx-muted)' }}>
                        {c.estado_pago === 'pagado'
                          ? `${c.clases_usadas} de ${c.clases_totales} clases usadas · vence ${fechaCorta(c.fecha_expira)}`
                          : `${c.clases_totales} clases · ${clp(c.monto_clp)}`}
                      </p>
                    </div>
                    <span className={st.cls}>{st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
      </section>

      {pasadas.length > 0 && (
        <section aria-labelledby="hist-t">
          <h2 id="hist-t" className="mb-4 text-[18px] font-bold" style={{ color: 'var(--nx-white)' }}>Historial de clases</h2>
          <ul className="divide-y rounded-[18px] border" style={{ borderColor: 'var(--nx-line)' }}>
            {pasadas.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-[14px]" style={{ borderColor: 'var(--nx-line)' }}>
                <span style={{ color: 'var(--nx-sub)' }}>{r.nombre_clase} · {fechaLarga(r.fecha)} · {r.hora}</span>
                <span className="shrink-0 text-[12px]" style={{ color: 'var(--nx-muted)' }}>
                  {r.estado === 'asistida' ? 'Asististe' : r.estado === 'cancelada' ? 'Cancelada' : 'Reservada'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
