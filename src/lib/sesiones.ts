// Shared session types — used by weightroom (logging) and athlete profile (display)

export interface SesionSerie {
  reps: string;
  peso: string;
  completada: boolean;
}

export interface SesionEjercicio {
  nombre: string;
  grupo: string;
  series: SesionSerie[];
  notas?: string;
  nombreOriginal?: string;
}

export interface Sesion {
  id: string;
  alumnoId: string;
  fecha: string;           // YYYY-MM-DD — fecha real de ejecución
  fechaPlaneada?: string;  // YYYY-MM-DD — fecha original del calendario (si difiere de fecha)
  rutinaId: string;
  rutinaNombre: string;
  bloqueNombre: string;
  notas: string;
  ejercicios: SesionEjercicio[];
}

export function getSesiones(): Sesion[] {
  try {
    const s = localStorage.getItem('nexa_sesiones');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

export function saveSesion(sesion: Sesion): void {
  const todas = getSesiones();
  const existe = todas.findIndex(s => s.id === sesion.id);
  if (existe >= 0) todas[existe] = sesion;
  else todas.unshift(sesion);
  localStorage.setItem('nexa_sesiones', JSON.stringify(todas));
}

export function getSesionesAlumno(alumnoId: string): Sesion[] {
  return getSesiones().filter(s => s.alumnoId === alumnoId);
}

// Get max weight used for an exercise name for a given alumno
export function getMaxPeso(alumnoId: string, nombre: string): number | null {
  const sesiones = getSesionesAlumno(alumnoId);
  let max: number | null = null;
  for (const s of sesiones) {
    for (const ej of s.ejercicios) {
      if (ej.nombre.toLowerCase() === nombre.toLowerCase()) {
        for (const serie of ej.series) {
          const p = parseFloat(serie.peso);
          if (!isNaN(p) && serie.completada && (max === null || p > max)) max = p;
        }
      }
    }
  }
  return max;
}

// Get weight history for a specific exercise (for charts)
export interface PuntoPeso { fecha: string; peso: number; }
export function getHistorialPeso(alumnoId: string, ejercicioNombre: string): PuntoPeso[] {
  const sesiones = getSesionesAlumno(alumnoId)
    .filter(s => s.ejercicios.some(e => e.nombre.toLowerCase() === ejercicioNombre.toLowerCase()))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return sesiones.map(s => {
    const ej = s.ejercicios.find(e => e.nombre.toLowerCase() === ejercicioNombre.toLowerCase())!;
    const maxP = ej.series.filter(s => s.completada).reduce((acc, s) => { const p = parseFloat(s.peso); return isNaN(p) ? acc : Math.max(acc, p); }, 0);
    return { fecha: s.fecha, peso: maxP };
  }).filter(p => p.peso > 0);
}

// ─── Estado por día / ejercicio (Weightroom calendar) ──────────────────────────
//
// Día:      pendiente (rutina asignada, sin sesión registrada)
//           en_progreso (sesión con series registradas, faltan, fecha aún no pasada)
//           incompleto (sesión con series faltantes y la fecha ya pasó — abandonada)
//           completado (todas las series de todos los ejercicios registradas)
// Ejercicio: misma escala, derivada del estado del día cuando no hay registro propio.

export type EstadoSesion = 'completado' | 'en_progreso' | 'incompleto' | 'pendiente';
export type EstadoEjercicio = EstadoSesion;

/** Finds the saved Sesion matching either the real or the originally planned date. */
export function getSesionPorFecha(alumnoId: string, fecha: string): Sesion | null {
  return getSesionesAlumno(alumnoId).find(s => s.fecha === fecha || s.fechaPlaneada === fecha) ?? null;
}

export function computeEstadoSesion(sesion: Sesion, fechaPlaneada: string): EstadoSesion {
  const totales     = sesion.ejercicios.reduce((s, e) => s + e.series.length, 0);
  const completadas = sesion.ejercicios.reduce((s, e) => s + e.series.filter(sr => sr.completada).length, 0);
  if (totales > 0 && completadas === totales) return 'completado';
  const today = new Date().toISOString().slice(0, 10);
  return fechaPlaneada < today ? 'incompleto' : 'en_progreso';
}

/** Status of a calendar day. Returns null when there is no rutina assigned that day. */
export function getEstadoDia(alumnoId: string, fecha: string, tieneRutina: boolean): EstadoSesion | null {
  if (!tieneRutina) return null;
  const sesion = getSesionPorFecha(alumnoId, fecha);
  if (!sesion) return 'pendiente';
  return computeEstadoSesion(sesion, fecha);
}

/** Status of a single exercise within a registered Sesion. */
export function getEstadoEjercicio(ej: SesionEjercicio, estadoSesion: EstadoSesion): EstadoEjercicio {
  const total = ej.series.length;
  const done  = ej.series.filter(s => s.completada).length;
  if (total > 0 && done === total) return 'completado';
  if (done > 0) return 'en_progreso';
  return estadoSesion === 'incompleto' ? 'incompleto' : 'pendiente';
}
