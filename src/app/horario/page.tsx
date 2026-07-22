'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getCoachesActivosDB, type Coach } from '@/lib/coaches-supabase';

// ─── Constantes ───────────────────────────────────────────────────────────────

const HOR_HOURS = [
  '06:00','07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','17:00','18:00','19:00','20:00','21:00',
];
const DAY_LABELS = ['LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const CAPACIDAD_GRUPAL = 12;

const COACH_COLORS = [
  '#C9A96E','#5B9BD5','#70AD47','#ED7D31','#A5A5A5','#FFC000',
];

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoClase = '1:1' | '2:1' | 'Grupal';

interface Alumno { nombre: string; status: string; }

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
  id:                number | string;
  rut?:              string;
  alumno_id?:        string;
  plan_id?:          string;
  fecha:             string;
  hora?:             string;
  end_time?:         string;
  coach_id?:         string;
  tipo_clase?:       string;
  descripcion?:      string;
  attendance_status?: string;
  estado?:           string;
  admin_note?:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(offset: number): Date {
  const d   = new Date();
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1 + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateStr(d: Date) { return d.toISOString().slice(0, 10); }

function fmtLabel(d: Date) {
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function getSlot(r: RawReserva): { fecha: string; hora: string } | null {
  if (r.hora) return { fecha: String(r.fecha).slice(0, 10), hora: String(r.hora).slice(0, 5) };
  const f = String(r.fecha ?? '');
  if (f.length >= 16 && f.includes('T')) return { fecha: f.slice(0, 10), hora: f.slice(11, 16) };
  return null;
}

function parseTipo(tipoClase?: string, descripcion?: string): TipoClase {
  const s = (tipoClase || descripcion || '').toLowerCase();
  if (s.includes('2:1') || s.includes('duo') || s.includes('dúo')) return '2:1';
  if (s.includes('grupal') || s.includes('group'))                  return 'Grupal';
  return '1:1';
}

function cuposTotal(tipo: TipoClase): number {
  if (tipo === '1:1')    return 1;
  if (tipo === '2:1')    return 2;
  return CAPACIDAD_GRUPAL;
}

function alumnoLabel(r: RawReserva): string {
  if (r.rut) return r.rut;
  if (r.alumno_id) return `ID ${r.alumno_id.slice(0, 8)}`;
  return 'Alumno';
}

function statusColor(s: string): string {
  const l = (s || '').toLowerCase();
  if (l === 'present' || l === 'presente')              return '#2E7D55';
  if (l === 'absent_no_notice' || l === 'no_show')      return '#B44040';
  if (l.startsWith('cancelad'))                         return '#555555';
  return '#C9A96E';
}

function buildSlotMap(reservas: RawReserva[], coachFiltro: string): Map<string, Slot> {
  const map = new Map<string, Slot>();
  for (const r of reservas) {
    const pos = getSlot(r);
    if (!pos) continue;
    const coachId = r.coach_id ? String(r.coach_id) : null;
    if (coachFiltro !== 'all' && coachId !== coachFiltro) continue;

    const key  = `${pos.fecha}|${pos.hora}`;
    const tipo = parseTipo(r.tipo_clase, r.descripcion);

    if (!map.has(key)) {
      map.set(key, {
        fecha: pos.fecha, hora: pos.hora, coachId,
        tipo, alumnos: [], cuposTotal: cuposTotal(tipo),
        estado: String(r.estado || 'pendiente'),
      });
    }
    const slot   = map.get(key)!;
    const status = String(r.attendance_status || r.estado || 'pendiente');
    slot.alumnos.push({ nombre: alumnoLabel(r), status });
  }
  return map;
}

// ─── Componente celda ─────────────────────────────────────────────────────────

function HorarioCelda({
  slot, isPast, isToday, onEmpty,
}: {
  slot:    Slot | null;
  isPast:  boolean;
  isToday: boolean;
  onEmpty: () => void;
}) {
  const baseStyle: React.CSSProperties = {
    position:      'relative',
    minHeight:     60,
    borderRight:   '1px solid var(--nexa-border)',
    borderBottom:  '1px solid rgba(255,255,255,0.04)',
    background:    isToday ? 'rgba(201,169,110,0.03)' : 'var(--nexa-black)',
    opacity:       isPast ? 0.45 : 1,
    cursor:        slot ? 'pointer' : 'default',
    transition:    'background 0.15s',
  };

  if (!slot) {
    return (
      <div
        style={baseStyle}
        onClick={onEmpty}
        onMouseEnter={e => { if (!isPast) (e.currentTarget as HTMLElement).style.background = 'rgba(201,169,110,0.05)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(201,169,110,0.03)' : 'var(--nexa-black)'; }}
      />
    );
  }

  const cuposUsados = slot.alumnos.length;
  const cuposFull   = cuposUsados >= slot.cuposTotal;

  return (
    <div style={baseStyle}>
      <div
        style={{
          position:   'absolute',
          inset:      3,
          padding:    '4px 6px',
          background: 'rgba(30,60,40,0.25)',
          borderLeft: '3px solid #2E7D55',
          overflow:   'hidden',
          cursor:     'pointer',
          borderRadius: 2,
        }}
      >
        {/* Alumnos */}
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

        {/* Tipo + cupos */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        4,
          marginTop:  2,
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
            {slot.tipo}
          </span>
          <span style={{
            fontSize:   9,
            color:      cuposFull ? '#B44040' : 'rgba(255,255,255,0.35)',
            marginLeft: 'auto',
          }}>
            {cuposUsados}/{slot.cuposTotal}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function HorarioPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [coachFiltro, setCoachFiltro] = useState<string>('all');
  const [coaches, setCoaches]  = useState<Coach[]>([]);
  const [reservas, setReservas] = useState<RawReserva[]>([]);
  const [loading, setLoading]  = useState(true);

  // Días de la semana (Lun–Sáb)
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

  // Horas a mostrar: base + horas que tienen reservas
  const slotMap = buildSlotMap(reservas, coachFiltro);
  const extraHours = new Set<string>();
  slotMap.forEach((_, key) => {
    const hora = key.split('|')[1];
    if (!HOR_HOURS.includes(hora)) extraHours.add(hora);
  });
  const showHours = [...HOR_HOURS, ...extraHours].sort();

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">

        {/* ── Encabezado ── */}
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              HORARIO
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Vista semanal del estudio
            </p>
          </div>

          {/* Navegación semanas */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition"
              style={{
                background: weekOffset === 0 ? 'var(--nexa-accent)' : 'var(--nexa-card)',
                color:      weekOffset === 0 ? '#000' : 'var(--nexa-muted)',
                border:     '1px solid var(--nexa-border)',
              }}
            >
              Hoy
            </button>
            <div className="flex items-center gap-1 rounded-lg border px-1" style={{ borderColor: 'var(--nexa-border)', background: 'var(--nexa-card)' }}>
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                className="rounded p-1.5 transition hover:brightness-110"
                style={{ color: 'var(--nexa-muted)' }}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-[130px] text-center text-[12px] font-medium" style={{ color: 'var(--nexa-text)' }}>
                {weekLabel}
              </span>
              <button
                onClick={() => setWeekOffset(o => o + 1)}
                className="rounded p-1.5 transition hover:brightness-110"
                style={{ color: 'var(--nexa-muted)' }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Pestañas de coach ── */}
        <div
          className="mb-0 flex gap-0 overflow-x-auto"
          style={{ borderBottom: '2px solid var(--nexa-border)' }}
        >
          {/* TODOS */}
          <button
            onClick={() => setCoachFiltro('all')}
            className="shrink-0 px-4 py-2.5 text-[12px] font-semibold transition"
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
              <button
                key={c.id}
                onClick={() => setCoachFiltro(c.id)}
                className="shrink-0 px-4 py-2.5 text-[12px] font-semibold transition"
                style={{
                  color:        active ? color : 'var(--nexa-muted)',
                  borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
                  marginBottom: -2,
                }}
              >
                {c.nombre.split(' ')[0].toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* ── Grilla (desktop) ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24" style={{ color: 'var(--nexa-muted)' }}>
            <span className="text-[13px]">Cargando horario...</span>
          </div>
        ) : (
          <>
            {/* Desktop grid */}
            <div className="hidden overflow-x-auto lg:block" style={{ border: '1px solid var(--nexa-border)', borderTop: 'none' }}>
              <div
                style={{
                  display:             'grid',
                  gridTemplateColumns: '56px repeat(6, 1fr)',
                  minWidth:            700,
                }}
              >
                {/* Corner */}
                <div style={{
                  height:       40,
                  background:   '#0e0e0e',
                  borderRight:  '1px solid var(--nexa-border)',
                  borderBottom: '1px solid var(--nexa-border)',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  fontSize:     8,
                  color:        'var(--nexa-muted)',
                  letterSpacing: '0.1em',
                }}>
                  HORAS
                </div>

                {/* Day headers */}
                {days.map((d, i) => {
                  const isT = dateStr(d) === today;
                  return (
                    <div key={i} style={{
                      height:       40,
                      background:   '#111',
                      borderRight:  '1px solid var(--nexa-border)',
                      borderBottom: '1px solid var(--nexa-border)',
                      display:      'flex',
                      flexDirection: 'column',
                      alignItems:   'center',
                      justifyContent: 'center',
                      gap:          1,
                    }}>
                      <span style={{
                        fontSize:      9,
                        color:         isT ? 'var(--nexa-accent)' : 'var(--nexa-muted)',
                        letterSpacing: '0.1em',
                        fontWeight:    isT ? 700 : 500,
                      }}>
                        {DAY_LABELS[i]}
                      </span>
                      <span style={{
                        fontSize:  11,
                        color:     isT ? 'var(--nexa-accent)' : 'var(--nexa-text-sub)',
                        fontWeight: isT ? 700 : 400,
                      }}>
                        {d.getDate()}
                      </span>
                    </div>
                  );
                })}

                {/* Filas de horas */}
                {showHours.map(hora => (
                  <>
                    {/* Etiqueta hora */}
                    <div key={`t-${hora}`} style={{
                      background:   '#0e0e0e',
                      borderRight:  '1px solid var(--nexa-border)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      display:      'flex',
                      alignItems:   'center',
                      justifyContent: 'flex-end',
                      padding:      '0 8px',
                      fontSize:     9,
                      color:        '#555',
                      minHeight:    60,
                    }}>
                      {hora}
                    </div>

                    {/* Celdas */}
                    {days.map((d, di) => {
                      const ds     = dateStr(d);
                      const key    = `${ds}|${hora}`;
                      const slot   = slotMap.get(key) ?? null;
                      const isPast = new Date(`${ds}T${hora}:00`) < now;
                      const isToday = ds === today;
                      return (
                        <HorarioCelda
                          key={`${hora}-${di}`}
                          slot={slot}
                          isPast={isPast}
                          isToday={isToday}
                          onEmpty={() => {}}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
            </div>

            {/* Mobile: lista por día */}
            <div className="lg:hidden space-y-4 pt-4">
              {days.map((d, di) => {
                const ds      = dateStr(d);
                const isT     = ds === today;
                const daySlots = showHours
                  .map(hora => ({ hora, slot: slotMap.get(`${ds}|${hora}`) ?? null }))
                  .filter(x => x.slot !== null);

                return (
                  <div key={di} style={{
                    border:   '1px solid var(--nexa-border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--nexa-card)',
                  }}>
                    {/* Día header */}
                    <div style={{
                      padding:    '8px 12px',
                      borderBottom: '1px solid var(--nexa-border)',
                      background: isT ? 'rgba(201,169,110,0.06)' : 'transparent',
                      display:    'flex',
                      alignItems: 'center',
                      gap:        8,
                    }}>
                      <span style={{
                        fontSize:   11,
                        fontWeight: 700,
                        color:      isT ? 'var(--nexa-accent)' : 'var(--nexa-text)',
                        letterSpacing: '0.1em',
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
                      <div style={{ padding: '12px', fontSize: 11, color: 'var(--nexa-muted)', textAlign: 'center' }}>
                        Sin clases
                      </div>
                    ) : (
                      <div>
                        {daySlots.map(({ hora, slot }) => (
                          <div key={hora} style={{
                            display:      'flex',
                            alignItems:   'flex-start',
                            gap:          12,
                            padding:      '10px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}>
                            <span style={{ fontSize: 11, color: '#555', minWidth: 40, paddingTop: 1 }}>{hora}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--nexa-muted)' }}>{slot!.tipo}</span>
                                <span style={{ fontSize: 10, color: slot!.alumnos.length >= slot!.cuposTotal ? '#B44040' : 'var(--nexa-muted)' }}>
                                  {slot!.alumnos.length}/{slot!.cuposTotal}
                                </span>
                              </div>
                              {slot!.alumnos.map((a, ai) => (
                                <div key={ai} style={{
                                  fontSize:   11,
                                  fontWeight: 600,
                                  color:      statusColor(a.status),
                                }}>
                                  {a.nombre}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
