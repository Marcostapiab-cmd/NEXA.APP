import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  try {
    const { alumnoId, email, nombre } = await req.json() as {
      alumnoId: string;
      email:    string;
      nombre:   string;
    };

    if (!alumnoId || !email) {
      return NextResponse.json({ error: 'alumnoId y email son requeridos' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    // 1. Buscar si ya existe un usuario con este email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // 2. Crear usuario nuevo (sin contraseña — usará magic link)
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr || !newUser.user) throw createErr ?? new Error('No se pudo crear el usuario');
      userId = newUser.user.id;
    }

    // 3. Vincular user_id con el atleta
    const { error: updateErr } = await supabaseAdmin
      .from('atletas')
      .update({ user_id: userId })
      .eq('id', alumnoId);
    if (updateErr) throw updateErr;

    // 4. Enviar magic link al email del alumno
    const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type:       'magiclink',
      email,
      options:    { redirectTo: `${baseUrl}/portal` },
    });
    if (linkErr) throw linkErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
