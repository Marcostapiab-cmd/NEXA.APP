// Ruta no utilizada — Flow usa /api/pagos/flow-confirmation como webhook
import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ ok: false, msg: 'Use /api/pagos/flow-confirmation' }, { status: 404 });
}
