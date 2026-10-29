// Política de cancelación y reagendamiento de NEXA (pura, sin red ni DB).
// La validación que manda es la de la base de datos (migración 041, función
// nexa_limite_cancelacion); esta copia sirve para mostrar el plazo en pantalla
// y se prueba con los mismos casos en politica-cancelacion.test.ts.
//
//  Regla A: clases que empiezan hasta las 12:00 (inclusive) → hasta las 22:00 del día anterior.
//  Regla B: clases que empiezan después de las 12:00          → 6 horas antes.
//  Regla D: todo en hora de Chile (America/Santiago); justo en el límite = a tiempo.

export const ZONA_CHILE = 'America/Santiago';

export interface PoliticaCancelacion {
  limiteHoraAm:       string; // 'HH:MM' — clases que empiezan a esta hora o antes usan la regla A
  corteCancelacionAm: string; // 'HH:MM' — hora tope del día anterior (regla A)
  cancelHorasAvisoPm: number; // horas de aviso (regla B)
}

export const POLITICA_DEFAULT: PoliticaCancelacion = {
  limiteHoraAm:       '12:00',
  corteCancelacionAm: '22:00',
  cancelHorasAvisoPm: 6,
};

/** Desfase (ms) de Chile respecto de UTC en un instante dado. */
function desfaseChile(instanteMs: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CHILE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instanteMs));
  const v = (t: string) => Number(p.find(x => x.type === t)?.value);
  const comoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return comoUtc - Math.floor(instanteMs / 1000) * 1000;
}

/** Instante real de una fecha+hora "de reloj" en Chile (respeta horario de verano). */
export function horaChile(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const [hh, mm] = hora.slice(0, 5).split(':').map(Number);
  const reloj = Date.UTC(y, m - 1, d, hh, mm);
  let t = reloj - desfaseChile(reloj);
  t = reloj - desfaseChile(t); // segunda pasada por si el cambio de hora cae entre medio
  return new Date(t);
}

function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d - 1));
  return x.toISOString().slice(0, 10);
}

/** Último instante en que se puede cancelar o reagendar sin perder la clase. */
export function limiteCancelacion(fecha: string, hora: string, pol: PoliticaCancelacion = POLITICA_DEFAULT): Date {
  const h = hora.slice(0, 5);
  if (h <= pol.limiteHoraAm) return horaChile(diaAnterior(fecha), pol.corteCancelacionAm);
  return new Date(horaChile(fecha, h).getTime() - pol.cancelHorasAvisoPm * 3_600_000);
}

/** ¿Está dentro de plazo? Justo en el límite cuenta como a tiempo. */
export function puedeCancelarATiempo(
  fecha: string, hora: string, ahora: Date = new Date(), pol: PoliticaCancelacion = POLITICA_DEFAULT,
): boolean {
  return ahora.getTime() <= limiteCancelacion(fecha, hora, pol).getTime();
}

/** "hasta el martes 27 a las 22:00" — texto corto del plazo, en hora de Chile. */
export function textoLimite(limite: Date): string {
  const f = new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA_CHILE, weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(limite);
  const v = (t: string) => f.find(x => x.type === t)?.value ?? '';
  return `${v('weekday')} ${v('day')} a las ${v('hour')}:${v('minute')}`;
}

export const MENSAJE_FUERA_DE_PLAZO =
  'No es posible cancelar esta clase sin perder tu crédito. El plazo de cancelación permitido ya finalizó. ' +
  'Si no puedes asistir, puedes comunicarte con NEXA Performance para solicitar una excepción.';
