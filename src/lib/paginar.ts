// Supabase entrega como máximo 1000 filas por consulta. Para sumar o contar
// sobre tablas que crecen (reservas, pagos, sesiones…) hay que pedir por
// páginas; si no, los totales salen incompletos sin ningún aviso.

export const TAM_PAGINA = 1000;

/**
 * Pide todas las páginas de una consulta. `pagina(desde, hasta)` debe armar la
 * consulta con un orden estable (p. ej. `.order('id')`) y `.range(desde, hasta)`.
 * Si una página falla, lanza el error: nunca devuelve un total incompleto.
 */
export async function todasLasFilas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tam = TAM_PAGINA,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await pagina(desde, desde + tam - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < tam) return out;
  }
}
