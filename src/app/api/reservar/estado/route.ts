import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

interface PedidoRow {
  id:            string;
  estado:        string;
  nombre:        string;
  apellido:      string;
  fecha:         string;
  hora:          string;
  monto_clp:     number;
  reserva_id:    number | null;
  planes_grupales:  { nombre: string } | null;
  clases_grupales:  { nombre: string } | null;
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { searchParams } = req.nextUrl;
  const token    = searchParams.get('token');
  const pedidoId = searchParams.get('pedidoId');

  if (!token && !pedidoId) {
    return NextResponse.json({ error: 'Se requiere token o pedidoId' }, { status: 400 });
  }

  const query = supabaseAdmin
    .from('pedidos_grupales')
    .select('id, estado, nombre, apellido, fecha, hora, monto_clp, reserva_id, planes_grupales(nombre), clases_grupales(nombre)');

  const { data, error } = token
    ? await query.eq('flow_token', token).maybeSingle()
    : await query.eq('id', pedidoId!).maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const pedido = data as unknown as PedidoRow;

  return NextResponse.json({
    id:        pedido.id,
    estado:    pedido.estado,
    nombre:    pedido.nombre,
    apellido:  pedido.apellido,
    fecha:     pedido.fecha,
    hora:      pedido.hora,
    montoCLP:  pedido.monto_clp,
    reservaId: pedido.reserva_id,
    plan:      pedido.planes_grupales?.nombre ?? null,
    clase:     pedido.clases_grupales?.nombre ?? null,
  });
}
