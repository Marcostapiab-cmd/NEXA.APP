'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, XCircle, X, AlertTriangle, Search, User,
  ChevronRight, Clock, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  getHorarioConfig, DEFAULT_HORARIO_CONFIG, type HorarioConfig,
} from '@/lib/horario-config';
import { COACH_COLORS } from '@/lib/coaches-supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SaludRow {
  enfermedades?: string | null;
  lesiones?: string | null;
  medicamentos?: string | null;
  alergias?: string | null;
}

interface AtletaRow {
  id?: string;
  nombre: string;
  apellido?: string | null;
  tiene_observaciones_salud?: boolean;
  atletas_salud?: SaludRow | SaludRow[] | null;
}

interface CoachRaw {
  id: string;
  nombre: string;
  color?: string | null;
}

interface CheckinRow {
  reservaId: string;
  hora: string;
  alumnoId: string | null;
  alumnoNombre: string;
  tieneObsSalud: boolean;
  saludDetalle: string | null;
  coachId: string | null;
  coachNombre: string;
  coachColor: string;
  tipoClase: string;
  planId: string | null;
  planTotal: number | null;
  planRestantes: number | null;
  planFechaFin: string | null;
  planEstado: string | null;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const fin = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  return Math.ceil((fin.getTime() - now.getTime()) / 86_400_000);
}

function isCancelOnTime(hora: string, cfg: HorarioConfig): boolean {
  const isAM = hora < cfg.limiteHoraAm;
  const now = new Date();

  if (isAM) {
    // Corte: ayer a las corteCancelacionAm
    const [ch, cm] = cfg.corteCancelacionAm.split(':').map(Number);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(ch, cm, 0, 0);
    return now <= cutoff;
  } else {
    // Corte: cancelHorasAvisoPm horas antes de la clase (hoy)
    const [lh, lm] = hora.split(':').map(Number);
    const claseMs = new Date(now);
    claseMs.setHours(lh, lm, 0, 0);
    return now.getTime() <= claseMs.getTime() - cfg.cancelHorasAvisoPm * 3_600_000;
  }
}

function saludLabel(row: SaludRow): string {
  return [row.lesiones, row.enfermedades, row.medicamentos, row.alergias]
    .filter(Boolean)
    .join(' · ');
}

function statusLabel(s: string): string {
  return ({ pendiente: 'Pendiente', PRESENT: 'Presente', ABSENT_NO_NOTICE: 'No-show', cancelada: 'Cancelada' })[s] ?? s;
}

function statusColor(s: string): string {
  return ({
    pendiente: 'var(--nexa-border)',
    PRESENT: 'var(--nexa-success)',
    ABSENT_NO_NOTICE: 'var(--nexa-danger)',
    cancelada: 'var(--nexa-muted)',
  })[s] ?? 'var(--nexa-border)';
}

// ─── Card ────────────────────────────────────────────────────────────────────

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
  const isPending = row.status === 'pendiente';
  const hasPlan = row.planId !== null;
  const renovar = hasPlan && (
    row.planEstado === 'agotado' ||
    row.planEstado === 'vencido' ||
    (row.planRestantes !== null && row.planRestantes <= 0)
  );
  const venceDias = hasPlan && !renovar && row.planFechaFin
    ? daysUntil(row.planFechaFin)
    : null;
  const venceProximo = venceDias !== null && venceDias >= 0 && venceDias <= 7;

  const saludVisible = ['admin', 'profesor'].includes(role) && row.saludDetalle;
  const saludIconOnly = !['admin', 'profesor'].includes(role) && row.tieneObsSalud;

  return (
    <div
      style={{
        background: 'var(--nexa-surface)',
        border: '1px solid var(--nexa-border-sub)',
        borderRadius: 10,
        padding: '14px 16px',
        opacity: row.status === 'cancelada' ? 0.55 : 1,
      }}
    >
      {/* Top row: hora + alumno + badges */}
      <div className="flex flex-wrap items-start gap-2">
        {/* Hora */}
        <div
          style={{
            minWidth: 44,
            paddingTop: 1,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--nexa-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {row.hora}
        </div>

        {/* Centro: nombre + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--nexa-text)' }}>
              {row.alumnoNombre}
            </span>

            {/* Salud ícono */}
            {saludIconOnly && (
              <span title="Tiene observaciones de salud">
                <AlertTriangle size={13} style={{ color: 'var(--nexa-danger)' }} />
              </span>
            )}

            {/* Tipo badge */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '1px 6px',
                borderRadius: 4,
                background: row.coachColor + '22',
                color: row.coachColor,
                border: `1px solid ${row.coachColor}44`,
              }}
            >
              {row.tipoClase}
            </span>

            {/* Status badge */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '1px 6px',
                borderRadius: 4,
                background: statusColor(row.status) + '18',
                color: statusColor(row.status),
                border: `1px solid ${statusColor(row.status)}44`,
              }}
            >
              {statusLabel(row.status)}
            </span>
          </div>

          {/* Salud detalle */}
          {saludVisible && (
            <p style={{ fontSize: 11, color: 'var(--nexa-danger)', marginTop: 2 }}>
              <AlertTriangle size={10} style={{ display: 'inline', marginRight: 3 }} />
              {row.saludDetalle}
            </p>
          )}

          {/* Coach + plan info */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
            style={{ marginTop: 4 }}
          >
            {row.coachNombre && (
              <span style={{ fontSize: 12, color: 'var(--nexa-muted)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: row.coachColor,
                    marginRight: 4,
                  }}
                />
                {row.coachNombre}
              </span>
            )}

            {hasPlan && row.planTotal !== null && row.planRestantes !== null && (
              <span style={{ fontSize: 12, color: 'var(--nexa-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {row.planRestantes}/{row.planTotal} clases
                {row.planFechaFin && (
                  <> · vence {new Date(row.planFechaFin + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</>
                )}
              </span>
            )}
          </div>

          {/* Alert pills */}
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: renovar || venceProximo ? 6 : 0 }}>
            {renovar && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--nexa-danger-bg)',
                  color: 'var(--nexa-danger)',
                  border: '1px solid var(--nexa-danger)',
                  textTransform: 'uppercase',
                }}
              >
                RENOVAR
              </span>
            )}
            {venceProximo && !renovar && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: '#FFF8E1',
                  color: '#B08000',
                  border: '1px solid #E6C300',
                  textTransform: 'uppercase',
                }}
              >
                Vence en {venceDias} día{venceDias !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
        <button
          disabled={busy || row.status === 'cancelada'}
          onClick={onPresente}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--nexa-border)',
            background: row.status === 'PRESENT' ? 'var(--nexa-success)' : 'var(--nexa-card)',
            color: row.status === 'PRESENT' ? '#fff' : 'var(--nexa-text-sub)',
            cursor: busy ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: row.status === 'cancelada' ? 0.4 : 1,
          }}
        >
          <CheckCircle2 size={12} />
          Presente
        </button>

        <button
          disabled={busy || row.status === 'cancelada'}
          onClick={onNoShow}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--nexa-border)',
            background: row.status === 'ABSENT_NO_NOTICE' ? 'var(--nexa-danger)' : 'var(--nexa-card)',
            color: row.status === 'ABSENT_NO_NOTICE' ? '#fff' : 'var(--nexa-text-sub)',
            cursor: busy ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: row.status === 'cancelada' ? 0.4 : 1,
          }}
        >
          <XCircle size={12} />
          No-show
        </button>

        {isPending && (
          <button
            disabled={busy}
            onClick={onCancel}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid var(--nexa-border)',
              background: 'var(--nexa-card)',
              color: 'var(--nexa-muted)',
              cursor: busy ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <X size={12} />
            Cancelar
          </button>
        )}

        {row.alumnoId && (
          <button
            onClick={() => router.push(`/alumnos/${row.alumnoId}`)}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              fontWeight: 500,
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid var(--nexa-border-sub)',
              background: 'transparent',
              color: 'var(--nexa-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <User size={11} />
            Perfil
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinPage() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<HorarioConfig>(DEFAULT_HORARIO_CONFIG);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // ── Toast ──────────────────────────────────────────────────────────────────
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
        setLoading(false);
        return;
      }

      const [config, { data: resData }, { data: coachesData }] = await Promise.all([
        getHorarioConfig(),
        supabase
          .from('reservas')
          .select(`
            id, hora, fecha, tipo_clase, attendance_status, estado, alumno_id, rut, plan_id, coach_id,
            atletas(id, nombre, apellido, tiene_observaciones_salud,
              atletas_salud(enfermedades, lesiones, medicamentos, alergias))
          `)
          .gte('fecha', today + 'T00:00:00')
          .lte('fecha', today + 'T23:59:59')
          .order('hora'),
        supabase
          .from('coaches')
          .select('id, nombre, color'),
      ]);

      setCfg(config);

      const coachMap = new Map<string, CoachRaw>(
        ((coachesData ?? []) as CoachRaw[]).map((c, i) => [
          c.id,
          { ...c, color: c.color || COACH_COLORS[i % COACH_COLORS.length] },
        ])
      );

      // Collect plan IDs
      const planIds = [...new Set(
        ((resData ?? []) as Record<string, unknown>[])
          .map(r => r.plan_id as string)
          .filter(Boolean)
      )];

      let planMap = new Map<string, { total: number; restantes: number; fechaFin: string | null; estado: string }>();
      if (planIds.length > 0) {
        const { data: plansData } = await supabase
          .from('class_plans')
          .select('id, clases_total, clases_restantes, fecha_fin, estado')
          .in('id', planIds);
        ((plansData ?? []) as Record<string, unknown>[]).forEach(p => {
          planMap.set(String(p.id), {
            total: Number(p.clases_total),
            restantes: Number(p.clases_restantes),
            fechaFin: p.fecha_fin ? String(p.fecha_fin) : null,
            estado: String(p.estado),
          });
        });
      }

      // Rut→nombre fallback for reservas without alumno FK
      const ruts = ((resData ?? []) as Record<string, unknown>[])
        .filter(r => r.rut && !r.atletas)
        .map(r => String(r.rut));

      let rutMap = new Map<string, string>();
      if (ruts.length > 0) {
        const { data: atletasData } = await supabase
          .from('atletas')
          .select('rut, nombre, apellido')
          .in('rut', ruts);
        ((atletasData ?? []) as { rut: string; nombre: string; apellido?: string }[]).forEach(a => {
          rutMap.set(a.rut, `${a.nombre} ${a.apellido || ''}`.trim());
        });
      }

      const parsed: CheckinRow[] = ((resData ?? []) as Record<string, unknown>[]).map(rv => {
        const atleta = rv.atletas as AtletaRow | null;
        const coachId = rv.coach_id ? String(rv.coach_id) : null;
        const coach = coachId ? coachMap.get(coachId) : null;
        const plan = rv.plan_id ? planMap.get(String(rv.plan_id)) : null;

        const alumnoNombre = atleta
          ? `${atleta.nombre} ${atleta.apellido || ''}`.trim()
          : rv.rut ? rutMap.get(String(rv.rut)) ?? String(rv.rut) : 'Alumno';

        // Salud detail only for admin/profesor
        let saludDetalle: string | null = null;
        if (['admin', 'profesor'].includes(currentRole) && atleta?.atletas_salud) {
          const saludRaw = atleta.atletas_salud;
          const saludObj: SaludRow = Array.isArray(saludRaw) ? (saludRaw[0] ?? {}) : saludRaw;
          const label = saludLabel(saludObj);
          if (label) saludDetalle = label;
        }

        return {
          reservaId: String(rv.id),
          hora: String(rv.hora || '').slice(0, 5),
          alumnoId: atleta?.id ? String(atleta.id) : rv.alumno_id ? String(rv.alumno_id) : null,
          alumnoNombre,
          tieneObsSalud: atleta?.tiene_observaciones_salud ?? false,
          saludDetalle,
          coachId,
          coachNombre: coach?.nombre ?? '',
          coachColor: coach?.color || COACH_COLORS[0],
          tipoClase: String(rv.tipo_clase || '—'),
          planId: rv.plan_id ? String(rv.plan_id) : null,
          planTotal: plan?.total ?? null,
          planRestantes: plan?.restantes ?? null,
          planFechaFin: plan?.fechaFin ?? null,
          planEstado: plan?.estado ?? null,
          status: String((rv.attendance_status ?? rv.estado) || 'pendiente'),
        };
      });

      setRows(parsed);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // ── Mark attendance ────────────────────────────────────────────────────────
  async function mark(row: CheckinRow, newStatus: 'PRESENT' | 'ABSENT_NO_NOTICE') {
    setBusy(prev => new Set(prev).add(row.reservaId));
    try {
      const { error } = await supabase
        .from('reservas')
        .update({ attendance_status: newStatus })
        .eq('id', row.reservaId);
      if (error) throw error;

      // Burn class from plan if transitioning out of pendiente
      if (row.planId && row.status === 'pendiente' && row.alumnoId) {
        const newRestantes = (row.planRestantes ?? 1) - 1;
        await Promise.all([
          supabase.from('class_plans')
            .update({ clases_restantes: newRestantes })
            .eq('id', row.planId),
          supabase.from('class_movements').insert({
            plan_id: row.planId,
            student_id: row.alumnoId,
            tipo: 'descuento_asistencia',
            cantidad: -1,
            saldo_resultante: newRestantes,
            motivo: newStatus === 'PRESENT' ? 'Asistencia registrada' : 'No-show registrado',
          }),
        ]);
        setRows(prev =>
          prev.map(r =>
            r.reservaId === row.reservaId
              ? { ...r, status: newStatus, planRestantes: newRestantes }
              : r
          )
        );
      } else {
        setRows(prev =>
          prev.map(r => r.reservaId === row.reservaId ? { ...r, status: newStatus } : r)
        );
      }

      showToast(newStatus === 'PRESENT' ? 'Presente registrado' : 'No-show registrado');
    } catch {
      showToast('Error al guardar');
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(row.reservaId); return s; });
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function handleCancel(row: CheckinRow) {
    const onTime = isCancelOnTime(row.hora, cfg);
    const msg = onTime
      ? '¿Cancelar esta clase? La cancelación es a tiempo, no quema clase del plan.'
      : '¿Cancelar esta clase? Es fuera de plazo: se descontará una clase del plan.';
    if (!confirm(msg)) return;

    setBusy(prev => new Set(prev).add(row.reservaId));
    try {
      await supabase.from('reservas')
        .update({ attendance_status: 'cancelada', estado: 'cancelada' })
        .eq('id', row.reservaId);

      let newRestantes = row.planRestantes;
      if (!onTime && row.planId && row.alumnoId) {
        newRestantes = (row.planRestantes ?? 1) - 1;
        await Promise.all([
          supabase.from('class_plans')
            .update({ clases_restantes: newRestantes })
            .eq('id', row.planId),
          supabase.from('class_movements').insert({
            plan_id: row.planId,
            student_id: row.alumnoId,
            tipo: 'descuento_cancelacion_tarde',
            cantidad: -1,
            saldo_resultante: newRestantes,
            motivo: 'Cancelación tardía',
          }),
        ]);
      }

      setRows(prev =>
        prev.map(r =>
          r.reservaId === row.reservaId
            ? { ...r, status: 'cancelada', planRestantes: newRestantes ?? r.planRestantes }
            : r
        )
      );
      showToast(onTime ? 'Cancelado a tiempo' : 'Cancelado — clase descontada');
    } catch {
      showToast('Error al cancelar');
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(row.reservaId); return s; });
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = rows.filter(r =>
    !search.trim() ||
    r.alumnoNombre.toLowerCase().includes(search.trim().toLowerCase()) ||
    r.coachNombre.toLowerCase().includes(search.trim().toLowerCase()) ||
    r.tipoClase.toLowerCase().includes(search.trim().toLowerCase())
  );

  const stats = {
    total: rows.length,
    presentes: rows.filter(r => r.status === 'PRESENT').length,
    pendientes: rows.filter(r => r.status === 'pendiente').length,
    canceladas: rows.filter(r => r.status === 'cancelada').length,
  };

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!loading && role && !['admin', 'profesor', 'recepcionista'].includes(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--nexa-bg)' }}>
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
            <div key={i} style={{
              height: 100, borderRadius: 10, background: 'var(--nexa-card)',
              marginBottom: 10, animation: 'pulse 1.4s ease-in-out infinite',
            }} />
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
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--nexa-text)', letterSpacing: '-0.02em' }}>
              CHECK-IN
            </h1>
            <p style={{ fontSize: 13, color: 'var(--nexa-muted)', marginTop: 2, textTransform: 'capitalize' }}>
              {fmtFecha(new Date())}
            </p>
          </div>

          <button
            onClick={load}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--nexa-border)',
              background: 'var(--nexa-surface)',
              color: 'var(--nexa-muted)', cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} />
            Actualizar
          </button>
        </div>

        {/* Stats */}
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: 'Total', val: stats.total, color: 'var(--nexa-text)' },
            { label: 'Presentes', val: stats.presentes, color: 'var(--nexa-success)' },
            { label: 'Pendientes', val: stats.pendientes, color: 'var(--nexa-muted)' },
            { label: 'Canceladas', val: stats.canceladas, color: 'var(--nexa-faint)' },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              style={{
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid var(--nexa-border-sub)',
                background: 'var(--nexa-surface)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--nexa-muted)', letterSpacing: '0.05em' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={13} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--nexa-muted)', pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar alumno, coach o tipo de clase…"
            style={{
              width: '100%', padding: '8px 10px 8px 30px',
              borderRadius: 8, border: '1px solid var(--nexa-border)',
              background: 'var(--nexa-surface)',
              fontSize: 13, color: 'var(--nexa-text)',
              outline: 'none',
            }}
          />
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div
            style={{
              padding: '48px 24px', textAlign: 'center',
              border: '1px solid var(--nexa-border-sub)', borderRadius: 12,
              background: 'var(--nexa-surface)',
            }}
          >
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
              onPresente={() => mark(row, 'PRESENT')}
              onNoShow={() => mark(row, 'ABSENT_NO_NOTICE')}
              onCancel={() => handleCancel(row)}
            />
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            padding: '10px 20px', borderRadius: 8,
            background: 'var(--nexa-text)', color: '#fff',
            fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            zIndex: 100,
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}
