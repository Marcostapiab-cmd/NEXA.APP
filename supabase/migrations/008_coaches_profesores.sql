-- migración 008: pantalla de profesores

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS color                 text,
  ADD COLUMN IF NOT EXISTS tarifa_incompleta_2a1 numeric DEFAULT 0;

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coaches_read"  ON public.coaches;
DROP POLICY IF EXISTS "coaches_admin" ON public.coaches;

-- Todos los roles autenticados pueden ver los coaches
CREATE POLICY "coaches_read" ON public.coaches
  FOR SELECT TO authenticated
  USING (true);

-- Solo admin puede crear, editar y eliminar
CREATE POLICY "coaches_admin" ON public.coaches
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
