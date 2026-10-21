// Helpers de servidor para el portal de alumnos de clases grupales.
// Solo usar en route handlers (usa la service role key).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface AlumnoGrupal {
  id:       string;
  user_id:  string;
  nombre:   string;
  apellido: string;
  email:    string;
  rut:      string | null;
  telefono: string | null;
}

/**
 * Devuelve el alumno grupal de la sesión actual, o null.
 * La autoridad es la fila en `grupales_alumnos` ligada al usuario auth,
 * no solo el metadata del usuario.
 */
export async function getAlumnoGrupalSesion(admin: SupabaseClient): Promise<AlumnoGrupal | null> {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user || user.user_metadata?.rol !== 'grupales') return null;

  const { data } = await admin
    .from('grupales_alumnos')
    .select('id, user_id, nombre, apellido, email, rut, telefono')
    .eq('user_id', user.id)
    .maybeSingle();
  return (data as AlumnoGrupal | null) ?? null;
}
