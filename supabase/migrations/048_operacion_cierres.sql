-- ============================================================
-- NEXA 048 — Fase 6: operación (cierres, ausencias de profesores, lista de espera)
-- ============================================================
-- Hasta ahora un bloqueo (feriado, cierre, ausencia) solo impedía reservas
-- NUEVAS: las clases ya agendadas quedaban igual y nadie avisaba al alumno.
--
-- 1. Cierres y ausencias (`staff_crear_cierre`): feriados, cierres, mantenciones,
--    eventos, horario reducido, vacaciones y ausencias de profesores, por rango de
--    fechas. Detecta las clases afectadas y las deja en `clases_afectadas` con el
--    motivo y la solución aplicada. Según lo que elija el staff:
--      · suspender  → la clase queda 'cancelada_nexa': el alumno NO pierde el crédito
--                     y recibe un correo para reservar otro horario.
--      · sustituir  → (solo ausencias) se asigna otro profesor libre a esa hora,
--                     se avisa al alumno; si no hay, queda pendiente.
--      · revisar    → quedan pendientes y se resuelven una a una.
--    Nunca se borran reservas: todo queda en el historial de créditos y auditoría.
-- 2. Un profesor puede avisar su ausencia (`profesor_avisar_ausencia`). Si la
--    política exige aprobación (por defecto sí), sus clases quedan pendientes para
--    administración; si no, se buscan sustitutos automáticamente.
-- 3. Revisión cada hora: clases agendadas en un horario cerrado sin resolver
--    → "Requiere mi atención".
-- 4. Lista de espera: rango de horas, vencimiento, prioridad configurable
--    (orden de llegada o primero quien quiere mover una clase) y modo de aviso
--    (a todos a la vez, o por turnos con un tiempo de respuesta). También avisa
--    cuando el cupo lo libera el staff, no solo el alumno.
-- Requiere 041, 042 y 044. Re-ejecutable.
-- ============================================================

-- ── 1. Configuración ────────────────────────────────────────
ALTER TABLE public.horario_config
  ADD COLUMN IF NOT EXISTS sustituto_requiere_aprobacion boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lista_espera_modo      text NOT NULL DEFAULT 'todos',     -- todos | turnos
  ADD COLUMN IF NOT EXISTS lista_espera_minutos   int  NOT NULL DEFAULT 120,         -- tiempo de cada turno
  ADD COLUMN IF NOT EXISTS lista_espera_prioridad text NOT NULL DEFAULT 'llegada';   -- llegada | mover_primero

-- ── 2. Cierres y clases afectadas ───────────────────────────
ALTER TABLE public.horario_bloqueos
  ADD COLUMN IF NOT EXISTS grupo_id   uuid,
  ADD COLUMN IF NOT EXISTS creado_por uuid,
  ADD COLUMN IF NOT EXISTS estado     text NOT NULL DEFAULT 'aprobado';  -- aprobado | por_aprobar
-- Cada bloqueo pertenece a un cierre (también los creados desde Configuración)
ALTER TABLE public.horario_bloqueos ALTER COLUMN grupo_id SET DEFAULT gen_random_uuid();
UPDATE public.horario_bloqueos SET grupo_id = gen_random_uuid() WHERE grupo_id IS NULL;
CREATE INDEX IF NOT EXISTS horario_bloqueos_grupo_idx ON public.horario_bloqueos(grupo_id);

CREATE TABLE IF NOT EXISTS public.clases_afectadas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id        uuid NOT NULL,          -- cierre que la afectó
  reserva_id      int  NOT NULL,
  atleta_id       uuid,
  coach_original  uuid,
  fecha           date NOT NULL,
  hora            text NOT NULL,
  modalidad       text,
  motivo          text,
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'sustituida', 'suspendida', 'se_mantiene', 'resuelta_por_alumno')),
  solucion        text,                   -- qué se hizo, en palabras
  coach_sustituto uuid,
  resuelta_at     timestamptz,
  resuelta_por    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, reserva_id)
);
CREATE INDEX IF NOT EXISTS clases_afectadas_pend_idx ON public.clases_afectadas(estado, fecha) WHERE estado = 'pendiente';
ALTER TABLE public.clases_afectadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clases_afectadas_staff_read ON public.clases_afectadas;
CREATE POLICY clases_afectadas_staff_read ON public.clases_afectadas
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host', 'recepcionista'));

-- Tipos de cierre y su nombre
CREATE OR REPLACE FUNCTION public.nexa_tipo_cierre(p_tipo text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tipo
    WHEN 'feriado'          THEN 'Feriado'
    WHEN 'cierre'           THEN 'Cierre extraordinario'
    WHEN 'mantencion'       THEN 'Mantención'
    WHEN 'evento'           THEN 'Evento especial'
    WHEN 'horario_reducido' THEN 'Horario reducido'
    WHEN 'vacaciones'       THEN 'Vacaciones de profesor'
    WHEN 'ausencia'         THEN 'Ausencia de profesor'
    WHEN 'descanso'         THEN 'Descanso de profesor'
  END
$$;

-- ¿Ese horario está bloqueado para ese profesor (o para todo el gimnasio)?
CREATE OR REPLACE FUNCTION public.nexa_slot_bloqueado(p_fecha date, p_hora text, p_coach uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.horario_bloqueos b
    WHERE b.fecha = p_fecha
      AND (b.coach_id IS NULL OR b.coach_id = p_coach)
      AND (b.hora_inicio IS NULL OR (left(p_hora, 5) >= left(b.hora_inicio, 5) AND left(p_hora, 5) < left(coalesce(b.hora_fin, '23:59'), 5)))
  )
$$;

-- Clases activas (1:1 y 2:1) dentro de un rango de fechas/horas, opcionalmente de un profesor
CREATE OR REPLACE FUNCTION public.nexa_clases_en_rango(
  p_desde date, p_hasta date, p_hora_inicio text, p_hora_fin text, p_coach uuid
) RETURNS SETOF public.reservas LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM public.reservas r
  WHERE public.nexa_dia(r.fecha) BETWEEN p_desde AND p_hasta
    AND coalesce(r.hora, '') ~ '^\d{2}:\d{2}'
    AND (p_hora_inicio IS NULL OR (left(r.hora, 5) >= left(p_hora_inicio, 5) AND left(r.hora, 5) < left(coalesce(p_hora_fin, '23:59'), 5)))
    AND (p_coach IS NULL OR r.coach_id = p_coach)
    AND public.nexa_modalidad(r.tipo_clase) <> 'grupal'
    AND NOT public.nexa_estado_inactivo(r.estado) AND r.estado <> 'presente'
    AND public.nexa_inicio_clase(public.nexa_dia(r.fecha), r.hora) > now()
  ORDER BY public.nexa_dia(r.fecha), left(r.hora, 5)
$$;

-- Profesores que pueden reemplazar al original en ese horario (para p_n alumnos)
CREATE OR REPLACE FUNCTION public.nexa_sustitutos(p_fecha date, p_hora text, p_orig uuid, p_mod text, p_n int DEFAULT 1)
RETURNS TABLE (coach_id uuid, nombre text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.nombre FROM public.coaches c
  WHERE c.activo AND c.id IS DISTINCT FROM p_orig
    AND public.nexa_hora_valida(p_fecha, p_hora)
    AND NOT public.nexa_slot_bloqueado(p_fecha, p_hora, c.id)
    AND (
      SELECT CASE WHEN p_mod = '1:1' THEN count(*) = 0
                  ELSE NOT coalesce(bool_or(public.nexa_modalidad(r.tipo_clase) = '1:1'), false) AND count(*) + p_n <= 2 END
      FROM public.reservas r
      WHERE public.nexa_dia(r.fecha) = p_fecha AND left(r.hora, 5) = left(p_hora, 5) AND r.coach_id = c.id
        AND public.nexa_modalidad(r.tipo_clase) <> 'grupal' AND NOT public.nexa_estado_inactivo(r.estado)
    )
  ORDER BY c.nombre
$$;

-- Aplica una solución a una clase afectada. Interna: la llaman las funciones staff_*.
CREATE OR REPLACE FUNCTION public.nexa_resolver_afectada(p_id uuid, p_accion text, p_coach uuid, p_nota text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.clases_afectadas; r public.reservas; v_ant text; v_nuevo text; v_motivo text;
BEGIN
  SELECT * INTO a FROM public.clases_afectadas WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF a.estado <> 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'error', 'ya_resuelta'); END IF;
  SELECT * INTO r FROM public.reservas WHERE id = a.reserva_id FOR UPDATE;

  -- El alumno ya la movió o canceló por su cuenta (o se borró): no hay nada que hacer
  IF r.id IS NULL OR public.nexa_estado_inactivo(r.estado) OR r.estado = 'presente' THEN
    UPDATE public.clases_afectadas SET estado = 'resuelta_por_alumno', resuelta_at = now(), resuelta_por = auth.uid(),
           solucion = 'La clase ya no estaba activa (el alumno la movió o canceló).' WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'estado', 'resuelta_por_alumno');
  END IF;

  v_motivo := coalesce(nullif(trim(p_nota), ''), a.motivo);

  IF p_accion = 'suspender' THEN
    PERFORM set_config('nexa.motivo', left('Suspendida por NEXA: ' || coalesce(v_motivo, 'motivo operativo'), 300), true);
    UPDATE public.reservas SET estado = 'cancelada_nexa',
           admin_note = coalesce(admin_note || ' · ', '') || 'Suspendida por NEXA: ' || coalesce(v_motivo, '')
     WHERE id = r.id;
    UPDATE public.clases_afectadas SET estado = 'suspendida', resuelta_at = now(), resuelta_por = auth.uid(),
           solucion = 'Clase suspendida por NEXA. El alumno conserva el crédito para reservar otro horario.'
     WHERE id = p_id;
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (r.alumno_id, 'clase_suspendida', public.nexa_datos_reserva(r.id) || jsonb_build_object('motivo', v_motivo),
            'suspendida:' || r.id)
    ON CONFLICT (clave) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'estado', 'suspendida');

  ELSIF p_accion = 'sustituir' THEN
    IF p_coach IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'falta_profesor'); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.nexa_sustitutos(a.fecha, a.hora, r.coach_id, public.nexa_modalidad(r.tipo_clase), 1) s
                    WHERE s.coach_id = p_coach) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'profesor_no_disponible');
    END IF;
    SELECT nombre INTO v_ant FROM public.coaches WHERE id = r.coach_id;
    SELECT nombre INTO v_nuevo FROM public.coaches WHERE id = p_coach;
    BEGIN
      UPDATE public.reservas SET coach_id = p_coach,
             admin_note = coalesce(admin_note || ' · ', '') || 'Profesor sustituto: ' || coalesce(v_nuevo, '') || ' (' || coalesce(v_motivo, '') || ')'
       WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'profesor_no_disponible', 'detalle', SQLERRM);
    END;
    UPDATE public.clases_afectadas SET estado = 'sustituida', coach_sustituto = p_coach, resuelta_at = now(), resuelta_por = auth.uid(),
           solucion = 'Se mantiene la clase con ' || coalesce(v_nuevo, 'otro profesor') || ' en lugar de ' || coalesce(v_ant, 'el profesor original') || '.'
     WHERE id = p_id;
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (r.alumno_id, 'cambio_profesor',
            public.nexa_datos_reserva(r.id) || jsonb_build_object('profesor_anterior', v_ant, 'motivo', v_motivo),
            'cambio_prof:' || r.id || ':' || p_coach)
    ON CONFLICT (clave) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'estado', 'sustituida');

  ELSIF p_accion = 'mantener' THEN
    UPDATE public.clases_afectadas SET estado = 'se_mantiene', resuelta_at = now(), resuelta_por = auth.uid(),
           solucion = coalesce('Se mantiene: ' || nullif(trim(p_nota), ''), 'Se mantiene la clase sin cambios.')
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'estado', 'se_mantiene');
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'accion_invalida');
END $$;

-- Crea el cierre y resuelve sus clases según p_accion. Interna (sin revisar el rol).
CREATE OR REPLACE FUNCTION public.nexa_crear_cierre(
  p_tipo text, p_desde date, p_hasta date, p_hora_inicio text, p_hora_fin text,
  p_coach uuid, p_motivo text, p_accion text, p_estado text DEFAULT 'aprobado'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_grupo uuid := gen_random_uuid(); d date; r record; v_sus uuid; v_res jsonb;
  n_af int := 0; n_sus int := 0; n_sust int := 0; n_pend int := 0; v_motivo text;
BEGIN
  IF public.nexa_tipo_cierre(p_tipo) IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido'); END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN RETURN jsonb_build_object('ok', false, 'error', 'fechas_invalidas'); END IF;
  IF p_hasta - p_desde > 120 THEN RETURN jsonb_build_object('ok', false, 'error', 'rango_largo'); END IF;
  IF p_hasta < public.nexa_hoy() THEN RETURN jsonb_build_object('ok', false, 'error', 'fechas_pasadas'); END IF;
  IF (p_hora_inicio IS NULL) <> (p_hora_fin IS NULL)
     OR (p_hora_inicio IS NOT NULL AND (p_hora_inicio !~ '^\d{2}:\d{2}' OR p_hora_fin !~ '^\d{2}:\d{2}' OR left(p_hora_fin, 5) <= left(p_hora_inicio, 5))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'horas_invalidas');
  END IF;
  IF p_tipo IN ('vacaciones', 'ausencia', 'descanso') AND p_coach IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'falta_profesor');
  END IF;
  IF p_accion NOT IN ('suspender', 'sustituir', 'revisar') THEN RETURN jsonb_build_object('ok', false, 'error', 'accion_invalida'); END IF;
  IF p_accion = 'sustituir' AND p_coach IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sustituir_solo_profesor'); END IF;

  v_motivo := coalesce(nullif(trim(p_motivo), ''), public.nexa_tipo_cierre(p_tipo));
  PERFORM set_config('nexa.origen', coalesce(nullif(current_setting('nexa.origen', true), ''), 'staff'), true);

  -- Primero se detectan las clases (antes de bloquear, para que los sustitutos se calculen bien)
  FOR r IN SELECT * FROM public.nexa_clases_en_rango(p_desde, p_hasta, p_hora_inicio, p_hora_fin, p_coach) LOOP
    INSERT INTO public.clases_afectadas (grupo_id, reserva_id, atleta_id, coach_original, fecha, hora, modalidad, motivo)
    VALUES (v_grupo, r.id, r.alumno_id, r.coach_id, public.nexa_dia(r.fecha), left(r.hora, 5), public.nexa_modalidad(r.tipo_clase), v_motivo)
    ON CONFLICT DO NOTHING;
    n_af := n_af + 1;
  END LOOP;

  -- Un bloqueo por día (así lo leen el horario y las reservas)
  FOR d IN SELECT g::date FROM generate_series(greatest(p_desde, public.nexa_hoy()), p_hasta, interval '1 day') g LOOP
    INSERT INTO public.horario_bloqueos (fecha, hora_inicio, hora_fin, motivo, coach_id, tipo, grupo_id, creado_por, estado)
    VALUES (d, p_hora_inicio, p_hora_fin, v_motivo, p_coach, p_tipo, v_grupo, auth.uid(), p_estado);
  END LOOP;

  -- Soluciones
  IF p_accion <> 'revisar' THEN
    FOR r IN
      SELECT a.id AS af_id, a.fecha, a.hora, a.modalidad FROM public.clases_afectadas a
       WHERE a.grupo_id = v_grupo ORDER BY a.fecha, a.hora
    LOOP
      IF p_accion = 'suspender' THEN
        v_res := public.nexa_resolver_afectada(r.af_id, 'suspender', NULL, NULL);
        IF (v_res->>'ok')::boolean THEN n_sus := n_sus + 1; END IF;
      ELSE
        -- Primero quien ya trabaja ese día (menos traslados) y luego por nombre
        SELECT s.coach_id INTO v_sus FROM public.nexa_sustitutos(r.fecha, r.hora, p_coach, r.modalidad, 1) s
         ORDER BY (SELECT count(*) FROM public.reservas y WHERE y.coach_id = s.coach_id AND public.nexa_dia(y.fecha) = r.fecha
                    AND NOT public.nexa_estado_inactivo(y.estado)) DESC, s.nombre
         LIMIT 1;
        IF v_sus IS NOT NULL THEN
          v_res := public.nexa_resolver_afectada(r.af_id, 'sustituir', v_sus, NULL);
          IF (v_res->>'ok')::boolean THEN n_sust := n_sust + 1; ELSE n_pend := n_pend + 1; END IF;
        ELSE
          n_pend := n_pend + 1;
        END IF;
        v_sus := NULL;
      END IF;
    END LOOP;
  ELSE
    n_pend := n_af;
  END IF;

  RETURN jsonb_build_object('ok', true, 'grupo_id', v_grupo, 'afectadas', n_af,
    'suspendidas', n_sus, 'sustituidas', n_sust, 'pendientes', n_pend);
END $$;

-- Registra las clases que quedaron dentro de un cierre sin pasar por staff_crear_cierre
-- (por ejemplo, un bloqueo creado en Configuración) y marca las que el alumno ya movió.
CREATE OR REPLACE FUNCTION public.nexa_registrar_afectadas()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.clases_afectadas (grupo_id, reserva_id, atleta_id, coach_original, fecha, hora, modalidad, motivo)
  SELECT DISTINCT ON (x.id) b.grupo_id, x.id, x.alumno_id, x.coach_id, public.nexa_dia(x.fecha), left(x.hora, 5),
         public.nexa_modalidad(x.tipo_clase), coalesce(b.motivo, public.nexa_tipo_cierre(b.tipo))
  FROM public.reservas x
  JOIN public.horario_bloqueos b
    ON b.fecha = public.nexa_dia(x.fecha) AND (b.coach_id IS NULL OR b.coach_id = x.coach_id)
   AND (b.hora_inicio IS NULL OR (left(x.hora, 5) >= left(b.hora_inicio, 5) AND left(x.hora, 5) < left(coalesce(b.hora_fin, '23:59'), 5)))
  WHERE b.grupo_id IS NOT NULL AND b.fecha BETWEEN public.nexa_hoy() AND public.nexa_hoy() + 120
    AND coalesce(x.hora, '') ~ '^\d{2}:\d{2}'
    AND public.nexa_modalidad(x.tipo_clase) <> 'grupal'
    AND NOT public.nexa_estado_inactivo(x.estado) AND x.estado <> 'presente'
    AND public.nexa_inicio_clase(public.nexa_dia(x.fecha), x.hora) > now()
    AND NOT EXISTS (SELECT 1 FROM public.clases_afectadas a WHERE a.reserva_id = x.id AND a.estado IN ('pendiente', 'se_mantiene'))
    AND NOT EXISTS (SELECT 1 FROM public.clases_afectadas a WHERE a.reserva_id = x.id AND a.grupo_id = b.grupo_id)
  ORDER BY x.id, b.created_at
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.clases_afectadas a SET estado = 'resuelta_por_alumno', resuelta_at = now(),
         solucion = 'La clase ya no estaba activa (el alumno la movió o canceló).'
   WHERE a.estado = 'pendiente' AND NOT EXISTS (
     SELECT 1 FROM public.reservas x WHERE x.id = a.reserva_id
        AND NOT public.nexa_estado_inactivo(x.estado) AND x.estado <> 'presente');
  RETURN n;
END $$;

-- ── 3. Funciones del staff ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.nexa_es_staff()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(get_my_role(), '') IN ('admin', 'host', 'recepcionista')
$$;

-- Vista previa: qué clases afectaría un cierre y quién podría reemplazar
CREATE OR REPLACE FUNCTION public.staff_vista_previa_cierre(
  p_desde date, p_hasta date, p_hora_inicio text DEFAULT NULL, p_hora_fin text DEFAULT NULL, p_coach uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nexa_es_staff() THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fechas_invalidas');
  END IF;
  RETURN jsonb_build_object('ok', true, 'clases', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'reserva_id', r.id, 'fecha', public.nexa_dia(r.fecha), 'hora', left(r.hora, 5),
      'modalidad', public.nexa_modalidad(r.tipo_clase),
      'alumno', public.nexa_nombre_atleta(r.alumno_id), 'profesor', c.nombre,
      'sustitutos', CASE WHEN p_coach IS NULL THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', s.coach_id, 'nombre', s.nombre))
          FROM public.nexa_sustitutos(public.nexa_dia(r.fecha), r.hora, r.coach_id, public.nexa_modalidad(r.tipo_clase), 1) s), '[]'::jsonb) END
    ) ORDER BY public.nexa_dia(r.fecha), left(r.hora, 5))
    FROM public.nexa_clases_en_rango(p_desde, p_hasta, p_hora_inicio, p_hora_fin, p_coach) r
    LEFT JOIN public.coaches c ON c.id = r.coach_id), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.staff_crear_cierre(
  p_tipo text, p_desde date, p_hasta date, p_hora_inicio text, p_hora_fin text,
  p_coach uuid, p_motivo text, p_accion text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nexa_es_staff() THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  RETURN public.nexa_crear_cierre(p_tipo, p_desde, p_hasta, nullif(p_hora_inicio, ''), nullif(p_hora_fin, ''),
                                  p_coach, p_motivo, p_accion, 'aprobado');
END $$;

-- Resolver una clase afectada: sustituir (con p_coach), suspender o mantener
CREATE OR REPLACE FUNCTION public.staff_resolver_clase_afectada(p_id uuid, p_accion text, p_coach uuid DEFAULT NULL, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nexa_es_staff() THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  PERFORM set_config('nexa.origen', 'staff', true);
  RETURN public.nexa_resolver_afectada(p_id, p_accion, p_coach, p_nota);
END $$;

-- Aprobar la ausencia que avisó un profesor
CREATE OR REPLACE FUNCTION public.staff_aprobar_ausencia(p_grupo uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nexa_es_staff() THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  UPDATE public.horario_bloqueos SET estado = 'aprobado' WHERE grupo_id = p_grupo AND estado = 'por_aprobar';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Quitar un cierre: libera el horario. Las clases ya suspendidas NO se reactivan (el alumno ya fue avisado).
CREATE OR REPLACE FUNCTION public.staff_eliminar_cierre(p_grupo uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; d record;
BEGIN
  IF NOT public.nexa_es_staff() THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  DELETE FROM public.horario_bloqueos WHERE grupo_id = p_grupo AND fecha >= public.nexa_hoy();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.clases_afectadas SET estado = 'se_mantiene', resuelta_at = now(), resuelta_por = auth.uid(),
         solucion = 'Se quitó el cierre: la clase se mantiene.'
   WHERE grupo_id = p_grupo AND estado = 'pendiente';
  RETURN jsonb_build_object('ok', true, 'dias', n);
END $$;

-- Lista de cierres desde hoy (agrupados) con el estado de sus clases
CREATE OR REPLACE FUNCTION public.staff_cierres(p_incluir_pasados boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nexa_es_staff() AND coalesce(get_my_role(), '') <> 'profesor' THEN RETURN '[]'::jsonb; END IF;
  PERFORM public.nexa_registrar_afectadas();
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'desde') FROM (
      SELECT jsonb_build_object(
        'grupo_id', b.grupo_id,
        'tipo', min(b.tipo), 'tipo_nombre', public.nexa_tipo_cierre(min(b.tipo)),
        'motivo', min(b.motivo), 'desde', min(b.fecha), 'hasta', max(b.fecha),
        'hora_inicio', min(b.hora_inicio), 'hora_fin', min(b.hora_fin),
        'coach_id', min(b.coach_id::text), 'profesor', (SELECT nombre FROM public.coaches WHERE id = min(b.coach_id::text)::uuid),
        'estado', min(b.estado),
        'clases', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', a.id, 'reserva_id', a.reserva_id, 'fecha', a.fecha, 'hora', a.hora, 'modalidad', a.modalidad,
            'alumno', public.nexa_nombre_atleta(a.atleta_id), 'profesor', co.nombre, 'estado', a.estado,
            'solucion', a.solucion,
            'sustitutos', CASE WHEN a.estado = 'pendiente' AND public.nexa_es_staff() THEN coalesce((
              SELECT jsonb_agg(jsonb_build_object('id', s.coach_id, 'nombre', s.nombre))
                FROM public.nexa_sustitutos(a.fecha, a.hora, a.coach_original, a.modalidad, 1) s), '[]'::jsonb) ELSE '[]'::jsonb END
          ) ORDER BY a.fecha, a.hora)
          FROM public.clases_afectadas a LEFT JOIN public.coaches co ON co.id = a.coach_original
          WHERE a.grupo_id = b.grupo_id
            AND (public.nexa_es_staff() OR a.coach_original = auth.uid())), '[]'::jsonb)
      ) AS x
      FROM public.horario_bloqueos b
      WHERE (p_incluir_pasados OR b.fecha >= public.nexa_hoy())
        AND (public.nexa_es_staff() OR b.coach_id = auth.uid())
      GROUP BY b.grupo_id
    ) t), '[]'::jsonb);
END $$;

-- ── 4. El profesor avisa su ausencia ────────────────────────
CREATE OR REPLACE FUNCTION public.profesor_avisar_ausencia(
  p_desde date, p_hasta date, p_hora_inicio text DEFAULT NULL, p_hora_fin text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg public.horario_config; v_res jsonb; v_nombre text; v_auto boolean;
BEGIN
  IF coalesce(get_my_role(), '') <> 'profesor' OR NOT EXISTS (SELECT 1 FROM public.coaches WHERE id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'motivo_requerido'); END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  v_auto := NOT coalesce(v_cfg.sustituto_requiere_aprobacion, true);
  PERFORM set_config('nexa.origen', 'profesor', true);
  v_res := public.nexa_crear_cierre('ausencia', p_desde, p_hasta, nullif(p_hora_inicio, ''), nullif(p_hora_fin, ''),
                                    auth.uid(), p_motivo, CASE WHEN v_auto THEN 'sustituir' ELSE 'revisar' END,
                                    CASE WHEN v_auto THEN 'aprobado' ELSE 'por_aprobar' END);
  IF NOT (v_res->>'ok')::boolean THEN RETURN v_res; END IF;

  SELECT nombre INTO v_nombre FROM public.coaches WHERE id = auth.uid();
  PERFORM public.nexa_incidencia('ausencia_profesor', 'alta', 'ausencia:' || (v_res->>'grupo_id'),
    'Ausencia de ' || coalesce(v_nombre, 'profesor') || ' · ' || to_char(p_desde, 'DD-MM')
      || CASE WHEN p_hasta > p_desde THEN ' al ' || to_char(p_hasta, 'DD-MM') ELSE '' END,
    trim(p_motivo) || '. ' || (v_res->>'afectadas') || ' clase(s) afectada(s), '
      || (v_res->>'sustituidas') || ' con sustituto, ' || (v_res->>'pendientes') || ' por resolver.',
    'Revisar en Cierres y ausencias: asignar sustituto o suspender (el alumno conserva su crédito).',
    NULL, NULL, NULL, auth.uid());
  -- La avisó una persona: no se cierra sola en la revisión automática
  UPDATE public.incidencias SET automatica = false, reportada_por = auth.uid()
   WHERE clave = 'ausencia:' || (v_res->>'grupo_id') AND estado = 'abierta';
  RETURN v_res;
END $$;

-- ── 5. Lista de espera ──────────────────────────────────────
ALTER TABLE public.lista_espera
  ADD COLUMN IF NOT EXISTS hora_hasta  text,          -- null = solo `hora`; si no, cualquier hora entre `hora` y `hora_hasta`
  ADD COLUMN IF NOT EXISTS vence_at    timestamptz,   -- después de esto la solicitud vence
  ADD COLUMN IF NOT EXISTS turno_hasta timestamptz,   -- modo por turnos: hasta cuándo es su turno
  ADD COLUMN IF NOT EXISTS hora_avisada text;         -- hora concreta que se le avisó

-- ¿La solicitud cubre esa hora?
CREATE OR REPLACE FUNCTION public.nexa_espera_cubre(e public.lista_espera, p_hora text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT left(p_hora, 5) = e.hora
      OR (e.hora_hasta IS NOT NULL AND left(p_hora, 5) BETWEEN e.hora AND e.hora_hasta)
$$;

-- Reemplaza la de la 041: rango, vencimiento, prioridad y modo por turnos
CREATE OR REPLACE FUNCTION public.nexa_avisar_lista_espera(p_fecha date, p_hora text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.lista_espera; n int := 0; v_cfg public.horario_config; v_turnos boolean;
BEGIN
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  IF NOT coalesce(v_cfg.lista_espera_activa, true) THEN RETURN 0; END IF;
  IF public.nexa_inicio_clase(p_fecha, p_hora) <= now() THEN RETURN 0; END IF;
  v_turnos := coalesce(v_cfg.lista_espera_modo, 'todos') = 'turnos';

  -- Por turnos: si alguien tiene el turno vigente para esa hora, se le respeta
  IF v_turnos AND EXISTS (
    SELECT 1 FROM public.lista_espera x
     WHERE x.fecha = p_fecha AND x.estado = 'notificada' AND x.hora_avisada = left(p_hora, 5) AND x.turno_hasta > now()
  ) THEN RETURN 0; END IF;

  FOR e IN
    SELECT * FROM public.lista_espera x
    WHERE x.fecha = p_fecha AND x.estado = 'activa' AND public.nexa_espera_cubre(x, p_hora)
      AND (x.vence_at IS NULL OR x.vence_at > now())
    ORDER BY CASE WHEN coalesce(v_cfg.lista_espera_prioridad, 'llegada') = 'mover_primero' AND x.reserva_id IS NOT NULL THEN 0 ELSE 1 END,
             x.created_at
  LOOP
    CONTINUE WHEN (public.nexa_plan_vigente(e.atleta_id, p_fecha)).id IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.coaches c WHERE c.activo AND public.nexa_cupos_slot(p_fecha, p_hora, c.id, e.modalidad) > 0);
    -- Ya tiene una clase a esa hora
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.reservas r WHERE r.alumno_id = e.atleta_id AND public.nexa_dia(r.fecha) = p_fecha
         AND left(r.hora, 5) = left(p_hora, 5) AND NOT public.nexa_estado_inactivo(r.estado));
    UPDATE public.lista_espera SET estado = 'notificada', notificada_at = now(), hora_avisada = left(p_hora, 5),
           turno_hasta = CASE WHEN v_turnos THEN now() + make_interval(mins => greatest(coalesce(v_cfg.lista_espera_minutos, 120), 5)) END
     WHERE id = e.id;
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (e.atleta_id, 'cupo_liberado',
            jsonb_build_object('fecha', p_fecha, 'hora', left(p_hora, 5), 'modalidad', e.modalidad,
                               'turno_hasta', CASE WHEN v_turnos THEN now() + make_interval(mins => greatest(coalesce(v_cfg.lista_espera_minutos, 120), 5)) END),
            'espera:' || e.id::text)
    ON CONFLICT (clave) DO NOTHING;
    n := n + 1;
    EXIT WHEN v_turnos;   -- por turnos: de a uno
  END LOOP;
  RETURN n;
END $$;

-- Cualquier cupo que se libere (también por acción del staff) avisa a la lista de espera
CREATE OR REPLACE FUNCTION public.nexa_cupo_liberado_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.hora, '') ~ '^\d{2}:\d{2}'
     AND ((public.nexa_estado_inactivo(NEW.estado) AND NOT public.nexa_estado_inactivo(OLD.estado))
          OR (OLD.coach_id IS DISTINCT FROM NEW.coach_id AND NOT public.nexa_estado_inactivo(OLD.estado))) THEN
    PERFORM public.nexa_avisar_lista_espera(public.nexa_dia(OLD.fecha), OLD.hora);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS reservas_cupo_liberado ON public.reservas;
CREATE TRIGGER reservas_cupo_liberado AFTER UPDATE OF estado, coach_id ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_cupo_liberado_trigger();

-- Avisarme por un rango de horas de un día
CREATE OR REPLACE FUNCTION public.alumno_lista_espera_rango(p_fecha date, p_desde text, p_hasta text, p_reserva_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r jsonb;
BEGIN
  IF coalesce(p_desde, '') !~ '^\d{2}:\d{2}' OR coalesce(p_hasta, '') !~ '^\d{2}:\d{2}' OR left(p_hasta, 5) < left(p_desde, 5) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'horas_invalidas');
  END IF;
  v_r := public.alumno_lista_espera(p_fecha, p_desde, p_reserva_id);
  IF (v_r->>'ok')::boolean THEN
    UPDATE public.lista_espera SET hora_hasta = CASE WHEN left(p_hasta, 5) > left(p_desde, 5) THEN left(p_hasta, 5) END
     WHERE atleta_id = public.nexa_atleta_actual() AND fecha = p_fecha AND hora = left(p_desde, 5) AND estado = 'activa';
  END IF;
  RETURN v_r;
END $$;

-- Las solicitudes vencen al empezar la última hora pedida
CREATE OR REPLACE FUNCTION public.nexa_espera_vence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.vence_at := public.nexa_inicio_clase(NEW.fecha, coalesce(NEW.hora_hasta, NEW.hora));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lista_espera_vence ON public.lista_espera;
CREATE TRIGGER lista_espera_vence BEFORE INSERT OR UPDATE OF fecha, hora, hora_hasta ON public.lista_espera
  FOR EACH ROW EXECUTE FUNCTION public.nexa_espera_vence();
UPDATE public.lista_espera SET vence_at = public.nexa_inicio_clase(fecha, coalesce(hora_hasta, hora)) WHERE vence_at IS NULL;

CREATE OR REPLACE FUNCTION public.alumno_mis_esperas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'fecha', e.fecha, 'hora', e.hora, 'hora_hasta', e.hora_hasta, 'modalidad', e.modalidad,
    'estado', e.estado, 'hora_avisada', e.hora_avisada, 'turno_hasta', e.turno_hasta) ORDER BY e.fecha, e.hora), '[]'::jsonb)
  FROM public.lista_espera e
  WHERE e.atleta_id = public.nexa_atleta_actual() AND e.estado IN ('activa', 'notificada')
    AND coalesce(e.vence_at, now() + interval '1 day') > now()
$$;

CREATE OR REPLACE FUNCTION public.alumno_cancelar_espera(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lista_espera SET estado = 'cancelada'
   WHERE id = p_id AND atleta_id = public.nexa_atleta_actual() AND estado IN ('activa', 'notificada');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Lista de espera para el staff
CREATE OR REPLACE FUNCTION public.staff_lista_espera()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nexa_es_staff() THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', e.id, 'alumno', public.nexa_nombre_atleta(e.atleta_id), 'atleta_id', e.atleta_id,
    'fecha', e.fecha, 'hora', e.hora, 'hora_hasta', e.hora_hasta, 'modalidad', e.modalidad,
    'mover_clase', e.reserva_id IS NOT NULL, 'estado', e.estado, 'creada_at', e.created_at,
    'notificada_at', e.notificada_at, 'turno_hasta', e.turno_hasta) ORDER BY e.fecha, e.hora, e.created_at)
    FROM public.lista_espera e
    WHERE e.estado IN ('activa', 'notificada') AND coalesce(e.vence_at, now() + interval '1 day') > now()), '[]'::jsonb);
END $$;

-- ── 6. Revisión de operación (cada hora, antes de la revisión general) ──
CREATE OR REPLACE FUNCTION public.nexa_revisar_operacion()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; v_venc int; v_turnos int := 0;
BEGIN
  -- a) Clases agendadas en un horario cerrado, sin resolver
  PERFORM public.nexa_registrar_afectadas();
  FOR r IN
    SELECT a.fecha AS dia, count(*) AS total, min(a.motivo) AS motivo,
           string_agg(a.hora || ' ' || coalesce(public.nexa_nombre_atleta(a.atleta_id), '?'), ', ' ORDER BY a.hora) AS detalle
    FROM public.clases_afectadas a
    WHERE a.estado = 'pendiente' AND public.nexa_inicio_clase(a.fecha, a.hora) > now()
    GROUP BY a.fecha
  LOOP
    PERFORM public.nexa_incidencia('clase_en_cierre', CASE WHEN r.dia <= public.nexa_hoy() + 2 THEN 'alta' ELSE 'media' END,
      'cierre:' || r.dia,
      'Clases en horario cerrado · ' || to_char(r.dia, 'DD-MM'),
      r.total || ' clase(s) agendada(s) durante "' || coalesce(r.motivo, 'cierre') || '": ' || r.detalle || '.',
      'Resolver en Cierres y ausencias: asignar sustituto, suspender (sin perder crédito) o mantener.');
    n := n + 1;
  END LOOP;

  -- b) Lista de espera: vencidas y siguiente turno
  UPDATE public.lista_espera SET estado = 'vencida'
   WHERE estado IN ('activa', 'notificada') AND vence_at IS NOT NULL AND vence_at <= now();
  GET DIAGNOSTICS v_venc = ROW_COUNT;
  FOR r IN
    SELECT DISTINCT fecha, hora_avisada FROM public.lista_espera
     WHERE estado = 'notificada' AND turno_hasta IS NOT NULL AND turno_hasta <= now() AND hora_avisada IS NOT NULL
  LOOP
    UPDATE public.lista_espera SET turno_hasta = NULL
     WHERE fecha = r.fecha AND hora_avisada = r.hora_avisada AND estado = 'notificada' AND turno_hasta <= now();
    v_turnos := v_turnos + public.nexa_avisar_lista_espera(r.fecha, r.hora_avisada);
  END LOOP;

  RETURN jsonb_build_object('detectadas', n, 'esperas_vencidas', v_venc, 'turnos_avisados', v_turnos);
END $$;

-- Reemplaza la de la 044: se agrega la revisión de operación (antes de la general,
-- que cierra sola las alertas que no se volvieron a detectar en la misma pasada)
CREATE OR REPLACE FUNCTION public.nexa_tareas_programadas()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec int; v_rev jsonb; v_ven jsonb; v_op jsonb;
BEGIN
  PERFORM set_config('nexa.origen', 'sistema', true);
  v_ven := public.nexa_procesar_vencimientos();
  v_rec := public.nexa_encolar_recordatorios();
  v_op  := public.nexa_revisar_operacion();
  v_rev := public.nexa_revisar_sistema();
  RETURN jsonb_build_object('recordatorios', v_rec, 'vencimientos', v_ven, 'operacion', v_op, 'revision', v_rev);
END $$;

CREATE OR REPLACE FUNCTION public.staff_revisar_ahora()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_op jsonb;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  v_op := public.nexa_revisar_operacion();
  RETURN jsonb_build_object('ok', true, 'operacion', v_op) || public.nexa_revisar_sistema();
END $$;

-- ── 7. Permisos ─────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'staff_vista_previa_cierre(date, date, text, text, uuid)',
    'staff_crear_cierre(text, date, date, text, text, uuid, text, text)',
    'staff_resolver_clase_afectada(uuid, text, uuid, text)',
    'staff_aprobar_ausencia(uuid)',
    'staff_eliminar_cierre(uuid)',
    'staff_cierres(boolean)',
    'staff_lista_espera()',
    'staff_revisar_ahora()',
    'profesor_avisar_ausencia(date, date, text, text, text)',
    'alumno_lista_espera_rango(date, text, text, int)',
    'alumno_mis_esperas()',
    'alumno_cancelar_espera(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'nexa_slot_bloqueado(date, text, uuid)',
    'nexa_clases_en_rango(date, date, text, text, uuid)',
    'nexa_sustitutos(date, text, uuid, text, int)',
    'nexa_resolver_afectada(uuid, text, uuid, text)',
    'nexa_crear_cierre(text, date, date, text, text, uuid, text, text, text)',
    'nexa_avisar_lista_espera(date, text)',
    'nexa_cupo_liberado_trigger()',
    'nexa_revisar_operacion()',
    'nexa_registrar_afectadas()',
    'nexa_tareas_programadas()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
