// Cierres, ausencias de profesores y lista de espera (migración 048).
// Toda la lógica vive en la base de datos; aquí solo se llaman sus funciones.

import { supabase } from './supabaseClient';

export type TipoCierre = 'feriado' | 'cierre' | 'mantencion' | 'evento' | 'horario_reducido' | 'vacaciones' | 'ausencia';
export type AccionCierre = 'suspender' | 'sustituir' | 'revisar';

export const TIPOS_CIERRE: { id: TipoCierre; label: string; profesor: boolean }[] = [
  { id: 'feriado',          label: 'Feriado',                 profesor: false },
  { id: 'cierre',           label: 'Cierre extraordinario',   profesor: false },
  { id: 'mantencion',       label: 'Mantención',              profesor: false },
  { id: 'evento',           label: 'Evento especial',         profesor: false },
  { id: 'horario_reducido', label: 'Horario reducido',        profesor: false },
  { id: 'vacaciones',       label: 'Vacaciones de profesor',  profesor: true  },
  { id: 'ausencia',         label: 'Ausencia de profesor',    profesor: true  },
];

export interface Sustituto { id: string; nombre: string }

export interface ClasePrevia {
  reserva_id: number; fecha: string; hora: string; modalidad: string;
  alumno: string | null; profesor: string | null; sustitutos: Sustituto[];
}

export interface ClaseAfectada extends ClasePrevia {
  id: string;
  estado: 'pendiente' | 'sustituida' | 'suspendida' | 'se_mantiene' | 'resuelta_por_alumno';
  solucion: string | null;
}

export interface Cierre {
  grupo_id: string; tipo: string; tipo_nombre: string; motivo: string | null;
  desde: string; hasta: string; hora_inicio: string | null; hora_fin: string | null;
  coach_id: string | null; profesor: string | null; estado: 'aprobado' | 'por_aprobar';
  clases: ClaseAfectada[];
}

export interface Espera {
  id: string; alumno: string; atleta_id: string; fecha: string; hora: string; hora_hasta: string | null;
  modalidad: string; mover_clase: boolean; estado: 'activa' | 'notificada';
  creada_at: string; notificada_at: string | null; turno_hasta: string | null;
}

export interface ConfigOperacion {
  sustitutoRequiereAprobacion: boolean;
  listaEsperaActiva:           boolean;
  listaEsperaModo:             'todos' | 'turnos';
  listaEsperaMinutos:          number;
  listaEsperaPrioridad:        'llegada' | 'mover_primero';
}

const ERRORES: Record<string, string> = {
  no_autorizado:           'No tienes permiso para esta acción.',
  tipo_invalido:           'Elige el tipo de cierre.',
  fechas_invalidas:        'Revisa las fechas: la fecha de término debe ser igual o posterior a la de inicio.',
  fechas_pasadas:          'Las fechas ya pasaron.',
  rango_largo:             'El rango máximo es de 120 días. Divídelo en partes.',
  horas_invalidas:         'Indica hora de inicio y de término (la de término debe ser posterior), o marca "Día completo".',
  falta_profesor:          'Elige el profesor.',
  accion_invalida:         'Elige qué hacer con las clases afectadas.',
  sustituir_solo_profesor: 'Buscar sustituto solo aplica a ausencias o vacaciones de un profesor.',
  profesor_no_disponible:  'Ese profesor ya no está disponible a esa hora. Elige otro.',
  ya_resuelta:             'Esta clase ya se resolvió.',
  no_encontrada:           'No se encontró. Recarga la página.',
  motivo_requerido:        'Escribe el motivo.',
};

export const mensajeError = (code?: string) => ERRORES[code ?? ''] ?? 'No se pudo completar la operación.';

type Resultado<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; mensaje: string; sinMigracion?: boolean };

function resultado<T>(data: unknown, error: { message: string } | null): Resultado<T> {
  if (error) {
    const sinMigracion = /function .* does not exist|Could not find the function/i.test(error.message);
    return { ok: false, sinMigracion, mensaje: sinMigracion ? 'Falta aplicar la migración 048 en Supabase.' : error.message };
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (r.ok) return { ok: true, ...(r as T) };
  return { ok: false, mensaje: mensajeError(r.error) };
}

function procesarCorreos() {
  fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => { /* lo reintenta la tarea programada */ });
}

export async function vistaPrevia(desde: string, hasta: string, horaInicio: string | null, horaFin: string | null, coach: string | null) {
  const { data, error } = await supabase.rpc('staff_vista_previa_cierre', {
    p_desde: desde, p_hasta: hasta, p_hora_inicio: horaInicio, p_hora_fin: horaFin, p_coach: coach,
  });
  return resultado<{ clases: ClasePrevia[] }>(data, error);
}

export async function crearCierre(p: {
  tipo: TipoCierre; desde: string; hasta: string; horaInicio: string | null; horaFin: string | null;
  coach: string | null; motivo: string; accion: AccionCierre;
}) {
  const { data, error } = await supabase.rpc('staff_crear_cierre', {
    p_tipo: p.tipo, p_desde: p.desde, p_hasta: p.hasta, p_hora_inicio: p.horaInicio, p_hora_fin: p.horaFin,
    p_coach: p.coach, p_motivo: p.motivo, p_accion: p.accion,
  });
  const r = resultado<{ afectadas: number; suspendidas: number; sustituidas: number; pendientes: number }>(data, error);
  if (r.ok) procesarCorreos();
  return r;
}

export async function resolverClase(id: string, accion: 'sustituir' | 'suspender' | 'mantener', coach?: string, nota?: string) {
  const { data, error } = await supabase.rpc('staff_resolver_clase_afectada', {
    p_id: id, p_accion: accion, p_coach: coach ?? null, p_nota: nota ?? null,
  });
  const r = resultado(data, error);
  if (r.ok) procesarCorreos();
  return r;
}

export async function aprobarAusencia(grupo: string) {
  const { data, error } = await supabase.rpc('staff_aprobar_ausencia', { p_grupo: grupo });
  return resultado(data, error);
}

export async function eliminarCierre(grupo: string) {
  const { data, error } = await supabase.rpc('staff_eliminar_cierre', { p_grupo: grupo });
  return resultado(data, error);
}

export async function getCierres(): Promise<Cierre[] | null> {
  const { data, error } = await supabase.rpc('staff_cierres', { p_incluir_pasados: false });
  if (error) return null;
  return (data ?? []) as Cierre[];
}

export async function getListaEspera(): Promise<Espera[] | null> {
  const { data, error } = await supabase.rpc('staff_lista_espera');
  if (error) return null;
  return (data ?? []) as Espera[];
}

export async function avisarAusencia(desde: string, hasta: string, horaInicio: string | null, horaFin: string | null, motivo: string) {
  const { data, error } = await supabase.rpc('profesor_avisar_ausencia', {
    p_desde: desde, p_hasta: hasta, p_hora_inicio: horaInicio, p_hora_fin: horaFin, p_motivo: motivo,
  });
  const r = resultado<{ afectadas: number; sustituidas: number; pendientes: number }>(data, error);
  if (r.ok) procesarCorreos();
  return r;
}

export async function getConfigOperacion(): Promise<ConfigOperacion | null> {
  const { data, error } = await supabase.from('horario_config')
    .select('sustituto_requiere_aprobacion, lista_espera_activa, lista_espera_modo, lista_espera_minutos, lista_espera_prioridad')
    .eq('id', 1).maybeSingle();
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    sustitutoRequiereAprobacion: d.sustituto_requiere_aprobacion !== false,
    listaEsperaActiva:           d.lista_espera_activa !== false,
    listaEsperaModo:             d.lista_espera_modo === 'turnos' ? 'turnos' : 'todos',
    listaEsperaMinutos:          Number(d.lista_espera_minutos ?? 120),
    listaEsperaPrioridad:        d.lista_espera_prioridad === 'mover_primero' ? 'mover_primero' : 'llegada',
  };
}

export async function saveConfigOperacion(c: ConfigOperacion): Promise<string | null> {
  const { error } = await supabase.from('horario_config').update({
    sustituto_requiere_aprobacion: c.sustitutoRequiereAprobacion,
    lista_espera_activa:           c.listaEsperaActiva,
    lista_espera_modo:             c.listaEsperaModo,
    lista_espera_minutos:          Math.max(5, Math.round(c.listaEsperaMinutos)),
    lista_espera_prioridad:        c.listaEsperaPrioridad,
    updated_at:                    new Date().toISOString(),
  }).eq('id', 1);
  return error ? error.message : null;
}

// ── Alumno ──────────────────────────────────────────────────
export interface MiEspera {
  id: string; fecha: string; hora: string; hora_hasta: string | null; modalidad: string;
  estado: 'activa' | 'notificada'; hora_avisada: string | null; turno_hasta: string | null;
}

export async function getMisEsperas(): Promise<MiEspera[] | null> {
  const { data, error } = await supabase.rpc('alumno_mis_esperas');
  if (error) return null;
  return (data ?? []) as MiEspera[];
}

export async function cancelarEspera(id: string) {
  const { data, error } = await supabase.rpc('alumno_cancelar_espera', { p_id: id });
  return resultado(data, error);
}

export async function esperaRango(fecha: string, desde: string, hasta: string, reservaId?: number) {
  const { data, error } = await supabase.rpc('alumno_lista_espera_rango', {
    p_fecha: fecha, p_desde: desde, p_hasta: hasta, p_reserva_id: reservaId ?? null,
  });
  return resultado(data, error);
}
