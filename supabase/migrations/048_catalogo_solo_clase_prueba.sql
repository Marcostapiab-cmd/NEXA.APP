-- ============================================================
-- NEXA 048 — Catálogo público: solo Clase de Prueba + planes 1:1 / 2:1
-- ============================================================
-- Ya aplicada en la base real el 2026-11-04.
-- Se ocultan los packs grupales (no se borran: se pueden reactivar desde
-- /grupales). Queda a la venta solo la Clase de Prueba a $8.990.
-- Los precios 1:1 / 2:1 quedan según NEXA_Precios_y_Ejercicio.xlsx.

UPDATE public.planes_grupales
   SET activo = false, destacado = false
 WHERE nombre NOT IN ('Clase de Prueba');

UPDATE public.planes_grupales
   SET activo = true, precio_clp = 8990, num_clases = 1
 WHERE nombre = 'Clase de Prueba';

INSERT INTO public.precios_entrenamiento (modalidad, frecuencia_semanal, precio_mes_clp) VALUES
  ('1:1', 1, 120000), ('2:1', 1, 100000),
  ('1:1', 2, 225000), ('2:1', 2, 170000),
  ('1:1', 3, 275000), ('2:1', 3, 200000),
  ('1:1', 4, 320000), ('2:1', 4, 250000),
  ('1:1', 5, 385000), ('2:1', 5, 290000)
ON CONFLICT (modalidad, frecuencia_semanal) DO UPDATE SET precio_mes_clp = EXCLUDED.precio_mes_clp;

INSERT INTO public.precios_entrenamiento_config (clave, valor) VALUES
  ('descuento_trimestral_mes', 5000),
  ('descuento_semestral_mes', 10000)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
