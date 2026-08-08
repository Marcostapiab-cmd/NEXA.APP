-- ============================================================
-- NEXA 023 — Correcciones de integridad: sistema grupales
-- ============================================================

-- ── 1. clases_restantes → columna generada (elimina desincronía) ─
-- IMPORTANTE: desplegar junto con los cambios en pagar/route.ts y
-- confirmar/route.ts que eliminan la escritura explícita del campo.
ALTER TABLE public.grupales_compras DROP COLUMN clases_restantes;
ALTER TABLE public.grupales_compras
  ADD COLUMN clases_restantes int
    GENERATED ALWAYS AS (clases_totales - clases_usadas) STORED;

-- ── 2. NOT NULL en referencias clave de grupales_reservas ────────
-- Fallará si existen filas con NULL; limpiarlas antes de migrar.
ALTER TABLE public.grupales_reservas
  ALTER COLUMN compra_id SET NOT NULL,
  ALTER COLUMN clase_id  SET NOT NULL;

-- ── 3. Policy de packs: TO clause explícita ──────────────────────
DROP POLICY IF EXISTS "grupales_packs_read_all" ON public.grupales_packs;
CREATE POLICY "grupales_packs_read_all" ON public.grupales_packs
  FOR SELECT TO anon, authenticated USING (activo = true);

-- ── 4. Unicidad de email para alumnos con cuenta auth ───────────
CREATE UNIQUE INDEX IF NOT EXISTS ga_email_auth_unique_idx
  ON public.grupales_alumnos(email)
  WHERE user_id IS NOT NULL;

-- ── 5. Función atómica de reserva ────────────────────────────────
-- Centraliza en una sola transacción:
--   • bloqueo de cupo (SELECT FOR UPDATE en la clase)
--   • verificación de bloqueo horario
--   • chequeo de duplicado
--   • verificación de capacidad
--   • decremento atómico de crédito (UPDATE WHERE ... < clases_totales)
--   • insert de reserva
-- El EXCEPTION handler devuelve el error como JSON; PostgreSQL
-- revierte automáticamente todos los cambios del bloque en caso de
-- excepción capturada (savepoint implícito).
CREATE OR REPLACE FUNCTION public.reservar_clase_grupal(
  p_user_id      uuid,
  p_clase_id     uuid,
  p_compra_id    uuid,
  p_fecha        date,
  p_hora         text,
  p_nombre_clase text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id uuid;
  v_capacidad int;
  v_count_r   int;
  v_count_g   int;
  v_updated   int;
  v_estado    text;
  v_expira    timestamptz;
  v_restantes int;
BEGIN
  -- 1. Resolver alumno
  SELECT id INTO v_alumno_id
    FROM public.grupales_alumnos WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Alumno no encontrado', 'code', 404);
  END IF;

  -- 2. Bloquear la fila de clase para serializar chequeos de capacidad concurrentes
  SELECT COALESCE(capacidad, 12) INTO v_capacidad
    FROM public.clases_grupales WHERE id = p_clase_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Clase no encontrada', 'code', 404);
  END IF;

  -- 3. Verificar que el horario no esté bloqueado administrativamente
  IF EXISTS(
    SELECT 1 FROM public.horario_bloqueos
     WHERE fecha = p_fecha
       AND (hora_inicio IS NULL
            OR (p_hora >= hora_inicio AND p_hora < COALESCE(hora_fin, '23:59')))
  ) THEN
    RETURN jsonb_build_object('error', 'Horario bloqueado', 'code', 400);
  END IF;

  -- 4. Verificar que el alumno no tenga ya reserva activa en ese horario
  IF EXISTS(
    SELECT 1 FROM public.grupales_reservas
     WHERE alumno_id = v_alumno_id
       AND fecha     = p_fecha
       AND hora      = p_hora
       AND estado    = 'reservada'
  ) THEN
    RETURN jsonb_build_object('error', 'Ya tienes una reserva en ese horario', 'code', 409);
  END IF;

  -- 5. Verificar capacidad (bajo el lock de la clase)
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
    RETURN jsonb_build_object('error', 'No quedan cupos disponibles', 'code', 409);
  END IF;

  -- 6. Decrementar crédito atómicamente: el WHERE garantiza que solo
  --    una transacción concurrente puede consumir el último crédito.
  UPDATE public.grupales_compras
     SET clases_usadas = clases_usadas + 1
   WHERE id          = p_compra_id
     AND alumno_id   = v_alumno_id
     AND estado_pago = 'pagado'
     AND fecha_expira > now()
     AND clases_usadas < clases_totales;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    SELECT estado_pago, fecha_expira, (clases_totales - clases_usadas)
      INTO v_estado,    v_expira,     v_restantes
      FROM public.grupales_compras
     WHERE id = p_compra_id AND alumno_id = v_alumno_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Pack no encontrado', 'code', 404);
    ELSIF v_estado <> 'pagado' THEN
      RETURN jsonb_build_object('error', 'El pack no está activo', 'code', 400);
    ELSIF v_expira <= now() THEN
      RETURN jsonb_build_object('error', 'El pack está vencido', 'code', 400);
    ELSE
      RETURN jsonb_build_object('error', 'Sin clases disponibles', 'code', 400);
    END IF;
  END IF;

  -- 7. Insertar reserva
  INSERT INTO public.grupales_reservas
    (alumno_id, compra_id, clase_id, fecha, hora, nombre_clase, estado)
  VALUES
    (v_alumno_id, p_compra_id, p_clase_id, p_fecha, p_hora, p_nombre_clase, 'reservada');

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  -- PostgreSQL revirtió todos los cambios del bloque al entrar aquí.
  RETURN jsonb_build_object('error', SQLERRM, 'code', 500);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_clase_grupal(uuid, uuid, uuid, date, text, text)
  TO authenticated;
