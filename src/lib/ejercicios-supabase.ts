import { supabase } from './supabaseClient';
import type { EjBiblioteca, BibliotecaCustom } from './ejercicios';

// ─── Ejercicios propios del coach ─────────────────────────────────────────────

export async function getEjerciciosPropiosDB(): Promise<EjBiblioteca[]> {
  const { data, error } = await supabase
    .from('ejercicios_propios')
    .select('id, nombre, grupo, video_url')
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:       String(r.id),
    nombre:   String(r.nombre),
    grupo:    String(r.grupo ?? ''),
    videoUrl: r.video_url ? String(r.video_url) : undefined,
  }));
}

export async function saveEjercicioPropiooDB(ej: EjBiblioteca): Promise<void> {
  const { error } = await supabase.from('ejercicios_propios').upsert({
    id:        ej.id,
    nombre:    ej.nombre,
    grupo:     ej.grupo || '',
    video_url: ej.videoUrl || null,
  });
  if (error) throw error;
}

export async function deleteEjercicioPropiooDB(id: string): Promise<void> {
  const { error } = await supabase.from('ejercicios_propios').delete().eq('id', id);
  if (error) throw error;
}

// ─── Personalizaciones de la biblioteca base ──────────────────────────────────

export async function getBibliotecaCustomsDB(): Promise<Record<string, BibliotecaCustom>> {
  const { data, error } = await supabase
    .from('ejercicios_custom')
    .select('ejercicio_id, nombre, video_url');
  if (error) throw error;
  const result: Record<string, BibliotecaCustom> = {};
  for (const r of data ?? []) {
    result[String(r.ejercicio_id)] = {
      nombre:   r.nombre   ? String(r.nombre)   : undefined,
      videoUrl: r.video_url ? String(r.video_url) : undefined,
    };
  }
  return result;
}

export async function saveBibliotecaCustomDB(id: string, custom: BibliotecaCustom): Promise<void> {
  const { error } = await supabase.from('ejercicios_custom').upsert({
    ejercicio_id: id,
    nombre:       custom.nombre   || null,
    video_url:    custom.videoUrl || null,
  });
  if (error) throw error;
}
