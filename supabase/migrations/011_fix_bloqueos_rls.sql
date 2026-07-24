-- migración 011: corregir RLS de horario_bloqueos y horario_config
-- Roles válidos (constraint perfiles_rol_check, migración 009):
--   admin | profesor | alumno | recepcionista
-- Roles que deben ver bloqueos y config: admin, profesor, recepcionista
-- (alumno excluido — no agenda clases de otros)

-- ── horario_bloqueos ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bloqueos_read"  ON public.horario_bloqueos;
DROP POLICY IF EXISTS "bloqueos_admin" ON public.horario_bloqueos;

CREATE POLICY "bloqueos_read" ON public.horario_bloqueos
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

CREATE POLICY "bloqueos_admin" ON public.horario_bloqueos
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ── horario_config ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "hconfig_read"  ON public.horario_config;
DROP POLICY IF EXISTS "hconfig_write" ON public.horario_config;

CREATE POLICY "hconfig_read" ON public.horario_config
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

CREATE POLICY "hconfig_write" ON public.horario_config
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
