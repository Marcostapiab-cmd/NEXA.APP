'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Calendar, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type AtletaFila = {
  nombre: string;
  apellido: string;
  telefono: string | null;
  email: string | null;
  rut: string | null;
};

interface Reserva {
  id: number;
  fecha: string;
  hora: string;
  estado: string;
  descripcion: string | null;
  atletas: AtletaFila[];
}

interface ClaseInfo {
  nombre: string;
  hora: string;
  dia_semana: number;
  capacidad: number;
}

interface SesionAgrupada {
  fecha: string;
  hora: string;
  nombre: string;
  capacidad: number;
  reservas: Reserva[];
}

const ESTADO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pendiente:        { label: 'Pendiente',  color: '#d97706', bg: '#fffbeb', Icon: Clock        },
  presente:         { label: 'Presente',   color: '#16a34a', bg: '#f0fdf4', Icon: CheckCircle2 },
  no_show:          { label: 'No asistió', color: '#dc2626', bg: '#fef2f2', Icon: XCircle      },
  cancelada_tiempo: { label: 'Cancelada',  color: '#9B9B9B', bg: '#f9fafb', Icon: XCircle      },
  cancelada_tarde:  { label: 'Cancelada',  color: '#dc2626', bg: '#fef2f2', Icon: XCircle      },
  cancelada_nexa:   { label: 'Cancelada',  color: '#9B9B9B', bg: '#f9fafb', Icon: XCircle      },
};

const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function CupoBar({ inscritos, capacidad }: { inscritos: number; capacidad: number }) {
  const pct  = capacidad > 0 ? Math.min(100, (inscritos / capacidad) * 100) : 0;
  const lleno = inscritos >= capacidad;
  const casi  = pct >= 75;
  const color = lleno ? '#dc2626' : casi ? '#d97706' : '#16a34a';
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: 'var(--nexa-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[12px] font-black" style={{ color }}>
        {inscritos}/{capacidad}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>cupos</span>
    </div>
  );
}

export default function GrupalesPage() {
  const [sesiones, setSesiones] = useState<SesionAgrupada[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filtro,   setFiltro]   = useState<'hoy' | 'semana' | 'mes'>('semana');
  const [updating, setUpdating] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const fin = filtro === 'hoy'
      ? hoy
      : filtro === 'semana'
      ? new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10)
      : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [{ data: reservasData }, { data: clasesData }] = await Promise.all([
      supabase
        .from('reservas')
        .select('id, fecha, hora, estado, descripcion, atletas(nombre, apellido, telefono, email, rut)')
        .ilike('tipo_clase', '%grupal%')
        .gte('fecha', hoy)
        .lte('fecha', fin)
        .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa)')
        .order('fecha', { ascending: true })
        .order('hora',  { ascending: true }),
      supabase
        .from('clases_grupales')
        .select('nombre, hora, dia_semana, capacidad')
        .eq('activa', true),
    ]);

    const clases = (clasesData ?? []) as ClaseInfo[];

    // Agrupar por fecha + hora
    const mapa: Record<string, SesionAgrupada> = {};
    for (const r of (reservasData ?? []) as unknown as Reserva[]) {
      const key = `${r.fecha}|${r.hora}`;
      if (!mapa[key]) {
        const dow = new Date(r.fecha + 'T12:00:00').getDay();
        const claseInfo = clases.find(c => c.hora === r.hora && c.dia_semana === dow);
        mapa[key] = {
          fecha:     r.fecha,
          hora:      r.hora,
          nombre:    r.descripcion ?? claseInfo?.nombre ?? 'Clase grupal',
          capacidad: claseInfo?.capacidad ?? 0,
          reservas:  [],
        };
      }
      mapa[key].reservas.push(r);
    }

    setSesiones(Object.values(mapa));
    setLoading(false);
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(id: number, nuevoEstado: string) {
    setUpdating(id);
    await supabase.from('reservas').update({ estado: nuevoEstado }).eq('id', id);
    setUpdating(null);
    cargar();
  }

  const totalInscritos = sesiones.reduce((acc, s) => acc + s.reservas.length, 0);
  const totalSesiones  = sesiones.length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-surface)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
        style={{ background: 'var(--nexa-bg)', borderColor: 'var(--nexa-border)' }}>
        <div>
          <h1 className="text-[18px] font-black tracking-tight" style={{ color: 'var(--nexa-text)' }}>
            Clases grupales
          </h1>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
            {totalInscritos} inscritos · {totalSesiones} sesiones
          </p>
        </div>
        <button onClick={cargar}
          className="rounded-lg p-2 transition"
          style={{ color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}>
          <RefreshCw size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-5">
        {/* Filtros */}
        <div className="mb-6 flex gap-2">
          {(['hoy', 'semana', 'mes'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition"
              style={filtro === f
                ? { background: 'var(--nexa-text)', color: '#fff' }
                : { background: 'var(--nexa-card)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }
              }>
              {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Esta semana' : 'Este mes'}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: 'var(--nexa-muted)' }} />
          </div>
        )}

        {!loading && sesiones.length === 0 && (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <Calendar size={32} strokeWidth={1.5} style={{ color: 'var(--nexa-faint)' }} className="mx-auto mb-3" />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
              Sin inscripciones en este período
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
              Las reservas de clases grupales aparecerán aquí.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {sesiones.map(sesion => {
            const key   = `${sesion.fecha}|${sesion.hora}`;
            const esHoy = sesion.fecha === new Date().toISOString().slice(0, 10);
            const lleno = sesion.capacidad > 0 && sesion.reservas.length >= sesion.capacidad;

            return (
              <div key={key} className="overflow-hidden rounded-2xl"
                style={{ background: 'var(--nexa-card)', border: `1px solid ${esHoy ? 'var(--nexa-accent)' : 'var(--nexa-border)'}` }}>

                {/* Cabecera sesión */}
                <div className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: '1px solid var(--nexa-border)' }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {esHoy && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: 'var(--nexa-accent)', color: '#fff' }}>
                          Hoy
                        </span>
                      )}
                      {lleno && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: '#fef2f2', color: '#dc2626' }}>
                          Llena
                        </span>
                      )}
                      <p className="text-[15px] font-black" style={{ color: 'var(--nexa-text)' }}>
                        {sesion.nombre}
                      </p>
                    </div>
                    <p className="text-[12px] capitalize mb-2" style={{ color: 'var(--nexa-muted)' }}>
                      {formatFecha(sesion.fecha)} · {sesion.hora}
                    </p>
                    <CupoBar inscritos={sesion.reservas.length} capacidad={sesion.capacidad} />
                  </div>

                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 ml-4"
                    style={{ background: 'var(--nexa-card-alt)' }}>
                    <Users size={14} strokeWidth={2} style={{ color: 'var(--nexa-muted)' }} />
                    <span className="text-[16px] font-black" style={{ color: 'var(--nexa-text)' }}>
                      {sesion.reservas.length}
                    </span>
                  </div>
                </div>

                {/* Lista inscritos */}
                {sesion.reservas.length === 0 ? (
                  <div className="px-5 py-4 text-center">
                    <p className="text-[12px]" style={{ color: 'var(--nexa-faint)' }}>Sin inscripciones aún</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
                    {sesion.reservas.map((r, idx) => {
                      const cfg    = ESTADO_CFG[r.estado] ?? ESTADO_CFG.pendiente;
                      const Icn    = cfg.Icon;
                      const atleta = r.atletas[0] as AtletaFila | undefined;
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                          {/* Número */}
                          <span className="w-5 shrink-0 text-center text-[11px] font-semibold"
                            style={{ color: 'var(--nexa-faint)' }}>
                            {idx + 1}
                          </span>

                          {/* Avatar */}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black"
                            style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}>
                            {atleta?.nombre?.[0]?.toUpperCase() ?? '?'}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text)' }}>
                              {atleta?.nombre ?? '—'} {atleta?.apellido ?? ''}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {atleta?.telefono && (
                                <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                                  {atleta.telefono}
                                </span>
                              )}
                              {atleta?.email && (
                                <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                                  {atleta.email}
                                </span>
                              )}
                              {atleta?.rut && (
                                <span className="text-[11px]" style={{ color: 'var(--nexa-faint)' }}>
                                  RUT: {atleta.rut}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Estado + botones */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ color: cfg.color, background: cfg.bg }}>
                              <Icn size={11} />
                              {cfg.label}
                            </span>
                            {r.estado === 'pendiente' && (
                              <>
                                <button
                                  disabled={updating === r.id}
                                  onClick={() => cambiarEstado(r.id, 'presente')}
                                  title="Marcar presente"
                                  className="rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:opacity-40"
                                  style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                  ✓
                                </button>
                                <button
                                  disabled={updating === r.id}
                                  onClick={() => cambiarEstado(r.id, 'no_show')}
                                  title="Marcar ausente"
                                  className="rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:opacity-40"
                                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                  ✗
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
