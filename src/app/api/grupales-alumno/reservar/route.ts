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
    // Verificar sesión
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

    // Buscar alumno
    const { data: alumno } = await supabaseAdmin
      .from('grupales_alumnos')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!alumno) return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 });
    const alumnoId = (alumno as { id: string }).id;

    // Verificar que la compra pertenece al alumno y tiene saldo
    const { data: compra } = await supabaseAdmin
      .from('grupales_compras')
      .select('id, clases_restantes, clases_usadas, fecha_expira, estado_pago')
      .eq('id', compra_id)
      .eq('alumno_id', alumnoId)
      .single();

    if (!compra) return NextResponse.json({ error: 'Pack no encontrado.' }, { status: 404 });

    const c = compra as {
      id: string; clases_restantes: number; clases_usadas: number;
      fecha_expira: string; estado_pago: string;
    };
    if (c.estado_pago !== 'pagado')            return NextResponse.json({ error: 'El pack no está activo.' },  { status: 400 });
    if (c.clases_restantes <= 0)               return NextResponse.json({ error: 'Sin clases disponibles.' },  { status: 400 });
    if (new Date(c.fecha_expira) < new Date()) return NextResponse.json({ error: 'El pack está vencido.' },    { status: 400 });

    // Verificar que no tenga ya una reserva activa en ese horario
    const { data: dup } = await supabaseAdmin
      .from('grupales_reservas')
      .select('id')
      .eq('alumno_id', alumnoId)
      .eq('fecha', fecha)
      .eq('hora', hora)
      .eq('estado', 'reservada')
      .maybeSingle();
    if (dup) return NextResponse.json({ error: 'Ya tienes una reserva en ese horario.' }, { status: 409 });

    // Verificar capacidad de la clase
    const { data: claseInfo } = await supabaseAdmin
      .from('clases_grupales')
      .select('capacidad')
      .eq('id', clase_id)
      .single();
    const capacidad = (claseInfo as { capacidad: number } | null)?.capacidad ?? 12;

    // Contar reservas existentes (tabla reservas + grupales_reservas)
    const [{ count: countR }, { count: countG }] = await Promise.all([
      supabaseAdmin.from('reservas')
        .select('id', { count: 'exact', head: true })
        .eq('fecha', fecha).eq('hora', hora)
        .ilike('tipo_clase', '%grupal%')
        .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa,no_show)'),
      supabaseAdmin.from('grupales_reservas')
        .select('id', { count: 'exact', head: true })
        .eq('fecha', fecha).eq('hora', hora)
        .eq('clase_id', clase_id).eq('estado', 'reservada'),
    ]);
    if ((countR ?? 0) + (countG ?? 0) >= capacidad) {
      return NextResponse.json({ error: 'No quedan cupos disponibles.' }, { status: 409 });
    }

    // Crear la reserva
    const { error: insErr } = await supabaseAdmin.from('grupales_reservas').insert({
      alumno_id:    alumnoId,
      compra_id:    c.id,
      clase_id,
      fecha,
      hora,
      nombre_clase,
      estado:       'reservada',
    });
    if (insErr) {
      console.error('[reservar] insert error:', insErr);
      return NextResponse.json({ error: 'Error al crear la reserva.' }, { status: 500 });
    }

    // Decrementar clase del pack
    await supabaseAdmin
      .from('grupales_compras')
      .update({
        clases_restantes: c.clases_restantes - 1,
        clases_usadas:    c.clases_usadas    + 1,
      })
      .eq('id', c.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[grupales/reservar] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
