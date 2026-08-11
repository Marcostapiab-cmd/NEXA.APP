import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

interface Body {
  nombre:   string;
  apellido: string;
  email:    string;
  telefono: string | null;
  rut:      string | null;
  password: string;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json() as Body;
    const { nombre, apellido, email, telefono, rut, password } = body;

    if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    // Verificar que no exista ya un alumno grupal con ese email
    const { data: existing } = await supabaseAdmin
      .from('grupales_alumnos')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 409 });
    }

    // Crear usuario en Supabase Auth con rol 'grupales'
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:          email.trim().toLowerCase(),
      password,
      email_confirm:  true,
      user_metadata:  { rol: 'grupales', nombre, apellido },
    });

    if (authErr || !authData.user) {
      const raw = typeof authErr?.message === 'string' ? authErr.message : 'Error al crear el usuario.';
      const isdup = /already|duplicate|registered|existe/i.test(raw);
      return NextResponse.json(
        { error: isdup ? 'Ya existe una cuenta con ese email.' : raw },
        { status: isdup ? 409 : 500 }
      );
    }

    // Insertar en grupales_alumnos
    const { error: alErr } = await supabaseAdmin.from('grupales_alumnos').insert({
      user_id:  authData.user.id,
      nombre:   nombre.trim(),
      apellido: apellido.trim(),
      email:    email.trim().toLowerCase(),
      telefono: telefono?.trim() || null,
      rut:      rut?.trim()      || null,
    });

    if (alErr) {
      // Revertir el usuario creado para no dejar huérfanos
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('[registro] grupales_alumnos insert error:', alErr);
      return NextResponse.json({ error: 'Error al guardar el perfil.' }, { status: 500 });
    }

    // Iniciar sesión automáticamente para el usuario
    const { data: session, error: signErr } = await supabaseAdmin.auth.admin.generateLink({
      type:  'magiclink',
      email: email.trim().toLowerCase(),
    });

    // Devolver solo éxito; el cliente hará login con signInWithPassword
    if (signErr || !session) {
      // No es un error crítico — el usuario existe, simplemente que haga login
      return NextResponse.json({ success: true, needsLogin: true });
    }

    return NextResponse.json({ success: true, needsLogin: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Error interno del servidor.');
    console.error('[registro] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
