import { supabase } from './supabaseClient';

export interface HorarioDiaConfig {
  dow:      number;  // 0=domingo, 1=lunes … 6=sábado
  abierto:  boolean;
  apertura: string;  // "06:00"
  cierre:   string;  // "21:00"
}

export interface HorarioConfig {
  dias:                HorarioDiaConfig[];
  capacidadGrupal:     number;
  maxProfesores:       number;
  duracionBloque:      number;
  // hora tope del DÍA ANTERIOR para cancelar una clase AM (ej: "21:00")
  corteCancelacionAm:  string;
  // clases que empiecen ANTES de esta hora son AM (ej: "12:00")
  limiteHoraAm:        string;
  cancelHorasAvisoPm:  number;
  reagendaValidezDias: number;
}

export interface HorarioBloqueo {
  id:          string;
  fecha:       string;
  horaInicio?: string;
  horaFin?:    string;
  motivo?:     string;
  createdAt:   string;
}

export const DEFAULT_HORARIO_CONFIG: HorarioConfig = {
  dias: [
    { dow: 0, abierto: true,  apertura: '09:00', cierre: '13:00' }, // domingo
    { dow: 1, abierto: true,  apertura: '06:00', cierre: '21:00' }, // lunes
    { dow: 2, abierto: true,  apertura: '06:00', cierre: '21:00' },
    { dow: 3, abierto: true,  apertura: '06:00', cierre: '21:00' },
    { dow: 4, abierto: true,  apertura: '06:00', cierre: '21:00' },
    { dow: 5, abierto: true,  apertura: '06:00', cierre: '21:00' }, // viernes
    { dow: 6, abierto: true,  apertura: '08:00', cierre: '14:00' }, // sábado
  ],
  capacidadGrupal:     12,
  maxProfesores:        3,
  duracionBloque:      60,
  corteCancelacionAm: '21:00',
  limiteHoraAm:       '12:00',
  cancelHorasAvisoPm:  6,
  reagendaValidezDias: 30,
};

export async function getHorarioConfig(): Promise<HorarioConfig> {
  const { data, error } = await supabase
    .from('horario_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_HORARIO_CONFIG;
  const r = data as Record<string, unknown>;
  return {
    dias:                (r.dias as HorarioDiaConfig[]) ?? DEFAULT_HORARIO_CONFIG.dias,
    capacidadGrupal:      Number(r.capacidad_grupal      ?? 12),
    maxProfesores:        Number(r.max_profesores         ?? 3),
    duracionBloque:       Number(r.duracion_bloque        ?? 60),
    corteCancelacionAm:   String(r.corte_cancelacion_am   ?? '21:00'),
    limiteHoraAm:         String(r.limite_hora_am          ?? '12:00'),
    cancelHorasAvisoPm:   Number(r.cancel_horas_aviso_pm  ?? 6),
    reagendaValidezDias:  Number(r.reagenda_validez_dias  ?? 30),
  };
}

export async function saveHorarioConfig(config: HorarioConfig): Promise<void> {
  const { error } = await supabase.from('horario_config').upsert({
    id:                    1,
    dias:                  config.dias,
    capacidad_grupal:      config.capacidadGrupal,
    max_profesores:        config.maxProfesores,
    duracion_bloque:       config.duracionBloque,
    corte_cancelacion_am:  config.corteCancelacionAm,
    limite_hora_am:        config.limiteHoraAm,
    cancel_horas_aviso_pm: config.cancelHorasAvisoPm,
    reagenda_validez_dias: config.reagendaValidezDias,
    updated_at:            new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getBloqueos(fechaDesde?: string, fechaHasta?: string): Promise<HorarioBloqueo[]> {
  let q = supabase.from('horario_bloqueos').select('*').order('fecha');
  if (fechaDesde) q = q.gte('fecha', fechaDesde);
  if (fechaHasta) q = q.lte('fecha', fechaHasta);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:         String(r.id),
    fecha:      String(r.fecha),
    horaInicio: r.hora_inicio ? String(r.hora_inicio) : undefined,
    horaFin:    r.hora_fin    ? String(r.hora_fin)    : undefined,
    motivo:     r.motivo      ? String(r.motivo)      : undefined,
    createdAt:  String(r.created_at),
  }));
}

export async function addBloqueo(b: Omit<HorarioBloqueo, 'id' | 'createdAt'>): Promise<void> {
  const { error } = await supabase.from('horario_bloqueos').insert({
    fecha:       b.fecha,
    hora_inicio: b.horaInicio ?? null,
    hora_fin:    b.horaFin    ?? null,
    motivo:      b.motivo     ?? null,
  });
  if (error) throw error;
}

export async function deleteBloqueo(id: string): Promise<void> {
  const { error } = await supabase.from('horario_bloqueos').delete().eq('id', id);
  if (error) throw error;
}

// Genera bloques de una hora desde apertura hasta cierre (inclusive)
export function generateHours(apertura: string, cierre: string, duracionMin: number): string[] {
  const [ah, am] = apertura.split(':').map(Number);
  const [ch, cm] = cierre.split(':').map(Number);
  const result: string[] = [];
  let cur = ah * 60 + am;
  const end = ch * 60 + cm;
  while (cur <= end) {
    result.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
    cur += duracionMin;
  }
  return result;
}
