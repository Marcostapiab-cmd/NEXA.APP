import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { crearPagoFlow } from '@/lib/flow';
import { EMAIL_RE, montoTotalPlan, validarRut, type Modalidad, type TipoPlan as Tipo } from '@/lib/catalogo';

export const runtime = 'nodejs';

interface Body {
  modalidad:          Modalidad;
  frecuenciaSemanal:  number;
  tipo:               Tipo;
  diasSemana:         number[];
  hora:               string;
  nombre:             string;
  apellido:           string;
  email:              string;
  telefono:           string | null;
  rut:                string | null;
}


export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json() as Body;
    const { modalidad, frecuenciaSemanal, tipo, diasSemana, hora, nombre, apellido, email, telefono, rut } = body;

    // Validaciones básicas
    if (!['1:1', '2:1'].includes(modalidad)) {
      return NextResponse.json({ error: 'Modalidad inválida.' }, { status: 400 });
    }
    if (!Number.isInteger(frecuenciaSemanal) || frecuenciaSemanal < 1 || frecuenciaSemanal > 5) {
      return NextResponse.json({ error: 'Frecuencia inválida.' }, { status: 400 });
    }
    if (!['mensual', 'trimestral', 'semestral'].includes(tipo)) {
      return NextResponse.json({ error: 'Duración inválida.' }, { status: 400 });
    }
    if (!Array.isArray(diasSemana) || diasSemana.length !== frecuenciaSemanal
        || new Set(diasSemana).size !== diasSemana.length
        || diasSemana.some(d => !Number.isInteger(d) || d < 1 || d > 6)) {
      return NextResponse.json({ error: 'Debes elegir exactamente los días que correspondan a tu frecuencia semanal.' }, { status: 400 });
    }
    if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      return NextResponse.json({ error: 'La hora no es válida.' }, { status: 400 });
    }
    if (rut?.trim() && !validarRut(rut)) {
      return NextResponse.json({ error: 'El RUT no es válido.' }, { status: 400 });
    }
    if (!hora || !nombre?.trim() || !apellido?.trim()) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 });
    }
    if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Ingresa un email válido para procesar el pago.' }, { status: 400 });
    }

    // Precio: siempre se calcula en el servidor, nunca se confía en el monto del cliente
    const [{ data: precioFila, error: precioErr }, { data: configFilas, error: configErr }] = await Promise.all([
      supabaseAdmin
        .from('precios_entrenamiento')
        .select('precio_mes_clp')
        .eq('modalidad', modalidad)
        .eq('frecuencia_semanal', frecuenciaSemanal)
        .single(),
      supabaseAdmin
        .from('precios_entrenamiento_config')
        .select('clave, valor'),
    ]);

    if (precioErr || !precioFila) {
      return NextResponse.json({ error: 'No se encontró precio para esa combinación.' }, { status: 404 });
    }
    if (configErr || !configFilas) {
      return NextResponse.json({ error: 'Error al leer configuración de precios.' }, { status: 500 });
    }

    const config: Record<string, number> = {};
    for (const c of configFilas as { clave: string; valor: number }[]) config[c.clave] = c.valor;

    const montoClp = montoTotalPlan((precioFila as { precio_mes_clp: number }).precio_mes_clp, tipo, config);
    if (!Number.isInteger(montoClp) || montoClp <= 0) {
      return NextResponse.json({ error: 'No se pudo calcular el precio del plan.' }, { status: 500 });
    }

    // Crear pedido en DB
    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from('pedidos_planes')
      .insert({
        modalidad,
        frecuencia_semanal: frecuenciaSemanal,
        tipo,
        dias_semana: diasSemana,
        hora,
        nombre:    nombre.trim(),
        apellido:  apellido.trim(),
        email:     email.trim(),
        telefono:  telefono?.trim() || null,
        rut:       rut?.trim()      || null,
        monto_clp: montoClp,
        estado:    'pendiente',
      })
      .select('id')
      .single();

    if (pedidoErr || !pedido) {
      console.error('[reservar/pagar] pedido insert error:', pedidoErr);
      return NextResponse.json({ error: 'Error al crear el pedido.' }, { status: 500 });
    }

    const pedidoId      = (pedido as { id: string }).id;
    const commerceOrder = `nexa-p-${pedidoId.slice(0, 16)}`;
    const baseUrl       = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    // Crear orden en Flow
    const flow = await crearPagoFlow({
      commerceOrder,
      subject:         `Plan ${tipo} ${modalidad} · ${nombre.trim()} ${apellido.trim()}`,
      amount:          montoClp,
      email:           email.trim(),
      urlReturn:       `${baseUrl}/api/reservar/retorno`,
      urlConfirmation: `${baseUrl}/api/reservar/confirmar`,
    });

    // Guardar flow_token en pedido
    const { error: tokenUpdateErr } = await supabaseAdmin
      .from('pedidos_planes')
      .update({
        flow_token:     flow.token,
        flow_order:     flow.flowOrder,
        commerce_order: commerceOrder,
        estado:         'procesando',
      })
      .eq('id', pedidoId);

    if (tokenUpdateErr) {
      // Sin el token guardado, la confirmación de Flow no encontraría el pedido:
      // es preferible no enviar a pagar.
      console.error('[reservar/pagar] error guardando flow_token en pedido:', pedidoId, tokenUpdateErr);
      return NextResponse.json({ error: 'No pudimos preparar el pago. Intenta de nuevo.' }, { status: 500 });
    }

    return NextResponse.json({ payUrl: flow.payUrl, pedidoId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[reservar/pagar] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
