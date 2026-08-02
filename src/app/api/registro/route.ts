import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Normaliza RUT a formato "12345678-9" (sin puntos, con guión, K mayúscula)
function normalizarRUT(raw: string): string {
  const limpio = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return raw;
  const cuerpo = limpio.slice(0, -1);
  const dv     = limpio.slice(-1);
  return `${cuerpo}-${dv}`;
}

// Valida dígito verificador módulo 11
function validarRUT(raw: string): boolean {
  const limpio = raw.replace(/[^0-9kK]/g, '').toLowerCase();
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv     = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * mult;
    mult = mult < 7 ? mult + 1 : 2;
  }
  const resto  = 11 - (suma % 11);
  const dvEsp  = resto === 11 ? '0' : resto === 10 ? 'k' : String(resto);
  return dv === dvEsp;
}

interface Body {
  nombre:   string;
  email:    string;
  password: string;
  rut:      string;
}

export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json() as Body;
    const { nombre, email, password, rut } = body;

    // Validaciones básicas
    if (!nombre?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: 'El correo es obligatorio.' }, { status: 400 });
    if (!password || password.length < 6) return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    if (!rut?.trim()) return NextResponse.json({ error: 'El RUT es obligatorio.' }, { status: 400 });

    // Validar RUT
    if (!validarRUT(rut)) {
      return NextResponse.json({ error: 'El RUT no es válido. Verifica el dígito verificador.' }, { status: 400 });
    }

    const rutNormalizado = normalizarRUT(rut);

    // Verificar RUT duplicado en atletas
    const { data: existente } = await admin
      .from('atletas')
      .select('id')
      .eq('rut', rutNormalizado)
      .maybeSingle();

    if (existente) {
      return NextResponse.json({ error: 'Este RUT ya está registrado.' }, { status: 409 });
    }

    // Crear usuario en auth
    const { data: userData, error: createErr } = await admin.auth.admin.createUser({
      email:         email.trim(),
      password,
      email_confirm: false,
      user_metadata: {
        nombre:   nombre.trim(),
        apellido: '',
        rol:      'alumno',
        rut:      rutNormalizado,
      },
    });

    if (createErr) {
      const msg = createErr.message ?? '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return NextResponse.json({ error: 'Ya existe una cuenta con ese correo.' }, { status: 409 });
      }
      return NextResponse.json({ error: msg || 'Error al crear la cuenta.' }, { status: 500 });
    }

    const userId = userData.user.id;

    // Actualizar atletas con RUT (el trigger ya creó la fila)
    // Reintentar hasta 3 veces si la fila aún no existe (propagación del trigger)
    for (let i = 0; i < 3; i++) {
      const { data: atletaRow } = await admin
        .from('atletas')
        .select('id')
        .eq('perfil_id', userId)
        .maybeSingle();

      if (atletaRow) {
        await admin.from('atletas').update({ rut: rutNormalizado }).eq('perfil_id', userId);
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
