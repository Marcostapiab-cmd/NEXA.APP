import { NextRequest, NextResponse } from 'next/server';
import { pagosSimulados } from '@/lib/flow';

export const runtime = 'nodejs';

// Reemplaza la página de pago de Flow cuando PAGOS_SIMULADOS=1 (solo `next dev`).
// Hace lo mismo que Flow tras un pago aprobado: llama al webhook de confirmación
// y devuelve al alumno a la página de retorno. Fuera del modo simulado no existe.
export async function GET(req: NextRequest) {
  if (!pagosSimulados()) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const p       = req.nextUrl.searchParams;
  const token   = p.get('token') ?? '';
  const confirm = p.get('c') ?? '';
  const retorno = p.get('r') ?? '';
  if (!token.startsWith('sim-') || !confirm.startsWith('/api/') || !retorno.startsWith('/api/')) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const res = await fetch(`${origin}${confirm}`, { method: 'POST', body: new URLSearchParams({ token }) });
  if (!res.ok) console.error('[simular-pago] el webhook respondió', res.status, await res.text().catch(() => ''));

  const destino = new URL(retorno, origin);
  destino.searchParams.set('token', token);
  return NextResponse.redirect(destino, 303);
}
