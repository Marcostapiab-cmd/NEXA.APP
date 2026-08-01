-- ============================================================
-- NEXA 019 — Acceso público para reserva de clases grupales
--
-- PRINCIPIO: ningún INSERT directo sobre atletas ni reservas
-- para anónimos. Todo pasa por funciones SECURITY DEFINER
-- que corren con privilegios del owner pero con lógica
-- de negocio fija — el anónimo no puede cambiar el estado,
-- tocar otros campos, ni saltarse el límite de cupos.
-- ============================================================

-- ── 1. Bloqueos: lectura pública ─────────────────────────────
-- Solo contiene fechas y motivos, sin datos personales.
CREATE POLICY "bloqueos_anon_read" ON public.horario_bloqueos
  FOR SELECT TO anon
  USING (true);

-- ── 2. Disponibilidad pública ────────────────────────────────
-- Devuelve cupos disponibles por clase/fecha.
-- No expone ningún dato personal de los atletas reservados.
CREATE OR REPLACE FUNCTION public.get_clases_disponibles(p_dias int DEFAULT 14)
RETURNS TABLE (
  clase_id    uuid,
  nombre      text,
  dia_semana  int,
  hora        text,
  capacidad   int,
  reservadas  bigint,
  disponibles int,
  fecha       date,
  bloqueada   boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cg.id                                               AS clase_id,
    cg.nombre,
    cg.dia_semana,
    cg.hora,
    cg.capacidad,
    COUNT(r.id)                                         AS reservadas,
    GREATEST(0, cg.capacidad - COUNT(r.id)::int)::int   AS disponibles,
    d.fecha::date,
    EXISTS(
      SELECT 1 FROM public.horario_bloqueos hb
      WHERE hb.fecha = d.fecha
        AND (hb.hora_inicio IS NULL
             OR (cg.hora >= hb.hora_inicio
                 AND cg.hora < COALESCE(hb.hora_fin, '23:59')))
    ) AS bloqueada
  FROM generate_series(
    current_date,
    current_date + (p_dias - 1) * '1 day'::interval,
    '1 day'::interval
  ) AS d(fecha)
  JOIN public.clases_grupales cg
    ON EXTRACT(DOW FROM d.fecha)::int = cg.dia_semana
   AND cg.activa = true
  LEFT JOIN public.reservas r
    ON r.fecha      = d.fecha::date
   AND r.hora       = cg.hora
   AND r.tipo_clase ILIKE '%grupal%'
   AND r.estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
  GROUP BY cg.id, cg.nombre, cg.dia_semana, cg.hora, cg.capacidad, d.fecha
  ORDER BY d.fecha, cg.hora;
$$;

GRANT EXECUTE ON FUNCTION public.get_clases_disponibles(int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_clases_disponibles(int) TO authenticated;

-- ── 3. Reserva pública ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reservar_clase_grupal(
  p_clase_id  uuid,
  p_fecha     date,
  p_nombre    text,
  p_apellido  text,
  p_telefono  text DEFAULT NULL,
  p_email     text DEFAULT NULL,
  p_rut       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clase      RECORD;
  v_reservadas bigint;
  v_bloqueada  boolean;
  v_atleta_id  uuid;
  v_reserva_id uuid;
BEGIN
  -- Validar inputs mínimos
  IF trim(coalesce(p_nombre,'')) = '' OR trim(coalesce(p_apellido,'')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'datos_incompletos');
  END IF;
  IF trim(coalesce(p_telefono,'')) = '' AND trim(coalesce(p_email,'')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'telefono_o_email_requerido');
  END IF;

  -- Clase existe y está activa
  SELECT * INTO v_clase FROM public.clases_grupales
  WHERE id = p_clase_id AND activa = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clase_no_encontrada');
  END IF;

  -- El día de la semana de p_fecha debe coincidir con la clase
  IF EXTRACT(DOW FROM p_fecha)::int != v_clase.dia_semana THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fecha_incorrecta');
  END IF;

  -- No permitir fechas pasadas
  IF p_fecha < current_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fecha_pasada');
  END IF;

  -- Verificar bloqueos
  SELECT EXISTS(
    SELECT 1 FROM public.horario_bloqueos
    WHERE fecha = p_fecha
      AND (hora_inicio IS NULL
           OR (v_clase.hora >= hora_inicio
               AND v_clase.hora < COALESCE(hora_fin, '23:59')))
  ) INTO v_bloqueada;
  IF v_bloqueada THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fecha_bloqueada');
  END IF;

  -- Doble chequeo de cupos (dentro de la transacción)
  SELECT COUNT(*) INTO v_reservadas
  FROM public.reservas
  WHERE fecha      = p_fecha
    AND hora       = v_clase.hora
    AND tipo_clase ILIKE '%grupal%'
    AND estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show');

  IF v_reservadas >= v_clase.capacidad THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo');
  END IF;

  -- Buscar atleta existente por email o teléfono
  SELECT id INTO v_atleta_id
  FROM public.atletas
  WHERE (trim(coalesce(p_email,'')) != ''    AND lower(email)  = lower(trim(p_email)))
     OR (trim(coalesce(p_telefono,'')) != '' AND telefono      = trim(p_telefono))
  LIMIT 1;

  -- Si no existe, crear con campos mínimos únicamente
  IF v_atleta_id IS NULL THEN
    INSERT INTO public.atletas (nombre, apellido, telefono, email, rut, activo)
    VALUES (
      trim(p_nombre),
      trim(p_apellido),
      NULLIF(trim(coalesce(p_telefono,'')), ''),
      NULLIF(trim(coalesce(p_email,'')),    ''),
      NULLIF(trim(coalesce(p_rut,'')),      ''),
      true
    )
    RETURNING id INTO v_atleta_id;
  END IF;

  -- Evitar reserva duplicada para la misma sesión
  IF EXISTS(
    SELECT 1 FROM public.reservas
    WHERE alumno_id = v_atleta_id
      AND fecha     = p_fecha
      AND hora      = v_clase.hora
      AND estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ya_reservado');
  END IF;

  -- Insertar reserva — estado SIEMPRE 'pendiente', hardcodeado
  INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, tipo_clase, estado, descripcion)
  VALUES (v_atleta_id, NULL, p_fecha, v_clase.hora, 'Grupal', 'pendiente', v_clase.nombre)
  RETURNING id INTO v_reserva_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'reserva_id', v_reserva_id,
    'atleta_id',  v_atleta_id,
    'clase',      v_clase.nombre,
    'fecha',      p_fecha::text,
    'hora',       v_clase.hora
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_clase_grupal(uuid,date,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.reservar_clase_grupal(uuid,date,text,text,text,text,text) TO authenticated;
