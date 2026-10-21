-- ============================================================
-- NEXA — Rol "host": acceso admin sin módulo de entrenamiento
-- El host ve y gestiona alumnos, profesores, horario, clases
-- grupales, pagos y configuración, igual que el admin.
-- ============================================================

-- ─── 1. Agregar "host" al constraint de perfiles ─────────────────────────────
DO $$
DECLARE v_constraint text;
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
  CHECK (rol IN ('admin', 'profesor', 'alumno', 'recepcionista', 'host'));

-- ─── 2. Horario config ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "hconfig_read"  ON public.horario_config;
DROP POLICY IF EXISTS "hconfig_write" ON public.horario_config;

CREATE POLICY "hconfig_read" ON public.horario_config
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));

CREATE POLICY "hconfig_write" ON public.horario_config
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host'))
  WITH CHECK (get_my_role() IN ('admin', 'host'));

-- ─── 3. Horario bloqueos ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bloqueos_read"  ON public.horario_bloqueos;
DROP POLICY IF EXISTS "bloqueos_admin" ON public.horario_bloqueos;

CREATE POLICY "bloqueos_read" ON public.horario_bloqueos
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));

CREATE POLICY "bloqueos_admin" ON public.horario_bloqueos
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host'))
  WITH CHECK (get_my_role() IN ('admin', 'host'));

-- ─── 4. Clases grupales ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clases_grupales_admin_write" ON public.clases_grupales;

CREATE POLICY "clases_grupales_admin_write" ON public.clases_grupales
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host'))
  WITH CHECK (get_my_role() IN ('admin', 'host'));

-- ─── 5. Grupales packs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grupales_packs_admin_write" ON public.grupales_packs;

CREATE POLICY "grupales_packs_admin_write" ON public.grupales_packs
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 6. Grupales alumnos ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ga_admin_all" ON public.grupales_alumnos;

CREATE POLICY "ga_admin_all" ON public.grupales_alumnos
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 7. Grupales compras ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gc_admin_all" ON public.grupales_compras;

CREATE POLICY "gc_admin_all" ON public.grupales_compras
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 8. Grupales reservas ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gr_admin_all" ON public.grupales_reservas;

CREATE POLICY "gr_admin_all" ON public.grupales_reservas
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'host'));

-- ─── 9. Pagos alumnos ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pagos_admin_recepcionista" ON public.pagos;

CREATE POLICY "pagos_admin_recepcionista" ON public.pagos
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'host', 'recepcionista'))
  WITH CHECK (get_my_role() IN ('admin', 'host', 'recepcionista'));

-- ─── 10. Atletas salud ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "salud_select" ON public.atletas_salud;
DROP POLICY IF EXISTS "salud_insert" ON public.atletas_salud;
DROP POLICY IF EXISTS "salud_update" ON public.atletas_salud;

CREATE POLICY "salud_select" ON public.atletas_salud
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'host', 'profesor'));

CREATE POLICY "salud_insert" ON public.atletas_salud
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'host', 'profesor'));

CREATE POLICY "salud_update" ON public.atletas_salud
  FOR UPDATE TO authenticated
  USING  (get_my_role() IN ('admin', 'host', 'profesor'))
  WITH CHECK (get_my_role() IN ('admin', 'host', 'profesor'));

-- ─── 11. Reservas: host igual que admin/recepcionista ────────────────────────
DROP POLICY IF EXISTS "reservas_select_scoped"  ON public.reservas;
DROP POLICY IF EXISTS "reservas_update_scoped"  ON public.reservas;
DROP POLICY IF EXISTS "reservas_insert_staff"   ON public.reservas;

CREATE POLICY "reservas_select_scoped" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  );

CREATE POLICY "reservas_update_scoped" ON public.reservas
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'host', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  );

CREATE POLICY "reservas_insert_staff" ON public.reservas
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'host', 'profesor', 'recepcionista'));

-- ─── 14. Atletas: host ve y gestiona todos ───────────────────────────────────
DROP POLICY IF EXISTS "atletas_host_all" ON public.atletas;

CREATE POLICY "atletas_host_all" ON public.atletas
  FOR ALL TO authenticated
  USING  (get_my_role() = 'host')
  WITH CHECK (get_my_role() = 'host');
