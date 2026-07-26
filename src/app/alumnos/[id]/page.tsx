'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAlumnoById, updateAlumno, getAtletaSaludDB, upsertAtletaSaludDB } from '@/lib/alumnos';
import { ArrowLeft, Plus, Trash2, TrendingUp, ChevronDown, ChevronUp, Pencil, Check, X as XIcon } from 'lucide-react';
import type { Alumno, AtletaSalud } from '@/app/alumnos/page';
import type { Sesion } from '@/lib/sesiones';
import { getSesionesAlumnoDB } from '@/lib/sesiones-supabase';
import { getRutinasDB, type RutinaDB } from '@/lib/rutinas-supabase';
import { calc1RM, parseReps } from '@/lib/mevmrv';
import type { Plan, Reserva, Reagenda } from '@/lib/planes';
import { RESERVA_LABEL, todayStr, getEffectiveEndDate, formatDate, canReagendar, getPlanEstado } from '@/lib/planes';
import PlanFormModal    from '@/components/planes/PlanFormModal';
import InscripcionModal from '@/components/planes/InscripcionModal';
import PlanStatusCard   from '@/components/planes/PlanStatusCard';
import {
  getPlanesAlumnoDB, upsertPlanDB, deletePlanDB,
  getReservasAlumnoDB, upsertReservaDB, deleteReservaDB,
  recalcUsedClasesDB,
  getReagendasAlumnoDB, upsertReagendaDB,
} from '@/lib/planes-supabase';
import { getBloqueos, type HorarioBloqueo } from '@/lib/horario-config';

interface Medicion {
  id: string; fecha: string; peso: string;
  grasa?: string; musculo?: string; notas?: string;
}

interface AlumnoExtended extends Alumno {
  mediciones?: Medicion[];
}

const IC ='w-full rounded-[8px] border border-[#D8D8D8] bg-[#F8F8F8] px-4 py-3 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#121212]' as const;
const LC = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5E5E5E]' as const;
const SL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]' as const;

function isActive(r: RutinaDB) {
  if (!r.start_date || !r.end_date) return false;
  const t = new Date().toISOString().slice(0,10);
  return t >= r.start_date && t <= r.end_date;
}

function computeHistorialPeso(sesionesArr: Sesion[], ejercicioNombre: string): { fecha: string; peso: number }[] {
  return sesionesArr
    .filter(s => s.ejercicios.some(e => e.nombre.toLowerCase() === ejercicioNombre.toLowerCase()))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(s => {
      const ej = s.ejercicios.find(e => e.nombre.toLowerCase() === ejercicioNombre.toLowerCase())!;
      const maxP = Math.max(...ej.series.filter(x => x.completada).map(x => parseFloat(x.peso) || 0));
      return { fecha: s.fecha, peso: maxP };
    }).filter(p => p.peso > 0);
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

// ─── Componentes de ficha ─────────────────────────────────────────────────────

function FichaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-[#9B9B9B]">{label}</dt>
      <dd className="text-right text-[#121212]">{value || <span className="text-[#C8C8C8]">—</span>}</dd>
    </div>
  );
}

function FichaSection({ title, badge, editing, saving, onEdit, onSave, onCancel, children }: {
  title: string; badge?: string; editing: boolean; saving: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">{title}</p>
          {badge && <span className="rounded-full bg-[#121212]/8 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#5E5E5E]">{badge}</span>}
        </div>
        {editing ? (
          <div className="flex gap-1.5">
            <button onClick={onSave} disabled={saving} className="rounded-lg bg-[#121212] px-3 py-1 text-[10px] font-bold text-white disabled:opacity-40">
              {saving ? '…' : 'Guardar'}
            </button>
            <button onClick={onCancel} className="rounded-lg border border-[#CACACA] px-3 py-1 text-[10px] text-[#5E5E5E]">Cancelar</button>
          </div>
        ) : (
          <button onClick={onEdit} className="rounded-lg border border-[#CACACA] p-1.5 text-[#5E5E5E] transition hover:text-[#121212]">
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function AlumnoPerfilPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [alumno, setAlumno]     = useState<AlumnoExtended | null>(null);
  const [routines, setRoutines] = useState<RutinaDB[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [showMedicion, setShowMedicion] = useState(false);
  const [medForm, setMedForm]   = useState<Omit<Medicion,'id'>>({ fecha: new Date().toISOString().slice(0,10), peso: '', grasa: '', musculo: '', notas: '' });
  const [expandedSesion, setExpandedSesion] = useState<string | null>(null);

  // Salud (solo admin/profesor — null = sin acceso)
  const [salud,    setSalud]    = useState<AtletaSalud | null | 'loading'>('loading');
  const [editSec,  setEditSec]  = useState<string | null>(null); // qué sección está en modo edición
  const [editBuf,  setEditBuf]  = useState<Partial<Alumno>>({});
  const [saludBuf, setSaludBuf] = useState<Partial<AtletaSalud>>({});
  const [saving,   setSaving]   = useState(false);

  // Planes y reservas
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [reagendas,  setReagendas]  = useState<Reagenda[]>([]);
  const [asignando,    setAsignando]    = useState<{ reagendaId: string; fecha: string; hora: string } | null>(null);
  const [reagendaErr,  setReagendaErr]  = useState('');
  const [bloqueos,     setBloqueos]     = useState<HorarioBloqueo[]>([]);
  const [planModal,      setPlanModal]      = useState<{ mode: 'edit'; plan: Plan } | null>(null);
  const [showInscripcion, setShowInscripcion] = useState(false);

  // Recarga solo reservas/planes (lo que cambia al hacer check-in)
  const loadReservas = useCallback(() => {
    getPlanesAlumnoDB(id).then(setPlanes).catch(() => {});
    getReservasAlumnoDB(id).then(setReservas).catch(() => {});
  }, [id]);

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
    getRutinasDB().then(setRoutines).catch(() => {});
    getSesionesAlumnoDB(id).then(setSesiones).catch(() => {});
    // Salud (RLS filtra automáticamente si no tiene acceso)
    getAtletaSaludDB(id).then(s => setSalud(s)).catch(() => setSalud(null));
    // Planes, reservas y reagendas desde Supabase
    loadReservas();
    getBloqueos().then(setBloqueos).catch(() => {});
    getReagendasAlumnoDB(id).then(async rs => {
      const hoy = todayStr();
      const vencidas = rs.filter(r => r.estado === 'pendiente' && hoy > r.fechaLimite);
      // Sincronizar vencidas en DB primero, luego actualizar UI
      await Promise.allSettled(
        vencidas.map(r => upsertReagendaDB({ ...r, estado: 'vencida' as const }))
      );
      setReagendas(rs.map(r =>
        vencidas.some(v => v.id === r.id) ? { ...r, estado: 'vencida' as const } : r
      ));
    }).catch(() => {});
  }, [id, loadReservas]);

  // Recargar reservas y planes cuando el usuario vuelve a esta pestaña
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadReservas(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadReservas]);

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

  function startEdit(section: string) {
    setEditSec(section);
    setEditBuf({ ...alumno });
    setSaludBuf(salud && salud !== 'loading' ? { ...salud } : {});
  }

  async function saveEdit(section: string) {
    if (!alumno) return;
    setSaving(true);
    try {
      if (section === 'salud') {
        await upsertAtletaSaludDB({ atletaId: id, ...saludBuf });
        setSalud(prev => prev && prev !== 'loading' ? { ...prev, ...saludBuf } : { atletaId: id, ...saludBuf });
      } else {
        const updated = await updateAlumno(id, editBuf);
        setAlumno(prev => prev ? { ...prev, ...updated } : updated);
      }
      setEditSec(null);
    } catch (e) {
      console.error('Error guardando:', e);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() { setEditSec(null); setEditBuf({}); setSaludBuf({}); }

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

  function handleInscripcionSaved(plan: Plan, reservasCount: number) {
    setPlanes(prev => [plan, ...prev]);
    // Las reservas se recargan desde DB para tener los IDs reales generados por la DB
    getReservasAlumnoDB(id).then(setReservas).catch(() => {});
  }

  async function handleSavePlan(data: Omit<Plan, 'id' | 'alumnoId' | 'createdAt'>) {
    if (!planModal) return;
    const plan: Plan = { ...planModal.plan, ...data };
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
    const { error: errUpd } = await upsertReservaDB(updated).then(() => ({ error: null })).catch(e => ({ error: e }));
    if (errUpd) { console.error('Error guardando reserva:', errUpd); return; }
    setReservas(prev => prev.map(r => r.id === reservaId ? updated : r));
    const newCount = await recalcUsedClasesDB(reserva.planId, id).catch(() => -1);
    if ((newCount ?? -1) >= 0) {
      setPlanes(prev => prev.map(p => p.id === reserva.planId ? { ...p, usedClases: newCount as number } : p));
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

  async function handleAsignarReagenda(reagendaId: string, nuevaFecha: string, hora?: string) {
    const reagenda = reagendas.find(r => r.id === reagendaId);
    if (!reagenda) return;
    const check = canReagendar(reagenda, nuevaFecha);
    if (!check.ok) { console.warn('Reagenda inválida:', check.reason); return; }
    // Verificar que la fecha no esté bloqueada
    const bloqueado = bloqueos.find(b => {
      if (b.fecha !== nuevaFecha) return false;
      if (!b.horaInicio) return true; // día completo
      if (!hora) return true;
      return hora >= b.horaInicio && hora < (b.horaFin ?? '23:59');
    });
    if (bloqueado) {
      setReagendaErr(`Fecha bloqueada${bloqueado.motivo ? ': ' + bloqueado.motivo : ''}`);
      return;
    }
    setReagendaErr('');
    // Crear nueva reserva vinculada a la reagenda
    const nuevaReserva: Reserva = {
      id: crypto.randomUUID(), alumnoId: id, planId: reagenda.planId,
      fecha: nuevaFecha, hora, estado: 'pendiente',
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

  const activeRoutines = routines.filter(r => (r.alumno_ids ?? []).includes(id) && isActive(r));
  const allRoutines    = routines.filter(r => (r.alumno_ids ?? []).includes(id));
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
                {activeRoutines.map(r => (
                  <div key={r.id} className="rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-3">
                    <p className="font-semibold text-[#121212]">{r.nombre}</p>
                    <p className="text-xs text-[#5E5E5E]">{r.start_date} → {r.end_date}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(r.blocks as { id?: string; nombre?: string; name?: string }[]).map((b, i) => (
                        <span key={b.id ?? i} className="rounded-md border border-[#CACACA] px-2 py-0.5 text-xs text-[#5E5E5E]">
                          {b.nombre ?? b.name ?? `Bloque ${i + 1}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reservas / Asistencia */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Reservas y asistencia ({reservas.length})</p>
              <button onClick={() => setShowInscripcion(true)}
                className="flex items-center gap-1 rounded-lg border border-[#CACACA] px-2.5 py-1 text-xs text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
                <Plus className="h-3 w-3" /> Inscribir
              </button>
            </div>

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
                            onClick={() => setAsignando({ reagendaId: r.id, fecha: todayStr(), hora: '' })}
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

                      {/* Formulario inline para asignar fecha y hora */}
                      {estaAsignando && (
                        <div className="mt-3 space-y-2 border-t border-[#f97316]/20 pt-3">
                          <p className="text-[11px] text-[#5E5E5E]">
                            Fecha límite: <strong>{formatDate(r.fechaLimite)}</strong>
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={asignando.fecha}
                              min={todayStr()}
                              max={r.fechaLimite}
                              onChange={e => { setReagendaErr(''); setAsignando(p => p ? { ...p, fecha: e.target.value } : p); }}
                              className="rounded-[8px] border border-[#D8D8D8] bg-[#F8F8F8] px-3 py-2 text-sm outline-none focus:border-[#121212]"
                            />
                            <input
                              type="time"
                              value={asignando.hora ?? ''}
                              onChange={e => setAsignando(p => p ? { ...p, hora: e.target.value } : p)}
                              className="rounded-[8px] border border-[#D8D8D8] bg-[#F8F8F8] px-3 py-2 text-sm outline-none focus:border-[#121212]"
                            />
                          </div>
                          {reagendaErr && (
                            <p className="text-[11px] font-semibold rounded-lg px-3 py-2"
                              style={{ background: 'rgba(180,64,64,0.1)', color: '#B44040', border: '1px solid rgba(180,64,64,0.3)' }}>
                              {reagendaErr}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAsignarReagenda(r.id, asignando.fecha, asignando.hora || undefined)}
                              className="flex-1 rounded-lg bg-[#121212] py-2 text-xs font-bold text-white transition hover:bg-[#3E3E3E]">
                              Confirmar
                            </button>
                            <button
                              onClick={() => { setAsignando(null); setReagendaErr(''); }}
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
                  const historial = computeHistorialPeso(sesiones, nombre);
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

        {/* Right column */}
        <div className="space-y-4">

          {/* ── FICHA: Datos personales ── */}
          <FichaSection title="Datos personales" editing={editSec === 'datos'} onEdit={() => startEdit('datos')} onSave={() => saveEdit('datos')} onCancel={cancelEdit} saving={saving}>
            {editSec === 'datos' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LC}>Nombre</label><input className={IC} value={editBuf.nombre ?? ''} onChange={e => setEditBuf(p => ({ ...p, nombre: e.target.value }))} /></div>
                  <div><label className={LC}>Apellido</label><input className={IC} value={editBuf.apellido ?? ''} onChange={e => setEditBuf(p => ({ ...p, apellido: e.target.value }))} /></div>
                </div>
                <div><label className={LC}>RUT</label><input className={IC} placeholder="12.345.678-9" value={editBuf.rut ?? ''} onChange={e => setEditBuf(p => ({ ...p, rut: e.target.value }))} /></div>
                <div><label className={LC}>Email</label><input type="email" className={IC} value={editBuf.email ?? ''} onChange={e => setEditBuf(p => ({ ...p, email: e.target.value }))} /></div>
                <div><label className={LC}>Teléfono</label><input className={IC} placeholder="+56 9 XXXX XXXX" value={editBuf.telefono ?? ''} onChange={e => setEditBuf(p => ({ ...p, telefono: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LC}>Fecha nac.</label><input type="date" className={IC} value={editBuf.fechaNacimiento ?? ''} onChange={e => setEditBuf(p => ({ ...p, fechaNacimiento: e.target.value }))} /></div>
                  <div><label className={LC}>Estado</label>
                    <select className={IC} value={editBuf.estado ?? 'activo'} onChange={e => setEditBuf(p => ({ ...p, estado: e.target.value as Alumno['estado'] }))}>
                      <option value="activo">Activo</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="archivado">Archivado</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <dl className="space-y-1.5 text-sm">
                <FichaRow label="RUT"      value={alumno.rut} />
                <FichaRow label="Email"    value={alumno.email} />
                <FichaRow label="Teléfono" value={alumno.telefono} />
                <FichaRow label="Nac."     value={alumno.fechaNacimiento ? alumno.fechaNacimiento.split('-').reverse().join('/') : undefined} />
                <FichaRow label="Estado"   value={alumno.estado} />
              </dl>
            )}
          </FichaSection>

          {/* ── FICHA: Contacto de emergencia ── */}
          <FichaSection title="Contacto de emergencia" editing={editSec === 'emergencia'} onEdit={() => startEdit('emergencia')} onSave={() => saveEdit('emergencia')} onCancel={cancelEdit} saving={saving}>
            {editSec === 'emergencia' ? (
              <div className="space-y-2">
                <div><label className={LC}>Nombre</label><input className={IC} value={editBuf.contactoEmergenciaNombre ?? ''} onChange={e => setEditBuf(p => ({ ...p, contactoEmergenciaNombre: e.target.value }))} /></div>
                <div><label className={LC}>Teléfono</label><input className={IC} value={editBuf.contactoEmergenciaTel ?? ''} onChange={e => setEditBuf(p => ({ ...p, contactoEmergenciaTel: e.target.value }))} /></div>
                <div><label className={LC}>Relación</label>
                  <select className={IC} value={editBuf.contactoEmergenciaRelacion ?? ''} onChange={e => setEditBuf(p => ({ ...p, contactoEmergenciaRelacion: e.target.value }))}>
                    <option value="">— seleccionar —</option>
                    {['Pareja','Cónyuge','Madre','Padre','Hijo/a','Hermano/a','Amigo/a','Otro'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <dl className="space-y-1.5 text-sm">
                <FichaRow label="Nombre"   value={alumno.contactoEmergenciaNombre} />
                <FichaRow label="Teléfono" value={alumno.contactoEmergenciaTel} />
                <FichaRow label="Relación" value={alumno.contactoEmergenciaRelacion} />
              </dl>
            )}
          </FichaSection>

          {/* ── FICHA: Salud (solo visible si tenemos acceso RLS) ── */}
          {salud !== null && salud !== 'loading' && (
            <FichaSection title="Salud" badge="Privado" editing={editSec === 'salud'} onEdit={() => startEdit('salud')} onSave={() => saveEdit('salud')} onCancel={cancelEdit} saving={saving}>
              {editSec === 'salud' ? (
                <div className="space-y-2">
                  {(['enfermedades','lesiones','medicamentos','alergias'] as const).map(campo => (
                    <div key={campo}>
                      <label className={LC}>{campo.charAt(0).toUpperCase() + campo.slice(1)}</label>
                      <textarea rows={2} className={IC + ' resize-none'} placeholder="Ninguna"
                        value={saludBuf[campo] ?? ''}
                        onChange={e => setSaludBuf(p => ({ ...p, [campo]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              ) : (
                <dl className="space-y-1.5 text-sm">
                  <FichaRow label="Enfermedades" value={salud.enfermedades} />
                  <FichaRow label="Lesiones"     value={salud.lesiones} />
                  <FichaRow label="Medicamentos" value={salud.medicamentos} />
                  <FichaRow label="Alergias"     value={salud.alergias} />
                </dl>
              )}
            </FichaSection>
          )}

          {/* ── FICHA: Entrenamiento ── */}
          <FichaSection title="Entrenamiento" editing={editSec === 'entrenamiento'} onEdit={() => startEdit('entrenamiento')} onSave={() => saveEdit('entrenamiento')} onCancel={cancelEdit} saving={saving}>
            {editSec === 'entrenamiento' ? (
              <div className="space-y-2">
                <div><label className={LC}>Objetivo</label>
                  <select className={IC} value={editBuf.objetivo ?? ''} onChange={e => setEditBuf(p => ({ ...p, objetivo: e.target.value }))}>
                    <option value="">— seleccionar —</option>
                    {['Pérdida de peso','Ganancia muscular','Rendimiento deportivo','Rehabilitación','Bienestar general','Otro'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div><label className={LC}>Etapa CRM</label>
                  <select className={IC} value={editBuf.etapa ?? ''} onChange={e => setEditBuf(p => ({ ...p, etapa: e.target.value }))}>
                    <option value="lead">Lead</option>
                    <option value="prospecto">Prospecto</option>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
                <div><label className={LC}>Notas del profesor</label>
                  <textarea rows={3} className={IC + ' resize-none'} value={editBuf.notasProfesor ?? ''} onChange={e => setEditBuf(p => ({ ...p, notasProfesor: e.target.value }))} />
                </div>
              </div>
            ) : (
              <dl className="space-y-1.5 text-sm">
                <FichaRow label="Objetivo" value={alumno.objetivo} />
                <FichaRow label="Etapa"    value={alumno.etapa} />
                <FichaRow label="Notas"    value={alumno.notasProfesor} />
              </dl>
            )}
          </FichaSection>

          {/* ── FICHA: Contrato NEXA ── */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Contrato NEXA</p>
              {editSec === 'contrato' ? (
                <div className="flex gap-1.5">
                  <button onClick={() => saveEdit('contrato')} disabled={saving} className="rounded-lg bg-[#121212] px-3 py-1 text-[10px] font-bold text-white disabled:opacity-40">
                    {saving ? '…' : 'Guardar'}
                  </button>
                  <button onClick={cancelEdit} className="rounded-lg border border-[#CACACA] px-3 py-1 text-[10px] text-[#5E5E5E]">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => startEdit('contrato')} className="rounded-lg border border-[#CACACA] p-1.5 text-[#5E5E5E] hover:text-[#121212]"><Pencil className="h-3 w-3" /></button>
              )}
            </div>
            {editSec === 'contrato' ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editBuf.contratoFirmado ?? false}
                    onChange={e => setEditBuf(p => ({ ...p, contratoFirmado: e.target.checked, contratoFechaFirma: e.target.checked ? (p.contratoFechaFirma || todayStr()) : '' }))} />
                  Contrato firmado
                </label>
                {editBuf.contratoFirmado && (
                  <div><label className={LC}>Fecha de firma</label>
                    <input type="date" className={IC} value={editBuf.contratoFechaFirma ?? ''} onChange={e => setEditBuf(p => ({ ...p, contratoFechaFirma: e.target.value }))} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${alumno.contratoFirmado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {alumno.contratoFirmado ? '● Firmado' : '● Pendiente'}
                </span>
                {alumno.contratoFirmado && alumno.contratoFechaFirma && (
                  <span className="text-xs text-[#5E5E5E]">{alumno.contratoFechaFirma.split('-').reverse().join('/')}</span>
                )}
              </div>
            )}
          </div>

          {/* Plan */}
          <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className={SL}>Plan de clases</p>
              <button onClick={() => setShowInscripcion(true)}
                className="flex items-center gap-1 rounded-lg border border-[#CACACA] px-2.5 py-1 text-xs text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
                <Plus className="h-3 w-3" /> Inscribir
              </button>
            </div>
            {/* Recordatorios de vencimiento */}
            {planes.some(p => getPlanEstado(p) === 'vencido') && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                Plan vencido — renovar o crear uno nuevo.
              </div>
            )}
            {planes.some(p => getPlanEstado(p) === 'por_vencer') && (
              <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-orange-700">
                Plan próximo a vencer — recordar al alumno.
              </div>
            )}
            {planes.some(p => getPlanEstado(p) === 'sin_clases') && (
              <div className="mb-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-xs text-yellow-700">
                Sin clases disponibles — el alumno agotó su plan.
              </div>
            )}
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
                      onEdit={() => setPlanModal({ mode: 'edit' as const, plan })}
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

      {showInscripcion && (
        <InscripcionModal
          alumnoId={id}
          alumnoNombre={`${alumno.nombre} ${alumno.apellido}`}
          onSaved={handleInscripcionSaved}
          onClose={() => setShowInscripcion(false)}
        />
      )}

      {planModal && (
        <PlanFormModal
          alumnoId={id}
          alumnoNombre={`${alumno.nombre} ${alumno.apellido}`}
          mode="edit"
          initial={planModal.plan}
          onSave={handleSavePlan}
          onClose={() => setPlanModal(null)}
        />
      )}
    </main>
  );
}
