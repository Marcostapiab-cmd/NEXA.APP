// Lógica pura para agendar las clases de un plan 1:1 / 2:1 día por día.
// Sin red ni DB: se prueba en agenda-plan.test.ts.

import { validarConflictoTipo } from './reservas-validation';
import type { PlanModalidad } from './planes';

export const DIAS_PLAN = [
  { n: 1, corto: 'Lun', largo: 'Lunes',     plural: 'lunes' },
  { n: 2, corto: 'Mar', largo: 'Martes',    plural: 'martes' },
  { n: 3, corto: 'Mié', largo: 'Miércoles', plural: 'miércoles' },
  { n: 4, corto: 'Jue', largo: 'Jueves',    plural: 'jueves' },
  { n: 5, corto: 'Vie', largo: 'Viernes',   plural: 'viernes' },
  { n: 6, corto: 'Sáb', largo: 'Sábado',    plural: 'sábados' },
] as const;

/**
 * Una clase agendada. `origen`:
 *  - 'manual':   elegida o movida a mano → "repetir" nunca la modifica.
 *  - 'repetida': creada al repetir un día → se actualiza si se repite de nuevo.
 */
export interface SesionPlan {
  fecha:  string;   // YYYY-MM-DD (máximo una clase por día)
  hora:   string;   // HH:MM
  origen: 'manual' | 'repetida';
}

export interface Ocupacion {
  fecha:      string;
  hora:       string;
  tipo_clase: string | null;
}

export interface Bloqueo {
  fecha:       string;
  horaInicio?: string;
  horaFin?:    string;
}

// ── Fechas ──────────────────────────────────────────────────────

function d(ds: string): Date { return new Date(`${ds}T12:00:00`); }
export function iso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function todayIso(): string { return iso(new Date()); }
export function sumarDias(ds: string, n: number): string { const x = d(ds); x.setDate(x.getDate() + n); return iso(x); }
/** 1 = lunes … 7 = domingo */
export function diaSemana(ds: string): number { const g = d(ds).getDay(); return g === 0 ? 7 : g; }
export function lunesDe(ds: string): string { return sumarDias(ds, 1 - diaSemana(ds)); }

/** Las 6 fechas (lun–sáb) de la semana que empieza en `lunes`. */
export function fechasSemana(lunes: string): string[] {
  return DIAS_PLAN.map((_, i) => sumarDias(lunes, i));
}

/**
 * Fechas de un día de la semana dentro del plan [inicio, fin], con un
 * máximo de `maxPorDia` (las semanas del plan: 4 / 12 / 24).
 */
export function fechasDelDia(dia: number, inicio: string, fin: string, maxPorDia?: number): string[] {
  const out: string[] = [];
  let cur = sumarDias(inicio, (dia - diaSemana(inicio) + 7) % 7);
  while (cur <= fin && (maxPorDia === undefined || out.length < maxPorDia)) {
    out.push(cur);
    cur = sumarDias(cur, 7);
  }
  return out;
}

function ordenar(s: SesionPlan[]): SesionPlan[] {
  return [...s].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Operaciones (nunca tocan otras fechas) ──────────────────────

/** Elige (o cambia) la hora de una fecha puntual. Si ya tenía esa hora, la quita. */
export function alternarSesion(sesiones: SesionPlan[], fecha: string, hora: string): SesionPlan[] {
  const actual = sesiones.find(s => s.fecha === fecha);
  if (actual && actual.hora === hora) return sesiones.filter(s => s.fecha !== fecha);
  const resto = sesiones.filter(s => s.fecha !== fecha);
  return ordenar([...resto, { fecha, hora, origen: 'manual' }]);
}

/** Mueve una clase a otra fecha y/u hora, sin afectar las demás. */
export function moverSesion(sesiones: SesionPlan[], desde: string, fecha: string, hora: string): SesionPlan[] {
  const resto = sesiones.filter(s => s.fecha !== desde && s.fecha !== fecha);
  return ordenar([...resto, { fecha, hora, origen: 'manual' }]);
}

export function quitarSesion(sesiones: SesionPlan[], fecha: string): SesionPlan[] {
  return sesiones.filter(s => s.fecha !== fecha);
}

/**
 * Repite `hora` en todos los `dia` del plan. Respeta las clases elegidas o
 * movidas a mano; solo crea las que faltan y actualiza las que vinieron de
 * una repetición anterior.
 */
export function repetirDia(
  sesiones: SesionPlan[], dia: number, hora: string, inicio: string, fin: string, maxPorDia?: number,
): SesionPlan[] {
  const porFecha = new Map(sesiones.map(s => [s.fecha, s]));
  for (const f of fechasDelDia(dia, inicio, fin, maxPorDia)) {
    const s = porFecha.get(f);
    if (!s) porFecha.set(f, { fecha: f, hora, origen: 'repetida' });
    else if (s.origen === 'repetida') porFecha.set(f, { ...s, hora });
  }
  return ordenar([...porFecha.values()]);
}

/** Copia todas las clases de una semana a las demás semanas del plan. */
export function repetirSemana(
  sesiones: SesionPlan[], lunes: string, inicio: string, fin: string, maxPorDia?: number,
): SesionPlan[] {
  const semana = new Set(fechasSemana(lunes));
  let out = sesiones;
  for (const s of sesiones.filter(x => semana.has(x.fecha))) {
    out = repetirDia(out, diaSemana(s.fecha), s.hora, inicio, fin, maxPorDia);
  }
  return out;
}

// ── Disponibilidad ──────────────────────────────────────────────

export function estaBloqueado(fecha: string, hora: string, bloqueos: Bloqueo[]): boolean {
  return bloqueos.some(b => b.fecha === fecha && (!b.horaInicio || (hora >= b.horaInicio && hora < (b.horaFin ?? '23:59'))));
}

export type EstadoCelda = 'libre' | 'compartible' | 'ocupado' | 'bloqueado';

export interface InfoCelda {
  estado:  EstadoCelda;
  detalle: string;      // texto corto para la celda
  motivo?: string;      // por qué no se puede
}

/** Estado de un horario del profesor para la modalidad que se quiere agendar. */
export function evaluarCelda(
  fecha: string, hora: string, modalidad: PlanModalidad, ocupacion: Ocupacion[], bloqueos: Bloqueo[],
): InfoCelda {
  if (estaBloqueado(fecha, hora, bloqueos)) return { estado: 'bloqueado', detalle: 'Bloq.', motivo: 'Horario bloqueado' };
  const existentes = ocupacion.filter(o => o.fecha === fecha && o.hora === hora);
  const r = validarConflictoTipo(modalidad, existentes);
  if (!r.ok) {
    const hay1a1 = existentes.some(e => !/(2:1|duo|dúo)/i.test(e.tipo_clase ?? ''));
    return { estado: 'ocupado', detalle: hay1a1 ? '1:1' : '2:1 2/2', motivo: r.error };
  }
  if (modalidad === '2:1' && existentes.length === 1) return { estado: 'compartible', detalle: '2:1 1/2' };
  return { estado: 'libre', detalle: '' };
}

/** Conflictos de las clases elegidas (cupo, bloqueo o fecha fuera del plan). */
export function conflictosSesiones(
  sesiones: SesionPlan[], modalidad: PlanModalidad, ocupacion: Ocupacion[], bloqueos: Bloqueo[],
  inicio: string, fin: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sesiones) {
    if (s.fecha < inicio || s.fecha > fin) { out[s.fecha] = 'Fuera de la vigencia del plan'; continue; }
    if (diaSemana(s.fecha) === 7)          { out[s.fecha] = 'Domingo sin atención'; continue; }
    const c = evaluarCelda(s.fecha, s.hora, modalidad, ocupacion, bloqueos);
    if (c.estado === 'ocupado' || c.estado === 'bloqueado') out[s.fecha] = c.motivo ?? 'No disponible';
  }
  return out;
}

export function tipoClaseDeModalidad(m: PlanModalidad): string {
  return m === '2:1' ? '2:1 Duo' : '1:1 Individual';
}

// ── Frecuencia semanal (veces por semana) ───────────────────────

/** Cuántas clases hay en la semana (lun–dom) de `fecha`. */
export function clasesEnSemana(sesiones: SesionPlan[], fecha: string): number {
  const lunes = lunesDe(fecha);
  return sesiones.filter(s => lunesDe(s.fecha) === lunes).length;
}

/** ¿Se puede agregar una clase en `fecha` sin pasar la frecuencia semanal? */
export function puedeAgregarEnSemana(sesiones: SesionPlan[], fecha: string, frecuencia: number): boolean {
  if (sesiones.some(s => s.fecha === fecha)) return true; // cambiar la hora de un día ya elegido
  return clasesEnSemana(sesiones, fecha) < frecuencia;
}

/** Semanas (por su lunes) que tienen más clases que la frecuencia elegida. */
export function semanasExcedidas(sesiones: SesionPlan[], frecuencia: number): string[] {
  const cuenta = new Map<string, number>();
  for (const s of sesiones) {
    const l = lunesDe(s.fecha);
    cuenta.set(l, (cuenta.get(l) ?? 0) + 1);
  }
  return [...cuenta].filter(([, n]) => n > frecuencia).map(([l]) => l).sort();
}

/** Total de clases de un plan: veces por semana × semanas. */
export function totalClasesPlan(frecuencia: number, semanas: number): number {
  return frecuencia * semanas;
}
