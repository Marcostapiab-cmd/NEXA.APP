-- ============================================================
-- NEXA 032 — Confirmación de pago atómica + realtime en check-in
-- ============================================================
-- Problema que resuelve:
-- El webhook de Flow (app/api/reservar/confirmar/route.ts) hacía
-- varias consultas y escrituras separadas en el código de la API
-- (buscar pedido, buscar/crear atleta, buscar/crear reserva, marcar
-- pagado). Si Flow reintenta la entrega del webhook — algo que las
-- pasarelas de pago hacen seguido — dos llamadas casi simultáneas
-- podían leer el pedido como "no pagado todavía" antes de que
-- cualquiera de las dos alcanzara a marcarlo, y terminar creando un
-- atleta o una reserva duplicada.
--
-- La reserva de clases grupales (reservar_clase_grupal, migración
-- 019-021) ya resolvía esto bien con SELECT ... FOR UPDATE dentro de
-- una función de Postgres. Esta migración aplica el mismo patrón al
-- webhook de pago.

CREATE OR REPLACE FUNCTION public.confirmar_pedido_grupal_pago(p_flow_token text)
RETURNS TABLE (
  ok            boolean,
  ya_procesado  boolean,
  atleta_id     uuid,
  reserva_id    bigint,
  pedido_id     uuid,
  nombre        text,
  apellido      text,
  email         text,
  fecha         date,
  hora          text,
  clase_nombre  text,
  plan_nombre   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido        public.pedidos_grupales;
  v_atleta_id     uuid;
  v_reserva_id    bigint;
  v_clase_hora    text;
  v_clase_nombre  text;
  v_plan_nombre   text;
BEGIN
  -- Bloquea la fila del pedido hasta que termine esta transacción.
  -- Si Flow reintenta el webhook mientras esto corre, la segunda
  -- llamada espera acá, no lee un estado a medio actualizar.
  SELECT * INTO v_pedido
  FROM public.pedidos_grupales
  WHERE flow_token = p_flow_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, false, NULL::uuid, NULL::bigint, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::date, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Idempotencia: si ya quedó pagado (por un intento anterior del
  -- webhook), no se vuelve a procesar ni se reenvía el correo.
  IF v_pedido.estado = 'pagado' THEN
    RETURN QUERY SELECT
      true, true, v_pedido.atleta_id, v_pedido.reserva_id, v_pedido.id,
      v_pedido.nombre, v_pedido.apellido, v_pedido.email,
      v_pedido.fecha, v_pedido.hora, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Buscar o crear atleta (por email o teléfono)
  IF v_pedido.email IS NOT NULL OR v_pedido.telefono IS NOT NULL THEN
    SELECT id INTO v_atleta_id
    FROM public.atletas
    WHERE (v_pedido.email    IS NOT NULL AND email    = v_pedido.email)
       OR (v_pedido.telefono IS NOT NULL AND telefono = v_pedido.telefono)
    LIMIT 1;
  END IF;

  IF v_atleta_id IS NULL THEN
    INSERT INTO public.atletas (nombre, apellido, email, telefono, rut, activo)
    VALUES (v_pedido.nombre, v_pedido.apellido, v_pedido.email, v_pedido.telefono, v_pedido.rut, true)
    RETURNING id INTO v_atleta_id;
  END IF;

  -- Info de la clase (nombre + hora real, con fallback a lo guardado en el pedido)
  SELECT cg.nombre, cg.hora INTO v_clase_nombre, v_clase_hora
  FROM public.clases_grupales cg
  WHERE cg.id = v_pedido.clase_id;

  v_clase_hora   := COALESCE(v_clase_hora, v_pedido.hora);
  v_clase_nombre := COALESCE(v_clase_nombre, 'Clase grupal');

  -- Buscar o crear reserva (evita duplicados si ya existía)
  SELECT id INTO v_reserva_id
  FROM public.reservas
  WHERE alumno_id = v_atleta_id
    AND fecha     = v_pedido.fecha
    AND hora      = v_clase_hora
    AND estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
  LIMIT 1;

  IF v_reserva_id IS NULL THEN
    INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, tipo_clase, estado, descripcion)
    VALUES (v_atleta_id, NULL, v_pedido.fecha, v_clase_hora, 'Grupal', 'pendiente', v_clase_nombre)
    RETURNING id INTO v_reserva_id;
  END IF;

  -- Nombre del pack, para el correo
  SELECT pg.nombre INTO v_plan_nombre
  FROM public.planes_grupales pg
  WHERE pg.id = v_pedido.plan_id;

  -- Marcar el pedido como pagado (misma fila que sigue bloqueada)
  UPDATE public.pedidos_grupales
  SET estado = 'pagado', atleta_id = v_atleta_id, reserva_id = v_reserva_id, confirmado_at = now()
  WHERE id = v_pedido.id;

  RETURN QUERY SELECT
    true, false, v_atleta_id, v_reserva_id, v_pedido.id,
    v_pedido.nombre, v_pedido.apellido, v_pedido.email,
    v_pedido.fecha, v_clase_hora, v_clase_nombre, v_plan_nombre;
END;
$$;

-- Solo el backend (service_role) llama a esta función, nunca el cliente
GRANT EXECUTE ON FUNCTION public.confirmar_pedido_grupal_pago(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirmar_pedido_grupal_pago(text) FROM anon, authenticated;

-- ============================================================
-- Realtime en `reservas` para la pantalla de check-in
-- ============================================================
-- Hoy, si recepción marca "presente" en un dispositivo, el coach en
-- otro dispositivo no lo ve hasta apretar "Actualizar" a mano. Con
-- varias estaciones activas a la vez (recepción + tablet del coach +
-- celular del dueño) eso genera doble marcaje o confusión. Se agrega
-- la tabla a la publicación de Supabase Realtime para que el
-- front pueda suscribirse a los cambios.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas;
  END IF;
END $$;
