-- ============================================================
-- NEXA 033 — Planes 1:1 / 2:1 con precio online (reemplaza clases grupales)
-- ============================================================
-- El negocio deja de vender clases grupales sueltas y pasa a vender
-- planes de entrenamiento 1:1 o 2:1, con frecuencia semanal (1 a 5
-- veces) y duración (mensual/trimestral/semestral), pagados online
-- con Flow. Esta migración agrega el catálogo de precios (editable
-- desde el panel admin) y el flujo de pedido + confirmación atómica,
-- siguiendo el mismo patrón que confirmar_pedido_grupal_pago (032).

-- ── 1. Catálogo de precios mensuales por modalidad × frecuencia ──
CREATE TABLE IF NOT EXISTS public.precios_entrenamiento (
  modalidad          text NOT NULL CHECK (modalidad IN ('1:1', '2:1')),
  frecuencia_semanal int  NOT NULL CHECK (frecuencia_semanal BETWEEN 1 AND 5),
  precio_mes_clp     int  NOT NULL CHECK (precio_mes_clp > 0),
  updated_at         timestamptz DEFAULT now(),
  PRIMARY KEY (modalidad, frecuencia_semanal)
);

ALTER TABLE public.precios_entrenamiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precios_entrenamiento_anon_read" ON public.precios_entrenamiento
  FOR SELECT TO anon USING (true);

CREATE POLICY "precios_entrenamiento_auth_read" ON public.precios_entrenamiento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "precios_entrenamiento_admin_all" ON public.precios_entrenamiento
  FOR ALL TO authenticated USING (public.is_admin());

INSERT INTO public.precios_entrenamiento (modalidad, frecuencia_semanal, precio_mes_clp) VALUES
  ('1:1', 1, 120000), ('2:1', 1, 100000),
  ('1:1', 2, 225000), ('2:1', 2, 170000),
  ('1:1', 3, 275000), ('2:1', 3, 200000),
  ('1:1', 4, 320000), ('2:1', 4, 250000),
  ('1:1', 5, 385000), ('2:1', 5, 290000)
ON CONFLICT (modalidad, frecuencia_semanal) DO UPDATE SET precio_mes_clp = EXCLUDED.precio_mes_clp;

-- ── 2. Descuentos por duración (plano, en CLP por mes) ────────────
CREATE TABLE IF NOT EXISTS public.precios_entrenamiento_config (
  clave text PRIMARY KEY,
  valor int NOT NULL
);

ALTER TABLE public.precios_entrenamiento_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precios_config_anon_read" ON public.precios_entrenamiento_config
  FOR SELECT TO anon USING (true);

CREATE POLICY "precios_config_auth_read" ON public.precios_entrenamiento_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "precios_config_admin_all" ON public.precios_entrenamiento_config
  FOR ALL TO authenticated USING (public.is_admin());

INSERT INTO public.precios_entrenamiento_config (clave, valor) VALUES
  ('descuento_trimestral_mes', 5000),
  ('descuento_semestral_mes', 10000)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- ── 3. Pedidos de planes (orden de compra antes del pago) ────────
CREATE TABLE IF NOT EXISTS public.pedidos_planes (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  modalidad      text NOT NULL CHECK (modalidad IN ('1:1', '2:1')),
  frecuencia_semanal int NOT NULL CHECK (frecuencia_semanal BETWEEN 1 AND 5),
  tipo           text NOT NULL CHECK (tipo IN ('mensual', 'trimestral', 'semestral')),
  dias_semana    int[] NOT NULL,
  hora           text NOT NULL,
  nombre         text NOT NULL,
  apellido       text NOT NULL,
  email          text,
  telefono       text,
  rut            text,
  monto_clp      int NOT NULL,
  estado         text DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','procesando','pagado','cancelado','fallido')),
  flow_token     text UNIQUE,
  flow_order     bigint,
  commerce_order text UNIQUE,
  atleta_id      uuid REFERENCES public.atletas(id),
  plan_id        uuid,
  created_at     timestamptz DEFAULT now(),
  confirmado_at  timestamptz
);

ALTER TABLE public.pedidos_planes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos_planes_admin_read" ON public.pedidos_planes
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── 4. Confirmación atómica del pago ──────────────────────────────
-- Mismo patrón que confirmar_pedido_grupal_pago (migración 032):
-- bloquea la fila del pedido con FOR UPDATE para que reintentos del
-- webhook de Flow no dupliquen atleta/plan/reservas. Genera las
-- fechas de sesión con el mismo algoritmo que generarFechasRecurrentes
-- (src/lib/planes.ts) para que el resultado sea idéntico al de una
-- inscripción manual hecha por el staff.
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
  INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase)
  SELECT v_atleta_id, v_plan_id, f, v_pedido.hora, 'pendiente',
         CASE v_pedido.modalidad WHEN '1:1' THEN '1:1 Individual' ELSE '2:1' END
  FROM unnest(v_fechas) AS f;

  UPDATE public.pedidos_planes
  SET estado = 'pagado', atleta_id = v_atleta_id, plan_id = v_plan_id, confirmado_at = now()
  WHERE id = v_pedido.id;

  RETURN QUERY SELECT
    true, false, v_atleta_id, v_plan_id, v_pedido.id,
    v_pedido.nombre, v_pedido.apellido, v_pedido.email,
    v_pedido.modalidad, v_pedido.tipo, v_pedido.frecuencia_semanal, v_pedido.monto_clp;
END;
$$;

-- Solo el backend (service_role) llama a esta función, nunca el cliente
GRANT EXECUTE ON FUNCTION public.confirmar_pedido_plan_pago(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirmar_pedido_plan_pago(text) FROM anon, authenticated;
