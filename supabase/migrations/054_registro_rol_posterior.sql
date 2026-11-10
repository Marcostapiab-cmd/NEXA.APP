-- ============================================================
-- NEXA 054 — Crear el perfil también cuando el rol llega después
-- ============================================================
-- Supabase Auth (admin.createUser) inserta el usuario y guarda app_metadata en
-- un paso posterior. El disparador de la 050 solo miraba el INSERT, así que las
-- cuentas creadas por el servidor quedaban sin perfil (sin acceso). Ahora
-- también reacciona cuando cambia raw_app_meta_data, y solo crea el perfil si
-- no existe (nunca cambia un rol ya asignado; eso lo hace un admin en perfiles).
-- raw_app_meta_data solo lo puede escribir el servidor. Re-ejecutable.
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_app_meta_updated ON auth.users;
CREATE TRIGGER on_auth_user_app_meta_updated
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  WHEN ((NEW.raw_app_meta_data->>'rol') IS DISTINCT FROM (OLD.raw_app_meta_data->>'rol'))
  EXECUTE FUNCTION public.handle_new_user();
