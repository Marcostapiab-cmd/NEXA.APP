-- Migration 016: Portal del alumno — vincular auth.users con atletas

ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS atletas_user_id_idx ON public.atletas(user_id) WHERE user_id IS NOT NULL;

-- Permitir que el propio alumno lea su fila
CREATE POLICY "atletas_portal_self_read" ON public.atletas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Permitir que el alumno lea sus propias reservas
CREATE POLICY "reservas_portal_self_read" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT id FROM public.atletas WHERE user_id = auth.uid()
    )
  );

-- Permitir que el alumno lea sus propios planes
CREATE POLICY "planes_portal_self_read" ON public.planes
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT id FROM public.atletas WHERE user_id = auth.uid()
    )
  );

-- Permitir que el alumno lea sus propios pagos
CREATE POLICY "pagos_portal_self_read" ON public.pagos
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT id FROM public.atletas WHERE user_id = auth.uid()
    )
  );

-- Permitir que el alumno lea sus propias sesiones
CREATE POLICY "sessions_portal_self_read" ON public.sesiones
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT id::text FROM public.atletas WHERE user_id = auth.uid()
    )
  );
