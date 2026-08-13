import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// Crea un profesor CON acceso a la app: cuenta de auth + fila en perfiles +
// ficha en coaches (con el MISMO id que la cuenta de auth, para que las
// políticas de RLS que comparan coach_id = auth.uid() funcionen) + un link
// para que el profesor fije su propia contraseña. No se envía nada
// automáticamente — el admin copia el link y se lo manda por su cuenta.
export async function POST(req: NextRequest) {
  try {
    // 1. Verificar sesión
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

    // 2. Verificar rol admin
    const { data: myRole, error: roleErr } = await supabaseUser.rpc('get_my_role');
    if (roleErr) {
      return NextResponse.json({ error: `Error al leer rol: ${roleErr.message}` }, { status: 500 });
    }
    if (myRole !== 'admin' && myRole !== 'host') {
      return NextResponse.json({ error: `Acceso denegado. Tu rol es: ${myRole ?? 'ninguno'}` }, { status: 403 });
    }

    // 3. Validar body
    const body = await req.json() as {
      nombre?:                string;
      email?:                 string;
      especialidad?:          string;
      tarifa_1a1?:            number;
      tarifa_2a1?:            number;
      tarifa_incompleta_2a1?: number;
      color?:                 string;
    };
    const { nombre, email } = body;
    if (!nombre?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nombre y correo son obligatorios.' }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.' }, { status: 500 });
    }
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const emailNorm = email.trim().toLowerCase();

    // 4. Buscar si ya existe una cuenta con este correo (reutilizarla en vez
    //    de fallar, por si el profesor ya tenía cuenta de otro rol/portal).
    const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      return NextResponse.json({ error: `Error al buscar cuentas existentes: ${listErr.message}` }, { status: 500 });
    }
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === emailNorm);

    let userId: string;
    let warning = '';

    if (existingUser) {
      userId = existingUser.id;
      warning = 'Ya existía una cuenta con este correo — se reutilizó y se vinculó a este profesor.';
    } else {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email:         emailNorm,
        email_confirm: true,
        user_metadata: { rol: 'profesor', nombre: nombre.trim() },
      });
      if (createErr || !newUser.user) {
        return NextResponse.json({ error: createErr?.message ?? 'No se pudo crear la cuenta.' }, { status: 400 });
      }
      userId = newUser.user.id;
    }

    // 5. Garantizar fila en perfiles con rol profesor (el trigger handle_new_user
    //    ya la crea al llamar createUser, pero esto cubre el caso de cuenta reutilizada).
    const { error: perfilErr } = await supabaseAdmin
      .from('perfiles')
      .upsert({ id: userId, nombre: nombre.trim(), rol: 'profesor' }, { onConflict: 'id' });
    if (perfilErr) {
      if (!existingUser) await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Error en perfiles: ${perfilErr.message}` }, { status: 500 });
    }

    // 6. Crear la ficha de coach con el MISMO id que la cuenta de auth.
    const { error: coachErr } = await supabaseAdmin
      .from('coaches')
      .insert({
        id:                     userId,
        nombre:                 nombre.trim(),
        especialidad:           body.especialidad?.trim() || null,
        tarifa_1a1:             body.tarifa_1a1            ?? 0,
        tarifa_2a1:             body.tarifa_2a1            ?? 0,
        tarifa_incompleta_2a1:  body.tarifa_incompleta_2a1 ?? 0,
        color:                  body.color || null,
        activo:                 true,
      });
    if (coachErr) {
      if (!existingUser) await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Error en coaches: ${coachErr.message}` }, { status: 500 });
    }

    // 7. Generar el link para que el profesor fije su contraseña.
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type:  'recovery',
      email: emailNorm,
    });
    if (linkErr) {
      warning = (warning ? warning + ' ' : '') +
        'La cuenta y la ficha se crearon bien, pero no se pudo generar el link para fijar la contraseña. Puedes pedirle al profesor que use "Olvidé mi contraseña" en el login.';
      return NextResponse.json({ userId, setPasswordLink: null, warning });
    }

    return NextResponse.json({
      userId,
      setPasswordLink: linkData?.properties?.action_link ?? null,
      warning,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[profesores/invitar] uncaught:', msg);
    return NextResponse.json({ error: msg || 'Error interno inesperado.' }, { status: 500 });
  }
}
