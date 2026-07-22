import { supabase } from './supabaseClient';
import type { Alumno, AtletaSalud } from '@/app/alumnos/page';

const SELECT_FIELDS = `
  id, nombre, apellido, email, fecha_nacimiento, peso, altura, foto_url, estado,
  rut, telefono,
  contacto_emergencia_nombre, contacto_emergencia_tel, contacto_emergencia_relacion,
  objetivo, etapa, notas_profesor,
  contrato_firmado, contrato_fecha_firma
`.trim();

function toAlumno(r: Record<string, unknown>): Alumno {
  return {
    id:              String(r.id),
    nombre:          String(r.nombre ?? ''),
    apellido:        String(r.apellido ?? ''),
    email:           String(r.email ?? ''),
    fechaNacimiento: r.fecha_nacimiento ? String(r.fecha_nacimiento).slice(0, 10) : '',
    peso:            r.peso != null ? String(r.peso) : '',
    altura:          r.altura != null ? String(r.altura) : '',
    foto:            String(r.foto_url ?? ''),
    estado:          (r.estado as Alumno['estado']) ?? 'activo',
    rut:             r.rut ? String(r.rut) : undefined,
    telefono:        r.telefono ? String(r.telefono) : undefined,
    contactoEmergenciaNombre:   r.contacto_emergencia_nombre ? String(r.contacto_emergencia_nombre) : undefined,
    contactoEmergenciaTel:      r.contacto_emergencia_tel    ? String(r.contacto_emergencia_tel)    : undefined,
    contactoEmergenciaRelacion: r.contacto_emergencia_relacion ? String(r.contacto_emergencia_relacion) : undefined,
    objetivo:        r.objetivo      ? String(r.objetivo)      : undefined,
    etapa:           r.etapa         ? String(r.etapa)         : undefined,
    notasProfesor:   r.notas_profesor ? String(r.notas_profesor) : undefined,
    contratoFirmado:    Boolean(r.contrato_firmado ?? false),
    contratoFechaFirma: r.contrato_fecha_firma ? String(r.contrato_fecha_firma).slice(0, 10) : undefined,
  };
}

export async function getAlumnos(): Promise<Alumno[]> {
  const { data, error } = await supabase
    .from('atletas')
    .select('id, nombre, apellido, email, fecha_nacimiento, peso, altura, foto_url, estado, rut, etapa')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => toAlumno(r));
}

export async function getAlumnoById(id: string): Promise<Alumno | null> {
  const { data, error } = await supabase
    .from('atletas')
    .select(SELECT_FIELDS)
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
      email:            a.email    || null,
      fecha_nacimiento: a.fechaNacimiento || null,
      peso:             a.peso   ? parseFloat(a.peso)   : null,
      altura:           a.altura ? parseFloat(a.altura) : null,
      foto_url:         a.foto   || null,
      estado:           a.estado,
      activo:           a.estado !== 'archivado',
      rut:              a.rut      || null,
      telefono:         a.telefono || null,
    })
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return toAlumno(data as Record<string, unknown>);
}

export async function updateAlumno(id: string, a: Partial<Omit<Alumno, 'id'>>): Promise<Alumno> {
  const payload: Record<string, unknown> = {};
  if (a.nombre           !== undefined) payload.nombre           = a.nombre;
  if (a.apellido         !== undefined) payload.apellido         = a.apellido || '';
  if (a.email            !== undefined) payload.email            = a.email || null;
  if (a.fechaNacimiento  !== undefined) payload.fecha_nacimiento = a.fechaNacimiento || null;
  if (a.peso             !== undefined) payload.peso             = a.peso ? parseFloat(a.peso) : null;
  if (a.altura           !== undefined) payload.altura           = a.altura ? parseFloat(a.altura) : null;
  if (a.foto             !== undefined) payload.foto_url         = a.foto || null;
  if (a.estado           !== undefined) { payload.estado = a.estado; payload.activo = a.estado !== 'archivado'; }
  if (a.rut              !== undefined) payload.rut              = a.rut || null;
  if (a.telefono         !== undefined) payload.telefono         = a.telefono || null;
  if (a.contactoEmergenciaNombre   !== undefined) payload.contacto_emergencia_nombre   = a.contactoEmergenciaNombre   || null;
  if (a.contactoEmergenciaTel      !== undefined) payload.contacto_emergencia_tel      = a.contactoEmergenciaTel      || null;
  if (a.contactoEmergenciaRelacion !== undefined) payload.contacto_emergencia_relacion = a.contactoEmergenciaRelacion || null;
  if (a.objetivo         !== undefined) payload.objetivo         = a.objetivo      || null;
  if (a.etapa            !== undefined) payload.etapa            = a.etapa         || null;
  if (a.notasProfesor    !== undefined) payload.notas_profesor   = a.notasProfesor || null;
  if (a.contratoFirmado    !== undefined) payload.contrato_firmado     = a.contratoFirmado;
  if (a.contratoFechaFirma !== undefined) payload.contrato_fecha_firma = a.contratoFechaFirma || null;

  const { data, error } = await supabase
    .from('atletas')
    .update(payload)
    .eq('id', id)
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return toAlumno(data as Record<string, unknown>);
}

export async function deleteAlumno(id: string): Promise<void> {
  const { error } = await supabase.from('atletas').delete().eq('id', id);
  if (error) throw error;
}

// ─── Salud (tabla separada, solo admin/profesor) ──────────────────────────────

export async function getAtletaSaludDB(atletaId: string): Promise<AtletaSalud | null> {
  const { data, error } = await supabase
    .from('atletas_salud')
    .select('*')
    .eq('atleta_id', atletaId)
    .maybeSingle();
  if (error) return null; // RLS bloqueó el acceso → ocultar sección
  if (!data) return { atletaId, enfermedades: '', lesiones: '', medicamentos: '', alergias: '' };
  const r = data as Record<string, unknown>;
  return {
    atletaId,
    enfermedades: r.enfermedades ? String(r.enfermedades) : '',
    lesiones:     r.lesiones     ? String(r.lesiones)     : '',
    medicamentos: r.medicamentos ? String(r.medicamentos) : '',
    alergias:     r.alergias     ? String(r.alergias)     : '',
  };
}

export async function upsertAtletaSaludDB(salud: AtletaSalud): Promise<void> {
  const { error } = await supabase.from('atletas_salud').upsert({
    atleta_id:   salud.atletaId,
    enfermedades: salud.enfermedades || null,
    lesiones:     salud.lesiones     || null,
    medicamentos: salud.medicamentos || null,
    alergias:     salud.alergias     || null,
    updated_at:   new Date().toISOString(),
  });
  if (error) throw error;
}
