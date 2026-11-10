// Garantiza la fila de `perfiles` de una cuenta recién creada por el servidor.
//
// Supabase Auth crea el usuario y guarda app_metadata en un paso posterior, por
// lo que el disparador de registro (que se ejecuta al crear) no siempre ve el
// rol. Por eso el servidor registra el perfil explícitamente. Para rol
// 'alumno', el disparador de `perfiles` crea la ficha en `atletas`.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Rol } from './roles';

export async function asegurarPerfil(
  admin: SupabaseClient, userId: string, rol: Exclude<Rol, 'grupales'>, nombre: string,
): Promise<{ error: string | null }> {
  const { data: actual } = await admin.from('perfiles').select('rol').eq('id', userId).maybeSingle();
  if (actual) return { error: actual.rol === rol ? null : `La cuenta ya tiene el rol ${actual.rol}.` };
  const { error } = await admin.from('perfiles').insert({ id: userId, nombre, rol });
  // 23505 = otro proceso (o el disparador) lo creó entre medio: está bien
  if (error && error.code !== '23505') return { error: error.message };
  return { error: null };
}
