import { supabase } from './supabaseClient';

export const COACH_COLORS = ['#C9A96E','#5B9BD5','#70AD47','#ED7D31','#A5A5A5','#FFC000'];

export interface Coach {
  id:                    string;
  nombre:                string;
  especialidad?:         string;
  tarifa_1a1:            number;
  tarifa_2a1:            number;
  tarifa_incompleta_2a1: number;
  color?:                string;
  activo:                boolean;
}

const SELECT = 'id, nombre, especialidad, tarifa_1a1, tarifa_2a1, tarifa_incompleta_2a1, color, activo';

function toCoach(r: Record<string, unknown>): Coach {
  return {
    id:                    String(r.id),
    nombre:                String(r.nombre),
    especialidad:          r.especialidad ? String(r.especialidad) : undefined,
    tarifa_1a1:            Number(r.tarifa_1a1)            || 0,
    tarifa_2a1:            Number(r.tarifa_2a1)            || 0,
    tarifa_incompleta_2a1: Number(r.tarifa_incompleta_2a1) || 0,
    color:                 r.color ? String(r.color) : undefined,
    activo:                Boolean(r.activo),
  };
}

export async function getCoachesActivosDB(): Promise<Coach[]> {
  const { data, error } = await supabase
    .from('coaches')
    .select(SELECT)
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => toCoach(r));
}

export async function getAllCoachesDB(): Promise<Coach[]> {
  const { data, error } = await supabase
    .from('coaches')
    .select(SELECT)
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => toCoach(r));
}

export async function upsertCoachDB(
  coach: Partial<Coach> & { nombre: string },
): Promise<Coach> {
  const payload = {
    nombre:                coach.nombre,
    especialidad:          coach.especialidad          || null,
    tarifa_1a1:            coach.tarifa_1a1            ?? 0,
    tarifa_2a1:            coach.tarifa_2a1            ?? 0,
    tarifa_incompleta_2a1: coach.tarifa_incompleta_2a1 ?? 0,
    color:                 coach.color                 || null,
    activo:                coach.activo                ?? true,
  };
  if (coach.id) {
    const { data, error } = await supabase
      .from('coaches').update(payload).eq('id', coach.id).select(SELECT).single();
    if (error) throw error;
    return toCoach(data as Record<string, unknown>);
  } else {
    const { data, error } = await supabase
      .from('coaches').insert(payload).select(SELECT).single();
    if (error) throw error;
    return toCoach(data as Record<string, unknown>);
  }
}

export async function deleteCoachDB(id: string): Promise<void> {
  const { error } = await supabase.from('coaches').delete().eq('id', id);
  if (error) throw error;
}
