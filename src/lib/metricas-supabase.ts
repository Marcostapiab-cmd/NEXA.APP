import { supabase } from './supabaseClient';

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
  const { data } = await supabase.from('atletas').select('estado, estado_pago');
  const rows = data ?? [];
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
  const mesInicio = new Date();
  mesInicio.setDate(1);
  mesInicio.setHours(0, 0, 0, 0);

  const [pagosRes, pedidosRes, grupalesRes] = await Promise.all([
    supabase.from('pagos').select('estado, monto, fecha_pago'),
    supabase.from('pedidos_planes').select('estado, monto_clp, created_at, confirmado_at'),
    supabase.from('grupales_compras').select('estado_pago, monto_clp, fecha_compra, creado_en'),
  ]);
  if (pagosRes.error) throw pagosRes.error;
  if (pedidosRes.error) throw pedidosRes.error;

  const pagos   = pagosRes.data   ?? [];
  const pedidos = pedidosRes.data ?? [];
  const grupales = (grupalesRes.data ?? []).filter(g => g.estado_pago === 'pagado');
  const grupalesPagado = grupales.reduce((s, g) => s + (g.monto_clp ?? 0), 0);
  const grupalesEsteMes = grupales
    .filter(g => new Date(g.fecha_compra ?? g.creado_en) >= mesInicio)
    .reduce((s, g) => s + (g.monto_clp ?? 0), 0);

  const atletasPagado    = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto ?? 0), 0);
  const atletasPendiente = pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + (p.monto ?? 0), 0);
  const planesPagado     = pedidos.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto_clp ?? 0), 0);
  const planesPendiente  = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'procesando').reduce((s, p) => s + (p.monto_clp ?? 0), 0);

  const atletasEsteMes = pagos
    .filter(p => p.estado === 'pagado' && p.fecha_pago && new Date(p.fecha_pago) >= mesInicio)
    .reduce((s, p) => s + (p.monto ?? 0), 0);
  const planesEsteMes = pedidos
    .filter(p => p.estado === 'pagado' && p.confirmado_at && new Date(p.confirmado_at) >= mesInicio)
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
