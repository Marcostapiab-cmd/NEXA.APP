import { supabase } from './supabaseClient';

export interface Medicion {
  id:        string;
  alumnoId:  string;
  fecha:     string;
  peso?:     string;
  grasa?:    string;
  musculo?:  string;
  notas?:    string;
  createdAt: string;
}

function toMedicion(r: Record<string, unknown>): Medicion {
  return {
    id:        String(r.id),
    alumnoId:  String(r.alumno_id),
    fecha:     String(r.fecha),
    peso:      r.peso    != null ? String(r.peso)    : undefined,
    grasa:     r.grasa   != null ? String(r.grasa)   : undefined,
    musculo:   r.musculo != null ? String(r.musculo) : undefined,
    notas:     r.notas   ? String(r.notas) : undefined,
    createdAt: String(r.created_at),
  };
}

export async function getMedicionesAlumnoDB(alumnoId: string): Promise<Medicion[]> {
  const { data, error } = await supabase
    .from('mediciones')
    .select('*')
    .eq('alumno_id', alumnoId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => toMedicion(r as Record<string, unknown>));
}

export async function insertMedicionDB(m: Omit<Medicion, 'id' | 'createdAt'>): Promise<Medicion> {
  const { data, error } = await supabase
    .from('mediciones')
    .insert({
      alumno_id: m.alumnoId,
      fecha:     m.fecha,
      peso:      m.peso    ? parseFloat(m.peso)    : null,
      grasa:     m.grasa   ? parseFloat(m.grasa)   : null,
      musculo:   m.musculo ? parseFloat(m.musculo) : null,
      notas:     m.notas   ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toMedicion(data as Record<string, unknown>);
}

export async function deleteMedicionDB(id: string): Promise<void> {
  const { error } = await supabase.from('mediciones').delete().eq('id', id);
  if (error) throw error;
}
