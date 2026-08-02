import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Accesibles sin sesión y sin redirigir aunque el usuario esté logueado
const PUBLIC_OPEN = ['/clases-grupales', '/actualizar-contrasena'];
// Accesibles sin sesión pero redirigen si el usuario ya tiene sesión
const AUTH_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/portal/login', '/portal/sin-cuenta'];

// Rutas que solo puede acceder el staff (cualquier rol distinto de alumno)
const STAFF_PREFIXES = [
  '/dashboard', '/horario', '/alumnos', '/profesores', '/checkin',
  '/weightroom', '/progreso', '/rutinas', '/configuracion',
  '/pagos', '/contratos', '/calendario', '/notificaciones', '/biblioteca',
  '/grupales',
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

  // Páginas abiertas: cualquiera puede verlas, logueado o no
  if (PUBLIC_OPEN.some(p => pathname.startsWith(p))) {
    return response;
  }

  // Login / registro: redirigir si ya hay sesión activa
  if (AUTH_ROUTES.includes(pathname)) {
    if (user) {
      const rol = user.user_metadata?.rol as string | undefined;
      if (pathname === '/portal/login') {
        return NextResponse.redirect(new URL('/portal', request.url));
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

  const rol = user.user_metadata?.rol as string | undefined;

  // Alumno: solo puede ver clases públicas y su cuenta
  if (rol === 'alumno' && STAFF_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/clases-grupales', request.url));
  }

  // Profesor: solo puede ver horario, checkin y rutinas
  const PROFESOR_ALLOWED = ['/horario', '/checkin', '/rutinas', '/clases-grupales'];
  if (rol === 'profesor' && !PROFESOR_ALLOWED.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/horario', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
