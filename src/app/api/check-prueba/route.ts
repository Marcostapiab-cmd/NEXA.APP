import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Normaliza a formato "12345678-9" para comparación
function normalizar(raw: string): { sinPuntos: string; conPuntos: string } {
  const clean = raw.replace(/[^0-9kK]/gi, '').toUpperCase();
  if (clean.length < 2) return { sinPuntos: '', conPuntos: '' };
  const cuerpo = clean.slice(0, -1);
  const dv     = clean.slice(-1);
  const sinPuntos = `${cuerpo}-${dv}`;
  const conPuntos = `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
  return { sinPuntos, conPuntos };
}

export async function GET(req: NextRequest) {
  const rut = req.nextUrl.searchParams.get('rut') ?? '';
  if (!rut) return NextResponse.json({ yaPago: false });

  const { sinPuntos, conPuntos } = normalizar(rut);
  if (!sinPuntos) return NextResponse.json({ yaPago: false });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Busca en ambos formatos (el histórico usaba con puntos, el nuevo sin puntos)
  const { count } = await admin
    .from('pedidos_grupales')
    .select('id', { count: 'exact', head: true })
    .or(`rut.eq.${sinPuntos},rut.eq.${conPuntos}`)
    .eq('estado', 'pagado');

  return NextResponse.json({ yaPago: (count ?? 0) > 0 });
}
