'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Save } from 'lucide-react';
import {
  type Plan, type PlanTipo,
  PLAN_DURACION_DIAS, PLAN_SEMANAS,
  calcEndDate, generarFechasRecurrentes,
  todayStr, addDays,
} from '@/lib/planes';
import { upsertPlanDB, insertReservasBulkDB, deletePlanDB } from '@/lib/planes-supabase';
import { getCoachesActivosDB, type Coach } from '@/lib/coaches-supabase';

const IC = 'w-full rounded-xl border border-[#C8C8C8] bg-[#F8F8F8] px-3 py-2.5 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]';
const LC = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]';

const TIPOS: { value: PlanTipo; label: string; sub: string }[] = [
  { value: 'mensual',       label: 'Mensual',      sub: '4 sem'   },
  { value: 'trimestral',    label: 'Trimestral',   sub: '12 sem'  },
  { value: 'semestral',     label: 'Semestral',    sub: '24 sem'  },
  { value: 'personalizado', label: 'Custom',       sub: 'Manual'  },
];

const DIAS_SEMANA = [
  { label: 'L', n: 1 }, { label: 'M', n: 2 }, { label: 'X', n: 3 },
  { label: 'J', n: 4 }, { label: 'V', n: 5 }, { label: 'S', n: 6 },
];

const NOMBRE_DIA: Record<number, string> = { 1:'Lun', 2:'Mar', 3:'Mié', 4:'Jue', 5:'Vie', 6:'Sáb' };

function fmtFecha(ds: string) {
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  alumnoId:     string;
  alumnoNombre: string;
  onSaved: (plan: Plan, reservasCount: number) => void;
  onClose: () => void;
}

export default function InscripcionModal({ alumnoId, alumnoNombre, onSaved, onClose }: Props) {
  const [tipo,      setTipo]    = useState<PlanTipo>('mensual');
  const [startDate, setStart]   = useState(todayStr());
  const [endDateMan,setEndMan]  = useState('');
  const [dias,      setDias]    = useState<number[]>([1, 3, 5]);
  const [hora,      setHora]    = useState('09:00');
  const [coachId,   setCoachId] = useState('');
  const [coaches,   setCoaches] = useState<Coach[]>([]);
  const [saving,    setSaving]  = useState(false);
  const [error,     setError]   = useState('');

  useEffect(() => {
    getCoachesActivosDB().then(cs => { setCoaches(cs); if (cs[0]) setCoachId(cs[0].id); }).catch(() => {});
  }, []);

  const isCustom = tipo === 'personalizado';
  const duracion  = PLAN_DURACION_DIAS[tipo];
  const semanas   = PLAN_SEMANAS[tipo];
  const endDate   = isCustom ? (endDateMan || addDays(startDate, 30)) : calcEndDate(startDate, tipo);

  // Genera todas las fechas en el rango y limita a dias.length × semanas (conteo exacto)
  const fechas = useMemo(() => {
    if (!dias.length || isCustom) return [];
    const all = generarFechasRecurrentes(startDate, dias, duracion);
    return all.slice(0, dias.length * semanas);
  }, [startDate, dias, duracion, semanas, isCustom]);

  function toggleDia(n: number) {
    setDias(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n].sort());
  }

  async function handleSave() {
    setError('');
    if (!isCustom && !dias.length)   { setError('Selecciona al menos un día de la semana.'); return; }
    if (!isCustom && !fechas.length) { setError('No se generaron fechas. Revisa la fecha de inicio.'); return; }

    setSaving(true);
    try {
      const nombre = `Plan ${TIPOS.find(t => t.value === tipo)?.label ?? tipo}`;
      const plan: Plan = {
        id:          crypto.randomUUID(),
        alumnoId,
        nombre,
        tipo,
        totalClases: isCustom ? 0 : fechas.length,
        usedClases:  0,
        startDate,
        endDate,
        createdAt:   new Date().toISOString(),
      };

      await upsertPlanDB(plan);

      if (!isCustom && fechas.length) {
        const rows = fechas.map(fecha => ({
          alumno_id:  alumnoId,
          plan_id:    plan.id,
          fecha,
          hora:       hora || undefined,
          coach_id:   coachId || undefined,
          estado:     'pendiente',
          tipo_clase: '1:1 Individual',
        }));
        try {
          await insertReservasBulkDB(rows);
        } catch (insertErr) {
          await deletePlanDB(plan.id).catch(() => {});
          throw insertErr;
        }
      }

      onSaved(plan, fechas.length);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (typeof e === 'object' && e !== null && 'message' in e)
          ? String((e as { message: unknown }).message)
          : JSON.stringify(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const diasStr = dias.map(d => NOMBRE_DIA[d]).join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-12 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#C8C8C8] bg-[#EBEBEB] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#C8C8C8] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">Inscribir alumno</p>
            <p className="mt-0.5 text-xs text-[#777777]">{alumnoNombre}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#C8C8C8] p-2 text-[#777777] transition hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto">
          <div className="space-y-5 p-5">

            {/* Tipo */}
            <div>
              <label className={LC}>Tipo de plan</label>
              <div className="grid grid-cols-4 gap-1.5">
                {TIPOS.map(t => (
                  <button key={t.value} type="button" onClick={() => setTipo(t.value)}
                    className={`rounded-xl border py-2.5 text-center transition ${
                      tipo === t.value
                        ? 'border-[#121212] bg-[#121212]/8 text-[#121212]'
                        : 'border-[#C8C8C8] text-[#777777] hover:border-[#9B9B9B]'
                    }`}>
                    <p className="text-[11px] font-bold">{t.label}</p>
                    <p className="mt-0.5 text-[9px] opacity-60">{t.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha de inicio */}
            <div className={isCustom ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className={LC}>Fecha de inicio</label>
                <input type="date" value={startDate}
                  onChange={e => setStart(e.target.value)}
                  className={IC} />
              </div>
              {isCustom && (
                <div>
                  <label className={LC}>Fecha de fin</label>
                  <input type="date" value={endDateMan} min={startDate}
                    onChange={e => setEndMan(e.target.value)}
                    className={IC} />
                </div>
              )}
            </div>

            {/* Días (determina frecuencia) */}
            {!isCustom && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className={LC} style={{ marginBottom: 0 }}>Días de la semana</label>
                  {dias.length > 0 && (
                    <span className="text-[10px] font-bold text-[#777777]">
                      {dias.length}× semana · {dias.length * semanas} clases total
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {DIAS_SEMANA.map(({ label, n }) => (
                    <button key={n} type="button" onClick={() => toggleDia(n)}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                        dias.includes(n)
                          ? 'border-[#121212] bg-[#121212] text-white'
                          : 'border-[#C8C8C8] text-[#777777] hover:border-[#9B9B9B]'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Hora y Coach */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LC}>Hora</label>
                <input type="time" value={hora}
                  onChange={e => setHora(e.target.value)}
                  className={IC} />
              </div>
              {coaches.length > 0 && (
                <div>
                  <label className={LC}>Profesor</label>
                  <select value={coachId} onChange={e => setCoachId(e.target.value)}
                    className={IC}>
                    <option value="">Sin asignar</option>
                    {coaches.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Preview */}
            {!isCustom && (
              <div className={`rounded-xl border px-4 py-3 ${
                fechas.length > 0
                  ? 'border-[#121212]/15 bg-[#121212]/5'
                  : 'border-[#C8C8C8] bg-[#E8E8E8]'
              }`}>
                {fechas.length > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-[#121212]">
                      {fechas.length} clases · {diasStr}
                    </p>
                    <p className="text-xs text-[#5E5E5E]">
                      {hora && <span className="font-semibold">{hora} · </span>}
                      {fmtFecha(fechas[0])} → {fmtFecha(fechas[fechas.length - 1])}
                    </p>
                    <p className="text-[10px] text-[#888888] pt-0.5">
                      Vencimiento: {fmtFecha(endDate)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[#888888]">
                    Selecciona días para ver la vista previa.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-[#B44040]/30 bg-[#B44040]/8 px-4 py-2.5 text-xs text-[#B44040]">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-[#C8C8C8] px-5 py-4">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-[#C8C8C8] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#888888]">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:bg-[#3E3E3E] disabled:opacity-40">
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : isCustom ? 'Crear plan' : `Inscribir · ${fechas.length} clases`}
          </button>
        </div>
      </div>
    </div>
  );
}
