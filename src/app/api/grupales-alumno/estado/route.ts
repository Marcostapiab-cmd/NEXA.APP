import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/grupales-server';

export const runtime = 'nodejs';

interface CompraRow {
  estado_pago:            string;
  clases_totales:         number;
  fecha_expira:           string;
  monto_clp:              number;
  primera_fecha:          string | null;
  primera_hora:           string | null;
  primera_reserva_estado: string | null;
  planes_grupales:        { nombre: string; validez_dias: number } | null;
  grupales_packs:         { nombre: string } | null;
  clases_grupales:        { nombre: string } | null;
}

// Consultado por /grupales-alumno/retorno después de volver de Flow.
// Solo informa lo que está registrado en la base: nunca da por pagado
// algo que el webhook no confirmó.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ error: 'Token faltante.' }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from('grupales_compras')
    .select('estado_pago, clases_totales, fecha_expira, monto_clp, primera_fecha, primera_hora, primera_reserva_estado, planes_grupales(nombre, validez_dias), grupales_packs(nombre), clases_grupales!grupales_compras_primera_clase_id_fkey(nombre)')
    .eq('referencia_flow', token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'No pudimos consultar el estado.' }, { status: 500 });
  if (!data)  return NextResponse.json({ estado_pago: 'pendiente' });

  const c = data as unknown as CompraRow;
  return NextResponse.json({
    estado_pago:    c.estado_pago,
    plan:           c.planes_grupales?.nombre ?? c.grupales_packs?.nombre ?? 'Pack de clases',
    clases_totales: c.clases_totales,
    validez_dias:   c.planes_grupales?.validez_dias ?? null,
    fecha_expira:   c.estado_pago === 'pagado' ? c.fecha_expira : null,
    monto_clp:      c.monto_clp,
    primera: c.primera_fecha ? {
      clase:  c.clases_grupales?.nombre ?? 'Clase grupal',
      fecha:  c.primera_fecha,
      hora:   c.primera_hora,
      estado: c.primera_reserva_estado, // null mientras el pago no se confirma
    } : null,
  });
}
