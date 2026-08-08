import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

    const { data: role } = await supabaseUser.rpc('get_my_role');
    if (role !== 'admin') return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Perfiles staff (tabla real: id, rol, nombre, created_at)
    const { data: perfiles, error: perfilesErr } = await supabaseAdmin
      .from('perfiles')
      .select('id, rol, nombre')
      .in('rol', ['admin', 'profesor', 'recepcionista'])
      .order('rol')
      .order('nombre');

    if (perfilesErr) return NextResponse.json({ error: perfilesErr.message }, { status: 500 });

    // Cruzar con auth.users para obtener el email de cada uno
    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

    const emailByUid = Object.fromEntries(authList.users.map(u => [u.id, u.email ?? '']));

    const usuarios = (perfiles ?? []).map(p => ({
      id:     p.id,
      nombre: p.nombre ?? '',
      email:  emailByUid[p.id] ?? '',
      rol:    p.rol,
    }));

    return NextResponse.json({ usuarios });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
