'use client';

// Renovaciones: validar transferencias y configurar los datos bancarios.
// Aprobar crea el plan nuevo, el pago y las clases fijas en una sola operación
// de la base (staff_aprobar_renovacion, migración 044). Aprobar dos veces no duplica nada.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, FileText, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Renovacion {
  id: string; atleta_id: string; tipo: string; modalidad: string; frecuencia: number; clases: number; precio_clp: number;
  inicio_previsto: string; estado: string; comprobante_path: string | null; comprobante_at: string | null;
  created_at: string; revisada_at: string | null; motivo_rechazo: string | null; plan_nuevo_id: string | null;
}
interface Banco { banco?: string; tipo_cuenta?: string; numero?: string; titular?: string; rut?: string; email?: string }

const ESTADO: Record<string, { label: string; color: string }> = {
  en_revision:    { label: 'Comprobante por revisar', color: '#2563eb' },
  pendiente_pago: { label: 'Esperando pago',          color: '#d97706' },
  aprobada:       { label: 'Aprobada',                color: 'var(--nexa-success)' },
  rechazada:      { label: 'Rechazada',               color: 'var(--nexa-danger)' },
  cancelada:      { label: 'Cancelada por el alumno', color: 'var(--nexa-muted)' },
};
const CAMPOS: [keyof Banco, string][] = [
  ['titular', 'Titular'], ['rut', 'RUT'], ['banco', 'Banco'], ['tipo_cuenta', 'Tipo de cuenta'], ['numero', 'N° de cuenta'], ['email', 'Email para avisos'],
];
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
const fecha = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function RenovacionesPage() {
  const [lista, setLista]     = useState<Renovacion[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [banco, setBanco]     = useState<Banco>({});
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso]     = useState<{ ok: boolean; texto: string } | null>(null);
  const [sinMigracion, setSinMigracion] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data, error }, { data: cfg }] = await Promise.all([
      supabase.from('renovaciones').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('horario_config').select('datos_transferencia').eq('id', 1).maybeSingle(),
    ]);
    if (error) { setSinMigracion(true); setCargando(false); return; }
    const rs = (data ?? []) as Renovacion[];
    setLista(rs);
    setBanco(((cfg as { datos_transferencia?: Banco } | null)?.datos_transferencia) ?? {});
    const ids = [...new Set(rs.map(r => r.atleta_id))];
    if (ids.length) {
      const { data: at } = await supabase.from('atletas').select('id, nombre, apellido').in('id', ids);
      setNombres(Object.fromEntries((at ?? []).map(a => [String(a.id), `${a.nombre ?? ''} ${a.apellido ?? ''}`.trim()])));
    }
    setCargando(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);

  async function verComprobante(path: string) {
    const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(path, 300);
    if (error || !data) { setAviso({ ok: false, texto: 'No se pudo abrir el comprobante.' }); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function aprobar(r: Renovacion) {
    if (!confirm(`¿Confirmas que recibiste ${clp(r.precio_clp)} de ${nombres[r.atleta_id] ?? 'este alumno'}? Se activará su nuevo plan.`)) return;
    setOcupado(r.id);
    const { data, error } = await supabase.rpc('staff_aprobar_renovacion', { p_id: r.id, p_nota: null });
    if (error || !data?.ok) setAviso({ ok: false, texto: `No se pudo aprobar (${error?.message ?? data?.error}).` });
    else {
      const fallidas = (data.agenda?.fallidas ?? []).length;
      setAviso({ ok: true, texto: `Renovación aprobada. Se agendaron ${data.agenda?.creadas ?? 0} clases${fallidas ? `; ${fallidas} no se pudieron agendar (revisa Requiere atención)` : ''}.` });
      void fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => {});
    }
    await cargar();
    setOcupado(null);
  }

  async function rechazar(r: Renovacion) {
    const motivo = prompt('Motivo del rechazo (se le enviará al alumno):');
    if (!motivo?.trim()) return;
    setOcupado(r.id);
    const { data, error } = await supabase.rpc('staff_rechazar_renovacion', { p_id: r.id, p_motivo: motivo });
    setAviso(error || !data?.ok ? { ok: false, texto: `No se pudo rechazar (${error?.message ?? data?.error}).` } : { ok: true, texto: 'Solicitud rechazada y alumno avisado.' });
    if (!error && data?.ok) void fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => {});
    await cargar();
    setOcupado(null);
  }

  async function guardarBanco() {
    setOcupado('banco');
    const limpio = Object.fromEntries(Object.entries(banco).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
    const { data, error } = await supabase.rpc('staff_guardar_datos_transferencia', { p_datos: limpio });
    setAviso(error || !data?.ok ? { ok: false, texto: 'No se pudieron guardar los datos (solo el admin puede).' } : { ok: true, texto: 'Datos de transferencia guardados.' });
    setOcupado(null);
  }

  const abiertas = lista.filter(r => r.estado === 'en_revision' || r.estado === 'pendiente_pago')
    .sort((a, b) => (a.estado === 'en_revision' ? 0 : 1) - (b.estado === 'en_revision' ? 0 : 1));
  const cerradas = lista.filter(r => !abiertas.includes(r)).slice(0, 30);
  const card = { background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--nexa-muted)' }}>Administración</p>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nexa-text)' }}>Renovaciones</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--nexa-text-sub)' }}>
          Valida las transferencias. Al aprobar se crea el nuevo período, el pago y las clases en sus horarios fijos.
        </p>
      </header>

      {aviso && (
        <div className="mb-4 rounded-[10px] px-4 py-3 text-sm"
          style={aviso.ok ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' } : { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          {aviso.texto}
        </div>
      )}
      {sinMigracion && (
        <div className="mb-4 rounded-[10px] px-4 py-3 text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          Falta aplicar la migración 044 en Supabase.
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--nexa-text)' }}>Por resolver ({abiertas.length})</h2>
        {cargando ? <div className="h-24 animate-pulse rounded-[12px]" style={{ background: 'var(--nexa-card-alt)' }} />
          : abiertas.length === 0 ? <p className="rounded-[12px] px-4 py-6 text-center text-sm" style={{ ...card, color: 'var(--nexa-muted)' }}>No hay renovaciones pendientes.</p>
          : (
            <ul className="space-y-2">
              {abiertas.map(r => (
                <li key={r.id} className="rounded-[12px] px-4 py-3" style={{ ...card, borderLeft: `3px solid ${ESTADO[r.estado].color}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/alumnos/${r.atleta_id}`} className="font-semibold hover:underline" style={{ color: 'var(--nexa-text)' }}>{nombres[r.atleta_id] ?? 'Alumno'}</Link>
                      <p className="text-sm" style={{ color: 'var(--nexa-text-sub)' }}>
                        {r.modalidad} · {r.frecuencia}x/semana · {r.tipo} · {r.clases} clases · <b style={{ color: 'var(--nexa-text)' }}>{clp(r.precio_clp)}</b>
                      </p>
                      <p className="text-xs" style={{ color: 'var(--nexa-muted)' }}>
                        Desde el {fecha(r.inicio_previsto)} · solicitada {fechaHora(r.created_at)}
                        {r.comprobante_at ? ` · comprobante ${fechaHora(r.comprobante_at)}` : ''}
                      </p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: ESTADO[r.estado].color }}>{ESTADO[r.estado].label}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.comprobante_path && (
                        <button onClick={() => verComprobante(r.comprobante_path!)} className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold"
                          style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}>
                          <FileText size={13} /> Ver comprobante
                        </button>
                      )}
                      <button onClick={() => aprobar(r)} disabled={ocupado === r.id} className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--nexa-success)' }}>
                        <CheckCircle2 size={13} /> Pago recibido · Aprobar
                      </button>
                      <button onClick={() => rechazar(r)} disabled={ocupado === r.id} className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-text-sub)' }}>
                        <XCircle size={13} /> Rechazar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="mb-8 rounded-[12px] p-4" style={card}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--nexa-text)' }}>Datos para transferencias</h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--nexa-muted)' }}>Los ven los alumnos al renovar. Solo el admin puede cambiarlos.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMPOS.map(([k, label]) => (
            <label key={k} className="text-xs" style={{ color: 'var(--nexa-text-sub)' }}>
              {label}
              <input value={banco[k] ?? ''} onChange={e => setBanco(b => ({ ...b, [k]: e.target.value }))}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--nexa-border)', background: 'var(--nexa-bg, #fff)', color: 'var(--nexa-text)' }} />
            </label>
          ))}
        </div>
        <button onClick={guardarBanco} disabled={ocupado === 'banco'} className="mt-3 flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--nexa-text)' }}>
          <Save size={13} /> Guardar datos
        </button>
      </section>

      {cerradas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--nexa-text)' }}>Historial</h2>
          <ul className="space-y-1">
            {cerradas.map(r => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-sm" style={card}>
                <span style={{ color: 'var(--nexa-text)' }}>{nombres[r.atleta_id] ?? 'Alumno'} · {r.tipo} · {clp(r.precio_clp)}</span>
                <span className="text-xs" style={{ color: ESTADO[r.estado]?.color }}>
                  {ESTADO[r.estado]?.label}{r.revisada_at ? ` · ${fechaHora(r.revisada_at)}` : ''}{r.motivo_rechazo ? ` — ${r.motivo_rechazo}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
