import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { crearPagoFlow } from '@/lib/flow';

export const runtime = 'nodejs';

interface Body {
  planId:   string;
  claseId:  string;
  fecha:    string;
  hora:     string;
  nombre:   string;
  apellido: string;
  email:    string;
  telefono: string | null;
  rut:      string | null;
}

interface Clase {
  hora:     string;
  capacidad: number;
  nombre:   string;
}

interface Plan {
  precio_clp: number;
  nombre:     string;
  num_clases: number;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json() as Body;
    const { planId, claseId, fecha, hora, nombre, apellido, email, telefono, rut } = body;

    // Validaciones básicas
    if (!planId || !claseId || !fecha || !hora || !nombre.trim() || !apellido.trim()) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 });
    }
    if (!email?.trim()) {
      return NextResponse.json({ error: 'El email es obligatorio para procesar el pago.' }, { status: 400 });
    }

    // Verificar plan activo
    const { data: plan, error: planErr } = await supabaseAdmin
      .from('planes_grupales')
      .select('precio_clp, nombre, num_clases')
      .eq('id', planId)
      .eq('activo', true)
      .single();
    if (planErr || !plan) {
      return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 });
    }

    // Verificar clase activa
    const { data: clase, error: claseErr } = await supabaseAdmin
      .from('clases_grupales')
      .select('hora, capacidad, nombre')
      .eq('id', claseId)
      .eq('activa', true)
      .single();
    if (claseErr || !clase) {
      return NextResponse.json({ error: 'Clase no encontrada.' }, { status: 404 });
    }

    // Verificar cupos en tiempo real
    const { count } = await supabaseAdmin
      .from('reservas')
      .select('id', { count: 'exact', head: true })
      .eq('fecha', fecha)
      .eq('hora', (clase as Clase).hora)
      .ilike('tipo_clase', '%grupal%')
      .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa,no_show)');

    if ((count ?? 0) >= (clase as Clase).capacidad) {
      return NextResponse.json({ error: 'No quedan cupos disponibles para esta clase.' }, { status: 409 });
    }

    // Crear pedido en DB
    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from('pedidos_grupales')
      .insert({
        plan_id:   planId,
        clase_id:  claseId,
        fecha,
        hora:      (clase as Clase).hora,
        nombre:    nombre.trim(),
        apellido:  apellido.trim(),
        email:     email.trim(),
        telefono:  telefono?.trim() || null,
        rut:       rut?.trim()      || null,
        monto_clp: (plan as Plan).precio_clp,
        estado:    'pendiente',
      })
      .select('id')
      .single();

    if (pedidoErr || !pedido) {
      console.error('[reservar/pagar] pedido insert error:', pedidoErr);
      return NextResponse.json({ error: 'Error al crear el pedido.' }, { status: 500 });
    }

    const pedidoId     = (pedido as { id: string }).id;
    const commerceOrder = `nexa-g-${pedidoId.slice(0, 16)}`;
    const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const nombreClase  = (clase as Clase & { nombre: string }).nombre;
    const nombrePlan   = (plan as Plan).nombre;

    // Crear orden en Flow
    const flow = await crearPagoFlow({
      commerceOrder,
      subject:         `${nombreClase} — ${nombrePlan} · ${nombre.trim()} ${apellido.trim()}`,
      amount:          (plan as Plan).precio_clp,
      email:           email.trim(),
      urlReturn:       `${baseUrl}/reservar/retorno`,
      urlConfirmation: `${baseUrl}/api/reservar/confirmar`,
    });

    // Guardar flow_token en pedido
    const { error: tokenUpdateErr } = await supabaseAdmin
      .from('pedidos_grupales')
      .update({
        flow_token:     flow.token,
        flow_order:     flow.flowOrder,
        commerce_order: commerceOrder,
        estado:         'procesando',
      })
      .eq('id', pedidoId);

    if (tokenUpdateErr) {
      // El link de pago ya se generó en Flow, así que dejamos que el alumno pague igual;
      // pero si esto falla, la confirmación posterior no va a encontrar el pedido por flow_token.
      console.error('[reservar/pagar] error guardando flow_token en pedido:', pedidoId, tokenUpdateErr);
    }

    return NextResponse.json({ payUrl: flow.payUrl, pedidoId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[reservar/pagar] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
