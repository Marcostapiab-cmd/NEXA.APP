-- ============================================================
-- NEXA 043 — Tarea programada cada hora en Supabase (pg_cron)
-- ============================================================
-- Cada hora, al minuto 5:
--   1. encola los recordatorios de clase (24 h y 3 h antes, configurable),
--   2. revisa el sistema y llena "Requiere mi atención",
--   3. pide a la app que envíe los correos en cola (si `horario_config.app_url` está configurada).
--
-- Requiere las extensiones pg_cron y pg_net (Supabase: Database → Extensions).
-- Re-ejecutable. Aplicar después de la 042.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.nexa_tarea_horaria()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r jsonb; v_url text;
BEGIN
  v_r := public.nexa_tareas_programadas();
  SELECT nullif(trim(app_url), '') INTO v_url FROM public.horario_config WHERE id = 1;
  IF v_url IS NOT NULL THEN
    -- Solo envía lo que ya está en cola; no puede crear ni duplicar correos.
    PERFORM net.http_post(url := rtrim(v_url, '/') || '/api/notificaciones/procesar',
                          body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
  END IF;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.nexa_tarea_horaria() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nexa-tarea-horaria';
SELECT cron.schedule('nexa-tarea-horaria', '5 * * * *', $$SELECT public.nexa_tarea_horaria()$$);
