'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Calendar, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Reserva {
  id: number;
  fecha: string;
  hora: string;
  estado: string;
  descripcion: string | null;
  atletas: {
    nombre: string;
    apellido: string;
    telefono: string | null;
    email: string | null;
    rut: string | null;
  } | null;
}

interface SesionAgrupada {
  fecha: string;
  hora: string;
  nombre: string;
  reservas: Reserva[];
}

const ESTADO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pendiente:         { label: 'Pendiente',  color: '#d97706', bg: '#fffbeb', Icon: Clock        },
  presente:          { label: 'Presente',   color: '#16a34a', bg: '#f0fdf4', Icon: CheckCircle2 },
  no_show:           { label: 'No asistió', color: '#dc2626', bg: '#fef2f2', Icon: XCircle      },
  cancelada_tiempo:  { label: 'Cancelada',  color: '#9B9B9B', bg: '#f9fafb', Icon: XCircle      },
  cancelada_tarde:   { label: 'Cancelada',  color: '#dc2626', bg: '#fef2f2', Icon: XCircle      },
  cancelada_nexa:    { label: 'Cancelada',  color: '#9B9B9B', bg: '#f9fafb', Icon: XCircle      },
};

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default function GrupalesPage() {
  const [sesiones, setSesiones]   = useState<SesionAgrupada[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filtro, setFiltro]       = useState<'hoy' | 'semana' | 'todo'>('semana');
  const [updating, setUpdating]   = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const hoy  = new Date().toISOString().slice(0, 10);
    const fin  = filtro === 'hoy'   ? hoy
               : filtro === 'semana' ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
               : new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

    const { data } = await supabase
      .from('reservas')
      .select('id, fecha, hora, estado, descripcion, atletas(nombre, apellido, telefono, email, rut)')
      .ilike('tipo_clase', '%grupal%')
      .gte('fecha', hoy)
      .lte('fecha', fin)
      .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa)')
      .order('fecha', { ascending: true })
      .order('hora',  { ascending: true });

    // Agrupar por fecha + hora + descripcion
    const mapa: Record<string, SesionAgrupada> = {};
    for (const r of (data ?? []) as Reserva[]) {
      const key = `${r.fecha}|${r.hora}|${r.descripcion ?? ''}`;
      if (!mapa[key]) mapa[key] = { fecha: r.fecha, hora: r.hora, nombre: r.descripcion ?? 'Clase grupal', reservas: [] };
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-surface)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b px-6 py-4 flex items-center justify-between"
        style={{ background: 'var(--nexa-bg)', borderColor: 'var(--nexa-border)' }}>
        <div>
          <h1 className="text-[18px] font-black tracking-tight" style={{ color: 'var(--nexa-text)' }}>
            Clases grupales
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>
            {totalInscritos} inscripciones · {sesiones.length} sesiones
          </p>
        </div>
        <button onClick={cargar} className="p-2 rounded-lg transition"
          style={{ color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}>
          <RefreshCw size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="px-6 py-5 max-w-4xl mx-auto">
        {/* Filtros */}
        <div className="flex gap-2 mb-6">
          {(['hoy', 'semana', 'todo'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition"
              style={filtro === f
                ? { background: 'var(--nexa-text)', color: '#fff' }
                : { background: 'var(--nexa-card)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }
              }>
              {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Próximos 7 días' : '60 días'}
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
          </div>
        )}

        <div className="space-y-6">
          {sesiones.map(sesion => {
            const key = `${sesion.fecha}|${sesion.hora}`;
            const esHoy = sesion.fecha === new Date().toISOString().slice(0, 10);
            return (
              <div key={key} className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--nexa-card)', border: `1px solid ${esHoy ? 'var(--nexa-accent)' : 'var(--nexa-border)'}` }}>

                {/* Cabecera sesión */}
                <div className="px-5 py-4 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--nexa-border)', background: esHoy ? 'rgba(var(--nexa-accent-rgb,196,157,89),0.06)' : undefined }}>
                  <div>
                    <div className="flex items-center gap-2">
                      {esHoy && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: 'var(--nexa-accent)', color: '#fff' }}>
                          Hoy
                        </span>
                      )}
                      <p className="text-[15px] font-black" style={{ color: 'var(--nexa-text)' }}>
                        {sesion.nombre}
                      </p>
                    </div>
                    <p className="text-[12px] mt-0.5 capitalize" style={{ color: 'var(--nexa-muted)' }}>
                      {formatFecha(sesion.fecha)} · {sesion.hora}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                    style={{ background: 'var(--nexa-card-alt)' }}>
                    <Users size={13} strokeWidth={2} style={{ color: 'var(--nexa-muted)' }} />
                    <span className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>
                      {sesion.reservas.length}
                    </span>
                  </div>
                </div>

                {/* Lista de inscritos */}
                <div className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
                  {sesion.reservas.map(r => {
                    const cfg = ESTADO_CFG[r.estado] ?? ESTADO_CFG.pendiente;
                    const Icn = cfg.Icon;
                    return (
                      <div key={r.id} className="px-5 py-3 flex items-center gap-4">
                        {/* Avatar inicial */}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black"
                          style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}>
                          {r.atletas?.nombre?.[0]?.toUpperCase() ?? '?'}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text)' }}>
                            {r.atletas?.nombre ?? '—'} {r.atletas?.apellido ?? ''}
                          </p>
                          <div className="flex gap-3 mt-0.5">
                            {r.atletas?.telefono && (
                              <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                                {r.atletas.telefono}
                              </span>
                            )}
                            {r.atletas?.email && (
                              <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                                {r.atletas.email}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Estado + acciones */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ color: cfg.color, background: cfg.bg }}>
                            <Icn size={11} />
                            {cfg.label}
                          </span>

                          {r.estado === 'pendiente' && (
                            <div className="flex gap-1">
                              <button
                                disabled={updating === r.id}
                                onClick={() => cambiarEstado(r.id, 'presente')}
                                className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40"
                                style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                ✓ Presente
                              </button>
                              <button
                                disabled={updating === r.id}
                                onClick={() => cambiarEstado(r.id, 'no_show')}
                                className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40"
                                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                ✗ Ausente
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
