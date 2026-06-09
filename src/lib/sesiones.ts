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
}

export interface Sesion {
  id: string;
  alumnoId: string;
  fecha: string;          // YYYY-MM-DD
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
    const maxP = Math.max(...ej.series.filter(s => s.completada).map(s => parseFloat(s.peso) || 0));
    return { fecha: s.fecha, peso: maxP };
  }).filter(p => p.peso > 0);
}
