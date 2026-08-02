import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consultarPagoFlow } from '@/lib/flow';
import { Resend } from 'resend';

export const runtime = 'nodejs';

const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
               'septiembre','octubre','noviembre','diciembre'];

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

interface Pedido {
  id:         string;
  plan_id:    string;
  clase_id:   string;
  fecha:      string;
  hora:       string;
  nombre:     string;
  apellido:   string;
  email:      string | null;
  telefono:   string | null;
  rut:        string | null;
  monto_clp:  number;
  estado:     string;
  flow_order: number | null;
  planes_grupales: { nombre: string } | null;
  clases_grupales: { nombre: string; hora: string } | null;
}

interface Atleta {
  id: string;
}

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
          .from('pedidos_grupales')
          .update({ estado: 'fallido' })
          .eq('flow_token', token)
          .eq('estado', 'procesando');
      }
      return NextResponse.json({ ok: true, status: pago.status });
    }

    // Buscar pedido por flow_token
    const { data: pedidoData, error: pedidoErr } = await supabaseAdmin
      .from('pedidos_grupales')
      .select('*, planes_grupales(nombre), clases_grupales(nombre, hora)')
      .eq('flow_token', token)
      .single();

    if (pedidoErr || !pedidoData) {
      console.error('[confirmar] pedido no encontrado para token', token);
      return NextResponse.json({ ok: true }); // responder 200 a Flow de todas formas
    }

    const pedido = pedidoData as Pedido;

    // Idempotencia: si ya está pagado, no crear de nuevo
    if (pedido.estado === 'pagado') {
      return NextResponse.json({ ok: true });
    }

    // Buscar o crear atleta
    let atletaId: string | null = null;

    if (pedido.email || pedido.telefono) {
      const orConditions: string[] = [];
      if (pedido.email)    orConditions.push(`email.eq.${pedido.email}`);
      if (pedido.telefono) orConditions.push(`telefono.eq.${pedido.telefono}`);

      const { data: atletaExistente } = await supabaseAdmin
        .from('atletas')
        .select('id')
        .or(orConditions.join(','))
        .limit(1)
        .maybeSingle();

      atletaId = (atletaExistente as Atleta | null)?.id ?? null;
    }

    if (!atletaId) {
      const { data: nuevoAtleta, error: atletaErr } = await supabaseAdmin
        .from('atletas')
        .insert({
          nombre:    pedido.nombre,
          apellido:  pedido.apellido,
          email:     pedido.email    || null,
          telefono:  pedido.telefono || null,
          rut:       pedido.rut      || null,
          activo:    true,
        })
        .select('id')
        .single();

      if (atletaErr || !nuevoAtleta) {
        console.error('[confirmar] error creando atleta:', atletaErr);
        return NextResponse.json({ ok: false, error: 'error_atleta' }, { status: 500 });
      }
      atletaId = (nuevoAtleta as Atleta).id;
    }

    // Clase info
    const claseNombre = pedido.clases_grupales?.nombre ?? 'Clase grupal';
    const claseHora   = pedido.clases_grupales?.hora   ?? pedido.hora;

    // Crear reserva (evitar duplicado)
    const { data: reservaExistente } = await supabaseAdmin
      .from('reservas')
      .select('id')
      .eq('alumno_id', atletaId)
      .eq('fecha', pedido.fecha)
      .eq('hora', claseHora)
      .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa,no_show)')
      .maybeSingle();

    let reservaId: number | null = null;

    if (!reservaExistente) {
      const { data: nuevaReserva, error: reservaErr } = await supabaseAdmin
        .from('reservas')
        .insert({
          alumno_id:  atletaId,
          plan_id:    null,
          fecha:      pedido.fecha,
          hora:       claseHora,
          tipo_clase: 'Grupal',
          estado:     'pendiente',
          descripcion: claseNombre,
        })
        .select('id')
        .single();

      if (reservaErr || !nuevaReserva) {
        console.error('[confirmar] error creando reserva:', reservaErr);
        return NextResponse.json({ ok: false, error: 'error_reserva' }, { status: 500 });
      }
      reservaId = (nuevaReserva as { id: number }).id;
    } else {
      reservaId = (reservaExistente as { id: number }).id;
    }

    // Marcar pedido como pagado
    await supabaseAdmin
      .from('pedidos_grupales')
      .update({
        estado:        'pagado',
        atleta_id:     atletaId,
        reserva_id:    reservaId,
        confirmado_at: new Date().toISOString(),
      })
      .eq('id', pedido.id);

    // Enviar email de confirmación
    if (pedido.email && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'NEXA <noreply@nexafitness.cl>';
      const fechaLegible = formatFecha(pedido.fecha);
      const planNombre   = pedido.planes_grupales?.nombre ?? 'Pack de prueba';

      await resend.emails.send({
        from:    fromEmail,
        to:      [pedido.email],
        subject: `¡Reserva confirmada! ${claseNombre} — ${fechaLegible}`,
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
              <h1 style="margin:0;font-size:22px;font-weight:900;color:#15803d;">¡Reserva confirmada!</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#16a34a;">Hola ${pedido.nombre}, tu lugar está apartado.</p>
            </td></tr>
            <tr><td style="padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:14px;border:1px solid #e8e8e8;overflow:hidden;">
                <tr><td style="padding:16px 20px;border-bottom:1px solid #e8e8e8;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Clase</p>
                  <p style="margin:0;font-size:17px;font-weight:900;color:#121212;">${claseNombre}</p>
                </td></tr>
                <tr><td style="padding:16px 20px;border-bottom:1px solid #e8e8e8;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Fecha y hora</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#121212;text-transform:capitalize;">${fechaLegible} · ${claseHora}</p>
                </td></tr>
                <tr><td style="padding:16px 20px;border-bottom:1px solid #e8e8e8;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Pack</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#121212;">${planNombre}</p>
                </td></tr>
                <tr><td style="padding:14px 20px;text-align:center;background:#fefce8;">
                  <p style="margin:0;font-size:13px;font-weight:700;color:#a16207;text-transform:uppercase;letter-spacing:1px;">Pago confirmado ✓</p>
                </td></tr>
              </table>
              <p style="margin:20px 0 0;font-size:13px;color:#5e5e5e;line-height:1.6;text-align:center;">
                Si necesitas cancelar, contáctanos con anticipación.<br>¡Te esperamos, ${pedido.nombre}!
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
