-- migración 010: puente atletas ↔ perfiles + RLS para alumno

-- ─── 1. Columna puente ────────────────────────────────────────────────────────
ALTER TABLE public.atletas
  ADD COLUMN IF NOT EXISTS perfil_id uuid REFERENCES public.perfiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_atletas_perfil_id ON public.atletas(perfil_id);

-- ─── 2. RLS: alumno ve solo su propio registro en atletas ────────────────────
DROP POLICY IF EXISTS "atletas_alumno_own" ON public.atletas;
CREATE POLICY "atletas_alumno_own" ON public.atletas
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid());

-- ─── 3. RLS: alumno ve solo sus propios planes ───────────────────────────────
-- Cast ::text en ambos lados para no depender del tipo exacto de alumno_id
DROP POLICY IF EXISTS "planes_alumno_own" ON public.planes;
CREATE POLICY "planes_alumno_own" ON public.planes
  FOR SELECT TO authenticated
  USING (
    alumno_id::text IN (
      SELECT id::text FROM public.atletas WHERE perfil_id = auth.uid()
    )
  );

-- ─── 4. RLS: alumno ve solo sus propias reservas ─────────────────────────────
-- Cast ::text en todos los lados para evitar errores de tipo
DROP POLICY IF EXISTS "reservas_alumno_own" ON public.reservas;
CREATE POLICY "reservas_alumno_own" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    alumno_id::text IN (
      SELECT id::text FROM public.atletas WHERE perfil_id = auth.uid()
    )
    OR
    plan_id::text IN (
      SELECT p.id::text FROM public.planes p
      JOIN public.atletas a ON a.id::text = p.alumno_id
      WHERE a.perfil_id = auth.uid()
    )
  );
