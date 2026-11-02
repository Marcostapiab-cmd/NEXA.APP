-- ============================================================
-- NEXA 046 — reagendas.creada_at con valor por defecto
-- ============================================================
-- En producción `reagendas.creada_at` es texto obligatorio y SIN valor por
-- defecto. La función alumno_reagendar_reserva (migración 041) no lo envía,
-- así que reagendar desde MI NEXA fallaba siempre y el alumno veía
-- "Ese horario se acaba de ocupar" (el error real quedaba oculto).
-- Se agrega un valor por defecto en el mismo formato ISO que usa la app
-- (new Date().toISOString()), para que el orden por fecha siga funcionando.
-- Re-ejecutable. Se puede aplicar en cualquier orden respecto de 044/045.
-- ============================================================

ALTER TABLE public.reagendas
  ALTER COLUMN creada_at SET DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
