// ─── Types ─────────────────────────────────────────────────────────────────

export type PlanTipo    = 'mensual' | 'trimestral' | 'semestral' | 'personalizado';
export type PlanEstado  = 'activo' | 'por_vencer' | 'vencido' | 'sin_clases';
export type ReservaEstado  = 'pendiente' | 'confirmada' | 'presente' | 'no_show' | 'cancelada_tiempo' | 'cancelada_tarde' | 'reagendada' | 'cancelada_nexa' | 'bloqueada';
export type ReagendaEstado = 'pendiente' | 'completada' | 'vencida';

export interface Plan {
  id: string;
  alumnoId: string;
  nombre: string;
  tipo: PlanTipo;
  totalClases: number;
  usedClases: number;
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
  return new Date().toISOString().slice(0, 10);
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

// ─── Storage ─────────────────────────────────────────────────────────────────

const KEY_PLANES    = 'nexa_planes';
const KEY_RESERVAS  = 'nexa_reservas';
const KEY_REAGENDAS = 'nexa_reagendas';

// Plans
export function getPlanes(): Plan[] {
  try { const s = localStorage.getItem(KEY_PLANES); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function savePlanes(planes: Plan[]): void {
  localStorage.setItem(KEY_PLANES, JSON.stringify(planes));
}
export function getPlanesAlumno(alumnoId: string): Plan[] {
  return getPlanes().filter(p => p.alumnoId === alumnoId).sort((a, b) => b.startDate.localeCompare(a.startDate));
}
export function getPlanActivo(alumnoId: string, hoy = todayStr()): Plan | null {
  const planes = getPlanesAlumno(alumnoId);
  const activo = planes.find(p => {
    const e = getPlanEstado(p, hoy);
    return e === 'activo' || e === 'por_vencer';
  });
  return activo ?? planes[0] ?? null;
}
export function upsertPlan(plan: Plan): void {
  const planes = getPlanes();
  const idx = planes.findIndex(p => p.id === plan.id);
  if (idx >= 0) planes[idx] = plan; else planes.push(plan);
  savePlanes(planes);
}
export function deletePlan(planId: string): void {
  savePlanes(getPlanes().filter(p => p.id !== planId));
}

// Reservas
export function getReservas(): Reserva[] {
  try { const s = localStorage.getItem(KEY_RESERVAS); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveReservas(r: Reserva[]): void {
  localStorage.setItem(KEY_RESERVAS, JSON.stringify(r));
}
export function getReservasPlan(planId: string): Reserva[] {
  return getReservas().filter(r => r.planId === planId).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export function getReservasAlumno(alumnoId: string): Reserva[] {
  return getReservas().filter(r => r.alumnoId === alumnoId).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export function upsertReserva(reserva: Reserva): void {
  const all = getReservas();
  const idx = all.findIndex(r => r.id === reserva.id);
  if (idx >= 0) all[idx] = reserva; else all.push(reserva);
  saveReservas(all);
}
export function deleteReserva(reservaId: string): void {
  saveReservas(getReservas().filter(r => r.id !== reservaId));
}

// Reagendas
export function getReagendas(): Reagenda[] {
  try { const s = localStorage.getItem(KEY_REAGENDAS); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveReagendas(r: Reagenda[]): void {
  localStorage.setItem(KEY_REAGENDAS, JSON.stringify(r));
}
export function getReagendasAlumno(alumnoId: string): Reagenda[] {
  return getReagendas().filter(r => r.alumnoId === alumnoId);
}
export function getPendingReagendas(alumnoId: string, hoy = todayStr()): Reagenda[] {
  return getReagendasAlumno(alumnoId).filter(r => {
    if (r.estado !== 'pendiente') return false;
    if (hoy > r.fechaLimite) { r.estado = 'vencida'; return false; }
    return true;
  });
}
export function upsertReagenda(reagenda: Reagenda): void {
  const all = getReagendas();
  const idx = all.findIndex(r => r.id === reagenda.id);
  if (idx >= 0) all[idx] = reagenda; else all.push(reagenda);
  saveReagendas(all);
}
