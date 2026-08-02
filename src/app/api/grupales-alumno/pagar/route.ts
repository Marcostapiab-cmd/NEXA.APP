import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { crearPagoFlow } from '@/lib/flow';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

interface Pack {
  nombre:       string;
  num_clases:   number;
  precio_clp:   number;
  validez_dias: number;
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

    const { pack_id } = await req.json() as { pack_id: string };
    if (!pack_id) return NextResponse.json({ error: 'Falta pack_id.' }, { status: 400 });

    // Buscar pack
    const { data: pack, error: packErr } = await supabaseAdmin
      .from('grupales_packs')
      .select('nombre, num_clases, precio_clp, validez_dias')
      .eq('id', pack_id)
      .eq('activo', true)
      .single();
    if (packErr || !pack) {
      return NextResponse.json({ error: 'Pack no encontrado.' }, { status: 404 });
    }
    const p = pack as Pack;

    // Buscar alumno
    const { data: alumno, error: alumnoErr } = await supabaseAdmin
      .from('grupales_alumnos')
      .select('id, email')
      .eq('user_id', user.id)
      .single();
    if (alumnoErr || !alumno) {
      return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 });
    }
    const al = alumno as { id: string; email: string };

    const baseUrl       = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const commerceOrder = `gpack-${al.id.slice(0, 8)}-${Date.now()}`;

    // Fecha de expiración (se calculará cuando se confirme el pago)
    const fechaExpiraProvisional = new Date();
    fechaExpiraProvisional.setDate(fechaExpiraProvisional.getDate() + p.validez_dias);

    // Crear compra pendiente
    const { data: compra, error: compraErr } = await supabaseAdmin
      .from('grupales_compras')
      .insert({
        alumno_id:        al.id,
        pack_id,
        clases_totales:   p.num_clases,
        clases_restantes: p.num_clases,
        fecha_expira:     fechaExpiraProvisional.toISOString(),
        estado_pago:      'pendiente',
        commerce_order:   commerceOrder,
        monto_clp:        p.precio_clp,
      })
      .select('id')
      .single();

    if (compraErr || !compra) {
      console.error('[grupales/pagar] compra insert error:', compraErr);
      return NextResponse.json({ error: 'Error al crear la orden.' }, { status: 500 });
    }
    const compraId = (compra as { id: string }).id;

    // Crear pago en Flow
    const flow = await crearPagoFlow({
      commerceOrder,
      subject:         `${p.nombre} — NEXA Clases Grupales`,
      amount:          p.precio_clp,
      email:           al.email,
      urlReturn:       `${baseUrl}/grupales-alumno/retorno`,
      urlConfirmation: `${baseUrl}/api/grupales-alumno/confirmar`,
    });

    // Guardar flow_token en compra
    await supabaseAdmin
      .from('grupales_compras')
      .update({
        referencia_flow: flow.token,
        flow_order:      String(flow.flowOrder),
        estado_pago:     'pendiente',
      })
      .eq('id', compraId);

    return NextResponse.json({ payUrl: flow.payUrl, compraId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[grupales/pagar] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
