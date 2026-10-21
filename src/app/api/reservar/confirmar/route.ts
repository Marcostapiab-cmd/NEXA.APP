import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consultarPagoFlow } from '@/lib/flow';
import { Resend } from 'resend';

export const runtime = 'nodejs';

interface ConfirmarResult {
  ok:                 boolean;
  ya_procesado:       boolean;
  atleta_id:          string | null;
  plan_id:            string | null;
  pedido_id:          string | null;
  nombre:             string | null;
  apellido:           string | null;
  email:              string | null;
  modalidad:          string | null;
  tipo:               string | null;
  frecuencia_semanal: number | null;
  monto_clp:          number | null;
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

    // Consultar estado del pago en Flow
    const pago = await consultarPagoFlow(token);

    if (pago.status !== 2) {
      // No pagado todavía — actualizar estado si es rechazo
      if (pago.status === 3 || pago.status === 4) {
        await supabaseAdmin
          .from('pedidos_planes')
          .update({ estado: 'fallido' })
          .eq('flow_token', token)
          .eq('estado', 'procesando');
      }
      return NextResponse.json({ ok: true, status: pago.status });
    }

    // El monto pagado en Flow debe coincidir con el del pedido; si no, no se
    // acredita nada y queda para revisión manual.
    const { data: pedidoMonto } = await supabaseAdmin
      .from('pedidos_planes')
      .select('monto_clp')
      .eq('flow_token', token)
      .maybeSingle();
    if (pedidoMonto && Math.round(pago.amount) !== (pedidoMonto as { monto_clp: number }).monto_clp) {
      console.error('[confirmar] monto pagado no coincide con el pedido; token', token);
      return NextResponse.json({ ok: true });
    }

    // Toda la lógica de negocio (buscar/crear atleta, crear el plan y sus
    // reservas, marcar el pedido pagado) corre en una sola transacción de
    // Postgres con la fila del pedido bloqueada (SELECT ... FOR UPDATE
    // dentro de confirmar_pedido_plan_pago, migración 033). Si Flow
    // reintenta la entrega del webhook, la segunda llamada espera a que
    // termine la primera y encuentra el pedido ya pagado — sin duplicar
    // atletas, planes ni reservas.
    const { data, error } = await supabaseAdmin
      .rpc('confirmar_pedido_plan_pago', { p_flow_token: token })
      .single();

    if (error || !data) {
      console.error('[confirmar] rpc error:', error);
      return NextResponse.json({ ok: false, error: 'error_confirmando' }, { status: 500 });
    }

    const result = data as ConfirmarResult;

    if (!result.ok) {
      console.error('[confirmar] pedido no encontrado para token', token);
      return NextResponse.json({ ok: true }); // responder 200 a Flow de todas formas
    }

    // Ya se había procesado antes (idempotencia) — no reenviar el correo
    if (result.ya_procesado) {
      return NextResponse.json({ ok: true });
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
