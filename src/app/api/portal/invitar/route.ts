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
    // Solo staff (admin/profesor/recepcionista) puede invitar alumnos al portal:
    // este endpoint vincula una cuenta de auth a un alumnoId y le envía un
    // magic link de acceso, así que sin este control cualquiera podría
    // vincular su propio correo al alumnoId de otra persona y ver sus datos.
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const { data: myRole } = await supabaseUser.rpc('get_my_role');
    if (!['admin', 'host', 'profesor', 'recepcionista'].includes(myRole as string)) {
      return NextResponse.json({ error: 'Solo staff puede invitar alumnos al portal.' }, { status: 403 });
    }

    const { alumnoId, email, nombre } = await req.json() as {
      alumnoId: string;
      email:    string;
      nombre:   string;
    };

    if (!alumnoId || !email) {
      return NextResponse.json({ error: 'alumnoId y email son requeridos' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    const emailNorm = email.trim().toLowerCase();

    // 1. Buscar si ya existe un usuario con este email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === emailNorm);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // 2. Crear usuario nuevo (sin contraseña: la fija con el link de abajo)
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email:         emailNorm,
        email_confirm: true,
        user_metadata: { rol: 'alumno', nombre: nombre ?? '' },
      });
      if (createErr || !newUser.user) throw createErr ?? new Error('No se pudo crear el usuario');
      userId = newUser.user.id;

      // El trigger de registro crea una ficha nueva para toda cuenta de alumno.
      // Aquí el alumno ya tiene ficha: se borra la recién creada para no duplicarlo.
      await supabaseAdmin.from('atletas').delete().eq('perfil_id', userId).neq('id', alumnoId);
    }

    // 3. Vincular la cuenta con la ficha del alumno
    const { error: updateErr } = await supabaseAdmin
      .from('atletas')
      .update({ user_id: userId })
      .eq('id', alumnoId);
    if (updateErr) throw updateErr;

    // 4. Link para que el alumno fije su contraseña. generateLink no envía
    //    correo: se devuelve para que el staff lo comparta (WhatsApp, correo…).
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type:    'recovery',
      email:   emailNorm,
      options: { redirectTo: `${baseUrl}/actualizar-contrasena` },
    });
    if (linkErr) throw linkErr;

    return NextResponse.json({ ok: true, link: linkData?.properties?.action_link ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
