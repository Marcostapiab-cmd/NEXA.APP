-- ============================================================
-- NEXA — Fix: "No pudimos crear la cuenta" al registrarse
--
-- El trigger on_auth_user_created insertaba email/apellido en
-- public.perfiles, columnas que no existen (perfiles = id, rol,
-- nombre, created_at). Resultado: TODO createUser fallaba con
-- "Database error creating new user" (alumnos grupales, profesores...).
--
-- Además, los alumnos de clases grupales (rol 'grupales') no son
-- staff: la app los identifica por user_metadata.rol y viven en
-- grupales_alumnos. No deben tener fila en perfiles (y 'grupales'
-- no está permitido por perfiles_rol_check).
-- ============================================================

-- ─── 1. Crear perfil solo para roles de perfiles ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text := COALESCE(NEW.raw_user_meta_data->>'rol', 'alumno');
BEGIN
  IF v_rol NOT IN ('admin', 'profesor', 'alumno', 'recepcionista', 'host') THEN
    RETURN NEW;  -- p. ej. 'grupales': sin fila en perfiles
  END IF;

  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    v_rol
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. Atleta automático: leer email/apellido desde auth.users ──────────────
CREATE OR REPLACE FUNCTION public.handle_new_alumno_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text;
  v_apellido text;
BEGIN
  IF NEW.rol = 'alumno'
     AND NOT EXISTS (SELECT 1 FROM public.atletas WHERE perfil_id = NEW.id) THEN
    SELECT u.email, COALESCE(u.raw_user_meta_data->>'apellido', '')
      INTO v_email, v_apellido
      FROM auth.users u
     WHERE u.id = NEW.id;

    INSERT INTO public.atletas (nombre, apellido, email, perfil_id)
    VALUES (
      COALESCE(NEW.nombre, split_part(v_email, '@', 1)),
      COALESCE(v_apellido, ''),
      v_email,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
