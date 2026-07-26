import { supabase } from './supabaseClient';
import type { EjBiblioteca, BibliotecaCustom } from './ejercicios';

async function getCoachId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── Ejercicios propios del coach ─────────────────────────────────────────────

export async function getEjerciciosPropiosDB(): Promise<EjBiblioteca[]> {
  const { data, error } = await supabase
    .from('ejercicios_propios')
    .select('id, nombre, grupo, video_url, video_path')
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:        String(r.id),
    nombre:    String(r.nombre),
    grupo:     String(r.grupo ?? ''),
    videoUrl:  r.video_url  ? String(r.video_url)  : undefined,
    videoPath: r.video_path ? String(r.video_path) : undefined,
  }));
}

export async function saveEjercicioPropiooDB(ej: EjBiblioteca): Promise<void> {
  const coachId = await getCoachId();
  const { error } = await supabase.from('ejercicios_propios').upsert({
    id:         ej.id,
    nombre:     ej.nombre,
    grupo:      ej.grupo || '',
    video_url:  ej.videoUrl  || null,
    video_path: ej.videoPath || null,
    coach_id:   coachId,
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
    .select('ejercicio_id, nombre, video_url, video_path, oculto');
  if (error) throw error;
  const result: Record<string, BibliotecaCustom> = {};
  for (const r of data ?? []) {
    result[String(r.ejercicio_id)] = {
      nombre:    r.nombre     ? String(r.nombre)     : undefined,
      videoUrl:  r.video_url  ? String(r.video_url)  : undefined,
      videoPath: r.video_path ? String(r.video_path) : undefined,
      oculto:    r.oculto === true,
    };
  }
  return result;
}

export async function saveBibliotecaCustomDB(id: string, custom: BibliotecaCustom): Promise<void> {
  const coachId = await getCoachId();
  const { error } = await supabase.from('ejercicios_custom').upsert({
    ejercicio_id: id,
    coach_id:     coachId,
    nombre:       custom.nombre    || null,
    video_url:    custom.videoUrl  || null,
    video_path:   custom.videoPath || null,
    oculto:       custom.oculto   ?? false,
  });
  if (error) throw error;
}

export async function ocultarBibliotecaEjercicioDB(id: string): Promise<void> {
  const coachId = await getCoachId();
  const { error } = await supabase.from('ejercicios_custom').upsert({
    ejercicio_id: id,
    coach_id:     coachId,
    oculto:       true,
  });
  if (error) throw error;
}

export async function restaurarBibliotecaEjercicioDB(id: string): Promise<void> {
  const { error } = await supabase.from('ejercicios_custom')
    .update({ oculto: false })
    .eq('ejercicio_id', id);
  if (error) throw error;
}

export async function deleteBibliotecaCustomDB(id: string): Promise<void> {
  const { error } = await supabase.from('ejercicios_custom').delete().eq('ejercicio_id', id);
  if (error) throw error;
}

// ─── Storage: videos de ejercicios ────────────────────────────────────────────

const BUCKET = 'ejercicios-videos';
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 año en segundos

export async function uploadEjercicioVideo(
  ejercicioId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const coachId = await getCoachId();
  if (!coachId) throw new Error('No autenticado');

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
  const path = `${coachId}/${ejercicioId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: signedData, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError) throw signError;

  return { path, url: signedData.signedUrl };
}

export async function deleteEjercicioVideo(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
