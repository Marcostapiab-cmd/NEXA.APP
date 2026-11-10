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
