'use client';

import { useState, useEffect } from 'react';
import { clp } from '@/lib/format';
import { Users, DollarSign, TrendingUp, BarChart2, AlertTriangle } from 'lucide-react';
import type { MetricasAlumnos, MetricasIngresos, MetricasGrupales } from '@/lib/metricas-supabase';
import { getMetricasAlumnos, getMetricasIngresos, getMetricasGrupales } from '@/lib/metricas-supabase';


function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function Bar({ value, color = '#121212' }: { value: number; color?: string }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#EBEBEB]">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  );
}

function StatCard({ label, value, sub, Icon }: { label: string; value: string | number; sub?: string; Icon: React.ElementType }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E8E8E8] bg-[#F5F5F5] p-4">
      <Icon size={14} strokeWidth={1.75} className="text-[#CACACA]" />
      <div>
        <p className="text-[22px] font-black tracking-tight text-[#121212]">{value}</p>
        <p className="mt-0.5 text-[11px] text-[#9B9B9B]">{label}</p>
        {sub && <p className="mt-1 text-[10px] text-[#AAAAAA]">{sub}</p>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F5F5F5]">
      <div className="border-b border-[#EBEBEB] px-5 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricRow({
  label, value, barPct, color, sub,
}: {
  label: string;
  value: string | number;
  barPct?: number;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-[#3E3E3E]">{label}</span>
        <div className="shrink-0 text-right">
          <span className="text-[14px] font-bold text-[#121212]">{value}</span>
          {sub && <span className="ml-1.5 text-[11px] text-[#AAAAAA]">{sub}</span>}
        </div>
      </div>
      {barPct !== undefined && <Bar value={barPct} color={color} />}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="border-t border-[#EBEBEB] pt-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#AAAAAA]">{label}</p>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[#EBEBEB] px-3 py-2.5">
      <span className="text-[12px] font-medium text-[#3E3E3E]">{label}</span>
      <span className="text-[14px] font-black text-[#121212]">{value}</span>
    </div>
  );
}

export default function MetricasPage() {
  const [alumnos,  setAlumnos]  = useState<MetricasAlumnos | null>(null);
  const [ingresos, setIngresos] = useState<MetricasIngresos | null>(null);
  const [grupales, setGrupales] = useState<MetricasGrupales | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    Promise.all([getMetricasAlumnos(), getMetricasIngresos(), getMetricasGrupales()])
      .then(([a, i, g]) => { setAlumnos(a); setIngresos(i); setGrupales(g); })
      .catch(() => setError('Error al cargar métricas.'))
      .finally(() => setLoading(false));
  }, []);

  const mesNombre      = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const totalReservas  = (grupales?.reservadas ?? 0) + (grupales?.asistidas ?? 0) + (grupales?.canceladas ?? 0);
  const pctAsistidas   = pct(grupales?.asistidas ?? 0, totalReservas);
  const totalIngresado = (ingresos?.atletasPagado ?? 0) + (ingresos?.grupalesPagado ?? 0);

  const atletasTotal   = (ingresos?.atletasPagado   ?? 0) + (ingresos?.atletasPendiente  ?? 0);
  const grupalesTotal  = (ingresos?.grupalesPagado  ?? 0) + (ingresos?.grupalesPendiente ?? 0);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="mb-8">
        <h1 className="text-[20px] font-bold tracking-tight text-[#121212]">Métricas</h1>
        <p className="mt-1 text-[12px] text-[#9B9B9B]">Vista general del negocio</p>
      </div>

      {error && (
        <div
          className="mb-5 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[12px]"
          style={{ background: 'rgba(180,64,64,0.08)', border: '1px solid rgba(180,64,64,0.2)' }}
        >
          <AlertTriangle size={13} className="text-[#B44040] shrink-0" />
          <span className="text-[#B44040]">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[96px] animate-pulse rounded-xl bg-[#EBEBEB]" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Total alumnos"
              value={alumnos?.total ?? 0}
              sub={`${alumnos?.activos ?? 0} activos`}
              Icon={Users}
            />
            <StatCard
              label="Deben pago"
              value={alumnos?.debe ?? 0}
              sub={alumnos && alumnos.debe > 0 ? `de ${alumnos.total} alumnos` : 'todos al día'}
              Icon={AlertTriangle}
            />
            <StatCard
              label={`Ingresos ${mesNombre}`}
              value={clp(ingresos?.esteMes ?? 0)}
              Icon={DollarSign}
            />
            <StatCard
              label="Asistencias grupales"
              value={grupales?.asistidas ?? 0}
              sub={`${pctAsistidas}% de reservas (30d)`}
              Icon={TrendingUp}
            />
          </div>

          {/* ── Main grid ── */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Ingresos */}
            <Card title="Ingresos">
              <div className="space-y-4">
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#AAAAAA]">Planes coacheados</p>
                  <div className="space-y-3">
                    <MetricRow
                      label="Pagado"
                      value={clp(ingresos?.atletasPagado ?? 0)}
                      barPct={pct(ingresos?.atletasPagado ?? 0, atletasTotal)}
                      color="#4A8A5A"
                    />
                    <MetricRow
                      label="Pendiente"
                      value={clp(ingresos?.atletasPendiente ?? 0)}
                      barPct={pct(ingresos?.atletasPendiente ?? 0, atletasTotal)}
                      color="#C4783A"
                    />
                  </div>
                </div>

                <Divider label="Clases grupales" />
                <div className="space-y-3">
                  <MetricRow
                    label="Pagado"
                    value={clp(ingresos?.grupalesPagado ?? 0)}
                    barPct={pct(ingresos?.grupalesPagado ?? 0, grupalesTotal)}
                    color="#4A8A5A"
                  />
                  <MetricRow
                    label="Pendiente"
                    value={clp(ingresos?.grupalesPendiente ?? 0)}
                    barPct={pct(ingresos?.grupalesPendiente ?? 0, grupalesTotal)}
                    color="#C4783A"
                  />
                </div>

                <Total label="Total ingresado" value={clp(totalIngresado)} />
              </div>
            </Card>

            {/* Alumnos */}
            <Card title="Alumnos">
              <div className="space-y-4">
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#AAAAAA]">Estado</p>
                  <div className="space-y-3">
                    <MetricRow
                      label="Activos"
                      value={alumnos?.activos ?? 0}
                      barPct={pct(alumnos?.activos ?? 0, alumnos?.total ?? 0)}
                      color="#4A8A5A"
                    />
                    <MetricRow
                      label="Inactivos"
                      value={alumnos?.inactivos ?? 0}
                      barPct={pct(alumnos?.inactivos ?? 0, alumnos?.total ?? 0)}
                      color="#C4783A"
                    />
                    {(alumnos?.archivados ?? 0) > 0 && (
                      <MetricRow
                        label="Archivados"
                        value={alumnos?.archivados ?? 0}
                        barPct={pct(alumnos?.archivados ?? 0, alumnos?.total ?? 0)}
                        color="#AAAAAA"
                      />
                    )}
                  </div>
                </div>

                <Divider label="Estado de pago" />
                <div className="space-y-3">
                  <MetricRow
                    label="Al día"
                    value={alumnos?.alDia ?? 0}
                    barPct={pct(alumnos?.alDia ?? 0, alumnos?.total ?? 0)}
                    color="#4A8A5A"
                  />
                  <MetricRow
                    label="Deben"
                    value={alumnos?.debe ?? 0}
                    barPct={pct(alumnos?.debe ?? 0, alumnos?.total ?? 0)}
                    color="#B44040"
                  />
                </div>
              </div>
            </Card>

            {/* Asistencia grupales */}
            <Card title="Clases grupales — últimos 30 días">
              {totalReservas === 0 ? (
                <p className="py-4 text-center text-[13px] text-[#AAAAAA]">Sin reservas en los últimos 30 días.</p>
              ) : (
                <div className="space-y-3">
                  <MetricRow
                    label="Reservadas"
                    value={grupales?.reservadas ?? 0}
                    sub={`${pct(grupales?.reservadas ?? 0, totalReservas)}%`}
                    barPct={pct(grupales?.reservadas ?? 0, totalReservas)}
                    color="#5B8FBB"
                  />
                  <MetricRow
                    label="Asistidas"
                    value={grupales?.asistidas ?? 0}
                    sub={`${pctAsistidas}%`}
                    barPct={pctAsistidas}
                    color="#4A8A5A"
                  />
                  <MetricRow
                    label="Canceladas"
                    value={grupales?.canceladas ?? 0}
                    sub={`${pct(grupales?.canceladas ?? 0, totalReservas)}%`}
                    barPct={pct(grupales?.canceladas ?? 0, totalReservas)}
                    color="#B44040"
                  />
                  <Total label="Total reservas" value={String(totalReservas)} />
                </div>
              )}
            </Card>

            {/* Créditos grupales */}
            <Card title="Créditos grupales (packs pagados)">
              {(grupales?.clasesTotales ?? 0) === 0 ? (
                <p className="py-4 text-center text-[13px] text-[#AAAAAA]">Sin packs activos.</p>
              ) : (
                <div className="space-y-3">
                  <MetricRow
                    label="Clases vendidas"
                    value={grupales?.clasesTotales ?? 0}
                  />
                  <MetricRow
                    label="Clases usadas"
                    value={grupales?.clasesUsadas ?? 0}
                    barPct={pct(grupales?.clasesUsadas ?? 0, grupales?.clasesTotales ?? 0)}
                    color="#121212"
                    sub={`${pct(grupales?.clasesUsadas ?? 0, grupales?.clasesTotales ?? 0)}%`}
                  />
                  <MetricRow
                    label="Clases disponibles"
                    value={grupales?.clasesRestantes ?? 0}
                    barPct={pct(grupales?.clasesRestantes ?? 0, grupales?.clasesTotales ?? 0)}
                    color="#4A8A5A"
                    sub={`${pct(grupales?.clasesRestantes ?? 0, grupales?.clasesTotales ?? 0)}%`}
                  />
                </div>
              )}
            </Card>

          </div>
        </>
      )}
    </div>
  );
}
