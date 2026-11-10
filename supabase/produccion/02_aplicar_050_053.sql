-- ============================================================
-- NEXA — Aplicar 050, 051, 052 y 053 (todo o nada)
-- Pegar completo en Supabase → SQL Editor, DESPUÉS de 01_respaldo_antes_050_053.sql.
-- Si cualquier parte falla, no queda nada aplicado (BEGIN/COMMIT).
-- ============================================================
BEGIN;

-- >>>>>>>>>> 050_seguridad_roles.sql
-- ============================================================
-- NEXA 050 — Roles protegidos y funciones cerradas al público
-- ============================================================
-- Problemas que corrige:
--  1. El disparador de registro (handle_new_user) tomaba el rol desde
--     raw_user_meta_data, que escribe el propio usuario al registrarse
--     (POST /auth/v1/signup con data.rol = 'admin'). Cualquiera podía crearse
--     una cuenta de administrador. Ahora el rol solo sale de
--     raw_app_meta_data, que únicamente el servidor (service_role) puede fijar.
--  2. La app decidía permisos con user_metadata.rol, que el usuario puede
--     cambiar con supabase.auth.updateUser(). Ahora el rol se copia desde
--     `perfiles` a app_metadata (solo escribible por el servidor).
--  3. `perfiles` queda protegida: nadie salvo un admin (o el servidor)
--     puede crear perfiles ni cambiar roles.
--  4. get_my_role() solo devuelve roles conocidos; cualquier otro valor = sin acceso.
--  5. Las funciones de confirmación de pagos solo las puede ejecutar el servidor
--     (032/033 revocaban a anon/authenticated pero no a PUBLIC, que en Postgres
--     deja la función abierta a todos).
--  6. Las funciones SECURITY DEFINER internas dejan de poder llamarse sin sesión.
--
-- Re-ejecutable. No borra ni modifica datos de alumnos, planes ni reservas.
-- Solo agrega `rol` a raw_app_meta_data de las cuentas que ya tienen perfil
-- (o cuenta de clases grupales).
-- ============================================================

-- ── 1. Rol del usuario actual (solo roles conocidos) ────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM public.perfiles
   WHERE id = auth.uid() AND rol IN ('admin', 'host', 'profesor', 'recepcionista', 'alumno')
$$;

-- Rol para navegar: el de `perfiles`, o 'grupales' si la cuenta es de clases grupales.
CREATE OR REPLACE FUNCTION public.nexa_rol_de(p_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT rol FROM public.perfiles
      WHERE id = p_uid AND rol IN ('admin', 'host', 'profesor', 'recepcionista', 'alumno')),
    (SELECT 'grupales' FROM public.grupales_alumnos WHERE user_id = p_uid LIMIT 1))
$$;

CREATE OR REPLACE FUNCTION public.nexa_mi_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.nexa_rol_de(auth.uid()) END
$$;

-- ── 2. Registro: el rol nunca viene del usuario ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- raw_app_meta_data solo lo puede fijar el servidor (admin API con service_role).
  -- raw_user_meta_data lo envía el propio usuario: NO se usa para el rol.
  v_rol text := NEW.raw_app_meta_data->>'rol';
BEGIN
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'host', 'profesor', 'recepcionista', 'alumno') THEN
    RETURN NEW;  -- sin perfil = sin acceso (p. ej. registro público o cuenta 'grupales')
  END IF;
  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)), v_rol)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 3. `perfiles` protegida ─────────────────────────────────
-- Rol de la petición HTTP (PostgREST). Vacío = conexión directa (migraciones,
-- disparadores de Auth, SQL Editor), que se considera del servidor.
CREATE OR REPLACE FUNCTION public.nexa_rol_peticion()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    '')
$$;

CREATE OR REPLACE FUNCTION public.nexa_proteger_perfiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.nexa_rol_peticion() IN ('anon', 'authenticated')
     AND coalesce(public.get_my_role(), '') <> 'admin' THEN
    -- Un usuario puede cambiar su propio nombre, nunca su rol.
    IF TG_OP = 'UPDATE' AND OLD.id = auth.uid() AND NEW.id = OLD.id
       AND NEW.rol IS NOT DISTINCT FROM OLD.rol THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede crear perfiles o asignar roles.' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS perfiles_proteger ON public.perfiles;
CREATE TRIGGER perfiles_proteger
  BEFORE INSERT OR UPDATE OR DELETE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.nexa_proteger_perfiles();

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  -- Las políticas de `perfiles` se crearon a mano en producción (no están en el
  -- repositorio). Se reemplazan todas por las de abajo.
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'perfiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.perfiles', p.policyname);
  END LOOP;
END $$;

CREATE POLICY perfiles_leer ON public.perfiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.get_my_role() IN ('admin', 'host', 'recepcionista'));
CREATE POLICY perfiles_nombre_propio ON public.perfiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY perfiles_admin ON public.perfiles
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── 4. Copiar el rol a app_metadata (lo que lee la app para navegar) ──
CREATE OR REPLACE FUNCTION public.nexa_sync_rol_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fila jsonb; v_uid uuid; v_rol text;
BEGIN
  v_fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_uid  := (v_fila ->> CASE WHEN TG_TABLE_NAME = 'perfiles' THEN 'id' ELSE 'user_id' END)::uuid;
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_rol := public.nexa_rol_de(v_uid);
  UPDATE auth.users
     SET raw_app_meta_data = CASE WHEN v_rol IS NULL
                                  THEN coalesce(raw_app_meta_data, '{}'::jsonb) - 'rol'
                                  ELSE coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', v_rol) END
   WHERE id = v_uid AND (raw_app_meta_data->>'rol') IS DISTINCT FROM v_rol;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS perfiles_sync_rol ON public.perfiles;
CREATE TRIGGER perfiles_sync_rol
  AFTER INSERT OR UPDATE OF rol OR DELETE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.nexa_sync_rol_auth();

DO $$
BEGIN
  IF to_regclass('public.grupales_alumnos') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS grupales_sync_rol ON public.grupales_alumnos;
    CREATE TRIGGER grupales_sync_rol
      AFTER INSERT OR UPDATE OF user_id OR DELETE ON public.grupales_alumnos
      FOR EACH ROW EXECUTE FUNCTION public.nexa_sync_rol_auth();
  END IF;
END $$;

-- Cuentas existentes: copiar el rol vigente; las que no tienen perfil quedan sin rol.
UPDATE auth.users u
   SET raw_app_meta_data = CASE WHEN public.nexa_rol_de(u.id) IS NULL
                                THEN coalesce(u.raw_app_meta_data, '{}'::jsonb) - 'rol'
                                ELSE coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', public.nexa_rol_de(u.id)) END
 WHERE (u.raw_app_meta_data->>'rol') IS DISTINCT FROM public.nexa_rol_de(u.id);

-- ── 5. Confirmación de pagos: solo el servidor ──────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'confirmar_pedido_grupal_pago(text)',
    'confirmar_pedido_plan_pago(text)',
    'confirmar_compra_grupal_pago(text, integer)',
    'reservar_clase_grupal(uuid, uuid, uuid, date, text, text)',
    '_reservar_clase_grupal_core(uuid, uuid, uuid, date, text)'
  ] LOOP
    IF to_regprocedure('public.' || f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    END IF;
  END LOOP;
END $$;

-- ── 6. Funciones internas: sin acceso anónimo ───────────────
-- Toda función SECURITY DEFINER del esquema public deja de ser ejecutable sin
-- sesión, salvo las de la web pública y las que usan las políticas RLS. Quien
-- ya podía ejecutarla con sesión (authenticated) conserva exactamente ese acceso.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND p.proname NOT IN ('get_sesiones_publicas', 'get_clases_disponibles')
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies pol
          WHERE coalesce(pol.qual, '') ~ ('\m' || p.proname || '\M')
             OR coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\M'))
  LOOP
    IF has_function_privilege('authenticated', f.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    IF has_function_privilege('service_role', f.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

-- Funciones nuevas de esta migración
REVOKE ALL ON FUNCTION public.nexa_rol_de(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nexa_mi_rol() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nexa_mi_rol() TO authenticated;
REVOKE ALL ON FUNCTION public.nexa_sync_rol_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nexa_proteger_perfiles() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN PERFORM pg_notify('pgrst', 'reload schema'); END $$;

-- >>>>>>>>>> 051_reservas_sin_duplicados.sql
-- ============================================================
-- NEXA 051 — Un alumno no puede tener dos clases activas a la misma hora
-- ============================================================
-- Antes, el disparador de choques (check_reserva_tipo_clash) solo miraba al
-- profesor: el mismo alumno podía quedar dos veces el mismo día y hora con
-- profesores distintos, o por dos solicitudes simultáneas, o al editar o
-- reactivar una reserva cancelada.
--
-- Ahora un disparador revisa al alumno en cada INSERT y en cada UPDATE que lo
-- deje activo en un horario nuevo (incluye reactivar). Usa el mismo candado por
-- horario que la 041 (nexa_lock_slot), así dos solicitudes simultáneas se
-- ordenan y la segunda ve la primera. Alumnos distintos en la misma clase
-- siguen permitidos según los cupos (eso lo valida check_reserva_tipo_clash).
--
-- Los duplicados que ya existan NO se borran: se listan en "Requiere atención"
-- (incidencia manual) y con la función staff_reservas_duplicadas().
-- Requiere 041 y 042. Re-ejecutable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.nexa_reserva_alumno_unica()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_otra int;
BEGIN
  IF NEW.alumno_id IS NULL OR public.nexa_estado_inactivo(NEW.estado)
     OR coalesce(NEW.hora, '') !~ '^\d{2}:\d{2}' THEN
    RETURN NEW;
  END IF;
  -- Un UPDATE que no cambia alumno, día ni hora de una reserva ya activa no se revalida
  IF TG_OP = 'UPDATE' AND NOT public.nexa_estado_inactivo(OLD.estado)
     AND OLD.alumno_id IS NOT DISTINCT FROM NEW.alumno_id
     AND public.nexa_dia(OLD.fecha) = public.nexa_dia(NEW.fecha)
     AND left(OLD.hora, 5) IS NOT DISTINCT FROM left(NEW.hora, 5) THEN
    RETURN NEW;
  END IF;

  PERFORM public.nexa_lock_slot(public.nexa_dia(NEW.fecha), NEW.hora);

  SELECT r.id INTO v_otra
    FROM public.reservas r
   WHERE r.alumno_id = NEW.alumno_id
     AND public.nexa_dia(r.fecha) = public.nexa_dia(NEW.fecha)
     AND left(r.hora, 5) = left(NEW.hora, 5)
     AND NOT public.nexa_estado_inactivo(r.estado)
     AND r.id IS DISTINCT FROM NEW.id
   LIMIT 1;

  IF v_otra IS NOT NULL THEN
    RAISE EXCEPTION 'Reserva duplicada: el alumno ya tiene una clase activa el % a las % (reserva %).',
      public.nexa_dia(NEW.fecha), left(NEW.hora, 5), v_otra
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;

-- El nombre hace que corra antes que reservas_tipo_clash_check (mismo candado, mismo orden).
DROP TRIGGER IF EXISTS reservas_alumno_unica ON public.reservas;
CREATE TRIGGER reservas_alumno_unica
  BEFORE INSERT OR UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_reserva_alumno_unica();

-- Índice de apoyo para la búsqueda por alumno y día
CREATE INDEX IF NOT EXISTS reservas_alumno_dia_idx
  ON public.reservas (alumno_id, public.nexa_dia(fecha), left(hora, 5));

-- ── Duplicados existentes: solo se informan ──────────────────
CREATE OR REPLACE FUNCTION public.nexa_reservas_duplicadas()
RETURNS TABLE (alumno_id uuid, alumno text, dia date, hora text, reservas int[], estados text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.alumno_id, public.nexa_nombre_atleta(r.alumno_id), public.nexa_dia(r.fecha), left(r.hora, 5),
         array_agg(r.id ORDER BY r.id), array_agg(r.estado ORDER BY r.id)
    FROM public.reservas r
   WHERE r.alumno_id IS NOT NULL AND NOT public.nexa_estado_inactivo(r.estado)
     AND coalesce(r.hora, '') ~ '^\d{2}:\d{2}'
   GROUP BY r.alumno_id, public.nexa_dia(r.fecha), left(r.hora, 5)
  HAVING count(*) > 1
   ORDER BY 3, 4
$$;

CREATE OR REPLACE FUNCTION public.staff_reservas_duplicadas()
RETURNS TABLE (alumno_id uuid, alumno text, dia date, hora text, reservas int[], estados text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(public.get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.nexa_reservas_duplicadas();
END $$;

REVOKE ALL ON FUNCTION public.nexa_reserva_alumno_unica() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nexa_reservas_duplicadas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_reservas_duplicadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_reservas_duplicadas() TO authenticated;

-- Registrar los duplicados históricos en "Requiere atención" como incidencias
-- manuales (no se cierran solas): el staff decide cuál cancelar.
DO $$
DECLARE d record; v_id uuid;
BEGIN
  FOR d IN SELECT * FROM public.nexa_reservas_duplicadas() LOOP
    v_id := public.nexa_incidencia('reserva_duplicada', 'alta',
      'duplicada_hist:' || d.alumno_id || ':' || d.dia || ':' || d.hora,
      'Reserva duplicada · ' || coalesce(d.alumno, 'alumno'),
      array_length(d.reservas, 1) || ' reservas activas el ' || to_char(d.dia, 'DD-MM-YYYY') || ' a las ' || d.hora
        || ' (n.º ' || array_to_string(d.reservas, ', ') || '). Cada una consume un crédito.',
      'Revisar y cancelar (como NEXA) las sobrantes. No se borró nada automáticamente.',
      d.alumno_id, d.reservas[1]);
    UPDATE public.incidencias SET automatica = false WHERE id = v_id;
  END LOOP;
END $$;

-- >>>>>>>>>> 052_pagos_confirmacion.sql
-- ============================================================
-- NEXA 052 — Confirmación de pagos en línea (Flow) verificada y sin duplicados
-- ============================================================
-- Problemas que corrige:
--  1. El pago de un plan 1:1 / 2:1 activaba el plan, pero no dejaba registro en
--     `pagos`: no aparecía en el historial del alumno ni en administración.
--  2. Solo se comparaba el monto, y fuera de la transacción. Ahora se verifican,
--     dentro de la misma transacción con el pedido bloqueado: número de orden,
--     monto y moneda (CLP). El estado "pagado" lo confirma la app con Flow.
--  3. Si no coincidía, el pedido quedaba "procesando" sin aviso. Ahora queda en
--     "revision" con el motivo y una alerta en "Requiere atención".
--  4. Una confirmación repetida (Flow reintenta) no crea otro pago, plan ni
--     reservas: el pedido se bloquea (FOR UPDATE) y `pagos.referencia_pago` es única.
--  5. Si el pago se confirmó pero alguna clase no se pudo agendar, el plan se
--     activa igual (sin volver a cobrar), el pedido guarda cuántas faltaron y se
--     avisa al staff (incidencia de prioridad alta).
--
-- No modifica pagos, planes ni reservas existentes. Requiere 042, 044, 049, 051.
-- Re-ejecutable.
-- ============================================================

-- ── Columnas nuevas ─────────────────────────────────────────
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS referencia_pago text;
CREATE UNIQUE INDEX IF NOT EXISTS pagos_referencia_pago_uniq ON public.pagos (referencia_pago) WHERE referencia_pago IS NOT NULL;

-- 'flow' como método de pago (antes se guardaba como 'transferencia')
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.pagos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%metodo%'
  LOOP
    EXECUTE format('ALTER TABLE public.pagos DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_metodo_check
  CHECK (metodo IN ('stripe', 'transferencia', 'efectivo', 'flow'));

ALTER TABLE public.pedidos_planes ADD COLUMN IF NOT EXISTS revision_motivo   text;
ALTER TABLE public.pedidos_planes ADD COLUMN IF NOT EXISTS clases_sin_agendar int NOT NULL DEFAULT 0;
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.pedidos_planes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE public.pedidos_planes DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.pedidos_planes ADD CONSTRAINT pedidos_planes_estado_check
  CHECK (estado IN ('pendiente', 'procesando', 'pagado', 'cancelado', 'fallido', 'revision'));

-- ── Confirmación del plan 1:1 / 2:1 ─────────────────────────
-- La llama solo el servidor, después de consultar a Flow que el pago está
-- aprobado (status 2). Devuelve jsonb con `ok`, `codigo` y los datos del pedido.
CREATE OR REPLACE FUNCTION public.nexa_confirmar_pago_plan(
  p_flow_token text, p_monto int, p_moneda text, p_commerce_order text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_pedido        public.pedidos_planes;
  v_atleta_id     uuid;
  v_plan_id       uuid;
  v_duracion_dias int;
  v_semanas       int;
  v_total_clases  int;
  v_start_date    date := public.nexa_hoy();
  v_end_date      date;
  v_lunes         date;
  v_total_weeks   int;
  v_fecha         date;
  v_fechas        date[] := '{}';
  v_d             int;
  v_w             int;
  v_plan_nombre   text;
  v_omitidas      date[] := '{}';
  v_motivo        text;
  v_datos         jsonb;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_planes WHERE flow_token = p_flow_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrado');
  END IF;

  v_datos := jsonb_build_object('pedido_id', v_pedido.id, 'nombre', v_pedido.nombre, 'apellido', v_pedido.apellido,
    'email', v_pedido.email, 'modalidad', v_pedido.modalidad, 'tipo', v_pedido.tipo,
    'frecuencia_semanal', v_pedido.frecuencia_semanal, 'monto_clp', v_pedido.monto_clp);

  -- Repetición: ya se acreditó. No se crea nada nuevo.
  IF v_pedido.estado = 'pagado' THEN
    RETURN v_datos || jsonb_build_object('ok', true, 'ya_procesado', true,
      'atleta_id', v_pedido.atleta_id, 'plan_id', v_pedido.plan_id, 'clases_sin_agendar', v_pedido.clases_sin_agendar);
  END IF;
  IF v_pedido.estado = 'revision' THEN
    RETURN v_datos || jsonb_build_object('ok', false, 'codigo', 'en_revision', 'motivo', v_pedido.revision_motivo);
  END IF;

  -- Verificaciones contra lo que informó Flow
  v_motivo := CASE
    WHEN p_commerce_order IS NOT NULL AND v_pedido.commerce_order IS NOT NULL
         AND p_commerce_order <> v_pedido.commerce_order THEN 'orden_distinta'
    WHEN upper(coalesce(p_moneda, '')) <> 'CLP' THEN 'moneda_distinta'
    WHEN p_monto IS DISTINCT FROM v_pedido.monto_clp THEN 'monto_distinto'
  END;
  IF v_motivo IS NOT NULL THEN
    UPDATE public.pedidos_planes SET estado = 'revision', revision_motivo = v_motivo WHERE id = v_pedido.id;
    PERFORM public.nexa_incidencia('pago_no_coincide', 'alta', 'pago_revision:' || v_pedido.id,
      'Pago en línea por revisar · ' || v_pedido.nombre || ' ' || v_pedido.apellido,
      format('Flow informó un pago que no coincide con el pedido (%s). Pedido: $%s CLP, orden %s. Flow: $%s %s, orden %s. No se activó el plan.',
             v_motivo, v_pedido.monto_clp, coalesce(v_pedido.commerce_order, '—'), coalesce(p_monto::text, '—'),
             coalesce(p_moneda, '—'), coalesce(p_commerce_order, '—')),
      'Revisar el pago en Flow. Si corresponde, activar el plan a mano; si no, gestionar la devolución.',
      NULL, NULL, NULL, NULL);
    RETURN v_datos || jsonb_build_object('ok', false, 'codigo', v_motivo);
  END IF;

  -- Alumno: por email (sin mayúsculas) o RUT; si no existe, se crea.
  SELECT a.id INTO v_atleta_id
    FROM public.atletas a
   WHERE (v_pedido.email IS NOT NULL AND lower(a.email) = lower(v_pedido.email))
      OR (v_pedido.rut   IS NOT NULL AND public.nexa_rut_norm(a.rut) = public.nexa_rut_norm(v_pedido.rut))
   ORDER BY (v_pedido.email IS NOT NULL AND lower(a.email) = lower(v_pedido.email)) DESC
   LIMIT 1;
  IF v_atleta_id IS NULL THEN
    INSERT INTO public.atletas (nombre, apellido, email, telefono, rut, activo)
    VALUES (v_pedido.nombre, v_pedido.apellido, v_pedido.email, v_pedido.telefono, v_pedido.rut, true)
    RETURNING id INTO v_atleta_id;
  END IF;

  -- Mismas reglas de duración que 049 / src/lib/planes.ts
  v_duracion_dias := CASE v_pedido.tipo WHEN 'mensual' THEN 30 WHEN 'trimestral' THEN 90 WHEN 'semestral' THEN 180 END;
  v_semanas       := CASE v_pedido.tipo WHEN 'mensual' THEN 4  WHEN 'trimestral' THEN 12 WHEN 'semestral' THEN 24 END;
  v_end_date      := v_start_date + v_duracion_dias;
  v_total_clases  := array_length(v_pedido.dias_semana, 1) * v_semanas;

  v_lunes       := v_start_date - (EXTRACT(ISODOW FROM v_start_date)::int - 1);
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
  INSERT INTO public.planes (id, alumno_id, nombre, tipo, modalidad, total_clases, start_date, end_date, precio_clp, estado_pago)
  VALUES (gen_random_uuid(), v_atleta_id, v_plan_nombre, v_pedido.tipo, v_pedido.modalidad, v_total_clases,
          v_start_date, v_end_date, v_pedido.monto_clp, 'pagado')
  RETURNING id INTO v_plan_id;

  -- Registro del pago: historial del alumno y administración
  INSERT INTO public.pagos (alumno_id, plan_id, monto, moneda, estado, metodo, descripcion, fecha_pago, referencia_pago, stripe_checkout_session_id)
  VALUES (v_atleta_id, v_plan_id::text, v_pedido.monto_clp, 'clp', 'pagado', 'flow',
          v_plan_nombre || ' · pago en línea', now(), p_flow_token, v_pedido.commerce_order)
  ON CONFLICT (referencia_pago) WHERE referencia_pago IS NOT NULL DO NOTHING;

  -- Cada clase por separado: si choca (horario ocupado, alumno ya tiene clase a
  -- esa hora…), se omite y queda como crédito. El pago nunca se revierte.
  FOREACH v_fecha IN ARRAY coalesce(v_fechas, '{}') LOOP
    BEGIN
      INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase)
      VALUES (v_atleta_id, v_plan_id, v_fecha, v_pedido.hora, 'pendiente',
              CASE v_pedido.modalidad WHEN '1:1' THEN '1:1 Individual' ELSE '2:1 Duo' END);
    EXCEPTION WHEN raise_exception OR unique_violation OR exclusion_violation OR check_violation THEN
      v_omitidas := array_append(v_omitidas, v_fecha);
    END;
  END LOOP;

  IF coalesce(array_length(v_omitidas, 1), 0) > 0 THEN
    PERFORM public.nexa_incidencia(
      'compra_clases_sin_agendar', 'alta', 'compra_sin_agendar:' || v_plan_id::text,
      'Plan pagado con clases sin agendar',
      format('%s %s pagó en línea un %s (%s a las %s). %s clase(s) no se pudieron agendar: %s. El pago está registrado; no hay que volver a cobrar.',
             v_pedido.nombre, v_pedido.apellido, v_plan_nombre, array_to_string(v_pedido.dias_semana, ','), v_pedido.hora,
             array_length(v_omitidas, 1), array_to_string(v_omitidas, ', ')),
      'Agendar esas clases con el alumno en otro horario. Quedan como crédito del plan.',
      v_atleta_id, NULL, v_plan_id::text, NULL);
  END IF;

  UPDATE public.pedidos_planes
     SET estado = 'pagado', atleta_id = v_atleta_id, plan_id = v_plan_id, confirmado_at = now(),
         clases_sin_agendar = coalesce(array_length(v_omitidas, 1), 0), revision_motivo = NULL
   WHERE id = v_pedido.id;

  RETURN v_datos || jsonb_build_object('ok', true, 'ya_procesado', false, 'atleta_id', v_atleta_id,
    'plan_id', v_plan_id, 'clases_sin_agendar', coalesce(array_length(v_omitidas, 1), 0));
END $$;

REVOKE ALL ON FUNCTION public.nexa_confirmar_pago_plan(text, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_confirmar_pago_plan(text, int, text, text) TO service_role;

-- La versión anterior (sin verificación) queda solo para el servidor y deja de usarse.
DO $$ BEGIN
  IF to_regprocedure('public.confirmar_pedido_plan_pago(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.confirmar_pedido_plan_pago(text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── Cobros manuales por Flow (staff → /api/pagos/crear-checkout) ──
-- Marca un pago pendiente como pagado solo si orden, monto y moneda coinciden.
CREATE OR REPLACE FUNCTION public.nexa_confirmar_cobro_manual(
  p_commerce_order text, p_monto int, p_moneda text, p_flow_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pago public.pagos;
BEGIN
  SELECT * INTO v_pago FROM public.pagos WHERE stripe_checkout_session_id = p_commerce_order FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrado'); END IF;
  IF v_pago.estado = 'pagado' THEN RETURN jsonb_build_object('ok', true, 'ya_procesado', true); END IF;
  IF v_pago.estado <> 'pendiente' THEN RETURN jsonb_build_object('ok', false, 'codigo', 'estado_' || v_pago.estado); END IF;
  IF upper(coalesce(p_moneda, '')) <> 'CLP' OR p_monto IS DISTINCT FROM v_pago.monto THEN
    PERFORM public.nexa_incidencia('pago_no_coincide', 'alta', 'cobro_revision:' || v_pago.id,
      'Cobro en línea por revisar · ' || coalesce(public.nexa_nombre_atleta(v_pago.alumno_id), 'alumno'),
      format('Flow informó $%s %s para un cobro de $%s CLP (orden %s). No se marcó como pagado.',
             coalesce(p_monto::text, '—'), coalesce(p_moneda, '—'), v_pago.monto, p_commerce_order),
      'Revisar el pago en Flow y corregir el cobro a mano.', v_pago.alumno_id, NULL, v_pago.plan_id, NULL);
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_coincide');
  END IF;
  UPDATE public.pagos SET estado = 'pagado', fecha_pago = now(), referencia_pago = coalesce(referencia_pago, p_flow_token)
   WHERE id = v_pago.id;
  RETURN jsonb_build_object('ok', true, 'ya_procesado', false);
END $$;

REVOKE ALL ON FUNCTION public.nexa_confirmar_cobro_manual(text, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_confirmar_cobro_manual(text, int, text, text) TO service_role;

DO $$ BEGIN PERFORM pg_notify('pgrst', 'reload schema'); END $$;

-- >>>>>>>>>> 053_recordatorios_autenticados.sql
-- ============================================================
-- NEXA 053 — Recordatorios automáticos con llamada autenticada
-- ============================================================
-- Problema: la tarea horaria (043) encolaba los recordatorios, pero la llamada
-- a /api/notificaciones/procesar iba sin credenciales. El proxy de la app la
-- redirigía al login y la cola nunca se enviaba (en producción había
-- recordatorios "pendiente" con 0 intentos desde el 29-10).
--
-- Ahora la tarea envía `Authorization: Bearer <secreto>`. El secreto se guarda
-- en Supabase Vault con el nombre 'nexa_notificaciones_secret' (no en una
-- tabla) y debe ser el mismo valor que NOTIFICACIONES_SECRET en Vercel:
--
--   SELECT vault.create_secret('<valor largo y aleatorio>', 'nexa_notificaciones_secret');
--
-- Además: columna reclamada_at para detectar envíos interrumpidos.
-- Re-ejecutable. Requiere 043.
-- ============================================================

ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS reclamada_at timestamptz;

-- Secreto desde Vault (null si Vault no existe o no está configurado)
CREATE OR REPLACE FUNCTION public.nexa_secreto_notificaciones()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
     INTO v USING 'nexa_notificaciones_secret';
  RETURN nullif(trim(v), '');
END $$;
REVOKE ALL ON FUNCTION public.nexa_secreto_notificaciones() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nexa_tarea_horaria()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r jsonb; v_url text; v_secreto text;
BEGIN
  v_r := public.nexa_tareas_programadas();
  SELECT nullif(trim(app_url), '') INTO v_url FROM public.horario_config WHERE id = 1;
  v_secreto := public.nexa_secreto_notificaciones();

  IF v_url IS NULL OR v_secreto IS NULL THEN
    -- Sin URL o sin secreto los correos no pueden salir: se avisa en "Requiere atención".
    PERFORM public.nexa_incidencia('correos_sin_configurar', 'alta', 'correos_sin_configurar',
      'Los correos automáticos no se están enviando',
      CASE WHEN v_url IS NULL THEN 'Falta la URL pública de la app (horario_config.app_url).'
           ELSE 'Falta el secreto nexa_notificaciones_secret en Supabase Vault.' END,
      'Configurar según supabase/migrations/053_recordatorios_autenticados.sql.');
    -- Manual: no se cierra sola cada hora; el staff la cierra al configurarlo.
    UPDATE public.incidencias SET automatica = false WHERE clave = 'correos_sin_configurar' AND estado = 'abierta';
    RETURN v_r || jsonb_build_object('envio', 'sin_configurar');
  END IF;

  -- Solo envía lo que ya está en cola; no puede crear ni duplicar correos.
  PERFORM net.http_post(
    url     := rtrim(v_url, '/') || '/api/notificaciones/procesar',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secreto));
  RETURN v_r || jsonb_build_object('envio', 'solicitado');
END $$;
REVOKE ALL ON FUNCTION public.nexa_tarea_horaria() FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
