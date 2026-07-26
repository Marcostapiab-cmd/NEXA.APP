import { supabase } from './supabaseClient';
import type { Sesion } from './sesiones';

export async function saveSesionDB(sesion: Sesion): Promise<void> {
  const { error } = await supabase.from('sesiones').upsert({
    id:             sesion.id,
    alumno_id:      sesion.alumnoId,
    fecha:          sesion.fecha,
    fecha_planeada: sesion.fechaPlaneada ?? null,
    rutina_id:      sesion.rutinaId,
    rutina_nombre:  sesion.rutinaNombre,
    bloque_nombre:  sesion.bloqueNombre,
    notas:          sesion.notas,
    ejercicios:     sesion.ejercicios,
  });
  if (error) throw error;
}

export async function getSesionesDB(): Promise<Sesion[]> {
  const { data, error } = await supabase
    .from('sesiones')
    .select('id, alumno_id, fecha, fecha_planeada, rutina_id, rutina_nombre, bloque_nombre, notas, ejercicios')
    .order('fecha', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:             String(r.id),
    alumnoId:       String(r.alumno_id),
    fecha:          String(r.fecha),
    fechaPlaneada:  r.fecha_planeada ? String(r.fecha_planeada) : undefined,
    rutinaId:       String(r.rutina_id ?? ''),
    rutinaNombre:   String(r.rutina_nombre ?? ''),
    bloqueNombre:   String(r.bloque_nombre ?? ''),
    notas:          String(r.notas ?? ''),
    ejercicios:     (r.ejercicios as Sesion['ejercicios']) ?? [],
  }));
}

export async function getSesionesAlumnoDB(alumnoId: string): Promise<Sesion[]> {
  const { data, error } = await supabase
    .from('sesiones')
    .select('id, alumno_id, fecha, fecha_planeada, rutina_id, rutina_nombre, bloque_nombre, notas, ejercicios')
    .eq('alumno_id', alumnoId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:             String(r.id),
    alumnoId:       String(r.alumno_id),
    fecha:          String(r.fecha),
    fechaPlaneada:  r.fecha_planeada ? String(r.fecha_planeada) : undefined,
    rutinaId:       String(r.rutina_id ?? ''),
    rutinaNombre:   String(r.rutina_nombre ?? ''),
    bloqueNombre:   String(r.bloque_nombre ?? ''),
    notas:          String(r.notas ?? ''),
    ejercicios:     (r.ejercicios as Sesion['ejercicios']) ?? [],
  }));
}
