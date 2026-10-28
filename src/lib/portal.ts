import { supabase } from './supabaseClient';

export interface AtletaPortal {
  id: string;
  nombre: string;
  apellido: string;
  email?: string;
  foto?: string;
}

/**
 * Atleta vinculado a la cuenta con sesión. Un alumno invitado queda enlazado por
 * `user_id`; uno que se registró solo, por `perfil_id`: se buscan ambos.
 * Devuelve `undefined` si no hay sesión y `null` si la cuenta no tiene ficha.
 */
export async function getAtletaPortal(): Promise<AtletaPortal | null | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data } = await supabase
    .from('atletas')
    .select('id, nombre, apellido, email, foto_url')
    .or(`user_id.eq.${user.id},perfil_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const a = data as { id: string; nombre: string; apellido: string | null; email: string | null; foto_url: string | null };
  return {
    id: String(a.id),
    nombre: a.nombre ?? '',
    apellido: a.apellido ?? '',
    email: a.email ?? undefined,
    foto: a.foto_url ?? undefined,
  };
}

/** `fecha` de reservas viene como timestamp ("2026-10-24T00:00:00+00:00"): deja solo el día. */
export function soloFecha(f: unknown): string {
  return String(f ?? '').slice(0, 10);
}
