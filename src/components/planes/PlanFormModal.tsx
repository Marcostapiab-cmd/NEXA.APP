'use client';

import { useState, useEffect } from 'react';
import { X, Save, CalendarDays } from 'lucide-react';
import {
  type Plan,
  type PlanTipo,
  calcEndDate,
  todayStr,
  PLAN_TIPO_LABEL,
  addDays,
} from '@/lib/planes';

const IC = 'w-full rounded-xl border border-[#C8C8C8] bg-[#F8F8F8] px-3 py-2.5 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]';
const LC = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]';

type FormData = Omit<Plan, 'id' | 'alumnoId' | 'createdAt'>;

const DEFAULT_FORM = (alumnoId?: string): FormData => ({
  nombre:       'Plan Mensual',
  tipo:         'mensual',
  totalClases:  8,
  usedClases:   0,
  startDate:    todayStr(),
  endDate:      addDays(todayStr(), 30),
  adminNota:    '',
  extendedUntil: '',
});

interface Props {
  alumnoId: string;
  alumnoNombre: string;
  initial?: Plan;
  mode: 'create' | 'edit';
  onSave: (data: Omit<Plan, 'id' | 'alumnoId' | 'createdAt'>) => void;
  onClose: () => void;
}

const TIPO_OPTIONS: { value: PlanTipo; label: string; desc: string; dias: number }[] = [
  { value: 'mensual',       label: 'Mensual',      desc: '30 días',  dias: 30 },
  { value: 'trimestral',    label: 'Trimestral',   desc: '90 días',  dias: 90 },
  { value: 'personalizado', label: 'Personalizado',desc: 'Manual',   dias: 0  },
];

const CLASES_PRESET = [4, 8, 10, 12, 16, 20];

export default function PlanFormModal({ alumnoId, alumnoNombre, initial, mode, onSave, onClose }: Props) {
  const [f, setF] = useState<FormData>(initial
    ? { ...initial }
    : DEFAULT_FORM(alumnoId)
  );
  const [autoEnd, setAutoEnd] = useState(mode === 'create');

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setF(prev => ({ ...prev, [key]: value }));
  }

  // Auto-calculate endDate when tipo or startDate changes (only in auto mode)
  useEffect(() => {
    if (!autoEnd || f.tipo === 'personalizado') return;
    set('endDate', calcEndDate(f.startDate, f.tipo));
  }, [f.tipo, f.startDate, autoEnd]);

  function handleTipo(tipo: PlanTipo) {
    const preset: Record<PlanTipo, string> = {
      mensual:       'Plan Mensual',
      trimestral:    'Plan Trimestral',
      personalizado: 'Plan Personalizado',
    };
    setF(prev => ({
      ...prev,
      tipo,
      nombre: mode === 'create' ? preset[tipo] : prev.nombre,
      endDate: autoEnd && tipo !== 'personalizado' ? calcEndDate(prev.startDate, tipo) : prev.endDate,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nombre.trim() || !f.startDate || !f.endDate) return;
    onSave({
      ...f,
      nombre: f.nombre.trim(),
      extendedUntil: f.extendedUntil || undefined,
      adminNota:    f.adminNota     || undefined,
    });
  }

  const isEdit = mode === 'edit';
  const endWarning = f.endDate && f.startDate && f.endDate < f.startDate;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-12 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#C8C8C8] bg-[#EBEBEB] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#C8C8C8] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">
              {isEdit ? 'Editar plan' : 'Nuevo plan'}
            </p>
            <p className="mt-0.5 text-xs text-[#777777]">{alumnoNombre}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#C8C8C8] p-2 text-[#777777] transition hover:border-[#888888] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="space-y-5 p-5">

              {/* Tipo */}
              <div>
                <label className={LC}>Tipo de plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPO_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => handleTipo(opt.value)}
                      className={`rounded-xl border py-3 text-center transition ${
                        f.tipo === opt.value
                          ? 'border-[#121212] bg-[#121212]/6 text-[#121212]'
                          : 'border-[#C8C8C8] text-[#777777] hover:border-[#9B9B9B] hover:text-[#121212]'
                      }`}>
                      <p className="text-xs font-bold">{opt.label}</p>
                      <p className="mt-0.5 text-[10px] opacity-60">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className={LC}>Nombre del plan</label>
                <input value={f.nombre} onChange={e => set('nombre', e.target.value)}
                  placeholder="Plan Mensual 8 clases" required className={IC} />
              </div>

              {/* Clases */}
              <div>
                <label className={LC}>Total de clases</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CLASES_PRESET.map(n => (
                    <button key={n} type="button" onClick={() => set('totalClases', n)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        f.totalClases === n
                          ? 'border-[#121212] bg-[#121212]/6 text-[#121212]'
                          : 'border-[#C8C8C8] text-[#777777] hover:border-[#9B9B9B] hover:text-[#121212]'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
                <input type="number" min={1} max={200} value={f.totalClases}
                  onChange={e => set('totalClases', parseInt(e.target.value) || 1)}
                  className={IC} />
              </div>

              {/* Clases usadas (solo edit) */}
              {isEdit && (
                <div>
                  <label className={LC}>Clases utilizadas</label>
                  <input type="number" min={0} max={f.totalClases} value={f.usedClases}
                    onChange={e => set('usedClases', Math.min(f.totalClases, parseInt(e.target.value) || 0))}
                    className={IC} />
                  <p className="mt-1 text-[11px] text-[#888888]">
                    Restantes: {Math.max(0, f.totalClases - f.usedClases)} clases
                  </p>
                </div>
              )}

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LC}>Fecha de inicio</label>
                  <input type="date" value={f.startDate}
                    onChange={e => set('startDate', e.target.value)}
                    required className={IC} />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className={LC} style={{ marginBottom: 0 }}>Fecha de vencimiento</label>
                    {f.tipo !== 'personalizado' && (
                      <button type="button" onClick={() => {
                        setAutoEnd(a => !a);
                        if (!autoEnd) set('endDate', calcEndDate(f.startDate, f.tipo));
                      }}
                        className={`text-[9px] font-bold uppercase tracking-wider transition ${
                          autoEnd ? 'text-[#121212]' : 'text-[#888888] hover:text-[#121212]'
                        }`}>
                        {autoEnd ? 'AUTO' : 'MANUAL'}
                      </button>
                    )}
                  </div>
                  <input type="date" value={f.endDate}
                    onChange={e => { set('endDate', e.target.value); setAutoEnd(false); }}
                    required readOnly={autoEnd && f.tipo !== 'personalizado'}
                    className={IC + (endWarning ? ' border-[#B44040]/30' : '')} />
                </div>
              </div>
              {endWarning && (
                <p className="text-xs text-[#B44040]">La fecha de fin no puede ser anterior al inicio.</p>
              )}

              {/* Extensión (solo edit) */}
              {isEdit && (
                <div>
                  <label className={LC}>Extender vigencia hasta (opcional)</label>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#777777]" />
                    <input type="date" value={f.extendedUntil ?? ''}
                      min={f.endDate}
                      onChange={e => set('extendedUntil', e.target.value)}
                      className={IC} />
                  </div>
                  <p className="mt-1 text-[11px] text-[#888888]">
                    Deja en blanco para usar la fecha original de vencimiento.
                  </p>
                </div>
              )}

              {/* Nota admin */}
              <div>
                <label className={LC}>Nota interna (admin)</label>
                <textarea value={f.adminNota ?? ''} rows={2}
                  onChange={e => set('adminNota', e.target.value)}
                  placeholder="Ej: plan renovado manualmente, oferta especial..."
                  className={IC + ' resize-none'} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-[#C8C8C8] px-5 py-4">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#C8C8C8] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212]">
              Cancelar
            </button>
            <button type="submit" disabled={!!endWarning}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:bg-[#3E3E3E] disabled:opacity-40">
              <Save className="h-4 w-4" />
              {isEdit ? 'Guardar cambios' : 'Crear plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
