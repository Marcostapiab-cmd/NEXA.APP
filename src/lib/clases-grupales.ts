import { supabase } from './supabaseClient';

export interface SesionGrupal {
  claseId:    string;
  nombre:     string;
  fecha:      string;   // 'YYYY-MM-DD'
  hora:       string;   // 'HH:MM'
  diaSemana:  number;
  capacidad:  number;
  reservadas: number;
  disponibles: number;
  bloqueada:  boolean;
}

// Estados que NO consumen cupo (la persona no va a venir)
const ESTADOS_LIBRES = new Set([
  'cancelada_tiempo', 'cancelada_tarde', 'cancelada_nexa', 'no_show',
]);

function localDateStr(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export async function getSesionesDisponibles(dias = 14): Promise<SesionGrupal[]> {
  const hoy   = new Date();
  const fechas = Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    return localDateStr(d);
  });

  const fechaInicio = fechas[0];
  const fechaFin    = fechas[fechas.length - 1];

  const [
    { data: clases },
    { data: bloqueos },
    { data: reservas },
  ] = await Promise.all([
    supabase
      .from('clases_grupales')
      .select('id, nombre, dia_semana, hora, capacidad')
      .eq('activa', true),
    supabase
      .from('horario_bloqueos')
      .select('fecha, hora_inicio, hora_fin')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin),
    supabase
      .from('reservas')
      .select('fecha, hora, estado')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .ilike('tipo_clase', '%grupal%'),
  ]);

  type ClaseRow  = { id: string; nombre: string; dia_semana: number; hora: string; capacidad: number };
  type BloqRow   = { fecha: string; hora_inicio: string | null; hora_fin: string | null };
  type ReservaRow = { fecha: string; hora: string | null; estado: string | null };

  const clasesList   = (clases   ?? []) as ClaseRow[];
  const bloqueosList = (bloqueos ?? []) as BloqRow[];
  const reservasList = ((reservas ?? []) as ReservaRow[])
    .filter(r => !ESTADOS_LIBRES.has(r.estado ?? ''));

  const sesiones: SesionGrupal[] = [];

  for (const clase of clasesList) {
    for (const fecha of fechas) {
      // 0=dom, 1=lun … 6=sáb — mismo convenio que la DB
      const dow = new Date(fecha + 'T12:00:00').getDay();
      if (dow !== clase.dia_semana) continue;

      // ¿Está bloqueada?
      const bloqueada = bloqueosList.some(b => {
        if (b.fecha !== fecha) return false;
        if (!b.hora_inicio)    return true;              // día completo
        return clase.hora >= b.hora_inicio && clase.hora < (b.hora_fin ?? '23:59');
      });

      // Cuántas reservas cuentan para esta fecha+hora
      const reservadas = reservasList.filter(r =>
        r.fecha === fecha &&
        r.hora  != null  &&
        r.hora.slice(0, 5) === clase.hora
      ).length;

      sesiones.push({
        claseId:    clase.id,
        nombre:     clase.nombre,
        fecha,
        hora:       clase.hora,
        diaSemana:  dow,
        capacidad:  clase.capacidad,
        reservadas,
        disponibles: Math.max(0, clase.capacidad - reservadas),
        bloqueada,
      });
    }
  }

  sesiones.sort((a, b) =>
    a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : a.hora.localeCompare(b.hora)
  );

  return sesiones;
}
