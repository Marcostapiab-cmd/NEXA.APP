import { NextRequest, NextResponse } from 'next/server';
import { EMAIL_RE, formatearRut, validarRut, variantesRut } from '@/lib/catalogo';
import { supabaseAdmin } from '@/lib/grupales-server';

export const runtime = 'nodejs';

const RUT_DUPLICADO = 'Ya existe una cuenta con ese RUT. Inicia sesión con el email que usaste al registrarte.';

interface Body {
  nombre:   string;
  apellido: string;
  email:    string;
  telefono: string | null;
  rut:      string;
  password: string;
}

// Crea la cuenta de un alumno de clases grupales (rol 'grupales').
// El cliente inicia sesión después con signInWithPassword.
export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();

  try {
    const { nombre, apellido, email, telefono, rut, password } = await req.json() as Body;
    const emailNorm = email?.trim().toLowerCase() ?? '';

    if (!nombre?.trim() || !apellido?.trim() || !emailNorm || !password || !rut?.trim()) {
      return NextResponse.json({ error: 'Completa nombre, apellido, email, RUT y contraseña.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(emailNorm)) {
      return NextResponse.json({ error: 'El email no es válido.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }
    if (!validarRut(rut)) {
      return NextResponse.json({ error: 'El RUT no es válido.' }, { status: 400 });
    }
    const rutNorm = formatearRut(rut);

    const { data: existing } = await admin
      .from('grupales_alumnos')
      .select('id')
      .eq('email', emailNorm)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Ya existe una cuenta con ese email. Inicia sesión.' }, { status: 409 });
    }

    // Un RUT = un alumno: no se pueden crear dos cuentas con el mismo RUT
    const { data: rutExistente } = await admin
      .from('grupales_alumnos')
      .select('id')
      .in('rut', variantesRut(rut))
      .limit(1)
      .maybeSingle();
    if (rutExistente) {
      return NextResponse.json({ error: RUT_DUPLICADO }, { status: 409 });
    }

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email:         emailNorm,
      password,
      email_confirm: true,
      user_metadata: { rol: 'grupales', nombre: nombre.trim(), apellido: apellido.trim() },
    });

    if (authErr || !authData.user) {
      const raw = authErr?.message ?? '';
      const dup = /already|duplicate|registered|existe/i.test(raw);
      return NextResponse.json(
        { error: dup ? 'Ya existe una cuenta con ese email. Inicia sesión.' : 'No pudimos crear la cuenta. Intenta de nuevo.' },
        { status: dup ? 409 : 500 },
      );
    }

    const { error: alErr } = await admin.from('grupales_alumnos').insert({
      user_id:  authData.user.id,
      nombre:   nombre.trim(),
      apellido: apellido.trim(),
      email:    emailNorm,
      telefono: telefono?.trim() || null,
      rut:      rutNorm,
    });

    if (alErr) {
      // Revertir el usuario para no dejar cuentas huérfanas
      await admin.auth.admin.deleteUser(authData.user.id);
      if (alErr.code === '23505') {
        return NextResponse.json({ error: RUT_DUPLICADO }, { status: 409 });
      }
      console.error('[grupales/registro] insert error:', alErr);
      return NextResponse.json({ error: 'No pudimos guardar tu perfil. Intenta de nuevo.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[grupales/registro] error:', err);
    return NextResponse.json({ error: 'No pudimos crear la cuenta. Intenta de nuevo.' }, { status: 500 });
  }
}
