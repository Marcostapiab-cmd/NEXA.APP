import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/registro'];

// Rutas que solo puede acceder el staff (cualquier rol distinto de alumno)
const STAFF_PREFIXES = [
  '/dashboard', '/horario', '/alumnos', '/profesores', '/checkin',
  '/weightroom', '/progreso', '/rutinas', '/configuracion',
  '/pagos', '/contratos', '/calendario', '/notificaciones', '/biblioteca',
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
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Rutas públicas (login, registro)
  if (isPublic) {
    if (user) {
      const rol = user.user_metadata?.rol as string | undefined;
      const dest = rol === 'alumno' ? '/mi-cuenta' : '/dashboard';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return response;
  }

  // Requiere autenticación para todo lo demás
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Alumno no puede entrar a rutas de staff
  const rol = user.user_metadata?.rol as string | undefined;
  if (rol === 'alumno' && STAFF_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/mi-cuenta', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
