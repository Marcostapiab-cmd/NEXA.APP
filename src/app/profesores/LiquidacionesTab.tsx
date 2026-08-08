'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { clp, MESES_CAP } from '@/lib/format';
import { getAllCoachesDB, type Coach } from '@/lib/coaches-supabase';
import {
  agruparClases,
  calcularFilaProfesor,
  type ReservaParaPago,
  type FilaProfesor,
  type Advertencia,
} from '@/lib/pagos-profesores';

function primerDia(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}
function ultimoDia(year: number, month: number): string {
  const d = new Date(year, month + 1, 0);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nombreMes(year: number, month: number) { return `${MESES_CAP[month]} ${year}`; }
function coachNombre(coaches: Coach[], id: string | null) {
  if (!id) return '—';
  return coaches.find(c => c.id === id)?.nombre ?? id.slice(0, 8) + '…';
}
const MOTIVO_LABEL: Record<string, string> = {
  sin_hora:         'Sin hora registrada',
  tipo_desconocido: 'Tipo de clase desconocido',
};

function NumCell({ value, bold = false, dim = false }: { value: number; bold?: boolean; dim?: boolean }) {
  if (value === 0) return <span className="text-right text-[13px] tabular-nums" style={{ color: 'var(--nexa-ghost)' }}>—</span>;
  return (
    <span className="text-right text-[13px] tabular-nums"
      style={{ color: dim ? 'var(--nexa-muted)' : 'var(--nexa-text-sub)', fontWeight: bold ? 700 : 400 }}>
      {value}
    </span>
  );
}

export default function LiquidacionesTab() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [filas,        setFilas]        = useState<FilaProfesor[]>([]);
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([]);
  const [coaches,      setCoaches]      = useState<Coach[]>([]);
  const [loading,      setLoading]      = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [todosCoaches, { data: resData }] = await Promise.all([
        getAllCoachesDB(),
        supabase
          .from('reservas')
          .select('id, coach_id, fecha, hora, tipo_clase, estado')
          .gte('fecha', primerDia(year, month))
          .lte('fecha', ultimoDia(year, month))
          .in('estado', ['presente', 'no_show', 'cancelada_tarde'])
          .not('coach_id', 'is', null),
      ]);
      setCoaches(todosCoaches);
      const reservas = (resData ?? []) as ReservaParaPago[];
      const { clases, advertencias: adv } = agruparClases(reservas);
      const coachIdsConClases = new Set(clases.map(c => c.coach_id));
      const coachesConClases  = todosCoaches.filter(c => coachIdsConClases.has(c.id));
      const filasCalculadas = coachesConClases
        .map(coach => calcularFilaProfesor(coach, clases))
        .sort((a, b) => b.total_pago - a.total_pago);
      setFilas(filasCalculadas);
      setAdvertencias(adv);
    } catch (err) {
      console.error('liquidaciones-tab load error', err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { cargar(); }, [cargar]);

  function mesPrev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else              { setMonth(m => m - 1); }
  }
  function mesSig() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else               { setMonth(m => m + 1); }
  }

  const totalGeneral = filas.reduce((s, f) => s + f.total_pago, 0);

  return (
    <div>
      {/* Selector de mes */}
      <div className="mb-6 flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-xl px-1 py-1"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <button onClick={mesPrev}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--nexa-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}>
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>
          <span className="min-w-[140px] text-center text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>
            {nombreMes(year, month)}
          </span>
          <button onClick={mesSig}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--nexa-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}>
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Advertencias */}
      {!loading && advertencias.length > 0 && (
        <div className="mb-6 rounded-xl p-4"
          style={{ background: 'rgba(196,120,58,0.08)', border: '1px solid rgba(196,120,58,0.25)' }}>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={14} strokeWidth={2} style={{ color: '#C4783A' }} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#C4783A' }}>
              {advertencias.length} reserva{advertencias.length !== 1 ? 's' : ''} excluida{advertencias.length !== 1 ? 's' : ''} — revisión manual
            </span>
          </div>
          <div className="space-y-1">
            {advertencias.map((a, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[12px]" style={{ color: 'var(--nexa-text-sub)' }}>
                <span style={{ color: '#C4783A', fontWeight: 600 }}>·</span>
                <span>
                  <strong>{a.fecha}{a.hora ? ` ${a.hora}` : ''}</strong>{' — '}
                  coach: <strong>{coachNombre(coaches, a.coach_id)}</strong>{' — '}
                  tipo: <em>{a.tipo_clase ?? 'null'}</em>{' — '}
                  <span style={{ color: '#C4783A' }}>{MOTIVO_LABEL[a.motivo]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl" style={{ background: 'var(--nexa-card)' }} />
          ))}
        </div>
      ) : filas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl py-16"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <DollarSign size={28} strokeWidth={1.5} style={{ color: 'var(--nexa-muted)', marginBottom: 8 }} />
          <p className="text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
            Sin clases pagables en {nombreMes(year, month)}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--nexa-border)' }}>
          <div className="grid text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{
              gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 110px',
              background: 'var(--nexa-card)', borderBottom: '1px solid var(--nexa-border)',
              padding: '10px 16px', color: 'var(--nexa-muted)',
            }}>
            <span>Profesor</span>
            <span className="text-right">1:1</span>
            <span className="text-right">2:1</span>
            <span className="text-right">2:1 Solo</span>
            <span className="text-right">Grupal</span>
            <span className="text-right">Total</span>
            <span className="text-right">Pago</span>
          </div>
          {filas.map((f, i) => (
            <div key={f.coach.id} className="grid items-center"
              style={{
                gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 110px',
                padding: '13px 16px',
                borderBottom: i < filas.length - 1 ? '1px solid var(--nexa-border)' : 'none',
                background: 'var(--nexa-bg)',
              }}>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>{f.coach.nombre}</span>
              <NumCell value={f.clases_1a1} />
              <NumCell value={f.clases_2a1} />
              <NumCell value={f.clases_2a1_solo} dim />
              <NumCell value={f.clases_grupal} />
              <NumCell value={f.total_clases} bold />
              <span className="text-right text-[13px] font-bold tabular-nums" style={{ color: 'var(--nexa-text)' }}>
                {clp(f.total_pago)}
              </span>
            </div>
          ))}
          <div className="grid items-center"
            style={{
              gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 110px',
              padding: '13px 16px', background: 'var(--nexa-card)', borderTop: '2px solid var(--nexa-border)',
            }}>
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--nexa-muted)' }}>
              Total del mes
            </span>
            <span /><span /><span /><span />
            <NumCell value={filas.reduce((s, f) => s + f.total_clases, 0)} bold />
            <span className="text-right text-[14px] font-black tabular-nums" style={{ color: 'var(--nexa-text)' }}>
              {clp(totalGeneral)}
            </span>
          </div>
        </div>
      )}

      {!loading && filas.length > 0 && (
        <p className="mt-4 text-[11px]" style={{ color: 'var(--nexa-ghost)' }}>
          Tarifas: 1:1 e Individual → tarifa_1a1 · 2:1 con 2 alumnos → tarifa_2a1 · 2:1 con 1 alumno → tarifa_incompleta_2a1 · Grupal → tarifa_1a1
        </p>
      )}
    </div>
  );
}
