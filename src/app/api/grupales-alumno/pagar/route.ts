import { NextRequest, NextResponse } from 'next/server';
import { crearPagoFlow } from '@/lib/flow';
import { esClaseDePrueba, sesionReservable, variantesRut, type PlanGrupal, type SesionPublica } from '@/lib/catalogo';
import { getAlumnoGrupalSesion, supabaseAdmin } from '@/lib/grupales-server';

export const runtime = 'nodejs';

interface Body {
  plan_id: string;
  primera?: { clase_id: string; fecha: string; hora: string } | null;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE  = /^\d{2}:\d{2}$/;

// Compra de un pack grupal. El precio, las clases y la vigencia se leen
// siempre de `planes_grupales`; nunca se confía en datos del cliente.
// La primera clase elegida se guarda en la compra y se reserva recién
// cuando Flow confirma el pago (confirmar_compra_grupal_pago, 034).
export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();

  try {
    const alumno = await getAlumnoGrupalSesion(admin);
    if (!alumno) {
      return NextResponse.json({ error: 'Inicia sesión para continuar con la compra.' }, { status: 401 });
    }

    const { plan_id, primera } = await req.json() as Body;
    if (!plan_id) return NextResponse.json({ error: 'Elige un plan.' }, { status: 400 });

    const { data: planData, error: planErr } = await admin
      .from('planes_grupales')
      .select('id, nombre, descripcion, precio_clp, num_clases, validez_dias, destacado')
      .eq('id', plan_id)
      .eq('activo', true)
      .maybeSingle();
    if (planErr || !planData) {
      return NextResponse.json({ error: 'Este plan ya no está disponible.' }, { status: 404 });
    }
    const plan = planData as PlanGrupal;

    // Clase de prueba: una sola vez por persona (regla existente del proyecto).
    if (esClaseDePrueba(plan)) {
      const { data: pruebas } = await admin
        .from('planes_grupales')
        .select('id')
        .eq('num_clases', 1)
        .ilike('nombre', '%prueba%');
      const idsPrueba = ((pruebas ?? []) as { id: string }[]).map(p => p.id);

      const { count: comprasPrevias } = idsPrueba.length
        ? await admin
            .from('grupales_compras')
            .select('id', { count: 'exact', head: true })
            .eq('alumno_id', alumno.id)
            .eq('estado_pago', 'pagado')
            .in('plan_grupal_id', idsPrueba)
        : { count: 0 };

      // Compras de prueba hechas con el flujo anterior sin cuenta (pedidos_grupales)
      const filtros = [`email.eq."${alumno.email}"`];
      for (const r of alumno.rut ? variantesRut(alumno.rut) : []) filtros.push(`rut.eq."${r}"`);
      const { count: pedidosPrevios } = idsPrueba.length
        ? await admin
            .from('pedidos_grupales')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'pagado')
            .in('plan_id', idsPrueba)
            .or(filtros.join(','))
        : { count: 0 };

      if ((comprasPrevias ?? 0) + (pedidosPrevios ?? 0) > 0) {
        return NextResponse.json(
          { error: 'La clase de prueba se puede tomar una sola vez por persona. Elige otro plan.' },
          { status: 409 },
        );
      }
    }

    // Validar la primera clase (si se eligió) contra el horario real y sus cupos.
    let primeraValida: { clase_id: string; fecha: string; hora: string } | null = null;
    if (primera) {
      if (!primera.clase_id || !FECHA_RE.test(primera.fecha) || !HORA_RE.test(primera.hora)) {
        return NextResponse.json({ error: 'El horario elegido no es válido.' }, { status: 400 });
      }
      const { data: sesiones, error: sesErr } = await admin.rpc('get_sesiones_publicas', { p_dias: 30 });
      if (sesErr) {
        return NextResponse.json({ error: 'No pudimos verificar los cupos. Intenta de nuevo.' }, { status: 503 });
      }
      const sesion = ((sesiones ?? []) as SesionPublica[]).find(s =>
        s.clase_id === primera.clase_id && s.fecha === primera.fecha && s.hora === primera.hora);
      if (!sesion || !sesionReservable(sesion)) {
        return NextResponse.json({ error: 'Esa clase ya no tiene cupos disponibles. Elige otro horario.' }, { status: 409 });
      }
      const expira = new Date();
      expira.setDate(expira.getDate() + plan.validez_dias);
      if (new Date(`${primera.fecha}T${primera.hora}:00`) > expira) {
        return NextResponse.json({ error: 'Esa clase queda fuera de la vigencia del plan.' }, { status: 400 });
      }
      primeraValida = { clase_id: primera.clase_id, fecha: primera.fecha, hora: primera.hora };
    }

    const commerceOrder = `gplan-${alumno.id.slice(0, 8)}-${Date.now()}`;
    const expiraProvisional = new Date();
    expiraProvisional.setDate(expiraProvisional.getDate() + plan.validez_dias);

    const { data: compra, error: compraErr } = await admin
      .from('grupales_compras')
      .insert({
        alumno_id:        alumno.id,
        plan_grupal_id:   plan.id,
        clases_totales:   plan.num_clases,
        fecha_expira:     expiraProvisional.toISOString(),
        estado_pago:      'pendiente',
        commerce_order:   commerceOrder,
        monto_clp:        plan.precio_clp,
        primera_clase_id: primeraValida?.clase_id ?? null,
        primera_fecha:    primeraValida?.fecha ?? null,
        primera_hora:     primeraValida?.hora ?? null,
      })
      .select('id')
      .single();

    if (compraErr || !compra) {
      console.error('[grupales/pagar] compra insert error:', compraErr);
      return NextResponse.json({ error: 'No pudimos crear la orden. Intenta de nuevo.' }, { status: 500 });
    }
    const compraId = (compra as { id: string }).id;
    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    const flow = await crearPagoFlow({
      commerceOrder,
      subject:         `${plan.nombre} — NEXA Performance`,
      amount:          plan.precio_clp,
      email:           alumno.email,
      urlReturn:       `${baseUrl}/api/grupales-alumno/retorno`,
      urlConfirmation: `${baseUrl}/api/grupales-alumno/confirmar`,
    });

    const { error: tokenErr } = await admin
      .from('grupales_compras')
      .update({ referencia_flow: flow.token, flow_order: String(flow.flowOrder) })
      .eq('id', compraId);
    if (tokenErr) {
      // Sin el token guardado, la confirmación de Flow no encontraría la compra:
      // es preferible no enviar al alumno a pagar.
      console.error('[grupales/pagar] error guardando token de Flow:', compraId, tokenErr);
      return NextResponse.json({ error: 'No pudimos preparar el pago. Intenta de nuevo.' }, { status: 500 });
    }

    return NextResponse.json({ payUrl: flow.payUrl, compraId });
  } catch (err) {
    console.error('[grupales/pagar] error:', err);
    return NextResponse.json({ error: 'No pudimos iniciar el pago. Intenta de nuevo en unos minutos.' }, { status: 500 });
  }
}
