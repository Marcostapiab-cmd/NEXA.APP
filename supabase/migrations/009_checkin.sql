-- migración 009: check-in de asistencia

-- ─── 1. Ampliar roles en perfiles ────────────────────────────────────────────
-- Roles reales verificados: admin, profesor, alumno. Se agrega: recepcionista.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM information_schema.table_constraints
  WHERE table_schema    = 'public'
    AND table_name      = 'perfiles'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%rol%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.perfiles DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('admin', 'profesor', 'alumno', 'recepcionista'));

-- ─── 2. Flag de observaciones de salud en atletas ────────────────────────────
ALTER TABLE public.atletas
  ADD COLUMN IF NOT EXISTS tiene_observaciones_salud boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.sync_salud_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- NEW es NULL en DELETE, OLD es NULL en INSERT
  v_id := COALESCE(NEW.atleta_id, OLD.atleta_id);

  UPDATE public.atletas
  SET tiene_observaciones_salud = EXISTS (
    SELECT 1 FROM public.atletas_salud
    WHERE atleta_id = v_id
      AND (
        COALESCE(enfermedades, '') <> '' OR
        COALESCE(lesiones,     '') <> '' OR
        COALESCE(medicamentos, '') <> '' OR
        COALESCE(alergias,     '') <> ''
      )
  )
  WHERE id = v_id;

  RETURN NULL; -- AFTER trigger, valor ignorado por Postgres
END;
$$;

DROP TRIGGER IF EXISTS trig_sync_salud_flag ON public.atletas_salud;
CREATE TRIGGER trig_sync_salud_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.atletas_salud
  FOR EACH ROW EXECUTE FUNCTION public.sync_salud_flag();

-- ─── 3. RLS: recepcionista puede leer atletas ────────────────────────────────
DROP POLICY IF EXISTS "atletas_recepcionista_select" ON public.atletas;
CREATE POLICY "atletas_recepcionista_select" ON public.atletas
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

-- ─── 4. RLS: recepcionista puede leer y actualizar reservas ──────────────────
DROP POLICY IF EXISTS "reservas_checkin_select" ON public.reservas;
CREATE POLICY "reservas_checkin_select" ON public.reservas
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

DROP POLICY IF EXISTS "reservas_checkin_update" ON public.reservas;
CREATE POLICY "reservas_checkin_update" ON public.reservas
  FOR UPDATE TO authenticated
  USING  (get_my_role() IN ('admin', 'profesor', 'recepcionista'))
  WITH CHECK (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

-- ─── Notas ────────────────────────────────────────────────────────────────────
-- Paso planes OMITIDO: recepcionista ya cubierto por staff_planes existente.
-- Tabla asistencia: sistema heredado del HTML, no se usa en el nuevo check-in.
-- Hueco alumno/planes: pendiente de confirmar FK y resolver en migración 010.
-- Tablas muertas class_plans/class_movements: limpiar en migración futura.
