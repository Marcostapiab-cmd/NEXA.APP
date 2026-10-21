-- ============================================================
-- NEXA 025 — Limpieza de conflictos 1:1 preexistentes
-- ============================================================
-- El trigger check_reserva_tipo_clash (migración 024) previene
-- nuevos conflictos, pero hay reservas antiguas donde dos alumnos
-- quedaron en el mismo slot 1:1 del mismo coach.
--
-- Criterio de desempate:
--   1. Mantener la reserva con alumno_id (alumno registrado)
--      sobre las de walk-in (solo rut).
--   2. En caso de empate, mantener la más antigua (ctid).
-- ============================================================

WITH duplicados AS (
  -- Slots 1:1 que tienen más de una reserva activa para el mismo coach
  SELECT coach_id, fecha, hora
  FROM public.reservas
  WHERE tipo_clase NOT ILIKE '%grupal%'
    AND tipo_clase NOT ILIKE '%2:1%'
    AND estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
  GROUP BY coach_id, fecha, hora
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (
      PARTITION BY r.coach_id, r.fecha, r.hora
      ORDER BY
        (r.alumno_id IS NOT NULL) DESC,  -- priorizar alumno registrado
        r.ctid                            -- luego por orden de inserción
    ) AS rn
  FROM public.reservas r
  JOIN duplicados d
    ON d.coach_id IS NOT DISTINCT FROM r.coach_id
   AND d.fecha = r.fecha
   AND d.hora  = r.hora
  WHERE r.tipo_clase NOT ILIKE '%grupal%'
    AND r.tipo_clase NOT ILIKE '%2:1%'
    AND r.estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
)
UPDATE public.reservas
   SET estado = 'cancelada_nexa'
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Resultado esperado: las filas duplicadas quedan como 'cancelada_nexa'
-- y el slot 1:1 vuelve a mostrar 1/1.
-- El admin puede revisar en el horario y reprogramar si corresponde.
