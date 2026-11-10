import { NextRequest, NextResponse } from 'next/server';
import { consultarPagoFlow, datosVerificacion } from '@/lib/flow';
import { clienteServicio } from '@/lib/auth-server';

export const runtime = 'nodejs';

// Flow llama a esta URL (POST, servidor a servidor) cuando el alumno paga un
// cobro manual creado por el staff (/api/pagos/crear-checkout).
// El estado se consulta siempre a Flow; la base verifica orden, monto y moneda
// y marca el pago una sola vez (migración 052).
export async function POST(req: NextRequest) {
  try {
    const body  = await req.formData();
    const token = body.get('token') as string | null;
    if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 });

    const pago = await consultarPagoFlow(token);
    const db = clienteServicio();
    const v = datosVerificacion(pago);

    if (pago.status === 3 || pago.status === 4) {
      if (v.orden) {
        const { error } = await db.from('pagos').update({ estado: 'fallido' })
          .eq('stripe_checkout_session_id', v.orden).eq('estado', 'pendiente');
        if (error) return NextResponse.json({ error: 'error_guardando' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, status: pago.status });
    }
    if (pago.status !== 2) return NextResponse.json({ ok: true, status: pago.status });

    if (!pago.commerceOrder) {
      console.error('[flow-confirmation] Flow no informó el número de orden');
      return NextResponse.json({ ok: true, acreditado: false });
    }

    const { data, error } = await db.rpc('nexa_confirmar_cobro_manual', {
      p_commerce_order: pago.commerceOrder, p_monto: v.monto, p_moneda: v.moneda, p_flow_token: token,
    });
    if (error) {
      // No se guardó: error para que Flow reintente.
      console.error('[flow-confirmation] rpc error:', error.message);
      return NextResponse.json({ error: 'error_confirmando' }, { status: 500 });
    }
    const r = data as { ok: boolean; codigo?: string };
    if (!r.ok) console.error('[flow-confirmation] cobro no acreditado:', r.codigo);
    return NextResponse.json({ ok: true, acreditado: r.ok });
  } catch (err) {
    console.error('[flow-confirmation] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
