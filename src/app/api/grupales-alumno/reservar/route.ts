import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

interface ReservaBody {
  clase_id:     string;
  fecha:        string;
  hora:         string;
  nombre_clase: string;
  compra_id:    string;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Verificar sesión del alumno grupal
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user || user.user_metadata?.rol !== 'grupales') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const body = await req.json() as ReservaBody;
    const { clase_id, fecha, hora, nombre_clase, compra_id } = body;
    if (!clase_id || !fecha || !hora || !nombre_clase || !compra_id) {
      return NextResponse.json({ error: 'Faltan campos.' }, { status: 400 });
    }

    // Delegar toda la lógica a la función atómica del servidor:
    // • bloqueo de cupo (SELECT FOR UPDATE en la clase)
    // • verificación de horario bloqueado
    // • chequeo de reserva duplicada
    // • verificación de capacidad
    // • decremento atómico de crédito (UPDATE WHERE clases_usadas < clases_totales)
    // • insert de reserva
    // Todo en una sola transacción — sin race conditions.
    const { data, error } = await supabaseAdmin.rpc('reservar_clase_grupal', {
      p_user_id:      user.id,
      p_clase_id:     clase_id,
      p_compra_id:    compra_id,
      p_fecha:        fecha,
      p_hora:         hora,
      p_nombre_clase: nombre_clase,
    });

    if (error) {
      console.error('[reservar] rpc error:', error);
      return NextResponse.json({ error: 'Error al procesar la reserva.' }, { status: 500 });
    }

    const result = data as { ok?: boolean; error?: string; code?: number };
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.code ?? 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[grupales/reservar] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
