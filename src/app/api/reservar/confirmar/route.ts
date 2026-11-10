import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consultarPagoFlow, datosVerificacion } from '@/lib/flow';
import { Resend } from 'resend';

export const runtime = 'nodejs';

interface ConfirmarResult {
  ok:                  boolean;
  codigo?:             string;
  ya_procesado?:       boolean;
  atleta_id?:          string | null;
  plan_id?:            string | null;
  pedido_id?:          string | null;
  nombre?:             string | null;
  apellido?:           string | null;
  email?:              string | null;
  modalidad?:          string | null;
  tipo?:               string | null;
  frecuencia_semanal?: number | null;
  monto_clp?:          number | null;
  clases_sin_agendar?: number;
}

const TIPO_LABEL: Record<string, string> = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral' };

// Flow llama a esta URL (POST con form-data) cuando se confirma el pago
export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const form  = await req.formData();
    const token = form.get('token') as string | null;

    if (!token) {
      return NextResponse.json({ error: 'token requerido' }, { status: 400 });
    }

    // El estado real se consulta siempre a Flow (nunca se confía en el request).
    const pago = await consultarPagoFlow(token);

    if (pago.status !== 2) {
      // Rechazado o anulado: se registra. Pendiente: no se hace nada todavía.
      if (pago.status === 3 || pago.status === 4) {
        const { error: updErr } = await supabaseAdmin
          .from('pedidos_planes')
          .update({ estado: pago.status === 3 ? 'fallido' : 'cancelado' })
          .eq('flow_token', token)
          .in('estado', ['pendiente', 'procesando']);
        if (updErr) {
          console.error('[reservar/confirmar] no se pudo guardar el rechazo:', updErr.message);
          return NextResponse.json({ ok: false, error: 'error_guardando' }, { status: 500 }); // Flow reintenta
        }
      }
      return NextResponse.json({ ok: true, status: pago.status });
    }

    // Verificación (orden, monto y moneda) + activación del plan + registro del
    // pago, en una sola transacción con el pedido bloqueado (migración 052).
    // Un reintento de Flow encuentra el pedido ya pagado y no duplica nada.
    const v = datosVerificacion(pago);
    const { data, error } = await supabaseAdmin.rpc('nexa_confirmar_pago_plan', {
      p_flow_token: token, p_monto: v.monto, p_moneda: v.moneda, p_commerce_order: v.orden,
    });

    if (error || !data) {
      // No se guardó: se responde error para que Flow vuelva a avisar.
      console.error('[reservar/confirmar] rpc error:', error?.message);
      return NextResponse.json({ ok: false, error: 'error_confirmando' }, { status: 500 });
    }

    const result = data as ConfirmarResult;

    if (!result.ok) {
      // No encontrado, o no coincide (queda en revisión con aviso al staff).
      // Se responde 200 para que Flow no reintente sin fin: requiere revisión manual.
      console.error('[reservar/confirmar] pago no acreditado:', result.codigo, 'pedido:', result.pedido_id ?? '-');
      return NextResponse.json({ ok: true, acreditado: false });
    }

    // Ya se había procesado antes (idempotencia) — no reenviar el correo
    if (result.ya_procesado) {
      return NextResponse.json({ ok: true });
    }

    if (result.clases_sin_agendar) {
      console.warn('[reservar/confirmar] plan activado con', result.clases_sin_agendar, 'clases sin agendar; pedido', result.pedido_id);
    }

    // Enviar email de confirmación
    if (result.email && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail    = process.env.RESEND_FROM_EMAIL ?? 'NEXA <noreply@nexafitness.cl>';
      const nombreAlumno = result.nombre ?? '';
      const tipoLabel    = TIPO_LABEL[result.tipo ?? ''] ?? result.tipo ?? '';
      const planNombre   = `Plan ${tipoLabel} ${result.modalidad ?? ''}`.trim();
      const montoTexto   = result.monto_clp ? `$${result.monto_clp.toLocaleString('es-CL')}` : '';

      await resend.emails.send({
        from:    fromEmail,
        to:      [result.email],
        subject: `¡Tu plan está confirmado! ${planNombre}`,
        html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
        <tr><td style="padding-bottom:28px;text-align:center;">
          <div style="display:inline-block;background:#0A0A0A;border-radius:12px;padding:12px 20px;">
            <span style="color:#C8E840;font-size:15px;font-weight:900;letter-spacing:4px;">NEXA</span>
          </div>
        </td></tr>
        <tr><td style="background:#fff;border-radius:20px;border:1px solid #E0E0E0;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:28px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;text-align:center;">
              <div style="font-size:40px;margin-bottom:8px;">✅</div>
              <h1 style="margin:0;font-size:22px;font-weight:900;color:#15803d;">¡Plan confirmado!</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#16a34a;">Hola ${nombreAlumno}, ya quedaste inscrito.</p>
            </td></tr>
            <tr><td style="padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:14px;border:1px solid #e8e8e8;overflow:hidden;">
                <tr><td style="padding:16px 20px;border-bottom:1px solid #e8e8e8;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Plan</p>
                  <p style="margin:0;font-size:17px;font-weight:900;color:#121212;">${planNombre}</p>
                </td></tr>
                <tr><td style="padding:16px 20px;border-bottom:1px solid #e8e8e8;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Frecuencia</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#121212;">${result.frecuencia_semanal ?? ''} veces por semana</p>
                </td></tr>
                <tr><td style="padding:14px 20px;text-align:center;background:#fefce8;">
                  <p style="margin:0;font-size:13px;font-weight:700;color:#a16207;text-transform:uppercase;letter-spacing:1px;">Pago confirmado${montoTexto ? ` · ${montoTexto}` : ''} ✓</p>
                </td></tr>
              </table>
              <p style="margin:20px 0 0;font-size:13px;color:#5e5e5e;line-height:1.6;text-align:center;">
                Nuestro equipo te va a contactar para confirmar tu coach y horario definitivo.<br>¡Te esperamos, ${nombreAlumno}!
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9b9b9b;">NEXA Fitness · Correo generado automáticamente.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }).catch((e: unknown) => console.error('[confirmar] email error:', e));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    console.error('[reservar/confirmar] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
