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
    if (myRole !== 'admin' && myRole !== 'host') return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 });

    const body = await req.json() as {
      id: string;
      nombre?: string;
      email?: string;
      password?: string;
      rol?: string;
    };

    if (!body.id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });
    if (body.rol && body.id === user.id) {
      return NextResponse.json({ error: 'No puedes cambiar tu propio rol (podrías quedarte sin acceso).' }, { status: 400 });
    }
    if (body.password && body.password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const rolNuevo = body.rol && ['admin', 'host', 'profesor', 'recepcionista'].includes(body.rol) ? body.rol : undefined;

    // Actualizar auth (email, contraseña y metadata). El middleware decide los
    // permisos con user_metadata.rol: si solo se cambia `perfiles`, el nuevo
    // rol no tendría efecto al navegar.
    const authUpdate: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    if (body.email?.trim()) authUpdate.email = body.email.trim().toLowerCase();
    if (body.password) authUpdate.password = body.password;
    if (rolNuevo || body.nombre?.trim()) {
      const { data: actual } = await supabaseAdmin.auth.admin.getUserById(body.id);
      authUpdate.user_metadata = {
        ...(actual?.user?.user_metadata ?? {}),
        ...(rolNuevo ? { rol: rolNuevo } : {}),
        ...(body.nombre?.trim() ? { nombre: body.nombre.trim() } : {}),
      };
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(body.id, authUpdate);
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    // Si pasa a ser profesor, necesita su ficha de coach para aparecer en el horario
    if (rolNuevo === 'profesor') {
      const { data: coach } = await supabaseAdmin.from('coaches').select('id').eq('id', body.id).maybeSingle();
      if (!coach) {
        const { data: perfil } = await supabaseAdmin.from('perfiles').select('nombre').eq('id', body.id).maybeSingle();
        await supabaseAdmin.from('coaches').insert({
          id: body.id, nombre: body.nombre?.trim() || perfil?.nombre || 'Profesor',
          tarifa_1a1: 0, tarifa_2a1: 0, tarifa_incompleta_2a1: 0, activo: true,
        });
      }
    }

    // Actualizar perfil (nombre y/o rol). La contraseña se actualiza solo en
    // Supabase Auth (arriba) — no se guarda copia en texto plano en la BD.
    const perfilUpdate: Record<string, string> = {};
    if (body.nombre?.trim()) perfilUpdate.nombre = body.nombre.trim();
    if (rolNuevo) perfilUpdate.rol = rolNuevo;

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
