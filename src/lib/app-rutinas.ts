// App de rutinas del alumno: lógica pura (sin red), probada en app-rutinas.test.ts.
// Las rutinas las arma el coach en el planificador: `sessions` es un objeto
// { 'YYYY-MM-DD': { name, exercises: [...] } } con un entrenamiento por fecha.

export interface EjercicioRutina {
  id: string;
  nombre: string;
  series: number;
  reps: string;
  descanso?: string;
  tempo?: string;
  cadaLado?: boolean;
  notas?: string;
  video?: string;
}

export interface DiaRutina {
  fecha: string;      // YYYY-MM-DD
  titulo: string;
  ejercicios: EjercicioRutina[];
}

export interface RutinaApp {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  dias: DiaRutina[];
}

type Crudo = Record<string, unknown>;

function texto(v: unknown): string { return typeof v === 'string' ? v : v == null ? '' : String(v); }

/** Convierte una fila de `rutinas` al formato de la app (ignora días vacíos). */
export function normalizarRutina(r: Crudo): RutinaApp {
  const sessions = (r.sessions ?? {}) as Record<string, { name?: string; exercises?: Crudo[] }>;
  const dias: DiaRutina[] = Object.entries(sessions)
    .filter(([fecha, s]) => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (s?.exercises?.length ?? 0) > 0)
    .map(([fecha, s]) => ({
      fecha,
      titulo: texto(s.name),
      ejercicios: (s.exercises ?? []).map((e, i) => ({
        id: texto(e.id) || `${fecha}-${i}`,
        nombre: texto(e.name) || 'Ejercicio',
        series: Math.max(1, Math.min(30, Number(e.series) || 1)),
        reps: texto(e.reps),
        descanso: texto(e.rest) || undefined,
        tempo: texto(e.tempo) || undefined,
        cadaLado: e.eachSide === true,
        notas: texto(e.notas ?? e.notes) || undefined,
        video: texto(e.youtubeUrl) || undefined,
      })),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { id: texto(r.id), nombre: texto(r.nombre), inicio: texto(r.start_date), fin: texto(r.end_date), dias };
}

/**
 * Rutina vigente en `hoy`: la que cubre la fecha (inicio ≤ hoy ≤ término).
 * Si hay varias, la que empezó más recientemente. Si ninguna está vigente,
 * la próxima que va a empezar; si tampoco, null.
 */
export function rutinaVigente(rutinas: RutinaApp[], hoy: string): RutinaApp | null {
  const cubre = rutinas.filter(r => (!r.inicio || r.inicio <= hoy) && (!r.fin || r.fin >= hoy));
  if (cubre.length) return [...cubre].sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  const proximas = rutinas.filter(r => r.inicio && r.inicio > hoy).sort((a, b) => a.inicio.localeCompare(b.inicio));
  return proximas[0] ?? null;
}

export function sumarDias(f: string, n: number): string {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes a domingo de la semana que contiene `fecha`. */
export function semanaDe(fecha: string): string[] {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const lunes = sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** Celdas de un calendario mensual (lunes primero); null = relleno antes del día 1. */
export function mesDe(fecha: string): (string | null)[] {
  const [y, m] = fecha.split('-').map(Number);
  const primero = `${y}-${String(m).padStart(2, '0')}-01`;
  const dow = new Date(`${primero}T12:00:00Z`).getUTCDay();
  const relleno = dow === 0 ? 6 : dow - 1;
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array(relleno).fill(null), ...Array.from({ length: ultimo }, (_, i) => sumarDias(primero, i))];
}

/** Id de YouTube a partir de un enlace (watch, youtu.be, shorts, embed). */
export function idYoutube(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export interface Registro {
  id?: string;
  serie: number;
  peso_kg: number | null;
  reps: number | null;
  fecha: string;
  ejercicio_nombre: string;
}

/**
 * Lo anotado la última vez en ese ejercicio (cualquier rutina), antes de `hoy`.
 * Devuelve la fecha y las series ordenadas.
 */
export function ultimaVez(registros: Registro[], ejercicio: string, hoy: string): { fecha: string; series: Registro[] } | null {
  const clave = ejercicio.trim().toLowerCase();
  const previos = registros.filter(r => r.ejercicio_nombre.trim().toLowerCase() === clave && r.fecha < hoy);
  if (!previos.length) return null;
  const fecha = previos.reduce((m, r) => (r.fecha > m ? r.fecha : m), previos[0].fecha);
  return { fecha, series: previos.filter(r => r.fecha === fecha).sort((a, b) => a.serie - b.serie) };
}

/** Peso o repeticiones escritos por el alumno: acepta coma decimal; vacío = null. */
export function numeroAnotado(v: string, max: number): number | null | 'invalido' {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) return 'invalido';
  return Math.round(n * 100) / 100;
}
