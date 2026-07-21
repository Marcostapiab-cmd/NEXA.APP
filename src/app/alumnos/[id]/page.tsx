'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { getSesionesAlumno, getHistorialPeso } from '@/lib/sesiones';
import { calc1RM, parseReps, parsePeso } from '@/lib/mevmrv';

interface Medicion {
  id: string; fecha: string; peso: string;
  grasa?: string; musculo?: string; notas?: string;
}

interface AlumnoExtended extends Alumno {
  mediciones?: Medicion[];
}

interface Routine {
  id: string; name: string; blocks: { id: string; name: string; exercises: { id: string; name: string; series: number; reps: string; weight: string; }[] }[];
  selectedDays: number[]; dayToBlock: Record<number, string>;
  weeks: number; startDate: string; endDate: string; alumnoIds: string[];
}

const DAY_LONG  = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const IC = 'w-full rounded-[8px] border border-[#D8D8D8] bg-[#F8F8F8] px-4 py-3 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#121212]' as const;
const LC = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5E5E5E]' as const;
const SL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]' as const;

function isActive(r: Routine) {
  if (!r.startDate || !r.endDate) return false;
  const t = new Date().toISOString().slice(0,10);
  return t >= r.startDate && t <= r.endDate;
}

// Simple SVG line chart
function PesoChart({ puntos }: { puntos: { fecha: string; peso: number }[] }) {
  if (puntos.length < 2) return null;
  const W = 320, H = 80, PAD = 8;
  const pesos = puntos.map(p => p.peso);
  const min = Math.min(...pesos) * 0.97;
  const max = Math.max(...pesos) * 1.03;
  const xScale = (i: number) => PAD + (i / (puntos.length - 1)) * (W - PAD * 2);
  const yScale = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const path = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(p.peso)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <polyline fill="none" stroke="#121212" strokeWidth="1.5" points={puntos.map((p, i) => `${xScale(i)},${yScale(p.peso)}`).join(' ')} />
      {puntos.map((p, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(p.peso)} r="3" fill="#121212" />
      ))}
    </svg>
  );
}

export default function AlumnoPerfilPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [alumno, setAlumno]     = useState<AlumnoExtended | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showMedicion, setShowMedicion] = useState(false);
  const [medForm, setMedForm]   = useState<Omit<Medicion,'id'>>({ fecha: new Date().toISOString().slice(0,10), peso: '', grasa: '', musculo: '', notas: '' });
  const [expandedSesion, setExpandedSesion] = useState<string | null>(null);

  const sesiones = alumno ? getSesionesAlumno(id) : [];

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nexa_alumnos');
      if (stored) {
        const all: AlumnoExtended[] = JSON.parse(stored);
        setAlumno(all.find(a => a.id === id) || null);
      }
    } catch {}
    try {
      const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r));
    } catch {}
  }, [id]);

  function saveAlumno(updated: AlumnoExtended) {
    setAlumno(updated);
    try {
      const stored = localStorage.getItem('nexa_alumnos');
      if (stored) {
        const all: AlumnoExtended[] = JSON.parse(stored);
        localStorage.setItem('nexa_alumnos', JSON.stringify(all.map(a => a.id === id ? updated : a)));
      }
    } catch {}
  }

  function addMedicion() {
    if (!alumno || !medForm.peso) return;
    const med: Medicion = { ...medForm, id: crypto.randomUUID() };
    const mediciones = [...(alumno.mediciones || []), med].sort((a,b) => b.fecha.localeCompare(a.fecha));
    saveAlumno({ ...alumno, mediciones });
    setShowMedicion(false);
    setMedForm({ fecha: new Date().toISOString().slice(0,10), peso: '', grasa: '', musculo: '', notas: '' });
  }

  function deleteMedicion(mid: string) {
    if (!alumno) return;
    saveAlumno({ ...alumno, mediciones: (alumno.mediciones || []).filter(m => m.id !== mid) });
  }

  if (!alumno) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-[#5E5E5E]">Alumno no encontrado.</p>
      </main>
    );
  }

  const activeRoutines = routines.filter(r => (r.alumnoIds ?? []).includes(id) && isActive(r));
  const allRoutines    = routines.filter(r => (r.alumnoIds ?? []).includes(id));
  const mediciones     = (alumno.mediciones || []).sort((a,b) => b.fecha.localeCompare(a.fecha));
  const ultimaPeso     = mediciones.find(m => m.peso);
  const pesoChartData  = mediciones.filter(m => m.peso).map(m => ({ fecha: m.fecha, peso: parseFloat(m.peso) })).filter(m => !isNaN(m.peso)).reverse();

  // Unique exercises from all sessions for progress tracking
  const ejerciciosUnicos = [...new Set(sesiones.flatMap(s => s.ejercicios.map(e => e.nombre)))].sort();

  const edad = alumno.fechaNacimiento
    ? new Date().getFullYear() - new Date(alumno.fechaNacimiento).getFullYear()
    : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      {/* Back + header */}
      <div className="mb-6 flex items-start gap-4">
        <button onClick={() => router.back()}
          className="mt-0.5 rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center gap-4">
          {alumno.foto
            ? <img src={alumno.foto} alt="" className="h-16 w-16 rounded-xl object-cover" />
            : <div className="flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-black" style={{ background: '#121212', color: '#FFFFFF' }}>
                {alumno.nombre[0]?.toUpperCase()}
              </div>}
          <div>
            <h1 className="text-xl font-bold text-[#121212]">{alumno.nombre} {alumno.apellido}</h1>
            <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[#5E5E5E]">
              {alumno.email && <span>{alumno.email}</span>}
              {edad && <span>{edad} años</span>}
              {alumno.altura && <span>{alumno.altura} cm</span>}
              {ultimaPeso && <span>{ultimaPeso.peso} kg (último registro)</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="space-y-4">

          {/* Active routines */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <p className={`mb-3 ${SL}`}>Rutinas activas</p>
            {activeRoutines.length === 0 ? (
              <p className="text-sm text-[#5E5E5E]">Sin rutinas activas. Asigna una en /rutinas.</p>
            ) : (
              <div className="space-y-2">
                {activeRoutines.map(r => {
                  const diasStr = [...r.selectedDays].sort((a,b)=>a-b).map(d => DAY_LONG[d].slice(0,3)).join(' · ');
                  return (
                    <div key={r.id} className="rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-3">
                      <p className="font-semibold text-[#121212]">{r.name}</p>
                      <p className="mt-1 text-xs text-[#5E5E5E]">{diasStr} · {r.weeks} semanas</p>
                      <p className="text-xs text-[#5E5E5E]">{r.startDate} → {r.endDate}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.blocks.map(b => (
                          <span key={b.id} className="rounded-md border border-[#CACACA] px-2 py-0.5 text-xs text-[#5E5E5E]">
                            {b.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Session history */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <p className={`mb-3 ${SL}`}>Historial de sesiones ({sesiones.length})</p>
            {sesiones.length === 0 ? (
              <p className="text-sm text-[#5E5E5E]">Sin sesiones registradas.</p>
            ) : (
              <div className="space-y-2">
                {sesiones.map(s => {
                  const isExp = expandedSesion === s.id;
                  return (
                    <div key={s.id} className="rounded-[8px] border border-[#CACACA] bg-[#E4E4E4]">
                      <button onClick={() => setExpandedSesion(isExp ? null : s.id)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left">
                        <div>
                          <p className="text-sm font-medium text-[#121212]">{s.bloqueNombre}</p>
                          <p className="text-xs text-[#5E5E5E]">{s.fecha} · {s.ejercicios.length} ejercicios</p>
                        </div>
                        {isExp ? <ChevronUp className="h-4 w-4 text-[#5E5E5E]" /> : <ChevronDown className="h-4 w-4 text-[#5E5E5E]" />}
                      </button>
                      {isExp && (
                        <div className="border-t border-[#CACACA] px-3 pb-3 pt-2">
                          {s.notas && <p className="mb-2 text-xs text-[#5E5E5E] italic">"{s.notas}"</p>}
                          <div className="space-y-2">
                            {s.ejercicios.map((ej, i) => {
                              const maxPeso = Math.max(...ej.series.filter(s=>s.completada).map(s=>parseFloat(s.peso)||0));
                              const repsNum = parseReps(ej.series[0]?.reps);
                              const rm = maxPeso && repsNum ? calc1RM(maxPeso, repsNum) : null;
                              return (
                                <div key={i} className="rounded-md bg-[#E4E4E4] px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-[#121212]">{ej.nombre}</p>
                                    {rm && <span className="text-xs text-[#5E5E5E]">1RM ~{rm} kg</span>}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {ej.series.map((serie, j) => (
                                      <span key={j} className={`rounded-md border px-2 py-0.5 text-xs ${
                                        serie.completada
                                          ? 'border-[#E8E8E8] bg-[#F0F0F0] text-[#121212]'
                                          : 'border-[#CACACA] text-[#9B9B9B] line-through'
                                      }`}>
                                        {serie.reps}×{serie.peso}kg
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Progress per exercise */}
          {ejerciciosUnicos.length > 0 && (
            <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#121212]" />
                <p className={SL}>Progresión de carga</p>
              </div>
              <div className="space-y-4">
                {ejerciciosUnicos.map(nombre => {
                  const historial = getHistorialPeso(id, nombre);
                  const ultimo = historial[historial.length - 1];
                  if (!ultimo) return null;
                  return (
                    <div key={nombre} className="rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#121212]">{nombre}</p>
                        <span className="text-sm font-bold" style={{ color: '#121212' }}>{ultimo.peso} kg</span>
                      </div>
                      {historial.length >= 2 && <PesoChart puntos={historial} />}
                      {historial.length < 2 && (
                        <p className="mt-1 text-xs text-[#5E5E5E]">1 sesión registrada</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: metrics */}
        <div className="space-y-4">
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Métricas corporales</p>
              <button onClick={() => setShowMedicion(!showMedicion)}
                className="flex items-center gap-1 rounded-lg border border-[#CACACA] px-2.5 py-1 text-xs text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
                <Plus className="h-3 w-3" /> Nueva
              </button>
            </div>

            {showMedicion && (
              <div className="mb-4 space-y-3 rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-3">
                <div>
                  <label className={LC}>Fecha</label>
                  <input type="date" value={medForm.fecha}
                    onChange={e => setMedForm(p => ({...p, fecha: e.target.value}))} className={IC} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LC}>Peso (kg) *</label>
                    <input value={medForm.peso} onChange={e => setMedForm(p => ({...p, peso: e.target.value}))}
                      placeholder="75" className={IC} />
                  </div>
                  <div>
                    <label className={LC}>Grasa (%)</label>
                    <input value={medForm.grasa} onChange={e => setMedForm(p => ({...p, grasa: e.target.value}))}
                      placeholder="18" className={IC} />
                  </div>
                  <div>
                    <label className={LC}>Músculo (kg)</label>
                    <input value={medForm.musculo} onChange={e => setMedForm(p => ({...p, musculo: e.target.value}))}
                      placeholder="35" className={IC} />
                  </div>
                </div>
                <div>
                  <label className={LC}>Notas</label>
                  <input value={medForm.notas} onChange={e => setMedForm(p => ({...p, notas: e.target.value}))}
                    placeholder="Observaciones..." className={IC} />
                </div>
                <div className="flex gap-2">
                  <button onClick={addMedicion}
                    className="nexa-btn-primary flex-1 justify-center text-xs py-2">
                    Guardar
                  </button>
                  <button onClick={() => setShowMedicion(false)}
                    className="nexa-btn-secondary px-4 py-2 text-xs">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {pesoChartData.length >= 2 && (
              <div className="mb-3 rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-2">
                <p className="mb-1 text-xs text-[#5E5E5E]">Evolución del peso</p>
                <PesoChart puntos={pesoChartData} />
              </div>
            )}

            {mediciones.length === 0 ? (
              <p className="text-sm text-[#5E5E5E]">Sin mediciones registradas.</p>
            ) : (
              <div className="space-y-2">
                {mediciones.slice(0, 10).map(m => (
                  <div key={m.id} className="flex items-start justify-between rounded-md border border-[#CACACA] bg-[#F0F0F0] px-3 py-2.5">
                    <div>
                      <p className="text-xs text-[#5E5E5E]">{m.fecha}</p>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-sm font-semibold text-[#121212]">
                        {m.peso && <span>{m.peso} kg</span>}
                        {m.grasa && <span className="text-[#5E5E5E]">{m.grasa}% grasa</span>}
                        {m.musculo && <span className="text-[#5E5E5E]">{m.musculo} kg músculo</span>}
                      </div>
                      {m.notas && <p className="mt-0.5 text-xs text-[#5E5E5E] italic">{m.notas}</p>}
                    </div>
                    <button onClick={() => deleteMedicion(m.id)}
                      className="ml-2 rounded p-1 text-[#9B9B9B] transition hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <p className={`mb-3 ${SL}`}>Estadísticas</p>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Sesiones totales',    value: sesiones.length },
                { label: 'Rutinas asignadas',   value: allRoutines.length },
                { label: 'Rutinas activas',      value: activeRoutines.length },
                { label: 'Ejercicios distintos', value: ejerciciosUnicos.length },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[#5E5E5E]">{label}</span>
                  <span className="font-semibold text-[#121212]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
