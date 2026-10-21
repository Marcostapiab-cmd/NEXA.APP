import { NextRequest, NextResponse } from 'next/server';
import { getAlumnoGrupalSesion, supabaseAdmin } from '@/lib/grupales-server';

export const runtime = 'nodejs';

interface ReservaBody {
  clase_id:  string;
  fecha:     string;
  hora:      string;
  compra_id: string;
}

// Reserva una clase usando el saldo de un pack pagado. Toda la validación
// (cupo, duplicado, vigencia, horario real, bloqueo) y el descuento del
// crédito ocurren en una sola transacción en reservar_clase_grupal (034).
export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();

  try {
    const alumno = await getAlumnoGrupalSesion(admin);
    if (!alumno) return NextResponse.json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, { status: 401 });

    const { clase_id, fecha, hora, compra_id } = await req.json() as ReservaBody;
    if (!clase_id || !fecha || !hora || !compra_id) {
      return NextResponse.json({ error: 'Faltan datos de la reserva.' }, { status: 400 });
    }

    const { data, error } = await admin.rpc('reservar_clase_grupal', {
      p_user_id:      alumno.user_id,
      p_clase_id:     clase_id,
      p_compra_id:    compra_id,
      p_fecha:        fecha,
      p_hora:         hora,
      p_nombre_clase: '',
    });

    if (error) {
      console.error('[grupales/reservar] rpc error:', error);
      return NextResponse.json({ error: 'No pudimos procesar la reserva. Intenta de nuevo.' }, { status: 500 });
    }

    const result = data as { ok?: boolean; error?: string; code?: number };
    if (result.error) {
      const status = result.code && result.code >= 400 && result.code < 500 ? result.code : 500;
      return NextResponse.json({ error: status === 500 ? 'No pudimos procesar la reserva.' : result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[grupales/reservar] error:', err);
    return NextResponse.json({ error: 'No pudimos procesar la reserva.' }, { status: 500 });
  }
}
