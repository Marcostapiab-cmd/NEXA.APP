// Llamadas del Centro de Ayuda a la base de datos (migración 047).
// Solo lectura, salvo enviar una consulta, que no toca reservas ni créditos.

import { supabase } from './supabaseClient';
import type { InfoAyuda, TemaAyuda } from './centro-ayuda';

export interface Solicitud {
  id:            string;
  tema:          string;
  mensaje:       string;
  estado:        'abierta' | 'resuelta' | 'descartada';
  respuesta?:    string;
  creadaAt:      string;
  respondidaAt?: string;
}

const ERRORES: Record<string, string> = {
  no_autorizado: 'Tu sesión expiró. Vuelve a ingresar.',
  tema_invalido: 'Elige un tema.',
  mensaje_corto: 'Cuéntanos un poco más (mínimo 5 caracteres).',
  mensaje_largo: 'El mensaje es muy largo (máximo 1000 caracteres).',
  demasiadas:    'Ya tienes 3 consultas abiertas. Espera la respuesta antes de enviar otra.',
};

/** null si la migración 047 aún no está aplicada o no hay sesión. */
export async function getInfoAyuda(): Promise<(InfoAyuda & { solicitudesAbiertas: number }) | null> {
  const { data, error } = await supabase.rpc('alumno_info_ayuda');
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    reagendasUsadas:     Number(d.reagendas_usadas ?? 0),
    maxReagendas:        d.max_reagendas_por_plan == null ? null : Number(d.max_reagendas_por_plan),
    reagendaValidezDias: d.reagenda_validez_dias == null ? null : Number(d.reagenda_validez_dias),
    antelacionMinutos:   Number(d.antelacion_min_reserva ?? 60),
    solicitudesAbiertas: Number(d.solicitudes_abiertas ?? 0),
  };
}

export async function getMisSolicitudes(): Promise<Solicitud[] | null> {
  const { data, error } = await supabase.rpc('alumno_mis_solicitudes');
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map(s => ({
    id:           String(s.id),
    tema:         String(s.tema ?? ''),
    mensaje:      String(s.mensaje ?? ''),
    estado:       (s.estado as Solicitud['estado']) ?? 'abierta',
    respuesta:    s.respuesta ? String(s.respuesta) : undefined,
    creadaAt:     String(s.creada_at),
    respondidaAt: s.respondida_at ? String(s.respondida_at) : undefined,
  }));
}

export async function solicitarAyuda(tema: TemaAyuda, mensaje: string, reservaId?: number):
  Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const { data, error } = await supabase.rpc('alumno_solicitar_ayuda', {
    p_tema: tema, p_mensaje: mensaje, p_reserva_id: reservaId ?? null,
  });
  if (error) {
    const sinFuncion = /function .* does not exist|Could not find the function/i.test(error.message);
    return { ok: false, mensaje: sinFuncion
      ? 'El envío de consultas aún no está activo. Mientras tanto, escríbenos directamente.'
      : 'No pudimos enviar tu consulta. Revisa tu conexión e inténtalo de nuevo.' };
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (r.ok) {
    fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => { /* lo reintenta la tarea programada */ });
    return { ok: true };
  }
  return { ok: false, mensaje: ERRORES[r.error ?? ''] ?? 'No pudimos enviar tu consulta.' };
}
