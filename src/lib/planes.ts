import { hoyLocal } from './format';
// ─── Types ─────────────────────────────────────────────────────────────────

export type PlanTipo    = 'mensual' | 'trimestral' | 'semestral' | 'personalizado';
export type PlanEstado  = 'activo' | 'por_vencer' | 'vencido' | 'sin_clases';
export type ReservaEstado  = 'pendiente' | 'confirmada' | 'presente' | 'no_show' | 'cancelada_tiempo' | 'cancelada_tarde' | 'reagendada' | 'cancelada_nexa' | 'bloqueada';
export type ReagendaEstado = 'pendiente' | 'completada' | 'vencida';

export type PlanModalidad = '1:1' | '2:1';

export interface Plan {
  id: string;
  alumnoId: string;
  nombre: string;
  tipo: PlanTipo;
  modalidad?: PlanModalidad | null;
  totalClases: number;
  usedClases: number;       // clases ya realizadas (presente / no-show / cancelada tarde)
  agendadasClases?: number; // clases de hoy o futuras ya reservadas con este plan
  porConfirmarClases?: number; // clases pasadas sin asistencia marcada (retienen su crédito)
  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD
  extendedUntil?: string;   // admin override: extiende la fecha de vencimiento
  adminNota?: string;
  createdAt: string;
}

export interface Reserva {
  id: string;
  alumnoId: string;
  planId: string;
  fecha: string;            // YYYY-MM-DD
  hora?: string;            // HH:MM
  descripcion?: string;
  estado: ReservaEstado;
  reagendaId?: string;      // si viene de una reagenda
  tipoClase?: string;       // '1:1 Individual' | '2:1 Duo' | 'Grupal'…
  coachId?: string;
  creadaAt: string;
}

export interface Reagenda {
  id: string;
  alumnoId: string;
  planId: string;
  reservaOriginalId: string;
  nuevaReservaId?: string;
  fechaLimite: string;      // siempre = endDate del plan (o extendedUntil)
  estado: ReagendaEstado;
  motivo?: string;
  creadaAt: string;
}

// ─── Constantes de duración ─────────────────────────────────────────────────

export const PLAN_DURACION_DIAS: Record<PlanTipo, number> = {
  mensual:        30,
  trimestral:     90,
  semestral:     180,
  personalizado:   0,
};

// Semanas exactas por tipo — determina el total de clases: dias.length × PLAN_SEMANAS[tipo]
export const PLAN_SEMANAS: Record<PlanTipo, number> = {
  mensual:        4,
  trimestral:    12,
  semestral:     24,
  personalizado:  0,
};

export const PLAN_TIPO_LABEL: Record<PlanTipo, string> = {
  mensual:       'Mensual',
  trimestral:    'Trimestral',
  semestral:     'Semestral',
  personalizado: 'Personalizado',
};

// ─── Helpers de fechas ──────────────────────────────────────────────────────

export function todayStr(): string {
  return hoyLocal();
}

export function formatDate(ds: string): string {
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}

export function calcEndDate(startDate: string, tipo: PlanTipo): string {
  if (tipo === 'personalizado') return startDate;
  const d = new Date(startDate + 'T12:00:00');
  d.setDate(d.getDate() + PLAN_DURACION_DIAS[tipo]);
  return d.toISOString().slice(0, 10);
}

// Genera todas las fechas recurrentes entre inicio y inicio+duracionDias
// diasSemana: 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
export function generarFechasRecurrentes(inicio: string, diasSemana: number[], duracionDias: number): string[] {
  if (!diasSemana.length || !duracionDias) return [];
  const startDate = new Date(inicio + 'T12:00:00');
  const endDate   = new Date(startDate);
  endDate.setDate(endDate.getDate() + duracionDias);

  const dow  = startDate.getDay() === 0 ? 7 : startDate.getDay();
  const lunes = new Date(startDate);
  lunes.setDate(lunes.getDate() - dow + 1);

  const totalWeeks = Math.ceil(duracionDias / 7) + 1;
  const sorted     = [...diasSemana].sort((a, b) => a - b);
  const dates: string[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    for (const d of sorted) {
      const cur = new Date(lunes);
      cur.setDate(cur.getDate() + w * 7 + (d - 1));
      const ds = cur.toISOString().slice(0, 10);
      if (ds >= inicio && cur <= endDate) dates.push(ds);
    }
  }
  return [...new Set(dates)].sort();
}

// Total de clases que corresponden a un plan según duración y frecuencia
export function calcTotalClases(tipo: PlanTipo, frecuenciaSemanal: number): number {
  const dias = PLAN_DURACION_DIAS[tipo];
  if (!dias) return 0;
  return Math.round((dias / 7) * frecuenciaSemanal);
}

export function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Helpers de plan ────────────────────────────────────────────────────────

export function getEffectiveEndDate(plan: Plan): string {
  return plan.extendedUntil && plan.extendedUntil > plan.endDate
    ? plan.extendedUntil
    : plan.endDate;
}

export function getDiasRestantes(plan: Plan, hoy = todayStr()): number {
  const end = getEffectiveEndDate(plan);
  const diff = Math.ceil(
    (new Date(end + 'T12:00:00').getTime() - new Date(hoy + 'T12:00:00').getTime()) / 86400000
  );
  return Math.max(0, diff);
}

export function getClasesRestantes(plan: Plan): number {
  return Math.max(0, plan.totalClases - plan.usedClases);
}

// Clases del plan ya ocupadas: realizadas + agendadas + por confirmar
// (igual que 'disponibles' en nexa_resumen_plan, lo que ve el alumno en MI NEXA)
export function getClasesComprometidas(plan: Plan): number {
  return plan.usedClases + (plan.agendadasClases ?? 0) + (plan.porConfirmarClases ?? 0);
}

// Clases que todavía se pueden agendar dentro del plan
export function getClasesPorAgendar(plan: Plan): number {
  return Math.max(0, plan.totalClases - getClasesComprometidas(plan));
}

// Clases agendadas/realizadas por sobre el plan (hay que cobrarlas aparte)
export function getClasesExtra(plan: Plan): number {
  return Math.max(0, getClasesComprometidas(plan) - plan.totalClases);
}

export function getPlanEstado(plan: Plan, hoy = todayStr()): PlanEstado {
  const end = getEffectiveEndDate(plan);
  if (hoy > end) return 'vencido';
  const restantes = getClasesRestantes(plan);
  if (restantes <= 0) return 'sin_clases';
  const dias = getDiasRestantes(plan, hoy);
  if (dias <= 7 || restantes <= 2) return 'por_vencer';
  return 'activo';
}

export function getPlanProgress(plan: Plan): number {
  if (plan.totalClases <= 0) return 0;
  return Math.min(1, plan.usedClases / plan.totalClases);
}

// ─── Validaciones de reserva ────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function canReservar(plan: Plan, fecha: string, hoy = todayStr()): ValidationResult {
  const estado = getPlanEstado(plan, hoy);
  const end    = getEffectiveEndDate(plan);
  if (estado === 'vencido')
    return { ok: false, reason: 'Tu plan está vencido. Contacta al gimnasio para renovarlo.' };
  if (estado === 'sin_clases')
    return { ok: false, reason: 'No tienes clases disponibles para reservar.' };
  if (fecha < hoy)
    return { ok: false, reason: 'No puedes reservar en fechas pasadas.' };
  if (fecha > end)
    return { ok: false, reason: `Esta fecha supera la vigencia de tu plan (${formatDate(end)}).` };
  return { ok: true };
}

export function canReagendar(reagenda: Reagenda, fechaNueva: string, hoy = todayStr()): ValidationResult {
  if (reagenda.estado !== 'pendiente')
    return { ok: false, reason: 'Esta reagenda ya fue procesada.' };
  if (hoy > reagenda.fechaLimite)
    return { ok: false, reason: 'El plazo para reagendar esta clase ya venció.' };
  if (fechaNueva < hoy)
    return { ok: false, reason: 'No puedes reagendar en fechas pasadas.' };
  if (fechaNueva > reagenda.fechaLimite)
    return { ok: false, reason: `Esta fecha supera el límite de reagenda (${formatDate(reagenda.fechaLimite)}).` };
  return { ok: true };
}

export function getFechaLimiteReagenda(plan: Plan): string {
  return getEffectiveEndDate(plan);
}

// ─── Configuración visual ────────────────────────────────────────────────────

export const ESTADO_CONFIG: Record<PlanEstado, {
  label: string; color: string; bg: string; border: string; dot: string;
}> = {
  activo:     { label: 'Activo',      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',   dot: '#22c55e' },
  por_vencer: { label: 'Por vencer',  color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)',  dot: '#f97316' },
  vencido:    { label: 'Vencido',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   dot: '#ef4444' },
  sin_clases: { label: 'Sin clases',  color: '#888888', bg: 'rgba(136,136,136,0.1)', border: 'rgba(136,136,136,0.25)', dot: '#888888' },
};

export const RESERVA_LABEL: Record<ReservaEstado, { label: string; color: string; quema: boolean }> = {
  pendiente:        { label: 'Pendiente',          color: '#888888', quema: false },
  confirmada:       { label: 'Confirmada',          color: '#3b82f6', quema: false },
  presente:         { label: 'Presente ✓',          color: '#22c55e', quema: true  },
  no_show:          { label: 'No avisó',            color: '#ef4444', quema: true  },
  cancelada_tiempo: { label: 'Canceló a tiempo',    color: '#888888', quema: false },
  cancelada_tarde:  { label: 'Canceló tarde',       color: '#f97316', quema: true  },
  reagendada:       { label: 'Reagendada',          color: '#8b5cf6', quema: false },
  cancelada_nexa:   { label: 'Cancelada por NEXA',  color: '#64748b', quema: false },
  bloqueada:        { label: 'Bloqueada',           color: '#64748b', quema: false },
};

// Los planes, reservas y reagendas viven solo en Supabase (planes-supabase.ts).
// Ya no se guardan copias en el navegador (ver lib/datos-locales.ts).
