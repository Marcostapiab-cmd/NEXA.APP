import { NextRequest, NextResponse } from 'next/server';
import { crearPagoFlow } from '@/lib/flow';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

export async function POST(req: NextRequest) {
  try {
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

    const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const commerceOrder = `nexa-${alumnoId.slice(0, 8)}-${Date.now()}`;

    // Crear orden en Flow
    const flow = await crearPagoFlow({
      commerceOrder,
      subject:         `${descripcion} — ${alumnoNombre}`,
      amount:          monto,
      email:           alumnoEmail,
      urlReturn:       `${baseUrl}/pagos/confirmado`,
      urlConfirmation: `${baseUrl}/api/pagos/flow-confirmation`,
    });

    // Guardar pago en pendiente
    const { data: pagoData, error: pagoError } = await supabaseAdmin
      .from('pagos')
      .insert({
        alumno_id:    alumnoId,
        plan_id:      planId ?? null,
        monto,
        moneda:       'clp',
        estado:       'pendiente',
        metodo:       'stripe',   // usamos 'stripe' como metodo genérico online; ajustar si se agrega campo flow
        descripcion,
        stripe_checkout_session_id: commerceOrder, // reusamos el campo para el commerce order de Flow
        checkout_url: flow.payUrl,
      })
      .select('id')
      .single();

    if (pagoError) throw pagoError;

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
