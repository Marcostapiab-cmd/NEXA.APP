import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { data: myRole } = await supabaseUser.rpc('get_my_role');
    if (myRole !== 'admin') {
      return NextResponse.json({ error: 'Solo administradores pueden crear usuarios.' }, { status: 403 });
    }

    const body = await req.json() as {
      email:                  string;
      password:               string;
      nombre:                 string;
      rol?:                   'profesor' | 'recepcionista';
      especialidad?:          string;
      tarifa_1a1?:            number;
      tarifa_2a1?:            number;
      tarifa_incompleta_2a1?: number;
      color?:                 string;
      activo?:                boolean;
    };

    const { email, password, nombre } = body;
    const rol = body.rol ?? 'profesor';

    if (!['profesor', 'recepcionista'].includes(rol)) {
      return NextResponse.json({ error: 'Rol no válido.' }, { status: 400 });
    }
    if (!email?.trim() || !password || !nombre?.trim()) {
      return NextResponse.json({ error: 'Email, contraseña y nombre son obligatorios.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    // 1. Crear cuenta de auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { rol, nombre: nombre.trim() },
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

    // 2. Garantizar fila en perfiles (tabla real: id, rol, nombre, created_at)
    const { error: perfilErr } = await supabaseAdmin
      .from('perfiles')
      .upsert({ id: authData.user.id, nombre: nombre.trim(), rol }, { onConflict: 'id' });

    if (perfilErr) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('[crear-usuario] perfiles upsert error:', perfilErr);
      return NextResponse.json({ error: 'Error al crear el perfil de acceso.' }, { status: 500 });
    }

    // 3. Solo profesores tienen entrada en coaches
    if (rol === 'profesor') {
      const { data: coach, error: coachErr } = await supabaseAdmin
        .from('coaches')
        .insert({
          nombre:                nombre.trim(),
          especialidad:          body.especialidad?.trim() || null,
          tarifa_1a1:            body.tarifa_1a1            ?? 0,
          tarifa_2a1:            body.tarifa_2a1            ?? 0,
          tarifa_incompleta_2a1: body.tarifa_incompleta_2a1 ?? 0,
          color:                 body.color                 || null,
          activo:                body.activo                ?? true,
        })
        .select('id, nombre, especialidad, tarifa_1a1, tarifa_2a1, tarifa_incompleta_2a1, color, activo')
        .single();

      if (coachErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        console.error('[crear-usuario] coaches insert error:', coachErr);
        return NextResponse.json({ error: 'Error al crear los datos del profesor.' }, { status: 500 });
      }

      return NextResponse.json({ coach });
    }

    return NextResponse.json({ ok: true, rol });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[crear-usuario] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
