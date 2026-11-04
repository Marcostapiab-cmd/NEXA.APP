-- ============================================================
-- NEXA 047 — Centro de Ayuda (Fase 5: autoservicio)
-- ============================================================
-- 1. alumno_info_ayuda(): datos del alumno que el Centro de Ayuda necesita y que
--    no entregan las funciones existentes (reagendas usadas y su tope, plazos de
--    reserva, solicitudes abiertas). Solo lectura.
-- 2. alumno_solicitar_ayuda(): el alumno envía una consulta. Queda como incidencia
--    'solicitud_alumno' en "Requiere mi atención" y recibe un correo de recibido.
--    No modifica reservas ni créditos.
-- 3. alumno_mis_solicitudes(): sus consultas y la respuesta del staff.
-- 4. Al cerrar una solicitud con una nota en /atencion, el alumno recibe la
--    respuesta por correo (trigger).
-- Requiere 041 y 042. Re-ejecutable.
-- ============================================================

ALTER TABLE public.incidencias ADD COLUMN IF NOT EXISTS tema text;

CREATE INDEX IF NOT EXISTS incidencias_solicitudes_idx
  ON public.incidencias(atleta_id, detectada_at DESC) WHERE tipo = 'solicitud_alumno';

-- Temas válidos y su nombre para mostrar
CREATE OR REPLACE FUNCTION public.nexa_tema_ayuda(p_tema text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tema
    WHEN 'clases'      THEN 'Mis clases o reservas'
    WHEN 'horarios'    THEN 'Cambiar mis horarios fijos'
    WHEN 'creditos'    THEN 'Mis créditos o descuentos'
    WHEN 'excepcion'   THEN 'Excepción por cancelación fuera de plazo'
    WHEN 'pagos'       THEN 'Pagos o renovación'
    WHEN 'otro'        THEN 'Otra consulta'
  END
$$;

CREATE OR REPLACE FUNCTION public.alumno_info_ayuda()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual(); v_plan public.planes; v_cfg public.horario_config;
  v_reag int := 0; v_abiertas int := 0;
BEGIN
  IF v_atleta IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  v_plan := public.nexa_plan_vigente(v_atleta, public.nexa_hoy());
  IF v_plan.id IS NOT NULL THEN
    SELECT count(*) INTO v_reag FROM public.reagendas WHERE plan_id = v_plan.id AND estado = 'completada';
  END IF;
  SELECT count(*) INTO v_abiertas FROM public.incidencias
   WHERE atleta_id = v_atleta AND tipo = 'solicitud_alumno' AND estado = 'abierta';
  RETURN jsonb_build_object(
    'reagendas_usadas',       v_reag,
    'max_reagendas_por_plan', v_cfg.max_reagendas_por_plan,
    'reagenda_validez_dias',  v_cfg.reagenda_validez_dias,
    'antelacion_min_reserva', coalesce(v_cfg.antelacion_min_reserva, 60),
    'solicitudes_abiertas',   v_abiertas);
END $$;

CREATE OR REPLACE FUNCTION public.alumno_solicitar_ayuda(p_tema text, p_mensaje text, p_reserva_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual(); v_nombre text; v_tema text; v_msg text;
  v_res public.reservas; v_id uuid; v_abiertas int;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  v_tema := public.nexa_tema_ayuda(p_tema);
  IF v_tema IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tema_invalido'); END IF;
  v_msg := trim(coalesce(p_mensaje, ''));
  IF length(v_msg) < 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'mensaje_corto'); END IF;
  IF length(v_msg) > 1000 THEN RETURN jsonb_build_object('ok', false, 'error', 'mensaje_largo'); END IF;

  -- Evita que un alumno llene la bandeja: máximo 3 solicitudes abiertas a la vez
  SELECT count(*) INTO v_abiertas FROM public.incidencias
   WHERE atleta_id = v_atleta AND tipo = 'solicitud_alumno' AND estado = 'abierta';
  IF v_abiertas >= 3 THEN RETURN jsonb_build_object('ok', false, 'error', 'demasiadas'); END IF;

  -- La clase indicada solo se enlaza si es del propio alumno
  IF p_reserva_id IS NOT NULL THEN
    SELECT * INTO v_res FROM public.reservas WHERE id = p_reserva_id AND alumno_id = v_atleta;
  END IF;

  SELECT trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')) INTO v_nombre FROM public.atletas WHERE id = v_atleta;

  INSERT INTO public.incidencias (tipo, prioridad, clave, titulo, descripcion, accion_sugerida, atleta_id, reserva_id,
                                  plan_id, coach_id, automatica, reportada_por, tema)
  VALUES ('solicitud_alumno', CASE WHEN p_tema = 'excepcion' THEN 'alta' ELSE 'media' END,
          'solicitud:' || gen_random_uuid(),
          left('Consulta de ' || coalesce(nullif(v_nombre, ''), 'alumno') || ': ' || v_tema, 140),
          v_msg,
          'Responde escribiendo la respuesta y presiona "Responder y cerrar": al alumno le llega por correo y la ve en MI NEXA.',
          v_atleta, v_res.id, v_res.plan_id::text, v_res.coach_id, false, auth.uid(), p_tema)
  RETURNING id INTO v_id;

  INSERT INTO public.incidencias_historial (incidencia_id, accion, usuario_id, nota)
  VALUES (v_id, 'reportada', auth.uid(), v_msg);

  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (v_atleta, 'solicitud_recibida', jsonb_build_object('tema', v_tema, 'mensaje', v_msg), 'solicitud_recibida:' || v_id)
  ON CONFLICT (clave) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.alumno_mis_solicitudes()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'tema', public.nexa_tema_ayuda(i.tema), 'mensaje', i.descripcion,
           'estado', i.estado, 'respuesta', i.resolucion,
           'creada_at', i.detectada_at, 'respondida_at', i.resuelta_at)
         ORDER BY i.detectada_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.incidencias
           WHERE atleta_id = public.nexa_atleta_actual() AND tipo = 'solicitud_alumno'
           ORDER BY detectada_at DESC LIMIT 20) i
$$;

-- Al cerrar una solicitud con respuesta, se le avisa al alumno
CREATE OR REPLACE FUNCTION public.nexa_aviso_solicitud()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'solicitud_alumno' AND OLD.estado = 'abierta' AND NEW.estado <> 'abierta'
     AND NEW.atleta_id IS NOT NULL AND coalesce(trim(NEW.resolucion), '') <> '' THEN
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (NEW.atleta_id, 'solicitud_respondida',
            jsonb_build_object('tema', public.nexa_tema_ayuda(NEW.tema), 'mensaje', NEW.descripcion, 'respuesta', NEW.resolucion),
            'solicitud_respondida:' || NEW.id)
    ON CONFLICT (clave) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS incidencias_aviso_solicitud ON public.incidencias;
CREATE TRIGGER incidencias_aviso_solicitud AFTER UPDATE OF estado ON public.incidencias
  FOR EACH ROW EXECUTE FUNCTION public.nexa_aviso_solicitud();

-- ── Permisos ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.alumno_info_ayuda() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alumno_solicitar_ayuda(text, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alumno_mis_solicitudes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nexa_aviso_solicitud() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alumno_info_ayuda() TO authenticated;
GRANT EXECUTE ON FUNCTION public.alumno_solicitar_ayuda(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alumno_mis_solicitudes() TO authenticated;
