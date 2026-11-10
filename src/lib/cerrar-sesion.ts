import { supabase } from './supabaseClient';
import { limpiarDatosAlumnos } from './datos-locales';

/** Cierra la sesión y borra del navegador los datos de alumnos de esta cuenta. */
export async function cerrarSesion(): Promise<void> {
  limpiarDatosAlumnos();
  try { await supabase.auth.signOut(); } finally { limpiarDatosAlumnos(); }
}
