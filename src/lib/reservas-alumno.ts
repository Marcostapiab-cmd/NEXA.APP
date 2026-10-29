// Acciones del alumno sobre sus clases. Todas pasan por funciones de la base
// de datos (migración 041) que validan plazo, cupos y créditos con la hora del
// servidor; el navegador nunca modifica reservas, planes ni créditos directo.

import { supabase } from './supabaseClient';
import { MENSAJE_FUERA_DE_PLAZO, POLITICA_DEFAULT, type PoliticaCancelacion } from './politica-cancelacion';

export interface HorarioDisponible {
  fecha:     string;  // YYYY-MM-DD
  hora:      string;  // HH:MM
  coachId:   string;
  profesor:  string;
  modalidad: '1:1' | '2:1';
  cupos:     number;
  capacidad: number;
}

export interface PoliticaAlumno extends PoliticaCancelacion {
  listaEsperaActiva: boolean;
  dias:              { dow: number; abierto: boolean; apertura: string; cierre: string }[];
  duracionBloque:    number;
}

export type ResultadoAccion = { ok: true; reservaId?: number } | { ok: false; error: string; mensaje: string };

const MENSAJES: Record<string, string> = {
  fuera_de_plazo:    MENSAJE_FUERA_DE_PLAZO,
  sin_cupo:          'Ese horario se acaba de ocupar. Tu clase original se mantiene; elige otro horario.',
  sin_creditos:      'No te quedan clases disponibles en tu plan.',
  fuera_de_vigencia: 'Ese horario está fuera de la vigencia de tu plan.',
  max_reagendas:     'Alcanzaste el máximo de reagendamientos de tu plan. Escríbenos si necesitas una excepción.',
  choque_alumno:     'Ya tienes otra clase a esa hora.',
  mismo_horario:     'Elige un horario distinto al actual.',
  no_activa:         'Esta clase ya no está activa.',
  no_encontrada:     'No encontramos esta clase en tu cuenta.',
  sin_hora:          'Esta clase no tiene hora asignada. Escríbenos para gestionarla.',
  sin_plan:          'Esta clase no está asociada a un plan. Escríbenos para gestionarla.',
  lista_desactivada: 'La lista de espera no está disponible en este momento.',
  no_autorizado:     'Tu sesión expiró. Vuelve a ingresar.',
};

function resultado(data: unknown, error: { message: string } | null): ResultadoAccion {
  if (error) {
    const sinFuncion = /function .* does not exist|Could not find the function/i.test(error.message);
    return {
      ok: false, error: 'conexion',
      mensaje: sinFuncion
        ? 'El sistema de reservas aún no está activado. Escríbenos para gestionar tu clase.'
        : 'No pudimos conectar con NEXA. Revisa tu conexión e inténtalo de nuevo; tu clase no se modificó.',
    };
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string; reserva_id?: number };
  if (r.ok) return { ok: true, reservaId: r.reserva_id };
  const code = r.error ?? 'desconocido';
  return { ok: false, error: code, mensaje: MENSAJES[code] ?? 'No se pudo completar la operación.' };
}

/** Pide al servidor que envíe los correos que quedaron en cola (no bloquea la pantalla). */
export function procesarNotificaciones(): void {
  fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => { /* lo reintenta el cron */ });
}

export async function getPoliticaAlumno(): Promise<PoliticaAlumno> {
  const { data } = await supabase.rpc('alumno_politica');
  const p = (data ?? {}) as Record<string, unknown>;
  return {
    limiteHoraAm:       String(p.limite_hora_am ?? POLITICA_DEFAULT.limiteHoraAm),
    corteCancelacionAm: String(p.corte_cancelacion_am ?? POLITICA_DEFAULT.corteCancelacionAm),
    cancelHorasAvisoPm: Number(p.cancel_horas_aviso_pm ?? POLITICA_DEFAULT.cancelHorasAvisoPm),
    listaEsperaActiva:  p.lista_espera_activa !== false,
    dias:               Array.isArray(p.dias) ? p.dias as PoliticaAlumno['dias'] : [],
    duracionBloque:     Number(p.duracion_bloque ?? 60),
  };
}

export async function getHorariosDisponibles(desde: string, hasta: string, reservaId?: number): Promise<HorarioDisponible[]> {
  const { data, error } = await supabase.rpc('alumno_horarios_disponibles', {
    p_desde: desde, p_hasta: hasta, p_reserva_id: reservaId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    fecha:     String(r.fecha).slice(0, 10),
    hora:      String(r.hora).slice(0, 5),
    coachId:   String(r.coach_id),
    profesor:  String(r.profesor ?? ''),
    modalidad: r.modalidad === '2:1' ? '2:1' : '1:1',
    cupos:     Number(r.cupos),
    capacidad: Number(r.capacidad),
  }));
}

export async function cancelarClase(reservaId: number): Promise<ResultadoAccion> {
  const { data, error } = await supabase.rpc('alumno_cancelar_reserva', { p_reserva_id: reservaId });
  const r = resultado(data, error);
  if (r.ok) procesarNotificaciones();
  return r;
}

export async function reagendarClase(reservaId: number, h: Pick<HorarioDisponible, 'fecha' | 'hora' | 'coachId'>): Promise<ResultadoAccion> {
  const { data, error } = await supabase.rpc('alumno_reagendar_reserva', {
    p_reserva_id: reservaId, p_fecha: h.fecha, p_hora: h.hora, p_coach_id: h.coachId,
  });
  const r = resultado(data, error);
  if (r.ok) procesarNotificaciones();
  return r;
}

export async function reservarClase(h: Pick<HorarioDisponible, 'fecha' | 'hora' | 'coachId'>): Promise<ResultadoAccion> {
  const { data, error } = await supabase.rpc('alumno_reservar_clase', {
    p_fecha: h.fecha, p_hora: h.hora, p_coach_id: h.coachId,
  });
  const r = resultado(data, error);
  if (r.ok) procesarNotificaciones();
  return r;
}

export async function unirseListaEspera(fecha: string, hora: string, reservaId?: number): Promise<ResultadoAccion> {
  const { data, error } = await supabase.rpc('alumno_lista_espera', {
    p_fecha: fecha, p_hora: hora, p_reserva_id: reservaId ?? null,
  });
  return resultado(data, error);
}

export interface ClaseAlumno {
  id:        number;
  fecha:     string;
  hora?:     string;
  estado:    string;
  modalidad: '1:1' | '2:1';
  profesor?: string;
  limite?:   string;   // ISO: último instante para cancelar/reagendar sin perder la clase
  aTiempo:   boolean;  // calculado por el servidor
  activa:    boolean;
}

export async function getMisClases(): Promise<ClaseAlumno[]> {
  const { data, error } = await supabase.rpc('alumno_mis_clases');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id:        Number(r.id),
    fecha:     String(r.fecha).slice(0, 10),
    hora:      r.hora ? String(r.hora) : undefined,
    estado:    String(r.estado ?? 'pendiente'),
    modalidad: r.modalidad === '2:1' ? '2:1' : '1:1',
    profesor:  r.profesor ? String(r.profesor) : undefined,
    limite:    r.limite ? String(r.limite) : undefined,
    aTiempo:   r.a_tiempo === true,
    activa:    r.activa === true,
  }));
}

export interface MiPlan {
  vigente:      boolean;
  nombre?:      string;
  modalidad?:   '1:1' | '2:1';
  fin?:         string;
  contratadas?: number;
  usadas?:      number;
  reservadas?:  number;
  disponibles?: number;
}

export async function getMiPlan(): Promise<MiPlan> {
  const { data, error } = await supabase.rpc('alumno_mi_plan');
  if (error) throw new Error(error.message);
  const p = (data ?? { vigente: false }) as Record<string, unknown>;
  if (!p.vigente) return { vigente: false };
  return {
    vigente:     true,
    nombre:      String(p.nombre ?? ''),
    modalidad:   p.modalidad === '2:1' ? '2:1' : '1:1',
    fin:         p.fin ? String(p.fin).slice(0, 10) : undefined,
    contratadas: Number(p.contratadas ?? 0),
    usadas:      Number(p.usadas ?? 0),
    reservadas:  Number(p.reservadas ?? 0),
    disponibles: Number(p.disponibles ?? 0),
  };
}
