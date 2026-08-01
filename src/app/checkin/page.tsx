'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, XCircle, X, AlertTriangle, Search,
  User, ChevronRight, Clock, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  getHorarioConfig, DEFAULT_HORARIO_CONFIG, type HorarioConfig,
} from '@/lib/horario-config';
import { COACH_COLORS } from '@/lib/coaches-supabase';

// ─── Estados válidos de reservas ─────────────────────────────────────────────
// pendiente | confirmada | presente | no_show | cancelada_tiempo |
// cancelada_tarde | reagendada | cancelada_nexa | bloqueada

const ESTADOS_QUE_QUEMAN = ['presente', 'no_show', 'cancelada_tarde'] as const;

type EstadoReserva =
  | 'pendiente' | 'confirmada' | 'presente' | 'no_show'
  | 'cancelada_tiempo' | 'cancelada_tarde' | 'reagendada'
  | 'cancelada_nexa' | 'bloqueada';

const ESTADO_LABEL: Record<EstadoReserva, string> = {
  pendiente:        'Pendiente',
  confirmada:       'Confirmada',
  presente:         'Presente',
  no_show:          'No-show',
  cancelada_tiempo: 'Cancelada',
  cancelada_tarde:  'Canc. tarde',
  reagendada:       'Reagendada',
  cancelada_nexa:   'Canc. NEXA',
  bloqueada:        'Bloqueada',
};

const ESTADO_COLOR: Record<EstadoReserva, string> = {
  pendiente:        'var(--nexa-muted)',
  confirmada:       'var(--nexa-text-sub)',
  presente:         'var(--nexa-success)',
  no_show:          'var(--nexa-danger)',
  cancelada_tiempo: 'var(--nexa-faint)',
  cancelada_tarde:  'var(--nexa-danger)',
  reagendada:       'var(--nexa-muted)',
  cancelada_nexa:   'var(--nexa-muted)',
  bloqueada:        'var(--nexa-faint)',
};

const DIAS_CORTO_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES_CORTO_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaludRow {
  enfermedades?: string | null;
  lesiones?: string | null;
  medicamentos?: string | null;
  alergias?: string | null;
}

interface CheckinRow {
  reservaId: string;
  hora: string;
  alumnoId: string | null;
  alumnoNombre: string;
  tieneObsSalud: boolean;
  saludDetalle: string | null;
  coachNombre: string;
  coachColor: string;
  tipoClase: string;
  planId: string | null;
  planTotal: number | null;
  planUsado: number | null;    // calculado de reservas, no de contador guardado
  planFechaFin: string | null;
  estado: EstadoReserva;
}

interface GrupalRow {
  reservaId:   string;
  fecha:       string;
  hora:        string;
  nombre_clase: string;
  alumnoId:    string | null;
  alumnoNombre: string;
  telefono:    string | null;
  email:       string | null;
  estado:      EstadoReserva;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const fin = new Date(dateStr + 'T12:00:00');
  return Math.ceil((fin.getTime() - Date.now()) / 86_400_000);
}

function isCancelOnTime(hora: string, cfg: HorarioConfig): boolean {
  const now = new Date();
  const isAM = hora < cfg.limiteHoraAm;
  if (isAM) {
    const [ch, cm] = cfg.corteCancelacionAm.split(':').map(Number);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(ch, cm, 0, 0);
    return now <= cutoff;
  }
  const [lh, lm] = hora.split(':').map(Number);
  const claseMs = new Date(now);
  claseMs.setHours(lh, lm, 0, 0);
  return now.getTime() <= claseMs.getTime() - cfg.cancelHorasAvisoPm * 3_600_000;
}

function saludLabel(s: SaludRow): string {
  return [s.lesiones, s.enfermedades, s.medicamentos, s.alergias]
    .filter(Boolean).join(' · ');
}

function isTerminal(estado: EstadoReserva): boolean {
  return ['cancelada_tiempo', 'cancelada_tarde', 'cancelada_nexa',
    'bloqueada', 'reagendada'].includes(estado);
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function CheckinCard({
  row, role, cfg, onPresente, onNoShow, onCancel, busy, router,
}: {
  row: CheckinRow;
  role: string;
  cfg: HorarioConfig;
  onPresente: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  busy: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const canAct = !isTerminal(row.estado);
  const hasPlan = row.planId !== null && row.planTotal !== null;
  const restantes = hasPlan ? (row.planTotal! - (row.planUsado ?? 0)) : null;

  const renovar = hasPlan && restantes !== null && restantes <= 0;
  const venceDias = hasPlan && !renovar && row.planFechaFin
    ? daysUntil(row.planFechaFin) : null;
  const venceProximo = venceDias !== null && venceDias >= 0 && venceDias <= 7;

  const saludVisible = ['admin', 'profesor'].includes(role) && row.saludDetalle;
  const saludIconOnly = !['admin', 'profesor'].includes(role) && row.tieneObsSalud;

  const color = ESTADO_COLOR[row.estado];

  return (
    <div style={{
      background: 'var(--nexa-surface)',
      border: '1px solid var(--nexa-border-sub)',
      borderRadius: 10,
      padding: '14px 16px',
      opacity: isTerminal(row.estado) ? 0.55 : 1,
    }}>
      {/* Top row */}
      <div className="flex flex-wrap items-start gap-2">
        <div style={{
          minWidth: 44, paddingTop: 1,
          fontSize: 18, fontWeight: 700,
          color: 'var(--nexa-text)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {row.hora}
        </div>

        <div className="flex-1 min-w-0">
          {/* Nombre + badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--nexa-text)' }}>
              {row.alumnoNombre}
            </span>

            {saludIconOnly && (
              <span title="Tiene observaciones de salud">
                <AlertTriangle size={13} style={{ color: 'var(--nexa-danger)' }} />
              </span>
            )}

            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4,
              background: row.coachColor + '22', color: row.coachColor,
              border: `1px solid ${row.coachColor}44`,
            }}>
              {row.tipoClase}
            </span>

            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4,
              background: color + '18', color,
              border: `1px solid ${color}44`,
            }}>
              {ESTADO_LABEL[row.estado]}
            </span>
          </div>

          {/* Salud detalle */}
          {saludVisible && (
            <p style={{ fontSize: 11, color: 'var(--nexa-danger)', marginTop: 2 }}>
              <AlertTriangle size={10} style={{ display: 'inline', marginRight: 3 }} />
              {row.saludDetalle}
            </p>
          )}

          {/* Coach + plan */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ marginTop: 4 }}>
            {row.coachNombre && (
              <span style={{ fontSize: 12, color: 'var(--nexa-muted)' }}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: row.coachColor, marginRight: 4,
                }} />
                {row.coachNombre}
              </span>
            )}
            {hasPlan && restantes !== null && row.planTotal !== null && (
              <span style={{ fontSize: 12, color: 'var(--nexa-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {restantes}/{row.planTotal} clases
                {row.planFechaFin && (
                  <> · vence {new Date(row.planFechaFin + 'T12:00:00')
                    .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</>
                )}
              </span>
            )}
          </div>

          {/* Alertas */}
          {(renovar || venceProximo) && (
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
              {renovar && (
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                  padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                  background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)',
                  border: '1px solid var(--nexa-danger)',
                }}>RENOVAR</span>
              )}
              {venceProximo && !renovar && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                  background: '#FFF8E1', color: '#B08000', border: '1px solid #E6C300',
                }}>
                  Vence en {venceDias} día{venceDias !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Botones */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
        <button
          disabled={busy || !canAct}
          onClick={onPresente}
          style={{
            fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
            border: '1px solid var(--nexa-border)', cursor: busy ? 'wait' : 'pointer',
            background: row.estado === 'presente' ? 'var(--nexa-success)' : 'var(--nexa-card)',
            color: row.estado === 'presente' ? '#fff' : 'var(--nexa-text-sub)',
            opacity: !canAct ? 0.35 : 1,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <CheckCircle2 size={12} /> Presente
        </button>

        <button
          disabled={busy || !canAct}
          onClick={onNoShow}
          style={{
            fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
            border: '1px solid var(--nexa-border)', cursor: busy ? 'wait' : 'pointer',
            background: row.estado === 'no_show' ? 'var(--nexa-danger)' : 'var(--nexa-card)',
            color: row.estado === 'no_show' ? '#fff' : 'var(--nexa-text-sub)',
            opacity: !canAct ? 0.35 : 1,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <XCircle size={12} /> No-show
        </button>

        {['pendiente', 'confirmada'].includes(row.estado) && (
          <button
            disabled={busy}
            onClick={onCancel}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
              border: '1px solid var(--nexa-border)', cursor: busy ? 'wait' : 'pointer',
              background: 'var(--nexa-card)', color: 'var(--nexa-muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <X size={12} /> Cancelar
          </button>
        )}

        {row.alumnoId && (
          <button
            onClick={() => router.push(`/alumnos/${row.alumnoId}`)}
            style={{
              marginLeft: 'auto', fontSize: 12, fontWeight: 500,
              padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--nexa-border-sub)',
              background: 'transparent', color: 'var(--nexa-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <User size={11} /> Perfil <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinPage() {
  const router = useRouter();

  const [role, setRole]               = useState<string | null>(null);
  const [rows, setRows]               = useState<CheckinRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [cfg, setCfg]                 = useState<HorarioConfig>(DEFAULT_HORARIO_CONFIG);
  const [search, setSearch]           = useState('');
  const [busy, setBusy]               = useState<Set<string>>(new Set());
  const [toast, setToast]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<'individual' | 'grupales'>('individual');
  const [rowsGrupal, setRowsGrupal]   = useState<GrupalRow[]>([]);
  const [loadingGrupal, setLoadingGrupal] = useState(true);
  const [fechaGrupal, setFechaGrupal] = useState(() => new Date().toISOString().slice(0, 10));
  const [busyGrupal, setBusyGrupal]   = useState<Set<string>>(new Set());

  const today = new Date().toISOString().slice(0, 10);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: roleData } = await supabase.rpc('get_my_role');
      const currentRole = roleData as string | null;
      setRole(currentRole);

      if (!currentRole || !['admin', 'profesor', 'recepcionista'].includes(currentRole)) {
        return;
      }

      const [config, { data: resData }, { data: coachesData }] = await Promise.all([
        getHorarioConfig(),
        supabase
          .from('reservas')
          .select(`
            id, hora, estado, alumno_id, rut, plan_id, coach_id, tipo_clase,
            atletas(id, nombre, apellido, tiene_observaciones_salud,
              atletas_salud(enfermedades, lesiones, medicamentos, alergias))
          `)
          .gte('fecha', today)
          .lte('fecha', today)
          .order('hora'),
        supabase.from('coaches').select('id, nombre, color'),
      ]);

      setCfg(config);

      const coachMap = new Map(
        ((coachesData ?? []) as { id: string; nombre: string; color?: string }[])
          .map((c, i) => [c.id, { ...c, color: c.color || COACH_COLORS[i % COACH_COLORS.length] }])
      );

      // Planes: cargar datos y contar clases quemadas por plan desde reservas
      const planIds = [...new Set(
        ((resData ?? []) as Record<string, unknown>[])
          .map(r => r.plan_id as string).filter(Boolean)
      )];

      let planMeta = new Map<string, { total: number; fechaFin: string | null }>();
      let planUsadoMap = new Map<string, number>();

      if (planIds.length > 0) {
        const [{ data: planesData }, { data: reservasTodas }] = await Promise.all([
          supabase.from('planes')
            .select('id, total_clases, end_date')
            .in('id', planIds),
          // Contar reservas que queman clase (fuente de verdad, no el contador guardado)
          supabase.from('reservas')
            .select('plan_id, estado')
            .in('plan_id', planIds)
            .in('estado', [...ESTADOS_QUE_QUEMAN]),
        ]);

        ((planesData ?? []) as { id: string; total_clases: number; end_date: string }[])
          .forEach(p => planMeta.set(p.id, { total: p.total_clases, fechaFin: p.end_date ?? null }));

        ((reservasTodas ?? []) as { plan_id: string; estado: string }[])
          .forEach(r => {
            const c = planUsadoMap.get(r.plan_id) ?? 0;
            planUsadoMap.set(r.plan_id, c + 1);
          });
      }

      // Fallback rut→nombre para reservas sin FK a atletas
      const ruts = ((resData ?? []) as Record<string, unknown>[])
        .filter(r => r.rut && !r.atletas).map(r => String(r.rut));
      let rutMap = new Map<string, string>();
      if (ruts.length > 0) {
        const { data: ad } = await supabase.from('atletas')
          .select('rut, nombre, apellido').in('rut', ruts);
        ((ad ?? []) as { rut: string; nombre: string; apellido?: string }[])
          .forEach(a => rutMap.set(a.rut, `${a.nombre} ${a.apellido || ''}`.trim()));
      }

      const parsed: CheckinRow[] = ((resData ?? []) as Record<string, unknown>[]).map(rv => {
        const atleta = rv.atletas as {
          id?: string; nombre: string; apellido?: string;
          tiene_observaciones_salud?: boolean;
          atletas_salud?: SaludRow | SaludRow[] | null;
        } | null;
        const coachId = rv.coach_id ? String(rv.coach_id) : null;
        const coach = coachId ? coachMap.get(coachId) : null;
        const planId = rv.plan_id ? String(rv.plan_id) : null;
        const meta = planId ? planMeta.get(planId) : null;

        const alumnoNombre = atleta
          ? `${atleta.nombre} ${atleta.apellido || ''}`.trim()
          : rv.rut ? (rutMap.get(String(rv.rut)) ?? String(rv.rut)) : 'Alumno';

        let saludDetalle: string | null = null;
        if (['admin', 'profesor'].includes(currentRole) && atleta?.atletas_salud) {
          const raw = atleta.atletas_salud;
          const s: SaludRow = Array.isArray(raw) ? (raw[0] ?? {}) : raw;
          const label = saludLabel(s);
          if (label) saludDetalle = label;
        }

        return {
          reservaId:    String(rv.id),
          hora:         String(rv.hora || '').slice(0, 5),
          alumnoId:     atleta?.id ? String(atleta.id) : rv.alumno_id ? String(rv.alumno_id) : null,
          alumnoNombre,
          tieneObsSalud: atleta?.tiene_observaciones_salud ?? false,
          saludDetalle,
          coachNombre:  coach?.nombre ?? '',
          coachColor:   coach?.color  ?? COACH_COLORS[0],
          tipoClase:    String(rv.tipo_clase || '—'),
          planId,
          planTotal:    meta?.total ?? null,
          planUsado:    planId ? (planUsadoMap.get(planId) ?? 0) : null,
          planFechaFin: meta?.fechaFin ?? null,
          estado:       (rv.estado as EstadoReserva) ?? 'pendiente',
        };
      });

      setRows(parsed);
    } finally {
      setLoading(false);
    }
  }, [today]);

  // ── Clases grupales ───────────────────────────────────────────────────────
  const loadGrupales = useCallback(async () => {
    setLoadingGrupal(true);
    try {
      const fechaFin = new Date();
      fechaFin.setDate(fechaFin.getDate() + 6);
      const fFin = fechaFin.toISOString().slice(0, 10);

      const { data } = await supabase
        .from('reservas')
        .select('id, fecha, hora, estado, descripcion, alumno_id, atletas(id, nombre, apellido, telefono, email)')
        .eq('tipo_clase', 'Grupal')
        .gte('fecha', today)
        .lte('fecha', fFin)
        .order('fecha')
        .order('hora');

      type AtletaJ = { id?: string; nombre: string; apellido?: string; telefono?: string | null; email?: string | null };

      setRowsGrupal(
        ((data ?? []) as Record<string, unknown>[]).map(r => {
          const a = r.atletas as AtletaJ | null;
          return {
            reservaId:    String(r.id),
            fecha:        String(r.fecha),
            hora:         String(r.hora || '').slice(0, 5),
            nombre_clase: String(r.descripcion || 'Clase Grupal'),
            alumnoId:     a?.id ? String(a.id) : (r.alumno_id ? String(r.alumno_id) : null),
            alumnoNombre: a ? `${a.nombre} ${a.apellido || ''}`.trim() : 'Atleta',
            telefono:     a?.telefono ?? null,
            email:        a?.email    ?? null,
            estado:       (r.estado as EstadoReserva) ?? 'pendiente',
          };
        })
      );
    } finally {
      setLoadingGrupal(false);
    }
  }, [today]);

  async function markGrupal(row: GrupalRow, nuevoEstado: 'presente' | 'no_show') {
    setBusyGrupal(prev => new Set(prev).add(row.reservaId));
    try {
      const { error } = await supabase.from('reservas')
        .update({ estado: nuevoEstado })
        .eq('id', row.reservaId);
      if (error) throw error;
      setRowsGrupal(prev => prev.map(r =>
        r.reservaId === row.reservaId ? { ...r, estado: nuevoEstado } : r
      ));
      showToast(nuevoEstado === 'presente' ? 'Presente registrado' : 'No-show registrado');
    } catch {
      showToast('Error al guardar');
    } finally {
      setBusyGrupal(prev => { const s = new Set(prev); s.delete(row.reservaId); return s; });
    }
  }

  useEffect(() => { load(); loadGrupales(); }, [load, loadGrupales]);

  // ── Marcar asistencia ─────────────────────────────────────────────────────
  async function mark(row: CheckinRow, nuevoEstado: 'presente' | 'no_show') {
    setBusy(prev => new Set(prev).add(row.reservaId));
    try {
      const { error } = await supabase.from('reservas')
        .update({ estado: nuevoEstado })
        .eq('id', row.reservaId);
      if (error) throw error;

      // El plan se recalcula automáticamente desde reservas — no hay contador que tocar
      setRows(prev => prev.map(r =>
        r.reservaId === row.reservaId
          ? {
              ...r,
              estado: nuevoEstado,
              // actualizar el conteo local si era pendiente/confirmada
              planUsado: ['pendiente', 'confirmada'].includes(r.estado) && r.planUsado !== null
                ? r.planUsado + 1
                : r.planUsado,
            }
          : r
      ));
      showToast(nuevoEstado === 'presente' ? 'Presente registrado' : 'No-show registrado');
    } catch {
      showToast('Error al guardar');
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(row.reservaId); return s; });
    }
  }

  // ── Cancelar ─────────────────────────────────────────────────────────────
  async function handleCancel(row: CheckinRow) {
    const onTime = isCancelOnTime(row.hora, cfg);
    const nuevoEstado: EstadoReserva = onTime ? 'cancelada_tiempo' : 'cancelada_tarde';
    const msg = onTime
      ? '¿Cancelar esta clase? Es a tiempo — no quema clase del plan.'
      : '¿Cancelar esta clase? Es fuera de plazo — quema una clase del plan.';
    if (!confirm(msg)) return;

    setBusy(prev => new Set(prev).add(row.reservaId));
    try {
      const { error } = await supabase.from('reservas')
        .update({ estado: nuevoEstado })
        .eq('id', row.reservaId);
      if (error) throw error;

      setRows(prev => prev.map(r =>
        r.reservaId === row.reservaId
          ? {
              ...r,
              estado: nuevoEstado,
              planUsado: !onTime && r.planUsado !== null ? r.planUsado + 1 : r.planUsado,
            }
          : r
      ));
      showToast(onTime ? 'Cancelado a tiempo' : 'Cancelado — quema clase');
    } catch {
      showToast('Error al cancelar');
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(row.reservaId); return s; });
    }
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const filtered = rows.filter(r =>
    !search.trim() ||
    r.alumnoNombre.toLowerCase().includes(search.toLowerCase()) ||
    r.coachNombre.toLowerCase().includes(search.toLowerCase()) ||
    r.tipoClase.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total:     rows.length,
    presentes: rows.filter(r => r.estado === 'presente').length,
    pendientes: rows.filter(r => ['pendiente', 'confirmada'].includes(r.estado)).length,
    canceladas: rows.filter(r => r.estado.startsWith('cancelada')).length,
  };

  // Grupales: próximos 7 días + agrupación por clase del día seleccionado
  const diasGrupal = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const clasesDelDia = rowsGrupal.filter(r => r.fecha === fechaGrupal);
  const porClase = Object.values(
    clasesDelDia.reduce((acc, r) => {
      const key = `${r.hora}|${r.nombre_clase}`;
      if (!acc[key]) acc[key] = { hora: r.hora, nombre_clase: r.nombre_clase, reservas: [] as GrupalRow[] };
      acc[key].reservas.push(r);
      return acc;
    }, {} as Record<string, { hora: string; nombre_clase: string; reservas: GrupalRow[] }>)
  ).sort((a, b) => a.hora.localeCompare(b.hora));

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!loading && role && !['admin', 'profesor', 'recepcionista'].includes(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--nexa-bg)' }}>
        <p style={{ color: 'var(--nexa-muted)', fontSize: 14 }}>Sin acceso a esta pantalla.</p>
      </main>
    );
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--nexa-bg)' }}>
        <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-6">
          <div style={{ height: 28, width: 180, borderRadius: 6, background: 'var(--nexa-card)', marginBottom: 8 }} />
          <div style={{ height: 16, width: 260, borderRadius: 6, background: 'var(--nexa-card-alt)', marginBottom: 28 }} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 110, borderRadius: 10, background: 'var(--nexa-card)', marginBottom: 10 }} />
          ))}
        </div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-bg)', paddingBottom: 80 }}>
      <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-6">

        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--nexa-text)', letterSpacing: '-0.02em' }}>
              CHECK-IN
            </h1>
            <p style={{ fontSize: 13, color: 'var(--nexa-muted)', marginTop: 2, textTransform: 'capitalize' }}>
              {fmtFecha(new Date())}
            </p>
          </div>
          <button onClick={() => { load(); loadGrupales(); }} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--nexa-border)', background: 'var(--nexa-surface)',
            color: 'var(--nexa-muted)', cursor: 'pointer',
          }}>
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-1" style={{ borderBottom: '1px solid var(--nexa-border-sub)', paddingBottom: 0 }}>
          {(['individual', 'grupales'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                color: tab === t ? 'var(--nexa-text)' : 'var(--nexa-faint)',
                borderBottom: tab === t ? '2px solid var(--nexa-accent)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {t === 'individual' ? 'Individual' : 'Grupales'}
            </button>
          ))}
        </div>

        {/* ── TAB: Individual ─────────────────────────────────────────────────── */}
        {tab === 'individual' && (<>

        {/* Stats */}
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: 'Total',      val: stats.total,      color: 'var(--nexa-text)' },
            { label: 'Presentes',  val: stats.presentes,  color: 'var(--nexa-success)' },
            { label: 'Pendientes', val: stats.pendientes, color: 'var(--nexa-muted)' },
            { label: 'Canceladas', val: stats.canceladas, color: 'var(--nexa-faint)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid var(--nexa-border-sub)', background: 'var(--nexa-surface)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--nexa-muted)', letterSpacing: '0.05em' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Búsqueda */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={13} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--nexa-muted)', pointerEvents: 'none',
          }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar alumno, coach o tipo de clase…"
            style={{
              width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8,
              border: '1px solid var(--nexa-border)', background: 'var(--nexa-surface)',
              fontSize: 13, color: 'var(--nexa-text)', outline: 'none',
            }}
          />
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{
            padding: '48px 24px', textAlign: 'center',
            border: '1px solid var(--nexa-border-sub)', borderRadius: 12,
            background: 'var(--nexa-surface)',
          }}>
            <Clock size={32} style={{ color: 'var(--nexa-faint)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--nexa-muted)', fontSize: 14 }}>
              {search ? 'Sin resultados para esa búsqueda.' : 'Sin clases programadas para hoy.'}
            </p>
          </div>
        )}

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(row => (
            <CheckinCard
              key={row.reservaId}
              row={row}
              role={role ?? ''}
              cfg={cfg}
              busy={busy.has(row.reservaId)}
              router={router}
              onPresente={() => mark(row, 'presente')}
              onNoShow={()  => mark(row, 'no_show')}
              onCancel={()  => handleCancel(row)}
            />
          ))}
        </div>

        </>)}

        {/* ── TAB: Grupales ───────────────────────────────────────────────────── */}
        {tab === 'grupales' && (
          <div>
            {/* Selector de fecha — próximos 7 días */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' }}>
              {diasGrupal.map(fecha => {
                const d         = new Date(fecha + 'T12:00:00');
                const isToday   = fecha === today;
                const isSelected = fecha === fechaGrupal;
                return (
                  <button
                    key={fecha}
                    onClick={() => setFechaGrupal(fecha)}
                    style={{
                      flexShrink: 0, padding: '8px 14px', borderRadius: 10,
                      border: `1px solid ${isSelected ? 'var(--nexa-accent)' : 'var(--nexa-border)'}`,
                      background: isSelected ? 'var(--nexa-accent)' : 'var(--nexa-surface)',
                      color: isSelected ? '#fff' : 'var(--nexa-text)',
                      cursor: 'pointer', textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                      {DIAS_CORTO_ES[d.getDay()]}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {d.getDate()}
                    </div>
                    <div style={{ fontSize: 9, marginTop: 2, color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--nexa-muted)' }}>
                      {isToday ? 'hoy' : MESES_CORTO_ES[d.getMonth()]}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Loading */}
            {loadingGrupal && (
              <p style={{ fontSize: 13, color: 'var(--nexa-muted)', textAlign: 'center', padding: 32 }}>
                Cargando...
              </p>
            )}

            {/* Sin clases */}
            {!loadingGrupal && porClase.length === 0 && (
              <div style={{
                padding: '48px 24px', textAlign: 'center',
                border: '1px solid var(--nexa-border-sub)', borderRadius: 12,
                background: 'var(--nexa-surface)',
              }}>
                <p style={{ color: 'var(--nexa-muted)', fontSize: 14 }}>
                  Sin clases grupales para este día.
                </p>
              </div>
            )}

            {/* Clases del día */}
            {!loadingGrupal && porClase.map(clase => (
              <div key={`${clase.hora}-${clase.nombre_clase}`} style={{ marginBottom: 24 }}>
                {/* Encabezado de clase */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--nexa-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {clase.hora}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--nexa-text)' }}>
                    {clase.nombre_clase}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--nexa-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                    {clase.reservas.filter(r => r.estado === 'presente').length} / {clase.reservas.length} presentes
                  </span>
                </div>

                {/* Lista de reservas */}
                <div style={{
                  border: '1px solid var(--nexa-border-sub)', borderRadius: 12,
                  overflow: 'hidden', background: 'var(--nexa-surface)',
                }}>
                  {clase.reservas.length === 0 && (
                    <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--nexa-faint)' }}>
                      Sin reservas.
                    </p>
                  )}
                  {clase.reservas.map((r, i) => {
                    const isBusy = busyGrupal.has(r.reservaId);
                    const terminal = isTerminal(r.estado);
                    return (
                      <div key={r.reservaId} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px',
                        borderTop: i > 0 ? '1px solid var(--nexa-border-sub)' : undefined,
                        opacity: terminal ? 0.45 : 1,
                        flexWrap: 'wrap',
                      }}>
                        {/* Nombre + contacto */}
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--nexa-text)' }}>
                            {r.alumnoNombre}
                          </p>
                          {(r.telefono || r.email) && (
                            <p style={{ fontSize: 11, color: 'var(--nexa-muted)', marginTop: 1 }}>
                              {r.telefono ?? r.email}
                            </p>
                          )}
                        </div>

                        {/* Estado */}
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                          background: ESTADO_COLOR[r.estado] + '18',
                          color:      ESTADO_COLOR[r.estado],
                          border:     `1px solid ${ESTADO_COLOR[r.estado]}44`,
                        }}>
                          {ESTADO_LABEL[r.estado]}
                        </span>

                        {/* Acciones */}
                        {!terminal && (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              disabled={isBusy}
                              onClick={() => markGrupal(r, 'presente')}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                                border: '1px solid var(--nexa-border)', cursor: isBusy ? 'wait' : 'pointer',
                                background: r.estado === 'presente' ? 'var(--nexa-success)' : 'var(--nexa-card)',
                                color:      r.estado === 'presente' ? '#fff'               : 'var(--nexa-text-sub)',
                                opacity: isBusy ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              <CheckCircle2 size={11} /> Presente
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => markGrupal(r, 'no_show')}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                                border: '1px solid var(--nexa-border)', cursor: isBusy ? 'wait' : 'pointer',
                                background: r.estado === 'no_show' ? 'var(--nexa-danger)' : 'var(--nexa-card)',
                                color:      r.estado === 'no_show' ? '#fff'              : 'var(--nexa-text-sub)',
                                opacity: isBusy ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              <XCircle size={11} /> No-show
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 8,
          background: 'var(--nexa-text)', color: '#fff',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 100, whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </main>
  );
}
