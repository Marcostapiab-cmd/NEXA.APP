// App de rutinas: lectura y escritura en Supabase (navegador).
// Las reglas de quién puede qué las aplica la base (migración 055, RLS).
import { supabase } from './supabaseClient';
import { normalizarRutina, type Registro, type RutinaApp } from './app-rutinas';

export interface FichaAlumno { id: string; nombre: string }

/** Ficha del alumno con sesión (null si la cuenta no está ligada a una ficha). */
export async function miFicha(): Promise<FichaAlumno | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('atletas').select('id, nombre')
    .or(`user_id.eq.${user.id},perfil_id.eq.${user.id}`).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { id: String(data.id), nombre: String(data.nombre ?? '') } : null;
}

/** Rutinas asignadas al alumno (la base solo devuelve las suyas). */
export async function misRutinas(atletaId: string): Promise<RutinaApp[]> {
  const { data, error } = await supabase.from('rutinas')
    .select('id, nombre, start_date, end_date, sessions')
    // alumno_ids es jsonb: hay que enviar JSON (un arreglo JS se mandaría como {…} de Postgres)
    .contains('alumno_ids', JSON.stringify([atletaId]));
  if (error) throw error;
  return (data ?? []).map(r => normalizarRutina(r as Record<string, unknown>));
}

export interface RegistroGuardado extends Registro {
  id: string;
  rutina_id: string;
  dia: string;
  ejercicio_id: string;
}

/** Registros de pesos del alumno (todos los suyos, para "la última vez"). */
export async function misRegistros(atletaId: string): Promise<RegistroGuardado[]> {
  const { data, error } = await supabase.from('registros_ejercicio')
    .select('id, rutina_id, dia, ejercicio_id, ejercicio_nombre, serie, peso_kg, reps, fecha')
    .eq('atleta_id', atletaId).order('fecha', { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []).map(r => ({ ...r, peso_kg: r.peso_kg == null ? null : Number(r.peso_kg) })) as RegistroGuardado[];
}

/** Guarda (crea o corrige) las series anotadas de un ejercicio en una fecha. */
export async function guardarSeries(p: {
  atletaId: string; rutinaId: string; dia: string; ejercicioId: string; ejercicioNombre: string; fecha: string;
  series: { serie: number; peso_kg: number | null; reps: number | null }[];
}): Promise<void> {
  const filas = p.series
    .filter(s => s.peso_kg != null || s.reps != null)
    .map(s => ({
      atleta_id: p.atletaId, rutina_id: p.rutinaId, dia: p.dia, ejercicio_id: p.ejercicioId,
      ejercicio_nombre: p.ejercicioNombre, serie: s.serie, peso_kg: s.peso_kg, reps: s.reps, fecha: p.fecha,
    }));
  if (filas.length) {
    const { error } = await supabase.from('registros_ejercicio')
      .upsert(filas, { onConflict: 'atleta_id,rutina_id,dia,ejercicio_id,serie,fecha' });
    if (error) throw error;
  }
  // Series que el alumno dejó vacías: se borra lo anotado antes (corrección)
  const vacias = p.series.filter(s => s.peso_kg == null && s.reps == null).map(s => s.serie);
  if (vacias.length) {
    const { error } = await supabase.from('registros_ejercicio').delete()
      .eq('atleta_id', p.atletaId).eq('rutina_id', p.rutinaId).eq('dia', p.dia)
      .eq('ejercicio_id', p.ejercicioId).eq('fecha', p.fecha).in('serie', vacias);
    if (error) throw error;
  }
}

export interface Comentario {
  id: string;
  atleta_id: string;
  rutina_id: string;
  dia: string;
  ejercicio_id: string;
  ejercicio_nombre: string;
  texto: string;
  created_at: string;
  leido_at: string | null;
  respuesta: string | null;
  respondido_at: string | null;
}

const COLS_COMENTARIO = 'id, atleta_id, rutina_id, dia, ejercicio_id, ejercicio_nombre, texto, created_at, leido_at, respuesta, respondido_at';

export async function misComentarios(atletaId: string): Promise<Comentario[]> {
  const { data, error } = await supabase.from('comentarios_ejercicio').select(COLS_COMENTARIO)
    .eq('atleta_id', atletaId).order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as Comentario[];
}

export async function enviarComentario(p: {
  atletaId: string; rutinaId: string; dia: string; ejercicioId: string; ejercicioNombre: string; texto: string;
}): Promise<void> {
  const { error } = await supabase.from('comentarios_ejercicio').insert({
    atleta_id: p.atletaId, rutina_id: p.rutinaId, dia: p.dia, ejercicio_id: p.ejercicioId,
    ejercicio_nombre: p.ejercicioNombre, texto: p.texto.trim(),
  });
  if (error) throw error;
}

// ── Lado del coach ──────────────────────────────────────────

export interface ComentarioConAlumno extends Comentario { alumno: string }

/** Comentarios de un alumno o de todos (coach/admin). */
export async function comentariosCoach(opts: { atletaId?: string; soloSinLeer?: boolean } = {}): Promise<ComentarioConAlumno[]> {
  let q = supabase.from('comentarios_ejercicio').select(`${COLS_COMENTARIO}, atletas(nombre, apellido)`)
    .order('created_at', { ascending: false }).limit(500);
  if (opts.atletaId) q = q.eq('atleta_id', opts.atletaId);
  if (opts.soloSinLeer) q = q.is('leido_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => {
    const a = (r as { atletas?: { nombre?: string; apellido?: string } | null }).atletas;
    return { ...(r as unknown as Comentario), alumno: `${a?.nombre ?? ''} ${a?.apellido ?? ''}`.trim() || 'Alumno' };
  });
}

export async function contarSinLeer(): Promise<number> {
  const { count, error } = await supabase.from('comentarios_ejercicio')
    .select('id', { count: 'exact', head: true }).is('leido_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function marcarLeido(id: string): Promise<void> {
  const { error } = await supabase.from('comentarios_ejercicio').update({ leido_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function responderComentario(id: string, respuesta: string): Promise<void> {
  const { error } = await supabase.from('comentarios_ejercicio').update({ respuesta: respuesta.trim() || null }).eq('id', id);
  if (error) throw error;
}

/** Pesos anotados por un alumno (coach/admin). */
export async function registrosDeAlumno(atletaId: string): Promise<RegistroGuardado[]> {
  const { data, error } = await supabase.from('registros_ejercicio')
    .select('id, rutina_id, dia, ejercicio_id, ejercicio_nombre, serie, peso_kg, reps, fecha')
    .eq('atleta_id', atletaId).order('fecha', { ascending: false }).order('ejercicio_nombre').order('serie').limit(1000);
  if (error) throw error;
  return (data ?? []).map(r => ({ ...r, peso_kg: r.peso_kg == null ? null : Number(r.peso_kg) })) as RegistroGuardado[];
}
