import { supabase } from './supabaseClient';
import type { Plan, Reserva, Reagenda } from './planes';

// Estados que SÍ queman clase del plan
export const ESTADOS_QUE_QUEMAN: string[] = ['presente', 'no_show', 'cancelada_tarde'];

// ─── Planes ───────────────────────────────────────────────────────────────────

export async function getPlanesAlumnoDB(alumnoId: string): Promise<Plan[]> {
  const [{ data: planesData, error }, { data: reservasData }] = await Promise.all([
    supabase.from('planes').select('*').eq('alumno_id', alumnoId).order('start_date', { ascending: false }),
    supabase.from('reservas').select('plan_id, estado').eq('alumno_id', alumnoId),
  ]);
  if (error) throw error;

  // Contar reservas que queman por plan (source of truth, no usamos used_clases guardado)
  const countByPlan = new Map<string, number>();
  for (const r of (reservasData ?? [])) {
    if (ESTADOS_QUE_QUEMAN.includes(String(r.estado))) {
      const pid = String(r.plan_id);
      countByPlan.set(pid, (countByPlan.get(pid) ?? 0) + 1);
    }
  }

  return (planesData ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    alumnoId:      String(r.alumno_id),
    nombre:        String(r.nombre),
    tipo:          String(r.tipo) as Plan['tipo'],
    totalClases:   Number(r.total_clases),
    usedClases:    countByPlan.get(String(r.id)) ?? 0,
    startDate:     String(r.start_date),
    endDate:       String(r.end_date),
    extendedUntil: r.extended_until ? String(r.extended_until) : undefined,
    adminNota:     r.admin_nota ? String(r.admin_nota) : undefined,
    createdAt:     String(r.created_at),
  }));
}

export async function upsertPlanDB(plan: Plan): Promise<void> {
  const { error } = await supabase.from('planes').upsert({
    id:             plan.id,
    alumno_id:      plan.alumnoId,
    nombre:         plan.nombre,
    tipo:           plan.tipo,
    total_clases:   plan.totalClases,
    used_clases:    plan.usedClases,
    start_date:     plan.startDate,
    end_date:       plan.endDate,
    extended_until: plan.extendedUntil || null,
    admin_nota:     plan.adminNota || null,
  });
  if (error) throw error;
}

export async function deletePlanDB(planId: string): Promise<void> {
  const { error } = await supabase.from('planes').delete().eq('id', planId);
  if (error) throw error;
}

// ─── Reservas ─────────────────────────────────────────────────────────────────

export async function getReservasAlumnoDB(alumnoId: string): Promise<Reserva[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .eq('alumno_id', alumnoId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:          String(r.id),
    alumnoId:    String(r.alumno_id),
    planId:      String(r.plan_id),
    fecha:       String(r.fecha).slice(0, 10),
    hora:        r.hora ? String(r.hora).slice(0, 5) : undefined,
    descripcion: r.descripcion ? String(r.descripcion) : undefined,
    estado:      String(r.estado) as Reserva['estado'],
    reagendaId:  r.reagenda_id ? String(r.reagenda_id) : undefined,
    creadaAt:    String(r.created_at ?? r.creada_at ?? new Date().toISOString()),
  }));
}

export async function upsertReservaDB(reserva: Reserva): Promise<void> {
  const { error } = await supabase.from('reservas').upsert({
    id:          reserva.id,
    alumno_id:   reserva.alumnoId,
    plan_id:     reserva.planId,
    fecha:       reserva.fecha,
    hora:        reserva.hora        || null,
    descripcion: reserva.descripcion || null,
    estado:      reserva.estado,
    reagenda_id: reserva.reagendaId  || null,
    // la tabla usa created_at (nombre estándar), no creada_at
  });
  if (error) throw error;
}

export async function deleteReservaDB(reservaId: string): Promise<void> {
  const { error } = await supabase.from('reservas').delete().eq('id', reservaId);
  if (error) throw error;
}

// Todos los planes (para el dashboard)
export async function getAllPlanesDB(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('planes')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    alumnoId:      String(r.alumno_id),
    nombre:        String(r.nombre),
    tipo:          String(r.tipo) as Plan['tipo'],
    totalClases:   Number(r.total_clases),
    usedClases:    Number(r.used_clases),
    startDate:     String(r.start_date),
    endDate:       String(r.end_date),
    extendedUntil: r.extended_until ? String(r.extended_until) : undefined,
    adminNota:     r.admin_nota ? String(r.admin_nota) : undefined,
    createdAt:     String(r.created_at),
  }));
}

// Todas las reservas (para estadísticas de progreso)
export async function getAllReservasDB(): Promise<Reserva[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:          String(r.id),
    alumnoId:    String(r.alumno_id),
    planId:      String(r.plan_id),
    fecha:       String(r.fecha),
    hora:        r.hora ? String(r.hora) : undefined,
    descripcion: r.descripcion ? String(r.descripcion) : undefined,
    estado:      String(r.estado) as Reserva['estado'],
    reagendaId:  r.reagenda_id ? String(r.reagenda_id) : undefined,
    creadaAt:    String(r.created_at ?? r.creada_at ?? new Date().toISOString()),
  }));
}

// Reservas de una fecha específica (para el dashboard)
export async function getReservasFechaDB(fecha: string): Promise<Reserva[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .eq('fecha', fecha)
    .order('hora', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:          String(r.id),
    alumnoId:    String(r.alumno_id),
    planId:      String(r.plan_id),
    fecha:       String(r.fecha),
    hora:        r.hora ? String(r.hora) : undefined,
    descripcion: r.descripcion ? String(r.descripcion) : undefined,
    estado:      String(r.estado) as Reserva['estado'],
    reagendaId:  r.reagenda_id ? String(r.reagenda_id) : undefined,
    creadaAt:    String(r.created_at ?? r.creada_at ?? new Date().toISOString()),
  }));
}

// ─── Reagendas ────────────────────────────────────────────────────────────────

export async function getReagendasAlumnoDB(alumnoId: string): Promise<Reagenda[]> {
  const { data, error } = await supabase
    .from('reagendas')
    .select('*')
    .eq('alumno_id', alumnoId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:                String(r.id),
    alumnoId:          String(r.alumno_id),
    planId:            String(r.plan_id),
    reservaOriginalId: String(r.reserva_original_id),
    nuevaReservaId:    r.nueva_reserva_id ? String(r.nueva_reserva_id) : undefined,
    fechaLimite:       String(r.fecha_limite),
    estado:            String(r.estado) as Reagenda['estado'],
    motivo:            r.motivo ? String(r.motivo) : undefined,
    creadaAt:          String(r.creada_at),
  }));
}

export async function upsertReagendaDB(reagenda: Reagenda): Promise<void> {
  const { error } = await supabase.from('reagendas').upsert({
    id:                  reagenda.id,
    alumno_id:           reagenda.alumnoId,
    plan_id:             reagenda.planId,
    reserva_original_id: reagenda.reservaOriginalId,
    nueva_reserva_id:    reagenda.nuevaReservaId || null,
    fecha_limite:        reagenda.fechaLimite,
    estado:              reagenda.estado,
    motivo:              reagenda.motivo          || null,
    // no enviamos created_at — el DB usa DEFAULT now()
  });
  if (error) throw error;
}

// Inserta múltiples reservas sin especificar id (el DB lo genera automáticamente)
export async function insertReservasBulkDB(rows: Array<{
  alumno_id: string;
  plan_id:   string;
  fecha:     string;
  hora?:     string;
  coach_id?: string;
  estado:    string;
  tipo_clase?: string;
}>): Promise<void> {
  const { error } = await supabase.from('reservas').insert(rows);
  if (error) throw error;
}

// Recalcula usedClases de un plan contando reservas que queman clase
export async function recalcUsedClasesDB(planId: string, alumnoId: string): Promise<number> {
  const { data, error } = await supabase
    .from('reservas')
    .select('estado')
    .eq('plan_id', planId)
    .eq('alumno_id', alumnoId);
  if (error) return 0;
  return (data ?? []).filter((r: Record<string, unknown>) => ESTADOS_QUE_QUEMAN.includes(String(r.estado))).length;
}
