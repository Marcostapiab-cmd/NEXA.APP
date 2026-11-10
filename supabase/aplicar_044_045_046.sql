-- ════════════════════════════════════════════════════════════════════
-- NEXA — Aplicar 044 + 045 + 046 (renovaciones, reglamento, evaluación
-- inicial con Clase de Prueba, comprobantes y fix de reagendas)
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Una sola transacción: si algo falla, no se aplica nada.
-- Re-ejecutable.
-- ════════════════════════════════════════════════════════════════════

BEGIN;


-- ┌── 044_renovaciones_reglamento.sql

-- ============================================================
-- NEXA 044 — Renovaciones, retención de horarios, vencimientos y reglamento
-- ============================================================
-- Reglas confirmadas por NEXA:
--   · El nuevo período empieza el día siguiente al vencimiento (si se renueva
--     tarde, desde hoy: nunca se cobran días ya pasados).
--   · Las clases no usadas vencen con el plan. Si el alumno renueva, las
--     clases sobrantes pasan al período siguiente.
--   · Si no renueva, sus horarios fijos se le guardan una semana
--     (configurable). Después se liberan y se le avisa.
--   · El pago por transferencia NO activa nada: queda en revisión hasta que
--     el staff lo valida.
--
--  1. Configuración (avisos, retención, datos de transferencia, evaluación).
--  2. Precio y horarios fijos de un plan.
--  3. Solicitudes de renovación (alumno) y validación (staff).
--  4. Retención de horarios (afecta los cupos que ven otros alumnos).
--  5. Vencimientos: avisos, traspaso de clases o vencimiento, liberación.
--  6. Reglamento versionado y aceptaciones.
--
-- Re-ejecutable. Aplicar después de la 043.
-- ============================================================

-- ── 1. Configuración ────────────────────────────────────────
ALTER TABLE public.horario_config
  ADD COLUMN IF NOT EXISTS aviso_vencimiento_dias  int[]   NOT NULL DEFAULT '{14,7,3,1,0}',
  ADD COLUMN IF NOT EXISTS retencion_horarios_dias int     NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS datos_transferencia     jsonb,  -- {banco, tipo_cuenta, numero, titular, rut, email}
  ADD COLUMN IF NOT EXISTS requiere_evaluacion     boolean NOT NULL DEFAULT true;

ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS frecuencia_semanal int,
  ADD COLUMN IF NOT EXISTS cierre_at          timestamptz;   -- cuándo se procesó el fin del plan

-- Datos de transferencia: solo el staff puede cambiarlos; el alumno los lee con alumno_opciones_renovacion()
CREATE OR REPLACE FUNCTION public.staff_guardar_datos_transferencia(p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host') THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  UPDATE public.horario_config SET datos_transferencia = p_datos WHERE id = 1;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 2. Precio y horarios fijos ──────────────────────────────
CREATE OR REPLACE FUNCTION public.nexa_meses(p_tipo text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tipo WHEN 'mensual' THEN 1 WHEN 'trimestral' THEN 3 WHEN 'semestral' THEN 6 END
$$;

-- Igual que la migración 033 / src/lib/catalogo.ts: (precio mes − descuento del período) × meses
CREATE OR REPLACE FUNCTION public.nexa_precio_plan(p_modalidad text, p_frecuencia int, p_tipo text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (p.precio_mes_clp - coalesce((SELECT valor FROM public.precios_entrenamiento_config
                                       WHERE clave = 'descuento_' || p_tipo || '_mes'), 0)) * public.nexa_meses(p_tipo)
  FROM public.precios_entrenamiento p
  WHERE p.modalidad = p_modalidad AND p.frecuencia_semanal = p_frecuencia
$$;

-- Horarios fijos del plan: día/hora/profesor que se repiten al menos 2 veces en sus últimas 5 semanas.
-- Si un día cambió de hora, gana la más reciente.
CREATE OR REPLACE FUNCTION public.nexa_patron_plan(p_plan_id text)
RETURNS TABLE (dow int, hora text, coach_id uuid, tipo_clase text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT * FROM public.planes WHERE id = p_plan_id),
  base AS (
    SELECT extract(dow FROM public.nexa_dia(r.fecha))::int AS dow, left(r.hora, 5) AS hora, r.coach_id,
           max(r.tipo_clase) AS tipo_clase, count(*) AS n, max(public.nexa_dia(r.fecha)) AS ultima
    FROM public.reservas r, p
    WHERE r.plan_id::text = p.id AND r.estado <> 'reagendada' AND r.coach_id IS NOT NULL
      AND coalesce(r.hora, '') ~ '^\d{2}:\d{2}'
      AND public.nexa_dia(r.fecha) >= public.nexa_fin_plan(p) - 35
    GROUP BY 1, 2, 3 HAVING count(*) >= 2
  )
  SELECT DISTINCT ON (b.dow) b.dow, b.hora, b.coach_id, b.tipo_clase
  FROM base b ORDER BY b.dow, b.ultima DESC, b.n DESC
$$;

-- Plan "actual" del alumno para renovar: el más reciente que sigue vigente o está en su semana de retención
CREATE OR REPLACE FUNCTION public.nexa_plan_para_renovar(p_atleta uuid)
RETURNS public.planes LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.planes p
  WHERE p.alumno_id = p_atleta::text
    AND public.nexa_fin_plan(p) >= public.nexa_hoy()
        - coalesce((SELECT retencion_horarios_dias FROM public.horario_config WHERE id = 1), 7)
    AND NOT EXISTS (SELECT 1 FROM public.planes s WHERE s.plan_anterior_id = p.id AND coalesce(s.estado_pago, 'pagado') <> 'anulado')
  ORDER BY nullif(p.start_date, '')::date DESC NULLS LAST
  LIMIT 1
$$;

-- El staff que crea a mano el plan siguiente también cuenta como renovación (para traspasar clases)
CREATE OR REPLACE FUNCTION public.nexa_planes_enlazar_anterior()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ret int;
BEGIN
  IF NEW.plan_anterior_id IS NOT NULL OR nullif(NEW.start_date, '') IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(retencion_horarios_dias, 7) INTO v_ret FROM public.horario_config WHERE id = 1;
  SELECT p.id INTO NEW.plan_anterior_id FROM public.planes p
  WHERE p.alumno_id = NEW.alumno_id AND p.id <> NEW.id
    AND nullif(p.start_date, '')::date < NEW.start_date::date
    AND public.nexa_fin_plan(p) >= NEW.start_date::date - (coalesce(v_ret, 7) + 1)
    AND NOT EXISTS (SELECT 1 FROM public.planes s WHERE s.plan_anterior_id = p.id)
  ORDER BY nullif(p.start_date, '')::date DESC LIMIT 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS planes_enlazar_anterior ON public.planes;
CREATE TRIGGER planes_enlazar_anterior BEFORE INSERT ON public.planes
  FOR EACH ROW EXECUTE FUNCTION public.nexa_planes_enlazar_anterior();

-- ── 3. Renovaciones ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.renovaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id        uuid NOT NULL,
  plan_actual_id   text NOT NULL,
  plan_nuevo_id    text,
  tipo             text NOT NULL CHECK (tipo IN ('mensual', 'trimestral', 'semestral')),
  modalidad        text NOT NULL CHECK (modalidad IN ('1:1', '2:1')),
  frecuencia       int  NOT NULL CHECK (frecuencia BETWEEN 1 AND 5),
  clases           int  NOT NULL,
  precio_clp       int  NOT NULL CHECK (precio_clp > 0),
  inicio_previsto  date NOT NULL,
  metodo           text NOT NULL DEFAULT 'transferencia' CHECK (metodo IN ('transferencia', 'flow', 'presencial')),
  estado           text NOT NULL DEFAULT 'pendiente_pago'
                   CHECK (estado IN ('pendiente_pago', 'en_revision', 'aprobada', 'rechazada', 'cancelada')),
  comprobante_path text,
  comprobante_at   timestamptz,
  reglamento_version int,
  revisada_por     uuid,
  revisada_at      timestamptz,
  motivo_rechazo   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- Una sola solicitud abierta por plan (evita pagos y activaciones duplicadas)
CREATE UNIQUE INDEX IF NOT EXISTS renovaciones_abierta_unica ON public.renovaciones(plan_actual_id)
  WHERE estado IN ('pendiente_pago', 'en_revision');
CREATE UNIQUE INDEX IF NOT EXISTS renovaciones_aprobada_unica ON public.renovaciones(plan_actual_id) WHERE estado = 'aprobada';
CREATE INDEX IF NOT EXISTS renovaciones_estado_idx ON public.renovaciones(estado, created_at DESC);
ALTER TABLE public.renovaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS renovaciones_staff_read ON public.renovaciones;
CREATE POLICY renovaciones_staff_read ON public.renovaciones
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host', 'recepcionista'));
DROP POLICY IF EXISTS renovaciones_self_read ON public.renovaciones;
CREATE POLICY renovaciones_self_read ON public.renovaciones
  FOR SELECT TO authenticated USING (atleta_id = public.nexa_atleta_actual());
-- Sin políticas de escritura: todo pasa por las funciones.

-- Opciones de renovación del alumno (todo calculado aquí)
CREATE OR REPLACE FUNCTION public.alumno_opciones_renovacion()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual(); v_plan public.planes; v_cfg public.horario_config;
  v_mod text; v_freq int; v_inicio date; v_fin date; v_opc jsonb := '[]'::jsonb; t text; v_precio int;
  v_patron jsonb; v_sol jsonb; v_ult jsonb; v_regl int;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('puede', false, 'motivo', 'no_autorizado'); END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  v_plan := public.nexa_plan_para_renovar(v_atleta);
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('puede', false, 'motivo', 'sin_plan'); END IF;

  SELECT coalesce(v_plan.modalidad, a.tipo_sesion, '1:1') INTO v_mod FROM public.atletas a WHERE a.id = v_atleta;
  IF v_mod NOT IN ('1:1', '2:1') THEN v_mod := '1:1'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('dow', x.dow, 'hora', x.hora, 'profesor', c.nombre) ORDER BY x.dow), '[]'::jsonb)
    INTO v_patron
    FROM public.nexa_patron_plan(v_plan.id) x LEFT JOIN public.coaches c ON c.id = x.coach_id;
  v_freq := coalesce(v_plan.frecuencia_semanal, nullif(jsonb_array_length(v_patron), 0),
                     round(coalesce(v_plan.total_clases, 4)::numeric / (4 * coalesce(public.nexa_meses(v_plan.tipo), 1)))::int, 1);
  v_freq := least(5, greatest(1, v_freq));
  v_fin := public.nexa_fin_plan(v_plan);
  v_inicio := greatest(v_fin + 1, public.nexa_hoy());

  FOREACH t IN ARRAY ARRAY['mensual', 'trimestral', 'semestral'] LOOP
    v_precio := public.nexa_precio_plan(v_mod, v_freq, t);
    CONTINUE WHEN v_precio IS NULL;
    v_opc := v_opc || jsonb_build_object('tipo', t, 'precio', v_precio, 'clases', v_freq * 4 * public.nexa_meses(t),
      'inicio', v_inicio, 'fin', v_inicio + 30 * public.nexa_meses(t),
      'actual', t = v_plan.tipo);
  END LOOP;

  SELECT to_jsonb(r) - 'revisada_por' INTO v_sol FROM public.renovaciones r
   WHERE r.plan_actual_id = v_plan.id AND r.estado IN ('pendiente_pago', 'en_revision') LIMIT 1;
  SELECT jsonb_build_object('estado', r.estado, 'motivo_rechazo', r.motivo_rechazo, 'revisada_at', r.revisada_at) INTO v_ult
    FROM public.renovaciones r WHERE r.plan_actual_id = v_plan.id AND r.estado IN ('rechazada', 'aprobada')
    ORDER BY r.created_at DESC LIMIT 1;
  SELECT max(version) INTO v_regl FROM public.reglamentos WHERE estado = 'publicado';

  RETURN jsonb_build_object(
    'puede', true,
    'plan', public.nexa_resumen_plan(v_plan.id),
    'modalidad', v_mod, 'frecuencia', v_freq, 'horarios_fijos', v_patron,
    'vencido', v_fin < public.nexa_hoy(),
    'retencion_hasta', v_fin + coalesce(v_cfg.retencion_horarios_dias, 7),
    'opciones', v_opc,
    'solicitud', v_sol, 'ultima_revision', v_ult,
    'transferencia', v_cfg.datos_transferencia,
    'reglamento_version', v_regl,
    'reglamento_aceptado', v_regl IS NULL OR EXISTS (
      SELECT 1 FROM public.reglamento_aceptaciones x WHERE x.atleta_id = v_atleta AND x.version = v_regl));
END $$;

CREATE OR REPLACE FUNCTION public.alumno_solicitar_renovacion(p_tipo text, p_frecuencia int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual(); v_plan public.planes; v_op jsonb; v_freq int; v_mod text;
  v_precio int; v_regl int; v_id uuid;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  IF p_tipo NOT IN ('mensual', 'trimestral', 'semestral') THEN RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido'); END IF;
  v_op := public.alumno_opciones_renovacion();
  IF NOT coalesce((v_op->>'puede')::boolean, false) THEN RETURN jsonb_build_object('ok', false, 'error', v_op->>'motivo'); END IF;
  IF NOT (v_op->>'reglamento_aceptado')::boolean THEN RETURN jsonb_build_object('ok', false, 'error', 'reglamento_pendiente'); END IF;
  v_plan := public.nexa_plan_para_renovar(v_atleta);

  PERFORM pg_advisory_xact_lock(hashtext('nexa_renovar:' || v_plan.id)::bigint);
  IF EXISTS (SELECT 1 FROM public.renovaciones WHERE plan_actual_id = v_plan.id AND estado IN ('pendiente_pago', 'en_revision')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ya_solicitada');
  END IF;

  v_mod  := v_op->>'modalidad';
  v_freq := least(5, greatest(1, coalesce(p_frecuencia, (v_op->>'frecuencia')::int)));
  v_precio := public.nexa_precio_plan(v_mod, v_freq, p_tipo);
  IF v_precio IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_precio'); END IF;
  v_regl := (v_op->>'reglamento_version')::int;

  INSERT INTO public.renovaciones (atleta_id, plan_actual_id, tipo, modalidad, frecuencia, clases, precio_clp, inicio_previsto, reglamento_version)
  VALUES (v_atleta, v_plan.id, p_tipo, v_mod, v_freq, v_freq * 4 * public.nexa_meses(p_tipo), v_precio,
          greatest(public.nexa_fin_plan(v_plan) + 1, public.nexa_hoy()), v_regl)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'precio', v_precio);
END $$;

-- El alumno avisa que transfirió y adjunta el comprobante (subido antes a Storage en su carpeta)
CREATE OR REPLACE FUNCTION public.alumno_registrar_comprobante(p_id uuid, p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atleta uuid := public.nexa_atleta_actual(); r public.renovaciones;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  SELECT * INTO r FROM public.renovaciones WHERE id = p_id AND atleta_id = v_atleta FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF r.estado NOT IN ('pendiente_pago', 'en_revision') THEN RETURN jsonb_build_object('ok', false, 'error', 'no_editable'); END IF;
  IF coalesce(p_path, '') NOT LIKE v_atleta::text || '/%' OR p_path LIKE '%..%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'archivo_invalido');
  END IF;
  UPDATE public.renovaciones SET estado = 'en_revision', comprobante_path = p_path, comprobante_at = now() WHERE id = r.id;

  PERFORM public.nexa_incidencia('transferencia_pendiente', 'alta', 'transferencia:' || r.id,
    'Transferencia por validar · ' || coalesce(public.nexa_nombre_atleta(v_atleta), 'alumno'),
    'Renovación ' || r.tipo || ' ' || r.modalidad || ' · ' || r.frecuencia || 'x/semana · $' || r.precio_clp || '. Comprobante adjunto.',
    'Revisar el comprobante en Renovaciones y aprobar o rechazar.', v_atleta, NULL, r.plan_actual_id);
  UPDATE public.incidencias SET automatica = false WHERE clave = 'transferencia:' || r.id AND estado = 'abierta';
  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (v_atleta, 'renovacion_recibida', jsonb_build_object('tipo', r.tipo, 'precio', r.precio_clp), 'renov_recibida:' || r.id)
  ON CONFLICT (clave) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.alumno_cancelar_renovacion(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atleta uuid := public.nexa_atleta_actual();
BEGIN
  UPDATE public.renovaciones SET estado = 'cancelada'
   WHERE id = p_id AND atleta_id = v_atleta AND estado = 'pendiente_pago';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_cancelable'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Crea las clases del nuevo período copiando los horarios fijos. Devuelve las que no se pudieron agendar.
CREATE OR REPLACE FUNCTION public.nexa_agendar_periodo(p_plan_nuevo text, p_plan_origen text, p_frecuencia int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.planes; x record; d date; v_creadas int := 0; v_fallidas jsonb := '[]'::jsonb; v_dur int;
BEGIN
  SELECT * INTO v_p FROM public.planes WHERE id = p_plan_nuevo;
  SELECT coalesce(duracion_bloque, 60) INTO v_dur FROM public.horario_config WHERE id = 1;
  FOR x IN
    SELECT g::date AS d, pt.* FROM generate_series(v_p.start_date::date, v_p.end_date::date, interval '1 day') g
    JOIN (SELECT * FROM public.nexa_patron_plan(p_plan_origen) ORDER BY dow LIMIT greatest(p_frecuencia, 0)) pt
      ON pt.dow = extract(dow FROM g)::int
    ORDER BY 1, pt.hora
  LOOP
    EXIT WHEN v_creadas >= v_p.total_clases;
    d := x.d;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.horario_bloqueos b WHERE b.fecha = d
                          AND (b.coach_id IS NULL OR b.coach_id = x.coach_id)
                          AND (b.hora_inicio IS NULL OR (x.hora >= left(b.hora_inicio, 5) AND x.hora < left(coalesce(b.hora_fin, '23:59'), 5))));
    BEGIN
      INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id, duracion_min)
      VALUES (public.nexa_uuid(v_p.alumno_id), v_p.id::uuid, d::timestamp AT TIME ZONE 'UTC', x.hora, 'pendiente',
              x.tipo_clase, x.coach_id, v_dur);
      v_creadas := v_creadas + 1;
    EXCEPTION WHEN OTHERS THEN
      v_fallidas := v_fallidas || jsonb_build_object('fecha', d, 'hora', x.hora, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('creadas', v_creadas, 'fallidas', v_fallidas);
END $$;

-- Validación del staff: activa la renovación (idempotente)
CREATE OR REPLACE FUNCTION public.staff_aprobar_renovacion(p_id uuid, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.renovaciones; v_prev public.planes; v_inicio date; v_fin date; v_plan text; v_ag jsonb; v_nombre text;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  SELECT * INTO r FROM public.renovaciones WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF r.estado = 'aprobada' THEN RETURN jsonb_build_object('ok', true, 'plan_id', r.plan_nuevo_id, 'ya_aprobada', true); END IF;
  IF r.estado NOT IN ('pendiente_pago', 'en_revision') THEN RETURN jsonb_build_object('ok', false, 'error', 'no_aprobable'); END IF;

  SELECT * INTO v_prev FROM public.planes WHERE id = r.plan_actual_id;
  v_inicio := greatest(public.nexa_fin_plan(v_prev) + 1, public.nexa_hoy());
  v_fin    := v_inicio + 30 * public.nexa_meses(r.tipo);
  v_plan   := gen_random_uuid()::text;
  v_nombre := CASE r.modalidad WHEN '2:1' THEN 'Semipersonalizado 2:1' ELSE 'Personalizado 1:1' END
              || ' · ' || r.frecuencia || 'x/semana · ' || initcap(r.tipo);

  PERFORM set_config('nexa.origen', 'staff', true);
  PERFORM set_config('nexa.motivo', 'Renovación validada' || coalesce(': ' || nullif(trim(p_nota), ''), ''), true);
  INSERT INTO public.planes (id, alumno_id, nombre, tipo, modalidad, total_clases, start_date, end_date,
                             precio_clp, estado_pago, frecuencia_semanal, plan_anterior_id)
  VALUES (v_plan, r.atleta_id::text, v_nombre, r.tipo, r.modalidad, r.clases, v_inicio::text, v_fin::text,
          r.precio_clp, 'pagado', r.frecuencia, v_prev.id);

  INSERT INTO public.pagos (alumno_id, plan_id, monto, estado, metodo, descripcion, fecha_pago)
  VALUES (r.atleta_id, v_plan, r.precio_clp, 'pagado',
          CASE r.metodo WHEN 'flow' THEN 'transferencia' WHEN 'presencial' THEN 'efectivo' ELSE 'transferencia' END,
          'Renovación ' || r.tipo || ' (' || to_char(v_inicio, 'DD-MM-YYYY') || ' al ' || to_char(v_fin, 'DD-MM-YYYY') || ')', now());

  v_ag := public.nexa_agendar_periodo(v_plan, v_prev.id, r.frecuencia);
  UPDATE public.renovaciones SET estado = 'aprobada', plan_nuevo_id = v_plan, revisada_por = auth.uid(), revisada_at = now()
   WHERE id = r.id;
  UPDATE public.retenciones_horario SET estado = 'renovada' WHERE plan_id = v_prev.id AND estado = 'activa';

  UPDATE public.incidencias SET estado = 'resuelta', resuelta_at = now(), resuelta_por = auth.uid(), resolucion = 'Renovación aprobada'
   WHERE clave = 'transferencia:' || r.id AND estado = 'abierta';
  IF jsonb_array_length(v_ag->'fallidas') > 0 THEN
    PERFORM public.nexa_incidencia('renovacion_horarios', 'media', 'renov_horarios:' || r.id,
      'Horarios no agendados al renovar · ' || coalesce(public.nexa_nombre_atleta(r.atleta_id), 'alumno'),
      jsonb_array_length(v_ag->'fallidas') || ' clase(s) del horario fijo no se pudieron agendar (cupo ocupado o bloqueo). El alumno puede reservarlas con sus créditos.',
      'Revisar el horario del alumno.', r.atleta_id, NULL, v_plan);
  END IF;
  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (r.atleta_id, 'renovacion_aprobada',
          jsonb_build_object('plan', public.nexa_resumen_plan(v_plan), 'creadas', v_ag->'creadas',
                             'proxima', public.nexa_proxima_clase(r.atleta_id)),
          'renov_aprobada:' || r.id)
  ON CONFLICT (clave) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'plan_id', v_plan, 'agenda', v_ag);
END $$;

CREATE OR REPLACE FUNCTION public.staff_rechazar_renovacion(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.renovaciones;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'motivo_requerido'); END IF;
  SELECT * INTO r FROM public.renovaciones WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL OR r.estado NOT IN ('pendiente_pago', 'en_revision') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_rechazable');
  END IF;
  UPDATE public.renovaciones SET estado = 'rechazada', motivo_rechazo = trim(p_motivo), revisada_por = auth.uid(), revisada_at = now()
   WHERE id = r.id;
  UPDATE public.incidencias SET estado = 'resuelta', resuelta_at = now(), resuelta_por = auth.uid(), resolucion = 'Rechazada: ' || trim(p_motivo)
   WHERE clave = 'transferencia:' || r.id AND estado = 'abierta';
  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (r.atleta_id, 'renovacion_rechazada', jsonb_build_object('motivo', trim(p_motivo), 'precio', r.precio_clp), 'renov_rechazada:' || r.id)
  ON CONFLICT (clave) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 4. Retención de horarios ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retenciones_horario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id     uuid NOT NULL,
  plan_id       text NOT NULL,
  dow           int  NOT NULL,
  hora          text NOT NULL,
  coach_id      uuid NOT NULL,
  modalidad     text NOT NULL,
  aplica_desde  date NOT NULL,     -- protege las fechas desde aquí (día siguiente al vencimiento)
  hasta         date NOT NULL,     -- la protección dura hasta este día inclusive
  estado        text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'renovada', 'liberada')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS retenciones_unica ON public.retenciones_horario(plan_id, dow, hora, coach_id);
CREATE INDEX IF NOT EXISTS retenciones_activas_idx ON public.retenciones_horario(dow, hora, coach_id) WHERE estado = 'activa';
ALTER TABLE public.retenciones_horario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retenciones_staff_read ON public.retenciones_horario;
CREATE POLICY retenciones_staff_read ON public.retenciones_horario
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host', 'recepcionista', 'profesor'));

-- Cupos libres (misma regla que la 041) + horarios guardados a otros alumnos que están por renovar
CREATE OR REPLACE FUNCTION public.nexa_cupos_slot(
  p_fecha date, p_hora text, p_coach uuid, p_modalidad text, p_excluir int DEFAULT NULL
) RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cnt int; v_1a1 boolean; v_coaches int; v_max int; v_ret int; v_ret1 boolean;
BEGIN
  IF NOT public.nexa_hora_valida(p_fecha, p_hora) THEN RETURN 0; END IF;

  IF EXISTS (
    SELECT 1 FROM public.horario_bloqueos b
    WHERE b.fecha = p_fecha
      AND (b.coach_id IS NULL OR b.coach_id = p_coach)
      AND (b.hora_inicio IS NULL OR (left(p_hora, 5) >= left(b.hora_inicio, 5) AND left(p_hora, 5) < left(coalesce(b.hora_fin, '23:59'), 5)))
  ) THEN RETURN 0; END IF;

  SELECT count(*), coalesce(bool_or(public.nexa_modalidad(r.tipo_clase) = '1:1'), false)
    INTO v_cnt, v_1a1
  FROM public.reservas r
  WHERE public.nexa_dia(r.fecha) = p_fecha AND left(r.hora, 5) = left(p_hora, 5)
    AND r.coach_id = p_coach
    AND public.nexa_modalidad(r.tipo_clase) <> 'grupal'
    AND NOT public.nexa_estado_inactivo(r.estado)
    AND r.id IS DISTINCT FROM p_excluir;

  -- Horarios fijos guardados a quien está por renovar (no aplican al propio alumno)
  SELECT count(*), coalesce(bool_or(t.modalidad = '1:1'), false) INTO v_ret, v_ret1
  FROM public.retenciones_horario t
  WHERE t.estado = 'activa' AND t.coach_id = p_coach AND t.dow = extract(dow FROM p_fecha)::int
    AND t.hora = left(p_hora, 5) AND p_fecha >= t.aplica_desde AND public.nexa_hoy() <= t.hasta
    AND t.atleta_id IS DISTINCT FROM public.nexa_atleta_actual()
    AND NOT EXISTS (SELECT 1 FROM public.reservas r WHERE r.alumno_id = t.atleta_id
                    AND public.nexa_dia(r.fecha) = p_fecha AND left(r.hora, 5) = t.hora
                    AND NOT public.nexa_estado_inactivo(r.estado));
  v_cnt := v_cnt + v_ret;
  v_1a1 := v_1a1 OR v_ret1;

  IF v_cnt = 0 THEN
    SELECT coalesce(max_profesores, 3) INTO v_max FROM public.horario_config WHERE id = 1;
    SELECT count(DISTINCT r.coach_id) INTO v_coaches
    FROM public.reservas r
    WHERE public.nexa_dia(r.fecha) = p_fecha AND left(r.hora, 5) = left(p_hora, 5)
      AND public.nexa_modalidad(r.tipo_clase) <> 'grupal'
      AND NOT public.nexa_estado_inactivo(r.estado)
      AND r.id IS DISTINCT FROM p_excluir;
    IF v_coaches >= coalesce(v_max, 3) THEN RETURN 0; END IF;
  END IF;

  IF p_modalidad = '1:1' THEN
    RETURN CASE WHEN v_cnt = 0 THEN 1 ELSE 0 END;
  END IF;
  IF v_1a1 THEN RETURN 0; END IF;
  RETURN greatest(0, 2 - v_cnt);
END $$;

-- ── 5. Vencimientos ─────────────────────────────────────────
-- Sucesor pagado de un plan (renovación o plan siguiente creado por el staff)
CREATE OR REPLACE FUNCTION public.nexa_plan_sucesor(p_plan_id text)
RETURNS public.planes LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.* FROM public.planes s
  WHERE s.plan_anterior_id = p_plan_id AND coalesce(s.estado_pago, 'pagado') = 'pagado'
  ORDER BY s.created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.nexa_procesar_vencimientos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.horario_config; v_hoy date := public.nexa_hoy(); p public.planes; v_fin date; v_suc public.planes;
  v_sobr int; v_ret int; v_avisos int := 0; v_arr int := 0; v_venc int := 0; v_d int; x record;
BEGIN
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  v_ret := coalesce(v_cfg.retencion_horarios_dias, 7);
  PERFORM set_config('nexa.origen', 'sistema', true);

  -- a) Avisos antes del vencimiento (14/7/3/1/0 días) a quien aún no renueva
  FOR p IN
    SELECT pl.* FROM public.planes pl
    WHERE pl.cierre_at IS NULL AND public.nexa_fin_plan(pl) BETWEEN v_hoy AND v_hoy + 60
      AND public.nexa_uuid(pl.alumno_id) IS NOT NULL
      AND (public.nexa_plan_sucesor(pl.id)).id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.renovaciones r WHERE r.plan_actual_id = pl.id AND r.estado = 'en_revision')
  LOOP
    v_d := public.nexa_fin_plan(p) - v_hoy;
    CONTINUE WHEN NOT (v_d = ANY (coalesce(v_cfg.aviso_vencimiento_dias, '{14,7,3,1,0}')));
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (public.nexa_uuid(p.alumno_id), 'renovacion_recordatorio',
            jsonb_build_object('dias', v_d, 'plan', public.nexa_resumen_plan(p.id),
                               'precio', public.nexa_precio_plan(coalesce(p.modalidad, '1:1'),
                                  least(5, greatest(1, coalesce(p.frecuencia_semanal,
                                    (SELECT count(*) FROM public.nexa_patron_plan(p.id))::int, 1))), p.tipo),
                               'retencion_hasta', public.nexa_fin_plan(p) + v_ret),
            'renovar:' || p.id || ':' || v_d)
    ON CONFLICT (clave) DO NOTHING;
    IF FOUND THEN v_avisos := v_avisos + 1; END IF;
  END LOOP;

  -- b) Guardar los horarios fijos de quien vence en los próximos 14 días y aún no renueva
  FOR p IN
    SELECT pl.* FROM public.planes pl
    WHERE pl.cierre_at IS NULL AND public.nexa_fin_plan(pl) BETWEEN v_hoy - v_ret AND v_hoy + 14
      AND public.nexa_uuid(pl.alumno_id) IS NOT NULL AND (public.nexa_plan_sucesor(pl.id)).id IS NULL
  LOOP
    v_fin := public.nexa_fin_plan(p);
    INSERT INTO public.retenciones_horario (atleta_id, plan_id, dow, hora, coach_id, modalidad, aplica_desde, hasta)
    SELECT public.nexa_uuid(p.alumno_id), p.id, x2.dow, x2.hora, x2.coach_id, public.nexa_modalidad(x2.tipo_clase), v_fin + 1, v_fin + v_ret
    FROM public.nexa_patron_plan(p.id) x2
    ON CONFLICT (plan_id, dow, hora, coach_id) DO UPDATE SET hasta = EXCLUDED.hasta, aplica_desde = EXCLUDED.aplica_desde
      WHERE public.retenciones_horario.estado = 'activa';
  END LOOP;

  -- c) Planes terminados: traspaso de clases (si renovó) o vencimiento (si pasó la semana de retención)
  FOR p IN
    SELECT pl.* FROM public.planes pl
    WHERE pl.cierre_at IS NULL AND public.nexa_fin_plan(pl) < v_hoy
  LOOP
    v_fin  := public.nexa_fin_plan(p);
    v_suc  := public.nexa_plan_sucesor(p.id);
    v_sobr := greatest(0, coalesce(p.total_clases, 0) - public.nexa_clases_comprometidas(p.id));

    IF v_suc.id IS NOT NULL THEN
      IF v_sobr > 0 THEN
        PERFORM set_config('nexa.motivo', 'Clases traspasadas desde el plan anterior', true);
        UPDATE public.planes SET total_clases = total_clases + v_sobr, clases_arrastradas = clases_arrastradas + v_sobr
         WHERE id = v_suc.id;
        INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, motivo, detalle) VALUES
          (p.id, public.nexa_uuid(p.alumno_id), 'arrastrado', -v_sobr, 'sistema', 'Pasan al período siguiente', jsonb_build_object('hacia', v_suc.id)),
          (v_suc.id, public.nexa_uuid(p.alumno_id), 'arrastrado', v_sobr, 'sistema', 'Vienen del período anterior', jsonb_build_object('desde', p.id));
        INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
        VALUES (public.nexa_uuid(p.alumno_id), 'clases_arrastradas', jsonb_build_object('cantidad', v_sobr, 'plan', public.nexa_resumen_plan(v_suc.id)),
                'arrastre:' || p.id)
        ON CONFLICT (clave) DO NOTHING;
        v_arr := v_arr + 1;
      END IF;
      UPDATE public.retenciones_horario SET estado = 'renovada' WHERE plan_id = p.id AND estado = 'activa';
      UPDATE public.planes SET cierre_at = now() WHERE id = p.id;

    ELSIF v_hoy > v_fin + v_ret THEN
      IF v_sobr > 0 THEN
        INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, motivo)
        VALUES (p.id, public.nexa_uuid(p.alumno_id), 'vencido', v_sobr, 'sistema', 'Clases no usadas al terminar el plan sin renovar');
      END IF;
      -- Liberar clases futuras que ya no tienen plan que las respalde
      PERFORM set_config('nexa.motivo', 'Plan vencido sin renovación: se libera el horario', true);
      UPDATE public.reservas SET estado = 'cancelada'
       WHERE plan_id::text = p.id AND public.nexa_dia(fecha) > v_fin AND public.nexa_cat_credito(estado) = 'comprometida';
      UPDATE public.retenciones_horario SET estado = 'liberada' WHERE plan_id = p.id AND estado = 'activa';
      IF public.nexa_uuid(p.alumno_id) IS NOT NULL AND (public.nexa_plan_vigente(public.nexa_uuid(p.alumno_id), v_hoy)).id IS NULL THEN
        INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
        VALUES (public.nexa_uuid(p.alumno_id), 'horarios_liberados', jsonb_build_object('plan', p.nombre, 'vencidas', v_sobr), 'liberados:' || p.id)
        ON CONFLICT (clave) DO NOTHING;
      END IF;
      UPDATE public.planes SET cierre_at = now() WHERE id = p.id;
      v_venc := v_venc + 1;

    ELSIF public.nexa_uuid(p.alumno_id) IS NOT NULL THEN
      -- En la semana de retención: avisar una vez al vencer y otra el día antes de liberar
      IF EXISTS (SELECT 1 FROM public.retenciones_horario WHERE plan_id = p.id AND estado = 'activa') THEN
        INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
        VALUES (public.nexa_uuid(p.alumno_id),
                CASE WHEN v_hoy >= v_fin + v_ret - 1 THEN 'horarios_por_liberar' ELSE 'horarios_retenidos' END,
                jsonb_build_object('hasta', v_fin + v_ret, 'plan', p.nombre, 'sobrantes', v_sobr),
                CASE WHEN v_hoy >= v_fin + v_ret - 1 THEN 'por_liberar:' ELSE 'retenidos:' END || p.id)
        ON CONFLICT (clave) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('avisos', v_avisos, 'traspasos', v_arr, 'vencidos', v_venc);
END $$;

-- Los planes que ya terminaron hace más de una semana al aplicar esta migración se dan por cerrados
-- (sin avisos ni movimientos: evita escribirle a alumnos antiguos).
UPDATE public.planes p SET cierre_at = now()
 WHERE p.cierre_at IS NULL
   AND public.nexa_fin_plan(p) < public.nexa_hoy() - coalesce((SELECT retencion_horarios_dias FROM public.horario_config WHERE id = 1), 7);

-- La tarea horaria suma los vencimientos
CREATE OR REPLACE FUNCTION public.nexa_tareas_programadas()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec int; v_rev jsonb; v_ven jsonb;
BEGIN
  PERFORM set_config('nexa.origen', 'sistema', true);
  v_ven := public.nexa_procesar_vencimientos();
  v_rec := public.nexa_encolar_recordatorios();
  v_rev := public.nexa_revisar_sistema();
  RETURN jsonb_build_object('recordatorios', v_rec, 'vencimientos', v_ven, 'revision', v_rev);
END $$;

-- ── 6. Reglamento ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reglamentos (
  version       int PRIMARY KEY,
  titulo        text NOT NULL,
  contenido     text NOT NULL,          -- Markdown
  estado        text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'publicado', 'reemplazado')),
  publicado_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reglamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reglamentos_publico ON public.reglamentos;
CREATE POLICY reglamentos_publico ON public.reglamentos
  FOR SELECT TO anon, authenticated USING (estado IN ('publicado', 'reemplazado') OR get_my_role() IN ('admin', 'host'));

-- Una versión publicada no se modifica: los cambios van en una versión nueva
CREATE OR REPLACE FUNCTION public.nexa_reglamento_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN RAISE EXCEPTION 'Un reglamento publicado no se puede borrar.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado <> 'borrador' AND (NEW.contenido IS DISTINCT FROM OLD.contenido OR NEW.titulo IS DISTINCT FROM OLD.titulo) THEN
    RAISE EXCEPTION 'La versión % ya se publicó: crea una versión nueva.', OLD.version;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reglamentos_inmutable ON public.reglamentos;
CREATE TRIGGER reglamentos_inmutable BEFORE UPDATE OR DELETE ON public.reglamentos
  FOR EACH ROW EXECUTE FUNCTION public.nexa_reglamento_inmutable();

CREATE TABLE IF NOT EXISTS public.reglamento_aceptaciones (
  id          bigserial PRIMARY KEY,
  atleta_id   uuid NOT NULL,
  version     int  NOT NULL REFERENCES public.reglamentos(version),
  contexto    text,                 -- renovacion | inscripcion | portal
  usuario_id  uuid,
  ip          text,
  user_agent  text,
  huella      text,                 -- md5 del texto aceptado
  aceptado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atleta_id, version)
);
ALTER TABLE public.reglamento_aceptaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reglamento_aceptaciones_read ON public.reglamento_aceptaciones;
CREATE POLICY reglamento_aceptaciones_read ON public.reglamento_aceptaciones
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host', 'recepcionista') OR atleta_id = public.nexa_atleta_actual());
DROP TRIGGER IF EXISTS reglamento_aceptaciones_inmutable ON public.reglamento_aceptaciones;
CREATE TRIGGER reglamento_aceptaciones_inmutable BEFORE UPDATE OR DELETE ON public.reglamento_aceptaciones
  FOR EACH ROW EXECUTE FUNCTION public.nexa_inmutable();

CREATE OR REPLACE FUNCTION public.alumno_aceptar_reglamento(p_version int, p_contexto text DEFAULT 'portal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atleta uuid := public.nexa_atleta_actual(); g public.reglamentos; v_h json;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  SELECT * INTO g FROM public.reglamentos WHERE version = p_version AND estado = 'publicado';
  IF g.version IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'version_no_vigente'); END IF;
  BEGIN v_h := nullif(current_setting('request.headers', true), '')::json; EXCEPTION WHEN OTHERS THEN v_h := NULL; END;
  INSERT INTO public.reglamento_aceptaciones (atleta_id, version, contexto, usuario_id, ip, user_agent, huella)
  VALUES (v_atleta, g.version, left(coalesce(p_contexto, 'portal'), 40), auth.uid(),
          left(split_part(coalesce(v_h->>'x-forwarded-for', v_h->>'x-real-ip', ''), ',', 1), 64),
          left(v_h->>'user-agent', 300), md5(g.contenido))
  ON CONFLICT (atleta_id, version) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.staff_publicar_reglamento(p_version int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host') THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reglamentos WHERE version = p_version AND estado = 'borrador') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_es_borrador');
  END IF;
  UPDATE public.reglamentos SET estado = 'reemplazado' WHERE estado = 'publicado';
  UPDATE public.reglamentos SET estado = 'publicado', publicado_at = now() WHERE version = p_version;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 7. Evaluación inicial obligatoria para alumnos nuevos ───
-- Puede contratar online un plan 1:1 / 2:1 quien ya es alumno (tuvo algún plan)
-- o quien pagó su Clase de Prueba y la fecha de esa clase ya pasó.
-- Solo la usa el servidor (/api/reservar/pagar). El staff puede inscribir a cualquiera desde el panel.
CREATE OR REPLACE FUNCTION public.nexa_rut_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')), '') $$;

CREATE OR REPLACE FUNCTION public.nexa_evaluacion_cumplida(p_email text, p_rut text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req boolean; v_email text := lower(trim(coalesce(p_email, ''))); v_rut text := public.nexa_rut_norm(p_rut); v_fecha date;
BEGIN
  SELECT coalesce(requiere_evaluacion, true) INTO v_req FROM public.horario_config WHERE id = 1;
  IF NOT coalesce(v_req, true) THEN RETURN jsonb_build_object('ok', true, 'motivo', 'no_requerida'); END IF;

  IF EXISTS (SELECT 1 FROM public.atletas a JOIN public.planes p ON p.alumno_id = a.id::text
             WHERE (v_email <> '' AND lower(a.email) = v_email) OR (v_rut IS NOT NULL AND public.nexa_rut_norm(a.rut) = v_rut)) THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'alumno');
  END IF;

  IF to_regclass('public.grupales_compras') IS NOT NULL THEN
    EXECUTE $q$
      SELECT min(coalesce(c.primera_fecha, c.fecha_compra::date))
      FROM public.grupales_compras c
      JOIN public.grupales_alumnos g ON g.id = c.alumno_id
      JOIN public.planes_grupales pg ON pg.id = c.plan_grupal_id
      WHERE c.estado_pago = 'pagado' AND pg.num_clases = 1 AND pg.nombre ILIKE '%prueba%'
        AND (($1 <> '' AND lower(g.email) = $1) OR ($2 IS NOT NULL AND public.nexa_rut_norm(g.rut) = $2))
    $q$ INTO v_fecha USING v_email, v_rut;
    IF v_fecha IS NOT NULL AND v_fecha <= public.nexa_hoy() THEN RETURN jsonb_build_object('ok', true, 'motivo', 'evaluacion'); END IF;
    IF v_fecha IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'evaluacion_agendada', 'fecha', v_fecha); END IF;
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'sin_evaluacion');
END $$;
REVOKE ALL ON FUNCTION public.nexa_evaluacion_cumplida(text, text) FROM PUBLIC, anon, authenticated;

-- ── Permisos ────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'alumno_opciones_renovacion()',
    'alumno_solicitar_renovacion(text, int)',
    'alumno_registrar_comprobante(uuid, text)',
    'alumno_cancelar_renovacion(uuid)',
    'alumno_aceptar_reglamento(int, text)',
    'staff_aprobar_renovacion(uuid, text)',
    'staff_rechazar_renovacion(uuid, text)',
    'staff_guardar_datos_transferencia(jsonb)',
    'staff_publicar_reglamento(int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'nexa_precio_plan(text, int, text)',
    'nexa_patron_plan(text)',
    'nexa_plan_para_renovar(uuid)',
    'nexa_plan_sucesor(text)',
    'nexa_agendar_periodo(text, text, int)',
    'nexa_procesar_vencimientos()',
    'nexa_tareas_programadas()',
    'nexa_planes_enlazar_anterior()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;


-- ┌── 045_reglamento_v1_comprobantes.sql

-- ============================================================
-- NEXA 045 — Reglamento versión 1 (BORRADOR) y bucket de comprobantes
-- ============================================================
-- El reglamento queda como borrador: no lo ve nadie ni se exige hasta que
-- el admin lo publique (botón en /reglamento o `SELECT staff_publicar_reglamento(1)`).
-- Re-ejecutable. Aplicar después de la 044.
-- ============================================================

INSERT INTO public.reglamentos (version, titulo, contenido) VALUES (1, 'Reglamento y Condiciones NEXA Performance', $reg$
## 1. Alcance

Este reglamento regula los planes de entrenamiento personalizado de NEXA Performance (en adelante, "NEXA") y se aplica a todos los alumnos que contratan o renuevan un plan. Al contratar o renovar, el alumno declara haberlo leído y aceptado. La versión aceptada queda registrada en su cuenta MI NEXA y no cambia aunque NEXA publique una versión nueva.

## 2. Modalidades de entrenamiento

- **Personalizado 1:1:** un profesor entrena exclusivamente a un alumno. Cada sesión tiene un cupo.
- **Semipersonalizado 2:1:** un profesor entrena a un máximo de dos alumnos a la vez. Cada sesión tiene dos cupos, y solo los pueden ocupar alumnos con plan 2:1.
- Las modalidades no se mezclan: un alumno 1:1 no ocupa cupos de una sesión 2:1, y viceversa.

## 3. Evaluación inicial

Antes de contratar su primer plan, todo alumno nuevo debe realizar una **Clase de Prueba / evaluación inicial**, cuyo valor se informa en la página de NEXA. Su objetivo es conocer los objetivos, el nivel y las condiciones del alumno para recomendarle la modalidad y frecuencia adecuadas.

## 4. Planes, precios y pago

- NEXA ofrece planes **mensuales, trimestrales y semestrales**, con la frecuencia semanal y la modalidad que el alumno elija. El precio, la cantidad de clases y las fechas de inicio y término se informan antes de pagar y quedan registrados en MI NEXA.
- Todos los planes se pagan **por adelantado y por el valor total del período**. NEXA no cobra cuotas mensuales.
- Si el alumno paga con tarjeta de crédito en cuotas, esas cuotas son un acuerdo entre el alumno y su banco. NEXA registra una sola compra por el total y no suspende el plan por cuotas pendientes con el banco.
- Un plan se activa solo cuando el pago está confirmado. Si el pago es por transferencia, el comprobante queda **en revisión** hasta que NEXA verifica el abono; enviar el comprobante no activa el plan por sí solo.
- Los precios publicados pueden cambiar, pero un cambio nunca afecta un plan ya pagado.

## 5. Clases incluidas y vigencia

- Cada plan incluye la cantidad de clases indicada al contratarlo (frecuencia semanal × semanas del período).
- Las clases deben realizarse **dentro de la vigencia del plan**. Las clases no usadas vencen el día en que termina el plan.
- **Si el alumno renueva**, las clases que le hayan quedado sin usar pasan a su período siguiente.
- En MI NEXA el alumno puede ver en todo momento sus clases contratadas, realizadas, agendadas, disponibles para reservar y la fecha de vencimiento.

## 6. Horarios fijos y reservas

- Al contratar, el alumno elige sus horarios fijos semanales según la disponibilidad real de profesores y cupos.
- El alumno puede reservar clases adicionales con sus créditos disponibles, reagendar o cancelar desde MI NEXA, siempre dentro de las reglas de este reglamento.
- Cambiar una clase puntual no modifica los horarios fijos de las demás semanas. Para cambiar un horario fijo de forma permanente, el alumno debe solicitarlo a NEXA.

## 7. Cancelaciones y reagendamientos

Todos los horarios se rigen por la hora oficial de Chile continental (America/Santiago).

- **Clases que comienzan hasta las 12:00 (inclusive):** se pueden cancelar o reagendar sin perder la clase hasta las **22:00 del día anterior**.
- **Clases que comienzan después de las 12:00:** se pueden cancelar o reagendar sin perder la clase hasta **6 horas antes** de su inicio.
- Una solicitud hecha exactamente a la hora límite se considera a tiempo.
- Si se cancela a tiempo, el alumno conserva la clase y puede usarla en otro horario disponible dentro de la vigencia de su plan.
- Fuera de plazo, la clase **se descuenta** del plan.
- El sistema registra el instante exacto de cada solicitud y la regla aplicada; el alumno puede revisarlo en su historial.

## 8. Inasistencias y atrasos

- Si el alumno no se presenta y no canceló a tiempo, la clase se registra como inasistencia y se descuenta del plan. El alumno recibe un aviso.
- Si el alumno llega tarde, la clase termina a la hora programada para no afectar al siguiente alumno.

## 9. Recuperación de clases

Las clases canceladas a tiempo, y las que NEXA cancele, pueden recuperarse reservando otro horario compatible dentro de la vigencia del plan, sujeto a disponibilidad. Si se produce una diferencia o un error en el registro, el alumno puede solicitar su revisión y toda corrección queda registrada en su historial.

## 10. Clases canceladas por NEXA, feriados y cierres

- Si NEXA cancela una clase (ausencia del profesor, feriado, cierre, mantención u otra causa operativa), **el alumno no pierde la clase** y puede reagendarla sin costo, o NEXA le ofrecerá una alternativa (otro horario o un profesor sustituto).
- NEXA avisará con la mayor anticipación posible por correo y en MI NEXA.

## 11. Renovaciones

- NEXA avisa antes del vencimiento (por defecto 14, 7, 3 y 1 día antes, y el mismo día).
- El alumno puede renovar desde MI NEXA en cualquier momento antes del vencimiento. El nuevo período comienza el **día siguiente al vencimiento** del plan actual, sin superponerse ni perder días pagados. Si renueva después del vencimiento, el nuevo período comienza el día en que se activa.
- Al renovar, NEXA conserva sus horarios fijos siempre que sigan disponibles.
- Si el alumno no renueva, NEXA le guarda sus horarios fijos durante **7 días** después del vencimiento. Pasado ese plazo los horarios se liberan para otros alumnos, con aviso previo.

## 12. Excepciones

NEXA puede evaluar excepciones justificadas (por ejemplo, enfermedad o accidente acreditado con documento, o fuerza mayor). Cada excepción se resuelve caso a caso, con motivo escrito, y queda registrada en el historial del alumno.

## 13. Salud y seguridad

- El alumno debe informar a su profesor cualquier condición de salud, lesión, embarazo o tratamiento que pueda influir en su entrenamiento, y seguir sus indicaciones.
- Si el profesor considera que no es seguro entrenar, puede ajustar o suspender la sesión; si la suspensión no es responsabilidad del alumno, la clase no se descuenta.

## 14. Datos personales

- NEXA trata los datos personales del alumno (identificación, contacto, pagos, asistencia y, cuando el alumno los entrega, antecedentes de salud) solo para prestar el servicio, administrar su plan y comunicarse con él, conforme a la Ley N° 19.628 sobre Protección de la Vida Privada y la normativa que la reemplace o complemente.
- Los antecedentes de salud se consideran datos sensibles: solo acceden a ellos el profesor a cargo y la administración, en la medida necesaria para entrenar de forma segura.
- NEXA no vende ni cede los datos a terceros. Los proveedores tecnológicos (alojamiento, correo electrónico y pagos) los tratan solo por encargo de NEXA.
- El alumno puede pedir acceso, rectificación, eliminación u oposición escribiendo a NEXA.

## 15. Derechos del consumidor

Nada de este reglamento limita los derechos que la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores otorga al alumno. [REVISAR CON ASESOR LEGAL: política de retracto para contrataciones online (art. 3 bis) y de devolución de dinero en caso de término anticipado.]

## 16. Cambios a este reglamento

NEXA puede actualizar este reglamento publicando una nueva versión con su fecha. Los cambios no se aplican de forma retroactiva a planes ya pagados: cada plan se rige por las condiciones vigentes al contratarlo o renovarlo. Las versiones anteriores siguen disponibles para consulta.

## 17. Contacto

Para consultas, solicitudes o reclamos, el alumno puede escribir a NEXA desde MI NEXA o por los canales informados en la página.
$reg$)
ON CONFLICT (version) DO NOTHING;

-- ── Bucket privado para comprobantes de transferencia ──────
-- Cada alumno sube solo a su carpeta (<id del alumno>/archivo); solo él y el staff pueden verlos.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('comprobantes', 'comprobantes', false, 5242880,
          ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'DROP POLICY IF EXISTS comprobantes_subir_propio ON storage.objects';
  EXECUTE $p$CREATE POLICY comprobantes_subir_propio ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = public.nexa_atleta_actual()::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS comprobantes_leer ON storage.objects';
  EXECUTE $p$CREATE POLICY comprobantes_leer ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'comprobantes' AND ((storage.foldername(name))[1] = public.nexa_atleta_actual()::text
           OR public.get_my_role() IN ('admin', 'host', 'recepcionista')))$p$;
END $$;


-- ┌── 046_reagendas_creada_at_default.sql

-- ============================================================
-- NEXA 046 — reagendas.creada_at con valor por defecto
-- ============================================================
-- En producción `reagendas.creada_at` es texto obligatorio y SIN valor por
-- defecto. La función alumno_reagendar_reserva (migración 041) no lo envía,
-- así que reagendar desde MI NEXA fallaba siempre y el alumno veía
-- "Ese horario se acaba de ocupar" (el error real quedaba oculto).
-- Se agrega un valor por defecto en el mismo formato ISO que usa la app
-- (new Date().toISOString()), para que el orden por fecha siga funcionando.
-- Re-ejecutable. Se puede aplicar en cualquier orden respecto de 044/045.
-- ============================================================

ALTER TABLE public.reagendas
  ALTER COLUMN creada_at SET DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');


COMMIT;

-- Recargar el esquema de la API para que la página vea las funciones nuevas
NOTIFY pgrst, 'reload schema';
