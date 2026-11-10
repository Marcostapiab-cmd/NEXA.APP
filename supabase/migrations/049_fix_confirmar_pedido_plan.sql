-- ============================================================
-- NEXA 049 — Arreglo: activar el plan 1:1 / 2:1 después del pago
-- ============================================================
-- confirmar_pedido_plan_pago (migración 033) fallaba SIEMPRE con
-- "column reference \"email\" is ambiguous": la función devuelve una
-- columna llamada email y además busca atletas por la columna email.
-- Resultado: el pago quedaba "procesando" y nunca se creaba el plan.
--
-- Cambios:
--  1. #variable_conflict use_column: los nombres se resuelven como columnas.
--  2. Las clases que chocan con la agenda se omiten (quedan como crédito) y
--     se avisa en "Requiere atención"; antes un choque anulaba toda la activación.
--     Las clases 2:1 se guardan como '2:1 Duo', igual que el resto de la app.
--  3. Busca al alumno existente solo por email (sin mayúsculas) o RUT. Ya no
--     por teléfono: dos personas pueden compartir número y el plan quedaba a
--     nombre de otra. El RUT evita chocar con el RUT único de atletas (039).
-- Requiere 044 (nexa_rut_norm). Re-ejecutable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirmar_pedido_plan_pago(p_flow_token text)
RETURNS TABLE (
  ok                 boolean,
  ya_procesado       boolean,
  atleta_id          uuid,
  plan_id            uuid,
  pedido_id          uuid,
  nombre             text,
  apellido           text,
  email              text,
  modalidad          text,
  tipo               text,
  frecuencia_semanal int,
  monto_clp          int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_pedido        public.pedidos_planes;
  v_atleta_id     uuid;
  v_plan_id       uuid;
  v_duracion_dias int;
  v_semanas       int;
  v_total_clases  int;
  v_start_date    date := current_date;
  v_end_date      date;
  v_lunes         date;
  v_dow           int;
  v_total_weeks   int;
  v_fecha         date;
  v_fechas        date[] := '{}';
  v_d             int;
  v_w             int;
  v_plan_nombre   text;
  v_omitidas      date[] := '{}';
BEGIN
  SELECT * INTO v_pedido
  FROM public.pedidos_planes
  WHERE flow_token = p_flow_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, false, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::int;
    RETURN;
  END IF;

  IF v_pedido.estado = 'pagado' THEN
    RETURN QUERY SELECT
      true, true, v_pedido.atleta_id, v_pedido.plan_id, v_pedido.id,
      v_pedido.nombre, v_pedido.apellido, v_pedido.email,
      v_pedido.modalidad, v_pedido.tipo, v_pedido.frecuencia_semanal, v_pedido.monto_clp;
    RETURN;
  END IF;

  -- Buscar o crear atleta (por email o teléfono)
  IF v_pedido.email IS NOT NULL OR v_pedido.rut IS NOT NULL THEN
    SELECT a.id INTO v_atleta_id
    FROM public.atletas a
    WHERE (v_pedido.email    IS NOT NULL AND lower(a.email) = lower(v_pedido.email))
       OR (v_pedido.rut      IS NOT NULL AND public.nexa_rut_norm(a.rut) = public.nexa_rut_norm(v_pedido.rut))
    ORDER BY (v_pedido.email IS NOT NULL AND lower(a.email) = lower(v_pedido.email)) DESC
    LIMIT 1;
  END IF;

  IF v_atleta_id IS NULL THEN
    INSERT INTO public.atletas (nombre, apellido, email, telefono, rut, activo)
    VALUES (v_pedido.nombre, v_pedido.apellido, v_pedido.email, v_pedido.telefono, v_pedido.rut, true)
    RETURNING id INTO v_atleta_id;
  END IF;

  -- Duración y semanas según tipo de plan (igual a PLAN_DURACION_DIAS / PLAN_SEMANAS en src/lib/planes.ts)
  v_duracion_dias := CASE v_pedido.tipo WHEN 'mensual' THEN 30 WHEN 'trimestral' THEN 90 WHEN 'semestral' THEN 180 END;
  v_semanas       := CASE v_pedido.tipo WHEN 'mensual' THEN 4  WHEN 'trimestral' THEN 12 WHEN 'semestral' THEN 24 END;
  v_end_date      := v_start_date + v_duracion_dias;
  v_total_clases  := array_length(v_pedido.dias_semana, 1) * v_semanas;

  -- Generar fechas recurrentes (mismo algoritmo que generarFechasRecurrentes en src/lib/planes.ts)
  v_dow         := EXTRACT(ISODOW FROM v_start_date)::int; -- 1=lunes .. 7=domingo
  v_lunes       := v_start_date - (v_dow - 1);
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

  INSERT INTO public.planes (id, alumno_id, nombre, tipo, modalidad, total_clases, start_date, end_date)
  VALUES (gen_random_uuid(), v_atleta_id, v_plan_nombre, v_pedido.tipo, v_pedido.modalidad, v_total_clases, v_start_date, v_end_date)
  RETURNING id INTO v_plan_id;

  -- Las reservas quedan sin coach asignado — el staff lo asigna después
  -- desde el panel de horario/alumno (mismo patrón que las reservas de
  -- clases grupales creadas por confirmar_pedido_grupal_pago, 032).
  -- Cada clase por separado: si una choca con la agenda (horario 1:1 ocupado,
  -- cupo 2:1 lleno…), se omite y queda como crédito libre del plan. El pago
  -- ya se hizo, así que el plan se activa igual y el staff recibe un aviso.
  FOREACH v_fecha IN ARRAY coalesce(v_fechas, '{}') LOOP
    BEGIN
      INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase)
      VALUES (v_atleta_id, v_plan_id, v_fecha, v_pedido.hora, 'pendiente',
              CASE v_pedido.modalidad WHEN '1:1' THEN '1:1 Individual' ELSE '2:1 Duo' END);
    EXCEPTION WHEN raise_exception OR unique_violation OR exclusion_violation THEN
      v_omitidas := array_append(v_omitidas, v_fecha);
    END;
  END LOOP;

  IF array_length(v_omitidas, 1) > 0 AND to_regprocedure('public.nexa_incidencia(text,text,text,text,text,text,uuid,integer,text,uuid)') IS NOT NULL THEN
    PERFORM public.nexa_incidencia(
      'compra_clases_sin_agendar', 'alta', 'compra_sin_agendar:' || v_plan_id::text,
      'Plan pagado con clases sin agendar',
      format('%s %s compró en línea un plan %s (%s a las %s). %s clase(s) no se agendaron porque el horario estaba ocupado: %s.',
             v_pedido.nombre, v_pedido.apellido, v_plan_nombre, array_to_string(v_pedido.dias_semana, ','), v_pedido.hora,
             array_length(v_omitidas, 1), array_to_string(v_omitidas, ', ')),
      'Agenda esas clases en otro horario con el alumno. Las clases quedan disponibles como crédito del plan.',
      v_atleta_id, NULL, v_plan_id::text, NULL);
  END IF;

  UPDATE public.pedidos_planes
  SET estado = 'pagado', atleta_id = v_atleta_id, plan_id = v_plan_id, confirmado_at = now()
  WHERE id = v_pedido.id;

  RETURN QUERY SELECT
    true, false, v_atleta_id, v_plan_id, v_pedido.id,
    v_pedido.nombre, v_pedido.apellido, v_pedido.email,
    v_pedido.modalidad, v_pedido.tipo, v_pedido.frecuencia_semanal, v_pedido.monto_clp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_pedido_plan_pago(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirmar_pedido_plan_pago(text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
