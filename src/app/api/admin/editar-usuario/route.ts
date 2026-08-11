import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { data: myRole } = await supabaseUser.rpc('get_my_role');
    if (myRole !== 'admin') return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 });

    const body = await req.json() as {
      id: string;
      nombre?: string;
      email?: string;
      password?: string;
      rol?: string;
    };

    if (!body.id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });
    if (body.password && body.password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Actualizar auth (email y/o contraseña)
    const authUpdate: Record<string, string> = {};
    if (body.email?.trim()) authUpdate.email = body.email.trim().toLowerCase();
    if (body.password) authUpdate.password = body.password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(body.id, authUpdate);
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    // Actualizar perfil (nombre y/o rol)
    const perfilUpdate: Record<string, string> = {};
    if (body.nombre?.trim()) perfilUpdate.nombre = body.nombre.trim();
    if (body.rol && ['admin', 'profesor', 'recepcionista'].includes(body.rol)) perfilUpdate.rol = body.rol;

    if (Object.keys(perfilUpdate).length > 0) {
      const { error: perfilErr } = await supabaseAdmin
        .from('perfiles')
        .update(perfilUpdate)
        .eq('id', body.id);
      if (perfilErr) return NextResponse.json({ error: perfilErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno.' }, { status: 500 });
  }
}
