import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { DIAS_LARGO, MESES_LARGO } from '@/lib/format';

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00');
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

// Evita que un nombre/clase con caracteres HTML rompa o inyecte código en el correo.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY no configurado' }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const body = await req.json();
  const { email, nombre, apellido, clase, fecha, hora } = body as {
    email:    string;
    nombre:   string;
    apellido: string;
    clase:    string;
    fecha:    string;
    hora:     string;
  };

  if (!email || !nombre || !clase || !fecha || !hora) {
    return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
  }

  const fechaLegible  = formatFecha(fecha);
  const nombreSeguro  = escapeHtml(nombre);
  const claseSegura   = escapeHtml(clase);
  const horaSegura    = escapeHtml(hora);
  const fromEmail     = process.env.RESEND_FROM_EMAIL ?? 'NEXA <noreply@nexafitness.cl>';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reserva confirmada · NEXA</title></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">

        <!-- Logo -->
        <tr>
          <td style="padding-bottom:28px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:#121212;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;">
                <span style="color:#fff;font-size:14px;font-weight:900;letter-spacing:2px;">N</span>
              </div>
              <span style="font-size:15px;font-weight:900;letter-spacing:4px;color:#121212;">NEXA</span>
            </div>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#fff;border-radius:20px;border:1px solid #E0E0E0;overflow:hidden;">

            <!-- Header verde -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:28px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;text-align:center;">
                  <div style="font-size:36px;margin-bottom:8px;">✅</div>
                  <h1 style="margin:0;font-size:22px;font-weight:900;color:#15803d;letter-spacing:-0.5px;">
                    ¡Reserva confirmada!
                  </h1>
                  <p style="margin:6px 0 0;font-size:14px;color:#16a34a;">
                    Hola ${nombreSeguro}, tu lugar está apartado.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Detalle clase -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:28px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f8f8f8;border-radius:14px;border:1px solid #e8e8e8;overflow:hidden;">
                    <tr>
                      <td style="padding:20px 24px;border-bottom:1px solid #e8e8e8;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#9b9b9b;">Clase</p>
                        <p style="margin:0;font-size:18px;font-weight:900;color:#121212;">${claseSegura}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:20px 24px;border-bottom:1px solid #e8e8e8;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#9b9b9b;">Fecha</p>
                        <p style="margin:0;font-size:15px;font-weight:700;color:#121212;text-transform:capitalize;">${fechaLegible}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:20px 24px;border-bottom:1px solid #e8e8e8;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#9b9b9b;">Hora</p>
                        <p style="margin:0;font-size:15px;font-weight:700;color:#121212;">${horaSegura}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 24px;text-align:center;background:#fffbeb;">
                        <p style="margin:0;font-size:13px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px;">
                          Paga al llegar al estudio
                        </p>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:24px 0 0;font-size:13px;color:#5e5e5e;line-height:1.6;text-align:center;">
                    Si necesitas cancelar, contáctanos con al menos 2 horas de anticipación.<br>
                    ¡Te esperamos, ${nombreSeguro}!
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9b9b9b;">
              NEXA Fitness · Este correo fue generado automáticamente.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const { error } = await resend.emails.send({
    from:    fromEmail,
    to:      [email],
    subject: `Reserva confirmada · ${clase} — ${fechaLegible}`,
    html,
  });

  if (error) {
    console.error('[confirmacion-grupal] Resend error:', error);
    return NextResponse.json({ ok: false, error: (error as { message?: string }).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
