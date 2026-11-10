-- ════════════════════════════════════════════════════════════════════
-- NEXA — Arreglos urgentes de producción (2026-11-04)
--   · 046: reagendar desde MI NEXA fallaba siempre
--          ("Ese horario se acaba de ocupar").
--   · 049: comprar un pack grupal fallaba siempre
--          ("No pudimos crear la orden").
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Una sola transacción: si algo falla, no se aplica nada.
-- Re-ejecutable.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ┌── 046 — reagendas.creada_at con valor por defecto
ALTER TABLE public.reagendas
  ALTER COLUMN creada_at SET DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

-- ┌── 049 — grupales_compras.clases_restantes calculada
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

COMMIT;

-- Verificación (debe mostrar una fila con "ALWAYS" y otra con el valor por defecto):
SELECT table_name, column_name, is_generated, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'grupales_compras' AND column_name = 'clases_restantes')
     OR (table_name = 'reagendas'        AND column_name = 'creada_at'));
