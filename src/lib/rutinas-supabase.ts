import { supabase } from './supabaseClient';

export interface RutinaDB {
  id: string;
  nombre: string;
  alumno_ids: string[];
  start_date: string;
  end_date: string;
  sessions: Record<string, unknown>;
  blocks: unknown[];
}

export async function getRutinasDB(): Promise<RutinaDB[]> {
  const { data, error } = await supabase
    .from('rutinas')
    .select('id, nombre, alumno_ids, start_date, end_date, sessions, blocks')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:         String(r.id),
    nombre:     String(r.nombre),
    alumno_ids: (r.alumno_ids as string[]) ?? [],
    start_date: String(r.start_date ?? ''),
    end_date:   String(r.end_date ?? ''),
    sessions:   (r.sessions as Record<string, unknown>) ?? {},
    blocks:     (r.blocks as unknown[]) ?? [],
  }));
}

export async function saveRutinaDB(rutina: RutinaDB): Promise<void> {
  const { error } = await supabase.from('rutinas').upsert({
    id:         rutina.id,
    nombre:     rutina.nombre,
    alumno_ids: rutina.alumno_ids,
    start_date: rutina.start_date || null,
    end_date:   rutina.end_date   || null,
    sessions:   rutina.sessions,
    blocks:     rutina.blocks,
  });
  if (error) throw error;
}

export async function deleteRutinaDB(id: string): Promise<void> {
  const { error } = await supabase.from('rutinas').delete().eq('id', id);
  if (error) throw error;
}
