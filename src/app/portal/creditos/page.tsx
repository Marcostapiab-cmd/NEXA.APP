'use client';

// Historial de mis clases: cada movimiento de crédito (reserva, cancelación,
// reagenda, asistencia, inasistencia, excepciones) con la política aplicada.
// Sale de `alumno_mis_movimientos` (migración 042), que solo devuelve lo del alumno.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getAtletaPortal } from '@/lib/portal';
import ResumenPlan, { type ResumenPlanData } from '@/components/portal/ResumenPlan';

interface Movimiento {
  id: number;
  created_at: string;
  tipo: string;
  cantidad: number;
  plan: string | null;
  fecha_clase: string | null;
  hora: string | null;
  origen: string | null;
  motivo: string | null;
  detalle: { limite?: string; solicitud?: string; a_tiempo?: boolean; antes?: number; despues?: number; fin_antes?: string; fin_despues?: string } | null;
}

// Cómo afecta cada movimiento a las clases del alumno
const TIPO: Record<string, { texto: string; efecto: string; color: string }> = {
  asignado:                     { texto: 'Plan contratado',                     efecto: '',                    color: '#121212' },
  ajuste_total:                 { texto: 'Ajuste de clases del plan',          efecto: '',                    color: '#121212' },
  vigencia_modificada:          { texto: 'Cambio de fecha de vencimiento',     efecto: '',                    color: '#5E5E5E' },
  comprometido:                 { texto: 'Clase agendada',                     efecto: 'Usa 1 crédito',       color: '#2563eb' },
  liberado_cancelacion:         { texto: 'Cancelada a tiempo',                 efecto: 'Crédito devuelto',    color: '#16a34a' },
  liberado_reagenda:            { texto: 'Reagendada',                         efecto: 'Pasa al nuevo horario', color: '#5E5E5E' },
  liberado_nexa:                { texto: 'Cancelada por NEXA',                 efecto: 'Crédito devuelto',    color: '#16a34a' },
  consumido_asistencia:         { texto: 'Entrenamiento realizado',            efecto: 'Clase realizada',     color: '#121212' },
  consumido_inasistencia:       { texto: 'Inasistencia',                       efecto: 'Clase descontada',    color: '#dc2626' },
  consumido_cancelacion_tardia: { texto: 'Cancelada fuera de plazo',           efecto: 'Clase descontada',    color: '#dc2626' },
  devuelto:                     { texto: 'Clase devuelta por excepción',       efecto: 'Crédito devuelto',    color: '#16a34a' },
  corregido:                    { texto: 'Registro de asistencia corregido',   efecto: '',                    color: '#d97706' },
  traspasado:                   { texto: 'Clase movida a otro plan',           efecto: '',                    color: '#5E5E5E' },
  anulado:                      { texto: 'Clase eliminada por NEXA',           efecto: 'Crédito devuelto',    color: '#5E5E5E' },
  arrastrado:                   { texto: 'Clases pasadas al nuevo período',    efecto: '',                    color: '#16a34a' },
  vencido:                      { texto: 'Clases vencidas',                    efecto: '',                    color: '#dc2626' },
  plan_eliminado:               { texto: 'Plan anulado',                       efecto: '',                    color: '#5E5E5E' },
};

const fechaClase = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fechaHora  = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

export default function MisCreditosPage() {
  const router = useRouter();
  const [movs, setMovs]       = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<ResumenPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sinActivar, setSinActivar] = useState(false);

  useEffect(() => {
    (async () => {
      const atleta = await getAtletaPortal();
      if (atleta === undefined) { router.push('/portal/login'); return; }
      if (!atleta) { router.push('/portal/sin-cuenta'); return; }
      const [m, r] = await Promise.all([
        supabase.rpc('alumno_mis_movimientos', { p_limite: 200 }),
        supabase.rpc('alumno_mi_plan'),
      ]);
      if (m.error) setSinActivar(true);
      setMovs((m.data ?? []) as Movimiento[]);
      if (r.data && (r.data as ResumenPlanData).vigente && 'pendientes' in (r.data as object)) setResumen(r.data as ResumenPlanData);
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Mis clases y créditos</h1>
            <p className="text-xs text-[#5E5E5E]">Cada movimiento de tu plan, con la regla aplicada</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
        {resumen && <ResumenPlan r={resumen} />}

        <div className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Historial</p>
          {sinActivar ? (
            <p className="text-sm text-[#9B9B9B]">El historial estará disponible en breve.</p>
          ) : movs.length === 0 ? (
            <p className="text-sm text-[#9B9B9B]">Todavía no hay movimientos registrados.</p>
          ) : (
            <ol className="divide-y divide-[#EBEBEB]">
              {movs.map(m => {
                const t = TIPO[m.tipo] ?? { texto: m.tipo, efecto: '', color: '#5E5E5E' };
                const d = m.detalle;
                return (
                  <li key={m.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold" style={{ color: t.color }}>{t.texto}</p>
                        <p className="text-sm text-[#121212]">
                          {m.fecha_clase ? `Clase del ${fechaClase(m.fecha_clase)}${m.hora ? ` · ${m.hora}` : ''}` : m.plan}
                          {m.tipo === 'asignado' && m.cantidad > 0 && ` · ${m.cantidad} clases`}
                          {m.tipo === 'ajuste_total' && d?.antes != null && ` · de ${d.antes} a ${d.despues} clases`}
                          {m.tipo === 'vigencia_modificada' && d?.fin_despues && ` · vence el ${fechaClase(String(d.fin_despues).slice(0, 10))}`}
                        </p>
                        {d?.limite && (
                          <p className="mt-0.5 text-xs text-[#5E5E5E]">
                            Límite sin costo: {fechaHora(d.limite)} · Solicitud: {d.solicitud ? fechaHora(d.solicitud) : '—'}
                            {' · '}<span className={d.a_tiempo ? 'text-[#16a34a]' : 'text-[#dc2626]'}>{d.a_tiempo ? 'a tiempo' : 'fuera de plazo'}</span>
                          </p>
                        )}
                        {m.motivo && m.origen === 'staff' && <p className="mt-0.5 text-xs text-[#5E5E5E]">{m.motivo}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {t.efecto && <p className="text-xs font-semibold text-[#121212]">{t.efecto}</p>}
                        <p className="text-[11px] text-[#9B9B9B]">{fechaHora(m.created_at)}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="px-1 text-xs text-[#9B9B9B]">
          ¿Ves algo que no corresponde? Escríbenos y lo revisamos: cada corrección queda registrada en este historial.
        </p>
      </main>
    </div>
  );
}
