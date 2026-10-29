-- ============================================================
-- NEXA 042 — Créditos, asistencia y detección de errores (Fase 2)
-- ============================================================
--  1. Configuración nueva (umbrales de aviso, recordatorios, alertas).
--  2. Planes: condiciones registradas al contratar (no cambian después).
--  3. Historial de créditos (`movimientos_credito`): cada cambio de una
--     reserva que afecta un crédito deja un movimiento. No se puede editar
--     ni borrar; las correcciones son movimientos nuevos.
--  4. Contador detallado (`nexa_resumen_plan`) y el del alumno.
--  5. Guardias: no marcar asistencia de clases futuras; el profesor no
--     puede devolver créditos ni cambiar el plan de una reserva.
--  6. Avisos automáticos: correo tras cada clase, inasistencia, cancelación
--     tardía, clases restantes (5/3/2/1/0) y recordatorios (24 h / 3 h).
--  7. "Requiere mi atención" (`incidencias`) y revisión automática del
--     sistema (`nexa_revisar_sistema`).
--
-- Re-ejecutable. Aplicar después de la 041.
-- ============================================================

-- ── 1. Configuración ────────────────────────────────────────
ALTER TABLE public.horario_config
  ADD COLUMN IF NOT EXISTS umbrales_clases         int[]   NOT NULL DEFAULT '{5,3,2,1,0}',
  ADD COLUMN IF NOT EXISTS recordatorio_horas      int[]   NOT NULL DEFAULT '{24,3}',
  ADD COLUMN IF NOT EXISTS alerta_asistencia_horas int     NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS correo_post_clase       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sustituto_requiere_aprobacion boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS app_url                 text;   -- p. ej. https://nexa.cl (lo usa el envío programado de correos)

-- ── 2. Planes: condiciones al contratar ─────────────────────
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS precio_clp         int,
  ADD COLUMN IF NOT EXISTS estado_pago        text,           -- null = plan anterior a la 042 | pendiente | verificando | pagado | anulado
  ADD COLUMN IF NOT EXISTS regla_clases       text,           -- fija | calendario
  ADD COLUMN IF NOT EXISTS clases_arrastradas int NOT NULL DEFAULT 0,  -- incluidas en total_clases, vienen del plan anterior
  ADD COLUMN IF NOT EXISTS plan_anterior_id   text,
  ADD COLUMN IF NOT EXISTS condiciones        jsonb;

CREATE OR REPLACE FUNCTION public.nexa_condiciones_vigentes()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cancelacion', jsonb_build_object(
      'limite_hora_am',        coalesce(c.limite_hora_am, '12:00'),
      'corte_cancelacion_am',  coalesce(c.corte_cancelacion_am, '22:00'),
      'cancel_horas_aviso_pm', coalesce(c.cancel_horas_aviso_pm, 6)),
    'consumen_clase', jsonb_build_array('presente', 'no_show', 'cancelada_tarde'),
    'vencimiento', 'Las clases no usadas vencen al terminar el plan. Si el alumno renueva, las clases pendientes pasan al período siguiente.',
    'registrado_at', now())
  FROM (SELECT 1) x LEFT JOIN public.horario_config c ON c.id = 1
$$;

CREATE OR REPLACE FUNCTION public.nexa_planes_condiciones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.condiciones  := coalesce(NEW.condiciones, public.nexa_condiciones_vigentes());
  NEW.regla_clases := coalesce(NEW.regla_clases, 'fija');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS planes_condiciones ON public.planes;
CREATE TRIGGER planes_condiciones BEFORE INSERT ON public.planes
  FOR EACH ROW EXECUTE FUNCTION public.nexa_planes_condiciones();

-- ── 3. Historial de créditos ────────────────────────────────
-- Convierte a uuid sin fallar con ids antiguos
CREATE OR REPLACE FUNCTION public.nexa_uuid(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END
$$;

-- Categoría de una reserva respecto a su crédito
CREATE OR REPLACE FUNCTION public.nexa_cat_credito(p_estado text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_estado IS NULL THEN NULL
    WHEN p_estado IN ('presente', 'no_show', 'cancelada_tarde') THEN 'consumida'
    WHEN public.nexa_estado_inactivo(p_estado) THEN 'libre'
    ELSE 'comprometida'
  END
$$;

CREATE TABLE IF NOT EXISTS public.movimientos_credito (
  id             bigserial PRIMARY KEY,
  plan_id        text,
  atleta_id      uuid,
  reserva_id     int,
  tipo           text NOT NULL,
  -- asignado | ajuste_total | plan_eliminado | saldo_inicial | comprometido | liberado_cancelacion
  -- | liberado_reagenda | liberado_nexa | consumido_asistencia | consumido_inasistencia
  -- | consumido_cancelacion_tardia | devuelto | corregido | traspasado | anulado | arrastrado | vencido
  cantidad       int  NOT NULL DEFAULT 1,
  estado_antes   text,
  estado_despues text,
  fecha_clase    date,
  hora           text,
  coach_id       uuid,
  origen         text,          -- alumno | staff | sistema
  usuario_id     uuid,
  motivo         text,
  detalle        jsonb,         -- p. ej. límite de cancelación, instante de la solicitud y si fue a tiempo
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimientos_credito_plan_idx    ON public.movimientos_credito(plan_id);
CREATE INDEX IF NOT EXISTS movimientos_credito_atleta_idx  ON public.movimientos_credito(atleta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS movimientos_credito_reserva_idx ON public.movimientos_credito(reserva_id, id DESC);
ALTER TABLE public.movimientos_credito ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movimientos_credito_staff_read ON public.movimientos_credito;
CREATE POLICY movimientos_credito_staff_read ON public.movimientos_credito
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host', 'recepcionista'));
-- Sin políticas de escritura: solo escriben los triggers/funciones.

-- Los registros históricos no se editan ni se borran
CREATE OR REPLACE FUNCTION public.nexa_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro histórico de %: no se puede modificar ni borrar. Registra una corrección.', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS movimientos_credito_inmutable ON public.movimientos_credito;
CREATE TRIGGER movimientos_credito_inmutable BEFORE UPDATE OR DELETE ON public.movimientos_credito
  FOR EACH ROW EXECUTE FUNCTION public.nexa_inmutable();
DROP TRIGGER IF EXISTS auditoria_reservas_inmutable ON public.auditoria_reservas;
CREATE TRIGGER auditoria_reservas_inmutable BEFORE UPDATE OR DELETE ON public.auditoria_reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_inmutable();

CREATE OR REPLACE FUNCTION public.nexa_origen()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('nexa.origen', true), ''),
                  CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'staff' END)
$$;

-- Qué movimiento produce pasar de una categoría a otra
CREATE OR REPLACE FUNCTION public.nexa_tipo_movimiento(p_cat_antes text, p_est_antes text, p_est_despues text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE public.nexa_cat_credito(p_est_despues)
    WHEN 'consumida' THEN CASE
      WHEN p_cat_antes = 'consumida' THEN CASE WHEN p_est_antes = p_est_despues THEN NULL ELSE 'corregido' END
      WHEN p_est_despues = 'presente' THEN 'consumido_asistencia'
      WHEN p_est_despues = 'no_show'  THEN 'consumido_inasistencia'
      ELSE 'consumido_cancelacion_tardia' END
    WHEN 'comprometida' THEN CASE
      WHEN p_cat_antes = 'comprometida' THEN NULL
      WHEN p_cat_antes = 'consumida' THEN 'corregido'
      ELSE 'comprometido' END
    WHEN 'libre' THEN CASE
      WHEN p_cat_antes IS NULL OR p_cat_antes = 'libre' THEN NULL
      WHEN p_cat_antes = 'consumida' THEN 'devuelto'
      WHEN p_est_despues = 'reagendada' THEN 'liberado_reagenda'
      WHEN p_est_despues IN ('cancelada_nexa', 'bloqueada') THEN 'liberado_nexa'
      ELSE 'liberado_cancelacion' END
  END
$$;

CREATE OR REPLACE FUNCTION public.nexa_mov_reserva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tipo text; v_cat_antes text; v_est_antes text; v_det jsonb; v_lim timestamptz; v_dia date;
  v_motivo text := nullif(current_setting('nexa.motivo', true), '');
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.plan_id IS NOT DISTINCT FROM NEW.plan_id
     AND OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NULL;
  END IF;

  -- Sale del plan anterior (cambio de plan o reserva eliminada)
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.plan_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.plan_id IS DISTINCT FROM NEW.plan_id)
     AND public.nexa_cat_credito(OLD.estado) <> 'libre' THEN
    INSERT INTO public.movimientos_credito (plan_id, atleta_id, reserva_id, tipo, estado_antes, estado_despues,
      fecha_clase, hora, coach_id, origen, usuario_id, motivo)
    VALUES (OLD.plan_id::text, OLD.alumno_id, OLD.id, CASE WHEN TG_OP = 'DELETE' THEN 'anulado' ELSE 'traspasado' END,
      OLD.estado, NULL, public.nexa_dia(OLD.fecha), left(OLD.hora, 5), OLD.coach_id, public.nexa_origen(), auth.uid(), v_motivo);
  END IF;
  IF TG_OP = 'DELETE' OR NEW.plan_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'UPDATE' AND OLD.plan_id IS NOT DISTINCT FROM NEW.plan_id THEN
    v_cat_antes := public.nexa_cat_credito(OLD.estado); v_est_antes := OLD.estado;
  END IF;
  v_tipo := public.nexa_tipo_movimiento(v_cat_antes, v_est_antes, NEW.estado);
  IF v_tipo IS NULL THEN RETURN NULL; END IF;

  -- Política aplicada: guarda el límite y el instante exacto de la solicitud
  v_dia := public.nexa_dia(NEW.fecha);
  IF v_tipo IN ('liberado_cancelacion', 'liberado_reagenda', 'consumido_cancelacion_tardia')
     AND coalesce(NEW.hora, '') ~ '^\d{2}:\d{2}' THEN
    v_lim := public.nexa_limite_cancelacion(v_dia, NEW.hora);
    v_det := jsonb_build_object('limite', v_lim, 'solicitud', now(), 'a_tiempo', now() <= v_lim);
  END IF;

  INSERT INTO public.movimientos_credito (plan_id, atleta_id, reserva_id, tipo, estado_antes, estado_despues,
    fecha_clase, hora, coach_id, origen, usuario_id, motivo, detalle)
  VALUES (NEW.plan_id::text, NEW.alumno_id, NEW.id, v_tipo, v_est_antes, NEW.estado,
    v_dia, left(NEW.hora, 5), NEW.coach_id, public.nexa_origen(), auth.uid(), v_motivo, v_det);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS reservas_movimientos ON public.reservas;
CREATE TRIGGER reservas_movimientos AFTER INSERT OR UPDATE OR DELETE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_mov_reserva();

CREATE OR REPLACE FUNCTION public.nexa_mov_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo text := nullif(current_setting('nexa.motivo', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, usuario_id, motivo, detalle)
    VALUES (NEW.id, public.nexa_uuid(NEW.alumno_id), 'asignado', coalesce(NEW.total_clases, 0), public.nexa_origen(), auth.uid(),
            v_motivo, jsonb_build_object('inicio', NEW.start_date, 'fin', NEW.end_date, 'arrastradas', NEW.clases_arrastradas));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.total_clases IS DISTINCT FROM OLD.total_clases THEN
      INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, usuario_id, motivo, detalle)
      VALUES (NEW.id, public.nexa_uuid(NEW.alumno_id), 'ajuste_total', coalesce(NEW.total_clases, 0) - coalesce(OLD.total_clases, 0),
              public.nexa_origen(), auth.uid(), v_motivo,
              jsonb_build_object('antes', OLD.total_clases, 'despues', NEW.total_clases));
    END IF;
    IF NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.extended_until IS DISTINCT FROM OLD.extended_until THEN
      INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, usuario_id, motivo, detalle)
      VALUES (NEW.id, public.nexa_uuid(NEW.alumno_id), 'vigencia_modificada', 0, public.nexa_origen(), auth.uid(), v_motivo,
              jsonb_build_object('fin_antes', coalesce(nullif(OLD.extended_until, ''), OLD.end_date),
                                 'fin_despues', coalesce(nullif(NEW.extended_until, ''), NEW.end_date)));
    END IF;
  ELSE
    INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, usuario_id, motivo)
    VALUES (OLD.id, public.nexa_uuid(OLD.alumno_id), 'plan_eliminado', -coalesce(OLD.total_clases, 0),
            public.nexa_origen(), auth.uid(), v_motivo);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS planes_movimientos ON public.planes;
CREATE TRIGGER planes_movimientos AFTER INSERT OR UPDATE OR DELETE ON public.planes
  FOR EACH ROW EXECUTE FUNCTION public.nexa_mov_plan();

-- Punto de partida: la primera vez, registra el estado actual de cada plan y reserva
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.movimientos_credito) THEN
    INSERT INTO public.movimientos_credito (plan_id, atleta_id, tipo, cantidad, origen, motivo, detalle)
    SELECT p.id, public.nexa_uuid(p.alumno_id), 'asignado', coalesce(p.total_clases, 0),
           'sistema', 'Saldo inicial (migración 042)', jsonb_build_object('inicio', p.start_date, 'fin', p.end_date)
    FROM public.planes p;
    INSERT INTO public.movimientos_credito (plan_id, atleta_id, reserva_id, tipo, cantidad, estado_despues, fecha_clase, hora,
                                            coach_id, origen, motivo)
    SELECT r.plan_id::text, r.alumno_id, r.id, 'saldo_inicial', 0, r.estado, public.nexa_dia(r.fecha), left(r.hora, 5),
           r.coach_id, 'sistema', 'Saldo inicial (migración 042)'
    FROM public.reservas r WHERE r.plan_id IS NOT NULL;
  END IF;
END $$;

-- ── 4. Contador ─────────────────────────────────────────────
-- Clases del plan ya comprometidas: consumidas + agendadas + pasadas sin marcar.
-- Una clase pasada sin marcar queda "por confirmar": retiene su crédito hasta
-- que el staff marque asistencia (así nunca se gasta el mismo crédito dos veces).
CREATE OR REPLACE FUNCTION public.nexa_clases_comprometidas(p_plan_id text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.reservas r
  WHERE r.plan_id::text = p_plan_id AND public.nexa_cat_credito(r.estado) IN ('consumida', 'comprometida')
$$;

CREATE OR REPLACE FUNCTION public.nexa_resumen_plan(p_plan_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.planes; v_hoy date := public.nexa_hoy(); v_fin date; v_mod text;
  c record; v_vencidas int;
BEGIN
  SELECT * INTO p FROM public.planes WHERE id = p_plan_id;
  IF p.id IS NULL THEN RETURN NULL; END IF;
  v_fin := public.nexa_fin_plan(p);
  SELECT
    count(*) FILTER (WHERE r.estado = 'presente')                                                   AS realizadas,
    count(*) FILTER (WHERE r.estado = 'no_show')                                                    AS inasistencias,
    count(*) FILTER (WHERE r.estado = 'cancelada_tarde')                                            AS tardias,
    count(*) FILTER (WHERE r.estado IN ('cancelada_nexa', 'bloqueada'))                             AS devueltas,
    count(*) FILTER (WHERE public.nexa_cat_credito(r.estado) = 'comprometida' AND public.nexa_dia(r.fecha) >= v_hoy) AS agendadas,
    count(*) FILTER (WHERE public.nexa_cat_credito(r.estado) = 'comprometida' AND public.nexa_dia(r.fecha) <  v_hoy) AS por_confirmar
  INTO c
  FROM public.reservas r WHERE r.plan_id::text = p.id;
  SELECT coalesce(sum(cantidad), 0) INTO v_vencidas FROM public.movimientos_credito WHERE plan_id = p.id AND tipo = 'vencido';
  SELECT coalesce(p.modalidad, a.tipo_sesion, '1:1') INTO v_mod
    FROM (SELECT 1) x LEFT JOIN public.atletas a ON a.id::text = p.alumno_id;

  RETURN jsonb_build_object(
    'plan_id', p.id, 'nombre', p.nombre, 'tipo', p.tipo, 'modalidad', v_mod,
    'inicio', p.start_date, 'fin', v_fin, 'dias_restantes', CASE WHEN v_fin IS NOT NULL THEN v_fin - v_hoy END,
    'precio', p.precio_clp, 'estado_pago', p.estado_pago,
    'contratadas',   coalesce(p.total_clases, 0),
    'arrastradas',   p.clases_arrastradas,
    'realizadas',    c.realizadas,
    'inasistencias', c.inasistencias,
    'tardias',       c.tardias,
    'consumidas',    c.realizadas + c.inasistencias + c.tardias,
    'agendadas',     c.agendadas,
    'por_confirmar', c.por_confirmar,
    'devueltas',     c.devueltas,
    'vencidas',      v_vencidas,
    -- Pendientes de realizar = contratadas − consumidas (incluye las ya agendadas)
    'pendientes',    greatest(0, coalesce(p.total_clases, 0) - (c.realizadas + c.inasistencias + c.tardias)),
    -- Disponibles para reservar = contratadas − consumidas − agendadas − por confirmar
    'disponibles',   greatest(0, coalesce(p.total_clases, 0) - (c.realizadas + c.inasistencias + c.tardias) - c.agendadas - c.por_confirmar),
    'excedidas',     greatest(0, (c.realizadas + c.inasistencias + c.tardias + c.agendadas + c.por_confirmar) - coalesce(p.total_clases, 0))
  );
END $$;

-- Resumen del plan vigente del alumno (mantiene las claves que ya usa MI NEXA)
CREATE OR REPLACE FUNCTION public.alumno_mi_plan()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atleta uuid := public.nexa_atleta_actual(); v_plan public.planes; v_r jsonb; v_prox jsonb;
BEGIN
  IF v_atleta IS NULL THEN RETURN NULL; END IF;
  v_plan := public.nexa_plan_vigente(v_atleta, public.nexa_hoy());
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('vigente', false); END IF;
  v_r := public.nexa_resumen_plan(v_plan.id);
  SELECT jsonb_build_object('reserva_id', r.id, 'fecha', public.nexa_dia(r.fecha), 'hora', left(r.hora, 5),
                            'profesor', co.nombre, 'modalidad', public.nexa_modalidad(r.tipo_clase))
    INTO v_prox
    FROM public.reservas r LEFT JOIN public.coaches co ON co.id = r.coach_id
   WHERE r.alumno_id = v_atleta AND public.nexa_cat_credito(r.estado) = 'comprometida'
     AND r.hora ~ '^\d{2}:\d{2}' AND public.nexa_inicio_clase(public.nexa_dia(r.fecha), r.hora) > now()
   ORDER BY public.nexa_dia(r.fecha), left(r.hora, 5) LIMIT 1;
  RETURN v_r || jsonb_build_object(
    'vigente', true,
    'usadas', (v_r->>'consumidas')::int,
    'reservadas', (v_r->>'agendadas')::int + (v_r->>'por_confirmar')::int,
    'proxima', v_prox);
END $$;

-- Historial de créditos del alumno (lo que ve en MI NEXA)
CREATE OR REPLACE FUNCTION public.alumno_mis_movimientos(p_limite int DEFAULT 100)
RETURNS TABLE (id bigint, created_at timestamptz, tipo text, cantidad int, plan text, fecha_clase date, hora text,
               estado_antes text, estado_despues text, origen text, motivo text, detalle jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.created_at, m.tipo, m.cantidad, p.nombre, m.fecha_clase, m.hora,
         m.estado_antes, m.estado_despues, m.origen, m.motivo, m.detalle
  FROM public.movimientos_credito m LEFT JOIN public.planes p ON p.id = m.plan_id
  WHERE m.atleta_id = public.nexa_atleta_actual() AND m.tipo <> 'saldo_inicial'
  ORDER BY m.id DESC
  LIMIT least(greatest(coalesce(p_limite, 100), 1), 500)
$$;

-- Resumen de cualquier plan, para el staff
CREATE OR REPLACE FUNCTION public.staff_resumen_plan(p_plan_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista', 'profesor') THEN RETURN NULL; END IF;
  RETURN public.nexa_resumen_plan(p_plan_id);
END $$;

-- ── 5. Guardias ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nexa_guardia_reserva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text := coalesce(get_my_role(), '');
BEGIN
  -- Nunca se marca asistencia de una clase que todavía no llega
  IF NEW.estado IN ('presente', 'no_show') AND NEW.estado IS DISTINCT FROM OLD.estado
     AND public.nexa_dia(NEW.fecha) > public.nexa_hoy() THEN
    RAISE EXCEPTION 'No se puede registrar asistencia de una clase futura (%).', public.nexa_dia(NEW.fecha)
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_rol = 'profesor' THEN
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.alumno_id IS DISTINCT FROM OLD.alumno_id THEN
      RAISE EXCEPTION 'Un profesor no puede cambiar el plan ni el alumno de una reserva.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF public.nexa_cat_credito(OLD.estado) = 'consumida' AND public.nexa_cat_credito(NEW.estado) = 'libre' THEN
      RAISE EXCEPTION 'Solo administración puede devolver el crédito de una clase.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reservas_guardia ON public.reservas;
CREATE TRIGGER reservas_guardia BEFORE UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_guardia_reserva();

-- ── 6. Avisos automáticos ───────────────────────────────────
-- Próxima clase del alumno (para los correos)
CREATE OR REPLACE FUNCTION public.nexa_proxima_clase(p_atleta uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('fecha', public.nexa_dia(r.fecha), 'hora', left(r.hora, 5), 'profesor', co.nombre)
  FROM public.reservas r LEFT JOIN public.coaches co ON co.id = r.coach_id
  WHERE r.alumno_id = p_atleta AND public.nexa_cat_credito(r.estado) = 'comprometida'
    AND r.hora ~ '^\d{2}:\d{2}' AND public.nexa_inicio_clase(public.nexa_dia(r.fecha), r.hora) > now()
  ORDER BY public.nexa_dia(r.fecha), left(r.hora, 5) LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.nexa_avisos_reserva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.horario_config; v_res jsonb; v_pend int; v_umbral boolean; v_tipo text; v_principal boolean := false;
  v_datos jsonb;
BEGIN
  IF NEW.alumno_id IS NULL OR NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NULL; END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;

  -- Asistencia corregida: si el correo no salió, se anula; si salió, se envía una corrección
  IF OLD.estado = 'presente' THEN
    UPDATE public.notificaciones SET estado = 'omitida', error = 'Asistencia corregida antes del envío'
     WHERE clave = 'clase_realizada:' || NEW.id AND estado IN ('pendiente', 'error');
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.notificaciones
                             WHERE clave = 'clase_realizada:' || NEW.id AND estado IN ('enviada', 'enviando')) THEN
      INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
      VALUES (NEW.alumno_id, 'asistencia_corregida',
              public.nexa_datos_reserva(NEW.id) || jsonb_build_object('estado', NEW.estado,
                'plan', CASE WHEN NEW.plan_id IS NOT NULL THEN public.nexa_resumen_plan(NEW.plan_id::text) END),
              'corregida:' || NEW.id || ':' || (extract(epoch FROM clock_timestamp()) * 1000)::bigint)
      ON CONFLICT (clave) DO NOTHING;
    END IF;
  END IF;

  -- Clase consumida: resumen del plan y, si corresponde, aviso de clases restantes
  IF public.nexa_cat_credito(NEW.estado) = 'consumida' AND public.nexa_cat_credito(OLD.estado) IS DISTINCT FROM 'consumida'
     AND NEW.plan_id IS NOT NULL THEN
    v_res  := public.nexa_resumen_plan(NEW.plan_id::text);
    v_pend := (v_res->>'pendientes')::int;
    v_umbral := v_pend = ANY (coalesce(v_cfg.umbrales_clases, '{5,3,2,1,0}'));
    v_tipo := CASE NEW.estado WHEN 'presente' THEN 'clase_realizada' WHEN 'no_show' THEN 'inasistencia' ELSE 'cancelacion_tardia' END;
    v_datos := public.nexa_datos_reserva(NEW.id) || jsonb_build_object(
      'plan', v_res, 'proxima', public.nexa_proxima_clase(NEW.alumno_id), 'aviso_restantes', v_umbral);

    IF v_tipo <> 'clase_realizada' OR coalesce(v_cfg.correo_post_clase, true) THEN
      INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
      VALUES (NEW.alumno_id, v_tipo, v_datos, v_tipo || ':' || NEW.id)
      ON CONFLICT (clave) DO NOTHING;
      v_principal := FOUND;
    END IF;
    IF v_umbral THEN
      -- Un solo aviso por plan y umbral. Si ya va dentro del correo de la clase, queda registrado sin reenviarse.
      INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave, estado, error)
      VALUES (NEW.alumno_id, 'clases_restantes', jsonb_build_object('plan', v_res, 'proxima', public.nexa_proxima_clase(NEW.alumno_id)),
              'restantes:' || NEW.plan_id || ':' || v_pend,
              CASE WHEN v_principal THEN 'omitida' ELSE 'pendiente' END,
              CASE WHEN v_principal THEN 'Incluido en el correo ' || v_tipo END)
      ON CONFLICT (clave) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS reservas_avisos ON public.reservas;
CREATE TRIGGER reservas_avisos AFTER UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_avisos_reserva();

-- Recordatorios antes de cada clase (por defecto 24 h y 3 h). Lo llama la tarea programada cada hora.
-- Si una clase se reservó tarde, sale solo el recordatorio más cercano.
CREATE OR REPLACE FUNCTION public.nexa_encolar_recordatorios()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.horario_config; r record; v_inicio timestamptz; v_h int; v_lim timestamptz; n int := 0;
BEGIN
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  FOR r IN
    SELECT x.id, x.alumno_id, x.fecha, x.hora FROM public.reservas x
    WHERE x.alumno_id IS NOT NULL AND public.nexa_cat_credito(x.estado) = 'comprometida'
      AND coalesce(x.hora, '') ~ '^\d{2}:\d{2}'
      AND public.nexa_dia(x.fecha) BETWEEN public.nexa_hoy()
          AND public.nexa_hoy() + (coalesce((SELECT max(h) FROM unnest(v_cfg.recordatorio_horas) h), 24) / 24 + 1)
  LOOP
    v_inicio := public.nexa_inicio_clase(public.nexa_dia(r.fecha), r.hora);
    CONTINUE WHEN v_inicio <= now();
    SELECT min(h) INTO v_h FROM unnest(coalesce(v_cfg.recordatorio_horas, '{24,3}')) h
     WHERE h > 0 AND v_inicio <= now() + make_interval(hours => h);
    CONTINUE WHEN v_h IS NULL;
    v_lim := public.nexa_limite_cancelacion(public.nexa_dia(r.fecha), r.hora);
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (r.alumno_id, 'recordatorio_clase',
            public.nexa_datos_reserva(r.id) || jsonb_build_object('horas', v_h, 'limite', v_lim, 'a_tiempo', now() <= v_lim),
            'recordatorio:' || v_h || ':' || r.id)
    ON CONFLICT (clave) DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;

-- ── 7. "Requiere mi atención" ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.incidencias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             text NOT NULL,
  prioridad        text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta', 'media', 'baja')),
  clave            text NOT NULL,
  titulo           text NOT NULL,
  descripcion      text,
  accion_sugerida  text,
  atleta_id        uuid,
  reserva_id       int,
  plan_id          text,
  coach_id         uuid,
  estado           text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'resuelta', 'descartada')),
  automatica       boolean NOT NULL DEFAULT true,    -- la detecta el sistema y se cierra sola si desaparece
  reportada_por    uuid,
  detectada_at     timestamptz NOT NULL DEFAULT now(),
  ultima_deteccion timestamptz NOT NULL DEFAULT now(),
  resuelta_at      timestamptz,
  resuelta_por     uuid,
  resolucion       text
);
CREATE UNIQUE INDEX IF NOT EXISTS incidencias_abierta_unica ON public.incidencias(clave) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS incidencias_estado_idx ON public.incidencias(estado, prioridad, detectada_at DESC);
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incidencias_staff_read ON public.incidencias;
CREATE POLICY incidencias_staff_read ON public.incidencias
  FOR SELECT TO authenticated USING (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND (coach_id = auth.uid() OR reportada_por = auth.uid())));

CREATE TABLE IF NOT EXISTS public.incidencias_historial (
  id            bigserial PRIMARY KEY,
  incidencia_id uuid NOT NULL,
  accion        text NOT NULL,    -- detectada | reportada | resuelta | descartada | resuelta_auto | nota
  usuario_id    uuid,
  nota          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidencias_historial_idx ON public.incidencias_historial(incidencia_id, id);
ALTER TABLE public.incidencias_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incidencias_historial_staff_read ON public.incidencias_historial;
CREATE POLICY incidencias_historial_staff_read ON public.incidencias_historial
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host', 'recepcionista'));
DROP TRIGGER IF EXISTS incidencias_historial_inmutable ON public.incidencias_historial;
CREATE TRIGGER incidencias_historial_inmutable BEFORE UPDATE OR DELETE ON public.incidencias_historial
  FOR EACH ROW EXECUTE FUNCTION public.nexa_inmutable();

-- Abre una incidencia (o renueva su detección si ya está abierta). No reabre las descartadas.
CREATE OR REPLACE FUNCTION public.nexa_incidencia(
  p_tipo text, p_prioridad text, p_clave text, p_titulo text, p_descripcion text, p_accion text,
  p_atleta uuid DEFAULT NULL, p_reserva int DEFAULT NULL, p_plan text DEFAULT NULL, p_coach uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.incidencias WHERE clave = p_clave AND estado = 'descartada') THEN RETURN NULL; END IF;
  UPDATE public.incidencias SET ultima_deteccion = now(), descripcion = p_descripcion, prioridad = p_prioridad
   WHERE clave = p_clave AND estado = 'abierta' RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.incidencias (tipo, prioridad, clave, titulo, descripcion, accion_sugerida, atleta_id, reserva_id, plan_id, coach_id)
  VALUES (p_tipo, p_prioridad, p_clave, p_titulo, p_descripcion, p_accion, p_atleta, p_reserva, p_plan, p_coach)
  RETURNING id INTO v_id;
  INSERT INTO public.incidencias_historial (incidencia_id, accion, nota) VALUES (v_id, 'detectada', p_descripcion);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.nexa_nombre_atleta(p_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')) FROM public.atletas WHERE id = p_id
$$;

-- Revisión automática: detecta lo que el sistema no puede resolver solo.
-- Las incidencias automáticas que ya no se detectan se cierran solas.
CREATE OR REPLACE FUNCTION public.nexa_revisar_sistema()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.horario_config; v_hoy date := public.nexa_hoy(); r record; n int := 0; v_cerradas int;
BEGIN
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;

  -- a) Asistencia sin registrar (últimos 14 días), agrupada por profesor y día
  FOR r IN
    SELECT x.coach_id, public.nexa_dia(x.fecha) AS dia, count(*) AS total,
           string_agg(left(x.hora, 5) || ' ' || coalesce(public.nexa_nombre_atleta(x.alumno_id), '?'), ', ' ORDER BY left(x.hora, 5)) AS detalle
    FROM public.reservas x
    WHERE x.alumno_id IS NOT NULL AND x.estado IN ('pendiente', 'confirmada')
      AND coalesce(x.hora, '') ~ '^\d{2}:\d{2}'
      AND public.nexa_dia(x.fecha) BETWEEN v_hoy - 14 AND v_hoy
      AND public.nexa_inicio_clase(public.nexa_dia(x.fecha), x.hora)
          + make_interval(mins => coalesce(x.duracion_min, 60))
          + make_interval(hours => coalesce(v_cfg.alerta_asistencia_horas, 2)) < now()
    GROUP BY x.coach_id, public.nexa_dia(x.fecha)
  LOOP
    PERFORM public.nexa_incidencia('asistencia_pendiente', 'media',
      'asistencia:' || coalesce(r.coach_id::text, 'sin_profesor') || ':' || r.dia,
      'Asistencia sin registrar · ' || to_char(r.dia, 'DD-MM') || ' · ' || coalesce((SELECT nombre FROM public.coaches WHERE id = r.coach_id), 'sin profesor'),
      r.total || ' clase(s) sin marcar: ' || r.detalle || '. Mientras no se marquen, el crédito queda retenido.',
      'Marcar presente o no-show en Check-in.', NULL, NULL, NULL, r.coach_id);
    n := n + 1;
  END LOOP;

  -- b) Sobrecupo o mezcla 1:1 / 2:1 con el mismo profesor
  FOR r IN
    SELECT public.nexa_dia(x.fecha) AS dia, left(x.hora, 5) AS hora, x.coach_id,
           count(*) FILTER (WHERE public.nexa_modalidad(x.tipo_clase) = '1:1') AS n11,
           count(*) FILTER (WHERE public.nexa_modalidad(x.tipo_clase) = '2:1') AS n21
    FROM public.reservas x
    WHERE x.coach_id IS NOT NULL AND public.nexa_cat_credito(x.estado) <> 'libre'
      AND public.nexa_modalidad(x.tipo_clase) <> 'grupal' AND public.nexa_dia(x.fecha) >= v_hoy - 7
      AND coalesce(x.hora, '') ~ '^\d{2}:\d{2}'
    GROUP BY 1, 2, 3
    HAVING count(*) FILTER (WHERE public.nexa_modalidad(x.tipo_clase) = '1:1') > 1
        OR count(*) FILTER (WHERE public.nexa_modalidad(x.tipo_clase) = '2:1') > 2
        OR (count(*) FILTER (WHERE public.nexa_modalidad(x.tipo_clase) = '1:1') > 0
            AND count(*) FILTER (WHERE public.nexa_modalidad(x.tipo_clase) = '2:1') > 0)
  LOOP
    PERFORM public.nexa_incidencia('sobrecupo', 'alta', 'sobrecupo:' || r.dia || ':' || r.hora || ':' || r.coach_id,
      'Sobrecupo · ' || to_char(r.dia, 'DD-MM') || ' ' || r.hora,
      coalesce((SELECT nombre FROM public.coaches WHERE id = r.coach_id), 'Profesor') || ' tiene ' || r.n11 || ' alumno(s) 1:1 y ' || r.n21 || ' alumno(s) 2:1 a la misma hora.',
      'Mover a uno de los alumnos a otro profesor u horario.', NULL, NULL, NULL, r.coach_id);
    n := n + 1;
  END LOOP;

  -- c) Reservas duplicadas del mismo alumno a la misma hora
  FOR r IN
    SELECT x.alumno_id, public.nexa_dia(x.fecha) AS dia, left(x.hora, 5) AS hora, count(*) AS total
    FROM public.reservas x
    WHERE x.alumno_id IS NOT NULL AND public.nexa_cat_credito(x.estado) <> 'libre'
      AND public.nexa_dia(x.fecha) >= v_hoy - 7 AND coalesce(x.hora, '') ~ '^\d{2}:\d{2}'
    GROUP BY 1, 2, 3 HAVING count(*) > 1
  LOOP
    PERFORM public.nexa_incidencia('reserva_duplicada', 'alta', 'duplicada:' || r.alumno_id || ':' || r.dia || ':' || r.hora,
      'Reserva duplicada · ' || coalesce(public.nexa_nombre_atleta(r.alumno_id), 'alumno'),
      r.total || ' reservas el ' || to_char(r.dia, 'DD-MM') || ' a las ' || r.hora || '. Cada una consume un crédito.',
      'Cancelar (como NEXA) las reservas sobrantes.', r.alumno_id);
    n := n + 1;
  END LOOP;

  -- d) Más profesores a la vez que la capacidad física
  FOR r IN
    SELECT public.nexa_dia(x.fecha) AS dia, left(x.hora, 5) AS hora, count(DISTINCT x.coach_id) AS profes
    FROM public.reservas x
    WHERE x.coach_id IS NOT NULL AND public.nexa_cat_credito(x.estado) = 'comprometida'
      AND public.nexa_modalidad(x.tipo_clase) <> 'grupal' AND public.nexa_dia(x.fecha) >= v_hoy
      AND coalesce(x.hora, '') ~ '^\d{2}:\d{2}'
    GROUP BY 1, 2 HAVING count(DISTINCT x.coach_id) > coalesce(v_cfg.max_profesores, 3)
  LOOP
    PERFORM public.nexa_incidencia('capacidad', 'media', 'capacidad:' || r.dia || ':' || r.hora,
      'Capacidad superada · ' || to_char(r.dia, 'DD-MM') || ' ' || r.hora,
      r.profes || ' profesores a la vez (máximo ' || coalesce(v_cfg.max_profesores, 3) || ').',
      'Mover una de las clases.');
    n := n + 1;
  END LOOP;

  -- e) Planes con más clases comprometidas que contratadas (saldo negativo)
  FOR r IN
    SELECT p.id, p.alumno_id AS alumno_id, p.nombre, coalesce(p.total_clases, 0) AS total,
           public.nexa_clases_comprometidas(p.id) AS comp
    FROM public.planes p
    WHERE public.nexa_fin_plan(p) >= v_hoy - 30
      AND public.nexa_clases_comprometidas(p.id) > coalesce(p.total_clases, 0)
  LOOP
    PERFORM public.nexa_incidencia('saldo_negativo', 'alta', 'saldo:' || r.id,
      'Clases sobre el plan · ' || coalesce(public.nexa_nombre_atleta(public.nexa_uuid(r.alumno_id)), 'alumno'),
      'Plan «' || r.nombre || '»: ' || r.comp || ' clases usadas o agendadas de ' || r.total || ' contratadas.',
      'Revisar si falta marcar cancelaciones, ampliar el plan o quitar clases.', public.nexa_uuid(r.alumno_id), NULL, r.id);
    n := n + 1;
  END LOOP;

  -- f) Clases futuras sin plan que las respalde
  FOR r IN
    SELECT x.alumno_id, count(*) AS total, min(public.nexa_dia(x.fecha)) AS desde
    FROM public.reservas x LEFT JOIN public.planes p ON p.id = x.plan_id::text
    WHERE x.alumno_id IS NOT NULL AND public.nexa_cat_credito(x.estado) = 'comprometida'
      AND public.nexa_modalidad(x.tipo_clase) <> 'grupal' AND public.nexa_dia(x.fecha) >= v_hoy
      AND (p.id IS NULL OR public.nexa_dia(x.fecha) > public.nexa_fin_plan(p)
           OR public.nexa_dia(x.fecha) < nullif(p.start_date, '')::date)
    GROUP BY x.alumno_id
  LOOP
    PERFORM public.nexa_incidencia('sin_plan', 'media', 'sin_plan:' || r.alumno_id,
      'Clases sin plan vigente · ' || coalesce(public.nexa_nombre_atleta(r.alumno_id), 'alumno'),
      r.total || ' clase(s) agendada(s) desde el ' || to_char(r.desde, 'DD-MM') || ' fuera de la vigencia del plan o sin plan.',
      'Renovar el plan del alumno o liberar esas clases.', r.alumno_id);
    n := n + 1;
  END LOOP;

  -- g) Clases futuras sin profesor
  FOR r IN
    SELECT public.nexa_dia(x.fecha) AS dia, count(*) AS total
    FROM public.reservas x
    WHERE x.coach_id IS NULL AND x.alumno_id IS NOT NULL AND public.nexa_cat_credito(x.estado) = 'comprometida'
      AND public.nexa_modalidad(x.tipo_clase) <> 'grupal' AND public.nexa_dia(x.fecha) BETWEEN v_hoy AND v_hoy + 14
    GROUP BY 1
  LOOP
    PERFORM public.nexa_incidencia('sin_profesor', 'media', 'sin_profesor:' || r.dia,
      'Clases sin profesor · ' || to_char(r.dia, 'DD-MM'), r.total || ' clase(s) sin profesor asignado.',
      'Asignar profesor en Horario.');
    n := n + 1;
  END LOOP;

  -- h) Correos que no se pudieron enviar
  FOR r IN
    SELECT x.id, x.atleta_id, x.tipo, x.error FROM public.notificaciones x
    WHERE (x.estado = 'error' AND x.intentos >= 3)
       OR (x.estado = 'omitida' AND x.error = 'alumno sin email' AND x.created_at > now() - interval '30 days')
  LOOP
    PERFORM public.nexa_incidencia('notificacion_fallida', 'baja', 'notif:' || r.id,
      'Correo no enviado · ' || coalesce(public.nexa_nombre_atleta(r.atleta_id), 'alumno'),
      'Aviso «' || r.tipo || '»: ' || coalesce(r.error, 'error desconocido') || '.',
      'Revisar el email del alumno o la configuración de correo.', r.atleta_id);
    n := n + 1;
  END LOOP;

  -- i) Pagos registrados dos veces
  FOR r IN
    SELECT a.alumno_id, a.monto, coalesce(a.plan_id, '') AS plan_id, count(*) AS total, min(a.id::text) AS primero
    FROM public.pagos a
    WHERE a.estado = 'pagado' AND a.created_at > now() - interval '120 days'
    GROUP BY a.alumno_id, a.monto, coalesce(a.plan_id, ''), date_trunc('day', coalesce(a.fecha_pago, a.created_at))
    HAVING count(*) > 1
  LOOP
    PERFORM public.nexa_incidencia('pago_duplicado', 'alta', 'pago_dup:' || r.primero,
      'Posible pago duplicado · ' || coalesce(public.nexa_nombre_atleta(r.alumno_id), 'alumno'),
      r.total || ' pagos de $' || r.monto || ' el mismo día para el mismo plan.',
      'Verificar con el comprobante y anular el duplicado.', r.alumno_id, NULL, nullif(r.plan_id, ''));
    n := n + 1;
  END LOOP;

  -- j) Plan con clases en uso pero sin pago confirmado
  FOR r IN
    SELECT p.id, p.alumno_id AS alumno_id, p.nombre, p.estado_pago FROM public.planes p
    WHERE p.estado_pago IN ('pendiente', 'verificando') AND public.nexa_fin_plan(p) >= v_hoy
      AND EXISTS (SELECT 1 FROM public.reservas x WHERE x.plan_id::text = p.id AND public.nexa_cat_credito(x.estado) <> 'libre')
  LOOP
    PERFORM public.nexa_incidencia('plan_sin_pago', 'media', 'plan_sin_pago:' || r.id,
      'Plan en uso sin pago confirmado · ' || coalesce(public.nexa_nombre_atleta(public.nexa_uuid(r.alumno_id)), 'alumno'),
      'Plan «' || r.nombre || '» con pago ' || r.estado_pago || '.',
      'Validar el pago o suspender las reservas.', public.nexa_uuid(r.alumno_id), NULL, r.id);
    n := n + 1;
  END LOOP;

  -- k) Historial de créditos que no coincide con el estado de la reserva
  FOR r IN
    SELECT x.id, x.alumno_id, x.estado, m.estado_despues
    FROM public.reservas x
    LEFT JOIN LATERAL (SELECT mm.estado_despues, mm.plan_id FROM public.movimientos_credito mm
                       WHERE mm.reserva_id = x.id ORDER BY mm.id DESC LIMIT 1) m ON true
    WHERE x.plan_id IS NOT NULL AND public.nexa_dia(x.fecha) >= v_hoy - 60
      AND (public.nexa_cat_credito(coalesce(m.estado_despues, 'cancelada')) <> public.nexa_cat_credito(x.estado)
           OR (public.nexa_cat_credito(x.estado) <> 'libre' AND m.plan_id IS DISTINCT FROM x.plan_id::text))
  LOOP
    PERFORM public.nexa_incidencia('descuadre_creditos', 'media', 'descuadre:' || r.id,
      'Saldo de clases inconsistente · ' || coalesce(public.nexa_nombre_atleta(r.alumno_id), 'alumno'),
      'La reserva #' || r.id || ' está «' || r.estado || '» pero su último movimiento de crédito dice «' || coalesce(r.estado_despues, 'sin movimiento') || '».',
      'Revisar el historial de la reserva.', r.alumno_id, r.id);
    n := n + 1;
  END LOOP;

  -- Cierra las incidencias automáticas que ya no aparecen
  WITH cerradas AS (
    UPDATE public.incidencias SET estado = 'resuelta', resuelta_at = now(),
           resolucion = 'Se corrigió (detectado automáticamente)'
     WHERE estado = 'abierta' AND automatica AND ultima_deteccion < now()
    RETURNING id)
  INSERT INTO public.incidencias_historial (incidencia_id, accion, nota)
  SELECT id, 'resuelta_auto', 'Ya no se detecta' FROM cerradas;
  GET DIAGNOSTICS v_cerradas = ROW_COUNT;

  RETURN jsonb_build_object('detectadas', n, 'cerradas', v_cerradas);
END $$;

-- Acciones del staff sobre la bandeja
CREATE OR REPLACE FUNCTION public.staff_resolver_incidencia(p_id uuid, p_estado text, p_nota text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.incidencias;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  IF p_estado NOT IN ('resuelta', 'descartada', 'nota') THEN RETURN jsonb_build_object('ok', false, 'error', 'estado_invalido'); END IF;
  IF p_estado <> 'resuelta' AND coalesce(trim(p_nota), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nota_requerida');
  END IF;
  SELECT * INTO i FROM public.incidencias WHERE id = p_id FOR UPDATE;
  IF i.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF p_estado <> 'nota' THEN
    IF i.estado <> 'abierta' THEN RETURN jsonb_build_object('ok', false, 'error', 'ya_cerrada'); END IF;
    UPDATE public.incidencias SET estado = p_estado, resuelta_at = now(), resuelta_por = auth.uid(), resolucion = nullif(trim(p_nota), '')
     WHERE id = p_id;
  END IF;
  INSERT INTO public.incidencias_historial (incidencia_id, accion, usuario_id, nota)
  VALUES (p_id, p_estado, auth.uid(), nullif(trim(p_nota), ''));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Un profesor (o el staff) informa una incidencia manual
CREATE OR REPLACE FUNCTION public.staff_reportar_incidencia(p_titulo text, p_descripcion text, p_reserva_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; r public.reservas;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista', 'profesor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  IF coalesce(trim(p_titulo), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'titulo_requerido'); END IF;
  IF p_reserva_id IS NOT NULL THEN SELECT * INTO r FROM public.reservas WHERE id = p_reserva_id; END IF;
  INSERT INTO public.incidencias (tipo, prioridad, clave, titulo, descripcion, atleta_id, reserva_id, coach_id, automatica, reportada_por)
  VALUES ('reporte_staff', 'media', 'reporte:' || gen_random_uuid(), left(trim(p_titulo), 140), p_descripcion,
          r.alumno_id, r.id, coalesce(r.coach_id, CASE WHEN get_my_role() = 'profesor' THEN auth.uid() END), false, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.incidencias_historial (incidencia_id, accion, usuario_id, nota) VALUES (v_id, 'reportada', auth.uid(), p_descripcion);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- Tarea programada (cada hora, ver 043): recordatorios + revisión
CREATE OR REPLACE FUNCTION public.nexa_tareas_programadas()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec int; v_rev jsonb;
BEGIN
  PERFORM set_config('nexa.origen', 'sistema', true);
  v_rec := public.nexa_encolar_recordatorios();
  v_rev := public.nexa_revisar_sistema();
  RETURN jsonb_build_object('recordatorios', v_rec, 'revision', v_rev);
END $$;

-- El staff puede pedir una revisión inmediata desde el panel
CREATE OR REPLACE FUNCTION public.staff_revisar_ahora()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;
  RETURN jsonb_build_object('ok', true) || public.nexa_revisar_sistema();
END $$;

-- ── Permisos ────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'alumno_mi_plan()',
    'alumno_mis_movimientos(int)',
    'staff_resumen_plan(text)',
    'staff_resolver_incidencia(uuid, text, text)',
    'staff_reportar_incidencia(text, text, int)',
    'staff_revisar_ahora()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'nexa_resumen_plan(text)',
    'nexa_proxima_clase(uuid)',
    'nexa_encolar_recordatorios()',
    'nexa_revisar_sistema()',
    'nexa_tareas_programadas()',
    'nexa_incidencia(text, text, text, text, text, text, uuid, int, text, uuid)',
    'nexa_nombre_atleta(uuid)',
    'nexa_condiciones_vigentes()',
    'nexa_mov_reserva()',
    'nexa_mov_plan()',
    'nexa_avisos_reserva()',
    'nexa_guardia_reserva()',
    'nexa_planes_condiciones()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
