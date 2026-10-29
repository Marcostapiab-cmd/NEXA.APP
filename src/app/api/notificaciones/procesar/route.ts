import { NextResponse } from 'next/server';
import { procesarCola } from '@/lib/notificaciones-server';

export const runtime = 'nodejs';

// Envía los avisos en cola. Lo llaman las acciones del alumno y la tarea
// horaria de Supabase (migración 043).
// Solo envía lo que la base de datos ya encoló; no recibe datos del navegador,
// así que llamarlo de más no puede crear ni duplicar correos.
export async function POST() {
  const r = await procesarCola(undefined, 40);
  return NextResponse.json({ ok: true, ...r });
}
