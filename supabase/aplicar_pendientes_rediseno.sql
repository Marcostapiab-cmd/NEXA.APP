-- ════════════════════════════════════════════════════════════════════
-- NEXA — Migraciones pendientes del rediseño (026 → 035)
-- ════════════════════════════════════════════════════════════════════
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Corre en una sola transacción: si algo falla, no se aplica nada.
-- Se puede ejecutar aunque algunas partes ya estén aplicadas.
--
-- NO incluye 025_cleanup_conflictos_1a1.sql: esa cancela reservas
-- duplicadas existentes y conviene decidirla aparte.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────
-- │ 026_fix_planes_grupales.sql — Los 5 packs grupales con sus precios exactos
-- └──────────────────────────────────────────────────────────────────

-- ============================================================
-- NEXA 026 — Unificar precios de planes grupales
-- Deja exactamente 5 planes canónicos en planes_grupales con
-- los precios y vigencias acordados. Esta tabla es la única
-- fuente de verdad para el admin (Clases grupales > Planes)
-- y la landing pública (/#planes).
-- ============================================================

-- Actualizar planes existentes por nombre
UPDATE public.planes_grupales SET
  descripcion  = 'Ven a conocernos. Sin compromiso.',
  precio_clp   = 8990,
  num_clases   = 1,
  validez_dias = 7,
  destacado    = false,
  orden        = 1,
  activo       = true
WHERE nombre = 'Clase de Prueba';

UPDATE public.planes_grupales SET
  descripcion  = 'Dos clases para explorar distintas disciplinas a tu ritmo.',
  precio_clp   = 16990,
  num_clases   = 2,
  validez_dias = 14,
  destacado    = true,
  orden        = 3,
  activo       = true
WHERE nombre = 'Pack 2×Prueba';

-- Insertar planes que aún no existen
INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden, activo)
SELECT 'Clase Normal', 'Una clase grupal a precio regular.', 12990, 1, 7, false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.planes_grupales WHERE nombre = 'Clase Normal');

INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden, activo)
SELECT 'Pack Mensual', 'El más elegido. Tres clases por semana.', 119900, 12, 60, false, 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.planes_grupales WHERE nombre = 'Pack Mensual');

INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden, activo)
SELECT 'Pack Intensivo', 'Para quienes van en serio.', 179900, 20, 90, false, 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.planes_grupales WHERE nombre = 'Pack Intensivo');

-- Desactivar cualquier otro plan que no sea parte del catálogo canónico
UPDATE public.planes_grupales SET activo = false
WHERE nombre NOT IN ('Clase de Prueba', 'Clase Normal', 'Pack 2×Prueba', 'Pack Mensual', 'Pack Intensivo');

-- ┌──────────────────────────────────────────────────────────────────
-- │ 027_atletas_tipo_sesion.sql — Tipo de sesión (1:1 / 2:1) en la ficha del alumno
-- └──────────────────────────────────────────────────────────────────

-- Agrega campo tipo_sesion al perfil de cada atleta
ALTER TABLE atletas
  ADD COLUMN IF NOT EXISTS tipo_sesion text CHECK (tipo_sesion IN ('1:1', '2:1'));

-- ┌──────────────────────────────────────────────────────────────────
-- │ 028_host_role.sql — Rol host (recepción) — lo usa el código ya publicado
-- └──────────────────────────────────────────────────────────────────

-- ============================================================
-- NEXA — Rol "host": acceso admin sin módulo de entrenamiento
-- El host ve y gestiona alumnos, profesores, horario, clases
-- grupales, pagos y configuración, igual que el admin.
-- ============================================================

-- ─── 1. Agregar "host" al constraint de perfiles ─────────────────────────────
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM information_schema.table_constraints
  WHERE table_schema    = 'public'
    AND table_name      = 'perfiles'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%rol%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.perfiles DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('admin', 'profesor', 'alumno', 'recepcionista', 'host'));

-- ─── 2. Horario config ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "hconfig_read"  ON public.horario_config;
DROP POLICY IF EXISTS "hconfig_write" ON public.horario_config;

CREATE POLICY "hconfig_read" ON public.horario_config
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));

CREATE POLICY "hconfig_write" ON public.horario_config
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host'))
  WITH CHECK (get_my_role() IN ('admin', 'host'));

-- ─── 3. Horario bloqueos ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bloqueos_read"  ON public.horario_bloqueos;
DROP POLICY IF EXISTS "bloqueos_admin" ON public.horario_bloqueos;

CREATE POLICY "bloqueos_read" ON public.horario_bloqueos
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));

CREATE POLICY "bloqueos_admin" ON public.horario_bloqueos
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host'))
  WITH CHECK (get_my_role() IN ('admin', 'host'));

-- ─── 4. Clases grupales ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clases_grupales_admin_write" ON public.clases_grupales;

CREATE POLICY "clases_grupales_admin_write" ON public.clases_grupales
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host'))
  WITH CHECK (get_my_role() IN ('admin', 'host'));

-- ─── 5. Grupales packs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grupales_packs_admin_write" ON public.grupales_packs;

CREATE POLICY "grupales_packs_admin_write" ON public.grupales_packs
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 6. Grupales alumnos ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ga_admin_all" ON public.grupales_alumnos;

CREATE POLICY "ga_admin_all" ON public.grupales_alumnos
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 7. Grupales compras ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gc_admin_all" ON public.grupales_compras;

CREATE POLICY "gc_admin_all" ON public.grupales_compras
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 8. Grupales reservas ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gr_admin_all" ON public.grupales_reservas;

CREATE POLICY "gr_admin_all" ON public.grupales_reservas
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 9. Pagos alumnos ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pagos_admin_recepcionista" ON public.pagos;

CREATE POLICY "pagos_admin_recepcionista" ON public.pagos
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host', 'recepcionista'))
  WITH CHECK (get_my_role() IN ('admin', 'host', 'recepcionista'));

-- ─── 10. Atletas salud ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "salud_select" ON public.atletas_salud;
DROP POLICY IF EXISTS "salud_insert" ON public.atletas_salud;
DROP POLICY IF EXISTS "salud_update" ON public.atletas_salud;

CREATE POLICY "salud_select" ON public.atletas_salud
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor'));

CREATE POLICY "salud_insert" ON public.atletas_salud
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'host', 'profesor'));

CREATE POLICY "salud_update" ON public.atletas_salud
  FOR UPDATE TO authenticated
  USING  (get_my_role() IN ('admin', 'host', 'profesor'))
  WITH CHECK (get_my_role() IN ('admin', 'host', 'profesor'));

-- ─── 11. Reservas: host igual que admin/recepcionista ────────────────────────
DROP POLICY IF EXISTS "reservas_select_scoped"  ON public.reservas;
DROP POLICY IF EXISTS "reservas_update_scoped"  ON public.reservas;
DROP POLICY IF EXISTS "reservas_insert_staff"   ON public.reservas;

CREATE POLICY "reservas_select_scoped" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  );

CREATE POLICY "reservas_update_scoped" ON public.reservas
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  );

CREATE POLICY "reservas_insert_staff" ON public.reservas
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));

-- ─── 14. Atletas: host ve y gestiona todos ───────────────────────────────────
DROP POLICY IF EXISTS "atletas_host_all" ON public.atletas;

CREATE POLICY "atletas_host_all" ON public.atletas
  FOR ALL TO authenticated
  USING  (get_my_role() = 'host')
  WITH CHECK (get_my_role() = 'host');

-- ┌──────────────────────────────────────────────────────────────────
-- │ 031_indexes_rendimiento.sql — Índices de rendimiento
-- └──────────────────────────────────────────────────────────────────

-- ============================================================
-- NEXA 031 — Índices de rendimiento
-- ============================================================
-- Postgres NO indexa automáticamente las columnas de llave foránea
-- (solo la primary key). Estas columnas se filtran constantemente
-- desde la app (check-in diario, ficha de alumno, página pública
-- de reservas, dashboard) y no tenían índice de apoyo. Con pocos
-- datos no se nota; con meses de historial de reservas, sí.
--
-- Todos con IF NOT EXISTS: se puede aplicar sin riesgo aunque ya
-- exista alguno.

-- reservas: la tabla más consultada de todo el sistema
CREATE INDEX IF NOT EXISTS idx_reservas_fecha
  ON public.reservas (fecha);

CREATE INDEX IF NOT EXISTS idx_reservas_alumno_id
  ON public.reservas (alumno_id);

CREATE INDEX IF NOT EXISTS idx_reservas_plan_id
  ON public.reservas (plan_id);

-- Cubre la consulta pública de horarios (get_sesiones_publicas) y el
-- check-in diario: WHERE fecha = ... AND hora = ... AND tipo_clase ...
CREATE INDEX IF NOT EXISTS idx_reservas_fecha_hora_tipo_estado
  ON public.reservas (fecha, hora, tipo_clase, estado);

-- Cubre el recálculo de clases usadas por plan (planes-supabase.ts)
CREATE INDEX IF NOT EXISTS idx_reservas_plan_estado
  ON public.reservas (plan_id, estado);

-- atletas: usado por el webhook de pago para buscar por email/teléfono/rut
CREATE INDEX IF NOT EXISTS idx_atletas_email
  ON public.atletas (email);

CREATE INDEX IF NOT EXISTS idx_atletas_telefono
  ON public.atletas (telefono);

CREATE INDEX IF NOT EXISTS idx_atletas_rut
  ON public.atletas (rut);

-- sesiones: historial de entrenamiento por alumno
CREATE INDEX IF NOT EXISTS idx_sesiones_alumno_id
  ON public.sesiones (alumno_id);

CREATE INDEX IF NOT EXISTS idx_sesiones_fecha
  ON public.sesiones (fecha);

-- planes: planes de un alumno
CREATE INDEX IF NOT EXISTS idx_planes_alumno_id
  ON public.planes (alumno_id);

-- pedidos_grupales: el webhook de Flow filtra por estado al reintentar
CREATE INDEX IF NOT EXISTS idx_pedidos_grupales_estado
  ON public.pedidos_grupales (estado);

-- ┌──────────────────────────────────────────────────────────────────
-- │ 032_confirmar_pedido_atomico_y_realtime.sql — Confirmación atómica de pagos + check-in en tiempo real
-- └──────────────────────────────────────────────────────────────────

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

-- ┌──────────────────────────────────────────────────────────────────
-- │ 033_planes_1a1_precios_y_pedidos.sql — Planes 1:1 / 2:1 con precio en línea (versión re-ejecutable)
-- └──────────────────────────────────────────────────────────────────

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

DROP POLICY IF EXISTS "precios_entrenamiento_anon_read" ON public.precios_entrenamiento;
CREATE POLICY "precios_entrenamiento_anon_read" ON public.precios_entrenamiento
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "precios_entrenamiento_auth_read" ON public.precios_entrenamiento;
CREATE POLICY "precios_entrenamiento_auth_read" ON public.precios_entrenamiento
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "precios_entrenamiento_admin_all" ON public.precios_entrenamiento;
CREATE POLICY "precios_entrenamiento_admin_all" ON public.precios_entrenamiento
  FOR ALL TO authenticated USING (public.is_admin());

INSERT INTO public.precios_entrenamiento (modalidad, frecuencia_semanal, precio_mes_clp) VALUES
  ('1:1', 1, 120000), ('2:1', 1, 100000),
  ('1:1', 2, 225000), ('2:1', 2, 170000),
  ('1:1', 3, 275000), ('2:1', 3, 200000),
  ('1:1', 4, 320000), ('2:1', 4, 250000),
  ('1:1', 5, 385000), ('2:1', 5, 290000)
ON CONFLICT (modalidad, frecuencia_semanal) DO NOTHING;  -- no pisa precios editados en Configuración

-- ── 2. Descuentos por duración (plano, en CLP por mes) ────────────
CREATE TABLE IF NOT EXISTS public.precios_entrenamiento_config (
  clave text PRIMARY KEY,
  valor int NOT NULL
);

ALTER TABLE public.precios_entrenamiento_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precios_config_anon_read" ON public.precios_entrenamiento_config;
CREATE POLICY "precios_config_anon_read" ON public.precios_entrenamiento_config
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "precios_config_auth_read" ON public.precios_entrenamiento_config;
CREATE POLICY "precios_config_auth_read" ON public.precios_entrenamiento_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "precios_config_admin_all" ON public.precios_entrenamiento_config;
CREATE POLICY "precios_config_admin_all" ON public.precios_entrenamiento_config
  FOR ALL TO authenticated USING (public.is_admin());

INSERT INTO public.precios_entrenamiento_config (clave, valor) VALUES
  ('descuento_trimestral_mes', 5000),
  ('descuento_semestral_mes', 10000)
ON CONFLICT (clave) DO NOTHING;  -- no pisa descuentos editados

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

DROP POLICY IF EXISTS "pedidos_planes_admin_read" ON public.pedidos_planes;
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

-- ┌──────────────────────────────────────────────────────────────────
-- │ 034_compras_grupales_catalogo_unico.sql — Compra de packs con cuenta, saldo y reserva segura
-- └──────────────────────────────────────────────────────────────────

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

-- ┌──────────────────────────────────────────────────────────────────
-- │ 035_corregir_planes_2a1.sql — Corrige alumnos 2:1 guardados como 1:1
-- └──────────────────────────────────────────────────────────────────

-- ============================================================
-- NEXA 035 — Corregir planes 2:1 guardados como 1:1
-- ============================================================
-- El modal "Inscribir alumno" creaba el plan sin modalidad y TODAS las
-- clases como '1:1 Individual', aunque la ficha del alumno dijera 2:1.
-- Por eso la pantalla de horarios las mostraba como 1:1 y el trigger de
-- la migración 024 no dejaba poner a dos alumnos 2:1 en el mismo horario.
--
-- Esta migración solo toca datos de alumnos con tipo_sesion = '2:1':
--  1. Planes sin modalidad → modalidad '2:1'.
--  2. Clases futuras y activas de esos planes guardadas como 1:1 (o sin
--     tipo) → '2:1 Duo'.
-- Cada clase se actualiza por separado: si alguna choca con la agenda
-- (p. ej. ya hay un 1:1 en ese horario), se omite y se informa con un
-- NOTICE, sin detener el resto. Los planes con modalidad ya definida no
-- se modifican.

UPDATE public.planes p
   SET modalidad = '2:1'
  FROM public.atletas a
 WHERE p.alumno_id   = a.id
   AND a.tipo_sesion = '2:1'
   AND p.modalidad IS NULL;

DO $$
DECLARE
  r record;
  v_ok int := 0;
  v_omitidas int := 0;
BEGIN
  FOR r IN
    SELECT res.id, res.fecha, res.hora
      FROM public.reservas res
      JOIN public.planes   p ON p.id = res.plan_id
      JOIN public.atletas  a ON a.id = p.alumno_id
     WHERE a.tipo_sesion = '2:1'
       AND p.modalidad   = '2:1'
       AND res.fecha    >= current_date
       AND res.estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
       AND (res.tipo_clase IS NULL OR res.tipo_clase ILIKE '%1:1%')
     ORDER BY res.fecha, res.hora
  LOOP
    BEGIN
      UPDATE public.reservas SET tipo_clase = '2:1 Duo' WHERE id = r.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_omitidas := v_omitidas + 1;
      RAISE NOTICE 'Reserva % (% %) no se pudo pasar a 2:1: %', r.id, r.fecha, r.hora, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Clases pasadas a 2:1: %, omitidas por conflicto: %', v_ok, v_omitidas;
END $$;

COMMIT;

-- Verificación: deben aparecer los 5 packs con estos precios
-- (8.990 · 12.990 · 16.990 · 119.900 · 179.900)
SELECT nombre, precio_clp, num_clases, validez_dias, destacado
  FROM public.planes_grupales
 WHERE activo
 ORDER BY orden;
