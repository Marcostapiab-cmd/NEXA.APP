// Rol de la sesión en el navegador. Solo para decidir qué mostrar o adónde
// llevar al usuario: los permisos reales los aplican el proxy, el servidor y la base.
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { esRol, rolDeUsuario, type Rol } from './roles';

export async function rolActual(user?: User | null): Promise<Rol | null> {
  const u = user === undefined ? (await supabase.auth.getUser()).data.user : user;
  if (!u) return null;
  const r = rolDeUsuario(u);
  if (r) return r;
  const m = await supabase.rpc('nexa_mi_rol');
  if (!m.error) return esRol(m.data) ? m.data : null;
  const g = await supabase.rpc('get_my_role');
  return !g.error && esRol(g.data) ? g.data : null;
}
