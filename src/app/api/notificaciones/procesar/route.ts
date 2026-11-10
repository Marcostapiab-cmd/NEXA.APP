import { NextRequest, NextResponse } from 'next/server';
import { procesarCola } from '@/lib/notificaciones-server';
import { bearerValido } from '@/lib/secreto-servidor';
import { sesionServidor } from '@/lib/auth-server';

export const runtime = 'nodejs';

// Envía los avisos en cola. Lo llaman:
//  - la tarea horaria de Supabase (pg_net, migración 053) con
//    `Authorization: Bearer <NOTIFICACIONES_SECRET>` (sin sesión);
//  - la app, después de una acción de un usuario con sesión y rol válido.
// Solo envía lo que la base ya encoló: no recibe datos del navegador, así que
// llamarlo de más no puede crear ni duplicar correos.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  let autorizado = bearerValido(auth, process.env.NOTIFICACIONES_SECRET, process.env.CRON_SECRET);
  if (!autorizado) {
    const { user, rol } = await sesionServidor();
    autorizado = !!user && !!rol;
  }
  if (!autorizado) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const r = await procesarCola(undefined, 40);
  return NextResponse.json({ ok: true, ...r });
}
