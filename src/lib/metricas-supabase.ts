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
  grupalesPagado: number;
  grupalesPendiente: number;
  esteMes: number;
}

export interface MetricasGrupales {
  reservadas: number;
  asistidas: number;
  canceladas: number;
  clasesTotales: number;
  clasesUsadas: number;
  clasesRestantes: number;
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

  const [pagosRes, comprasRes] = await Promise.all([
    supabase.from('pagos').select('estado, monto, fecha_pago'),
    supabase.from('grupales_compras').select('estado_pago, monto_clp, fecha_compra'),
  ]);

  const pagos   = pagosRes.data   ?? [];
  const compras = comprasRes.data ?? [];

  const atletasPagado     = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + (p.monto ?? 0), 0);
  const atletasPendiente  = pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + (p.monto ?? 0), 0);
  const grupalesPagado    = compras.filter(c => c.estado_pago === 'pagado').reduce((s, c) => s + (c.monto_clp ?? 0), 0);
  const grupalesPendiente = compras.filter(c => c.estado_pago === 'pendiente').reduce((s, c) => s + (c.monto_clp ?? 0), 0);

  const atletasEsteMes = pagos
    .filter(p => p.estado === 'pagado' && p.fecha_pago && p.fecha_pago >= mesInicioISO)
    .reduce((s, p) => s + (p.monto ?? 0), 0);
  const grupalesEsteMes = compras
    .filter(c => c.estado_pago === 'pagado' && c.fecha_compra && c.fecha_compra >= mesInicioISO)
    .reduce((s, c) => s + (c.monto_clp ?? 0), 0);

  return {
    atletasPagado,
    atletasPendiente,
    grupalesPagado,
    grupalesPendiente,
    esteMes: atletasEsteMes + grupalesEsteMes,
  };
}

export async function getMetricasGrupales(): Promise<MetricasGrupales> {
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [reservasRes, comprasRes] = await Promise.all([
    supabase.from('grupales_reservas').select('estado').gte('creado_en', hace30),
    supabase.from('grupales_compras')
      .select('clases_totales, clases_usadas, clases_restantes')
      .eq('estado_pago', 'pagado'),
  ]);

  const reservas = reservasRes.data ?? [];
  const compras  = comprasRes.data  ?? [];

  return {
    reservadas:      reservas.filter(r => r.estado === 'reservada').length,
    asistidas:       reservas.filter(r => r.estado === 'asistida').length,
    canceladas:      reservas.filter(r => r.estado === 'cancelada').length,
    clasesTotales:   compras.reduce((s, c) => s + (c.clases_totales   ?? 0), 0),
    clasesUsadas:    compras.reduce((s, c) => s + (c.clases_usadas    ?? 0), 0),
    clasesRestantes: compras.reduce((s, c) => s + (c.clases_restantes ?? 0), 0),
  };
}
