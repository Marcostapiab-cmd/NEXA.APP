import { supabase } from './supabaseClient';

export interface Pago {
  id: string;
  alumnoId: string;
  planId?: string;
  monto: number;         // pesos CLP
  moneda: string;
  estado: 'pendiente' | 'pagado' | 'fallido' | 'reembolsado';
  metodo: 'stripe' | 'transferencia' | 'efectivo';
  descripcion?: string;
  checkoutUrl?: string;
  fechaPago?: string;
  createdAt: string;
}

function toPago(r: Record<string, unknown>): Pago {
  return {
    id:          String(r.id),
    alumnoId:    String(r.alumno_id),
    planId:      r.plan_id ? String(r.plan_id) : undefined,
    monto:       Number(r.monto),
    moneda:      String(r.moneda ?? 'clp'),
    estado:      (r.estado as Pago['estado']) ?? 'pendiente',
    metodo:      (r.metodo as Pago['metodo']) ?? 'stripe',
    descripcion: r.descripcion ? String(r.descripcion) : undefined,
    checkoutUrl: r.checkout_url ? String(r.checkout_url) : undefined,
    fechaPago:   r.fecha_pago ? String(r.fecha_pago).slice(0, 10) : undefined,
    createdAt:   String(r.created_at),
  };
}

export async function getPagosAlumnoDB(alumnoId: string): Promise<Pago[]> {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('alumno_id', alumnoId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => toPago(r as Record<string, unknown>));
}

export async function getAllPagosDB(): Promise<Pago[]> {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(r => toPago(r as Record<string, unknown>));
}

export async function createPagoDB(pago: Omit<Pago, 'id' | 'createdAt'>): Promise<Pago> {
  const { data, error } = await supabase
    .from('pagos')
    .insert({
      alumno_id:   pago.alumnoId,
      plan_id:     pago.planId ?? null,
      monto:       pago.monto,
      moneda:      pago.moneda,
      estado:      pago.estado,
      metodo:      pago.metodo,
      descripcion: pago.descripcion ?? null,
      checkout_url: pago.checkoutUrl ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toPago(data as unknown as Record<string, unknown>);
}

export async function updatePagoEstadoDB(
  id: string,
  estado: Pago['estado'],
  extra?: { fechaPago?: string; stripePaymentIntentId?: string },
): Promise<void> {
  const payload: Record<string, unknown> = { estado };
  if (extra?.fechaPago) payload.fecha_pago = extra.fechaPago;
  if (extra?.stripePaymentIntentId) payload.stripe_payment_intent_id = extra.stripePaymentIntentId;
  const { error } = await supabase.from('pagos').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deletePagoDB(id: string): Promise<void> {
  const { error } = await supabase.from('pagos').delete().eq('id', id);
  if (error) throw error;
}
