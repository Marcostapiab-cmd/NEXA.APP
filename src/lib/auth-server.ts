// Sesión y rol en route handlers. Solo servidor.
// El rol se consulta a la base (`nexa_mi_rol`, migración 050), que lo lee de
// `perfiles`; nunca de user_metadata.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { esRol, rolDeUsuario, type Rol } from './roles';

export function clienteServicio(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function sesionServidor(): Promise<{ user: User | null; rol: Rol | null; db: SupabaseClient }> {
  const cookieStore = await cookies();
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { user: null, rol: null, db };

  const r = await db.rpc('nexa_mi_rol');
  if (!r.error) return { user, rol: esRol(r.data) ? r.data : null, db };
  // Base sin la migración 050: get_my_role() lee `perfiles` (también protegido).
  const g = await db.rpc('get_my_role');
  if (!g.error && esRol(g.data)) return { user, rol: g.data, db };
  return { user, rol: rolDeUsuario(user), db };
}

/** Exige sesión con alguno de los roles. Devuelve la respuesta de error si no cumple. */
export async function exigirRol(roles: readonly Rol[]):
  Promise<{ ok: true; user: User; rol: Rol; db: SupabaseClient } | { ok: false; res: NextResponse }> {
  const s = await sesionServidor();
  if (!s.user) return { ok: false, res: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) };
  if (!s.rol || !roles.includes(s.rol)) {
    return { ok: false, res: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }) };
  }
  return { ok: true, user: s.user, rol: s.rol, db: s.db };
}
