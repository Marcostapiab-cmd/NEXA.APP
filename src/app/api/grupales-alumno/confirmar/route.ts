import { NextRequest, NextResponse } from 'next/server';
import { consultarPagoFlow } from '@/lib/flow';
import { supabaseAdmin } from '@/lib/grupales-server';

export const runtime = 'nodejs';

// Webhook de Flow (POST form-data { token }). El estado real del pago se
// consulta siempre a Flow; nunca se confía en lo que llega en el request.
export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();

  try {
    const form  = await req.formData();
    const token = form.get('token')?.toString() ?? '';
    if (!token) return NextResponse.json({ error: 'Token faltante.' }, { status: 400 });

    const pago = await consultarPagoFlow(token);

    if (pago.status !== 2) {
      const estado = pago.status === 3 ? 'fallido' : pago.status === 4 ? 'cancelado' : null;
      if (estado) {
        await admin
          .from('grupales_compras')
          .update({ estado_pago: estado })
          .eq('referencia_flow', token)
          .neq('estado_pago', 'pagado');
      }
      return NextResponse.json({ ok: true, status: pago.status });
    }

    // Acreditación + reserva de la primera clase en una sola transacción
    // con la compra bloqueada (migración 034). Idempotente ante reintentos.
    const { data, error } = await admin.rpc('confirmar_compra_grupal_pago', {
      p_flow_token: token,
      p_monto:      Math.round(pago.amount),
    });

    if (error) {
      console.error('[grupales/confirmar] rpc error:', error);
      return NextResponse.json({ error: 'error_confirmando' }, { status: 500 }); // Flow reintenta
    }

    const res = data as { ok: boolean; code?: string };
    if (!res.ok) {
      // Casos que requieren revisión manual: se responde 200 para que Flow no reintente sin fin.
      console.error('[grupales/confirmar] compra no acreditada:', res.code, 'token:', token);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[grupales/confirmar] error:', err);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
