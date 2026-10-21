'use client';

import { useState, useEffect, useCallback, Fragment, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Plus, ClipboardCheck } from 'lucide-react';
import CheckinTab from './CheckinTab';
import { supabase } from '@/lib/supabaseClient';
import { getCoachesActivosDB, COACH_COLORS, type Coach } from '@/lib/coaches-supabase';
import { validarConflictoTipo } from '@/lib/reservas-validation';
import {
  getHorarioConfig, getBloqueos, generateHours,
  DEFAULT_HORARIO_CONFIG,
  type HorarioConfig, type HorarioBloqueo,
} from '@/lib/horario-config';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAY_LABELS          = ['LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const ESTADOS_QUE_QUEMAN  = ['presente', 'no_show', 'cancelada_tarde'];
// Reservas que ya no ocupan cupo en el horario
const ESTADOS_INACTIVOS   = ['cancelada_tiempo', 'cancelada_tarde', 'cancelada_nexa', 'no_show'];
const esActiva = (status: string) => !ESTADOS_INACTIVOS.includes((status || '').toLowerCase());

const ESTADOS_ASISTENCIA = [
  { value: 'presente',   label: 'Presente',        color: '#2E7D55' },
  { value: 'no_show',    label: 'No se presentó',  color: '#B44040' },
  { value: 'pendiente',  label: 'Pendiente',        color: '#9B9B9B' },
  { value: 'reagendada', label: 'Reagenda',         color: '#9B9BD5' },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoClase = '1:1' | '2:1' | 'Grupal';

interface Alumno {
  reservaId: number | string;
  nombre:    string;
  status:    string;
  tipo:      TipoClase;
}

interface Slot {
  fecha:      string;
  hora:       string;
  coachId:    string | null;
  tipo:       TipoClase;
  alumnos:    Alumno[];
  cuposTotal: number;
  estado:     string;
}

interface RawReserva {
  id:          number | string;
  rut?:        string;
  alumno_id?:  string;
  fecha:       string;
  hora?:       string;
  coach_id?:   string;
  tipo_clase?: string;
  descripcion?: string;
  estado?:     string;
  atletas?:    { nombre: string; apellido: string } | null;
  nombre_atleta?: string;
}

interface AtletaBusqueda {
  id:       string;
  nombre:   string;
  apellido: string;
  rut?:     string;
  tipo_sesion?: '1:1' | '2:1' | null;
}

interface PlanActivo {
  id:           string;
  nombre:       string;
  total_clases: number;
  end_date:     string;
  usado:        number;
  modalidad?:   '1:1' | '2:1' | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(offset: number): Date {
  const d   = new Date();
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1 + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateStr(d: Date)  { return d.toISOString().slice(0, 10); }
function fmtLabel(d: Date) { return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); }

function getSlotPos(r: RawReserva): { fecha: string; hora: string } | null {
  if (r.hora) return { fecha: String(r.fecha).slice(0, 10), hora: String(r.hora).slice(0, 5) };
  const f = String(r.fecha ?? '');
  if (f.length >= 16 && f.includes('T')) return { fecha: f.slice(0, 10), hora: f.slice(11, 16) };
  return null;
}

function parseTipo(tc?: string, desc?: string): TipoClase {
  const s = (tc || desc || '').toLowerCase();
  if (s.includes('2:1') || s.includes('duo') || s.includes('dúo')) return '2:1';
  if (s.includes('grupal') || s.includes('group'))                  return 'Grupal';
  return '1:1';
}

function getCupos(tipo: TipoClase, capacidadGrupal: number): number {
  if (tipo === '1:1') return 1;
  if (tipo === '2:1') return 2;
  return capacidadGrupal;
}

function alumnoLabel(r: RawReserva): string {
  if (r.nombre_atleta) return r.nombre_atleta;
  if (r.rut)           return r.rut;
  return 'Alumno';
}

function statusColor(s: string): string {
  const l = (s || '').toLowerCase();
  if (l === 'present'  || l === 'presente')        return '#2E7D55';
  if (l === 'absent_no_notice' || l === 'no_show') return '#B44040';
  if (l.startsWith('cancelad'))                     return '#555555';
  return '#C9A96E';
}

function addOneHour(hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

// Clave incluye coachId para que cada coach tenga su propio slot por celda
function buildSlotMap(reservas: RawReserva[], coachFiltro: string, capacidadGrupal: number): Map<string, Slot> {
  const map = new Map<string, Slot>();
  for (const r of reservas) {
    const pos = getSlotPos(r);
    if (!pos) continue;
    const coachId = r.coach_id ? String(r.coach_id) : null;
    if (coachFiltro !== 'all' && coachId !== coachFiltro) continue;
    const key  = `${pos.fecha}|${pos.hora}|${coachId ?? ''}`;
    const tipo = parseTipo(r.tipo_clase, r.descripcion);
    if (!map.has(key)) {
      map.set(key, {
        fecha: pos.fecha, hora: pos.hora, coachId, tipo,
        alumnos: [], cuposTotal: getCupos(tipo, capacidadGrupal),
        estado: String(r.estado || 'pendiente'),
      });
    }
    map.get(key)!.alumnos.push({
      reservaId: r.id,
      nombre:    alumnoLabel(r),
      status:    String(r.estado || 'pendiente'),
      tipo,
    });
  }
  // El tipo del horario lo definen las reservas activas (una cancelada 1:1
  // no debe hacer que un horario 2:1 se vea como 1:1).
  map.forEach(slot => {
    const activa = slot.alumnos.find(a => esActiva(a.status));
    if (activa && activa.tipo !== slot.tipo) {
      slot.tipo       = activa.tipo;
      slot.cuposTotal = getCupos(activa.tipo, capacidadGrupal);
    }
  });
  return map;
}

function getSlotsForCell(slotMap: Map<string, Slot>, fecha: string, hora: string): Slot[] {
  const prefix = `${fecha}|${hora}|`;
  const slots: Slot[] = [];
  slotMap.forEach((slot, key) => { if (key.startsWith(prefix)) slots.push(slot); });
  // Si hay slots con coach real, ocultar los sin coach (son reservas huérfanas)
  if (slots.some(s => s.coachId !== null)) return slots.filter(s => s.coachId !== null);
  return slots;
}

// ─── Modal editar asistencia ──────────────────────────────────────────────────

function EditModal({ slot, coachNombre, isPast, onClose, onSaved, onAgregar }: {
  slot:        Slot;
  coachNombre: string;
  isPast:      boolean;
  onClose:     () => void;
  onSaved:     () => void;
  onAgregar:   () => void;
}) {
  const [alumnos, setAlumnos] = useState<Alumno[]>(slot.alumnos);
  const [saving,  setSaving]  = useState(false);
  const [tipo,    setTipo]    = useState<TipoClase>(slot.tipo);
  const [error,   setError]   = useState('');

  const activos      = slot.alumnos.filter(a => esActiva(a.status));
  const esIndividual = slot.tipo !== 'Grupal';
  const hayCupo2a1   = tipo === '2:1' && activos.length < 2;

  // Cambia el tipo (1:1 ↔ 2:1) de las clases activas de este horario.
  // Sirve para corregir alumnos 2:1 que quedaron guardados como 1:1.
  async function guardarTipo(): Promise<boolean> {
    if (tipo === slot.tipo || !esIndividual) return true;
    if (tipo === '1:1' && activos.length > 1) {
      setError('Hay 2 alumnos en este horario: no puede ser 1:1.');
      return false;
    }
    const tipoClase = tipo === '2:1' ? '2:1 Duo' : '1:1 Individual';
    for (const a of activos) {
      const { error: err } = await supabase.from('reservas').update({ tipo_clase: tipoClase }).eq('id', a.reservaId);
      if (err) { setError(`No se pudo cambiar a ${tipo}: ${err.message}`); return false; }
    }
    return true;
  }

  function setStatus(id: number | string, status: string) {
    setAlumnos(prev => prev.map(a => a.reservaId === id ? { ...a, status } : a));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (!(await guardarTipo())) { onSaved(); return; }
      const results = await Promise.allSettled(
        alumnos.map(a =>
          supabase.from('reservas').update({ estado: a.status }).eq('id', a.reservaId)
        )
      );
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
      if (failed.length > 0) {
        alert(`Error: ${failed.length} asistencia(s) no se pudieron guardar. Intenta de nuevo.`);
        return;
      }
      onSaved();
      onClose();
    } catch {
      alert('Error al guardar asistencias. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--nexa-text)' }}>
              {slot.hora} · {slot.tipo}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>
              {new Date(slot.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
              {coachNombre ? ` · ${coachNombre}` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--nexa-muted)' }}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-5">
          {esIndividual && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--nexa-muted)' }}>Tipo de clase</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(['1:1', '2:1'] as TipoClase[]).map(t => {
                  const active = tipo === t;
                  const deshabilitado = t === '1:1' && activos.length > 1;
                  return (
                    <button key={t} type="button" onClick={() => setTipo(t)} disabled={deshabilitado}
                      aria-pressed={active}
                      className="rounded-lg py-2 text-[12px] font-semibold transition disabled:opacity-40"
                      style={{
                        background: active ? 'var(--nexa-accent)' : 'var(--nexa-card-alt)',
                        color:      active ? '#FFFFFF' : 'var(--nexa-muted)',
                        border:     `1px solid ${active ? 'var(--nexa-accent)' : 'var(--nexa-border)'}`,
                      }}>
                      {t} {t === '2:1' ? `· ${Math.min(activos.length, 2)}/2` : ''}
                    </button>
                  );
                })}
              </div>
              {tipo !== slot.tipo && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--nexa-muted)' }}>
                  Se guardará como {tipo} al presionar &quot;Guardar&quot;.
                </p>
              )}
            </div>
          )}

          {alumnos.map(a => (
            <div key={String(a.reservaId)}>
              <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--nexa-text)' }}>
                {a.nombre}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ESTADOS_ASISTENCIA.map(e => {
                  const active = a.status === e.value;
                  return (
                    <button key={e.value} onClick={() => setStatus(a.reservaId, e.value)}
                      className="rounded-lg px-3 py-2 text-[11px] font-semibold transition"
                      style={{
                        background: active ? e.color + '22' : 'var(--nexa-card-alt)',
                        border:     `1px solid ${active ? e.color : 'var(--nexa-border)'}`,
                        color:      active ? e.color : 'var(--nexa-muted)',
                      }}>
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 pb-4 space-y-2">
          {error && (
            <p role="alert" className="text-[12px]" style={{ color: 'var(--nexa-danger)' }}>{error}</p>
          )}
          {hayCupo2a1 && !isPast && tipo === slot.tipo && (
            <button type="button" onClick={onAgregar}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold transition"
              style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text)', border: '1px solid var(--nexa-border)' }}>
              <Plus size={14} /> Agregar 2º alumno (2:1)
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold transition"
            style={{ background: 'var(--nexa-accent)', color: '#FFFFFF', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal nueva sesión ───────────────────────────────────────────────────────

function NuevaSesionModal({ fecha, hora, coaches, defaultCoachId, tipoFijo, onClose, onSaved }: {
  fecha:          string;
  hora:           string;
  coaches:        Coach[];
  defaultCoachId: string | null;
  tipoFijo?:      TipoClase;   // al sumar un 2º alumno a un horario 2:1
  onClose:        () => void;
  onSaved:        () => void;
}) {
  const [tipoSel,      setTipo]         = useState<TipoClase>(tipoFijo ?? '1:1');
  const tipo = tipoFijo ?? tipoSel;
  const [coachId,      setCoachId]      = useState(defaultCoachId ?? coaches[0]?.id ?? '');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  // Búsqueda de alumno
  const [query,        setQuery]        = useState('');
  const [resultados,   setResultados]   = useState<AtletaBusqueda[]>([]);
  const [buscando,     setBuscando]     = useState(false);
  const [alumno,       setAlumno]       = useState<AtletaBusqueda | null>(null);
  // undefined = aún no cargado, null = sin plan activo, objeto = plan encontrado
  const [plan,         setPlan]         = useState<PlanActivo | null | undefined>(undefined);
  const [cargandoPlan, setCargandoPlan] = useState(false);

  // Modo walk-in (excepción explícita)
  const [walkIn,    setWalkIn]    = useState(false);
  const [rutWalkIn, setRutWalkIn] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Búsqueda debounced de atletas
  useEffect(() => {
    if (walkIn || query.length < 2) { setResultados([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from('atletas')
        .select('id, nombre, apellido, rut, tipo_sesion')
        .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,rut.ilike.%${query}%`)
        .limit(6);
      setResultados((data ?? []) as AtletaBusqueda[]);
      setBuscando(false);
    }, 300);
  }, [query, walkIn]);

  // Cargar plan activo al seleccionar alumno
  async function seleccionarAlumno(a: AtletaBusqueda) {
    setAlumno(a);
    setQuery(`${a.nombre} ${a.apellido}`.trim());
    setResultados([]);
    setCargandoPlan(true);
    setPlan(undefined);
    // Tipo por defecto: el de la ficha del alumno (el plan, si lo indica, manda)
    if (a.tipo_sesion === '1:1' || a.tipo_sesion === '2:1') setTipo(a.tipo_sesion);

    const today = new Date().toISOString().slice(0, 10);
    const { data: planesData } = await supabase
      .from('planes')
      .select('id, nombre, total_clases, end_date, modalidad')
      .eq('alumno_id', a.id)
      .gte('end_date', today)
      .order('end_date', { ascending: true })
      .limit(1);

    if (!planesData || planesData.length === 0) {
      setPlan(null);
      setCargandoPlan(false);
      return;
    }

    const p = planesData[0] as {
      id: string; nombre: string; total_clases: number;
      end_date: string; modalidad?: '1:1' | '2:1' | null;
    };

    // Auto-seleccionar tipo según modalidad del plan
    if (p.modalidad === '1:1' || p.modalidad === '2:1') {
      setTipo(p.modalidad);
    }

    const { count } = await supabase
      .from('reservas')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', p.id)
      .in('estado', ESTADOS_QUE_QUEMAN);

    setPlan({ ...p, modalidad: p.modalidad ?? null, usado: count ?? 0 });
    setCargandoPlan(false);
  }

  async function handleSave() {
    setError('');

    if (!walkIn) {
      if (!alumno) { setError('Selecciona un alumno'); return; }
      if (plan === undefined) { setError('Espera, cargando plan...'); return; }
    }

    setSaving(true);
    try {
      // Validar exclusividad de horario para sesiones individuales
      if (tipo !== 'Grupal') {
        const { data: existentes } = await supabase
          .from('reservas')
          .select('tipo_clase')
          .eq('fecha', fecha)
          .eq('hora', hora)
          .eq('coach_id', coachId || null)
          .not('tipo_clase', 'ilike', '%grupal%')
          .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa,no_show)');

        const resultado = validarConflictoTipo(tipo, existentes ?? []);
        if (!resultado.ok) {
          setError(resultado.error!);
          return;
        }
      }

      const tipoClase = tipo === '1:1' ? '1:1 Individual' : tipo === '2:1' ? '2:1 Duo' : 'Grupal';

      if (walkIn) {
        const { error: err } = await supabase.from('reservas').insert({
          fecha,
          hora,
          end_time:     addOneHour(hora),
          coach_id:     coachId || null,
          tipo_clase:   tipoClase,
          rut:          rutWalkIn.trim() || null,
          estado:       'confirmada',
          duracion_min: 60,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('reservas').insert({
          fecha,
          hora,
          end_time:     addOneHour(hora),
          coach_id:     coachId || null,
          tipo_clase:   tipoClase,
          alumno_id:    alumno!.id,
          plan_id:      plan?.id ?? null,
          rut:          alumno!.rut ?? null,
          estado:       'confirmada',
          duracion_min: 60,
        });
        if (err) throw err;
      }

      onSaved(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setSaving(false); }
  }

  const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const puedeAgendar = !saving && (walkIn || (alumno !== null && plan !== undefined));
  const sinPlan      = alumno !== null && !cargandoPlan && plan === null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--nexa-text)' }}>
              Nueva clase · {hora}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>{fechaLabel}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--nexa-muted)' }}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tipo */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--nexa-muted)' }}>Tipo de clase</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['1:1', '2:1'] as TipoClase[]).map(t => (
                <button key={t} onClick={() => setTipo(t)} disabled={!!tipoFijo && t !== tipoFijo}
                  className="rounded-lg py-2 text-[12px] font-semibold transition disabled:opacity-40"
                  style={{
                    background: tipo === t ? 'var(--nexa-accent)' : 'var(--nexa-card-alt)',
                    color:      tipo === t ? '#FFFFFF' : 'var(--nexa-muted)',
                    border:     `1px solid ${tipo === t ? 'var(--nexa-accent)' : 'var(--nexa-border)'}`,
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {tipoFijo && (
            <p className="-mt-2 text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
              Se suma como segundo alumno a este horario {tipoFijo}.
            </p>
          )}

          {/* Coach (fijo al sumar un alumno a un horario existente) */}
          {coaches.length > 0 && !tipoFijo && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--nexa-muted)' }}>Coach</p>
              <select value={coachId} onChange={e => setCoachId(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                style={{
                  background: 'var(--nexa-card-alt)',
                  border:     '1px solid var(--nexa-border)',
                  color:      'var(--nexa-text)',
                }}>
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Alumno o Walk-in */}
          {!walkIn ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--nexa-muted)' }}>Alumno</p>
              <div className="relative">
                <input
                  value={query}
                  onChange={e => { setQuery(e.target.value); setAlumno(null); setPlan(undefined); }}
                  placeholder="Buscar por nombre o RUT..."
                  autoFocus
                  className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                  style={{
                    background: 'var(--nexa-card-alt)',
                    border:     '1px solid var(--nexa-border)',
                    color:      'var(--nexa-text)',
                  }}
                />
                {resultados.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-10"
                    style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                    {resultados.map(a => (
                      <button key={a.id} onClick={() => seleccionarAlumno(a)}
                        className="w-full text-left px-4 py-2.5 text-[13px] transition"
                        style={{ color: 'var(--nexa-text)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--nexa-card-alt)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        {a.nombre} {a.apellido}
                        {a.rut && <span className="ml-2 text-[11px]" style={{ color: 'var(--nexa-muted)' }}>{a.rut}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {buscando && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--nexa-muted)' }}>Buscando...</p>
                )}
              </div>

              {/* Estado del plan */}
              {alumno && cargandoPlan && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--nexa-muted)' }}>Cargando plan...</p>
              )}
              {alumno && !cargandoPlan && plan && (
                <div className="mt-2 rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)' }}>
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-semibold" style={{ color: 'var(--nexa-text)' }}>{plan.nombre}</p>
                    {plan.modalidad && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'var(--nexa-accent)', color: '#fff' }}>
                        {plan.modalidad}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>
                    {plan.usado}/{plan.total_clases} clases usadas · vence {new Date(plan.end_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              )}
              {sinPlan && (
                <div className="mt-2 rounded-lg px-3 py-2.5"
                  style={{ background: '#C9A96E18', border: '1px solid #C9A96E66' }}>
                  <p className="text-[12px] font-semibold" style={{ color: '#C9A96E' }}>
                    Sin plan activo — esta clase no descontará del plan
                  </p>
                </div>
              )}

              <button onClick={() => { setWalkIn(true); setAlumno(null); setQuery(''); setPlan(undefined); setResultados([]); }}
                className="mt-3 text-[11px] underline"
                style={{ color: 'var(--nexa-muted)' }}>
                Agendar como invitado / sin buscar alumno →
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nexa-muted)' }}>
                  Invitado / Walk-in
                </p>
                <button onClick={() => { setWalkIn(false); setRutWalkIn(''); }}
                  className="text-[11px] underline" style={{ color: 'var(--nexa-muted)' }}>
                  ← Buscar alumno
                </button>
              </div>
              <div className="mb-3 rounded-lg px-3 py-2"
                style={{ background: '#C9A96E18', border: '1px solid #C9A96E66' }}>
                <p className="text-[11px]" style={{ color: '#C9A96E' }}>Esta clase no descontará de ningún plan</p>
              </div>
              <input
                value={rutWalkIn}
                onChange={e => setRutWalkIn(e.target.value)}
                placeholder="RUT del invitado (opcional)"
                autoFocus
                className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
              />
            </div>
          )}

          {error && <p className="text-[11px]" style={{ color: '#B44040' }}>{error}</p>}
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-[12px] font-semibold"
            style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!puedeAgendar}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold transition"
            style={{
              background: sinPlan || walkIn ? '#C9A96E' : 'var(--nexa-accent)',
              color:      '#FFFFFF',
              opacity:    puedeAgendar ? 1 : 0.4,
            }}>
            {saving ? 'Guardando...' : sinPlan ? 'Agendar sin plan' : walkIn ? 'Agendar invitado' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Celda ────────────────────────────────────────────────────────────────────

function SlotCard({ slot, coachColor, coachNombre, onClickSlot, isPast }: {
  slot:        Slot;
  coachColor:  string;
  coachNombre: string;
  onClickSlot: (s: Slot) => void;
  isPast:      boolean;
}) {
  const cuposUsados  = slot.alumnos.filter(a => esActiva(a.status)).length;
  const cuposFull    = cuposUsados >= slot.cuposTotal;
  const hayConflicto = cuposUsados > slot.cuposTotal;

  return (
    <div
      onClick={() => onClickSlot(slot)}
      style={{
        padding:      '3px 4px',
        background:   hayConflicto ? 'rgba(180,64,64,0.10)' : coachColor ? coachColor + '18' : 'var(--nexa-card-alt)',
        borderLeft:   `2px solid ${hayConflicto ? '#B44040' : coachColor || 'var(--nexa-muted)'}`,
        borderRadius: 2,
        cursor:       'pointer',
        opacity:      isPast ? 0.55 : 1,
      }}
    >
      {hayConflicto && (
        <div style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
          color: '#B44040', textTransform: 'uppercase', lineHeight: 1.3, marginBottom: 2,
        }}>
          ⚠ Conflicto horario
        </div>
      )}
      {slot.alumnos.slice(0, 2).map((a, i) => (
        <div key={i} style={{
          fontSize: 10, fontWeight: 600,
          color: statusColor(a.status),
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.35,
        }}>
          {a.nombre}
        </div>
      ))}
      {slot.alumnos.length > 2 && (
        <div style={{ fontSize: 9, color: 'var(--nexa-muted)', lineHeight: 1.3 }}>
          +{slot.alumnos.length - 2} más
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 9, color: 'var(--nexa-muted)', flexShrink: 0 }}>{slot.tipo}</span>
        {coachNombre && (
          <span style={{
            fontSize: 9, color: coachColor ? coachColor + 'aa' : 'var(--nexa-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            · {coachNombre.split(' ')[0]}
          </span>
        )}
        <span style={{
          fontSize: 9, marginLeft: 'auto', flexShrink: 0,
          color: cuposFull ? 'var(--nexa-danger)' : 'var(--nexa-muted)',
        }}>
          {cuposUsados}/{slot.cuposTotal}
        </span>
      </div>
    </div>
  );
}

function HorarioCelda({ slots, coachById, isPast, onClickSlot, onClickEmpty, isCerrado, bloqueado, motivoBloqueo }: {
  slots:         Slot[];
  coachById:     Map<string, { color: string; nombre: string }>;
  isPast:        boolean;
  onClickSlot:   (s: Slot) => void;
  onClickEmpty:  () => void;
  isCerrado:     boolean;
  bloqueado:     boolean;
  motivoBloqueo?: string;
}) {
  const [hover, setHover] = useState(false);

  if (slots.length === 0) {
    if (isCerrado) {
      return (
        <div style={{
          minHeight: 52,
          borderRight: '1px solid var(--nexa-border)',
          borderBottom: '1px solid var(--nexa-border-sub)',
          background: 'var(--nexa-surface)',
          cursor: 'default',
        }} />
      );
    }
    if (bloqueado) {
      return (
        <div style={{
          minHeight: 60,
          borderRight: '1px solid var(--nexa-border)',
          borderBottom: '1px solid var(--nexa-border-sub)',
          background: 'var(--nexa-danger-bg)',
          cursor: 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 8, color: 'var(--nexa-danger)', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', padding: '0 4px',
            opacity: 0.7,
          }}>
            {motivoBloqueo || 'Bloqueado'}
          </span>
        </div>
      );
    }
    return (
      <div
        style={{
          position: 'relative', minHeight: 52,
          borderRight: '1px solid var(--nexa-border)',
          borderBottom: '1px solid var(--nexa-border-sub)',
          background: hover && !isPast ? 'var(--nexa-card)' : 'var(--nexa-bg)',
          opacity: isPast ? 0.4 : 1,
          cursor: isPast ? 'default' : 'pointer',
          transition: 'background 0.12s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={() => !isPast && setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => !isPast && onClickEmpty()}
      >
        {hover && !isPast && <Plus size={14} style={{ color: 'var(--nexa-faint)' }} />}
      </div>
    );
  }

  return (
    <div style={{
      borderRight:  '1px solid var(--nexa-border)',
      borderBottom: '1px solid var(--nexa-border-sub)',
      background:   'var(--nexa-bg)',
      display:      'flex',
      flexDirection: 'column',
      gap:          2,
      padding:      3,
      minHeight:    52,
    }}>
      {slots.map((slot, idx) => {
        const coach = slot.coachId ? coachById.get(slot.coachId) : undefined;
        return (
          <SlotCard
            key={idx}
            slot={slot}
            coachColor={coach?.color ?? ''}
            coachNombre={coach?.nombre ?? ''}
            onClickSlot={onClickSlot}
            isPast={isPast}
          />
        );
      })}
    </div>
  );
}

// ─── Barra resumen ────────────────────────────────────────────────────────────

function ResumenBar({ coaches, reservas }: { coaches: Coach[]; reservas: RawReserva[] }) {
  if (!coaches.length) return null;

  return (
    <div style={{
      display:    'flex',
      gap:        1,
      background: 'var(--nexa-border)',
      border:     '1px solid var(--nexa-border)',
      borderTop:  '2px solid var(--nexa-border)',
    }}>
      {coaches.map((c, i) => {
        const color = c.color || COACH_COLORS[i % COACH_COLORS.length];

        // Agrupar las reservas del coach por sesión real (fecha+hora), no por
        // fila: una clase 2:1 genera 2 filas (una por alumno) y antes se
        // pagaba y contaba dos veces la misma sesión.
        const sesiones = new Map<string, RawReserva[]>();
        for (const r of reservas) {
          if (r.coach_id !== c.id) continue;
          const pos = getSlotPos(r);
          if (!pos) continue;
          const key = `${pos.fecha}|${pos.hora}`;
          if (!sesiones.has(key)) sesiones.set(key, []);
          sesiones.get(key)!.push(r);
        }

        let n1a1        = 0;
        let n2a1Completa = 0;
        let n2a1Incompleta = 0;
        let nGrupal     = 0;
        let pago        = 0;
        sesiones.forEach(filas => {
          // Solo se paga por sesiones ya realizadas (presente / no-show /
          // cancelada tarde = "queman" la clase). Pendientes, futuras o
          // canceladas a tiempo no cuentan para el pago.
          const realizadas = filas.filter(r => ESTADOS_QUE_QUEMAN.includes(String(r.estado)));
          if (realizadas.length === 0) return;

          const tipos = filas.map(r => parseTipo(r.tipo_clase, r.descripcion));
          if (tipos.includes('2:1')) {
            // 2:1 con ambos alumnos presentes paga tarifa2; con solo uno,
            // tarifa incompleta (nunca se paga dos veces la misma sesión).
            if (realizadas.length >= 2) { n2a1Completa += 1; pago += c.tarifa_2a1; }
            else                        { n2a1Incompleta += 1; pago += c.tarifa_incompleta_2a1; }
          } else if (tipos.includes('Grupal')) {
            nGrupal += 1;
          } else {
            n1a1 += 1;
            pago += c.tarifa_1a1;
          }
        });
        const clases = n1a1 + n2a1Completa + n2a1Incompleta + nGrupal;
        const desglose: { label: string; n: number; color: string }[] = [
          { label: '1:1',              n: n1a1,           color: 'var(--nexa-text)' },
          { label: '2:1 completas',    n: n2a1Completa,   color: '#2E7D55' },
          { label: '2:1 incompletas',  n: n2a1Incompleta, color: '#B8860B' },
          ...(nGrupal > 0 ? [{ label: 'grupales', n: nGrupal, color: 'var(--nexa-text)' }] : []),
        ];

        return (
          <div key={c.id} style={{
            flex:       1,
            padding:    '10px 14px',
            background: 'var(--nexa-card)',
            display:    'flex',
            alignItems: 'center',
            gap:        12,
          }}>
            <div style={{
              width: 3, height: 28, background: color, borderRadius: 2, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, color,
                textTransform: 'capitalize', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {c.nombre}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2, marginTop: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--nexa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span style={{ fontSize: 16, fontWeight: 300, color: '#2E7D55', marginRight: 3 }}>{clases}</span>
                  clases
                </span>
                {desglose.map(d => (
                  <span key={d.label} style={{ fontSize: 9, color: 'var(--nexa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 400, color: d.n > 0 ? d.color : 'var(--nexa-muted)', marginRight: 3 }}>{d.n}</span>
                    {d.label}
                  </span>
                ))}
                {pago > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--nexa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <span style={{ fontSize: 13, fontWeight: 300, color: 'var(--nexa-accent)', marginRight: 2 }}>
                      ${pago.toLocaleString('es-CL')}
                    </span>
                    pago
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function HorarioPage() {
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [coachFiltro, setCoachFiltro] = useState<string>('all');
  const [coaches,     setCoaches]     = useState<Coach[]>([]);
  const [reservas,    setReservas]    = useState<RawReserva[]>([]);
  const [horConfig,   setHorConfig]   = useState<HorarioConfig>(DEFAULT_HORARIO_CONFIG);
  const [bloqueos,    setBloqueos]    = useState<HorarioBloqueo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [vista,       setVista]       = useState<'horario' | 'checkin'>('horario');
  const [rol,         setRol]         = useState<string | null>(null);
  const [editSlot,    setEditSlot]    = useState<Slot | null>(null);
  const [nuevaSlot,   setNuevaSlot]   = useState<{ fecha: string; hora: string; coachId: string | null; tipoFijo?: TipoClase } | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  const monday = getMonday(weekOffset);
  const days   = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const today     = new Date().toISOString().slice(0, 10);
  const now       = new Date();
  const weekLabel = `${fmtLabel(days[0])} — ${fmtLabel(days[5])}`;

  // Mapa de coaches por id
  const coachById = new Map(
    coaches.map((c, i) => [c.id, { ...c, color: c.color || COACH_COLORS[i % COACH_COLORS.length] }])
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = dateStr(days[0]);
      const weekEnd   = dateStr(days[5]);
      const [cs, cfg, bls, { data: resData }, { data: atletasData }] = await Promise.all([
        getCoachesActivosDB(),
        getHorarioConfig(),
        getBloqueos(weekStart, weekEnd),
        supabase
          .from('reservas')
          .select('*, atletas(nombre, apellido)')
          .gte('fecha', weekStart)
          .lte('fecha', weekEnd)
          .order('fecha'),
        supabase
          .from('atletas')
          .select('rut, nombre, apellido')
          .not('rut', 'is', null),
      ]);
      const rutMap = new Map<string, string>(
        ((atletasData ?? []) as { rut: string; nombre: string; apellido: string }[])
          .map(a => [a.rut, `${a.nombre} ${a.apellido || ''}`.trim()])
      );
      const reservasConNombre = ((resData ?? []) as RawReserva[]).map(r => {
        const atleta = r.atletas;
        const nombre_atleta = atleta
          ? `${atleta.nombre} ${atleta.apellido || ''}`.trim()
          : (r.rut ? rutMap.get(r.rut) : undefined);
        return { ...r, nombre_atleta };
      });
      setCoaches(cs);
      setHorConfig(cfg);
      setBloqueos(bls);
      setReservas(reservasConNombre);
    } catch (err) {
      console.error('horario load error', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.rpc('get_my_role').then(({ data }: { data: unknown }) => setRol(data as string | null));
  }, []);

  // Recargar cuando el usuario vuelve a esta pestaña (p.ej. después de check-in)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Scroll automático a la hora actual en la semana corriente
  useEffect(() => {
    if (loading || weekOffset !== 0 || !gridRef.current) return;
    const nowHour   = `${String(now.getHours()).padStart(2, '0')}:00`;
    const targetH   = showHours.find(h => h >= nowHour) ?? showHours[0];
    const headerH   = 40;
    const rowH      = 60;
    const rowIndex  = showHours.indexOf(targetH);
    if (rowIndex >= 0) {
      gridRef.current.scrollTop = Math.max(0, rowIndex * rowH - headerH);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Horas del config para los días de esta semana
  const configHoursSet = new Set<string>();
  days.forEach(d => {
    const diaConfig = horConfig.dias.find(x => x.dow === d.getDay());
    if (!diaConfig?.abierto) return;
    generateHours(diaConfig.apertura, diaConfig.cierre, horConfig.duracionBloque)
      .forEach(h => configHoursSet.add(h));
  });

  const slotMap    = buildSlotMap(reservas, coachFiltro, horConfig.capacidadGrupal);
  const extraHours = new Set<string>();
  slotMap.forEach((_, key) => {
    const h = key.split('|')[1];
    if (!configHoursSet.has(h)) extraHours.add(h);
  });
  const showHours = [...configHoursSet, ...extraHours].sort();

  // Conteo de horas únicas con clases por día (ignora dimensión coach en la clave)
  function clasesEnDia(ds: string): number {
    const horas = new Set<string>();
    slotMap.forEach((_, key) => {
      const [f, h] = key.split('|');
      if (f === ds) horas.add(h);
    });
    return horas.size;
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">

        {/* Encabezado */}
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              {vista === 'horario' ? 'HORARIO' : 'CHECK-IN'}
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              {vista === 'horario' ? 'Clic en clase para editar · clic en celda vacía para agendar' : 'Clases individuales de hoy'}
            </p>
          </div>

          {/* Switcher Horario / Check-in (solo admin y recepcionista) */}
          {rol !== 'profesor' && (
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
              <button
                onClick={() => setVista('horario')}
                className="rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition"
                style={{ background: vista === 'horario' ? 'var(--nexa-text)' : 'transparent', color: vista === 'horario' ? 'var(--nexa-bg)' : 'var(--nexa-muted)' }}
              >
                Horario
              </button>
              <button
                onClick={() => setVista('checkin')}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition"
                style={{ background: vista === 'checkin' ? 'var(--nexa-text)' : 'transparent', color: vista === 'checkin' ? 'var(--nexa-bg)' : 'var(--nexa-muted)' }}
              >
                <ClipboardCheck size={12} /> Check-in
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition"
              style={{
                background: weekOffset === 0 ? 'var(--nexa-text)' : 'var(--nexa-card)',
                color:      weekOffset === 0 ? 'var(--nexa-bg)' : 'var(--nexa-muted)',
                border:     weekOffset === 0 ? '1px solid var(--nexa-text)' : '1px solid var(--nexa-border)',
              }}
            >
              Hoy
            </button>
            <div className="flex items-center gap-1 rounded-lg border px-1"
              style={{ borderColor: 'var(--nexa-border)', background: 'var(--nexa-card)' }}>
              <button onClick={() => setWeekOffset(o => o - 1)}
                className="rounded p-1.5" style={{ color: 'var(--nexa-muted)' }}>
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-[130px] text-center text-[12px] font-medium" style={{ color: 'var(--nexa-text)' }}>
                {weekLabel}
              </span>
              <button onClick={() => setWeekOffset(o => o + 1)}
                className="rounded p-1.5" style={{ color: 'var(--nexa-muted)' }}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Vista Check-in */}
        {vista === 'checkin' && <CheckinTab />}

        {/* Vista Horario */}
        {vista === 'horario' && <>

        {/* Pestañas coach */}
        <div className="flex gap-0 overflow-x-auto" style={{ borderBottom: '2px solid var(--nexa-border)' }}>
          <button onClick={() => setCoachFiltro('all')}
            className="shrink-0 px-4 py-2.5 text-[12px] font-semibold transition"
            style={{
              color:        coachFiltro === 'all' ? 'var(--nexa-text)' : 'var(--nexa-muted)',
              borderBottom: coachFiltro === 'all' ? '2px solid var(--nexa-accent)' : '2px solid transparent',
              marginBottom: -2,
            }}>
            TODOS
          </button>
          {coaches.map((c, idx) => {
            const active = coachFiltro === c.id;
            const color  = c.color || COACH_COLORS[idx % COACH_COLORS.length];
            return (
              <button key={c.id} onClick={() => setCoachFiltro(c.id)}
                className="shrink-0 px-4 py-2.5 text-[12px] font-semibold transition"
                style={{
                  color:        active ? color : 'var(--nexa-muted)',
                  borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
                  marginBottom: -2,
                }}>
                {c.nombre.split(' ')[0].toUpperCase()}
              </button>
            );
          })}
        </div>

        {loading ? (
          /* Skeleton */
          <div style={{ border: '1px solid var(--nexa-border)', borderTop: 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(6, 1fr)', minWidth: 340 }}>
              <div style={{ height: 36, background: 'var(--nexa-card-alt)', borderRight: '1px solid var(--nexa-border)', borderBottom: '1px solid var(--nexa-border)' }} />
              {DAY_LABELS.map(d => (
                <div key={d} style={{ height: 36, background: 'var(--nexa-card)', borderRight: '1px solid var(--nexa-border)', borderBottom: '1px solid var(--nexa-border)' }} />
              ))}
              {['06:00','07:00','08:00','09:00','10:00','11:00'].map(h => (
                <Fragment key={h}>
                  <div style={{ height: 52, background: 'var(--nexa-card-alt)', borderRight: '1px solid var(--nexa-border)', borderBottom: '1px solid var(--nexa-border-sub)' }} />
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} style={{
                      height: 52, borderRight: '1px solid var(--nexa-border)',
                      borderBottom: '1px solid var(--nexa-border-sub)',
                      background: 'var(--nexa-bg)',
                    }} />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Grid — siempre visible, compacto en mobile */}
            <div>
              <div
                ref={gridRef}
                style={{
                  overflowX:  'auto',
                  overflowY:  'auto',
                  maxHeight:  'calc(100vh - 180px)',
                  border:     '1px solid var(--nexa-border)',
                  borderTop:  'none',
                }}
              >
                <div style={{
                  display:             'grid',
                  gridTemplateColumns: '36px repeat(6, 1fr)',
                  minWidth:            340,
                }}>
                  {/* Corner sticky */}
                  <div style={{
                    position:     'sticky', top: 0, left: 0, zIndex: 4,
                    height:       36, background: 'var(--nexa-card-alt)',
                    borderRight:  '1px solid var(--nexa-border)',
                    borderBottom: '1px solid var(--nexa-border)',
                    display:      'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 7, color: 'var(--nexa-muted)', letterSpacing: '0.05em',
                  }}>
                    HR
                  </div>

                  {/* Day headers sticky */}
                  {days.map((d, i) => {
                    const ds          = dateStr(d);
                    const isT         = ds === today;
                    const nClases     = clasesEnDia(ds);
                    const diaConfig   = horConfig.dias.find(x => x.dow === d.getDay());
                    const esCerrado   = !diaConfig?.abierto;
                    return (
                      <div key={i} style={{
                        position:     'sticky', top: 0, zIndex: 3,
                        height:       36,
                        background:   esCerrado ? 'var(--nexa-surface)' : 'var(--nexa-card)',
                        borderRight:  '1px solid var(--nexa-border)',
                        borderBottom: '1px solid var(--nexa-border)',
                        display:      'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <span style={{
                            fontSize: 8, letterSpacing: '0.06em', fontWeight: 600,
                            color: esCerrado ? 'var(--nexa-faint)' : 'var(--nexa-muted)',
                          }}>
                            {DAY_LABELS[i]}
                          </span>
                          {isT ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 18, height: 18, borderRadius: '50%',
                              background: 'var(--nexa-text)', color: 'var(--nexa-bg)',
                              fontSize: 10, fontWeight: 800,
                            }}>
                              {d.getDate()}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 10, fontWeight: 400,
                              color: esCerrado ? 'var(--nexa-muted)' : 'var(--nexa-text-sub)',
                            }}>
                              {d.getDate()}
                            </span>
                          )}
                          {nClases > 0 && (
                            <span style={{
                              fontSize: 7, fontWeight: 700,
                              background: 'var(--nexa-success-bg)',
                              color: 'var(--nexa-success)',
                              borderRadius: 3,
                              padding: '0px 3px',
                            }}>
                              {nClases}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Filas */}
                  {showHours.map(hora => (
                    <Fragment key={hora}>
                      {/* Hora sticky izquierda */}
                      <div style={{
                        position:     'sticky', left: 0, zIndex: 2,
                        background:   'var(--nexa-card-alt)',
                        borderRight:  '1px solid var(--nexa-border)',
                        borderBottom: '1px solid var(--nexa-border-sub)',
                        display:      'flex', alignItems: 'center', justifyContent: 'center',
                        padding:      '0 2px', fontSize: 8, color: 'var(--nexa-muted)', minHeight: 52,
                        textAlign:    'center',
                      }}>
                        {hora.slice(0, 5)}
                      </div>

                      {/* Celdas */}
                      {days.map((d, di) => {
                        const ds        = dateStr(d);
                        const slots     = getSlotsForCell(slotMap, ds, hora);
                        const isPast    = new Date(`${ds}T${hora}:00`) < now;
                        const diaConfig = horConfig.dias.find(x => x.dow === d.getDay());
                        const esCerrado = !diaConfig?.abierto ||
                          hora < (diaConfig?.apertura ?? '00:00') ||
                          hora > (diaConfig?.cierre   ?? '23:59');
                        const bloqueo   = bloqueos.find(b => {
                          if (b.fecha !== ds) return false;
                          if (!b.horaInicio) return true;
                          return hora >= b.horaInicio && hora < (b.horaFin ?? '23:59');
                        });
                        return (
                          <HorarioCelda
                            key={`${hora}-${di}`}
                            slots={slots}
                            coachById={coachById}
                            isPast={isPast}
                            isCerrado={slots.length === 0 && esCerrado}
                            bloqueado={slots.length === 0 && !!bloqueo}
                            motivoBloqueo={bloqueo?.motivo}
                            onClickSlot={s => setEditSlot(s)}
                            onClickEmpty={() => {
                              if (bloqueo) {
                                const msg = bloqueo.motivo ? `Día bloqueado: ${bloqueo.motivo}` : 'Este día está bloqueado';
                                setToast(msg);
                                setTimeout(() => setToast(null), 3000);
                                return;
                              }
                              setNuevaSlot({
                                fecha:   ds,
                                hora,
                                coachId: coachFiltro !== 'all' ? coachFiltro : (coaches[0]?.id ?? null),
                              });
                            }}
                          />
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* Barra resumen */}
              <ResumenBar coaches={coaches} reservas={reservas} />
            </div>

          </>
        )}

      {/* Modal editar asistencia */}
      {editSlot && (
        <EditModal
          slot={editSlot}
          coachNombre={editSlot.coachId ? (coachById.get(editSlot.coachId)?.nombre ?? '') : ''}
          isPast={editSlot.fecha < today}
          onClose={() => setEditSlot(null)}
          onSaved={load}
          onAgregar={() => {
            setNuevaSlot({ fecha: editSlot.fecha, hora: editSlot.hora, coachId: editSlot.coachId, tipoFijo: '2:1' });
            setEditSlot(null);
          }}
        />
      )}

      {/* Modal nueva sesión */}
      {nuevaSlot && (
        <NuevaSesionModal
          fecha={nuevaSlot.fecha}
          hora={nuevaSlot.hora}
          coaches={coaches}
          defaultCoachId={nuevaSlot.coachId}
          tipoFijo={nuevaSlot.tipoFijo}
          onClose={() => setNuevaSlot(null)}
          onSaved={load}
        />
      )}

        </>}

      </div>

      {/* Toast aviso día bloqueado */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            padding: '10px 20px', borderRadius: 8, zIndex: 200, whiteSpace: 'nowrap',
            background: 'var(--nexa-danger)', color: '#fff',
            fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
    </main>
  );
}
