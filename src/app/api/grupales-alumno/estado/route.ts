import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Llamado desde /grupales-alumno/retorno para verificar el estado del pago
export async function GET(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ error: 'Token faltante.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('grupales_compras')
    .select('estado_pago, clases_totales, grupales_packs(nombre)')
    .eq('referencia_flow', token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Error al consultar el estado.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ estado_pago: 'pendiente' });
  }

  return NextResponse.json(data);
}
