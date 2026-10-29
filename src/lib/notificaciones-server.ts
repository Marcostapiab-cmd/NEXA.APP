// Envío de la cola `notificaciones` (migración 041). Solo servidor.
// Cada aviso tiene una `clave` única en la base, así que nunca se encola dos
// veces; aquí además se "reclama" antes de enviar para que dos procesos
// simultáneos no manden el mismo correo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const MAX_INTENTOS = 3;

interface ResumenPlan {
  nombre?: string; modalidad?: string; fin?: string;
  contratadas?: number; realizadas?: number; pendientes?: number; disponibles?: number; agendadas?: number;
}
interface Datos {
  fecha?: string; hora?: string; modalidad?: string; profesor?: string | null;
  anterior?: { fecha?: string; hora?: string };
  plan?: ResumenPlan | null;
  proxima?: { fecha?: string; hora?: string; profesor?: string | null } | null;
  aviso_restantes?: boolean;
  horas?: number; limite?: string; a_tiempo?: boolean;
  estado?: string;
}

const MODALIDAD: Record<string, string> = {
  '1:1': 'Entrenamiento personalizado 1:1',
  '2:1': 'Entrenamiento semipersonalizado 2:1',
};

function fechaLarga(f?: string): string {
  if (!f) return '';
  return new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

function fechaHoraChile(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
  });
}

function hoyChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

const n = (v: unknown) => (typeof v === 'number' ? String(v) : '');

/** Filas con el estado real del plan (sale de la base de datos al registrar la clase). */
function filasPlan(d: Datos): [string, string][] {
  const p = d.plan ?? {};
  const prox = d.proxima ? `${fechaLarga(d.proxima.fecha)} a las ${d.proxima.hora ?? ''}` : 'Sin clases agendadas';
  return [
    ['Plan', [p.nombre, p.modalidad].filter(Boolean).join(' · ')],
    ['Contratadas', n(p.contratadas)],
    ['Realizadas', n(p.realizadas)],
    ['Pendientes', n(p.pendientes)],
    ['Para reservar', n(p.disponibles)],
    ['Próximo', prox],
    ['Vence', fechaLarga(p.fin)],
  ];
}

function textoRestantes(p?: ResumenPlan | null): string {
  const k = p?.pendientes ?? 0;
  if (k === 0) return 'Completaste todas las clases de tu plan. Puedes renovarlo desde MI NEXA.';
  return `Te ${k === 1 ? 'queda 1 clase' : `quedan ${k} clases`} por realizar. Tu plan vence el ${fechaLarga(p?.fin)}.`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function plantilla(titulo: string, intro: string, filas: [string, string][], cierre: string, appUrl: string): string {
  const tabla = filas.filter(([, v]) => v).map(([k, v]) => `
    <tr><td style="padding:6px 0;color:#9B9B9B;font-size:13px;width:110px">${esc(k)}</td>
        <td style="padding:6px 0;color:#121212;font-size:15px;font-weight:600">${esc(v)}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #E0E0E0;overflow:hidden">
<tr><td style="background:#121212;padding:24px 32px"><p style="margin:0;color:#fff;font-size:16px;font-weight:900;letter-spacing:0.18em">NEXA PERFORMANCE</p></td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#121212">${esc(titulo)}</p>
<p style="margin:0 0 20px;font-size:15px;color:#5E5E5E">${esc(intro)}</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #EEE;border-bottom:1px solid #EEE;margin-bottom:20px">${tabla}</table>
<p style="margin:0 0 24px;font-size:15px;color:#121212;font-weight:600">${esc(cierre)}</p>
<a href="${esc(appUrl)}/portal/clases" style="display:inline-block;background:#121212;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px">Ver mis clases</a>
<p style="margin:32px 0 0;font-size:12px;color:#9B9B9B">NEXA Performance — Este es un mensaje automático.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function armarCorreo(tipo: string, nombre: string, d: Datos, appUrl: string): { asunto: string; html: string } | null {
  const filas: [string, string][] = [
    ['Fecha', fechaLarga(d.fecha)],
    ['Hora', d.hora ?? ''],
    ['Modalidad', MODALIDAD[d.modalidad ?? ''] ?? ''],
    ['Profesor', d.profesor ?? ''],
  ];
  const hola = `Hola ${nombre}.`;
  switch (tipo) {
    case 'reserva_confirmada':
      return { asunto: 'Tu entrenamiento está confirmado', html: plantilla('Tu entrenamiento está confirmado', hola, filas, 'Nos vemos en NEXA.', appUrl) };
    case 'reserva_reagendada':
      return {
        asunto: 'Tu clase fue reagendada',
        html: plantilla('Tu clase fue reagendada',
          `${hola} Movimos tu clase del ${fechaLarga(d.anterior?.fecha)} a las ${d.anterior?.hora ?? ''}. Tu nuevo horario:`,
          filas, 'Tus horarios fijos de las próximas semanas siguen igual. Nos vemos en NEXA.', appUrl),
      };
    case 'reserva_cancelada':
      return {
        asunto: 'Tu clase fue cancelada',
        html: plantilla('Cancelaste tu clase a tiempo', `${hola} Conservas el crédito de esta clase y puedes usarlo para reservar otro horario.`,
          filas, 'Tus horarios fijos de las próximas semanas siguen igual.', appUrl),
      };
    case 'cupo_liberado':
      return {
        asunto: 'Se liberó un cupo que estabas esperando',
        html: plantilla('Se liberó un cupo', `${hola} Se liberó el horario que pediste. El cupo no queda reservado hasta que lo confirmes en MI NEXA.`,
          filas, 'Reserva pronto: otros alumnos también pueden tomarlo.', appUrl),
      };
    case 'recordatorio_clase': {
      const esHoy = d.fecha?.slice(0, 10) === hoyChile();
      const titulo = esHoy ? `Hoy entrenas a las ${d.hora ?? ''}` : `Entrenas el ${fechaLarga(d.fecha)}`;
      const plazo = d.limite
        ? (d.a_tiempo
            ? `Puedes cancelar o reagendar sin perder la clase hasta el ${fechaHoraChile(d.limite)}.`
            : 'El plazo para cancelar o reagendar sin perder la clase ya terminó.')
        : '';
      return {
        asunto: esHoy ? `Hoy entrenas en NEXA a las ${d.hora ?? ''}` : 'Mañana entrenas en NEXA',
        html: plantilla(titulo, `${hola} ${plazo}`, [...filas, ['Estado', 'Confirmada']], 'Nos vemos en NEXA.', appUrl),
      };
    }
    case 'clase_realizada': {
      const esHoy = d.fecha?.slice(0, 10) === hoyChile();
      const titulo = esHoy ? 'Tu entrenamiento de hoy está registrado' : `Tu entrenamiento del ${fechaLarga(d.fecha)} está registrado`;
      const intro = `${hola} Tu entrenamiento se registró correctamente.${d.aviso_restantes ? ' ' + textoRestantes(d.plan) : ''}`;
      return { asunto: titulo, html: plantilla(titulo, intro, filasPlan(d), 'Nos vemos en tu próximo entrenamiento.', appUrl) };
    }
    case 'inasistencia':
      return {
        asunto: 'Registramos una inasistencia en NEXA',
        html: plantilla('Registramos una inasistencia',
          `${hola} No registramos tu asistencia a la clase del ${fechaLarga(d.fecha)} a las ${d.hora ?? ''}. Según el reglamento, esta clase se descuenta de tu plan.${d.aviso_restantes ? ' ' + textoRestantes(d.plan) : ''}`,
          filasPlan(d), 'Si crees que es un error, escríbenos desde MI NEXA.', appUrl),
      };
    case 'cancelacion_tardia':
      return {
        asunto: 'Tu clase se canceló fuera de plazo',
        html: plantilla('Cancelación fuera de plazo',
          `${hola} La clase del ${fechaLarga(d.fecha)} a las ${d.hora ?? ''} se canceló después del plazo permitido, por lo que se descuenta de tu plan.${d.aviso_restantes ? ' ' + textoRestantes(d.plan) : ''}`,
          filasPlan(d), 'Si necesitas asistencia, contáctanos desde MI NEXA.', appUrl),
      };
    case 'clases_restantes': {
      const k = d.plan?.pendientes ?? 0;
      return {
        asunto: k === 0 ? 'Completaste las clases de tu plan NEXA' : `Te ${k === 1 ? 'queda 1 clase' : `quedan ${k} clases`} en NEXA`,
        html: plantilla(k === 0 ? 'Completaste tu plan' : 'Tu plan está próximo a finalizar',
          `${hola} ${textoRestantes(d.plan)} Puedes revisar tus entrenamientos y renovar tu plan directamente desde MI NEXA.`,
          filasPlan(d), 'Nos vemos en tu próximo entrenamiento.', appUrl),
      };
    }
    case 'asistencia_corregida':
      return {
        asunto: 'Corregimos el registro de tu entrenamiento',
        html: plantilla('Corrección de asistencia',
          `${hola} Corregimos el registro de tu clase del ${fechaLarga(d.fecha)} a las ${d.hora ?? ''}. Este es el estado actualizado de tu plan:`,
          filasPlan(d), 'Disculpa las molestias.', appUrl),
      };
    default:
      return null;
  }
}

export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export interface ResultadoEnvio { enviadas: number; errores: number; omitidas: number; sinConfigurar?: boolean }

/** Envía hasta `limite` avisos pendientes. Sin RESEND_API_KEY no envía nada y los deja en cola. */
export async function procesarCola(db: SupabaseClient = adminClient(), limite = 20): Promise<ResultadoEnvio> {
  const out: ResultadoEnvio = { enviadas: 0, errores: 0, omitidas: 0 };
  if (!process.env.RESEND_API_KEY) return { ...out, sinConfigurar: true };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM ?? 'NEXA Performance <onboarding@resend.dev>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const { data: pendientes } = await db.from('notificaciones')
    .select('id, atleta_id, tipo, datos, intentos, estado')
    .in('estado', ['pendiente', 'error']).lt('intentos', MAX_INTENTOS)
    .eq('canal', 'email')
    .order('created_at').limit(limite);

  for (const n of pendientes ?? []) {
    // Reclamar: si otro proceso ya la tomó, este update no devuelve filas.
    const { data: tomada } = await db.from('notificaciones')
      .update({ estado: 'enviando', intentos: Number(n.intentos) + 1 })
      .eq('id', n.id).eq('estado', n.estado).select('id');
    if (!tomada?.length) continue;

    const { data: atleta } = await db.from('atletas').select('nombre, email').eq('id', n.atleta_id).maybeSingle();
    const correo = atleta?.email ? armarCorreo(String(n.tipo), String(atleta.nombre ?? ''), (n.datos ?? {}) as Datos, appUrl) : null;
    if (!correo) {
      await db.from('notificaciones').update({ estado: 'omitida', error: atleta?.email ? 'tipo sin plantilla' : 'alumno sin email' }).eq('id', n.id);
      out.omitidas++;
      continue;
    }
    const { error } = await resend.emails.send({ from, to: String(atleta!.email), subject: correo.asunto, html: correo.html });
    if (error) {
      await db.from('notificaciones').update({ estado: 'error', error: error.message }).eq('id', n.id);
      out.errores++;
    } else {
      await db.from('notificaciones').update({ estado: 'enviada', enviada_at: new Date().toISOString(), error: null }).eq('id', n.id);
      out.enviadas++;
    }
  }
  return out;
}
