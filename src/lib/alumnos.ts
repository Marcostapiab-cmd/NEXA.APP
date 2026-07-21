import { supabase } from './supabaseClient';
import type { Alumno } from '@/app/alumnos/page';

function toAlumno(r: Record<string, unknown>): Alumno {
  return {
    id:              String(r.id),
    nombre:          String(r.nombre ?? ''),
    apellido:        String(r.apellido ?? ''),
    email:           String(r.email ?? ''),
    fechaNacimiento: String(r.fecha_nacimiento ?? ''),
    peso:            r.peso != null ? String(r.peso) : '',
    altura:          r.altura != null ? String(r.altura) : '',
    foto:            String(r.foto_url ?? ''),
    estado:          (r.estado as Alumno['estado']) ?? 'activo',
  };
}

export async function getAlumnos(): Promise<Alumno[]> {
  const { data, error } = await supabase
    .from('atletas')
    .select('id, nombre, apellido, email, fecha_nacimiento, peso, altura, foto_url, estado')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toAlumno);
}

export async function getAlumnoById(id: string): Promise<Alumno | null> {
  const { data, error } = await supabase
    .from('atletas')
    .select('id, nombre, apellido, email, fecha_nacimiento, peso, altura, foto_url, estado')
    .eq('id', id)
    .single();
  if (error) return null;
  return toAlumno(data as Record<string, unknown>);
}

export async function createAlumno(a: Omit<Alumno, 'id'>): Promise<Alumno> {
  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('atletas')
    .insert({
      coach_id:         authData.user?.id ?? null,
      nombre:           a.nombre,
      apellido:         a.apellido || '',
      email:            a.email || null,
      fecha_nacimiento: a.fechaNacimiento || null,
      peso:             a.peso ? parseFloat(a.peso) : null,
      altura:           a.altura ? parseFloat(a.altura) : null,
      foto_url:         a.foto || null,
      estado:           a.estado,
      activo:           a.estado !== 'archivado',
    })
    .select('id, nombre, apellido, email, fecha_nacimiento, peso, altura, foto_url, estado')
    .single();
  if (error) throw error;
  return toAlumno(data as Record<string, unknown>);
}

export async function updateAlumno(id: string, a: Omit<Alumno, 'id'>): Promise<Alumno> {
  const { data, error } = await supabase
    .from('atletas')
    .update({
      nombre:           a.nombre,
      apellido:         a.apellido || '',
      email:            a.email || null,
      fecha_nacimiento: a.fechaNacimiento || null,
      peso:             a.peso ? parseFloat(a.peso) : null,
      altura:           a.altura ? parseFloat(a.altura) : null,
      foto_url:         a.foto || null,
      estado:           a.estado,
      activo:           a.estado !== 'archivado',
    })
    .eq('id', id)
    .select('id, nombre, apellido, email, fecha_nacimiento, peso, altura, foto_url, estado')
    .single();
  if (error) throw error;
  return toAlumno(data as Record<string, unknown>);
}

export async function deleteAlumno(id: string): Promise<void> {
  const { error } = await supabase.from('atletas').delete().eq('id', id);
  if (error) throw error;
}
