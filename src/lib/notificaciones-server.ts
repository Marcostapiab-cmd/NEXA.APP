// Envío de la cola `notificaciones` (migración 041). Solo servidor.
// Cada aviso tiene una `clave` única en la base, así que nunca se encola dos
// veces; aquí además se "reclama" antes de enviar para que dos procesos
// simultáneos no manden el mismo correo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { horaChile as instanteChile } from './politica-cancelacion';

const MAX_INTENTOS = 3;

interface ResumenPlan {
  nombre?: string; modalidad?: string; fin?: string;
  contratadas?: number; realizadas?: number; pendientes?: number; disponibles?: number; agendadas?: number;
}
export interface Datos {
  fecha?: string; hora?: string; modalidad?: string; profesor?: string | null;
  anterior?: { fecha?: string; hora?: string };
  plan?: ResumenPlan | null;
  proxima?: { fecha?: string; hora?: string; profesor?: string | null } | null;
  aviso_restantes?: boolean;
  horas?: number; limite?: string; a_tiempo?: boolean;
  estado?: string;
  // Renovaciones
  dias?: number; precio?: number; tipo?: string; motivo?: string; cantidad?: number;
  hasta?: string; retencion_hasta?: string; sobrantes?: number; vencidas?: number; creadas?: number;
  // Centro de ayuda
  tema?: string; mensaje?: string; respuesta?: string;
  // Operación
  profesor_anterior?: string | null; turno_hasta?: string | null;
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
const clp = (v?: number) => (typeof v === 'number' ? `$${v.toLocaleString('es-CL')}` : '');
const RENOVAR = { texto: 'Renovar mi plan', ruta: '/portal/renovar' };
const MI_NEXA = { texto: 'Ir a MI NEXA', ruta: '/portal' };
const AYUDA = { texto: 'Ver en el Centro de Ayuda', ruta: '/portal/ayuda' };

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

function horaChile(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function plantilla(titulo: string, intro: string, filas: [string, string][], cierre: string, appUrl: string,
                   cta: { texto: string; ruta: string } = { texto: 'Ver mis clases', ruta: '/portal/clases' }): string {
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
<a href="${esc(appUrl)}${esc(cta.ruta)}" style="display:inline-block;background:#121212;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px">${esc(cta.texto)}</a>
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
          filas,
          d.turno_hasta
            ? `Tienes prioridad hasta las ${horaChile(d.turno_hasta)}. Después avisaremos al siguiente alumno de la lista.`
            : 'Reserva pronto: otros alumnos también pueden tomarlo.',
          appUrl),
      };
    case 'clase_suspendida':
      return {
        asunto: 'NEXA suspendió una de tus clases',
        html: plantilla('Suspendimos tu clase',
          `${hola} Tuvimos que suspender esta clase${d.motivo ? ` (${d.motivo})` : ''}. No pierdes tu crédito: puedes reservar otro horario desde MI NEXA.`,
          filas, 'Disculpa las molestias. Tus otras clases siguen igual.', appUrl,
          { texto: 'Reservar otro horario', ruta: '/portal/clases' }),
      };
    case 'cambio_profesor':
      return {
        asunto: 'Cambio de profesor en tu clase',
        html: plantilla('Cambio de profesor',
          `${hola} ${d.profesor_anterior ? `${d.profesor_anterior} no podrá hacer tu clase` : 'Tu profesor no podrá hacer tu clase'}${d.motivo ? ` (${d.motivo})` : ''}. La mantenemos en el mismo horario con otro profesor:`,
          filas, 'Si prefieres otro horario, puedes reagendarla desde MI NEXA dentro del plazo habitual.', appUrl),
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
    case 'renovacion_recordatorio': {
      const k = d.dias ?? 0;
      const cuando = k === 0 ? 'hoy' : k === 1 ? 'mañana' : `en ${k} días`;
      const sobran = d.plan?.pendientes ?? 0;
      return {
        asunto: k === 0 ? 'Tu plan NEXA vence hoy' : `Tu plan NEXA vence ${cuando}`,
        html: plantilla(`Tu plan vence ${cuando}`,
          `${hola} Tu plan vence el ${fechaLarga(d.plan?.fin)}.${sobran > 0 ? ` Te ${sobran === 1 ? 'queda 1 clase' : `quedan ${sobran} clases`}: si renuevas, pasan a tu próximo período; si no, vencen con el plan.` : ''} Al renovar conservas tus horarios fijos.`,
          [...filasPlan(d), ['Renovación', clp(d.precio)]],
          `Si no renuevas, guardamos tus horarios hasta el ${fechaLarga(d.retencion_hasta)}.`, appUrl, RENOVAR),
      };
    }
    case 'renovacion_recibida':
      return {
        asunto: 'Recibimos tu comprobante de pago',
        html: plantilla('Recibimos tu comprobante',
          `${hola} Recibimos el comprobante de tu renovación ${d.tipo ?? ''} por ${clp(d.precio)}. Lo revisaremos y te avisaremos cuando tu plan quede activo.`,
          [], 'Tu plan se activa cuando confirmemos el abono.', appUrl, RENOVAR),
      };
    case 'renovacion_aprobada':
      return {
        asunto: 'Tu plan NEXA está renovado',
        html: plantilla('Tu plan está renovado',
          `${hola} Confirmamos tu pago. Tu nuevo período ya está activo${d.creadas ? ` y agendamos ${d.creadas} clases en tus horarios fijos` : ''}.`,
          filasPlan(d), 'Gracias por seguir entrenando con nosotros.', appUrl),
      };
    case 'renovacion_rechazada':
      return {
        asunto: 'No pudimos confirmar tu pago',
        html: plantilla('No pudimos confirmar tu pago',
          `${hola} Revisamos tu solicitud de renovación y no pudimos confirmarla. Motivo: ${d.motivo ?? ''}.`,
          [], 'Puedes volver a solicitarla desde MI NEXA o escribirnos.', appUrl, RENOVAR),
      };
    case 'clases_arrastradas':
      return {
        asunto: `Sumamos ${d.cantidad ?? ''} clases a tu nuevo período`,
        html: plantilla('Tus clases pendientes pasaron a tu nuevo período',
          `${hola} Como renovaste, las ${d.cantidad ?? ''} clases que te quedaban sin usar se sumaron a tu nuevo plan.`,
          filasPlan(d), 'Nos vemos en tu próximo entrenamiento.', appUrl),
      };
    case 'horarios_retenidos':
      return {
        asunto: 'Tu plan venció: guardamos tus horarios',
        html: plantilla('Guardamos tus horarios',
          `${hola} Tu plan terminó. Te guardamos tus horarios fijos hasta el ${fechaLarga(d.hasta)}: si renuevas antes, los conservas.${d.sobrantes ? ` También recuperas las ${d.sobrantes} clases que te quedaron.` : ''}`,
          [], 'Renueva desde MI NEXA en pocos pasos.', appUrl, RENOVAR),
      };
    case 'horarios_por_liberar':
      return {
        asunto: 'Mañana liberamos tus horarios en NEXA',
        html: plantilla('Último día para conservar tus horarios',
          `${hola} Tus horarios fijos están guardados hasta el ${fechaLarga(d.hasta)}. Después quedarán disponibles para otros alumnos.`,
          [], 'Renueva hoy para no perderlos.', appUrl, RENOVAR),
      };
    case 'horarios_liberados':
      return {
        asunto: 'Liberamos tus horarios en NEXA',
        html: plantilla('Liberamos tus horarios',
          `${hola} Como no se renovó tu plan, liberamos tus horarios fijos.${d.vencidas ? ` Las ${d.vencidas} clases que no se usaron vencieron con el plan.` : ''} Cuando quieras volver, te esperamos.`,
          [], 'Puedes contratar un nuevo plan desde nuestra página.', appUrl, MI_NEXA),
      };
    case 'solicitud_recibida':
      return {
        asunto: 'Recibimos tu consulta',
        html: plantilla('Recibimos tu consulta',
          `${hola} Tu consulta ya está con el equipo de NEXA. Te responderemos por este medio y también podrás ver la respuesta en MI NEXA.`,
          [['Tema', d.tema ?? ''], ['Mensaje', d.mensaje ?? '']], 'Gracias por escribirnos.', appUrl, AYUDA),
      };
    case 'solicitud_respondida':
      return {
        asunto: 'Respondimos tu consulta',
        html: plantilla('Respondimos tu consulta', `${hola} Esta es la respuesta del equipo de NEXA:`,
          [['Tema', d.tema ?? ''], ['Tu consulta', d.mensaje ?? ''], ['Respuesta', d.respuesta ?? '']],
          'Si necesitas algo más, puedes enviar otra consulta desde el Centro de Ayuda.', appUrl, AYUDA),
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

export interface ResultadoEnvio { enviadas: number; errores: number; omitidas: number; recuperadas?: number; sinConfigurar?: boolean }

/** Un envío "enviando" más viejo que esto se considera interrumpido. */
export const MINUTOS_ATASCADA = 15;

/** Recordatorios de una clase que ya empezó no se envían (p. ej. tras días sin procesar la cola). */
export function recordatorioVencido(tipo: string, d: Datos, ahora = new Date()): boolean {
  if (tipo !== 'recordatorio_clase' || !d.fecha || !d.hora) return false;
  return instanteChile(d.fecha, d.hora).getTime() <= ahora.getTime();
}

/**
 * Envía hasta `limite` avisos pendientes. Sin RESEND_API_KEY no envía nada y los deja en cola.
 *  - Recupera envíos interrumpidos ("enviando" por más de MINUTOS_ATASCADA).
 *  - Máximo MAX_INTENTOS intentos por aviso; después queda en "error" y aparece en Requiere atención.
 *  - Cada aviso usa su id como clave de idempotencia en Resend: si un envío se
 *    repite (proceso cortado después de enviar), Resend no manda un segundo correo.
 */
export async function procesarCola(db: SupabaseClient = adminClient(), limite = 20): Promise<ResultadoEnvio> {
  const out: ResultadoEnvio = { enviadas: 0, errores: 0, omitidas: 0, recuperadas: 0 };
  if (!process.env.RESEND_API_KEY) return { ...out, sinConfigurar: true };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM ?? 'NEXA Performance <onboarding@resend.dev>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  // 1. Recuperar envíos atascados
  const corte = new Date(Date.now() - MINUTOS_ATASCADA * 60_000).toISOString();
  const { data: atascadas, error: errAtascadas } = await db.from('notificaciones')
    .update({ estado: 'error', error: 'Envío interrumpido; se reintentará' })
    .eq('estado', 'enviando').lt('reclamada_at', corte)
    .select('id');
  if (errAtascadas) console.error('[notificaciones] no se pudieron recuperar envíos atascados:', errAtascadas.message);
  out.recuperadas = atascadas?.length ?? 0;

  // 2. Pendientes y con error que aún tienen intentos
  const { data: pendientes, error: errLeer } = await db.from('notificaciones')
    .select('id, atleta_id, tipo, datos, intentos, estado')
    .in('estado', ['pendiente', 'error']).lt('intentos', MAX_INTENTOS)
    .eq('canal', 'email')
    .order('created_at').limit(limite);
  if (errLeer) {
    console.error('[notificaciones] no se pudo leer la cola:', errLeer.message);
    return { ...out, errores: out.errores + 1 };
  }

  for (const n of pendientes ?? []) {
    // Reclamar: si otro proceso ya la tomó, este update no devuelve filas.
    const { data: tomada } = await db.from('notificaciones')
      .update({ estado: 'enviando', intentos: Number(n.intentos) + 1, reclamada_at: new Date().toISOString() })
      .eq('id', n.id).eq('estado', n.estado).select('id');
    if (!tomada?.length) continue;

    const datos = (n.datos ?? {}) as Datos;
    if (recordatorioVencido(String(n.tipo), datos)) {
      await db.from('notificaciones').update({ estado: 'omitida', error: 'La clase ya pasó: recordatorio no enviado' }).eq('id', n.id);
      out.omitidas++;
      continue;
    }

    const { data: atleta } = await db.from('atletas').select('nombre, email').eq('id', n.atleta_id).maybeSingle();
    const correo = atleta?.email ? armarCorreo(String(n.tipo), String(atleta.nombre ?? ''), datos, appUrl) : null;
    if (!correo) {
      await db.from('notificaciones').update({ estado: 'omitida', error: atleta?.email ? 'tipo sin plantilla' : 'alumno sin email' }).eq('id', n.id);
      out.omitidas++;
      continue;
    }

    let errorEnvio: string | null = null;
    try {
      const { error } = await resend.emails.send(
        { from, to: String(atleta!.email), subject: correo.asunto, html: correo.html },
        { idempotencyKey: `nexa-notificacion-${n.id}` },
      );
      if (error) errorEnvio = error.message;
    } catch (e) {
      errorEnvio = e instanceof Error ? e.message : String(e);
    }

    if (errorEnvio) {
      const agotado = Number(n.intentos) + 1 >= MAX_INTENTOS;
      console.error('[notificaciones] error enviando', n.id, errorEnvio);
      await db.from('notificaciones').update({
        estado: 'error',
        error: agotado ? `Sin más reintentos (${MAX_INTENTOS}): ${errorEnvio}` : errorEnvio,
      }).eq('id', n.id);
      out.errores++;
    } else {
      await db.from('notificaciones').update({ estado: 'enviada', enviada_at: new Date().toISOString(), error: null }).eq('id', n.id);
      out.enviadas++;
    }
  }
  return out;
}
