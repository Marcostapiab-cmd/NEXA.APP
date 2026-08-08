import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // ── 1. Verificar sesión ──────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'No autorizado.', step: 'auth' }, { status: 401 });
    }

    // ── 2. Verificar rol admin ───────────────────────────────────────────
    const { data: myRole, error: roleErr } = await supabaseUser.rpc('get_my_role');
    if (roleErr) {
      return NextResponse.json({ error: `Error al leer rol: ${roleErr.message}`, step: 'role' }, { status: 500 });
    }
    if (myRole !== 'admin') {
      return NextResponse.json({ error: `Acceso denegado. Tu rol es: ${myRole ?? 'ninguno'}`, step: 'role' }, { status: 403 });
    }

    // ── 3. Validar body ──────────────────────────────────────────────────
    const body = await req.json() as {
      email?:       string;
      password?:    string;
      nombre?:      string;
      rol?:         string;
      especialidad?: string;
      tarifa_1a1?:  number;
      tarifa_2a1?:  number;
    };

    const { email, password, nombre } = body;
    const rol = (body.rol === 'recepcionista' ? 'recepcionista' : 'profesor') as 'profesor' | 'recepcionista';

    if (!email?.trim() || !password || !nombre?.trim()) {
      return NextResponse.json({ error: 'Email, contraseña y nombre son obligatorios.', step: 'validate' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.', step: 'validate' }, { status: 400 });
    }

    // ── 4. Verificar variables de entorno ────────────────────────────────
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.', step: 'env' }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // ── 5. Crear cuenta de auth ──────────────────────────────────────────
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { rol, nombre: nombre.trim() },
    });
    if (authErr) {
      return NextResponse.json(
        { error: authErr.message || 'Error desconocido al crear cuenta.', step: 'create_auth' },
        { status: 400 },
      );
    }

    // ── 6. Garantizar fila en perfiles ───────────────────────────────────
    const { error: perfilErr } = await supabaseAdmin
      .from('perfiles')
      .upsert({ id: authData.user.id, nombre: nombre.trim(), rol }, { onConflict: 'id' });

    if (perfilErr) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `Error en perfiles: ${perfilErr.message}`, step: 'perfiles' },
        { status: 500 },
      );
    }

    // ── 7. Coaches (solo profesores) ─────────────────────────────────────
    if (rol === 'profesor') {
      const { error: coachErr } = await supabaseAdmin
        .from('coaches')
        .insert({
          nombre:       nombre.trim(),
          especialidad: body.especialidad?.trim() || null,
          tarifa_1a1:   body.tarifa_1a1  ?? 0,
          tarifa_2a1:   body.tarifa_2a1  ?? 0,
          tarifa_incompleta_2a1: 0,
          activo:       true,
        });

      if (coachErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { error: `Error en coaches: ${coachErr.message}`, step: 'coaches' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, rol, nombre: nombre.trim() });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crear-usuario] uncaught:', msg);
    return NextResponse.json({ error: msg || 'Error interno inesperado.', step: 'uncaught' }, { status: 500 });
  }
}
