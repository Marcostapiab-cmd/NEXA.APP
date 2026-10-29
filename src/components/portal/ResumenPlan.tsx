'use client';

// Contador de clases del plan vigente (MI NEXA). Los números salen de la base de
// datos (`alumno_mi_plan`, migración 042): el navegador solo los muestra.

import Link from 'next/link';
import { Dumbbell, ChevronRight, CalendarClock } from 'lucide-react';

export interface ResumenPlanData {
  vigente: boolean;
  nombre?: string;
  modalidad?: string;
  tipo?: string;
  fin?: string;
  dias_restantes?: number;
  contratadas?: number;
  arrastradas?: number;
  realizadas?: number;
  inasistencias?: number;
  tardias?: number;
  agendadas?: number;
  por_confirmar?: number;
  disponibles?: number;
  pendientes?: number;
  proxima?: { fecha: string; hora: string; profesor?: string | null } | null;
}

const MODALIDAD: Record<string, string> = { '1:1': 'Personalizado 1:1', '2:1': 'Semipersonalizado 2:1' };

function fechaLarga(f?: string) {
  if (!f) return '';
  return new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function Cifra({ valor, label, fuerte }: { valor: number; label: string; fuerte?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-3 ${fuerte ? 'bg-[#121212] text-white' : 'bg-[#F5F5F5] text-[#121212]'}`}>
      <p className="text-2xl font-black leading-none">{valor}</p>
      <p className={`mt-1 text-[11px] leading-tight ${fuerte ? 'text-white/70' : 'text-[#5E5E5E]'}`}>{label}</p>
    </div>
  );
}

export default function ResumenPlan({ r }: { r: ResumenPlanData }) {
  const contratadas = r.contratadas ?? 0;
  const realizadas  = r.realizadas ?? 0;
  const perdidas    = (r.inasistencias ?? 0) + (r.tardias ?? 0);
  const agendadas   = (r.agendadas ?? 0) + (r.por_confirmar ?? 0);
  const pct = (v: number) => (contratadas ? Math.min(100, (v / contratadas) * 100) : 0);
  const dias = r.dias_restantes;

  return (
    <div className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Dumbbell className="h-4 w-4 text-[#5E5E5E]" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Mi plan</p>
      </div>
      <p className="font-bold text-[#121212]">{r.nombre}</p>
      <p className="text-xs text-[#5E5E5E]">
        {[MODALIDAD[r.modalidad ?? ''] ?? r.modalidad, r.tipo && r.tipo[0].toUpperCase() + r.tipo.slice(1)].filter(Boolean).join(' · ')}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra valor={r.pendientes ?? 0} label="Clases pendientes" fuerte />
        <Cifra valor={r.disponibles ?? 0} label="Disponibles para reservar" />
        <Cifra valor={agendadas} label="Agendadas" />
        <Cifra valor={realizadas} label="Realizadas" />
      </div>

      {/* Barra: realizadas · perdidas · agendadas · disponibles */}
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[#EBEBEB]" aria-hidden>
        <div className="h-full bg-[#121212]" style={{ width: `${pct(realizadas)}%` }} />
        <div className="h-full bg-[#dc2626]" style={{ width: `${pct(perdidas)}%` }} />
        <div className="h-full bg-[#9B9B9B]" style={{ width: `${pct(agendadas)}%` }} />
      </div>
      <p className="mt-2 text-xs text-[#5E5E5E]">
        {contratadas} clases contratadas
        {(r.arrastradas ?? 0) > 0 && ` (incluye ${r.arrastradas} del período anterior)`}
        {perdidas > 0 && ` · ${perdidas} descontada${perdidas === 1 ? '' : 's'} por inasistencia o cancelación tardía`}
      </p>
      {(r.por_confirmar ?? 0) > 0 && (
        <p className="mt-1 text-xs text-[#d97706]">
          {r.por_confirmar} clase{r.por_confirmar === 1 ? '' : 's'} pasada{r.por_confirmar === 1 ? '' : 's'} esperando que el profesor confirme tu asistencia.
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-[#EBEBEB] pt-4 text-sm">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#5E5E5E]" />
          <p className="text-[#121212]">
            <span className="text-[#5E5E5E]">Próximo entrenamiento: </span>
            {r.proxima
              ? <>{fechaLarga(r.proxima.fecha)} · {r.proxima.hora}{r.proxima.profesor ? ` · ${r.proxima.profesor}` : ''}</>
              : 'sin clases agendadas'}
          </p>
        </div>
        {r.fin && (
          <p className="pl-6 text-[#121212]">
            <span className="text-[#5E5E5E]">Vence: </span>{fechaLarga(r.fin)}
            {typeof dias === 'number' && dias >= 0 && dias <= 14 && (
              <span className="ml-1 font-semibold text-[#d97706]">({dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`})</span>
            )}
          </p>
        )}
        <p className="pl-6 text-xs text-[#9B9B9B]">
          Las clases no usadas vencen con el plan. Si renuevas antes, las pendientes pasan a tu siguiente período.
        </p>
      </div>

      <Link href="/portal/creditos" className="mt-4 flex items-center justify-between rounded-xl border border-[#EBEBEB] px-4 py-3 text-sm font-semibold text-[#121212] transition hover:border-[#121212]">
        Ver el historial de mis clases
        <ChevronRight className="h-4 w-4 text-[#9B9B9B]" />
      </Link>
    </div>
  );
}
