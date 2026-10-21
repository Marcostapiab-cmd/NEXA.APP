'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { sesionReservable, type SesionPublica } from '@/lib/catalogo';
import { DIAS_CORTO, MESES_CORTO } from '@/lib/format';

export interface SesionElegida {
  clase_id: string;
  nombre:   string;
  fecha:    string;
  hora:     string;
}

/**
 * Fechas y horarios de clases grupales con cupos reales
 * (get_sesiones_publicas). Las clases sin cupo, bloqueadas, ya pasadas o
 * posteriores a `hasta` se muestran deshabilitadas. El servidor vuelve a
 * validar todo al reservar.
 */
export default function SelectorSesion({ valor, onCambio, dias = 21, hasta }: {
  valor:    SesionElegida | null;
  onCambio: (s: SesionElegida | null) => void;
  dias?:    number;
  hasta?:   Date;   // último día permitido (vigencia del pack)
}) {
  const [sesiones, setSesiones] = useState<SesionPublica[]>([]);
  const [estado,   setEstado]   = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [fechaSel, setFechaSel] = useState<string | null>(valor?.fecha ?? null);

  const [intento,  setIntento]  = useState(0);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('get_sesiones_publicas', { p_dias: dias }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setEstado('error'); return; }
      setSesiones((data ?? []) as SesionPublica[]);
      setEstado('ok');
    });
    return () => { vivo = false; };
  }, [dias, intento]);

  const porFecha = useMemo(() => {
    const m = new Map<string, SesionPublica[]>();
    for (const s of sesiones) {
      const arr = m.get(s.fecha) ?? [];
      arr.push(s);
      m.set(s.fecha, arr);
    }
    return m;
  }, [sesiones]);

  const fueraDeVigencia = useCallback((s: SesionPublica) =>
    hasta ? new Date(`${s.fecha}T${s.hora}:00`) > hasta : false, [hasta]);

  const fechas = useMemo(() => Array.from(porFecha.keys()).sort(), [porFecha]);
  const fechaActiva = fechaSel && porFecha.has(fechaSel)
    ? fechaSel
    : fechas.find(f => porFecha.get(f)!.some(s => sesionReservable(s) && !fueraDeVigencia(s))) ?? fechas[0] ?? null;

  if (estado === 'cargando') {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <span className="sr-only">Cargando horarios…</span>
        <div className="flex gap-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="nx-skeleton h-[68px] w-[58px] shrink-0" />)}</div>
        {[0, 1, 2].map(i => <div key={i} className="nx-skeleton h-16 w-full" />)}
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div className="nx-alert nx-alert-error flex flex-wrap items-center justify-between gap-3" role="alert">
        No pudimos cargar los horarios.
        <button type="button" onClick={() => { setEstado('cargando'); setIntento(i => i + 1); }} className="nx-btn nx-btn-outline" style={{ minHeight: 40 }}>
          <RefreshCw size={14} aria-hidden /> Reintentar
        </button>
      </div>
    );
  }

  if (fechas.length === 0) {
    return <p className="nx-alert nx-alert-info">No hay clases grupales programadas en los próximos {dias} días.</p>;
  }

  const delDia = (fechaActiva ? porFecha.get(fechaActiva) : []) ?? [];

  return (
    <div>
      <div role="listbox" aria-label="Fecha" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2">
        {fechas.map(f => {
          const d = new Date(`${f}T12:00:00`);
          const hayCupo = porFecha.get(f)!.some(s => sesionReservable(s) && !fueraDeVigencia(s));
          const sel = f === fechaActiva;
          return (
            <button key={f} type="button" role="option" aria-selected={sel}
              aria-label={`${DIAS_CORTO[d.getDay()]} ${d.getDate()} de ${MESES_CORTO[d.getMonth()]}${hayCupo ? '' : ', sin cupos'}`}
              onClick={() => setFechaSel(f)}
              className="flex h-[68px] w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl transition-colors"
              style={{
                background: sel ? 'var(--nx-white)' : 'transparent',
                color:      sel ? 'var(--nx-black)' : hayCupo ? 'var(--nx-white)' : 'var(--nexa-faint)',
                border:     `1px solid ${sel ? 'var(--nx-white)' : 'var(--nx-line)'}`,
              }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider">{DIAS_CORTO[d.getDay()]}</span>
              <span className="text-[20px] font-bold leading-none">{d.getDate()}</span>
              <span className="text-[10px] uppercase">{MESES_CORTO[d.getMonth()]}</span>
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Horario" className="space-y-2">
        {delDia.map(s => {
          const fuera = fueraDeVigencia(s);
          const ok    = sesionReservable(s) && !fuera;
          const sel   = valor?.clase_id === s.clase_id && valor.fecha === s.fecha && valor.hora === s.hora;
          const motivo = s.bloqueada ? 'No disponible' : s.disponibles <= 0 ? 'Sin cupos'
            : fuera ? 'Fuera de vigencia' : !sesionReservable(s) ? 'Ya comenzó' : null;
          return (
            <button key={`${s.clase_id}-${s.hora}`} type="button" role="radio" aria-checked={sel} disabled={!ok}
              onClick={() => onCambio(sel ? null : { clase_id: s.clase_id, nombre: s.nombre, fecha: s.fecha, hora: s.hora })}
              className="nx-card flex w-full items-center gap-4 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-45"
              data-selected={sel}>
              <span className="w-14 shrink-0 text-[17px] font-bold tabular-nums" style={{ color: 'var(--nx-white)' }}>{s.hora}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold" style={{ color: 'var(--nx-white)' }}>{s.nombre}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]" style={{ color: 'var(--nx-muted)' }}>
                  <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{s.duracion_min} min</span>
                  {s.coach_nombre && <span>{s.coach_nombre}</span>}
                </span>
              </span>
              <span className="shrink-0 text-right text-[12px] font-semibold"
                style={{ color: motivo ? 'var(--nexa-faint)' : s.disponibles <= 3 ? 'var(--nexa-warning)' : 'var(--nx-sub)' }}>
                {motivo ?? <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden />{s.disponibles} {s.disponibles === 1 ? 'cupo' : 'cupos'}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
