// Contadores del panel. Fechas siempre en hora de Chile (America/Santiago),
// sin depender de la zona horaria del dispositivo.

const TZ = 'America/Santiago';

/** Fecha YYYY-MM-DD en Chile para un instante dado. */
export function fechaChile(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function sumarDias(f: string, n: number): string {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Semana actual en Chile, de lunes a domingo (ambos incluidos). */
export function semanaChile(ahora: Date = new Date()): { desde: string; hasta: string } {
  const hoy = fechaChile(ahora);
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const desde = sumarDias(hoy, dow === 0 ? -6 : 1 - dow);
  return { desde, hasta: sumarDias(desde, 6) };
}

/** Estados con los que un alumno sí entrena ese día. */
export const ESTADOS_ENTRENA = ['pendiente', 'confirmada', 'presente'] as const;

/** Alumnos distintos con al menos una reserva activa en la fecha. */
export function alumnosQueEntrenan(
  reservas: { alumnoId?: string | null; estado?: string | null; fecha?: string | null }[],
  fecha: string,
): number {
  const ids = new Set<string>();
  for (const r of reservas) {
    if (!r.alumnoId) continue;
    if (String(r.fecha ?? '').slice(0, 10) !== fecha) continue;
    if (!(ESTADOS_ENTRENA as readonly string[]).includes(String(r.estado ?? ''))) continue;
    ids.add(r.alumnoId);
  }
  return ids.size;
}
