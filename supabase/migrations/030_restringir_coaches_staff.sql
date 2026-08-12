-- Migración 030: restringir lectura de la tabla "coaches" a staff.
--
-- Problema: "coaches_read" (migración 008) daba lectura completa —incluyendo
-- las tarifas de pago por clase de cada profesor (tarifa_1a1, tarifa_2a1,
-- tarifa_incompleta_2a1)— a CUALQUIER usuario autenticado, incluyendo
-- alumnos y alumnos grupales. Verificado que ninguna pantalla pública o de
-- alumnos consulta esta tabla directamente (obtienen nombres de clase por
-- otro camino), así que restringirla a staff no rompe nada.

DROP POLICY IF EXISTS "coaches_read" ON public.coaches;
CREATE POLICY "coaches_read_staff" ON public.coaches
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

-- "coaches_admin" (solo admin puede crear/editar/borrar) se deja igual.
