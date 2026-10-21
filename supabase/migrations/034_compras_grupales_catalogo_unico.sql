-- ============================================================
-- NEXA 034 — Compra de packs grupales con cuenta + saldo de clases
-- ============================================================
-- Qué resuelve:
--  1. La página pública /planes vende los 5 packs canónicos de
--     `planes_grupales` (migración 026). El sistema con cuenta y saldo
--     de clases (`grupales_compras`, migración 021/023) usaba otro
--     catálogo (`grupales_packs`) con otros precios. Se agrega
--     `plan_grupal_id` para que las compras nuevas apunten al catálogo
--     único. `pack_id` se mantiene para no romper compras históricas.
--  2. El alumno puede elegir su primera clase antes de pagar. La
--     reserva de esa clase se hace SOLO cuando el pago se confirma,
--     dentro de la misma transacción, con los mismos chequeos de cupo.
--  3. `reservar_clase_grupal` estaba concedida a `authenticated` y
--     recibía `p_user_id` como parámetro: cualquier usuario logueado
--     podía llamarla por RPC con el id de otra persona. Ahora solo la
--     llama el backend (service_role), y además valida que la fecha y
--     hora correspondan realmente a la clase, que no esté en el pasado
--     y que caiga dentro de la vigencia del pack.
--
-- Es aditiva: no borra columnas ni datos.

-- ── 1. Columnas nuevas en grupales_compras ────────────────────────
ALTER TABLE public.grupales_compras
  ADD COLUMN IF NOT EXISTS plan_grupal_id uuid REFERENCES public.planes_grupales(id),
  ADD COLUMN IF NOT EXISTS primera_clase_id uuid REFERENCES public.clases_grupales(id),
  ADD COLUMN IF NOT EXISTS primera_fecha date,
  ADD COLUMN IF NOT EXISTS primera_hora text,
  ADD COLUMN IF NOT EXISTS primera_reserva_estado text
    CHECK (primera_reserva_estado IN ('reservada', 'no_disponible')),
  ADD COLUMN IF NOT EXISTS primera_reserva_error text;

CREATE INDEX IF NOT EXISTS gc_plan_grupal_idx ON public.grupales_compras(plan_grupal_id);

-- Un token de Flow identifica una sola compra
CREATE UNIQUE INDEX IF NOT EXISTS gc_referencia_flow_unique_idx
  ON public.grupales_compras(referencia_flow)
  WHERE referencia_flow IS NOT NULL;

-- ── 2. Núcleo de reserva (uso interno) ────────────────────────────
-- Toda la validación de una reserva grupal con crédito, en un solo
-- lugar. Debe ejecutarse dentro de una transacción (lo es siempre
-- que se llama desde otra función plpgsql).
CREATE OR REPLACE FUNCTION public._reservar_clase_grupal_core(
  p_alumno_id uuid,
  p_clase_id  uuid,
  p_compra_id uuid,
  p_fecha     date,
  p_hora      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clase     public.clases_grupales;
  v_capacidad int;
  v_count_r   int;
  v_count_g   int;
  v_updated   int;
  v_estado    text;
  v_expira    timestamptz;
  v_restantes int;
  v_ahora_cl  timestamp := (now() AT TIME ZONE 'America/Santiago');
BEGIN
  -- Bloquear la clase para serializar los chequeos de capacidad
  SELECT * INTO v_clase
    FROM public.clases_grupales
   WHERE id = p_clase_id
   FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_clase.activa, false) THEN
    RETURN jsonb_build_object('error', 'La clase no está disponible.', 'code', 404);
  END IF;

  -- La fecha y la hora deben corresponder a la clase real
  IF EXTRACT(DOW FROM p_fecha)::int <> v_clase.dia_semana OR p_hora <> v_clase.hora THEN
    RETURN jsonb_build_object('error', 'El horario elegido no corresponde a esta clase.', 'code', 400);
  END IF;

  -- No se puede reservar una clase que ya empezó
  IF (p_fecha + p_hora::time) <= v_ahora_cl THEN
    RETURN jsonb_build_object('error', 'Ese horario ya pasó.', 'code', 400);
  END IF;

  -- Bloqueos administrativos del horario
  IF EXISTS(
    SELECT 1 FROM public.horario_bloqueos
     WHERE fecha = p_fecha
       AND (hora_inicio IS NULL
            OR (p_hora >= hora_inicio AND p_hora < COALESCE(hora_fin, '23:59')))
  ) THEN
    RETURN jsonb_build_object('error', 'Ese horario está bloqueado.', 'code', 400);
  END IF;

  -- Reserva duplicada del mismo alumno
  IF EXISTS(
    SELECT 1 FROM public.grupales_reservas
     WHERE alumno_id = p_alumno_id
       AND fecha     = p_fecha
       AND hora      = p_hora
       AND estado    = 'reservada'
  ) THEN
    RETURN jsonb_build_object('error', 'Ya tienes una reserva en ese horario.', 'code', 409);
  END IF;

  -- Capacidad (mismo conteo que get_sesiones_publicas)
  v_capacidad := COALESCE(v_clase.capacidad, 12);

  SELECT COUNT(*) INTO v_count_r
    FROM public.reservas
   WHERE fecha      = p_fecha
     AND hora       = p_hora
     AND tipo_clase ILIKE '%grupal%'
     AND estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show');

  SELECT COUNT(*) INTO v_count_g
    FROM public.grupales_reservas
   WHERE fecha    = p_fecha
     AND hora     = p_hora
     AND clase_id = p_clase_id
     AND estado   = 'reservada';

  IF v_count_r + v_count_g >= v_capacidad THEN
    RETURN jsonb_build_object('error', 'No quedan cupos disponibles en esa clase.', 'code', 409);
  END IF;

  -- Consumir un crédito: pack pagado, vigente el día de la clase y con saldo
  UPDATE public.grupales_compras
     SET clases_usadas = clases_usadas + 1
   WHERE id           = p_compra_id
     AND alumno_id    = p_alumno_id
     AND estado_pago  = 'pagado'
     AND fecha_expira > now()
     AND p_fecha     <= (fecha_expira AT TIME ZONE 'America/Santiago')::date
     AND clases_usadas < clases_totales;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    SELECT estado_pago, fecha_expira, (clases_totales - clases_usadas)
      INTO v_estado,    v_expira,     v_restantes
      FROM public.grupales_compras
     WHERE id = p_compra_id AND alumno_id = p_alumno_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Pack no encontrado.', 'code', 404);
    ELSIF v_estado <> 'pagado' THEN
      RETURN jsonb_build_object('error', 'El pack todavía no está pagado.', 'code', 400);
    ELSIF v_expira <= now() THEN
      RETURN jsonb_build_object('error', 'El pack está vencido.', 'code', 400);
    ELSIF v_restantes <= 0 THEN
      RETURN jsonb_build_object('error', 'No te quedan clases en este pack.', 'code', 400);
    ELSE
      RETURN jsonb_build_object('error', 'La clase es posterior al vencimiento de tu pack.', 'code', 400);
    END IF;
  END IF;

  INSERT INTO public.grupales_reservas
    (alumno_id, compra_id, clase_id, fecha, hora, nombre_clase, estado)
  VALUES
    (p_alumno_id, p_compra_id, p_clase_id, p_fecha, p_hora, v_clase.nombre, 'reservada');

  RETURN jsonb_build_object('ok', true, 'clase', v_clase.nombre);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._reservar_clase_grupal_core(uuid, uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;

-- ── 3. reservar_clase_grupal: misma firma, ahora solo backend ─────
CREATE OR REPLACE FUNCTION public.reservar_clase_grupal(
  p_user_id      uuid,
  p_clase_id     uuid,
  p_compra_id    uuid,
  p_fecha        date,
  p_hora         text,
  p_nombre_clase text   -- se ignora: el nombre se toma de la clase real
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id uuid;
BEGIN
  SELECT id INTO v_alumno_id
    FROM public.grupales_alumnos WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Alumno no encontrado', 'code', 404);
  END IF;

  RETURN public._reservar_clase_grupal_core(v_alumno_id, p_clase_id, p_compra_id, p_fecha, p_hora);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', 500);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservar_clase_grupal(uuid, uuid, uuid, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reservar_clase_grupal(uuid, uuid, uuid, date, text, text) TO service_role;

-- ── 4. Confirmación atómica del pago de un pack ───────────────────
-- Mismo patrón que confirmar_pedido_grupal_pago (032): la fila de la
-- compra queda bloqueada, así un reintento del webhook de Flow espera
-- y encuentra la compra ya pagada (idempotente).
-- p_monto es el monto que Flow informa como pagado; si no coincide con
-- el de la compra, NO se acredita (queda para revisión manual).
CREATE OR REPLACE FUNCTION public.confirmar_compra_grupal_pago(p_flow_token text, p_monto int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra  public.grupales_compras;
  v_validez int;
  v_res     jsonb;
BEGIN
  SELECT * INTO v_compra
    FROM public.grupales_compras
   WHERE referencia_flow = p_flow_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_encontrada');
  END IF;

  IF v_compra.estado_pago = 'pagado' THEN
    RETURN jsonb_build_object('ok', true, 'ya_procesado', true);
  END IF;

  IF p_monto IS DISTINCT FROM v_compra.monto_clp THEN
    RETURN jsonb_build_object('ok', false, 'code', 'monto_distinto');
  END IF;

  SELECT validez_dias INTO v_validez
    FROM public.planes_grupales WHERE id = v_compra.plan_grupal_id;
  IF v_validez IS NULL THEN
    SELECT validez_dias INTO v_validez
      FROM public.grupales_packs WHERE id = v_compra.pack_id;
  END IF;
  IF v_validez IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'plan_no_encontrado');
  END IF;

  -- La vigencia corre desde la confirmación del pago
  UPDATE public.grupales_compras
     SET estado_pago  = 'pagado',
         fecha_compra = now(),
         fecha_expira = now() + make_interval(days => v_validez),
         clases_usadas = 0
   WHERE id = v_compra.id;

  -- Primera clase elegida antes de pagar: se intenta reservar ahora.
  -- Si ya no hay cupo, el pago queda acreditado igual y el alumno elige
  -- otro horario desde su cuenta. El bloque interno revierte solo la
  -- reserva si algo falla, nunca la acreditación del pago.
  IF v_compra.primera_clase_id IS NOT NULL
     AND v_compra.primera_fecha IS NOT NULL
     AND v_compra.primera_hora IS NOT NULL THEN
    BEGIN
      v_res := public._reservar_clase_grupal_core(
        v_compra.alumno_id, v_compra.primera_clase_id, v_compra.id,
        v_compra.primera_fecha, v_compra.primera_hora);
    EXCEPTION WHEN OTHERS THEN
      v_res := jsonb_build_object('error', SQLERRM);
    END;

    UPDATE public.grupales_compras
       SET primera_reserva_estado = CASE WHEN (v_res ? 'ok') THEN 'reservada' ELSE 'no_disponible' END,
           primera_reserva_error  = v_res ->> 'error'
     WHERE id = v_compra.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ya_procesado', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirmar_compra_grupal_pago(text, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirmar_compra_grupal_pago(text, int) TO service_role;
