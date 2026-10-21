'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { generateHours, type HorarioConfig } from '@/lib/horario-config';
import {
  DIAS_PLAN, evaluarCelda, fechasSemana, sumarDias, todayIso,
  type Bloqueo, type Ocupacion, type SesionPlan,
} from '@/lib/agenda-plan';
import type { PlanModalidad } from '@/lib/planes';

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

/**
 * Semana completa (lunes a sábado) de un profesor. Cada celda muestra si la
 * hora está libre, compartible (2:1 con 1 cupo) u ocupada, y la clase del
 * alumno si ya está elegida. Un toque elige o cambia la hora de ESE día.
 */
export default function SemanaProfesor({
  lunes, onSemana, inicio, fin, config, modalidad, ocupacion, bloqueos, sesiones, onCelda, cargando,
}: {
  lunes:     string;
  onSemana:  (lunes: string) => void;
  inicio:    string;
  fin:       string;
  config:    HorarioConfig;
  modalidad: PlanModalidad;
  ocupacion: Ocupacion[];
  bloqueos:  Bloqueo[];
  sesiones:  SesionPlan[];
  onCelda:   (fecha: string, hora: string) => void;
  cargando?: boolean;
}) {
  const fechas = fechasSemana(lunes);
  const hoy    = todayIso();

  // Filas: unión de los bloques de todos los días abiertos (igual que /horario)
  const horasPorDia = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const dia of DIAS_PLAN) {
      const cfg = config.dias.find(x => x.dow === dia.n);
      m.set(dia.n, new Set(cfg?.abierto ? generateHours(cfg.apertura, cfg.cierre, config.duracionBloque) : []));
    }
    return m;
  }, [config]);
  const filas = useMemo(
    () => [...new Set([...horasPorDia.values()].flatMap(s => [...s]))].sort(),
    [horasPorDia],
  );

  const semanaAnterior  = sumarDias(lunes, -7);
  const semanaSiguiente = sumarDias(lunes, 7);
  const puedeAtras      = sumarDias(semanaAnterior, 5) >= inicio;
  const puedeAdelante   = semanaSiguiente <= fin;
  const fmt = (f: string) => { const [, m, d] = f.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };

  return (
    <div className="rounded-xl border border-[#C8C8C8] bg-white">
      <div className="flex items-center justify-between border-b border-[#E0E0E0] px-2 py-1.5">
        <button type="button" onClick={() => onSemana(semanaAnterior)} disabled={!puedeAtras}
          aria-label="Semana anterior" className="rounded-lg p-2 text-[#5E5E5E] hover:bg-[#F0F0F0] disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-xs font-bold text-[#121212]">Semana del {fmt(fechas[0])} al {fmt(fechas[5])}</p>
        <button type="button" onClick={() => onSemana(semanaSiguiente)} disabled={!puedeAdelante}
          aria-label="Semana siguiente" className="rounded-lg p-2 text-[#5E5E5E] hover:bg-[#F0F0F0] disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={`max-h-[340px] overflow-auto ${cargando ? 'opacity-50' : ''}`} aria-busy={cargando}>
        <table className="w-full table-fixed border-collapse text-center">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="w-11 py-1.5 text-[9px] font-semibold text-[#9B9B9B]">Hora</th>
              {DIAS_PLAN.map((dia, i) => (
                <th key={dia.n} className="py-1.5">
                  <span className="block text-[10px] font-bold text-[#121212]">{dia.corto}</span>
                  <span className="block text-[9px] text-[#9B9B9B]">{fmt(fechas[i])}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(hora => (
              <tr key={hora} className="border-t border-[#EFEFEF]">
                <td className="py-0.5 text-[10px] font-semibold tabular-nums text-[#777777]">{hora}</td>
                {DIAS_PLAN.map((dia, i) => {
                  const fecha  = fechas[i];
                  const sesion = sesiones.find(s => s.fecha === fecha);
                  const mia    = sesion?.hora === hora;
                  const abierto = horasPorDia.get(dia.n)?.has(hora);
                  const fuera  = fecha < inicio || fecha > fin || fecha < hoy;
                  if (!abierto || fuera) {
                    return <td key={dia.n} className="p-0.5"><div className="h-8 rounded-md bg-[#F4F4F4]" aria-hidden /></td>;
                  }
                  const c = evaluarCelda(fecha, hora, modalidad, ocupacion, bloqueos);
                  const bloqueada = !mia && (c.estado === 'ocupado' || c.estado === 'bloqueado');
                  const estilo = mia
                    ? 'bg-[#121212] text-white border-[#121212]'
                    : bloqueada
                      ? 'bg-[#EDEDED] text-[#B0B0B0] border-transparent cursor-not-allowed'
                      : c.estado === 'compartible'
                        ? 'bg-[#EAF3EC] text-[#2F6B3F] border-[#BFDCC7] hover:border-[#2F6B3F]'
                        : 'bg-white text-[#9B9B9B] border-[#E2E2E2] hover:border-[#121212] hover:text-[#121212]';
                  return (
                    <td key={dia.n} className="p-0.5">
                      <button type="button" disabled={bloqueada} onClick={() => onCelda(fecha, hora)}
                        title={bloqueada ? c.motivo : mia ? 'Toca de nuevo para quitar' : c.estado === 'compartible' ? 'Compartir con otro alumno 2:1' : 'Libre'}
                        aria-pressed={mia}
                        aria-label={`${dia.largo} ${fmt(fecha)} ${hora}: ${mia ? 'elegida' : bloqueada ? (c.motivo ?? 'ocupada') : c.estado === 'compartible' ? 'compartible 2:1' : 'libre'}`}
                        className={`h-8 w-full rounded-md border text-[9px] font-bold transition ${estilo}`}>
                        {mia ? (c.estado === 'compartible' ? '✓ 2:1' : '✓') : c.detalle}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[#E0E0E0] px-3 py-2 text-[10px] text-[#777777]">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-[#E2E2E2] bg-white" />Libre</span>
        {modalidad === '2:1' && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[#EAF3EC] border border-[#BFDCC7]" />2:1 con cupo</span>}
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[#EDEDED]" />Ocupado</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[#121212]" />Elegida</span>
      </div>
    </div>
  );
}
