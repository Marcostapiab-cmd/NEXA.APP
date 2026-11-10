-- ============================================================
-- NEXA 052 — Confirmación de pagos en línea (Flow) verificada y sin duplicados
-- ============================================================
-- Problemas que corrige:
--  1. El pago de un plan 1:1 / 2:1 activaba el plan, pero no dejaba registro en
--     `pagos`: no aparecía en el historial del alumno ni en administración.
--  2. Solo se comparaba el monto, y fuera de la transacción. Ahora se verifican,
--     dentro de la misma transacción con el pedido bloqueado: número de orden,
--     monto y moneda (CLP). El estado "pagado" lo confirma la app con Flow.
--  3. Si no coincidía, el pedido quedaba "procesando" sin aviso. Ahora queda en
--     "revision" con el motivo y una alerta en "Requiere atención".
--  4. Una confirmación repetida (Flow reintenta) no crea otro pago, plan ni
--     reservas: el pedido se bloquea (FOR UPDATE) y `pagos.referencia_pago` es única.
--  5. Si el pago se confirmó pero alguna clase no se pudo agendar, el plan se
--     activa igual (sin volver a cobrar), el pedido guarda cuántas faltaron y se
--     avisa al staff (incidencia de prioridad alta).
--
-- No modifica pagos, planes ni reservas existentes. Requiere 042, 044, 049, 051.
-- Re-ejecutable.
-- ============================================================

-- ── Columnas nuevas ─────────────────────────────────────────
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS referencia_pago text;
CREATE UNIQUE INDEX IF NOT EXISTS pagos_referencia_pago_uniq ON public.pagos (referencia_pago) WHERE referencia_pago IS NOT NULL;

-- 'flow' como método de pago (antes se guardaba como 'transferencia')
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.pagos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%metodo%'
  LOOP
    EXECUTE format('ALTER TABLE public.pagos DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_metodo_check
  CHECK (metodo IN ('stripe', 'transferencia', 'efectivo', 'flow'));

ALTER TABLE public.pedidos_planes ADD COLUMN IF NOT EXISTS revision_motivo   text;
ALTER TABLE public.pedidos_planes ADD COLUMN IF NOT EXISTS clases_sin_agendar int NOT NULL DEFAULT 0;
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.pedidos_planes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE public.pedidos_planes DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.pedidos_planes ADD CONSTRAINT pedidos_planes_estado_check
  CHECK (estado IN ('pendiente', 'procesando', 'pagado', 'cancelado', 'fallido', 'revision'));

-- ── Confirmación del plan 1:1 / 2:1 ─────────────────────────
-- La llama solo el servidor, después de consultar a Flow que el pago está
-- aprobado (status 2). Devuelve jsonb con `ok`, `codigo` y los datos del pedido.
CREATE OR REPLACE FUNCTION public.nexa_confirmar_pago_plan(
  p_flow_token text, p_monto int, p_moneda text, p_commerce_order text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_pedido        public.pedidos_planes;
  v_atleta_id     uuid;
  v_plan_id       uuid;
  v_duracion_dias int;
  v_semanas       int;
  v_total_clases  int;
  v_start_date    date := public.nexa_hoy();
  v_end_date      date;
  v_lunes         date;
  v_total_weeks   int;
  v_fecha         date;
  v_fechas        date[] := '{}';
  v_d             int;
  v_w             int;
  v_plan_nombre   text;
  v_omitidas      date[] := '{}';
  v_motivo        text;
  v_datos         jsonb;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_planes WHERE flow_token = p_flow_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrado');
  END IF;

  v_datos := jsonb_build_object('pedido_id', v_pedido.id, 'nombre', v_pedido.nombre, 'apellido', v_pedido.apellido,
    'email', v_pedido.email, 'modalidad', v_pedido.modalidad, 'tipo', v_pedido.tipo,
    'frecuencia_semanal', v_pedido.frecuencia_semanal, 'monto_clp', v_pedido.monto_clp);

  -- Repetición: ya se acreditó. No se crea nada nuevo.
  IF v_pedido.estado = 'pagado' THEN
    RETURN v_datos || jsonb_build_object('ok', true, 'ya_procesado', true,
      'atleta_id', v_pedido.atleta_id, 'plan_id', v_pedido.plan_id, 'clases_sin_agendar', v_pedido.clases_sin_agendar);
  END IF;
  IF v_pedido.estado = 'revision' THEN
    RETURN v_datos || jsonb_build_object('ok', false, 'codigo', 'en_revision', 'motivo', v_pedido.revision_motivo);
  END IF;

  -- Verificaciones contra lo que informó Flow
  v_motivo := CASE
    WHEN p_commerce_order IS NOT NULL AND v_pedido.commerce_order IS NOT NULL
         AND p_commerce_order <> v_pedido.commerce_order THEN 'orden_distinta'
    WHEN upper(coalesce(p_moneda, '')) <> 'CLP' THEN 'moneda_distinta'
    WHEN p_monto IS DISTINCT FROM v_pedido.monto_clp THEN 'monto_distinto'
  END;
  IF v_motivo IS NOT NULL THEN
    UPDATE public.pedidos_planes SET estado = 'revision', revision_motivo = v_motivo WHERE id = v_pedido.id;
    PERFORM public.nexa_incidencia('pago_no_coincide', 'alta', 'pago_revision:' || v_pedido.id,
      'Pago en línea por revisar · ' || v_pedido.nombre || ' ' || v_pedido.apellido,
      format('Flow informó un pago que no coincide con el pedido (%s). Pedido: $%s CLP, orden %s. Flow: $%s %s, orden %s. No se activó el plan.',
             v_motivo, v_pedido.monto_clp, coalesce(v_pedido.commerce_order, '—'), coalesce(p_monto::text, '—'),
             coalesce(p_moneda, '—'), coalesce(p_commerce_order, '—')),
      'Revisar el pago en Flow. Si corresponde, activar el plan a mano; si no, gestionar la devolución.',
      NULL, NULL, NULL, NULL);
    RETURN v_datos || jsonb_build_object('ok', false, 'codigo', v_motivo);
  END IF;

  -- Alumno: por email (sin mayúsculas) o RUT; si no existe, se crea.
  SELECT a.id INTO v_atleta_id
    FROM public.atletas a
   WHERE (v_pedido.email IS NOT NULL AND lower(a.email) = lower(v_pedido.email))
      OR (v_pedido.rut   IS NOT NULL AND public.nexa_rut_norm(a.rut) = public.nexa_rut_norm(v_pedido.rut))
   ORDER BY (v_pedido.email IS NOT NULL AND lower(a.email) = lower(v_pedido.email)) DESC
   LIMIT 1;
  IF v_atleta_id IS NULL THEN
    INSERT INTO public.atletas (nombre, apellido, email, telefono, rut, activo)
    VALUES (v_pedido.nombre, v_pedido.apellido, v_pedido.email, v_pedido.telefono, v_pedido.rut, true)
    RETURNING id INTO v_atleta_id;
  END IF;

  -- Mismas reglas de duración que 049 / src/lib/planes.ts
  v_duracion_dias := CASE v_pedido.tipo WHEN 'mensual' THEN 30 WHEN 'trimestral' THEN 90 WHEN 'semestral' THEN 180 END;
  v_semanas       := CASE v_pedido.tipo WHEN 'mensual' THEN 4  WHEN 'trimestral' THEN 12 WHEN 'semestral' THEN 24 END;
  v_end_date      := v_start_date + v_duracion_dias;
  v_total_clases  := array_length(v_pedido.dias_semana, 1) * v_semanas;

  v_lunes       := v_start_date - (EXTRACT(ISODOW FROM v_start_date)::int - 1);
  v_total_weeks := CEIL(v_duracion_dias::numeric / 7) + 1;
  FOR v_w IN 0..v_total_weeks - 1 LOOP
    FOREACH v_d IN ARRAY v_pedido.dias_semana LOOP
      v_fecha := v_lunes + (v_w * 7 + (v_d - 1));
      IF v_fecha >= v_start_date AND v_fecha <= v_end_date THEN
        v_fechas := array_append(v_fechas, v_fecha);
      END IF;
    END LOOP;
  END LOOP;
  SELECT array_agg(DISTINCT f ORDER BY f) INTO v_fechas FROM unnest(v_fechas) AS f;
  v_fechas := v_fechas[1:v_total_clases];

  v_plan_nombre := 'Plan ' || initcap(v_pedido.tipo) || ' ' || v_pedido.modalidad;
  INSERT INTO public.planes (id, alumno_id, nombre, tipo, modalidad, total_clases, start_date, end_date, precio_clp, estado_pago)
  VALUES (gen_random_uuid(), v_atleta_id, v_plan_nombre, v_pedido.tipo, v_pedido.modalidad, v_total_clases,
          v_start_date, v_end_date, v_pedido.monto_clp, 'pagado')
  RETURNING id INTO v_plan_id;

  -- Registro del pago: historial del alumno y administración
  INSERT INTO public.pagos (alumno_id, plan_id, monto, moneda, estado, metodo, descripcion, fecha_pago, referencia_pago, stripe_checkout_session_id)
  VALUES (v_atleta_id, v_plan_id::text, v_pedido.monto_clp, 'clp', 'pagado', 'flow',
          v_plan_nombre || ' · pago en línea', now(), p_flow_token, v_pedido.commerce_order)
  ON CONFLICT (referencia_pago) WHERE referencia_pago IS NOT NULL DO NOTHING;

  -- Cada clase por separado: si choca (horario ocupado, alumno ya tiene clase a
  -- esa hora…), se omite y queda como crédito. El pago nunca se revierte.
  FOREACH v_fecha IN ARRAY coalesce(v_fechas, '{}') LOOP
    BEGIN
      INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase)
      VALUES (v_atleta_id, v_plan_id, v_fecha, v_pedido.hora, 'pendiente',
              CASE v_pedido.modalidad WHEN '1:1' THEN '1:1 Individual' ELSE '2:1 Duo' END);
    EXCEPTION WHEN raise_exception OR unique_violation OR exclusion_violation OR check_violation THEN
      v_omitidas := array_append(v_omitidas, v_fecha);
    END;
  END LOOP;

  IF coalesce(array_length(v_omitidas, 1), 0) > 0 THEN
    PERFORM public.nexa_incidencia(
      'compra_clases_sin_agendar', 'alta', 'compra_sin_agendar:' || v_plan_id::text,
      'Plan pagado con clases sin agendar',
      format('%s %s pagó en línea un %s (%s a las %s). %s clase(s) no se pudieron agendar: %s. El pago está registrado; no hay que volver a cobrar.',
             v_pedido.nombre, v_pedido.apellido, v_plan_nombre, array_to_string(v_pedido.dias_semana, ','), v_pedido.hora,
             array_length(v_omitidas, 1), array_to_string(v_omitidas, ', ')),
      'Agendar esas clases con el alumno en otro horario. Quedan como crédito del plan.',
      v_atleta_id, NULL, v_plan_id::text, NULL);
  END IF;

  UPDATE public.pedidos_planes
     SET estado = 'pagado', atleta_id = v_atleta_id, plan_id = v_plan_id, confirmado_at = now(),
         clases_sin_agendar = coalesce(array_length(v_omitidas, 1), 0), revision_motivo = NULL
   WHERE id = v_pedido.id;

  RETURN v_datos || jsonb_build_object('ok', true, 'ya_procesado', false, 'atleta_id', v_atleta_id,
    'plan_id', v_plan_id, 'clases_sin_agendar', coalesce(array_length(v_omitidas, 1), 0));
END $$;

REVOKE ALL ON FUNCTION public.nexa_confirmar_pago_plan(text, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_confirmar_pago_plan(text, int, text, text) TO service_role;

-- La versión anterior (sin verificación) queda solo para el servidor y deja de usarse.
DO $$ BEGIN
  IF to_regprocedure('public.confirmar_pedido_plan_pago(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.confirmar_pedido_plan_pago(text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── Cobros manuales por Flow (staff → /api/pagos/crear-checkout) ──
-- Marca un pago pendiente como pagado solo si orden, monto y moneda coinciden.
CREATE OR REPLACE FUNCTION public.nexa_confirmar_cobro_manual(
  p_commerce_order text, p_monto int, p_moneda text, p_flow_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pago public.pagos;
BEGIN
  SELECT * INTO v_pago FROM public.pagos WHERE stripe_checkout_session_id = p_commerce_order FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrado'); END IF;
  IF v_pago.estado = 'pagado' THEN RETURN jsonb_build_object('ok', true, 'ya_procesado', true); END IF;
  IF v_pago.estado <> 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'codigo', 'estado_' || v_pago.estado); END IF;
  IF upper(coalesce(p_moneda, '')) <> 'CLP' OR p_monto IS DISTINCT FROM v_pago.monto THEN
    PERFORM public.nexa_incidencia('pago_no_coincide', 'alta', 'cobro_revision:' || v_pago.id,
      'Cobro en línea por revisar · ' || coalesce(public.nexa_nombre_atleta(v_pago.alumno_id), 'alumno'),
      format('Flow informó $%s %s para un cobro de $%s CLP (orden %s). No se marcó como pagado.',
             coalesce(p_monto::text, '—'), coalesce(p_moneda, '—'), v_pago.monto, p_commerce_order),
      'Revisar el pago en Flow y corregir el cobro a mano.', v_pago.alumno_id, NULL, v_pago.plan_id, NULL);
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_coincide');
  END IF;
  UPDATE public.pagos SET estado = 'pagado', fecha_pago = now(), referencia_pago = coalesce(referencia_pago, p_flow_token)
   WHERE id = v_pago.id;
  RETURN jsonb_build_object('ok', true, 'ya_procesado', false);
END $$;

REVOKE ALL ON FUNCTION public.nexa_confirmar_cobro_manual(text, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_confirmar_cobro_manual(text, int, text, text) TO service_role;

DO $$ BEGIN PERFORM pg_notify('pgrst', 'reload schema'); END $$;
