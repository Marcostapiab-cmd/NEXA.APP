'use client';

import { AlertTriangle, Calendar, Clock, Dumbbell, RefreshCw, TrendingUp, XCircle } from 'lucide-react';
import {
  type Plan,
  type Reserva,
  type Reagenda,
  getPlanEstado,
  getDiasRestantes,
  getClasesRestantes,
  getPlanProgress,
  getEffectiveEndDate,
  ESTADO_CONFIG,
  PLAN_TIPO_LABEL,
  formatDate,
  todayStr,
} from '@/lib/planes';

interface Props {
  plan: Plan;
  reservas: Reserva[];
  reagendas: Reagenda[];
  isAdmin?: boolean;
  onEdit?: () => void;
  onLogClase?: () => void;
  onExtend?: () => void;
}

export default function PlanStatusCard({ plan, reservas, reagendas, isAdmin, onEdit, onLogClase, onExtend }: Props) {
  const hoy       = todayStr();
  const estado    = getPlanEstado(plan, hoy);
  const cfg       = ESTADO_CONFIG[estado];
  const diasRest  = getDiasRestantes(plan, hoy);
  const clasesRest = getClasesRestantes(plan);
  const progress  = getPlanProgress(plan);
  const endDate   = getEffectiveEndDate(plan);
  const isExtended = plan.extendedUntil && plan.extendedUntil > plan.endDate;

  // Próxima clase (reserva futura confirmada/pendiente)
  const proximaClase = reservas
    .filter(r => r.fecha >= hoy && (r.estado === 'pendiente' || r.estado === 'confirmada'))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];

  // Reagendas pendientes
  const reagendasPendientes = reagendas.filter(r => r.estado === 'pendiente' && r.fechaLimite >= hoy);

  // Alertas
  const alerts: { msg: string; level: 'warn' | 'error' }[] = [];
  if (estado === 'vencido')    alerts.push({ msg: 'El plan está vencido. Renueva para seguir reservando clases.', level: 'error' });
  if (estado === 'sin_clases') alerts.push({ msg: 'No quedan clases disponibles en este plan.', level: 'error' });
  if (estado === 'por_vencer' && diasRest  <= 7 && diasRest  > 0) alerts.push({ msg: `El plan vence en ${diasRest} día${diasRest !== 1 ? 's' : ''}.`, level: 'warn' });
  if (estado === 'por_vencer' && clasesRest <= 2 && clasesRest > 0) alerts.push({ msg: `Solo quedan ${clasesRest} clase${clasesRest !== 1 ? 's' : ''} disponibles.`, level: 'warn' });
  reagendasPendientes.forEach(r => {
    const diasLimite = Math.ceil(
      (new Date(r.fechaLimite + 'T12:00:00').getTime() - new Date(hoy + 'T12:00:00').getTime()) / 86400000
    );
    if (diasLimite <= 7)
      alerts.push({ msg: `Clase reagendada pendiente: debes reservar antes del ${formatDate(r.fechaLimite)}.`, level: 'warn' });
  });

  return (
    <div className="overflow-hidden rounded-2xl border bg-[#0d0d0d]"
      style={{ borderColor: cfg.border }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 px-5 py-4"
        style={{ backgroundColor: cfg.bg, borderBottom: `1px solid ${cfg.border}` }}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-white">{plan.nombre}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
              style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
              {cfg.label}
            </span>
            {isExtended && (
              <span className="rounded-full border border-[#3b82f640] bg-[#3b82f610] px-2.5 py-0.5 text-[10px] font-bold text-[#3b82f6]">
                Extendido
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#555555]">{PLAN_TIPO_LABEL[plan.tipo]}</p>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1.5">
            {onLogClase && estado !== 'vencido' && clasesRest > 0 && (
              <button onClick={onLogClase}
                className="flex items-center gap-1.5 rounded-xl border border-[#f9731630] bg-[#f9731610] px-3 py-1.5 text-xs font-bold text-[#f97316] transition hover:bg-[#f9731620]">
                <Dumbbell className="h-3.5 w-3.5" /> Registrar clase
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit}
                className="rounded-xl border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#888888] transition hover:border-[#444444] hover:text-white">
                Editar
              </button>
            )}
            {onExtend && (
              <button onClick={onExtend}
                className="rounded-xl border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#888888] transition hover:border-[#444444] hover:text-white">
                Extender
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Alertas ── */}
      {alerts.length > 0 && (
        <div className="space-y-2 border-b border-[#1e1e1e] px-5 py-3">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs ${
              a.level === 'error'
                ? 'bg-red-950/30 text-red-400'
                : 'bg-[#f9731615] text-[#f97316]'
            }`}>
              {a.level === 'error'
                ? <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              }
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="px-5 py-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-[#555555]">Clases utilizadas</span>
          <span className="font-bold text-white">
            {plan.usedClases} <span className="font-normal text-[#555555]">/ {plan.totalClases}</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#1a1a1a]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              backgroundColor: cfg.color,
              opacity: estado === 'vencido' ? 0.4 : 1,
            }} />
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-px border-t border-[#1a1a1a] sm:grid-cols-4">
        {[
          {
            icon: <Dumbbell className="h-4 w-4" />,
            label: 'Restantes',
            value: estado === 'sin_clases' || estado === 'vencido' ? '0' : String(clasesRest),
            highlight: clasesRest <= 2 && estado !== 'vencido',
          },
          {
            icon: <Clock className="h-4 w-4" />,
            label: 'Días restantes',
            value: estado === 'vencido' ? 'Vencido' : `${diasRest}d`,
            highlight: diasRest <= 7 && estado !== 'vencido',
          },
          {
            icon: <Calendar className="h-4 w-4" />,
            label: 'Inicio',
            value: formatDate(plan.startDate),
          },
          {
            icon: <Calendar className="h-4 w-4" />,
            label: isExtended ? 'Vence (ext.)' : 'Vencimiento',
            value: formatDate(endDate),
            highlight: estado === 'vencido',
          },
        ].map(({ icon, label, value, highlight }, i) => (
          <div key={i} className="flex flex-col gap-1.5 bg-[#0d0d0d] px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[#444444]"
              style={highlight ? { color: cfg.color } : undefined}>
              {icon}
              <span className="text-[10px] font-bold uppercase tracking-widest"
                style={highlight ? { color: cfg.color } : undefined}>
                {label}
              </span>
            </div>
            <p className="text-lg font-bold leading-none"
              style={highlight ? { color: cfg.color } : { color: '#ffffff' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Próxima clase + reagendas pendientes ── */}
      {(proximaClase || reagendasPendientes.length > 0) && (
        <div className="space-y-2 border-t border-[#1a1a1a] px-5 py-4">
          {proximaClase && (
            <div className="flex items-center gap-3 rounded-xl border border-[#3b82f630] bg-[#3b82f610] px-3 py-2.5">
              <TrendingUp className="h-4 w-4 shrink-0 text-[#3b82f6]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">
                  Próxima clase · {formatDate(proximaClase.fecha)}
                  {proximaClase.hora && ` · ${proximaClase.hora}`}
                </p>
                {proximaClase.descripcion && (
                  <p className="truncate text-[11px] text-[#555555]">{proximaClase.descripcion}</p>
                )}
              </div>
            </div>
          )}
          {reagendasPendientes.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-[#f9731630] bg-[#f9731610] px-3 py-2.5">
              <RefreshCw className="h-4 w-4 shrink-0 text-[#f97316]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#f97316]">Clase reagendada pendiente</p>
                <p className="text-[11px] text-[#555555]">
                  Puedes reagendar esta clase hasta el <strong className="text-[#f97316]">{formatDate(r.fechaLimite)}</strong>
                  {r.motivo && ` · ${r.motivo}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Notas admin ── */}
      {plan.adminNota && (
        <div className="border-t border-[#1a1a1a] px-5 py-3">
          <p className="text-[11px] text-[#444444] italic">Nota: {plan.adminNota}</p>
        </div>
      )}
    </div>
  );
}
