import type { Coach } from './coaches-supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ReservaParaPago {
  id:         string | number;
  coach_id:   string | null;
  fecha:      string;
  hora:       string | null;
  tipo_clase: string | null;
  estado:     string;
}

export interface ClaseUnica {
  coach_id:         string;
  fecha:            string;
  hora:             string;
  tipo_norm:        '1:1' | '2:1' | 'Grupal';
  tipo_raw:         string;
  alumnos_quemados: number;
}

export type MotivoAdvertencia = 'sin_hora' | 'tipo_desconocido';

export interface Advertencia {
  id:         string | number;
  coach_id:   string | null;
  fecha:      string;
  hora:       string | null;
  tipo_clase: string | null;
  estado:     string;
  motivo:     MotivoAdvertencia;
}

export interface ResultadoAgrupacion {
  clases:       ClaseUnica[];
  advertencias: Advertencia[];
}

export interface FilaProfesor {
  coach:         Coach;
  clases_1a1:    number;
  clases_2a1:    number;
  clases_2a1_solo: number;
  clases_grupal: number;
  total_clases:  number;
  total_pago:    number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADOS_QUE_QUEMAN = new Set(['presente', 'no_show', 'cancelada_tarde']);

// ─── Normalización de tipo_clase ──────────────────────────────────────────────

function normalizarTipo(tipo_clase: string | null): '1:1' | '2:1' | 'Grupal' | null {
  if (!tipo_clase) return null;
  const t = tipo_clase.toLowerCase();
  if (t.includes('1:1') || t.includes('individual')) return '1:1';
  if (t.includes('2:1') || t.includes('duo') || t.includes('dúo')) return '2:1';
  if (t.includes('grupal') || t.includes('grupo')) return 'Grupal';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Extrae 'HH:MM' de un timestamp ISO ('2026-07-20 08:00:00+00' → '08:00').
// Devuelve null si no hay parte horaria (fecha pura como '2026-07-20').
function extraerHora(fecha: string): string | null {
  // Formato: 'YYYY-MM-DD HH:MM:SS...' o 'YYYY-MM-DDTHH:MM:SS...'
  const match = fecha.match(/[T ](\d{2}:\d{2})/);
  if (!match) return null;
  const hhmm = match[1];
  // Timestamp sin hora real (00:00) podría ser fecha pura almacenada como timestamp;
  // lo aceptamos igual — si dos clases del mismo coach están a las 00:00
  // en la misma fecha es un caso de datos, no un error nuestro.
  return hhmm;
}

// Devuelve solo la parte 'YYYY-MM-DD' de un timestamp o fecha.
function soloFecha(fecha: string): string {
  return fecha.slice(0, 10);
}

// ─── Agrupación ───────────────────────────────────────────────────────────────

export function agruparClases(reservas: ReservaParaPago[]): ResultadoAgrupacion {
  const grupos     = new Map<string, ClaseUnica>();
  const advertencias: Advertencia[] = [];

  for (const r of reservas) {
    if (!ESTADOS_QUE_QUEMAN.has(r.estado)) continue;
    if (!r.coach_id) continue;

    // hora_efectiva: usar columna hora si existe; si no, extraer del timestamp fecha.
    // Solo va a advertencia si ninguna de las dos tiene información horaria.
    const hora_efectiva = r.hora ?? extraerHora(r.fecha);

    if (!hora_efectiva) {
      advertencias.push({
        id: r.id, coach_id: r.coach_id, fecha: r.fecha,
        hora: null, tipo_clase: r.tipo_clase, estado: r.estado,
        motivo: 'sin_hora',
      });
      continue;
    }

    const tipo_norm = normalizarTipo(r.tipo_clase);

    // Tipo desconocido → reportar, no pagar en silencio
    if (!tipo_norm) {
      advertencias.push({
        id: r.id, coach_id: r.coach_id, fecha: soloFecha(r.fecha),
        hora: hora_efectiva, tipo_clase: r.tipo_clase, estado: r.estado,
        motivo: 'tipo_desconocido',
      });
      continue;
    }

    const key = `${r.coach_id}|${soloFecha(r.fecha)}|${hora_efectiva}`;

    if (!grupos.has(key)) {
      grupos.set(key, {
        coach_id:         r.coach_id,
        fecha:            soloFecha(r.fecha),
        hora:             hora_efectiva,
        tipo_norm,
        tipo_raw:         r.tipo_clase ?? '',
        alumnos_quemados: 0,
      });
    }

    grupos.get(key)!.alumnos_quemados += 1;
  }

  return { clases: Array.from(grupos.values()), advertencias };
}

// ─── Tarifa por clase ─────────────────────────────────────────────────────────

export function calcularTarifa(clase: ClaseUnica, coach: Coach): number {
  switch (clase.tipo_norm) {
    case '1:1':
      return coach.tarifa_1a1;
    case 'Grupal':
      // Una sola tarifa sin importar cuántos alumnos asistieron
      return coach.tarifa_1a1;
    case '2:1':
      // Dúo completo (2 alumnos con estado que quema) → tarifa_2a1
      // Dúo incompleto (1 alumno) → tarifa_incompleta_2a1
      return clase.alumnos_quemados >= 2
        ? coach.tarifa_2a1
        : coach.tarifa_incompleta_2a1;
  }
}

// ─── Resumen por profesor ─────────────────────────────────────────────────────

export function calcularFilaProfesor(
  coach: Coach,
  clases: ClaseUnica[],
): FilaProfesor {
  const mias = clases.filter(c => c.coach_id === coach.id);

  let clases_1a1     = 0;
  let clases_2a1     = 0;
  let clases_2a1_solo = 0;
  let clases_grupal  = 0;
  let total_pago     = 0;

  for (const c of mias) {
    const monto = calcularTarifa(c, coach);
    total_pago += monto;

    if (c.tipo_norm === '1:1')   { clases_1a1++;   continue; }
    if (c.tipo_norm === 'Grupal') { clases_grupal++; continue; }
    if (c.tipo_norm === '2:1') {
      if (c.alumnos_quemados >= 2) clases_2a1++;
      else                          clases_2a1_solo++;
    }
  }

  return {
    coach,
    clases_1a1,
    clases_2a1,
    clases_2a1_solo,
    clases_grupal,
    total_clases: clases_1a1 + clases_2a1 + clases_2a1_solo + clases_grupal,
    total_pago,
  };
}
