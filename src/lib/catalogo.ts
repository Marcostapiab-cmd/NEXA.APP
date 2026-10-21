// Catálogo público de NEXA: tipos y reglas de negocio compartidas entre
// la página de planes, los modales de compra y las API de pago.
// Los datos (precios, clases, vigencias) vienen SIEMPRE de Supabase:
//  - Packs grupales  → tabla `planes_grupales` (migración 026)
//  - Planes 1:1/2:1  → tablas `precios_entrenamiento` y
//                      `precios_entrenamiento_config` (migración 033)

export type Modalidad = '1:1' | '2:1';
export type TipoPlan  = 'mensual' | 'trimestral' | 'semestral';

export const MODALIDADES: Modalidad[] = ['1:1', '2:1'];
export const TIPOS_PLAN: TipoPlan[]   = ['mensual', 'trimestral', 'semestral'];
export const FRECUENCIAS              = [1, 2, 3, 4, 5] as const;

export const TIPO_LABEL: Record<TipoPlan, string> = {
  mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral',
};

// Deben coincidir con confirmar_pedido_plan_pago (migración 033)
export const MESES_POR_TIPO:   Record<TipoPlan, number> = { mensual: 1,  trimestral: 3,  semestral: 6 };
export const SEMANAS_POR_TIPO: Record<TipoPlan, number> = { mensual: 4,  trimestral: 12, semestral: 24 };
export const DIAS_POR_TIPO:    Record<TipoPlan, number> = { mensual: 30, trimestral: 90, semestral: 180 };

export const MODALIDAD_INFO: Record<Modalidad, { titulo: string; desc: string }> = {
  '1:1': { titulo: 'Entrenamiento 1:1', desc: 'Entrenamiento personalizado: solo tú y tu coach.' },
  '2:1': { titulo: 'Entrenamiento 2:1', desc: 'La misma atención personalizada, compartiendo el cupo con otra persona.' },
};

export interface PlanGrupal {
  id:           string;
  nombre:       string;
  descripcion:  string | null;
  precio_clp:   number;
  num_clases:   number;
  validez_dias: number;
  destacado:    boolean;
}

export interface PrecioEntrenamiento {
  modalidad:          Modalidad;
  frecuencia_semanal: number;
  precio_mes_clp:     number;
}

export type ConfigPrecios = Record<string, number>;

export interface CatalogoPublico {
  grupales: PlanGrupal[];
  precios:  PrecioEntrenamiento[];
  config:   ConfigPrecios;
  error:    boolean;
}

// ── Packs grupales ────────────────────────────────────────────────

// Regla existente del proyecto (antes en /api/check-prueba): la clase de
// prueba de 1 clase se puede comprar una sola vez por persona.
export function esClaseDePrueba(plan: Pick<PlanGrupal, 'nombre' | 'num_clases'>): boolean {
  return plan.num_clases === 1 && plan.nombre.toLowerCase().includes('prueba');
}

export function etiquetaClases(n: number): string {
  return `${n} ${n === 1 ? 'clase' : 'clases'}`;
}

export function etiquetaDias(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

// ── Planes 1:1 / 2:1 ──────────────────────────────────────────────

export function descuentoMensual(tipo: TipoPlan, config: ConfigPrecios): number {
  if (tipo === 'trimestral') return config.descuento_trimestral_mes ?? 0;
  if (tipo === 'semestral')  return config.descuento_semestral_mes ?? 0;
  return 0;
}

export function precioMensualPlan(precioMesBase: number, tipo: TipoPlan, config: ConfigPrecios): number {
  return precioMesBase - descuentoMensual(tipo, config);
}

/** Monto total a pagar. Lo usa la UI y la API de pago (fuente única). */
export function montoTotalPlan(precioMesBase: number, tipo: TipoPlan, config: ConfigPrecios): number {
  return precioMensualPlan(precioMesBase, tipo, config) * MESES_POR_TIPO[tipo];
}

export function sesionesTotalesPlan(frecuencia: number, tipo: TipoPlan): number {
  return frecuencia * SEMANAS_POR_TIPO[tipo];
}

export function buscarPrecio(precios: PrecioEntrenamiento[], modalidad: Modalidad, frecuencia: number) {
  return precios.find(p => p.modalidad === modalidad && p.frecuencia_semanal === frecuencia) ?? null;
}

// ── Sesiones grupales (get_sesiones_publicas) ─────────────────────

export interface SesionPublica {
  clase_id:     string;
  nombre:       string;
  duracion_min: number;
  hora:         string;
  dia_semana:   number;
  capacidad:    number;
  disponibles:  number;
  fecha:        string;
  bloqueada:    boolean;
  coach_nombre: string;
}

export function sesionReservable(s: SesionPublica, ahora = new Date()): boolean {
  if (s.bloqueada || s.disponibles <= 0) return false;
  return new Date(`${s.fecha}T${s.hora}:00`) > ahora;
}

// ── Validaciones de formulario ────────────────────────────────────

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarRut(rut: string): boolean {
  const s = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1);
  const dv     = s.slice(-1);
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const esperado = 11 - (suma % 11);
  return dv === (esperado === 11 ? '0' : esperado === 10 ? 'K' : String(esperado));
}

export function formatearRut(raw: string): string {
  const s = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (s.length < 2) return s;
  return `${s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${s.slice(-1)}`;
}

/** Variantes con y sin puntos, para buscar RUTs guardados en distintos formatos. */
export function variantesRut(raw: string): string[] {
  const s = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (s.length < 2) return [];
  const cuerpo = s.slice(0, -1);
  const dv     = s.slice(-1);
  return [`${cuerpo}-${dv}`, `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`];
}
