import { supabase } from './supabaseClient';

export interface MetricasAlumnos {
  total: number;
  activos: number;
  inactivos: number;
  archivados: number;
  alDia: number;
  debe: number;
}

export interface MetricasIngresos {
  atletasPagado: number;
  atletasPendiente: number;
  planesPagado: number;
  planesPendiente: number;
  esteMes: number;
}

export async function getMetricasAlumnos(): Promise<MetricasAlumnos> {
  const { data } = await supabase.from('atletas').select('estado, estado_pago');
  const rows = data ?? [];
  return {
    total:      rows.length,
    activos:    rows.filter(r => r.estado === 'activo').length,
    inactivos:  rows.filter(r => r.estado === 'inactivo').length,
    archivados: rows.filter(r => r.estado === 'archivado').length,
    alDia:      rows.filter(r => r.estado_pago === 'al_dia').length,
    debe:       rows.filter(r => r.estado_pago === 'debe').length,
  };
}

export async function getMetricasIngresos(): Promise<MetricasIngresos> {
  const mesInicio = new Date();
  mesInicio.setDate(1);
  mesInicio.setHours(0, 0, 0, 0);
  const mesInicioISO = mesInicio.toISOString();

  const [pagosRes, pedidosRes] = await Promise.all([
    supabase.from('pagos').select('estado, monto, fecha_pago'),
    supabase.from('pedidos_planes').select('estado, monto_clp, created_at, confirmado_at'),
  ]);

  const pagos   = pagosRes.data   ?? [];
  const pedidos = pedidosRes.data ?? [];

  const atletasPagado    = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto ?? 0), 0);
  const atletasPendiente = pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + (p.monto ?? 0), 0);
  const planesPagado     = pedidos.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto_clp ?? 0), 0);
  const planesPendiente  = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'procesando').reduce((s, p) => s + (p.monto_clp ?? 0), 0);

  const atletasEsteMes = pagos
    .filter(p => p.estado === 'pagado' && p.fecha_pago && p.fecha_pago >= mesInicioISO)
    .reduce((s, p) => s + (p.monto ?? 0), 0);
  const planesEsteMes = pedidos
    .filter(p => p.estado === 'pagado' && p.confirmado_at && p.confirmado_at >= mesInicioISO)
    .reduce((s, p) => s + (p.monto_clp ?? 0), 0);

  return {
    atletasPagado,
    atletasPendiente,
    planesPagado,
    planesPendiente,
    esteMes: atletasEsteMes + planesEsteMes,
  };
}
