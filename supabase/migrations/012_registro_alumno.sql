-- migración 012: registro abierto de alumnos
-- A) Corrige handle_new_user() para usar public.perfiles (no public.profiles)
-- B) Crea trigger que auto-genera fila en atletas al registrarse un alumno

-- ── A. Función handle_new_user corregida ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, apellido, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'alumno')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Asegurar que el trigger existe sobre auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── B. Trigger: crear atleta automáticamente cuando ingresa un alumno ───────

CREATE OR REPLACE FUNCTION public.handle_new_alumno_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rol = 'alumno' THEN
    IF NOT EXISTS (SELECT 1 FROM public.atletas WHERE perfil_id = NEW.id) THEN
      INSERT INTO public.atletas (nombre, apellido, email, perfil_id)
      VALUES (
        COALESCE(NEW.nombre, split_part(NEW.email, '@', 1)),
        COALESCE(NEW.apellido, ''),
        NEW.email,
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_alumno_perfiles_created ON public.perfiles;
CREATE TRIGGER on_alumno_perfiles_created
  AFTER INSERT ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_alumno_registration();
