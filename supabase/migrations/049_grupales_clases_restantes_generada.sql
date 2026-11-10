-- ============================================================
-- NEXA 049 — grupales_compras.clases_restantes como columna calculada
-- ============================================================
-- En producción no se aplicó la parte 1 de la migración 023:
-- `clases_restantes` sigue siendo un número obligatorio que nadie llena,
-- así que /api/grupales-alumno/pagar fallaba siempre con
-- "No pudimos crear la orden" y nadie podía comprar un pack grupal.
--
-- Solo rehace esa columna (clases_totales - clases_usadas). No toca el resto
-- de la 023: sus funciones ya fueron reemplazadas por versiones más nuevas
-- (032/034) y volver a correrla las pisaría.
-- Re-ejecutable: si la columna ya es calculada, no hace nada.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'grupales_compras'
       AND column_name = 'clases_restantes' AND is_generated = 'ALWAYS'
  ) THEN
    RAISE NOTICE 'grupales_compras.clases_restantes ya es calculada: nada que hacer';
    RETURN;
  END IF;

  ALTER TABLE public.grupales_compras DROP COLUMN IF EXISTS clases_restantes;
  ALTER TABLE public.grupales_compras
    ADD COLUMN clases_restantes int
      GENERATED ALWAYS AS (clases_totales - clases_usadas) STORED;
END
$$;
