-- Migración 025: limpiar reservas sin coach_id (huérfanas)
-- Estas reservas aparecen como tarjetas fantasma en el horario.
-- Se cancelan las que tengan un duplicado real (misma fecha+hora+alumno con coach).
-- Las que no tienen duplicado también se cancelan: no puede haber reserva sin coach.

BEGIN;

-- 1. Cancelar reservas con coach_id NULL que no son grupales
--    y que tienen un gemelo con coach real para el mismo alumno en la misma franja
UPDATE public.reservas r_null
SET    estado = 'cancelada_nexa'
WHERE  r_null.coach_id IS NULL
  AND  r_null.tipo_clase NOT ILIKE '%grupal%'
  AND  r_null.estado NOT IN (
         'cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','bloqueada'
       )
  AND  EXISTS (
         SELECT 1
         FROM   public.reservas r_real
         WHERE  r_real.fecha     = r_null.fecha
           AND  r_real.hora      = r_null.hora
           AND  r_real.alumno_id = r_null.alumno_id
           AND  r_real.coach_id  IS NOT NULL
           AND  r_real.estado NOT IN (
                  'cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','bloqueada'
                )
       );

-- 2. Cancelar cualquier otra reserva individual sin coach que haya quedado
--    (no deberían existir reservas 1:1/2:1 sin coach asignado)
UPDATE public.reservas
SET    estado = 'cancelada_nexa'
WHERE  coach_id IS NULL
  AND  tipo_clase NOT ILIKE '%grupal%'
  AND  estado NOT IN (
         'cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show','bloqueada'
       );

COMMIT;
