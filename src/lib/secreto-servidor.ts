import { timingSafeEqual } from 'crypto';

/**
 * ¿La petición trae `Authorization: Bearer <secreto>` con alguno de los
 * secretos configurados? Un secreto vacío o sin configurar nunca coincide
 * (antes, sin CRON_SECRET, la cadena "Bearer undefined" pasaba).
 */
export function bearerValido(header: string | null, ...secretos: (string | undefined)[]): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const recibido = Buffer.from(header.slice(7));
  return secretos.some(s => {
    if (!s || s.length < 16) return false;
    const esperado = Buffer.from(s);
    return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  });
}
