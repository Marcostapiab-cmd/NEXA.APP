import { NextRequest, NextResponse } from 'next/server';
import { consultarPagoFlow } from '@/lib/flow';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 });

  try {
    const data = await consultarPagoFlow(token);
    return NextResponse.json({ status: data.status, amount: data.amount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
