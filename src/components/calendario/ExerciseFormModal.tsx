'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, RotateCcw } from 'lucide-react';
import {
  MUSCLES, BLOQUES, MUSCLE_HEX, BLOQUE_HEX, IC, LC,
  type Exercise, type MuscleGroup, type BloqueWorkout,
} from './types';
import { BIBLIOTECA_EJERCICIOS } from '@/lib/ejercicios';

type FormData = Omit<Exercise, 'id'>;

const DEFAULT: FormData = {
  name: '', series: 3, reps: '10',
  weight: '', rest: '90s', youtubeUrl: '',
  bloque: 'N/A', tempo: '', eachSide: false, notas: '',
  completionLift: false, bodyWeight: false, coachCompletion: false,
  disableMaxTracking: false, forceMaxPR: false, trackRepCount: true, trackVolumeLoad: true,
};

interface Props {
  initial?: Partial<FormData>;
  mode: 'add' | 'edit';
  onSubmit: (data: FormData) => void;
  onClose: () => void;
}

const TIPO_REPS = [
  { value: 'reps',     label: 'Reps'     },
  { value: 'time',     label: 'Tiempo'   },
  { value: 'meters',   label: 'Metros'   },
  { value: 'calories', label: 'Calorías' },
];

const TOGGLE_OPTIONS = [
  { key: 'completionLift',    label: 'Completion Lift'    },
  { key: 'bodyWeight',        label: 'Body Weight'        },
  { key: 'coachCompletion',   label: 'Coach Completion'   },
  { key: 'disableMaxTracking',label: 'Disable Max Tracking' },
  { key: 'forceMaxPR',        label: 'Force Max/PR'       },
  { key: 'trackRepCount',     label: 'Track Rep Count'    },
  { key: 'trackVolumeLoad',   label: 'Track Volume Load'  },
] as const;

export default function ExerciseFormModal({ initial, mode, onSubmit, onClose }: Props) {
  const [f, setF]                     = useState<FormData>({ ...DEFAULT, ...initial });
  const [query, setQuery]             = useState(initial?.name ?? '');
  const [showSuggestions, setShowSug] = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [tipoReps, setTipoReps]       = useState('reps');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const suggestions = query.length > 0
    ? BIBLIOTECA_EJERCICIOS.filter(e => e.nombre.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setF(prev => ({ ...prev, [key]: value }));
  }

  function selectFromLib(ej: typeof BIBLIOTECA_EJERCICIOS[0]) {
    setF(prev => ({
      ...prev,
      name: ej.nombre,
      muscle: (ej.grupo as MuscleGroup) ?? prev.muscle,
    }));
    setQuery(ej.nombre);
    setShowSug(false);
    setErrors(e => ({ ...e, name: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = 'El nombre es requerido';
    if (f.series < 1)   errs.series = 'Mínimo 1 serie';
    if (!f.reps.trim()) errs.reps = 'Ingresa las reps';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit({ ...f, name: f.name.trim() });
  }

  function handleReset() {
    setF(DEFAULT);
    setQuery('');
    setErrors({});
    setTipoReps('reps');
  }

  const muscleHex = MUSCLE_HEX[f.muscle ?? ''] ?? '#888888';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-10 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#C8C8C8] bg-[#EBEBEB] shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[#C8C8C8] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#121212]">
              {mode === 'add' ? 'Agregar ejercicio' : 'Editar ejercicio'}
            </p>
            <p className="mt-0.5 text-xs text-[#777777]">
              {mode === 'add' ? 'Completa los campos y agrega al workout' : 'Modifica y guarda los cambios'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#C8C8C8] p-2 text-[#777777] transition hover:border-[#888888] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="max-h-[68vh] overflow-y-auto">
          <div className="space-y-5 p-5">

            {/* Exercise search */}
            <div>
              <label className={LC}>Ejercicio *</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888888] pointer-events-none" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); set('name', e.target.value); setShowSug(true); }}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder="Buscar en biblioteca o escribe el nombre..."
                  className={`w-full rounded-xl border bg-[#F8F8F8] py-2.5 pl-10 pr-4 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition ${
                    errors.name ? 'border-[#B44040]/30 focus:border-[#B44040]' : 'border-[#C8C8C8] focus:border-[#888888]'
                  }`}
                />
                {errors.name && <p className="mt-1 text-xs text-[#B44040]">{errors.name}</p>}
              </div>
              {/* Suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-[#C8C8C8] bg-[#F0F0F0] divide-y divide-[#DEDEDE]">
                  {suggestions.map(ej => (
                    <li key={ej.id}>
                      <button onMouseDown={() => selectFromLib(ej)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-[#E4E4E4]">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: MUSCLE_HEX[ej.grupo] ?? '#777777' }} />
                          <div>
                            <p className="text-sm text-[#121212]">{ej.nombre}</p>
                            <p className="text-[10px] text-[#888888]">{ej.grupo}{ej.equipamiento ? ` · ${ej.equipamiento}` : ''}</p>
                          </div>
                        </div>
                        <Plus className="h-3.5 w-3.5 shrink-0 text-[#9B9B9B]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Muscle group */}
            <div>
              <label className={LC}>Grupo muscular</label>
              <div className="flex flex-wrap gap-1.5">
                {MUSCLES.map(m => {
                  const hex = MUSCLE_HEX[m] ?? '#888888';
                  const sel = f.muscle === m;
                  return (
                    <button key={m} type="button" onClick={() => set('muscle', m)}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-bold transition"
                      style={sel
                        ? { borderColor: hex, backgroundColor: hex + '22', color: hex }
                        : { borderColor: '#C8C8C8', color: '#777777' }}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sets + Reps */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LC}>Series *</label>
                <input type="number" min={1} max={20} value={f.series}
                  onChange={e => set('series', parseInt(e.target.value) || 1)}
                  className={IC + (errors.series ? ' border-[#B44040]/30' : '')} />
                {errors.series && <p className="mt-1 text-xs text-[#B44040]">{errors.series}</p>}
              </div>
              <div>
                <label className={LC}>Reps / Cantidad *</label>
                <input type="text" value={f.reps} placeholder="10 ó 8–12"
                  onChange={e => set('reps', e.target.value)}
                  className={IC + (errors.reps ? ' border-[#B44040]/30' : '')} />
                {errors.reps && <p className="mt-1 text-xs text-[#B44040]">{errors.reps}</p>}
              </div>
            </div>

            {/* Type + EachSide */}
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className={LC}>Unidad de medida</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {TIPO_REPS.map(t => (
                    <button key={t.value} type="button" onClick={() => setTipoReps(t.value)}
                      className={`rounded-lg border py-2 text-xs font-medium transition ${
                        tipoReps === t.value
                          ? 'border-[#121212] bg-[#121212] text-white'
                          : 'border-[#C8C8C8] text-[#777777] hover:border-[#888888] hover:text-[#121212]'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-6">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <span className="relative inline-flex h-5 w-9">
                    <input type="checkbox" checked={f.eachSide ?? false}
                      onChange={e => set('eachSide', e.target.checked)} className="sr-only peer" />
                    <span className="h-5 w-9 rounded-full bg-[#C8C8C8] transition peer-checked:bg-[#121212] peer-focus:ring-1 peer-focus:ring-[#121212]/30" />
                    <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[#F8F8F8] transition-transform peer-checked:translate-x-4 peer-checked:bg-white" />
                  </span>
                  <span className="text-xs text-[#5E5E5E]">Cada lado</span>
                </label>
              </div>
            </div>

            {/* Weight + Rest + Tempo */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={LC}>Peso (kg)</label>
                <input type="text" value={f.weight} placeholder="60"
                  onChange={e => set('weight', e.target.value)} className={IC} />
              </div>
              <div>
                <label className={LC}>Descanso</label>
                <input type="text" value={f.rest} placeholder="90s"
                  onChange={e => set('rest', e.target.value)} className={IC} />
              </div>
              <div>
                <label className={LC}>Tempo</label>
                <input type="text" value={f.tempo ?? ''} placeholder="3-1-1-0"
                  onChange={e => set('tempo', e.target.value)} className={IC} />
              </div>
            </div>

            {/* Workout Grouping */}
            <div>
              <label className={LC}>Bloque / Agrupación</label>
              <div className="flex items-center gap-2 flex-wrap">
                {BLOQUES.map(b => {
                  const hex = BLOQUE_HEX[b];
                  const sel = f.bloque === b;
                  return (
                    <button key={b} type="button" onClick={() => set('bloque', b)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-bold transition ${
                        sel ? 'ring-2 ring-[#121212]/20' : ''
                      }`}
                      style={sel
                        ? { borderColor: hex, backgroundColor: hex + '22', color: hex }
                        : { borderColor: '#C8C8C8', color: '#888888' }}>
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={LC}>Notas / Instrucciones</label>
              <textarea value={f.notas ?? ''} rows={2}
                onChange={e => set('notas', e.target.value)}
                placeholder="Indicaciones para el atleta..."
                className={IC + ' resize-none'} />
            </div>

            {/* Tracking toggles */}
            <div>
              <label className={LC}>Opciones de seguimiento</label>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {TOGGLE_OPTIONS.map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-[#F0F0F0]">
                    <span className="relative inline-flex h-4 w-8 shrink-0">
                      <input type="checkbox" checked={!!f[key as keyof FormData]}
                        onChange={e => set(key as keyof FormData, e.target.checked as any)}
                        className="sr-only peer" />
                      <span className="h-4 w-8 rounded-full bg-[#C8C8C8] transition peer-checked:bg-[#121212] peer-focus:ring-1 peer-focus:ring-[#121212]/20" />
                      <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-[#F8F8F8] transition-transform peer-checked:translate-x-4 peer-checked:bg-white" />
                    </span>
                    <span className="text-xs text-[#777777] leading-tight">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-2.5 border-t border-[#C8C8C8] px-5 py-4">
          <button type="button" onClick={handleReset}
            className="flex items-center gap-1.5 rounded-xl border border-[#C8C8C8] px-4 py-2.5 text-xs font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212]">
            <RotateCcw className="h-3.5 w-3.5" />
            Resetear
          </button>
          <button type="button" onClick={handleSubmit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:bg-[#2A2A2A]">
            <Plus className="h-4 w-4" />
            {mode === 'add' ? 'Agregar al workout' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
