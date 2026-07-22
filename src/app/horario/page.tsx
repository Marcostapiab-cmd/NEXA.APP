'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getCoachesActivosDB, type Coach } from '@/lib/coaches-supabase';

// ─── Constantes ───────────────────────────────────────────────────────────────

const HOR_HOURS = [
  '06:00','07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','17:00','18:00','19:00','20:00','21:00',
];
const DAY_LABELS     = ['LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const CAPACIDAD_GRUPAL = 12;
const COACH_COLORS   = ['#C9A96E','#5B9BD5','#70AD47','#ED7D31','#A5A5A5','#FFC000'];

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoClase = '1:1' | '2:1' | 'Grupal';

interface Alumno {
  reservaId: number | string;
  nombre:    string;
  status:    string;
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
  id:                 number | string;
  rut?:               string;
  alumno_id?:         string;
  plan_id?:           string;
  fecha:              string;
  hora?:              string;
  coach_id?:          string;
  tipo_clase?:        string;
  descripcion?:       string;
  attendance_status?: string;
  estado?:            string;
  admin_note?:        string;
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

function getCupos(tipo: TipoClase): number {
  if (tipo === '1:1') return 1;
  if (tipo === '2:1') return 2;
  return CAPACIDAD_GRUPAL;
}

function alumnoLabel(r: RawReserva): string {
  if (r.rut)       return r.rut;
  if (r.alumno_id) return `ID ${r.alumno_id.slice(0, 8)}`;
  return 'Alumno';
}

function statusColor(s: string): string {
  const l = (s || '').toLowerCase();
  if (l === 'present'  || l === 'presente')         return '#2E7D55';
  if (l === 'absent_no_notice' || l === 'no_show')  return '#B44040';
  if (l.startsWith('cancelad'))                      return '#555555';
  return '#C9A96E';
}

function statusLabel(s: string): string {
  const l = (s || '').toLowerCase();
  if (l === 'present'  || l === 'presente')         return 'Presente';
  if (l === 'absent_no_notice' || l === 'no_show')  return 'No se presentó';
  if (l.startsWith('cancelad'))                      return 'Cancelada';
  return 'Pendiente';
}

function buildSlotMap(reservas: RawReserva[], coachFiltro: string): Map<string, Slot> {
  const map = new Map<string, Slot>();
  for (const r of reservas) {
    const pos = getSlotPos(r);
    if (!pos) continue;
    const coachId = r.coach_id ? String(r.coach_id) : null;
    if (coachFiltro !== 'all' && coachId !== coachFiltro) continue;
    const key  = `${pos.fecha}|${pos.hora}`;
    const tipo = parseTipo(r.tipo_clase, r.descripcion);
    if (!map.has(key)) {
      map.set(key, {
        fecha: pos.fecha, hora: pos.hora, coachId, tipo,
        alumnos: [], cuposTotal: getCupos(tipo),
        estado: String(r.estado || 'pendiente'),
      });
    }
    map.get(key)!.alumnos.push({
      reservaId: r.id,
      nombre:    alumnoLabel(r),
      status:    String(r.attendance_status || r.estado || 'pendiente'),
    });
  }
  return map;
}

// ─── Estados de asistencia disponibles ───────────────────────────────────────

const ESTADOS_ASISTENCIA = [
  { value: 'PRESENT',          label: 'Presente',        color: '#2E7D55' },
  { value: 'ABSENT_NO_NOTICE', label: 'No se presentó',  color: '#B44040' },
  { value: 'pendiente',        label: 'Pendiente',       color: '#C9A96E' },
  { value: 'cancelada',        label: 'Cancelada',       color: '#555555' },
];

// ─── Modal de edición ─────────────────────────────────────────────────────────

function EditModal({
  slot, onClose, onSaved,
}: {
  slot:    Slot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [alumnos, setAlumnos] = useState<Alumno[]>(slot.alumnos);
  const [saving,  setSaving]  = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      for (const a of alumnos) {
        await supabase
          .from('reservas')
          .update({ attendance_status: a.status, estado: a.status === 'cancelada' ? 'cancelada' : 'confirmada' })
          .eq('id', a.reservaId);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error('error guardando asistencia', err);
    } finally {
      setSaving(false);
    }
  }

  function setStatus(reservaId: number | string, status: string) {
    setAlumnos(prev => prev.map(a => a.reservaId === reservaId ? { ...a, status } : a));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--nexa-text)' }}>
              {slot.hora} · {slot.tipo}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>
              {new Date(slot.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--nexa-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Alumnos */}
        <div className="p-4 space-y-4">
          {alumnos.map(a => (
            <div key={String(a.reservaId)}>
              <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--nexa-text)' }}>
                {a.nombre}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ESTADOS_ASISTENCIA.map(e => {
                  const active = a.status === e.value;
                  return (
                    <button
                      key={e.value}
                      onClick={() => setStatus(a.reservaId, e.value)}
                      className="rounded-lg px-3 py-2 text-[11px] font-semibold transition"
                      style={{
                        background: active ? e.color + '22' : 'var(--nexa-card-alt)',
                        border:     `1px solid ${active ? e.color : 'var(--nexa-border)'}`,
                        color:      active ? e.color : 'var(--nexa-muted)',
                      }}
                    >
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold transition"
            style={{
              background: 'var(--nexa-accent)',
              color:      '#000',
              opacity:    saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Celda ────────────────────────────────────────────────────────────────────

function HorarioCelda({
  slot, isPast, isToday, onClick,
}: {
  slot:    Slot | null;
  isPast:  boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  const baseStyle: React.CSSProperties = {
    position:     'relative',
    minHeight:    60,
    borderRight:  '1px solid var(--nexa-border)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    background:   isToday ? 'rgba(201,169,110,0.03)' : 'var(--nexa-black)',
    opacity:      isPast ? 0.45 : 1,
    cursor:       slot ? 'pointer' : 'default',
    transition:   'background 0.15s',
  };

  if (!slot) {
    return (
      <div
        style={baseStyle}
        onMouseEnter={e => {
          if (!isPast) (e.currentTarget as HTMLElement).style.background = 'rgba(201,169,110,0.04)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(201,169,110,0.03)' : 'var(--nexa-black)';
        }}
      />
    );
  }

  const cuposUsados = slot.alumnos.length;
  const cuposFull   = cuposUsados >= slot.cuposTotal;

  return (
    <div style={baseStyle} onClick={onClick}>
      <div style={{
        position:     'absolute',
        inset:        3,
        padding:      '4px 6px',
        background:   'rgba(30,60,40,0.25)',
        borderLeft:   '3px solid #2E7D55',
        overflow:     'hidden',
        cursor:       'pointer',
        borderRadius: 2,
      }}>
        {slot.alumnos.slice(0, 3).map((a, i) => (
          <div key={i} style={{
            fontSize:     10,
            fontWeight:   600,
            color:        statusColor(a.status),
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            lineHeight:   1.3,
          }}>
            {a.nombre}
          </div>
        ))}
        {slot.alumnos.length > 3 && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
            +{slot.alumnos.length - 3} más
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{slot.tipo}</span>
          <span style={{
            fontSize: 9, marginLeft: 'auto',
            color: cuposFull ? '#B44040' : 'rgba(255,255,255,0.35)',
          }}>
            {cuposUsados}/{slot.cuposTotal}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function HorarioPage() {
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [coachFiltro,  setCoachFiltro]  = useState<string>('all');
  const [coaches,      setCoaches]      = useState<Coach[]>([]);
  const [reservas,     setReservas]     = useState<RawReserva[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [editSlot,     setEditSlot]     = useState<Slot | null>(null);

  const monday = getMonday(weekOffset);
  const days   = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const today     = new Date().toISOString().slice(0, 10);
  const now       = new Date();
  const weekLabel = `${fmtLabel(days[0])} — ${fmtLabel(days[5])}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, { data }] = await Promise.all([
        getCoachesActivosDB(),
        supabase
          .from('reservas')
          .select('*')
          .gte('fecha', dateStr(days[0]) + 'T00:00:00')
          .lte('fecha', dateStr(days[5]) + 'T23:59:59')
          .order('fecha'),
      ]);
      setCoaches(cs);
      setReservas((data ?? []) as RawReserva[]);
    } catch (err) {
      console.error('horario load error', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  const slotMap    = buildSlotMap(reservas, coachFiltro);
  const extraHours = new Set<string>();
  slotMap.forEach((_, key) => {
    const h = key.split('|')[1];
    if (!HOR_HOURS.includes(h)) extraHours.add(h);
  });
  const showHours = [...HOR_HOURS, ...extraHours].sort();

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">

        {/* Encabezado */}
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              HORARIO
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Vista semanal · clic en clase para editar asistencia
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background: weekOffset === 0 ? 'var(--nexa-accent)' : 'var(--nexa-card)',
                color:      weekOffset === 0 ? '#000' : 'var(--nexa-muted)',
                border:     '1px solid var(--nexa-border)',
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
              <span className="min-w-[130px] text-center text-[12px] font-medium"
                style={{ color: 'var(--nexa-text)' }}>
                {weekLabel}
              </span>
              <button onClick={() => setWeekOffset(o => o + 1)}
                className="rounded p-1.5" style={{ color: 'var(--nexa-muted)' }}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Pestañas coach */}
        <div className="flex gap-0 overflow-x-auto" style={{ borderBottom: '2px solid var(--nexa-border)' }}>
          <button
            onClick={() => setCoachFiltro('all')}
            className="shrink-0 px-4 py-2.5 text-[12px] font-semibold"
            style={{
              color:        coachFiltro === 'all' ? 'var(--nexa-text)' : 'var(--nexa-muted)',
              borderBottom: coachFiltro === 'all' ? '2px solid var(--nexa-accent)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            TODOS
          </button>
          {coaches.map((c, idx) => {
            const active = coachFiltro === c.id;
            const color  = COACH_COLORS[idx % COACH_COLORS.length];
            return (
              <button key={c.id} onClick={() => setCoachFiltro(c.id)}
                className="shrink-0 px-4 py-2.5 text-[12px] font-semibold"
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
          <div className="flex items-center justify-center py-24" style={{ color: 'var(--nexa-muted)' }}>
            <span className="text-[13px]">Cargando horario...</span>
          </div>
        ) : (
          <>
            {/* Grid desktop */}
            <div className="hidden overflow-x-auto lg:block"
              style={{ border: '1px solid var(--nexa-border)', borderTop: 'none' }}>
              <div style={{
                display:             'grid',
                gridTemplateColumns: '56px repeat(6, 1fr)',
                minWidth:            700,
              }}>
                {/* Corner */}
                <div style={{
                  height: 40, background: '#0e0e0e',
                  borderRight: '1px solid var(--nexa-border)',
                  borderBottom: '1px solid var(--nexa-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: 'var(--nexa-muted)', letterSpacing: '0.1em',
                }}>
                  HORAS
                </div>

                {/* Day headers */}
                {days.map((d, i) => {
                  const isT = dateStr(d) === today;
                  return (
                    <div key={i} style={{
                      height: 40, background: '#111',
                      borderRight: '1px solid var(--nexa-border)',
                      borderBottom: '1px solid var(--nexa-border)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 1,
                    }}>
                      <span style={{
                        fontSize: 9, letterSpacing: '0.1em', fontWeight: isT ? 700 : 500,
                        color: isT ? 'var(--nexa-accent)' : 'var(--nexa-muted)',
                      }}>
                        {DAY_LABELS[i]}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: isT ? 700 : 400,
                        color: isT ? 'var(--nexa-accent)' : 'var(--nexa-text-sub)',
                      }}>
                        {d.getDate()}
                      </span>
                    </div>
                  );
                })}

                {/* Filas de horas — Fragment con key para evitar warning */}
                {showHours.map(hora => (
                  <Fragment key={hora}>
                    <div style={{
                      background: '#0e0e0e',
                      borderRight: '1px solid var(--nexa-border)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                      padding: '0 8px', fontSize: 9, color: '#555', minHeight: 60,
                    }}>
                      {hora}
                    </div>
                    {days.map((d, di) => {
                      const ds    = dateStr(d);
                      const key   = `${ds}|${hora}`;
                      const slot  = slotMap.get(key) ?? null;
                      const isPast  = new Date(`${ds}T${hora}:00`) < now;
                      const isToday = ds === today;
                      return (
                        <HorarioCelda
                          key={`${hora}-${di}`}
                          slot={slot}
                          isPast={isPast}
                          isToday={isToday}
                          onClick={() => slot && setEditSlot(slot)}
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>

            {/* Lista móvil */}
            <div className="lg:hidden space-y-3 pt-4">
              {days.map((d, di) => {
                const ds       = dateStr(d);
                const isT      = ds === today;
                const daySlots = showHours
                  .map(hora => ({ hora, slot: slotMap.get(`${ds}|${hora}`) ?? null }))
                  .filter(x => x.slot !== null);
                return (
                  <div key={di} style={{
                    border: '1px solid var(--nexa-border)', borderRadius: 8,
                    overflow: 'hidden', background: 'var(--nexa-card)',
                  }}>
                    <div style={{
                      padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
                      borderBottom: '1px solid var(--nexa-border)',
                      background: isT ? 'rgba(201,169,110,0.06)' : 'transparent',
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                        color: isT ? 'var(--nexa-accent)' : 'var(--nexa-text)',
                      }}>
                        {DAY_LABELS[di]} {d.getDate()}
                      </span>
                      {daySlots.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--nexa-muted)' }}>
                          {daySlots.length} clase{daySlots.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {daySlots.length === 0 ? (
                      <div style={{ padding: 12, fontSize: 11, color: 'var(--nexa-muted)', textAlign: 'center' }}>
                        Sin clases
                      </div>
                    ) : (
                      daySlots.map(({ hora, slot }) => (
                        <div key={hora}
                          onClick={() => slot && setEditSlot(slot)}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                            padding: '10px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            cursor: 'pointer',
                          }}>
                          <span style={{ fontSize: 11, color: '#555', minWidth: 40, paddingTop: 1 }}>{hora}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: 'var(--nexa-muted)' }}>{slot!.tipo}</span>
                              <span style={{
                                fontSize: 10,
                                color: slot!.alumnos.length >= slot!.cuposTotal ? '#B44040' : 'var(--nexa-muted)',
                              }}>
                                {slot!.alumnos.length}/{slot!.cuposTotal}
                              </span>
                            </div>
                            {slot!.alumnos.map((a, ai) => (
                              <div key={ai} style={{
                                fontSize: 11, fontWeight: 600,
                                color: statusColor(a.status),
                              }}>
                                {a.nombre}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal de edición */}
      {editSlot && (
        <EditModal
          slot={editSlot}
          onClose={() => setEditSlot(null)}
          onSaved={load}
        />
      )}
    </main>
  );
}
