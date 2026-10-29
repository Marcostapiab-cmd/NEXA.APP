import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Accesibles sin sesión y sin redirigir aunque el usuario esté logueado
const PUBLIC_OPEN = [
  '/planes', '/clases-grupales', '/actualizar-contrasena', '/api/reservar',
  '/api/grupales-alumno', // webhook de Flow, registro y estado del pago (cada ruta valida su propio acceso)
  '/grupales-alumno/comprar', '/grupales-alumno/retorno',
  '/manifest.webmanifest', '/api/pwa-icon', '/sw.js', // PWA: sin datos, deben cargar sin sesión
  // Pagos Flow de alumnos: el aviso de Flow (servidor a servidor) y la vuelta
  // del alumno llegan sin sesión. Cada ruta valida el token con Flow.
  '/api/pagos/flow-confirmation', '/api/pagos/retorno', '/api/pagos/estado', '/pagos/confirmado',
  '/api/registro',  // registro público de alumnos (valida RUT/email por su cuenta)
  '/api/cron',      // cron de Vercel: se protege con CRON_SECRET
];

// Login/registro del portal de clases grupales (redirigen si ya hay sesión grupal)
const GRUPALES_AUTH = ['/grupales-alumno/login', '/grupales-alumno/registro'];

// Rutas de auth admin/portal (redirigen si ya hay sesión)
const AUTH_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/portal/login', '/portal/sin-cuenta'];

// Rutas de acceso del staff que se muestran aunque haya una sesión de alumno abierta
const STAFF_LOGIN_ROUTES = ['/login', '/recuperar-contrasena'];

// Rutas que solo puede acceder el staff (cualquier rol distinto de alumno)
const STAFF_PREFIXES = [
  '/dashboard', '/horario', '/alumnos', '/profesores', '/checkin',
  '/weightroom', '/progreso', '/rutinas', '/configuracion',
  '/pagos', '/contratos', '/calendario', '/notificaciones', '/biblioteca',
  '/grupales', '/atencion',
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Landing pública (portada con planes y "Reservar clase"): accesible para
  // cualquiera, con o sin sesión. Debe ir antes de exigir autenticación.
  if (request.nextUrl.pathname === '/') {
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si faltan las variables de Supabase (p. ej. no están habilitadas para el
  // entorno Preview en Vercel), no se tumba todo el sitio con un 500: las
  // páginas públicas se muestran y el resto va al login, sin dar acceso.
  if (!supabaseUrl || !supabaseKey) {
    console.error('[proxy] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en este entorno');
    if (PUBLIC_OPEN.some(p => pathname.startsWith(p)) || AUTH_ROUTES.includes(pathname) || GRUPALES_AUTH.includes(pathname)) {
      return response;
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const rol = user?.user_metadata?.rol as string | undefined;

  // Páginas abiertas: cualquiera puede verlas, logueado o no
  if (PUBLIC_OPEN.some(p => pathname.startsWith(p))) {
    return response;
  }

  // ── Portal de clases grupales ────────────────────────────────

  if (GRUPALES_AUTH.includes(pathname)) {
    if (user && rol === 'grupales') {
      return NextResponse.redirect(new URL('/grupales-alumno/dashboard', request.url));
    }
    return response;
  }

  if (pathname === '/grupales-alumno' || pathname.startsWith('/grupales-alumno/')) {
    if (!user) {
      const loginUrl = new URL('/grupales-alumno/login', request.url);
      loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    if (rol !== 'grupales') {
      return NextResponse.redirect(new URL(rol === 'alumno' ? '/portal' : '/dashboard', request.url));
    }
    return response;
  }

  // ── Mundo admin/portal ───────────────────────────────────────

  // Login / registro: redirigir si ya hay sesión activa
  if (AUTH_ROUTES.includes(pathname)) {
    if (user) {
      if (pathname === '/portal/login') {
        return NextResponse.redirect(new URL('/portal', request.url));
      }
      // Login/registro del staff: si la sesión abierta es de un alumno (grupal o
      // personal), se muestra igual el formulario para entrar con la cuenta de
      // staff. Antes se redirigía a la cuenta del alumno y no había forma de
      // llegar al login del staff desde ese dispositivo.
      const esStaff = !!rol && rol !== 'alumno' && rol !== 'grupales';
      if (!esStaff && STAFF_LOGIN_ROUTES.includes(pathname)) {
        return response;
      }
      if (rol === 'grupales') {
        return NextResponse.redirect(new URL('/grupales-alumno/dashboard', request.url));
      }
      const dest = rol === 'alumno' ? '/portal'
                 : rol === 'profesor' || rol === 'recepcionista' ? '/horario'
                 : '/dashboard';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return response;
  }

  // Requiere autenticación para todo lo demás
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Una cuenta de alumno grupal (creada desde la web pública) nunca entra al área admin/portal
  if (rol === 'grupales') {
    return NextResponse.redirect(new URL('/grupales-alumno/dashboard', request.url));
  }

  // Alumno: solo puede ver clases públicas y su cuenta
  if (rol === 'alumno' && STAFF_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/planes', request.url));
  }

  // Profesor: horario, entrenamiento (rutinas, weightroom, calendario). Sin check-in ni progreso.
  const PROFESOR_ALLOWED = ['/horario', '/rutinas', '/weightroom', '/calendario'];
  if (rol === 'profesor' && !PROFESOR_ALLOWED.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/horario', request.url));
  }

  // Recepcionista (host): todo lo del admin excepto dashboard y entrenamiento
  const HOST_ALLOWED = [
    '/horario', '/alumnos', '/profesores',
    '/metricas', '/grupales', '/usuarios', '/configuracion', '/pagos', '/atencion',
  ];
  if (rol === 'recepcionista' && !HOST_ALLOWED.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/horario', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
