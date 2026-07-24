-- migración 011: corregir RLS de horario_bloqueos y horario_config
-- Problema: las políticas anteriores usaban 'profesor' y 'recepcionista',
-- que no son roles válidos en este sistema (los roles son: admin, coach, atleta).
-- Resultado: los coaches veían bloqueos = [] y podían agendar en días bloqueados.

-- ── horario_bloqueos ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "bloqueos_read"  ON public.horario_bloqueos;
DROP POLICY IF EXISTS "bloqueos_admin" ON public.horario_bloqueos;

-- Admin y coach pueden VER los bloqueos (para respetar días cerrados al agendar)
CREATE POLICY "bloqueos_read" ON public.horario_bloqueos
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'coach'));

-- Solo admin puede crear, editar y eliminar bloqueos
CREATE POLICY "bloqueos_admin" ON public.horario_bloqueos
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ── horario_config ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "hconfig_read"  ON public.horario_config;
DROP POLICY IF EXISTS "hconfig_write" ON public.horario_config;

-- Admin y coach pueden leer la configuración del horario
CREATE POLICY "hconfig_read" ON public.horario_config
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'coach'));

-- Solo admin puede modificar la configuración
CREATE POLICY "hconfig_write" ON public.horario_config
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
