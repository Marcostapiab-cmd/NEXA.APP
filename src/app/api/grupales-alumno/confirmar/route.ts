import { NextRequest, NextResponse } from 'next/server';
import { consultarPagoFlow, datosVerificacion } from '@/lib/flow';
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
        const { error: updErr } = await admin
          .from('grupales_compras')
          .update({ estado_pago: estado })
          .eq('referencia_flow', token)
          .neq('estado_pago', 'pagado');
        if (updErr) {
          console.error('[grupales/confirmar] no se pudo guardar el rechazo:', updErr.message);
          return NextResponse.json({ error: 'error_guardando' }, { status: 500 }); // Flow reintenta
        }
      }
      return NextResponse.json({ ok: true, status: pago.status });
    }

    // Moneda y número de orden deben coincidir con la compra (el monto lo
    // verifica la base). Si no, no se acredita y se avisa al staff.
    const v = datosVerificacion(pago);
    const { data: compra } = await admin.from('grupales_compras')
      .select('id, commerce_order, monto_clp, estado_pago').eq('referencia_flow', token).maybeSingle();
    if (compra && compra.estado_pago !== 'pagado') {
      const motivo = v.moneda !== 'CLP' ? 'moneda_distinta'
        : (v.orden !== null && compra.commerce_order && v.orden !== compra.commerce_order) ? 'orden_distinta'
        : null;
      if (motivo) {
        await avisarRevision(admin, token,
          `${motivo}: Flow informó $${v.monto} ${v.moneda || '—'}, orden ${v.orden ?? '—'}; compra $${compra.monto_clp} CLP, orden ${compra.commerce_order ?? '—'}`);
        return NextResponse.json({ ok: true, acreditado: false });
      }
    }

    // Acreditación + reserva de la primera clase en una sola transacción
    // con la compra bloqueada (migración 034). Idempotente ante reintentos.
    const { data, error } = await admin.rpc('confirmar_compra_grupal_pago', {
      p_flow_token: token,
      p_monto:      v.monto,
    });

    if (error) {
      console.error('[grupales/confirmar] rpc error:', error);
      return NextResponse.json({ error: 'error_confirmando' }, { status: 500 }); // Flow reintenta
    }

    const res = data as { ok: boolean; code?: string };
    if (!res.ok) {
      // Casos que requieren revisión manual: se responde 200 para que Flow no reintente sin fin.
      console.error('[grupales/confirmar] compra no acreditada:', res.code);
      if (res.code === 'monto_distinto') {
        await avisarRevision(admin, token, `monto_distinto: Flow informó $${v.monto} ${v.moneda}`);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[grupales/confirmar] error:', err);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}

// Deja la alerta en "Requiere atención" (incidencia de prioridad alta).
async function avisarRevision(admin: ReturnType<typeof supabaseAdmin>, token: string, detalle: string) {
  const { error } = await admin.rpc('nexa_incidencia', {
    p_tipo: 'pago_no_coincide', p_prioridad: 'alta', p_clave: `grupal_revision:${token}`,
    p_titulo: 'Pago de clase grupal por revisar',
    p_descripcion: `Flow informó un pago que no coincide con la compra (${detalle}). No se acreditó.`,
    p_accion: 'Revisar el pago en Flow y acreditar o devolver a mano.',
  });
  if (error) console.error('[grupales/confirmar] no se pudo registrar la alerta:', error.message);
}
