import { supabase } from './supabaseClient';

import { todasLasFilas } from '@/lib/paginar';
import { fechaChile } from '@/lib/contadores';
export interface MetricasAlumnos {
  total: number;
  activos: number;
  pendientes: number;
  archivados: number;
  alDia: number;
  debe: number;
}

export interface MetricasIngresos {
  atletasPagado: number;
  atletasPendiente: number;
  planesPagado: number;
  planesPendiente: number;
  grupalesPagado: number;
  esteMes: number;
}

export async function getMetricasAlumnos(): Promise<MetricasAlumnos> {
  const rows = await todasLasFilas<{ estado: string | null; estado_pago: string | null }>((d, h) =>
    supabase.from('atletas').select('estado, estado_pago').order('id').range(d, h));
  return {
    total:      rows.length,
    activos:    rows.filter(r => r.estado === 'activo').length,
    pendientes: rows.filter(r => r.estado === 'pendiente').length,
    archivados: rows.filter(r => r.estado === 'archivado').length,
    alDia:      rows.filter(r => r.estado_pago === 'al_dia').length,
    debe:       rows.filter(r => r.estado_pago === 'debe').length,
  };
}

export async function getMetricasIngresos(): Promise<MetricasIngresos> {
  // "Este mes" según el calendario de Chile
  const mesChile = fechaChile().slice(0, 7);
  const esDeEsteMes = (iso: string | null | undefined) => !!iso && fechaChile(new Date(iso)).slice(0, 7) === mesChile;

  type PagoRow = { estado: string; monto: number | null; fecha_pago: string | null; referencia_pago?: string | null };
  type PedidoRow = { estado: string; monto_clp: number | null; created_at: string; confirmado_at: string | null; flow_token: string | null };
  type GrupalRow = { estado_pago: string; monto_clp: number | null; fecha_compra: string | null; creado_en: string };
  const [pagos, pedidos, grupalesTodas] = await Promise.all([
    todasLasFilas<PagoRow>((d, h) => supabase.from('pagos').select('*').order('id').range(d, h)),
    todasLasFilas<PedidoRow>((d, h) => supabase.from('pedidos_planes').select('estado, monto_clp, created_at, confirmado_at, flow_token').order('id').range(d, h)),
    todasLasFilas<GrupalRow>((d, h) => supabase.from('grupales_compras').select('estado_pago, monto_clp, fecha_compra, creado_en').order('id').range(d, h)),
  ]);

  // Desde la migración 052, cada compra en línea de un plan queda también en
  // `pagos` (referencia_pago = token de Flow del pedido). Se cuenta una sola
  // vez, como plan en línea.
  const tokensPedidos = new Set(pedidos.map(p => p.flow_token).filter(Boolean));
  const pagosAtletas = pagos.filter(p => !(p.referencia_pago && tokensPedidos.has(p.referencia_pago)));

  const grupales = grupalesTodas.filter(g => g.estado_pago === 'pagado');
  const grupalesPagado = grupales.reduce((s, g) => s + (g.monto_clp ?? 0), 0);
  const grupalesEsteMes = grupales
    .filter(g => esDeEsteMes(g.fecha_compra ?? g.creado_en))
    .reduce((s, g) => s + (g.monto_clp ?? 0), 0);

  const atletasPagado    = pagosAtletas.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto ?? 0), 0);
  const atletasPendiente = pagosAtletas.filter(p => p.estado === 'pendiente').reduce((s, p) => s + (p.monto ?? 0), 0);
  const planesPagado     = pedidos.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto_clp ?? 0), 0);
  const planesPendiente  = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'procesando').reduce((s, p) => s + (p.monto_clp ?? 0), 0);

  const atletasEsteMes = pagosAtletas
    .filter(p => p.estado === 'pagado' && esDeEsteMes(p.fecha_pago))
    .reduce((s, p) => s + (p.monto ?? 0), 0);
  const planesEsteMes = pedidos
    .filter(p => p.estado === 'pagado' && esDeEsteMes(p.confirmado_at))
    .reduce((s, p) => s + (p.monto_clp ?? 0), 0);

  return {
    atletasPagado,
    atletasPendiente,
    planesPagado,
    planesPendiente,
    grupalesPagado,
    esteMes: atletasEsteMes + planesEsteMes + grupalesEsteMes,
  };
}
