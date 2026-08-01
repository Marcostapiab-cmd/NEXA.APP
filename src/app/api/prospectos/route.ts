import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    nombre:   string;
    apellido?: string;
    email?:   string;
    telefono?: string;
    objetivo?: string;
    mensaje?:  string;
  };

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  }

  // Guardar usando supabase anon (la policy permite INSERT a anon)
  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { error: dbError } = await supabaseAnon.from('prospectos').insert({
    nombre:   body.nombre.trim(),
    apellido: body.apellido?.trim() || null,
    email:    body.email?.trim()    || null,
    telefono: body.telefono?.trim() || null,
    objetivo: body.objetivo         || null,
    mensaje:  body.mensaje?.trim()  || null,
  });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Notificar al admin por email (si Resend está configurado)
  const adminEmail = process.env.ADMIN_EMAIL;
  if (process.env.RESEND_API_KEY && adminEmail) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from   = process.env.RESEND_FROM ?? 'NEXA Performance <onboarding@resend.dev>';

    const objetivoLabel: Record<string, string> = {
      perdida_peso:  'Bajar de peso',
      masa_muscular: 'Ganar masa muscular',
      rendimiento:   'Mejorar rendimiento',
      salud_general: 'Salud y bienestar',
    };

    await resend.emails.send({
      from,
      to:      adminEmail,
      subject: `🆕 Nuevo prospecto: ${body.nombre} ${body.apellido ?? ''}`.trim(),
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#121212;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="margin:0;color:#fff;font-size:16px;font-weight:900;letter-spacing:0.14em">NEXA</p>
          </div>
          <div style="background:#fff;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
            <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#121212">Nuevo prospecto desde /unirse</p>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#5e5e5e;font-size:13px;width:120px">Nombre</td><td style="padding:8px 0;font-weight:600;color:#121212">${body.nombre} ${body.apellido ?? ''}</td></tr>
              ${body.email    ? `<tr><td style="padding:8px 0;color:#5e5e5e;font-size:13px">Email</td><td style="padding:8px 0;font-weight:600;color:#121212">${body.email}</td></tr>` : ''}
              ${body.telefono ? `<tr><td style="padding:8px 0;color:#5e5e5e;font-size:13px">Teléfono</td><td style="padding:8px 0;font-weight:600;color:#121212">${body.telefono}</td></tr>` : ''}
              ${body.objetivo ? `<tr><td style="padding:8px 0;color:#5e5e5e;font-size:13px">Objetivo</td><td style="padding:8px 0;font-weight:600;color:#121212">${objetivoLabel[body.objetivo] ?? body.objetivo}</td></tr>` : ''}
              ${body.mensaje  ? `<tr><td style="padding:8px 0;color:#5e5e5e;font-size:13px;vertical-align:top">Mensaje</td><td style="padding:8px 0;color:#121212">${body.mensaje}</td></tr>` : ''}
            </table>
          </div>
        </div>
      `,
    }).catch(() => {}); // no fallar si el email falla
  }

  return NextResponse.json({ ok: true });
}
