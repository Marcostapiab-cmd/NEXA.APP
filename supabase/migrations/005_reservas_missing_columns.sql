-- Columnas que faltan en reservas para el sistema de planes
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS hora       text,
  ADD COLUMN IF NOT EXISTS tipo_clase text,
  ADD COLUMN IF NOT EXISTS estado     text DEFAULT 'pendiente';

-- Índice útil para queries de estado
CREATE INDEX IF NOT EXISTS reservas_estado_idx ON public.reservas(estado);

-- Asegurar que admins y profesores pueden insertar reservas de planes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reservas' AND policyname = 'planes_insert_staff'
  ) THEN
    CREATE POLICY "planes_insert_staff" ON public.reservas
      FOR INSERT
      TO authenticated
      WITH CHECK (get_my_role() IN ('admin', 'profesor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reservas' AND policyname = 'planes_select_staff'
  ) THEN
    CREATE POLICY "planes_select_staff" ON public.reservas
      FOR SELECT
      TO authenticated
      USING (get_my_role() IN ('admin', 'profesor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reservas' AND policyname = 'planes_update_staff'
  ) THEN
    CREATE POLICY "planes_update_staff" ON public.reservas
      FOR UPDATE
      TO authenticated
      USING (get_my_role() IN ('admin', 'profesor'))
      WITH CHECK (get_my_role() IN ('admin', 'profesor'));
  END IF;
END $$;
