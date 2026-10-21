'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Repeat, Trash2, CalendarRange } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  type Plan, type PlanTipo, type PlanModalidad,
  PLAN_SEMANAS, calcEndDate, todayStr, addDays,
} from '@/lib/planes';
import { upsertPlanDB, insertReservasBulkDB, deletePlanDB } from '@/lib/planes-supabase';
import { getCoachesActivosDB, type Coach } from '@/lib/coaches-supabase';
import { DEFAULT_HORARIO_CONFIG, getBloqueos, getHorarioConfig, generateHours, type HorarioConfig } from '@/lib/horario-config';
import {
  DIAS_PLAN, alternarSesion, conflictosSesiones, diaSemana, fechasDelDia, fechasSemana, lunesDe,
  moverSesion, quitarSesion, repetirDia, repetirSemana, tipoClaseDeModalidad,
  type Bloqueo, type Ocupacion, type SesionPlan,
} from '@/lib/agenda-plan';
import SemanaProfesor from './SemanaProfesor';

const IC = 'w-full rounded-xl border border-[#C8C8C8] bg-[#F8F8F8] px-3 py-2.5 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]';
const LC = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]';
const ESTADOS_INACTIVOS = '(cancelada_tiempo,cancelada_tarde,cancelada_nexa,no_show)';

const TIPOS: { value: PlanTipo; label: string; sub: string }[] = [
  { value: 'mensual',       label: 'Mensual',    sub: '4 sem'  },
  { value: 'trimestral',    label: 'Trimestral', sub: '12 sem' },
  { value: 'semestral',     label: 'Semestral',  sub: '24 sem' },
  { value: 'personalizado', label: 'Custom',     sub: 'Manual' },
];

function fmtFecha(ds: string) {
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}
const nombreDia = (f: string) => DIAS_PLAN.find(x => x.n === diaSemana(f))?.corto ?? 'Dom';

async function cargarOcupacion(coachId: string, desde: string, hasta: string): Promise<Ocupacion[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('fecha, hora, tipo_clase')
    .eq('coach_id', coachId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .not('estado', 'in', ESTADOS_INACTIVOS)
    .not('tipo_clase', 'ilike', '%grupal%');
  if (error) throw error;
  return ((data ?? []) as { fecha: string; hora: string | null; tipo_clase: string | null }[])
    .filter(r => r.hora)
    .map(r => ({ fecha: String(r.fecha).slice(0, 10), hora: String(r.hora).slice(0, 5), tipo_clase: r.tipo_clase }));
}

interface Props {
  alumnoId:          string;
  alumnoNombre:      string;
  modalidadInicial?: PlanModalidad;   // tipo de sesión de la ficha del alumno
  onSaved: (plan: Plan, reservasCount: number) => void;
  onClose: () => void;
}

export default function InscripcionModal({ alumnoId, alumnoNombre, modalidadInicial, onSaved, onClose }: Props) {
  const [modalidad, setModalidad] = useState<PlanModalidad>(modalidadInicial ?? '1:1');
  const [tipo,      setTipo]      = useState<PlanTipo>('mensual');
  const [startDate, setStart]     = useState(todayStr());
  const [endDateMan,setEndMan]    = useState('');
  const [coaches,   setCoaches]   = useState<Coach[]>([]);
  const [coachId,   setCoachId]   = useState('');
  const [config,    setConfig]    = useState<HorarioConfig>(DEFAULT_HORARIO_CONFIG);
  const [ocupacion, setOcupacion] = useState<Ocupacion[]>([]);
  const [bloqueos,  setBloqueos]  = useState<Bloqueo[]>([]);
  const [cargandoOc,setCargOc]    = useState(false);
  const [lunes,     setLunes]     = useState(lunesDe(todayStr()));
  const [sesiones,  setSesiones]  = useState<SesionPlan[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const isCustom = tipo === 'personalizado';
  const semanas  = isCustom ? undefined : PLAN_SEMANAS[tipo];
  const endDate  = isCustom ? (endDateMan || addDays(startDate, 30)) : calcEndDate(startDate, tipo);
  const coach    = coaches.find(c => c.id === coachId);

  useEffect(() => {
    getCoachesActivosDB().then(setCoaches).catch(() => {});
    getHorarioConfig().then(setConfig).catch(() => {});
  }, []);

  // Ocupación del profesor y bloqueos durante toda la vigencia del plan
  useEffect(() => {
    if (!coachId) return;
    let vivo = true;
    Promise.resolve().then(() => vivo && setCargOc(true));
    Promise.all([cargarOcupacion(coachId, startDate, endDate), getBloqueos(startDate, endDate)])
      .then(([oc, bl]) => {
        if (!vivo) return;
        setOcupacion(oc);
        setBloqueos(bl.map(b => ({ fecha: b.fecha, horaInicio: b.horaInicio, horaFin: b.horaFin })));
      })
      .catch(() => vivo && setError('No se pudo cargar la agenda del profesor.'))
      .finally(() => vivo && setCargOc(false));
    return () => { vivo = false; };
  }, [coachId, startDate, endDate]);

  const conflictos = useMemo(
    () => conflictosSesiones(sesiones, modalidad, ocupacion, bloqueos, startDate, endDate),
    [sesiones, modalidad, ocupacion, bloqueos, startDate, endDate],
  );
  const nConflictos = Object.keys(conflictos).length;

  const semanaVisible = useMemo(() => new Set(fechasSemana(lunes)), [lunes]);
  const sesionesSemana = sesiones.filter(s => semanaVisible.has(s.fecha));

  const horasDia = (f: string) => {
    const cfg = config.dias.find(x => x.dow === (diaSemana(f) % 7));
    return cfg?.abierto ? generateHours(cfg.apertura, cfg.cierre, config.duracionBloque) : [];
  };

  function elegirProfesor(id: string) {
    setCoachId(prev => prev === id ? prev : id);
    setLunes(lunesDe(startDate < todayStr() ? todayStr() : startDate));
  }

  function cambiarInicio(v: string) {
    setStart(v);
    setLunes(lunesDe(v));
  }

  async function handleSave() {
    setError('');
    if (!isCustom && sesiones.length === 0) { setError('Elige al menos una clase en la semana del profesor.'); return; }
    if (sesiones.length > 0 && !coachId)  { setError('Elige el profesor.'); return; }

    setSaving(true);
    try {
      // Verificación final con datos frescos (otro usuario pudo agendar mientras tanto)
      if (sesiones.length > 0) {
        const [ocFresca, blFresco] = await Promise.all([cargarOcupacion(coachId, startDate, endDate), getBloqueos(startDate, endDate)]);
        const bl = blFresco.map(b => ({ fecha: b.fecha, horaInicio: b.horaInicio, horaFin: b.horaFin }));
        const c = conflictosSesiones(sesiones, modalidad, ocFresca, bl, startDate, endDate);
        if (Object.keys(c).length) {
          setOcupacion(ocFresca); setBloqueos(bl);
          setError(`Hay ${Object.keys(c).length} clase(s) con problemas. Cámbialas en la lista antes de guardar.`);
          return;
        }
      }

      const plan: Plan = {
        id:          crypto.randomUUID(),
        alumnoId,
        nombre:      `Plan ${TIPOS.find(t => t.value === tipo)?.label ?? tipo} ${modalidad}`,
        tipo,
        modalidad,
        totalClases: sesiones.length,
        usedClases:  0,
        startDate,
        endDate,
        createdAt:   new Date().toISOString(),
      };
      await upsertPlanDB(plan);

      if (sesiones.length) {
        const rows = sesiones.map(s => ({
          alumno_id:  alumnoId,
          plan_id:    plan.id,
          fecha:      s.fecha,
          hora:       s.hora,
          coach_id:   coachId,
          estado:     'pendiente',
          tipo_clase: tipoClaseDeModalidad(modalidad),
        }));
        try {
          await insertReservasBulkDB(rows); // un solo INSERT: o entran todas o ninguna
        } catch (insertErr) {
          await deletePlanDB(plan.id).catch(() => {});
          throw insertErr;
        }
      }

      onSaved(plan, sesiones.length);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (typeof e === 'object' && e !== null && 'message' in e) ? String((e as { message: unknown }).message)
        : 'No se pudo guardar el plan.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const porDia = DIAS_PLAN.map(d => ({ ...d, n_: sesiones.filter(s => diaSemana(s.fecha) === d.n).length })).filter(d => d.n_ > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-2 pt-6 backdrop-blur-sm sm:p-4 sm:pt-10">
      <div className="w-full max-w-2xl rounded-2xl border border-[#C8C8C8] bg-[#EBEBEB] shadow-2xl">

        <div className="flex items-center justify-between border-b border-[#C8C8C8] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">Inscribir alumno</p>
            <p className="mt-0.5 text-xs text-[#777777]">{alumnoNombre}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-xl border border-[#C8C8C8] p-2 text-[#777777] transition hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto">
          <div className="space-y-5 p-4 sm:p-5">

            {/* Modalidad */}
            <div>
              <label className={LC}>Modalidad</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['1:1', '2:1'] as PlanModalidad[]).map(m => (
                  <button key={m} type="button" onClick={() => setModalidad(m)} aria-pressed={modalidad === m}
                    className={`rounded-xl border py-2.5 text-center transition ${modalidad === m ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#C8C8C8] text-[#777777] hover:border-[#9B9B9B]'}`}>
                    <p className="text-sm font-bold">{m}</p>
                    <p className="text-[10px] opacity-70">{m === '1:1' ? 'Horario exclusivo' : 'Hasta 2 alumnos por horario'}</p>
                  </button>
                ))}
              </div>
              {modalidadInicial && modalidadInicial !== modalidad && (
                <p className="mt-1.5 text-[11px] text-[#C4783A]">La ficha del alumno dice {modalidadInicial}.</p>
              )}
            </div>

            {/* Tipo */}
            <div>
              <label className={LC}>Tipo de plan</label>
              <div className="grid grid-cols-4 gap-1.5">
                {TIPOS.map(t => (
                  <button key={t.value} type="button" onClick={() => setTipo(t.value)} aria-pressed={tipo === t.value}
                    className={`rounded-xl border py-2.5 text-center transition ${tipo === t.value ? 'border-[#121212] bg-[#121212]/8 text-[#121212]' : 'border-[#C8C8C8] text-[#777777] hover:border-[#9B9B9B]'}`}>
                    <p className="text-[11px] font-bold">{t.label}</p>
                    <p className="mt-0.5 text-[9px] opacity-60">{t.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LC}>Fecha de inicio</label>
                <input type="date" value={startDate} onChange={e => cambiarInicio(e.target.value)} className={IC} />
              </div>
              {isCustom ? (
                <div>
                  <label className={LC}>Fecha de fin</label>
                  <input type="date" value={endDateMan} min={startDate} onChange={e => setEndMan(e.target.value)} className={IC} />
                </div>
              ) : (
                <div>
                  <label className={LC}>Vence</label>
                  <p className="rounded-xl border border-transparent px-1 py-2.5 text-sm font-semibold text-[#121212]">{fmtFecha(endDate)}</p>
                </div>
              )}
            </div>

            {/* Profesor */}
            <div>
              <label className={LC}>Profesor · toca su nombre para ver su semana</label>
              {coaches.length === 0
                ? <p className="text-xs text-[#888888]">No hay profesores activos.</p>
                : (
                  <div className="flex flex-wrap gap-1.5">
                    {coaches.map(c => (
                      <button key={c.id} type="button" onClick={() => elegirProfesor(c.id)} aria-pressed={coachId === c.id}
                        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition ${coachId === c.id ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#C8C8C8] bg-white text-[#5E5E5E] hover:border-[#121212]'}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: c.color ?? '#9B9B9B' }} />
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                )}
            </div>

            {/* Semana del profesor */}
            {coach && (
              <div className="space-y-3">
                <p className="text-xs text-[#5E5E5E]">
                  Elige la hora de cada día de la semana de <strong>{coach.nombre}</strong>. Cada día puede tener una hora distinta.
                </p>
                <SemanaProfesor
                  lunes={lunes} onSemana={setLunes} inicio={startDate} fin={endDate} config={config}
                  modalidad={modalidad} ocupacion={ocupacion} bloqueos={bloqueos} sesiones={sesiones}
                  cargando={cargandoOc}
                  onCelda={(fecha, hora) => setSesiones(prev => alternarSesion(prev, fecha, hora))} />

                {sesionesSemana.length > 0 && (
                  <div className="rounded-xl border border-[#C8C8C8] bg-[#F4F4F4] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">Repetir en todo el plan</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sesionesSemana.map(s => {
                        const dia = DIAS_PLAN.find(x => x.n === diaSemana(s.fecha));
                        const total = dia ? fechasDelDia(dia.n, startDate, endDate, semanas).length : 0;
                        return dia && (
                          <button key={s.fecha} type="button"
                            onClick={() => setSesiones(prev => repetirDia(prev, dia.n, s.hora, startDate, endDate, semanas))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C8C8C8] bg-white px-3 py-2 text-xs font-semibold text-[#121212] transition hover:border-[#121212]">
                            <Repeat className="h-3.5 w-3.5" /> Todos los {dia.plural} a las {s.hora} ({total})
                          </button>
                        );
                      })}
                      {sesionesSemana.length > 1 && (
                        <button type="button"
                          onClick={() => setSesiones(prev => repetirSemana(prev, lunes, startDate, endDate, semanas))}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#3E3E3E]">
                          <CalendarRange className="h-3.5 w-3.5" /> Copiar esta semana a todo el plan
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-[#888888]">Las clases que cambies a mano no se modifican al repetir.</p>
                  </div>
                )}
              </div>
            )}

            {/* Lista de clases */}
            {sesiones.length > 0 && (
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className={LC} style={{ marginBottom: 0 }}>Clases agendadas ({sesiones.length})</label>
                  <span className="text-[10px] font-semibold text-[#777777]">
                    {porDia.map(d => `${d.corto} ×${d.n_}`).join(' · ')}
                  </span>
                </div>
                <ul className="divide-y divide-[#DADADA] overflow-hidden rounded-xl border border-[#C8C8C8] bg-white">
                  {sesiones.map(s => {
                    const err = conflictos[s.fecha];
                    const horas = horasDia(s.fecha);
                    return (
                      <li key={s.fecha} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${err ? 'bg-[#FAEAEA]' : ''}`}>
                        <span className="w-9 text-xs font-bold text-[#121212]">{nombreDia(s.fecha)}</span>
                        <input type="date" value={s.fecha} min={startDate} max={endDate} aria-label="Fecha"
                          onChange={e => e.target.value && setSesiones(prev => moverSesion(prev, s.fecha, e.target.value, s.hora))}
                          className="rounded-lg border border-[#D8D8D8] bg-[#F8F8F8] px-2 py-1.5 text-xs text-[#121212]" />
                        <select value={s.hora} aria-label="Hora"
                          onChange={e => setSesiones(prev => moverSesion(prev, s.fecha, s.fecha, e.target.value))}
                          className="rounded-lg border border-[#D8D8D8] bg-[#F8F8F8] px-2 py-1.5 text-xs text-[#121212]">
                          {(horas.includes(s.hora) ? horas : [s.hora, ...horas]).map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {s.origen === 'manual' && <span className="text-[9px] font-semibold uppercase tracking-wide text-[#9B9B9B]">a mano</span>}
                        <button type="button" onClick={() => setSesiones(prev => quitarSesion(prev, s.fecha))} aria-label={`Quitar clase del ${fmtFecha(s.fecha)}`}
                          className="ml-auto rounded-lg p-1.5 text-[#9B9B9B] hover:bg-[#F0F0F0] hover:text-[#B44040]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {err && <p className="w-full text-[11px] font-semibold text-[#B44040]">{err}</p>}
                      </li>
                    );
                  })}
                </ul>
                {!isCustom && semanas && (
                  <p className="mt-1.5 text-[10px] text-[#888888]">
                    Plan {TIPOS.find(t => t.value === tipo)?.label.toLowerCase()}: hasta {semanas} clases por cada día de la semana elegido. Vence el {fmtFecha(endDate)}.
                  </p>
                )}
              </div>
            )}

            {nConflictos > 0 && (
              <p className="rounded-xl border border-[#B44040]/30 bg-[#B44040]/8 px-4 py-2.5 text-xs text-[#B44040]">
                {nConflictos} clase(s) chocan con la agenda del profesor. Cámbialas o quítalas para poder guardar.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl border border-[#B44040]/30 bg-[#B44040]/8 px-4 py-2.5 text-xs text-[#B44040]">{error}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 border-t border-[#C8C8C8] px-5 py-4">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-[#C8C8C8] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#888888]">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || nConflictos > 0 || (!isCustom && sesiones.length === 0)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:bg-[#3E3E3E] disabled:opacity-40">
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : sesiones.length ? `Inscribir · ${sesiones.length} clases ${modalidad}` : isCustom ? 'Crear plan' : 'Elige las clases'}
          </button>
        </div>
      </div>
    </div>
  );
}
