-- ============================================================
-- NEXA 026 — Unificar precios de planes grupales
-- Deja exactamente 5 planes canónicos en planes_grupales con
-- los precios y vigencias acordados. Esta tabla es la única
-- fuente de verdad para el admin (Clases grupales > Planes)
-- y la landing pública (/#planes).
-- ============================================================

-- Actualizar planes existentes por nombre
UPDATE public.planes_grupales SET
  descripcion  = 'Ven a conocernos. Sin compromiso.',
  precio_clp   = 8990,
  num_clases   = 1,
  validez_dias = 7,
  destacado    = false,
  orden        = 1,
  activo       = true
WHERE nombre = 'Clase de Prueba';

UPDATE public.planes_grupales SET
  descripcion  = 'Dos clases para explorar distintas disciplinas a tu ritmo.',
  precio_clp   = 16990,
  num_clases   = 2,
  validez_dias = 14,
  destacado    = true,
  orden        = 3,
  activo       = true
WHERE nombre = 'Pack 2×Prueba';

-- Insertar planes que aún no existen
INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden, activo)
SELECT 'Clase Normal', 'Una clase grupal a precio regular.', 12990, 1, 7, false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.planes_grupales WHERE nombre = 'Clase Normal');

INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden, activo)
SELECT 'Pack Mensual', 'El más elegido. Tres clases por semana.', 119900, 12, 60, false, 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.planes_grupales WHERE nombre = 'Pack Mensual');

INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden, activo)
SELECT 'Pack Intensivo', 'Para quienes van en serio.', 179900, 20, 90, false, 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.planes_grupales WHERE nombre = 'Pack Intensivo');

-- Desactivar cualquier otro plan que no sea parte del catálogo canónico
UPDATE public.planes_grupales SET activo = false
WHERE nombre NOT IN ('Clase de Prueba', 'Clase Normal', 'Pack 2×Prueba', 'Pack Mensual', 'Pack Intensivo');
