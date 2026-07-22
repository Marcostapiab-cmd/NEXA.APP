import { supabase } from './supabaseClient';

export interface Coach {
  id: string;
  nombre: string;
  especialidad?: string;
  tarifa_1a1: number;
  tarifa_2a1: number;
  activo: boolean;
}

export async function getCoachesActivosDB(): Promise<Coach[]> {
  const { data, error } = await supabase
    .from('coaches')
    .select('id, nombre, especialidad, tarifa_1a1, tarifa_2a1, activo')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:           String(r.id),
    nombre:       String(r.nombre),
    especialidad: r.especialidad ? String(r.especialidad) : undefined,
    tarifa_1a1:   Number(r.tarifa_1a1) || 0,
    tarifa_2a1:   Number(r.tarifa_2a1) || 0,
    activo:       Boolean(r.activo),
  }));
}
