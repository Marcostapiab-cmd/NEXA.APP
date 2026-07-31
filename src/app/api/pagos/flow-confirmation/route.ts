import { NextRequest, NextResponse } from 'next/server';
import { consultarPagoFlow } from '@/lib/flow';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

// Flow llama a esta URL via POST cuando el alumno paga
export async function POST(req: NextRequest) {
  try {
    const body  = await req.formData();
    const token = body.get('token') as string | null;

    if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 });

    const pago = await consultarPagoFlow(token);

    // status 2 = pagado
    if (pago.status === 2) {
      await supabaseAdmin
        .from('pagos')
        .update({
          estado:     'pagado',
          fecha_pago: new Date().toISOString(),
        })
        .eq('stripe_checkout_session_id', (pago.paymentData as Record<string, unknown>)?.commerceOrder ?? '')
        .eq('estado', 'pendiente');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
