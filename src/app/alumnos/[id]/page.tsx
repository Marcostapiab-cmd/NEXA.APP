'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAlumnoById } from '@/lib/alumnos';
import { ArrowLeft, Plus, Trash2, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { Alumno } from '@/app/alumnos/page';
import { getSesionesAlumno, getHistorialPeso } from '@/lib/sesiones';
import { calc1RM, parseReps } from '@/lib/mevmrv';
import type { Plan, Reserva, Reagenda } from '@/lib/planes';
import { RESERVA_LABEL, todayStr, getEffectiveEndDate, formatDate, canReagendar } from '@/lib/planes';
import PlanFormModal from '@/components/planes/PlanFormModal';
import PlanStatusCard from '@/components/planes/PlanStatusCard';
import {
  getPlanesAlumnoDB, upsertPlanDB, deletePlanDB,
  getReservasAlumnoDB, upsertReservaDB, deleteReservaDB,
  recalcUsedClasesDB,
  getReagendasAlumnoDB, upsertReagendaDB,
} from '@/lib/planes-supabase';

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

  // Planes y reservas
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [reagendas,  setReagendas]  = useState<Reagenda[]>([]);
  const [asignando,  setAsignando]  = useState<{ reagendaId: string; fecha: string } | null>(null);
  const [planModal, setPlanModal] = useState<{ mode: 'create' | 'edit'; plan?: Plan } | null>(null);
  const [newReserva, setNewReserva] = useState<{
    fecha: string; hora: string; tipo: string[];
    repetir: boolean; diasSemana: number[]; fechaFin: string;
  } | null>(null);

  const sesiones = alumno ? getSesionesAlumno(id) : [];

  useEffect(() => {
    // Busca en Supabase primero, con fallback a localStorage
    getAlumnoById(id).then(base => {
      if (base) {
        // Preserva mediciones locales si existen
        try {
          const stored = localStorage.getItem('nexa_alumnos');
          const local = stored ? (JSON.parse(stored) as AlumnoExtended[]).find(a => a.id === id) : null;
          setAlumno(local?.mediciones ? { ...base, mediciones: local.mediciones } : base);
        } catch {
          setAlumno(base);
        }
      } else {
        // Fallback a localStorage si Supabase no responde
        try {
          const stored = localStorage.getItem('nexa_alumnos');
          if (stored) {
            const all: AlumnoExtended[] = JSON.parse(stored);
            setAlumno(all.find(a => a.id === id) || null);
          }
        } catch {}
      }
    });
    try {
      const r = localStorage.getItem('nexa_routines'); if (r) setRoutines(JSON.parse(r));
    } catch {}
    // Planes, reservas y reagendas desde Supabase
    getPlanesAlumnoDB(id).then(setPlanes).catch(() => {});
    getReservasAlumnoDB(id).then(setReservas).catch(() => {});
    getReagendasAlumnoDB(id).then(rs => {
      const hoy = todayStr();
      // Marcar vencidas automáticamente
      const actualizadas = rs.map(r =>
        r.estado === 'pendiente' && hoy > r.fechaLimite ? { ...r, estado: 'vencida' as const } : r
      );
      setReagendas(actualizadas);
      actualizadas.filter(r => r.estado === 'vencida' && rs.find(x => x.id === r.id)?.estado === 'pendiente')
        .forEach(r => upsertReagendaDB(r).catch(() => {}));
    }).catch(() => {});
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

  async function handleSavePlan(data: Omit<Plan, 'id' | 'alumnoId' | 'createdAt'>) {
    if (!planModal) return;
    const plan: Plan = planModal.mode === 'edit' && planModal.plan
      ? { ...planModal.plan, ...data }
      : { id: crypto.randomUUID(), alumnoId: id, createdAt: new Date().toISOString(), ...data };
    await upsertPlanDB(plan).catch(() => {});
    setPlanes(prev => {
      const idx = prev.findIndex(p => p.id === plan.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = plan; return next; }
      return [plan, ...prev];
    });
    setPlanModal(null);
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm('¿Eliminar este plan?')) return;
    await deletePlanDB(planId).catch(() => {});
    setPlanes(prev => prev.filter(p => p.id !== planId));
    setReservas(prev => prev.filter(r => r.planId !== planId));
  }

  async function handleChangeReservaEstado(reservaId: string, nuevoEstado: Reserva['estado']) {
    const reserva = reservas.find(r => r.id === reservaId);
    if (!reserva) return;
    const updated: Reserva = { ...reserva, estado: nuevoEstado };
    await upsertReservaDB(updated).catch(() => {});
    setReservas(prev => prev.map(r => r.id === reservaId ? updated : r));
    const newCount = await recalcUsedClasesDB(reserva.planId, id).catch(() => -1);
    if (newCount >= 0) {
      setPlanes(prev => prev.map(p => p.id === reserva.planId ? { ...p, usedClases: newCount } : p));
    }
    // Auto-crear reagenda si se marca como "reagendada" y no existe ya una
    if (nuevoEstado === 'reagendada') {
      const yaExiste = reagendas.some(r => r.reservaOriginalId === reservaId);
      if (!yaExiste) {
        const plan = planes.find(p => p.id === reserva.planId);
        if (plan) {
          const reagenda: Reagenda = {
            id: crypto.randomUUID(), alumnoId: id, planId: reserva.planId,
            reservaOriginalId: reservaId,
            fechaLimite: getEffectiveEndDate(plan),
            estado: 'pendiente', creadaAt: new Date().toISOString(),
          };
          await upsertReagendaDB(reagenda).catch(() => {});
          setReagendas(prev => [reagenda, ...prev]);
        }
      }
    }
  }

  async function handleCreateReserva() {
    if (!newReserva?.fecha) return;
    const hoy = todayStr();
    const planActivo = planes.find(p => {
      const end = p.extendedUntil && p.extendedUntil > p.endDate ? p.extendedUntil : p.endDate;
      return hoy <= end;
    }) ?? planes[0];
    if (!planActivo) { alert('Este alumno no tiene un plan activo.'); return; }

    let fechas: string[] = [];
    if (newReserva.repetir && newReserva.diasSemana.length > 0) {
      const hasta = newReserva.fechaFin || planActivo.endDate;
      const cur = new Date(newReserva.fecha + 'T12:00:00');
      const fin = new Date(hasta + 'T12:00:00');
      let guard = 0;
      while (cur <= fin && guard < 500) {
        if (newReserva.diasSemana.includes(cur.getDay())) {
          fechas.push(cur.toISOString().slice(0, 10));
        }
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
      if (fechas.length === 0) { alert('No hay fechas en ese rango para los días seleccionados.'); return; }
    } else {
      fechas = [newReserva.fecha];
    }

    const descripcion = newReserva.tipo.length > 0 ? newReserva.tipo.join(' · ') : undefined;
    const nuevas: Reserva[] = fechas.map(fecha => ({
      id: crypto.randomUUID(), alumnoId: id, planId: planActivo.id,
      fecha, hora: newReserva.hora || undefined,
      descripcion,
      estado: 'pendiente' as const, creadaAt: new Date().toISOString(),
    }));
    await Promise.all(nuevas.map(r => upsertReservaDB(r).catch(() => {})));
    setReservas(prev => [...nuevas, ...prev].sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setNewReserva(null);
  }

  async function handleAsignarReagenda(reagendaId: string, nuevaFecha: string) {
    const reagenda = reagendas.find(r => r.id === reagendaId);
    if (!reagenda) return;
    const check = canReagendar(reagenda, nuevaFecha);
    if (!check.ok) { alert(check.reason); return; }
    // Crear nueva reserva vinculada a la reagenda
    const nuevaReserva: Reserva = {
      id: crypto.randomUUID(), alumnoId: id, planId: reagenda.planId,
      fecha: nuevaFecha, estado: 'pendiente',
      reagendaId: reagenda.id, creadaAt: new Date().toISOString(),
    };
    await upsertReservaDB(nuevaReserva).catch(() => {});
    setReservas(prev => [nuevaReserva, ...prev].sort((a, b) => b.fecha.localeCompare(a.fecha)));
    // Marcar reagenda como completada
    const reagendaCompletada: Reagenda = { ...reagenda, nuevaReservaId: nuevaReserva.id, estado: 'completada' };
    await upsertReagendaDB(reagendaCompletada).catch(() => {});
    setReagendas(prev => prev.map(r => r.id === reagendaId ? reagendaCompletada : r));
    setAsignando(null);
  }

  async function handleDeleteReserva(reservaId: string) {
    const reserva = reservas.find(r => r.id === reservaId);
    if (!reserva || !confirm('¿Eliminar esta reserva?')) return;
    await deleteReservaDB(reservaId).catch(() => {});
    setReservas(prev => prev.filter(r => r.id !== reservaId));
    const newCount = await recalcUsedClasesDB(reserva.planId, id).catch(() => -1);
    if (newCount >= 0) {
      setPlanes(prev => prev.map(p => p.id === reserva.planId ? { ...p, usedClases: newCount } : p));
    }
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

          {/* Reservas / Asistencia */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Reservas y asistencia ({reservas.length})</p>
              <button onClick={() => setNewReserva({ fecha: todayStr(), hora: '', tipo: [], repetir: false, diasSemana: [], fechaFin: '' })}
                className="flex items-center gap-1 rounded-lg border border-[#CACACA] px-2.5 py-1 text-xs text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
                <Plus className="h-3 w-3" /> Nueva
              </button>
            </div>

            {newReserva !== null && (
              <div className="mb-4 space-y-3 rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LC}>Fecha</label>
                    <input type="date" value={newReserva.fecha}
                      onChange={e => setNewReserva(p => p ? { ...p, fecha: e.target.value } : p)}
                      className={IC} />
                  </div>
                  <div>
                    <label className={LC}>Hora (opcional)</label>
                    <input type="time" value={newReserva.hora}
                      onChange={e => setNewReserva(p => p ? { ...p, hora: e.target.value } : p)}
                      className={IC} />
                  </div>
                </div>
                <div>
                  <label className={LC}>Tipo de clase</label>
                  <div className="flex gap-2">
                    {['1:1', '2:1', 'Grupal'].map(t => {
                      const sel = newReserva.tipo.includes(t);
                      return (
                        <button key={t} type="button"
                          onClick={() => setNewReserva(p => p ? {
                            ...p,
                            tipo: sel ? p.tipo.filter(x => x !== t) : [...p.tipo, t],
                          } : p)}
                          className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${
                            sel
                              ? 'border-[#121212] bg-[#121212] text-white'
                              : 'border-[#CACACA] text-[#5E5E5E] hover:border-[#888]'
                          }`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Repetir semanalmente */}
                <div>
                  <button type="button"
                    onClick={() => setNewReserva(p => p ? { ...p, repetir: !p.repetir, diasSemana: [] } : p)}
                    className={`w-full rounded-[8px] border px-3 py-2 text-left text-xs font-semibold transition ${
                      newReserva.repetir
                        ? 'border-[#121212] bg-[#121212]/8 text-[#121212]'
                        : 'border-[#CACACA] text-[#5E5E5E] hover:border-[#888]'
                    }`}>
                    {newReserva.repetir ? '✓ Repetir semanalmente' : 'Repetir semanalmente'}
                  </button>
                </div>

                {newReserva.repetir && (() => {
                  const DIAS = [
                    { label: 'L', day: 1 }, { label: 'M', day: 2 }, { label: 'Mi', day: 3 },
                    { label: 'J', day: 4 }, { label: 'V', day: 5 }, { label: 'S', day: 6 }, { label: 'D', day: 0 },
                  ];
                  return (
                    <div className="space-y-3">
                      <div>
                        <label className={LC}>Días de la semana</label>
                        <div className="flex gap-1.5">
                          {DIAS.map(({ label, day }) => {
                            const sel = newReserva.diasSemana.includes(day);
                            return (
                              <button key={day} type="button"
                                onClick={() => setNewReserva(p => p ? {
                                  ...p,
                                  diasSemana: sel
                                    ? p.diasSemana.filter(d => d !== day)
                                    : [...p.diasSemana, day],
                                } : p)}
                                className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${
                                  sel
                                    ? 'border-[#121212] bg-[#121212] text-white'
                                    : 'border-[#CACACA] text-[#5E5E5E] hover:border-[#888]'
                                }`}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className={LC}>Hasta (deja en blanco = fin del plan)</label>
                        <input type="date" value={newReserva.fechaFin}
                          onChange={e => setNewReserva(p => p ? { ...p, fechaFin: e.target.value } : p)}
                          className={IC} />
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <button onClick={handleCreateReserva}
                    className="nexa-btn-primary flex-1 justify-center text-xs py-2">
                    {newReserva.repetir && newReserva.diasSemana.length > 0 ? 'Crear todas las reservas' : 'Guardar'}
                  </button>
                  <button onClick={() => setNewReserva(null)}
                    className="nexa-btn-secondary px-4 py-2 text-xs">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {reservas.length === 0 ? (
              <p className="text-sm text-[#5E5E5E]">Sin reservas registradas.</p>
            ) : (
              <div className="space-y-2">
                {reservas.slice(0, 20).map(r => {
                  const lbl = RESERVA_LABEL[r.estado];
                  return (
                    <div key={r.id} className="rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-[#121212]">{r.fecha}</span>
                            {r.hora && <span className="text-xs text-[#5E5E5E]">{r.hora}</span>}
                            {r.descripcion && <span className="truncate text-xs text-[#5E5E5E]">{r.descripcion}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="hidden text-xs font-semibold sm:inline" style={{ color: lbl.color }}>{lbl.label}</span>
                          <select
                            value={r.estado}
                            onChange={e => handleChangeReservaEstado(r.id, e.target.value as Reserva['estado'])}
                            className="rounded-md border border-[#CACACA] bg-[#F0F0F0] px-2 py-1 text-xs text-[#121212] outline-none">
                            {(Object.entries(RESERVA_LABEL) as [Reserva['estado'], { label: string; color: string; quema: boolean }][]).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                          <button onClick={() => handleDeleteReserva(r.id)}
                            className="rounded p-1 text-[#9B9B9B] transition hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reagendas */}
          {reagendas.length > 0 && (
            <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
              <p className={`mb-3 ${SL}`}>Reagendas</p>
              <div className="space-y-2">
                {reagendas.map(r => {
                  const reservaOrig = reservas.find(x => x.id === r.reservaOriginalId);
                  const isPendiente = r.estado === 'pendiente';
                  const isVencida   = r.estado === 'vencida';
                  const estaAsignando = asignando?.reagendaId === r.id;

                  return (
                    <div key={r.id} className={`rounded-[8px] border px-3 py-2.5 ${
                      isPendiente ? 'border-[#f97316]/40 bg-[#fff7ed]' :
                      isVencida   ? 'border-[#CACACA] bg-[#F5F5F5] opacity-60' :
                                    'border-[#22c55e]/30 bg-[#f0fdf4]'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#121212]">
                            Clase del {reservaOrig ? reservaOrig.fecha : '—'}
                            {reservaOrig?.hora && ` · ${reservaOrig.hora}`}
                          </p>
                          <p className="text-[11px] text-[#5E5E5E]">
                            {isPendiente && `Reagendar antes del ${formatDate(r.fechaLimite)}`}
                            {isVencida   && `Vencida el ${formatDate(r.fechaLimite)}`}
                            {r.estado === 'completada' && (() => {
                              const nueva = reservas.find(x => x.id === r.nuevaReservaId);
                              return `Reagendada al ${nueva ? nueva.fecha : '—'}`;
                            })()}
                          </p>
                        </div>
                        {isPendiente && !estaAsignando && (
                          <button
                            onClick={() => setAsignando({ reagendaId: r.id, fecha: todayStr() })}
                            className="shrink-0 rounded-lg border border-[#f97316]/50 bg-white px-3 py-1.5 text-xs font-semibold text-[#f97316] transition hover:bg-[#f97316] hover:text-white">
                            Asignar fecha
                          </button>
                        )}
                        {r.estado === 'completada' && (
                          <span className="shrink-0 text-xs font-semibold text-[#22c55e]">✓ Completada</span>
                        )}
                        {isVencida && (
                          <span className="shrink-0 text-xs text-[#9B9B9B]">Vencida</span>
                        )}
                      </div>

                      {/* Formulario inline para asignar fecha */}
                      {estaAsignando && (
                        <div className="mt-3 space-y-2 border-t border-[#f97316]/20 pt-3">
                          <p className="text-[11px] text-[#5E5E5E]">
                            Fecha límite: <strong>{formatDate(r.fechaLimite)}</strong>
                          </p>
                          <input
                            type="date"
                            value={asignando.fecha}
                            min={todayStr()}
                            max={r.fechaLimite}
                            onChange={e => setAsignando(p => p ? { ...p, fecha: e.target.value } : p)}
                            className="w-full rounded-[8px] border border-[#D8D8D8] bg-[#F8F8F8] px-3 py-2 text-sm outline-none focus:border-[#121212]"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAsignarReagenda(r.id, asignando.fecha)}
                              className="flex-1 rounded-lg bg-[#121212] py-2 text-xs font-bold text-white transition hover:bg-[#3E3E3E]">
                              Confirmar
                            </button>
                            <button
                              onClick={() => setAsignando(null)}
                              className="rounded-lg border border-[#CACACA] px-4 py-2 text-xs text-[#5E5E5E] transition hover:border-[#888]">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Plan */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Plan de clases</p>
              <button onClick={() => setPlanModal({ mode: 'create' })}
                className="flex items-center gap-1 rounded-lg border border-[#CACACA] px-2.5 py-1 text-xs text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
                <Plus className="h-3 w-3" /> Nuevo
              </button>
            </div>
            {planes.length === 0 ? (
              <p className="text-sm text-[#5E5E5E]">Sin planes registrados.</p>
            ) : (
              <div className="space-y-3">
                {planes.map(plan => (
                  <div key={plan.id}>
                    <PlanStatusCard
                      plan={plan}
                      reservas={reservas.filter(r => r.planId === plan.id)}
                      reagendas={[]}
                      isAdmin
                      onEdit={() => setPlanModal({ mode: 'edit', plan })}
                    />
                    <button onClick={() => handleDeletePlan(plan.id)}
                      className="mt-1 text-[11px] text-[#9B9B9B] transition hover:text-red-500">
                      Eliminar plan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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

      {planModal && (
        <PlanFormModal
          alumnoId={id}
          alumnoNombre={`${alumno.nombre} ${alumno.apellido}`}
          mode={planModal.mode}
          initial={planModal.plan}
          onSave={handleSavePlan}
          onClose={() => setPlanModal(null)}
        />
      )}
    </main>
  );
}
