-- ============================================================
-- NEXA 041 — Autogestión del alumno: cancelar, reagendar y reservar
-- ============================================================
-- Todo se valida aquí, en la base de datos, con la hora del servidor y la
-- zona horaria de Chile. El navegador solo muestra; nunca decide.
--
--  1. Política: corte AM a las 22:00, 12:00 inclusive como AM, límites nuevos.
--  2. Bloqueos por profesor (vacaciones, descansos, ausencias).
--  3. Auditoría de toda modificación de reservas.
--  4. Cola de notificaciones (sin duplicados) y lista de espera.
--  5. Cupos sin carreras: candado por horario en el trigger de choque 1:1/2:1
--     + tope de profesores simultáneos (capacidad física).
--  6. Funciones del alumno (SECURITY DEFINER, verifican auth.uid()):
--       alumno_politica, alumno_horarios_disponibles, alumno_cancelar_reserva,
--       alumno_reagendar_reserva, alumno_reservar_clase, alumno_lista_espera.
--  7. Excepción administrativa: admin_devolver_credito.
--
-- Re-ejecutable. Aplicar después de la 040.
-- ============================================================

-- ── 1. Política ─────────────────────────────────────────────
ALTER TABLE public.horario_config
  ADD COLUMN IF NOT EXISTS max_reagendas_por_plan int,            -- null = sin límite
  ADD COLUMN IF NOT EXISTS lista_espera_activa    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS antelacion_min_reserva int NOT NULL DEFAULT 60; -- minutos mínimos para reservar

-- Regla A: hasta las 22:00 del día anterior (antes estaba en 21:00).
UPDATE public.horario_config SET corte_cancelacion_am = '22:00' WHERE id = 1 AND corte_cancelacion_am = '21:00';
ALTER TABLE public.horario_config ALTER COLUMN corte_cancelacion_am SET DEFAULT '22:00';
COMMENT ON COLUMN public.horario_config.limite_hora_am IS
  'Clases que empiezan a esta hora o ANTES (inclusive) se cancelan hasta corte_cancelacion_am del día anterior';

-- ── 2. Bloqueos por profesor ────────────────────────────────
ALTER TABLE public.horario_bloqueos
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tipo     text NOT NULL DEFAULT 'cierre'; -- cierre | vacaciones | descanso | ausencia
COMMENT ON COLUMN public.horario_bloqueos.coach_id IS 'null = bloquea a todo el gimnasio';
CREATE INDEX IF NOT EXISTS horario_bloqueos_fecha_idx ON public.horario_bloqueos(fecha);

-- ── 3. Auditoría ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auditoria_reservas (
  id          bigserial PRIMARY KEY,
  reserva_id  int,
  accion      text NOT NULL,        -- insert | update | delete | cancelar | reagendar | reservar | excepcion
  origen      text,                 -- alumno | staff | sistema
  usuario_id  uuid,
  antes       jsonb,
  despues     jsonb,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_reservas_reserva_idx ON public.auditoria_reservas(reserva_id);
CREATE INDEX IF NOT EXISTS auditoria_reservas_fecha_idx   ON public.auditoria_reservas(created_at DESC);
ALTER TABLE public.auditoria_reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_staff_read ON public.auditoria_reservas;
CREATE POLICY auditoria_staff_read ON public.auditoria_reservas
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));
-- Sin políticas de escritura: solo escriben los triggers/funciones.

CREATE OR REPLACE FUNCTION public.nexa_auditar_reserva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_origen text := coalesce(nullif(current_setting('nexa.origen', true), ''), 'staff');
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
  INSERT INTO public.auditoria_reservas (reserva_id, accion, origen, usuario_id, antes, despues, motivo)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    lower(TG_OP), v_origen, auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    nullif(current_setting('nexa.motivo', true), '')
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS reservas_auditoria ON public.reservas;
CREATE TRIGGER reservas_auditoria
  AFTER INSERT OR UPDATE OR DELETE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_auditar_reserva();

-- ── 4. Notificaciones y lista de espera ─────────────────────
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id   uuid REFERENCES public.atletas(id) ON DELETE CASCADE,
  tipo        text NOT NULL,   -- reserva_confirmada | reserva_cancelada | reserva_reagendada | cupo_liberado | ...
  canal       text NOT NULL DEFAULT 'email',   -- email | whatsapp
  datos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave       text NOT NULL UNIQUE,            -- evita envíos duplicados
  estado      text NOT NULL DEFAULT 'pendiente', -- pendiente | enviando | enviada | error | omitida
  intentos    int  NOT NULL DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviada_at  timestamptz
);
CREATE INDEX IF NOT EXISTS notificaciones_pendientes_idx ON public.notificaciones(estado, created_at) WHERE estado IN ('pendiente', 'error');
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificaciones_staff_read ON public.notificaciones;
CREATE POLICY notificaciones_staff_read ON public.notificaciones
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'host'));

CREATE TABLE IF NOT EXISTS public.lista_espera (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id     uuid NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  hora          text NOT NULL,
  modalidad     text NOT NULL,
  reserva_id    int,              -- clase que quiere mover (null = reserva nueva)
  estado        text NOT NULL DEFAULT 'activa', -- activa | notificada | cancelada
  created_at    timestamptz NOT NULL DEFAULT now(),
  notificada_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS lista_espera_unica ON public.lista_espera(atleta_id, fecha, hora) WHERE estado = 'activa';
CREATE INDEX IF NOT EXISTS lista_espera_slot_idx ON public.lista_espera(fecha, hora) WHERE estado = 'activa';
ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lista_espera_staff ON public.lista_espera;
CREATE POLICY lista_espera_staff ON public.lista_espera
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'recepcionista'))
  WITH CHECK (get_my_role() IN ('admin', 'host', 'recepcionista'));
DROP POLICY IF EXISTS lista_espera_self_read ON public.lista_espera;
CREATE POLICY lista_espera_self_read ON public.lista_espera
  FOR SELECT TO authenticated
  USING (atleta_id IN (SELECT id FROM public.atletas WHERE user_id = auth.uid() OR perfil_id = auth.uid()));

-- ── Utilidades ──────────────────────────────────────────────
-- Estados que ya no ocupan cupo
CREATE OR REPLACE FUNCTION public.nexa_estado_inactivo(p_estado text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_estado, '') IN ('cancelada','cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','reagendada','bloqueada')
$$;

-- `reservas.fecha` se guarda como medianoche UTC
CREATE OR REPLACE FUNCTION public.nexa_dia(p_fecha timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT (p_fecha AT TIME ZONE 'UTC')::date $$;

CREATE OR REPLACE FUNCTION public.nexa_hoy()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Santiago')::date $$;

-- Instante real en que empieza una clase (hora de Chile, con cambios de horario)
CREATE OR REPLACE FUNCTION public.nexa_inicio_clase(p_fecha date, p_hora text)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (p_fecha + left(p_hora, 5)::time) AT TIME ZONE 'America/Santiago'
$$;

-- Último instante para cancelar/reagendar sin perder la clase (Reglas A y B)
CREATE OR REPLACE FUNCTION public.nexa_limite_cancelacion(p_fecha date, p_hora text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN left(p_hora, 5) <= coalesce(c.limite_hora_am, '12:00')
      THEN ((p_fecha - 1) + coalesce(c.corte_cancelacion_am, '22:00')::time) AT TIME ZONE 'America/Santiago'
    ELSE public.nexa_inicio_clase(p_fecha, p_hora) - make_interval(hours => coalesce(c.cancel_horas_aviso_pm, 6))
  END
  FROM (SELECT 1) x LEFT JOIN public.horario_config c ON c.id = 1
$$;

CREATE OR REPLACE FUNCTION public.nexa_modalidad(p_tipo_clase text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_tipo_clase ILIKE '%grupal%' THEN 'grupal'
    WHEN p_tipo_clase ILIKE '%2:1%' OR p_tipo_clase ILIKE '%duo%' OR p_tipo_clase ILIKE '%dúo%' THEN '2:1'
    ELSE '1:1'
  END
$$;

CREATE OR REPLACE FUNCTION public.nexa_lock_slot(p_fecha date, p_hora text)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtext('nexa_slot:' || p_fecha::text || ' ' || left(p_hora, 5))::bigint)
$$;

-- Atleta de la sesión actual (invitado → user_id; registrado solo → perfil_id)
CREATE OR REPLACE FUNCTION public.nexa_atleta_actual()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.atletas
  WHERE auth.uid() IS NOT NULL AND (user_id = auth.uid() OR perfil_id = auth.uid())
  ORDER BY (user_id = auth.uid()) DESC NULLS LAST
  LIMIT 1
$$;

-- Plan vigente del alumno en una fecha (el más reciente que la cubra)
CREATE OR REPLACE FUNCTION public.nexa_plan_vigente(p_atleta uuid, p_fecha date)
RETURNS public.planes LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.planes p
  WHERE p.alumno_id = p_atleta::text
    AND nullif(p.start_date, '')::date <= p_fecha
    AND greatest(nullif(p.end_date, '')::date, coalesce(nullif(p.extended_until, '')::date, nullif(p.end_date, '')::date)) >= p_fecha
  ORDER BY nullif(p.start_date, '')::date DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.nexa_fin_plan(p public.planes)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT greatest(nullif(p.end_date, '')::date, coalesce(nullif(p.extended_until, '')::date, nullif(p.end_date, '')::date))
$$;

-- Clases del plan ya comprometidas (usadas + agendadas). Igual que cuentaEnPlan() en planes-supabase.ts
CREATE OR REPLACE FUNCTION public.nexa_clases_comprometidas(p_plan_id text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.reservas r
  WHERE r.plan_id::text = p_plan_id
    AND (
      r.estado IN ('presente', 'no_show', 'cancelada_tarde')
      OR (
        NOT public.nexa_estado_inactivo(r.estado)
        AND NOT (r.estado IN ('pendiente', 'confirmada') AND public.nexa_dia(r.fecha) < public.nexa_hoy())
      )
    )
$$;

-- ¿La hora está dentro del horario de funcionamiento y de la grilla? (lun–sáb)
CREATE OR REPLACE FUNCTION public.nexa_hora_valida(p_fecha date, p_hora text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.horario_config c, jsonb_array_elements(c.dias) d
    WHERE c.id = 1
      AND extract(dow FROM p_fecha) <> 0
      AND (d->>'dow')::int = extract(dow FROM p_fecha)::int
      AND (d->>'abierto')::boolean
      AND left(p_hora, 5) ~ '^\d{2}:\d{2}$'
      AND left(p_hora, 5) >= d->>'apertura'
      AND left(p_hora, 5) <= d->>'cierre'
      AND ((extract(epoch FROM left(p_hora, 5)::time) - extract(epoch FROM (d->>'apertura')::time)) / 60)::int
          % greatest(c.duracion_bloque, 1) = 0
  )
$$;

-- Cupos libres de un profesor en un horario para una modalidad (0 = no disponible)
CREATE OR REPLACE FUNCTION public.nexa_cupos_slot(
  p_fecha date, p_hora text, p_coach uuid, p_modalidad text, p_excluir int DEFAULT NULL
) RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cnt int; v_1a1 boolean; v_coaches int; v_max int;
BEGIN
  IF NOT public.nexa_hora_valida(p_fecha, p_hora) THEN RETURN 0; END IF;

  -- Bloqueos del gimnasio o del profesor
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

  -- Capacidad física: profesores trabajando a la vez
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

-- ── 5. Trigger de choque 1:1/2:1 con candado (sin carreras) ─
-- Reemplaza el de la 040: igual lógica + candado por horario + capacidad física.
CREATE OR REPLACE FUNCTION public.check_reserva_tipo_clash()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_count int; v_has_1a1 boolean; v_coaches int; v_max int;
BEGIN
  IF NEW.estado IN ('cancelada','cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','reagendada','bloqueada') THEN
    RETURN NEW;
  END IF;
  IF NEW.tipo_clase IS NULL OR (NEW.tipo_clase NOT ILIKE '%1:1%' AND NEW.tipo_clase NOT ILIKE '%2:1%') THEN
    RETURN NEW;
  END IF;
  -- Un UPDATE que no cambia horario, profesor ni tipo no necesita revalidar
  IF TG_OP = 'UPDATE'
     AND NOT public.nexa_estado_inactivo(OLD.estado)
     AND OLD.fecha = NEW.fecha AND OLD.hora IS NOT DISTINCT FROM NEW.hora
     AND OLD.coach_id IS NOT DISTINCT FROM NEW.coach_id AND OLD.tipo_clase IS NOT DISTINCT FROM NEW.tipo_clase THEN
    RETURN NEW;
  END IF;

  -- Dos personas pidiendo el último cupo a la vez: la segunda espera aquí y luego ve la primera.
  PERFORM public.nexa_lock_slot(public.nexa_dia(NEW.fecha), coalesce(NEW.hora, ''));

  SELECT COUNT(*), BOOL_OR(r.tipo_clase ILIKE '%1:1%')
    INTO v_count, v_has_1a1
  FROM public.reservas r
  WHERE r.fecha = NEW.fecha AND r.hora = NEW.hora
    AND ((NEW.coach_id IS NULL AND r.coach_id IS NULL) OR r.coach_id = NEW.coach_id)
    AND r.tipo_clase NOT ILIKE '%grupal%'
    AND r.estado NOT IN ('cancelada','cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','reagendada','bloqueada')
    AND r.id IS DISTINCT FROM NEW.id;

  IF NEW.tipo_clase ILIKE '%1:1%' THEN
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Conflicto 1:1: el horario % % ya tiene otra sesión activa. Un 1:1 requiere horario exclusivo.', NEW.fecha, NEW.hora;
    END IF;
  ELSIF NEW.tipo_clase ILIKE '%2:1%' THEN
    IF v_has_1a1 THEN
      RAISE EXCEPTION 'Conflicto 2:1: el horario % % ya tiene una sesión 1:1. No se puede mezclar.', NEW.fecha, NEW.hora;
    END IF;
    IF v_count >= 2 THEN
      RAISE EXCEPTION 'Conflicto 2:1: el horario % % ya tiene 2 alumnos. Cupo completo.', NEW.fecha, NEW.hora;
    END IF;
  END IF;

  -- Capacidad física del gimnasio (profesores simultáneos)
  IF v_count = 0 AND NEW.coach_id IS NOT NULL THEN
    SELECT coalesce(max_profesores, 3) INTO v_max FROM public.horario_config WHERE id = 1;
    SELECT COUNT(DISTINCT r.coach_id) INTO v_coaches
    FROM public.reservas r
    WHERE r.fecha = NEW.fecha AND r.hora = NEW.hora
      AND r.coach_id IS NOT NULL AND r.coach_id <> NEW.coach_id
      AND r.tipo_clase NOT ILIKE '%grupal%'
      AND r.estado NOT IN ('cancelada','cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','reagendada','bloqueada')
      AND r.id IS DISTINCT FROM NEW.id;
    IF v_coaches >= coalesce(v_max, 3) THEN
      RAISE EXCEPTION 'Capacidad del gimnasio: el horario % % ya tiene % profesores trabajando.', NEW.fecha, NEW.hora, v_coaches;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reservas_tipo_clash_check ON public.reservas;
CREATE TRIGGER reservas_tipo_clash_check
  BEFORE INSERT OR UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.check_reserva_tipo_clash();

-- ── Notificar a la lista de espera cuando se libera un cupo ─
CREATE OR REPLACE FUNCTION public.nexa_avisar_lista_espera(p_fecha date, p_hora text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e record; n int := 0; v_activa boolean;
BEGIN
  SELECT coalesce(lista_espera_activa, true) INTO v_activa FROM public.horario_config WHERE id = 1;
  IF NOT coalesce(v_activa, true) THEN RETURN 0; END IF;

  FOR e IN
    SELECT * FROM public.lista_espera
    WHERE fecha = p_fecha AND hora = left(p_hora, 5) AND estado = 'activa'
    ORDER BY created_at                 -- prioridad: orden de llegada
  LOOP
    CONTINUE WHEN public.nexa_plan_vigente(e.atleta_id, p_fecha) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.coaches c WHERE c.activo AND public.nexa_cupos_slot(p_fecha, p_hora, c.id, e.modalidad) > 0
    );
    UPDATE public.lista_espera SET estado = 'notificada', notificada_at = now() WHERE id = e.id;
    INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
    VALUES (e.atleta_id, 'cupo_liberado',
            jsonb_build_object('fecha', p_fecha, 'hora', left(p_hora, 5), 'modalidad', e.modalidad),
            'espera:' || e.id::text)
    ON CONFLICT (clave) DO NOTHING;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Datos de una reserva para correos (fecha, hora, profesor, modalidad)
CREATE OR REPLACE FUNCTION public.nexa_datos_reserva(p_id int)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reserva_id', r.id, 'fecha', public.nexa_dia(r.fecha), 'hora', left(r.hora, 5),
    'modalidad', public.nexa_modalidad(r.tipo_clase), 'profesor', c.nombre)
  FROM public.reservas r LEFT JOIN public.coaches c ON c.id = r.coach_id
  WHERE r.id = p_id
$$;

-- ── 6. Funciones del alumno ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.alumno_politica()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'limite_hora_am',        coalesce(c.limite_hora_am, '12:00'),
    'corte_cancelacion_am',  coalesce(c.corte_cancelacion_am, '22:00'),
    'cancel_horas_aviso_pm', coalesce(c.cancel_horas_aviso_pm, 6),
    'reagenda_validez_dias', c.reagenda_validez_dias,
    'max_reagendas_por_plan', c.max_reagendas_por_plan,
    'lista_espera_activa',   coalesce(c.lista_espera_activa, true),
    'dias',                  c.dias,
    'duracion_bloque',       coalesce(c.duracion_bloque, 60),
    'ahora',                 now())
  FROM (SELECT 1) x LEFT JOIN public.horario_config c ON c.id = 1
$$;

-- Horarios que el alumno puede tomar. Con p_reserva_id: destinos para reagendar esa clase.
CREATE OR REPLACE FUNCTION public.alumno_horarios_disponibles(
  p_desde date, p_hasta date, p_reserva_id int DEFAULT NULL
) RETURNS TABLE (fecha date, hora text, coach_id uuid, profesor text, modalidad text, cupos int, capacidad int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_atleta uuid := public.nexa_atleta_actual();
  v_plan public.planes; v_mod text; v_hasta date; v_desde date; v_cfg public.horario_config;
  v_orig public.reservas;
BEGIN
  IF v_atleta IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;

  IF p_reserva_id IS NOT NULL THEN
    SELECT * INTO v_orig FROM public.reservas r WHERE r.id = p_reserva_id AND r.alumno_id = v_atleta;
    IF v_orig.id IS NULL THEN RAISE EXCEPTION 'Clase no encontrada'; END IF;
    SELECT * INTO v_plan FROM public.planes p WHERE p.id = v_orig.plan_id::text;
    v_mod := public.nexa_modalidad(v_orig.tipo_clase);
  ELSE
    v_plan := public.nexa_plan_vigente(v_atleta, public.nexa_hoy());
    SELECT coalesce(v_plan.modalidad, a.tipo_sesion, '1:1') INTO v_mod FROM public.atletas a WHERE a.id = v_atleta;
  END IF;
  IF v_plan.id IS NULL THEN RETURN; END IF;

  v_desde := greatest(p_desde, public.nexa_hoy(), nullif(v_plan.start_date, '')::date);
  v_hasta := least(p_hasta, public.nexa_fin_plan(v_plan), v_desde + 62);
  IF p_reserva_id IS NOT NULL AND coalesce(v_cfg.reagenda_validez_dias, 0) > 0 THEN
    v_hasta := least(v_hasta, public.nexa_dia(v_orig.fecha) + v_cfg.reagenda_validez_dias);
  END IF;
  IF v_hasta < v_desde THEN RETURN; END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT g::date AS f FROM generate_series(v_desde, v_hasta, interval '1 day') g
  ), horas AS (
    SELECT d.f, to_char(t, 'HH24:MI') AS h
    FROM dias d
    JOIN LATERAL jsonb_array_elements(v_cfg.dias) cfg ON (cfg->>'dow')::int = extract(dow FROM d.f)::int
    CROSS JOIN LATERAL generate_series(
      d.f + (cfg->>'apertura')::time, d.f + (cfg->>'cierre')::time,
      make_interval(mins => greatest(v_cfg.duracion_bloque, 1))) t
    WHERE (cfg->>'abierto')::boolean AND extract(dow FROM d.f) <> 0
  ), slots AS (
    SELECT h.f, h.h, c.id AS cid, c.nombre,
           public.nexa_cupos_slot(h.f, h.h, c.id, v_mod, p_reserva_id) AS libres
    FROM horas h CROSS JOIN public.coaches c
    WHERE c.activo
      AND public.nexa_inicio_clase(h.f, h.h) > now() + make_interval(mins => coalesce(v_cfg.antelacion_min_reserva, 60))
      -- el alumno no puede tener otra clase a esa hora
      AND NOT EXISTS (
        SELECT 1 FROM public.reservas r
        WHERE r.alumno_id = v_atleta AND public.nexa_dia(r.fecha) = h.f AND left(r.hora, 5) = h.h
          AND NOT public.nexa_estado_inactivo(r.estado) AND r.id IS DISTINCT FROM p_reserva_id)
  )
  SELECT s.f, s.h, s.cid, s.nombre, v_mod, s.libres, CASE WHEN v_mod = '2:1' THEN 2 ELSE 1 END
  FROM slots s
  WHERE s.libres > 0
  ORDER BY s.f, s.h, s.nombre;
END $$;

-- Cancelar una clase: solo dentro de plazo (conserva el crédito).
CREATE OR REPLACE FUNCTION public.alumno_cancelar_reserva(p_reserva_id int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual();
  r public.reservas; v_dia date; v_limite timestamptz;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  SELECT * INTO r FROM public.reservas WHERE id = p_reserva_id AND alumno_id = v_atleta FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF public.nexa_estado_inactivo(r.estado) OR r.estado = 'presente' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_activa');
  END IF;
  IF coalesce(r.hora, '') !~ '^\d{2}:\d{2}' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_hora');
  END IF;
  v_dia := public.nexa_dia(r.fecha);
  v_limite := public.nexa_limite_cancelacion(v_dia, r.hora);
  IF now() > v_limite THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fuera_de_plazo', 'limite', v_limite);
  END IF;

  PERFORM set_config('nexa.origen', 'alumno', true);
  PERFORM set_config('nexa.motivo', 'Cancelación del alumno dentro de plazo', true);
  UPDATE public.reservas SET estado = 'cancelada_tiempo' WHERE id = r.id;

  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (v_atleta, 'reserva_cancelada', public.nexa_datos_reserva(r.id), 'cancelada:' || r.id)
  ON CONFLICT (clave) DO NOTHING;
  PERFORM public.nexa_avisar_lista_espera(v_dia, r.hora);

  RETURN jsonb_build_object('ok', true, 'reserva_id', r.id);
END $$;

-- Reagendar: mueve la clase en una sola transacción. Si algo falla, la original queda intacta.
CREATE OR REPLACE FUNCTION public.alumno_reagendar_reserva(
  p_reserva_id int, p_fecha date, p_hora text, p_coach_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual();
  r public.reservas; v_plan public.planes; v_cfg public.horario_config;
  v_dia date; v_nueva int; v_reagenda text; v_mod text; v_n int;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  SELECT * INTO r FROM public.reservas WHERE id = p_reserva_id AND alumno_id = v_atleta FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF public.nexa_estado_inactivo(r.estado) OR r.estado = 'presente' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_activa');
  END IF;
  IF coalesce(r.hora, '') !~ '^\d{2}:\d{2}' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_hora');
  END IF;
  v_dia := public.nexa_dia(r.fecha);
  IF now() > public.nexa_limite_cancelacion(v_dia, r.hora) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fuera_de_plazo', 'limite', public.nexa_limite_cancelacion(v_dia, r.hora));
  END IF;
  IF v_dia = p_fecha AND left(r.hora, 5) = left(p_hora, 5) AND r.coach_id IS NOT DISTINCT FROM p_coach_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mismo_horario');
  END IF;

  SELECT * INTO v_plan FROM public.planes WHERE id = r.plan_id::text;
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_plan'); END IF;
  IF p_fecha < nullif(v_plan.start_date, '')::date OR p_fecha > public.nexa_fin_plan(v_plan) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fuera_de_vigencia');
  END IF;
  IF coalesce(v_cfg.reagenda_validez_dias, 0) > 0 AND p_fecha > v_dia + v_cfg.reagenda_validez_dias THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fuera_de_vigencia');
  END IF;
  IF v_cfg.max_reagendas_por_plan IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.reagendas WHERE plan_id = v_plan.id AND estado = 'completada';
    IF v_n >= v_cfg.max_reagendas_por_plan THEN
      RETURN jsonb_build_object('ok', false, 'error', 'max_reagendas');
    END IF;
  END IF;
  IF public.nexa_inicio_clase(p_fecha, p_hora) <= now() + make_interval(mins => coalesce(v_cfg.antelacion_min_reserva, 60)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo');
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservas x
             WHERE x.alumno_id = v_atleta AND public.nexa_dia(x.fecha) = p_fecha AND left(x.hora, 5) = left(p_hora, 5)
               AND NOT public.nexa_estado_inactivo(x.estado) AND x.id <> r.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'choque_alumno');
  END IF;

  v_mod := public.nexa_modalidad(r.tipo_clase);
  PERFORM public.nexa_lock_slot(p_fecha, p_hora);
  IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE id = p_coach_id AND activo)
     OR public.nexa_cupos_slot(p_fecha, p_hora, p_coach_id, v_mod, r.id) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo');
  END IF;

  BEGIN
    PERFORM set_config('nexa.origen', 'alumno', true);
    PERFORM set_config('nexa.motivo', 'Reagendamiento del alumno dentro de plazo', true);
    v_reagenda := gen_random_uuid()::text;

    UPDATE public.reservas SET estado = 'reagendada' WHERE id = r.id;
    INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id, duracion_min, reagenda_id, descripcion)
    VALUES (v_atleta, r.plan_id, p_fecha::timestamp AT TIME ZONE 'UTC', left(p_hora, 5), 'pendiente',
            r.tipo_clase, p_coach_id, coalesce(r.duracion_min, v_cfg.duracion_bloque, 60), v_reagenda::uuid, r.descripcion)
    RETURNING id INTO v_nueva;
    INSERT INTO public.reagendas (id, alumno_id, plan_id, reserva_original_id, nueva_reserva_id, fecha_limite, estado, motivo)
    VALUES (v_reagenda, v_atleta::text, v_plan.id, r.id::text, v_nueva::text,
            public.nexa_fin_plan(v_plan)::text, 'completada', 'Reagendada por el alumno desde MI NEXA');
  EXCEPTION WHEN OTHERS THEN
    -- Todo lo de este bloque se revierte: la clase original sigue como estaba.
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo', 'detalle', SQLERRM);
  END;

  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (v_atleta, 'reserva_reagendada',
          public.nexa_datos_reserva(v_nueva) || jsonb_build_object('anterior', public.nexa_datos_reserva(r.id)),
          'reagendada:' || r.id || ':' || v_nueva)
  ON CONFLICT (clave) DO NOTHING;
  PERFORM public.nexa_avisar_lista_espera(v_dia, r.hora);
  UPDATE public.lista_espera SET estado = 'cancelada'
   WHERE atleta_id = v_atleta AND fecha = p_fecha AND hora = left(p_hora, 5) AND estado IN ('activa', 'notificada');

  RETURN jsonb_build_object('ok', true, 'reserva_id', v_nueva, 'anterior_id', r.id);
END $$;

-- Reservar con un crédito libre del plan vigente (nunca más clases que las del plan).
CREATE OR REPLACE FUNCTION public.alumno_reservar_clase(p_fecha date, p_hora text, p_coach_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual();
  v_plan public.planes; v_cfg public.horario_config; v_mod text; v_nueva int;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  SELECT * INTO v_cfg FROM public.horario_config WHERE id = 1;
  v_plan := public.nexa_plan_vigente(v_atleta, p_fecha);
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'fuera_de_vigencia'); END IF;
  SELECT coalesce(v_plan.modalidad, a.tipo_sesion, '1:1') INTO v_mod FROM public.atletas a WHERE a.id = v_atleta;

  -- Candado por plan: dos pestañas no pueden gastar el mismo crédito
  PERFORM pg_advisory_xact_lock(hashtext('nexa_plan:' || v_plan.id)::bigint);
  IF public.nexa_clases_comprometidas(v_plan.id) >= v_plan.total_clases THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_creditos');
  END IF;
  IF public.nexa_inicio_clase(p_fecha, p_hora) <= now() + make_interval(mins => coalesce(v_cfg.antelacion_min_reserva, 60)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo');
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservas x
             WHERE x.alumno_id = v_atleta AND public.nexa_dia(x.fecha) = p_fecha AND left(x.hora, 5) = left(p_hora, 5)
               AND NOT public.nexa_estado_inactivo(x.estado)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'choque_alumno');
  END IF;

  PERFORM public.nexa_lock_slot(p_fecha, p_hora);
  IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE id = p_coach_id AND activo)
     OR public.nexa_cupos_slot(p_fecha, p_hora, p_coach_id, v_mod) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo');
  END IF;

  BEGIN
    PERFORM set_config('nexa.origen', 'alumno', true);
    PERFORM set_config('nexa.motivo', 'Reserva del alumno desde MI NEXA', true);
    INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id, duracion_min)
    VALUES (v_atleta, v_plan.id::uuid, p_fecha::timestamp AT TIME ZONE 'UTC', left(p_hora, 5), 'pendiente',
            CASE WHEN v_mod = '2:1' THEN '2:1 Duo' ELSE '1:1 Individual' END, p_coach_id, coalesce(v_cfg.duracion_bloque, 60))
    RETURNING id INTO v_nueva;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo', 'detalle', SQLERRM);
  END;

  INSERT INTO public.notificaciones (atleta_id, tipo, datos, clave)
  VALUES (v_atleta, 'reserva_confirmada', public.nexa_datos_reserva(v_nueva), 'confirmada:' || v_nueva)
  ON CONFLICT (clave) DO NOTHING;
  UPDATE public.lista_espera SET estado = 'cancelada'
   WHERE atleta_id = v_atleta AND fecha = p_fecha AND hora = left(p_hora, 5) AND estado IN ('activa', 'notificada');

  RETURN jsonb_build_object('ok', true, 'reserva_id', v_nueva);
END $$;

-- "Avisarme si se libera un cupo"
CREATE OR REPLACE FUNCTION public.alumno_lista_espera(p_fecha date, p_hora text, p_reserva_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual();
  v_plan public.planes; v_mod text; v_activa boolean;
BEGIN
  IF v_atleta IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  SELECT coalesce(lista_espera_activa, true) INTO v_activa FROM public.horario_config WHERE id = 1;
  IF NOT coalesce(v_activa, true) THEN RETURN jsonb_build_object('ok', false, 'error', 'lista_desactivada'); END IF;
  IF public.nexa_inicio_clase(p_fecha, p_hora) <= now() THEN RETURN jsonb_build_object('ok', false, 'error', 'sin_cupo'); END IF;
  v_plan := public.nexa_plan_vigente(v_atleta, p_fecha);
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'fuera_de_vigencia'); END IF;
  SELECT coalesce(v_plan.modalidad, a.tipo_sesion, '1:1') INTO v_mod FROM public.atletas a WHERE a.id = v_atleta;
  IF p_reserva_id IS NOT NULL THEN
    SELECT public.nexa_modalidad(tipo_clase) INTO v_mod FROM public.reservas WHERE id = p_reserva_id AND alumno_id = v_atleta;
  END IF;
  INSERT INTO public.lista_espera (atleta_id, fecha, hora, modalidad, reserva_id)
  VALUES (v_atleta, p_fecha, left(p_hora, 5), coalesce(v_mod, '1:1'), p_reserva_id)
  ON CONFLICT (atleta_id, fecha, hora) WHERE estado = 'activa' DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Clases del alumno desde hoy, con el plazo calculado por el servidor
CREATE OR REPLACE FUNCTION public.alumno_mis_clases()
RETURNS TABLE (id int, fecha date, hora text, estado text, modalidad text, profesor text,
               limite timestamptz, a_tiempo boolean, activa boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, public.nexa_dia(r.fecha), left(r.hora, 5), r.estado, public.nexa_modalidad(r.tipo_clase), c.nombre,
         CASE WHEN r.hora ~ '^\d{2}:\d{2}' THEN public.nexa_limite_cancelacion(public.nexa_dia(r.fecha), r.hora) END,
         CASE WHEN r.hora ~ '^\d{2}:\d{2}' THEN now() <= public.nexa_limite_cancelacion(public.nexa_dia(r.fecha), r.hora) ELSE false END,
         NOT public.nexa_estado_inactivo(r.estado) AND r.estado <> 'presente'
  FROM public.reservas r LEFT JOIN public.coaches c ON c.id = r.coach_id
  WHERE r.alumno_id = public.nexa_atleta_actual()
    AND public.nexa_dia(r.fecha) >= public.nexa_hoy()
    AND public.nexa_modalidad(r.tipo_clase) <> 'grupal'
  ORDER BY public.nexa_dia(r.fecha), left(r.hora, 5)
  LIMIT 300
$$;

-- Resumen del plan vigente: contratadas, usadas, reservadas y disponibles
CREATE OR REPLACE FUNCTION public.alumno_mi_plan()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atleta uuid := public.nexa_atleta_actual(); v_plan public.planes; v_usadas int; v_comp int; v_mod text;
BEGIN
  IF v_atleta IS NULL THEN RETURN NULL; END IF;
  v_plan := public.nexa_plan_vigente(v_atleta, public.nexa_hoy());
  IF v_plan.id IS NULL THEN RETURN jsonb_build_object('vigente', false); END IF;
  SELECT count(*) INTO v_usadas FROM public.reservas
   WHERE plan_id::text = v_plan.id AND estado IN ('presente', 'no_show', 'cancelada_tarde');
  v_comp := public.nexa_clases_comprometidas(v_plan.id);
  SELECT coalesce(v_plan.modalidad, a.tipo_sesion, '1:1') INTO v_mod FROM public.atletas a WHERE a.id = v_atleta;
  RETURN jsonb_build_object(
    'vigente', true, 'plan_id', v_plan.id, 'nombre', v_plan.nombre, 'tipo', v_plan.tipo, 'modalidad', v_mod,
    'inicio', v_plan.start_date, 'fin', public.nexa_fin_plan(v_plan),
    'contratadas', v_plan.total_clases, 'usadas', v_usadas, 'reservadas', v_comp - v_usadas,
    'disponibles', greatest(0, v_plan.total_clases - v_comp));
END $$;

-- ── 7. Excepción administrativa: devolver el crédito de una cancelación tardía/no-show ─
CREATE OR REPLACE FUNCTION public.admin_devolver_credito(p_reserva_id int, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservas;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('admin', 'host') THEN RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado'); END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'motivo_requerido'); END IF;
  SELECT * INTO r FROM public.reservas WHERE id = p_reserva_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrada'); END IF;
  IF r.estado NOT IN ('cancelada_tarde', 'no_show') THEN RETURN jsonb_build_object('ok', false, 'error', 'no_aplica'); END IF;
  PERFORM set_config('nexa.origen', 'staff', true);
  PERFORM set_config('nexa.motivo', 'Excepción: ' || p_motivo, true);
  UPDATE public.reservas SET estado = 'cancelada_nexa', admin_note = coalesce(admin_note || ' · ', '') || 'Excepción: ' || p_motivo
   WHERE id = r.id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Permisos ────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'alumno_politica()',
    'alumno_horarios_disponibles(date, date, int)',
    'alumno_cancelar_reserva(int)',
    'alumno_reagendar_reserva(int, date, text, uuid)',
    'alumno_reservar_clase(date, text, uuid)',
    'alumno_lista_espera(date, text, int)',
    'alumno_mis_clases()',
    'alumno_mi_plan()',
    'admin_devolver_credito(int, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  -- Internas: no se llaman desde el navegador
  FOREACH f IN ARRAY ARRAY[
    'nexa_avisar_lista_espera(date, text)',
    'nexa_cupos_slot(date, text, uuid, text, int)',
    'nexa_plan_vigente(uuid, date)',
    'nexa_clases_comprometidas(text)',
    'nexa_datos_reserva(int)',
    'nexa_auditar_reserva()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
