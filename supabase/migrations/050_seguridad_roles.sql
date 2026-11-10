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
