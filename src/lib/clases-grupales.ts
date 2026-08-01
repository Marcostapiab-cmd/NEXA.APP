import { supabase } from './supabaseClient';

export interface SesionGrupal {
  claseId:     string;
  nombre:      string;
  fecha:       string;   // 'YYYY-MM-DD'
  hora:        string;   // 'HH:MM'
  diaSemana:   number;
  capacidad:   number;
  reservadas:  number;
  disponibles: number;
  bloqueada:   boolean;
}

export interface ReservaResult {
  ok:        boolean;
  error?:    string;
  reservaId?: string;
  clase?:    string;
  hora?:     string;
}

export async function getSesionesDisponibles(dias = 14): Promise<SesionGrupal[]> {
  const { data, error } = await supabase.rpc('get_clases_disponibles', { p_dias: dias });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map(row => ({
    claseId:     String(row.clase_id),
    nombre:      String(row.nombre),
    fecha:       String(row.fecha),
    hora:        String(row.hora),
    diaSemana:   Number(row.dia_semana),
    capacidad:   Number(row.capacidad),
    reservadas:  Number(row.reservadas),
    disponibles: Number(row.disponibles),
    bloqueada:   Boolean(row.bloqueada),
  }));
}

export async function reservarClaseGrupal(params: {
  claseId:   string;
  fecha:     string;
  nombre:    string;
  apellido:  string;
  telefono?: string;
  email?:    string;
  rut?:      string;
}): Promise<ReservaResult> {
  const { data, error } = await supabase.rpc('reservar_clase_grupal', {
    p_clase_id: params.claseId,
    p_fecha:    params.fecha,
    p_nombre:   params.nombre,
    p_apellido: params.apellido,
    p_telefono: params.telefono || null,
    p_email:    params.email    || null,
    p_rut:      params.rut      || null,
  });

  if (error) return { ok: false, error: 'error_servidor' };

  const r = data as { ok: boolean; error?: string; reserva_id?: string; clase?: string; hora?: string };
  return {
    ok:        r.ok,
    error:     r.error,
    reservaId: r.reserva_id,
    clase:     r.clase,
    hora:      r.hora,
  };
}
