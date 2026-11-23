-- ============================================================
-- NEXA — Volver atrás la 055 (app de rutinas)
-- ============================================================
-- Borra SOLO lo que creó la 055. OJO: también borra los pesos y comentarios
-- que los alumnos hayan anotado en la app. Rutinas, fichas y perfiles no se tocan.
-- ============================================================
BEGIN;
DROP TABLE IF EXISTS public.comentarios_ejercicio;
DROP TABLE IF EXISTS public.registros_ejercicio;
DROP FUNCTION IF EXISTS public.nexa_guardia_comentario();
DROP FUNCTION IF EXISTS public.nexa_tocar_updated_at();
DROP FUNCTION IF EXISTS public.nexa_es_coach();
DROP FUNCTION IF EXISTS public.nexa_rutina_asignada(text, uuid);
DROP FUNCTION IF EXISTS public.nexa_es_mi_ficha(uuid);
COMMIT;
NOTIFY pgrst, 'reload schema';
