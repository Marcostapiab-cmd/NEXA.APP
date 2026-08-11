import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Accesibles sin sesión y sin redirigir aunque el usuario esté logueado
const PUBLIC_OPEN = [
  '/clases-grupales', '/actualizar-contrasena', '/reservar', '/api/reservar',
  '/api/grupales-alumno', // Flow webhooks y registro necesitan acceso abierto
  '/grupales-alumno/comprar', // Página de compra pública: la página maneja su propio auth
];

// Rutas de auth grupales-alumno (redirigen si ya hay sesión)
const GRUPALES_AUTH = ['/grupales-alumno/login', '/grupales-alumno/registro'];

// Rutas de auth admin/portal (redirigen si ya hay sesión)
const AUTH_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/portal/login', '/portal/sin-cuenta'];

// Rutas que solo puede acceder el staff (cualquier rol distinto de alumno)
const STAFF_PREFIXES = [
  '/dashboard', '/horario', '/alumnos', '/profesores', '/checkin',
  '/weightroom', '/progreso', '/rutinas', '/configuracion',
  '/pagos', '/contratos', '/calendario', '/notificaciones', '/biblioteca',
  '/grupales', '/planes',
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  const pathname = request.nextUrl.pathname;
  const rol = user?.user_metadata?.rol as string | undefined;

  // Páginas abiertas: cualquiera puede verlas, logueado o no
  if (PUBLIC_OPEN.some(p => pathname.startsWith(p))) {
    return response;
  }

  // ── Mundo grupales-alumno ────────────────────────────────────

  // Login/registro de grupales: redirigir a dashboard si ya tiene sesión grupal
  if (GRUPALES_AUTH.includes(pathname)) {
    if (user && rol === 'grupales') {
      return NextResponse.redirect(new URL('/grupales-alumno/dashboard', request.url));
    }
    return response;
  }

  // Rutas protegidas del portal grupal
  if (pathname.startsWith('/grupales-alumno')) {
    if (!user) {
      const loginUrl = new URL('/grupales-alumno/login', request.url);
      loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    if (rol !== 'grupales') {
      // Otro tipo de usuario no tiene acceso
      const dest = rol === 'alumno' ? '/portal' : '/dashboard';
      return NextResponse.redirect(new URL(dest, request.url));
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
      if (rol === 'grupales') {
        return NextResponse.redirect(new URL('/grupales-alumno/dashboard', request.url));
      }
      const dest = rol === 'alumno' ? '/portal' : '/dashboard';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return response;
  }

  // Requiere autenticación para todo lo demás
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Un alumno grupal que llega al área admin/portal se envía a su dashboard
  if (rol === 'grupales') {
    return NextResponse.redirect(new URL('/grupales-alumno/dashboard', request.url));
  }

  // Alumno: solo puede ver clases públicas y su cuenta
  if (rol === 'alumno' && STAFF_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/clases-grupales', request.url));
  }

  // Profesor: horario, entrenamiento (rutinas, weightroom, calendario). Sin check-in ni progreso.
  const PROFESOR_ALLOWED = ['/horario', '/rutinas', '/weightroom', '/calendario'];
  if (rol === 'profesor' && !PROFESOR_ALLOWED.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/horario', request.url));
  }

  // Recepcionista (host): todo lo del admin excepto entrenamiento
  const HOST_ALLOWED = [
    '/dashboard', '/horario', '/alumnos', '/profesores',
    '/metricas', '/grupales', '/usuarios', '/configuracion', '/pagos',
  ];
  if (rol === 'recepcionista' && !HOST_ALLOWED.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
