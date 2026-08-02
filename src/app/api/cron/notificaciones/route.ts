import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';

function planVenceTemplate(nombre: string, planNombre: string, endDate: string) {
  const fecha = new Date(endDate + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #E0E0E0;overflow:hidden">
        <tr><td style="background:#121212;padding:24px 32px">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:900;letter-spacing:0.14em">NEXA</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#121212">Tu plan vence pronto</p>
          <p style="margin:0 0 24px;font-size:15px;color:#5E5E5E">Hola ${nombre}, te recordamos que tu plan <strong>${planNombre}</strong> vence el <strong>${fecha}</strong>.</p>
          <p style="margin:0 0 24px;font-size:15px;color:#5E5E5E">Contáctate con tu entrenador para renovar y seguir entrenando sin interrupciones.</p>
          <p style="margin:32px 0 0;font-size:12px;color:#9B9B9B">NEXA Performance — Este es un mensaje automático.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function pagosPendienteTemplate(nombre: string, monto: number, descripcion: string, checkoutUrl?: string) {
  const montoStr = monto.toLocaleString('es-CL');
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #E0E0E0;overflow:hidden">
        <tr><td style="background:#121212;padding:24px 32px">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:900;letter-spacing:0.14em">NEXA</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#121212">Tienes un pago pendiente</p>
          <p style="margin:0 0 24px;font-size:15px;color:#5E5E5E">Hola ${nombre}, tienes un cobro pendiente de <strong>$${montoStr} CLP</strong> por concepto de <strong>${descripcion || 'servicio NEXA'}</strong>.</p>
          ${checkoutUrl ? `
          <table><tr><td>
            <a href="${checkoutUrl}" style="display:inline-block;background:#121212;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:14px">
              Pagar ahora →
            </a>
          </td></tr></table>
          <p style="margin:20px 0 0;font-size:13px;color:#9B9B9B">O copia este enlace: <a href="${checkoutUrl}" style="color:#121212">${checkoutUrl}</a></p>
          ` : ''}
          <p style="margin:32px 0 0;font-size:12px;color:#9B9B9B">NEXA Performance — Este es un mensaje automático.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM ?? 'NEXA Performance <onboarding@resend.dev>';


  const hoy = new Date();
  const en3dias = new Date(hoy);
  en3dias.setDate(en3dias.getDate() + 3);
  const hace3dias = new Date(hoy);
  hace3dias.setDate(hace3dias.getDate() - 3);

  const resultados = { planesNotificados: 0, pagosNotificados: 0, errores: 0 };

  // ── 1. Planes que vencen en 3 días ────────────────────────────────────────
  const { data: planes } = await supabaseAdmin
    .from('planes')
    .select('id, nombre, end_date, alumno_id')
    .eq('end_date', en3dias.toISOString().slice(0, 10));

  if (planes && planes.length > 0) {
    const alumnoIds = [...new Set(planes.map((p: Record<string, unknown>) => String(p.alumno_id)))];
    const { data: atletasPlanes } = await supabaseAdmin
      .from('atletas')
      .select('id, nombre, email')
      .in('id', alumnoIds);

    const atletaMap = new Map(
      (atletasPlanes ?? []).map((a: Record<string, unknown>) => [String(a.id), a])
    );

    for (const plan of planes) {
      const p = plan as Record<string, unknown>;
      const atleta = atletaMap.get(String(p.alumno_id)) as Record<string, unknown> | undefined;
      if (!atleta?.email) continue;
      try {
        await resend.emails.send({
          from:    fromEmail,
          to:      String(atleta.email),
          subject: `Tu plan "${p.nombre}" vence en 3 días`,
          html:    planVenceTemplate(String(atleta.nombre), String(p.nombre), String(p.end_date)),
        });
        resultados.planesNotificados++;
      } catch {
        resultados.errores++;
      }
    }
  }

  // ── 2. Pagos pendientes hace 3+ días ─────────────────────────────────────
  const { data: pagos } = await supabaseAdmin
    .from('pagos')
    .select('id, monto, descripcion, checkout_url, alumno_id')
    .eq('estado', 'pendiente')
    .lt('created_at', hace3dias.toISOString());

  if (pagos && pagos.length > 0) {
    const alumnoIdsPagos = [...new Set(pagos.map((p: Record<string, unknown>) => String(p.alumno_id)))];
    const { data: atletasPagos } = await supabaseAdmin
      .from('atletas')
      .select('id, nombre, email')
      .in('id', alumnoIdsPagos);

    const atletaMapPagos = new Map(
      (atletasPagos ?? []).map((a: Record<string, unknown>) => [String(a.id), a])
    );

    for (const pago of pagos) {
      const p = pago as Record<string, unknown>;
      const atleta = atletaMapPagos.get(String(p.alumno_id)) as Record<string, unknown> | undefined;
      if (!atleta?.email) continue;
      try {
        await resend.emails.send({
          from:    fromEmail,
          to:      String(atleta.email),
          subject: 'Tienes un pago pendiente en NEXA',
          html:    pagosPendienteTemplate(
            String(atleta.nombre),
            Number(p.monto),
            String(p.descripcion ?? ''),
            p.checkout_url ? String(p.checkout_url) : undefined,
          ),
        });
        resultados.pagosNotificados++;
      } catch {
        resultados.errores++;
      }
    }
  }

  return NextResponse.json({ ok: true, ...resultados });
}
