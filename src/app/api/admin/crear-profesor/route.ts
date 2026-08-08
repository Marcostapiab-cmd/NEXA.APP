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
    // Verificar sesión y rol admin
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
      return NextResponse.json({ error: 'Solo administradores pueden crear profesores.' }, { status: 403 });
    }

    const body = await req.json() as {
      email:                  string;
      password:               string;
      nombre:                 string;
      especialidad?:          string;
      tarifa_1a1?:            number;
      tarifa_2a1?:            number;
      tarifa_incompleta_2a1?: number;
      color?:                 string;
      activo?:                boolean;
    };

    const { email, password, nombre } = body;
    if (!email?.trim() || !password || !nombre?.trim()) {
      return NextResponse.json({ error: 'Email, contraseña y nombre son obligatorios.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    // 1. Crear cuenta de auth — el trigger handle_new_user() intenta crear la fila
    //    en perfiles; el paso 2 la garantiza explícitamente.
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { rol: 'profesor', nombre: nombre.trim() },
    });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    // 2. Garantizar fila en perfiles con rol='profesor' (respaldo del trigger)
    // La tabla perfiles solo tiene: id, rol, nombre, created_at
    const { error: perfilErr } = await supabaseAdmin
      .from('perfiles')
      .upsert({
        id:     authData.user.id,
        nombre: nombre.trim(),
        rol:    'profesor',
      }, { onConflict: 'id' });

    if (perfilErr) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('[crear-profesor] perfiles upsert error:', perfilErr);
      return NextResponse.json({ error: 'Error al crear el perfil de acceso.' }, { status: 500 });
    }

    // 3. Crear entrada en coaches con datos de display/tarifas
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
      // Revertir: eliminar cuenta de auth y perfiles recién creados
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('[crear-profesor] coaches insert error:', coachErr);
      return NextResponse.json({ error: 'Error al crear los datos del profesor.' }, { status: 500 });
    }

    return NextResponse.json({ coach });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[crear-profesor] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
