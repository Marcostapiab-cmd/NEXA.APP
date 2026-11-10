// Datos de alumnos en el navegador.
//
// Antes se guardaban copias de fichas, rutinas, sesiones, planes y reservas en
// localStorage como "respaldo". Esas copias quedaban en el dispositivo después
// de cerrar sesión y se mostraban a la siguiente cuenta si fallaba la conexión.
// Ahora:
//  - no se guardan copias persistentes de datos de alumnos;
//  - los borradores de la sala de pesas van en sessionStorage (se borran al
//    cerrar la pestaña), ligados a la cuenta que los creó;
//  - todo se limpia al cerrar sesión o cambiar de cuenta, y al cargar la app se
//    eliminan las copias antiguas.

import { setSesionesEnMemoria } from './sesiones';

/** Claves antiguas con datos de alumnos (ya no se escriben). */
export const CLAVES_DATOS_ALUMNOS = [
  'nexa_alumnos', 'nexa_routines', 'nexa_sesiones',
  'nexa_planes', 'nexa_reservas', 'nexa_reagendas',
] as const;
/** Prefijos de claves por alumno (borradores de la sala de pesas). */
export const PREFIJOS_DATOS_ALUMNOS = ['nexa_wr_draft_'] as const;

const CLAVE_CUENTA = 'nexa_cuenta_actual';

function borrarDe(store: Storage | undefined) {
  if (!store) return;
  try {
    for (const k of CLAVES_DATOS_ALUMNOS) store.removeItem(k);
    const borrar: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && PREFIJOS_DATOS_ALUMNOS.some(p => k.startsWith(p))) borrar.push(k);
    }
    borrar.forEach(k => store.removeItem(k));
  } catch { /* almacenamiento no disponible */ }
}

const storages = () => (typeof window === 'undefined'
  ? { local: undefined, session: undefined }
  : { local: window.localStorage, session: window.sessionStorage });

/** Borra del navegador todos los datos de alumnos (local y de sesión). */
export function limpiarDatosAlumnos(): void {
  setSesionesEnMemoria([]);
  const { local, session } = storages();
  borrarDe(local);
  borrarDe(session);
  try { session?.removeItem(CLAVE_CUENTA); } catch { /* */ }
}

/** Elimina solo las copias persistentes antiguas (localStorage). */
export function limpiarCopiasAntiguas(): void {
  borrarDe(storages().local);
}

/**
 * Registra qué cuenta está usando la pestaña. Si cambió (otra persona entró en
 * el mismo dispositivo) o se cerró la sesión, borra lo que dejó la anterior.
 */
export function registrarCuenta(userId: string | null): void {
  const { session } = storages();
  if (!session) return;
  let anterior: string | null = null;
  try { anterior = session.getItem(CLAVE_CUENTA); } catch { /* */ }
  if (!userId) { limpiarDatosAlumnos(); return; }
  if (anterior && anterior !== userId) limpiarDatosAlumnos();
  try { session.setItem(CLAVE_CUENTA, userId); } catch { /* */ }
}

/** Clave del borrador de la sala de pesas (sessionStorage; se borra al cambiar de cuenta). */
export function claveBorrador(alumnoId: string): string {
  return `nexa_wr_draft_${alumnoId}`;
}

export function leerBorrador(clave: string): string | null {
  try { return storages().session?.getItem(clave) ?? null; } catch { return null; }
}
export function guardarBorrador(clave: string, valor: string): void {
  try { storages().session?.setItem(clave, valor); } catch { /* */ }
}
export function borrarBorrador(clave: string): void {
  try { storages().session?.removeItem(clave); } catch { /* */ }
}
