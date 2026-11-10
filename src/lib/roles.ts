// Roles y reglas de acceso por ruta. Sin dependencias de Next ni de Supabase:
// lo usan el proxy, las páginas y las pruebas.
//
// El rol SIEMPRE sale de una fuente protegida:
//  - `app_metadata.rol` (solo lo escribe el servidor; la migración 050 lo copia
//    desde `perfiles`), o
//  - la función `nexa_mi_rol()` / `get_my_role()` de la base.
// Nunca de `user_metadata`, que el propio usuario puede modificar.

export const ROLES_STAFF = ['admin', 'host', 'profesor', 'recepcionista'] as const;
export const ROLES = [...ROLES_STAFF, 'alumno', 'grupales'] as const;
export type Rol = typeof ROLES[number];
export type RolStaff = typeof ROLES_STAFF[number];

export function esRol(v: unknown): v is Rol {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}
export function esStaff(v: unknown): v is RolStaff {
  return typeof v === 'string' && (ROLES_STAFF as readonly string[]).includes(v);
}

/** Rol protegido de un usuario de Supabase Auth (app_metadata). Desconocido → null. */
export function rolDeUsuario(user: { app_metadata?: Record<string, unknown> } | null | undefined): Rol | null {
  const r = user?.app_metadata?.rol;
  return esRol(r) ? r : null;
}

/** Página de inicio de cada rol. */
export function inicioDeRol(rol: Rol | null): string {
  switch (rol) {
    case 'alumno':        return '/portal';
    case 'grupales':      return '/grupales-alumno/dashboard';
    case 'profesor':
    case 'recepcionista': return '/horario';
    case 'admin':
    case 'host':          return '/dashboard';
    default:              return SIN_ACCESO;
  }
}

export const SIN_ACCESO = '/portal/sin-cuenta';

// Accesibles sin sesión y sin redirigir aunque el usuario esté logueado
export const PUBLIC_OPEN = [
  '/planes', '/clases-grupales', '/actualizar-contrasena', '/api/reservar',
  '/api/grupales-alumno', // webhook de Flow, registro y estado del pago (cada ruta valida su propio acceso)
  '/grupales-alumno/comprar', '/grupales-alumno/retorno',
  '/manifest.webmanifest', '/api/pwa-icon', '/sw.js', // PWA: sin datos
  // Pagos Flow: el aviso de Flow (servidor a servidor) y la vuelta del alumno llegan sin sesión.
  '/api/pagos/flow-confirmation', '/api/pagos/retorno', '/api/pagos/estado', '/pagos/confirmado',
  '/api/registro',   // registro público de alumnos (crea siempre rol alumno)
  '/api/cron',       // cron de Vercel: se protege con CRON_SECRET
  '/api/notificaciones/procesar', // tarea horaria de Supabase: se protege con secreto o sesión
  '/reglamento',     // reglamento publicado
];

const GRUPALES_AUTH = ['/grupales-alumno/login', '/grupales-alumno/registro'];
const AUTH_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/portal/login'];
const STAFF_LOGIN_ROUTES = ['/login', '/recuperar-contrasena'];

// Lo que puede abrir cada rol (además de PUBLIC_OPEN). `admin` y `host` pueden
// todo salvo el portal de alumnos y el de clases grupales (regla vigente).
const PERMITIDAS: Record<Exclude<Rol, 'admin' | 'host'>, string[]> = {
  alumno:        ['/portal', '/api/notificaciones'],
  grupales:      ['/grupales-alumno'],
  profesor:      ['/horario', '/rutinas', '/weightroom', '/calendario', '/cierres', '/api/notificaciones'],
  recepcionista: ['/horario', '/alumnos', '/profesores', '/metricas', '/grupales', '/usuarios', '/configuracion',
                  '/pagos', '/atencion', '/renovaciones', '/cierres', '/api/'],
};
const SOLO_ALUMNOS = ['/portal', '/grupales-alumno'];

// Coincide con la ruta exacta o con sus subrutas ('/portal' → '/portal/clases', no '/portales').
const empieza = (path: string, prefijos: string[]) =>
  prefijos.some(p => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'));

export type Decision =
  | { tipo: 'pasar' }
  | { tipo: 'redirigir'; destino: string }
  | { tipo: 'denegar'; status: 401 | 403 };

/**
 * Decide qué hacer con una petición.
 * @param conSesion hay usuario autenticado
 * @param rol rol protegido (null = sin rol o rol desconocido)
 */
export function decidirAcceso(pathname: string, conSesion: boolean, rol: Rol | null): Decision {
  const api = pathname.startsWith('/api/');

  if (pathname === '/' || empieza(pathname, PUBLIC_OPEN)) return { tipo: 'pasar' };

  // ── Login / registro ──
  if (GRUPALES_AUTH.includes(pathname)) {
    return conSesion && rol === 'grupales' ? { tipo: 'redirigir', destino: inicioDeRol('grupales') } : { tipo: 'pasar' };
  }
  if (AUTH_ROUTES.includes(pathname)) {
    if (!conSesion) return { tipo: 'pasar' };
    if (pathname === '/portal/login') {
      return rol === 'alumno' ? { tipo: 'redirigir', destino: '/portal' } : { tipo: 'pasar' };
    }
    // El login del staff se muestra aunque haya una sesión de alumno o sin rol abierta.
    if (!esStaff(rol) && STAFF_LOGIN_ROUTES.includes(pathname)) return { tipo: 'pasar' };
    return rol ? { tipo: 'redirigir', destino: inicioDeRol(rol) } : { tipo: 'pasar' };
  }

  // ── Requiere sesión ──
  if (!conSesion) {
    if (api) return { tipo: 'denegar', status: 401 };
    if (empieza(pathname, ['/grupales-alumno'])) return { tipo: 'redirigir', destino: '/grupales-alumno/login' };
    if (empieza(pathname, ['/portal'])) return { tipo: 'redirigir', destino: '/portal/login' };
    return { tipo: 'redirigir', destino: '/login' };
  }

  // Sesión sin rol válido: no ve nada más que el aviso.
  if (!rol) {
    if (pathname === SIN_ACCESO) return { tipo: 'pasar' };
    return api ? { tipo: 'denegar', status: 403 } : { tipo: 'redirigir', destino: SIN_ACCESO };
  }
  if (pathname === SIN_ACCESO) return { tipo: 'pasar' };

  const permitido = rol === 'admin' || rol === 'host'
    ? !empieza(pathname, SOLO_ALUMNOS)
    : empieza(pathname, PERMITIDAS[rol]);
  if (permitido) return { tipo: 'pasar' };
  return api ? { tipo: 'denegar', status: 403 } : { tipo: 'redirigir', destino: inicioDeRol(rol) };
}
