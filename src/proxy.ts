import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { decidirAcceso, esRol, rolDeUsuario, PUBLIC_OPEN, type Rol } from '@/lib/roles';

// Las reglas de acceso por rol viven en src/lib/roles.ts (probadas en roles.test.ts).
// El rol sale de app_metadata (solo lo escribe el servidor), nunca de user_metadata.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // Landing pública: accesible para cualquiera, con o sin sesión.
  if (pathname === '/') return response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si faltan las variables de Supabase, las páginas públicas se muestran y el
  // resto va al login, sin dar acceso.
  if (!supabaseUrl || !supabaseKey) {
    console.error('[proxy] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en este entorno');
    const d = decidirAcceso(pathname, false, null);
    return d.tipo === 'pasar' ? response : salida(request, d);
  }

  // Páginas abiertas: no hace falta consultar la sesión.
  if (PUBLIC_OPEN.some(p => pathname === p || pathname.startsWith(p + '/'))) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  let rol: Rol | null = rolDeUsuario(user);
  // Cuenta sin rol copiado aún (p. ej. antes de aplicar la migración 050):
  // se consulta a la base, que lo calcula desde `perfiles`.
  if (user && !rol) {
    const { data, error } = await supabase.rpc('nexa_mi_rol');
    if (!error && esRol(data)) rol = data;
    else if (error) {
      const r = await supabase.rpc('get_my_role');
      if (!r.error && esRol(r.data)) rol = r.data;
    }
  }

  const d = decidirAcceso(pathname, !!user, rol);
  if (d.tipo === 'pasar') return response;
  return salida(request, d);
}

function salida(request: NextRequest, d: Exclude<ReturnType<typeof decidirAcceso>, { tipo: 'pasar' }>) {
  if (d.tipo === 'denegar') {
    return NextResponse.json({ error: d.status === 401 ? 'No autorizado.' : 'Acceso denegado.' }, { status: d.status });
  }
  const url = new URL(d.destino, request.url);
  if (d.destino.endsWith('/login')) url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
