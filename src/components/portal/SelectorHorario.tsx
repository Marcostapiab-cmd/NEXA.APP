'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { DIAS_CORTO, MESES_CORTO } from '@/lib/format';
import { generateHours } from '@/lib/horario-config';
import {
  getHorariosDisponibles, unirseListaEspera,
  type HorarioDisponible, type PoliticaAlumno,
} from '@/lib/reservas-alumno';

const RANGO_DIAS = 21;

function hoyChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}
function sumar(f: string, n: number): string {
  const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function dow(f: string): number { return new Date(`${f}T12:00:00Z`).getUTCDay(); }

export const claveHorario = (h: Pick<HorarioDisponible, 'fecha' | 'hora' | 'coachId'>) => `${h.fecha}|${h.hora}|${h.coachId}`;

/**
 * Horarios realmente disponibles para el alumno (los calcula la base de datos:
 * modalidad, cupos, profesor, bloqueos, capacidad y vigencia del plan).
 * Con `reservaId`, son los destinos posibles para reagendar esa clase.
 */
export default function SelectorHorario({ reservaId, politica, seleccionado, onElegir }: {
  reservaId?:   number;
  politica:     PoliticaAlumno | null;
  seleccionado: HorarioDisponible | null;
  onElegir:     (h: HorarioDisponible) => void;
}) {
  const [horarios, setHorarios] = useState<HorarioDisponible[] | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [dia,      setDia]      = useState<string | null>(null);
  const [espera,   setEspera]   = useState('');
  const [avisado,  setAvisado]  = useState<string | null>(null);
  const [msgEspera, setMsgEspera] = useState<string | null>(null);

  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    const hoy = hoyChile();
    getHorariosDisponibles(hoy, sumar(hoy, RANGO_DIAS), reservaId)
      .then(data => { if (!vivo) return; setHorarios(data); setDia(d => d ?? data[0]?.fecha ?? null); })
      .catch(() => { if (vivo) setError('No pudimos cargar los horarios. Revisa tu conexión.'); });
    return () => { vivo = false; };
  }, [reservaId, intento]);

  function reintentar() { setError(null); setHorarios(null); setIntento(n => n + 1); }

  const dias = useMemo(() => {
    const hoy = hoyChile();
    const out: string[] = [];
    for (let i = 0; i <= RANGO_DIAS; i++) { const f = sumar(hoy, i); if (dow(f) !== 0) out.push(f); }
    return out;
  }, []);
  const porDia = useMemo(() => {
    const m = new Map<string, HorarioDisponible[]>();
    for (const h of horarios ?? []) m.set(h.fecha, [...(m.get(h.fecha) ?? []), h]);
    return m;
  }, [horarios]);

  // Horas del día sin cupo para la lista de espera
  const horasSinCupo = useMemo(() => {
    if (!dia || !politica) return [];
    const cfg = politica.dias.find(d => d.dow === dow(dia));
    if (!cfg?.abierto) return [];
    const libres = new Set((porDia.get(dia) ?? []).map(h => h.hora));
    return generateHours(cfg.apertura, cfg.cierre, politica.duracionBloque).filter(h => !libres.has(h));
  }, [dia, politica, porDia]);

  async function avisarme() {
    if (!dia || !espera) return;
    setMsgEspera(null);
    const r = await unirseListaEspera(dia, espera, reservaId);
    if (r.ok) setAvisado(`${dia}|${espera}`);
    else setMsgEspera(r.mensaje);
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[#F3C5C5] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C]">
        {error}
        <button onClick={reintentar} className="mt-3 flex items-center gap-1.5 font-semibold text-[#121212]">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }
  if (!horarios) {
    return <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" /></div>;
  }

  const delDia = dia ? porDia.get(dia) ?? [] : [];

  return (
    <div>
      {/* Días */}
      <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1" role="listbox" aria-label="Día">
        {dias.map(f => {
          const n = porDia.get(f)?.length ?? 0;
          const activo = f === dia;
          const d = new Date(`${f}T12:00:00Z`);
          return (
            <button key={f} type="button" role="option" aria-selected={activo} onClick={() => setDia(f)}
              className="flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition"
              style={activo
                ? { background: '#121212', borderColor: '#121212', color: '#fff' }
                : { background: '#fff', borderColor: '#D8D8D8', color: n ? '#121212' : '#BDBDBD' }}>
              <span className="text-[10px] font-bold uppercase">{DIAS_CORTO[d.getUTCDay()]}</span>
              <span className="text-lg font-black leading-tight">{d.getUTCDate()}</span>
              <span className="text-[9px] uppercase opacity-70">{MESES_CORTO[d.getUTCMonth()]}</span>
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: n ? (activo ? '#fff' : '#16a34a') : 'transparent' }} />
            </button>
          );
        })}
      </div>

      {/* Horarios del día */}
      {delDia.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D8D8D8] py-8 text-center text-sm text-[#9B9B9B]">
          {horarios.length === 0 ? 'No hay horarios disponibles dentro de la vigencia de tu plan.' : 'Sin horarios disponibles este día.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {delDia.map(h => {
            const sel = seleccionado && claveHorario(seleccionado) === claveHorario(h);
            return (
              <li key={claveHorario(h)}>
                <button type="button" onClick={() => onElegir(h)} aria-pressed={!!sel}
                  className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition"
                  style={{ borderColor: sel ? '#121212' : '#D8D8D8', background: sel ? '#F5F5F5' : '#fff' }}>
                  <span className="w-14 text-lg font-black text-[#121212]">{h.hora}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-[#121212]">{h.modalidad} · {h.profesor}</span>
                    <span className="block text-xs text-[#16a34a]">
                      {h.cupos} {h.cupos === 1 ? 'cupo disponible' : 'cupos disponibles'}
                      {h.modalidad === '2:1' && h.cupos === 1 ? ' (compartida)' : ''}
                    </span>
                  </span>
                  {sel && <CheckCircle2 className="h-5 w-5 text-[#121212]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Lista de espera */}
      {politica?.listaEsperaActiva && dia && horasSinCupo.length > 0 && (
        <div className="mt-5 rounded-2xl bg-[#F5F5F5] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#777]">¿No está la hora que buscas?</p>
          {avisado?.startsWith(`${dia}|`) ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-[#121212]">
              <Bell className="h-4 w-4" /> Te avisaremos por correo si se libera un cupo a las {avisado.split('|')[1]}.
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <select value={espera} onChange={e => setEspera(e.target.value)} aria-label="Hora para lista de espera"
                className="flex-1 rounded-xl border border-[#C8C8C8] bg-white px-3 py-2.5 text-sm text-[#121212]">
                <option value="">Elige una hora</option>
                {horasSinCupo.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <button type="button" onClick={avisarme} disabled={!espera}
                className="flex items-center gap-1.5 rounded-xl bg-[#121212] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">
                <Bell className="h-4 w-4" /> Avisarme
              </button>
            </div>
          )}
          {msgEspera && <p className="mt-2 text-xs text-[#B91C1C]">{msgEspera}</p>}
          <p className="mt-2 text-[11px] text-[#9B9B9B]">El aviso no reserva el cupo: deberás confirmarlo tú.</p>
        </div>
      )}
    </div>
  );
}
