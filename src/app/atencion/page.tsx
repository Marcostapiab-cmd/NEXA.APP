'use client';

// "Requiere mi atención": solo lo que el sistema no puede resolver solo.
// Las incidencias las detecta la revisión automática (migración 042, cada hora)
// o las informa un profesor. Las automáticas se cierran solas al corregirse.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Incidencia {
  id: string;
  tipo: string;
  prioridad: 'alta' | 'media' | 'baja';
  titulo: string;
  descripcion: string | null;
  accion_sugerida: string | null;
  atleta_id: string | null;
  estado: 'abierta' | 'resuelta' | 'descartada';
  automatica: boolean;
  detectada_at: string;
  resuelta_at: string | null;
  resolucion: string | null;
}

interface Evento { id: number; accion: string; nota: string | null; created_at: string }

const PRIORIDAD: Record<Incidencia['prioridad'], { label: string; color: string; orden: number }> = {
  alta:  { label: 'Alta',  color: 'var(--nexa-danger)', orden: 0 },
  media: { label: 'Media', color: '#d97706',            orden: 1 },
  baja:  { label: 'Baja',  color: 'var(--nexa-muted)',  orden: 2 },
};

const ACCION: Record<string, string> = {
  detectada: 'Detectada', reportada: 'Informada', resuelta: 'Resuelta', descartada: 'Descartada',
  resuelta_auto: 'Se corrigió sola', nota: 'Nota',
};

const ERRORES: Record<string, string> = {
  nota_requerida: 'Escribe el motivo para descartarla.',
  no_autorizado:  'No tienes permiso para esta acción.',
  ya_cerrada:     'Esta incidencia ya estaba cerrada.',
};

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
});

export default function AtencionPage() {
  const [abiertas, setAbiertas]   = useState<Incidencia[]>([]);
  const [cerradas, setCerradas]   = useState<Incidencia[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [revisando, setRevisando] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [abierta, setAbierta]     = useState<string | null>(null);
  const [historial, setHistorial] = useState<Record<string, Evento[]>>({});
  const [nota, setNota]           = useState('');
  const [verCerradas, setVerCerradas] = useState(false);

  const cargar = useCallback(async () => {
    const [a, c] = await Promise.all([
      supabase.from('incidencias').select('*').eq('estado', 'abierta').order('detectada_at', { ascending: false }).limit(200),
      supabase.from('incidencias').select('*').neq('estado', 'abierta').order('resuelta_at', { ascending: false }).limit(30),
    ]);
    if (a.error) {
      setSinMigracion(/incidencias/.test(a.error.message));
      setError(a.error.message);
    } else {
      setError(null);
      setAbiertas(((a.data ?? []) as Incidencia[]).sort((x, y) =>
        PRIORIDAD[x.prioridad].orden - PRIORIDAD[y.prioridad].orden || y.detectada_at.localeCompare(x.detectada_at)));
      setCerradas((c.data ?? []) as Incidencia[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);

  async function revisarAhora() {
    setRevisando(true);
    const { data, error: e } = await supabase.rpc('staff_revisar_ahora');
    if (e || !data?.ok) setError(e?.message ?? ERRORES[data?.error] ?? 'No se pudo revisar');
    await cargar();
    setRevisando(false);
  }

  async function verHistorial(id: string) {
    if (abierta === id) { setAbierta(null); return; }
    setAbierta(id);
    setNota('');
    const { data } = await supabase.from('incidencias_historial').select('id, accion, nota, created_at')
      .eq('incidencia_id', id).order('id');
    setHistorial(h => ({ ...h, [id]: (data ?? []) as Evento[] }));
  }

  async function cerrar(id: string, estado: 'resuelta' | 'descartada' | 'nota') {
    const { data, error: e } = await supabase.rpc('staff_resolver_incidencia', { p_id: id, p_estado: estado, p_nota: nota });
    if (e || !data?.ok) { setError(e?.message ?? ERRORES[data?.error] ?? 'No se pudo guardar'); return; }
    setNota('');
    setError(null);
    if (estado === 'nota') { setAbierta(null); await verHistorial(id); } else { setAbierta(null); }
    await cargar();
  }

  const altas = abiertas.filter(i => i.prioridad === 'alta').length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--nexa-muted)' }}>Administración</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--nexa-text)' }}>Requiere mi atención</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--nexa-text-sub)' }}>
            Solo aparece lo que el sistema no puede resolver solo. Se revisa automáticamente cada hora.
          </p>
        </div>
        <button onClick={revisarAhora} disabled={revisando}
          className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-xs font-semibold disabled:opacity-50"
          style={{ border: '1px solid var(--nexa-border)', background: 'var(--nexa-card)', color: 'var(--nexa-text)' }}>
          <RefreshCw size={13} className={revisando ? 'animate-spin' : ''} /> Revisar ahora
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-[10px] px-4 py-3 text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          {sinMigracion
            ? 'La bandeja aún no está activa: falta aplicar la migración 042 en Supabase.'
            : error}
        </div>
      )}

      {!cargando && !sinMigracion && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: 'Abiertas', valor: abiertas.length },
            { label: 'Prioridad alta', valor: altas, color: altas ? 'var(--nexa-danger)' : undefined },
            { label: 'Cerradas (recientes)', valor: cerradas.length },
          ].map(k => (
            <div key={k.label} className="rounded-[12px] px-4 py-3" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
              <p className="text-2xl font-bold" style={{ color: k.color ?? 'var(--nexa-text)' }}>{k.valor}</p>
              <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-[12px]" style={{ background: 'var(--nexa-card-alt)' }} />)}</div>
      ) : !sinMigracion && abiertas.length === 0 ? (
        <div className="flex flex-col items-center rounded-[14px] px-6 py-12 text-center" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <CheckCircle2 size={28} style={{ color: 'var(--nexa-success)' }} />
          <p className="mt-3 font-semibold" style={{ color: 'var(--nexa-text)' }}>Todo en orden</p>
          <p className="text-sm" style={{ color: 'var(--nexa-muted)' }}>No hay nada que requiera tu atención.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {abiertas.map(i => {
            const p = PRIORIDAD[i.prioridad];
            const expandida = abierta === i.id;
            return (
              <li key={i.id} className="rounded-[12px]" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', borderLeft: `3px solid ${p.color}` }}>
                <button onClick={() => verHistorial(i.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: p.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <p className="font-semibold" style={{ color: 'var(--nexa-text)' }}>{i.titulo}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: p.color }}>{p.label}</span>
                    </div>
                    {i.descripcion && <p className="mt-0.5 text-sm" style={{ color: 'var(--nexa-text-sub)' }}>{i.descripcion}</p>}
                    {i.accion_sugerida && <p className="mt-1 text-xs font-medium" style={{ color: 'var(--nexa-text)' }}>→ {i.accion_sugerida}</p>}
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--nexa-faint)' }}>
                      {i.automatica ? 'Detectada' : 'Informada'} {fechaHora(i.detectada_at)}
                    </p>
                  </div>
                  {expandida ? <ChevronDown size={16} style={{ color: 'var(--nexa-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--nexa-muted)' }} />}
                </button>

                {expandida && (
                  <div className="space-y-3 px-4 pb-4" style={{ borderTop: '1px solid var(--nexa-border)' }}>
                    <div className="flex flex-wrap gap-2 pt-3">
                      {i.atleta_id && (
                        <Link href={`/alumnos/${i.atleta_id}`} className="rounded-[8px] px-3 py-1.5 text-xs font-semibold"
                          style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}>Ver alumno</Link>
                      )}
                      {i.tipo === 'asistencia_pendiente' && (
                        <Link href="/horario" className="rounded-[8px] px-3 py-1.5 text-xs font-semibold"
                          style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}>Ir a Check-in</Link>
                      )}
                    </div>
                    <ol className="space-y-1">
                      {(historial[i.id] ?? []).map(ev => (
                        <li key={ev.id} className="text-xs" style={{ color: 'var(--nexa-text-sub)' }}>
                          <span style={{ color: 'var(--nexa-faint)' }}>{fechaHora(ev.created_at)}</span> · {ACCION[ev.accion] ?? ev.accion}
                          {ev.nota ? ` — ${ev.nota}` : ''}
                        </li>
                      ))}
                    </ol>
                    <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                      placeholder="Qué hiciste o por qué la descartas (queda en el historial)"
                      className="w-full rounded-[8px] px-3 py-2 text-sm outline-none"
                      style={{ border: '1px solid var(--nexa-border)', background: 'var(--nexa-bg, #fff)', color: 'var(--nexa-text)' }} />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => cerrar(i.id, 'resuelta')}
                        className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold text-white"
                        style={{ background: 'var(--nexa-success)' }}>
                        <CheckCircle2 size={13} /> Marcar resuelta
                      </button>
                      <button onClick={() => cerrar(i.id, 'descartada')}
                        className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold"
                        style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-text-sub)' }}>
                        <XCircle size={13} /> Descartar (no volverá a aparecer)
                      </button>
                      <button onClick={() => cerrar(i.id, 'nota')} disabled={!nota.trim()}
                        className="rounded-[8px] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                        style={{ color: 'var(--nexa-text-sub)' }}>
                        Solo agregar nota
                      </button>
                    </div>
                    {i.automatica && (
                      <p className="text-[11px]" style={{ color: 'var(--nexa-faint)' }}>
                        Si corriges el problema de origen, se cierra sola en la próxima revisión.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cerradas.length > 0 && (
        <section className="mt-8">
          <button onClick={() => setVerCerradas(v => !v)} className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--nexa-muted)' }}>
            {verCerradas ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Cerradas recientemente
          </button>
          {verCerradas && (
            <ul className="mt-2 space-y-1">
              {cerradas.map(i => (
                <li key={i.id} className="rounded-[8px] px-3 py-2 text-sm" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
                  <span style={{ color: 'var(--nexa-text)' }}>{i.titulo}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--nexa-muted)' }}>
                    {i.estado === 'descartada' ? 'Descartada' : 'Resuelta'}{i.resuelta_at ? ` · ${fechaHora(i.resuelta_at)}` : ''}
                    {i.resolucion ? ` — ${i.resolucion}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
