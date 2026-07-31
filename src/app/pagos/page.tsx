'use client';

import { useEffect, useState } from 'react';
import { getAllPagosDB, type Pago } from '@/lib/pagos-supabase';
import { CreditCard, CheckCircle2, Clock, XCircle, RefreshCw, ExternalLink } from 'lucide-react';

const ESTADO_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pagado:      { label: 'Pagado',      icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
  pendiente:   { label: 'Pendiente',   icon: Clock,        color: '#d97706', bg: '#fffbeb' },
  fallido:     { label: 'Fallido',     icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  reembolsado: { label: 'Reembolsado', icon: RefreshCw,    color: '#6b7280', bg: '#f9fafb' },
};

export default function PagosPage() {
  const [pagos,    setPagos]    = useState<Pago[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filtro,   setFiltro]   = useState<'todos' | Pago['estado']>('todos');

  useEffect(() => {
    getAllPagosDB()
      .then(setPagos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtrados = filtro === 'todos' ? pagos : pagos.filter(p => p.estado === filtro);

  const stats = {
    totalPagado:    pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0),
    pendienteCount: pagos.filter(p => p.estado === 'pendiente').length,
    pagadoCount:    pagos.filter(p => p.estado === 'pagado').length,
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#121212]" />
          <h1 className="text-2xl font-black text-[#121212]">Pagos</h1>
        </div>
        <p className="mt-1 text-sm text-[#5E5E5E]">Historial de cobros generados vía Flow.cl</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Recaudado',  value: `$${stats.totalPagado.toLocaleString('es-CL')}`, sub: 'CLP confirmado' },
          { label: 'Pagados',    value: String(stats.pagadoCount),    sub: 'cobros exitosos' },
          { label: 'Pendientes', value: String(stats.pendienteCount), sub: 'por confirmar' },
        ].map(s => (
          <div key={s.label} className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">{s.label}</p>
            <p className="mt-1 text-xl font-black text-[#121212]">{s.value}</p>
            <p className="text-[11px] text-[#9B9B9B]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['todos', 'pagado', 'pendiente', 'fallido', 'reembolsado'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filtro === f
                ? 'bg-[#121212] text-white'
                : 'border border-[#CACACA] text-[#5E5E5E] hover:border-[#888]'
            }`}
          >
            {f === 'todos' ? 'Todos' : (ESTADO_CONFIG[f]?.label ?? f)}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center gap-2 py-12 text-[#5E5E5E]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
          Cargando...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#CACACA] py-16 text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
          <p className="text-sm text-[#9B9B9B]">
            {filtro === 'todos' ? 'Sin pagos registrados aún.' : `Sin pagos con estado "${ESTADO_CONFIG[filtro]?.label ?? filtro}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(pago => {
            const cfg = ESTADO_CONFIG[pago.estado] ?? ESTADO_CONFIG.pendiente;
            const Icn = cfg.icon;
            return (
              <div key={pago.id}
                className="rounded-[12px] border border-[#CACACA] bg-[#F8F8F8] px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#121212]">
                      {pago.descripcion || 'Cobro sin descripción'}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[#5E5E5E]">
                      <span className="font-bold text-[#121212]">
                        ${pago.monto.toLocaleString('es-CL')} CLP
                      </span>
                      {pago.fechaPago && (
                        <span>Pagado: {new Date(pago.fechaPago).toLocaleDateString('es-CL')}</span>
                      )}
                      {!pago.fechaPago && (
                        <span>Creado: {new Date(pago.createdAt).toLocaleDateString('es-CL')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={{ color: cfg.color, background: cfg.bg }}
                    >
                      <Icn className="h-3 w-3" />
                      {cfg.label}
                    </span>
                    {pago.checkoutUrl && pago.estado === 'pendiente' && (
                      <a
                        href={pago.checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[#CACACA] p-1.5 text-[#5E5E5E] transition hover:text-[#121212]"
                        title="Abrir link de pago"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
