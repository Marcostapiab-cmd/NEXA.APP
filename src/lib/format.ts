export const DIAS_LARGO  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'] as const;
export const DIAS_CORTO  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'] as const;
export const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'] as const;
export const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] as const;
export const MESES_CAP   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] as const;

export function clp(n: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Fecha local YYYY-MM-DD (no UTC: en Chile, después de las 21:00 UTC ya es "mañana"). */
export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoy en hora local, formato YYYY-MM-DD. */
export function hoyLocal(): string {
  return fechaLocal();
}

/** Limpia un texto de búsqueda para usarlo dentro de un filtro `.or()` de Supabase
 *  (las comas, paréntesis y comodines rompen o alteran el filtro). */
export function textoBusqueda(q: string): string {
  return q.replace(/[,()%*\\:"]/g, ' ').replace(/\s+/g, ' ').trim();
}
