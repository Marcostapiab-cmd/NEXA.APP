import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consultarPagoFlow } from '@/lib/flow';

export const runtime = 'nodejs';

// Flow llama a este endpoint vía POST con form-data { token }
export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Flow envía form-urlencoded
    const formData = await req.formData();
    const token    = formData.get('token')?.toString() ?? '';

    if (!token) {
      console.error('[confirmar] token missing');
      return NextResponse.json({ error: 'Token faltante.' }, { status: 400 });
    }

    // Consultar estado en Flow
    const resultado = await consultarPagoFlow(token);
    if (resultado.status !== 2) {
      // Pago no completado — marcar según estado
      const estadoMap: Record<number, string> = { 1: 'pendiente', 3: 'fallido', 4: 'cancelado' };
      const nuevoEstado = estadoMap[resultado.status] ?? 'fallido';
      await supabaseAdmin
        .from('grupales_compras')
        .update({ estado_pago: nuevoEstado })
        .eq('referencia_flow', token);
      return NextResponse.json({ ok: true, estado: nuevoEstado });
    }

    // Pago confirmado (status === 2)
    const { data: compra, error: compraErr } = await supabaseAdmin
      .from('grupales_compras')
      .select('id, pack_id, alumno_id, estado_pago')
      .eq('referencia_flow', token)
      .maybeSingle();

    if (compraErr || !compra) {
      console.error('[confirmar] compra not found for token:', token, compraErr);
      return NextResponse.json({ error: 'Compra no encontrada.' }, { status: 404 });
    }

    const c = compra as { id: string; pack_id: string; alumno_id: string; estado_pago: string };

    // Idempotencia: si ya estaba pagado, no hacer nada
    if (c.estado_pago === 'pagado') {
      return NextResponse.json({ ok: true, estado: 'pagado' });
    }

    // Obtener validez del pack para calcular fecha de expiración real
    const { data: pack } = await supabaseAdmin
      .from('grupales_packs')
      .select('validez_dias, num_clases')
      .eq('id', c.pack_id)
      .single();

    const validez    = (pack as { validez_dias: number; num_clases: number } | null)?.validez_dias ?? 45;
    const numClases  = (pack as { validez_dias: number; num_clases: number } | null)?.num_clases ?? 0;
    const fechaExpira = new Date();
    fechaExpira.setDate(fechaExpira.getDate() + validez);

    // Actualizar compra: marcar como pagada con fecha real de expiración
    await supabaseAdmin
      .from('grupales_compras')
      .update({
        estado_pago:      'pagado',
        fecha_expira:     fechaExpira.toISOString(),
        clases_totales:   numClases,
        clases_restantes: numClases,
        clases_usadas:    0,
      })
      .eq('id', c.id);

    console.log(`[confirmar] Pack cargado: ${numClases} clases para alumno ${c.alumno_id}`);
    return NextResponse.json({ ok: true, estado: 'pagado' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[confirmar] error:', msg);
    // Flow espera 200 para no reintentar
    return NextResponse.json({ error: msg }, { status: 200 });
  }
}
