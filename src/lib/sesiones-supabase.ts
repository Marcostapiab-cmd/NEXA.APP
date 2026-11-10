import { supabase } from './supabaseClient';
import type { Sesion } from './sesiones';

import { todasLasFilas } from './paginar';
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

/** Sesiones registradas, más recientes primero. Sin `limite` trae todas (por páginas). */
export async function getSesionesDB(limite?: number): Promise<Sesion[]> {
  const cols = 'id, alumno_id, fecha, fecha_planeada, rutina_id, rutina_nombre, bloque_nombre, notas, ejercicios';
  const data = limite
    ? await (async () => {
        const r = await supabase.from('sesiones').select(cols).order('fecha', { ascending: false }).order('id').limit(limite);
        if (r.error) throw r.error;
        return r.data ?? [];
      })()
    : await todasLasFilas<Record<string, unknown>>((d, h) =>
        supabase.from('sesiones').select(cols).order('fecha', { ascending: false }).order('id').range(d, h));
  return data.map((r: Record<string, unknown>) => ({
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

/** Cantidad exacta de sesiones registradas entre dos fechas (incluidas), sin límite de filas. */
export async function contarSesionesRango(desde: string, hasta: string): Promise<number> {
  const { count, error } = await supabase
    .from('sesiones')
    .select('id', { count: 'exact', head: true })
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return count ?? 0;
}
