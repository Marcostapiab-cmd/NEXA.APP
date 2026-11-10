import { NextRequest, NextResponse } from 'next/server';
import { crearPagoFlow } from '@/lib/flow';
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
    // Solo staff (admin/profesor/recepcionista) puede generar cobros manuales.
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
      return NextResponse.json({ error: 'Solo staff puede generar cobros.' }, { status: 403 });
    }

    const body = await req.json() as {
      alumnoId:     string;
      alumnoNombre: string;
      alumnoEmail:  string;
      planId?:      string;
      monto:        number;
      descripcion:  string;
    };

    const { alumnoId, alumnoNombre, alumnoEmail, planId, monto, descripcion } = body;

    if (!alumnoId || !monto || !descripcion || !alumnoEmail) {
      return NextResponse.json({ error: 'Faltan campos requeridos (email es obligatorio para Flow)' }, { status: 400 });
    }

    if (!Number.isInteger(monto) || monto <= 0) {
      return NextResponse.json({ error: 'El monto debe ser un número entero mayor a cero.' }, { status: 400 });
    }

    const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const commerceOrder = `nexa-${alumnoId.slice(0, 8)}-${Date.now()}`;

    // 1. Registrar el cobro pendiente ANTES de crear la orden en Flow: así el
    //    aviso de pago siempre encuentra a qué cobro corresponde.
    const { data: pagoData, error: pagoError } = await supabaseAdmin
      .from('pagos')
      .insert({
        alumno_id:    alumnoId,
        plan_id:      planId ?? null,
        monto,
        moneda:       'clp',
        estado:       'pendiente',
        metodo:       'flow',
        descripcion,
        stripe_checkout_session_id: commerceOrder, // se reutiliza el campo para la orden de Flow
      })
      .select('id')
      .single();
    if (pagoError) throw pagoError;

    // 2. Crear la orden en Flow; si falla, el cobro queda como fallido.
    let flow;
    try {
      flow = await crearPagoFlow({
        commerceOrder,
        subject:         `${descripcion} — ${alumnoNombre}`,
        amount:          monto,
        email:           alumnoEmail,
        urlReturn:       `${baseUrl}/api/pagos/retorno`,
        urlConfirmation: `${baseUrl}/api/pagos/flow-confirmation`,
      });
    } catch (e) {
      await supabaseAdmin.from('pagos').update({ estado: 'fallido' }).eq('id', (pagoData as { id: string }).id);
      throw e;
    }
    const { error: urlErr } = await supabaseAdmin.from('pagos')
      .update({ checkout_url: flow.payUrl }).eq('id', (pagoData as { id: string }).id);
    if (urlErr) console.error('[crear-checkout] no se guardó el enlace de pago:', urlErr.message);

    return NextResponse.json({
      payUrl:  flow.payUrl,
      pagoId:  (pagoData as Record<string, unknown>).id,
      flowOrder: flow.flowOrder,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
